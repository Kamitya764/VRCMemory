"""Person detection endpoints using YOLOv8."""

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

from core.detect import PersonDetector

router = APIRouter()

_detector: PersonDetector | None = None


def get_detector() -> PersonDetector:
    global _detector
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
async def detect_persons(file: UploadFile = File(...)):
    """Detect persons/avatars in an uploaded image."""
    image_data = await file.read()
    detector = get_detector()
    detections = detector.detect(image_data)
    return DetectionResponse(
        detections=detections,
        count=len(detections),
    )
