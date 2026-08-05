/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. */
  readonly VITE_SUPABASE_URL: string
  /**
   * Supabase ANON key — never a service key. RLS is the enforcement layer, and
   * a service key in the client bypasses it entirely.
   */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
