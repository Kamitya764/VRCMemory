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


class OcrBatchRequest(BaseModel):
    image_paths: list[str]


class OcrResultItem(BaseModel):
    path: str
    text: str | None
    error: str | None


class OcrBatchResponse(BaseModel):
    results: list[OcrResultItem]


@router.post("/world-name", response_model=OCRResponse)
async def read_world_name(file: UploadFile = File(...)):
    """Read the world name from a VRChat screenshot (bottom-left corner)."""
    image_data = await file.read()
    ocr_engine = get_ocr()
    result = ocr_engine.read_world_name(image_data)
    return result


@router.post("/batch", response_model=OcrBatchResponse)
async def ocr_batch(request: OcrBatchRequest):
    """Run full-image OCR on a batch of photos from file paths."""
    ocr_engine = get_ocr()
    results: list[OcrResultItem] = []

    for path in request.image_paths:
        try:
            text = ocr_engine.read_full_image(path)
            results.append(OcrResultItem(path=path, text=text, error=None))
        except Exception as e:
            results.append(OcrResultItem(path=path, text=None, error=str(e)))

    return OcrBatchResponse(results=results)
