import { useEffect, useState } from "react";
import { Gift, Heart, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Tag, Truck, Wallet, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useLang } from "../../i18n/LanguageContext";
import { useSiteChromeCms } from "../../hooks/useSiteChromeCms";

export type TrustStripIcon = "returns" | "truck" | "wallet" | "refresh" | "shield" | "gift" | "sparkles" | "tag" | "heart";
export interface TrustStripItem { id: string; text: string; icon: TrustStripIcon | null }
export interface TrustStripContent { items?: TrustStripItem[]; intervalMs?: number; showIcons?: boolean; visible?: boolean }

export const TRUST_STRIP_ICONS: Record<TrustStripIcon, LucideIcon> = { returns: RotateCcw, truck: Truck, wallet: Wallet, refresh: RefreshCw, shield: ShieldCheck, gift: Gift, sparkles: Sparkles, tag: Tag, heart: Heart };

/** "pdp-trust-strip" section of the 'site-chrome' CMS page — edited at Admin → Website → Header & footer → Product strip. */
export const TRUST_STRIP_SECTION_KEY = "pdp-trust-strip";

/**
 * The single strip under the Buy Now button: its messages rotate one at a time (fade/slide), pause on
 * hover, and show all at once for people who prefer reduced motion. Presentational — the admin
 * preview renders this same component; <ProductTrustStrip/> below feeds it the published content.
 */
export function TrustStrip({ items, intervalMs = 3200, showIcons = true, visible = true }: TrustStripContent) {
  const { t } = useLang();
  const messages = items?.filter((i) => i.text.trim()).length
    ? items.filter((i) => i.text.trim())
    : [
        { id: "returns", text: t("product.moneyBack"), icon: "returns" as const },
        { id: "shipping", text: t("product.shipping"), icon: "truck" as const },
      ];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (messages.length < 2 || paused || reduced || !visible) return;
    const timer = window.setInterval(() => setIndex((i) => i + 1), Math.max(1000, Number(intervalMs) || 3200));
    return () => window.clearInterval(timer);
  }, [messages.length, paused, reduced, visible, intervalMs]);

  if (!visible) return null;
  const render = (m: TrustStripItem) => {
    const Icon = m.icon ? TRUST_STRIP_ICONS[m.icon] : null;
    return (
      <span key={m.id} className="inline-flex items-center justify-center gap-2">
        {showIcons && Icon && <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
        <span>{m.text}</span>
      </span>
    );
  };
  const current = messages[index % messages.length];
  return (
    <div
      className={clsx("flex min-h-[2.75rem] items-center justify-center overflow-hidden rounded-xl border border-line bg-steel-50 px-3 py-2.5 text-center text-[11.5px] font-semibold uppercase tracking-wide text-ink/75")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {reduced ? (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">{messages.map(render)}</div>
      ) : (
        <div key={current.id + index} className="strip-rotate-in" aria-live="polite">{render(current)}</div>
      )}
    </div>
  );
}

/** Storefront wrapper: published CMS content, falling back to the built-in two promises. */
export function ProductTrustStrip() {
  const { bySectionKey } = useSiteChromeCms();
  const section = bySectionKey.get(TRUST_STRIP_SECTION_KEY);
  const content = (section?.content ?? {}) as TrustStripContent;
  return <TrustStrip items={content.items} intervalMs={content.intervalMs} showIcons={content.showIcons} visible={section ? section.visible !== false && content.visible !== false : true} />;
}
