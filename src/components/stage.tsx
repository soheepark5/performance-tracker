import { MAX_STAGE, DOMAIN_META } from '../config/stages'
import { STATUS_GLYPH, STATUS_LABEL, type DomainEval, type ReqEval } from '../domain/stages'
import type { Domain } from '../domain/types'

/** Green leads (Body), then the two hues that stay separable beside it. */
export const DOMAIN_COLOR: Record<Domain, string> = {
  body: 'var(--series-1)',
  brain: 'var(--series-3)',
  immersion: 'var(--series-2)',
}

/**
 * Where you are on the 0-5 ladder, as a pinpoint rather than a progress bar.
 * A filled bar would imply the lower stages are "banked"; they are not — every
 * stage below is re-checked continuously, so the honest picture is a single
 * marked position that can move in either direction.
 */
export function StageMarker({ level, color }: { level: number; color: string }) {
  return (
    <div className="stage-marks" role="img" aria-label={`Currently stage ${level} of ${MAX_STAGE}`}>
      {Array.from({ length: MAX_STAGE + 1 }, (_, i) => (
        <span
          key={i}
          className={`stage-mark${i === level ? ' on' : ''}`}
          style={i === level ? { borderColor: color, background: `color-mix(in srgb, ${color} 16%, transparent)` } : undefined}
        >
          {i}
        </span>
      ))}
    </div>
  )
}

export function StageHeadline({ ev }: { ev: DomainEval }) {
  const color = DOMAIN_COLOR[ev.domain]
  return (
    <>
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: color }} />
          <strong style={{ fontSize: 15 }}>{DOMAIN_META[ev.domain].label}</strong>
          <span className="pill">Stage {ev.currentStage}</span>
        </div>
        {ev.provisional && <span className="pill" title="Thresholds are still being calibrated">provisional</span>}
      </div>
      <StageMarker level={ev.currentStage} color={color} />
      <div className="small muted">
        {ev.currentName}
        {ev.next ? <> · next: {ev.next.name}</> : <> · top stage held</>}
      </div>
    </>
  )
}

export function Requirement({ req, isBottleneck }: { req: ReqEval; isBottleneck?: boolean }) {
  const cls = `glyph glyph-${req.status}`
  const arrow = req.status === 'met' ? null : (
    <span className="nums">
      {req.valueText} <span className="muted">→</span> {req.targetText}
    </span>
  )
  return (
    <div className={`req${isBottleneck ? ' bottleneck' : ''}`}>
      <span className={cls} aria-hidden="true">{STATUS_GLYPH[req.status]}</span>
      <div className="grow">
        <div className="row between" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="label">{req.metric.label}</span>
          {arrow ?? <span className="nums">{req.valueText}</span>}
        </div>
        <div className="tiny muted">
          <span className="sr-only">{STATUS_LABEL[req.status]}. </span>
          {req.status === 'pending'
            ? 'Not enough data yet — this holds the stage rather than failing it.'
            : req.requirement.why ?? req.metric.description}
        </div>
        {req.status !== 'met' && req.status !== 'pending' && (
          <div className="bar"><i style={{ width: `${Math.round(req.progress * 100)}%` }} /></div>
        )}
      </div>
    </div>
  )
}

export function NextStageList({ ev }: { ev: DomainEval }) {
  if (!ev.next) {
    return <p className="small muted" style={{ margin: 0 }}>Every gate in the model is held. Time to rewrite the top of the model.</p>
  }
  const ordered = [...ev.next.requirements].sort((a, b) => rank(a) - rank(b) || a.progress - b.progress)
  return (
    <>
      <div className="small" style={{ marginBottom: 6 }}>
        <strong>Stage {ev.next.level} — {ev.next.name}</strong>
        <span className="muted"> · {ev.next.blurb}</span>
      </div>
      {ordered.map((r) => (
        <Requirement key={r.metric.key} req={r} isBottleneck={ev.bottleneck?.metric.key === r.metric.key} />
      ))}
    </>
  )
}

function rank(r: ReqEval) {
  return { unmet: 0, near: 1, pending: 2, met: 3 }[r.status]
}

export function BottleneckLine({ ev }: { ev: DomainEval }) {
  if (!ev.next) return null
  if (!ev.bottleneck) {
    return (
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {ev.waitingOnData.length
          ? `Waiting on data for ${ev.waitingOnData.map((r) => r.metric.label).join(', ')}.`
          : 'All requirements met — the stage will register on the next recalculation.'}
      </p>
    )
  }
  const b = ev.bottleneck
  return (
    <p className="small" style={{ margin: '6px 0 0' }}>
      <span className="muted">Biggest gap: </span>
      <strong>{b.metric.label}</strong>{' '}
      <span className="nums">{b.valueText} → {b.targetText}</span>
    </p>
  )
}
