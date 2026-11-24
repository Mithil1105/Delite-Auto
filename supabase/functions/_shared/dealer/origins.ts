// Which browser origins may call the dealer/admin-dealers functions (CORS). Pure, so it is unit-tested.
// Never `*`: dealer responses carry contract pricing. CORS is not authentication (every call still needs a
// verified session) - it only decides which web pages the browser lets read the response.

const EXACT = new Set(["https://dealers.deliteauto.com", "https://www.deliteauto.com", "https://deliteauto.com", "http://localhost:5173", "http://127.0.0.1:5173"]);

/** Each dealer's own address (https://<slug>.dealers.deliteauto.com) and local dev (http://localhost[:port], http://<slug>.localhost[:port]). */
const PATTERNS = [/^https:\/\/[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])\.dealers\.deliteauto\.com$/, /^http:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?\.)?localhost(?::\d{2,5})?$/];

export function isAllowedOrigin(origin: string | null, extra: string[] = []): boolean {
  if (!origin) return false;
  return EXACT.has(origin) || extra.includes(origin) || PATTERNS.some((p) => p.test(origin));
}
