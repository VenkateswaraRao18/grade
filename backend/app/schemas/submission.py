import uuid
from datetime import datetime

from pydantic import BaseModel


class SubmissionOut(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    original_filename: str
    content_type: str
    indexed: bool
    submitted_at: datetime

    class Config:
        from_attributes = True


class SubmissionWithStudentOut(SubmissionOut):
    student_email: str
