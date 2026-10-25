import { useState, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Collapsible panel that animates its height (grid-template-rows 0fr → 1fr) instead of mounting and
 * unmounting — the instant mount made the page jump when a section opened. Children mount on first
 * open (so e.g. the reviews fetch stays lazy) and stay mounted afterwards; a closed panel is `inert`
 * so its contents can't be tabbed into.
 */
export function AccordionPanel({ open, id, labelledBy, children }: { open: boolean; id: string; labelledBy: string; children: ReactNode }) {
  const [everOpen, setEverOpen] = useState(open);
  if (open && !everOpen) setEverOpen(true);
  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      inert={!open}
      className={clsx(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden">{everOpen && <div className="pb-6">{children}</div>}</div>
    </div>
  );
}
