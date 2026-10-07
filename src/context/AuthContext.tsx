import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";

/** Mirrors the public.admin_role Postgres enum (20260917112554_add_admin_roles.sql). */
export type AdminRole = "owner" | "admin" | "content" | "merchandising" | "support" | "analytics";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  admin_role: AdminRole | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  adminRole: AdminRole | null;
  /** True while the initial session is being restored on page load — distinct from "signed out". */
  loading: boolean;
  /** False when VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY aren't set — see supabaseClient.ts. */
  configured: boolean;
  /** Server-side REQUIRE_ADMIN_MFA flag (default false — see admin-security-policy). Null while
   * not yet fetched (only fetched once a session exists). */
  requireAdminMfa: boolean | null;
  /** This session's current Authenticator Assurance Level ("aal1" | "aal2"), or null before it's
   * been checked. Used by RoleRoute to enforce requireAdminMfa without ever locking the account
   * out of the Security page itself (see RequireAdminRole.tsx). */
  aal: "aal1" | "aal2" | null;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  /** Returns `mfaRequired: true` when the account has a verified MFA factor and the resulting
   * session is still at AAL1 — the caller must complete a challenge (see AdminLogin.tsx) before
   * treating this as a fully signed-in session for a privileged route. */
  signIn: (email: string, password: string) => Promise<{ error?: string; mfaRequired?: boolean }>;
  /** Local scope only — signs this device/browser out, not every session on the account (#24). */
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Never reveals whether the email exists — see ForgotPassword.tsx. */
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  /** Called on the /reset-password route, after Supabase's own recovery-link redirect has
   * established a recovery session. */
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [requireAdminMfa, setRequireAdminMfa] = useState<boolean | null>(null);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("id, full_name, phone, is_admin, admin_role").eq("id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfile(newSession.user.id);
      else {
        setProfile(null);
        setRequireAdminMfa(null);
        setAal(null);
      }
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Fetched once per session (not per navigation) — see RoleRoute's use of these two values to
  // enforce REQUIRE_ADMIN_MFA without ever being able to lock an account out of /admin/settings/
  // security itself (spec section 33: never lock the sole owner out accidentally).
  useEffect(() => {
    if (!supabase || !session) return;
    let cancelled = false;
    supabase.functions.invoke<{ requireAdminMfa: boolean }>("admin-security-policy", { method: "POST" }).then(({ data }) => {
      if (!cancelled) setRequireAdminMfa(data?.requireAdminMfa ?? false);
    });
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (!cancelled) setAal((data?.currentLevel as "aal1" | "aal2" | undefined) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    if (!supabase) return { error: "auth-not-configured" };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: fullName ? { data: { full_name: fullName } } : undefined,
    });
    if (error) return { error: error.message };
    // A user row with no session means this project requires email confirmation before sign-in —
    // never assume the account is immediately usable.
    return { needsConfirmation: !!data.user && !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "auth-not-configured" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // An enrolled-but-unchallenged MFA factor leaves the session at AAL1 even though
    // signInWithPassword succeeded — the caller (AdminLogin.tsx) must run the challenge/verify
    // step before this counts as a real, privileged-route-ready sign-in.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { mfaRequired: aal ? aal.currentLevel === "aal1" && aal.nextLevel === "aal2" : false };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return { error: "auth-not-configured" };
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    // Deliberately ignores whatever Supabase actually returned (including "no such user") and
    // always reports success — the same generic response either way, so this can't be used to
    // enumerate registered emails (#22). A real infra problem (auth not configured) is the only
    // case that surfaces as an error, checked above before any network call.
    return {};
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) return { error: "auth-not-configured" };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.is_admin ?? false,
    adminRole: profile?.admin_role ?? null,
    loading,
    configured: isSupabaseConfigured,
    requireAdminMfa,
    aal,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    requestPasswordReset,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
