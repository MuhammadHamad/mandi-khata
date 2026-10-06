/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** '1' for the demo build, which keeps its records in the browser. */
  readonly VITE_DEMO?: string
}
