import { useState, useEffect } from "react";
import { getFriends, addFriend, deleteFriend } from "@/lib/api";
import type { Friend } from "@/lib/api";

function FriendManager() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

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
    } catch {
      // Error handling
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
              className="group flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              {/* Avatar placeholder */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-lg">
                {friend.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1">
                <h3 className="font-medium">{friend.name}</h3>
                {friend.notes && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {friend.notes}
                  </p>
                )}
              </div>

              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDate(friend.created_at)}
              </span>

              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await deleteFriend(friend.id);
                    await loadFriends();
                  } catch {
                    // Error
                  }
                }}
                className="rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                title="削除"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        {friends.length} 人のフレンド
      </p>
    </div>
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
