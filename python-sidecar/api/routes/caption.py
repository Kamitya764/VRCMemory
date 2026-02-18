"""Image captioning endpoints using LLaVA/BLIP-2."""

import threading

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from core.caption import CaptionGenerator
from core.utils import validate_image_path

router = APIRouter()

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_BATCH_SIZE = 100

_generator: CaptionGenerator | None = None
_generator_lock = threading.Lock()


def get_generator() -> CaptionGenerator:
    global _generator
    if _generator is None:
        with _generator_lock:
            if _generator is None:
                _generator = CaptionGenerator()
    return _generator


class CaptionResponse(BaseModel):
    caption: str
    model: str


class CaptionResultItem(BaseModel):
    path: str
    caption: str | None = None
    error: str | None = None


class BatchCaptionRequest(BaseModel):
    image_paths: list[str] = Field(..., max_length=MAX_BATCH_SIZE)


class BatchCaptionResponse(BaseModel):
    results: list[CaptionResultItem]


@router.post("/generate", response_model=CaptionResponse)
def generate_caption(file: UploadFile = File(...)):
    """Generate a caption for an uploaded image."""
    image_data = file.file.read()
    if len(image_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    generator = get_generator()
    caption = generator.generate(image_data)
    return CaptionResponse(caption=caption, model=generator.model_name)


@router.post("/batch", response_model=BatchCaptionResponse)
def batch_caption(request: BatchCaptionRequest):
    """Generate captions for multiple images by file path."""
    generator = get_generator()
    results = []
    for path in request.image_paths:
        try:
            validated = validate_image_path(path)
            with open(validated, "rb") as f:
                caption = generator.generate(f.read())
            results.append(CaptionResultItem(path=path, caption=caption, error=None))
        except Exception as e:
            results.append(CaptionResultItem(path=path, caption=None, error=str(e)))
    return BatchCaptionResponse(results=results)
