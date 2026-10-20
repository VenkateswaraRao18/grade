import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course, CourseMaterial, Module
from app.models.exam import Exam
from app.models.exam_attempt import AttemptStatus, ExamAttempt
from app.models.grade import Grade, GradeStatus
from app.models.user import User, UserRole
from app.schemas.course import (
    CourseCreate,
    CourseMaterialOut,
    CourseOut,
    CourseUpdate,
    CourseWithStatsOut,
    MaterialSearchResult,
    ModuleCreate,
    ModuleOut,
    ModuleUpdate,
)
from app.services.chunking import chunk_text
from app.services.text_extraction import extract_text_from_material, resolve_upload_type
from app.services.vector_store import index_material_chunks, search as vector_search

logger = logging.getLogger(__name__)

router = APIRouter(tags=["courses"])

MAX_MATERIAL_BYTES = 25 * 1024 * 1024


def get_owned_course(course_id: uuid.UUID, db: Session, current_user: User) -> Course:
    course = db.get(Course, course_id)
    if course is None or course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def get_owned_module(module_id: uuid.UUID, db: Session, current_user: User) -> Module:
    module = db.get(Module, module_id)
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    get_owned_course(module.course_id, db, current_user)
    return module


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    course = Course(name=payload.name, instructor_id=current_user.id)
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/courses", response_model=list[CourseWithStatsOut])
def list_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    courses = (
        db.query(Course)
        .filter(Course.instructor_id == current_user.id)
        .order_by(Course.created_at.desc())
        .all()
    )
    result = []
    for course in courses:
        module_count = db.query(Module).filter(Module.course_id == course.id).count()
        exam_ids = [e.id for e in db.query(Exam.id).filter(Exam.course_id == course.id).all()]
        exam_count = len(exam_ids)
        pending_review_count = 0
        if exam_ids:
            pending_review_count = (
                db.query(ExamAttempt)
                .outerjoin(Grade, Grade.attempt_id == ExamAttempt.id)
                .filter(
                    ExamAttempt.exam_id.in_(exam_ids),
                    ExamAttempt.status == AttemptStatus.completed,
                    or_(Grade.id.is_(None), Grade.status != GradeStatus.published),
                )
                .count()
            )
        result.append(
            CourseWithStatsOut(
                id=course.id,
                name=course.name,
                instructor_id=course.instructor_id,
                created_at=course.created_at,
                module_count=module_count,
                exam_count=exam_count,
                pending_review_count=pending_review_count,
            )
        )
    return result


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    return get_owned_course(course_id, db, current_user)


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(
    course_id: uuid.UUID,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    course = get_owned_course(course_id, db, current_user)
    course.name = payload.name
    db.commit()
    db.refresh(course)
    return course


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Blocked (not cascaded) if the course still has modules or exams —
    delete/empty those first. Keeps deletion bottom-up and explicit rather
    than silently destroying a whole course tree in one call."""
    course = get_owned_course(course_id, db, current_user)
    module_count = db.query(Module).filter(Module.course_id == course_id).count()
    exam_count = db.query(Exam).filter(Exam.course_id == course_id).count()
    if module_count or exam_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Remove this course's {module_count} module(s) and {exam_count} exam(s) before deleting it.",
        )
    db.delete(course)
    db.commit()


@router.post(
    "/courses/{course_id}/modules", response_model=ModuleOut, status_code=status.HTTP_201_CREATED
)
def create_module(
    course_id: uuid.UUID,
    payload: ModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_course(course_id, db, current_user)
    module = Module(course_id=course_id, title=payload.title, description=payload.description)
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


@router.get("/courses/{course_id}/modules", response_model=list[ModuleOut])
def list_modules(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_course(course_id, db, current_user)
    return (
        db.query(Module)
        .filter(Module.course_id == course_id)
        .order_by(Module.created_at.asc())
        .all()
    )


@router.patch("/modules/{module_id}", response_model=ModuleOut)
def update_module(
    module_id: uuid.UUID,
    payload: ModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    module = get_owned_module(module_id, db, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(module, field, value)
    db.commit()
    db.refresh(module)
    return module


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    module_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Blocked (not cascaded) if the module still has assignments — delete
    those first (which themselves block if an exam still scopes them)."""
    module = get_owned_module(module_id, db, current_user)
    assignment_count = db.query(Assignment).filter(Assignment.module_id == module_id).count()
    if assignment_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Remove this module's {assignment_count} assignment(s) before deleting it.",
        )
    db.query(CourseMaterial).filter(CourseMaterial.module_id == module_id).delete()
    db.delete(module)
    db.commit()


@router.post(
    "/modules/{module_id}/materials",
    response_model=CourseMaterialOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_material(
    module_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_module(module_id, db, current_user)

    resolved = resolve_upload_type(file.content_type, file.filename)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF, Word document, Excel spreadsheet, CSV, or plain text file",
        )
    content_type, extension = resolved

    contents = file.file.read()
    if len(contents) > MAX_MATERIAL_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 25MB)")

    material_id = uuid.uuid4()
    storage_dir = Path(settings.course_material_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    dest_path = storage_dir / f"{material_id}{extension}"
    dest_path.write_bytes(contents)

    material = CourseMaterial(
        id=material_id,
        module_id=module_id,
        file_path=str(dest_path),
        original_filename=file.filename or f"{material_id}{extension}",
        content_type=content_type,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    try:
        text = extract_text_from_material(material.file_path, material.content_type)
        chunks = chunk_text(text)
        index_material_chunks(material.id, module_id, chunks)
        material.indexed = True
        db.commit()
    except Exception:
        logger.exception("Failed to index material %s for RAG retrieval", material.id)

    db.refresh(material)
    return material


@router.get("/courses/{course_id}/search", response_model=list[MaterialSearchResult])
def search_course_materials(
    course_id: uuid.UUID,
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Retrieval scoped to this course's modules only — used to verify the RAG
    pipeline, and the same mechanism the examiner agent will use to ground
    generated questions (CLAUDE.md §5's scope-enforcement requirement)."""
    get_owned_course(course_id, db, current_user)
    module_ids = [m.id for m in db.query(Module).filter(Module.course_id == course_id).all()]
    results = vector_search(module_ids, q)
    return [
        MaterialSearchResult(
            text=r["text"],
            module_id=uuid.UUID(r["metadata"]["module_id"]),
            material_id=uuid.UUID(r["metadata"]["material_id"]),
            distance=r["distance"],
        )
        for r in results
    ]


@router.get("/modules/{module_id}/materials", response_model=list[CourseMaterialOut])
def list_materials(
    module_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_module(module_id, db, current_user)
    return (
        db.query(CourseMaterial)
        .filter(CourseMaterial.module_id == module_id)
        .order_by(CourseMaterial.ingested_at.asc())
        .all()
    )
