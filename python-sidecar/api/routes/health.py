"""Health check endpoint."""

import torch
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Return server health status and GPU availability."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "models_loaded": [],
    }
