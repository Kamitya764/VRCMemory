use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use image::imageops::FilterType;

use crate::db::Database;
use crate::error::AppResult;
use crate::models::{IndexingStatus, Photo};
use crate::vrchat_log::{LogEntry, VRChatLogParser};

const THUMBNAIL_SIZE: u32 = 320;

/// Shared indexing state accessible from commands
pub struct IndexerState {
    pub total: AtomicUsize,
    pub processed: AtomicUsize,
    pub is_running: AtomicBool,
}

impl IndexerState {
    pub fn new() -> Self {
        Self {
            total: AtomicUsize::new(0),
            processed: AtomicUsize::new(0),
            is_running: AtomicBool::new(false),
        }
    }

    pub fn status(&self) -> IndexingStatus {
        IndexingStatus {
            total: self.total.load(Ordering::Relaxed),
            processed: self.processed.load(Ordering::Relaxed),
            is_running: self.is_running.load(Ordering::Relaxed),
        }
    }
}

/// Scan a directory for VRChat photos (PNG files matching VRChat naming)
pub fn scan_photo_folder(folder: &Path) -> AppResult<Vec<PathBuf>> {
    let mut photos = Vec::new();

    if !folder.exists() {
        return Ok(photos);
    }

    // VRChat screenshots are organized in subfolders by date: VRChat/YYYY-MM/
    // Filename format: VRChat_YYYY-MM-DD_HH-MM-SS.SSS_WIDTHxHEIGHT.png
    let pattern = folder.join("**/*.png").to_string_lossy().to_string();
    for path in glob::glob(&pattern).map_err(|e| crate::error::AppError::Parse(e.to_string()))?.flatten() {
        if is_vrchat_screenshot(&path) {
            photos.push(path);
        }
    }

    photos.sort();
    Ok(photos)
}

/// Check if a file looks like a VRChat screenshot based on filename
fn is_vrchat_screenshot(path: &Path) -> bool {
    let filename = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    // VRChat_2024-01-15_20-30-00.123_1920x1080.png
    filename.starts_with("VRChat_") && filename.ends_with(".png")
}

/// Extract datetime from VRChat screenshot filename
/// Format: VRChat_YYYY-MM-DD_HH-MM-SS.SSS_WIDTHxHEIGHT.png
pub fn parse_screenshot_datetime(filename: &str) -> Option<String> {
    // VRChat_2024-01-15_20-30-00.123_1920x1080.png
    let parts: Vec<&str> = filename.strip_prefix("VRChat_")?.split('_').collect();
    if parts.len() < 2 {
        return None;
    }

    let date = parts[0]; // 2024-01-15
    let time_part = parts[1]; // 20-30-00.123

    // Convert time: 20-30-00.123 -> 20:30:00
    let time_clean = time_part
        .split('.')
        .next()
        .unwrap_or(time_part)
        .replace('-', ":");

    Some(format!("{}T{}", date, time_clean))
}

/// Index a single photo file into the database
pub fn index_photo(db: &Database, filepath: &Path) -> AppResult<Photo> {
    let filename = filepath
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let datetime = parse_screenshot_datetime(&filename)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let photo = Photo {
        id: uuid::Uuid::new_v4().to_string(),
        filepath: filepath.to_string_lossy().to_string(),
        filename: filename.clone(),
        datetime,
        world_name: None,
        world_id: None,
        tags: vec![],
        caption: None,
        thumbnail_path: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    db.insert_photo(&photo)?;
    Ok(photo)
}

/// Process VRChat log files and extract world visits + player info
/// Returns a map of timestamp -> (world_name, world_id, players_in_world)
pub fn process_log_files(log_folder: &Path) -> AppResult<Vec<WorldSession>> {
    let parser = VRChatLogParser::new();
    let mut sessions = Vec::new();

    if !log_folder.exists() {
        return Ok(sessions);
    }

    // Find all output_log files
    let pattern = log_folder.join("output_log*.txt").to_string_lossy().to_string();
    let mut log_files: Vec<PathBuf> = glob::glob(&pattern)
        .map_err(|e| crate::error::AppError::Parse(e.to_string()))?
        .filter_map(|e| e.ok())
        .collect();
    log_files.sort();

    for log_file in &log_files {
        let entries = parser.parse_file(log_file)?;
        let file_sessions = build_sessions_from_entries(&entries);
        sessions.extend(file_sessions);
    }

    Ok(sessions)
}

/// A complete world visit session with players who were present
#[derive(Debug, Clone)]
pub struct WorldSession {
    pub world_name: String,
    pub world_id: String,
    pub instance_type: String,
    pub entered_at: String,
    pub left_at: Option<String>,
    pub players: Vec<String>,
}

/// Build world sessions from log entries
fn build_sessions_from_entries(entries: &[LogEntry]) -> Vec<WorldSession> {
    let mut sessions = Vec::new();
    let mut current_session: Option<WorldSession> = None;
    let mut current_players: Vec<String> = Vec::new();

    for entry in entries {
        match entry {
            LogEntry::WorldJoin {
                timestamp,
                world_name,
                world_id,
                instance_type,
                ..
            } => {
                // Close previous session
                if let Some(mut session) = current_session.take() {
                    session.left_at = Some(timestamp.clone());
                    session.players = current_players.clone();
                    sessions.push(session);
                }

                current_players.clear();
                current_session = Some(WorldSession {
                    world_name: world_name.clone(),
                    world_id: world_id.clone(),
                    instance_type: instance_type.to_string(),
                    entered_at: timestamp.clone(),
                    left_at: None,
                    players: vec![],
                });
            }
            LogEntry::PlayerJoin { player_name, .. } => {
                if !current_players.contains(player_name) {
                    current_players.push(player_name.clone());
                }
            }
            LogEntry::PlayerLeft { player_name, .. } => {
                // Keep the player in the list (they were present during the session)
                if !current_players.contains(player_name) {
                    current_players.push(player_name.clone());
                }
            }
        }
    }

    // Close final session
    if let Some(mut session) = current_session.take() {
        session.players = current_players;
        sessions.push(session);
    }

    sessions
}

/// Generate a thumbnail for a photo, returns the thumbnail path
pub fn generate_thumbnail(filepath: &Path, thumbnails_dir: &Path) -> AppResult<PathBuf> {
    std::fs::create_dir_all(thumbnails_dir)?;

    let filename = filepath
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let thumb_path = thumbnails_dir.join(format!("{}_thumb.jpg", filename));

    if thumb_path.exists() {
        return Ok(thumb_path);
    }

    let img = image::open(filepath).map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
    let thumbnail = img.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, FilterType::Triangle);
    thumbnail
        .save(&thumb_path)
        .map_err(|e| crate::error::AppError::Parse(e.to_string()))?;

    Ok(thumb_path)
}

/// Generate thumbnails for all photos that don't have one
pub fn generate_thumbnails_batch(
    db: &Database,
    thumbnails_dir: &Path,
    state: &IndexerState,
) -> AppResult<usize> {
    let (photos, _) = db.get_photos(0, i64::MAX)?;
    let without_thumb: Vec<&Photo> = photos
        .iter()
        .filter(|p| p.thumbnail_path.is_none())
        .collect();

    let total = without_thumb.len();
    state.total.store(total, Ordering::Relaxed);
    state.processed.store(0, Ordering::Relaxed);
    state.is_running.store(true, Ordering::Relaxed);

    let mut generated = 0;
    for (i, photo) in without_thumb.iter().enumerate() {
        let photo_path = Path::new(&photo.filepath);
        if photo_path.exists() {
            match generate_thumbnail(photo_path, thumbnails_dir) {
                Ok(thumb_path) => {
                    let thumb_str = thumb_path.to_string_lossy().to_string();
                    if db.update_photo_thumbnail(&photo.id, &thumb_str).is_ok() {
                        generated += 1;
                    }
                }
                Err(e) => {
                    log::warn!("Failed to generate thumbnail for {}: {}", photo.filepath, e);
                }
            }
        }
        state.processed.store(i + 1, Ordering::Relaxed);
    }

    state.is_running.store(false, Ordering::Relaxed);
    Ok(generated)
}

/// Match photos to world sessions based on timestamp
pub fn match_photos_to_sessions(
    db: &Database,
    sessions: &[WorldSession],
) -> AppResult<usize> {
    let (photos, _) = db.get_photos(0, i64::MAX)?;
    let mut matched = 0;

    for photo in &photos {
        if photo.world_name.is_some() {
            continue; // Already matched
        }

        // Find the session that contains this photo's timestamp
        for session in sessions {
            if is_timestamp_in_session(&photo.datetime, session) {
                db.update_photo_world(
                    &photo.id,
                    &session.world_name,
                    &session.world_id,
                )?;
                matched += 1;
                break;
            }
        }
    }

    Ok(matched)
}

/// Check if a photo timestamp falls within a world session
fn is_timestamp_in_session(photo_dt: &str, session: &WorldSession) -> bool {
    // Normalize timestamps for comparison
    let photo_normalized = normalize_timestamp(photo_dt);
    let enter_normalized = normalize_timestamp(&session.entered_at);

    if photo_normalized < enter_normalized {
        return false;
    }

    if let Some(left) = &session.left_at {
        let left_normalized = normalize_timestamp(left);
        photo_normalized <= left_normalized
    } else {
        // No leave time = still in session, accept anything after entry
        true
    }
}

/// Normalize VRChat timestamp format to comparable string
fn normalize_timestamp(ts: &str) -> String {
    // Convert "2024.01.15 20:30:00" -> "2024-01-15T20:30:00"
    // or pass through if already in ISO format
    ts.replace('.', "-")
        .replace(' ', "T")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_screenshot_datetime() {
        let result = parse_screenshot_datetime("VRChat_2024-01-15_20-30-00.123_1920x1080.png");
        assert_eq!(result, Some("2024-01-15T20:30:00".to_string()));
    }

    #[test]
    fn test_parse_screenshot_datetime_no_match() {
        let result = parse_screenshot_datetime("random_image.png");
        assert!(result.is_none());
    }

    #[test]
    fn test_is_vrchat_screenshot() {
        assert!(is_vrchat_screenshot(Path::new(
            "VRChat_2024-01-15_20-30-00.123_1920x1080.png"
        )));
        assert!(!is_vrchat_screenshot(Path::new("random.png")));
        assert!(!is_vrchat_screenshot(Path::new("VRChat_photo.jpg")));
    }

    #[test]
    fn test_normalize_timestamp() {
        assert_eq!(
            normalize_timestamp("2024.01.15 20:30:00"),
            "2024-01-15T20:30:00"
        );
        assert_eq!(
            normalize_timestamp("2024-01-15T20:30:00"),
            "2024-01-15T20:30:00"
        );
    }

    #[test]
    fn test_is_timestamp_in_session() {
        let session = WorldSession {
            world_name: "Test".to_string(),
            world_id: "wrld_test".to_string(),
            instance_type: "Public".to_string(),
            entered_at: "2024-01-15T20:00:00".to_string(),
            left_at: Some("2024-01-15T21:00:00".to_string()),
            players: vec![],
        };
        assert!(is_timestamp_in_session("2024-01-15T20:30:00", &session));
        assert!(!is_timestamp_in_session("2024-01-15T19:00:00", &session));
        assert!(!is_timestamp_in_session("2024-01-15T22:00:00", &session));
        assert!(is_timestamp_in_session("2024-01-15T20:00:00", &session));
        assert!(is_timestamp_in_session("2024-01-15T21:00:00", &session));
    }

    #[test]
    fn test_is_timestamp_in_open_session() {
        let session = WorldSession {
            world_name: "Test".to_string(),
            world_id: "wrld_test".to_string(),
            instance_type: "Public".to_string(),
            entered_at: "2024-01-15T20:00:00".to_string(),
            left_at: None,
            players: vec![],
        };
        assert!(is_timestamp_in_session("2024-01-15T23:59:59", &session));
        assert!(!is_timestamp_in_session("2024-01-15T19:00:00", &session));
    }

    #[test]
    fn test_build_sessions() {
        use crate::vrchat_log::InstanceType;

        let entries = vec![
            LogEntry::WorldJoin {
                timestamp: "2024.01.15 20:00:00".to_string(),
                world_name: "Test World".to_string(),
                world_id: "wrld_test123".to_string(),
                instance_id: "12345".to_string(),
                instance_type: InstanceType::Public,
            },
            LogEntry::PlayerJoin {
                timestamp: "2024.01.15 20:01:00".to_string(),
                player_name: "Alice".to_string(),
            },
            LogEntry::PlayerJoin {
                timestamp: "2024.01.15 20:02:00".to_string(),
                player_name: "Bob".to_string(),
            },
            LogEntry::WorldJoin {
                timestamp: "2024.01.15 21:00:00".to_string(),
                world_name: "Another World".to_string(),
                world_id: "wrld_test456".to_string(),
                instance_id: "67890".to_string(),
                instance_type: InstanceType::Friends,
            },
        ];

        let sessions = build_sessions_from_entries(&entries);
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].world_name, "Test World");
        assert_eq!(sessions[0].players, vec!["Alice", "Bob"]);
        assert_eq!(
            sessions[0].left_at,
            Some("2024.01.15 21:00:00".to_string())
        );
        assert_eq!(sessions[1].world_name, "Another World");
        assert!(sessions[1].left_at.is_none());
    }
}
