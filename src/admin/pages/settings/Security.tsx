import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useAuth } from "../../../context/AuthContext";

interface Factor {
  id: string;
  status: "verified" | "unverified";
  friendly_name?: string | null;
}

/**
 * Admin MFA enrollment (spec sections 25-26). Uses Supabase Auth's own `auth.mfa.*` API — no
 * custom TOTP implementation. Enforcement that a privileged route actually REQUIRES the resulting
 * AAL2 session lives in AdminLogin.tsx's challenge step (real, server-verified via Supabase Auth),
 * not just this page choosing to show a QR code.
 */
export default function Security() {
  const { showToast } = useAdminToast();
  const { aal, requireAdminMfa } = useAuth();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  };

  useEffect(() => {
    load();
  }, []);

  const startEnroll = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error || !data) {
      showToast(error?.message ?? "Could not start enrollment");
      return;
    }
    setPendingFactorId(data.id);
    setQrSvg(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  };

  const confirmEnroll = async () => {
    if (!supabase || !pendingFactorId) return;
    setBusy(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
    if (challengeError || !challenge) {
      setBusy(false);
      showToast(challengeError?.message ?? "Could not verify — please try again");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: pendingFactorId, challengeId: challenge.id, code: verifyCode.trim() });
    setBusy(false);
    if (verifyError) {
      showToast("Incorrect code — please try again");
      return;
    }
    showToast("Two-factor authentication enabled");
    setEnrolling(false);
    setQrSvg(null);
    setSecret(null);
    setVerifyCode("");
    setPendingFactorId(null);
    await load();
  };

  const unenroll = async (factorId: string) => {
    if (!supabase) return;
    if (!window.confirm("Turn off two-factor authentication for your account?")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Two-factor authentication disabled");
    await load();
  };

  const verifiedFactor = factors?.find((f) => f.status === "verified");

  return (
    <div className="p-6 lg:p-10 max-w-xl">
      <h2 className="font-display uppercase text-[13.5px] mb-1">Security</h2>
      <p className="text-[12px] text-steel-500 mb-6">Two-factor authentication for your own admin account.</p>

      <div className="card-surface p-5 mb-6 space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-steel-500">Current session</span>
          <span className="font-semibold uppercase">{aal ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-steel-500">Policy</span>
          <span className="font-semibold">{requireAdminMfa === null ? "—" : requireAdminMfa ? "Required" : "Optional"}</span>
        </div>
      </div>

      {factors === null ? (
        <p className="text-steel-500 text-[13px]">Loading…</p>
      ) : verifiedFactor ? (
        <div className="card-surface p-5 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-[13.5px]">Two-factor authentication is on</p>
            <p className="text-[12.5px] text-steel-500 mt-1">You'll be asked for a code from your authenticator app each time you sign in to /admin/login.</p>
            <button type="button" disabled={busy} onClick={() => unenroll(verifiedFactor.id)} className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sale hover:underline disabled:opacity-50">
              <ShieldOff className="w-3.5 h-3.5" /> Turn off
            </button>
          </div>
        </div>
      ) : enrolling ? (
        <div className="card-surface p-5">
          <p className="text-[13.5px] font-semibold mb-3">Scan with your authenticator app</p>
          {qrSvg && <div className="w-40 h-40 mb-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
          {secret && <p className="text-[11.5px] text-steel-500 mb-4 break-all">Can't scan? Enter this key manually: <span className="font-mono">{secret}</span></p>}
          <label className="block text-[11px] uppercase tracking-wide text-steel-500 mb-1">Verification code</label>
          <input
            inputMode="numeric"
            maxLength={6}
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
            className="w-full h-10 px-3 border border-line text-[14px] mb-3"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || verifyCode.length !== 6} onClick={confirmEnroll} className="btn-dark !px-4 !py-2 text-[12.5px] disabled:opacity-50">
              Confirm
            </button>
            <button type="button" onClick={() => { setEnrolling(false); setQrSvg(null); setSecret(null); }} className="btn-ghost !px-4 !py-2 text-[12.5px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card-surface p-5">
          <p className="text-[13.5px] text-steel-600 mb-3">Not enabled. Recommended for every admin account, especially owner and admin.</p>
          <button type="button" disabled={busy} onClick={startEnroll} className="btn-dark !px-4 !py-2 text-[12.5px] inline-flex items-center gap-1.5 disabled:opacity-50">
            <ShieldCheck className="w-4 h-4" /> Set up two-factor authentication
          </button>
        </div>
      )}
    </div>
  );
}
