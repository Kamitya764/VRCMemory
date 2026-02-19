use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use crate::error::{AppError, AppResult};

const SIDECAR_URL: &str = "http://127.0.0.1:8765";

/// Managed state for the sidecar HTTP client
pub struct SidecarState {
    pub client: Client,
    pub available: Mutex<Option<bool>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(300)) // 5 min for AI operations
                .build()
                .unwrap_or_else(|_| Client::new()),
            available: Mutex::new(None),
        }
    }
}

// API response types

#[derive(Debug, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub gpu_available: bool,
}

#[derive(Debug, Serialize)]
struct CaptionBatchRequest {
    image_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CaptionBatchResponse {
    pub results: Vec<CaptionResult>,
}

#[derive(Debug, Deserialize)]
pub struct CaptionResult {
    pub path: String,
    pub caption: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
struct EmbedTextRequest {
    texts: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct EmbedTextResponse {
    pub embeddings: Vec<Vec<f32>>,
}

#[derive(Debug, Serialize)]
struct EmbedImageBatchRequest {
    image_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct EmbedImageBatchResponse {
    pub results: Vec<EmbedImageResult>,
}

#[derive(Debug, Deserialize)]
pub struct EmbedImageResult {
    pub path: String,
    pub embedding: Option<Vec<f32>>,
    pub error: Option<String>,
}

impl SidecarState {
    /// Check HTTP response status and return an error for non-success codes
    fn check_response(resp: &reqwest::Response, context: &str) -> AppResult<()> {
        if !resp.status().is_success() {
            return Err(AppError::Sidecar(format!(
                "{}: HTTP {}",
                context,
                resp.status()
            )));
        }
        Ok(())
    }

    /// Check if the sidecar is running
    pub async fn check_health(&self) -> AppResult<HealthResponse> {
        let result = async {
            let resp = self
                .client
                .get(format!("{}/api/health", SIDECAR_URL))
                .send()
                .await
                .map_err(|e| AppError::Sidecar(format!("Connection failed: {}", e)))?;

            Self::check_response(&resp, "Health check")?;

            let health: HealthResponse = resp
                .json()
                .await
                .map_err(|e| AppError::Sidecar(format!("Invalid response: {}", e)))?;

            Ok(health)
        }
        .await;

        // Update availability cache based on result
        if let Ok(mut avail) = self.available.lock() {
            *avail = Some(result.is_ok());
        }

        result
    }

    /// Generate captions for a batch of images
    pub async fn caption_batch(&self, image_paths: &[&Path]) -> AppResult<CaptionBatchResponse> {
        let paths: Vec<String> = image_paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        let resp = self
            .client
            .post(format!("{}/api/caption/batch", SIDECAR_URL))
            .json(&CaptionBatchRequest {
                image_paths: paths,
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Caption request failed: {}", e)))?;

        Self::check_response(&resp, "Caption batch")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid caption response: {}", e)))
    }

    /// Generate text embeddings
    pub async fn embed_texts(&self, texts: &[String]) -> AppResult<EmbedTextResponse> {
        let resp = self
            .client
            .post(format!("{}/api/embed/text", SIDECAR_URL))
            .json(&EmbedTextRequest {
                texts: texts.to_vec(),
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Embed text request failed: {}", e)))?;

        Self::check_response(&resp, "Embed text")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid embed response: {}", e)))
    }

    /// Generate image embeddings for a batch
    pub async fn embed_images(&self, image_paths: &[&Path]) -> AppResult<EmbedImageBatchResponse> {
        let paths: Vec<String> = image_paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        let resp = self
            .client
            .post(format!("{}/api/embed/image/batch", SIDECAR_URL))
            .json(&EmbedImageBatchRequest {
                image_paths: paths,
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Embed image request failed: {}", e)))?;

        Self::check_response(&resp, "Embed image batch")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid embed response: {}", e)))
    }

    /// Index photos in vector store (LanceDB) via CLIP embeddings
    pub async fn index_vectors_batch(
        &self,
        photos: &[VectorIndexItem],
    ) -> AppResult<IndexVectorsResponse> {
        let resp = self
            .client
            .post(format!("{}/api/search/index/batch", SIDECAR_URL))
            .json(&IndexVectorsBatchRequest {
                photos: photos.to_vec(),
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Vector index request failed: {}", e)))?;

        Self::check_response(&resp, "Vector index batch")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid vector index response: {}", e)))
    }

    /// Index photo metadata in Meilisearch for text search
    pub async fn index_text_batch(
        &self,
        documents: &[TextIndexDocument],
    ) -> AppResult<TextIndexResponse> {
        let resp = self
            .client
            .post(format!("{}/api/search/index/text", SIDECAR_URL))
            .json(&TextIndexBatchRequest {
                documents: documents.to_vec(),
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Text index request failed: {}", e)))?;

        Self::check_response(&resp, "Text index batch")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid text index response: {}", e)))
    }

    /// Hybrid search combining vector similarity and text search
    pub async fn hybrid_search(
        &self,
        query: &str,
        limit: u32,
        vector_weight: f32,
        text_weight: f32,
    ) -> AppResult<SidecarSearchResponse> {
        let resp = self
            .client
            .post(format!("{}/api/search/hybrid", SIDECAR_URL))
            .json(&HybridSearchRequest {
                query: query.to_string(),
                limit,
                vector_weight,
                text_weight,
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Hybrid search failed: {}", e)))?;

        Self::check_response(&resp, "Hybrid search")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid search response: {}", e)))
    }

    /// Get search index status
    pub async fn search_status(&self) -> AppResult<SearchStatusResponse> {
        let resp = self
            .client
            .get(format!("{}/api/search/status", SIDECAR_URL))
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Search status request failed: {}", e)))?;

        Self::check_response(&resp, "Search status")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid status response: {}", e)))
    }

    /// Run OCR on a batch of images
    pub async fn ocr_batch(&self, image_paths: &[String]) -> AppResult<OcrBatchResponse> {
        let resp = self
            .client
            .post(format!("{}/api/ocr/batch", SIDECAR_URL))
            .json(&OcrBatchRequest {
                image_paths: image_paths.to_vec(),
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("OCR batch request failed: {}", e)))?;

        Self::check_response(&resp, "OCR batch")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid OCR response: {}", e)))
    }

    /// Compute perceptual hashes for a batch of images
    pub async fn hash_batch(&self, image_paths: &[String]) -> AppResult<HashBatchResponse> {
        let resp = self
            .client
            .post(format!("{}/api/dedup/hash", SIDECAR_URL))
            .json(&HashBatchRequest {
                image_paths: image_paths.to_vec(),
            })
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Hash batch request failed: {}", e)))?;

        Self::check_response(&resp, "Hash batch")?;

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid hash response: {}", e)))
    }

    /// Check if sidecar is available (cached)
    pub fn is_available(&self) -> bool {
        self.available
            .lock()
            .ok()
            .and_then(|g| *g)
            .unwrap_or(false)
    }
}

// Vector index types

#[derive(Debug, Serialize, Clone)]
pub struct VectorIndexItem {
    pub photo_id: String,
    pub image_path: String,
}

#[derive(Debug, Serialize)]
struct IndexVectorsBatchRequest {
    photos: Vec<VectorIndexItem>,
}

#[derive(Debug, Deserialize)]
pub struct IndexVectorsResponse {
    pub indexed: u32,
    pub skipped: u32,
}

// Text index types

#[derive(Debug, Serialize, Clone)]
pub struct TextIndexDocument {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub world_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

#[derive(Debug, Serialize)]
struct TextIndexBatchRequest {
    documents: Vec<TextIndexDocument>,
}

#[derive(Debug, Deserialize)]
pub struct TextIndexResponse {
    pub indexed: u32,
}

// Hybrid search types

#[derive(Debug, Serialize)]
struct HybridSearchRequest {
    query: String,
    limit: u32,
    vector_weight: f32,
    text_weight: f32,
}

#[derive(Debug, Deserialize)]
pub struct SidecarSearchResult {
    pub photo_id: String,
    pub score: f64,
}

#[derive(Debug, Deserialize)]
pub struct SidecarSearchResponse {
    pub results: Vec<SidecarSearchResult>,
    pub total: u32,
}

#[derive(Debug, Deserialize)]
pub struct SearchStatusResponse {
    pub total_vectors: u32,
    pub total_documents: u32,
    pub meilisearch_available: bool,
}

// OCR types

#[derive(Debug, Serialize)]
struct OcrBatchRequest {
    image_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct OcrBatchResponse {
    pub results: Vec<OcrResult>,
}

#[derive(Debug, Deserialize)]
pub struct OcrResult {
    pub path: String,
    pub text: Option<String>,
    pub error: Option<String>,
}

// Dedup hash types

#[derive(Debug, Serialize)]
struct HashBatchRequest {
    image_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct HashBatchResponse {
    pub results: Vec<HashResult>,
}

#[derive(Debug, Deserialize)]
pub struct HashResult {
    pub path: String,
    pub hash: Option<String>,
    pub error: Option<String>,
}
