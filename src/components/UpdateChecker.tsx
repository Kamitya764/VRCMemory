import { useState, useEffect, useCallback } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "downloading" | "ready" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const result = await check();
      if (result) {
        setUpdate(result);
        setStatus("available");
      } else {
        setStatus("idle");
      }
    } catch (err) {
      // Silently ignore in dev mode or if no endpoint configured
      setStatus("idle");
      console.warn("Update check failed:", err);
    }
  }, []);

  // Check for updates on mount (with a small delay)
  useEffect(() => {
    const timer = setTimeout(checkForUpdates, 5000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  const handleDownloadAndInstall = async () => {
    if (!update) return;
    setStatus("downloading");
    setProgress(0);

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      setStatus("ready");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  };

  const handleRelaunch = async () => {
    await relaunch();
  };

  // Don't show anything if no update or dismissed
  if (status === "idle" || status === "checking" || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-16 right-4 z-50 w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl">
      {/* Close button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-2 rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      </button>

      {/* Update available */}
      {status === "available" && update && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">
              新しいバージョンがあります
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              v{update.version} が利用可能です。
            </p>
            {update.body && (
              <p className="mt-1 max-h-24 overflow-y-auto text-xs text-[var(--color-text-muted)]">
                {update.body}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadAndInstall}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              アップデート
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              あとで
            </button>
          </div>
        </div>
      )}

      {/* Downloading */}
      {status === "downloading" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">ダウンロード中...</h3>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{progress}%</p>
        </div>
      )}

      {/* Ready to restart */}
      {status === "ready" && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">
              アップデート準備完了
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              アプリを再起動して更新を適用します。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRelaunch}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              今すぐ再起動
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              あとで
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-error)]">
            アップデート失敗
          </h3>
          <p className="text-xs text-[var(--color-text-muted)]">{error}</p>
          <button
            onClick={handleDownloadAndInstall}
            className="rounded-lg border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
}

export default UpdateChecker;
