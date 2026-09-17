import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

export default function Signup() {
  const { signUp, configured } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/account";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    const result = await signUp(email, password, fullName || undefined);
    setSubmitting(false);
    if (result.error) {
      setError(result.error === "auth-not-configured" ? t("auth.notConfigured") : result.error);
      return;
    }
    if (result.needsConfirmation) {
      setNeedsConfirmation(true);
      return;
    }
    navigate(returnTo, { replace: true });
  };

  if (needsConfirmation) {
    return (
      <div className="container-page py-16 max-w-md mx-auto text-center">
        <h1 className="text-2xl font-semibold mb-3">{t("auth.checkEmailTitle")}</h1>
        <p className="text-[14px] text-steel-500">{t("auth.checkEmailDesc")}</p>
      </div>
    );
  }

  return (
    <div className="container-page py-16 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-6">{t("auth.signUpTitle")}</h1>
      {!configured && <p className="text-[13.5px] text-sale mb-4">{t("auth.notConfigured")}</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="signup-name" className={labelClass}>{t("auth.fullName")}</label>
          <input id="signup-name" type="text" autoComplete="name" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="signup-email" className={labelClass}>{t("auth.email")}</label>
          <input id="signup-email" required type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="signup-password" className={labelClass}>{t("auth.password")}</label>
          <input id="signup-password" required minLength={6} type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label htmlFor="signup-confirm-password" className={labelClass}>{t("auth.confirmPassword")}</label>
          <input id="signup-confirm-password" required minLength={6} type="password" autoComplete="new-password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {error && <p className="text-[13px] text-sale">{error}</p>}
        <button type="submit" disabled={submitting || !configured} className="btn-primary justify-center disabled:opacity-50 disabled:pointer-events-none">
          {submitting ? t("auth.signingUp") : t("auth.signUpCta")}
        </button>
      </form>
      <p className="text-[13px] text-steel-500 mt-6 text-center">
        {t("auth.haveAccount")}{" "}
        <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="font-semibold text-brand-700 hover:underline">
          {t("auth.signInCta")}
        </Link>
      </p>
    </div>
  );
}
