import { useState } from 'react'
import { DOMAINS, DOMAIN_META, MAX_STAGE, STAGE_NAMES } from '../config/stages'
import { DOMAIN_COLOR, NextStageList, Requirement, StageMarker } from '../components/stage'
import { Card, Segmented } from '../components/ui'
import { calibrationProgress, isCalibrating } from '../domain/stages'
import { formatShort } from '../domain/date'
import { useApp } from '../store/state'
import type { Domain } from '../domain/types'

/**
 * Stages: the "what exactly do I need to improve next?" screen.
 * Three separate ladders, never averaged into one number.
 */

export function Stages({ domain, setDomain }: { domain: Domain; setDomain: (d: Domain) => void }) {
  const { state, evals } = useApp()
  const [showAll, setShowAll] = useState(false)
  const ev = evals[domain]
  const calibrating = isCalibrating(state)
  const cal = calibrationProgress(state)

  return (
    <>
      {/* --------------------------------------------- sustainable performance */}
      <Card title="Sustainable performance">
        <div className="stack" style={{ gap: 14 }}>
          {DOMAINS.map((d) => {
            const e = evals[d]
            return (
              <button
                key={d}
                onClick={() => setDomain(d)}
                style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', width: '100%' }}
              >
                <div className="row between">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: DOMAIN_COLOR[d] }} />
                    <strong style={{ fontSize: 14 }}>{DOMAIN_META[d].label}</strong>
                  </div>
                  <span className="small">
                    <strong>Stage {e.currentStage}</strong> <span className="muted">{e.currentName}</span>
                  </span>
                </div>
                <StageMarker level={e.currentStage} color={DOMAIN_COLOR[d]} />
                <div className="tiny muted">
                  {e.bottleneck
                    ? <>Blocked by {e.bottleneck.metric.label}: {e.bottleneck.valueText} → {e.bottleneck.targetText}</>
                    : e.next ? 'Waiting on data' : 'Top stage held'}
                </div>
              </button>
            )
          })}
        </div>
        {calibrating && (
          <p className="tiny muted" style={{ margin: '14px 0 0' }}>
            Provisional — thresholds are first guesses until about {formatShort(cal.endsOn)} (calibration week {cal.week} of {cal.total}).
          </p>
        )}
      </Card>

      <Segmented
        options={DOMAINS.map((d) => ({ value: d, label: DOMAIN_META[d].label }))}
        value={domain}
        onChange={(v) => setDomain(v as Domain)}
        ariaLabel="Domain"
      />

      {/* ------------------------------------------------------- the detail */}
      <Card
        className="tight"
        title={`${DOMAIN_META[domain].label} — Stage ${ev.currentStage}`}
        right={ev.provisional ? <span className="pill">provisional</span> : null}
      >
        <StageMarker level={ev.currentStage} color={DOMAIN_COLOR[domain]} />
        <p className="small muted" style={{ margin: '0 0 2px' }}>{ev.currentName}</p>
        <p className="tiny muted" style={{ margin: 0 }}>{DOMAIN_META[domain].question}</p>
      </Card>

      <Card title="To reach the next stage" desc="Every requirement has to be met. One strong number does not buy a weak one.">
        <NextStageList ev={ev} />
        {ev.waitingOnData.length > 0 && (
          <p className="tiny muted" style={{ margin: '10px 0 0' }}>
            Requirements marked · are waiting for enough data. They hold the stage rather than failing it.
          </p>
        )}
      </Card>

      <Card
        title="The whole ladder"
        right={<button className="btn small ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : 'Show'}</button>}
        desc={`Stage 0 ${STAGE_NAMES[0]} → stage ${MAX_STAGE} ${STAGE_NAMES[MAX_STAGE]}. Every gate is computed on this device from your own data.`}
      >
        {showAll &&
          ev.stages.map((s) => (
            <div key={s.level} style={{ marginBottom: 14 }}>
              <div className="row between" style={{ marginBottom: 2 }}>
                <strong className="small">
                  Stage {s.level} — {s.name}
                </strong>
                <span className="pill">
                  {s.satisfied ? 'held' : `${s.metCount}/${s.requirements.length}`}
                </span>
              </div>
              <p className="tiny muted" style={{ margin: '0 0 4px' }}>{s.blurb}</p>
              {s.requirements.map((r) => (
                <Requirement key={r.metric.key} req={r} />
              ))}
            </div>
          ))}
      </Card>
    </>
  )
}
