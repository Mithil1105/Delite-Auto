import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { buildOdooHandoffUrl, HandoffValidationError } from "../lib/odooCheckoutHandoff";

/**
 * What used to render the full custom checkout form now hands off to Odoo's native checkout
 * instead (Documentations MD/odoo-native-checkout.md) — the production checkout path as of this
 * pass. The old form (src/pages/Checkout.tsx) is kept in the repo as LEGACY/FALLBACK, just no
 * longer routed to /checkout.
 */
export default function CheckoutRedirect() {
  const { lines } = useCart();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lines.length === 0) return; // handled by the <Navigate> below instead
    let cancelled = false;
    buildOdooHandoffUrl(lines)
      .then((url) => {
        if (!cancelled) window.location.assign(url);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof HandoffValidationError ? err.message : "We couldn't start checkout — please try again.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length]);

  if (lines.length === 0) return <Navigate to="/cart" replace />;

  return (
    <div className="container-page py-24 flex flex-col items-center text-center gap-4">
      {error ? (
        <>
          <h1 className="text-2xl font-semibold">We couldn't prepare your checkout.</h1>
          <p className="text-steel-500 text-[14.5px] max-w-[40ch]">{error}</p>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={() => window.location.reload()} className="btn-dark">
              Try Again
            </button>
            <a href="/cart" className="btn-pill-outline">
              View Cart
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="w-8 h-8 border-[3px] border-steel-200 border-t-ink rounded-full animate-spin" />
          <h1 className="text-xl font-semibold">Redirecting to secure checkout&hellip;</h1>
        </>
      )}
    </div>
  );
}
