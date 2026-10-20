import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AssignmentCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None


class AssignmentOut(BaseModel):
    id: uuid.UUID
    module_id: uuid.UUID
    title: str
    description: str | None
    due_at: datetime | None
    points_possible: float | None
    instructor_answer: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class InstructorAnswerUpdate(BaseModel):
    instructor_answer: str | None = None


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None


class AssignmentWithModuleOut(AssignmentOut):
    module_title: str


class AssignmentDetailOut(AssignmentOut):
    module_title: str
    course_id: uuid.UUID
    course_name: str


class LinkedExamOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str


class AssignmentResultRow(BaseModel):
    attempt_id: uuid.UUID
    student_email: str
    exam_id: uuid.UUID
    exam_name: str
    status: str
    ended_at: datetime | None
    ended_reason: str | None
    grade_id: uuid.UUID | None
    grade_status: str | None
    ai_score: float | None
    ai_max_score: float | None
    instructor_score: float | None


class AvailableAssignmentOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    due_at: datetime | None
    points_possible: float | None
    module_title: str
    course_name: str
    submitted: bool
    submitted_at: datetime | None
