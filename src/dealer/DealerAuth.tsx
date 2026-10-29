import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { dealerBasename } from "./lib/media";

interface DealerAuthValue {
  /** False until the stored session has been restored — distinct from "signed out". */
  ready: boolean;
  signedIn: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  requestReset: (email: string) => Promise<void>;
  setPassword: (password: string) => Promise<{ error?: string }>;
}

const Ctx = createContext<DealerAuthValue | null>(null);

/**
 * Deliberately NOT the storefront's AuthProvider: the dealer portal has no signup, no profiles/admin
 * lookups and no wishlist/cart sync — it only restores a Supabase session. Whether that session may
 * do anything is decided server-side by the `dealer-portal` function (dealer_users membership), never
 * by anything in this file.
 */
export function DealerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "The portal isn't connected to its backend yet." };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // One generic message — never reveals whether the account exists or is a dealer account.
    return error ? { error: "Invalid email or password" } : {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut({ scope: "local" });
  }, []);

  const requestReset = useCallback(async (email: string) => {
    if (!supabase) return;
    // Ignores the result on purpose: the same generic confirmation is shown whether or not the email exists.
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${dealerBasename()}/reset-password` });
  }, []);

  const setPassword = useCallback(async (password: string) => {
    if (!supabase) return { error: "The portal isn't connected to its backend yet." };
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: error.message } : {};
  }, []);

  const value: DealerAuthValue = {
    ready,
    signedIn: !!session,
    email: session?.user.email ?? null,
    signIn,
    signOut,
    requestReset,
    setPassword,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDealerAuth(): DealerAuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDealerAuth must be used within DealerAuthProvider");
  return ctx;
}
