"""Health check endpoint."""

import torch
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check():
    """Return server health status and GPU availability."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    from core.instances import get_loaded_models
    models = get_loaded_models()

    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "models_loaded": models,
    }
