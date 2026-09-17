import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Gates a route behind a signed-in session — used by /account and /checkout. This is a UX guard
 * only (redirects instead of showing a broken page); the REAL security is Postgres RLS on
 * `profiles`/`orders`/`product_reviews` and the JWT check inside `create-order` — this component
 * cannot be relied on as the security boundary by itself.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!configured || !session) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children}</>;
}

/** Same idea, but also requires profile.is_admin — used by /admin. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading, configured, isAdmin, profile } = useAuth();

  if (loading) return null;
  if (!configured || !session) return <Navigate to="/login?returnTo=%2Fadmin" replace />;
  // profile can briefly be null right after session restores (still loading the profiles row) —
  // wait for it rather than bouncing a genuine admin before their role has loaded.
  if (profile === null) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
