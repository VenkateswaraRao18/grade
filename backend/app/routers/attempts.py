import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import AttemptStatus, ExamAttempt, Question, Response
from app.models.user import User, UserRole
from app.schemas.exam_attempt import (
    AttemptOut,
    AttemptStatusOut,
    FinishAttemptIn,
    NextQuestionOut,
    ResponseCreate,
)
from app.services.examiner_agent import generate_next_question
from app.services.prompts import EXAM_CLOSING_MESSAGE

# Early-stop thresholds for adaptive exams (CLAUDE.md §2 "adaptive on/off"):
# once the floor (min_questions, graded only) is met, a strong-performing
# student doesn't need to be walked to max_questions just to fill time —
# see examiner_agent.GeneratedQuestion.prior_answer_quality.
STRONG_ANSWER_THRESHOLD = 8.0
STRONG_STREAK_REQUIRED = 2

router = APIRouter(tags=["attempts"])


def get_owned_attempt(attempt_id: uuid.UUID, db: Session, current_user: User) -> ExamAttempt:
    attempt = db.get(ExamAttempt, attempt_id)
    if attempt is None or attempt.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    return attempt


def _time_remaining_seconds(attempt: ExamAttempt, exam: Exam) -> int:
    elapsed = (datetime.now(timezone.utc) - attempt.server_start_time).total_seconds()
    remaining = exam.duration_minutes * 60 - elapsed
    return max(0, int(remaining))


def _maybe_expire(attempt: ExamAttempt, exam: Exam, db: Session) -> bool:
    """Server-authoritative expiry check (CLAUDE.md §6): the backend, not the
    client, decides when an attempt's time is up."""
    if attempt.status == AttemptStatus.completed:
        return True
    if _time_remaining_seconds(attempt, exam) <= 0:
        attempt.status = AttemptStatus.completed
        attempt.ended_at = datetime.now(timezone.utc)
        db.commit()
        return True
    return False


@router.post("/exams/{exam_id}/attempts", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def start_attempt(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    exam = db.get(Exam, exam_id)
    if exam is None or exam.status != ExamStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    existing = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == current_user.id,
            ExamAttempt.status == AttemptStatus.in_progress,
        )
        .first()
    )
    if existing is not None:
        return AttemptOut(
            id=existing.id,
            exam_id=existing.exam_id,
            status=existing.status,
            server_start_time=existing.server_start_time,
            duration_minutes=exam.duration_minutes,
            ended_at=existing.ended_at,
        )

    # One attempt per student per exam — enforced here, not just by hiding
    # the "Start Exam" button, so a student can't bypass it by hitting the
    # API directly or reopening an old tab.
    already_completed = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == current_user.id,
            ExamAttempt.status == AttemptStatus.completed,
        )
        .first()
    )
    if already_completed is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You have already taken this exam."
        )

    # Server sets the authoritative start time on receipt of this request,
    # not whatever the client claims (CLAUDE.md §6).
    attempt = ExamAttempt(exam_id=exam_id, student_id=current_user.id)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return AttemptOut(
        id=attempt.id,
        exam_id=attempt.exam_id,
        status=attempt.status,
        server_start_time=attempt.server_start_time,
        duration_minutes=exam.duration_minutes,
        ended_at=attempt.ended_at,
    )


@router.get("/attempts/{attempt_id}/status", response_model=AttemptStatusOut)
def attempt_status(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    attempt = get_owned_attempt(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)
    _maybe_expire(attempt, exam, db)
    questions_asked = (
        db.query(Question).filter(Question.attempt_id == attempt.id, Question.is_graded == True).count()  # noqa: E712
    )
    return AttemptStatusOut(
        status=attempt.status,
        time_remaining_seconds=_time_remaining_seconds(attempt, exam),
        questions_asked=questions_asked,
        max_questions=exam.max_questions,
    )


@router.get("/attempts/{attempt_id}/next-question", response_model=NextQuestionOut)
def next_question(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    attempt = get_owned_attempt(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)

    if _maybe_expire(attempt, exam, db):
        return NextQuestionOut(finished=True, time_remaining_seconds=0, closing_message=EXAM_CLOSING_MESSAGE)

    questions_asked = db.query(Question).filter(Question.attempt_id == attempt.id).count()
    graded_asked = (
        db.query(Question).filter(Question.attempt_id == attempt.id, Question.is_graded == True).count()  # noqa: E712
    )

    unanswered = (
        db.query(Question)
        .filter(Question.attempt_id == attempt.id)
        .order_by(Question.sequence.desc())
        .first()
    )
    if unanswered is not None:
        has_response = db.query(Response).filter(Response.question_id == unanswered.id).first()
        if has_response is None:
            graded_sequence = None
            if unanswered.is_graded:
                graded_sequence = (
                    db.query(Question)
                    .filter(
                        Question.attempt_id == attempt.id,
                        Question.is_graded == True,  # noqa: E712
                        Question.sequence <= unanswered.sequence,
                    )
                    .count()
                )
            return NextQuestionOut(
                finished=False,
                question_id=unanswered.id,
                sequence=unanswered.sequence,
                text=unanswered.text,
                difficulty=unanswered.difficulty,
                is_followup=unanswered.is_followup,
                is_generalization=unanswered.is_generalization,
                is_graded=unanswered.is_graded,
                graded_sequence=graded_sequence,
                source_excerpt=unanswered.source_excerpt,
                highlight_terms=unanswered.highlight_terms,
                thinking_time_seconds=exam.thinking_time_seconds,
                time_remaining_seconds=_time_remaining_seconds(attempt, exam),
            )

    def _end_attempt() -> NextQuestionOut:
        attempt.status = AttemptStatus.completed
        attempt.ended_at = datetime.now(timezone.utc)
        db.commit()
        return NextQuestionOut(finished=True, time_remaining_seconds=0, closing_message=EXAM_CLOSING_MESSAGE)

    if graded_asked >= exam.max_questions:
        return _end_attempt()

    generated = generate_next_question(attempt, exam, db)
    if generated is None:
        if graded_asked >= exam.min_questions:
            return _end_attempt()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No indexed course material available for this exam's scope",
        )

    # Record the live quality signal about the answer that was just given,
    # on that answer's own Response row — independent of whatever happens
    # with `generated` below (even if we end up discarding it to stop early).
    if generated.prior_answer_quality is not None:
        last_graded_question = (
            db.query(Question)
            .filter(Question.attempt_id == attempt.id, Question.is_graded == True)  # noqa: E712
            .order_by(Question.sequence.desc())
            .first()
        )
        if last_graded_question is not None:
            last_response = db.query(Response).filter(Response.question_id == last_graded_question.id).first()
            if last_response is not None:
                last_response.examiner_quality_score = generated.prior_answer_quality
                db.commit()

    # Adaptive early stop: once the instructor's floor is met, a
    # consistently strong-performing student with no fresh content left to
    # probe doesn't need to be walked all the way to max_questions.
    if exam.adaptive_enabled and generated.is_graded and graded_asked >= exam.min_questions and not generated.fresh_content_remaining:
        recent_scores = (
            db.query(Response.examiner_quality_score)
            .join(Question, Response.question_id == Question.id)
            .filter(Question.attempt_id == attempt.id, Question.is_graded == True)  # noqa: E712
            .order_by(Question.sequence.desc())
            .limit(STRONG_STREAK_REQUIRED)
            .all()
        )
        scores = [s for (s,) in recent_scores if s is not None]
        if len(scores) >= STRONG_STREAK_REQUIRED and all(s >= STRONG_ANSWER_THRESHOLD for s in scores):
            return _end_attempt()

    question = Question(
        attempt_id=attempt.id,
        sequence=questions_asked + 1,
        text=generated.text,
        source_chunk_ids=generated.source_material_ids,
        difficulty=generated.difficulty,
        is_followup=generated.is_followup,
        is_generalization=generated.is_generalization,
        is_graded=generated.is_graded,
        source_excerpt=generated.source_excerpt,
        highlight_terms=generated.highlight_terms,
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    return NextQuestionOut(
        finished=False,
        question_id=question.id,
        sequence=question.sequence,
        text=question.text,
        difficulty=question.difficulty,
        is_followup=question.is_followup,
        is_generalization=question.is_generalization,
        is_graded=question.is_graded,
        graded_sequence=graded_asked + 1 if question.is_graded else None,
        source_excerpt=question.source_excerpt,
        highlight_terms=question.highlight_terms,
        thinking_time_seconds=exam.thinking_time_seconds,
        time_remaining_seconds=_time_remaining_seconds(attempt, exam),
    )


@router.post("/attempts/{attempt_id}/responses", status_code=status.HTTP_201_CREATED)
def submit_response(
    attempt_id: uuid.UUID,
    payload: ResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    attempt = get_owned_attempt(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)
    if _maybe_expire(attempt, exam, db):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This attempt has ended")

    question = db.get(Question, payload.question_id)
    if question is None or question.attempt_id != attempt.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    existing = db.query(Response).filter(Response.question_id == question.id).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This question was already answered")

    response = Response(question_id=question.id, transcript_text=payload.transcript_text)
    db.add(response)
    db.commit()
    return {"status": "recorded"}


@router.post("/attempts/{attempt_id}/finish", response_model=AttemptOut)
def finish_attempt(
    attempt_id: uuid.UUID,
    payload: FinishAttemptIn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    attempt = get_owned_attempt(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)
    if attempt.status != AttemptStatus.completed:
        attempt.status = AttemptStatus.completed
        attempt.ended_at = datetime.now(timezone.utc)
        if payload and payload.reason:
            attempt.ended_reason = payload.reason
        db.commit()
        db.refresh(attempt)
    return AttemptOut(
        id=attempt.id,
        exam_id=attempt.exam_id,
        status=attempt.status,
        server_start_time=attempt.server_start_time,
        duration_minutes=exam.duration_minutes,
        ended_at=attempt.ended_at,
        ended_reason=attempt.ended_reason,
    )


END_PHOTO_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
END_PHOTO_MAX_BYTES = 8 * 1024 * 1024


@router.post("/attempts/{attempt_id}/end-photo", status_code=status.HTTP_201_CREATED)
def upload_end_photo(
    attempt_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    """A single bookend identity photo taken right after the exam ends — not
    continuous monitoring during it. Mirrors the start-of-exam ID recheck,
    just at the other end, for the instructor to confirm the same person
    finished the session."""
    attempt = get_owned_attempt(attempt_id, db, current_user)
    if file.content_type not in END_PHOTO_ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a JPEG or PNG image")

    contents = file.file.read()
    if len(contents) > END_PHOTO_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 8MB)")

    storage_dir = Path(settings.end_photo_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    extension = ".jpg" if file.content_type == "image/jpeg" else ".png"
    dest_path = storage_dir / f"{attempt.id}{extension}"
    dest_path.write_bytes(contents)

    attempt.end_photo_path = str(dest_path)
    db.commit()
    return {"status": "recorded"}
