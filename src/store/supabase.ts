import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client, created only when the app was built with credentials.
 *
 * Two builds deliberately ship without them — the single-file artifact and the
 * read-only shared copy — and both must keep working exactly as before. So
 * every cloud path in the app is guarded by `cloudEnabled`; when it is false
 * the app is the local-first tracker it has always been.
 *
 * Only the anon key is ever present here. It is public by design: what protects
 * the data is Row Level Security in supabase/schema.sql, which scopes every row
 * to auth.uid(). A service-role key must never appear in frontend code.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudEnabled = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        // Keeps you signed in across reloads and offline launches; the session
        // lives in this browser's storage, like the record cache beside it.
        persistSession: true,
        autoRefreshToken: true,
        // Sign-in is a typed code, never a link, so there is no URL to inspect.
        detectSessionInUrl: false,
      },
    })
  : null

/** A guard against the service-role key being pasted in by mistake. */
if (cloudEnabled && anonKey && anonKey.includes('service_role')) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY looks like a service-role key. That key bypasses Row Level Security and must never be shipped to a browser — use the anon/publishable key.',
  )
}
