import { useState, useEffect } from "react";
import { getWorldHistory, getPhotoStats } from "@/lib/api";
import type { WorldVisit, PhotoStats } from "@/lib/api";

interface Stats {
  totalVisits: number;
  totalPlaytimeMin: number;
  topWorlds: { name: string; count: number }[];
  topFriends: { name: string; count: number }[];
  hourlyActivity: number[];
  instanceTypes: { type: string; count: number }[];
}

function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [photoStats, setPhotoStats] = useState<PhotoStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getWorldHistory().then((visits) => setStats(computeStats(visits))),
      getPhotoStats().then(setPhotoStats).catch(() => {}),
    ])
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

  if (!stats || stats.totalVisits === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">プレイスタイル分析</h2>
        {photoStats && photoStats.total > 0 && (
          <PhotoStatsCards stats={photoStats} />
        )}
        <div className="grid grid-cols-2 gap-4">
          <EmptyCard title="活動時間帯" />
          <EmptyCard title="ワールドランキング" />
          <EmptyCard title="よく会うフレンド" />
          <EmptyCard title="インスタンスタイプ" />
        </div>
      </div>
    );
  }

  const maxHourly = Math.max(...stats.hourlyActivity, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">プレイスタイル分析</h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {stats.totalVisits} 回のワールド訪問 / 合計{" "}
          {formatPlaytime(stats.totalPlaytimeMin)}
        </span>
      </div>

      {/* Photo stats summary */}
      {photoStats && photoStats.total > 0 && (
        <PhotoStatsCards stats={photoStats} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Hourly activity */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
            活動時間帯
          </h3>
          <div className="flex h-28 items-end gap-0.5">
            {stats.hourlyActivity.map((count, hour) => (
              <div key={hour} className="group relative flex flex-1 flex-col items-center">
                <div
                  className="w-full rounded-t bg-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary-hover)]"
                  style={{
                    height: `${(count / maxHourly) * 100}%`,
                    minHeight: count > 0 ? "2px" : "0",
                  }}
                />
                {hour % 6 === 0 && (
                  <span className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                    {hour}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Top worlds */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
            よく訪れるワールド
          </h3>
          {stats.topWorlds.length > 0 ? (
            <div className="space-y-2">
              {stats.topWorlds.map((w, i) => (
                <div key={w.name} className="flex items-center gap-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-[var(--color-text-muted)]">
                    {i + 1}.
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{w.name || "不明"}</span>
                      <span className="ml-2 shrink-0 text-xs text-[var(--color-text-muted)]">
                        {w.count}回
                      </span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)]"
                        style={{
                          width: `${(w.count / (stats.topWorlds[0]?.count || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">データなし</p>
          )}
        </div>

        {/* Top friends */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
            よく会うプレイヤー
          </h3>
          {stats.topFriends.length > 0 ? (
            <div className="space-y-2">
              {stats.topFriends.map((f, i) => (
                <div key={f.name} className="flex items-center gap-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-[var(--color-text-muted)]">
                    {i + 1}.
                  </span>
                  <div className="flex flex-1 items-center justify-between">
                    <span className="truncate">{f.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-[var(--color-text-muted)]">
                      {f.count}回
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">データなし</p>
          )}
        </div>

        {/* Instance types */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
            インスタンスタイプ
          </h3>
          {stats.instanceTypes.length > 0 ? (
            <div className="space-y-2">
              {stats.instanceTypes.map((it) => (
                <div key={it.type} className="flex items-center justify-between text-sm">
                  <span>{it.type}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--color-bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)]"
                        style={{
                          width: `${(it.count / stats.totalVisits) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-[var(--color-text-muted)]">
                      {Math.round((it.count / stats.totalVisits) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">データなし</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoStatsCards({ stats }: { stats: PhotoStats }) {
  const cards = [
    { label: "写真", value: stats.total.toLocaleString(), suffix: "枚" },
    { label: "キャプション済", value: stats.with_caption.toLocaleString(), suffix: "枚" },
    { label: "ワールド紐付", value: stats.with_world.toLocaleString(), suffix: "枚" },
    { label: "サムネイル", value: stats.with_thumbnail.toLocaleString(), suffix: "枚" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <p className="text-xs text-[var(--color-text-muted)]">{card.label}</p>
          <p className="mt-1 text-xl font-semibold">
            {card.value}
            <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">
              {card.suffix}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyCard({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
        {title}
      </h3>
      <div className="flex h-32 items-center justify-center text-[var(--color-text-muted)]">
        データなし
      </div>
    </div>
  );
}

function computeStats(visits: WorldVisit[]): Stats {
  const worldCounts = new Map<string, number>();
  const friendCounts = new Map<string, number>();
  const hourlyActivity = new Array(24).fill(0) as number[];
  const instanceCounts = new Map<string, number>();
  let totalPlaytimeMin = 0;

  for (const visit of visits) {
    const wName = visit.world_name || "不明";
    worldCounts.set(wName, (worldCounts.get(wName) || 0) + 1);

    for (const player of visit.players) {
      friendCounts.set(player, (friendCounts.get(player) || 0) + 1);
    }

    const hour = parseHour(visit.entered_at);
    if (hour !== null) {
      hourlyActivity[hour]++;
    }

    const iType = visit.instance_type || "Unknown";
    instanceCounts.set(iType, (instanceCounts.get(iType) || 0) + 1);

    if (visit.left_at) {
      const duration = calcDurationMin(visit.entered_at, visit.left_at);
      if (duration > 0) totalPlaytimeMin += duration;
    }
  }

  const topWorlds = [...worldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const topFriends = [...friendCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const instanceTypes = [...instanceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  return {
    totalVisits: visits.length,
    totalPlaytimeMin,
    topWorlds,
    topFriends,
    hourlyActivity,
    instanceTypes,
  };
}

function parseHour(ts: string): number | null {
  const match = ts.match(/(\d{2}):\d{2}:\d{2}/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function calcDurationMin(start: string, end: string): number {
  try {
    const s = new Date(start.replace(/\./g, "-").replace(" ", "T"));
    const e = new Date(end.replace(/\./g, "-").replace(" ", "T"));
    return Math.round((e.getTime() - s.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}時間${mins > 0 ? `${mins}分` : ""}`;
}

export default Analytics;
