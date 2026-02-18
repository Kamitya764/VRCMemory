use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

use crate::error::AppResult;
use crate::models::{Album, AppSettings, Friend, Photo, WorldVisit};

pub struct DbState(pub Mutex<Database>);

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
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
                notes TEXT
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

            CREATE INDEX IF NOT EXISTS idx_photos_datetime ON photos(datetime);
            CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
            CREATE INDEX IF NOT EXISTS idx_world_visits_entered ON world_visits(entered_at);
            CREATE INDEX IF NOT EXISTS idx_avatars_friend ON avatars(friend_id);
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
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, created_at
             FROM photos ORDER BY datetime DESC LIMIT ?1 OFFSET ?2",
        )?;

        let photos = stmt
            .query_map(params![limit, offset], |row| {
                let tags_str: String = row.get(6)?;
                let tags: Vec<String> =
                    serde_json::from_str(&tags_str).unwrap_or_default();
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
                    created_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    pub fn insert_photo(&self, photo: &Photo) -> AppResult<()> {
        let tags_json = serde_json::to_string(&photo.tags).unwrap_or_default();
        self.conn.execute(
            "INSERT OR IGNORE INTO photos (id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                photo.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_photo_by_id(&self, id: &str) -> AppResult<Option<Photo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, created_at
             FROM photos WHERE id = ?1",
        )?;

        let result = stmt
            .query_row(params![id], |row| {
                let tags_str: String = row.get(6)?;
                let tags: Vec<String> =
                    serde_json::from_str(&tags_str).unwrap_or_default();
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
                    created_at: row.get(9)?,
                })
            })
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
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, notes, created_at FROM friends ORDER BY name")?;

        let friends = stmt
            .query_map([], |row| {
                Ok(Friend {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    notes: row.get(2)?,
                    avatars: vec![],
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

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
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, created_at
             FROM photos WHERE caption IS NULL ORDER BY datetime DESC LIMIT ?1",
        )?;

        let photos = stmt
            .query_map(params![limit], |row| {
                let tags_str: String = row.get(6)?;
                let tags: Vec<String> =
                    serde_json::from_str(&tags_str).unwrap_or_default();
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
                    created_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(photos)
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
             world_name LIKE ?1 OR caption LIKE ?1 OR tags LIKE ?1 OR filename LIKE ?1",
            params![search_pattern],
            |row| row.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT id, filepath, filename, datetime, world_name, world_id, tags, caption, thumbnail_path, created_at
             FROM photos WHERE
             world_name LIKE ?1 OR caption LIKE ?1 OR tags LIKE ?1 OR filename LIKE ?1
             ORDER BY datetime DESC LIMIT ?2",
        )?;

        let photos = stmt
            .query_map(params![search_pattern, limit], |row| {
                let tags_str: String = row.get(6)?;
                let tags: Vec<String> =
                    serde_json::from_str(&tags_str).unwrap_or_default();
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
                    created_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    #[allow(dead_code)]
    pub fn get_photo_count(&self) -> AppResult<usize> {
        let count: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))?;
        Ok(count)
    }

    pub fn delete_photo(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM photos WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_photos(&self, ids: &[String]) -> AppResult<usize> {
        let mut deleted = 0;
        for id in ids {
            self.conn
                .execute("DELETE FROM photos WHERE id = ?1", params![id])?;
            deleted += 1;
        }
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
                    p.tags, p.caption, p.thumbnail_path, p.created_at
             FROM photos p
             JOIN album_photos ap ON ap.photo_id = p.id
             WHERE ap.album_id = ?1
             ORDER BY p.datetime DESC",
        )?;

        let photos = stmt
            .query_map(params![album_id], |row| {
                let tags_str: String = row.get(6)?;
                let tags: Vec<String> =
                    serde_json::from_str(&tags_str).unwrap_or_default();
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
                    created_at: row.get(9)?,
                })
            })?
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
        Ok(PhotoStats {
            total,
            with_caption,
            with_world,
            with_thumbnail,
        })
    }
}

/// Photo statistics for the analytics dashboard
#[derive(Debug, serde::Serialize)]
pub struct PhotoStats {
    pub total: usize,
    pub with_caption: usize,
    pub with_world: usize,
    pub with_thumbnail: usize,
}
