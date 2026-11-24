import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./origins.ts";

describe("CORS origin allow-list", () => {
  it("allows the portal, the storefront, local dev and every dealer's own address", () => {
    for (const o of ["https://dealers.deliteauto.com", "https://www.deliteauto.com", "http://localhost:5173", "http://localhost:5199", "http://apex.localhost:5173", "http://zzt-auto.localhost:5173", "https://apex.dealers.deliteauto.com"]) expect(isAllowedOrigin(o), o).toBe(true);
  });
  it("refuses look-alikes, other schemes and unknown sites", () => {
    for (const o of [null, "", "*", "https://evil.com", "http://dealers.deliteauto.com", "https://dealers.deliteauto.com.evil.com", "https://a.b.dealers.deliteauto.com", "http://evil.com:5173", "http://localhost.evil.com", "https://localhost:5173", "https://-x.dealers.deliteauto.com"]) expect(isAllowedOrigin(o as string | null), String(o)).toBe(false);
  });
  it("honours explicitly configured extra origins", () => {
    expect(isAllowedOrigin("https://preview-abc.vercel.app", ["https://preview-abc.vercel.app"])).toBe(true);
  });
});
