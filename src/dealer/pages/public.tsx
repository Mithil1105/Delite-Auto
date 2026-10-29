import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Headset, LockKeyhole, Tags } from "lucide-react";
import { site } from "../../data/site";
import { useDealerAuth } from "../DealerAuth";
import { btnPrimary, inputClass, labelClass, Spinner } from "../ui";

const DEFAULT_ACCENT = { "--dealer-accent": "#10148F" } as CSSProperties;

/** Only same-app absolute paths are honoured as a post-login destination (no open redirects). */
export function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes(":") || raw.includes("\\")) return "/dashboard";
  return raw;
}

function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col" style={DEFAULT_ACCENT}>
      <header className="bg-white border-b border-line">
        <div className="container-page h-16 flex items-center justify-between">
          <Link to="/" className="font-display uppercase text-[17px] tracking-tightish">
            Delite Auto <span className="text-steel-500 normal-case text-[13px] ml-1">Exclusive Partners</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13.5px]">
            <Link to={{ pathname: "/", hash: "#benefits" }} className="hidden sm:inline text-steel-700 hover:text-ink">Benefits</Link>
            <Link to="/support-public" className="hidden sm:inline text-steel-700 hover:text-ink">Contact</Link>
            <Link to="/login" className={btnPrimary}>Dealer Login</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="container-page py-6 text-[12.5px] text-steel-500 flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <span>Invitation-only dealer access. Need an account? Contact your Delite representative.</span>
          <span className="flex gap-4">
            <a href={`mailto:${site.email}`} className="hover:text-ink">{site.email}</a>
            <a href="https://www.deliteauto.com/terms" target="_blank" rel="noreferrer" className="hover:text-ink">Terms</a>
            <a href="https://www.deliteauto.com/policies/privacy" target="_blank" rel="noreferrer" className="hover:text-ink">Privacy</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function Landing() {
  const cards = [
    { icon: LockKeyhole, title: "Private Catalogue", body: "See only the products Delite has opened up to your business — nothing else." },
    { icon: Tags, title: "Contract Pricing", body: "Your agreed prices, applied automatically on every order. No price lists to chase." },
    { icon: Headset, title: "Dedicated Support", body: "A named Delite team behind your account for orders, deliveries and queries." },
  ];
  return (
    <PublicFrame>
      <section className="bg-gradient-to-br from-charcoal-deep via-charcoal to-brand-700 text-white">
        <div className="container-page py-20 sm:py-28 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-widish text-gold mb-4">Exclusive partner portal</p>
          <h1 className="font-display uppercase text-[34px] sm:text-[52px] leading-[1.05] tracking-tightish mb-5">A better way to buy, built for our partners.</h1>
          <p className="text-[16px] text-white/75 max-w-[52ch] mb-8">Exclusive product access. Agreed pricing. One seamless ordering experience.</p>
          <Link to="/login" className="inline-flex items-center h-12 px-8 rounded-full bg-gold text-ink font-semibold hover:bg-gold-600 transition-colors">Dealer Login</Link>
        </div>
      </section>
      <section id="benefits" className="container-page py-14">
        <div className="grid sm:grid-cols-3 gap-5">
          {cards.map((c) => (
            <div key={c.title} className="card-surface rounded-lg p-6">
              <c.icon className="w-6 h-6 mb-3 text-brand-500" aria-hidden />
              <h2 className="font-semibold mb-1">{c.title}</h2>
              <p className="text-[13.5px] text-steel-500">{c.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-[13.5px] text-steel-500">Invitation-only dealer access — there is no public registration.</p>
      </section>
    </PublicFrame>
  );
}

export function PublicContact() {
  return (
    <PublicFrame>
      <div className="container-page py-16 max-w-xl">
        <h1 className="text-2xl font-semibold mb-3">Contact Delite</h1>
        <p className="text-[14px] text-steel-500 mb-6">Interested in becoming an exclusive partner, or need help with your account? Reach our dealer team.</p>
        <p className="text-[14px]"><a className="underline" href={`mailto:${site.email}`}>{site.email}</a></p>
        <p className="text-[14px]"><a className="underline" href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a></p>
      </div>
    </PublicFrame>
  );
}

export function Login() {
  const { ready, signedIn, signIn } = useDealerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && signedIn) return <Navigate to={returnTo} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    else navigate(returnTo, { replace: true });
  };

  return (
    <PublicFrame>
      <div className="container-page py-14 max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Dealer sign in</h1>
        <p className="text-[13.5px] text-steel-500 mb-6">Use the credentials from your Delite invitation. There is no public sign-up.</p>
        <form onSubmit={submit} className="card-surface rounded-lg p-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          {error && <p role="alert" className="text-[13px] text-sale">{error}</p>}
          <button type="submit" disabled={busy || !email || !password} className={`${btnPrimary} w-full`}>
            {busy && <Spinner />} Sign in
          </button>
          <p className="text-center text-[13px]"><Link to="/forgot-password" className="underline text-steel-700">Forgot your password?</Link></p>
        </form>
      </div>
    </PublicFrame>
  );
}

export function ForgotPassword() {
  const { requestReset } = useDealerAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await requestReset(email);
    setBusy(false);
    setSent(true);
  };
  return (
    <PublicFrame>
      <div className="container-page py-14 max-w-md">
        <h1 className="text-2xl font-semibold mb-6">Reset your password</h1>
        {sent ? (
          <p role="status" className="card-surface rounded-lg p-6 text-[14px]">If an account exists for that email, a reset link is on its way. The link works once and expires soon.</p>
        ) : (
          <form onSubmit={submit} className="card-surface rounded-lg p-6 space-y-4">
            <div>
              <label htmlFor="fp-email" className={labelClass}>Email</label>
              <input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={busy || !email} className={`${btnPrimary} w-full`}>{busy && <Spinner />} Send reset link</button>
          </form>
        )}
        <p className="mt-4 text-[13px]"><Link to="/login" className="underline">Back to sign in</Link></p>
      </div>
    </PublicFrame>
  );
}

/** Landing page of the single-use invite / reset link: Supabase establishes a session from the link,
 * so a session present = a valid link; none after loading = invalid, expired or already used. */
export function SetPassword({ mode }: { mode: "invite" | "reset" }) {
  const { ready, signedIn, setPassword, signOut } = useDealerAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <PublicFrame><div className="container-page py-14" /></PublicFrame>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const res = await setPassword(pw);
    setBusy(false);
    if (res.error) return setError(res.error);
    if (mode === "reset") {
      await signOut();
      navigate("/login", { replace: true });
    } else navigate("/dashboard", { replace: true });
  };

  return (
    <PublicFrame>
      <div className="container-page py-14 max-w-md">
        <h1 className="text-2xl font-semibold mb-1">{mode === "invite" ? "Welcome — set your password" : "Choose a new password"}</h1>
        {!signedIn ? (
          <div role="alert" className="card-surface rounded-lg p-6 mt-6 text-[14px]">
            <p className="font-semibold mb-1">This link is invalid or has expired.</p>
            <p className="text-steel-500">Links work once. Ask your Delite contact to resend your invitation, or use <Link to="/forgot-password" className="underline">password reset</Link>.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card-surface rounded-lg p-6 mt-6 space-y-4">
            <div>
              <label htmlFor="np" className={labelClass}>New password</label>
              <input id="np" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="np2" className={labelClass}>Confirm password</label>
              <input id="np2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
            </div>
            {error && <p role="alert" className="text-[13px] text-sale">{error}</p>}
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>{busy && <Spinner />} Save password</button>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}

export function DealerNotFound() {
  return (
    <PublicFrame>
      <div className="container-page py-20 text-center">
        <h1 className="text-3xl font-semibold mb-2">Page not found</h1>
        <p className="text-[14px] text-steel-500 mb-6">That page doesn't exist, or you don't have access to it.</p>
        <Link to="/" className={btnPrimary}>Go to the portal</Link>
      </div>
    </PublicFrame>
  );
}
