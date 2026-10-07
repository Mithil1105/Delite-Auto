import { LegalLayout } from "../../components/LegalLayout";

/** TEMPORARY BASELINE — CLIENT POLICY REVIEW REQUIRED (spec #32/#34). See ReturnsPolicy.tsx. */
export default function ShippingPolicy() {
  return (
    <LegalLayout eyebrow="Legal" title="Shipping Policy" date="30 September 2026">
      <p className="!text-accent font-semibold">
        CLIENT POLICY REVIEW REQUIRED — the terms below are a temporary baseline pending Delite
        Auto's own final shipping/delivery policy.
      </p>

      <h2>Delivery methods</h2>
      <p>
        Orders are shipped via standard delivery, or can be collected in-store where you selected
        pickup at checkout. Delivery methods shown at checkout reflect what's actually configured
        for your order — nothing here is a fabricated option.
      </p>

      <h2>Order tracking</h2>
      <p>
        Once your order ships, tracking information (when available from the carrier) appears on
        your order's detail page under My Orders.
      </p>

      <h2>Delivery timelines</h2>
      <p>
        Delivery timelines vary by location and are confirmed at checkout — we do not display a
        fixed promise here that may not hold for every address we serve.
      </p>
    </LegalLayout>
  );
}
