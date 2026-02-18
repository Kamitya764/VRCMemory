"""Image captioning endpoints using LLaVA/BLIP-2."""

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

from core.caption import CaptionGenerator

router = APIRouter()

_generator: CaptionGenerator | None = None


def get_generator() -> CaptionGenerator:
    global _generator
    if _generator is None:
        _generator = CaptionGenerator()
    return _generator


class CaptionResponse(BaseModel):
    caption: str
    model: str


class BatchCaptionRequest(BaseModel):
    image_paths: list[str]


class BatchCaptionResponse(BaseModel):
    results: list[dict[str, str]]


@router.post("/generate", response_model=CaptionResponse)
async def generate_caption(file: UploadFile = File(...)):
    """Generate a caption for an uploaded image."""
    image_data = await file.read()
    generator = get_generator()
    caption = generator.generate(image_data)
    return CaptionResponse(caption=caption, model=generator.model_name)


@router.post("/batch", response_model=BatchCaptionResponse)
async def batch_caption(request: BatchCaptionRequest):
    """Generate captions for multiple images by file path."""
    generator = get_generator()
    results = []
    for path in request.image_paths:
        with open(path, "rb") as f:
            caption = generator.generate(f.read())
        results.append({"path": path, "caption": caption})
    return BatchCaptionResponse(results=results)
