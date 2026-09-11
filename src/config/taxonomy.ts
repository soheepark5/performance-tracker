import { formatDuration } from '../domain/date'
import type { AnchorProtocol, ExerciseKind, ImpulseKind, ImpulseOutcome, LiftSpec, StressReaction } from '../domain/types'

/** Which optional performance fields are worth asking for, per exercise kind. */
export type MetricField = 'distanceKm' | 'avgHr' | 'sets' | 'reps' | 'topSetKg' | 'grade'

export const EXERCISE_KINDS: { kind: ExerciseKind; label: string; fields: MetricField[] }[] = [
  { kind: 'run', label: 'Run', fields: ['distanceKm', 'avgHr'] },
  { kind: 'cycle', label: 'Cycle', fields: ['distanceKm', 'avgHr'] },
  { kind: 'swim', label: 'Swim', fields: ['distanceKm'] },
  { kind: 'walk_hike', label: 'Walk / hike', fields: ['distanceKm'] },
  { kind: 'strength', label: 'Strength', fields: ['sets', 'reps', 'topSetKg'] },
  { kind: 'hiit', label: 'HIIT', fields: ['avgHr'] },
  { kind: 'climb', label: 'Climb', fields: ['grade', 'sets'] },
  { kind: 'sport', label: 'Sport', fields: [] },
  { kind: 'mobility', label: 'Mobility', fields: [] },
  { kind: 'other', label: 'Other', fields: [] },
]

export const METRIC_FIELD_META: Record<MetricField, { label: string; unit: string; step?: number; type?: 'text' }> = {
  distanceKm: { label: 'Distance', unit: 'km', step: 0.1 },
  avgHr: { label: 'Average HR', unit: 'bpm', step: 1 },
  sets: { label: 'Sets', unit: '', step: 1 },
  reps: { label: 'Reps / set', unit: '', step: 1 },
  topSetKg: { label: 'Top set', unit: 'kg', step: 2.5 },
  grade: { label: 'Hardest grade', unit: '', type: 'text' },
}

export const IMPULSE_KINDS: { kind: ImpulseKind; label: string }[] = [
  { kind: 'stop_working', label: 'Stop working / play' },
  { kind: 'go_out', label: 'Go out' },
  { kind: 'nicotine', label: 'Nicotine' },
  { kind: 'social_media', label: 'Social media' },
  { kind: 'video', label: 'Video' },
  { kind: 'food', label: 'Food' },
  { kind: 'shopping', label: 'Shopping' },
  { kind: 'other', label: 'Other' },
]

export const IMPULSE_OUTCOMES: { value: ImpulseOutcome; label: string }[] = [
  { value: 'resisted', label: 'Resisted' },
  { value: 'delayed', label: 'Delayed it' },
  { value: 'partial', label: 'Partly acted' },
  { value: 'acted', label: 'Acted on it' },
]

export const STRESS_REACTIONS: { value: StressReaction; label: string }[] = [
  { value: 'calm_handling', label: 'Handled it calmly' },
  { value: 'anxiety', label: 'Anxiety' },
  { value: 'anger', label: 'Anger / irritation' },
  { value: 'freeze', label: 'Froze' },
  { value: 'shutdown', label: 'Shut down' },
  { value: 'rumination', label: 'Rumination' },
]

/**
 * The five representative lifts of the weekly intensity target. Stored as data
 * and editable in-app, so the exercises can change without invalidating history
 * -- a lift that disappears simply stops contributing to the composite.
 */
export const DEFAULT_LIFTS: LiftSpec[] = [
  { key: 'lat_pulldown', label: 'Lat pull down', measure: 'reps', loaded: true },
  { key: 'leg_press', label: 'Leg press', measure: 'reps', loaded: true },
  { key: 'hip_abduction', label: 'Hip abduction', measure: 'reps', loaded: true },
  { key: 'plank', label: 'Plank', measure: 'seconds', loaded: false },
  { key: 'deadlift', label: 'Deadlift', measure: 'reps', loaded: true },
]

/**
 * The objective anchor: a rare measured check whose only job is to catch RPE
 * drift. Deliberately small -- two numbers and one honest max attempt.
 */
export const DEFAULT_ANCHOR: AnchorProtocol = {
  id: 'anchor-v1',
  name: 'Objective anchor',
  notes: 'Every three months, same conditions: morning resting HR before getting up, then a genuine 3-rep max on the deadlift after a full warm-up. No hard session in the 48h before.',
  fields: [
    { key: 'restingHr', label: 'Resting HR (morning)', unit: 'bpm', better: 'lower' },
    { key: 'deadlift3rm', label: 'Deadlift 3-rep max', unit: 'kg', better: 'higher' },
    { key: 'hrr60', label: 'HR drop 60s after effort', unit: 'bpm', better: 'higher' },
  ],
}

/**
 * "All day" for an urge, stored as real minutes like every other duration: a
 * sixteen-hour waking day. A named constant so the definition can change without
 * anyone having to guess where 960 came from.
 */
export const ALL_DAY_MINUTES = 16 * 60

/** An urge duration for display: minutes, or "all day". */
export function formatUrge(min: number | undefined): string {
  if (min == null) return '-'
  return min >= ALL_DAY_MINUTES ? 'all day' : formatDuration(min)
}
