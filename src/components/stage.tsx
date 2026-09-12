import { DOMAIN_META } from '../config/stages'
import { STATUS_GLYPH, STATUS_LABEL, type DomainEval, type ReqEval } from '../domain/stages'
import type { Domain } from '../domain/types'

/** Green leads (Body), then the two hues that stay separable beside it. */
export const DOMAIN_COLOR: Record<Domain, string> = {
  body: 'var(--series-1)',
  brain: 'var(--series-3)',
  immersion: 'var(--series-2)',
}

/* ------------------------------------------------ progress to the next stage */

export interface NextStageProgress {
  total: number
  met: number
  /** requirements still waiting for enough data */
  pending: number
  /** everything not yet met, pending included — what stands between you and the stage */
  left: number
  /** data-backed requirements that are not met yet */
  remaining: ReqEval[]
  /** of those, the one closest to its target — the quickest win */
  closest: ReqEval | null
}

export function nextStageProgress(ev: DomainEval): NextStageProgress | null {
  if (!ev.next) return null
  const reqs = ev.next.requirements
  const remaining = reqs.filter((r) => r.status === 'unmet' || r.status === 'near')
  const met = reqs.filter((r) => r.status === 'met').length
  return {
    total: reqs.length,
    met,
    pending: reqs.filter((r) => r.status === 'pending').length,
    left: reqs.length - met,
    remaining,
    closest: remaining.length ? remaining.reduce((a, b) => (b.progress > a.progress ? b : a)) : null,
  }
}

/**
 * The current stage, and how far away the next one is.
 *
 * The bar has one segment per requirement of the next stage, never a single
 * averaged percentage: stages are gates, so a blended number would promise
 * progress that one unmet requirement can still block. Met requirements fill
 * solid, the rest fill as far as they have got, and a dashed segment is one
 * still waiting for enough data.
 */
export function StageProgress({ ev, size = 'compact' }: { ev: DomainEval; size?: 'compact' | 'hero' }) {
  const color = DOMAIN_COLOR[ev.domain]
  const p = nextStageProgress(ev)
  const hero = size === 'hero'

  return (
    <div className={`stage-progress ${size}`} style={{ ['--seg-color' as string]: color }}>
      <div className="row between">
        <span className="domain-label">
          <span className="dot" style={{ background: color }} />
          {DOMAIN_META[ev.domain].label}
        </span>
        {ev.provisional && (
          <span className="pill" title="Thresholds are still being calibrated">provisional</span>
        )}
      </div>

      <div className="stage-now">
        <span className="stage-num" style={{ color }}>{ev.currentStage}</span>
        <span className="stage-now-text">
          <span className="stage-kicker">Stage</span>
          <span className="stage-name">{ev.currentName}</span>
        </span>
      </div>

      {!p || !ev.next ? (
        <>
          {hero && <p className="stage-headline">Top of the ladder</p>}
          <p className="stage-line top">Every gate is held. Keep the rhythm that got you here.</p>
        </>
      ) : (
        <>
          {hero && (
            <p className="stage-headline">
              {p.left === 0
                ? 'Everything in reach is met'
                : p.left === 1
                  ? 'One requirement away'
                  : `${p.left} requirements away`}
            </p>
          )}
          <div className="row between stage-next">
            <span>
              To <strong>Stage {ev.next.level}</strong> · {ev.next.name}
            </span>
            <span className="stage-count">
              <strong>{p.met}</strong> of {p.total}
            </span>
          </div>
          <SegmentBar ev={ev} />
          {hero ? <HeroLines ev={ev} p={p} /> : <CompactLine p={p} />}
        </>
      )}
    </div>
  )
}

function SegmentBar({ ev }: { ev: DomainEval }) {
  const reqs = ev.next!.requirements
  // Met first, then the rest by how far they have got, then the ones waiting on
  // data — so the bar reads left to right like something filling up.
  const order = { met: 0, near: 1, unmet: 1, pending: 2 } as const
  const segs = [...reqs].sort((a, b) => order[a.status] - order[b.status] || b.progress - a.progress)
  const met = reqs.filter((r) => r.status === 'met').length

  return (
    <div className="req-bar" role="img" aria-label={`${met} of ${reqs.length} requirements met for stage ${ev.next!.level}`}>
      {segs.map((r, i) => {
        const kind = r.status === 'met' ? 'met' : r.status === 'pending' ? 'pending' : 'partial'
        const fill = r.status === 'met' ? 1 : r.progress
        return (
          <span
            key={r.metric.key}
            className={`req-seg ${kind}`}
            title={r.status === 'pending' ? `${r.metric.label}: needs more data` : `${r.metric.label}: ${r.valueText} → ${r.targetText}`}
          >
            {kind !== 'pending' && fill > 0 && (
              <i style={{ width: `${Math.round(fill * 100)}%`, animationDelay: `${i * 60}ms` }} />
            )}
          </span>
        )
      })}
    </div>
  )
}

function ReqLine({ label, r }: { label: string; r: ReqEval }) {
  return (
    <p className="stage-line">
      <span className="k">{label}: </span>
      <strong>{r.metric.label}</strong> <span className="nums">{r.valueText} → {r.targetText}</span>
    </p>
  )
}

/** The single most encouraging true thing to say about what is left. */
function CompactLine({ p }: { p: NextStageProgress }) {
  if (p.remaining.length === 1) return <ReqLine label="Last one" r={p.remaining[0]} />
  if (p.closest) return <ReqLine label={p.closest.status === 'near' ? 'Almost there' : 'Closest'} r={p.closest} />
  if (p.pending) {
    return <p className="stage-line">All that is left is data — keep logging.</p>
  }
  return <p className="stage-line">Unlocks on the next update.</p>
}

/** The detail view: the quickest win, the biggest gap, and what is still waiting on data. */
function HeroLines({ ev, p }: { ev: DomainEval; p: NextStageProgress }) {
  const bottleneck = ev.bottleneck
  const showGap = bottleneck && bottleneck.metric.key !== p.closest?.metric.key
  return (
    <>
      {p.closest && (
        <ReqLine
          label={p.remaining.length === 1 ? 'Last one' : p.closest.status === 'near' ? 'Almost there' : 'Closest'}
          r={p.closest}
        />
      )}
      {showGap && <ReqLine label="Biggest gap" r={bottleneck} />}
      {p.pending > 0 && (
        <p className="stage-line">
          <span className="k">
            {p.pending} {p.pending === 1 ? 'needs' : 'need'} a few more days of data — they hold the stage rather than
            failing it.
          </span>
        </p>
      )}
    </>
  )
}

/* ------------------------------------------------------- requirement list */

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
