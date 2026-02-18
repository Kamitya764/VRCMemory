import { useState, useEffect, useRef } from "react";
import {
  getFriends,
  addFriend,
  deleteFriend,
  updateFriendNotes,
  updateFriendName,
  addAvatar,
  deleteAvatar,
} from "@/lib/api";
import type { Friend, Avatar } from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import FriendProfile from "@/components/FriendProfile";
import { showToast } from "@/lib/toast";

function FriendManager() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Friend | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const data = await getFriends();
      setFriends(data);
    } catch {
      // Not running in Tauri
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;

    setAdding(true);
    try {
      await addFriend(name);
      setNewName("");
      setShowAddForm(false);
      await loadFriends();
      showToast(`「${name}」を追加しました`, "success");
    } catch {
      showToast("フレンドの追加に失敗しました", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
    if (e.key === "Escape") {
      setShowAddForm(false);
      setNewName("");
    }
  };

  const handleSaveNotes = async (id: string, notes: string) => {
    const value = notes.trim() || null;
    try {
      await updateFriendNotes(id, value);
      setFriends((prev) =>
        prev.map((f) => (f.id === id ? { ...f, notes: value } : f)),
      );
    } catch {
      showToast("メモの保存に失敗しました", "error");
    }
  };

  const handleRename = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateFriendName(id, trimmed);
      setFriends((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
      );
    } catch {
      showToast("名前の変更に失敗しました", "error");
    }
  };

  const handleDeleteFriend = async (friend: Friend) => {
    try {
      await deleteFriend(friend.id);
      await loadFriends();
      showToast(`「${friend.name}」を削除しました`, "success");
    } catch {
      showToast("フレンドの削除に失敗しました", "error");
    }
  };

  const handleAddAvatar = async (friendId: string, avatarName: string) => {
    try {
      const avatar = await addAvatar(friendId, avatarName);
      setFriends((prev) =>
        prev.map((f) =>
          f.id === friendId
            ? { ...f, avatars: [...f.avatars, avatar] }
            : f,
        ),
      );
      showToast("アバターを追加しました", "success");
    } catch {
      showToast("アバターの追加に失敗しました", "error");
    }
  };

  const handleDeleteAvatar = async (friendId: string, avatarId: string) => {
    try {
      await deleteAvatar(avatarId);
      setFriends((prev) =>
        prev.map((f) =>
          f.id === friendId
            ? { ...f, avatars: f.avatars.filter((a) => a.id !== avatarId) }
            : f,
        ),
      );
      showToast("アバターを削除しました", "success");
    } catch {
      showToast("アバターの削除に失敗しました", "error");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">フレンド管理</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          + フレンド追加
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="flex gap-2 rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface)] p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="フレンド名を入力..."
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {adding ? "追加中..." : "追加"}
          </button>
          <button
            onClick={() => {
              setShowAddForm(false);
              setNewName("");
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* Friend list */}
      {friends.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
          <p>フレンドが登録されていません</p>
          <p className="mt-2 text-sm">
            フレンドを追加すると、写真やワールド訪問履歴と
            <br />
            紐づけて管理できます。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <div className="flex items-center gap-3 p-3">
                {/* Avatar placeholder */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-lg">
                  {friend.name.charAt(0).toUpperCase()}
                </div>

                <button
                  onClick={() =>
                    setExpandedId(
                      expandedId === friend.id ? null : friend.id,
                    )
                  }
                  className="flex-1 text-left"
                >
                  <h3 className="font-medium">{friend.name}</h3>
                  <div className="flex items-center gap-2">
                    {friend.notes && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {friend.notes}
                      </p>
                    )}
                    {friend.avatars.length > 0 && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {friend.avatars.length} アバター
                      </span>
                    )}
                  </div>
                </button>

                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatDate(friend.created_at)}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileId(friend.id);
                  }}
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
                  title="プロフィール"
                >
                  詳細
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(friend);
                  }}
                  className="rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 [.group:hover>&]:opacity-100"
                  title="削除"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                  >
                    <path
                      d="M3 3L11 11M11 3L3 11"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Expanded edit panel */}
              {expandedId === friend.id && (
                <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3">
                  <div className="space-y-3">
                    <InlineEdit
                      label="名前"
                      value={friend.name}
                      onSave={(name) => handleRename(friend.id, name)}
                    />
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        メモ
                      </span>
                      <NotesArea
                        value={friend.notes || ""}
                        onSave={(text) =>
                          handleSaveNotes(friend.id, text)
                        }
                      />
                    </div>

                    {/* Avatar section */}
                    <AvatarSection
                      friend={friend}
                      onAdd={(name) => handleAddAvatar(friend.id, name)}
                      onDelete={(avatarId) => handleDeleteAvatar(friend.id, avatarId)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        {friends.length} 人のフレンド
      </p>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="フレンドを削除"
        message={`「${deleteTarget?.name || ""}」を削除しますか？`}
        confirmLabel="削除"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) handleDeleteFriend(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {profileId && (
        <FriendProfile
          friendId={profileId}
          onClose={() => setProfileId(null)}
        />
      )}
    </div>
  );
}

function AvatarSection({
  friend,
  onAdd,
  onDelete,
}: {
  friend: Friend;
  onAdd: (name: string) => void;
  onDelete: (avatarId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [avatarName, setAvatarName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleSubmit = () => {
    const name = avatarName.trim();
    if (!name) return;
    onAdd(name);
    setAvatarName("");
    setShowForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-muted)]">
          アバター ({friend.avatars.length})
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-[var(--color-primary)] transition-colors hover:underline"
        >
          + 追加
        </button>
      </div>

      {showForm && (
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={avatarName}
            onChange={(e) => setAvatarName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") setShowForm(false);
            }}
            placeholder="アバター名..."
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!avatarName.trim()}
            className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            追加
          </button>
        </div>
      )}

      {friend.avatars.length > 0 && (
        <div className="mt-1 space-y-1">
          {friend.avatars.map((avatar) => (
            <AvatarRow
              key={avatar.id}
              avatar={avatar}
              onDelete={() => setDeleteId(avatar.id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="アバターを削除"
        message="このアバターを削除しますか？"
        confirmLabel="削除"
        variant="danger"
        onConfirm={() => {
          if (deleteId) onDelete(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function AvatarRow({
  avatar,
  onDelete,
}: {
  avatar: Avatar;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--color-surface-hover)] text-xs">
        {avatar.name.charAt(0)}
      </div>
      <span className="flex-1 truncate text-xs">{avatar.name}</span>
      {avatar.reference_images.length > 0 && (
        <span className="text-xs text-[var(--color-text-muted)]">
          {avatar.reference_images.length} 画像
        </span>
      )}
      <button
        onClick={onDelete}
        className="rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-red-400"
        title="削除"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function InlineEdit({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <div>
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
        <button
          onClick={() => {
            setText(value);
            setEditing(true);
          }}
          className="block text-sm transition-colors hover:text-[var(--color-primary)]"
        >
          {value}
        </button>
      </div>
    );
  }

  return (
    <div>
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(text);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => {
          onSave(text);
          setEditing(false);
        }}
        className="block w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
      />
    </div>
  );
}

function NotesArea({
  value,
  onSave,
}: {
  value: string;
  onSave: (val: string) => void;
}) {
  const [text, setText] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debouncedSave = (newText: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSave(newText), 800);
  };

  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        debouncedSave(e.target.value);
      }}
      rows={2}
      className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]"
      placeholder="メモを入力..."
    />
  );
}

function formatDate(datetime: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default FriendManager;
