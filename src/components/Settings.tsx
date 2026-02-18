import { useState, useEffect } from "react";
import {
  getSettings,
  updateSettings,
  startIndexing,
  getIndexingStatus,
  startWatcher,
  getSidecarStatus,
  generateCaptions,
  generateThumbnails,
  exportDataToFile,
  importDataFromFile,
  indexPhotosVectors,
  indexPhotosText,
  getSearchStatus,
} from "@/lib/api";
import { showToast } from "@/lib/toast";
import type { AppSettings, SidecarStatus, SearchIndexStatus } from "@/lib/api";

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState("");
  const [photoFolder, setPhotoFolder] = useState("");
  const [logFolder, setLogFolder] = useState("");
  const [sidecar, setSidecar] = useState<SidecarStatus | null>(null);
  const [captioning, setCaptioning] = useState(false);
  const [captionStatus, setCaptionStatus] = useState("");
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [thumbStatus, setThumbStatus] = useState("");
  const [searchIndex, setSearchIndex] = useState<SearchIndexStatus | null>(null);
  const [vectorIndexing, setVectorIndexing] = useState(false);
  const [vectorIndexStatus, setVectorIndexStatus] = useState("");
  const [textIndexing, setTextIndexing] = useState(false);
  const [textIndexStatus, setTextIndexStatus] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setPhotoFolder(s.photo_folder);
        setLogFolder(s.log_folder);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Check sidecar status
    getSidecarStatus()
      .then((s) => {
        setSidecar(s);
        if (s.available) {
          getSearchStatus().then(setSearchIndex).catch(() => {});
        }
      })
      .catch(() => setSidecar({ available: false, gpu_available: false }));
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
      await startWatcher().catch(() => {});
      showToast("設定を保存しました", "success");
    } catch {
      showToast("設定の保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReindex = async () => {
    setIndexing(true);
    setIndexStatus("インデックスを開始中...");
    try {
      await startIndexing();
      const poll = setInterval(async () => {
        try {
          const status = await getIndexingStatus();
          setIndexStatus(`処理中: ${status.processed}/${status.total}`);
          if (!status.is_running) {
            clearInterval(poll);
            setIndexing(false);
            setIndexStatus(`完了: ${status.processed} 件を処理しました`);
            showToast(`${status.processed} 件を処理しました`, "success");
          }
        } catch {
          clearInterval(poll);
          setIndexing(false);
        }
      }, 1000);
    } catch {
      setIndexing(false);
      setIndexStatus("エラーが発生しました");
      showToast("インデックスの開始に失敗しました", "error");
    }
  };

  const handleGenerateCaptions = async () => {
    setCaptioning(true);
    setCaptionStatus("キャプション生成中...");
    try {
      const count = await generateCaptions(20);
      setCaptionStatus(
        count > 0
          ? `${count} 枚の写真にキャプションを生成しました`
          : "キャプション未生成の写真がありません",
      );
    } catch {
      setCaptionStatus("エラー: AIサイドカーに接続できません");
    } finally {
      setCaptioning(false);
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

      {/* AI Sidecar */}
      <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">AI処理 (サイドカー)</h3>
          {sidecar && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  sidecar.available ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className="text-xs text-[var(--color-text-muted)]">
                {sidecar.available
                  ? sidecar.gpu_available
                    ? "GPU利用可能"
                    : "CPU動作中"
                  : "未接続"}
              </span>
            </div>
          )}
        </div>

        <p className="text-sm text-[var(--color-text-muted)]">
          Python AIサイドカーを使って写真にキャプションを自動生成します。
          <br />
          <code className="text-xs">cd python-sidecar && python main.py</code>{" "}
          でサイドカーを起動してください。
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateCaptions}
            disabled={captioning || !sidecar?.available}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            {captioning ? "生成中..." : "キャプション生成"}
          </button>
          <button
            onClick={() => {
              getSidecarStatus()
                .then(setSidecar)
                .catch(() =>
                  setSidecar({ available: false, gpu_available: false }),
                );
            }}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            再接続
          </button>
          {captionStatus && (
            <span className="text-sm text-[var(--color-text-muted)]">
              {captionStatus}
            </span>
          )}
        </div>
      </section>

      {/* AI Search Index */}
      {sidecar?.available && (
        <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">AI検索インデックス</h3>
            {searchIndex && (
              <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                <span>ベクトル: {searchIndex.total_vectors}</span>
                <span>テキスト: {searchIndex.total_documents}</span>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    searchIndex.meilisearch_available ? "bg-green-400" : "bg-yellow-400"
                  }`}
                />
              </div>
            )}
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            写真のCLIPベクトルとメタデータをインデックスし、AIハイブリッド検索を有効にします。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                setVectorIndexing(true);
                setVectorIndexStatus("ベクトルインデックス中...");
                try {
                  const result = await indexPhotosVectors(50);
                  setVectorIndexStatus(
                    `${result.indexed} 枚をインデックス (${result.skipped} スキップ)`,
                  );
                  getSearchStatus().then(setSearchIndex).catch(() => {});
                } catch {
                  setVectorIndexStatus("エラー: ベクトルインデックスに失敗");
                } finally {
                  setVectorIndexing(false);
                }
              }}
              disabled={vectorIndexing}
              className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              {vectorIndexing ? "処理中..." : "ベクトルインデックス"}
            </button>
            <button
              onClick={async () => {
                setTextIndexing(true);
                setTextIndexStatus("テキストインデックス中...");
                try {
                  const result = await indexPhotosText(100);
                  setTextIndexStatus(`${result.indexed} 件をインデックス`);
                  getSearchStatus().then(setSearchIndex).catch(() => {});
                } catch {
                  setTextIndexStatus("エラー: テキストインデックスに失敗");
                } finally {
                  setTextIndexing(false);
                }
              }}
              disabled={textIndexing}
              className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              {textIndexing ? "処理中..." : "テキストインデックス"}
            </button>
            {(vectorIndexStatus || textIndexStatus) && (
              <span className="text-sm text-[var(--color-text-muted)]">
                {vectorIndexStatus || textIndexStatus}
              </span>
            )}
          </div>
        </section>
      )}

      {/* Thumbnail generation */}
      <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-medium">サムネイル生成</h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          写真のサムネイルを生成して、グリッド表示を高速化します。
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setGeneratingThumbs(true);
              setThumbStatus("生成中...");
              try {
                const count = await generateThumbnails();
                setThumbStatus(`${count} 枚のサムネイルを生成しました`);
              } catch {
                setThumbStatus("サムネイル生成に失敗しました");
              } finally {
                setGeneratingThumbs(false);
              }
            }}
            disabled={generatingThumbs}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            {generatingThumbs ? "生成中..." : "サムネイル生成"}
          </button>
          {thumbStatus && (
            <span className="text-sm text-[var(--color-text-muted)]">
              {thumbStatus}
            </span>
          )}
        </div>
      </section>

      {/* Data management */}
      <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-medium">データ管理</h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          フレンド、ワールド訪問履歴、アルバムのデータをJSON形式でエクスポート・インポートできます。
        </p>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const path = await save({
                  defaultPath: "vrcmemory-export.json",
                  filters: [{ name: "JSON", extensions: ["json"] }],
                });
                if (path) {
                  await exportDataToFile(path);
                  showToast("データをエクスポートしました", "success");
                }
              } catch {
                showToast("エクスポートに失敗しました", "error");
              }
            }}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            エクスポート
          </button>
          <button
            onClick={async () => {
              try {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const path = await open({
                  multiple: false,
                  filters: [{ name: "JSON", extensions: ["json"] }],
                });
                if (path) {
                  const stats = await importDataFromFile(path as string);
                  const parts = [];
                  if (stats.friends_imported > 0)
                    parts.push(`フレンド ${stats.friends_imported}人`);
                  if (stats.world_visits_imported > 0)
                    parts.push(`ワールド訪問 ${stats.world_visits_imported}件`);
                  if (stats.albums_imported > 0)
                    parts.push(`アルバム ${stats.albums_imported}件`);
                  showToast(
                    parts.length > 0
                      ? `${parts.join("、")}をインポートしました`
                      : "新しいデータはありませんでした",
                    parts.length > 0 ? "success" : "info",
                  );
                }
              } catch {
                showToast("インポートに失敗しました", "error");
              }
            }}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            インポート
          </button>
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
