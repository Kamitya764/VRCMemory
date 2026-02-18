"""Embedding endpoints for text and image vectors."""

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

from core.embed import EmbeddingEngine

router = APIRouter()

_engine: EmbeddingEngine | None = None


def get_engine() -> EmbeddingEngine:
    global _engine
    if _engine is None:
        _engine = EmbeddingEngine()
    return _engine


class TextEmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    dimension: int


@router.post("/text", response_model=EmbedResponse)
async def embed_text(request: TextEmbedRequest):
    """Generate text embeddings using multilingual-e5-large."""
    engine = get_engine()
    vectors = engine.embed_texts(request.texts)
    return EmbedResponse(
        vectors=vectors,
        dimension=len(vectors[0]) if vectors else 0,
    )


@router.post("/image", response_model=EmbedResponse)
async def embed_image(file: UploadFile = File(...)):
    """Generate image embedding using Japanese CLIP."""
    image_data = await file.read()
    engine = get_engine()
    vector = engine.embed_image(image_data)
    return EmbedResponse(vectors=[vector], dimension=len(vector))


class BatchImageEmbedRequest(BaseModel):
    image_paths: list[str]


@router.post("/image/batch", response_model=EmbedResponse)
async def batch_embed_images(request: BatchImageEmbedRequest):
    """Generate image embeddings for multiple images."""
    engine = get_engine()
    vectors = []
    for path in request.image_paths:
        with open(path, "rb") as f:
            vector = engine.embed_image(f.read())
        vectors.append(vector)
    return EmbedResponse(
        vectors=vectors,
        dimension=len(vectors[0]) if vectors else 0,
    )
