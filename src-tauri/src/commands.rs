use tauri::State;

use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{AppSettings, Friend, IndexingStatus, Photo, SearchResult, WorldVisit};

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
    // Phase 1: Basic metadata search via SQLite
    // Phase 2 will add vector search via LanceDB + Meilisearch
    let _ = query;
    let db = db.0.lock().map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    let (photos, total) = db.get_photos(0, 50)?;
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

#[tauri::command]
pub fn start_indexing() -> AppResult<()> {
    // TODO: Implement photo folder scanning and indexing
    log::info!("Indexing started");
    Ok(())
}

#[tauri::command]
pub fn get_indexing_status() -> AppResult<IndexingStatus> {
    Ok(IndexingStatus {
        total: 0,
        processed: 0,
        is_running: false,
    })
}
