import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Module
from app.models.submission import AssignmentSubmission
from app.models.user import User, UserRole
from app.routers.courses import get_owned_course
from app.schemas.submission import SubmissionOut, SubmissionWithStudentOut
from app.services.chunking import chunk_text
from app.services.text_extraction import extract_text_from_material, resolve_upload_type
from app.services.vector_store import index_submission_chunks

logger = logging.getLogger(__name__)
router = APIRouter(tags=["submissions"])

MAX_SUBMISSION_BYTES = 25 * 1024 * 1024


def _get_assignment_or_404(assignment_id: uuid.UUID, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


@router.post(
    "/assignments/{assignment_id}/submission",
    response_model=SubmissionOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_submission(
    assignment_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    _get_assignment_or_404(assignment_id, db)

    resolved = resolve_upload_type(file.content_type, file.filename)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF, Word document, Excel spreadsheet, CSV, or plain text file",
        )
    content_type, extension = resolved
    contents = file.file.read()
    if len(contents) > MAX_SUBMISSION_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 25MB)")

    submission = (
        db.query(AssignmentSubmission)
        .filter(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == current_user.id,
        )
        .first()
    )
    is_resubmit = submission is not None
    submission_id = submission.id if submission else uuid.uuid4()

    storage_dir = Path(settings.submission_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    dest_path = storage_dir / f"{submission_id}{extension}"
    dest_path.write_bytes(contents)

    if is_resubmit:
        submission.file_path = str(dest_path)
        submission.original_filename = file.filename or f"{submission_id}{extension}"
        submission.content_type = content_type
        submission.indexed = False
    else:
        submission = AssignmentSubmission(
            id=submission_id,
            assignment_id=assignment_id,
            student_id=current_user.id,
            file_path=str(dest_path),
            original_filename=file.filename or f"{submission_id}{extension}",
            content_type=content_type,
        )
        db.add(submission)
    db.commit()
    db.refresh(submission)

    try:
        text = extract_text_from_material(submission.file_path, submission.content_type)
        chunks = chunk_text(text)
        index_submission_chunks(submission.id, assignment_id, current_user.id, chunks)
        submission.indexed = True
        db.commit()
    except Exception:
        logger.exception("Failed to index submission %s for RAG retrieval", submission.id)

    db.refresh(submission)
    return submission


@router.get("/assignments/{assignment_id}/submission", response_model=SubmissionOut)
def get_my_submission(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    submission = (
        db.query(AssignmentSubmission)
        .filter(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == current_user.id,
        )
        .first()
    )
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No submission yet")
    return submission


@router.get("/assignments/{assignment_id}/submissions", response_model=list[SubmissionWithStudentOut])
def list_assignment_submissions(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = _get_assignment_or_404(assignment_id, db)
    module = db.get(Module, assignment.module_id)
    get_owned_course(module.course_id, db, current_user)

    rows = (
        db.query(AssignmentSubmission, User.email)
        .join(User, AssignmentSubmission.student_id == User.id)
        .filter(AssignmentSubmission.assignment_id == assignment_id)
        .order_by(AssignmentSubmission.submitted_at.desc())
        .all()
    )
    return [
        SubmissionWithStudentOut(
            id=s.id,
            assignment_id=s.assignment_id,
            original_filename=s.original_filename,
            content_type=s.content_type,
            indexed=s.indexed,
            submitted_at=s.submitted_at,
            student_email=email,
        )
        for s, email in rows
    ]
