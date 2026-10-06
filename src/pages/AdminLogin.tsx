import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

/**
 * Dedicated admin sign-in, separate from the customer /login (spec section 5). Same secure
 * Supabase session underneath (useAuth().signIn) — no parallel auth system. Whether the resulting
 * account actually has an admin role is decided by RequireAdminRole after redirect, not here.
 *
 * MFA step: if the account has a verified TOTP factor, signIn() reports `mfaRequired` (the
 * password-only session sits at AAL1) — this page then challenges/verifies that factor via
 * Supabase Auth's own `auth.mfa.*` API before navigating anywhere. Enforcement is real (server-
 * side): a route depending on AAL2 (see RequireAdminRole) is gated by Supabase's own session
 * claims, not by this page choosing to redirect.
 */
export default function AdminLogin() {
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError, mfaRequired } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError === "auth-not-configured" ? "Admin sign-in isn't configured yet." : "Invalid email or password.");
      return;
    }
    if (mfaRequired && supabase) {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp.find((f) => f.status === "verified");
      if (factor) {
        setMfaFactorId(factor.id);
        return;
      }
    }
    navigate(returnTo, { replace: true });
  };

  const onVerifyMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !mfaFactorId) return;
    setError(null);
    setSubmitting(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challengeError || !challenge) {
      setSubmitting(false);
      setError("Could not start verification — please try again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.trim() });
    setSubmitting(false);
    if (verifyError) {
      setError("Incorrect code — please try again.");
      return;
    }
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-charcoal-deep px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-display uppercase text-white text-2xl tracking-tightish">Delite Admin</span>
          <p className="text-[13px] text-white/50 mt-1">Internal operations</p>
        </div>
        <div className="bg-white border border-line p-8">
          {!configured && <p className="text-[13px] text-sale mb-4">Admin sign-in isn't configured yet.</p>}
          {mfaFactorId ? (
            <form onSubmit={onVerifyMfa} className="flex flex-col gap-4">
              <p className="text-[13px] text-steel-600">Enter the 6-digit code from your authenticator app.</p>
              <div>
                <label htmlFor="admin-mfa-code" className={labelClass}>Verification code</label>
                <input
                  id="admin-mfa-code"
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className={inputClass}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              {error && <p className="text-[13px] text-sale">{error}</p>}
              <button type="submit" disabled={submitting || mfaCode.length !== 6} className="btn-dark justify-center disabled:opacity-50 disabled:pointer-events-none">
                {submitting ? "Verifying…" : "Verify"}
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="admin-login-email" className={labelClass}>Email</label>
                <input id="admin-login-email" required type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="admin-login-password" className={labelClass}>Password</label>
                <input id="admin-login-password" required type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-[13px] text-sale">{error}</p>}
              <button type="submit" disabled={submitting || !configured} className="btn-dark justify-center disabled:opacity-50 disabled:pointer-events-none">
                {submitting ? "Signing in…" : "Sign In"}
              </button>
              <Link to="/forgot-password" className="text-[12.5px] text-steel-500 hover:text-ink text-center">Forgot password?</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
