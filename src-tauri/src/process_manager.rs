use std::process::Child;
use std::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::setup::RuntimePaths;

/// Manages the lifecycle of Meilisearch and Python sidecar processes.
/// Both are killed when the manager is dropped (app exit).
pub struct ProcessManager {
    pub meilisearch: Mutex<Option<Child>>,
    pub python_sidecar: Mutex<Option<Child>>,
    pub paths: Mutex<Option<RuntimePaths>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            meilisearch: Mutex::new(None),
            python_sidecar: Mutex::new(None),
            paths: Mutex::new(None),
        }
    }

    /// Store the runtime paths so we can start processes later.
    pub fn set_paths(&self, paths: RuntimePaths) {
        if let Ok(mut guard) = self.paths.lock() {
            *guard = Some(paths);
        }
    }

    /// Start the Meilisearch process if it's not already running.
    pub fn start_meilisearch(&self) -> AppResult<()> {
        let paths = self
            .paths
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .ok_or_else(|| AppError::Setup("Runtime paths not configured".to_string()))?;

        if !paths.meilisearch_installed() {
            return Err(AppError::Setup("Meilisearchがインストールされていません".to_string()));
        }

        // Check if already running
        if let Ok(guard) = self.meilisearch.lock() {
            if guard.is_some() {
                return Ok(());
            }
        }

        std::fs::create_dir_all(&paths.meilisearch_data_dir).ok();

        let child = std::process::Command::new(&paths.meilisearch_exe)
            .arg("--db-path")
            .arg(&paths.meilisearch_data_dir)
            .arg("--http-addr")
            .arg("127.0.0.1:7700")
            .arg("--no-analytics")
            .arg("--env")
            .arg("development")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::Setup(format!("Meilisearch起動失敗: {}", e)))?;

        log::info!("Meilisearch started (PID: {})", child.id());

        if let Ok(mut guard) = self.meilisearch.lock() {
            *guard = Some(child);
        }

        Ok(())
    }

    /// Start the Python FastAPI sidecar process.
    pub fn start_python_sidecar(&self) -> AppResult<()> {
        let paths = self
            .paths
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .ok_or_else(|| AppError::Setup("Runtime paths not configured".to_string()))?;

        if !paths.python_installed() {
            return Err(AppError::Setup("Pythonがインストールされていません".to_string()));
        }

        // Check if already running
        if let Ok(guard) = self.python_sidecar.lock() {
            if guard.is_some() {
                return Ok(());
            }
        }

        let main_py = paths.sidecar_dir.join("main.py");
        if !main_py.exists() {
            return Err(AppError::Setup(format!(
                "Python sidecar main.py not found at {:?}",
                main_py
            )));
        }

        let mut cmd = std::process::Command::new(&paths.python_exe);
        cmd.arg(&main_py)
            .current_dir(&paths.sidecar_dir)
            .env("VRCMEMORY_ENV", "production")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());

        // On Windows with embedded Python, ensure the embedded Lib/site-packages is on PYTHONPATH
        if cfg!(target_os = "windows") {
            let site_packages = paths.python_dir.join("Lib").join("site-packages");
            cmd.env("PYTHONPATH", &site_packages);
        }

        let child = cmd
            .spawn()
            .map_err(|e| AppError::Setup(format!("Python sidecar起動失敗: {}", e)))?;

        log::info!("Python sidecar started (PID: {})", child.id());

        if let Ok(mut guard) = self.python_sidecar.lock() {
            *guard = Some(child);
        }

        Ok(())
    }

    /// Start both services if the environment is ready.
    pub fn start_all_if_ready(&self) -> AppResult<()> {
        let paths = self
            .paths
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .ok_or_else(|| AppError::Setup("Runtime paths not configured".to_string()))?;

        let status = crate::setup::check_status(&paths);
        if !status.all_ready {
            log::info!("Environment not fully set up, skipping auto-start of services");
            return Ok(());
        }

        if let Err(e) = self.start_meilisearch() {
            log::warn!("Failed to start Meilisearch: {}", e);
        }

        // Give Meilisearch a moment to bind its port
        std::thread::sleep(std::time::Duration::from_millis(500));

        if let Err(e) = self.start_python_sidecar() {
            log::warn!("Failed to start Python sidecar: {}", e);
        }

        Ok(())
    }

    /// Stop all managed processes gracefully.
    pub fn stop_all(&self) {
        self.stop_process("Python sidecar", &self.python_sidecar);
        self.stop_process("Meilisearch", &self.meilisearch);
    }

    fn stop_process(&self, name: &str, process: &Mutex<Option<Child>>) {
        if let Ok(mut guard) = process.lock() {
            if let Some(mut child) = guard.take() {
                log::info!("Stopping {} (PID: {})", name, child.id());
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    /// Check if the Python sidecar process is still running.
    pub fn is_python_running(&self) -> bool {
        if let Ok(mut guard) = self.python_sidecar.lock() {
            if let Some(ref mut child) = *guard {
                match child.try_wait() {
                    Ok(None) => return true,   // Still running
                    Ok(Some(_)) => {
                        // Process exited
                        *guard = None;
                        return false;
                    }
                    Err(_) => return false,
                }
            }
        }
        false
    }

    /// Check if Meilisearch process is still running.
    pub fn is_meilisearch_running(&self) -> bool {
        if let Ok(mut guard) = self.meilisearch.lock() {
            if let Some(ref mut child) = *guard {
                match child.try_wait() {
                    Ok(None) => return true,
                    Ok(Some(_)) => {
                        *guard = None;
                        return false;
                    }
                    Err(_) => return false,
                }
            }
        }
        false
    }
}

impl Drop for ProcessManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}
