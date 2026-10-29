import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Headset, LayoutDashboard, LogOut, Menu, Package, Search, ShoppingCart, ClipboardList, UserRound, X } from "lucide-react";
import { useDealerAuth } from "./DealerAuth";
import { dealerApi, type Me } from "./lib/dealerApi";
import { brandingImageUrl } from "./lib/media";
import { ApiError } from "./lib/transport";
import { btnOutline, btnPrimary, ErrorState, PageSkeleton, Spinner } from "./ui";

interface MeContextValue {
  me: Me;
  cartLines: number;
  setCartLines: (n: number) => void;
  reloadMe: () => void;
}

const MeContext = createContext<MeContextValue | null>(null);
export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used inside the dealer shell");
  return ctx;
}

/** Top-of-page progress bar on every route change (spec §5.5: visible route-transition indicator). */
function RouteProgress() {
  const { pathname, search } = useLocation();
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 450);
    return () => clearTimeout(t);
  }, [pathname, search]);
  return (
    <div className="fixed top-0 inset-x-0 h-0.5 z-[60] pointer-events-none" aria-hidden>
      <div className={`h-full bg-[var(--dealer-accent)] origin-left transition-transform ease-out ${active ? "scale-x-75 duration-300" : "scale-x-0 opacity-0 duration-200"} motion-reduce:transition-none`} />
    </div>
  );
}

function BlockingState({ title, body, signOutLabel = "Sign out" }: { title: string; body: string; signOutLabel?: string }) {
  const { signOut } = useDealerAuth();
  return (
    <div className="min-h-screen grid place-items-center bg-paper px-6" style={{ "--dealer-accent": "#10148F" } as CSSProperties}>
      <div role="alert" className="max-w-md text-center card-surface rounded-lg p-8">
        <h1 className="text-xl font-semibold mb-2">{title}</h1>
        <p className="text-[14px] text-steel-500 mb-5">{body}</p>
        <button type="button" onClick={() => signOut()} className={btnPrimary}>{signOutLabel}</button>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/catalog", label: "My Catalogue", icon: Package },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/support", label: "Support", icon: Headset },
  { to: "/account", label: "Account", icon: UserRound },
];

export function DealerShell() {
  const { ready, signedIn, signOut, email } = useDealerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [cartLines, setCartLines] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!ready || !signedIn) return;
    let cancelled = false;
    setError(null);
    dealerApi.me().then(
      (res) => {
        if (cancelled) return;
        setMe(res);
        setCartLines(res.stats.cartLines);
      },
      (err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "UNAUTHENTICATED") {
          setSessionEnded(true);
          signOut();
        }
        else setError(err instanceof ApiError ? err : new ApiError("NETWORK", "Couldn't load your account."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, tick, signOut]);

  useEffect(() => setDrawer(false), [location.pathname]);
  const reloadMe = useCallback(() => setTick((t) => t + 1), []);

  if (!ready) return <div className="p-10"><PageSkeleton /></div>;
  if (!signedIn) return <Navigate to={`/login?${sessionEnded ? "expired=1&" : ""}returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (error?.code === "FORBIDDEN") return <BlockingState title="No dealer access" body={error.message || "This account isn't linked to a dealer. If you were invited, use the link from your invitation email or contact Delite."} />;
  if (error?.code === "DEALER_INACTIVE") return <BlockingState title="Account unavailable" body={error.message} />;
  if (error) return <div className="min-h-screen grid place-items-center p-6"><div className="max-w-md w-full"><ErrorState error={error} onRetry={reloadMe} /></div></div>;
  if (!me) return <div className="min-h-screen p-10 bg-paper"><PageSkeleton /></div>;

  const accent = me.branding?.accentColor ?? "#10148F";
  const logo = brandingImageUrl(me.branding?.logoPath);
  const style = { "--dealer-accent": accent } as CSSProperties;

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/catalog?q=${encodeURIComponent(search.trim())}`);
  };

  const sidebar = (
    <nav aria-label="Dealer navigation" className="py-4">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `flex items-center gap-3 px-5 py-2.5 text-[14px] border-l-[3px] transition-colors ${isActive ? "bg-white font-semibold border-[var(--dealer-accent)]" : "border-transparent text-steel-700 hover:bg-white/70"}`}
        >
          <item.icon className="w-4 h-4" aria-hidden /> {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <MeContext.Provider value={{ me, cartLines, setCartLines, reloadMe }}>
      <div className="min-h-screen bg-paper text-ink flex flex-col print:bg-white" style={style}>
        <RouteProgress />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
        <header className="bg-white border-b border-line sticky top-0 z-40 print:hidden">
          <div className="h-16 px-4 lg:px-6 flex items-center gap-4">
            <button type="button" className="lg:hidden p-2 -ml-2" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu className="w-5 h-5" /></button>
            <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
              {logo ? <img src={logo} alt="" className="h-9 w-auto max-w-[120px] object-contain" /> : <span className="h-9 w-9 shrink-0 grid place-items-center rounded-md text-white font-display text-lg" style={{ background: accent }} aria-hidden>{me.dealer.displayName.charAt(0)}</span>}
              <span className="font-semibold truncate">{me.dealer.displayName}</span>
            </Link>
            <form onSubmit={submitSearch} role="search" className="hidden md:flex flex-1 max-w-md ml-6 relative">
              <label htmlFor="shell-search" className="sr-only">Search your catalogue</label>
              <Search className="w-4 h-4 absolute left-3 top-3 text-steel-500" aria-hidden />
              <input id="shell-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your catalogue" className="w-full h-10 pl-9 pr-3 border border-line rounded-md text-[14px] bg-paper focus:bg-white focus:outline-none focus:border-ink" />
            </form>
            <div className="ml-auto flex items-center gap-1">
              <Link to="/cart" className="relative p-2.5 rounded-md hover:bg-steel-50" aria-label={`Cart, ${cartLines} item${cartLines === 1 ? "" : "s"}`}>
                <ShoppingCart className="w-5 h-5" />
                {cartLines > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] leading-[18px] text-center text-white font-semibold" style={{ background: accent }}>{cartLines}</span>}
              </Link>
              <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu(false); }} onKeyDown={(e) => e.key === "Escape" && setMenu(false)}>
                <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="p-2 pl-2.5 rounded-md hover:bg-steel-50 flex items-center gap-2 text-[13px]">
                  <span className="w-7 h-7 rounded-full grid place-items-center text-white text-[12px] font-semibold" style={{ background: accent }} aria-hidden>{(email ?? me.dealer.displayName).charAt(0).toUpperCase()}</span>
                  <span className="hidden sm:inline max-w-[140px] truncate">{email}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-steel-500" aria-hidden />
                </button>
                {menu && (
                  <div role="menu" aria-label="Account" className="absolute right-0 mt-1 w-56 bg-white border border-line rounded-lg shadow-lift py-1 text-[13.5px] z-50">
                    <div className="px-3 py-2 border-b border-line"><div className="font-medium truncate">{me.dealer.displayName}</div><div className="text-[12px] text-steel-500 truncate">{email} · {me.user.role}</div></div>
                    <Link role="menuitem" to="/account" className="block px-3 py-2 hover:bg-steel-50" onClick={() => setMenu(false)}>Account &amp; team</Link>
                    <Link role="menuitem" to="/support" className="block px-3 py-2 hover:bg-steel-50" onClick={() => setMenu(false)}>Support</Link>
                    <button role="menuitem" type="button" onClick={() => signOut()} className="w-full text-left px-3 py-2 hover:bg-steel-50 flex items-center gap-2"><LogOut className="w-4 h-4" aria-hidden /> Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 bg-paper shadow-lift">
              <div className="h-16 px-5 flex items-center justify-between border-b border-line bg-white">
                <span className="font-semibold">{me.dealer.displayName}</span>
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="w-5 h-5" /></button>
              </div>
              {sidebar}
            </div>
          </div>
        )}

        <div className="flex-1 flex">
          <aside className="hidden lg:block w-60 shrink-0 bg-steel-50/60 border-r border-line print:hidden">{sidebar}</aside>
          <main id="main" className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
        <footer className="border-t border-line bg-white text-[12px] text-steel-500 px-6 py-3 print:hidden">Exclusive partner portal powered by Delite Auto</footer>
      </div>
    </MeContext.Provider>
  );
}

export function useSearchQuery(): string {
  const [params] = useSearchParams();
  return params.get("q") ?? "";
}

export function BusyButton({ busy, children, ...rest }: { busy: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} disabled={busy || rest.disabled} className={rest.className ?? btnOutline}>
      {busy && <Spinner />} {children}
    </button>
  );
}
