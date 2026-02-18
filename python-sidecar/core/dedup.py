"""Perceptual image hashing for duplicate detection.

Uses average hash (aHash) from imagehash library for fast
perceptual similarity detection between VRChat screenshots.
"""

import logging

from PIL import Image

logger = logging.getLogger(__name__)


class ImageHasher:
    """Compute perceptual hashes for images."""

    def __init__(self, hash_size: int = 16):
        self.hash_size = hash_size

    def compute_hash(self, image_path: str) -> str | None:
        """Compute perceptual hash for an image file.

        Args:
            image_path: Path to image file

        Returns:
            Hex string of the perceptual hash, or None on error
        """
        try:
            import imagehash

            img = Image.open(image_path)
            h = imagehash.average_hash(img, hash_size=self.hash_size)
            return str(h)
        except Exception as e:
            logger.warning(f"Failed to hash {image_path}: {e}")
            return None
