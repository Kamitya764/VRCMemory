"""Embedding endpoints for text and image vectors."""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from core.instances import get_embedding_engine
from core.utils import validate_image_path

router = APIRouter()

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_BATCH_TEXTS = 1000
MAX_BATCH_IMAGES = 100


class TextEmbedRequest(BaseModel):
    texts: list[str] = Field(..., max_length=MAX_BATCH_TEXTS)


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    dimension: int


@router.post("/text", response_model=EmbedResponse)
def embed_text(request: TextEmbedRequest):
    """Generate text embeddings using multilingual-e5-large."""
    engine = get_embedding_engine()
    vectors = engine.embed_texts(request.texts)
    return EmbedResponse(
        vectors=vectors,
        dimension=len(vectors[0]) if vectors else 0,
    )


@router.post("/image", response_model=EmbedResponse)
def embed_image(file: UploadFile = File(...)):
    """Generate image embedding using Japanese CLIP."""
    if file.size is not None and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    image_data = file.file.read()
    if len(image_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    engine = get_embedding_engine()
    vector = engine.embed_image(image_data)
    return EmbedResponse(vectors=[vector], dimension=len(vector))


class BatchImageEmbedRequest(BaseModel):
    image_paths: list[str] = Field(..., max_length=MAX_BATCH_IMAGES)


class BatchImageEmbedResultItem(BaseModel):
    path: str
    vector: list[float] | None = None
    error: str | None = None


class BatchImageEmbedResponse(BaseModel):
    results: list[BatchImageEmbedResultItem]
    dimension: int


@router.post("/image/batch", response_model=BatchImageEmbedResponse)
def batch_embed_images(request: BatchImageEmbedRequest):
    """Generate image embeddings for multiple images."""
    engine = get_embedding_engine()
    results = []
    dimension = 0
    for path in request.image_paths:
        try:
            validated = validate_image_path(path)
            with open(validated, "rb") as f:
                vector = engine.embed_image(f.read())
            results.append(BatchImageEmbedResultItem(path=path, vector=vector))
            if dimension == 0 and vector:
                dimension = len(vector)
        except Exception as e:
            results.append(BatchImageEmbedResultItem(path=path, error=str(e)))
    return BatchImageEmbedResponse(results=results, dimension=dimension)
