import { useState, useEffect } from "react";
import { getIndexingStatus } from "@/lib/api";

interface StatusBarProps {
  photoCount: number;
}

function StatusBar({ photoCount }: StatusBarProps) {
  const [indexing, setIndexing] = useState({
    isRunning: false,
    processed: 0,
    total: 0,
  });

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await getIndexingStatus();
        setIndexing({
          isRunning: status.is_running,
          processed: status.processed,
          total: status.total,
        });
      } catch {
        // Not running in Tauri
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-4">
        <span>{photoCount.toLocaleString()} 枚</span>
        {indexing.isRunning ? (
          <span>
            処理中: {indexing.processed}/{indexing.total}
          </span>
        ) : (
          <span>待機中</span>
        )}
      </div>
      <div>
        <span>VRCMemory v0.1.0</span>
      </div>
    </footer>
  );
}

export default StatusBar;
