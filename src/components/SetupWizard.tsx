import { useState, useEffect } from "react";
import {
  updateSettings,
  scanPhotos,
  parseLogs,
  getSetupStatus,
  runEnvironmentSetup,
} from "@/lib/api";
import type { SetupStatus } from "@/lib/api";
import { listen } from "@tauri-apps/api/event";

interface SetupWizardProps {
  onComplete: () => void;
}

type Step =
  | "welcome"
  | "environment"
  | "photo_folder"
  | "log_folder"
  | "indexing"
  | "done";

interface SetupProgressEvent {
  step: string;
  progress: number;
  message: string;
  is_error: boolean;
}

function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [photoFolder, setPhotoFolder] = useState("");
  const [logFolder, setLogFolder] = useState("");
  const [indexingProgress, setIndexingProgress] = useState({
    status: "",
    photosFound: 0,
    worldsFound: 0,
  });
  const [error, setError] = useState<string | null>(null);

  // Environment setup state
  const [envStatus, setEnvStatus] = useState<SetupStatus | null>(null);
  const [envProgress, setEnvProgress] = useState<SetupProgressEvent | null>(
    null,
  );
  const [envSetupRunning, setEnvSetupRunning] = useState(false);

  // Check environment on mount
  useEffect(() => {
    getSetupStatus()
      .then(setEnvStatus)
      .catch(() => {});
  }, []);

  // Listen for setup progress events
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<SetupProgressEvent>("setup-progress", (event) => {
      if (cancelled) return;
      setEnvProgress(event.payload);
      if (event.payload.is_error) {
        setError(event.payload.message);
        setEnvSetupRunning(false);
      }
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleStartSetup = async () => {
    // If environment is already ready, skip to folder setup
    if (envStatus?.all_ready) {
      setStep("photo_folder");
      return;
    }
    setStep("environment");
  };

  const handleRunEnvSetup = async () => {
    setError(null);
    setEnvSetupRunning(true);
    try {
      await runEnvironmentSetup();
      // Refresh status
      const status = await getSetupStatus();
      setEnvStatus(status);
      setEnvSetupRunning(false);
      setStep("photo_folder");
    } catch (err) {
      setError(String(err));
      setEnvSetupRunning(false);
    }
  };

  const handleSkipEnvSetup = () => {
    setStep("photo_folder");
  };

  const handleSetPhotoFolder = async () => {
    if (!photoFolder.trim()) {
      setError("フォルダパスを入力してください");
      return;
    }
    setError(null);
    try {
      await updateSettings({ photo_folder: photoFolder });
      setStep("log_folder");
    } catch (err) {
      setError(`設定の保存に失敗しました: ${String(err)}`);
    }
  };

  const handleSetLogFolder = async () => {
    if (!logFolder.trim()) {
      setError("フォルダパスを入力してください");
      return;
    }
    setError(null);
    try {
      await updateSettings({ log_folder: logFolder });
      setStep("indexing");
      startIndexingProcess();
    } catch (err) {
      setError(`設定の保存に失敗しました: ${String(err)}`);
    }
  };

  const startIndexingProcess = async () => {
    try {
      setIndexingProgress({
        status: "写真をスキャン中...",
        photosFound: 0,
        worldsFound: 0,
      });

      const photosFound = await scanPhotos(photoFolder);
      setIndexingProgress((prev) => ({
        ...prev,
        status: "VRChatログを解析中...",
        photosFound,
      }));

      const worldsFound = await parseLogs(logFolder);
      setIndexingProgress({
        status: "完了",
        photosFound,
        worldsFound,
      });

      setStep("done");
    } catch (err) {
      setError(String(err));
      setStep("done");
    }
  };

  const handleSkipLogs = async () => {
    setError(null);
    try {
      await updateSettings({ log_folder: "" });
    } catch (err) {
      setError(`設定の保存に失敗しました: ${String(err)}`);
      return;
    }
    setStep("indexing");

    try {
      setIndexingProgress({
        status: "写真をスキャン中...",
        photosFound: 0,
        worldsFound: 0,
      });

      const photosFound = await scanPhotos(photoFolder);
      setIndexingProgress({
        status: "完了",
        photosFound,
        worldsFound: 0,
      });

      setStep("done");
    } catch (err) {
      setError(String(err));
      setStep("done");
    }
  };

  // ──────────────────────────────────────────────────────────────────
  // Helper to render a progress step indicator
  // ──────────────────────────────────────────────────────────────────

  const renderEnvStepIcon = (done: boolean | undefined, active: boolean) => {
    if (done) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-success)]/20 text-[var(--color-success)] text-xs">
          ✓
        </span>
      );
    }
    if (active) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)]/20">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
        </span>
      );
    }
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-border)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" />
      </span>
    );
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        {/* ── Welcome ──────────────────────────────────────────────── */}
        {step === "welcome" && (
          <div className="space-y-6 text-center">
            <h2 className="text-2xl font-bold">VRCMemory へようこそ</h2>
            <p className="text-[var(--color-text-muted)]">
              VRChatの写真とログを自動で整理し、
              <br />
              AIで簡単に検索できるようにします。
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              必要な環境は自動でセットアップされます。
              <br />
              既存のPython環境には影響しません。
            </p>
            <button
              onClick={handleStartSetup}
              className="rounded-lg bg-[var(--color-primary)] px-8 py-2.5 font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              セットアップを開始
            </button>
          </div>
        )}

        {/* ── Environment Setup ────────────────────────────────────── */}
        {step === "environment" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">AI環境セットアップ</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                AI検索に必要なコンポーネントをインストールします。
                <br />
                アプリ専用の隔離環境に配置するため、PCの既存環境には影響しません。
              </p>
            </div>

            {/* Status checklist */}
            <div className="space-y-3 rounded-lg bg-[var(--color-bg)] p-4">
              <div className="flex items-center gap-3">
                {renderEnvStepIcon(
                  envStatus?.python_installed,
                  envSetupRunning && envProgress?.step === "python",
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Python（組み込み版）
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    システムPythonとは完全に分離
                  </p>
                </div>
                {envStatus?.python_installed && (
                  <span className="text-xs text-[var(--color-success)]">
                    インストール済み
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {renderEnvStepIcon(
                  envStatus?.meilisearch_installed,
                  envSetupRunning && envProgress?.step === "meilisearch",
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">Meilisearch</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    全文検索エンジン
                  </p>
                </div>
                {envStatus?.meilisearch_installed && (
                  <span className="text-xs text-[var(--color-success)]">
                    インストール済み
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {renderEnvStepIcon(
                  envStatus?.packages_installed,
                  envSetupRunning && envProgress?.step === "packages",
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">AIパッケージ</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    CLIP, BLIP-2, YOLOなど
                  </p>
                </div>
                {envStatus?.packages_installed && (
                  <span className="text-xs text-[var(--color-success)]">
                    インストール済み
                  </span>
                )}
              </div>
            </div>

            {/* Progress message */}
            {envSetupRunning && envProgress && (
              <div className="space-y-2">
                <p className="text-sm text-[var(--color-text-muted)]">
                  {envProgress.message}
                </p>
                {envProgress.progress > 0 && envProgress.progress < 1 && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                      style={{
                        width: `${Math.round(envProgress.progress * 100)}%`,
                      }}
                    />
                  </div>
                )}
                {envProgress.progress === 0 && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--color-primary)]" />
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleSkipEnvSetup}
                disabled={envSetupRunning}
                className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-50"
              >
                スキップ（基本機能のみ）
              </button>
              {!envSetupRunning ? (
                <button
                  onClick={handleRunEnvSetup}
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                >
                  インストール開始
                </button>
              ) : (
                <button
                  disabled
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white opacity-70"
                >
                  セットアップ中...
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Photo Folder ────────────────────────────────────────── */}
        {step === "photo_folder" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">写真フォルダの設定</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                VRChatのスクリーンショットが保存されているフォルダを指定してください。
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-muted)]">
                写真フォルダパス
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={photoFolder}
                  onChange={(e) => setPhotoFolder(e.target.value)}
                  placeholder="例: C:\Users\YourName\Pictures\VRChat"
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const { open } = await import("@tauri-apps/plugin-dialog");
                      const selected = await open({ directory: true, multiple: false });
                      if (selected) setPhotoFolder(selected as string);
                    } catch { /* not in Tauri */ }
                  }}
                  className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  参照
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                通常: %UserProfile%\Pictures\VRChat
              </p>
            </div>

            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep("welcome")}
                className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                戻る
              </button>
              <button
                onClick={handleSetPhotoFolder}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* ── Log Folder ──────────────────────────────────────────── */}
        {step === "log_folder" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">ログフォルダの設定</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                VRChatのログファイルが保存されているフォルダを指定してください。
                <br />
                ログを解析するとワールド名やフレンド情報が自動で写真に紐づきます。
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-muted)]">
                ログフォルダパス
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logFolder}
                  onChange={(e) => setLogFolder(e.target.value)}
                  placeholder="例: C:\Users\YourName\AppData\LocalLow\VRChat\VRChat"
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const { open } = await import("@tauri-apps/plugin-dialog");
                      const selected = await open({ directory: true, multiple: false });
                      if (selected) setLogFolder(selected as string);
                    } catch { /* not in Tauri */ }
                  }}
                  className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  参照
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                通常: %LOCALAPPDATA%Low\VRChat\VRChat
              </p>
            </div>

            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleSkipLogs}
                className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                スキップ
              </button>
              <button
                onClick={handleSetLogFolder}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                スキャン開始
              </button>
            </div>
          </div>
        )}

        {/* ── Indexing ─────────────────────────────────────────────── */}
        {step === "indexing" && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-bold">インデックス作成中</h2>
            <div className="space-y-2">
              <p className="text-[var(--color-text-muted)]">
                {indexingProgress.status}
              </p>
              <div className="mx-auto h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-full animate-pulse rounded-full bg-[var(--color-primary)]"
                  style={{ width: "60%" }}
                />
              </div>
            </div>
            {indexingProgress.photosFound > 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">
                {indexingProgress.photosFound} 枚の写真を発見
              </p>
            )}
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-bold">セットアップ完了</h2>
            <div className="space-y-2 text-[var(--color-text-muted)]">
              <p>{indexingProgress.photosFound} 枚の写真をインデックス</p>
              {indexingProgress.worldsFound > 0 && (
                <p>{indexingProgress.worldsFound} 件のワールド訪問を記録</p>
              )}
              {envStatus?.all_ready && (
                <p className="text-[var(--color-success)]">AI検索が利用可能です</p>
              )}
              {!envStatus?.all_ready && (
                <p className="text-xs">
                  設定画面からAI環境を後からセットアップできます
                </p>
              )}
            </div>
            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
            <button
              onClick={onComplete}
              className="rounded-lg bg-[var(--color-primary)] px-8 py-2.5 font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              使い始める
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
