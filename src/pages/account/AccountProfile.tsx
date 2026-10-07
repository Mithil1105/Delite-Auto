import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { useLang } from "../../i18n/LanguageContext";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

/**
 * Ownership boundary (spec #41): Supabase Auth owns the sign-in identity/security; Odoo res.partner
 * owns the commerce profile Checkout/My Orders reads. This page edits the SUPABASE-side name/phone
 * only — it deliberately does NOT write to Odoo (that only happens server-side, at checkout, via
 * customerIdentity.ts) and does NOT let the auth email be changed here (spec #42: checkout contact
 * email and Supabase Auth email are related but not identical concepts — auth email changes stay a
 * distinct, not-yet-built Security flow, not something this profile form does silently).
 */
export default function AccountProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useLang();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

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
    <div>
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <section className="card-surface p-6 max-w-xl">
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

      <section className="card-surface p-6 max-w-xl mt-6">
        <h2 className="font-display uppercase text-[13.5px] mb-3">Security</h2>
        <p className="text-[13px] text-steel-500 mb-3">To change your password, use the reset-password link from the sign-in page.</p>
        <a href="/forgot-password" className="btn-ghost !px-0 !text-[12.5px] text-brand-700">Reset password →</a>
      </section>
    </div>
  );
}
