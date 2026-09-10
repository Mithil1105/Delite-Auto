import type { ElementType, ReactNode } from "react";
import clsx from "clsx";

/**
 * The two contained-width page primitives. "normal" (.container-page, max-w-1280) is the
 * default for Shop/PDP/text-heavy pages; "wide" (.container-wide, max-w-1320) is scoped to
 * content-heavy homepage sections (category strip, product carousels) — see the comment on
 * .container-wide in src/index.css for why it's still contained, not full-bleed.
 */
export function PageContainer({
  size = "normal",
  as: Tag = "div",
  className = "",
  children,
}: {
  size?: "normal" | "wide";
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={clsx(size === "wide" ? "container-wide" : "container-page", className)}>{children}</Tag>;
}
