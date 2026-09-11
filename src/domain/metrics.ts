import { METRICS, type MetricKey } from '../config/metrics'
import { SAMPLE_OPTIONS } from '../config/scales'
import { addDays, daysBetween, today as todayISO } from './date'
import { weekStart } from './date'
import type { AppState, ISODate, LiftSpec, SampleState, Workout, WeeklyTarget, DayLog } from './types'

/**
 * Metric computation. Pure functions over raw state -- no persistence of derived
 * values anywhere, so re-tuning a definition instantly re-derives all history.
 */

export interface MetricValue {
  key: MetricKey
  /** null when the metric cannot be computed at all */
  value: number | null
  /** supporting observations; compared against METRICS[key].minN for sufficiency */
  n: number
  sufficient: boolean
}

export type MetricSet = Record<MetricKey, MetricValue>

/* ------------------------------------------------------------------ helpers */

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)!
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

const SAMPLE_WEIGHT: Record<SampleState, number> = Object.fromEntries(
  SAMPLE_OPTIONS.map((o) => [o.state, o.weight]),
) as Record<SampleState, number>

/** sRPE: the standard transparent session-load unit. */
export function sessionLoad(w: Workout): number {
  return w.durationMin * w.rpe
}

/**
 * A day's attention coverage, 0-100.
 * Sampling and self-report are kept as separate raw signals and blended only
 * here; neither pretends to be a measured figure.
 */
export function dayCoverage(day: DayLog | undefined): { blended: number | null; sampled: number | null; reported: number | null } {
  if (!day) return { blended: null, sampled: null, reported: null }
  const samples = day.samples ?? []
  const sampled = samples.length >= 2 ? (sum(samples.map((s) => SAMPLE_WEIGHT[s.state] ?? 0)) / samples.length) * 100 : null
  const reported = day.evening ? day.evening.coverageReported : null
  let blended: number | null = null
  if (sampled != null && reported != null) blended = 0.6 * sampled + 0.4 * reported
  else blended = sampled ?? reported
  return { blended, sampled, reported }
}

interface Window {
  from: ISODate
  to: ISODate
  /** days actually observable (never counts days before tracking started) */
  observedDays: number
}

function makeWindow(state: AppState, days: number, to: ISODate): Window {
  const naive = addDays(to, -(days - 1))
  const from = daysBetween(state.settings.startDate, naive) < 0 ? state.settings.startDate : naive
  return { from, to, observedDays: Math.max(1, daysBetween(from, to) + 1) }
}

const inWindow = (d: ISODate, w: Window) => daysBetween(w.from, d) >= 0 && daysBetween(d, w.to) >= 0

/* ------------------------------------------------ weekly strength progress */

/**
 * The strength logic, in one place.
 *
 *   goal index = how hard the prescription is now, versus the baseline week
 *   cost index = what it costs you (mean RPE of the sessions you actually did)
 *   strength index = goal / cost
 *
 * 1.00 is baseline. 1.30 means you are prescribing 30% more work at the same
 * perceived cost, or the same work at 30% less cost. Rising goal with falling
 * RPE is the definition of getting stronger; rising goal with rising RPE is
 * just working harder, and the division says so on its own.
 *
 * Units never get summed: each lift is compared against its own baseline as a
 * ratio, and the unit-free ratios are averaged. That is what lets kilograms and
 * plank seconds sit in the same composite honestly.
 */

/** Prescribed work for one lift: sets x reps-or-seconds x load (1 when bodyweight). */
export function liftVolume(t: { sets: number; perSet: number; loadKg?: number }, spec?: LiftSpec): number {
  const load = spec?.loaded ? (t.loadKg ?? 0) : 1
  return t.sets * t.perSet * (spec?.loaded ? load : 1)
}

export interface StrengthRead {
  goalIndex: number | null
  costIndex: number | null
  strengthIndex: number | null
  /** weeks of target history that also had a prescribed session logged */
  n: number
  baselineWeek: ISODate | null
  latestWeek: ISODate | null
  perLift: { label: string; ratio: number }[]
}

/**
 * Only weeks with at least one logged prescribed session count. A target you
 * typed but never trained cannot move the number -- which is what stops the
 * ladder from measuring ambition.
 */
export function strengthRead(state: AppState, asOf: ISODate = todayISO()): StrengthRead {
  const empty: StrengthRead = { goalIndex: null, costIndex: null, strengthIndex: null, n: 0, baselineWeek: null, latestWeek: null, perLift: [] }
  const specs = new Map(state.lifts.map((l) => [l.key, l]))

  const rpeByWeek = new Map<ISODate, number[]>()
  for (const w of state.workouts) {
    if (!w.prescribed) continue
    const k = weekStart(w.date)
    rpeByWeek.set(k, [...(rpeByWeek.get(k) ?? []), w.rpe])
  }

  const weeks = [...state.weeklyTargets]
    .filter((t) => daysBetween(t.weekStart, asOf) >= 0 && (rpeByWeek.get(t.weekStart)?.length ?? 0) > 0)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  if (weeks.length < 2) return { ...empty, n: weeks.length, baselineWeek: weeks[0]?.weekStart ?? null }

  const base = weeks[0]
  // The two most recent qualifying weeks, so a single odd week cannot swing it.
  const recent = weeks.slice(-2)

  const ratioFor = (t: WeeklyTarget): { mean: number | null; perLift: { label: string; ratio: number }[] } => {
    const perLift: { label: string; ratio: number }[] = []
    for (const [key, spec] of specs) {
      const a = base.targets[key]
      const b = t.targets[key]
      if (!a || !b) continue
      const va = liftVolume(a, spec)
      const vb = liftVolume(b, spec)
      if (!(va > 0) || !(vb > 0)) continue
      perLift.push({ label: spec.label, ratio: vb / va })
    }
    return { mean: mean(perLift.map((p) => p.ratio)), perLift }
  }

  const goals = recent.map(ratioFor)
  const goalIndex = mean(goals.map((g) => g.mean).filter((x): x is number => x != null))

  const rpeOf = (t: WeeklyTarget) => mean(rpeByWeek.get(t.weekStart) ?? [])
  const baseRpe = rpeOf(base)
  const recentRpe = mean(recent.map(rpeOf).filter((x): x is number => x != null))
  const costIndex = baseRpe && baseRpe > 0 && recentRpe != null ? recentRpe / baseRpe : null

  return {
    goalIndex,
    costIndex,
    strengthIndex: goalIndex != null && costIndex != null && costIndex > 0 ? goalIndex / costIndex : null,
    n: weeks.length,
    baselineWeek: base.weekStart,
    latestWeek: weeks[weeks.length - 1].weekStart,
    perLift: goals[goals.length - 1].perLift,
  }
}

/* --------------------------------------------------------- objective anchor */

/** Composite % change of the newest anchor check against the first, per protocol. */
export function anchorDelta(state: AppState): { value: number | null; n: number; perField: { label: string; delta: number; unit: string }[] } {
  const byProtocol = new Map<string, typeof state.anchors>()
  for (const b of state.anchors) {
    const arr = byProtocol.get(b.protocolId) ?? []
    arr.push(b)
    byProtocol.set(b.protocolId, arr)
  }
  let best: { value: number | null; n: number; perField: { label: string; delta: number; unit: string }[] } = { value: null, n: 0, perField: [] }
  for (const [pid, list] of byProtocol) {
    const proto = state.anchorProtocols.find((p) => p.id === pid)
    if (!proto || list.length < 2) {
      best = best.n >= list.length ? best : { value: null, n: list.length, perField: [] }
      continue
    }
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const perField: { label: string; delta: number; unit: string }[] = []
    for (const f of proto.fields) {
      const a = first.values[f.key]
      const b = last.values[f.key]
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) continue
      const delta = f.better === 'higher' ? ((b - a) / a) * 100 : ((a - b) / a) * 100
      perField.push({ label: f.label, delta, unit: f.unit })
    }
    const value = mean(perField.map((p) => p.delta))
    if (perField.length && (best.value == null || sorted.length > best.n)) best = { value, n: sorted.length, perField }
  }
  return best
}

/* --------------------------------------------------------------- the engine */

export function computeMetrics(state: AppState, asOf: ISODate = todayISO()): MetricSet {
  const out = {} as MetricSet
  const put = (key: MetricKey, value: number | null, n: number) => {
    out[key] = { key, value, n, sufficient: value != null && n >= METRICS[key].minN }
  }

  const win = (key: MetricKey) => makeWindow(state, METRICS[key].windowDays, asOf)
  const daysIn = (w: Window): DayLog[] =>
    Object.values(state.days).filter((d) => inWindow(d.date, w))

  /* ------------------------------------------------------------------ body */
  {
    const w = win('weeklyReserve')
    const vals = state.weekly.filter((x) => inWindow(x.weekStart, w)).map((x) => x.reserve)
    put('weeklyReserve', mean(vals), vals.length)
  }
  {
    const w = win('sessionsPerWeek')
    const ws = state.workouts.filter((x) => inWindow(x.date, w))
    const weeks = w.observedDays / 7
    put('sessionsPerWeek', ws.length / weeks, w.observedDays)
    put('weeklyLoad', sum(ws.map(sessionLoad)) / weeks, w.observedDays)

    const reserves = ws.map((x) => x.reserveAfter).filter((x) => Number.isFinite(x))
    put('postSessionReserve', mean(reserves), reserves.length)
    const costs = ws.map((x) => x.recoveryCost).filter((x): x is number => Number.isFinite(x as number))
    put('recoveryCost', mean(costs), costs.length)

    const w7 = makeWindow(state, 7, asOf)
    const load7 = sum(state.workouts.filter((x) => inWindow(x.date, w7)).map(sessionLoad))
    const chronicWeekly = sum(ws.map(sessionLoad)) / (w.observedDays / 7)
    put('acwr', chronicWeekly > 0 ? load7 / chronicWeekly : null, w.observedDays)

    const recent = makeWindow(state, 14, asOf)
    const priorTo = addDays(recent.from, -1)
    const prior = makeWindow(state, 14, priorTo)
    const a = sum(state.workouts.filter((x) => inWindow(x.date, recent)).map(sessionLoad))
    const b = sum(state.workouts.filter((x) => inWindow(x.date, prior)).map(sessionLoad))
    put('loadTrend', b > 0 ? ((a - b) / b) * 100 : null, w.observedDays)
  }
  {
    const sr = strengthRead(state, asOf)
    put('goalIndex', sr.goalIndex, sr.n)
    put('costIndex', sr.costIndex, sr.n)
    put('strengthIndex', sr.strengthIndex, sr.n)

    const w = win('targetAdherence')
    const set = state.weeklyTargets.filter((t) => inWindow(t.weekStart, w))
    const trained = new Set(state.workouts.filter((x) => x.prescribed).map((x) => weekStart(x.date)))
    put('targetAdherence', set.length ? (set.filter((t) => trained.has(t.weekStart)).length / set.length) * 100 : null, set.length)

    const bd = anchorDelta(state)
    put('anchorDelta', bd.value, bd.n)
  }

  /* ----------------------------------------------------------------- brain */
  {
    const w = win('clarityAm')
    const days = daysIn(w)
    const am = days.map((d) => d.morning?.clarity).filter((x): x is number => x != null)
    const pm = days.map((d) => d.evening?.clarity).filter((x): x is number => x != null)
    put('clarityAm', mean(am), am.length)
    put('clarityPm', mean(pm), pm.length)

    const drops = days
      .filter((d) => d.morning && d.evening)
      .map((d) => d.morning!.clarity - d.evening!.clarity)
    put('clarityDrop', mean(drops), drops.length)

    const base = days.map((d) => d.morning?.emotionalBaseline).filter((x): x is number => x != null)
    put('emotionalBaseline', mean(base), base.length)
    put('emotionalVolatility', stdev(base), base.length)

    const logged = days.filter((d) => d.morning || d.evening)
    const low = logged.filter((d) => {
      const vals = [d.morning?.clarity, d.evening?.clarity, d.morning?.emotionalBaseline].filter(
        (x): x is number => x != null,
      )
      return vals.some((v) => v < 4)
    })
    put('lowDayRate', logged.length ? (low.length / logged.length) * 100 : null, logged.length)

    const allDays = daysIn(makeWindow(state, METRICS.loggingRate.windowDays, asOf))
    const anyLog = allDays.filter((d) => d.morning || d.evening || d.samples.length)
    const lw = makeWindow(state, METRICS.loggingRate.windowDays, asOf)
    put('loggingRate', (anyLog.length / lw.observedDays) * 100, lw.observedDays)
  }
  {
    const w = win('stressImpactRatio')
    const ev = state.stress.filter((e) => inWindow(e.date, w))
    put('stressImpactRatio', mean(ev.filter((e) => e.intensity > 0).map((e) => e.functionalImpact / e.intensity)), ev.length)
    put('stressRecoveryPerIntensity', mean(ev.filter((e) => e.intensity > 0).map((e) => e.recoveryMinutes / e.intensity)), ev.length)
    put('stressImpulseRate', ev.length ? (ev.filter((e) => e.triggeredImpulse).length / ev.length) * 100 : null, ev.length)
    put('stressPerWeek', ev.length / (w.observedDays / 7), w.observedDays)
  }

  /* ------------------------------------------------------------- immersion */
  {
    const w = win('attentionCoverage')
    const days = daysIn(w)
    const cov = days.map((d) => dayCoverage(d))
    const blended = cov.map((c) => c.blended).filter((x): x is number => x != null)
    put('attentionCoverage', mean(blended), blended.length)
    const sampled = cov.map((c) => c.sampled).filter((x): x is number => x != null)
    put('coverageSampled', mean(sampled), sum(days.map((d) => d.samples.length)))
    const reported = cov.map((c) => c.reported).filter((x): x is number => x != null)
    put('coverageReported', mean(reported), reported.length)

    const ev = days.map((d) => d.evening).filter((x): x is NonNullable<typeof x> => x != null)
    put('fpContinuity', mean(ev.map((e) => e.fpContinuity)), ev.length)
    put('slowThinking', mean(ev.map((e) => e.slowThinking)), ev.length)
    put('automaticReturn', mean(ev.map((e) => e.automaticReturn)), ev.length)
  }
  {
    const w = win('enjoyment')
    const ev = daysIn(w)
      .map((d) => d.evening?.enjoyment)
      .filter((x): x is 0 | 1 | 2 | 3 => x != null)
    put('enjoyment', mean(ev), ev.length)
  }
  {
    const w = win('strongImpulsesPerWeek')
    const imp = state.impulses.filter((i) => inWindow(i.date, w))
    const weeks = w.observedDays / 7
    put('strongImpulsesPerWeek', imp.filter((i) => (i.intensity ?? 0) >= 7).length / weeks, w.observedDays)
    put('disruptionPerDay', sum(imp.map((i) => i.disruptionMinutes ?? 0)) / w.observedDays, w.observedDays)
    // An impulse logged at its start has no outcome or duration yet. Leave it out
    // of these rather than count a guess; it joins them once it is finished.
    const closed = imp.filter((i) => !i.open)
    put('impulseActedRate', closed.length ? (closed.filter((i) => i.outcome === 'acted').length / closed.length) * 100 : null, closed.length)
    const urges = closed.map((i) => i.urgeMinutes).filter((x): x is number => x != null)
    put('urgeMinutesAvg', mean(urges), urges.length)
    const intensities = imp.map((i) => i.intensity).filter((x): x is number => x != null)
    put('impulseIntensityAvg', mean(intensities), intensities.length)
  }

  return out
}
