import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY = 50;
const COALESCE_MS = 500;

/**
 * Generic undo/redo for a CMS editor's in-progress draft object — client-side only, scoped to the
 * current editing session (not a database revision history; publishing still only ever writes the
 * single current draft, unchanged). `set(next)` both updates the live value and pushes a history
 * entry; `setWithoutHistory` (used when loading the initial draft from the server, or after a
 * successful Save Draft — see below) sets the value without creating an undo step, so "Undo" never
 * rewinds past what was actually loaded/saved.
 *
 * History coalescing (Documentations MD/delite-cms-visual-editor.md, "History coalescing"): every
 * `set()` call updates `value` immediately (so the preview reflects every keystroke live), but the
 * actual history PUSH is debounced — rapid-fire calls within COALESCE_MS of each other (e.g. every
 * keystroke while typing a heading) share one history frame, captured as the value from BEFORE the
 * whole burst started. Undo then reverts a whole burst of typing in one step, not one character at
 * a time. `undo()`/`redo()` flush any pending burst first, so hitting Undo mid-typing-burst always
 * reverts the in-progress edit before it ever considers an older frame.
 */
export function useUndoRedo<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const burstBaseline = useRef<{ value: T } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const clearPendingTimer = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  /** Commits whatever burst is currently pending into `past` immediately — used right before
   * undo/redo (so the in-progress edit is never silently skipped) and available for callers that
   * want to force a checkpoint (e.g. right before Save, though `setWithoutHistory` after a
   * successful save makes that moot — see the hook's own doc comment above). */
  const flush = useCallback(() => {
    clearPendingTimer();
    if (burstBaseline.current === null) return;
    past.current.push(burstBaseline.current.value);
    if (past.current.length > MAX_HISTORY) past.current.shift();
    burstBaseline.current = null;
    setCanUndo(true);
  }, [clearPendingTimer]);

  const set = useCallback(
    (next: T) => {
      setValue((prev) => {
        if (burstBaseline.current === null) burstBaseline.current = { value: prev };
        return next;
      });
      future.current = [];
      setCanRedo(false);
      setCanUndo(true);
      clearPendingTimer();
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        flush();
      }, COALESCE_MS);
    },
    [clearPendingTimer, flush]
  );

  const setWithoutHistory = useCallback(
    (next: T) => {
      clearPendingTimer();
      burstBaseline.current = null;
      past.current = [];
      future.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setValue(next);
    },
    [clearPendingTimer]
  );

  const undo = useCallback(() => {
    flush();
    setValue((current) => {
      const prev = past.current.pop();
      if (prev === undefined) return current;
      future.current.push(current);
      setCanUndo(past.current.length > 0);
      setCanRedo(true);
      return prev;
    });
  }, [flush]);

  const redo = useCallback(() => {
    flush();
    setValue((current) => {
      const next = future.current.pop();
      if (next === undefined) return current;
      past.current.push(current);
      setCanRedo(future.current.length > 0);
      setCanUndo(true);
      return next;
    });
  }, [flush]);

  // Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo) — centralized here so every editor
  // gets shortcuts for free instead of wiring a listener six times. Only one editor page is ever
  // mounted at a time (router-scoped), so a single document-level listener per hook instance is
  // safe. Skipped while a modifier-free typing context would otherwise lose native undo for
  // something this hook doesn't track (e.g. text still being composed) — in practice this hook's
  // coarse, coalesced history is exactly what Ctrl+Z should trigger even inside a focused input,
  // so `preventDefault()` deliberately overrides the browser's native per-keystroke undo there.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // Never let a debounce timer fire into an unmounted editor (e.g. navigating away mid-burst).
  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  return { value, set, setWithoutHistory, undo, redo, canUndo, canRedo };
}
