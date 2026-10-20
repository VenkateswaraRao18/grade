import json
import re
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.course import CourseMaterial, Module
from app.models.exam import Difficulty, Exam, ExamScope
from app.models.exam_attempt import ExamAttempt, Question, Response
from app.services.llm_provider import llm_provider
from app.services.prompts import (
    GENERALIZE_RULE,
    MODULE_SYSTEM_PROMPT,
    SUBMISSION_SYSTEM_PROMPT,
    WARMUP_SYSTEM_PROMPT,
)
from app.services.vector_store import search as vector_search
from app.services.vector_store import search_submissions

# Cap on "zoom out" generalization questions per exam — deliberately small so
# the exam stays assignment-grounded by default (see prompts.GENERALIZE_RULE);
# this is just an occasional bridge to broader understanding, not a second
# mode competing with the defense-style core.
GENERALIZE_MAX_PER_EXAM = 2

# The first two questions of every exam are generic, ungraded warm-ups
# (overall context, not assignment specifics) before the graded,
# assignment-grounded questions begin.
WARMUP_QUESTION_COUNT = 2

WARMUP_ANGLES = [
    "Ask them to briefly explain, at a high level, what they worked on in this assignment.",
    "Ask them to walk you through their overall approach or process for completing it — "
    "what steps did they take.",
]


@dataclass
class GeneratedQuestion:
    text: str
    difficulty: Difficulty
    is_followup: bool
    is_generalization: bool
    is_graded: bool
    source_material_ids: list[str]
    # The literal excerpt text this question was grounded in, shown to the
    # student alongside the question so they can quickly confirm a cited
    # number/fact really is theirs rather than going blank wondering if the
    # AI got it right — not the student's reasoning or answer, just the
    # source passage, so it grounds without giving away the "why".
    source_excerpt: str | None = None
    # Exact substrings (copied verbatim by the LLM from source_excerpt) that
    # this specific question hinges on — e.g. one coefficient out of a whole
    # regression table — so the frontend can highlight just those instead of
    # making the student scan the entire excerpt. Empty/None when the
    # question is about the excerpt generally.
    highlight_terms: list[str] | None = None
    # 0-10 rating of the most recent GRADED answer, reported by the examiner
    # as a side-effect of deciding this next question — None when there was
    # no prior graded answer yet to judge (warm-ups, or the very first
    # graded question). Used only for live early-stopping, never the grade.
    prior_answer_quality: float | None = None
    # Whether fresh (not-yet-covered) assignment content was still available
    # when this question was generated — False means a new_topic question
    # right now would have nothing left to draw from. Used for early-stopping.
    fresh_content_remaining: bool = True


def _generate_warmup_question(exam: Exam, assignments: list[Assignment], sequence: int) -> GeneratedQuestion:
    titles = ", ".join(a.title for a in assignments) or "this assignment"
    angle = WARMUP_ANGLES[min(sequence - 1, len(WARMUP_ANGLES) - 1)]
    sample_block = (
        f"The instructor's own reference questions for this exam (match this general style/tone):\n"
        f"{exam.sample_questions}\n\n"
        if exam.sample_questions
        else ""
    )
    user_prompt = (
        f"The student is about to be examined on: {titles}.\n\n{sample_block}"
        f"{angle} Ask exactly ONE short, friendly, conversational question. Do not ask about any "
        "specific number, calculation, or technical detail — this is a warm-up, not a graded "
        "question."
    )
    raw = llm_provider.generate(user_prompt, system=WARMUP_SYSTEM_PROMPT, max_tokens=200, usage_label="warmup_question")
    text = raw.strip().strip('"')
    if not text:
        text = (
            f"Can you briefly explain what you worked on in {titles}?"
            if sequence == 1
            else "Can you walk me through your overall approach to completing it?"
        )
    return GeneratedQuestion(
        text=text,
        difficulty=Difficulty.easy,
        is_followup=False,
        is_generalization=False,
        is_graded=False,
        source_material_ids=[],
    )


def _reference_answer_block(assignments: list[Assignment]) -> str:
    answered = [a for a in assignments if a.instructor_answer]
    if not answered:
        return ""
    joined = "\n\n".join(f"[{a.title}]: {a.instructor_answer}" for a in answered)
    return (
        "The instructor's expected answer for this assignment (treat as ground truth — judge "
        "the student's meaning against it, not exact wording; never ask or expect anything "
        f"beyond what it covers):\n{joined}\n\n"
    )


def _scope_assignments(exam: Exam, db: Session) -> list[Assignment]:
    assignment_ids = [s.assignment_id for s in db.query(ExamScope).filter(ExamScope.exam_id == exam.id).all()]
    if not assignment_ids:
        return []
    return db.query(Assignment).filter(Assignment.id.in_(assignment_ids)).all()


def _parse_llm_json(raw: str) -> dict | None:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _format_excerpts(chunks: list[dict], start_index: int = 1) -> str:
    return "\n\n".join(f"[{i}] {c['text']}" for i, c in enumerate(chunks, start=start_index))


def _build_followup_query(prior_qa: list[tuple[Question, Response | None]]) -> str | None:
    if not prior_qa:
        return None
    last_question, last_response = prior_qa[-1]
    return f"{last_question.text} {last_response.transcript_text if last_response else ''}"


def generate_next_question(
    attempt: ExamAttempt, exam: Exam, db: Session
) -> GeneratedQuestion | None:
    prior_questions = (
        db.query(Question).filter(Question.attempt_id == attempt.id).order_by(Question.sequence).all()
    )
    prior_qa: list[tuple[Question, Response | None]] = []
    for q in prior_questions:
        response = db.query(Response).filter(Response.question_id == q.id).first()
        prior_qa.append((q, response))

    assignments = _scope_assignments(exam, db)

    if len(prior_questions) < WARMUP_QUESTION_COUNT:
        return _generate_warmup_question(exam, assignments, len(prior_questions) + 1)

    graded_prior_qa = [(q, r) for q, r in prior_qa if q.is_graded]

    covered_ids = {cid for q in prior_questions if not q.is_followup for cid in q.source_chunk_ids}
    assignment_ids = [a.id for a in assignments]
    topic_query = " ".join(f"{a.title} {a.description or ''}" for a in assignments)
    reference_answer_block = _reference_answer_block(assignments)
    # Follow-up/generalize grounding builds on the last GRADED turn only — a
    # warm-up answer isn't assignment content to probe deeper on.
    followup_query = _build_followup_query(graded_prior_qa)

    # A consecutive follow-up cap: without this, the LLM can get stuck
    # probing the same narrow topic turn after turn, producing near-
    # duplicate questions despite the "never repeat" rule (observed in
    # testing — three near-identical follow-ups in a row on one coefficient).
    # After one follow-up, force the next turn to move to a new topic.
    trailing_followups = 0
    for q in reversed(prior_questions):
        if q.is_followup:
            trailing_followups += 1
        else:
            break
    allow_followup = trailing_followups < 1

    generalization_count = sum(1 for q in prior_questions if q.is_generalization)
    allow_generalize = generalization_count < GENERALIZE_MAX_PER_EXAM
    # Leaving this purely to the LLM's discretion ("occasionally, up to N
    # times") produced zero generalize questions across a full 8-question
    # exam in testing — the same "prompt rule alone wasn't enough" lesson as
    # the repeat-question and coverage fixes above. Force it deterministically
    # at fixed intervals instead, same as the forced-new-topic rule below.
    force_generalize = allow_generalize and len(prior_questions) > 0 and len(prior_questions) % 3 == 0

    # Retrieval scoping for "new topic" candidates: when multiple assignments
    # are in scope, a single similarity search across all of them tends to
    # let the most semantically prominent assignment dominate every pick —
    # observed in testing as 2 of 4 scoped assignments never being asked
    # about at all, because the "already covered" filter fell back to
    # re-serving the same covered chunks once its filtered results ran out.
    # Instead: while any scoped assignment/module remains untouched, restrict
    # the search to ONLY the untouched ones, guaranteeing real coverage
    # before any topic is revisited.
    # Kept separate from the retrieval list below (which falls back to all
    # assignment_ids once everything's covered, so retrieval always has
    # something to search): this pre-fallback list is the real "is there
    # genuinely untouched content left" signal used for early-stopping.
    # fresh_chunks below would otherwise almost never be empty, since the
    # fallback keeps re-searching the same already-covered material.
    uncovered_before_fallback = [a for a in assignment_ids if str(a) not in covered_ids]
    uncovered_assignment_ids = uncovered_before_fallback or assignment_ids

    # Primary grounding source: the student's OWN submitted work for the
    # scoped assignments (defense-style questions). Falls back to the shared
    # course material for the assignments' modules only if this student has
    # no indexed submission yet, so an exam is never a hard dead-end.
    # Retrieved whenever there's a prior turn to build on — independent of
    # allow_followup — because "generalize" also draws from this same pool
    # and isn't gated by the follow-up cap.
    sub_followup = search_submissions(assignment_ids, attempt.student_id, followup_query, k=4) if followup_query else []
    sub_fresh = search_submissions(uncovered_assignment_ids, attempt.student_id, topic_query, k=6)

    if sub_followup or sub_fresh:
        mode = "submission"
        followup_chunks, fresh_chunks = sub_followup, sub_fresh
        id_key = "assignment_id"
    else:
        module_ids = list({a.module_id for a in assignments})
        # In module mode, covered_ids holds material_ids (not assignment_ids)
        # from prior questions — look up which modules those materials belong
        # to, so "uncovered" is judged at the same granularity as coverage
        # is recorded.
        covered_material_uuids = {uuid.UUID(cid) for cid in covered_ids}
        covered_module_ids = {
            m.module_id
            for m in db.query(CourseMaterial).filter(CourseMaterial.id.in_(covered_material_uuids)).all()
        } if covered_material_uuids else set()
        uncovered_module_ids = [m for m in module_ids if m not in covered_module_ids] or module_ids
        modules = db.query(Module).filter(Module.id.in_(module_ids)).all()
        module_topic_query = " ".join(f"{m.title} {m.description or ''}" for m in modules) + " " + topic_query

        mod_followup = vector_search(module_ids, followup_query, k=4) if followup_query else []
        mod_fresh = vector_search(uncovered_module_ids, module_topic_query, k=6)

        mode = "module"
        followup_chunks, fresh_chunks = mod_followup, mod_fresh
        id_key = "material_id"

    if not followup_chunks and not fresh_chunks:
        # No indexed material or submission in scope at all — cannot ground a
        # question. The caller is responsible for ending the attempt rather
        # than asking anything unscoped.
        return None

    # Nothing to generalize from yet (e.g. right after the very first
    # question) — can't force it this turn regardless of the interval.
    force_generalize = force_generalize and bool(followup_chunks)

    all_chunks = followup_chunks + fresh_chunks
    ids_by_pool = {
        "followup": list({c["metadata"][id_key] for c in followup_chunks}),
        "new_topic": list({c["metadata"][id_key] for c in fresh_chunks}),
    }

    sections = []
    if followup_chunks:
        label = "YOUR OWN SUBMISSION" if mode == "submission" else "RECENT TOPIC"
        valid_actions = "action=follow_up or action=generalize" if allow_generalize else "action=follow_up"
        sections.append(
            f"{label} excerpts (use these only if you choose {valid_actions}):\n"
            + _format_excerpts(followup_chunks)
        )
    if fresh_chunks:
        label = "OTHER PARTS OF YOUR SUBMISSION" if mode == "submission" else "OTHER AVAILABLE"
        sections.append(
            f"{label} excerpts, not yet asked about (use these if you choose action=new_topic):\n"
            + _format_excerpts(fresh_chunks, start_index=len(followup_chunks) + 1)
        )
    excerpts_block = "\n\n".join(sections)

    transcript_lines = []
    for i, (q, r) in enumerate(prior_qa):
        transcript_lines.append(f"Q{i+1} ({q.difficulty.value}): {q.text}")
        transcript_lines.append(f"A{i+1}: {r.transcript_text if r else '(no answer recorded)'}")
    transcript = "\n".join(transcript_lines) if transcript_lines else "(exam just started, no questions yet)"

    already_asked = "\n".join(f"- {q.text}" for q, _ in prior_qa) or "(none yet)"

    sample_questions_block = (
        f"The instructor gave these example questions as a style guide — match their tone and "
        f"depth, but do not just copy them verbatim:\n{exam.sample_questions}\n\n"
        if exam.sample_questions
        else ""
    )

    generalize_option = (
        ' occasionally (per the generalize option in your instructions) zoom out to the broader '
        "concept behind it,"
        if allow_generalize
        else ""
    )
    if force_generalize:
        decide_instruction = (
            'You MUST choose action="generalize" this turn: pick something the student has already '
            "discussed and ask them to reason about the broader concept behind it, beyond this one "
            "specific case — a different scenario, an alternate condition, or a general rule. Ground "
            "it in the excerpts above, but the question itself should ask them to go past this "
            "specific dataset/case. "
        )
    elif not allow_followup:
        decide_instruction = (
            "You already asked a follow-up on the last topic. You MUST choose action=\"new_topic\" "
            "this turn and move to a different, not-yet-discussed part of their submission — do "
            "not follow up again on the same thing. "
        )
    elif mode == "submission":
        decide_instruction = (
            f"Decide whether to ask a follow-up that probes deeper on the last answer,{generalize_option} "
            "or move to another part of their submission not yet discussed. "
        )
    else:
        decide_instruction = (
            f"Decide whether to ask a follow-up that probes deeper on the last answer,{generalize_option} "
            "or move to a new topic from the excerpts above. "
        )

    has_graded_prior = bool(graded_prior_qa)
    quality_instruction = (
        ' Also set "prior_answer_quality" to a 0-10 rating of how well the student\'s most '
        "recent answer demonstrated understanding."
        if has_graded_prior
        else ' Set "prior_answer_quality" to null — there is no prior graded answer yet.'
    )

    user_prompt = (
        f"Target exam difficulty: {exam.difficulty.value}\n\n"
        f"{reference_answer_block}"
        f"{sample_questions_block}"
        f"{excerpts_block}\n\n"
        f"Conversation so far:\n{transcript}\n\n"
        f"Questions already asked this exam (do not repeat or rephrase any of these):\n{already_asked}\n\n"
        f"{decide_instruction}"
        "Only raise difficulty if the student has clearly demonstrated mastery; if they struggled, "
        "stay at the same or an easier difficulty and ask a clarifying follow-up — never increase "
        "difficulty to probe a weak answer further. Ask exactly ONE concise, single-part oral exam "
        "question grounded in the relevant excerpts above. If action=new_topic, the question's "
        "content must come ONLY from the excerpts marked for new_topic use above — do not continue "
        "discussing a subject from the conversation history just because it's fresh in context; if "
        "those excerpts cover a different assignment or topic than what was just discussed, that is "
        f"the point — move to it.{quality_instruction}"
    )

    system_prompt = SUBMISSION_SYSTEM_PROMPT if mode == "submission" else MODULE_SYSTEM_PROMPT
    if allow_generalize:
        system_prompt = system_prompt + " " + GENERALIZE_RULE.format(max_count=GENERALIZE_MAX_PER_EXAM)
    raw = llm_provider.generate(user_prompt, system=system_prompt, usage_label="examiner_question")
    parsed = _parse_llm_json(raw)

    if parsed and "question" in parsed:
        try:
            difficulty = Difficulty(parsed.get("difficulty", exam.difficulty.value))
        except ValueError:
            difficulty = exam.difficulty
        requested_action = parsed.get("action")
        # allow_followup must be checked explicitly here now — followup_chunks
        # is populated whenever there's a prior turn (generalize needs that
        # same pool too), so it's no longer implicitly empty when a follow-up
        # isn't allowed this turn.
        is_followup = requested_action == "follow_up" and allow_followup and bool(followup_chunks)
        # Generalize questions ground in the same "recently discussed" pool
        # as follow-ups (they explicitly build on something already raised),
        # so they share that pool for sourcing even though they're tracked
        # as their own action for the per-exam cap above.
        is_generalization = (
            not is_followup and requested_action == "generalize" and allow_generalize and bool(followup_chunks)
        )
        pool = "followup" if (is_followup or is_generalization) else "new_topic"
        raw_quality = parsed.get("prior_answer_quality")
        prior_answer_quality = (
            min(max(float(raw_quality), 0.0), 10.0) if has_graded_prior and raw_quality is not None else None
        )
        excerpt_numbers = parsed.get("source_excerpt_numbers")
        source_excerpt = None
        if isinstance(excerpt_numbers, list):
            texts = [
                all_chunks[n - 1]["text"]
                for n in excerpt_numbers
                if isinstance(n, int) and 1 <= n <= len(all_chunks)
            ]
            source_excerpt = "\n\n---\n\n".join(texts) if texts else None
        raw_terms = parsed.get("highlight_terms")
        highlight_terms = None
        if isinstance(raw_terms, list) and source_excerpt:
            # Only keep terms that actually appear verbatim in the excerpt —
            # the LLM is instructed to copy exactly, but a hallucinated term
            # the frontend can't find would just silently highlight nothing,
            # so filter here instead of trusting the model's output blindly.
            highlight_terms = [
                t for t in raw_terms if isinstance(t, str) and t.strip() and t in source_excerpt
            ][:8] or None
        return GeneratedQuestion(
            text=parsed["question"],
            difficulty=difficulty,
            is_followup=is_followup,
            is_generalization=is_generalization,
            is_graded=True,
            source_material_ids=ids_by_pool[pool] or [c["metadata"][id_key] for c in all_chunks],
            prior_answer_quality=prior_answer_quality,
            fresh_content_remaining=bool(uncovered_before_fallback),
            source_excerpt=source_excerpt,
            highlight_terms=highlight_terms,
        )

    # Fallback if the LLM didn't return parseable JSON: ask a plain question
    # grounded in a fresh (not-yet-covered) excerpt rather than failing the exam.
    fallback_pool = fresh_chunks or followup_chunks
    fallback_text = fallback_pool[0]["text"].split(".")[0].strip()
    fallback_question = (
        f"Walk me through this part of your submission: {fallback_text}"
        if mode == "submission"
        else f"Can you explain the following in your own words: {fallback_text}?"
    )
    return GeneratedQuestion(
        text=fallback_question,
        difficulty=exam.difficulty,
        is_followup=False,
        is_generalization=False,
        is_graded=True,
        source_material_ids=list({c["metadata"][id_key] for c in fallback_pool}),
        fresh_content_remaining=bool(uncovered_before_fallback),
        source_excerpt=fallback_pool[0]["text"],
    )
