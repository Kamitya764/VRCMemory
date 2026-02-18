function StatusBar() {
  return (
    <footer className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-4">
        <span>📁 0枚</span>
        <span>🔄 待機中</span>
      </div>
      <div>
        <span>VRCMemory v0.1.0</span>
      </div>
    </footer>
  );
}

export default StatusBar;
