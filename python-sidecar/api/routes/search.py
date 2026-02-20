"""Search endpoints: vector similarity, text search, and hybrid search."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.instances import get_embedding_engine, get_vector_store, get_text_search
from core.utils import validate_image_path

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_BATCH_SIZE = 100
MAX_SEARCH_LIMIT = 200


# --- Request / Response models ---


class IndexPhotoRequest(BaseModel):
    photo_id: str
    image_path: str


class IndexBatchRequest(BaseModel):
    photos: list[IndexPhotoRequest] = Field(..., max_length=MAX_BATCH_SIZE)


class IndexResponse(BaseModel):
    indexed: int
    skipped: int


class TextIndexRequest(BaseModel):
    """Index photo metadata for text search."""
    id: str
    caption: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=50)
    world_name: str | None = None
    filename: str | None = None


class TextIndexBatchRequest(BaseModel):
    documents: list[TextIndexRequest] = Field(..., max_length=MAX_BATCH_SIZE)


class TextIndexResponse(BaseModel):
    indexed: int


class SearchByTextRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=20, ge=1, le=MAX_SEARCH_LIMIT)
    offset: int = Field(default=0, ge=0)


class SearchByImageRequest(BaseModel):
    image_path: str
    limit: int = Field(default=20, ge=1, le=MAX_SEARCH_LIMIT)
    offset: int = Field(default=0, ge=0)


class HybridSearchRequest(BaseModel):
    """Hybrid search combining vector similarity and text search."""
    query: str = Field(..., min_length=1)
    limit: int = Field(default=20, ge=1, le=MAX_SEARCH_LIMIT)
    offset: int = Field(default=0, ge=0)
    vector_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    text_weight: float = Field(default=0.5, ge=0.0, le=1.0)


class SearchResult(BaseModel):
    photo_id: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int


class StoreStatusResponse(BaseModel):
    total_vectors: int
    total_documents: int
    meilisearch_available: bool


# --- Endpoints ---


@router.post("/index", response_model=IndexResponse)
def index_photo(request: IndexPhotoRequest):
    """Generate CLIP embedding for a photo and store in vector DB."""
    store = get_vector_store()

    if store.has_photo(request.photo_id):
        return IndexResponse(indexed=0, skipped=1)

    try:
        validated = validate_image_path(request.image_path)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    engine = get_embedding_engine()
    with open(validated, "rb") as f:
        vector = engine.embed_image(f.read())

    store.add(request.photo_id, vector)
    return IndexResponse(indexed=1, skipped=0)


@router.post("/index/batch", response_model=IndexResponse)
def index_batch(request: IndexBatchRequest):
    """Generate CLIP embeddings for multiple photos and store them."""
    store = get_vector_store()
    engine = get_embedding_engine()

    items = []
    skipped = 0

    for photo in request.photos:
        if store.has_photo(photo.photo_id):
            skipped += 1
            continue
        try:
            validated = validate_image_path(photo.image_path)
            with open(validated, "rb") as f:
                vector = engine.embed_image(f.read())
            items.append({"photo_id": photo.photo_id, "vector": vector})
        except Exception as e:
            logger.warning(f"Failed to index photo {photo.image_path}: {e}")
            skipped += 1

    indexed = store.add_batch(items)
    return IndexResponse(indexed=indexed, skipped=skipped)


@router.post("/index/text", response_model=TextIndexResponse)
def index_text(request: TextIndexBatchRequest):
    """Index photo metadata in Meilisearch for text search."""
    ts = get_text_search()
    if ts is None:
        return TextIndexResponse(indexed=0)

    docs = []
    for doc in request.documents:
        d = {"id": doc.id}
        if doc.caption:
            d["caption"] = doc.caption
        if doc.tags:
            d["tags"] = doc.tags
        if doc.world_name:
            d["world_name"] = doc.world_name
        if doc.filename:
            d["filename"] = doc.filename
        docs.append(d)

    count = ts.add_documents(docs)
    return TextIndexResponse(indexed=count)


@router.post("/query", response_model=SearchResponse)
def search_by_text(request: SearchByTextRequest):
    """Search photos by text query using CLIP text embedding.

    The text is embedded via Japanese CLIP and compared against
    stored image embeddings for cross-modal retrieval.
    """
    store = get_vector_store()
    engine = get_embedding_engine()

    text_vector = engine.embed_text_clip(request.query)
    results = store.search(text_vector, limit=request.limit + request.offset)
    total = len(results)
    # Apply offset for pagination
    paginated = results[request.offset:]

    return SearchResponse(
        results=[SearchResult(**r) for r in paginated],
        total=total,
    )


@router.post("/text", response_model=SearchResponse)
def search_text_only(request: SearchByTextRequest):
    """Search photos by text query using Meilisearch full-text search."""
    ts = get_text_search()
    if ts is None:
        return SearchResponse(results=[], total=0)

    results = ts.search(request.query, limit=request.limit + request.offset)
    total = len(results)
    paginated = results[request.offset:]
    return SearchResponse(
        results=[SearchResult(**r) for r in paginated],
        total=total,
    )


@router.post("/hybrid", response_model=SearchResponse)
def hybrid_search(request: HybridSearchRequest):
    """Hybrid search: combine CLIP vector search and Meilisearch text search.

    Results are merged using weighted reciprocal rank fusion (RRF).
    """
    vector_results: list[dict] = []
    text_results: list[dict] = []

    # Vector search (CLIP cross-modal)
    try:
        store = get_vector_store()
        engine = get_embedding_engine()
        text_vector = engine.embed_text_clip(request.query)
        vector_results = store.search(text_vector, limit=request.limit * 2)
    except Exception:
        logger.warning("Vector search failed", exc_info=True)

    # Text search (Meilisearch)
    ts = get_text_search()
    if ts is not None:
        try:
            text_results = ts.search(request.query, limit=request.limit * 2)
        except Exception:
            logger.warning("Text search failed", exc_info=True)

    # Merge with reciprocal rank fusion
    merged = _reciprocal_rank_fusion(
        vector_results,
        text_results,
        vector_weight=request.vector_weight,
        text_weight=request.text_weight,
    )

    paginated = merged[request.offset: request.offset + request.limit]
    return SearchResponse(
        results=[SearchResult(**r) for r in paginated],
        total=len(merged),
    )


@router.post("/similar", response_model=SearchResponse)
def search_similar(request: SearchByImageRequest):
    """Find photos similar to a given image."""
    engine = get_embedding_engine()

    try:
        validated = validate_image_path(request.image_path)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    with open(validated, "rb") as f:
        image_vector = engine.embed_image(f.read())

    store = get_vector_store()
    results = store.search(image_vector, limit=request.limit + request.offset)
    paginated = results[request.offset:]

    return SearchResponse(
        results=[SearchResult(**r) for r in paginated],
        total=len(paginated),
    )


@router.get("/status", response_model=StoreStatusResponse)
def store_status():
    """Return vector store and text search status."""
    store = get_vector_store()
    ts = get_text_search()

    meili_available = False
    total_docs = 0
    if ts is not None:
        try:
            meili_available = ts.is_available()
            total_docs = ts.count()
        except Exception:
            logger.warning("Failed to get text search status", exc_info=True)

    return StoreStatusResponse(
        total_vectors=store.count(),
        total_documents=total_docs,
        meilisearch_available=meili_available,
    )


def _reciprocal_rank_fusion(
    vector_results: list[dict],
    text_results: list[dict],
    vector_weight: float = 0.5,
    text_weight: float = 0.5,
    k: int = 60,
) -> list[dict]:
    """Merge two result lists using weighted reciprocal rank fusion.

    RRF score = weight * (1 / (k + rank))
    Higher scores indicate more relevant results.
    """
    scores: dict[str, float] = {}

    for rank, r in enumerate(vector_results):
        pid = r["photo_id"]
        scores[pid] = scores.get(pid, 0.0) + vector_weight * (1.0 / (k + rank + 1))

    for rank, r in enumerate(text_results):
        pid = r["photo_id"]
        scores[pid] = scores.get(pid, 0.0) + text_weight * (1.0 / (k + rank + 1))

    sorted_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    return [{"photo_id": pid, "score": score} for pid, score in sorted_results]
