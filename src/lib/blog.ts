/**
 * Blog post model shared by the storefront and the admin editor. Posts are written in blocks (never raw HTML) and every
 * text field is stored per language ({ en, hi, gu }) — English is required and is the fallback for the others.
 */
export type BlogLang = "en" | "hi" | "gu";
export type Localized<T> = Partial<Record<BlogLang, T>>;

export type BlogBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string; by?: string }
  | { type: "image"; src: string; alt?: string; caption?: string }
  | { type: "gallery"; images: { src: string; alt?: string }[] };

export type BlogLayout = "standard" | "hero" | "split" | "gallery";
export type BlogStatus = "draft" | "published";

export interface BlogPost {
  id: string;
  slug: string;
  status: BlogStatus;
  publishedAt: string | null;
  category: string;
  layout: BlogLayout;
  coverImage: string | null;
  coverAlt: string | null;
  showProducts: boolean;
  productIds: number[];
  title: Localized<string>;
  excerpt: Localized<string>;
  body: Localized<BlogBlock[]>;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const BLOG_LANGS: { code: BlogLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "gu", label: "ગુજરાતી" },
];

export const BLOG_LAYOUTS: { value: BlogLayout; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Cover image above a narrow, easy-to-read article." },
  { value: "hero", label: "Big banner", hint: "Full-width cover image with the title on top of it." },
  { value: "split", label: "Side by side", hint: "Title and summary on the left, cover image on the right." },
  { value: "gallery", label: "Photo story", hint: "Wider page where pictures and galleries get more room." },
];

export const BLOG_CATEGORY_PRESETS = ["Guides", "Care tips", "News", "Offers", "Product spotlight"];

/** Safe image URL for a block: https or a site path only. */
export function safeImageUrl(v: unknown): string | null {
  return typeof v === "string" && (v.startsWith("https://") || (v.startsWith("/") && !v.startsWith("//"))) ? v : null;
}

const str = (v: unknown, max = 5000): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Turns whatever is stored in the database into well-formed blocks; anything unknown is dropped. */
export function cleanBlocks(raw: unknown): BlogBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: BlogBlock[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    switch (o.type) {
      case "heading":
      case "paragraph":
        out.push({ type: o.type, text: str(o.text) });
        break;
      case "quote":
        out.push({ type: "quote", text: str(o.text, 1000), by: str(o.by, 100) || undefined });
        break;
      case "image": {
        const src = safeImageUrl(o.src);
        if (src) out.push({ type: "image", src, alt: str(o.alt, 200) || undefined, caption: str(o.caption, 300) || undefined });
        break;
      }
      case "gallery": {
        const images = (Array.isArray(o.images) ? o.images : [])
          .map((i) => {
            const r = (i ?? {}) as Record<string, unknown>;
            const src = safeImageUrl(r.src);
            return src ? { src, alt: str(r.alt, 200) || undefined } : null;
          })
          .filter((i): i is { src: string; alt: string | undefined } => i !== null)
          .slice(0, 24);
        if (images.length > 0) out.push({ type: "gallery", images });
        break;
      }
    }
  }
  return out;
}

/** Text in the reader's language, falling back to English. */
export function pickText(map: Localized<string> | undefined, lang: BlogLang): string {
  return map?.[lang]?.trim() || map?.en?.trim() || "";
}

/** Blocks in the reader's language, falling back to the English article when that language is empty. */
export function pickBody(map: Localized<BlogBlock[]> | undefined, lang: BlogLang): BlogBlock[] {
  const own = map?.[lang];
  return own && own.length > 0 ? own : (map?.en ?? []);
}

export function readingMinutes(blocks: BlogBlock[]): number {
  const words = blocks.reduce((n, b) => n + (b.type === "gallery" || b.type === "image" ? 0 : b.text.split(/\s+/).filter(Boolean).length), 0);
  return Math.max(1, Math.round(words / 200));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 120;

/** A post counts as live for the public when it is published and its date has arrived. */
export function isLive(post: Pick<BlogPost, "status" | "publishedAt">, now = Date.now()): boolean {
  return post.status === "published" && !!post.publishedAt && Date.parse(post.publishedAt) <= now;
}
