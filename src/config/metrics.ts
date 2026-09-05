import type { Domain } from '../domain/types'

/**
 * The metric registry.
 *
 * Every number the app reasons about is declared here once: what it is called,
 * what unit it lives in, which direction is "better", the trailing window it is
 * computed over, and how much data it needs before it may gate a stage.
 *
 * domain/metrics.ts implements them; config/stages.ts references them by key.
 */

export type MetricKey =
  // body
  | 'weeklyReserve' | 'sessionsPerWeek' | 'weeklyLoad' | 'postSessionReserve'
  | 'anchorDelta' | 'recoveryCost' | 'acwr' | 'loadTrend'
  | 'strengthIndex' | 'goalIndex' | 'costIndex' | 'targetAdherence'
  // brain
  | 'clarityAm' | 'clarityPm' | 'clarityDrop' | 'emotionalBaseline'
  | 'emotionalVolatility' | 'lowDayRate'
  | 'stressImpactRatio' | 'stressRecoveryPerIntensity' | 'stressImpulseRate' | 'stressPerWeek'
  // immersion
  | 'attentionCoverage' | 'coverageSampled' | 'coverageReported'
  | 'fpContinuity' | 'slowThinking' | 'automaticReturn' | 'enjoyment'
  | 'strongImpulsesPerWeek' | 'disruptionPerDay' | 'impulseActedRate'
  | 'urgeMinutesAvg' | 'impulseIntensityAvg'
  // meta
  | 'loggingRate'

export interface MetricDef {
  key: MetricKey
  domain: Domain | 'meta'
  label: string
  /** one-line explanation shown in the metric detail and stage list */
  description: string
  unit: string
  better: 'higher' | 'lower'
  /** trailing window in days used by domain/metrics.ts */
  windowDays: number
  /**
   * Minimum supporting observations before this metric may pass or fail a stage
   * gate. Below it the requirement reads "not enough data yet" and holds the
   * stage rather than failing it.
   */
  minN: number
  decimals: number
  /** display range for bounded scales */
  range?: [number, number]
}

const M = (d: MetricDef) => d

export const METRICS: Record<MetricKey, MetricDef> = Object.fromEntries(
  [
    /* ---------------------------------------------------------------- body */
    M({ key: 'weeklyReserve', domain: 'body', label: 'Weekly reserve', description: 'Capacity left to repeat a week like the last one. Mean of recent weekly check-ins.', unit: '/10', better: 'higher', windowDays: 28, minN: 2, decimals: 1, range: [0, 10] }),
    M({ key: 'sessionsPerWeek', domain: 'body', label: 'Sessions / week', description: 'Training frequency, averaged over the window.', unit: '/wk', better: 'higher', windowDays: 28, minN: 14, decimals: 1 }),
    M({ key: 'weeklyLoad', domain: 'body', label: 'Weekly load', description: 'Session load = duration x RPE (sRPE), averaged per week. Raw training volume.', unit: 'AU/wk', better: 'higher', windowDays: 28, minN: 14, decimals: 0 }),
    M({ key: 'postSessionReserve', domain: 'body', label: 'Reserve after sessions', description: 'How much is left in the tank at the end of a session. Rises when the same work costs less.', unit: '/10', better: 'higher', windowDays: 28, minN: 4, decimals: 1, range: [0, 10] }),
    M({ key: 'strengthIndex', domain: 'body', label: 'Strength index', description: 'Prescribed work divided by what it costs you. 1.00 is your baseline week; 1.30 means 30% more work at the same perceived effort, or the same work at 30% less. Rising goal with falling RPE is the only combination that moves it far.', unit: 'x', better: 'higher', windowDays: 99999, minN: 3, decimals: 2 }),
    M({ key: 'goalIndex', domain: 'body', label: 'Goal', description: 'How hard the weekly prescription is now, against your baseline week. Only weeks you actually trained count.', unit: 'x', better: 'higher', windowDays: 99999, minN: 3, decimals: 2 }),
    M({ key: 'costIndex', domain: 'body', label: 'Perceived cost', description: 'Mean RPE of the prescribed sessions, against your baseline week. Below 1.00 means the work feels easier than it did.', unit: 'x', better: 'lower', windowDays: 99999, minN: 3, decimals: 2 }),
    M({ key: 'targetAdherence', domain: 'body', label: 'Weeks trained to target', description: 'Share of weeks with a target set that also had a prescribed session logged. The strength index is only as trustworthy as this.', unit: '%', better: 'higher', windowDays: 84, minN: 3, decimals: 0 }),
    M({ key: 'anchorDelta', domain: 'body', label: 'Objective anchor', description: 'Composite change across the measured anchor fields versus your first check. Its job is to catch RPE drift: if the anchor stalls while the strength index climbs, your sense of "hard" has moved, not your body.', unit: '%', better: 'higher', windowDays: 99999, minN: 2, decimals: 1 }),
    M({ key: 'recoveryCost', domain: 'body', label: 'Next-day cost', description: 'Residual fatigue carried into the day after a session.', unit: '/10', better: 'lower', windowDays: 28, minN: 4, decimals: 1, range: [0, 10] }),
    M({ key: 'acwr', domain: 'body', label: 'Acute : chronic load', description: 'Last 7 days of load against the 28-day weekly average. Roughly 0.8-1.3 reads as progressive; well above suggests fatigue accumulating faster than adaptation.', unit: 'x', better: 'higher', windowDays: 28, minN: 14, decimals: 2 }),
    M({ key: 'loadTrend', domain: 'body', label: 'Load trend', description: 'Load in the last 14 days versus the 14 before it.', unit: '%', better: 'higher', windowDays: 28, minN: 14, decimals: 0 }),

    /* --------------------------------------------------------------- brain */
    M({ key: 'clarityAm', domain: 'brain', label: 'Morning clarity', description: 'Mean of morning clarity ratings.', unit: '/10', better: 'higher', windowDays: 28, minN: 7, decimals: 1, range: [0, 10] }),
    M({ key: 'clarityPm', domain: 'brain', label: 'Later-day clarity', description: 'Mean of end-of-work clarity ratings.', unit: '/10', better: 'higher', windowDays: 28, minN: 7, decimals: 1, range: [0, 10] }),
    M({ key: 'clarityDrop', domain: 'brain', label: 'Within-day decay', description: 'Morning clarity minus later-day clarity, averaged. A brain that holds up through the day trends toward zero.', unit: 'pts', better: 'lower', windowDays: 28, minN: 7, decimals: 1 }),
    M({ key: 'emotionalBaseline', domain: 'brain', label: 'Emotional baseline', description: 'Mean background mental state, independent of specific events.', unit: '/10', better: 'higher', windowDays: 28, minN: 7, decimals: 1, range: [0, 10] }),
    M({ key: 'emotionalVolatility', domain: 'brain', label: 'Baseline volatility', description: 'Standard deviation of the emotional baseline. Lower means a steadier floor, not a happier one.', unit: 'sd', better: 'lower', windowDays: 28, minN: 7, decimals: 2 }),
    M({ key: 'lowDayRate', domain: 'brain', label: 'Low days', description: 'Share of logged days where clarity or baseline fell below 4.', unit: '%', better: 'lower', windowDays: 28, minN: 7, decimals: 0 }),
    M({ key: 'stressImpactRatio', domain: 'brain', label: 'Impact per unit stress', description: 'Functional impact divided by stress intensity. Falling means the same size of hit costs you less.', unit: 'ratio', better: 'lower', windowDays: 90, minN: 3, decimals: 2 }),
    M({ key: 'stressRecoveryPerIntensity', domain: 'brain', label: 'Recovery per unit stress', description: 'Real minutes back to baseline per point of stress intensity. Kept in minutes, never scored.', unit: 'min/pt', better: 'lower', windowDays: 90, minN: 3, decimals: 0 }),
    M({ key: 'stressImpulseRate', domain: 'brain', label: 'Stress to impulse', description: 'Share of stress events that triggered an impulse.', unit: '%', better: 'lower', windowDays: 90, minN: 3, decimals: 0 }),
    M({ key: 'stressPerWeek', domain: 'brain', label: 'Stress events / week', description: 'How often meaningful stress occurred. Context, not a target.', unit: '/wk', better: 'lower', windowDays: 90, minN: 14, decimals: 1 }),

    /* ----------------------------------------------------------- immersion */
    M({ key: 'attentionCoverage', domain: 'immersion', label: 'Attention coverage', description: 'Estimated share of meaningful waking time connected to the Focus Point or core work. Blends sampling pings with the evening estimate.', unit: '%', better: 'higher', windowDays: 14, minN: 7, decimals: 0 }),
    M({ key: 'coverageSampled', domain: 'immersion', label: 'Coverage (sampled)', description: 'From ping answers alone. Fewer assumptions, more noise.', unit: '%', better: 'higher', windowDays: 14, minN: 10, decimals: 0 }),
    M({ key: 'coverageReported', domain: 'immersion', label: 'Coverage (self-estimate)', description: 'From the evening reflection alone.', unit: '%', better: 'higher', windowDays: 14, minN: 5, decimals: 0 }),
    M({ key: 'fpContinuity', domain: 'immersion', label: 'FP continuity', description: 'How continuously one problem stayed alive across the day, including spare moments.', unit: '/10', better: 'higher', windowDays: 14, minN: 7, decimals: 1, range: [0, 10] }),
    M({ key: 'slowThinking', domain: 'immersion', label: 'Slow thinking', description: 'Unhurried, relaxed staying-with-a-problem rather than forcing an answer.', unit: '/10', better: 'higher', windowDays: 14, minN: 7, decimals: 1, range: [0, 10] }),
    M({ key: 'automaticReturn', domain: 'immersion', label: 'Automatic return', description: 'How naturally attention comes back to the Focus Point without an act of will.', unit: '/10', better: 'higher', windowDays: 14, minN: 7, decimals: 1, range: [0, 10] }),
    M({ key: 'enjoyment', domain: 'immersion', label: 'Immersion enjoyment', description: 'Whether deep thinking felt draining (0) through deeply rewarding (3).', unit: '/3', better: 'higher', windowDays: 28, minN: 7, decimals: 1, range: [0, 3] }),
    M({ key: 'strongImpulsesPerWeek', domain: 'immersion', label: 'Strong impulses / week', description: 'Impulses logged at intensity 7 or above, per week.', unit: '/wk', better: 'lower', windowDays: 28, minN: 14, decimals: 1 }),
    M({ key: 'disruptionPerDay', domain: 'immersion', label: 'Disruption', description: 'Work minutes actually lost to impulses per day, kept separate from how long the urge lasted.', unit: 'min/day', better: 'lower', windowDays: 28, minN: 14, decimals: 0 }),
    M({ key: 'impulseActedRate', domain: 'immersion', label: 'Acted-on rate', description: 'Share of logged impulses you acted on.', unit: '%', better: 'lower', windowDays: 28, minN: 3, decimals: 0 }),
    M({ key: 'urgeMinutesAvg', domain: 'immersion', label: 'Average urge duration', description: 'How long an urge stays present, in real minutes.', unit: 'min', better: 'lower', windowDays: 28, minN: 3, decimals: 0 }),
    M({ key: 'impulseIntensityAvg', domain: 'immersion', label: 'Average urge intensity', description: 'Mean intensity of logged impulses.', unit: '/10', better: 'lower', windowDays: 28, minN: 3, decimals: 1, range: [0, 10] }),

    /* ---------------------------------------------------------------- meta */
    M({ key: 'loggingRate', domain: 'meta', label: 'Days logged', description: 'Share of days in the window with at least one check-in. Everything above depends on this.', unit: '%', better: 'higher', windowDays: 28, minN: 1, decimals: 0 }),
  ].map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>

export function formatMetric(key: MetricKey, value: number | null | undefined, extraDecimals = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const def = METRICS[key]
  const n = value.toFixed(def.decimals + extraDecimals)
  if (def.unit === '%') return `${n}%`
  if (def.unit === '/10' || def.unit === '/3' || !def.unit) return n
  return `${n} ${def.unit}`
}
