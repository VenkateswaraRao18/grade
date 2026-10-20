import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(min_length=1)


class CourseOut(BaseModel):
    id: uuid.UUID
    name: str
    instructor_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class CourseWithStatsOut(CourseOut):
    module_count: int
    exam_count: int
    pending_review_count: int


class CourseUpdate(BaseModel):
    name: str = Field(min_length=1)


class ModuleCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None


class ModuleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None


class ModuleOut(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class CourseMaterialOut(BaseModel):
    id: uuid.UUID
    module_id: uuid.UUID
    original_filename: str
    content_type: str
    indexed: bool
    ingested_at: datetime

    class Config:
        from_attributes = True


class MaterialSearchResult(BaseModel):
    text: str
    module_id: uuid.UUID
    material_id: uuid.UUID
    distance: float
