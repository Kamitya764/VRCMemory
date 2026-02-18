import { useState, useEffect, useCallback, useRef } from "react";
import { getPhotoDetail, updatePhotoTags } from "@/lib/api";
import { toAssetUrl } from "@/lib/assets";
import { showToast } from "@/lib/toast";
import type { Photo } from "@/lib/api";

interface PhotoDetailProps {
  photoId: string | null;
  photoIds?: string[];
  onClose: () => void;
  onNavigate?: (id: string) => void;
}

function PhotoDetail({ photoId, photoIds, onClose, onNavigate }: PhotoDetailProps) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!photoId) {
      setPhoto(null);
      return;
    }

    setLoading(true);
    setImgError(false);
    setFullscreen(false);
    getPhotoDetail(photoId)
      .then((p) => setPhoto(p))
      .catch(() => setPhoto(null))
      .finally(() => setLoading(false));
  }, [photoId]);

  // Focus dialog on open
  useEffect(() => {
    if (photoId && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [photoId]);

  const currentIndex = photoId && photoIds ? photoIds.indexOf(photoId) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = photoIds ? currentIndex < photoIds.length - 1 : false;

  const goToPrev = useCallback(() => {
    if (hasPrev && photoIds && onNavigate) {
      onNavigate(photoIds[currentIndex - 1]);
    }
  }, [hasPrev, photoIds, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext && photoIds && onNavigate) {
      onNavigate(photoIds[currentIndex + 1]);
    }
  }, [hasNext, photoIds, currentIndex, onNavigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          if (fullscreen) {
            setFullscreen(false);
          } else {
            onClose();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
        case "f":
        case "F":
          setFullscreen((prev) => !prev);
          break;
      }
    },
    [onClose, goToPrev, goToNext, fullscreen],
  );

  if (!photoId) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      {/* Prev/Next arrow buttons */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToPrev();
          }}
          className="absolute left-4 z-10 rounded-full bg-black/50 p-2 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToNext();
          }}
          className="absolute right-4 z-10 rounded-full bg-black/50 p-2 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className={`relative flex overflow-hidden rounded-lg bg-[var(--color-surface)] ${fullscreen ? "h-full w-full" : "max-h-[90vh] max-w-[90vw]"}`}>
        {/* Close + Fullscreen buttons */}
        <div className="absolute right-3 top-3 z-10 flex gap-1.5">
          <button
            onClick={() => setFullscreen((prev) => !prev)}
            className="rounded-full bg-black/50 p-1.5 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
            title={fullscreen ? "通常表示 (F)" : "フルスクリーン (F)"}
          >
            {fullscreen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 2H2V6M14 6V2H10M10 14H14V10M2 10V14H6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 6V2H6M10 2H14V6M14 10V14H10M6 14H2V10" />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded-full bg-black/50 p-1.5 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex h-96 w-96 items-center justify-center">
            <p className="text-[var(--color-text-muted)]">読み込み中...</p>
          </div>
        ) : photo ? (
          <>
            {/* Photo display */}
            <div className={`flex items-center justify-center bg-black ${fullscreen ? "h-full w-full" : "min-h-[400px] min-w-[500px]"}`}>
              {!imgError ? (
                <img
                  src={toAssetUrl(photo.filepath)}
                  alt={photo.filename}
                  className={fullscreen ? "max-h-full max-w-full object-contain" : "max-h-[85vh] max-w-[60vw] object-contain"}
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-16 text-[var(--color-text-muted)]">
                  <p>画像を表示できません</p>
                </div>
              )}
            </div>

            {/* Metadata panel */}
            {!fullscreen && (
              <div className="w-72 overflow-y-auto border-l border-[var(--color-border)] p-5">
                <h3 className="mb-4 text-lg font-semibold">写真詳細</h3>

                <div className="space-y-4 text-sm">
                  <MetadataField label="ファイル名" value={photo.filename} copyable />
                  <MetadataField
                    label="撮影日時"
                    value={formatDateTime(photo.datetime)}
                  />
                  <MetadataField
                    label="ワールド"
                    value={photo.world_name || "不明"}
                    copyable
                  />
                  {photo.world_id && (
                    <MetadataField label="ワールドID" value={photo.world_id} copyable />
                  )}
                  {photo.caption && (
                    <MetadataField label="キャプション" value={photo.caption} copyable />
                  )}
                  {photo.ocr_text && (
                    <MetadataField label="OCRテキスト" value={photo.ocr_text} copyable />
                  )}

                  {/* Tags */}
                  <TagEditor
                    photoId={photo.id}
                    tags={photo.tags}
                    onUpdate={(newTags) =>
                      setPhoto((prev) =>
                        prev ? { ...prev, tags: newTags } : prev,
                      )
                    }
                  />

                  {/* File path */}
                  <MetadataField label="パス" value={photo.filepath} copyable small />

                  {/* Navigation hint */}
                  {photoIds && photoIds.length > 1 && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      ← → 移動 / F フルスクリーン
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-96 w-96 items-center justify-center">
            <p className="text-[var(--color-text-muted)]">
              写真が見つかりません
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetadataField({
  label,
  value,
  copyable,
  small,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  small?: boolean;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(
      () => showToast("コピーしました", "success"),
      () => showToast("コピーに失敗しました", "error"),
    );
  };

  return (
    <div>
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <div className="mt-0.5 flex items-start gap-1">
        <p className={small ? "flex-1 break-all text-xs text-[var(--color-text-muted)]" : "flex-1"}>
          {value}
        </p>
        {copyable && (
          <button
            onClick={handleCopy}
            className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
            title="コピー"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="7" height="7" rx="1" />
              <path d="M8 4V2.5A1.5 1.5 0 006.5 1H2.5A1.5 1.5 0 001 2.5V6.5A1.5 1.5 0 002.5 8H4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function formatDateTime(datetime: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return datetime;
  }
}

function TagEditor({
  photoId,
  tags,
  onUpdate,
}: {
  photoId: string;
  tags: string[];
  onUpdate: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);

  const handleAdd = async () => {
    const tag = input.trim();
    if (!tag || tags.includes(tag)) return;
    const newTags = [...tags, tag];
    try {
      await updatePhotoTags(photoId, newTags);
      onUpdate(newTags);
      setInput("");
    } catch {
      showToast("タグの追加に失敗しました", "error");
    }
  };

  const handleRemove = async (tagToRemove: string) => {
    const newTags = tags.filter((t) => t !== tagToRemove);
    try {
      await updatePhotoTags(photoId, newTags);
      onUpdate(newTags);
    } catch {
      showToast("タグの削除に失敗しました", "error");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--color-text-muted)]">タグ</span>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
        >
          {editing ? "完了" : "編集"}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs text-[var(--color-primary)]"
          >
            {tag}
            {editing && (
              <button
                onClick={() => handleRemove(tag)}
                className="ml-0.5 text-[var(--color-primary)] hover:text-red-400"
              >
                x
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && !editing && (
          <p className="text-[var(--color-text-muted)]">なし</p>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="タグを追加..."
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim()}
            className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            追加
          </button>
        </div>
      )}
    </div>
  );
}

export default PhotoDetail;
