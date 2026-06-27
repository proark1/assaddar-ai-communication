"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Toast, ToastKind } from "./page-types";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility helper for modal/drawer dialogs.
 *
 * While `active` is true it:
 *  - moves focus into the dialog (first focusable element, falling back to the
 *    container itself),
 *  - traps Tab / Shift+Tab focus inside the dialog,
 *  - closes the dialog on Escape via `onClose`,
 *  - restores focus to the previously-focused element when it closes.
 */
export function useDialogA11y(
  active: boolean,
  onClose: () => void,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const container = ref.current;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      if (!container) {
        return;
      }
      const focusable =
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const firstFocusable = focusable[0];
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.focus();
      }
    };
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !container) {
        return;
      }
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const previous = previousFocus.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [active, onClose]);

  return ref;
}

/** In-memory toast queue with auto-dismiss. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string) => {
      if (!message) {
        return;
      }
      const id =
        Date.now() +
        Math.floor(Math.random() * 1000) +
        Object.keys(timers.current).length;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      timers.current[id] = setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}
