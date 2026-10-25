// Product video links stored in Odoo (product.image.video_url — the "Video URL" Odoo's website_sale
// lets staff attach to a product's media). Turns whatever URL a person pasted (youtube.com/watch,
// youtu.be, /embed/, /shorts/, Vimeo, …) into one safe, normalised shape the storefront can render:
// an embed URL for an inline player (YouTube via the privacy-friendly youtube-nocookie.com domain,
// Vimeo with do-not-track), a plain "watch" URL to open the video on its own site, and a thumbnail.
//
// Pure functions, no Deno/Node APIs, so they're unit-tested (video.test.ts). Security: the host must
// match a fixed allow-list *exactly* (not a substring), IDs must match strict patterns, and embed/
// thumbnail URLs are rebuilt from the validated ID — the original string is never echoed into an
// iframe. Anything else becomes provider "other": a link only (http/https), never an embed.

export type VideoProvider = "youtube" | "vimeo" | "other";

export interface ProductVideo {
  provider: VideoProvider;
  /** YouTube / Vimeo id (absent for provider "other"). */
  videoId?: string;
  /** Opens the video on its own site (YouTube / Vimeo / the original link). */
  watchUrl: string;
  /** iframe source for an inline player; absent when the provider can't be embedded safely. */
  embedUrl?: string;
  /** A still image for the thumbnail/poster, when the provider offers a predictable one (YouTube). */
  thumbnailUrl?: string;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[A-Za-z0-9]{6,16}$/;

/** "90", "90s", "1m30s", "1h2m3s" → seconds (undefined when absent/invalid). */
export function parseStartSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Math.min(Number(value), 86400);
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Math.min(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0), 86400);
}

function normaliseToUrl(raw: string): URL | null {
  let text = raw.trim();
  if (!text || text.length > 500) return null;
  if (text.startsWith("//")) text = `https:${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`; // "youtube.com/watch?v=…" typed without a scheme
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url : null;
}

function youtubeId(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  if (host === "youtu.be") id = parts[0];
  else if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
  else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1];
  return id && YOUTUBE_ID.test(id) ? id : undefined;
}

function vimeoParts(url: URL): { id: string; hash?: string } | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  const idIndex = parts.findIndex((p) => VIMEO_ID.test(p));
  if (idIndex < 0) return undefined;
  const hashPart = parts[idIndex + 1] ?? url.searchParams.get("h") ?? undefined;
  return { id: parts[idIndex], hash: hashPart && VIMEO_HASH.test(hashPart) ? hashPart : undefined };
}

export function parseVideoUrl(raw: unknown): ProductVideo | null {
  if (typeof raw !== "string") return null;
  const url = normaliseToUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(url);
    if (id) {
      const start = parseStartSeconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
      return {
        provider: "youtube",
        videoId: id,
        watchUrl: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${start ? `&start=${start}` : ""}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
    // A YouTube channel/playlist/home link — nothing embeddable, but still a valid link.
    return { provider: "other", watchUrl: url.toString() };
  }

  if (VIMEO_HOSTS.has(host)) {
    const v = vimeoParts(url);
    if (v) {
      return {
        provider: "vimeo",
        videoId: v.id,
        watchUrl: `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ""}`,
        embedUrl: `https://player.vimeo.com/video/${v.id}?dnt=1${v.hash ? `&h=${v.hash}` : ""}`,
      };
    }
    return { provider: "other", watchUrl: url.toString() };
  }

  return { provider: "other", watchUrl: url.toString() };
}
