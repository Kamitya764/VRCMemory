"""Meilisearch client for fuzzy Japanese text search on photo metadata.

Indexes photo captions, tags, world names, and filenames for fast
full-text search with Japanese language support.
"""

import logging

import meilisearch

logger = logging.getLogger(__name__)

MEILI_URL = "http://127.0.0.1:7700"
INDEX_NAME = "photos"


class TextSearch:
    def __init__(self, url: str = MEILI_URL, api_key: str | None = None):
        logger.info(f"Connecting to Meilisearch at {url}")
        self.client = meilisearch.Client(url, api_key)
        self._index = None
        self._ensure_index()

    def _ensure_index(self) -> None:
        """Create or configure the photos index."""
        try:
            self._index = self.client.get_index(INDEX_NAME)
            logger.info(f"Opened existing index '{INDEX_NAME}'")
        except meilisearch.errors.MeilisearchApiError:
            task = self.client.create_index(INDEX_NAME, {"primaryKey": "id"})
            self.client.wait_for_task(task.task_uid)
            self._index = self.client.get_index(INDEX_NAME)
            logger.info(f"Created new index '{INDEX_NAME}'")

        # Configure searchable & filterable attributes
        self._index.update_searchable_attributes(
            ["caption", "tags", "world_name", "filename"]
        )
        self._index.update_filterable_attributes(
            ["world_name", "tags"]
        )

    @property
    def index(self):
        if self._index is None:
            self._ensure_index()
        return self._index

    def add_document(self, doc: dict) -> None:
        """Add or update a single photo document.

        Expected doc format:
        {
            "id": "photo_id",
            "caption": "optional caption text",
            "tags": ["tag1", "tag2"],
            "world_name": "optional world name",
            "filename": "screenshot_2024-01-01.png"
        }
        """
        self.index.add_documents([doc])

    def add_documents(self, docs: list[dict]) -> int:
        """Add or update multiple photo documents.

        Returns:
            Number of documents submitted for indexing.
        """
        if not docs:
            return 0
        self.index.add_documents(docs)
        return len(docs)

    def search(
        self,
        query: str,
        limit: int = 20,
        world_name: str | None = None,
        tags: list[str] | None = None,
    ) -> list[dict]:
        """Search photos by text with optional filters.

        Returns:
            List of {"photo_id": str, "score": float} results.
        """
        params: dict = {"limit": limit}

        filters = []
        if world_name:
            filters.append(f'world_name = "{world_name}"')
        if tags:
            for tag in tags:
                filters.append(f'tags = "{tag}"')
        if filters:
            params["filter"] = " AND ".join(filters)

        results = self.index.search(query, params)

        return [
            {
                "photo_id": hit["id"],
                "score": 1.0 - (i / max(len(results["hits"]), 1)),
            }
            for i, hit in enumerate(results["hits"])
        ]

    def delete_document(self, photo_id: str) -> None:
        """Remove a photo from the search index."""
        self.index.delete_document(photo_id)

    def count(self) -> int:
        """Return total number of indexed documents."""
        stats = self.index.get_stats()
        return stats.number_of_documents

    def is_available(self) -> bool:
        """Check if Meilisearch is reachable."""
        try:
            self.client.health()
            return True
        except Exception:
            return False
