import { useState, useEffect, useRef } from "react";
import {
  getFriends,
  addFriend,
  deleteFriend,
  updateFriendNotes,
  updateFriendName,
} from "@/lib/api";
import type { Friend } from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/lib/toast";

function FriendManager() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Friend | null>(null);

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
                  {friend.notes && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {friend.notes}
                    </p>
                  )}
                </button>

                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatDate(friend.created_at)}
                </span>

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
