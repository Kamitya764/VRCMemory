import { useState, useEffect } from "react";
import {
  getAlbums,
  createAlbum,
  deleteAlbum,
  getAlbumPhotos,
} from "@/lib/api";
import type { Album, Photo } from "@/lib/api";
import { toAssetUrl } from "@/lib/assets";
import PhotoDetail from "@/components/PhotoDetail";

function AlbumView() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    try {
      const data = await getAlbums();
      setAlbums(data);
    } catch {
      // Not in Tauri
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createAlbum(name, newDesc.trim() || undefined);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await loadAlbums();
    } catch {
      // Error
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAlbum(id);
      if (selectedAlbum?.id === id) setSelectedAlbum(null);
      await loadAlbums();
    } catch {
      // Error
    }
  };

  if (selectedAlbum) {
    return (
      <AlbumDetail
        album={selectedAlbum}
        onBack={() => {
          setSelectedAlbum(null);
          loadAlbums();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)]">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">アルバム</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          + 新規アルバム
        </button>
      </div>

      {showCreate && (
        <div className="space-y-2 rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface)] p-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowCreate(false);
            }}
            placeholder="アルバム名..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
            autoFocus
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="説明（任意）..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {creating ? "作成中..." : "作成"}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setNewDesc("");
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {albums.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
          <p>アルバムがありません</p>
          <p className="mt-2 text-sm">
            アルバムを作成して、お気に入りの写真を整理しましょう。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((album) => (
            <div
              key={album.id}
              className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-primary)]"
            >
              <button
                onClick={() => setSelectedAlbum(album)}
                className="w-full text-left"
              >
                <div className="aspect-video bg-[var(--color-bg)]">
                  {album.cover_photo ? (
                    <img
                      src={toAssetUrl(album.cover_photo)}
                      alt={album.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-[var(--color-text-muted)]">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="truncate text-sm font-medium">
                    {album.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {album.photo_count} 枚
                  </p>
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(album.id);
                }}
                className="absolute right-2 top-2 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                title="削除"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumDetail({
  album,
  onBack,
}: {
  album: Album;
  onBack: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  useEffect(() => {
    getAlbumPhotos(album.id)
      .then((result) => setPhotos(result.photos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [album.id]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-semibold">{album.name}</h2>
          {album.description && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {album.description}
            </p>
          )}
        </div>
        <span className="text-sm text-[var(--color-text-muted)]">
          {photos.length} 枚
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)]">
          読み込み中...
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
          <p>このアルバムに写真がありません</p>
          <p className="mt-2 text-sm">
            写真グリッドで選択モードを使って、アルバムに写真を追加できます。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {photos.map((photo) => (
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
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate text-xs text-white">
                  {photo.world_name || photo.filename}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <PhotoDetail
        photoId={selectedPhotoId}
        photoIds={photos.map((p) => p.id)}
        onClose={() => setSelectedPhotoId(null)}
        onNavigate={setSelectedPhotoId}
      />
    </div>
  );
}

export default AlbumView;
