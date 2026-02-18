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

        logger.info(f"Loading caption model: {model_name} on {self.device}")
        self.processor = AutoProcessor.from_pretrained(model_name)
        self.model = Blip2ForConditionalGeneration.from_pretrained(
            model_name,
            torch_dtype=self.dtype,
        ).to(self.device)
        logger.info("Caption model loaded successfully")

    def generate(self, image_data: bytes, prompt: str | None = None) -> str:
        """Generate a caption for an image.

        Args:
            image_data: Raw image bytes (PNG/JPEG)
            prompt: Optional prompt to guide caption generation

        Returns:
            Generated caption string
        """
        image = Image.open(io.BytesIO(image_data)).convert("RGB")

        if prompt:
            inputs = self.processor(image, text=prompt, return_tensors="pt").to(
                self.device, self.dtype
            )
        else:
            inputs = self.processor(image, return_tensors="pt").to(
                self.device, self.dtype
            )

        with torch.no_grad():
            generated_ids = self.model.generate(**inputs, max_new_tokens=100)

        caption = self.processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0].strip()

        return caption
