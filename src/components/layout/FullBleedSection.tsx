import type { ElementType, ReactNode } from "react";
import clsx from "clsx";
import { PageContainer } from "./PageContainer";

const SPACING_CLASS = {
  none: "",
  compact: "section-pad-compact",
  normal: "section-pad-normal",
  large: "section-pad-large",
} as const;

/**
 * Formalizes the full-bleed-background + contained-content pattern used throughout Home.tsx:
 * the section element spans the full viewport width (its background can be any color/edge to
 * edge), while its content sits inside a PageContainer. Spacing is chosen per section rather
 * than applying one blanket value everywhere — see Documentations MD/frontend-foundation-uiux-refactor.md.
 */
export function FullBleedSection({
  as: Tag = "section",
  spacing = "normal",
  containerSize,
  className = "",
  children,
}: {
  as?: ElementType;
  spacing?: "none" | "compact" | "normal" | "large";
  containerSize?: "normal" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={clsx(SPACING_CLASS[spacing], className)}>
      {containerSize ? <PageContainer size={containerSize}>{children}</PageContainer> : children}
    </Tag>
  );
}
