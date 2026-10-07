import { useCallback, useState } from "react";
import { AdminConfirmDialog } from "../components/AdminConfirmDialog";

/**
 * Promise-based replacement for `window.confirm()` inside the Admin CMS editors — resolves `true`
 * on "Discard Changes", `false` on "Keep Editing"/Escape/backdrop click. One instance per page is
 * enough; every discard-confirmation on that page (switching sections, canceling an in-progress
 * edit, publishing with unsaved changes) can share it. See
 * Documentations MD/delite-cms-visual-editor.md, "Unsaved-changes custom dialog".
 *
 * Usage: `const { confirm, dialog } = useConfirmDialog(); ... if (await confirm("message")) { ... }`
 * — render `{dialog}` once anywhere in the page's JSX.
 */
export function useConfirmDialog() {
  const [state, setState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (message: string, opts?: { title?: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean> =>
      new Promise((resolve) => {
        setState({ title: opts?.title ?? "Unsaved changes", message, confirmLabel: opts?.confirmLabel, cancelLabel: opts?.cancelLabel, resolve });
      }),
    []
  );

  const dialog = state ? (
    <AdminConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      onConfirm={() => {
        state.resolve(true);
        setState(null);
      }}
      onCancel={() => {
        state.resolve(false);
        setState(null);
      }}
    />
  ) : null;

  return { confirm, dialog };
}
