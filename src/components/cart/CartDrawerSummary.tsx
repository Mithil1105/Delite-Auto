import { useNavigate } from "react-router-dom";
import { formatINR } from "../../lib/format";
import { useLang } from "../../i18n/LanguageContext";

/**
 * Sticky bottom area of the drawer. Checkout is intentionally rendered disabled — the real
 * checkout flow doesn't exist yet (see Documentations MD/responsive-cart-drawer.md) and an
 * active-looking button that does nothing is worse than an honest disabled one. View Cart is the
 * one working CTA.
 */
export function CartDrawerSummary({ subtotal, onClose }: { subtotal: number; onClose: () => void }) {
  const { t } = useLang();
  const navigate = useNavigate();

  return (
    <div className="shrink-0 border-t border-line px-5 py-4 bg-white">
      <div className="flex justify-between items-baseline text-[14px] mb-1">
        <span className="text-steel-500">{t("cart.subtotal")}</span>
        <span className="price text-[17px] font-bold">{formatINR(subtotal)}</span>
      </div>
      <p className="text-[11.5px] text-steel-500 mb-4">{t("cart.shippingNote")}</p>

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
      <button type="button" disabled aria-disabled="true" className="btn-pill-outline w-full justify-center !py-3 mt-2 opacity-50 cursor-not-allowed">
        {t("cart.checkout")}
      </button>
      <p className="text-[11px] text-steel-500 text-center mt-2">{t("cart.checkoutComingSoon")}</p>
    </div>
  );
}
