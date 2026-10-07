import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AdminConfirmDialog } from "../components/AdminConfirmDialog";

const MESSAGE = "You have unsaved changes. Leave without saving?";

/**
 * Warns before losing unsaved draft edits — both for a real browser-level exit (tab close,
 * refresh, typing a new URL) and for in-app navigation (sidebar links, the "back" link on an
 * editor page). This app uses a plain `<BrowserRouter>` (declarative, not a data router), so
 * `useBlocker` isn't available (it only works with `createBrowserRouter`) — the in-app half is
 * implemented with a capture-phase click listener on same-app `<a>` clicks instead, which works
 * with `react-router-dom`'s `<Link>` (a real `<a>` under a bubble-phase handler) without needing
 * to touch the router setup or wrap every `<Link>` individually.
 *
 * The in-app path shows the shared `AdminConfirmDialog` (Keep Editing / Discard Changes) instead
 * of a native `window.confirm()` — see Documentations MD/delite-cms-visual-editor.md,
 * "Unsaved-changes custom dialog". The browser-level `beforeunload` path stays native: modern
 * browsers always show their own chrome there and ignore any custom message, so there is nothing
 * to swap in.
 *
 * Returns JSX — the caller must render it (e.g. `const guardDialog = useUnsavedChangesGuard(dirty);
 * return <>...{guardDialog}</>`) for the dialog to ever appear; a hook's return value has no
 * effect on the page unless something actually renders it.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigate = useNavigate();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return; // ignore external links
      if (href === window.location.pathname + window.location.search) return; // same page
      // Always intercept first — the custom dialog resolves asynchronously, so the native
      // navigation must never be allowed to proceed while we're still asking.
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", onClickCapture, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);

  if (!pendingHref) return null;

  return (
    <AdminConfirmDialog
      open
      title="Unsaved changes"
      message={MESSAGE}
      confirmLabel="Discard Changes"
      cancelLabel="Keep Editing"
      onConfirm={() => {
        const href = pendingHref;
        setPendingHref(null);
        navigate(href);
      }}
      onCancel={() => setPendingHref(null)}
    />
  );
}
