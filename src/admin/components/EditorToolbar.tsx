import { Undo2, Redo2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared toolbar row for the CMS editors — Undo/Redo + a Saved/Unsaved indicator, with `children`
 * for the editor-specific Save Draft/Publish buttons (Promotions publishes per-row, others publish
 * the whole page via `cms_publish_page()`, so that part stays editor-owned rather than forced into
 * one shape here).
 */
export function EditorToolbar({
  dirty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  children,
}: {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11.5px] text-steel-500">{dirty ? "Unsaved changes" : "Saved"}</span>
      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)" className="grid place-items-center w-7 h-7 rounded-full border border-line text-steel-600 hover:border-ink disabled:opacity-30">
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" className="grid place-items-center w-7 h-7 rounded-full border border-line text-steel-600 hover:border-ink disabled:opacity-30">
        <Redo2 className="w-3.5 h-3.5" />
      </button>
      {children}
    </div>
  );
}
