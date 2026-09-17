import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { formatINR } from "../lib/format";
import { useLang } from "../i18n/LanguageContext";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

export default function Checkout() {
  const { lines, clearCart } = useCart();
  const { profile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [shippingName, setShippingName] = useState(profile?.full_name ?? "");
  const [shippingPhone, setShippingPhone] = useState(profile?.phone ?? "");
  const [shippingAddress, setShippingAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lines.reduce((sum, l) => sum + (l.variantPrice ?? l.product.price) * l.qty, 0);

  if (lines.length === 0) {
    return (
      <div className="container-page py-24 flex flex-col items-center text-center">
        <h1 className="text-2xl font-semibold mb-2">{t("cart.empty")}</h1>
        <Link to="/shop" className="btn-dark">{t("cart.browseCatalog")}</Link>
      </div>
    );
  }

  // `CartLine.variantId` is `String(odooVariantId)` for a real product (see
  // `supabaseCatalogService.ts`'s `mapVariant` and Documentations MD/odoo-real-catalog.md, "Cart
  // identity") — no need to look anything up. A line with no `variantId` AND no `product.odooId`
  // at all is a mock-catalog line with no Odoo identity whatsoever — checkout against real orders
  // can't place those; caught here rather than sending a meaningless id to create-order. A
  // no-`variantId`-but-real-`odooId` line (e.g. a single/no-variant product quick-added without
  // going through the PDP's variant selector) is valid — create-order resolves it to the
  // template's one real product.product id server-side.
  const unorderableLines = lines.filter((l) => !l.variantId && !l.product.odooId);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t("auth.notConfigured"));
      return;
    }
    if (unorderableLines.length > 0) {
      setError(t("checkout.mockLinesError"));
      return;
    }
    setError(null);
    setPlacing(true);

    const orderLines = lines.map((l) => ({
      odooVariantId: l.variantId ? Number(l.variantId) : undefined,
      odooTemplateId: l.product.odooId,
      qty: l.qty,
    }));

    const { data, error: invokeError } = await supabase.functions.invoke("create-order", {
      body: { shippingName, shippingPhone, shippingAddress, lines: orderLines },
    });

    setPlacing(false);

    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? t("checkout.orderFailed"));
      return;
    }

    clearCart();
    navigate(`/order/${data.orderId ?? "placed"}`, { state: { odooOrderName: data.odooOrderName } });
  };

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-semibold mb-8">{t("checkout.title")}</h1>
      <div className="grid lg:grid-cols-[1fr_340px] gap-10">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <h2 className="font-display uppercase text-[13.5px]">{t("checkout.shippingDetails")}</h2>
          <div>
            <label htmlFor="checkout-name" className={labelClass}>{t("auth.fullName")}</label>
            <input id="checkout-name" required type="text" className={inputClass} value={shippingName} onChange={(e) => setShippingName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="checkout-phone" className={labelClass}>{t("account.phone")}</label>
            <input id="checkout-phone" required type="tel" className={inputClass} value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} />
          </div>
          <div>
            <label htmlFor="checkout-address" className={labelClass}>{t("checkout.address")}</label>
            <textarea id="checkout-address" required rows={3} className={`${inputClass} h-auto py-3`} value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
          </div>
          {error && <p className="text-[13px] text-sale">{error}</p>}
          <button type="submit" disabled={placing} className="btn-primary justify-center disabled:opacity-50 disabled:pointer-events-none">
            {placing ? t("checkout.placing") : t("checkout.placeOrder")}
          </button>
          <p className="text-[12px] text-steel-500 text-center">{t("checkout.payOnDeliveryNote")}</p>
        </form>

        <div className="card-surface p-6 h-fit">
          <h2 className="font-display uppercase text-lg mb-5">{t("cart.orderSummary")}</h2>
          {lines.map(({ product, qty, variantId, variantLabel, variantPrice }) => (
            <div key={variantId ? `${product.id}-${variantId}` : product.id} className="flex justify-between text-[13.5px] py-2">
              <span className="text-steel-500 truncate pr-3">
                {product.name}
                {variantLabel ? ` — ${variantLabel}` : ""} × {qty}
              </span>
              <span className="price font-medium shrink-0">{formatINR((variantPrice ?? product.price) * qty)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[15px] py-4 font-semibold border-t border-line mt-2">
            <span>{t("cart.total")}</span>
            <span className="price">{formatINR(subtotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
