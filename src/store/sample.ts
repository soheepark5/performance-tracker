import { DEFAULT_ANCHOR, DEFAULT_LIFTS } from '../config/taxonomy'
import { addDays, today, weekStart } from '../domain/date'
import type { AppState, DayLog, ExerciseKind, ImpulseKind, ImpulseOutcome, SampleState } from '../domain/types'
import { createInitialState, uid } from './storage'

/**
 * Synthetic history for previewing the charts and stage logic before real data
 * exists. Clearly separated from anything the app records itself, and wiped by
 * the same "erase" control. Not used anywhere in normal operation.
 */

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function makeSampleState(weeks = 12): AppState {
  const rnd = mulberry(20260903)
  const days = weeks * 7
  const start = addDays(today(), -(days - 1))
  const s = createInitialState(start)
  s.anchorProtocols = [DEFAULT_ANCHOR]
  s.lifts = DEFAULT_LIFTS
  s.focusPoints = [
    { id: uid(), title: 'Why does retrieval quality collapse past 10k documents?', why: 'It blocks the whole roadmap.', startedAt: new Date(start).toISOString() },
  ]

  const noise = (amt: number) => (rnd() - 0.5) * 2 * amt
  const sampleStates: SampleState[] = ['fp', 'adjacent', 'other_work', 'shallow', 'off']

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    const p = i / days // 0 -> 1 progression
    if (rnd() < 0.08) continue // a few missed days

    const clarityAm = clamp(5.2 + p * 2.2 + noise(1.1), 0, 10)
    const clarityPm = clamp(clarityAm - (2.4 - p * 1.3) + noise(0.9), 0, 10)
    const baseline = clamp(5.0 + p * 2.3 + noise(0.9), 0, 10)

    const day: DayLog = {
      date,
      samples: [],
      morning: {
        at: `${date}T08:10:00.000Z`,
        clarity: Math.round(clarityAm),
        emotionalBaseline: Math.round(baseline),
        sleepHours: Math.round((6.6 + p * 0.6 + noise(0.8)) * 2) / 2,
      },
    }

    const slots: DayLog['samples'][number]['slot'][] = ['start', 'mid', 'end']
    for (const slot of slots) {
      if (rnd() < 0.15) continue
      const r = rnd()
      const bias = 0.28 + p * 0.34 // improving attention over time
      const idx = r < bias ? 0 : r < bias + 0.24 ? 1 : r < bias + 0.42 ? 2 : r < bias + 0.55 ? 3 : 4
      day.samples.push({ id: uid(), at: `${date}T12:00:00.000Z`, slot, state: sampleStates[Math.min(4, idx)] })
    }

    if (rnd() > 0.1) {
      day.evening = {
        at: `${date}T19:00:00.000Z`,
        clarity: Math.round(clarityPm),
        coverageReported: Math.round(clamp(38 + p * 34 + noise(12), 0, 100) / 10) * 10,
        fpContinuity: Math.round(clamp(3.6 + p * 3.2 + noise(1.3), 0, 10)),
        slowThinking: Math.round(clamp(4.0 + p * 2.8 + noise(1.2), 0, 10)),
        automaticReturn: Math.round(clamp(3.4 + p * 3.0 + noise(1.3), 0, 10)),
        enjoyment: (rnd() < 0.2 + p * 0.4 ? 2 : rnd() < 0.5 ? 1 : 0) as 0 | 1 | 2,
      }
    }
    s.days[date] = day

    // training: frequency and load rise across the block
    if (rnd() < 0.42 + p * 0.28) {
      const kinds: ExerciseKind[] = ['run', 'strength', 'cycle', 'hiit', 'mobility']
      const kind = kinds[Math.floor(rnd() * kinds.length)]
      const durationMin = Math.round(clamp(38 + p * 22 + noise(14), 20, 95))
      const rpe = Math.round(clamp(6 + p * 1.2 + noise(1.4), 3, 10))
      s.workouts.push({
        id: uid(),
        date,
        at: `${date}T18:00:00.000Z`,
        kind,
        durationMin,
        rpe,
        reserveAfter: Math.round(clamp(3.0 + p * 2.6 + noise(1.4), 0, 10)),
        prescribed: kind === 'strength' ? true : undefined,
        recoveryCost: rnd() < 0.5 ? Math.round(clamp(4.2 - p * 1.8 + noise(1.4), 0, 10)) : undefined,
        metrics: kind === 'run' || kind === 'cycle' ? { distanceKm: Math.round((durationMin / 6 + noise(1)) * 10) / 10 } : {},
      })
    }

    // impulses: frequency and cost fall across the block
    const impulseCount = rnd() < 0.55 - p * 0.25 ? (rnd() < 0.3 ? 2 : 1) : 0
    for (let k = 0; k < impulseCount; k++) {
      const kinds: ImpulseKind[] = ['stop_working', 'social_media', 'nicotine', 'video', 'go_out']
      const intensity = Math.round(clamp(6.4 - p * 1.4 + noise(2), 1, 10))
      const urge = Math.round(clamp(22 - p * 6 + noise(18), 3, 90))
      const acted = rnd() < 0.45 - p * 0.25
      s.impulses.push({
        id: uid(),
        date,
        at: `${date}T15:00:00.000Z`,
        kind: kinds[Math.floor(rnd() * kinds.length)],
        intensity,
        urgeMinutes: urge,
        disruptionMinutes: acted ? Math.round(clamp(urge * (0.8 + rnd() * 0.7), 5, 180)) : Math.round(clamp(noise(8), 0, 15)),
        outcome: (acted ? 'acted' : rnd() < 0.5 ? 'resisted' : 'delayed') as ImpulseOutcome,
      })
    }

    // stress events: occasional, handled better over time
    if (rnd() < 0.09) {
      const intensity = Math.round(clamp(5 + noise(3), 1, 10))
      s.stress.push({
        id: uid(),
        date,
        at: `${date}T14:00:00.000Z`,
        label: 'Difficult conversation',
        intensity,
        functionalImpact: Math.round(clamp(intensity * (0.85 - p * 0.35) + noise(1.2), 0, 10)),
        recoveryMinutes: Math.round(clamp(intensity * (34 - p * 20) + noise(30), 5, 600)),
        triggeredImpulse: rnd() < 0.5 - p * 0.3,
      })
    }
  }

  // weekly reserve checks
  for (let w = 0; w < weeks; w++) {
    const ws = weekStart(addDays(start, w * 7))
    const p = w / weeks
    s.weekly.push({
      weekStart: ws,
      at: `${ws}T20:00:00.000Z`,
      reserve: Math.round(clamp(4.0 + p * 2.8 + noise(1.1), 0, 10)),
    })
  }

  // weekly intensity targets: the goal climbs steadily across the block
  for (let w = 0; w < weeks; w++) {
    const ws = weekStart(addDays(start, w * 7))
    const p = w / weeks
    const grow = 1 + p * 0.42
    s.weeklyTargets.push({
      weekStart: ws,
      at: `${ws}T08:00:00.000Z`,
      targets: {
        lat_pulldown: { sets: 3, perSet: 10, restSec: Math.round(90 - p * 20), loadKg: Math.round(40 * grow / 2.5) * 2.5 },
        leg_press: { sets: 4, perSet: 10, restSec: Math.round(120 - p * 30), loadKg: Math.round(90 * grow / 5) * 5 },
        hip_abduction: { sets: 3, perSet: 12, restSec: 60, loadKg: Math.round(30 * grow / 2.5) * 2.5 },
        plank: { sets: 3, perSet: Math.round(45 * grow), restSec: 45 },
        deadlift: { sets: 4, perSet: 5, restSec: Math.round(150 - p * 30), loadKg: Math.round(70 * grow / 5) * 5 },
      },
    })
  }

  // objective anchor every three months
  for (let b = 0; b * 91 < days; b++) {
    const date = addDays(start, b * 91)
    const p = (b * 91) / days
    s.anchors.push({
      id: uid(),
      date,
      at: `${date}T09:00:00.000Z`,
      protocolId: DEFAULT_ANCHOR.id,
      values: {
        restingHr: Math.round(60 - p * 6 + noise(2)),
        deadlift3rm: Math.round((100 + p * 18 + noise(4)) / 2.5) * 2.5,
        hrr60: Math.round(22 + p * 9 + noise(3)),
      },
      rpe: 9,
    })
  }

  // the sample block sits in the past, so calibration reads as finished
  s.settings.calibrationWeeks = 8
  return s
}
