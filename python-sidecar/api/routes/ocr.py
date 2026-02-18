"""OCR endpoints for reading world names from VRChat screenshots."""

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

from core.ocr import WorldNameOCR

router = APIRouter()

_ocr: WorldNameOCR | None = None


def get_ocr() -> WorldNameOCR:
    global _ocr
    if _ocr is None:
        _ocr = WorldNameOCR()
    return _ocr


class OCRResponse(BaseModel):
    text: str
    confidence: float
    world_name: str | None


@router.post("/world-name", response_model=OCRResponse)
async def read_world_name(file: UploadFile = File(...)):
    """Read the world name from a VRChat screenshot (bottom-left corner)."""
    image_data = await file.read()
    ocr_engine = get_ocr()
    result = ocr_engine.read_world_name(image_data)
    return result
