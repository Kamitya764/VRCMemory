"""Search endpoints: vector similarity, text search, and hybrid search."""

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from core.embed import EmbeddingEngine
from core.text_search import TextSearch
from core.vector_store import VectorStore

logger = logging.getLogger(__name__)

router = APIRouter()

_store: VectorStore | None = None
_embed: EmbeddingEngine | None = None
_text_search: TextSearch | None = None


def get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store


def get_embed() -> EmbeddingEngine:
    global _embed
    if _embed is None:
        _embed = EmbeddingEngine()
    return _embed


def get_text_search() -> TextSearch | None:
    global _text_search
    if _text_search is None:
        try:
            _text_search = TextSearch()
        except Exception:
            logger.warning("Meilisearch is not available, text search disabled")
            return None
    return _text_search


# --- Request / Response models ---


class IndexPhotoRequest(BaseModel):
    photo_id: str
    image_path: str


class IndexBatchRequest(BaseModel):
    photos: list[IndexPhotoRequest]


class IndexResponse(BaseModel):
    indexed: int
    skipped: int


class TextIndexRequest(BaseModel):
    """Index photo metadata for text search."""
    id: str
    caption: str | None = None
    tags: list[str] = []
    world_name: str | None = None
    filename: str | None = None


class TextIndexBatchRequest(BaseModel):
    documents: list[TextIndexRequest]


class TextIndexResponse(BaseModel):
    indexed: int


class SearchByTextRequest(BaseModel):
    query: str
    limit: int = 20


class SearchByImageRequest(BaseModel):
    image_path: str
    limit: int = 20


class HybridSearchRequest(BaseModel):
    """Hybrid search combining vector similarity and text search."""
    query: str
    limit: int = 20
    vector_weight: float = 0.5
    text_weight: float = 0.5


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
async def index_photo(request: IndexPhotoRequest):
    """Generate CLIP embedding for a photo and store in vector DB."""
    store = get_store()

    if store.has_photo(request.photo_id):
        return IndexResponse(indexed=0, skipped=1)

    engine = get_embed()
    with open(request.image_path, "rb") as f:
        vector = engine.embed_image(f.read())

    store.add(request.photo_id, vector)
    return IndexResponse(indexed=1, skipped=0)


@router.post("/index/batch", response_model=IndexResponse)
async def index_batch(request: IndexBatchRequest):
    """Generate CLIP embeddings for multiple photos and store them."""
    store = get_store()
    engine = get_embed()

    items = []
    skipped = 0

    for photo in request.photos:
        if store.has_photo(photo.photo_id):
            skipped += 1
            continue
        try:
            with open(photo.image_path, "rb") as f:
                vector = engine.embed_image(f.read())
            items.append({"photo_id": photo.photo_id, "vector": vector})
        except Exception:
            skipped += 1

    indexed = store.add_batch(items)
    return IndexResponse(indexed=indexed, skipped=skipped)


@router.post("/index/text", response_model=TextIndexResponse)
async def index_text(request: TextIndexBatchRequest):
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
async def search_by_text(request: SearchByTextRequest):
    """Search photos by text query using CLIP text embedding.

    The text is embedded via Japanese CLIP and compared against
    stored image embeddings for cross-modal retrieval.
    """
    store = get_store()
    engine = get_embed()

    text_vector = engine.embed_text_clip(request.query)
    results = store.search(text_vector, limit=request.limit)

    return SearchResponse(
        results=[SearchResult(**r) for r in results],
        total=len(results),
    )


@router.post("/text", response_model=SearchResponse)
async def search_text_only(request: SearchByTextRequest):
    """Search photos by text query using Meilisearch full-text search."""
    ts = get_text_search()
    if ts is None:
        return SearchResponse(results=[], total=0)

    results = ts.search(request.query, limit=request.limit)
    return SearchResponse(
        results=[SearchResult(**r) for r in results],
        total=len(results),
    )


@router.post("/hybrid", response_model=SearchResponse)
async def hybrid_search(request: HybridSearchRequest):
    """Hybrid search: combine CLIP vector search and Meilisearch text search.

    Results are merged using weighted reciprocal rank fusion (RRF).
    """
    vector_results: list[dict] = []
    text_results: list[dict] = []

    # Vector search (CLIP cross-modal)
    try:
        store = get_store()
        engine = get_embed()
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

    merged = merged[: request.limit]
    return SearchResponse(
        results=[SearchResult(**r) for r in merged],
        total=len(merged),
    )


@router.post("/similar", response_model=SearchResponse)
async def search_similar(request: SearchByImageRequest):
    """Find photos similar to a given image."""
    engine = get_embed()

    with open(request.image_path, "rb") as f:
        image_vector = engine.embed_image(f.read())

    store = get_store()
    results = store.search(image_vector, limit=request.limit)

    return SearchResponse(
        results=[SearchResult(**r) for r in results],
        total=len(results),
    )


@router.get("/status", response_model=StoreStatusResponse)
async def store_status():
    """Return vector store and text search status."""
    store = get_store()
    ts = get_text_search()

    meili_available = False
    total_docs = 0
    if ts is not None:
        try:
            meili_available = ts.is_available()
            total_docs = ts.count()
        except Exception:
            pass

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
