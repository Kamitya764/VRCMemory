import { useState, useEffect, useCallback, useRef } from "react";
import { getPhotoDetail } from "@/lib/api";
import { toAssetUrl } from "@/lib/assets";
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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!photoId) {
      setPhoto(null);
      return;
    }

    setLoading(true);
    setImgError(false);
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
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
      }
    },
    [onClose, goToPrev, goToNext],
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

      <div className="relative flex max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg bg-[var(--color-surface)]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {loading ? (
          <div className="flex h-96 w-96 items-center justify-center">
            <p className="text-[var(--color-text-muted)]">読み込み中...</p>
          </div>
        ) : photo ? (
          <>
            {/* Photo display */}
            <div className="flex min-h-[400px] min-w-[500px] items-center justify-center bg-black">
              {!imgError ? (
                <img
                  src={toAssetUrl(photo.filepath)}
                  alt={photo.filename}
                  className="max-h-[85vh] max-w-[60vw] object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-16 text-[var(--color-text-muted)]">
                  <p>画像を表示できません</p>
                </div>
              )}
            </div>

            {/* Metadata panel */}
            <div className="w-72 overflow-y-auto border-l border-[var(--color-border)] p-5">
              <h3 className="mb-4 text-lg font-semibold">写真詳細</h3>

              <div className="space-y-4 text-sm">
                <MetadataField label="ファイル名" value={photo.filename} />
                <MetadataField
                  label="撮影日時"
                  value={formatDateTime(photo.datetime)}
                />
                <MetadataField
                  label="ワールド"
                  value={photo.world_name || "不明"}
                />
                {photo.world_id && (
                  <MetadataField label="ワールドID" value={photo.world_id} />
                )}
                {photo.caption && (
                  <MetadataField label="キャプション" value={photo.caption} />
                )}

                {/* Tags */}
                <div>
                  <span className="text-[var(--color-text-muted)]">タグ</span>
                  {photo.tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {photo.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs text-[var(--color-primary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[var(--color-text-muted)]">
                      なし
                    </p>
                  )}
                </div>

                {/* File path */}
                <div>
                  <span className="text-[var(--color-text-muted)]">
                    パス
                  </span>
                  <p className="mt-1 break-all text-xs text-[var(--color-text-muted)]">
                    {photo.filepath}
                  </p>
                </div>

                {/* Navigation hint */}
                {photoIds && photoIds.length > 1 && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    ← → キーで前後の写真に移動
                  </p>
                )}
              </div>
            </div>
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

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <p className="mt-0.5">{value}</p>
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

export default PhotoDetail;
