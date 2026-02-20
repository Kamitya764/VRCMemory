import { useState, useEffect } from "react";
import { getWorldHistory, getWorldHistoryFiltered, getPhotoStats, buildEncounters } from "@/lib/api";
import { formatPlaytime, normalizeTimestamp } from "@/lib/format";
import { showToast } from "@/lib/toast";
import type { WorldVisit, PhotoStats } from "@/lib/api";

interface Stats {
  totalVisits: number;
  totalPlaytimeMin: number;
  topWorlds: { name: string; count: number }[];
  topFriends: { name: string; count: number }[];
  hourlyActivity: number[];
  weekdayActivity: number[];
  monthlyTrend: { month: string; count: number }[];
  instanceTypes: { type: string; count: number }[];
  avgSessionMin: number;
}

function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [photoStats, setPhotoStats] = useState<PhotoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [syncing, setSyncing] = useState(false);

  const loadStats = (from?: string, to?: string) => {
    setLoading(true);
    const hasFilter = from || to;
    const worldPromise = hasFilter
      ? getWorldHistoryFiltered(from || undefined, to || undefined)
      : getWorldHistory();

    Promise.all([
      worldPromise.then((visits) => setStats(computeStats(visits))),
      getPhotoStats().then(setPhotoStats).catch(() => {}),
    ])
      .catch(() => {
        showToast("データの取得に失敗しました", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleFilter = () => {
    loadStats(dateFrom, dateTo);
  };

  const handleClearFilter = () => {
    setDateFrom("");
    setDateTo("");
    loadStats();
  };

  const handleSyncEncounters = async () => {
    setSyncing(true);
    try {
      const count = await buildEncounters();
      if (count > 0) {
        showToast(`${count} 件のエンカウンターを検出しました`, "success");
      } else {
        showToast("新しいエンカウンターはありませんでした", "info");
      }
    } catch {
      showToast("エンカウンターの同期に失敗しました", "error");
    } finally {
      setSyncing(false);
    }
  };

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
  const maxWeekday = Math.max(...stats.weekdayActivity, 1);
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">プレイスタイル分析</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncEncounters}
            disabled={syncing}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            {syncing ? "同期中..." : "エンカウンター同期"}
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            {stats.totalVisits} 回のワールド訪問 / 合計{" "}
            {formatPlaytime(stats.totalPlaytimeMin)}
          </span>
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <span className="text-sm text-[var(--color-text-muted)]">期間:</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <span className="text-sm text-[var(--color-text-muted)]">〜</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <button
          onClick={handleFilter}
          disabled={!dateFrom && !dateTo}
          className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          適用
        </button>
        {(dateFrom || dateTo) && (
          <button
            onClick={handleClearFilter}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            クリア
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {photoStats && photoStats.total > 0 && (
          <>
            <SummaryCard label="写真" value={photoStats.total.toLocaleString()} suffix="枚" />
            <SummaryCard label="キャプション" value={photoStats.with_caption.toLocaleString()} suffix="枚" />
          </>
        )}
        <SummaryCard label="平均セッション" value={formatPlaytime(stats.avgSessionMin)} />
        <SummaryCard label="プレイヤー数" value={stats.topFriends.length.toLocaleString()} suffix="人" />
      </div>

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
                  title={`${hour}時: ${count}回`}
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

        {/* Weekday activity */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
            曜日別活動
          </h3>
          <div className="flex h-28 items-end gap-1">
            {stats.weekdayActivity.map((count, day) => (
              <div key={day} className="group flex flex-1 flex-col items-center">
                <div
                  className={`w-full rounded-t transition-colors ${
                    day === 0 || day === 6
                      ? "bg-[var(--color-primary)] group-hover:bg-[var(--color-primary-hover)]"
                      : "bg-[var(--color-primary)]/60 group-hover:bg-[var(--color-primary)]/80"
                  }`}
                  style={{
                    height: `${(count / maxWeekday) * 100}%`,
                    minHeight: count > 0 ? "2px" : "0",
                  }}
                  title={`${weekdayLabels[day]}: ${count}回`}
                />
                <span className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                  {weekdayLabels[day]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly trend */}
        {stats.monthlyTrend.length > 1 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:col-span-2">
            <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
              月別トレンド
            </h3>
            <div className="flex h-24 items-end gap-1">
              {(() => {
                const maxMonthly = Math.max(...stats.monthlyTrend.map((m) => m.count), 1);
                return stats.monthlyTrend.map((m) => (
                  <div key={m.month} className="group flex flex-1 flex-col items-center">
                    <div
                      className="w-full rounded-t bg-[var(--color-primary)]/70 transition-colors group-hover:bg-[var(--color-primary)]"
                      style={{
                        height: `${(m.count / maxMonthly) * 100}%`,
                        minHeight: m.count > 0 ? "2px" : "0",
                      }}
                      title={`${m.month}: ${m.count}回`}
                    />
                    <span className="mt-1 text-[8px] text-[var(--color-text-muted)]">
                      {m.month.slice(5)}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

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

function SummaryCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {value}
        {suffix && (
          <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">
            {suffix}
          </span>
        )}
      </p>
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
  const weekdayActivity = new Array(7).fill(0) as number[];
  const monthlyCounts = new Map<string, number>();
  const instanceCounts = new Map<string, number>();
  let totalPlaytimeMin = 0;
  let sessionCount = 0;

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

    // Weekday
    const weekday = parseWeekday(visit.entered_at);
    if (weekday !== null) {
      weekdayActivity[weekday]++;
    }

    // Monthly
    const month = visit.entered_at.slice(0, 7); // YYYY-MM
    if (month.length === 7) {
      monthlyCounts.set(month, (monthlyCounts.get(month) || 0) + 1);
    }

    const iType = visit.instance_type || "Unknown";
    instanceCounts.set(iType, (instanceCounts.get(iType) || 0) + 1);

    if (visit.left_at) {
      const duration = calcDurationMin(visit.entered_at, visit.left_at);
      if (duration > 0) {
        totalPlaytimeMin += duration;
        sessionCount++;
      }
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

  const monthlyTrend = [...monthlyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));

  const avgSessionMin = sessionCount > 0 ? Math.round(totalPlaytimeMin / sessionCount) : 0;

  return {
    totalVisits: visits.length,
    totalPlaytimeMin,
    topWorlds,
    topFriends,
    hourlyActivity,
    weekdayActivity,
    monthlyTrend,
    instanceTypes,
    avgSessionMin,
  };
}

function parseHour(ts: string): number | null {
  const match = ts.match(/(\d{2}):\d{2}:\d{2}/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function parseWeekday(ts: string): number | null {
  try {
    const date = new Date(normalizeTimestamp(ts));
    return date.getDay();
  } catch {
    return null;
  }
}

function calcDurationMin(start: string, end: string): number {
  try {
    const s = new Date(normalizeTimestamp(start));
    const e = new Date(normalizeTimestamp(end));
    return Math.round((e.getTime() - s.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export default Analytics;
