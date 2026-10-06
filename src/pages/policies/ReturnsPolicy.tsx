import { LegalLayout } from "../../components/LegalLayout";
import { RETURNS_WINDOW_DAYS } from "../../lib/policy";

/**
 * TEMPORARY BASELINE — CLIENT POLICY REVIEW REQUIRED (spec #32). Mirrors the prior Hasto project's
 * default 7-day policy until Delite's own client confirms their final terms — never invents
 * automotive-specific restrictions this pass. English-only this pass (see Documentations MD/
 * odoo-checkout-portal-returns.md's Known issues for the i18n scope decision).
 */
export default function ReturnsPolicy() {
  return (
    <LegalLayout eyebrow="Legal" title="Returns & Exchanges" date="30 September 2026">
      <p className="!text-accent font-semibold">
        CLIENT POLICY REVIEW REQUIRED — the terms below are a temporary baseline (mirroring the
        prior Hasto project's default policy), pending Delite Auto's own final policy.
      </p>

      <h2>{RETURNS_WINDOW_DAYS}-day return window</h2>
      <p>
        You may request a return or exchange within {RETURNS_WINDOW_DAYS} days of your order being
        marked delivered. Eligibility is based on the actual delivery date recorded for your order,
        not the order or payment date.
      </p>

      <h2>How to start a request</h2>
      <p>
        Sign in and open <strong>My Orders → Order Detail</strong>, then choose Return or Exchange
        on an eligible item. You'll receive an email once we've received your request.
      </p>

      <h2>What happens next</h2>
      <p>
        Your request is reviewed by our team and processed as a real return in our systems — status
        updates (Requested → Approved → Completed) are shown on your{" "}
        <strong>Returns &amp; Exchanges</strong> page. We'll never mark a request as returned or
        refunded until it's actually been received and processed.
      </p>

      <h2>Exchanges</h2>
      <p>
        For an exchange, let us know the replacement you'd like — our team will confirm
        availability and current pricing before dispatching a replacement.
      </p>

      <h2>Refunds</h2>
      <p>
        Refunds for online payments are issued back to the original payment method once a return is
        received and approved. Cash on Delivery refunds are handled directly by our team, since
        there's no automated online payment to reverse.
      </p>
    </LegalLayout>
  );
}
