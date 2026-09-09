/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" (default) or "http" — see src/services/catalog/catalogService.ts */
  readonly VITE_CATALOG_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
