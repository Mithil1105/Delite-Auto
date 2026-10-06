import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { formatINR } from "../lib/format";
import { analyticsIdentityForOrder, rotateAnalyticsCart, track } from "../lib/analytics/client";
import { useLang } from "../i18n/LanguageContext";
import { POLICY_VERSION, POLICY_LINKS } from "../lib/policy";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

type PaymentMethod = "online" | "cod";
type Step = "idle" | "processing" | "opening_payment" | "verifying_payment";

interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

interface SavedAddress extends Address {
  id: number;
  label: string;
}

const emptyAddress: Address = { line1: "", line2: "", city: "", state: "", pincode: "" };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (resp: unknown) => void) => void };
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;
function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

export default function Checkout() {
  const { lines, clearCart } = useCart();
  const { profile, user, session } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const isGuest = !session;

  // Step 1: Contact
  const [shippingName, setShippingName] = useState(profile?.full_name ?? "");
  const [shippingPhone, setShippingPhone] = useState(profile?.phone ?? "");
  const [guestEmail, setGuestEmail] = useState("");

  // Step 2: Delivery address — authenticated customers can pick a saved Odoo address or add a new
  // one; guests always enter one fresh (spec #7/#10). Odoo remains the only address store.
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[] | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">("new");
  const [address, setAddress] = useState<Address>(emptyAddress);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("online");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const placing = step !== "idle";

  // One stable id per checkout attempt — generated once when this page mounts and reused across a
  // double-click/network-retry/resubmit, so the server can collapse duplicates into the same
  // order instead of creating a second one (see supabase/functions/create-order/index.ts).
  const [checkoutAttemptId] = useState(() => crypto.randomUUID());

  // Authenticated prefill — real name/phone/email/saved addresses from the customer's mapped Odoo
  // partner, when one exists (spec #13-14). Never forces re-entry; a brand-new signed-in customer
  // with no mapping yet just falls through to blank fields, same as a guest.
  useEffect(() => {
    if (!supabase || isGuest) return;
    let cancelled = false;
    supabase.functions.invoke<{ linked: boolean; name: string | null; phone: string | null }>("customer-profile", { method: "POST" }).then(({ data }) => {
      if (cancelled || !data) return;
      if (data.name) setShippingName((prev) => prev || data.name!);
      if (data.phone) setShippingPhone((prev) => prev || data.phone!);
    });
    supabase.functions.invoke<{ addresses: SavedAddress[] }>("customer-addresses", { method: "POST", body: { action: "list" } }).then(({ data }) => {
      if (cancelled) return;
      const addrs = data?.addresses ?? [];
      setSavedAddresses(addrs);
      if (addrs.length > 0) {
        setSelectedAddressId(addrs[0].id);
        setAddress({ line1: addrs[0].line1, line2: addrs[0].line2, city: "", state: "", pincode: "" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isGuest]);

  // Checked up front so "Pay Online" is never shown as a real option only to fail after the
  // customer selects it and submits (spec: checkout stays honest about provider availability).
  // Starts `true` (optimistic) so the option doesn't flash away/back while this loads — COD always
  // stays available either way.
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.functions.invoke<{ onlinePaymentConfigured: boolean }>("payment-config", { method: "POST" }).then(({ data }) => {
      if (cancelled) return;
      const available = data?.onlinePaymentConfigured ?? false;
      setOnlinePaymentAvailable(available);
      if (!available) setPaymentMethod("cod");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subtotal = lines.reduce((sum, l) => sum + (l.variantPrice ?? l.product.price) * l.qty, 0);

  const startedTracked = useRef(false);
  useEffect(() => {
    if (startedTracked.current || lines.length === 0) return;
    startedTracked.current = true;
    track("checkout_started", { quantity: lines.reduce((n, l) => n + l.qty, 0), value: subtotal });
    track("checkout_step_viewed", { metadata: { step: "details" } });
  }, [lines.length]);

  if (lines.length === 0) {
    return (
      <div className="container-page py-24 flex flex-col items-center text-center">
        <h1 className="text-2xl font-semibold mb-2">{t("cart.empty")}</h1>
        <Link to="/shop" className="btn-dark">{t("cart.browseCatalog")}</Link>
      </div>
    );
  }

  const unorderableLines = lines.filter((l) => !l.variantId && !l.product.odooId);

  const orderLinesPayload = () =>
    lines.map((l) => ({ odooVariantId: l.variantId ? Number(l.variantId) : undefined, odooTemplateId: l.product.odooId, qty: l.qty }));

  const completeOrder = (orderId: string | null, odooOrderName?: string | null) => {
    track("checkout_completed", { value: subtotal });
    rotateAnalyticsCart();
    clearCart();
    // Guest orders can't be re-fetched via RLS (no session at all) — the confirmation page reads
    // this router state directly instead of re-querying `orders`, which also works identically for
    // a signed-in customer and avoids a redundant fetch either way.
    navigate(`/order/${orderId ?? "placed"}`, {
      state: { odooOrderName, orderId, subtotal, paymentMethod, shippingAddress: formatAddress(address) },
    });
  };

  const onAddressSelect = (value: string) => {
    if (value === "new") {
      setSelectedAddressId("new");
      setAddress(emptyAddress);
      return;
    }
    const id = Number(value);
    setSelectedAddressId(id);
    const found = savedAddresses?.find((a) => a.id === id);
    if (found) setAddress({ line1: found.line1, line2: found.line2, city: "", state: "", pincode: "" });
  };

  const placeCodOrder = async (finalAddress: Address, email: string) => {
    if (!supabase) return;
    const { data, error: invokeError } = await supabase.functions.invoke("create-order", {
      body: {
        checkoutAttemptId,
        shippingName,
        shippingPhone,
        address: finalAddress,
        guestEmail: isGuest ? email : undefined,
        policyVersion: POLICY_VERSION,
        policyAccepted,
        lines: orderLinesPayload(),
        analytics: analyticsIdentityForOrder(),
      },
    });
    if (invokeError || data?.error) {
      track("checkout_failed", { metadata: { reason: "order_error_cod" } });
      setError(data?.error ?? invokeError?.message ?? t("checkout.orderFailed"));
      setStep("idle");
      return;
    }
    completeOrder(data.orderId ?? null, data.odooOrderName);
  };

  const placeOnlineOrder = async (finalAddress: Address, email: string) => {
    if (!supabase) return;
    track("payment_method_selected", { metadata: { method: "online" } });
    const { data: createData, error: createError } = await supabase.functions.invoke("payment-create", {
      body: {
        shippingName,
        shippingPhone,
        address: finalAddress,
        guestEmail: isGuest ? email : undefined,
        policyVersion: POLICY_VERSION,
        policyAccepted,
        lines: orderLinesPayload(),
      },
    });
    if (createError || createData?.error) {
      track("checkout_failed", { metadata: { reason: "payment_create_error" } });
      setError(createData?.error ?? createError?.message ?? t("checkout.orderFailed"));
      setStep("idle");
      return;
    }

    setStep("opening_payment");
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded || !window.Razorpay) {
      setError(t("checkout.paymentUnavailable"));
      setStep("idle");
      return;
    }

    track("payment_started", { value: subtotal, metadata: { method: "online" } });

    const rzp = new window.Razorpay({
      key: createData.keyId,
      amount: createData.amount,
      currency: createData.currency,
      order_id: createData.razorpayOrderId,
      name: "Delite Auto",
      description: "Order payment",
      prefill: { name: shippingName, contact: shippingPhone, email: user?.email ?? email },
      theme: { color: "#1D3FD1" },
      modal: {
        ondismiss: () => {
          track("checkout_failed", { metadata: { reason: "payment_cancelled" } });
          setError(t("checkout.paymentCancelled"));
          setStep("idle");
        },
      },
      handler: async (response: unknown) => {
        const r = response as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
        setStep("verifying_payment");
        const { data: verifyData, error: verifyError } = await supabase!.functions.invoke("payment-verify", {
          body: { paymentAttemptId: createData.paymentAttemptId, ...r },
        });
        if (verifyError || verifyData?.error || !verifyData?.paid) {
          track("checkout_failed", { metadata: { reason: "verification_failed" } });
          setError(t("checkout.paymentVerificationFailed"));
          setStep("idle");
          return;
        }
        track("payment_success", { value: subtotal, metadata: { method: "online" } });
        completeOrder(verifyData.orderId, verifyData.odooOrderName);
      },
    });
    rzp.on("payment.failed", () => {
      track("payment_failed", { metadata: { method: "online" } });
      setError(t("checkout.paymentFailed"));
      setStep("idle");
    });
    rzp.open();
  };

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
    if (!policyAccepted) {
      setError("Please accept the Terms and Returns/Refund policy to continue.");
      return;
    }
    if (placing) return; // guards against a double click/duplicate submission
    setError(null);
    setStep("processing");
    track("checkout_step_viewed", { metadata: { step: "review" } });

    const email = isGuest ? guestEmail.trim() : "";
    if (paymentMethod === "cod") await placeCodOrder(address, email);
    else await placeOnlineOrder(address, email);
  };

  const buttonLabel =
    step === "processing" ? t("checkout.processing") : step === "opening_payment" ? t("checkout.openingPayment") : step === "verifying_payment" ? t("checkout.verifyingPayment") : t("checkout.placeOrder");

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-semibold mb-8">{t("checkout.title")}</h1>
      <div className="grid lg:grid-cols-[1fr_340px] gap-10">
        <form onSubmit={onSubmit} className="flex flex-col gap-8">
          {/* Step 1 — Contact */}
          <section className="flex flex-col gap-4">
            <h2 className="font-display uppercase text-[13.5px]">1. Contact</h2>
            <div>
              <label htmlFor="checkout-name" className={labelClass}>{t("auth.fullName")}</label>
              <input id="checkout-name" required type="text" className={inputClass} value={shippingName} onChange={(e) => setShippingName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="checkout-phone" className={labelClass}>{t("account.phone")}</label>
              <input id="checkout-phone" required type="tel" className={inputClass} value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} />
            </div>
            {isGuest && (
              <div>
                <label htmlFor="checkout-guest-email" className={labelClass}>Email</label>
                <input id="checkout-guest-email" required type="email" className={inputClass} value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
                <p className="text-[11.5px] text-steel-500 mt-1.5">
                  Have an account? <Link to={`/login?returnTo=${encodeURIComponent("/checkout")}`} className="underline">Sign in</Link> to reuse your saved details.
                </p>
              </div>
            )}
          </section>

          {/* Step 2 — Delivery address */}
          <section className="flex flex-col gap-4">
            <h2 className="font-display uppercase text-[13.5px]">2. Delivery Address</h2>

            {!isGuest && savedAddresses && savedAddresses.length > 0 && (
              <div className="flex flex-col gap-2">
                {savedAddresses.map((a) => (
                  <label key={a.id} className={`flex items-start gap-3 border px-4 py-3 cursor-pointer ${selectedAddressId === a.id ? "border-ink" : "border-line"}`}>
                    <input type="radio" name="saved-address" checked={selectedAddressId === a.id} onChange={() => onAddressSelect(String(a.id))} className="mt-1" />
                    <span className="text-[13.5px]">
                      <span className="font-medium block">{a.label}</span>
                      <span className="text-steel-500">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</span>
                    </span>
                  </label>
                ))}
                <label className={`flex items-center gap-3 border px-4 py-3 cursor-pointer ${selectedAddressId === "new" ? "border-ink" : "border-line"}`}>
                  <input type="radio" name="saved-address" checked={selectedAddressId === "new"} onChange={() => onAddressSelect("new")} />
                  <span className="text-[14px] font-medium">Add a new address</span>
                </label>
              </div>
            )}

            {(isGuest || selectedAddressId === "new" || !savedAddresses || savedAddresses.length === 0) && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="addr-line1" className={labelClass}>Address line 1</label>
                  <input id="addr-line1" required type="text" className={inputClass} value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="addr-line2" className={labelClass}>Address line 2 (optional)</label>
                  <input id="addr-line2" type="text" className={inputClass} value={address.line2} onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="addr-city" className={labelClass}>City</label>
                  <input id="addr-city" required type="text" className={inputClass} value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="addr-state" className={labelClass}>State</label>
                  <input id="addr-state" required type="text" className={inputClass} value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="addr-pincode" className={labelClass}>PIN code</label>
                  <input id="addr-pincode" required type="text" inputMode="numeric" className={inputClass} value={address.pincode} onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value }))} />
                </div>
              </div>
            )}
          </section>

          {/* Step 3 — Payment */}
          <section className="flex flex-col gap-4">
            <h2 className="font-display uppercase text-[13.5px]">3. Payment</h2>
            <div className="flex flex-col gap-2">
              {onlinePaymentAvailable && (
                <label className={`flex items-center gap-3 border px-4 py-3 cursor-pointer ${paymentMethod === "online" ? "border-ink" : "border-line"}`}>
                  <input type="radio" name="payment-method" checked={paymentMethod === "online"} onChange={() => setPaymentMethod("online")} />
                  <span className="text-[14px] font-medium">{t("checkout.payOnline")}</span>
                </label>
              )}
              <label className={`flex items-center gap-3 border px-4 py-3 cursor-pointer ${paymentMethod === "cod" ? "border-ink" : "border-line"}`}>
                <input type="radio" name="payment-method" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} />
                <span className="text-[14px] font-medium">{t("checkout.payCod")}</span>
              </label>
              {!onlinePaymentAvailable && (
                <p className="text-[12px] text-steel-500">Online payment is temporarily unavailable — Cash on Delivery is still available.</p>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-[12.5px] text-steel-600 cursor-pointer">
              <input type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} className="mt-0.5" />
              <span>
                I agree to the <Link to={POLICY_LINKS.terms} target="_blank" className="underline">Terms &amp; Conditions</Link> and{" "}
                <Link to={POLICY_LINKS.returns} target="_blank" className="underline">Returns/Refund Policy</Link> (7-day returns &amp; exchanges, secure checkout).
              </span>
            </label>
          </section>

          {error && <p className="text-[13px] text-sale">{error}</p>}
          <button type="submit" disabled={placing} className="btn-primary justify-center disabled:opacity-50 disabled:pointer-events-none">
            {buttonLabel}
          </button>
          {paymentMethod === "cod" && <p className="text-[12px] text-steel-500 text-center">{t("checkout.payOnDeliveryNote")}</p>}
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

function formatAddress(a: Address): string {
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter((p) => p?.trim()).join(", ");
}
