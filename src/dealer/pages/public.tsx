import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Headset, LockKeyhole, Tags } from "lucide-react";
import { site } from "../../data/site";
import { useDealerAuth } from "../DealerAuth";
import { btnPrimary, inputClass, labelClass, Spinner } from "../ui";

const DEFAULT_ACCENT = { "--dealer-accent": "#10148F" } as CSSProperties;
/** Generic Delite imagery that is already public on the storefront (spec §5.1) — never private data. */
const HERO_IMAGE = "/images/hero/delitefied-suv-golden-hour-cropped.webp";

/** Only same-app absolute paths are honoured as a post-login destination (no open redirects). */
export function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes(":") || raw.includes("\\")) return "/dashboard";
  return raw;
}

/** Client-side brake on repeated failures (the server — Supabase Auth — has its own rate limits; this
 * stops casual guessing from the page itself and is cleared on success). 5 misses → 30 s, doubling to 5 min. */
const THROTTLE_KEY = "dealer-login-throttle";
function readThrottle(): { fails: number; until: number } {
  try {
    return JSON.parse(sessionStorage.getItem(THROTTLE_KEY) ?? "") as { fails: number; until: number };
  } catch {
    return { fails: 0, until: 0 };
  }
}
function writeThrottle(v: { fails: number; until: number } | null): void {
  try {
    if (v) sessionStorage.setItem(THROTTLE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(THROTTLE_KEY);
  } catch {
    /* storage unavailable — the server limits still apply */
  }
}

function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col" style={DEFAULT_ACCENT}>
      <header className="bg-white border-b border-line">
        <div className="container-page h-16 flex items-center justify-between">
          <Link to="/" className="font-display uppercase text-[17px] tracking-tightish">
            Delite Auto <span className="text-steel-500 normal-case text-[13px] ml-1">Exclusive Partners</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-5 text-[13.5px]">
            <Link to={{ pathname: "/", hash: "#benefits" }} className="hidden sm:inline text-steel-700 hover:text-ink">Benefits</Link>
            <Link to={{ pathname: "/", hash: "#faq" }} className="hidden sm:inline text-steel-700 hover:text-ink">FAQ</Link>
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

const FAQ: { q: string; a: string }[] = [
  { q: "How do I get access?", a: "The portal is invitation-only. Your Delite representative sets up your account and emails you a single-use link to choose your password. There is no public sign-up." },
  { q: "Why can't I see every Delite product?", a: "Your catalogue contains only the products Delite has opened up to your business, each at the price agreed with you. Anything not assigned to your account simply isn't visible." },
  { q: "Are the prices final?", a: "Yes. Your agreed price is applied automatically and re-checked every time you add to your cart and when you place an order. If a price changes while items are in your cart, you'll see the old and new price and confirm before ordering." },
  { q: "How do I pay?", a: "Placing an order sends Delite a purchase request at your agreed prices. Our team confirms it and arranges payment and delivery under the terms on your account — you are not charged online." },
  { q: "Can my team use the portal?", a: "Yes. The account owner can add buyers who can order but cannot change account settings. Delite can also add team members for you." },
  { q: "I forgot my password or my link expired.", a: "Use “Forgot your password?” on the sign-in page for a fresh single-use link, or ask your Delite contact to resend your invitation." },
];

export function Landing() {
  const cards = [
    { icon: LockKeyhole, title: "Private Catalogue", body: "See only the products Delite has opened up to your business — nothing else." },
    { icon: Tags, title: "Contract Pricing", body: "Your agreed prices, applied automatically on every order. No price lists to chase." },
    { icon: Headset, title: "Dedicated Support", body: "A named Delite team behind your account for orders, deliveries and queries." },
  ];
  return (
    <PublicFrame>
      <section className="relative text-white bg-charcoal-deep overflow-hidden">
        <img src={HERO_IMAGE} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal-deep via-charcoal-deep/85 to-transparent" aria-hidden />
        <div className="container-page relative py-20 sm:py-28 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-widish text-gold mb-4">Exclusive partner portal</p>
          <h1 className="font-display uppercase text-[34px] sm:text-[52px] leading-[1.05] tracking-tightish mb-5">A better way to buy, built for our partners.</h1>
          <p className="text-[16px] text-white/80 max-w-[52ch] mb-8">Exclusive product access. Agreed pricing. One seamless ordering experience.</p>
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
      <section id="faq" className="container-page pb-16 max-w-3xl" aria-labelledby="faq-title">
        <h2 id="faq-title" className="font-display uppercase text-[22px] mb-5">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card-surface rounded-lg group">
              <summary className="flex items-center justify-between gap-4 p-4 cursor-pointer list-none font-medium text-[14.5px] [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="w-4 h-4 shrink-0 text-steel-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
              </summary>
              <p className="px-4 pb-4 text-[13.5px] text-steel-700">{f.a}</p>
            </details>
          ))}
        </div>
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
  const expired = params.get("expired") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [trap, setTrap] = useState(""); // honeypot: invisible to people, tempting to bots
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [throttle, setThrottle] = useState(readThrottle);
  const locked = throttle.until > now;

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [locked]);

  if (ready && signedIn) return <Navigate to={returnTo} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setError(null);
    setBusy(true);
    const res = trap ? { error: "Invalid email or password" } : await signIn(email, password);
    setBusy(false);
    if (res.error) {
      const fails = throttle.fails + 1;
      const next = { fails, until: fails >= 5 ? Date.now() + Math.min(300_000, 30_000 * 2 ** (fails - 5)) : 0 };
      writeThrottle(next);
      setThrottle(next);
      setNow(Date.now());
      setError(res.error);
    } else {
      writeThrottle(null);
      navigate(returnTo, { replace: true });
    }
  };

  return (
    <PublicFrame>
      <div className="container-page py-14 max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Dealer sign in</h1>
        <p className="text-[13.5px] text-steel-500 mb-6">Use the credentials from your Delite invitation. There is no public sign-up.</p>
        {expired && <p role="status" className="mb-4 text-[13px] rounded-md border border-amber-300 bg-amber-50 px-3 py-2">Your session has ended. Please sign in again.</p>}
        <form onSubmit={submit} className="card-surface rounded-lg p-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Leave this field empty</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </div>
          {error && !locked && <p role="alert" className="text-[13px] text-sale">{error}</p>}
          {locked && <p role="alert" className="text-[13px] text-sale">Too many attempts. Please wait {Math.ceil((throttle.until - now) / 1000)} seconds, or use “Forgot your password?”.</p>}
          <button type="submit" disabled={busy || locked || !email || !password} className={`${btnPrimary} w-full`}>
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

/** Secure password policy (spec §10): 10+ characters with at least one letter and one number. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  return null;
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
    const problem = passwordProblem(pw);
    if (problem) return setError(problem);
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
              <input id="np" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} className={inputClass} aria-describedby="np-help" />
              <p id="np-help" className="text-[12px] text-steel-500 mt-1">At least 10 characters, with a letter and a number.</p>
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
