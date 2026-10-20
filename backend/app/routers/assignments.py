import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course, Module
from app.models.exam import Exam, ExamScope
from app.models.exam_attempt import ExamAttempt
from app.models.grade import Grade
from app.models.submission import AssignmentSubmission
from app.models.user import User, UserRole
from app.routers.courses import get_owned_course, get_owned_module
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentDetailOut,
    AssignmentOut,
    AssignmentResultRow,
    AssignmentUpdate,
    AssignmentWithModuleOut,
    AvailableAssignmentOut,
    InstructorAnswerUpdate,
    LinkedExamOut,
)
from app.services.text_extraction import extract_text_from_material, resolve_upload_type

logger = logging.getLogger(__name__)
router = APIRouter(tags=["assignments"])

MAX_GROUND_TRUTH_BYTES = 25 * 1024 * 1024


def _get_owned_assignment(assignment_id: uuid.UUID, db: Session, current_user: User) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    get_owned_module(assignment.module_id, db, current_user)
    return assignment


@router.get("/assignments/available", response_model=list[AvailableAssignmentOut])
def list_available_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    """All assignments platform-wide (no per-student enrollment model, same
    simplification as /exams/available) with this student's own submission
    status for each."""
    rows = (
        db.query(Assignment, Module.title, Course.name)
        .join(Module, Assignment.module_id == Module.id)
        .join(Course, Module.course_id == Course.id)
        .order_by(Module.created_at.asc(), Assignment.created_at.asc())
        .all()
    )
    submissions = {
        s.assignment_id: s
        for s in db.query(AssignmentSubmission).filter(AssignmentSubmission.student_id == current_user.id).all()
    }
    return [
        AvailableAssignmentOut(
            id=a.id,
            title=a.title,
            description=a.description,
            due_at=a.due_at,
            points_possible=a.points_possible,
            module_title=module_title,
            course_name=course_name,
            submitted=a.id in submissions,
            submitted_at=submissions[a.id].submitted_at if a.id in submissions else None,
        )
        for a, module_title, course_name in rows
    ]


@router.post(
    "/modules/{module_id}/assignments", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED
)
def create_assignment(
    module_id: uuid.UUID,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_module(module_id, db, current_user)
    assignment = Assignment(
        module_id=module_id,
        title=payload.title,
        description=payload.description,
        due_at=payload.due_at,
        points_possible=payload.points_possible,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/modules/{module_id}/assignments", response_model=list[AssignmentOut])
def list_module_assignments(
    module_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_module(module_id, db, current_user)
    return (
        db.query(Assignment)
        .filter(Assignment.module_id == module_id)
        .order_by(Assignment.created_at.asc())
        .all()
    )


@router.patch("/assignments/{assignment_id}/instructor-answer", response_model=AssignmentOut)
def update_instructor_answer(
    assignment_id: uuid.UUID,
    payload: InstructorAnswerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = _get_owned_assignment(assignment_id, db, current_user)
    assignment.instructor_answer = payload.instructor_answer
    db.commit()
    db.refresh(assignment)
    return assignment


@router.post("/assignments/{assignment_id}/ground-truth-upload", response_model=AssignmentOut)
def upload_ground_truth(
    assignment_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Upload the instructor's own solved version of the assignment — text is
    extracted and used to prefill instructor_answer (the student can still
    edit it afterward). Reuses the same extraction pipeline as student
    submissions and course materials, not a new system."""
    assignment = _get_owned_assignment(assignment_id, db, current_user)

    resolved = resolve_upload_type(file.content_type, file.filename)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF, Word document, Excel spreadsheet, CSV, or plain text file",
        )
    content_type, extension = resolved
    contents = file.file.read()
    if len(contents) > MAX_GROUND_TRUTH_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 25MB)")

    storage_dir = Path(settings.ground_truth_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    dest_path = storage_dir / f"{assignment_id}{extension}"
    dest_path.write_bytes(contents)

    try:
        extracted = extract_text_from_material(str(dest_path), content_type)
    except Exception as exc:
        logger.exception("Failed to extract text from ground-truth upload for assignment %s", assignment_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read that file") from exc

    assignment.instructor_answer = extracted.strip()
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/assignments/{assignment_id}", response_model=AssignmentDetailOut)
def get_assignment(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = _get_owned_assignment(assignment_id, db, current_user)
    module = db.get(Module, assignment.module_id)
    course = db.get(Course, module.course_id)
    return AssignmentDetailOut(
        id=assignment.id,
        module_id=assignment.module_id,
        title=assignment.title,
        description=assignment.description,
        due_at=assignment.due_at,
        points_possible=assignment.points_possible,
        instructor_answer=assignment.instructor_answer,
        created_at=assignment.created_at,
        module_title=module.title,
        course_id=course.id,
        course_name=course.name,
    )


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    assignment_id: uuid.UUID,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = _get_owned_assignment(assignment_id, db, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(assignment, field, value)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Blocked (not cascaded) if any exam still scopes this assignment —
    the instructor deletes or re-scopes those exams first. This is
    structural content, unlike an exam's own attempt/grade data."""
    assignment = _get_owned_assignment(assignment_id, db, current_user)
    linked_exam_count = db.query(ExamScope).filter(ExamScope.assignment_id == assignment_id).count()
    if linked_exam_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Remove this assignment from {linked_exam_count} exam(s) before deleting it.",
        )
    db.query(AssignmentSubmission).filter(AssignmentSubmission.assignment_id == assignment_id).delete()
    db.delete(assignment)
    db.commit()


@router.get("/assignments/{assignment_id}/exams", response_model=list[LinkedExamOut])
def list_linked_exams(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    _get_owned_assignment(assignment_id, db, current_user)
    exam_ids = [s.exam_id for s in db.query(ExamScope).filter(ExamScope.assignment_id == assignment_id).all()]
    if not exam_ids:
        return []
    exams = db.query(Exam).filter(Exam.id.in_(exam_ids)).order_by(Exam.created_at.desc()).all()
    return [LinkedExamOut(id=e.id, name=e.name, status=e.status.value) for e in exams]


@router.get("/assignments/{assignment_id}/results", response_model=list[AssignmentResultRow])
def get_assignment_results(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Every exam attempt across every exam that scopes this assignment —
    the marks dashboard for this assignment specifically, independent of
    which exam(s) it happens to be examined through."""
    _get_owned_assignment(assignment_id, db, current_user)
    exam_ids = [s.exam_id for s in db.query(ExamScope).filter(ExamScope.assignment_id == assignment_id).all()]
    if not exam_ids:
        return []

    rows = (
        db.query(ExamAttempt, Exam, User)
        .join(Exam, ExamAttempt.exam_id == Exam.id)
        .join(User, ExamAttempt.student_id == User.id)
        .filter(ExamAttempt.exam_id.in_(exam_ids))
        .order_by(ExamAttempt.ended_at.desc())
        .all()
    )
    result = []
    for attempt, exam, student in rows:
        grade = db.query(Grade).filter(Grade.attempt_id == attempt.id).first()
        result.append(
            AssignmentResultRow(
                attempt_id=attempt.id,
                student_email=student.email,
                exam_id=exam.id,
                exam_name=exam.name,
                status=attempt.status.value,
                ended_at=attempt.ended_at,
                ended_reason=attempt.ended_reason,
                grade_id=grade.id if grade else None,
                grade_status=grade.status.value if grade else None,
                ai_score=grade.ai_score if grade else None,
                ai_max_score=grade.ai_max_score if grade else None,
                instructor_score=grade.instructor_score if grade else None,
            )
        )
    return result


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentWithModuleOut])
def list_course_assignments(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """All assignments across every module in a course, for exam-scope
    selection — an exam picks assignments, not modules."""
    get_owned_course(course_id, db, current_user)
    rows = (
        db.query(Assignment, Module.title)
        .join(Module, Assignment.module_id == Module.id)
        .filter(Module.course_id == course_id)
        .order_by(Module.created_at.asc(), Assignment.created_at.asc())
        .all()
    )
    return [
        AssignmentWithModuleOut(
            id=a.id,
            module_id=a.module_id,
            title=a.title,
            description=a.description,
            due_at=a.due_at,
            points_possible=a.points_possible,
            instructor_answer=a.instructor_answer,
            created_at=a.created_at,
            module_title=module_title,
        )
        for a, module_title in rows
    ]
