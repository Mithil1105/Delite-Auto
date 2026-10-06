/**
 * Route -> analytics page metadata. Pure (no window access) so it is unit-testable.
 *
 * Privacy: only the pathname is ever stored (never the query string or fragment — they can carry
 * tokens or reset links). Unknown routes collapse to "/other" and order ids to "/order/:id". The
 * server re-sanitises every path independently (supabase/functions/_shared/analytics/core.ts);
 * this copy exists so the client never *sends* anything it wouldn't be allowed to store.
 */

const KNOWN_PATHS = new Set(["/", "/shop", "/brands", "/cart", "/checkout", "/account", "/about", "/contact", "/login", "/signup", "/terms", "/refund-policy"]);

export type PageType =
  | "home" | "shop" | "product" | "brands" | "cart" | "checkout" | "account" | "order_confirmation"
  | "about" | "contact" | "login" | "signup" | "legal" | "other";

export function sanitizeClientPath(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0];
  if (!path.startsWith("/")) return null;
  if (path.startsWith("/admin")) return null;
  if (path.startsWith("/order/")) return "/order/:id";
  if (path.startsWith("/product/")) return /^\/product\/[A-Za-z0-9._~-]{1,150}$/.test(path) ? path : "/product/:invalid";
  return KNOWN_PATHS.has(path) ? path : "/other";
}

export function pageTypeFor(path: string): PageType {
  if (path === "/") return "home";
  if (path.startsWith("/product/")) return "product";
  if (path.startsWith("/order/")) return "order_confirmation";
  if (path === "/terms" || path === "/refund-policy") return "legal";
  const seg = path.split("/")[1];
  const known: PageType[] = ["shop", "brands", "cart", "checkout", "account", "about", "contact", "login", "signup"];
  return (known as string[]).includes(seg) ? (seg as PageType) : "other";
}

const numericParam = (search: URLSearchParams, key: string): number | undefined => {
  const v = search.get(key);
  return v && /^\d{1,9}$/.test(v) ? Number(v) : undefined;
};

export interface PageInfo {
  path: string;
  pageType: PageType;
  /** Real catalog slugs end in `--<odooTemplateId>`; mock slugs have no id and yield undefined. */
  odooTemplateId?: number;
  categoryId?: number;
  brandId?: number;
  /** Changes when the *listing the visitor is looking at* changes (a new page view), but not for
   * pagination/sort/price tweaks on the same listing. */
  signature: string;
}

export function pageInfo(pathname: string, search: string): PageInfo | null {
  const path = sanitizeClientPath(pathname);
  if (!path) return null;
  const pageType = pageTypeFor(path);
  const params = new URLSearchParams(search);
  const info: PageInfo = { path, pageType, signature: path };
  if (pageType === "product") {
    const m = path.match(/--(\d+)$/);
    if (m) info.odooTemplateId = Number(m[1]);
  }
  if (pageType === "shop") {
    info.categoryId = numericParam(params, "category");
    info.brandId = numericParam(params, "brand");
    const listing = ["category", "vehicle", "brand", "fitment", "model", "tag", "q", "wishlist"].map((k) => `${k}=${params.get(k) ?? ""}`).join("&");
    info.signature = `${path}?${listing}`;
  }
  return info;
}
