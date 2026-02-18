import { useState, useEffect } from "react";
import type { View } from "@/App";
import type { Photo } from "@/lib/api";
import { searchPhotos } from "@/lib/api";
import { toAssetUrl } from "@/lib/assets";
import PhotoDetail from "@/components/PhotoDetail";

interface PhotoGridProps {
  view: View;
  searchQuery: string;
  photos: Photo[];
  onRefresh: () => void;
}

function PhotoGrid({ view, searchQuery, photos, onRefresh }: PhotoGridProps) {
  const [displayPhotos, setDisplayPhotos] = useState<Photo[]>(photos);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  useEffect(() => {
    if (searchQuery.trim()) {
      searchPhotos(searchQuery)
        .then((result) => setDisplayPhotos(result.photos))
        .catch(() => setDisplayPhotos(photos));
    } else {
      setDisplayPhotos(photos);
    }
  }, [searchQuery, photos]);

  const filteredPhotos = (() => {
    if (view === "recent") {
      // Last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return displayPhotos.filter(
        (p) => new Date(p.datetime) >= weekAgo,
      );
    }
    return displayPhotos;
  })();

  const viewLabels: Record<View, string> = {
    all: "すべての写真",
    recent: "最近の写真",
    albums: "アルバム",
    friends: "フレンド",
    worlds: "ワールド履歴",
    analytics: "プレイスタイル分析",
  };

  if (filteredPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text)]">
          {viewLabels[view]}
        </h2>
        {searchQuery ? (
          <p>
            「{searchQuery}」に一致する写真が見つかりませんでした
          </p>
        ) : (
          <>
            <p className="mb-2">写真がまだありません</p>
            <p className="text-sm">
              VRChatの写真フォルダを設定すると自動的にインデックスされます。
            </p>
            <button
              onClick={onRefresh}
              className="mt-4 rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              再読み込み
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {searchQuery
            ? `「${searchQuery}」の検索結果`
            : viewLabels[view]}
        </h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {filteredPhotos.length} 枚
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filteredPhotos.map((photo) => (
          <button
            key={photo.id}
            onClick={() => setSelectedPhotoId(photo.id)}
            className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:border-[var(--color-primary)]"
          >
            <img
              src={toAssetUrl(photo.filepath)}
              alt={photo.filename}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="hidden h-full w-full items-center justify-center bg-[var(--color-bg)] text-3xl">
              📷
            </div>

            {/* Overlay with info */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="truncate text-xs text-white">
                {photo.world_name || photo.filename}
              </p>
              <p className="text-xs text-white/70">
                {formatDate(photo.datetime)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <PhotoDetail
        photoId={selectedPhotoId}
        onClose={() => setSelectedPhotoId(null)}
      />
    </div>
  );
}

function formatDate(datetime: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return datetime;
  }
}

export default PhotoGrid;
