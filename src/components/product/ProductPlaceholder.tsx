import clsx from "clsx";
import { Icon } from "../../lib/icons";

/**
 * Restrained fallback for when no real product photo exists — deliberately visually muted
 * (a flat neutral tile + a single line-weight icon) so it reads as "no photo yet", not as a
 * stand-in real photo. No gradient, no diagonal texture, no decorative circles, no drop shadow —
 * see ProductArt.tsx for the older, more decorative version this replaces on product cards.
 */
export function ProductPlaceholder({
  icon,
  className = "",
  iconClassName = "w-10 h-10",
}: {
  icon: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-center bg-steel-50", className)}>
      <Icon name={icon} className={clsx("text-steel-300", iconClassName)} strokeWidth={1.4} />
    </div>
  );
}
