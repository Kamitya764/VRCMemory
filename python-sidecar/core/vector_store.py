"""Vector store using LanceDB for image embedding storage and similarity search.

Stores CLIP image embeddings (512 dimensions) and supports:
- Nearest-neighbor search by image vector
- Cross-modal search by text vector (via Japanese CLIP)
"""

import logging
from pathlib import Path

import numpy as np
import pyarrow as pa

logger = logging.getLogger(__name__)

VECTOR_DIM = 512  # rinna/japanese-clip-vit-b-16 output dimension
TABLE_NAME = "photo_embeddings"


class VectorStore:
    def __init__(self, db_path: str | None = None):
        import lancedb

        if db_path is None:
            db_path = str(Path.home() / ".vrcmemory" / "vectors")
        Path(db_path).mkdir(parents=True, exist_ok=True)

        logger.info(f"Opening LanceDB at {db_path}")
        self.db = lancedb.connect(db_path)
        self._table = None

    def _get_or_create_table(self):
        """Get existing table or create a new one."""
        if self._table is not None:
            return self._table

        if TABLE_NAME in self.db.table_names():
            self._table = self.db.open_table(TABLE_NAME)
            logger.info(f"Opened existing table '{TABLE_NAME}' with {self._table.count_rows()} rows")
        else:
            schema = pa.schema([
                pa.field("photo_id", pa.string()),
                pa.field("vector", pa.list_(pa.float32(), VECTOR_DIM)),
            ])
            self._table = self.db.create_table(TABLE_NAME, schema=schema)
            logger.info(f"Created new table '{TABLE_NAME}'")

        return self._table

    def add(self, photo_id: str, vector: list[float]) -> None:
        """Add a single photo embedding."""
        table = self._get_or_create_table()
        table.add([{"photo_id": photo_id, "vector": vector}])

    def add_batch(self, items: list[dict]) -> int:
        """Add multiple photo embeddings.

        Args:
            items: List of {"photo_id": str, "vector": list[float]}

        Returns:
            Number of items added.
        """
        if not items:
            return 0
        table = self._get_or_create_table()
        table.add(items)
        return len(items)

    def search(self, query_vector: list[float], limit: int = 20) -> list[dict]:
        """Search for similar photos by vector.

        Args:
            query_vector: Query embedding vector (512 dims)
            limit: Maximum results to return

        Returns:
            List of {"photo_id": str, "score": float} sorted by similarity
        """
        table = self._get_or_create_table()
        if table.count_rows() == 0:
            return []

        results = (
            table.search(query_vector)
            .limit(limit)
            .to_list()
        )

        return [
            {
                "photo_id": r["photo_id"],
                "score": 1.0 - float(r.get("_distance", 0)),  # Convert distance to similarity
            }
            for r in results
        ]

    def delete(self, photo_id: str) -> None:
        """Delete a photo embedding."""
        table = self._get_or_create_table()
        table.delete(f'photo_id = "{photo_id}"')

    def count(self) -> int:
        """Return the number of stored embeddings."""
        table = self._get_or_create_table()
        return table.count_rows()

    def has_photo(self, photo_id: str) -> bool:
        """Check if a photo is already indexed."""
        table = self._get_or_create_table()
        results = table.search().where(f'photo_id = "{photo_id}"').limit(1).to_list()
        return len(results) > 0
