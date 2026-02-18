"""Deduplication endpoints for computing perceptual hashes."""

import threading

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.dedup import ImageHasher
from core.utils import validate_image_path

router = APIRouter()

MAX_BATCH_SIZE = 100

_hasher: ImageHasher | None = None
_hasher_lock = threading.Lock()


def get_hasher() -> ImageHasher:
    global _hasher
    if _hasher is None:
        with _hasher_lock:
            if _hasher is None:
                _hasher = ImageHasher()
    return _hasher


class HashBatchRequest(BaseModel):
    image_paths: list[str] = Field(..., max_length=MAX_BATCH_SIZE)


class HashResultItem(BaseModel):
    path: str
    hash: str | None
    error: str | None


class HashBatchResponse(BaseModel):
    results: list[HashResultItem]


@router.post("/hash", response_model=HashBatchResponse)
def hash_batch(request: HashBatchRequest):
    """Compute perceptual hashes for a batch of images."""
    hasher = get_hasher()
    results: list[HashResultItem] = []

    for path in request.image_paths:
        try:
            validated = validate_image_path(path)
            h = hasher.compute_hash(str(validated))
            results.append(HashResultItem(path=path, hash=h, error=None))
        except (ValueError, FileNotFoundError) as e:
            results.append(HashResultItem(path=path, hash=None, error=str(e)))
        except Exception as e:
            results.append(HashResultItem(path=path, hash=None, error=str(e)))

    return HashBatchResponse(results=results)
