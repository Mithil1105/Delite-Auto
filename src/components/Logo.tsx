export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-[3px] font-display font-semibold uppercase tracking-tightish ${className}`}>
      <span className={light ? "text-white" : "text-ink"}>Delite</span>
      <span className="text-accent">Auto</span>
    </span>
  );
}
