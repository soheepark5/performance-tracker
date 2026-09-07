import { useState } from 'react'
import { useAuth } from '../store/auth'
import { Card, TextField } from './ui'

/**
 * Email and password, one screen, identical on every device.
 *
 * Nothing is emailed and nothing is opened from an email, so there is no
 * redirect, no default-browser question, and no difference between a desktop
 * tab, a phone browser and the installed home-screen app.
 */
export function SignIn() {
  const { signIn, signUp, loading } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="app">
        <div className="empty" style={{ paddingTop: 80 }}>Checking your session…</div>
      </div>
    )
  }

  const ready = email.trim().length > 3 && password.length >= 6

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    // On success the session arrives through onAuthStateChange and this screen
    // is replaced, so only the failure path needs handling here.
    if (!res.ok) setError(res.message)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Capacity</h1>
        <div className="sub">Body · Brain · Immersion</div>
      </header>

      <Card title={mode === 'in' ? 'Sign in' : 'Create an account'}>
        <p className="desc">
          {mode === 'in'
            ? 'Your record syncs through your own private database. Sign in on each device and they share one record.'
            : 'Pick something only you know. Your rows are readable only by this account.'}
        </p>

        <TextField label="Email" value={email} onChange={setEmail} placeholder="you@example.com" />

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            placeholder="at least 6 characters"
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !busy) void submit()
            }}
          />
        </div>

        {error && <p className="tiny" style={{ color: 'var(--critical)', margin: '0 0 10px' }}>{error}</p>}

        <button className="btn primary full" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>

        <div className="center" style={{ marginTop: 12 }}>
          <button
            className="linkbtn"
            onClick={() => {
              setMode(mode === 'in' ? 'up' : 'in')
              setError(null)
            }}
          >
            {mode === 'in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>
      </Card>

      <p className="tiny muted center" style={{ marginTop: 16 }}>
        Each account can read and write only its own rows. Stages and thresholds are still calculated on this device.
      </p>
    </div>
  )
}
