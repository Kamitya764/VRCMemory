function Analytics() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">プレイスタイル分析</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Activity heatmap placeholder */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            活動時間帯
          </h3>
          <div className="flex h-32 items-center justify-center text-[var(--color-text-muted)]">
            データなし
          </div>
        </div>

        {/* World genre breakdown placeholder */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            ワールドジャンル
          </h3>
          <div className="flex h-32 items-center justify-center text-[var(--color-text-muted)]">
            データなし
          </div>
        </div>

        {/* Frequent friends placeholder */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            よく会うフレンド
          </h3>
          <div className="flex h-32 items-center justify-center text-[var(--color-text-muted)]">
            データなし
          </div>
        </div>

        {/* Playtime chart placeholder */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            月間プレイ時間
          </h3>
          <div className="flex h-32 items-center justify-center text-[var(--color-text-muted)]">
            データなし
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
