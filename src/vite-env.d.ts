/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. */
  readonly VITE_SUPABASE_URL: string
  /**
   * Supabase ANON key — never a service key. RLS is the enforcement layer, and
   * a service key in the client bypasses it entirely.
   */
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * `mock` serves a local corpus from `lib/mock/` — no network, no project, no
   * credentials. Anything else (including unset) means the live Supabase
   * client. Default is live so a build cannot ship mock data by omission.
   */
  readonly VITE_DATA_SOURCE?: 'mock' | 'live'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
