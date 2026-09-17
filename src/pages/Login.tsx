import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

export default function Login() {
  const { signIn, configured } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError === "auth-not-configured" ? t("auth.notConfigured") : signInError);
      return;
    }
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="container-page py-16 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-6">{t("auth.signInTitle")}</h1>
      {!configured && <p className="text-[13.5px] text-sale mb-4">{t("auth.notConfigured")}</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className={labelClass}>{t("auth.email")}</label>
          <input id="login-email" required type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="login-password" className={labelClass}>{t("auth.password")}</label>
          <input id="login-password" required type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-[13px] text-sale">{error}</p>}
        <button type="submit" disabled={submitting || !configured} className="btn-primary justify-center disabled:opacity-50 disabled:pointer-events-none">
          {submitting ? t("auth.signingIn") : t("auth.signInCta")}
        </button>
      </form>
      <p className="text-[13px] text-steel-500 mt-6 text-center">
        {t("auth.noAccount")}{" "}
        <Link to={`/signup?returnTo=${encodeURIComponent(returnTo)}`} className="font-semibold text-brand-700 hover:underline">
          {t("auth.signUpCta")}
        </Link>
      </p>
    </div>
  );
}
