import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Real accounts/reviews/orders always go through Supabase directly (RLS-enforced), independent of
 * `VITE_CATALOG_SOURCE` (which only picks the catalog *data* source). `VITE_SUPABASE_URL`/
 * `VITE_SUPABASE_PUBLISHABLE_KEY` are the same safe-for-browser values `supabaseCatalogService.ts`
 * already uses — never the Odoo credentials, which stay server-only inside Edge Functions.
 *
 * When these aren't set (e.g. local dev with only VITE_CATALOG_SOURCE=mock configured), `supabase`
 * is `null` rather than throwing on import — every consumer (`AuthContext`, review hooks) checks
 * `isSupabaseConfigured` and degrades to "accounts aren't set up yet" instead of a hard crash.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
