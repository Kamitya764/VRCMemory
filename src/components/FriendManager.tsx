function FriendManager() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">フレンド管理</h2>
        <button className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white transition-colors hover:bg-[var(--color-primary-hover)]">
          + フレンド追加
        </button>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
        <p>フレンドが登録されていません</p>
        <p className="mt-2 text-sm">
          写真からフレンドのアバターを登録すると、
          <br />
          AI検索でフレンドの写真を見つけられます。
        </p>
      </div>
    </div>
  );
}

export default FriendManager;
