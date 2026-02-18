import { useState, useEffect } from "react";
import { getIndexingStatus, getSidecarStatus } from "@/lib/api";
import type { SidecarStatus } from "@/lib/api";

interface StatusBarProps {
  photoCount: number;
}

function StatusBar({ photoCount }: StatusBarProps) {
  const [indexing, setIndexing] = useState({
    isRunning: false,
    processed: 0,
    total: 0,
  });
  const [sidecar, setSidecar] = useState<SidecarStatus | null>(null);

  useEffect(() => {
    // Check sidecar once on mount
    getSidecarStatus()
      .then(setSidecar)
      .catch(() => setSidecar({ available: false, gpu_available: false }));
  }, []);

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

  // Re-check sidecar every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      getSidecarStatus()
        .then(setSidecar)
        .catch(() => setSidecar({ available: false, gpu_available: false }));
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-4">
        <span>{photoCount.toLocaleString()} 枚</span>
        {indexing.isRunning && (
          <span>
            処理中: {indexing.processed}/{indexing.total}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {sidecar && (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                sidecar.available ? "bg-green-400" : "bg-neutral-500"
              }`}
            />
            <span>
              AI {sidecar.available ? (sidecar.gpu_available ? "GPU" : "CPU") : "OFF"}
            </span>
          </div>
        )}
        <span>VRCMemory v0.1.0</span>
      </div>
    </footer>
  );
}

export default StatusBar;
