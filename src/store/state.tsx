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
import { loadState, migrate, saveState, uid } from './storage'

interface Ctx {
  state: AppState
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

    addWorkout: (w: Omit<Workout, 'id' | 'at'>) =>
      update((s) => ({ ...s, workouts: [...s.workouts, { ...w, id: uid(), at: new Date().toISOString() }] })),

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

    addStress: (e: Omit<StressEvent, 'id' | 'at' | 'date'>, at = new Date()) =>
      update((s) => ({ ...s, stress: [...s.stress, { ...e, id: uid(), at: at.toISOString(), date: today() }] })),

    deleteStress: (id: string) => update((s) => ({ ...s, stress: s.stress.filter((e) => e.id !== id) })),

    addImpulse: (e: Omit<ImpulseEvent, 'id' | 'at' | 'date'>, at = new Date()) =>
      update((s) => ({ ...s, impulses: [...s.impulses, { ...e, id: uid(), at: at.toISOString(), date: today() }] })),

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
  const [state, setState] = useState<AppState>(() => SHARED ?? loadState())
  const canEdit = SHARED == null
  const timer = useRef<number | undefined>(undefined)

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), [])

  useEffect(() => {
    // A shared copy is never written to the viewer's own storage.
    if (!canEdit) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => saveState(state), 250)
    return () => window.clearTimeout(timer.current)
  }, [state, canEdit])

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

  const value: Ctx = { state, canEdit, sharedAsOf, metrics, evals, activeFocusPoint, day, actions }
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useApp must be used inside StateProvider')
  return ctx
}

export const currentWeekStart = () => weekStart(today())
