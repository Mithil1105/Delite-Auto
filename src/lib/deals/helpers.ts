import { DEALS_SECTIONS, DEALS_SETTINGS_KEY, type DealsSectionDef } from "../../data/dealsSections";
import type { PublishedSection } from "../../services/cms/publishedCmsService";

/** A section after merging its published CMS row with the in-code defaults. */
export interface ResolvedDealsSection {
  key: string;
  def: DealsSectionDef;
  visible: boolean;
  order: number;
  /** Defaults overlaid with whatever the admin has set (blank strings fall back to the default). */
  content: Record<string, unknown>;
}

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * Published CMS rows → the sections to render. A section with no published row (page not seeded yet,
 * or a section added in code later) falls back to its in-code default visibility/order/content, so the
 * page works before the migration is applied and never loses a section. Settings is never "visible".
 */
export function resolveDealsSections(published: PublishedSection[], defs: DealsSectionDef[] = DEALS_SECTIONS): ResolvedDealsSection[] {
  const byKey = new Map(published.map((p) => [p.sectionKey, p]));
  return defs
    .map((def): ResolvedDealsSection => {
      const row = byKey.get(def.key);
      const content: Record<string, unknown> = { ...def.defaults };
      for (const [k, v] of Object.entries(row?.content ?? {})) if (!isBlank(v)) content[k] = v;
      return { key: def.key, def, visible: row ? row.visible : def.defaultVisible, order: row ? row.displayOrder : def.defaultOrder, content };
    })
    .sort((a, b) => a.order - b.order);
}

export function isDealsPageEnabled(sections: ResolvedDealsSection[]): boolean {
  const settings = sections.find((s) => s.key === DEALS_SETTINGS_KEY);
  return settings?.content.pageEnabled !== false;
}

export interface BudgetBand {
  label: string;
  min: number;
  /** undefined = no upper limit */
  max?: number;
}

/** "Under ₹500|0|500" per line → bands. Skips malformed lines; a blank/invalid "to" means no upper limit. */
export function parseBudgetBands(text: unknown): BudgetBand[] {
  if (typeof text !== "string") return [];
  const bands: BudgetBand[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [labelRaw, minRaw = "", maxRaw = ""] = line.split("|").map((s) => s.trim());
    if (!labelRaw) continue;
    const min = minRaw === "" ? 0 : Number(minRaw);
    const max = maxRaw === "" ? undefined : Number(maxRaw);
    if (!Number.isFinite(min) || min < 0) continue;
    if (max !== undefined && (!Number.isFinite(max) || max <= min)) continue;
    bands.push({ label: labelRaw, min, max });
  }
  return bands;
}

/** The shop URL for a band (the Shop page reads `min`/`max` from the query string). */
export function budgetBandHref(band: BudgetBand): string {
  const params = new URLSearchParams();
  if (band.min > 0) params.set("min", String(band.min));
  if (band.max !== undefined) params.set("max", String(band.max));
  const qs = params.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

/** `<input type="datetime-local">` values ("2026-11-01T09:00") are local time; anything unparsable counts as unset. */
export function parseLocalDateTime(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** A campaign shows from `startsAt` (if set) until `endsAt` (if set). */
export function isCampaignActive(content: Record<string, unknown>, now: number): boolean {
  const start = parseLocalDateTime(content.startsAt);
  const end = parseLocalDateTime(content.endsAt);
  if (start !== undefined && now < start) return false;
  if (end !== undefined && now >= end) return false;
  return true;
}

export function countdownParts(msRemaining: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/** wa.me link; a bare 10-digit Indian number gets the 91 prefix. Returns undefined if there's no usable number. */
export function whatsappUrl(number: unknown, message: unknown): string | undefined {
  if (typeof number !== "string") return undefined;
  let digits = number.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return undefined;
  const text = typeof message === "string" && message.trim() ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export interface ComboConfig {
  title: string;
  productIds: number[];
}

/** Sanitises the stored combos array (admin-entered JSON): ≤4 combos, each with 2–4 positive integer ids. */
export function parseCombos(value: unknown): ComboConfig[] {
  if (!Array.isArray(value)) return [];
  const out: ComboConfig[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const ids = Array.isArray(r.productIds) ? r.productIds.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0).slice(0, 4) : [];
    if (ids.length < 2) continue;
    out.push({ title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : "Combo", productIds: ids });
    if (out.length === 4) break;
  }
  return out;
}

export const asNumber = (value: unknown, fallback: number, max = 100): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
};

export const asIdList = (value: unknown, max = 24): number[] =>
  Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0).slice(0, max) : [];

export const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
