// Simple global toast state
type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toasts: Toast[]) => void;

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener([...toasts]);
  }
}

export function showToast(message: string, type: ToastType = "info") {
  const id = nextId++;
  toasts = [...toasts, { id, message, type }];
  notify();

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    dismissToast(id);
  }, 3000);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export type { Toast, ToastType };
