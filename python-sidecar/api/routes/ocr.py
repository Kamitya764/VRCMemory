"""OCR endpoints for reading world names from VRChat screenshots."""

import threading

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from core.ocr import WorldNameOCR
from core.utils import validate_image_path

router = APIRouter()

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_BATCH_SIZE = 100

_ocr: WorldNameOCR | None = None
_ocr_lock = threading.Lock()


def get_ocr() -> WorldNameOCR:
    global _ocr
    if _ocr is None:
        with _ocr_lock:
            if _ocr is None:
                _ocr = WorldNameOCR()
    return _ocr


class OCRResponse(BaseModel):
    text: str
    confidence: float
    world_name: str | None


class OcrBatchRequest(BaseModel):
    image_paths: list[str] = Field(..., max_length=MAX_BATCH_SIZE)


class OcrResultItem(BaseModel):
    path: str
    text: str | None
    error: str | None


class OcrBatchResponse(BaseModel):
    results: list[OcrResultItem]


@router.post("/world-name", response_model=OCRResponse)
def read_world_name(file: UploadFile = File(...)):
    """Read the world name from a VRChat screenshot (bottom-left corner)."""
    image_data = file.file.read()
    if len(image_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    ocr_engine = get_ocr()
    result = ocr_engine.read_world_name(image_data)
    return result


@router.post("/batch", response_model=OcrBatchResponse)
def ocr_batch(request: OcrBatchRequest):
    """Run full-image OCR on a batch of photos from file paths."""
    ocr_engine = get_ocr()
    results: list[OcrResultItem] = []

    for path in request.image_paths:
        try:
            validated = validate_image_path(path)
            text = ocr_engine.read_full_image(str(validated))
            results.append(OcrResultItem(path=path, text=text, error=None))
        except (ValueError, FileNotFoundError) as e:
            results.append(OcrResultItem(path=path, text=None, error=str(e)))
        except Exception as e:
            results.append(OcrResultItem(path=path, text=None, error=str(e)))

    return OcrBatchResponse(results=results)
