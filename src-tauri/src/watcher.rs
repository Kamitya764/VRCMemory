use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc;

use crate::error::AppResult;

/// File system watcher for VRChat photo and log directories
pub struct FolderWatcher {
    _watcher: RecommendedWatcher,
    receiver: mpsc::Receiver<notify::Result<Event>>,
}

impl FolderWatcher {
    /// Create a new folder watcher for the given paths
    pub fn new(paths: &[PathBuf]) -> AppResult<Self> {
        let (tx, rx) = mpsc::channel();

        let mut watcher = notify::recommended_watcher(tx)
            .map_err(|e| crate::error::AppError::Parse(e.to_string()))?;

        for path in paths {
            if path.exists() {
                watcher
                    .watch(path, RecursiveMode::Recursive)
                    .map_err(|e| crate::error::AppError::Parse(e.to_string()))?;
                log::info!("Watching folder: {:?}", path);
            } else {
                log::warn!("Folder does not exist, skipping: {:?}", path);
            }
        }

        Ok(Self {
            _watcher: watcher,
            receiver: rx,
        })
    }

    /// Check for new file events (non-blocking)
    pub fn poll_events(&self) -> Vec<FileEvent> {
        let mut events = Vec::new();

        while let Ok(result) = self.receiver.try_recv() {
            if let Ok(event) = result {
                match event.kind {
                    EventKind::Create(_) => {
                        for path in &event.paths {
                            if Self::is_vrchat_photo(path) {
                                events.push(FileEvent::NewPhoto(path.clone()));
                            } else if Self::is_vrchat_log(path) {
                                events.push(FileEvent::LogUpdated(path.clone()));
                            }
                        }
                    }
                    EventKind::Modify(_) => {
                        for path in &event.paths {
                            if Self::is_vrchat_log(path) {
                                events.push(FileEvent::LogUpdated(path.clone()));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        events
    }

    fn is_vrchat_photo(path: &Path) -> bool {
        path.extension()
            .map(|ext| ext == "png" || ext == "jpg" || ext == "jpeg")
            .unwrap_or(false)
    }

    fn is_vrchat_log(path: &Path) -> bool {
        path.file_name()
            .map(|name| {
                let name = name.to_string_lossy();
                name.starts_with("output_log") && name.ends_with(".txt")
            })
            .unwrap_or(false)
    }
}

#[derive(Debug)]
pub enum FileEvent {
    NewPhoto(PathBuf),
    LogUpdated(PathBuf),
}
