import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { formatINR } from "../../lib/format";
import { useLang } from "../../i18n/LanguageContext";
import { useCart } from "../../context/CartContext";
import { buildOdooHandoffUrl, HandoffValidationError } from "../../lib/odooCheckoutHandoff";

/**
 * Sticky bottom area of the drawer. Checkout hands the cart off to Odoo's own native checkout
 * (Documentations MD/odoo-native-checkout.md) — the production checkout path as of this pass.
 * Only rendered by CartDrawer.tsx when the cart has at least one line, so there's no separate
 * empty-cart gating needed here.
 */
export function CartDrawerSummary({ subtotal, onClose }: { subtotal: number; onClose: () => void }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const { lines } = useCart();
  const [preparing, setPreparing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const onCheckout = async () => {
    if (preparing) return;
    setCheckoutError(null);
    setPreparing(true);
    try {
      const url = await buildOdooHandoffUrl(lines);
      onClose();
      window.location.assign(url);
    } catch (err) {
      setPreparing(false);
      setCheckoutError(err instanceof HandoffValidationError ? err.message : "We couldn't start checkout — please try again.");
    }
  };

  return (
    <div className="shrink-0 border-t border-line px-5 py-4 bg-white">
      <div className="flex justify-between items-baseline text-[14px] mb-1">
        <span className="text-steel-500">{t("cart.subtotal")}</span>
        <span className="price text-[17px] font-bold">{formatINR(subtotal)}</span>
      </div>
      <p className="text-[11.5px] text-steel-500 mb-4">{t("cart.shippingNote")}</p>
      {checkoutError && <p className="text-[12px] text-sale mb-2">{checkoutError}</p>}

      <button
        type="button"
        onClick={() => {
          onClose();
          navigate("/cart");
        }}
        className="btn-pill-dark w-full justify-center !py-3"
      >
        {t("cart.viewCart")}
      </button>
      <button type="button" onClick={onCheckout} disabled={preparing} className="btn-pill-outline w-full justify-center !py-3 mt-2 disabled:opacity-50 disabled:pointer-events-none">
        {preparing ? "Preparing secure checkout…" : t("cart.checkout")}
      </button>
    </div>
  );
}
