import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.user import UserRole


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: UserRole
    student_id_number: str | None = None

    @model_validator(mode="after")
    def student_requires_id_number(self) -> "UserRegister":
        if self.role == UserRole.student and not self.student_id_number:
            raise ValueError("student_id_number is required for student accounts")
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: UserRole
    student_id_number: str | None
    id_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
