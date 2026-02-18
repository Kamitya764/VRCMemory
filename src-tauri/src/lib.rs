mod commands;
mod db;
mod error;
mod indexer;
mod models;
mod vrchat_log;
mod watcher;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

use crate::watcher::{FileEvent, FolderWatcher};

/// Managed state for the folder watcher
pub struct WatcherState(pub Mutex<Option<FolderWatcher>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            let db_path = app_data_dir.join("vrcmemory.db");
            let database = db::Database::new(&db_path).expect("failed to initialize database");
            app.manage(db::DbState(std::sync::Mutex::new(database)));

            // Initialize indexer state
            app.manage(indexer::IndexerState::new());

            // Initialize watcher state (starts empty, activated after settings are loaded)
            app.manage(WatcherState(Mutex::new(None)));

            // Start watcher if settings already have folders configured
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_watcher_from_settings(&handle);
            });

            log::info!("VRCMemory initialized. DB at {:?}", db_path);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_photos,
            commands::search_photos,
            commands::get_photo_detail,
            commands::get_world_history,
            commands::get_friends,
            commands::add_friend,
            commands::delete_friend,
            commands::get_settings,
            commands::update_settings,
            commands::start_indexing,
            commands::get_indexing_status,
            commands::scan_photos,
            commands::parse_logs,
            commands::select_folder,
            commands::start_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Start the folder watcher based on current settings
fn start_watcher_from_settings(handle: &tauri::AppHandle) {
    let db_state = handle.state::<db::DbState>();
    let settings = {
        let db = match db_state.0.lock() {
            Ok(db) => db,
            Err(_) => return,
        };
        match db.get_settings() {
            Ok(s) => s,
            Err(_) => return,
        }
    };

    let mut paths = Vec::new();
    if !settings.photo_folder.is_empty() {
        let p = PathBuf::from(&settings.photo_folder);
        if p.exists() {
            paths.push(p);
        }
    }
    if !settings.log_folder.is_empty() {
        let p = PathBuf::from(&settings.log_folder);
        if p.exists() {
            paths.push(p);
        }
    }

    if paths.is_empty() {
        log::info!("No folders configured, skipping watcher");
        return;
    }

    match FolderWatcher::new(&paths) {
        Ok(fw) => {
            let watcher_state = handle.state::<WatcherState>();
            if let Ok(mut guard) = watcher_state.0.lock() {
                *guard = Some(fw);
            }
            log::info!("Folder watcher started for {} paths", paths.len());

            // Start polling loop
            let handle_clone = handle.clone();
            tauri::async_runtime::spawn(async move {
                watcher_poll_loop(handle_clone).await;
            });
        }
        Err(e) => {
            log::error!("Failed to start watcher: {}", e);
        }
    }
}

/// Poll the watcher for new events and process them
async fn watcher_poll_loop(handle: tauri::AppHandle) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let events = {
            let watcher_state = handle.state::<WatcherState>();
            let guard = match watcher_state.0.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };
            match guard.as_ref() {
                Some(w) => w.poll_events(),
                None => break, // Watcher removed
            }
        };

        if events.is_empty() {
            continue;
        }

        let mut new_photos = 0;
        let mut log_changed = false;

        let db_state = handle.state::<db::DbState>();
        for event in &events {
            match event {
                FileEvent::NewPhoto(path) => {
                    if let Ok(db) = db_state.0.lock() {
                        let filepath_str = path.to_string_lossy().to_string();
                        if let Ok(false) = db.photo_exists(&filepath_str) {
                            if indexer::index_photo(&db, path).is_ok() {
                                new_photos += 1;
                            }
                        }
                    }
                }
                FileEvent::LogUpdated(_) => {
                    log_changed = true;
                }
            }
        }

        if new_photos > 0 {
            log::info!("Watcher: indexed {} new photos", new_photos);
            let _ = handle.emit("photos-updated", new_photos);
        }
        if log_changed {
            log::info!("Watcher: log file changed");
            let _ = handle.emit("logs-updated", ());
        }
    }
}
