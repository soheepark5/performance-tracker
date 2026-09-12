import { useState } from 'react'
import { DOMAINS, DOMAIN_META, MAX_STAGE, STAGE_NAMES } from '../config/stages'
import { NextStageList, Requirement, StageProgress } from '../components/stage'
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
        {DOMAINS.map((d) => (
          <button key={d} className="stage-pick" onClick={() => setDomain(d)}>
            <StageProgress ev={evals[d]} />
          </button>
        ))}
        {calibrating && (
          <p className="tiny muted" style={{ margin: '14px 0 0' }}>
            Provisional — thresholds are first guesses until about {formatShort(cal.endsOn)} (calibration week {cal.week} of {cal.total}).
          </p>
        )}
      </Card>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          options={DOMAINS.map((d) => ({ value: d, label: DOMAIN_META[d].label }))}
          value={domain}
          onChange={(v) => setDomain(v as Domain)}
          ariaLabel="Domain"
        />
      </div>

      {/* ------------------------------------------------------- the detail */}
      <Card>
        <StageProgress ev={ev} size="hero" />
        <p className="tiny muted" style={{ margin: '14px 0 0' }}>{DOMAIN_META[domain].question}</p>
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
