"""VRCMemory Python Sidecar - AI/ML Processing Server"""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import caption, dedup, detect, embed, health, ocr, search

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager - load/unload ML models."""
    logger.info("Starting VRCMemory AI sidecar...")
    # Models will be loaded lazily on first request
    yield
    logger.info("Shutting down VRCMemory AI sidecar...")
    from core.instances import cleanup_all
    cleanup_all()
    logger.info("Cleanup complete.")


app = FastAPI(
    title="VRCMemory AI Sidecar",
    version="0.1.0",
    description="AI/ML processing backend for VRCMemory",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Register routes
app.include_router(health.router, tags=["health"])
app.include_router(caption.router, prefix="/api/caption", tags=["caption"])
app.include_router(embed.router, prefix="/api/embed", tags=["embed"])
app.include_router(detect.router, prefix="/api/detect", tags=["detect"])
app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(dedup.router, prefix="/api/dedup", tags=["dedup"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import os
    is_dev = os.environ.get("VRCMEMORY_ENV", "development") == "development"
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8765,
        reload=is_dev,
        log_level="info",
    )
