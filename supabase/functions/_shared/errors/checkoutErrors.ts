// supabase/functions/_shared/errors/checkoutErrors.ts
//
// Structured checkout error contract — see Documentations MD/odoo-checkout-finalization.md Phase
// 6B. Every checkout-related Edge Function (checkout-quote, create-order, payment-create,
// payment-verify) returns errors in this shape instead of an ad-hoc `{ error: string }`, so the
// frontend can branch on `code` instead of parsing message text. The `message` is always
// customer-safe — never a raw Odoo error, stack trace, or credential. Real diagnostics go to
// `console.error` server-side only.

export type CheckoutErrorCode =
  | "CHECKOUT_CHANGED"
  | "PRODUCT_UNAVAILABLE"
  | "PRODUCT_INVALID"
  | "STOCK_CHANGED"
  | "PRICING_UNAVAILABLE"
  | "ADDRESS_INVALID"
  | "DELIVERY_UNAVAILABLE"
  | "SESSION_EXPIRED"
  | "PAYMENT_UNAVAILABLE"
  | "PAYMENT_FAILED"
  | "PAYMENT_ALREADY_PROCESSING"
  | "ORDER_ALREADY_CREATED"
  | "ODOO_UNAVAILABLE"
  | "VALIDATION_FAILED";

const DEFAULT_STATUS: Record<CheckoutErrorCode, number> = {
  CHECKOUT_CHANGED: 409,
  PRODUCT_UNAVAILABLE: 409,
  PRODUCT_INVALID: 400,
  STOCK_CHANGED: 409,
  PRICING_UNAVAILABLE: 409,
  ADDRESS_INVALID: 400,
  DELIVERY_UNAVAILABLE: 409,
  SESSION_EXPIRED: 401,
  PAYMENT_UNAVAILABLE: 501,
  PAYMENT_FAILED: 402,
  PAYMENT_ALREADY_PROCESSING: 409,
  ORDER_ALREADY_CREATED: 200,
  ODOO_UNAVAILABLE: 503,
  VALIDATION_FAILED: 400,
};

const DEFAULT_RETRYABLE: Partial<Record<CheckoutErrorCode, boolean>> = {
  CHECKOUT_CHANGED: true,
  PRODUCT_UNAVAILABLE: false,
  STOCK_CHANGED: true,
  PRICING_UNAVAILABLE: false,
  DELIVERY_UNAVAILABLE: false,
  SESSION_EXPIRED: false,
  PAYMENT_UNAVAILABLE: false,
  PAYMENT_FAILED: true,
  PAYMENT_ALREADY_PROCESSING: true,
  ODOO_UNAVAILABLE: true,
};

export class CheckoutError extends Error {
  code: CheckoutErrorCode;
  status: number;
  retryable: boolean;
  // deno-lint-ignore no-explicit-any
  quote?: any;

  // deno-lint-ignore no-explicit-any
  constructor(code: CheckoutErrorCode, message: string, opts: { status?: number; retryable?: boolean; quote?: any } = {}) {
    super(message);
    this.code = code;
    this.status = opts.status ?? DEFAULT_STATUS[code];
    this.retryable = opts.retryable ?? DEFAULT_RETRYABLE[code] ?? false;
    this.quote = opts.quote;
  }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function checkoutErrorResponse(err: CheckoutError): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        ...(err.quote ? { quote: err.quote } : {}),
      },
    }),
    { status: err.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}
