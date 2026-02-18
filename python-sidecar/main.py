"""VRCMemory Python Sidecar - AI/ML Processing Server"""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import caption, detect, embed, health, ocr

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager - load/unload ML models."""
    logger.info("Starting VRCMemory AI sidecar...")
    # Models will be loaded lazily on first request
    yield
    logger.info("Shutting down VRCMemory AI sidecar...")


app = FastAPI(
    title="VRCMemory AI Sidecar",
    version="0.1.0",
    description="AI/ML processing backend for VRCMemory",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(health.router, tags=["health"])
app.include_router(caption.router, prefix="/api/caption", tags=["caption"])
app.include_router(embed.router, prefix="/api/embed", tags=["embed"])
app.include_router(detect.router, prefix="/api/detect", tags=["detect"])
app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8765,
        reload=True,
        log_level="info",
    )
