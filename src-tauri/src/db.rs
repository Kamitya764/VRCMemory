use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

use crate::error::AppResult;
use crate::models::{Album, AlbumExport, AppSettings, Avatar, DuplicateGroup, Encounter, ExportData, Friend, FriendStats, ImportStats, Photo, WorldVisit};

pub struct DbState(pub Mutex<Database>);

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        // Enable WAL mode for concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
        let db = Self { conn };
        db.initialize_tables()?;
        Ok(db)
    }

    fn initialize_tables(&self) -> AppResult<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                filepath TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                datetime TEXT NOT NULL,
                world_name TEXT,
                world_id TEXT,
                tags TEXT DEFAULT '[]',
                caption TEXT,
                thumbnail_path TEXT,
                ocr_text TEXT,
                image_hash TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS world_visits (
                id TEXT PRIMARY KEY,
                world_name TEXT NOT NULL,
                world_id TEXT NOT NULL,
                entered_at TEXT NOT NULL,
                left_at TEXT,
                players TEXT DEFAULT '[]',
                instance_type TEXT DEFAULT 'unknown',
                rating INTEGER,
                notes TEXT,
                UNIQUE(world_id, entered_at)
            );

            CREATE TABLE IF NOT EXISTS friends (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS avatars (
                id TEXT PRIMARY KEY,
                friend_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS avatar_references (
                id TEXT PRIMARY KEY,
                avatar_id TEXT NOT NULL,
                image_path TEXT NOT NULL,
                FOREIGN KEY (avatar_id) REFERENCES avatars(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS albums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS album_photos (
                album_id TEXT NOT NULL,
                photo_id TEXT NOT NULL,
                PRIMARY KEY (album_id, photo_id),
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS watch_folders (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                folder_type TEXT NOT NULL DEFAULT 'photo',
                enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS encounters (
                id TEXT PRIMARY KEY,
                friend_id TEXT NOT NULL,
                world_visit_id TEXT NOT NULL,
                met_at TEXT NOT NULL,
                FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE CASCADE,
                FOREIGN KEY (world_visit_id) REFERENCES world_visits(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_photos_datetime ON photos(datetime);
            CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
            CREATE INDEX IF NOT EXISTS idx_world_visits_entered ON world_visits(entered_at);
            CREATE INDEX IF NOT EXISTS idx_avatars_friend ON avatars(friend_id);
            CREATE INDEX IF NOT EXISTS idx_encounters_friend ON encounters(friend_id);
            CREATE INDEX IF NOT EXISTS idx_encounters_visit ON encounters(world_visit_id);
            CREATE INDEX IF NOT EXISTS idx_photos_image_hash ON photos(image_hash);
            ",
        )?;
        Ok(())
    }

    // Photo operations
    pub fn get_photos(&self, offset: i64, limit: i64) -> AppResult<(Vec<Photo>, usize)> {
        let total: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))?;

        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos ORDER BY datetime DESC LIMIT ?1 OFFSET ?2",
        )?;

        let photos = stmt
            .query_map(params![limit, offset], |row| {
                Self::row_to_photo(row)
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    fn row_to_photo(row: &rusqlite::Row) -> rusqlite::Result<Photo> {
        let tags_str: String = row.get(6)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(Photo {
            id: row.get(0)?,
            filepath: row.get(1)?,
            filename: row.get(2)?,
            datetime: row.get(3)?,
            world_name: row.get(4)?,
            world_id: row.get(5)?,
            tags,
            caption: row.get(7)?,
            thumbnail_path: row.get(8)?,
            ocr_text: row.get(9)?,
            image_hash: row.get(10)?,
            created_at: row.get(11)?,
        })
    }

    pub fn insert_photo(&self, photo: &Photo) -> AppResult<()> {
        let tags_json = serde_json::to_string(&photo.tags).unwrap_or_default();
        self.conn.execute(
            "INSERT OR IGNORE INTO photos (id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                photo.id,
                photo.filepath,
                photo.filename,
                photo.datetime,
                photo.world_name,
                photo.world_id,
                tags_json,
                photo.caption,
                photo.thumbnail_path,
                photo.ocr_text,
                photo.image_hash,
                photo.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_photo_by_id(&self, id: &str) -> AppResult<Option<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos WHERE id = ?1",
        )?;

        let result = stmt
            .query_row(params![id], Self::row_to_photo)
            .ok();

        Ok(result)
    }

    // World visit operations
    pub fn get_world_history(&self) -> AppResult<Vec<WorldVisit>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, world_name, world_id, entered_at, left_at, players, instance_type, rating, notes
             FROM world_visits ORDER BY entered_at DESC",
        )?;

        let visits = stmt
            .query_map([], |row| {
                let players_str: String = row.get(5)?;
                let players: Vec<String> =
                    serde_json::from_str(&players_str).unwrap_or_default();
                Ok(WorldVisit {
                    id: row.get(0)?,
                    world_name: row.get(1)?,
                    world_id: row.get(2)?,
                    entered_at: row.get(3)?,
                    left_at: row.get(4)?,
                    players,
                    instance_type: row.get(6)?,
                    rating: row.get(7)?,
                    notes: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(visits)
    }

    pub fn insert_world_visit(&self, visit: &WorldVisit) -> AppResult<()> {
        let players_json = serde_json::to_string(&visit.players).unwrap_or_default();
        self.conn.execute(
            "INSERT OR IGNORE INTO world_visits (id, world_name, world_id, entered_at, left_at, players, instance_type, rating, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                visit.id,
                visit.world_name,
                visit.world_id,
                visit.entered_at,
                visit.left_at,
                players_json,
                visit.instance_type,
                visit.rating,
                visit.notes,
            ],
        )?;
        Ok(())
    }

    // Friend operations
    pub fn get_friends(&self) -> AppResult<Vec<Friend>> {
        // Single query with LEFT JOINs to avoid N+1
        let mut stmt = self.conn.prepare(
            "SELECT f.id, f.name, f.notes, f.created_at,
                    a.id, a.name, ar.image_path
             FROM friends f
             LEFT JOIN avatars a ON a.friend_id = f.id
             LEFT JOIN avatar_references ar ON ar.avatar_id = a.id
             ORDER BY f.name, a.created_at, a.id",
        )?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Group rows into Friends > Avatars > References in Rust
        let mut friends: Vec<Friend> = Vec::new();
        let mut current_friend_id: Option<String> = None;
        let mut current_avatar_id: Option<String> = None;

        for (friend_id, friend_name, notes, created_at, avatar_id, avatar_name, ref_path) in rows {
            // New friend
            if current_friend_id.as_deref() != Some(&friend_id) {
                friends.push(Friend {
                    id: friend_id.clone(),
                    name: friend_name,
                    notes,
                    avatars: vec![],
                    created_at,
                });
                current_friend_id = Some(friend_id);
                current_avatar_id = None;
            }

            let friend = friends.last_mut().unwrap();

            // New avatar (if present)
            if let (Some(av_id), Some(av_name)) = (&avatar_id, &avatar_name) {
                if current_avatar_id.as_deref() != Some(av_id) {
                    friend.avatars.push(Avatar {
                        id: av_id.clone(),
                        friend_id: friend.id.clone(),
                        name: av_name.clone(),
                        reference_images: ref_path.into_iter().collect(),
                    });
                    current_avatar_id = Some(av_id.clone());
                } else if let Some(last_avatar) = friend.avatars.last_mut() {
                    if let Some(path) = ref_path {
                        last_avatar.reference_images.push(path);
                    }
                }
            }
        }

        Ok(friends)
    }

    pub fn insert_friend(&self, friend: &Friend) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO friends (id, name, notes, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![friend.id, friend.name, friend.notes, friend.created_at],
        )?;
        Ok(())
    }

    pub fn delete_friend(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM friends WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Settings operations
    pub fn get_settings(&self) -> AppResult<AppSettings> {
        let mut settings = AppSettings::default();

        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings")?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows.flatten() {
            let (key, value) = row;
            match key.as_str() {
                "photo_folder" => settings.photo_folder = value,
                "log_folder" => settings.log_folder = value,
                "theme" => settings.theme = value,
                "gpu_enabled" => settings.gpu_enabled = value == "true",
                _ => {}
            }
        }

        Ok(settings)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn update_photo_world(
        &self,
        photo_id: &str,
        world_name: &str,
        world_id: &str,
    ) -> AppResult<()> {
        self.conn.execute(
            "UPDATE photos SET world_name = ?1, world_id = ?2 WHERE id = ?3",
            params![world_name, world_id, photo_id],
        )?;
        Ok(())
    }

    pub fn update_photo_caption(&self, photo_id: &str, caption: &str) -> AppResult<()> {
        self.conn.execute(
            "UPDATE photos SET caption = ?1 WHERE id = ?2",
            params![caption, photo_id],
        )?;
        Ok(())
    }

    pub fn get_photos_without_caption(&self, limit: i64) -> AppResult<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos WHERE caption IS NULL ORDER BY datetime DESC LIMIT ?1",
        )?;

        let photos = stmt
            .query_map(params![limit], Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(photos)
    }

    pub fn get_photos_without_ocr(&self, limit: i64) -> AppResult<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos WHERE ocr_text IS NULL ORDER BY datetime DESC LIMIT ?1",
        )?;

        let photos = stmt
            .query_map(params![limit], Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(photos)
    }

    pub fn update_photo_ocr(&self, photo_id: &str, ocr_text: &str) -> AppResult<()> {
        self.conn.execute(
            "UPDATE photos SET ocr_text = ?1 WHERE id = ?2",
            params![ocr_text, photo_id],
        )?;
        Ok(())
    }

    pub fn get_photos_without_hash(&self, limit: i64) -> AppResult<Vec<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos WHERE image_hash IS NULL ORDER BY datetime DESC LIMIT ?1",
        )?;

        let photos = stmt
            .query_map(params![limit], Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(photos)
    }

    pub fn update_photo_hash(&self, photo_id: &str, hash: &str) -> AppResult<()> {
        self.conn.execute(
            "UPDATE photos SET image_hash = ?1 WHERE id = ?2",
            params![hash, photo_id],
        )?;
        Ok(())
    }

    pub fn find_duplicate_groups(&self) -> AppResult<Vec<DuplicateGroup>> {
        // Single query using subquery to avoid N+1
        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos
             WHERE image_hash IN (
                 SELECT image_hash FROM photos
                 WHERE image_hash IS NOT NULL
                 GROUP BY image_hash HAVING COUNT(*) > 1
             )
             ORDER BY image_hash, datetime",
        )?;

        let photos = stmt
            .query_map([], Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        // Group photos by hash in Rust
        let mut groups: Vec<DuplicateGroup> = Vec::new();
        let mut current_hash: Option<String> = None;

        for photo in photos {
            let hash = photo.image_hash.clone().unwrap_or_default();
            if current_hash.as_deref() != Some(&hash) {
                groups.push(DuplicateGroup {
                    hash: hash.clone(),
                    photos: vec![photo],
                });
                current_hash = Some(hash);
            } else if let Some(last) = groups.last_mut() {
                last.photos.push(photo);
            }
        }

        // Sort by group size descending
        groups.sort_by(|a, b| b.photos.len().cmp(&a.photos.len()));

        Ok(groups)
    }

    pub fn photo_exists(&self, filepath: &str) -> AppResult<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE filepath = ?1",
            params![filepath],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn search_photos_by_text(
        &self,
        query: &str,
        limit: i64,
    ) -> AppResult<(Vec<Photo>, usize)> {
        let search_pattern = format!("%{}%", query);

        let total: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE
             world_name LIKE ?1 OR caption LIKE ?1 OR tags LIKE ?1 OR filename LIKE ?1 OR ocr_text LIKE ?1",
            params![search_pattern],
            |row| row.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos WHERE
             world_name LIKE ?1 OR caption LIKE ?1 OR tags LIKE ?1 OR filename LIKE ?1 OR ocr_text LIKE ?1
             ORDER BY datetime DESC LIMIT ?2",
        )?;

        let photos = stmt
            .query_map(params![search_pattern, limit], Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    /// Filter photos with optional world name and date range
    pub fn filter_photos(
        &self,
        world_name: Option<&str>,
        date_from: Option<&str>,
        date_to: Option<&str>,
        offset: i64,
        limit: i64,
    ) -> AppResult<(Vec<Photo>, usize)> {
        let mut conditions = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(world) = world_name {
            conditions.push(format!("world_name LIKE ?{}", param_values.len() + 1));
            param_values.push(Box::new(format!("%{}%", world)));
        }
        if let Some(from) = date_from {
            conditions.push(format!("datetime >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(from.to_string()));
        }
        if let Some(to) = date_to {
            conditions.push(format!("datetime <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(format!("{}T23:59:59", to)));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let count_sql = format!("SELECT COUNT(*) FROM photos {}", where_clause);
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        let total: usize = self
            .conn
            .query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))?;

        let query_sql = format!(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, ocr_text, image_hash, created_at
             FROM photos {} ORDER BY datetime DESC LIMIT ?{} OFFSET ?{}",
            where_clause,
            param_values.len() + 1,
            param_values.len() + 2
        );

        let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = param_values
            .into_iter()
            .collect();
        all_params.push(Box::new(limit));
        all_params.push(Box::new(offset));

        let all_refs: Vec<&dyn rusqlite::types::ToSql> =
            all_params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = self.conn.prepare(&query_sql)?;
        let photos = stmt
            .query_map(all_refs.as_slice(), Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    /// Get distinct world names for filter dropdown
    pub fn get_world_names(&self) -> AppResult<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT world_name FROM photos WHERE world_name IS NOT NULL ORDER BY world_name",
        )?;
        let names = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(names)
    }

    #[allow(dead_code)]
    pub fn get_photo_count(&self) -> AppResult<usize> {
        let count: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))?;
        Ok(count)
    }

    pub fn count_photos_without_thumbnail(&self) -> AppResult<usize> {
        let count: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE thumbnail_path IS NULL",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn delete_photo(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM photos WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_photos(&self, ids: &[String]) -> AppResult<usize> {
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "DELETE FROM photos WHERE id IN ({})",
            placeholders.join(", ")
        );
        let params: Vec<&dyn rusqlite::types::ToSql> =
            ids.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        let deleted = self.conn.execute(&sql, params.as_slice())?;
        Ok(deleted)
    }

    pub fn update_photo_thumbnail(&self, photo_id: &str, thumbnail_path: &str) -> AppResult<()> {
        self.conn.execute(
            "UPDATE photos SET thumbnail_path = ?1 WHERE id = ?2",
            params![thumbnail_path, photo_id],
        )?;
        Ok(())
    }

    // World visit updates
    pub fn update_world_visit_rating(&self, id: &str, rating: Option<i32>) -> AppResult<()> {
        self.conn.execute(
            "UPDATE world_visits SET rating = ?1 WHERE id = ?2",
            params![rating, id],
        )?;
        Ok(())
    }

    pub fn update_world_visit_notes(&self, id: &str, notes: Option<&str>) -> AppResult<()> {
        self.conn.execute(
            "UPDATE world_visits SET notes = ?1 WHERE id = ?2",
            params![notes, id],
        )?;
        Ok(())
    }

    // Friend updates
    pub fn update_friend_notes(&self, id: &str, notes: Option<&str>) -> AppResult<()> {
        self.conn.execute(
            "UPDATE friends SET notes = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![notes, id],
        )?;
        Ok(())
    }

    pub fn update_friend_name(&self, id: &str, name: &str) -> AppResult<()> {
        self.conn.execute(
            "UPDATE friends SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![name, id],
        )?;
        Ok(())
    }

    // Avatar operations

    #[allow(dead_code)]
    pub fn get_avatars_for_friend(&self, friend_id: &str) -> AppResult<Vec<Avatar>> {
        // Single query using LEFT JOIN to avoid N+1
        let mut stmt = self.conn.prepare(
            "SELECT a.id, a.friend_id, a.name, ar.image_path
             FROM avatars a
             LEFT JOIN avatar_references ar ON a.id = ar.avatar_id
             WHERE a.friend_id = ?1
             ORDER BY a.created_at, a.id",
        )?;

        let rows = stmt
            .query_map(params![friend_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Group rows by avatar in Rust
        let mut result: Vec<Avatar> = Vec::new();
        let mut current_id: Option<String> = None;

        for (avatar_id, fid, name, image_path) in rows {
            if current_id.as_deref() != Some(&avatar_id) {
                result.push(Avatar {
                    id: avatar_id.clone(),
                    friend_id: fid,
                    name,
                    reference_images: image_path.into_iter().collect(),
                });
                current_id = Some(avatar_id);
            } else if let Some(last) = result.last_mut() {
                if let Some(path) = image_path {
                    last.reference_images.push(path);
                }
            }
        }

        Ok(result)
    }

    pub fn insert_avatar(&self, friend_id: &str, name: &str) -> AppResult<Avatar> {
        let id = uuid::Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO avatars (id, friend_id, name) VALUES (?1, ?2, ?3)",
            params![id, friend_id, name],
        )?;
        Ok(Avatar {
            id,
            friend_id: friend_id.to_string(),
            name: name.to_string(),
            reference_images: vec![],
        })
    }

    pub fn delete_avatar(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM avatars WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn add_avatar_reference(&self, avatar_id: &str, image_path: &str) -> AppResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO avatar_references (id, avatar_id, image_path) VALUES (?1, ?2, ?3)",
            params![id, avatar_id, image_path],
        )?;
        Ok(id)
    }

    pub fn delete_avatar_reference(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM avatar_references WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Encounter operations

    /// Build encounters by matching friend names against world_visits.players
    pub fn build_encounters(&self) -> AppResult<usize> {
        let friends = self.get_friends()?;
        if friends.is_empty() {
            return Ok(0);
        }

        let mut stmt = self.conn.prepare(
            "SELECT id, world_name, world_id, entered_at, players FROM world_visits",
        )?;

        let visits: Vec<(String, String, String, String, Vec<String>)> = stmt
            .query_map([], |row| {
                let players_str: String = row.get(4)?;
                let players: Vec<String> =
                    serde_json::from_str(&players_str).unwrap_or_default();
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, players))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Use a transaction for batch inserts
        self.conn.execute_batch("BEGIN")?;
        let mut count = 0;

        let result = (|| -> AppResult<usize> {
            for (visit_id, _world_name, _world_id, entered_at, players) in &visits {
                for friend in &friends {
                    if players.iter().any(|p| p == &friend.name) {
                        let exists: bool = self.conn.query_row(
                            "SELECT EXISTS(SELECT 1 FROM encounters WHERE friend_id = ?1 AND world_visit_id = ?2)",
                            params![friend.id, visit_id],
                            |row| row.get(0),
                        )?;

                        if !exists {
                            let id = uuid::Uuid::new_v4().to_string();
                            self.conn.execute(
                                "INSERT INTO encounters (id, friend_id, world_visit_id, met_at) VALUES (?1, ?2, ?3, ?4)",
                                params![id, friend.id, visit_id, entered_at],
                            )?;
                            count += 1;
                        }
                    }
                }
            }
            Ok(count)
        })();

        match result {
            Ok(c) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(c)
            }
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    /// Get encounters for a specific friend with world info
    pub fn get_friend_encounters(&self, friend_id: &str) -> AppResult<Vec<Encounter>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.friend_id, f.name, wv.world_name, wv.world_id, e.world_visit_id, e.met_at
             FROM encounters e
             JOIN friends f ON f.id = e.friend_id
             JOIN world_visits wv ON wv.id = e.world_visit_id
             WHERE e.friend_id = ?1
             ORDER BY e.met_at DESC",
        )?;

        let encounters = stmt
            .query_map(params![friend_id], |row| {
                Ok(Encounter {
                    id: row.get(0)?,
                    friend_id: row.get(1)?,
                    friend_name: row.get(2)?,
                    world_name: row.get(3)?,
                    world_id: row.get(4)?,
                    world_visit_id: row.get(5)?,
                    met_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(encounters)
    }

    /// Get stats for a specific friend
    pub fn get_friend_stats(&self, friend_id: &str) -> AppResult<FriendStats> {
        let friend_name: String = self.conn.query_row(
            "SELECT name FROM friends WHERE id = ?1",
            params![friend_id],
            |row| row.get(0),
        )?;

        let encounter_count: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM encounters WHERE friend_id = ?1",
            params![friend_id],
            |row| row.get(0),
        )?;

        let last_met: Option<String> = self.conn.query_row(
            "SELECT MAX(met_at) FROM encounters WHERE friend_id = ?1",
            params![friend_id],
            |row| row.get(0),
        ).ok().flatten();

        let mut world_stmt = self.conn.prepare(
            "SELECT wv.world_name, COUNT(*) as cnt
             FROM encounters e
             JOIN world_visits wv ON wv.id = e.world_visit_id
             WHERE e.friend_id = ?1
             GROUP BY wv.world_name
             ORDER BY cnt DESC
             LIMIT 5",
        )?;

        let top_worlds: Vec<(String, usize)> = world_stmt
            .query_map(params![friend_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(FriendStats {
            friend_id: friend_id.to_string(),
            friend_name,
            encounter_count,
            last_met,
            top_worlds,
        })
    }

    // Album operations
    pub fn get_albums(&self) -> AppResult<Vec<Album>> {
        let mut stmt = self.conn.prepare(
            "SELECT a.id, a.name, a.description, a.created_at,
                    COUNT(ap.photo_id) as photo_count,
                    (SELECT p.filepath FROM album_photos ap2
                     JOIN photos p ON p.id = ap2.photo_id
                     WHERE ap2.album_id = a.id
                     ORDER BY p.datetime DESC LIMIT 1) as cover_photo
             FROM albums a
             LEFT JOIN album_photos ap ON ap.album_id = a.id
             GROUP BY a.id
             ORDER BY a.created_at DESC",
        )?;

        let albums = stmt
            .query_map([], |row| {
                Ok(Album {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    photo_count: row.get(4)?,
                    cover_photo: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(albums)
    }

    pub fn create_album(&self, album: &Album) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO albums (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![album.id, album.name, album.description, album.created_at],
        )?;
        Ok(())
    }

    pub fn delete_album(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM albums WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_album(&self, id: &str, name: &str, description: Option<&str>) -> AppResult<()> {
        self.conn.execute(
            "UPDATE albums SET name = ?1, description = ?2 WHERE id = ?3",
            params![name, description, id],
        )?;
        Ok(())
    }

    pub fn add_photos_to_album(&self, album_id: &str, photo_ids: &[String]) -> AppResult<usize> {
        let mut added = 0;
        for photo_id in photo_ids {
            let result = self.conn.execute(
                "INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
                params![album_id, photo_id],
            )?;
            if result > 0 {
                added += 1;
            }
        }
        Ok(added)
    }

    pub fn remove_photos_from_album(&self, album_id: &str, photo_ids: &[String]) -> AppResult<usize> {
        let mut removed = 0;
        for photo_id in photo_ids {
            let result = self.conn.execute(
                "DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2",
                params![album_id, photo_id],
            )?;
            removed += result;
        }
        Ok(removed)
    }

    pub fn get_album_photos(&self, album_id: &str) -> AppResult<(Vec<Photo>, usize)> {
        let total: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM album_photos WHERE album_id = ?1",
            params![album_id],
            |row| row.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.filepath, p.filename, p.datetime, p.world_name, p.world_id,
                    p.tags, p.caption, p.thumbnail_path, p.ocr_text, p.image_hash, p.created_at
             FROM photos p
             JOIN album_photos ap ON ap.photo_id = p.id
             WHERE ap.album_id = ?1
             ORDER BY p.datetime DESC",
        )?;

        let photos = stmt
            .query_map(params![album_id], Self::row_to_photo)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    pub fn update_photo_tags(&self, photo_id: &str, tags: &[String]) -> AppResult<()> {
        let tags_json = serde_json::to_string(tags).unwrap_or_default();
        self.conn.execute(
            "UPDATE photos SET tags = ?1 WHERE id = ?2",
            params![tags_json, photo_id],
        )?;
        Ok(())
    }

    /// Filter world history by date range
    pub fn get_world_history_filtered(
        &self,
        date_from: Option<&str>,
        date_to: Option<&str>,
    ) -> AppResult<Vec<WorldVisit>> {
        let mut conditions = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(from) = date_from {
            conditions.push(format!("entered_at >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(from.to_string()));
        }
        if let Some(to) = date_to {
            conditions.push(format!("entered_at <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(format!("{}T23:59:59", to)));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT id, world_name, world_id, entered_at, left_at, players, instance_type, rating, notes
             FROM world_visits {} ORDER BY entered_at DESC",
            where_clause
        );

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = self.conn.prepare(&sql)?;
        let visits = stmt
            .query_map(params_refs.as_slice(), |row| {
                let players_str: String = row.get(5)?;
                let players: Vec<String> =
                    serde_json::from_str(&players_str).unwrap_or_default();
                Ok(WorldVisit {
                    id: row.get(0)?,
                    world_name: row.get(1)?,
                    world_id: row.get(2)?,
                    entered_at: row.get(3)?,
                    left_at: row.get(4)?,
                    players,
                    instance_type: row.get(6)?,
                    rating: row.get(7)?,
                    notes: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(visits)
    }

    /// Export all user data (friends, world visits, albums)
    pub fn export_all_data(&self) -> AppResult<ExportData> {
        let friends = self.get_friends()?;
        let world_visits = self.get_world_history()?;
        let albums = self.get_albums()?;

        let mut album_exports = Vec::new();
        for album in &albums {
            let mut stmt = self.conn.prepare(
                "SELECT photo_id FROM album_photos WHERE album_id = ?1",
            )?;
            let photo_ids: Vec<String> = stmt
                .query_map(params![album.id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;

            album_exports.push(AlbumExport {
                id: album.id.clone(),
                name: album.name.clone(),
                description: album.description.clone(),
                created_at: album.created_at.clone(),
                photo_ids,
            });
        }

        Ok(ExportData {
            version: "1.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            friends,
            world_visits,
            albums: album_exports,
        })
    }

    /// Import data from export file (wrapped in a transaction)
    pub fn import_data(&self, data: &ExportData) -> AppResult<ImportStats> {
        // Validate export data version
        if data.version != "1.0" {
            return Err(crate::error::AppError::Parse(
                format!("Unsupported export version: {} (expected 1.0)", data.version),
            ));
        }

        self.conn.execute_batch("BEGIN")?;

        let result = (|| -> AppResult<ImportStats> {
            let mut friends_imported = 0;
            for friend in &data.friends {
                let result = self.conn.execute(
                    "INSERT OR IGNORE INTO friends (id, name, notes, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![friend.id, friend.name, friend.notes, friend.created_at],
                )?;
                if result > 0 {
                    friends_imported += 1;
                }
            }

            let mut world_visits_imported = 0;
            for visit in &data.world_visits {
                let players_json = serde_json::to_string(&visit.players).unwrap_or_default();
                let result = self.conn.execute(
                    "INSERT OR IGNORE INTO world_visits (id, world_name, world_id, entered_at, left_at, players, instance_type, rating, notes)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        visit.id,
                        visit.world_name,
                        visit.world_id,
                        visit.entered_at,
                        visit.left_at,
                        players_json,
                        visit.instance_type,
                        visit.rating,
                        visit.notes,
                    ],
                )?;
                if result > 0 {
                    world_visits_imported += 1;
                }
            }

            let mut albums_imported = 0;
            for album in &data.albums {
                let result = self.conn.execute(
                    "INSERT OR IGNORE INTO albums (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![album.id, album.name, album.description, album.created_at],
                )?;
                if result > 0 {
                    albums_imported += 1;
                    for photo_id in &album.photo_ids {
                        self.conn.execute(
                            "INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
                            params![album.id, photo_id],
                        )?;
                    }
                }
            }

            Ok(ImportStats {
                friends_imported,
                world_visits_imported,
                albums_imported,
            })
        })();

        match result {
            Ok(stats) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(stats)
            }
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    // Photo stats for analytics
    pub fn get_photo_stats(&self) -> AppResult<PhotoStats> {
        let total: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))?;
        let with_caption: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE caption IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        let with_world: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE world_name IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        let with_thumbnail: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE thumbnail_path IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        let with_ocr: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE ocr_text IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        Ok(PhotoStats {
            total,
            with_caption,
            with_world,
            with_thumbnail,
            with_ocr,
        })
    }

    /// Suggest auto albums based on world visit sessions
    pub fn suggest_auto_albums(&self) -> AppResult<Vec<AutoAlbumSuggestion>> {
        // Step 1: Get groups (without concatenating all IDs in SQL)
        let mut group_stmt = self.conn.prepare(
            "SELECT world_name, DATE(datetime) as visit_date, COUNT(*) as cnt,
                    MIN(datetime) as first_photo
             FROM photos
             WHERE world_name IS NOT NULL
             GROUP BY world_name, DATE(datetime)
             HAVING cnt >= 3
             ORDER BY first_photo DESC
             LIMIT 20",
        )?;

        let groups: Vec<(String, String, usize, String)> = group_stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Step 2: Fetch photo IDs per group with a separate query
        let mut id_stmt = self.conn.prepare(
            "SELECT id FROM photos WHERE world_name = ?1 AND DATE(datetime) = ?2 ORDER BY datetime",
        )?;

        let mut suggestions = Vec::new();
        for (world_name, visit_date, photo_count, first_photo) in groups {
            let photo_ids: Vec<String> = id_stmt
                .query_map(params![world_name, visit_date], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;

            suggestions.push(AutoAlbumSuggestion {
                name: format!("{} ({})", world_name, visit_date),
                world_name,
                date: first_photo,
                photo_count,
                photo_ids,
            });
        }

        Ok(suggestions)
    }
}

/// Photo statistics for the analytics dashboard
#[derive(Debug, serde::Serialize)]
pub struct PhotoStats {
    pub total: usize,
    pub with_caption: usize,
    pub with_world: usize,
    pub with_thumbnail: usize,
    pub with_ocr: usize,
}

#[derive(Debug, serde::Serialize)]
pub struct AutoAlbumSuggestion {
    pub name: String,
    pub world_name: String,
    pub date: String,
    pub photo_count: usize,
    pub photo_ids: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn test_db() -> Database {
        Database::new(Path::new(":memory:")).unwrap()
    }

    fn make_photo(id: &str, datetime: &str, world_name: Option<&str>) -> Photo {
        Photo {
            id: id.to_string(),
            filepath: format!("/photos/{}.png", id),
            filename: format!("{}.png", id),
            datetime: datetime.to_string(),
            world_name: world_name.map(|s| s.to_string()),
            world_id: world_name.map(|_| "wrld_test".to_string()),
            tags: vec![],
            caption: None,
            thumbnail_path: None,
            ocr_text: None,
            image_hash: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_photo_crud() {
        let db = test_db();
        let photo = make_photo("p1", "2025-06-15T12:00:00", Some("Test World"));
        db.insert_photo(&photo).unwrap();

        let (photos, total) = db.get_photos(0, 10).unwrap();
        assert_eq!(total, 1);
        assert_eq!(photos[0].id, "p1");
        assert_eq!(photos[0].world_name.as_deref(), Some("Test World"));

        let found = db.get_photo_by_id("p1").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().filename, "p1.png");

        let missing = db.get_photo_by_id("nonexistent").unwrap();
        assert!(missing.is_none());

        assert!(db.photo_exists("/photos/p1.png").unwrap());
        assert!(!db.photo_exists("/photos/nope.png").unwrap());

        db.delete_photo("p1").unwrap();
        let (_, total) = db.get_photos(0, 10).unwrap();
        assert_eq!(total, 0);
    }

    #[test]
    fn test_bulk_delete_photos() {
        let db = test_db();
        for i in 0..5 {
            db.insert_photo(&make_photo(&format!("p{}", i), "2025-06-15T12:00:00", None))
                .unwrap();
        }
        let deleted = db
            .delete_photos(&["p1".to_string(), "p3".to_string()])
            .unwrap();
        assert_eq!(deleted, 2);
        let (_, total) = db.get_photos(0, 10).unwrap();
        assert_eq!(total, 3);
    }

    #[test]
    fn test_photo_tags() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-15T12:00:00", None))
            .unwrap();
        db.update_photo_tags("p1", &["sunset".to_string(), "friends".to_string()])
            .unwrap();

        let photo = db.get_photo_by_id("p1").unwrap().unwrap();
        assert_eq!(photo.tags, vec!["sunset", "friends"]);
    }

    #[test]
    fn test_photo_caption_and_thumbnail() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-15T12:00:00", None))
            .unwrap();

        db.update_photo_caption("p1", "A beautiful sunset").unwrap();
        db.update_photo_thumbnail("p1", "/thumbs/p1.jpg").unwrap();

        let photo = db.get_photo_by_id("p1").unwrap().unwrap();
        assert_eq!(photo.caption.as_deref(), Some("A beautiful sunset"));
        assert_eq!(photo.thumbnail_path.as_deref(), Some("/thumbs/p1.jpg"));
    }

    #[test]
    fn test_photo_world_update() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-15T12:00:00", None))
            .unwrap();

        db.update_photo_world("p1", "My World", "wrld_abc").unwrap();
        let photo = db.get_photo_by_id("p1").unwrap().unwrap();
        assert_eq!(photo.world_name.as_deref(), Some("My World"));
        assert_eq!(photo.world_id.as_deref(), Some("wrld_abc"));
    }

    #[test]
    fn test_search_photos() {
        let db = test_db();
        let mut p1 = make_photo("p1", "2025-06-15T12:00:00", Some("Cherry Blossom"));
        p1.caption = Some("sakura trees".to_string());
        db.insert_photo(&p1).unwrap();
        db.insert_photo(&make_photo("p2", "2025-06-16T12:00:00", Some("Ocean View")))
            .unwrap();

        let (results, total) = db.search_photos_by_text("Cherry", 10).unwrap();
        assert_eq!(total, 1);
        assert_eq!(results[0].id, "p1");

        let (results, _) = db.search_photos_by_text("sakura", 10).unwrap();
        assert_eq!(results.len(), 1);

        let (results, _) = db.search_photos_by_text("nonexistent", 10).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_filter_photos() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-10T12:00:00", Some("WorldA")))
            .unwrap();
        db.insert_photo(&make_photo("p2", "2025-06-15T12:00:00", Some("WorldB")))
            .unwrap();
        db.insert_photo(&make_photo("p3", "2025-06-20T12:00:00", Some("WorldA")))
            .unwrap();

        // Filter by world
        let (results, total) = db.filter_photos(Some("WorldA"), None, None, 0, 100).unwrap();
        assert_eq!(total, 2);
        assert_eq!(results.len(), 2);

        // Filter by date range
        let (results, total) = db
            .filter_photos(None, Some("2025-06-12"), Some("2025-06-18"), 0, 100)
            .unwrap();
        assert_eq!(total, 1);
        assert_eq!(results[0].id, "p2");

        // Filter by world + date
        let (results, total) = db
            .filter_photos(Some("WorldA"), Some("2025-06-15"), None, 0, 100)
            .unwrap();
        assert_eq!(total, 1);
        assert_eq!(results[0].id, "p3");

        // No filters returns all
        let (_, total) = db.filter_photos(None, None, None, 0, 100).unwrap();
        assert_eq!(total, 3);
    }

    #[test]
    fn test_get_world_names() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-10T12:00:00", Some("WorldB")))
            .unwrap();
        db.insert_photo(&make_photo("p2", "2025-06-15T12:00:00", Some("WorldA")))
            .unwrap();
        db.insert_photo(&make_photo("p3", "2025-06-20T12:00:00", Some("WorldB")))
            .unwrap();
        db.insert_photo(&make_photo("p4", "2025-06-20T12:00:00", None))
            .unwrap();

        let names = db.get_world_names().unwrap();
        assert_eq!(names, vec!["WorldA", "WorldB"]);
    }

    #[test]
    fn test_photo_stats() {
        let db = test_db();
        let mut p1 = make_photo("p1", "2025-06-10T12:00:00", Some("World"));
        p1.caption = Some("caption".to_string());
        p1.thumbnail_path = Some("/thumb.jpg".to_string());
        db.insert_photo(&p1).unwrap();
        db.insert_photo(&make_photo("p2", "2025-06-15T12:00:00", None))
            .unwrap();

        let stats = db.get_photo_stats().unwrap();
        assert_eq!(stats.total, 2);
        assert_eq!(stats.with_caption, 1);
        assert_eq!(stats.with_world, 1);
        assert_eq!(stats.with_thumbnail, 1);
    }

    #[test]
    fn test_album_crud() {
        let db = test_db();
        let album = Album {
            id: "a1".to_string(),
            name: "Vacation".to_string(),
            description: Some("Summer trip".to_string()),
            photo_count: 0,
            cover_photo: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
        };
        db.create_album(&album).unwrap();

        let albums = db.get_albums().unwrap();
        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].name, "Vacation");
        assert_eq!(albums[0].description.as_deref(), Some("Summer trip"));

        db.update_album("a1", "Holiday", Some("Winter trip")).unwrap();
        let albums = db.get_albums().unwrap();
        assert_eq!(albums[0].name, "Holiday");

        db.delete_album("a1").unwrap();
        let albums = db.get_albums().unwrap();
        assert_eq!(albums.len(), 0);
    }

    #[test]
    fn test_album_photos() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-10T12:00:00", None))
            .unwrap();
        db.insert_photo(&make_photo("p2", "2025-06-15T12:00:00", None))
            .unwrap();

        let album = Album {
            id: "a1".to_string(),
            name: "Test".to_string(),
            description: None,
            photo_count: 0,
            cover_photo: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
        };
        db.create_album(&album).unwrap();

        let added = db
            .add_photos_to_album("a1", &["p1".to_string(), "p2".to_string()])
            .unwrap();
        assert_eq!(added, 2);

        // Duplicate add should not increase count
        let added = db
            .add_photos_to_album("a1", &["p1".to_string()])
            .unwrap();
        assert_eq!(added, 0);

        let (photos, total) = db.get_album_photos("a1").unwrap();
        assert_eq!(total, 2);
        assert_eq!(photos.len(), 2);

        let removed = db
            .remove_photos_from_album("a1", &["p1".to_string()])
            .unwrap();
        assert_eq!(removed, 1);

        let (_, total) = db.get_album_photos("a1").unwrap();
        assert_eq!(total, 1);
    }

    #[test]
    fn test_world_visit_crud() {
        let db = test_db();
        let visit = WorldVisit {
            id: "w1".to_string(),
            world_name: "Cool World".to_string(),
            world_id: "wrld_123".to_string(),
            entered_at: "2025-06-10T12:00:00Z".to_string(),
            left_at: Some("2025-06-10T13:00:00Z".to_string()),
            players: vec!["Player1".to_string(), "Player2".to_string()],
            instance_type: "friends".to_string(),
            rating: None,
            notes: None,
        };
        db.insert_world_visit(&visit).unwrap();

        let history = db.get_world_history().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].world_name, "Cool World");
        assert_eq!(history[0].players.len(), 2);

        db.update_world_visit_rating("w1", Some(5)).unwrap();
        db.update_world_visit_notes("w1", Some("Great place!")).unwrap();

        let history = db.get_world_history().unwrap();
        assert_eq!(history[0].rating, Some(5));
        assert_eq!(history[0].notes.as_deref(), Some("Great place!"));

        // Clear rating
        db.update_world_visit_rating("w1", None).unwrap();
        let history = db.get_world_history().unwrap();
        assert_eq!(history[0].rating, None);
    }

    #[test]
    fn test_friend_crud() {
        let db = test_db();
        let friend = Friend {
            id: "f1".to_string(),
            name: "TestFriend".to_string(),
            notes: None,
            avatars: vec![],
            created_at: "2025-01-01T00:00:00Z".to_string(),
        };
        db.insert_friend(&friend).unwrap();

        let friends = db.get_friends().unwrap();
        assert_eq!(friends.len(), 1);
        assert_eq!(friends[0].name, "TestFriend");

        db.update_friend_name("f1", "NewName").unwrap();
        db.update_friend_notes("f1", Some("Best friend")).unwrap();

        let friends = db.get_friends().unwrap();
        assert_eq!(friends[0].name, "NewName");
        assert_eq!(friends[0].notes.as_deref(), Some("Best friend"));

        db.delete_friend("f1").unwrap();
        let friends = db.get_friends().unwrap();
        assert_eq!(friends.len(), 0);
    }

    #[test]
    fn test_settings() {
        let db = test_db();

        // Default settings
        let settings = db.get_settings().unwrap();
        assert_eq!(settings.photo_folder, "");
        assert_eq!(settings.theme, "dark");
        assert!(settings.gpu_enabled);

        db.set_setting("photo_folder", "/pictures/vrchat").unwrap();
        db.set_setting("theme", "light").unwrap();
        db.set_setting("gpu_enabled", "false").unwrap();

        let settings = db.get_settings().unwrap();
        assert_eq!(settings.photo_folder, "/pictures/vrchat");
        assert_eq!(settings.theme, "light");
        assert!(!settings.gpu_enabled);

        // Overwrite setting
        db.set_setting("theme", "dark").unwrap();
        let settings = db.get_settings().unwrap();
        assert_eq!(settings.theme, "dark");
    }

    #[test]
    fn test_photos_without_caption() {
        let db = test_db();
        db.insert_photo(&make_photo("p1", "2025-06-10T12:00:00", None))
            .unwrap();
        let mut p2 = make_photo("p2", "2025-06-15T12:00:00", None);
        p2.caption = Some("has caption".to_string());
        db.insert_photo(&p2).unwrap();
        db.insert_photo(&make_photo("p3", "2025-06-20T12:00:00", None))
            .unwrap();

        let without = db.get_photos_without_caption(10).unwrap();
        assert_eq!(without.len(), 2);
        // Should be ordered by datetime DESC
        assert_eq!(without[0].id, "p3");
        assert_eq!(without[1].id, "p1");
    }

    #[test]
    fn test_world_history_filtered() {
        let db = test_db();
        let visits = vec![
            WorldVisit {
                id: "w1".to_string(),
                world_name: "WorldA".to_string(),
                world_id: "wrld_a".to_string(),
                entered_at: "2025-06-10T12:00:00Z".to_string(),
                left_at: None,
                players: vec![],
                instance_type: "friends".to_string(),
                rating: None,
                notes: None,
            },
            WorldVisit {
                id: "w2".to_string(),
                world_name: "WorldB".to_string(),
                world_id: "wrld_b".to_string(),
                entered_at: "2025-06-15T12:00:00Z".to_string(),
                left_at: None,
                players: vec![],
                instance_type: "public".to_string(),
                rating: None,
                notes: None,
            },
            WorldVisit {
                id: "w3".to_string(),
                world_name: "WorldC".to_string(),
                world_id: "wrld_c".to_string(),
                entered_at: "2025-06-20T12:00:00Z".to_string(),
                left_at: None,
                players: vec![],
                instance_type: "friends".to_string(),
                rating: None,
                notes: None,
            },
        ];
        for v in &visits {
            db.insert_world_visit(v).unwrap();
        }

        // No filter
        let result = db.get_world_history_filtered(None, None).unwrap();
        assert_eq!(result.len(), 3);

        // Filter from date
        let result = db
            .get_world_history_filtered(Some("2025-06-14"), None)
            .unwrap();
        assert_eq!(result.len(), 2);

        // Filter to date
        let result = db
            .get_world_history_filtered(None, Some("2025-06-16"))
            .unwrap();
        assert_eq!(result.len(), 2);

        // Filter date range
        let result = db
            .get_world_history_filtered(Some("2025-06-12"), Some("2025-06-18"))
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "w2");
    }

    #[test]
    fn test_export_import_data() {
        let db = test_db();

        // Set up data
        let friend = Friend {
            id: "f1".to_string(),
            name: "ExportFriend".to_string(),
            notes: Some("notes".to_string()),
            avatars: vec![],
            created_at: "2025-01-01T00:00:00Z".to_string(),
        };
        db.insert_friend(&friend).unwrap();

        let visit = WorldVisit {
            id: "w1".to_string(),
            world_name: "ExportWorld".to_string(),
            world_id: "wrld_export".to_string(),
            entered_at: "2025-06-10T12:00:00Z".to_string(),
            left_at: None,
            players: vec!["Player1".to_string()],
            instance_type: "friends".to_string(),
            rating: Some(4),
            notes: None,
        };
        db.insert_world_visit(&visit).unwrap();

        let album = Album {
            id: "a1".to_string(),
            name: "ExportAlbum".to_string(),
            description: None,
            photo_count: 0,
            cover_photo: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
        };
        db.create_album(&album).unwrap();

        // Export
        let export = db.export_all_data().unwrap();
        assert_eq!(export.version, "1.0");
        assert_eq!(export.friends.len(), 1);
        assert_eq!(export.world_visits.len(), 1);
        assert_eq!(export.albums.len(), 1);
        assert_eq!(export.friends[0].name, "ExportFriend");
        assert_eq!(export.world_visits[0].rating, Some(4));

        // Import into fresh DB
        let db2 = test_db();
        let stats = db2.import_data(&export).unwrap();
        assert_eq!(stats.friends_imported, 1);
        assert_eq!(stats.world_visits_imported, 1);
        assert_eq!(stats.albums_imported, 1);

        // Verify imported data
        let friends = db2.get_friends().unwrap();
        assert_eq!(friends.len(), 1);
        assert_eq!(friends[0].name, "ExportFriend");

        let history = db2.get_world_history().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].rating, Some(4));

        // Re-import should not duplicate (INSERT OR IGNORE)
        let stats2 = db2.import_data(&export).unwrap();
        assert_eq!(stats2.friends_imported, 0);
        assert_eq!(stats2.world_visits_imported, 0);
        assert_eq!(stats2.albums_imported, 0);
    }
}
