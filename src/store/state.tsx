import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { computeMetrics, type MetricSet } from '../domain/metrics'
import { evaluateAll } from '../domain/stages'
import { today, weekStart } from '../domain/date'
import type {
  AppState, AnchorCheck, DayLog, Domain, EveningEntry, FocusPoint, ImpulseEvent,
  ISODate, MorningEntry, Sample, Settings, StressEvent, WeeklyCheck, WeeklyTarget, Workout,
} from '../domain/types'
import type { DomainEval } from '../domain/stages'
import { STORAGE_KEY, loadState, loadSynced, migrate, saveState, saveSynced, uid } from './storage'
import { canonical, countOf, mergeStates, pull, pushDiff, verifyMigration, type RecordCounts } from './cloud'
import { useAuth } from './auth'
import { cloudEnabled } from './supabase'
import { localDateOf } from '../domain/date'

/** Everything the Data screen needs to say about the cloud, in one value. */
export interface SyncState {
  enabled: boolean
  signedIn: boolean
  phase: 'off' | 'signed-out' | 'loading' | 'synced' | 'pushing' | 'offline' | 'error' | 'needs-migration'
  lastSyncedAt: string | null
  message: string | null
  /** set when this device holds a record the cloud has never seen */
  pending: RecordCounts | null
}

interface Ctx {
  state: AppState
  sync: SyncState
  /** one-time upload of the local record, verified by reading it back */
  migrateLocal: () => Promise<{ ok: boolean; message: string }>
  /**
   * False in a published read-only copy: the record belongs to someone else,
   * so every control that would write is hidden rather than merely disabled.
   */
  canEdit: boolean
  /** the day the shared copy was exported, when this is one */
  sharedAsOf: string | null
  metrics: MetricSet
  evals: Record<Domain, DomainEval>
  activeFocusPoint: FocusPoint | null
  day: (date: ISODate) => DayLog
  actions: ReturnType<typeof makeActions>
}

const StateContext = createContext<Ctx | null>(null)

const emptyDay = (date: ISODate): DayLog => ({ date, samples: [] })

/** An event's calendar day always follows its timestamp, so editing the time moves it. */
const withDate = <T extends { at: string; date: string }>(x: T): T => ({ ...x, date: localDateOf(x.at) })

function makeActions(update: (fn: (s: AppState) => AppState) => void) {
  const patchDay = (date: ISODate, fn: (d: DayLog) => DayLog) =>
    update((s) => ({ ...s, days: { ...s.days, [date]: fn(s.days[date] ?? emptyDay(date)) } }))

  return {
    saveMorning: (date: ISODate, entry: Omit<MorningEntry, 'at'>) =>
      patchDay(date, (d) => ({ ...d, morning: { ...entry, at: new Date().toISOString() } })),

    saveEvening: (date: ISODate, entry: Omit<EveningEntry, 'at'>) =>
      patchDay(date, (d) => ({ ...d, evening: { ...entry, at: new Date().toISOString() } })),

    addSample: (date: ISODate, sample: Omit<Sample, 'id' | 'at'>) =>
      patchDay(date, (d) => ({ ...d, samples: [...d.samples, { ...sample, id: uid(), at: new Date().toISOString() }] })),

    removeSample: (date: ISODate, id: string) =>
      patchDay(date, (d) => ({ ...d, samples: d.samples.filter((s) => s.id !== id) })),

    addWorkout: (w: Omit<Workout, 'id'>) =>
      update((s) => ({ ...s, workouts: [...s.workouts, { ...w, id: uid() }] })),

    updateWorkout: (id: string, patch: Partial<Workout>) =>
      update((s) => ({ ...s, workouts: s.workouts.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),

    deleteWorkout: (id: string) => update((s) => ({ ...s, workouts: s.workouts.filter((w) => w.id !== id) })),

    saveWeekly: (ws: ISODate, reserve: number, note?: string) =>
      update((s) => {
        const entry: WeeklyCheck = { weekStart: ws, reserve, note, at: new Date().toISOString() }
        const rest = s.weekly.filter((w) => w.weekStart !== ws)
        return { ...s, weekly: [...rest, entry].sort((a, b) => a.weekStart.localeCompare(b.weekStart)) }
      }),

    addAnchor: (b: Omit<AnchorCheck, 'id' | 'at'>) =>
      update((s) => ({ ...s, anchors: [...s.anchors, { ...b, id: uid(), at: new Date().toISOString() }].sort((x, y) => x.date.localeCompare(y.date)) })),

    deleteAnchor: (id: string) => update((s) => ({ ...s, anchors: s.anchors.filter((b) => b.id !== id) })),

    saveAnchorProtocol: (p: AppState['anchorProtocols'][number]) =>
      update((s) => ({ ...s, anchorProtocols: s.anchorProtocols.some((x) => x.id === p.id) ? s.anchorProtocols.map((x) => (x.id === p.id ? p : x)) : [...s.anchorProtocols, p] })),

    saveWeeklyTarget: (t: WeeklyTarget) =>
      update((s) => ({
        ...s,
        weeklyTargets: [...s.weeklyTargets.filter((x) => x.weekStart !== t.weekStart), t].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      })),

    deleteWeeklyTarget: (ws: ISODate) =>
      update((s) => ({ ...s, weeklyTargets: s.weeklyTargets.filter((t) => t.weekStart !== ws) })),

    saveLifts: (lifts: AppState['lifts']) => update((s) => ({ ...s, lifts })),

    addStress: (e: Omit<StressEvent, 'id' | 'date'>) =>
      update((s) => ({ ...s, stress: [...s.stress, withDate({ ...e, id: uid(), date: '' })] })),

    updateStress: (id: string, patch: Partial<Omit<StressEvent, 'id' | 'date'>>) =>
      update((s) => ({ ...s, stress: s.stress.map((e) => (e.id === id ? withDate({ ...e, ...patch }) : e)) })),

    deleteStress: (id: string) => update((s) => ({ ...s, stress: s.stress.filter((e) => e.id !== id) })),

    addImpulse: (e: Omit<ImpulseEvent, 'id' | 'date'>) =>
      update((s) => ({ ...s, impulses: [...s.impulses, withDate({ ...e, id: uid(), date: '' })] })),

    updateImpulse: (id: string, patch: Partial<Omit<ImpulseEvent, 'id' | 'date'>>) =>
      update((s) => ({ ...s, impulses: s.impulses.map((i) => (i.id === id ? withDate({ ...i, ...patch }) : i)) })),

    deleteImpulse: (id: string) => update((s) => ({ ...s, impulses: s.impulses.filter((e) => e.id !== id) })),

    setFocusPoint: (title: string, why?: string) =>
      update((s) => {
        const now = new Date().toISOString()
        const closed = s.focusPoints.map((f) => (f.endedAt ? f : { ...f, endedAt: now }))
        return { ...s, focusPoints: [...closed, { id: uid(), title, why, startedAt: now }] }
      }),

    renameFocusPoint: (id: string, title: string, why?: string) =>
      update((s) => ({ ...s, focusPoints: s.focusPoints.map((f) => (f.id === id ? { ...f, title, why } : f)) })),

    updateSettings: (patch: Partial<Settings>) =>
      update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),

    setThreshold: (domain: Domain, level: number, metric: string, value: number | null) =>
      update((s) => {
        const o = structuredClone(s.settings.thresholdOverrides ?? {})
        const lvl = String(level)
        o[domain] ??= {}
        o[domain][lvl] ??= {}
        if (value == null) delete o[domain][lvl][metric]
        else o[domain][lvl][metric] = value
        return { ...s, settings: { ...s.settings, thresholdOverrides: o } }
      }),

    replaceState: (next: unknown) => update(() => migrate(next)),
  }
}

/** A record baked in at build time makes this a read-only published copy. */
const SHARED: AppState | null = (() => {
  try {
    const raw = typeof __SHARED_RECORD__ === 'undefined' ? null : __SHARED_RECORD__
    return raw ? migrate(raw) : null
  } catch {
    return null
  }
})()

export function StateProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [state, setState] = useState<AppState>(() => SHARED ?? loadState())
  const canEdit = SHARED == null
  const timer = useRef<number | undefined>(undefined)

  /*
   * The last state known to be in the database. A failed push leaves it where
   * it was, so the next diff still carries the unsent work. That is the whole
   * offline story — no queue, no replay log.
   */
  const synced = useRef<AppState | null>(canEdit ? loadSynced() : null)

  /*
   * A live handle on the current state.
   *
   * doPull must not close over `state`: its useCallback is keyed on the session,
   * so a captured `state` goes stale the moment anything is logged. A stale
   * `local` makes the three-way merge read "this row is gone from the device"
   * and faithfully propagate that as a deletion — which silently destroys rows
   * in the database. Adding `state` to the deps instead would rebuild doPull on
   * every keystroke and re-trigger the pull effect, so a ref is the fix.
   */
  const latest = useRef<AppState>(state)
  latest.current = state
  const [sync, setSync] = useState<SyncState>({
    enabled: cloudEnabled,
    signedIn: false,
    phase: cloudEnabled ? 'loading' : 'off',
    lastSyncedAt: null,
    message: null,
    pending: null,
  })

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), [])

  /* ------------------------------------------------------------ local cache */
  useEffect(() => {
    // A shared copy is never written to the viewer's own storage.
    if (!canEdit) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => saveState(state), 250)
    return () => window.clearTimeout(timer.current)
  }, [state, canEdit])

  /* ------------------------------------------------------------------ pull */
  const doPull = useCallback(async () => {
    const userId = auth.session?.user?.id
    if (!cloudEnabled || !canEdit || !userId) return
    setSync((s) => ({ ...s, phase: 'loading', message: null }))
    try {
      const { state: remote, empty } = await pull(userId)
      if (empty) {
        /*
         * Nothing in the cloud yet. Never silently overwrite what is on this
         * device — hand the decision to the Data screen instead.
         */
        const local = latest.current
        const counts = countOf(local)
        const hasLocal = Object.values(counts).some((n) => n > 0)
        if (!hasLocal) {
          synced.current = remote
          saveSynced(remote)
        }
        setSync((s) => ({
          ...s,
          signedIn: true,
          phase: hasLocal ? 'needs-migration' : 'synced',
          pending: hasLocal ? counts : null,
          lastSyncedAt: new Date().toISOString(),
          message: hasLocal ? 'This device holds a record the cloud has never seen.' : null,
        }))
        return
      }
      /*
       * Never a plain overwrite. Anything edited on this device since its last
       * confirmed sync — an offline check-in, say — has to survive the pull, so
       * the cloud copy is merged against the persisted baseline rather than
       * replacing what is here. The push effect then sends whatever the merge
       * kept that the cloud does not yet have.
       */
      const baseline = synced.current
      const merged = mergeStates(baseline, latest.current, remote)
      const hadPendingWork = canonical(merged) !== canonical(remote)

      setState(merged)
      synced.current = remote
      saveSynced(remote)
      saveState(merged)
      setSync((s) => ({
        ...s,
        signedIn: true,
        phase: hadPendingWork ? 'pushing' : 'synced',
        pending: null,
        lastSyncedAt: new Date().toISOString(),
        message: hadPendingWork ? 'Sending changes made while you were offline…' : null,
      }))
    } catch (err: any) {
      setSync((s) => ({ ...s, signedIn: true, phase: 'offline', message: err?.message ?? 'Could not reach the cloud.' }))
    }
  }, [auth.session, canEdit])

  useEffect(() => {
    if (!cloudEnabled || !canEdit || auth.loading) return
    if (!auth.session) {
      synced.current = null
      saveSynced(null)
      setSync((s) => ({ ...s, signedIn: false, phase: 'signed-out', pending: null }))
      return
    }
    void doPull()
  }, [auth.loading, auth.session, canEdit, doPull])

  /* Returning to the app is exactly when the other device's work is missing. */
  useEffect(() => {
    if (!cloudEnabled || !canEdit || !auth.session) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void doPull()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [auth.session, canEdit, doPull])

  /* ------------------------------------------------------------------ push */
  const pushTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const userId = auth.session?.user?.id
    if (!cloudEnabled || !canEdit || !userId) return
    if (sync.phase === 'needs-migration' || sync.phase === 'loading') return
    if (synced.current === state) return

    window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(async () => {
      const baseline = synced.current
      setSync((s) => ({ ...s, phase: 'pushing' }))
      try {
        await pushDiff(userId, baseline, state)
        synced.current = state
        saveSynced(state)
        setSync((s) => ({ ...s, phase: 'synced', lastSyncedAt: new Date().toISOString(), message: null }))
      } catch (err: any) {
        // Baseline deliberately not advanced: the next diff re-sends this work.
        setSync((s) => ({
          ...s,
          phase: 'offline',
          message: err?.message ?? 'Saved on this device; it will sync when you are back online.',
        }))
      }
    }, 900)
    return () => window.clearTimeout(pushTimer.current)
  }, [state, auth.session, canEdit, sync.phase])

  /* ------------------------------------------------------------- migration */
  const migrateLocal = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const userId = auth.session?.user?.id
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const local = loadState()
    const before = countOf(local)
    try {
      // Keep an untouched copy of exactly what this device held.
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) localStorage.setItem(`${STORAGE_KEY}.premigration.${new Date().toISOString().slice(0, 10)}`, raw)

      setSync((s) => ({ ...s, phase: 'pushing', message: 'Uploading…' }))
      await pushDiff(userId, null, local)

      // Verify by reading it back rather than trusting the write.
      const { state: remote } = await pull(userId)
      const check = verifyMigration(local, remote)
      if (!check.ok) {
        setSync((s) => ({
          ...s,
          phase: 'error',
          message: `Upload did not verify: ${check.problems.join('; ')}. Your local record is untouched.`,
        }))
        return {
          ok: false,
          message: `Verification failed on ${check.problems.length} item${check.problems.length === 1 ? '' : 's'}. Nothing local was changed.`,
        }
      }

      setState(remote)
      synced.current = remote
      saveState(remote)
      saveSynced(remote)
      localStorage.setItem('capacity.migrated.v1', new Date().toISOString())
      setSync((s) => ({ ...s, phase: 'synced', pending: null, lastSyncedAt: new Date().toISOString(), message: null }))
      return {
        ok: true,
        message: `Uploaded and verified ${check.checked} rows by content: ${before.days} days, ${before.workouts} sessions, ${before.impulses} impulses.`,
      }
    } catch (err: any) {
      setSync((s) => ({ ...s, phase: 'error', message: err?.message ?? 'Upload failed.' }))
      return { ok: false, message: err?.message ?? 'Upload failed. Your local record is untouched.' }
    }
  }, [auth.session])

  const actions = useMemo(() => makeActions(update), [update])
  const metrics = useMemo(() => computeMetrics(state), [state])
  const evals = useMemo(() => evaluateAll(state, metrics), [state, metrics])
  const activeFocusPoint = useMemo(
    () => [...state.focusPoints].reverse().find((f) => !f.endedAt) ?? null,
    [state.focusPoints],
  )
  const day = useCallback((date: ISODate) => state.days[date] ?? emptyDay(date), [state.days])

  const sharedAsOf = useMemo(() => {
    if (!SHARED) return null
    const days = Object.keys(SHARED.days).sort()
    return days[days.length - 1] ?? SHARED.settings.startDate
  }, [])

  const value: Ctx = { state, sync, migrateLocal, canEdit, sharedAsOf, metrics, evals, activeFocusPoint, day, actions }
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useApp must be used inside StateProvider')
  return ctx
}

export const currentWeekStart = () => weekStart(today())
