use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

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
            client: Client::new(),
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
    /// Check if the sidecar is running
    pub async fn check_health(&self) -> AppResult<HealthResponse> {
        let resp = self
            .client
            .get(format!("{}/api/health", SIDECAR_URL))
            .send()
            .await
            .map_err(|e| AppError::Sidecar(format!("Connection failed: {}", e)))?;

        let health: HealthResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid response: {}", e)))?;

        if let Ok(mut avail) = self.available.lock() {
            *avail = Some(true);
        }

        Ok(health)
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

        resp.json()
            .await
            .map_err(|e| AppError::Sidecar(format!("Invalid embed response: {}", e)))
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
