import { useState, type MouseEvent, type FormEvent, type ReactNode } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";

export type Breakpoint = "desktop" | "tablet" | "mobile";

const WIDTHS: Record<Breakpoint, number> = { desktop: 1280, tablet: 768, mobile: 390 };
const ICONS: Record<Breakpoint, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };

/** Neutralizes navigation/mutation-triggering interactions inside a mounted real storefront
 * component (Header nav, Footer links, Hero/Promotions CTAs, product cards) without disabling
 * hover/focus/CSS — only `a`/`button`/`[role=button]` clicks and all `submit` events are stopped,
 * so the preview can safely reuse real components instead of a rebuilt mockup. */
function neutralizeInteractiveClick(e: MouseEvent<HTMLElement>) {
  const target = (e.target as HTMLElement).closest("a, button, [role=button]");
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();
}

function neutralizeSubmit(e: FormEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Desktop / Tablet / Mobile preview toggle — wraps any live CMS preview (Hero, Announcement,
 * Promotions, the per-section Homepage preview, ...) in a width-constrained frame so an editor can
 * see the SAME real component at each real breakpoint, not just whatever width their own browser
 * window happens to be. Purely a rendering aid — the draft content underneath is identical at
 * every width, only the viewport constraint changes.
 */
export function PreviewFrame({ children, label }: { children: ReactNode | ((breakpoint: Breakpoint) => ReactNode); label?: string }) {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const width = WIDTHS[breakpoint];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display uppercase text-[12px] text-steel-500">{label ?? "Live Preview (draft)"}</h3>
        <div className="inline-flex items-center rounded-full border border-line bg-white p-[3px]">
          {(Object.keys(WIDTHS) as Breakpoint[]).map((bp) => {
            const Icon = ICONS[bp];
            const active = breakpoint === bp;
            return (
              <button
                key={bp}
                type="button"
                onClick={() => setBreakpoint(bp)}
                aria-pressed={active}
                aria-label={bp}
                title={`${bp[0].toUpperCase()}${bp.slice(1)} (${WIDTHS[bp]}px)`}
                className={`grid place-items-center w-7 h-7 rounded-full transition-colors ${active ? "bg-ink text-white" : "text-steel-500 hover:text-ink"}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="border border-line overflow-x-hidden overflow-y-auto bg-steel-50 max-h-[720px]">
        <div
          style={{ width, maxWidth: "100%" }}
          className="mx-auto bg-white transition-[width] duration-150"
          onClickCapture={neutralizeInteractiveClick}
          onSubmitCapture={neutralizeSubmit}
        >
          {typeof children === "function" ? children(breakpoint) : children}
        </div>
      </div>
    </div>
  );
}
