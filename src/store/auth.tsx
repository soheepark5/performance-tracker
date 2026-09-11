import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cloudEnabled, supabase } from './supabase'
import { clearAllDrafts } from '../components/draft'

/**
 * Email and password authentication.
 *
 * Chosen because it is the only option with no email in the critical path.
 * Magic links open in the phone's default browser rather than the installed
 * app, which can leave the PWA still showing a sign-in screen; six-digit codes
 * solve that but need a custom SMTP provider before Supabase will let the email
 * template carry the code at all. A password needs neither: no template, no
 * redirect, no delivery that can fail, and identical behaviour on desktop, in a
 * mobile browser and in the installed PWA.
 *
 * Access is by credentials alone — anyone holding a valid pair signs in, and Row
 * Level Security then scopes them to their own rows and nobody else's.
 *
 * Offline the cached session keeps working, so the app opens and reads its local
 * cache without a network round trip. When the build has no Supabase
 * credentials this provider reports "disabled" and the app runs exactly as the
 * local-first tracker it was before.
 */

interface AuthCtx {
  enabled: boolean
  /** null while the initial session lookup is in flight */
  loading: boolean
  session: Session | null
  email: string | null
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message: string }>
  signUp: (email: string, password: string) => Promise<{ ok: boolean; message: string }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(cloudEnabled)

  useEffect(() => {
    if (!supabase) return
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({
      enabled: cloudEnabled,
      loading,
      session,
      email: session?.user?.email ?? null,
      async signIn(email: string, password: string) {
        if (!supabase) return { ok: false, message: 'This build has no cloud configured.' }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error) return { ok: true, message: 'Signed in.' }
        if (/email not confirmed/i.test(error.message)) {
          return {
            ok: false,
            message: 'This account still needs email confirmation. Turn off "Confirm email" in Supabase (Authentication -> Providers -> Email), then try again.',
          }
        }
        if (/invalid login credentials/i.test(error.message)) {
          return { ok: false, message: 'That email and password do not match an account.' }
        }
        return { ok: false, message: error.message }
      },

      async signUp(email: string, password: string) {
        if (!supabase) return { ok: false, message: 'This build has no cloud configured.' }
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
          if (/already registered|already exists/i.test(error.message)) {
            return { ok: false, message: 'An account with that email already exists. Sign in instead.' }
          }
          return { ok: false, message: error.message }
        }
        // With email confirmation switched off the session arrives immediately.
        // With it on, Supabase returns a user but no session and expects a
        // confirmation email we cannot customise, so say so plainly.
        if (!data.session) {
          return {
            ok: false,
            message: 'Account created, but it needs email confirmation before it can sign in. Turn off "Confirm email" in Supabase (Authentication -> Providers -> Email) and sign in.',
          }
        }
        return { ok: true, message: 'Account created.' }
      },

      async signOut() {
        // The record cache is deliberately left alone: signing out is not erasing.
        // Half-written drafts are cleared, so the next person here never sees them.
        clearAllDrafts()
        await supabase?.auth.signOut()
      },
    }),
    [loading, session],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
