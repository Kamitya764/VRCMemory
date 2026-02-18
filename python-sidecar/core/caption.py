"""Image captioning using LLaVA-1.6 / BLIP-2.

Generates natural language descriptions of VRChat screenshots.
Supports both GPU (CUDA) and CPU inference with automatic fallback.
"""

import io
import logging

import torch
from PIL import Image
from transformers import AutoProcessor, Blip2ForConditionalGeneration

logger = logging.getLogger(__name__)

# Use BLIP-2 as default (lighter weight, good quality)
DEFAULT_MODEL = "Salesforce/blip2-opt-2.7b"


class CaptionGenerator:
    def __init__(self, model_name: str = DEFAULT_MODEL):
        self.model_name = model_name
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self._processor = None
        self._model = None

    def _load_model(self) -> None:
        """Lazy-load the model on first use."""
        if self._model is not None:
            return

        logger.info(f"Loading caption model: {self.model_name} on {self.device}")
        self._processor = AutoProcessor.from_pretrained(self.model_name)
        self._model = Blip2ForConditionalGeneration.from_pretrained(
            self.model_name,
            torch_dtype=self.dtype,
        ).to(self.device)
        logger.info("Caption model loaded successfully")

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def generate(self, image_data: bytes, prompt: str | None = None) -> str:
        """Generate a caption for an image.

        Args:
            image_data: Raw image bytes (PNG/JPEG)
            prompt: Optional prompt to guide caption generation

        Returns:
            Generated caption string
        """
        self._load_model()

        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        try:
            if prompt:
                inputs = self._processor(image, text=prompt, return_tensors="pt").to(
                    self.device, self.dtype
                )
            else:
                inputs = self._processor(image, return_tensors="pt").to(
                    self.device, self.dtype
                )

            with torch.no_grad():
                generated_ids = self._model.generate(**inputs, max_new_tokens=100)

            caption = self._processor.batch_decode(
                generated_ids, skip_special_tokens=True
            )[0].strip()

            return caption
        finally:
            image.close()

    def close(self) -> None:
        """Release model from GPU memory."""
        del self._model
        del self._processor
        self._model = None
        self._processor = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Caption model unloaded")
