from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (
    assignments,
    attempts,
    auth,
    courses,
    dashboard,
    exams,
    grades,
    identity,
    submissions,
    voice,
)

app = FastAPI(title="ORAL Exam Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(identity.router)
app.include_router(courses.router)
app.include_router(assignments.router)
app.include_router(submissions.router)
app.include_router(exams.router)
app.include_router(attempts.router)
app.include_router(grades.router)
app.include_router(dashboard.router)
app.include_router(voice.router)


@app.get("/health")
def health():
    return {"status": "ok"}
