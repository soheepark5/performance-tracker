import type { MetricSet } from './metrics'
import { anchorSeries } from './series'
import { strengthRead } from './metrics'
import type { AppState } from './types'

/**
 * A few plain-language reads derived from the same metrics the stages use.
 * All rule-based and local -- nothing here calls a model or a service, and the
 * rule that produced each sentence is visible in this file.
 */

export type AdaptationVerdict = 'adapting' | 'accumulating' | 'deload' | 'detraining' | 'steady' | 'unknown'

export interface AdaptationRead {
  verdict: AdaptationVerdict
  headline: string
  detail: string
}

/** The Body question: is rising load being absorbed, or just accumulating? */
export function adaptationRead(state: AppState, metrics: MetricSet): AdaptationRead {
  const loadTrend = metrics.loadTrend.value
  const checks = [...state.weekly].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const recent = checks.slice(-2).map((c) => c.reserve)
  const prior = checks.slice(-4, -2).map((c) => c.reserve)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const rNow = avg(recent)
  const rBefore = avg(prior)
  const reserveDelta = rNow != null && rBefore != null ? rNow - rBefore : null

  const bench = anchorSeries(state)
  const benchDelta = bench.length >= 2 ? bench[bench.length - 1].composite : null

  if (loadTrend == null || reserveDelta == null) {
    return {
      verdict: 'unknown',
      headline: 'Not enough history yet',
      detail: 'Two weeks of training and at least four weekly reserve check-ins are needed before load and recovery can be compared.',
    }
  }

  const reserveText = `reserve ${reserveDelta >= 0 ? 'up' : 'down'} ${Math.abs(reserveDelta).toFixed(1)} pts`
  const loadText = `Load ${loadTrend >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(loadTrend))}%`
  const benchText = benchDelta == null ? '' : ` Benchmark is ${benchDelta >= 0 ? 'up' : 'down'} ${Math.abs(benchDelta).toFixed(1)}% on baseline.`

  if (loadTrend >= 10 && reserveDelta >= -0.5) {
    return { verdict: 'adapting', headline: 'Adapting to more work', detail: `${loadText} over the last fortnight and ${reserveText}. More is going in without the tank draining.${benchText}` }
  }
  if (loadTrend >= 10) {
    return { verdict: 'accumulating', headline: 'Accumulating fatigue, not adaptation', detail: `${loadText} but ${reserveText}. This is the pattern that looks like progress and is not.${benchText}` }
  }
  if (loadTrend <= -15 && reserveDelta >= 0.5) {
    return { verdict: 'deload', headline: 'Deloading and refilling', detail: `${loadText} and ${reserveText}. Fine as a deliberate easier block.${benchText}` }
  }
  if (loadTrend <= -15) {
    return { verdict: 'detraining', headline: 'Training is falling away', detail: `${loadText} without reserve recovering (${reserveText}). Something outside training is taking the capacity.${benchText}` }
  }
  return { verdict: 'steady', headline: 'Holding steady', detail: `${loadText}, ${reserveText}. A stable block rather than a progressing one.${benchText}` }
}

/**
 * The Body strength question, read as the 2x2 it actually is. A single index
 * would hide which of these four you are in, and they mean opposite things.
 */
export interface StrengthVerdict {
  headline: string
  detail: string
  index: number | null
}

export function strengthVerdict(state: AppState): StrengthVerdict {
  const r = strengthRead(state)
  if (r.goalIndex == null || r.costIndex == null || r.strengthIndex == null) {
    return {
      index: null,
      headline: 'Not enough trained weeks yet',
      detail:
        r.n === 0
          ? 'Set a weekly intensity target and log the strength session against it. Two trained weeks are needed before anything can be compared.'
          : `${r.n} trained week${r.n === 1 ? '' : 's'} so far. One more and the comparison starts.`,
    }
  }

  const goalPct = Math.round((r.goalIndex - 1) * 100)
  const costPct = Math.round((r.costIndex - 1) * 100)
  const goalUp = goalPct >= 3
  const goalDown = goalPct <= -3
  const costUp = costPct >= 3
  const costDown = costPct <= -3
  const nums = `Goal ${goalPct >= 0 ? '+' : ''}${goalPct}%, perceived cost ${costPct >= 0 ? '+' : ''}${costPct}%.`

  let headline: string
  let why: string
  if (goalUp && !costUp) {
    headline = 'Getting stronger'
    why = 'More prescribed work without it costing more. That is the combination that counts.'
  } else if (!goalDown && costDown) {
    headline = 'Getting stronger'
    why = 'The same prescription is costing you less than it did.'
  } else if (goalUp && costUp) {
    headline = 'Working harder, not yet stronger'
    why = 'The goal went up and the effort went up with it. Adaptation may still be catching up — watch whether the cost settles back while the goal holds.'
  } else if (goalDown) {
    headline = costDown ? 'Backing off' : 'Losing ground'
    why = costDown
      ? 'A lighter prescription, felt lighter. Fine as a deliberate easier block, but nothing is being built.'
      : 'A lighter prescription that still costs as much. Something outside training is taking the capacity.'
  } else {
    headline = 'Holding steady'
    why = 'Neither the goal nor the cost has moved much. A maintenance block rather than a progressing one.'
  }
  return { index: r.strengthIndex, headline, detail: `${nums} ${why}` }
}

/** The Brain question: does clarity survive the day? */
export function withinDayRead(metrics: MetricSet): string | null {
  const am = metrics.clarityAm.value
  const pm = metrics.clarityPm.value
  const drop = metrics.clarityDrop.value
  if (am == null || pm == null || drop == null) return null
  if (drop <= 0.5) return `Clarity holds through the day (${am.toFixed(1)} morning to ${pm.toFixed(1)} later — essentially flat).`
  if (drop <= 1.5) return `Mild decay across the day: ${am.toFixed(1)} to ${pm.toFixed(1)}.`
  if (drop <= 3) return `Noticeable decay across the day: ${am.toFixed(1)} to ${pm.toFixed(1)}. The morning is where your best work is.`
  return `Steep decay across the day: ${am.toFixed(1)} to ${pm.toFixed(1)}. Whatever is spending the clarity is the thing to look at.`
}

/** The Immersion question: how much pressure are impulses putting on the day? */
export function impulsePressureRead(metrics: MetricSet): string | null {
  const strong = metrics.strongImpulsesPerWeek.value
  const disruption = metrics.disruptionPerDay.value
  const urge = metrics.urgeMinutesAvg.value
  if (strong == null || disruption == null) return null
  const head = `${strong.toFixed(1)} strong impulses a week.`
  if (urge == null) return `${head} ${Math.round(disruption)} min of work lost per day.`
  return `${head} Urges last ${Math.round(urge)} min on average but cost ${Math.round(disruption)} min of work a day — the gap between wanting something and losing time to it.`
}
