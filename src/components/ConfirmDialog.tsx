import { useEffect, useRef, useId } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "削除",
  cancelLabel = "キャンセル",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const uniqueId = useId();
  const titleId = `confirm-dialog-title-${uniqueId}`;
  const messageId = `confirm-dialog-message-${uniqueId}`;

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white"
      : "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/80 text-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <div className="w-full max-w-sm rounded-lg bg-[var(--color-surface)] p-6 shadow-xl">
        <h3 id={titleId} className="text-lg font-semibold">{title}</h3>
        <p id={messageId} className="mt-2 text-sm text-[var(--color-text-muted)]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
