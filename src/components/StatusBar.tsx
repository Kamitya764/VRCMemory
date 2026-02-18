import { useState, useEffect, useRef } from "react";
import { getIndexingStatus, getSidecarStatus } from "@/lib/api";
import type { SidecarStatus } from "@/lib/api";
import { APP_VERSION } from "@/lib/constants";

interface StatusBarProps {
  photoCount: number;
}

const INDEXING_POLL_MS = 2000;
const IDLE_POLL_MS = 15000;
const SIDECAR_POLL_MS = 30000;

function StatusBar({ photoCount }: StatusBarProps) {
  const [indexing, setIndexing] = useState({
    isRunning: false,
    processed: 0,
    total: 0,
  });
  const [sidecar, setSidecar] = useState<SidecarStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    // Check sidecar once on mount
    getSidecarStatus()
      .then(setSidecar)
      .catch(() => setSidecar({ available: false, gpu_available: false }));
  }, []);

  // Adaptive polling: fast when indexing, slow when idle
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await getIndexingStatus();
        setIndexing((prev) => {
          // Only update state if values actually changed
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
      } catch {
        // Not running in Tauri
      }
    };

    // Initial check
    poll();

    const currentInterval = indexing.isRunning ? INDEXING_POLL_MS : IDLE_POLL_MS;
    intervalRef.current = setInterval(poll, currentInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [indexing.isRunning]);

  // Re-check sidecar every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      getSidecarStatus()
        .then(setSidecar)
        .catch(() => setSidecar({ available: false, gpu_available: false }));
    }, SIDECAR_POLL_MS);

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
