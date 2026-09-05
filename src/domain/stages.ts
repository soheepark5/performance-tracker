import { METRICS, formatMetric, type MetricDef } from '../config/metrics'
import { MAX_STAGE, NEAR_MISS_RATIO, STAGE_MODEL, STAGE_NAMES, type Requirement, type StageDef } from '../config/stages'
import type { MetricSet } from './metrics'
import type { AppState, Domain } from './types'
import { addDays, daysBetween, today as todayISO } from './date'

/**
 * The stage engine. Fully deterministic, fully local: given the metric set and
 * the config, the same input always yields the same stage, and every decision
 * it makes is inspectable in the UI.
 *
 * Gate semantics, deliberately not an average:
 *   stage N is held  <=>  every requirement of stages 1..N is met.
 * One outstanding metric therefore cannot compensate for one weak metric.
 */

export type ReqStatus = 'met' | 'near' | 'unmet' | 'pending'

export interface ReqEval {
  requirement: Requirement
  metric: MetricDef
  value: number | null
  target: number
  status: ReqStatus
  /** 0..1, how far the metric has travelled toward its target */
  progress: number
  /** raw distance still to cover, in the metric's own unit */
  gap: number | null
  valueText: string
  targetText: string
}

export interface StageEval {
  level: number
  name: string
  blurb: string
  requirements: ReqEval[]
  satisfied: boolean
  metCount: number
  pendingCount: number
}

export interface DomainEval {
  domain: Domain
  currentStage: number
  currentName: string
  stages: StageEval[]
  /** the stage being worked toward, or null at the top */
  next: StageEval | null
  /** the single unmet requirement furthest from its target */
  bottleneck: ReqEval | null
  /** true while thresholds are still being calibrated */
  provisional: boolean
  /** requirements of the next stage still waiting for data */
  waitingOnData: ReqEval[]
}

/** settings.thresholdOverrides wins over config/stages.ts, so recalibration needs no rebuild. */
export function resolveTarget(state: AppState, domain: Domain, level: number, req: Requirement): number {
  const o = state.settings.thresholdOverrides?.[domain]?.[String(level)]?.[req.metric]
  return typeof o === 'number' && Number.isFinite(o) ? o : req.target
}

function evaluateRequirement(state: AppState, domain: Domain, stage: StageDef, req: Requirement, metrics: MetricSet): ReqEval {
  const metric = METRICS[req.metric]
  const mv = metrics[req.metric]
  const target = resolveTarget(state, domain, stage.level, req)
  const value = mv?.value ?? null

  let status: ReqStatus
  let progress = 0
  let gap: number | null = null

  if (value == null || !mv.sufficient) {
    status = 'pending'
    if (value != null) progress = rawProgress(req.op, value, target)
  } else {
    const met = req.op === '>=' ? value >= target : value <= target
    progress = rawProgress(req.op, value, target)
    gap = met ? 0 : req.op === '>=' ? target - value : value - target
    status = met ? 'met' : progress >= NEAR_MISS_RATIO ? 'near' : 'unmet'
  }

  // If rounding makes an unmet value look identical to its target, show one more
  // decimal rather than printing a gap of "0.70 -> 0.70".
  let extra = 0
  if (status !== 'met' && formatMetric(req.metric, value) === formatMetric(req.metric, target)) extra = 1

  return {
    requirement: req,
    metric,
    value,
    target,
    status,
    progress,
    gap,
    valueText: formatMetric(req.metric, value, extra),
    targetText: formatMetric(req.metric, target, extra),
  }
}

function rawProgress(op: '>=' | '<=', value: number, target: number): number {
  if (op === '>=') {
    if (value >= target) return 1
    if (target <= 0) return value >= target ? 1 : 0
    return Math.max(0, value / target)
  }
  if (value <= target) return 1
  if (value <= 0) return 1
  if (target <= 0) return 0
  return Math.max(0, target / value)
}

export function isCalibrating(state: AppState, asOf = todayISO()): boolean {
  const end = addDays(state.settings.startDate, state.settings.calibrationWeeks * 7)
  return daysBetween(asOf, end) > 0
}

export function calibrationProgress(state: AppState, asOf = todayISO()): { week: number; total: number; endsOn: string } {
  const total = state.settings.calibrationWeeks
  const elapsed = Math.max(0, daysBetween(state.settings.startDate, asOf))
  return { week: Math.min(total, Math.floor(elapsed / 7) + 1), total, endsOn: addDays(state.settings.startDate, total * 7) }
}

export function evaluateDomain(state: AppState, domain: Domain, metrics: MetricSet, asOf = todayISO()): DomainEval {
  const stages: StageEval[] = STAGE_MODEL[domain].map((stage) => {
    const requirements = stage.requirements.map((r) => evaluateRequirement(state, domain, stage, r, metrics))
    return {
      level: stage.level,
      name: stage.name,
      blurb: stage.blurb,
      requirements,
      satisfied: requirements.every((r) => r.status === 'met'),
      metCount: requirements.filter((r) => r.status === 'met').length,
      pendingCount: requirements.filter((r) => r.status === 'pending').length,
    }
  })

  // Gates: hold stage N only if every stage up to N is fully satisfied.
  let current = 0
  for (const s of stages) {
    if (s.satisfied) current = s.level
    else break
  }

  const next = current < MAX_STAGE ? stages.find((s) => s.level === current + 1) ?? null : null
  const blocking = next ? next.requirements.filter((r) => r.status === 'unmet' || r.status === 'near') : []
  const bottleneck = blocking.length
    ? blocking.reduce((worst, r) => (r.progress < worst.progress ? r : worst))
    : null

  return {
    domain,
    currentStage: current,
    currentName: STAGE_NAMES[current],
    stages,
    next,
    bottleneck,
    provisional: isCalibrating(state, asOf),
    waitingOnData: next ? next.requirements.filter((r) => r.status === 'pending') : [],
  }
}

export function evaluateAll(state: AppState, metrics: MetricSet, asOf = todayISO()): Record<Domain, DomainEval> {
  return {
    body: evaluateDomain(state, 'body', metrics, asOf),
    brain: evaluateDomain(state, 'brain', metrics, asOf),
    immersion: evaluateDomain(state, 'immersion', metrics, asOf),
  }
}

export const STATUS_GLYPH: Record<ReqStatus, string> = { met: '✓', near: '△', unmet: '✕', pending: '·' }
export const STATUS_LABEL: Record<ReqStatus, string> = {
  met: 'Achieved',
  near: 'Nearly there',
  unmet: 'Not yet',
  pending: 'Needs more data',
}
