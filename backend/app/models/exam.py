import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Difficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class ExamStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, name="difficulty"), nullable=False)
    min_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    max_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    adaptive_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    thinking_time_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    rubric: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=(
            "Grade the student on: (1) conceptual understanding, (2) clarity and correctness of "
            "explanation, (3) appropriate use of terminology. Score each 0-100."
        ),
    )
    sample_questions: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ExamStatus] = mapped_column(
        Enum(ExamStatus, name="exam_status"), nullable=False, default=ExamStatus.draft
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ExamScope(Base):
    """An exam's scope is the set of assignments it examines the student on —
    questions should be grounded in what the student actually submitted for
    these assignments, not generic course material (see CLAUDE.md pivot notes:
    oral exams replace midterms/finals, examining the student's own work)."""

    __tablename__ = "exam_scope"

    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.id"), primary_key=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignments.id"), primary_key=True
    )
