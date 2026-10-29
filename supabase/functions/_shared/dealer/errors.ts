// supabase/functions/_shared/dealer/errors.ts

export type DealerErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "DEALER_INACTIVE"
  | "NOT_READY"
  | "QUOTE_INVALID"
  | "CHECKOUT_CHANGED"
  | "ODOO_UNAVAILABLE"
  | "RATE_LIMITED";

const STATUS: Record<DealerErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  DEALER_INACTIVE: 403,
  NOT_READY: 422,
  QUOTE_INVALID: 409,
  CHECKOUT_CHANGED: 409,
  ODOO_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
};

/** Customer/admin-safe error with a stable machine code and an HTTP status — handlers translate
 * it to a structured JSON response; anything that is NOT a DealerError becomes a generic 500. */
export class DealerError extends Error {
  code: DealerErrorCode;
  status: number;
  details?: unknown;
  constructor(code: DealerErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}
