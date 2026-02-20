"""Person detection endpoints using YOLOv8."""

import threading

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from core.detect import PersonDetector

router = APIRouter()

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB

_detector: PersonDetector | None = None
_detector_lock = threading.Lock()


def get_detector() -> PersonDetector:
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = PersonDetector()
    return _detector


class Detection(BaseModel):
    x: float
    y: float
    width: float
    height: float
    confidence: float
    label: str


class DetectionResponse(BaseModel):
    detections: list[Detection]
    count: int


@router.post("/persons", response_model=DetectionResponse)
def detect_persons(file: UploadFile = File(...)):
    """Detect persons/avatars in an uploaded image."""
    if file.size is not None and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    image_data = file.file.read()
    if len(image_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    detector = get_detector()
    detections = detector.detect(image_data)
    return DetectionResponse(
        detections=detections,
        count=len(detections),
    )
