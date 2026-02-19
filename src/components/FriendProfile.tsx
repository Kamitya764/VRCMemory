import { useState, useEffect, useCallback } from "react";
import type { Encounter, FriendStats } from "@/lib/api";
import { getFriendEncounters, getFriendStats, buildEncounters } from "@/lib/api";
import { formatDateShort } from "@/lib/format";
import { showToast } from "@/lib/toast";

interface FriendProfileProps {
  friendId: string;
  onClose: () => void;
}

function FriendProfile({ friendId, onClose }: FriendProfileProps) {
  const [stats, setStats] = useState<FriendStats | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        getFriendStats(friendId),
        getFriendEncounters(friendId),
      ]);
      setStats(s);
      setEncounters(e);
    } catch {
      showToast("プロフィールの読み込みに失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const count = await buildEncounters();
      if (count > 0) {
        showToast(`${count} 件のエンカウンターを検出しました`, "success");
        await loadData();
      } else {
        showToast("新しいエンカウンターはありませんでした", "info");
      }
    } catch {
      showToast("エンカウンターの同期に失敗しました", "error");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <div className="flex items-center gap-3">
            {stats && (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-lg font-bold">
                {stats.friend_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="font-semibold">
                {stats?.friend_name || "読み込み中..."}
              </h2>
              {stats && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  フレンドプロフィール
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
            読み込み中...
          </div>
        ) : stats ? (
          <div className="space-y-4 p-4">
            {/* Stats overview */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="エンカウンター"
                value={stats.encounter_count.toString()}
              />
              <StatCard
                label="最終"
                value={stats.last_met ? formatDateShort(stats.last_met) : "-"}
              />
              <StatCard
                label="ワールド数"
                value={stats.top_worlds.length.toString()}
              />
            </div>

            {/* Top worlds */}
            {stats.top_worlds.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
                  よく会うワールド
                </h3>
                <div className="space-y-1">
                  {stats.top_worlds.map(([worldName, count]) => {
                    const maxCount = stats.top_worlds[0][1];
                    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return (
                      <div key={worldName} className="flex items-center gap-2">
                        <div className="relative h-5 flex-1 overflow-hidden rounded bg-[var(--color-surface)]">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-[var(--color-primary)]/20"
                            style={{ width: `${pct}%` }}
                          />
                          <span className="relative z-10 px-2 text-xs leading-5">
                            {worldName}
                          </span>
                        </div>
                        <span className="w-8 text-right text-xs text-[var(--color-text-muted)]">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Encounter history */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--color-text-muted)]">
                  エンカウンター履歴
                </h3>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
                >
                  {syncing ? "同期中..." : "同期"}
                </button>
              </div>

              {encounters.length === 0 ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-text-muted)]">
                  <p>エンカウンターが見つかりません</p>
                  <p className="mt-1">
                    「同期」をクリックすると、ワールド訪問履歴から
                    <br />
                    自動的にエンカウンターを検出します。
                  </p>
                </div>
              ) : (
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {encounters.map((enc) => (
                    <div
                      key={enc.id}
                      className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium">
                          {enc.world_name}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                        {formatDateShort(enc.met_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}


export default FriendProfile;
