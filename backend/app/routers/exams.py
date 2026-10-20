import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course, Module
from app.models.exam import Exam, ExamScope, ExamStatus
from app.models.exam_attempt import AttemptStatus, ExamAttempt, Question, Response
from app.models.grade import AuditLog, Grade, GradingDetail, QuestionFeedback
from app.models.user import User, UserRole
from app.routers.courses import get_owned_course
from app.schemas.exam import AvailableExamOut, ExamCreate, ExamOut, ExamRubricUpdate, ExamUpdate

router = APIRouter(tags=["exams"])


def _to_exam_out(exam: Exam, db: Session) -> ExamOut:
    assignment_ids = [
        s.assignment_id for s in db.query(ExamScope).filter(ExamScope.exam_id == exam.id).all()
    ]
    return ExamOut(
        id=exam.id,
        course_id=exam.course_id,
        name=exam.name,
        duration_minutes=exam.duration_minutes,
        difficulty=exam.difficulty,
        min_questions=exam.min_questions,
        max_questions=exam.max_questions,
        adaptive_enabled=exam.adaptive_enabled,
        thinking_time_seconds=exam.thinking_time_seconds,
        status=exam.status,
        created_at=exam.created_at,
        assignment_ids=assignment_ids,
        rubric=exam.rubric,
        sample_questions=exam.sample_questions,
    )


def get_owned_exam(exam_id: uuid.UUID, db: Session, current_user: User) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    get_owned_course(exam.course_id, db, current_user)
    return exam


@router.post("/courses/{course_id}/exams", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
def create_exam(
    course_id: uuid.UUID,
    payload: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_course(course_id, db, current_user)

    valid_assignment_ids = {
        a.id
        for a in db.query(Assignment)
        .join(Module, Assignment.module_id == Module.id)
        .filter(Module.course_id == course_id)
        .all()
    }
    invalid = set(payload.assignment_ids) - valid_assignment_ids
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Assignments not in this course: {invalid}",
        )

    exam_kwargs = dict(
        course_id=course_id,
        name=payload.name,
        duration_minutes=payload.duration_minutes,
        difficulty=payload.difficulty,
        min_questions=payload.min_questions,
        max_questions=payload.max_questions,
        adaptive_enabled=payload.adaptive_enabled,
        thinking_time_seconds=payload.thinking_time_seconds,
        sample_questions=payload.sample_questions,
    )
    if payload.rubric:
        exam_kwargs["rubric"] = payload.rubric
    exam = Exam(**exam_kwargs)
    db.add(exam)
    db.commit()
    db.refresh(exam)

    for assignment_id in payload.assignment_ids:
        db.add(ExamScope(exam_id=exam.id, assignment_id=assignment_id))
    db.commit()

    return _to_exam_out(exam, db)


@router.get("/courses/{course_id}/exams", response_model=list[ExamOut])
def list_exams(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_course(course_id, db, current_user)
    exams = db.query(Exam).filter(Exam.course_id == course_id).order_by(Exam.created_at.desc()).all()
    return [_to_exam_out(e, db) for e in exams]


@router.get("/exams/available", response_model=list[AvailableExamOut])
def list_available_exams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    """MVP has no per-student course enrollment table, so every published
    exam is visible platform-wide. A real roster/enrollment model would
    scope this to the student's own courses."""
    exams = (
        db.query(Exam, Course.name)
        .join(Course, Exam.course_id == Course.id)
        .filter(Exam.status == ExamStatus.published)
        .order_by(Exam.created_at.desc())
        .all()
    )
    completed_exam_ids = {
        row[0]
        for row in db.query(ExamAttempt.exam_id)
        .filter(ExamAttempt.student_id == current_user.id, ExamAttempt.status == AttemptStatus.completed)
        .all()
    }
    return [
        AvailableExamOut(
            id=exam.id,
            name=exam.name,
            course_name=course_name,
            duration_minutes=exam.duration_minutes,
            difficulty=exam.difficulty,
            thinking_time_seconds=exam.thinking_time_seconds,
            rubric=exam.rubric,
            already_completed=exam.id in completed_exam_ids,
        )
        for exam, course_name in exams
    ]


@router.get("/exams/{exam_id}/public", response_model=AvailableExamOut)
def get_public_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    """Student-facing single-exam lookup — only exposes what a student needs
    to decide whether to start (name, timing), never scope/questions/status."""
    exam = db.get(Exam, exam_id)
    if exam is None or exam.status != ExamStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    course = db.get(Course, exam.course_id)
    already_completed = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.exam_id == exam.id,
            ExamAttempt.student_id == current_user.id,
            ExamAttempt.status == AttemptStatus.completed,
        )
        .first()
        is not None
    )
    return AvailableExamOut(
        id=exam.id,
        name=exam.name,
        course_name=course.name,
        duration_minutes=exam.duration_minutes,
        difficulty=exam.difficulty,
        thinking_time_seconds=exam.thinking_time_seconds,
        rubric=exam.rubric,
        already_completed=already_completed,
    )


@router.get("/exams/{exam_id}", response_model=ExamOut)
def get_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam = get_owned_exam(exam_id, db, current_user)
    return _to_exam_out(exam, db)


@router.patch("/exams/{exam_id}/rubric", response_model=ExamOut)
def update_exam_rubric(
    exam_id: uuid.UUID,
    payload: ExamRubricUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam = get_owned_exam(exam_id, db, current_user)
    exam.rubric = payload.rubric
    db.commit()
    db.refresh(exam)
    return _to_exam_out(exam, db)


@router.patch("/exams/{exam_id}", response_model=ExamOut)
def update_exam(
    exam_id: uuid.UUID,
    payload: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Full exam edit — settings were previously frozen after creation
    (only the rubric had its own PATCH), which left no way to fix a
    mistake short of abandoning the exam. Existing attempts/grades are
    untouched; this only affects the exam's own config and future
    question generation."""
    exam = get_owned_exam(exam_id, db, current_user)

    if payload.assignment_ids is not None:
        valid_assignment_ids = {
            a.id
            for a in db.query(Assignment)
            .join(Module, Assignment.module_id == Module.id)
            .filter(Module.course_id == exam.course_id)
            .all()
        }
        invalid = set(payload.assignment_ids) - valid_assignment_ids
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Assignments not in this course: {invalid}",
            )
        db.query(ExamScope).filter(ExamScope.exam_id == exam.id).delete()
        for assignment_id in payload.assignment_ids:
            db.add(ExamScope(exam_id=exam.id, assignment_id=assignment_id))

    update_fields = payload.model_dump(exclude_unset=True, exclude={"assignment_ids"})
    min_q = update_fields.get("min_questions", exam.min_questions)
    max_q = update_fields.get("max_questions", exam.max_questions)
    if max_q < min_q:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_questions must be >= min_questions")
    for field, value in update_fields.items():
        setattr(exam, field, value)

    db.commit()
    db.refresh(exam)
    return _to_exam_out(exam, db)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Cascades through this exam's own attempt/grade data — that data has
    no meaning independent of the exam, unlike a course/module/assignment's
    structural content, which blocks deletion instead of cascading (see
    courses.py, assignments.py)."""
    exam = get_owned_exam(exam_id, db, current_user)

    attempt_ids = [a.id for a in db.query(ExamAttempt.id).filter(ExamAttempt.exam_id == exam_id).all()]
    if attempt_ids:
        grade_ids = [g.id for g in db.query(Grade.id).filter(Grade.attempt_id.in_(attempt_ids)).all()]
        if grade_ids:
            db.query(AuditLog).filter(AuditLog.entity_type == "grade", AuditLog.entity_id.in_(grade_ids)).delete(
                synchronize_session=False
            )
            db.query(GradingDetail).filter(GradingDetail.grade_id.in_(grade_ids)).delete(synchronize_session=False)
            db.query(QuestionFeedback).filter(QuestionFeedback.grade_id.in_(grade_ids)).delete(
                synchronize_session=False
            )
            db.query(Grade).filter(Grade.id.in_(grade_ids)).delete(synchronize_session=False)

        question_ids = [q.id for q in db.query(Question.id).filter(Question.attempt_id.in_(attempt_ids)).all()]
        if question_ids:
            db.query(Response).filter(Response.question_id.in_(question_ids)).delete(synchronize_session=False)
            db.query(Question).filter(Question.id.in_(question_ids)).delete(synchronize_session=False)

        db.query(ExamAttempt).filter(ExamAttempt.id.in_(attempt_ids)).delete(synchronize_session=False)

    db.query(ExamScope).filter(ExamScope.exam_id == exam_id).delete()
    db.delete(exam)
    db.commit()


@router.post("/exams/{exam_id}/publish", response_model=ExamOut)
def publish_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam = get_owned_exam(exam_id, db, current_user)
    exam.status = ExamStatus.published
    db.commit()
    db.refresh(exam)
    return _to_exam_out(exam, db)
