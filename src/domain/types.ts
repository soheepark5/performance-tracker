/**
 * Core data model.
 *
 * Principle: raw data is stored in native units (minutes, kg, reps, metres, bpm,
 * counts). Subjective judgements use anchored 0-10 scales. Nothing is normalised
 * at write time -- every derived/normalised number lives in domain/metrics.ts and
 * can be recomputed from raw history at any moment.
 */

export type ISODate = string // 'YYYY-MM-DD' (local day)
export type ISOStamp = string // full ISO timestamp
export type Domain = 'body' | 'brain' | 'immersion'

/* ------------------------------------------------------------------ daily */

export interface MorningEntry {
  at: ISOStamp
  clarity: number // 0-10
  emotionalBaseline: number // 0-10
  sleepHours?: number // native unit, optional
  focusPointId?: string
  note?: string
}

/** 0 draining · 1 neutral · 2 enjoyable · 3 deeply rewarding */
export type EnjoymentLevel = 0 | 1 | 2 | 3

export interface EveningEntry {
  at: ISOStamp
  clarity: number // 0-10
  /** Self-estimate of attention coverage, 0-100 %. Kept separate from the sampled figure. */
  coverageReported: number
  fpContinuity: number // 0-10
  slowThinking: number // 0-10
  automaticReturn: number // 0-10
  enjoyment?: EnjoymentLevel
  note?: string
}

/**
 * A sampling ping. `weight` is the attention credit for that moment; the raw
 * category is preserved so the weighting can be re-tuned later.
 */
export type SampleState = 'fp' | 'adjacent' | 'other_work' | 'shallow' | 'off'

export interface Sample {
  id: string
  at: ISOStamp
  slot: 'start' | 'mid' | 'end' | 'random' | 'manual'
  state: SampleState
  note?: string
}

export interface DayLog {
  date: ISODate
  morning?: MorningEntry
  evening?: EveningEntry
  samples: Sample[]
}

/* --------------------------------------------------------------- training */

export type ExerciseKind =
  | 'run' | 'cycle' | 'swim' | 'walk_hike'
  | 'strength' | 'hiit' | 'climb' | 'sport' | 'mobility' | 'other'

/** Only the metrics that make sense for the chosen exercise are ever asked for. */
export interface WorkoutMetrics {
  distanceKm?: number
  avgHr?: number
  maxHr?: number
  sets?: number
  reps?: number
  topSetKg?: number
  totalVolumeKg?: number
  grade?: string
  custom?: string
}

export interface Workout {
  id: string
  date: ISODate
  at: ISOStamp
  kind: ExerciseKind
  label?: string
  durationMin: number
  rpe: number // 1-10
  /** "How much was left in the tank right after?" 0-10 */
  reserveAfter: number
  /**
   * True when this session was the week's prescribed strength work. Only these
   * sessions feed the cost side of the strength index -- an easy run must never
   * be able to lower the cost of a prescription it did not perform.
   */
  prescribed?: boolean
  /** Filled in the next day if it mattered: 0-10 residual cost. Optional by design. */
  recoveryCost?: number
  metrics: WorkoutMetrics
  note?: string
}

/* ---------------------------------------------------------------- weekly */

export interface WeeklyCheck {
  /** Monday of the ISO week, as YYYY-MM-DD */
  weekStart: ISODate
  at: ISOStamp
  /** "How much physical reserve do I have to repeat another week like this?" 0-10 */
  reserve: number
  note?: string
}

/* ------------------------------------------------- weekly intensity target */

/**
 * The five representative lifts. Editable, because the exercises themselves may
 * change; each carries its own unit so a plank is never forced into "reps".
 */
export interface LiftSpec {
  key: string
  label: string
  /** what one set is counted in */
  measure: 'reps' | 'seconds'
  /** whether an external load applies (a plank has none) */
  loaded: boolean
}

export interface LiftTarget {
  sets: number
  /** reps per set, or seconds per hold */
  perSet: number
  /** rest between sets, in real seconds -- shorter is harder at equal volume */
  restSec: number
  loadKg?: number
}

/**
 * Set at the start of the week: the intensity you intend to work at. Progress is
 * this target climbing while the perceived cost of hitting it does not.
 */
export interface WeeklyTarget {
  weekStart: ISODate
  at: ISOStamp
  targets: Record<string, LiftTarget>
  note?: string
}

/* -------------------------------------------------------- objective anchor */

export interface AnchorField {
  key: string
  label: string
  unit: string
  /** which direction counts as improvement */
  better: 'higher' | 'lower'
}

/**
 * A rare, deliberately objective check. Its job is not to track training -- the
 * weekly target does that -- but to catch RPE drift: if your sense of "hard"
 * quietly recalibrates over two years, only a measured number will show it.
 */
export interface AnchorProtocol {
  id: string
  name: string
  fields: AnchorField[]
  notes?: string
}

export interface AnchorCheck {
  id: string
  date: ISODate
  at: ISOStamp
  protocolId: string
  values: Record<string, number>
  rpe?: number
  note?: string
}

/* ----------------------------------------------------------- stress/impulse */

export type StressReaction = 'freeze' | 'anger' | 'anxiety' | 'shutdown' | 'rumination' | 'calm_handling'

export interface StressEvent {
  id: string
  at: ISOStamp
  date: ISODate
  label?: string
  intensity: number // 1-10
  functionalImpact: number // 0-10
  reaction?: StressReaction
  /** real minutes until back to baseline -- never converted to a score */
  recoveryMinutes: number
  triggeredImpulse: boolean
  note?: string
}

export type ImpulseKind =
  | 'stop_working' | 'go_out' | 'nicotine' | 'social_media'
  | 'video' | 'food' | 'shopping' | 'other'

export type ImpulseOutcome = 'resisted' | 'delayed' | 'partial' | 'acted'

export interface ImpulseEvent {
  id: string
  /** when the urge started */
  at: ISOStamp
  date: ISODate
  kind: ImpulseKind
  trigger?: string
  /**
   * An impulse can be logged the moment it starts and finished once it is over.
   * While `open` is true only the onset is known (kind, time, perhaps intensity)
   * and the fields below are filled in when it closes. Metrics that need them
   * skip open impulses rather than inventing values.
   */
  open?: boolean
  intensity?: number // 1-10
  /** how long the urge was present, real minutes */
  urgeMinutes?: number
  /** how much work time was actually lost, real minutes -- deliberately separate */
  disruptionMinutes?: number
  outcome?: ImpulseOutcome
  note?: string
}

/* ------------------------------------------------------------ focus point */

export interface FocusPoint {
  id: string
  title: string
  why?: string
  startedAt: ISOStamp
  endedAt?: ISOStamp
}

/* -------------------------------------------------------------- settings */

export interface Settings {
  /** first day of tracking; drives calibration-mode window */
  startDate: ISODate
  calibrationWeeks: number
  /** local HH:mm times for the sampling pings */
  pingTimes: { start: string; mid: string | null; end: string }
  randomPing: boolean
  notificationsEnabled: boolean
  anchorIntervalDays: number
  /** sparse overrides of the thresholds in config/stages.ts: domain -> stage -> reqKey -> target */
  thresholdOverrides: Record<string, Record<string, Record<string, number>>>
}

/* ----------------------------------------------------------------- state */

export interface AppState {
  version: number
  settings: Settings
  focusPoints: FocusPoint[]
  days: Record<ISODate, DayLog>
  workouts: Workout[]
  weekly: WeeklyCheck[]
  lifts: LiftSpec[]
  weeklyTargets: WeeklyTarget[]
  anchors: AnchorCheck[]
  anchorProtocols: AnchorProtocol[]
  stress: StressEvent[]
  impulses: ImpulseEvent[]
}
