import { useState } from "react";
import { updateSettings, scanPhotos, parseLogs } from "@/lib/api";

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = "welcome" | "photo_folder" | "log_folder" | "indexing" | "done";

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

  const handleSetPhotoFolder = async () => {
    if (!photoFolder.trim()) {
      setError("フォルダパスを入力してください");
      return;
    }
    setError(null);
    await updateSettings({ photo_folder: photoFolder });
    setStep("log_folder");
  };

  const handleSetLogFolder = async () => {
    if (!logFolder.trim()) {
      setError("フォルダパスを入力してください");
      return;
    }
    setError(null);
    await updateSettings({ log_folder: logFolder });
    setStep("indexing");
    startIndexingProcess();
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
    await updateSettings({ log_folder: "" });
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

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        {step === "welcome" && (
          <div className="space-y-6 text-center">
            <h2 className="text-2xl font-bold">VRCMemory へようこそ</h2>
            <p className="text-[var(--color-text-muted)]">
              VRChatの写真とログを自動で整理し、
              <br />
              AIで簡単に検索できるようにします。
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              まずはVRChatの写真フォルダとログフォルダを設定しましょう。
            </p>
            <button
              onClick={() => setStep("photo_folder")}
              className="rounded-lg bg-[var(--color-primary)] px-8 py-2.5 font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              セットアップを開始
            </button>
          </div>
        )}

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
              <input
                type="text"
                value={photoFolder}
                onChange={(e) => setPhotoFolder(e.target.value)}
                placeholder="例: C:\Users\YourName\Pictures\VRChat"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)]"
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                通常: %UserProfile%\Pictures\VRChat
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

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
              <input
                type="text"
                value={logFolder}
                onChange={(e) => setLogFolder(e.target.value)}
                placeholder="例: C:\Users\YourName\AppData\LocalLow\VRChat\VRChat"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)]"
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                通常: %LOCALAPPDATA%Low\VRChat\VRChat
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

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

        {step === "indexing" && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-bold">インデックス作成中</h2>
            <div className="space-y-2">
              <p className="text-[var(--color-text-muted)]">
                {indexingProgress.status}
              </p>
              <div className="mx-auto h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div className="h-full animate-pulse rounded-full bg-[var(--color-primary)]" style={{ width: "60%" }} />
              </div>
            </div>
            {indexingProgress.photosFound > 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">
                {indexingProgress.photosFound} 枚の写真を発見
              </p>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-bold">セットアップ完了</h2>
            <div className="space-y-2 text-[var(--color-text-muted)]">
              <p>{indexingProgress.photosFound} 枚の写真をインデックス</p>
              {indexingProgress.worldsFound > 0 && (
                <p>{indexingProgress.worldsFound} 件のワールド訪問を記録</p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
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
