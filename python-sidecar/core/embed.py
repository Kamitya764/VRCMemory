"""Embedding engine for text and image vectors.

- Text: multilingual-e5-large (1024 dimensions) - Japanese/English
- Image: Japanese CLIP by rinna (512 dimensions)
"""

import io
import logging
import threading

import torch
from PIL import Image

logger = logging.getLogger(__name__)

TEXT_MODEL = "intfloat/multilingual-e5-large"
IMAGE_MODEL = "rinna/japanese-clip-vit-b-16"


class EmbeddingEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._text_model = None
        self._text_tokenizer = None
        self._image_model = None
        self._image_processor = None
        self._text_lock = threading.Lock()
        self._image_lock = threading.Lock()

    def _load_text_model(self):
        if self._text_model is not None:
            return
        with self._text_lock:
            if self._text_model is not None:
                return

            from transformers import AutoModel, AutoTokenizer

            logger.info(f"Loading text embedding model: {TEXT_MODEL}")
            self._text_tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL)
            self._text_model = AutoModel.from_pretrained(TEXT_MODEL).to(self.device)
            self._text_model.eval()
            logger.info("Text embedding model loaded")

    def _load_image_model(self):
        if self._image_model is not None:
            return
        with self._image_lock:
            if self._image_model is not None:
                return

            from transformers import CLIPModel, CLIPProcessor

            logger.info(f"Loading image embedding model: {IMAGE_MODEL}")
            self._image_model = CLIPModel.from_pretrained(IMAGE_MODEL).to(self.device)
            self._image_processor = CLIPProcessor.from_pretrained(IMAGE_MODEL)
            self._image_model.eval()
            logger.info("Image embedding model loaded")

    def embed_texts(self, texts: list[str], prefix: str = "query") -> list[list[float]]:
        """Generate text embeddings using multilingual-e5-large.

        Args:
            texts: List of text strings to embed
            prefix: E5 prefix - "query" for search queries, "passage" for indexing documents

        Returns:
            List of embedding vectors (1024 dimensions each)
        """
        self._load_text_model()

        # E5 models require "query: " or "passage: " prefix
        prefixed = [f"{prefix}: {t}" for t in texts]

        inputs = self._text_tokenizer(
            prefixed,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(self.device)

        with torch.no_grad():
            outputs = self._text_model(**inputs)
            # Use CLS token embedding
            embeddings = outputs.last_hidden_state[:, 0]
            # Normalize
            embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)

        return embeddings.cpu().tolist()

    def embed_image(self, image_data: bytes) -> list[float]:
        """Generate image embedding using Japanese CLIP.

        Args:
            image_data: Raw image bytes

        Returns:
            Embedding vector (512 dimensions)
        """
        self._load_image_model()

        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        try:
            inputs = self._image_processor(images=image, return_tensors="pt").to(
                self.device
            )

            with torch.no_grad():
                image_features = self._image_model.get_image_features(**inputs)
                image_features = torch.nn.functional.normalize(image_features, p=2, dim=1)

            return image_features[0].cpu().tolist()
        finally:
            image.close()

    def embed_text_clip(self, text: str) -> list[float]:
        """Generate text embedding using Japanese CLIP (same space as images).

        This produces a 512-dim vector in the same embedding space as
        embed_image(), enabling cross-modal text-to-image search.

        Args:
            text: Query text string

        Returns:
            Embedding vector (512 dimensions)
        """
        self._load_image_model()

        inputs = self._image_processor(text=[text], return_tensors="pt", padding=True).to(
            self.device
        )

        with torch.no_grad():
            text_features = self._image_model.get_text_features(**inputs)
            text_features = torch.nn.functional.normalize(text_features, p=2, dim=1)

        return text_features[0].cpu().tolist()

    def close(self) -> None:
        """Release models from GPU memory."""
        del self._text_model
        del self._text_tokenizer
        del self._image_model
        del self._image_processor
        self._text_model = None
        self._text_tokenizer = None
        self._image_model = None
        self._image_processor = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Embedding models unloaded")
