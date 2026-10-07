import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

/**
 * Reached via the link Supabase's own resetPasswordForEmail email sends (redirectTo points here).
 * The Supabase SDK (detectSessionInUrl, default on) establishes a recovery session from the
 * link's URL fragment before this component ever renders — `session` from useAuth() being present
 * IS the "this link was valid" signal; no session after loading finishes means an
 * invalid/expired/already-used link.
 */
export default function ResetPassword() {
  const { session, loading, updatePassword, signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setDone(true);
    // The recovery session is a real signed-in session now carrying the new password — sign out
    // afterward so the customer deliberately signs back in with it, rather than silently staying
    // logged in from a link that may have been opened on a shared device.
    setTimeout(async () => {
      await signOut();
      navigate("/login", { replace: true });
    }, 2000);
  };

  if (loading) return null;

  return (
    <div className="container-page py-16 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-6">{t("auth.resetPasswordTitle")}</h1>
      {!session ? (
        <div>
          <p className="text-[14px] text-sale mb-4">{t("auth.resetPasswordInvalidLink")}</p>
          <Link to="/forgot-password" className="font-semibold text-brand-700 hover:underline text-[13.5px]">{t("auth.forgotPasswordLink")}</Link>
        </div>
      ) : done ? (
        <p className="text-[14px] card-surface p-4">{t("auth.resetPasswordSuccess")}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="reset-new-password" className={labelClass}>{t("auth.newPassword")}</label>
            <input id="reset-new-password" required minLength={8} type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reset-confirm-password" className={labelClass}>{t("auth.confirmPassword")}</label>
            <input id="reset-confirm-password" required minLength={8} type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="text-[13px] text-sale">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary justify-center disabled:opacity-50 disabled:pointer-events-none">
            {submitting ? t("auth.resetPasswordUpdating") : t("auth.resetPasswordCta")}
          </button>
        </form>
      )}
    </div>
  );
}
