import { useEffect } from "react";

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: "1 - 6", description: "ビュー切替（すべて〜分析）" },
  { keys: "Ctrl+K", description: "検索にフォーカス" },
  { keys: "← →", description: "写真詳細で前後に移動" },
  { keys: "F", description: "写真詳細でフルスクリーン切替" },
  { keys: "Esc", description: "ダイアログを閉じる" },
  { keys: "?", description: "このヘルプを表示" },
];

function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">キーボードショートカット</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1">
              <span className="text-sm text-[var(--color-text-muted)]">
                {s.description}
              </span>
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-xs font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShortcutHelp;
