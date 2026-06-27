"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type { Toast } from "./page-types";

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div className="toastStack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          className="toast"
          key={toast.id}
          data-kind={toast.kind}
          role="status"
        >
          {toast.kind === "danger" ? (
            <AlertCircle size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="toastClose"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
