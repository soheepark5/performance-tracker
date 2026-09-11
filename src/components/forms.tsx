import { useState } from 'react'
import { ENJOYMENT_OPTIONS } from '../config/scales'
import {
  ALL_DAY_MINUTES, EXERCISE_KINDS, IMPULSE_KINDS, IMPULSE_OUTCOMES, METRIC_FIELD_META, STRESS_REACTIONS,
  type MetricField,
} from '../config/taxonomy'
import { formatShort, formatTime, fromLocalInput, toISODate, today, toLocalInput } from '../domain/date'
import { dayCoverage } from '../domain/metrics'
import type {
  AnchorProtocol, EnjoymentLevel, ExerciseKind, ImpulseKind, ImpulseOutcome,
  LiftTarget, StressReaction, WorkoutMetrics,
} from '../domain/types'
import { useApp } from '../store/state'
import { DraftNote, useDraft } from './draft'
import { Chips, NumberField, ScaleInput, Segmented, TextField } from './ui'

/**
 * Every logging form lives here. They are deliberately short: the only required
 * fields are the ones that feed a metric, everything else is optional.
 *
 * Every form keeps a draft on this device while it is being filled in, so a
 * sheet closed half-way — a call, a locked phone, the back button — reopens
 * where it was left. Every event form also takes a time, so something that
 * happened yesterday can be logged today.
 */

function Save({ onSave, disabled, label = 'Save' }: { onSave: () => void; disabled?: boolean; label?: string }) {
  return (
    <button className="btn primary full" onClick={onSave} disabled={disabled}>
      {label}
    </button>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      className="btn ghost full danger"
      style={{ marginTop: 8 }}
      onClick={() => {
        if (confirm('Delete this entry? It is removed from your other devices too.')) onDelete()
      }}
    >
      Delete
    </button>
  )
}

/**
 * Real-minute entry with presets — the raw number is what gets stored.
 * `extreme` decides the last chip: "None" where zero is a real answer (no work
 * lost), "All day" where zero is not (an urge that lasted no time at all).
 */
function MinutesField({ label, value, onChange, presets = [5, 15, 30, 60, 120], extreme = 'none' }: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  presets?: number[]
  extreme?: 'none' | 'allDay'
}) {
  const extremeValue = extreme === 'allDay' ? ALL_DAY_MINUTES : 0
  const fmt = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`)
  return (
    <div className="field">
      <label>{label} <span className="suffix">(minutes)</span></label>
      <div className="chips" style={{ marginBottom: 6 }}>
        {presets.map((p) => (
          <button key={p} type="button" className="chip" aria-pressed={value === p} onClick={() => onChange(p)}>
            {fmt(p)}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={value === extremeValue} onClick={() => onChange(extremeValue)}>
          {extreme === 'allDay' ? 'All day' : 'None'}
        </button>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={5}
        value={value ?? ''}
        placeholder="exact minutes"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  )
}

/** When an event happened. The picker cannot go past now or before tracking began. */
function WhenField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { state } = useApp()
  return (
    <div className="field">
      <label>When</label>
      <input
        type="datetime-local"
        value={value}
        min={`${state.settings.startDate}T00:00`}
        max={toLocalInput(new Date())}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value)
        }}
      />
    </div>
  )
}

/** Default moment for a new event on `date`: now if it is today, otherwise midday. */
export function defaultWhen(date: string): string {
  return date === today() ? toLocalInput(new Date()) : `${date}T12:00`
}

const isFuture = (when: string) => fromLocalInput(when).getTime() > Date.now() + 60_000

function FutureWarning({ when }: { when: string }) {
  if (!isFuture(when)) return null
  return (
    <p className="tiny" style={{ color: 'var(--critical)', margin: '-6px 0 10px' }}>
      That time is in the future.
    </p>
  )
}

function elapsedMinutes(iso: string): number {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return Math.min(ALL_DAY_MINUTES, Math.max(1, min))
}

/* --------------------------------------------------------------- morning */

export function MorningForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { day, actions, activeFocusPoint } = useApp()
  const existing = day(date).morning
  const draft = useDraft<{ clarity: number | null; baseline: number | null; sleep: number | null }>(
    `morning:${date}`,
    () => ({
      clarity: existing?.clarity ?? null,
      baseline: existing?.emotionalBaseline ?? null,
      sleep: existing?.sleepHours ?? null,
    }),
  )
  const f = draft.value
  const [more, setMore] = useState(f.sleep != null)

  return (
    <>
      <DraftNote draft={draft} />
      <ScaleInput scale="clarity" value={f.clarity} onChange={(clarity) => draft.set({ clarity })} />
      <ScaleInput scale="emotionalBaseline" value={f.baseline} onChange={(baseline) => draft.set({ baseline })} />
      {activeFocusPoint ? (
        <p className="small muted">Focus Point: <strong style={{ color: 'var(--ink)' }}>{activeFocusPoint.title}</strong></p>
      ) : (
        <p className="small muted">No Focus Point set yet — set one from the Today screen.</p>
      )}
      {more ? (
        <NumberField label="Sleep" unit="hours" step={0.5} value={f.sleep} onChange={(sleep) => draft.set({ sleep })} />
      ) : (
        <button className="linkbtn" onClick={() => setMore(true)}>+ add sleep hours</button>
      )}
      <div className="sheet-actions">
        <Save
          disabled={f.clarity == null || f.baseline == null}
          onSave={() => {
            actions.saveMorning(date, {
              clarity: f.clarity!,
              emotionalBaseline: f.baseline!,
              sleepHours: f.sleep ?? undefined,
              // Editing a past day keeps the Focus Point that day had.
              focusPointId: existing?.focusPointId ?? activeFocusPoint?.id,
            })
            draft.clear()
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* --------------------------------------------------------------- evening */

type EveningDraft = {
  clarity: number | null
  coverage: number | null
  continuity: number | null
  slow: number | null
  auto: number | null
  enjoy: EnjoymentLevel | null
  note: string
}

export function EveningForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { day, actions } = useApp()
  const d = day(date)
  const existing = d.evening
  const sampledRaw = dayCoverage(d).sampled
  const sampled = sampledRaw == null ? null : Math.round(sampledRaw)

  const draft = useDraft<EveningDraft>(`evening:${date}`, () => ({
    clarity: existing?.clarity ?? null,
    coverage: existing?.coverageReported ?? null,
    continuity: existing?.fpContinuity ?? null,
    slow: existing?.slowThinking ?? null,
    auto: existing?.automaticReturn ?? null,
    enjoy: existing?.enjoyment ?? null,
    note: existing?.note ?? '',
  }))
  const f = draft.value
  const ready = [f.clarity, f.coverage, f.continuity, f.slow, f.auto].every((v) => v != null)

  return (
    <>
      <DraftNote draft={draft} />
      <ScaleInput scale="clarity" value={f.clarity} onChange={(clarity) => draft.set({ clarity })} compact />
      <hr className="rule" />
      <ScaleInput scale="coverage" value={f.coverage} onChange={(coverage) => draft.set({ coverage })} max={100} step={10} />
      {sampled != null && (
        <p className="tiny muted" style={{ marginTop: -4 }}>
          The {d.samples.length} pings on this day averaged {sampled}%. Your estimate is stored separately from that.
        </p>
      )}
      <ScaleInput scale="fpContinuity" value={f.continuity} onChange={(continuity) => draft.set({ continuity })} />
      <ScaleInput scale="slowThinking" value={f.slow} onChange={(slow) => draft.set({ slow })} />
      <ScaleInput scale="automaticReturn" value={f.auto} onChange={(auto) => draft.set({ auto })} />
      <div className="field">
        <label>How did the deep thinking feel? <span className="suffix">(optional)</span></label>
        <Segmented
          options={ENJOYMENT_OPTIONS.map((o) => ({ value: o.value as EnjoymentLevel, label: o.label }))}
          value={f.enjoy}
          onChange={(enjoy) => draft.set({ enjoy })}
          ariaLabel="Immersion enjoyment"
        />
      </div>
      <TextField label="Anything worth remembering (optional)" value={f.note} onChange={(note) => draft.set({ note })} multiline />
      <div className="sheet-actions">
        <Save
          disabled={!ready}
          onSave={() => {
            actions.saveEvening(date, {
              clarity: f.clarity!,
              coverageReported: f.coverage!,
              fpContinuity: f.continuity!,
              slowThinking: f.slow!,
              automaticReturn: f.auto!,
              enjoyment: f.enjoy ?? undefined,
              note: f.note || undefined,
            })
            draft.clear()
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* --------------------------------------------------------------- workout */

type WorkoutDraft = {
  kind: ExerciseKind
  when: string
  duration: number | null
  rpe: number | null
  reserve: number | null
  metrics: WorkoutMetrics
  prescribed: boolean
  note: string
}

export function WorkoutForm({ date, editId, onDone }: { date: string; editId?: string; onDone: () => void }) {
  const { state, actions } = useApp()
  const existing = editId ? state.workouts.find((w) => w.id === editId) : undefined
  const draft = useDraft<WorkoutDraft>(editId ? `workout:${editId}` : 'workout:new', () => ({
    kind: existing?.kind ?? 'run',
    when: existing ? toLocalInput(new Date(existing.at)) : defaultWhen(date),
    duration: existing?.durationMin ?? null,
    rpe: existing?.rpe ?? null,
    reserve: existing?.reserveAfter ?? null,
    metrics: existing?.metrics ?? {},
    prescribed: existing?.prescribed ?? true,
    note: existing?.note ?? '',
  }))
  const f = draft.value

  const def = EXERCISE_KINDS.find((k) => k.kind === f.kind)!
  const setMetric = (key: MetricField, v: number | string | null) =>
    draft.set({ metrics: { ...f.metrics, [key]: v === null || v === '' ? undefined : v } })

  return (
    <>
      <DraftNote draft={draft} />
      <div className="field">
        <label>Exercise</label>
        <Chips
          options={EXERCISE_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
          value={f.kind}
          onChange={(kind) => draft.set({ kind, metrics: {} })}
          ariaLabel="Exercise type"
        />
      </div>
      <WhenField value={f.when} onChange={(when) => draft.set({ when })} />
      <FutureWarning when={f.when} />
      <NumberField label="Duration" unit="minutes" step={5} min={1} value={f.duration} onChange={(duration) => draft.set({ duration })} />
      {f.kind === 'strength' && (
        <div className="field">
          <label>Was this the week's prescribed set?</label>
          <Segmented
            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No — other lifting' }]}
            value={f.prescribed ? 'yes' : 'no'}
            onChange={(v) => draft.set({ prescribed: v === 'yes' })}
            ariaLabel="Prescribed session"
          />
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Only prescribed sessions feed the strength index — an easier session must not be able to make the
            week's target look cheap.
          </p>
        </div>
      )}
      <ScaleInput scale="rpe" value={f.rpe} onChange={(rpe) => draft.set({ rpe })} min={1} />
      <ScaleInput scale="reserveAfter" value={f.reserve} onChange={(reserve) => draft.set({ reserve })} />

      {def.fields.length > 0 && (
        <>
          <hr className="rule" />
          <p className="tiny muted" style={{ marginTop: -6 }}>Optional — only what applies to a {def.label.toLowerCase()}.</p>
          <div className="field-row">
            {def.fields.map((key) => {
              const meta = METRIC_FIELD_META[key]
              return meta.type === 'text' ? (
                <TextField key={key} label={meta.label} value={(f.metrics[key] as string) ?? ''} onChange={(v) => setMetric(key, v)} />
              ) : (
                <NumberField key={key} label={meta.label} unit={meta.unit} step={meta.step} value={(f.metrics[key] as number) ?? null} onChange={(v) => setMetric(key, v)} />
              )
            })}
          </div>
        </>
      )}
      <TextField label="Note (optional)" value={f.note} onChange={(note) => draft.set({ note })} />
      <div className="sheet-actions">
        <Save
          label={existing ? 'Save changes' : 'Save'}
          disabled={!f.duration || f.rpe == null || f.reserve == null || isFuture(f.when)}
          onSave={() => {
            const at = fromLocalInput(f.when)
            const payload = {
              date: toISODate(at),
              at: at.toISOString(),
              kind: f.kind,
              durationMin: f.duration!,
              rpe: f.rpe!,
              reserveAfter: f.reserve!,
              prescribed: f.kind === 'strength' ? f.prescribed : undefined,
              metrics: f.metrics,
              note: f.note || undefined,
            }
            if (existing) actions.updateWorkout(existing.id, payload)
            else actions.addWorkout(payload)
            draft.clear()
            onDone()
          }}
        />
        {existing && (
          <DeleteButton onDelete={() => { actions.deleteWorkout(existing.id); draft.clear(); onDone() }} />
        )}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- stress */

type StressDraft = {
  label: string
  when: string
  intensity: number | null
  impact: number | null
  reaction: StressReaction | null
  recovery: number | null
  impulse: boolean | null
  note: string
}

export function StressForm({ date, editId, onDone }: { date: string; editId?: string; onDone: () => void }) {
  const { state, actions } = useApp()
  const existing = editId ? state.stress.find((e) => e.id === editId) : undefined
  const draft = useDraft<StressDraft>(editId ? `stress:${editId}` : 'stress:new', () => ({
    label: existing?.label ?? '',
    when: existing ? toLocalInput(new Date(existing.at)) : defaultWhen(date),
    intensity: existing?.intensity ?? null,
    impact: existing?.functionalImpact ?? null,
    reaction: existing?.reaction ?? null,
    recovery: existing?.recoveryMinutes ?? null,
    impulse: existing ? existing.triggeredImpulse : null,
    note: existing?.note ?? '',
  }))
  const f = draft.value

  return (
    <>
      <DraftNote draft={draft} />
      {!existing && (
        <p className="desc">Only log this when something genuinely stressful happened. There is nothing to measure on a calm day.</p>
      )}
      <TextField label="What happened" value={f.label} onChange={(label) => draft.set({ label })} placeholder="short label" />
      <WhenField value={f.when} onChange={(when) => draft.set({ when })} />
      <FutureWarning when={f.when} />
      <ScaleInput scale="stressIntensity" value={f.intensity} onChange={(intensity) => draft.set({ intensity })} min={1} />
      <ScaleInput scale="functionalImpact" value={f.impact} onChange={(impact) => draft.set({ impact })} />
      <div className="field">
        <label>Reaction (optional)</label>
        <Chips options={STRESS_REACTIONS} value={f.reaction} onChange={(reaction) => draft.set({ reaction })} ariaLabel="Reaction type" />
      </div>
      <MinutesField label="Time back to baseline" value={f.recovery} onChange={(recovery) => draft.set({ recovery })} presets={[15, 30, 60, 180, 480]} />
      <div className="field">
        <label>Did it set off an impulse?</label>
        <Segmented
          options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
          value={f.impulse == null ? null : f.impulse ? 'yes' : 'no'}
          onChange={(v) => draft.set({ impulse: v === 'yes' })}
          ariaLabel="Triggered an impulse"
        />
      </div>
      <TextField label="Note (optional)" value={f.note} onChange={(note) => draft.set({ note })} multiline />
      <div className="sheet-actions">
        <Save
          label={existing ? 'Save changes' : 'Save'}
          disabled={f.intensity == null || f.impact == null || f.recovery == null || isFuture(f.when)}
          onSave={() => {
            const payload = {
              at: fromLocalInput(f.when).toISOString(),
              label: f.label || undefined,
              intensity: f.intensity!,
              functionalImpact: f.impact!,
              reaction: f.reaction ?? undefined,
              recoveryMinutes: f.recovery!,
              triggeredImpulse: f.impulse ?? false,
              note: f.note || undefined,
            }
            if (existing) actions.updateStress(existing.id, payload)
            else actions.addStress(payload)
            draft.clear()
            onDone()
          }}
        />
        {existing && (
          <DeleteButton onDelete={() => { actions.deleteStress(existing.id); draft.clear(); onDone() }} />
        )}
      </div>
    </>
  )
}

/* --------------------------------------------------------------- impulse */

type ImpulseDraft = {
  kind: ImpulseKind | null
  when: string
  intensity: number | null
  trigger: string
  urge: number | null
  disruption: number | null
  outcome: ImpulseOutcome | null
}

/**
 * An impulse is often best logged the moment it starts, before anything about
 * its length is known. So there are two ways to save: record just the start and
 * finish it later from Today, or fill the whole thing in if it is already over.
 */
export function ImpulseForm({ date, editId, onDone }: { date: string; editId?: string; onDone: () => void }) {
  const { state, actions } = useApp()
  const existing = editId ? state.impulses.find((i) => i.id === editId) : undefined
  const finishing = !!existing?.open

  const draft = useDraft<ImpulseDraft>(editId ? `impulse:${editId}` : 'impulse:new', () => ({
    kind: existing?.kind ?? null,
    when: existing ? toLocalInput(new Date(existing.at)) : defaultWhen(date),
    intensity: existing?.intensity ?? null,
    trigger: existing?.trigger ?? '',
    // Finishing an open urge: the time since it started is the best first guess.
    urge: existing?.urgeMinutes ?? (existing?.open ? elapsedMinutes(existing.at) : null),
    disruption: existing?.disruptionMinutes ?? null,
    outcome: existing?.outcome ?? null,
  }))
  const f = draft.value

  const canStart = !existing && !!f.kind && !isFuture(f.when)
  const complete = !!f.kind && f.intensity != null && f.urge != null && f.disruption != null && !!f.outcome && !isFuture(f.when)

  const saveStart = () => {
    actions.addImpulse({
      at: fromLocalInput(f.when).toISOString(),
      kind: f.kind!,
      intensity: f.intensity ?? undefined,
      trigger: f.trigger || undefined,
      open: true,
    })
    draft.clear()
    onDone()
  }

  const saveComplete = () => {
    const payload = {
      at: fromLocalInput(f.when).toISOString(),
      kind: f.kind!,
      intensity: f.intensity!,
      trigger: f.trigger || undefined,
      urgeMinutes: f.urge!,
      disruptionMinutes: f.disruption!,
      outcome: f.outcome!,
      open: false,
    }
    if (existing) actions.updateImpulse(existing.id, payload)
    else actions.addImpulse(payload)
    draft.clear()
    onDone()
  }

  return (
    <>
      <DraftNote draft={draft} />
      {finishing && existing && (
        <p className="desc">
          Started {existing.date === today() ? 'today' : formatShort(existing.date)} at {formatTime(existing.at)}. The urge
          duration below is the time that has passed since — adjust it if it ended earlier.
        </p>
      )}
      <div className="field">
        <label>Impulse</label>
        <Chips options={IMPULSE_KINDS.map((k) => ({ value: k.kind, label: k.label }))} value={f.kind} onChange={(kind) => draft.set({ kind })} ariaLabel="Impulse type" />
      </div>
      <ScaleInput scale="impulseIntensity" value={f.intensity} onChange={(intensity) => draft.set({ intensity })} min={1} />
      <TextField label="Trigger (optional)" value={f.trigger} onChange={(trigger) => draft.set({ trigger })} placeholder="what set it off" />
      <WhenField value={f.when} onChange={(when) => draft.set({ when })} />
      <FutureWarning when={f.when} />

      {!existing && (
        <>
          <button className="btn full" disabled={!canStart} onClick={saveStart}>
            Save the start — finish it later
          </button>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Log it the moment it starts. It waits at the top of Today until it is over.
          </p>
          <div className="divider-label">or, if it is already over</div>
        </>
      )}

      <MinutesField
        label="How long the urge was present"
        value={f.urge}
        onChange={(urge) => draft.set({ urge })}
        presets={[5, 15, 30, 60, 120]}
        extreme="allDay"
      />
      <MinutesField
        label="Work time actually lost"
        value={f.disruption}
        onChange={(disruption) => draft.set({ disruption })}
        presets={[10, 30, 60, 120]}
        extreme="none"
      />
      <p className="tiny muted" style={{ marginTop: -6 }}>
        These two are kept apart on purpose: wanting something for 20 minutes while working through it is not the same as
        losing 20 minutes.
      </p>
      <div className="field">
        <label>What happened</label>
        <Chips options={IMPULSE_OUTCOMES} value={f.outcome} onChange={(outcome) => draft.set({ outcome })} ariaLabel="Outcome" />
      </div>
      <div className="sheet-actions">
        <Save
          label={finishing ? 'Finish' : existing ? 'Save changes' : 'Save'}
          disabled={!complete}
          onSave={saveComplete}
        />
        {existing && (
          <DeleteButton onDelete={() => { actions.deleteImpulse(existing.id); draft.clear(); onDone() }} />
        )}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- weekly */

export function WeeklyForm({ weekStart, onDone }: { weekStart: string; onDone: () => void }) {
  const { state, actions } = useApp()
  const existing = state.weekly.find((w) => w.weekStart === weekStart)
  const draft = useDraft<{ reserve: number | null; note: string }>(`weekly:${weekStart}`, () => ({
    reserve: existing?.reserve ?? null,
    note: existing?.note ?? '',
  }))
  const f = draft.value

  return (
    <>
      <DraftNote draft={draft} />
      <ScaleInput scale="weeklyReserve" value={f.reserve} onChange={(reserve) => draft.set({ reserve })} />
      <TextField label="What shaped the week (optional)" value={f.note} onChange={(note) => draft.set({ note })} multiline />
      <div className="sheet-actions">
        <Save
          disabled={f.reserve == null}
          onSave={() => {
            actions.saveWeekly(weekStart, f.reserve!, f.note || undefined)
            draft.clear()
            onDone()
          }}
        />
      </div>
    </>
  )
}

/* ------------------------------------------------------ objective anchor */

type AnchorDraft = { date: string; values: Record<string, number | null>; rpe: number | null; note: string }

export function AnchorForm({ protocol, onDone }: { protocol: AnchorProtocol; onDone: () => void }) {
  const { state, actions } = useApp()
  const draft = useDraft<AnchorDraft>('anchor:new', () => ({ date: today(), values: {}, rpe: null, note: '' }))
  const f = draft.value
  const anyValue = Object.values(f.values).some((v) => v != null)

  return (
    <>
      <DraftNote draft={draft} />
      {protocol.notes && <p className="desc">{protocol.notes}</p>}
      <div className="field">
        <label>Measured on</label>
        <input
          type="date"
          value={f.date}
          min={state.settings.startDate}
          max={today()}
          onChange={(e) => {
            if (e.target.value) draft.set({ date: e.target.value })
          }}
        />
      </div>
      {protocol.fields.map((field) => (
        <NumberField
          key={field.key}
          label={`${field.label}${field.better === 'lower' ? ' (lower is better)' : ''}`}
          unit={field.unit}
          step={field.unit === 'm' ? 10 : 1}
          value={f.values[field.key] ?? null}
          onChange={(v) => draft.set({ values: { ...f.values, [field.key]: v } })}
        />
      ))}
      <ScaleInput scale="rpe" value={f.rpe} onChange={(rpe) => draft.set({ rpe })} min={1} compact />
      <TextField label="Conditions / note (optional)" value={f.note} onChange={(note) => draft.set({ note })} multiline />
      <div className="sheet-actions">
        <Save
          disabled={!anyValue}
          label="Save measurement"
          onSave={() => {
            const clean: Record<string, number> = {}
            for (const [k, v] of Object.entries(f.values)) if (v != null) clean[k] = v
            actions.addAnchor({ date: f.date, protocolId: protocol.id, values: clean, rpe: f.rpe ?? undefined, note: f.note || undefined })
            draft.clear()
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

  const draft = useDraft<{ targets: Record<string, LiftTarget>; note: string }>(`target:${weekStart}`, () => {
    const seed = existing?.targets ?? previous?.targets ?? {}
    return {
      targets: Object.fromEntries(
        state.lifts.map((l) => [l.key, seed[l.key] ?? { sets: 3, perSet: l.measure === 'seconds' ? 45 : 10, restSec: 90 }]),
      ),
      note: existing?.note ?? '',
    }
  })
  const f = draft.value

  const patch = (key: string, p: Partial<LiftTarget>) =>
    draft.set({ targets: { ...f.targets, [key]: { ...f.targets[key], ...p } } })

  const ready = state.lifts.every((l) => {
    const t = f.targets[l.key]
    return t && t.sets > 0 && t.perSet > 0 && (!l.loaded || (t.loadKg ?? 0) > 0)
  })

  return (
    <>
      <DraftNote draft={draft} />
      <p className="desc">
        {previous
          ? `Carried over from the week of ${formatShort(previous.weekStart)}. Raise what you intend to push this week.`
          : 'Your first target becomes the baseline everything else is measured against, so set it at what you can genuinely do today — not what you wish you could.'}
      </p>
      {state.lifts.map((l) => {
        const t = f.targets[l.key]
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
      <TextField label="Note (optional)" value={f.note} onChange={(note) => draft.set({ note })} multiline />
      <p className="tiny muted">
        Shorter rest at the same sets, reps and load is a real increase in intensity — it is kept in seconds, not
        folded into a score.
      </p>
      <div className="sheet-actions">
        <Save
          disabled={!ready}
          label="Set this week's target"
          onSave={() => {
            actions.saveWeeklyTarget({ weekStart, at: new Date().toISOString(), targets: f.targets, note: f.note || undefined })
            draft.clear()
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
  const draft = useDraft<{ title: string; why: string }>('focus:new', () => ({ title: '', why: '' }))
  const f = draft.value

  return (
    <>
      <DraftNote draft={draft} />
      <p className="desc">
        One problem you want your mind to keep returning to. Change it when the problem genuinely changes — not daily.
      </p>
      {activeFocusPoint && <p className="small muted">Replacing: <strong style={{ color: 'var(--ink)' }}>{activeFocusPoint.title}</strong></p>}
      <TextField label="The problem" value={f.title} onChange={(title) => draft.set({ title })} placeholder="e.g. Why does the retrieval step degrade at scale?" />
      <TextField label="Why it matters (optional)" value={f.why} onChange={(why) => draft.set({ why })} multiline />
      <div className="sheet-actions">
        <Save
          disabled={!f.title.trim()}
          label="Set Focus Point"
          onSave={() => {
            actions.setFocusPoint(f.title.trim(), f.why || undefined)
            draft.clear()
            onDone()
          }}
        />
      </div>
    </>
  )
}
