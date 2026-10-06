import { describe, it, expect } from "vitest";
import { decodeJwtAal } from "./jwt";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("decodeJwtAal", () => {
  it("reads aal1 from a well-formed JWT", () => {
    expect(decodeJwtAal(fakeJwt({ aal: "aal1", sub: "u1" }))).toBe("aal1");
  });

  it("reads aal2 from a well-formed JWT", () => {
    expect(decodeJwtAal(fakeJwt({ aal: "aal2", sub: "u1" }))).toBe("aal2");
  });

  it("returns null when the aal claim is missing (pre-MFA-era token)", () => {
    expect(decodeJwtAal(fakeJwt({ sub: "u1" }))).toBeNull();
  });

  it("returns null for an unrecognized aal value — never trusts an unexpected claim", () => {
    expect(decodeJwtAal(fakeJwt({ aal: "aal3", sub: "u1" }))).toBeNull();
  });

  it("returns null for a malformed token instead of throwing", () => {
    expect(decodeJwtAal("not-a-jwt")).toBeNull();
    expect(decodeJwtAal("")).toBeNull();
    expect(decodeJwtAal("a.b")).toBeNull();
  });

  it("returns null for a payload segment that isn't valid base64/JSON", () => {
    expect(decodeJwtAal("header.not-valid-base64!!!.sig")).toBeNull();
  });

  it("handles base64url-encoded payloads (- and _ instead of + and /)", () => {
    // Force a payload that base64-encodes to contain + and / so the url-safe round trip is real,
    // not accidentally passing because the fixture never needed the substitution.
    const raw = JSON.stringify({ aal: "aal2", note: "ÿÿÿ>>>???" });
    const std = btoa(raw);
    expect(std.includes("+") || std.includes("/")).toBe(true); // sanity: this fixture exercises the substitution
    const urlSafe = std.replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `header.${urlSafe}.sig`;
    expect(decodeJwtAal(jwt)).toBe("aal2");
  });
});
