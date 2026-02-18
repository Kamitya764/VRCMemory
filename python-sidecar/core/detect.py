"""Person/avatar detection using YOLOv8.

Detects persons in VRChat screenshots for avatar registration and tagging.
"""

import io
import logging

from PIL import Image
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class PersonDetector:
    def __init__(self, model_size: str = "n"):
        """Initialize YOLOv8 person detector.

        Args:
            model_size: YOLO model size - 'n' (nano), 's' (small), 'm' (medium)
        """
        model_name = f"yolov8{model_size}.pt"
        logger.info(f"Loading detection model: {model_name}")
        self.model = YOLO(model_name)
        logger.info("Detection model loaded")

    def detect(self, image_data: bytes, confidence: float = 0.3) -> list[dict]:
        """Detect persons in an image.

        Args:
            image_data: Raw image bytes
            confidence: Minimum confidence threshold

        Returns:
            List of detection dictionaries with bbox and confidence
        """
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        try:
            # Run detection - class 0 is 'person' in COCO
            results = self.model(image, conf=confidence, classes=[0], verbose=False)

            detections = []
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    detections.append({
                        "x": float(x1),
                        "y": float(y1),
                        "width": float(x2 - x1),
                        "height": float(y2 - y1),
                        "confidence": float(box.conf[0]),
                        "label": "person",
                    })

            return detections
        finally:
            image.close()
