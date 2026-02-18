"""Shared singleton instances for ML models and services.

Centralizes lazy initialization with thread-safe double-checked locking
to prevent duplicate model loading (and GPU memory waste).
"""

import logging
import threading

from core.embed import EmbeddingEngine
from core.vector_store import VectorStore
from core.text_search import TextSearch

logger = logging.getLogger(__name__)

_embedding_engine: EmbeddingEngine | None = None
_embedding_lock = threading.Lock()

_vector_store: VectorStore | None = None
_store_lock = threading.Lock()

_text_search: TextSearch | None = None
_text_search_lock = threading.Lock()
_text_search_failed = False


def get_embedding_engine() -> EmbeddingEngine:
    """Get the shared EmbeddingEngine singleton (thread-safe)."""
    global _embedding_engine
    if _embedding_engine is None:
        with _embedding_lock:
            if _embedding_engine is None:
                _embedding_engine = EmbeddingEngine()
    return _embedding_engine


def get_vector_store() -> VectorStore:
    """Get the shared VectorStore singleton (thread-safe)."""
    global _vector_store
    if _vector_store is None:
        with _store_lock:
            if _vector_store is None:
                _vector_store = VectorStore()
    return _vector_store


def get_text_search() -> TextSearch | None:
    """Get the shared TextSearch singleton (thread-safe).

    Returns None if Meilisearch is not available.
    """
    global _text_search, _text_search_failed
    if _text_search_failed:
        return None
    if _text_search is None:
        with _text_search_lock:
            if _text_search is None and not _text_search_failed:
                try:
                    _text_search = TextSearch()
                except Exception:
                    logger.warning("Meilisearch is not available, text search disabled")
                    _text_search_failed = True
                    return None
    return _text_search


def cleanup_all() -> None:
    """Release all model resources and GPU memory."""
    global _embedding_engine, _vector_store, _text_search, _text_search_failed

    if _embedding_engine is not None:
        logger.info("Releasing embedding engine resources")
        del _embedding_engine
        _embedding_engine = None

    if _vector_store is not None:
        logger.info("Releasing vector store resources")
        del _vector_store
        _vector_store = None

    if _text_search is not None:
        logger.info("Releasing text search resources")
        del _text_search
        _text_search = None

    _text_search_failed = False

    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("GPU memory cache cleared")
    except Exception as e:
        logger.warning(f"Failed to clear GPU cache: {e}")


def get_loaded_models() -> list[str]:
    """Return list of currently loaded model names."""
    from api.routes.caption import _generator as caption_gen
    from api.routes.detect import _detector as detector
    from api.routes.ocr import _ocr as ocr

    models = []
    if caption_gen is not None:
        models.append("caption")
    if _embedding_engine is not None:
        models.append("embed")
    if detector is not None:
        models.append("detect")
    if ocr is not None:
        models.append("ocr")
    if _vector_store is not None:
        models.append("vector_store")
    if _text_search is not None:
        models.append("text_search")
    return models
