import { useState } from 'react'
import { ENJOYMENT_OPTIONS } from '../config/scales'
import { EXERCISE_KINDS, IMPULSE_KINDS, IMPULSE_OUTCOMES, METRIC_FIELD_META, STRESS_REACTIONS, type MetricField } from '../config/taxonomy'
import { formatDuration, formatShort, today } from '../domain/date'
import { dayCoverage } from '../domain/metrics'
import type {
  AnchorProtocol, EnjoymentLevel, ExerciseKind, ImpulseKind, ImpulseOutcome,
  LiftTarget, StressReaction, WorkoutMetrics,
} from '../domain/types'
import { useApp } from '../store/state'
import { Chips, NumberField, ScaleInput, Segmented, TextField } from './ui'

/**
 * Every logging form lives here. They are deliberately short: the only required
 * fields are the ones that feed a metric, everything else is optional and
 * collapsed away.
 */

function Save({ onSave, disabled, label = 'Save' }: { onSave: () => void; disabled?: boolean; label?: string }) {
  return (
    <button className="btn primary full" onClick={onSave} disabled={disabled}>
      {label}
    </button>
  )
}

/** Real-minute entry with presets — the raw number is what gets stored. */
function MinutesField({ label, value, onChange, presets = [5, 15, 30, 60, 120] }: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  presets?: number[]
}) {
  return (
    <div className="field">
      <label>{label} <span className="suffix">(minutes)</span></label>
      <div className="chips" style={{ marginBottom: 6 }}>
        {presets.map((p) => (
          <button key={p} type="button" className="chip" aria-pressed={value === p} onClick={() => onChange(p)}>
            {formatDuration(p)}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={value === 0} onClick={() => onChange(0)}>none</button>
      </div>
      <input type="number" inputMode="numeric" min={0} step={5} value={value ?? ''} placeholder="exact minutes" onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    </div>
  )
}

/* --------------------------------------------------------------- morning */

export function MorningForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { day, actions, activeFocusPoint } = useApp()
  const existing = day(date).morning
  const [clarity, setClarity] = useState<number | null>(existing?.clarity ?? null)
  const [baseline, setBaseline] = useState<number | null>(existing?.emotionalBaseline ?? null)
  const [sleep, setSleep] = useState<number | null>(existing?.sleepHours ?? null)
  const [more, setMore] = useState(false)

  return (
    <>
      <ScaleInput scale="clarity" value={clarity} onChange={setClarity} />
      <ScaleInput scale="emotionalBaseline" value={baseline} onChange={setBaseline} />
      {activeFocusPoint ? (
        <p className="small muted">Focus Point: <strong style={{ color: 'var(--ink)' }}>{activeFocusPoint.title}</strong></p>
      ) : (
        <p className="small muted">No Focus Point set yet — set one from the Today screen.</p>
      )}
      {more ? (
        <NumberField label="Sleep" unit="hours" step={0.5} value={sleep} onChange={setSleep} />
      ) : (
        <button className="linkbtn" onClick={() => setMore(true)}>+ add sleep hours</button>
      )}
      <div className="sheet-actions">
        <Save
          disabled={clarity == null || baseline == null}
          onSave={() => {
            actions.saveMorning(date, {
              clarity: clarity!,
              emotionalBaseline: baseline!,
              sleepHours: sleep ?? undefined,
              focusPointId: activeFocusPoint?.id,
            })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* --------------------------------------------------------------- evening */

export function EveningForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { day, actions } = useApp()
  const d = day(date)
  const existing = d.evening
  const sampledRaw = dayCoverage(d).sampled
  const sampled = sampledRaw == null ? null : Math.round(sampledRaw)

  const [clarity, setClarity] = useState<number | null>(existing?.clarity ?? null)
  const [coverage, setCoverage] = useState<number | null>(existing?.coverageReported ?? null)
  const [continuity, setContinuity] = useState<number | null>(existing?.fpContinuity ?? null)
  const [slow, setSlow] = useState<number | null>(existing?.slowThinking ?? null)
  const [auto, setAuto] = useState<number | null>(existing?.automaticReturn ?? null)
  const [enjoy, setEnjoy] = useState<EnjoymentLevel | null>(existing?.enjoyment ?? null)
  const [note, setNote] = useState(existing?.note ?? '')

  const ready = [clarity, coverage, continuity, slow, auto].every((v) => v != null)

  return (
    <>
      <ScaleInput scale="clarity" value={clarity} onChange={setClarity} compact />
      <hr className="rule" />
      <ScaleInput scale="coverage" value={coverage} onChange={setCoverage} max={100} step={10} />
      {sampled != null && (
        <p className="tiny muted" style={{ marginTop: -4 }}>
          Your {d.samples.length} pings today averaged {sampled}%. Your estimate is stored separately from that.
        </p>
      )}
      <ScaleInput scale="fpContinuity" value={continuity} onChange={setContinuity} />
      <ScaleInput scale="slowThinking" value={slow} onChange={setSlow} />
      <ScaleInput scale="automaticReturn" value={auto} onChange={setAuto} />
      <div className="field">
        <label>How did the deep thinking feel? <span className="suffix">(optional)</span></label>
        <Segmented options={ENJOYMENT_OPTIONS.map((o) => ({ value: o.value as EnjoymentLevel, label: o.label }))} value={enjoy} onChange={setEnjoy} ariaLabel="Immersion enjoyment" />
      </div>
      <TextField label="Anything worth remembering (optional)" value={note} onChange={setNote} multiline />
      <div className="sheet-actions">
        <Save
          disabled={!ready}
          onSave={() => {
            actions.saveEvening(date, {
              clarity: clarity!,
              coverageReported: coverage!,
              fpContinuity: continuity!,
              slowThinking: slow!,
              automaticReturn: auto!,
              enjoyment: enjoy ?? undefined,
              note: note || undefined,
            })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* --------------------------------------------------------------- workout */

export function WorkoutForm({ onDone }: { onDone: () => void }) {
  const { actions } = useApp()
  const [kind, setKind] = useState<ExerciseKind>('run')
  const [duration, setDuration] = useState<number | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [reserve, setReserve] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<WorkoutMetrics>({})
  const [prescribed, setPrescribed] = useState(true)
  const [note, setNote] = useState('')

  const def = EXERCISE_KINDS.find((k) => k.kind === kind)!
  const setMetric = (f: MetricField, v: number | string | null) =>
    setMetrics((m) => ({ ...m, [f]: v === null || v === '' ? undefined : v }))

  return (
    <>
      <div className="field">
        <label>Exercise</label>
        <Chips options={EXERCISE_KINDS.map((k) => ({ value: k.kind, label: k.label }))} value={kind} onChange={(v) => { setKind(v); setMetrics({}) }} ariaLabel="Exercise type" />
      </div>
      <NumberField label="Duration" unit="minutes" step={5} min={1} value={duration} onChange={setDuration} />
      {kind === 'strength' && (
        <div className="field">
          <label>Was this the week's prescribed set?</label>
          <Segmented
            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No — other lifting' }]}
            value={prescribed ? 'yes' : 'no'}
            onChange={(v) => setPrescribed(v === 'yes')}
            ariaLabel="Prescribed session"
          />
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Only prescribed sessions feed the strength index — an easier session must not be able to make the
            week's target look cheap.
          </p>
        </div>
      )}
      <ScaleInput scale="rpe" value={rpe} onChange={setRpe} min={1} />
      <ScaleInput scale="reserveAfter" value={reserve} onChange={setReserve} />

      {def.fields.length > 0 && (
        <>
          <hr className="rule" />
          <p className="tiny muted" style={{ marginTop: -6 }}>Optional — only what applies to a {def.label.toLowerCase()}.</p>
          <div className="field-row">
            {def.fields.map((f) => {
              const meta = METRIC_FIELD_META[f]
              return meta.type === 'text' ? (
                <TextField key={f} label={meta.label} value={(metrics[f] as string) ?? ''} onChange={(v) => setMetric(f, v)} />
              ) : (
                <NumberField key={f} label={meta.label} unit={meta.unit} step={meta.step} value={(metrics[f] as number) ?? null} onChange={(v) => setMetric(f, v)} />
              )
            })}
          </div>
        </>
      )}
      <TextField label="Note (optional)" value={note} onChange={setNote} />
      <div className="sheet-actions">
        <Save
          disabled={!duration || rpe == null || reserve == null}
          onSave={() => {
            actions.addWorkout({
              date: today(),
              kind,
              durationMin: duration!,
              rpe: rpe!,
              reserveAfter: reserve!,
              prescribed: kind === 'strength' ? prescribed : undefined,
              metrics,
              note: note || undefined,
            })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- stress */

export function StressForm({ onDone }: { onDone: () => void }) {
  const { actions } = useApp()
  const [label, setLabel] = useState('')
  const [intensity, setIntensity] = useState<number | null>(null)
  const [impact, setImpact] = useState<number | null>(null)
  const [reaction, setReaction] = useState<StressReaction | null>(null)
  const [recovery, setRecovery] = useState<number | null>(null)
  const [impulse, setImpulse] = useState<boolean | null>(null)
  const [note, setNote] = useState('')

  return (
    <>
      <p className="desc">Only log this when something genuinely stressful happened. There is nothing to measure on a calm day.</p>
      <TextField label="What happened" value={label} onChange={setLabel} placeholder="short label" />
      <ScaleInput scale="stressIntensity" value={intensity} onChange={setIntensity} min={1} />
      <ScaleInput scale="functionalImpact" value={impact} onChange={setImpact} />
      <div className="field">
        <label>Reaction (optional)</label>
        <Chips options={STRESS_REACTIONS} value={reaction} onChange={setReaction} ariaLabel="Reaction type" />
      </div>
      <MinutesField label="Time back to baseline" value={recovery} onChange={setRecovery} presets={[15, 30, 60, 180, 480]} />
      <div className="field">
        <label>Did it set off an impulse?</label>
        <Segmented options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} value={impulse == null ? null : impulse ? 'yes' : 'no'} onChange={(v) => setImpulse(v === 'yes')} ariaLabel="Triggered an impulse" />
      </div>
      <TextField label="Note (optional)" value={note} onChange={setNote} multiline />
      <div className="sheet-actions">
        <Save
          disabled={intensity == null || impact == null || recovery == null}
          onSave={() => {
            actions.addStress({
              label: label || undefined,
              intensity: intensity!,
              functionalImpact: impact!,
              reaction: reaction ?? undefined,
              recoveryMinutes: recovery!,
              triggeredImpulse: impulse ?? false,
              note: note || undefined,
            })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* --------------------------------------------------------------- impulse */

export function ImpulseForm({ onDone }: { onDone: () => void }) {
  const { actions } = useApp()
  const [kind, setKind] = useState<ImpulseKind | null>(null)
  const [intensity, setIntensity] = useState<number | null>(null)
  const [urge, setUrge] = useState<number | null>(null)
  const [disruption, setDisruption] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<ImpulseOutcome | null>(null)
  const [trigger, setTrigger] = useState('')

  return (
    <>
      <div className="field">
        <label>Impulse</label>
        <Chips options={IMPULSE_KINDS.map((k) => ({ value: k.kind, label: k.label }))} value={kind} onChange={setKind} ariaLabel="Impulse type" />
      </div>
      <ScaleInput scale="impulseIntensity" value={intensity} onChange={setIntensity} min={1} />
      <MinutesField label="How long the urge was present" value={urge} onChange={setUrge} presets={[5, 15, 30, 60, 120]} />
      <MinutesField label="Work time actually lost" value={disruption} onChange={setDisruption} presets={[0, 10, 30, 60, 120]} />
      <p className="tiny muted" style={{ marginTop: -6 }}>
        These two are kept apart on purpose: wanting something for 20 minutes while working through it is not the same as losing 20 minutes.
      </p>
      <div className="field">
        <label>What happened</label>
        <Chips options={IMPULSE_OUTCOMES} value={outcome} onChange={setOutcome} ariaLabel="Outcome" />
      </div>
      <TextField label="Trigger (optional)" value={trigger} onChange={setTrigger} placeholder="what set it off" />
      <div className="sheet-actions">
        <Save
          disabled={!kind || intensity == null || urge == null || disruption == null || !outcome}
          onSave={() => {
            actions.addImpulse({
              kind: kind!,
              intensity: intensity!,
              urgeMinutes: urge!,
              disruptionMinutes: disruption!,
              outcome: outcome!,
              trigger: trigger || undefined,
            })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- weekly */

export function WeeklyForm({ weekStart, onDone }: { weekStart: string; onDone: () => void }) {
  const { state, actions } = useApp()
  const existing = state.weekly.find((w) => w.weekStart === weekStart)
  const [reserve, setReserve] = useState<number | null>(existing?.reserve ?? null)
  const [note, setNote] = useState(existing?.note ?? '')

  return (
    <>
      <ScaleInput scale="weeklyReserve" value={reserve} onChange={setReserve} />
      <TextField label="What shaped the week (optional)" value={note} onChange={setNote} multiline />
      <div className="sheet-actions">
        <Save disabled={reserve == null} onSave={() => { actions.saveWeekly(weekStart, reserve!, note || undefined); onDone() }} />
      </div>
    </>
  )
}

/* ------------------------------------------------------------- benchmark */

export function AnchorForm({ protocol, onDone }: { protocol: AnchorProtocol; onDone: () => void }) {
  const { actions } = useApp()
  const [values, setValues] = useState<Record<string, number | null>>({})
  const [rpe, setRpe] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const anyValue = Object.values(values).some((v) => v != null)

  return (
    <>
      {protocol.notes && <p className="desc">{protocol.notes}</p>}
      {protocol.fields.map((f) => (
        <NumberField
          key={f.key}
          label={`${f.label}${f.better === 'lower' ? ' (lower is better)' : ''}`}
          unit={f.unit}
          step={f.unit === 'm' ? 10 : 1}
          value={values[f.key] ?? null}
          onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
        />
      ))}
      <ScaleInput scale="rpe" value={rpe} onChange={setRpe} min={1} compact />
      <TextField label="Conditions / note (optional)" value={note} onChange={setNote} multiline />
      <div className="sheet-actions">
        <Save
          disabled={!anyValue}
          label="Save benchmark"
          onSave={() => {
            const clean: Record<string, number> = {}
            for (const [k, v] of Object.entries(values)) if (v != null) clean[k] = v
            actions.addAnchor({ date: today(), protocolId: protocol.id, values: clean, rpe: rpe ?? undefined, note: note || undefined })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* -------------------------------------------------- weekly intensity target */

/**
 * Set at the start of the week. Prefilled from last week's target, so raising
 * the intensity is a couple of taps rather than re-typing five lifts.
 */
export function WeeklyTargetForm({ weekStart, onDone }: { weekStart: string; onDone: () => void }) {
  const { state, actions } = useApp()
  const existing = state.weeklyTargets.find((t) => t.weekStart === weekStart)
  const previous = [...state.weeklyTargets]
    .filter((t) => t.weekStart < weekStart)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .pop()

  const seed = existing?.targets ?? previous?.targets ?? {}
  const [targets, setTargets] = useState<Record<string, LiftTarget>>(() =>
    Object.fromEntries(state.lifts.map((l) => [l.key, seed[l.key] ?? { sets: 3, perSet: l.measure === 'seconds' ? 45 : 10, restSec: 90, loadKg: l.loaded ? undefined : undefined }])),
  )
  const [note, setNote] = useState(existing?.note ?? '')

  const patch = (key: string, p: Partial<LiftTarget>) =>
    setTargets((t) => ({ ...t, [key]: { ...t[key], ...p } }))

  const ready = state.lifts.every((l) => {
    const t = targets[l.key]
    return t && t.sets > 0 && t.perSet > 0 && (!l.loaded || (t.loadKg ?? 0) > 0)
  })

  return (
    <>
      <p className="desc">
        {previous
          ? `Carried over from the week of ${formatShort(previous.weekStart)}. Raise what you intend to push this week.`
          : 'Your first target becomes the baseline everything else is measured against, so set it at what you can genuinely do today — not what you wish you could.'}
      </p>
      {state.lifts.map((l) => {
        const t = targets[l.key]
        const prev = previous?.targets[l.key]
        return (
          <div key={l.key} className="card" style={{ background: 'var(--surface-2)', marginBottom: 10 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{l.label}</strong>
              {prev && (
                <span className="tiny muted">
                  last week {prev.sets}×{prev.perSet}{l.measure === 'seconds' ? 's' : ''}{l.loaded && prev.loadKg ? ` @ ${prev.loadKg}kg` : ''}
                </span>
              )}
            </div>
            <div className="field-row">
              <NumberField label="Sets" value={t?.sets ?? null} min={1} step={1} onChange={(v) => patch(l.key, { sets: v ?? 0 })} />
              <NumberField
                label={l.measure === 'seconds' ? 'Seconds per hold' : 'Reps per set'}
                value={t?.perSet ?? null}
                min={1}
                step={l.measure === 'seconds' ? 5 : 1}
                onChange={(v) => patch(l.key, { perSet: v ?? 0 })}
              />
            </div>
            <div className="field-row">
              {l.loaded ? (
                <NumberField label="Load" unit="kg" value={t?.loadKg ?? null} min={0} step={2.5} onChange={(v) => patch(l.key, { loadKg: v ?? undefined })} />
              ) : (
                <div />
              )}
              <NumberField label="Rest between sets" unit="sec" value={t?.restSec ?? null} min={0} step={15} onChange={(v) => patch(l.key, { restSec: v ?? 0 })} />
            </div>
          </div>
        )
      })}
      <TextField label="Note (optional)" value={note} onChange={setNote} multiline />
      <p className="tiny muted">
        Shorter rest at the same sets, reps and load is a real increase in intensity — it is kept in seconds, not
        folded into a score.
      </p>
      <div className="sheet-actions">
        <Save
          disabled={!ready}
          label="Set this week's target"
          onSave={() => {
            actions.saveWeeklyTarget({ weekStart, at: new Date().toISOString(), targets, note: note || undefined })
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* ----------------------------------------------------------- focus point */

export function FocusPointForm({ onDone }: { onDone: () => void }) {
  const { actions, activeFocusPoint } = useApp()
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')

  return (
    <>
      <p className="desc">
        One problem you want your mind to keep returning to. Change it when the problem genuinely changes — not daily.
      </p>
      {activeFocusPoint && <p className="small muted">Replacing: <strong style={{ color: 'var(--ink)' }}>{activeFocusPoint.title}</strong></p>}
      <TextField label="The problem" value={title} onChange={setTitle} placeholder="e.g. Why does the retrieval step degrade at scale?" />
      <TextField label="Why it matters (optional)" value={why} onChange={setWhy} multiline />
      <div className="sheet-actions">
        <Save disabled={!title.trim()} label="Set Focus Point" onSave={() => { actions.setFocusPoint(title.trim(), why || undefined); onDone() }} />
      </div>
    </>
  )
}
