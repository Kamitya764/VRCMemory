use std::path::PathBuf;
use std::sync::atomic::Ordering;

use tauri::{Manager, State};

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::indexer::IndexerState;
use crate::models::{Album, AppSettings, Avatar, Encounter, ExportData, Friend, FriendStats, ImportStats, IndexingStatus, Photo, SearchResult, WorldVisit};
use crate::sidecar::SidecarState;

#[tauri::command]
pub fn get_photos(
    offset: i64,
    limit: i64,
    db: State<DbState>,
) -> AppResult<SearchResult> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    let (photos, total) = db.get_photos(offset, limit)?;
    Ok(SearchResult { photos, total })
}

#[tauri::command]
pub fn search_photos(
    query: String,
    db: State<DbState>,
) -> AppResult<SearchResult> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;

    if query.trim().is_empty() {
        let (photos, total) = db.get_photos(0, 50)?;
        return Ok(SearchResult { photos, total });
    }

    // Phase 1: SQLite LIKE search on metadata
    // Phase 2 will add vector search via LanceDB + Meilisearch
    let (photos, total) = db.search_photos_by_text(&query, 50)?;
    Ok(SearchResult { photos, total })
}

#[tauri::command]
pub fn get_photo_detail(
    id: String,
    db: State<DbState>,
) -> AppResult<Option<Photo>> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    db.get_photo_by_id(&id)
}

#[tauri::command]
pub fn get_world_history(db: State<DbState>) -> AppResult<Vec<WorldVisit>> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    db.get_world_history()
}

#[tauri::command]
pub fn get_friends(db: State<DbState>) -> AppResult<Vec<Friend>> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    db.get_friends()
}

#[tauri::command]
pub fn add_friend(
    name: String,
    db: State<DbState>,
) -> AppResult<Friend> {
    let friend = Friend {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        notes: None,
        avatars: vec![],
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    db.insert_friend(&friend)?;
    Ok(friend)
}

#[tauri::command]
pub fn delete_friend(
    id: String,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    db.delete_friend(&id)
}

#[tauri::command]
pub fn get_settings(db: State<DbState>) -> AppResult<AppSettings> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    db.get_settings()
}

#[tauri::command]
pub fn update_settings(
    settings: serde_json::Value,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    if let Some(obj) = settings.as_object() {
        for (key, value) in obj {
            let val_str = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Bool(b) => b.to_string(),
                other => other.to_string(),
            };
            db.set_setting(key, &val_str)?;
        }
    }
    Ok(())
}

/// Scan a photo folder and index all VRChat screenshots
#[tauri::command]
pub fn scan_photos(
    folder: String,
    db: State<DbState>,
    indexer_state: State<IndexerState>,
) -> AppResult<usize> {
    let folder_path = PathBuf::from(&folder);
    let photo_files = crate::indexer::scan_photo_folder(&folder_path)?;

    let total = photo_files.len();
    indexer_state.total.store(total, Ordering::Relaxed);
    indexer_state.processed.store(0, Ordering::Relaxed);
    indexer_state.is_running.store(true, Ordering::Relaxed);

    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    let mut indexed = 0;

    for (i, filepath) in photo_files.iter().enumerate() {
        let filepath_str = filepath.to_string_lossy().to_string();
        if !db.photo_exists(&filepath_str)? {
            crate::indexer::index_photo(&db, filepath)?;
            indexed += 1;
        }
        indexer_state.processed.store(i + 1, Ordering::Relaxed);
    }

    indexer_state.is_running.store(false, Ordering::Relaxed);
    log::info!("Scan complete: {} new photos indexed out of {} total", indexed, total);
    Ok(indexed)
}

/// Parse VRChat log files and record world visits
#[tauri::command]
pub fn parse_logs(
    log_folder: String,
    db: State<DbState>,
) -> AppResult<usize> {
    let log_path = PathBuf::from(&log_folder);
    let sessions = crate::indexer::process_log_files(&log_path)?;

    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    let mut recorded = 0;

    for session in &sessions {
        let visit = WorldVisit {
            id: uuid::Uuid::new_v4().to_string(),
            world_name: session.world_name.clone(),
            world_id: session.world_id.clone(),
            entered_at: session.entered_at.clone(),
            left_at: session.left_at.clone(),
            players: session.players.clone(),
            instance_type: session.instance_type.clone(),
            rating: None,
            notes: None,
        };
        db.insert_world_visit(&visit)?;
        recorded += 1;
    }

    // Match photos to world sessions
    let matched = crate::indexer::match_photos_to_sessions(&db, &sessions)?;
    log::info!("Parsed {} world visits, matched {} photos to worlds", recorded, matched);

    Ok(recorded)
}

/// Start full indexing (scan photos + parse logs)
#[tauri::command]
pub fn start_indexing(
    db: State<DbState>,
    indexer_state: State<IndexerState>,
) -> AppResult<()> {
    let db_guard = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    let settings = db_guard.get_settings()?;
    drop(db_guard);

    if !settings.photo_folder.is_empty() {
        // Re-acquire lock for scan
        let photo_files = crate::indexer::scan_photo_folder(&PathBuf::from(&settings.photo_folder))?;
        let total = photo_files.len();
        indexer_state.total.store(total, Ordering::Relaxed);
        indexer_state.processed.store(0, Ordering::Relaxed);
        indexer_state.is_running.store(true, Ordering::Relaxed);

        let db_guard = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
        for (i, filepath) in photo_files.iter().enumerate() {
            let filepath_str = filepath.to_string_lossy().to_string();
            if !db_guard.photo_exists(&filepath_str)? {
                crate::indexer::index_photo(&db_guard, filepath)?;
            }
            indexer_state.processed.store(i + 1, Ordering::Relaxed);
        }
        drop(db_guard);
    }

    if !settings.log_folder.is_empty() {
        let sessions = crate::indexer::process_log_files(&PathBuf::from(&settings.log_folder))?;
        let db_guard = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
        for session in &sessions {
            let visit = WorldVisit {
                id: uuid::Uuid::new_v4().to_string(),
                world_name: session.world_name.clone(),
                world_id: session.world_id.clone(),
                entered_at: session.entered_at.clone(),
                left_at: session.left_at.clone(),
                players: session.players.clone(),
                instance_type: session.instance_type.clone(),
                rating: None,
                notes: None,
            };
            db_guard.insert_world_visit(&visit)?;
        }
        crate::indexer::match_photos_to_sessions(&db_guard, &sessions)?;
    }

    indexer_state.is_running.store(false, Ordering::Relaxed);
    log::info!("Indexing completed");
    Ok(())
}

#[tauri::command]
pub fn get_indexing_status(indexer_state: State<IndexerState>) -> AppResult<IndexingStatus> {
    Ok(indexer_state.status())
}

/// Open a folder selection dialog (returns the selected path)
#[tauri::command]
pub fn select_folder() -> AppResult<Option<String>> {
    // In Tauri v2 the dialog is handled on the frontend side
    // This is a placeholder - actual dialog uses @tauri-apps/plugin-dialog
    Ok(None)
}

/// Restart the folder watcher with current settings
#[tauri::command]
pub fn start_watcher(app_handle: tauri::AppHandle) -> AppResult<()> {
    crate::start_watcher_from_settings(&app_handle);
    Ok(())
}

/// Check if the Python AI sidecar is running
#[tauri::command]
pub async fn check_sidecar(sidecar: State<'_, SidecarState>) -> AppResult<bool> {
    match sidecar.check_health().await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Generate AI captions for photos that don't have one yet
#[tauri::command]
pub async fn generate_captions(
    batch_size: Option<i64>,
    db: State<'_, DbState>,
    sidecar: State<'_, SidecarState>,
) -> AppResult<usize> {
    let limit = batch_size.unwrap_or(10);

    let photos = {
        let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
        db.get_photos_without_caption(limit)?
    };

    if photos.is_empty() {
        return Ok(0);
    }

    let paths: Vec<std::path::PathBuf> = photos.iter().map(|p| PathBuf::from(&p.filepath)).collect();
    let path_refs: Vec<&std::path::Path> = paths.iter().map(|p| p.as_path()).collect();

    let result = sidecar.caption_batch(&path_refs).await?;

    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    let mut captioned = 0;

    for caption_result in &result.results {
        if let Some(caption) = &caption_result.caption {
            // Find the matching photo by filepath
            if let Some(photo) = photos.iter().find(|p| p.filepath == caption_result.path) {
                db.update_photo_caption(&photo.id, caption)?;
                captioned += 1;
            }
        }
    }

    log::info!("Generated {} captions for {} photos", captioned, photos.len());
    Ok(captioned)
}

/// Get sidecar health info
#[tauri::command]
pub async fn get_sidecar_status(
    sidecar: State<'_, SidecarState>,
) -> AppResult<serde_json::Value> {
    match sidecar.check_health().await {
        Ok(health) => Ok(serde_json::json!({
            "available": true,
            "gpu_available": health.gpu_available,
        })),
        Err(_) => Ok(serde_json::json!({
            "available": false,
            "gpu_available": false,
        })),
    }
}

/// Delete a single photo from the database
#[tauri::command]
pub fn delete_photo(
    id: String,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.delete_photo(&id)
}

/// Delete multiple photos from the database
#[tauri::command]
pub fn delete_photos(
    ids: Vec<String>,
    db: State<DbState>,
) -> AppResult<usize> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.delete_photos(&ids)
}

/// Update world visit rating
#[tauri::command]
pub fn update_world_rating(
    id: String,
    rating: Option<i32>,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.update_world_visit_rating(&id, rating)
}

/// Update world visit notes
#[tauri::command]
pub fn update_world_notes(
    id: String,
    notes: Option<String>,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.update_world_visit_notes(&id, notes.as_deref())
}

/// Update friend notes
#[tauri::command]
pub fn update_friend_notes(
    id: String,
    notes: Option<String>,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.update_friend_notes(&id, notes.as_deref())
}

/// Update friend name
#[tauri::command]
pub fn update_friend_name(
    id: String,
    name: String,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.update_friend_name(&id, &name)
}

// Avatar commands

#[tauri::command]
pub fn add_avatar(
    friend_id: String,
    name: String,
    db: State<DbState>,
) -> AppResult<Avatar> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.insert_avatar(&friend_id, &name)
}

#[tauri::command]
pub fn delete_avatar(id: String, db: State<DbState>) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.delete_avatar(&id)
}

#[tauri::command]
pub fn add_avatar_reference(
    avatar_id: String,
    image_path: String,
    db: State<DbState>,
) -> AppResult<String> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.add_avatar_reference(&avatar_id, &image_path)
}

#[tauri::command]
pub fn delete_avatar_reference(id: String, db: State<DbState>) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.delete_avatar_reference(&id)
}

// Encounter commands

/// Build encounters from world visit player lists
#[tauri::command]
pub fn build_encounters(db: State<DbState>) -> AppResult<usize> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.build_encounters()
}

/// Get encounters for a specific friend
#[tauri::command]
pub fn get_friend_encounters(
    friend_id: String,
    db: State<DbState>,
) -> AppResult<Vec<Encounter>> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.get_friend_encounters(&friend_id)
}

/// Get stats for a specific friend
#[tauri::command]
pub fn get_friend_stats(
    friend_id: String,
    db: State<DbState>,
) -> AppResult<FriendStats> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.get_friend_stats(&friend_id)
}

/// Generate thumbnails for all photos
#[tauri::command]
pub fn generate_thumbnails(
    app_handle: tauri::AppHandle,
    db: State<DbState>,
    indexer_state: State<IndexerState>,
) -> AppResult<usize> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| AppError::Parse(e.to_string()))?;
    let thumbnails_dir = app_data_dir.join("thumbnails");

    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    crate::indexer::generate_thumbnails_batch(&db, &thumbnails_dir, &indexer_state)
}

/// Get photo statistics
#[tauri::command]
pub fn get_photo_stats(db: State<DbState>) -> AppResult<serde_json::Value> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    let stats = db.get_photo_stats()?;
    Ok(serde_json::to_value(stats).unwrap_or_default())
}

// Album commands

#[tauri::command]
pub fn get_albums(db: State<DbState>) -> AppResult<Vec<Album>> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.get_albums()
}

#[tauri::command]
pub fn create_album(
    name: String,
    description: Option<String>,
    db: State<DbState>,
) -> AppResult<Album> {
    let album = Album {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        description,
        photo_count: 0,
        cover_photo: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.create_album(&album)?;
    Ok(album)
}

#[tauri::command]
pub fn delete_album(id: String, db: State<DbState>) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.delete_album(&id)
}

#[tauri::command]
pub fn update_album(
    id: String,
    name: String,
    description: Option<String>,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.update_album(&id, &name, description.as_deref())
}

#[tauri::command]
pub fn add_photos_to_album(
    album_id: String,
    photo_ids: Vec<String>,
    db: State<DbState>,
) -> AppResult<usize> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.add_photos_to_album(&album_id, &photo_ids)
}

#[tauri::command]
pub fn remove_photos_from_album(
    album_id: String,
    photo_ids: Vec<String>,
    db: State<DbState>,
) -> AppResult<usize> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.remove_photos_from_album(&album_id, &photo_ids)
}

#[tauri::command]
pub fn get_album_photos(
    album_id: String,
    db: State<DbState>,
) -> AppResult<SearchResult> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    let (photos, total) = db.get_album_photos(&album_id)?;
    Ok(SearchResult { photos, total })
}

#[tauri::command]
pub fn update_photo_tags(
    id: String,
    tags: Vec<String>,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.update_photo_tags(&id, &tags)
}

/// Filter photos by world name and/or date range
#[tauri::command]
pub fn filter_photos(
    world_name: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    offset: i64,
    limit: i64,
    db: State<DbState>,
) -> AppResult<SearchResult> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    let (photos, total) = db.filter_photos(
        world_name.as_deref(),
        date_from.as_deref(),
        date_to.as_deref(),
        offset,
        limit,
    )?;
    Ok(SearchResult { photos, total })
}

/// Get distinct world names for filter dropdown
#[tauri::command]
pub fn get_world_names(db: State<DbState>) -> AppResult<Vec<String>> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.get_world_names()
}

/// Get world history filtered by date range
#[tauri::command]
pub fn get_world_history_filtered(
    date_from: Option<String>,
    date_to: Option<String>,
    db: State<DbState>,
) -> AppResult<Vec<WorldVisit>> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.get_world_history_filtered(date_from.as_deref(), date_to.as_deref())
}

/// Export all user data to a JSON file
#[tauri::command]
pub fn export_data_to_file(
    path: String,
    db: State<DbState>,
) -> AppResult<()> {
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    let data = db.export_all_data()?;
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| AppError::Parse(e.to_string()))?;
    std::fs::write(&path, json)
        .map_err(|e| AppError::Parse(format!("Failed to write file: {}", e)))?;
    Ok(())
}

/// Import user data from a JSON file
#[tauri::command]
pub fn import_data_from_file(
    path: String,
    db: State<DbState>,
) -> AppResult<ImportStats> {
    let json = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Parse(format!("Failed to read file: {}", e)))?;
    let data: ExportData = serde_json::from_str(&json)
        .map_err(|e| AppError::Parse(format!("Invalid data format: {}", e)))?;
    let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
    db.import_data(&data)
}

// --- AI Search commands (Phase 2) ---

/// AI-powered hybrid search: vector similarity + text search
#[tauri::command]
pub async fn ai_search(
    query: String,
    limit: Option<u32>,
    db: State<'_, DbState>,
    sidecar: State<'_, SidecarState>,
) -> AppResult<SearchResult> {
    let search_limit = limit.unwrap_or(20);

    let sidecar_result = sidecar
        .hybrid_search(&query, search_limit, 0.5, 0.5)
        .await?;

    // Look up full Photo objects from DB by the returned photo IDs
    let photo_ids: Vec<String> = sidecar_result
        .results
        .iter()
        .map(|r| r.photo_id.clone())
        .collect();

    let db = db
        .0
        .lock()
        .map_err(|e| AppError::Parse(e.to_string()))?;

    let mut photos = Vec::new();
    for id in &photo_ids {
        if let Ok(Some(photo)) = db.get_photo_by_id(id) {
            photos.push(photo);
        }
    }

    let total = photos.len();
    Ok(SearchResult { photos, total })
}

/// Index photos in the vector store (LanceDB) for AI search
#[tauri::command]
pub async fn index_photos_vectors(
    batch_size: Option<i64>,
    db: State<'_, DbState>,
    sidecar: State<'_, SidecarState>,
) -> AppResult<serde_json::Value> {
    let limit = batch_size.unwrap_or(50);

    let photos = {
        let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
        let (all_photos, _) = db.get_photos(0, limit)?;
        all_photos
    };

    if photos.is_empty() {
        return Ok(serde_json::json!({"indexed": 0, "skipped": 0}));
    }

    let items: Vec<crate::sidecar::VectorIndexItem> = photos
        .iter()
        .map(|p| crate::sidecar::VectorIndexItem {
            photo_id: p.id.clone(),
            image_path: p.filepath.clone(),
        })
        .collect();

    let result = sidecar.index_vectors_batch(&items).await?;

    Ok(serde_json::json!({
        "indexed": result.indexed,
        "skipped": result.skipped,
    }))
}

/// Index photo metadata in Meilisearch for text search
#[tauri::command]
pub async fn index_photos_text(
    batch_size: Option<i64>,
    db: State<'_, DbState>,
    sidecar: State<'_, SidecarState>,
) -> AppResult<serde_json::Value> {
    let limit = batch_size.unwrap_or(100);

    let photos = {
        let db = db.0.lock().map_err(|e| AppError::Parse(e.to_string()))?;
        let (all_photos, _) = db.get_photos(0, limit)?;
        all_photos
    };

    if photos.is_empty() {
        return Ok(serde_json::json!({"indexed": 0}));
    }

    let docs: Vec<crate::sidecar::TextIndexDocument> = photos
        .iter()
        .map(|p| crate::sidecar::TextIndexDocument {
            id: p.id.clone(),
            caption: p.caption.clone(),
            tags: p.tags.clone(),
            world_name: p.world_name.clone(),
            filename: Some(p.filename.clone()),
        })
        .collect();

    let result = sidecar.index_text_batch(&docs).await?;

    Ok(serde_json::json!({
        "indexed": result.indexed,
    }))
}

/// Get AI search index status
#[tauri::command]
pub async fn get_search_status(
    sidecar: State<'_, SidecarState>,
) -> AppResult<serde_json::Value> {
    match sidecar.search_status().await {
        Ok(status) => Ok(serde_json::json!({
            "total_vectors": status.total_vectors,
            "total_documents": status.total_documents,
            "meilisearch_available": status.meilisearch_available,
        })),
        Err(_) => Ok(serde_json::json!({
            "total_vectors": 0,
            "total_documents": 0,
            "meilisearch_available": false,
        })),
    }
}
