from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.identity import IdVerificationResult
from app.services.ocr_service import extract_text, id_number_found_in_text

router = APIRouter(prefix="/identity", tags=["identity"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


@router.post("/verify-id-photo", response_model=IdVerificationResult)
def verify_id_photo(
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student)),
):
    if not current_user.student_id_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No student_id_number on file for this account",
        )
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a JPEG or PNG image")

    contents = file.file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 8MB)")

    storage_dir = Path(settings.id_photo_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    extension = ".jpg" if file.content_type == "image/jpeg" else ".png"
    dest_path = storage_dir / f"{current_user.id}{extension}"
    dest_path.write_bytes(contents)

    try:
        with Image.open(dest_path) as image:
            ocr_text = extract_text(image)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read image file") from exc

    matched = id_number_found_in_text(current_user.student_id_number, ocr_text)
    current_user.id_verified = matched
    db.add(current_user)
    db.commit()

    return IdVerificationResult(
        matched=matched,
        id_verified=current_user.id_verified,
        extracted_text=ocr_text.strip(),
    )
