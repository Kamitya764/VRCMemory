interface PhotoDetailProps {
  photoId: string | null;
  onClose: () => void;
}

function PhotoDetail({ photoId, onClose }: PhotoDetailProps) {
  if (!photoId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-[var(--color-surface)] p-4">
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          ✕
        </button>
        <div className="flex gap-4">
          {/* Photo preview area */}
          <div className="flex items-center justify-center rounded-lg bg-[var(--color-bg)] p-8">
            <p className="text-[var(--color-text-muted)]">
              写真ID: {photoId}
            </p>
          </div>
          {/* Metadata panel */}
          <div className="w-64 space-y-4">
            <h3 className="text-lg font-semibold">写真詳細</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)]">
                  撮影日時:
                </span>
                <p>—</p>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">
                  ワールド:
                </span>
                <p>—</p>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">タグ:</span>
                <p>—</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PhotoDetail;
