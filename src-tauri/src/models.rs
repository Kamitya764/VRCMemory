use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Photo {
    pub id: String,
    pub filepath: String,
    pub filename: String,
    pub datetime: String,
    pub world_name: Option<String>,
    pub world_id: Option<String>,
    pub tags: Vec<String>,
    pub caption: Option<String>,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub photos: Vec<Photo>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorldVisit {
    pub id: String,
    pub world_name: String,
    pub world_id: String,
    pub entered_at: String,
    pub left_at: Option<String>,
    pub players: Vec<String>,
    pub instance_type: String,
    pub rating: Option<i32>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Friend {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub avatars: Vec<Avatar>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Avatar {
    pub id: String,
    pub friend_id: String,
    pub name: String,
    pub reference_images: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Album {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub photo_count: usize,
    pub cover_photo: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub photo_folder: String,
    pub log_folder: String,
    pub theme: String,
    pub gpu_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            photo_folder: String::new(),
            log_folder: String::new(),
            theme: "dark".to_string(),
            gpu_enabled: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexingStatus {
    pub total: usize,
    pub processed: usize,
    pub is_running: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub friends: Vec<Friend>,
    pub world_visits: Vec<WorldVisit>,
    pub albums: Vec<AlbumExport>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AlbumExport {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub photo_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportStats {
    pub friends_imported: usize,
    pub world_visits_imported: usize,
    pub albums_imported: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Encounter {
    pub id: String,
    pub friend_id: String,
    pub friend_name: String,
    pub world_name: String,
    pub world_id: String,
    pub world_visit_id: String,
    pub met_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FriendStats {
    pub friend_id: String,
    pub friend_name: String,
    pub encounter_count: usize,
    pub last_met: Option<String>,
    pub top_worlds: Vec<(String, usize)>,
}
