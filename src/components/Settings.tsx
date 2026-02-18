import { useState, useEffect } from "react";
import { getSettings, updateSettings, startIndexing, getIndexingStatus } from "@/lib/api";
import type { AppSettings } from "@/lib/api";

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState("");
  const [photoFolder, setPhotoFolder] = useState("");
  const [logFolder, setLogFolder] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setPhotoFolder(s.photo_folder);
        setLogFolder(s.log_folder);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        photo_folder: photoFolder,
        log_folder: logFolder,
      });
      setSettings((prev) =>
        prev ? { ...prev, photo_folder: photoFolder, log_folder: logFolder } : prev,
      );
    } catch {
      // Error
    } finally {
      setSaving(false);
    }
  };

  const handleReindex = async () => {
    setIndexing(true);
    setIndexStatus("インデックスを開始中...");
    try {
      await startIndexing();
      // Poll status
      const poll = setInterval(async () => {
        try {
          const status = await getIndexingStatus();
          setIndexStatus(
            `処理中: ${status.processed}/${status.total}`,
          );
          if (!status.is_running) {
            clearInterval(poll);
            setIndexing(false);
            setIndexStatus(
              `完了: ${status.processed} 件を処理しました`,
            );
          }
        } catch {
          clearInterval(poll);
          setIndexing(false);
        }
      }, 1000);
    } catch {
      setIndexing(false);
      setIndexStatus("エラーが発生しました");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)]">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h2 className="text-lg font-semibold">設定</h2>

      {/* Folder settings */}
      <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-medium">フォルダ設定</h3>

        <div>
          <label className="mb-1 block text-sm text-[var(--color-text-muted)]">
            写真フォルダ
          </label>
          <input
            type="text"
            value={photoFolder}
            onChange={(e) => setPhotoFolder(e.target.value)}
            placeholder="例: C:\Users\YourName\Pictures\VRChat"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            VRChatのスクリーンショット保存先
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[var(--color-text-muted)]">
            ログフォルダ
          </label>
          <input
            type="text"
            value={logFolder}
            onChange={(e) => setLogFolder(e.target.value)}
            placeholder="例: C:\Users\YourName\AppData\LocalLow\VRChat\VRChat"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            VRChatのログファイル保存先
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          {settings &&
            (photoFolder !== settings.photo_folder ||
              logFolder !== settings.log_folder) && (
              <span className="text-xs text-[var(--color-text-muted)]">
                未保存の変更があります
              </span>
            )}
        </div>
      </section>

      {/* Indexing */}
      <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-medium">インデックス</h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          写真とログを再スキャンしてデータベースを更新します。
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReindex}
            disabled={indexing}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            {indexing ? "処理中..." : "再インデックス"}
          </button>
          {indexStatus && (
            <span className="text-sm text-[var(--color-text-muted)]">
              {indexStatus}
            </span>
          )}
        </div>
      </section>

      {/* App info */}
      <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-medium">アプリ情報</h3>
        <div className="space-y-1 text-sm text-[var(--color-text-muted)]">
          <p>VRCMemory v0.1.0</p>
          <p>データはすべてローカルに保存されます。</p>
        </div>
      </section>
    </div>
  );
}

export default Settings;
