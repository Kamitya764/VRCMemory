import { useState, useEffect } from "react";
import { subscribeToasts, dismissToast } from "@/lib/toast";
import type { Toast } from "@/lib/toast";

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return subscribeToasts(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-14 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter flex items-center gap-2 rounded-lg border px-4 py-2 text-sm shadow-lg ${colorClass(toast.type)}`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            className="ml-2 opacity-50 hover:opacity-100"
            aria-label="閉じる"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function colorClass(type: Toast["type"]): string {
  switch (type) {
    case "success":
      return "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]";
    case "error":
      return "border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]";
    default:
      return "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]";
  }
}

export default ToastContainer;
