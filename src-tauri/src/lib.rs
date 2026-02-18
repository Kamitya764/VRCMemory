mod commands;
mod db;
mod error;
mod models;
mod vrchat_log;
mod watcher;

use tauri::Manager;

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
            commands::get_settings,
            commands::update_settings,
            commands::start_indexing,
            commands::get_indexing_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
