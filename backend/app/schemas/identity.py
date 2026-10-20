from pydantic import BaseModel


class IdVerificationResult(BaseModel):
    matched: bool
    id_verified: bool
    extracted_text: str
