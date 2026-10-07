import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { roleCanAccess } from "../services/adminAuth";

/**
 * Session-level gate for the whole /admin/* shell: signed in AND has SOME admin role. This is a
 * UX guard only — the REAL security boundary is Postgres RLS on every CMS/commerce table
 * (private.has_admin_role(...)), which a route guard alone can never be (spec section 5: "route
 * guards alone are NOT enough"). Per-page role restriction is a separate, finer check —
 * see RoleRoute below — so a denied page still shows the sidebar/topbar instead of hiding the
 * whole shell.
 */
export function RequireAdminRole({ children }: { children: ReactNode }) {
  const { session, loading, configured, adminRole, profile } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!configured || !session) {
    return <Navigate to={`/admin/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  // profile can briefly be null right after session restores (still loading the profiles row) —
  // wait for it rather than bouncing a genuine admin before their role has loaded.
  if (profile === null) return null;

  if (!adminRole) {
    return (
      <div className="min-h-screen grid place-items-center bg-paper px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Not an admin account</h1>
          <p className="text-[14px] text-steel-500 max-w-[42ch]">
            This account can sign in, but has no Delite Admin role assigned. Contact an owner to request access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const SECURITY_PATH = "/admin/settings/security";

/** Per-page role check, used inside AdminLayout's <Outlet/> tree — denies just the page content,
 * keeping the sidebar/topbar visible so a partially-privileged admin can still navigate away. Also
 * enforces REQUIRE_ADMIN_MFA (default off — see admin-security-policy) once it's turned on: every
 * page except Security itself is blocked until the session reaches AAL2, so an account can never
 * get locked out of the one page that lets it enroll/complete a challenge. */
export function RoleRoute({ path, children }: { path: string; children: ReactNode }) {
  const { adminRole, requireAdminMfa, aal } = useAuth();

  if (!roleCanAccess(adminRole, path)) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-lg font-semibold mb-2">Access denied</h2>
        <p className="text-[13.5px] text-steel-500">Your role ({adminRole}) doesn't have access to this page.</p>
      </div>
    );
  }

  if (requireAdminMfa && aal !== null && aal !== "aal2" && path !== SECURITY_PATH) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-lg font-semibold mb-2">Two-factor authentication required</h2>
        <p className="text-[13.5px] text-steel-500 max-w-[42ch] mx-auto">
          This admin panel requires two-factor authentication. Set it up (or complete verification
          by signing in again) from the Security page before continuing.
        </p>
        <Link to={SECURITY_PATH} className="inline-block mt-4 text-[12.5px] font-semibold text-brand-700 hover:underline">
          Go to Security →
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
