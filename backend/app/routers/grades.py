import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.exam import Exam, ExamScope
from app.models.exam_attempt import AttemptStatus, ExamAttempt, Question, Response
from app.models.grade import AuditLog, Grade, GradeStatus, GradingDetail, QuestionFeedback
from app.models.user import User, UserRole
from app.routers.courses import get_owned_course
from app.schemas.grade import (
    AttemptContextOut,
    AuditLogEntryOut,
    GradeOut,
    GradeOverride,
    GradeReviewOut,
    GradingDetailOut,
    PublishedGradeOut,
    TranscriptEntryOut,
)
from app.services.grading_agent import build_transcript, grade_transcript

router = APIRouter(tags=["grades"])


def _grade_to_out(grade: Grade, db: Session) -> GradeOut:
    details = db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id).all()
    return GradeOut(
        id=grade.id,
        attempt_id=grade.attempt_id,
        status=grade.status,
        ai_score=grade.ai_score,
        ai_max_score=grade.ai_max_score,
        instructor_score=grade.instructor_score,
        strengths=grade.strengths,
        weaknesses=grade.weaknesses,
        instructor_feedback=grade.instructor_feedback,
        confidence=grade.confidence,
        published_at=grade.published_at,
        created_at=grade.created_at,
        details=[GradingDetailOut.model_validate(d, from_attributes=True) for d in details],
    )


def get_owned_attempt_for_instructor(attempt_id: uuid.UUID, db: Session, current_user: User) -> ExamAttempt:
    attempt = db.get(ExamAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    exam = db.get(Exam, attempt.exam_id)
    get_owned_course(exam.course_id, db, current_user)
    return attempt


def _transcript_qa(attempt_id: uuid.UUID, db: Session) -> list[tuple[Question, Response | None]]:
    questions = db.query(Question).filter(Question.attempt_id == attempt_id).order_by(Question.sequence).all()
    return [(q, db.query(Response).filter(Response.question_id == q.id).first()) for q in questions]


@router.post("/attempts/{attempt_id}/grade", response_model=GradeOut, status_code=status.HTTP_201_CREATED)
def grade_attempt(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)

    qa_pairs = _transcript_qa(attempt_id, db)
    graded_qa_pairs = [(q, r) for q, r in qa_pairs if q.is_graded]
    if not graded_qa_pairs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This attempt has no graded questions yet",
        )
    transcript = build_transcript(
        [(q.sequence, q.text, r.transcript_text if r else None) for q, r in graded_qa_pairs]
    )

    assignment_ids = [s.assignment_id for s in db.query(ExamScope).filter(ExamScope.exam_id == exam.id).all()]
    scoped_assignments = (
        db.query(Assignment).filter(Assignment.id.in_(assignment_ids)).all() if assignment_ids else []
    )
    reference_answers = "\n\n".join(
        f"[{a.title}]: {a.instructor_answer}" for a in scoped_assignments if a.instructor_answer
    )

    result = grade_transcript(exam.rubric, transcript, reference_answers)

    grade = db.query(Grade).filter(Grade.attempt_id == attempt_id).first()
    if grade is None:
        grade = Grade(attempt_id=attempt_id)
        db.add(grade)
    else:
        db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id).delete()
        db.query(QuestionFeedback).filter(QuestionFeedback.grade_id == grade.id).delete()

    grade.status = GradeStatus.ai_graded
    grade.ai_score = result.overall_score
    grade.ai_max_score = result.overall_max
    grade.strengths = result.strengths
    grade.weaknesses = result.weaknesses
    grade.confidence = result.confidence
    db.commit()
    db.refresh(grade)

    for c in result.criteria:
        db.add(
            GradingDetail(
                grade_id=grade.id,
                criterion=c.name,
                score=c.score,
                max_score=c.max_score,
                evidence_text=c.evidence,
                reasoning=c.reasoning,
            )
        )

    sequence_to_question_id = {q.sequence: q.id for q, _ in qa_pairs}
    for qf in result.questions:
        question_id = sequence_to_question_id.get(qf.sequence)
        if question_id is None:
            continue
        db.add(
            QuestionFeedback(
                grade_id=grade.id,
                question_id=question_id,
                score=qf.score,
                max_score=qf.max_score,
                feedback=qf.feedback,
                criterion=qf.criterion,
            )
        )
    db.commit()

    return _grade_to_out(grade, db)


@router.get("/attempts/{attempt_id}/context", response_model=AttemptContextOut)
def get_attempt_context(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Student/exam identity for an attempt, independent of grading status —
    lets the grade-review page show who/what it's grading even before any
    grade exists (GET /attempts/{id}/grade 404s until then)."""
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)
    course = db.get(Course, exam.course_id)
    student = db.get(User, attempt.student_id)
    return AttemptContextOut(
        student_email=student.email,
        exam_name=exam.name,
        course_name=course.name,
        status=attempt.status.value,
        has_end_photo=bool(attempt.end_photo_path),
    )


@router.get("/attempts/{attempt_id}/end-photo")
def get_end_photo(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    if not attempt.end_photo_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No end-of-exam photo for this attempt")
    return FileResponse(attempt.end_photo_path)


@router.get("/attempts/{attempt_id}/grade", response_model=GradeReviewOut)
def get_attempt_grade(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    grade = db.query(Grade).filter(Grade.attempt_id == attempt_id).first()
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not graded yet")

    exam = db.get(Exam, attempt.exam_id)
    course = db.get(Course, exam.course_id)
    student = db.get(User, attempt.student_id)

    qa_pairs = _transcript_qa(attempt_id, db)
    feedback_by_question = {
        qf.question_id: qf
        for qf in db.query(QuestionFeedback).filter(QuestionFeedback.grade_id == grade.id)
    }
    transcript = [
        TranscriptEntryOut(
            sequence=q.sequence,
            question=q.text,
            is_followup=q.is_followup,
            is_generalization=q.is_generalization,
            is_graded=q.is_graded,
            difficulty=q.difficulty.value,
            answer=r.transcript_text if r else None,
            ai_score=feedback_by_question[q.id].score if q.id in feedback_by_question else None,
            ai_max_score=feedback_by_question[q.id].max_score if q.id in feedback_by_question else None,
            ai_feedback=feedback_by_question[q.id].feedback if q.id in feedback_by_question else None,
            ai_criterion=feedback_by_question[q.id].criterion if q.id in feedback_by_question else None,
            source_excerpt=q.source_excerpt,
            highlight_terms=q.highlight_terms,
        )
        for q, r in qa_pairs
    ]
    return GradeReviewOut(
        grade=_grade_to_out(grade, db),
        transcript=transcript,
        student_email=student.email,
        exam_name=exam.name,
        course_name=course.name,
    )


@router.patch("/grades/{grade_id}", response_model=GradeOut)
def override_grade(
    grade_id: uuid.UUID,
    payload: GradeOverride,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    exam = db.get(Exam, attempt.exam_id)
    get_owned_course(exam.course_id, db, current_user)

    old_value = {
        "instructor_score": grade.instructor_score,
        "instructor_feedback": grade.instructor_feedback,
        "criterion_scores": {
            d.criterion: d.score for d in db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id)
        },
    }

    if payload.instructor_score is not None:
        grade.instructor_score = payload.instructor_score

    if payload.instructor_feedback is not None:
        grade.instructor_feedback = payload.instructor_feedback

    new_criterion_scores = {}
    if payload.criterion_scores:
        details = {d.criterion: d for d in db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id)}
        for criterion, score in payload.criterion_scores.items():
            if criterion in details:
                details[criterion].score = score
                new_criterion_scores[criterion] = score

    grade.status = GradeStatus.instructor_review
    db.commit()
    db.refresh(grade)

    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="grade_edited",
            entity_type="grade",
            entity_id=grade.id,
            old_value=old_value,
            new_value={
                "instructor_score": payload.instructor_score,
                "instructor_feedback": payload.instructor_feedback,
                "criterion_scores": new_criterion_scores,
            },
            reason=payload.reason,
        )
    )
    db.commit()

    return _grade_to_out(grade, db)


@router.post("/grades/{grade_id}/finalize", response_model=GradeOut)
def finalize_grade(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    exam = db.get(Exam, attempt.exam_id)
    get_owned_course(exam.course_id, db, current_user)

    if grade.status not in (GradeStatus.ai_graded, GradeStatus.instructor_review):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Grade cannot be finalized from its current status")

    grade.status = GradeStatus.finalized
    db.commit()
    db.refresh(grade)
    return _grade_to_out(grade, db)


@router.post("/grades/{grade_id}/publish", response_model=GradeOut)
def publish_grade(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    exam = db.get(Exam, attempt.exam_id)
    get_owned_course(exam.course_id, db, current_user)

    if grade.status != GradeStatus.finalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only finalized grades can be published")

    grade.status = GradeStatus.published
    grade.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(grade)

    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="grade_published",
            entity_type="grade",
            entity_id=grade.id,
            old_value=None,
            new_value=None,
        )
    )
    db.commit()

    return _grade_to_out(grade, db)


@router.get("/grades/{grade_id}/audit-log", response_model=list[AuditLogEntryOut])
def get_grade_audit_log(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    exam = db.get(Exam, attempt.exam_id)
    get_owned_course(exam.course_id, db, current_user)

    entries = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "grade", AuditLog.entity_id == grade_id)
        .order_by(AuditLog.timestamp.desc())
        .all()
    )
    actor_ids = {e.actor_id for e in entries}
    actors = {u.id: u.email for u in db.query(User).filter(User.id.in_(actor_ids))} if actor_ids else {}
    return [
        AuditLogEntryOut(
            id=e.id,
            actor_email=actors.get(e.actor_id, "unknown"),
            action=e.action,
            old_value=e.old_value,
            new_value=e.new_value,
            reason=e.reason,
            timestamp=e.timestamp,
        )
        for e in entries
    ]


@router.get("/instructor/attempts/pending-review")
def list_pending_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Completed attempts, across all of this instructor's courses, that
    aren't published yet — the thing an instructor has no way to notice
    otherwise, since grading is never automatic."""
    rows = (
        db.query(ExamAttempt, Exam, Course, User, Grade)
        .join(Exam, ExamAttempt.exam_id == Exam.id)
        .join(Course, Exam.course_id == Course.id)
        .join(User, ExamAttempt.student_id == User.id)
        .outerjoin(Grade, Grade.attempt_id == ExamAttempt.id)
        .filter(
            Course.instructor_id == current_user.id,
            ExamAttempt.status == AttemptStatus.completed,
            or_(Grade.id.is_(None), Grade.status != GradeStatus.published),
        )
        .order_by(ExamAttempt.ended_at.desc())
        .all()
    )
    return [
        {
            "attempt_id": attempt.id,
            "student_email": student.email,
            "exam_name": exam.name,
            "course_name": course.name,
            "ended_at": attempt.ended_at,
            "ended_reason": attempt.ended_reason,
            "grade_status": grade.status.value if grade else None,
            "ai_score": grade.ai_score if grade else None,
            "ai_max_score": grade.ai_max_score if grade else None,
        }
        for attempt, exam, course, student, grade in rows
        if db.query(Question).filter(Question.attempt_id == attempt.id).first() is not None
    ]


@router.get("/exams/{exam_id}/attempts")
def list_exam_attempts(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    get_owned_course(exam.course_id, db, current_user)

    attempts = db.query(ExamAttempt).filter(ExamAttempt.exam_id == exam_id).all()
    result = []
    for attempt in attempts:
        student = db.get(User, attempt.student_id)
        grade = db.query(Grade).filter(Grade.attempt_id == attempt.id).first()
        result.append(
            {
                "attempt_id": attempt.id,
                "student_email": student.email,
                "status": attempt.status.value,
                "ended_at": attempt.ended_at,
                "ended_reason": attempt.ended_reason,
                "grade_status": grade.status.value if grade else None,
                "ai_score": grade.ai_score if grade else None,
                "ai_max_score": grade.ai_max_score if grade else None,
                "instructor_score": grade.instructor_score if grade else None,
            }
        )
    return result


# --- Student-facing: hard rule (CLAUDE.md §7) — only PUBLISHED grades ever
# reach a student-role caller, enforced here at the query level, not by
# trusting the frontend to hide anything. ---


@router.get("/my-grades")
def list_my_grades(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    rows = (
        db.query(Grade, ExamAttempt, Exam, Course)
        .join(ExamAttempt, Grade.attempt_id == ExamAttempt.id)
        .join(Exam, ExamAttempt.exam_id == Exam.id)
        .join(Course, Exam.course_id == Course.id)
        .filter(ExamAttempt.student_id == current_user.id, Grade.status == GradeStatus.published)
        .all()
    )
    return [
        {
            "attempt_id": attempt.id,
            "exam_name": exam.name,
            "course_name": course.name,
            "score": grade.instructor_score if grade.instructor_score is not None else grade.ai_score,
            "max_score": grade.ai_max_score,
            "published_at": grade.published_at,
        }
        for grade, attempt, exam, course in rows
    ]


@router.get("/attempts/{attempt_id}/my-grade", response_model=PublishedGradeOut)
def get_my_grade(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    attempt = db.get(ExamAttempt, attempt_id)
    if attempt is None or attempt.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    grade = db.query(Grade).filter(Grade.attempt_id == attempt_id).first()
    if grade is None or grade.status != GradeStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not available yet")

    exam = db.get(Exam, attempt.exam_id)
    course = db.get(Course, exam.course_id)
    details = db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id).all()

    return PublishedGradeOut(
        exam_name=exam.name,
        course_name=course.name,
        score=grade.instructor_score if grade.instructor_score is not None else grade.ai_score,
        max_score=grade.ai_max_score,
        strengths=grade.strengths,
        weaknesses=grade.weaknesses,
        instructor_feedback=grade.instructor_feedback,
        published_at=grade.published_at,
        details=details,
    )
