/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" (default), "supabase", or "http" — see src/services/catalog/catalogService.ts */
  readonly VITE_CATALOG_SOURCE?: string;
  /** Safe client-side (anon/publishable), never the Odoo credentials — see src/lib/supabaseClient.ts */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
