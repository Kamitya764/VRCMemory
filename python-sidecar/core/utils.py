"""Utility functions for path validation and input sanitization."""

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# Allowed image extensions
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff"}


def validate_image_path(path_str: str) -> Path:
    """Validate that a file path points to a real image file.

    Prevents path traversal attacks by resolving the path and checking:
    1. No '..' components in the original input
    2. File has an allowed image extension
    3. File actually exists on disk

    Args:
        path_str: The file path string to validate.

    Returns:
        Resolved Path object.

    Raises:
        ValueError: If the path contains traversal sequences or has an invalid extension.
        FileNotFoundError: If the file does not exist.
    """
    if ".." in path_str:
        raise ValueError(f"Path traversal detected: {path_str}")

    resolved = Path(path_str).resolve()

    if resolved.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError(
            f"Not an allowed image file (got {resolved.suffix}): {path_str}"
        )

    if not resolved.is_file():
        raise FileNotFoundError(f"File not found: {path_str}")

    return resolved


def escape_filter_value(value: str) -> str:
    """Escape a string value for use in Meilisearch/LanceDB filter expressions.

    Prevents filter injection by escaping double quotes and backslashes.

    Args:
        value: Raw user-provided string.

    Returns:
        Escaped string safe for embedding in filter expressions.
    """
    return value.replace("\\", "\\\\").replace('"', '\\"')


def validate_id(value: str) -> str:
    """Validate that a string looks like a safe identifier (UUID or similar).

    Args:
        value: The ID string to validate.

    Returns:
        The original string if valid.

    Raises:
        ValueError: If the string contains characters not expected in an ID.
    """
    # Allow UUIDs, alphanumeric strings, hyphens, and underscores
    if not re.match(r'^[a-zA-Z0-9_-]+$', value):
        raise ValueError(f"Invalid ID format: {value}")
    return value
