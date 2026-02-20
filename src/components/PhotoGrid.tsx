import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { View } from "@/App";
import type { Photo } from "@/lib/api";
import { searchPhotos, getPhotos, deletePhotos, getAlbums, addPhotosToAlbum, filterPhotos, getWorldNames, aiSearch } from "@/lib/api";
import type { Album } from "@/lib/api";
import { toAssetUrl } from "@/lib/assets";
import PhotoDetail from "@/components/PhotoDetail";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PAGE_SIZE } from "@/lib/constants";
import { formatDateLabel, formatDateFull } from "@/lib/format";
import { showToast } from "@/lib/toast";

type SortMode = "date_desc" | "date_asc" | "name_asc" | "name_desc";

interface PhotoGridProps {
  view: View;
  searchQuery: string;
  photos: Photo[];
  onRefresh: () => void;
}

function PhotoGrid({ view, searchQuery, photos, onRefresh }: PhotoGridProps) {
  const [displayPhotos, setDisplayPhotos] = useState<Photo[]>(photos);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterWorld, setFilterWorld] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [worldNames, setWorldNames] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters = filterWorld || filterDateFrom || filterDateTo;

  // Load world names for filter dropdown
  useEffect(() => {
    if (showFilters && worldNames.length === 0) {
      getWorldNames().then(setWorldNames).catch(() => {});
    }
  }, [showFilters, worldNames.length]);

  // Debounced search with filters
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (hasActiveFilters) {
      debounceRef.current = setTimeout(() => {
        filterPhotos(
          filterWorld || undefined,
          filterDateFrom || undefined,
          filterDateTo || undefined,
          0,
          200,
        )
          .then((result) => {
            setDisplayPhotos(result.photos);
            setVisibleCount(PAGE_SIZE);
            setHasMore(result.photos.length > PAGE_SIZE);
          })
          .catch(() => setDisplayPhotos(photos));
      }, 300);
    } else if (searchQuery.trim()) {
      debounceRef.current = setTimeout(() => {
        // Try AI hybrid search first, fallback to SQLite search
        aiSearch(searchQuery)
          .then((result) => {
            if (result.photos.length > 0) {
              setDisplayPhotos(result.photos);
              setVisibleCount(PAGE_SIZE);
              setHasMore(result.photos.length > PAGE_SIZE);
            } else {
              // AI search returned nothing, try SQLite
              return searchPhotos(searchQuery).then((sqlResult) => {
                setDisplayPhotos(sqlResult.photos);
                setVisibleCount(PAGE_SIZE);
                setHasMore(sqlResult.photos.length > PAGE_SIZE);
              });
            }
          })
          .catch(() => {
            // AI search unavailable, fallback to SQLite
            searchPhotos(searchQuery)
              .then((result) => {
                setDisplayPhotos(result.photos);
                setVisibleCount(PAGE_SIZE);
                setHasMore(result.photos.length > PAGE_SIZE);
              })
              .catch(() => setDisplayPhotos(photos));
          });
      }, 300);
    } else {
      setDisplayPhotos(photos);
      setVisibleCount(PAGE_SIZE);
      setHasMore(photos.length > PAGE_SIZE);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, photos, hasActiveFilters, filterWorld, filterDateFrom, filterDateTo]);

  // Sort photos
  const sortedPhotos = useMemo(() => {
    let filtered = displayPhotos;
    if (view === "recent") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = displayPhotos.filter(
        (p) => new Date(p.datetime) >= weekAgo,
      );
    }
    const sorted = [...filtered];
    switch (sortMode) {
      case "date_desc":
        sorted.sort((a, b) => b.datetime.localeCompare(a.datetime));
        break;
      case "date_asc":
        sorted.sort((a, b) => a.datetime.localeCompare(b.datetime));
        break;
      case "name_asc":
        sorted.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case "name_desc":
        sorted.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
    }
    return sorted;
  }, [displayPhotos, view, sortMode]);

  const visiblePhotos = useMemo(() => sortedPhotos.slice(0, visibleCount), [sortedPhotos, visibleCount]);

  const dateGroups = useMemo(() => groupPhotosByDate(visiblePhotos), [visiblePhotos]);

  const photoIds = useMemo(() => visiblePhotos.map((p) => p.id), [visiblePhotos]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);

    if (!searchQuery.trim()) {
      try {
        const result = await getPhotos(displayPhotos.length, PAGE_SIZE);
        if (result.photos.length > 0) {
          setDisplayPhotos((prev) => [...prev, ...result.photos]);
          setHasMore(displayPhotos.length + result.photos.length < result.total);
        } else {
          setHasMore(false);
        }
      } catch {
        // Error
      }
    } else {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setHasMore(sortedPhotos.length > visibleCount + PAGE_SIZE);
    }

    setLoadingMore(false);
  }, [loadingMore, searchQuery, displayPhotos.length, sortedPhotos.length, visibleCount]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          handleLoadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadingMore, handleLoadMore]);

  // Selection helpers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const selectAll = () => {
    setSelectedIds(new Set(visiblePhotos.map((p) => p.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      const count = await deletePhotos([...selectedIds]);
      setDisplayPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      clearSelection();
      onRefresh();
      showToast(`${count}枚の写真を削除しました`, "success");
    } catch {
      showToast("写真の削除に失敗しました", "error");
    }
  };

  const handleAddToAlbum = async (albumId: string) => {
    if (selectedIds.size === 0) return;
    try {
      const added = await addPhotosToAlbum(albumId, [...selectedIds]);
      setShowAlbumPicker(false);
      clearSelection();
      showToast(`${added}枚をアルバムに追加しました`, "success");
    } catch {
      showToast("アルバムへの追加に失敗しました", "error");
    }
  };

  const openAlbumPicker = async () => {
    try {
      const data = await getAlbums();
      setAlbums(data);
      setShowAlbumPicker(true);
    } catch {
      // Error
    }
  };

  const handlePhotoClick = (photo: Photo) => {
    if (selectionMode) {
      toggleSelection(photo.id);
    } else {
      setSelectedPhotoId(photo.id);
    }
  };

  const viewLabels: Record<string, string> = {
    all: "すべての写真",
    recent: "最近の写真",
    albums: "アルバム",
  };

  if (sortedPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text)]">
          {viewLabels[view] || view}
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
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {searchQuery
              ? `「${searchQuery}」の検索結果`
              : viewLabels[view] || view}
          </h2>
          <span className="text-sm text-[var(--color-text-muted)]">
            {sortedPhotos.length} 枚
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Selection mode toggle */}
          {selectionMode ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">
                {selectedIds.size} 枚選択
              </span>
              <button
                onClick={selectAll}
                className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                全選択
              </button>
              {selectedIds.size > 0 && (
                <>
                  <div className="relative">
                    <button
                      onClick={openAlbumPicker}
                      className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                      アルバムに追加
                    </button>
                    {showAlbumPicker && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                        {albums.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                            アルバムがありません
                          </p>
                        ) : (
                          albums.map((album) => (
                            <button
                              key={album.id}
                              onClick={() => handleAddToAlbum(album.id)}
                              className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)]"
                            >
                              {album.name}
                              <span className="ml-1 text-[var(--color-text-muted)]">
                                ({album.photo_count})
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded border border-[var(--color-danger)]/30 px-2 py-1 text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
                  >
                    削除
                  </button>
                </>
              )}
              <button
                onClick={clearSelection}
                className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                解除
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSelectionMode(true)}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
              title="選択モード"
            >
              選択
            </button>
          )}

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`rounded border px-2 py-1 text-xs transition-colors ${
              hasActiveFilters
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            }`}
            title="フィルター"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline-block mr-1">
              <path d="M1 2H11M3 6H9M5 10H7" strokeLinecap="round" />
            </svg>
            フィルター{hasActiveFilters ? " ●" : ""}
          </button>

          {/* Sort dropdown */}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text-muted)] outline-none"
          >
            <option value="date_desc">日付 新しい順</option>
            <option value="date_asc">日付 古い順</option>
            <option value="name_asc">名前 A→Z</option>
            <option value="name_desc">名前 Z→A</option>
          </select>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)]">ワールド</label>
            <select
              value={filterWorld}
              onChange={(e) => setFilterWorld(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            >
              <option value="">すべて</option>
              {worldNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)]">開始日</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)]">終了日</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterWorld("");
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              クリア
            </button>
          )}
        </div>
      )}

      {/* Photo grid with date groups */}
      {dateGroups.map((group) => (
        <div key={group.date} className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            {group.label}
            <span className="ml-2 text-xs font-normal">
              {group.photos.length} 枚
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {group.photos.map((photo) => (
          <button
            key={photo.id}
            onClick={() => handlePhotoClick(photo)}
            className={`group relative aspect-square overflow-hidden rounded-lg border bg-[var(--color-surface)] transition-all ${
              selectionMode && selectedIds.has(photo.id)
                ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
            }`}
          >
            {/* Selection checkbox */}
            {selectionMode && (
              <div
                className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                  selectedIds.has(photo.id)
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                    : "border-white/70 bg-black/30"
                }`}
              >
                {selectedIds.has(photo.id) && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            )}

            <img
              src={toAssetUrl(photo.thumbnail_path || photo.filepath)}
              alt={photo.filename}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => {
                // If thumbnail failed, try full image; if full image failed, show fallback
                const img = e.currentTarget;
                if (photo.thumbnail_path && img.src.includes("_thumb")) {
                  img.src = toAssetUrl(photo.filepath);
                  return;
                }
                img.style.display = "none";
                if (img.nextElementSibling) {
                  (img.nextElementSibling as HTMLElement).style.display = "flex";
                }
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
                {formatDateFull(photo.datetime)}
              </p>
            </div>
          </button>
        ))}
          </div>
        </div>
      ))}

      {/* Infinite scroll sentinel */}
      {(hasMore || sortedPhotos.length > visibleCount) && (
        <div ref={sentinelRef} className="mt-6 flex justify-center py-4">
          {loadingMore && (
            <span className="text-sm text-[var(--color-text-muted)]">
              読み込み中...
            </span>
          )}
        </div>
      )}

      <PhotoDetail
        photoId={selectedPhotoId}
        photoIds={photoIds}
        onClose={() => setSelectedPhotoId(null)}
        onNavigate={setSelectedPhotoId}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="写真を削除"
        message={`${selectedIds.size}枚の写真を削除しますか？この操作は取り消せません。`}
        confirmLabel="削除"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDeleteSelected();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

interface DateGroup {
  date: string;
  label: string;
  photos: Photo[];
}

function groupPhotosByDate(photos: Photo[]): DateGroup[] {
  const groups = new Map<string, Photo[]>();
  for (const photo of photos) {
    const dateKey = photo.datetime.slice(0, 10); // YYYY-MM-DD
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(photo);
  }

  return [...groups.entries()].map(([date, datePhotos]) => ({
    date,
    label: formatDateLabel(date),
    photos: datePhotos,
  }));
}

export default PhotoGrid;
