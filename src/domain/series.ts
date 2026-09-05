import { addDays, dateRange, daysBetween, weekStart } from './date'
import { dayCoverage, liftVolume, sessionLoad } from './metrics'
import type { AppState, ISODate } from './types'

/** Time-series builders for the charts. Raw values in, raw values out. */

export interface Point {
  date: ISODate
  /** the plotted value (a rolling mean where the underlying signal is noisy) */
  value: number | null
  /** the untouched reading for that day, surfaced in tooltips and the table view */
  raw: number | null
}

export type DailyKey =
  | 'clarityAm' | 'clarityPm' | 'emotionalBaseline' | 'sleepHours'
  | 'coverage' | 'coverageSampled' | 'fpContinuity' | 'slowThinking' | 'automaticReturn' | 'enjoyment'

export function dailyRaw(state: AppState, key: DailyKey, from: ISODate, to: ISODate): { date: ISODate; raw: number | null }[] {
  return dateRange(from, to).map((date) => {
    const d = state.days[date]
    let raw: number | null = null
    if (d) {
      switch (key) {
        case 'clarityAm': raw = d.morning?.clarity ?? null; break
        case 'clarityPm': raw = d.evening?.clarity ?? null; break
        case 'emotionalBaseline': raw = d.morning?.emotionalBaseline ?? null; break
        case 'sleepHours': raw = d.morning?.sleepHours ?? null; break
        case 'coverage': raw = dayCoverage(d).blended; break
        case 'coverageSampled': raw = dayCoverage(d).sampled; break
        case 'fpContinuity': raw = d.evening?.fpContinuity ?? null; break
        case 'slowThinking': raw = d.evening?.slowThinking ?? null; break
        case 'automaticReturn': raw = d.evening?.automaticReturn ?? null; break
        case 'enjoyment': raw = d.evening?.enjoyment ?? null; break
      }
    }
    return { date, raw }
  })
}

/**
 * Centre-free trailing rolling mean. Daily self-ratings are noisy; the trend is
 * the thing worth looking at, and the raw reading stays attached to each point.
 */
export function rollingMean(rows: { date: ISODate; raw: number | null }[], window: number): Point[] {
  return rows.map((row, i) => {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1).map((r) => r.raw).filter((v): v is number => v != null)
    return { date: row.date, raw: row.raw, value: slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null }
  })
}

export function dailySeries(state: AppState, key: DailyKey, from: ISODate, to: ISODate, smooth = 7): Point[] {
  return rollingMean(dailyRaw(state, key, from, to), smooth)
}

/* ----------------------------------------------------------------- weekly */

export interface WeekRow {
  weekStart: ISODate
  load: number
  sessions: number
  reserve: number | null
  strongImpulses: number
  disruptionMin: number
  stressEvents: number
  /** goal volume of this week's target, as a ratio of the baseline week */
  goalRatio: number | null
  /** mean RPE of the prescribed sessions logged in this week */
  prescribedRpe: number | null
}

export function weeklyRows(state: AppState, from: ISODate, to: ISODate): WeekRow[] {
  const weeks = new Map<ISODate, WeekRow>()
  const first = weekStart(from)
  for (let w = first; daysBetween(w, to) >= 0; w = addDays(w, 7)) {
    weeks.set(w, { weekStart: w, load: 0, sessions: 0, reserve: null, strongImpulses: 0, disruptionMin: 0, stressEvents: 0, goalRatio: null, prescribedRpe: null })
  }
  const touch = (d: ISODate) => weeks.get(weekStart(d))

  for (const w of state.workouts) {
    const row = touch(w.date)
    if (!row) continue
    row.load += sessionLoad(w)
    row.sessions += 1
  }
  for (const c of state.weekly) {
    const row = weeks.get(c.weekStart)
    if (row) row.reserve = c.reserve
  }
  for (const i of state.impulses) {
    const row = touch(i.date)
    if (!row) continue
    if (i.intensity >= 7) row.strongImpulses += 1
    row.disruptionMin += i.disruptionMinutes
  }
  for (const s of state.stress) {
    const row = touch(s.date)
    if (row) row.stressEvents += 1
  }

  // Goal ratio against the earliest recorded target, and the cost actually paid.
  const specs = new Map(state.lifts.map((l) => [l.key, l]))
  const ordered = [...state.weeklyTargets].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const base = ordered[0]
  for (const t of ordered) {
    const row = weeks.get(t.weekStart)
    if (!row || !base) continue
    const ratios: number[] = []
    for (const [key, spec] of specs) {
      const a = base.targets[key]
      const b = t.targets[key]
      if (!a || !b) continue
      const va = liftVolume(a, spec)
      const vb = liftVolume(b, spec)
      if (va > 0 && vb > 0) ratios.push(vb / va)
    }
    row.goalRatio = ratios.length ? ratios.reduce((x, y) => x + y, 0) / ratios.length : null
  }
  const rpe = new Map<ISODate, number[]>()
  for (const w of state.workouts) {
    if (!w.prescribed) continue
    const k = weekStart(w.date)
    rpe.set(k, [...(rpe.get(k) ?? []), w.rpe])
  }
  for (const [k, list] of rpe) {
    const row = weeks.get(k)
    if (row && list.length) row.prescribedRpe = list.reduce((x, y) => x + y, 0) / list.length
  }
  return [...weeks.values()]
}

/* -------------------------------------------------------------- benchmark */

export interface AnchorPoint {
  date: ISODate
  /** composite % change vs the first benchmark of the same protocol */
  composite: number
  values: Record<string, number>
}

export function anchorSeries(state: AppState, protocolId?: string): AnchorPoint[] {
  const pid = protocolId ?? state.anchors[state.anchors.length - 1]?.protocolId
  if (!pid) return []
  const proto = state.anchorProtocols.find((p) => p.id === pid)
  const list = state.anchors.filter((b) => b.protocolId === pid).sort((a, b) => a.date.localeCompare(b.date))
  if (!proto || !list.length) return []
  const base = list[0]
  return list.map((b) => {
    const deltas: number[] = []
    for (const f of proto.fields) {
      const a = base.values[f.key]
      const v = b.values[f.key]
      if (!Number.isFinite(a) || !Number.isFinite(v) || a === 0) continue
      deltas.push(f.better === 'higher' ? ((v - a) / a) * 100 : ((a - v) / a) * 100)
    }
    return { date: b.date, composite: deltas.length ? deltas.reduce((x, y) => x + y, 0) / deltas.length : 0, values: b.values }
  })
}

/* ----------------------------------------------------------------- stress */

export interface StressPoint {
  date: ISODate
  intensity: number
  impactRatio: number
  recoveryPerIntensity: number
  recoveryMinutes: number
  triggeredImpulse: boolean
}

export function stressPoints(state: AppState, from: ISODate, to: ISODate): StressPoint[] {
  return state.stress
    .filter((e) => daysBetween(from, e.date) >= 0 && daysBetween(e.date, to) >= 0 && e.intensity > 0)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => ({
      date: e.date,
      intensity: e.intensity,
      impactRatio: e.functionalImpact / e.intensity,
      recoveryPerIntensity: e.recoveryMinutes / e.intensity,
      recoveryMinutes: e.recoveryMinutes,
      triggeredImpulse: e.triggeredImpulse,
    }))
}
