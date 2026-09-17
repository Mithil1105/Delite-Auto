import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { useLang } from "../i18n/LanguageContext";
import { formatINR } from "../lib/format";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

interface OrderRow {
  id: string;
  odoo_order_name: string | null;
  status: string;
  subtotal: number;
  created_at: string;
}

export default function Account() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { t } = useLang();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    supabase
      .from("orders")
      .select("id, odoo_order_name, status, subtotal, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setOrders((data as OrderRow[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("profiles").update({ full_name: fullName || null, phone: phone || null }).eq("id", user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="container-page py-14 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">{t("account.title")}</h1>
        <button type="button" onClick={() => void signOut()} className="text-[13px] font-semibold text-steel-500 hover:text-ink">
          {t("auth.signOut")}
        </button>
      </div>

      <section className="card-surface p-6 mb-8">
        <h2 className="font-display uppercase text-[13.5px] mb-4">{t("account.profileTitle")}</h2>
        <form onSubmit={onSaveProfile} className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="account-name" className={labelClass}>{t("auth.fullName")}</label>
            <input id="account-name" type="text" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="account-phone" className={labelClass}>{t("account.phone")}</label>
            <input id="account-phone" type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="account-email" className={labelClass}>{t("auth.email")}</label>
            <input id="account-email" type="email" disabled className={`${inputClass} bg-steel-50 text-steel-500`} value={user?.email ?? ""} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-outline disabled:opacity-50">
              {saving ? t("account.saving") : t("account.save")}
            </button>
            {saved && <span className="text-[12.5px] text-steel-500">{t("account.saved")}</span>}
          </div>
        </form>
      </section>

      <section className="card-surface p-6">
        <h2 className="font-display uppercase text-[13.5px] mb-4">{t("account.orderHistory")}</h2>
        {orders === null && <p className="text-[13.5px] text-steel-500">{t("account.loadingOrders")}</p>}
        {orders !== null && orders.length === 0 && (
          <div>
            <p className="text-[13.5px] text-steel-500 mb-3">{t("account.noOrders")}</p>
            <Link to="/shop" className="btn-dark">{t("cart.browseCatalog")}</Link>
          </div>
        )}
        {orders !== null && orders.length > 0 && (
          <div className="flex flex-col divide-y divide-line">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-3 text-[13.5px]">
                <div>
                  <div className="font-semibold">{o.odoo_order_name ?? o.id.slice(0, 8)}</div>
                  <div className="text-steel-500 text-[12px]">{new Date(o.created_at).toLocaleDateString()} · {o.status}</div>
                </div>
                <div className="font-semibold price">{formatINR(o.subtotal)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
