import { useState, useEffect } from "react";
import { getWorldHistory } from "@/lib/api";
import type { WorldVisit } from "@/lib/api";

function WorldHistory() {
  const [visits, setVisits] = useState<WorldVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorldHistory()
      .then(setVisits)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)]">
        読み込み中...
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text)]">
          ワールド履歴
        </h2>
        <p>ワールド訪問履歴がありません</p>
        <p className="mt-2 text-sm">
          VRChatのログフォルダを設定すると、
          <br />
          ワールド訪問履歴が自動で記録されます。
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">ワールド履歴</h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {visits.length} 件
        </span>
      </div>

      <div className="space-y-2">
        {visits.map((visit) => (
          <div
            key={visit.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium">
                  {visit.world_name || "不明なワールド"}
                </h3>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                  <span>{formatDateTime(visit.entered_at)}</span>
                  {visit.left_at && (
                    <span>
                      ~ {formatTime(visit.left_at)} (
                      {calcDuration(visit.entered_at, visit.left_at)})
                    </span>
                  )}
                </div>
                {visit.players.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {visit.players.slice(0, 8).map((player) => (
                      <span
                        key={player}
                        className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
                      >
                        {player}
                      </span>
                    ))}
                    {visit.players.length > 8 && (
                      <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                        +{visit.players.length - 8}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="ml-2 shrink-0 rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                {visit.instance_type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDateTime(ts: string): string {
  try {
    const normalized = ts.replace(/\./g, "-").replace(" ", "T");
    const date = new Date(normalized);
    return date.toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatTime(ts: string): string {
  try {
    const normalized = ts.replace(/\./g, "-").replace(" ", "T");
    const date = new Date(normalized);
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function calcDuration(start: string, end: string): string {
  try {
    const s = new Date(start.replace(/\./g, "-").replace(" ", "T"));
    const e = new Date(end.replace(/\./g, "-").replace(" ", "T"));
    const diffMin = Math.round((e.getTime() - s.getTime()) / 60000);
    if (diffMin < 60) return `${diffMin}分`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${hours}時間${mins > 0 ? `${mins}分` : ""}`;
  } catch {
    return "";
  }
}

export default WorldHistory;
