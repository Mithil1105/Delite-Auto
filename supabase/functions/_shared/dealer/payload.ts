// supabase/functions/_shared/dealer/payload.ts
//
// Request-payload parsing/validation helpers. Every request body is untrusted: nothing reaches the
// engine's logic without passing through one of these, and none of them ever accepts a
// caller-chosen dealer id for the dealer-facing API (that comes from the session only).

import { DealerError } from "./errors.ts";
import type { Address } from "./types.ts";

export type Payload = Record<string, unknown>;

export function asPayload(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
}

export function reqStr(p: Payload, key: string, max = 200, label = key): string {
  const v = p[key];
  if (typeof v !== "string" || v.trim() === "") throw new DealerError("VALIDATION", `${label} is required`);
  if (v.length > max) throw new DealerError("VALIDATION", `${label} must be at most ${max} characters`);
  return v.trim();
}

export function optStr(p: Payload, key: string, max = 200, label = key): string | null {
  const v = p[key];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new DealerError("VALIDATION", `${label} must be text`);
  if (v.length > max) throw new DealerError("VALIDATION", `${label} must be at most ${max} characters`);
  return v.trim();
}

export function reqInt(p: Payload, key: string, min = 1, max = 2_000_000_000, label = key): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new DealerError("VALIDATION", `${label} must be a whole number between ${min} and ${max}`);
  return v;
}

export function optInt(p: Payload, key: string, min = 1, max = 2_000_000_000, label = key): number | null {
  if (p[key] === undefined || p[key] === null || p[key] === "") return null;
  return reqInt(p, key, min, max, label);
}

export function intArray(p: Payload, key: string, maxLen = 500, label = key): number[] {
  const v = p[key];
  if (!Array.isArray(v) || v.length === 0 || v.length > maxLen) throw new DealerError("VALIDATION", `${label} must list between 1 and ${maxLen} items`);
  const out = v.map((x) => {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 1) throw new DealerError("VALIDATION", `${label} contains an invalid id`);
    return x;
  });
  return [...new Set(out)];
}

export function optBool(p: Payload, key: string): boolean | undefined {
  const v = p[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new DealerError("VALIDATION", `${key} must be true or false`);
  return v;
}

export function pageParams(p: Payload, defaultSize = 25, maxSize = 100): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const pageSize = Math.min(maxSize, Math.max(1, Math.floor(Number(p.pageSize) || defaultSize)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function reqUuid(p: Payload, key: string, label = key): string {
  const v = reqStr(p, key, 40, label);
  if (!UUID_RE.test(v)) throw new DealerError("VALIDATION", `${label} is not a valid id`);
  return v;
}

export function reqEmail(p: Payload, key: string, label = "Email"): string {
  const v = reqStr(p, key, 200, label).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new DealerError("VALIDATION", `${label} is not a valid email address`);
  return v;
}

export function optGstin(p: Payload, key: string): string | null {
  const v = optStr(p, key, 15, "GSTIN");
  if (!v) return null;
  const upper = v.toUpperCase();
  if (!GSTIN_RE.test(upper)) throw new DealerError("VALIDATION", "GSTIN is not in a valid format (15 characters)");
  return upper;
}

export function optPhone(p: Payload, key: string): string | null {
  const v = optStr(p, key, 20, "Phone");
  if (!v) return null;
  const digits = v.replace(/[\s()+-]/g, "");
  if (!/^\d{7,15}$/.test(digits)) throw new DealerError("VALIDATION", "Phone number must have 7 to 15 digits");
  return v;
}

export function parseAddress(value: unknown, required: boolean, label = "Address"): Address {
  const p = asPayload(value);
  const addr: Address = {
    name: optStr(p, "name", 120) ?? undefined,
    phone: optPhone(p, "phone") ?? undefined,
    line1: optStr(p, "line1", 200) ?? undefined,
    line2: optStr(p, "line2", 200) ?? undefined,
    city: optStr(p, "city", 100) ?? undefined,
    state: optStr(p, "state", 100) ?? undefined,
    pincode: optStr(p, "pincode", 6) ?? undefined,
  };
  if (addr.pincode && !/^\d{6}$/.test(addr.pincode)) throw new DealerError("VALIDATION", `${label}: PIN code must be 6 digits`);
  if (required) {
    for (const [k, name] of [["name", "name"], ["phone", "phone"], ["line1", "street address"], ["city", "city"], ["state", "state"], ["pincode", "PIN code"]] as const) {
      if (!addr[k]) throw new DealerError("VALIDATION", `${label}: ${name} is required`);
    }
  }
  return addr;
}

export function reqAccent(p: Payload, key: string): string | undefined {
  const v = optStr(p, key, 7);
  if (v === null) return undefined;
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) throw new DealerError("VALIDATION", "Accent colour must be a #RRGGBB hex value");
  return v.toUpperCase();
}

/** Storage-path guard for branding images — keeps `../` and absolute URLs out of what the dealer
 * app later turns into a public URL. */
export function optMediaPath(p: Payload, key: string): string | null | undefined {
  if (!(key in p)) return undefined;
  const v = optStr(p, key, 300);
  if (v === null) return null;
  if (v.includes("..") || v.startsWith("/") || /^[a-z]+:/i.test(v)) throw new DealerError("VALIDATION", "Image path is not allowed");
  return v;
}

export function validIdempotencyKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{16,80}$/.test(key);
}
