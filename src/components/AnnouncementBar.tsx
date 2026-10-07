import { useEffect, useState } from "react";
import { Gift, Heart, RefreshCw, ShieldCheck, Sparkles, Tag, Truck, Wallet, type LucideIcon } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

/**
 * Extracted from Header.tsx so the Delite Admin's Announcement Bar editor preview can reuse the
 * REAL component (see Documentations MD/delite-admin.md) rather than a fake renderer — all props
 * optional, defaulting to today's i18n copy, so Header.tsx's existing `<AnnouncementBar />` call
 * (no props) behaves identically to the inline div it replaces.
 */
export type AnnouncementIcon = "truck" | "wallet" | "refresh" | "shield" | "gift" | "sparkles" | "tag" | "heart";
export interface AnnouncementItem { id: string; text: string; icon: AnnouncementIcon | null; linkLabel?: string; linkUrl?: string }
export interface AnnouncementContentOverride {
  message?: string;
  linkLabel?: string;
  linkUrl?: string;
  items?: AnnouncementItem[];
  intervalMs?: number;
  showIcons?: boolean;
  bgColor?: string;
  textColor?: string;
  visible?: boolean;
}

const ICONS: Record<AnnouncementIcon, LucideIcon> = { truck: Truck, wallet: Wallet, refresh: RefreshCw, shield: ShieldCheck, gift: Gift, sparkles: Sparkles, tag: Tag, heart: Heart };
export const ANNOUNCEMENT_DEFAULT_BG = "#1D3FD1";
export const ANNOUNCEMENT_DEFAULT_TEXT = "#FFFFFF";

export function AnnouncementBar({ message, linkLabel, linkUrl, items, intervalMs = 3200, showIcons = true, bgColor = ANNOUNCEMENT_DEFAULT_BG, textColor = ANNOUNCEMENT_DEFAULT_TEXT, visible = true }: AnnouncementContentOverride = {}) {
  const { t } = useLang();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const messages = Array.isArray(items) && items.length ? items : [{ id: "default", text: message ?? t("header.announcement"), icon: null, linkLabel, linkUrl }];
  useEffect(() => {
    if (messages.length < 2 || paused || prefersReducedMotion || !visible) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), Math.max(1000, Number(intervalMs) || 3200));
    return () => window.clearInterval(timer);
  }, [messages.length, intervalMs, paused, prefersReducedMotion, visible]);
  if (!visible) return null;
  const renderItem = (item: AnnouncementItem) => {
    const Icon = item.icon && ICONS[item.icon];
    return <span key={item.id} className="inline-flex items-center justify-center gap-1.5">
      {showIcons && Icon && <Icon size={13} aria-hidden="true" />}
      <span>{item.text}</span>
      {item.linkLabel && item.linkUrl?.startsWith("/") && !item.linkUrl.startsWith("//") && <a href={item.linkUrl} className="underline font-semibold ml-1">{item.linkLabel}</a>}
    </span>;
  };
  return <div className="text-[12px] text-center py-1.5 px-4 min-h-7" style={{ backgroundColor: bgColor, color: textColor }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    {prefersReducedMotion ? <span className="flex flex-wrap justify-center gap-x-5 gap-y-1">{messages.map(renderItem)}</span> : renderItem(messages[index % messages.length])}
  </div>;
}
