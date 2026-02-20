import { useState, useEffect, useRef, useCallback } from "react";
import { getIndexingStatus, getSidecarStatus } from "@/lib/api";
import type { SidecarStatus } from "@/lib/api";
import { APP_VERSION, POLL_INDEXING_MS, POLL_IDLE_MS, POLL_SIDECAR_MS } from "@/lib/constants";

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
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const isRunningRef = useRef(false);

  useEffect(() => {
    // Check sidecar once on mount
    getSidecarStatus()
      .then(setSidecar)
      .catch(() => setSidecar({ available: false, gpu_available: false }));
  }, []);

  const poll = useCallback(async () => {
    try {
      const status = await getIndexingStatus();
      const newIsRunning = status.is_running;

      setIndexing((prev) => {
        if (
          prev.isRunning === status.is_running &&
          prev.processed === status.processed &&
          prev.total === status.total
        ) {
          return prev;
        }
        return {
          isRunning: status.is_running,
          processed: status.processed,
          total: status.total,
        };
      });

      // If running state changed, restart interval with appropriate speed
      if (newIsRunning !== isRunningRef.current) {
        isRunningRef.current = newIsRunning;
        if (intervalRef.current) clearInterval(intervalRef.current);
        const nextInterval = newIsRunning ? POLL_INDEXING_MS : POLL_IDLE_MS;
        intervalRef.current = setInterval(poll, nextInterval);
      }
    } catch {
      // Not running in Tauri
    }
  }, []);

  // Single effect for indexing polling - no dependency on isRunning state
  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_IDLE_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  // Re-check sidecar periodically
  useEffect(() => {
    const interval = setInterval(() => {
      getSidecarStatus()
        .then(setSidecar)
        .catch(() => setSidecar({ available: false, gpu_available: false }));
    }, POLL_SIDECAR_MS);

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
                sidecar.available ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]"
              }`}
              aria-hidden="true"
            />
            <span>
              AI {sidecar.available ? (sidecar.gpu_available ? "GPU" : "CPU") : "OFF"}
            </span>
          </div>
        )}
        <span>VRCMemory {APP_VERSION}</span>
      </div>
    </footer>
  );
}

export default StatusBar;
