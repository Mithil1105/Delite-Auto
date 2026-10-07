import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

/** Customer + Admin share this one route — Supabase Auth is the same underlying account either
 * way (see AuthContext.tsx). Never reveals whether the email exists — same generic response
 * regardless (#22). */
export default function ForgotPassword() {
  const { requestPasswordReset, configured } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: reqError } = await requestPasswordReset(email);
    setSubmitting(false);
    if (reqError) {
      setError(t("auth.notConfigured"));
      return;
    }
    setSent(true);
  };

  return (
    <div className="container-page py-16 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{t("auth.forgotPasswordTitle")}</h1>
      <p className="text-[13.5px] text-steel-500 mb-6">{t("auth.forgotPasswordDesc")}</p>
      {!configured && <p className="text-[13.5px] text-sale mb-4">{t("auth.notConfigured")}</p>}
      {sent ? (
        <p className="text-[14px] card-surface p-4">{t("auth.forgotPasswordSent")}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="forgot-email" className={labelClass}>{t("auth.email")}</label>
            <input id="forgot-email" required type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="text-[13px] text-sale">{error}</p>}
          <button type="submit" disabled={submitting || !configured} className="btn-primary justify-center disabled:opacity-50 disabled:pointer-events-none">
            {submitting ? t("auth.forgotPasswordSending") : t("auth.forgotPasswordCta")}
          </button>
        </form>
      )}
      <p className="text-[13px] text-steel-500 mt-6 text-center">
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">{t("auth.backToLogin")}</Link>
      </p>
    </div>
  );
}
