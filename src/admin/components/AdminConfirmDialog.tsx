import { useEffect, useRef } from "react";

/**
 * Small centered confirmation modal — replaces native `window.confirm()` for the "discard unsaved
 * changes" flows across the CMS visual editors (Documentations MD/delite-cms-visual-editor.md,
 * "Unsaved-changes custom dialog"). Native `confirm()` can't be styled, isn't keyboard-trapped to
 * itself, and reads as a browser-chrome interruption rather than part of the Admin's own design
 * system. Same focus-trap/restore pattern as the shared analytics `Drawer`
 * (src/admin/analytics/ui.tsx) — Escape closes (treated as Cancel/"Keep Editing"), Tab is trapped
 * inside the dialog while open, and focus returns to whatever triggered it on close.
 *
 * `role="alertdialog"` (not `"dialog"`) — this always interrupts the user with a yes/no decision
 * about losing work, which is exactly what `alertdialog` is for.
 */
export function AdminConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Discard Changes",
  cancelLabel = "Keep Editing",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panel.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" data-testid="admin-confirm-dialog">
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} aria-hidden />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-dialog-title"
        aria-describedby="admin-confirm-dialog-message"
        className="relative w-full max-w-sm bg-white shadow-lift p-5"
      >
        <h2 id="admin-confirm-dialog-title" className="font-display text-[15px] uppercase tracking-wide mb-2">
          {title}
        </h2>
        <p id="admin-confirm-dialog-message" className="text-[13.5px] text-steel-600 mb-5">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button ref={cancelButton} type="button" onClick={onCancel} className="btn-outline">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="btn-dark">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
