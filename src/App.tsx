import { useEffect, useState } from 'react'
import { useMidnightTick } from './components/charts'
import { Data } from './screens/Data'
import { Stages } from './screens/Stages'
import { Today } from './screens/Today'
import { Trends } from './screens/Trends'
import { formatDay, minutesSinceMidnight, today } from './domain/date'
import { duePings, fireNotification, nextPing, slotLabel } from './domain/pings'
import { StateProvider, useApp } from './store/state'
import { AuthProvider, useAuth } from './store/auth'
import { SignIn } from './components/SignIn'
import { pushBack } from './components/backstack'
import type { Domain } from './domain/types'

type Tab = 'today' | 'trends' | 'stages' | 'data'

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'today', label: 'Today', glyph: '◎' },
  { id: 'trends', label: 'Trends', glyph: '◠' },
  { id: 'stages', label: 'Stages', glyph: '◪' },
  { id: 'data', label: 'Data', glyph: '≡' },
]

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/**
 * A cloud-backed build is private, so it asks who you are first. Builds without
 * Supabase credentials — the artifact, the read-only shared copy, any local
 * build without a .env — skip the gate entirely and run local-first as before.
 */
function Gate() {
  const auth = useAuth()
  const isSharedCopy = typeof __SHARED_RECORD__ !== 'undefined' && __SHARED_RECORD__ != null

  if (auth.enabled && !isSharedCopy && !auth.session) return <SignIn />

  return (
    <StateProvider>
      <Shell />
    </StateProvider>
  )
}

function Shell() {
  const { state, day } = useApp()
  const [tab, setTab] = useState<Tab>('today')
  /*
   * Every tab change is a history step, so the phone's back button walks back
   * through what you looked at instead of closing the installed app.
   */
  const go = (next: Tab) => {
    if (next === tab) return
    const prev = tab
    pushBack(() => setTab(prev))
    setTab(next)
  }
  const [domain, setDomain] = useState<Domain>('body')
  useMidnightTick()
  useReminders()

  const date = today()
  const pending = duePings(state, day(date), date).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="row between">
          <div>
            <h1>{TITLES[tab]}</h1>
            <div className="sub">{formatDay(date)}</div>
          </div>
          {pending > 0 && tab !== 'today' && (
            <button className="btn small" onClick={() => go('today')}>
              {pending} check-in{pending === 1 ? '' : 's'} waiting
            </button>
          )}
        </div>
      </header>

      <main>
        {tab === 'today' && <Today goToStages={(d) => { setDomain(d); go('stages') }} />}
        {tab === 'trends' && <Trends domain={domain} setDomain={setDomain} />}
        {tab === 'stages' && <Stages domain={domain} setDomain={setDomain} />}
        {tab === 'data' && <Data />}
      </main>

      <nav className="nav" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <span className="glyph" aria-hidden="true">{t.glyph}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

const TITLES: Record<Tab, string> = {
  today: 'Capacity',
  trends: 'Trends',
  stages: 'Stages',
  data: 'Data',
}

/**
 * Reminders while the app is open. Deliberately not a service worker or a push
 * subscription: those need a server and an account, and this app has neither.
 * Anything missed is still waiting on the Today screen when you next open it.
 */
function useReminders() {
  const { state, day } = useApp()
  useEffect(() => {
    if (!state.settings.notificationsEnabled) return
    const date = today()
    const next = nextPing(state, day(date), date)
    if (!next) return
    const delay = (next.at - minutesSinceMidnight()) * 60_000
    if (delay <= 0 || delay > 12 * 3600_000) return
    const t = window.setTimeout(() => {
      fireNotification('Capacity', `${slotLabel(next.slot)} — what was your mind on just now?`)
    }, delay)
    return () => window.clearTimeout(t)
  }, [state, day])
}
