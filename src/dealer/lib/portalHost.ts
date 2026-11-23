/**
 * Which dealer portal address are we on?
 *   dealers.deliteauto.com            -> the shared portal (no slug)
 *   <slug>.dealers.deliteauto.com     -> that one dealer's own branded portal
 *   <slug>.localhost (dev)            -> same, for local testing (served at /dealer on the dev server)
 * The slug only selects branding and tags requests so the server can refuse another dealer's account;
 * identity and data access always come from the signed-in session, never from the host.
 */
const BASE = String(import.meta.env.VITE_DEALER_BASE_DOMAIN ?? "dealers.deliteauto.com").toLowerCase().replace(/^\.+/, "");
const NOT_A_DEALER = new Set(["www", "staging", "dealers", "admin", "api"]);

export function currentPortalSlug(): string | null {
  if (typeof location === "undefined") return null;
  const host = location.hostname.toLowerCase();
  for (const suffix of [`.${BASE}`, ".localhost"]) {
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (sub && !sub.includes(".") && !NOT_A_DEALER.has(sub)) return sub;
    }
  }
  return null;
}

/** True when the app is served at the root of a dealer domain (not under /dealer on the shared dev server). */
export function onDealerDomain(): boolean {
  if (typeof location === "undefined") return false;
  const host = location.hostname.toLowerCase();
  return host === BASE || host.endsWith(`.${BASE}`) || host.startsWith("dealers.");
}

/** The address a dealer's own portal will have, for the admin form's preview. */
export function portalAddress(slug: string): string {
  return `${slug}.${BASE}`;
}
