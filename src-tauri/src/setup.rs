use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};

// =============================================================================
// Platform-specific constants
// =============================================================================

#[cfg(target_os = "windows")]
mod platform {
    pub const PYTHON_EMBED_URL: &str =
        "https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip";
    pub const PYTHON_PTH_FILE: &str = "python312._pth";
    pub const PYTHON_EXE: &str = "python.exe";
    pub const MEILISEARCH_URL: &str = "https://github.com/meilisearch/meilisearch/releases/download/v1.12.3/meilisearch-windows-amd64.exe";
    pub const MEILISEARCH_BIN: &str = "meilisearch.exe";
    /// Windows uses the embeddable Python distribution (completely isolated)
    pub const USE_EMBED: bool = true;
}

#[cfg(target_os = "linux")]
mod platform {
    pub const PYTHON_EMBED_URL: &str = "";
    pub const PYTHON_PTH_FILE: &str = "";
    pub const PYTHON_EXE: &str = "bin/python3";
    pub const MEILISEARCH_URL: &str = "https://github.com/meilisearch/meilisearch/releases/download/v1.12.3/meilisearch-linux-amd64";
    pub const MEILISEARCH_BIN: &str = "meilisearch";
    /// Linux uses a venv created from system python3
    pub const USE_EMBED: bool = false;
}

#[cfg(target_os = "macos")]
mod platform {
    pub const PYTHON_EMBED_URL: &str = "";
    pub const PYTHON_PTH_FILE: &str = "";
    pub const PYTHON_EXE: &str = "bin/python3";
    pub const MEILISEARCH_URL: &str = "https://github.com/meilisearch/meilisearch/releases/download/v1.12.3/meilisearch-macos-amd64";
    pub const MEILISEARCH_BIN: &str = "meilisearch";
    /// macOS uses a venv created from system python3
    pub const USE_EMBED: bool = false;
}

const GET_PIP_URL: &str = "https://bootstrap.pypa.io/get-pip.py";

// =============================================================================
// Runtime paths
// =============================================================================

/// All paths needed by the runtime environment.
///
/// Layout under `{app_data}/`:
/// ```text
/// runtime/
///   python/            ← Embedded Python (Win) or venv (Linux/macOS)
///   meilisearch/
///     meilisearch(.exe)
///     data.ms/
/// ```
#[derive(Debug, Clone)]
pub struct RuntimePaths {
    pub runtime_dir: PathBuf,
    pub python_dir: PathBuf,
    pub python_exe: PathBuf,
    pub meilisearch_dir: PathBuf,
    pub meilisearch_exe: PathBuf,
    pub meilisearch_data_dir: PathBuf,
    pub sidecar_dir: PathBuf,
}

impl RuntimePaths {
    pub fn new(app_data_dir: &Path, sidecar_source: &Path) -> Self {
        let runtime_dir = app_data_dir.join("runtime");
        let python_dir = runtime_dir.join("python");
        let meilisearch_dir = runtime_dir.join("meilisearch");

        Self {
            python_exe: python_dir.join(platform::PYTHON_EXE),
            python_dir,
            meilisearch_exe: meilisearch_dir.join(platform::MEILISEARCH_BIN),
            meilisearch_data_dir: meilisearch_dir.join("data.ms"),
            meilisearch_dir,
            runtime_dir,
            sidecar_dir: sidecar_source.to_path_buf(),
        }
    }

    pub fn python_installed(&self) -> bool {
        self.python_exe.exists()
    }

    pub fn meilisearch_installed(&self) -> bool {
        self.meilisearch_exe.exists()
    }

    pub fn packages_installed(&self) -> bool {
        if cfg!(target_os = "windows") {
            // On Windows embed, site-packages is next to python.exe
            let sp = self.python_dir.join("Lib").join("site-packages");
            sp.join("fastapi").exists()
        } else {
            // In venv, site-packages is under lib/python3.*/site-packages
            let lib = self.python_dir.join("lib");
            if lib.exists() {
                if let Ok(entries) = fs::read_dir(&lib) {
                    for entry in entries.flatten() {
                        let sp = entry.path().join("site-packages").join("fastapi");
                        if sp.exists() {
                            return true;
                        }
                    }
                }
            }
            false
        }
    }
}

// =============================================================================
// Setup status
// =============================================================================

#[derive(Debug, serde::Serialize, Clone)]
pub struct SetupStatus {
    pub python_installed: bool,
    pub packages_installed: bool,
    pub meilisearch_installed: bool,
    pub all_ready: bool,
}

pub fn check_status(paths: &RuntimePaths) -> SetupStatus {
    let python_installed = paths.python_installed();
    let packages_installed = paths.packages_installed();
    let meilisearch_installed = paths.meilisearch_installed();

    SetupStatus {
        python_installed,
        packages_installed,
        meilisearch_installed,
        all_ready: python_installed && packages_installed && meilisearch_installed,
    }
}

// =============================================================================
// Progress events
// =============================================================================

#[derive(Debug, serde::Serialize, Clone)]
pub struct SetupProgress {
    pub step: String,
    pub progress: f32,
    pub message: String,
    pub is_error: bool,
}

fn emit_progress(app_handle: &AppHandle, step: &str, progress: f32, message: &str) {
    let _ = app_handle.emit(
        "setup-progress",
        SetupProgress {
            step: step.to_string(),
            progress,
            message: message.to_string(),
            is_error: false,
        },
    );
}

fn emit_error(app_handle: &AppHandle, step: &str, message: &str) {
    let _ = app_handle.emit(
        "setup-progress",
        SetupProgress {
            step: step.to_string(),
            progress: 0.0,
            message: message.to_string(),
            is_error: true,
        },
    );
}

// =============================================================================
// Full setup
// =============================================================================

/// Run the complete environment setup.
/// Emits `setup-progress` events throughout the process.
pub async fn run_full_setup(app_handle: &AppHandle, paths: &RuntimePaths) -> AppResult<()> {
    fs::create_dir_all(&paths.runtime_dir)?;
    fs::create_dir_all(&paths.python_dir)?;
    fs::create_dir_all(&paths.meilisearch_dir)?;

    let client = Client::new();

    // ── Step 1: Python ──────────────────────────────────────────────────
    if !paths.python_installed() {
        emit_progress(app_handle, "python", 0.0, "Python環境を準備中...");

        if platform::USE_EMBED {
            setup_python_embed(&client, app_handle, paths).await?;
        } else {
            setup_python_venv(app_handle, paths).await?;
        }
    }

    // ── Step 2: Meilisearch ─────────────────────────────────────────────
    if !paths.meilisearch_installed() {
        emit_progress(app_handle, "meilisearch", 0.0, "Meilisearchをダウンロード中...");
        download_meilisearch(&client, app_handle, paths).await?;
    }

    // ── Step 3: Python packages ─────────────────────────────────────────
    if !paths.packages_installed() {
        emit_progress(
            app_handle,
            "packages",
            0.0,
            "AIパッケージをインストール中...\n（初回は数分かかります）",
        );
        install_python_packages(app_handle, paths).await?;
    }

    emit_progress(app_handle, "complete", 1.0, "環境セットアップ完了！");
    Ok(())
}

// =============================================================================
// Python – Windows embeddable distribution
// =============================================================================

async fn setup_python_embed(
    client: &Client,
    app_handle: &AppHandle,
    paths: &RuntimePaths,
) -> AppResult<()> {
    let zip_path = paths.runtime_dir.join("python-embed.zip");

    // Download
    download_with_progress(
        client,
        platform::PYTHON_EMBED_URL,
        &zip_path,
        app_handle,
        "python",
        "Pythonをダウンロード中",
    )
    .await?;

    // Extract
    emit_progress(app_handle, "python", 0.9, "Pythonを展開中...");
    let python_dir = paths.python_dir.clone();
    let zip_file = zip_path.clone();
    tokio::task::spawn_blocking(move || extract_zip(&zip_file, &python_dir))
        .await
        .map_err(|e| AppError::Setup(format!("Extract task failed: {}", e)))??;

    // Configure ._pth file to enable site-packages
    configure_python_pth(paths)?;

    // Install pip
    emit_progress(app_handle, "python", 0.95, "pipをインストール中...");
    install_pip(client, paths).await?;

    // Clean up zip
    let _ = fs::remove_file(&zip_path);

    Ok(())
}

/// Modify the `python3XX._pth` file to enable `import site` and add
/// `Lib\site-packages` so that pip-installed packages are importable.
fn configure_python_pth(paths: &RuntimePaths) -> AppResult<()> {
    let pth_path = paths.python_dir.join(platform::PYTHON_PTH_FILE);
    if !pth_path.exists() {
        // Not an embed distribution or wrong version; skip
        return Ok(());
    }

    let content = fs::read_to_string(&pth_path)?;
    let mut lines: Vec<String> = content.lines().map(String::from).collect();

    // Uncomment `import site` if present
    for line in &mut lines {
        if line.trim() == "#import site" {
            *line = "import site".to_string();
        }
    }

    // Ensure Lib\site-packages is listed
    let sp = "Lib\\site-packages";
    if !lines.iter().any(|l| l.trim() == sp) {
        // Insert before `import site`
        let pos = lines.iter().position(|l| l.trim() == "import site");
        match pos {
            Some(i) => lines.insert(i, sp.to_string()),
            None => lines.push(sp.to_string()),
        }
    }

    fs::write(&pth_path, lines.join("\n"))?;
    Ok(())
}

/// Download `get-pip.py` and run it with the embedded Python.
async fn install_pip(client: &Client, paths: &RuntimePaths) -> AppResult<()> {
    let get_pip_path = paths.python_dir.join("get-pip.py");

    // Download get-pip.py
    let resp = client
        .get(GET_PIP_URL)
        .send()
        .await
        .map_err(|e| AppError::Setup(format!("Failed to download get-pip.py: {}", e)))?;
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Setup(format!("Failed to read get-pip.py: {}", e)))?;
    fs::write(&get_pip_path, &bytes)?;

    // Run get-pip.py
    let output = tokio::process::Command::new(&paths.python_exe)
        .current_dir(&paths.python_dir)
        .arg(&get_pip_path)
        .arg("--no-warn-script-location")
        .output()
        .await
        .map_err(|e| AppError::Setup(format!("Failed to run get-pip.py: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Setup(format!(
            "get-pip.py failed: {}",
            stderr.chars().take(500).collect::<String>()
        )));
    }

    let _ = fs::remove_file(&get_pip_path);
    Ok(())
}

// =============================================================================
// Python – Linux/macOS venv
// =============================================================================

async fn setup_python_venv(app_handle: &AppHandle, paths: &RuntimePaths) -> AppResult<()> {
    emit_progress(app_handle, "python", 0.1, "Python仮想環境を作成中...");

    // Find system python3
    let python3 = which_python3()?;

    // Create venv
    let output = tokio::process::Command::new(&python3)
        .args(["-m", "venv"])
        .arg(&paths.python_dir)
        .output()
        .await
        .map_err(|e| AppError::Setup(format!("Failed to create venv: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Setup(format!(
            "venv creation failed: {}",
            stderr.chars().take(500).collect::<String>()
        )));
    }

    // Upgrade pip inside venv
    emit_progress(app_handle, "python", 0.5, "pipを更新中...");
    let output = tokio::process::Command::new(&paths.python_exe)
        .args(["-m", "pip", "install", "--upgrade", "pip"])
        .output()
        .await
        .map_err(|e| AppError::Setup(format!("pip upgrade failed: {}", e)))?;

    if !output.status.success() {
        log::warn!(
            "pip upgrade warning: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    Ok(())
}

/// Locate `python3` on the system PATH.
fn which_python3() -> AppResult<PathBuf> {
    for name in &["python3", "python"] {
        if let Ok(output) = std::process::Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(PathBuf::from(path));
                }
            }
        }
    }
    Err(AppError::Setup(
        "Python3がシステムに見つかりません。Python 3.10以上をインストールしてください。".to_string(),
    ))
}

// =============================================================================
// Meilisearch
// =============================================================================

async fn download_meilisearch(
    client: &Client,
    app_handle: &AppHandle,
    paths: &RuntimePaths,
) -> AppResult<()> {
    download_with_progress(
        client,
        platform::MEILISEARCH_URL,
        &paths.meilisearch_exe,
        app_handle,
        "meilisearch",
        "Meilisearchをダウンロード中",
    )
    .await?;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&paths.meilisearch_exe)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&paths.meilisearch_exe, perms)?;
    }

    Ok(())
}

// =============================================================================
// Python packages
// =============================================================================

async fn install_python_packages(
    app_handle: &AppHandle,
    paths: &RuntimePaths,
) -> AppResult<()> {
    let requirements = paths.sidecar_dir.join("requirements.txt");
    if !requirements.exists() {
        return Err(AppError::Setup(format!(
            "requirements.txt not found at {:?}",
            requirements
        )));
    }

    emit_progress(
        app_handle,
        "packages",
        0.1,
        "AIパッケージをインストール中...\n（PyTorch等の大容量パッケージを含みます）",
    );

    let mut cmd = tokio::process::Command::new(&paths.python_exe);
    cmd.args([
        "-m",
        "pip",
        "install",
        "-r",
    ])
    .arg(&requirements)
    .args(["--no-warn-script-location", "--progress-bar", "off"]);

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Setup(format!("pip install failed to start: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.chars().take(800).collect::<String>();
        emit_error(app_handle, "packages", &format!("インストール失敗: {}", msg));
        return Err(AppError::Setup(format!("pip install failed: {}", msg)));
    }

    emit_progress(app_handle, "packages", 1.0, "パッケージインストール完了");
    Ok(())
}

// =============================================================================
// Utility: download with progress
// =============================================================================

async fn download_with_progress(
    client: &Client,
    url: &str,
    dest: &Path,
    app_handle: &AppHandle,
    step: &str,
    message_prefix: &str,
) -> AppResult<()> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Setup(format!("Download failed ({}): {}", url, e)))?;

    if !response.status().is_success() {
        return Err(AppError::Setup(format!(
            "Download returned HTTP {}: {}",
            response.status(),
            url
        )));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(dest)?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| AppError::Setup(format!("Download stream error: {}", e)))?;
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = downloaded as f32 / total_size as f32;
            let mb_dl = downloaded / (1024 * 1024);
            let mb_total = total_size / (1024 * 1024);
            emit_progress(
                app_handle,
                step,
                progress,
                &format!("{}... ({}/{} MB)", message_prefix, mb_dl, mb_total),
            );
        }
    }

    Ok(())
}

// =============================================================================
// Utility: extract zip
// =============================================================================

fn extract_zip(zip_path: &Path, dest_dir: &Path) -> AppResult<()> {
    let file = fs::File::open(zip_path)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| AppError::Setup(format!("Invalid zip: {}", e)))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Setup(format!("Zip entry error: {}", e)))?;

        let out_path = dest_dir.join(
            entry
                .enclosed_name()
                .ok_or_else(|| AppError::Setup("Invalid zip entry name".to_string()))?,
        );

        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut outfile = fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }

    Ok(())
}

/// Get the path to the python-sidecar source directory.
/// In dev mode: the project's python-sidecar/ folder.
/// In production: bundled as a Tauri resource.
pub fn resolve_sidecar_dir(app_handle: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        // Dev mode: relative to Cargo manifest
        let manifest = env!("CARGO_MANIFEST_DIR");
        PathBuf::from(manifest)
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("python-sidecar")
    } else {
        // Production: bundled resource
        app_handle
            .path()
            .resource_dir()
            .unwrap_or_else(|_| app_handle.path().app_data_dir().unwrap_or_default())
            .join("python-sidecar")
    }
}
