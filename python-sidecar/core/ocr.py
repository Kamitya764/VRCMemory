"""OCR for reading world names from VRChat screenshots.

VRChat displays the world name in the bottom-left corner of screenshots.
Uses manga-ocr for Japanese text and easyocr as fallback.
"""

import io
import logging

from PIL import Image

logger = logging.getLogger(__name__)


class WorldNameOCR:
    def __init__(self):
        self._manga_ocr = None
        self._easyocr_reader = None

    def _load_manga_ocr(self):
        if self._manga_ocr is not None:
            return
        try:
            from manga_ocr import MangaOcr

            logger.info("Loading manga-ocr model...")
            self._manga_ocr = MangaOcr()
            logger.info("manga-ocr loaded")
        except ImportError:
            logger.warning("manga-ocr not installed, falling back to easyocr")

    def _load_easyocr(self):
        if self._easyocr_reader is not None:
            return
        import easyocr

        logger.info("Loading easyocr...")
        self._easyocr_reader = easyocr.Reader(["ja", "en"])
        logger.info("easyocr loaded")

    def read_world_name(self, image_data: bytes) -> dict:
        """Read the world name from a VRChat screenshot.

        The world name is typically in the bottom-left corner.

        Args:
            image_data: Raw image bytes

        Returns:
            Dict with text, confidence, and parsed world_name
        """
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        try:
            # Crop bottom-left region where world name appears
            width, height = image.size
            # World name is roughly in the bottom 8% and left 50% of the image
            crop_box = (0, int(height * 0.92), int(width * 0.5), height)
            cropped = image.crop(crop_box)

            text = ""
            confidence = 0.0

            # Try manga-ocr first (better for Japanese)
            self._load_manga_ocr()
            if self._manga_ocr is not None:
                try:
                    text = self._manga_ocr(cropped)
                    confidence = 0.8  # manga-ocr doesn't provide confidence
                except Exception as e:
                    logger.warning(f"manga-ocr failed: {e}")

            # Fallback to easyocr
            if not text:
                self._load_easyocr()
                import numpy as np

                img_array = np.array(cropped)
                results = self._easyocr_reader.readtext(img_array)
                if results:
                    text = " ".join([r[1] for r in results])
                    confidence = float(
                        sum(r[2] for r in results) / len(results)
                    )

            cropped.close()

            # Clean up the text
            world_name = self._extract_world_name(text) if text else None

            return {
                "text": text,
                "confidence": confidence,
                "world_name": world_name,
            }
        finally:
            image.close()

    def read_full_image(self, image_path: str) -> str | None:
        """Read all text from an image file.

        Args:
            image_path: Path to image file on disk

        Returns:
            Extracted text or None
        """
        image = Image.open(image_path).convert("RGB")
        try:
            text = ""

            # Try manga-ocr first
            self._load_manga_ocr()
            if self._manga_ocr is not None:
                try:
                    text = self._manga_ocr(image)
                except Exception as e:
                    logger.warning(f"manga-ocr failed on {image_path}: {e}")

            # Fallback to easyocr
            if not text:
                self._load_easyocr()
                import numpy as np

                img_array = np.array(image)
                results = self._easyocr_reader.readtext(img_array)
                if results:
                    text = " ".join([r[1] for r in results])

            return text.strip() if text and text.strip() else None
        finally:
            image.close()

    @staticmethod
    def _extract_world_name(raw_text: str) -> str | None:
        """Extract clean world name from OCR text."""
        if not raw_text:
            return None
        # Remove common prefixes/suffixes from VRChat UI
        cleaned = raw_text.strip()
        # Remove photographer name if present (format: "WorldName - PhotoBy")
        if " - " in cleaned:
            cleaned = cleaned.split(" - ")[0].strip()
        return cleaned if cleaned else None
