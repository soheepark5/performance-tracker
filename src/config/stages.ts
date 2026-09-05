import type { Domain } from '../domain/types'
import type { MetricKey } from './metrics'

/**
 * ============================================================================
 *  THE STAGE MODEL  --  the one file to edit when recalibrating.
 * ============================================================================
 *
 * Everything about progression lives here: the stage names, the requirements
 * that gate each stage, and the numeric targets. Nothing else in the app
 * hard-codes a threshold, and no scoring happens anywhere else.
 *
 * How stages resolve (see domain/stages.ts):
 *   - Stages are GATES, not averages. You hold stage N only if every
 *     requirement of stages 1..N is satisfied. A brilliant number in one place
 *     cannot buy a weak one somewhere else.
 *   - A requirement whose metric lacks enough data (metric.minN) is "pending":
 *     it blocks promotion but is never reported as a failure.
 *
 * These numbers are FIRST-PASS GUESSES. They are meant to be rewritten once
 * real data exists; the app labels stages provisional throughout calibration
 * and the Data screen can override any target without touching this file.
 */

export interface Requirement {
  metric: MetricKey
  op: '>=' | '<='
  target: number
  /** optional short reason this requirement gates this stage */
  why?: string
}

export interface StageDef {
  level: number
  name: string
  blurb: string
  requirements: Requirement[]
}

export const STAGE_NAMES = [
  'Fragile / rebuilding',
  'Functional',
  'Stable',
  'High performance',
  'Robust high performance',
  'Sustainable peak',
] as const

export const MAX_STAGE = 5

/** A requirement counts as a near miss (shown as a triangle) at or above this progress. */
export const NEAR_MISS_RATIO = 0.92

const R = (metric: MetricKey, op: '>=' | '<=', target: number, why?: string): Requirement => ({ metric, op, target, why })

export const STAGE_MODEL: Record<Domain, StageDef[]> = {
  /* ==========================================================================
   * BODY -- reserve, adaptation to load, strength progress, recovery.
   * The pairing matters: load alone is not progress unless reserve holds and
   * the strength index moves, which is exactly the fatigue-vs-adaptation
   * question. The strength index is prescribed work divided by perceived cost,
   * so it only climbs when the goal rises without the effort rising with it.
   * ======================================================================== */
  body: [
    {
      level: 1,
      name: STAGE_NAMES[1],
      blurb: 'Training exists and the week is survivable.',
      requirements: [
        R('weeklyReserve', '>=', 3, 'A week you can barely repeat is not a base to build on.'),
        R('sessionsPerWeek', '>=', 1.5),
      ],
    },
    {
      level: 2,
      name: STAGE_NAMES[2],
      blurb: 'A repeatable weekly rhythm that does not empty you.',
      requirements: [
        R('weeklyReserve', '>=', 4.5),
        R('sessionsPerWeek', '>=', 3),
        R('postSessionReserve', '>=', 3.5, 'Ending every session on empty is not a stable rhythm.'),
      ],
    },
    {
      level: 3,
      name: STAGE_NAMES[3],
      blurb: 'Real load, absorbed — and the same work has started to cost less.',
      requirements: [
        R('weeklyReserve', '>=', 6),
        R('sessionsPerWeek', '>=', 4),
        R('weeklyLoad', '>=', 900, 'sRPE: roughly 2-3 substantial sessions a week.'),
        R('strengthIndex', '>=', 1.08, 'More prescribed work at the same effort, or the same work at less. 1.00 is your baseline week.'),
        R('targetAdherence', '>=', 60, 'The index means nothing on weeks you set a target and did not train it.'),
      ],
    },
    {
      level: 4,
      name: STAGE_NAMES[4],
      blurb: 'High load carried with reserve to spare.',
      requirements: [
        R('weeklyReserve', '>=', 7),
        R('sessionsPerWeek', '>=', 4.5),
        R('weeklyLoad', '>=', 1400),
        R('strengthIndex', '>=', 1.2),
        R('targetAdherence', '>=', 75),
        R('postSessionReserve', '>=', 5),
      ],
    },
    {
      level: 5,
      name: STAGE_NAMES[5],
      blurb: 'The load is high, the tank stays full, and performance keeps rising.',
      requirements: [
        R('weeklyReserve', '>=', 8),
        R('sessionsPerWeek', '>=', 5),
        R('weeklyLoad', '>=', 1800),
        R('strengthIndex', '>=', 1.35),
        R('targetAdherence', '>=', 85),
        R('anchorDelta', '>=', 8, 'At the top of the ladder the gain has to survive a measured check, not only a felt one.'),
        R('postSessionReserve', '>=', 6),
      ],
    },
  ],

  /* ==========================================================================
   * BRAIN -- clarity, how well it survives the day, baseline stability, and
   * what actually happens when real stress arrives. Stress requirements only
   * enter from stage 3, because below that there is rarely enough event data.
   * ======================================================================== */
  brain: [
    {
      level: 1,
      name: STAGE_NAMES[1],
      blurb: 'The machinery runs.',
      requirements: [R('clarityAm', '>=', 4), R('emotionalBaseline', '>=', 4)],
    },
    {
      level: 2,
      name: STAGE_NAMES[2],
      blurb: 'Clear enough for real work, on a floor that does not swing.',
      requirements: [
        R('clarityAm', '>=', 5.5),
        R('emotionalBaseline', '>=', 5.5),
        R('clarityDrop', '<=', 3, 'Morning clarity means little if it is gone by 3pm.'),
        R('emotionalVolatility', '<=', 2.2),
      ],
    },
    {
      level: 3,
      name: STAGE_NAMES[3],
      blurb: 'Clarity holds through the day and stress no longer runs the show.',
      requirements: [
        R('clarityAm', '>=', 6.5),
        R('clarityPm', '>=', 5.5),
        R('emotionalBaseline', '>=', 6.5),
        R('clarityDrop', '<=', 2),
        R('emotionalVolatility', '<=', 1.8),
        R('stressImpactRatio', '<=', 0.7),
        R('stressRecoveryPerIntensity', '<=', 30, 'Minutes back to baseline per point of intensity.'),
      ],
    },
    {
      level: 4,
      name: STAGE_NAMES[4],
      blurb: 'Sharp late in the day; stress lands lighter and clears faster.',
      requirements: [
        R('clarityAm', '>=', 7.5),
        R('clarityPm', '>=', 6.5),
        R('emotionalBaseline', '>=', 7),
        R('clarityDrop', '<=', 1.5),
        R('emotionalVolatility', '<=', 1.5),
        R('stressImpactRatio', '<=', 0.55),
        R('stressRecoveryPerIntensity', '<=', 18),
        R('stressImpulseRate', '<=', 30),
      ],
    },
    {
      level: 5,
      name: STAGE_NAMES[5],
      blurb: 'A brain that stays clear all day and absorbs shocks without spilling.',
      requirements: [
        R('clarityAm', '>=', 8),
        R('clarityPm', '>=', 7.5),
        R('emotionalBaseline', '>=', 8),
        R('clarityDrop', '<=', 1),
        R('emotionalVolatility', '<=', 1.2),
        R('stressImpactRatio', '<=', 0.4),
        R('stressRecoveryPerIntensity', '<=', 10),
        R('stressImpulseRate', '<=', 15),
      ],
    },
  ],

  /* ==========================================================================
   * IMMERSION -- coverage, continuity, the quality of the thinking itself, the
   * effortlessness of return, and the impulse pressure working against it.
   * Enjoyment gates only the top two stages: forcing yourself is enough to be
   * high-performing, but not to be sustainable.
   * ======================================================================== */
  immersion: [
    {
      level: 1,
      name: STAGE_NAMES[1],
      blurb: 'A Focus Point exists and gets some of the day.',
      requirements: [R('attentionCoverage', '>=', 30), R('fpContinuity', '>=', 3)],
    },
    {
      level: 2,
      name: STAGE_NAMES[2],
      blurb: 'The problem survives the working day.',
      requirements: [
        R('attentionCoverage', '>=', 45),
        R('fpContinuity', '>=', 4.5),
        R('slowThinking', '>=', 4.5),
        R('strongImpulsesPerWeek', '<=', 8),
      ],
    },
    {
      level: 3,
      name: STAGE_NAMES[3],
      blurb: 'Most of the day is connected and attention finds its way back.',
      requirements: [
        R('attentionCoverage', '>=', 60),
        R('fpContinuity', '>=', 6),
        R('slowThinking', '>=', 6),
        R('automaticReturn', '>=', 5.5),
        R('strongImpulsesPerWeek', '<=', 5),
        R('disruptionPerDay', '<=', 60, 'Real work minutes lost, not urge minutes.'),
      ],
    },
    {
      level: 4,
      name: STAGE_NAMES[4],
      blurb: 'The problem stays alive in spare moments; returning is nearly automatic.',
      requirements: [
        R('attentionCoverage', '>=', 72),
        R('fpContinuity', '>=', 7),
        R('slowThinking', '>=', 7),
        R('automaticReturn', '>=', 7),
        R('strongImpulsesPerWeek', '<=', 3),
        R('disruptionPerDay', '<=', 35),
        R('enjoyment', '>=', 2, 'Sustained at this level only if it is at least enjoyable.'),
      ],
    },
    {
      level: 5,
      name: STAGE_NAMES[5],
      blurb: 'Continuous relaxed immersion that you would not want to give up.',
      requirements: [
        R('attentionCoverage', '>=', 82),
        R('fpContinuity', '>=', 8),
        R('slowThinking', '>=', 8),
        R('automaticReturn', '>=', 8),
        R('strongImpulsesPerWeek', '<=', 1.5),
        R('disruptionPerDay', '<=', 20),
        R('enjoyment', '>=', 2.5),
      ],
    },
  ],
}

export const DOMAIN_META: Record<Domain, { label: string; question: string; series: number }> = {
  body: { label: 'Body', question: 'Is my body becoming able to sustain more work with less fatigue?', series: 2 },
  brain: { label: 'Brain', question: 'Is my thinking clearer, steadier, and more resilient under real stress?', series: 1 },
  immersion: { label: 'Immersion', question: 'Can I hold one important problem all day and sink into it calmly?', series: 3 },
}

export const DOMAINS: Domain[] = ['body', 'brain', 'immersion']
