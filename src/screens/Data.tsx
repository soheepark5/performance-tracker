import { useRef, useState } from 'react'
import { Card, Chips, NumberField, Segmented, Sheet, TextField, Tile } from '../components/ui'
import { CloudCard } from '../components/CloudCard'
import { DOMAINS, DOMAIN_META, STAGE_MODEL } from '../config/stages'
import { METRICS, formatMetric } from '../config/metrics'
import { EXERCISE_KINDS, IMPULSE_KINDS } from '../config/taxonomy'
import { SAMPLE_OPTIONS } from '../config/scales'
import { slotLabel } from '../domain/pings'
import { formatDuration, formatShort, formatTime, today } from '../domain/date'
import { requestNotificationPermission } from '../domain/pings'
import { resolveTarget } from '../domain/stages'
import { makeSampleState } from '../store/sample'
import { copyExport, createInitialState, exportBackup } from '../store/storage'
import { useApp } from '../store/state'
import type { AnchorProtocol, Domain } from '../domain/types'

/**
 * Data & settings: the schedule, the threshold editor (recalibration without a
 * rebuild), the raw record, and export/import. Everything stays on the device.
 */

export function Data() {
  const { state, metrics, canEdit } = useApp()
  const [tab, setTab] = useState<'settings' | 'thresholds' | 'record'>('settings')

  return (
    <>
      <Segmented
        options={[
          { value: 'settings' as const, label: 'Settings' },
          { value: 'thresholds' as const, label: 'Thresholds' },
          { value: 'record' as const, label: 'Record' },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Data section"
      />
      <div style={{ height: 12 }} />
      {tab === 'settings' && (canEdit ? <SettingsTab /> : <SettingsView />)}
      {tab === 'thresholds' && <ThresholdsTab />}
      {tab === 'record' && <RecordTab />}
      <p className="tiny muted center" style={{ marginTop: 20 }}>
        {Object.keys(state.days).length} days · {state.workouts.length} sessions · {state.impulses.length} impulses ·{' '}
        {state.weeklyTargets.length} weekly targets · logged {formatMetric('loggingRate', metrics.loggingRate.value)} of the last 28 days
      </p>
      <p className="tiny muted center" style={{ margin: 0 }}>
        {canEdit ? 'v1' : 'v1 · a read-only copy; nothing is stored on your device'}
      </p>
    </>
  )
}

/* -------------------------------------------------------------- settings */

function SettingsTab() {
  const { state, actions } = useApp()
  const s = state.settings
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null)

  return (
    <>
      <Card title="Sampling schedule" desc="Short prompts asking what your mind was on just before. No timers, no start button.">
        <div className="field-row">
          <TimeField label="Starting work" value={s.pingTimes.start} onChange={(v) => actions.updateSettings({ pingTimes: { ...s.pingTimes, start: v } })} />
          <TimeField label="Finishing work" value={s.pingTimes.end} onChange={(v) => actions.updateSettings({ pingTimes: { ...s.pingTimes, end: v } })} />
        </div>
        <div className="field-row">
          <TimeField
            label="Midday (optional)"
            value={s.pingTimes.mid ?? ''}
            onChange={(v) => actions.updateSettings({ pingTimes: { ...s.pingTimes, mid: v || null } })}
          />
          <div className="field">
            <label>One random check</label>
            <Segmented
              options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
              value={s.randomPing ? 'on' : 'off'}
              onChange={(v) => actions.updateSettings({ randomPing: v === 'on' })}
              ariaLabel="Random ping"
            />
          </div>
        </div>
        <hr className="rule" />
        <div className="row between">
          <div className="grow">
            <div className="small" style={{ fontWeight: 550 }}>Browser reminders</div>
            <div className="tiny muted">
              Fire while the app is open (including as a home-screen app). There is no server here to push a
              notification to a closed app — for hard alarms, set the same times in your phone's clock.
            </div>
          </div>
          <button
            className="btn small"
            onClick={async () => {
              const ok = await requestNotificationPermission()
              actions.updateSettings({ notificationsEnabled: ok })
              setNotifyMsg(ok ? 'Reminders on.' : 'Permission not granted — the Today screen still shows missed pings.')
            }}
          >
            {s.notificationsEnabled ? 'On' : 'Enable'}
          </button>
        </div>
        {notifyMsg && <p className="tiny muted" style={{ margin: '8px 0 0' }}>{notifyMsg}</p>}
      </Card>

      <Card title="Calibration" desc="Thresholds are treated as provisional while you build up enough of your own data to set them properly.">
        <div className="field-row">
          <div className="field">
            <label>Tracking started</label>
            <input type="date" value={s.startDate} onChange={(e) => actions.updateSettings({ startDate: e.target.value })} />
          </div>
          <NumberField label="Calibration length" unit="weeks" min={0} value={s.calibrationWeeks} onChange={(v) => actions.updateSettings({ calibrationWeeks: v ?? 8 })} />
        </div>
        <NumberField label="Objective anchor every" unit="days" min={7} step={7} value={s.anchorIntervalDays} onChange={(v) => actions.updateSettings({ anchorIntervalDays: v ?? 91 })} />
      </Card>

      <CloudCard />
      <LiftsCard />
      <ProtocolCard />
      <BackupCard />
    </>
  )
}

/**
 * The same configuration a visitor needs in order to read the record properly —
 * how often attention was sampled, how long calibration ran, which five lifts
 * the intensity target asks for — shown as values, with nothing to change.
 */
function SettingsView() {
  const { state } = useApp()
  const s = state.settings
  const proto = state.anchorProtocols[state.anchorProtocols.length - 1]
  return (
    <>
      <Card title="Sampling schedule" desc="When the attention samples were taken. Coverage figures rest on this.">
        <div className="tiles">
          <Tile label="Starting work" value={s.pingTimes.start} />
          <Tile label="Midday" value={s.pingTimes.mid ?? '—'} />
          <Tile label="Finishing work" value={s.pingTimes.end} />
          <Tile label="Random check" value={s.randomPing ? 'On' : 'Off'} />
        </div>
      </Card>

      <Card title="Calibration" desc="Stages shown during this window are provisional by design.">
        <div className="tiles">
          <Tile label="Tracking since" value={formatShort(s.startDate)} />
          <Tile label="Calibration" value={`${s.calibrationWeeks} wks`} />
          <Tile label="Objective anchor" value={`${s.anchorIntervalDays} days`} detail="how often it is measured" />
        </div>
      </Card>

      <Card title="The five lifts" desc="What the weekly intensity target asks for.">
        <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
          {state.lifts.map((l) => (
            <li key={l.key}>{l.label} — {l.measure === 'seconds' ? 'held seconds' : 'reps'}{l.loaded ? ', loaded' : ', bodyweight'}</li>
          ))}
        </ul>
      </Card>

      {proto && (
        <Card title="Objective anchor" desc={proto.notes}>
          <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
            {proto.fields.map((f) => (
              <li key={f.key}>{f.label} — {f.unit || 'value'}, {f.better} is better</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/* ----------------------------------------------------------------- lifts */

function LiftsCard() {
  const { state, actions } = useApp()
  const [editing, setEditing] = useState<typeof state.lifts | null>(null)

  return (
    <Card
      title="The five lifts"
      desc="What the weekly intensity target asks for. Changing this keeps every past target — a lift that disappears simply stops counting toward the composite."
      right={<button className="btn small ghost" onClick={() => setEditing(structuredClone(state.lifts))}>Edit</button>}
    >
      <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
        {state.lifts.map((l) => (
          <li key={l.key}>{l.label} — {l.measure === 'seconds' ? 'held seconds' : 'reps'}{l.loaded ? ', loaded' : ', bodyweight'}</li>
        ))}
      </ul>

      {editing && (
        <Sheet open title="The five lifts" onClose={() => setEditing(null)}>
          {editing.map((l, i) => (
            <div key={i} className="card" style={{ background: 'var(--surface-2)' }}>
              <TextField label="Lift" value={l.label} onChange={(v) => setEditing(editing.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
              <div className="field">
                <label>Counted in</label>
                <Segmented
                  options={[{ value: 'reps', label: 'Reps' }, { value: 'seconds', label: 'Seconds held' }]}
                  value={l.measure}
                  onChange={(v) => setEditing(editing.map((x, j) => (j === i ? { ...x, measure: v as 'reps' | 'seconds' } : x)))}
                  ariaLabel="Measure"
                />
              </div>
              <div className="row between">
                <Segmented
                  options={[{ value: 'loaded', label: 'External load' }, { value: 'body', label: 'Bodyweight' }]}
                  value={l.loaded ? 'loaded' : 'body'}
                  onChange={(v) => setEditing(editing.map((x, j) => (j === i ? { ...x, loaded: v === 'loaded' } : x)))}
                  ariaLabel="Load"
                />
                <button className="btn small danger" onClick={() => setEditing(editing.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
          ))}
          <button
            className="btn full"
            onClick={() => setEditing([...editing, { key: `lift${Date.now().toString(36)}`, label: 'New lift', measure: 'reps', loaded: true }])}
          >
            + Add a lift
          </button>
          <p className="tiny muted">
            Adding a lift starts it from the week you first give it a target — earlier weeks simply have nothing to
            compare, so it joins the composite once it has a baseline.
          </p>
          <div className="sheet-actions">
            <button className="btn primary full" onClick={() => { actions.saveLifts(editing); setEditing(null) }}>Save lifts</button>
          </div>
        </Sheet>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------- protocol */

function ProtocolCard() {
  const { state, actions } = useApp()
  const [editing, setEditing] = useState<AnchorProtocol | null>(null)
  const proto = state.anchorProtocols[state.anchorProtocols.length - 1]

  return (
    <Card
      title="Objective anchor"
      desc="A rare measured check whose only job is to catch drift in what ‘hard’ feels like. Editable, and past results stay valid."
      right={<button className="btn small ghost" onClick={() => setEditing(structuredClone(proto))}>Edit</button>}
    >
      <div className="small">{proto.name}</div>
      <ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {proto.fields.map((f) => (
          <li key={f.key}>{f.label} — {f.unit || 'value'}, {f.better} is better</li>
        ))}
      </ul>

      {editing && (
        <Sheet open title="Benchmark protocol" onClose={() => setEditing(null)}>
          <TextField label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
          <TextField label="Conditions note" value={editing.notes ?? ''} onChange={(v) => setEditing({ ...editing, notes: v })} multiline />
          <hr className="rule" />
          {editing.fields.map((f, i) => (
            <div key={i} className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="field-row">
                <TextField label="Label" value={f.label} onChange={(v) => setEditing({ ...editing, fields: editing.fields.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                <TextField label="Unit" value={f.unit} onChange={(v) => setEditing({ ...editing, fields: editing.fields.map((x, j) => (j === i ? { ...x, unit: v } : x)) })} />
              </div>
              <div className="row between">
                <Segmented
                  options={[{ value: 'higher', label: 'Higher is better' }, { value: 'lower', label: 'Lower is better' }]}
                  value={f.better}
                  onChange={(v) => setEditing({ ...editing, fields: editing.fields.map((x, j) => (j === i ? { ...x, better: v as 'higher' | 'lower' } : x)) })}
                  ariaLabel="Direction"
                />
                <button className="btn small danger" onClick={() => setEditing({ ...editing, fields: editing.fields.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            </div>
          ))}
          <button
            className="btn full"
            onClick={() => setEditing({ ...editing, fields: [...editing.fields, { key: `f${Date.now().toString(36)}`, label: 'New measure', unit: '', better: 'higher' }] })}
          >
            + Add a measure
          </button>
          <p className="tiny muted">
            Changing a protocol keeps every past result. Removing a measure just stops it counting toward the composite.
          </p>
          <div className="sheet-actions">
            <button className="btn primary full" onClick={() => { actions.saveAnchorProtocol(editing); setEditing(null) }}>Save protocol</button>
          </div>
        </Sheet>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------- thresholds */

function ThresholdsTab() {
  const { state, actions, metrics, canEdit } = useApp()
  const [domain, setDomain] = useState<Domain>('body')

  return (
    <>
      <Card
        title="Stage thresholds"
        desc={
          canEdit
            ? 'The numbers that decide every stage. Change one here and every stage recalculates immediately — no rebuild, no history rewritten.'
            : 'The numbers behind every stage on this record, shown so the whole calculation is inspectable.'
        }
      >
        <Segmented options={DOMAINS.map((d) => ({ value: d, label: DOMAIN_META[d].label }))} value={domain} onChange={(v) => setDomain(v as Domain)} ariaLabel="Domain" />
        <p className="tiny muted" style={{ margin: '10px 0 0' }}>
          {canEdit
            ? 'Defaults live in src/config/stages.ts; edits here are stored as overrides on top of them.'
            : 'Anything differing from the shipped default was deliberately recalibrated by the owner of this record.'}
        </p>
      </Card>

      {STAGE_MODEL[domain].map((stage) => (
        <Card key={stage.level} title={`Stage ${stage.level} — ${stage.name}`} desc={stage.blurb}>
          {stage.requirements.map((req) => {
            const target = resolveTarget(state, domain, stage.level, req)
            const overridden = target !== req.target
            const now = metrics[req.metric].value
            return (
              <div key={req.metric} className="req">
                <div className="grow">
                  <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
                    <span className="label">{METRICS[req.metric].label}</span>
                    <span className="tiny muted">now {formatMetric(req.metric, now)}</span>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <span className="tiny muted" style={{ width: 24 }}>{req.op}</span>
                    {canEdit ? (
                      <input
                        type="number"
                        step={METRICS[req.metric].decimals > 0 ? 0.1 : 1}
                        value={target}
                        style={{ maxWidth: 110, minHeight: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', padding: '4px 8px' }}
                        onChange={(e) => actions.setThreshold(domain, stage.level, req.metric, e.target.value === '' ? null : Number(e.target.value))}
                      />
                    ) : (
                      <span className="nums">{target}</span>
                    )}
                    <span className="tiny muted">{METRICS[req.metric].unit}</span>
                    {overridden && canEdit && (
                      <button className="linkbtn" onClick={() => actions.setThreshold(domain, stage.level, req.metric, null)}>
                        reset to {req.target}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      ))}
    </>
  )
}

/* ----------------------------------------------------------------- record */

function RecordTab() {
  const { state, actions, canEdit } = useApp()
  const [kind, setKind] = useState<'samples' | 'targets' | 'workouts' | 'impulses' | 'stress' | 'anchors' | 'focus'>('workouts')

  const sampleRows = [...Object.values(state.days)]
    .flatMap((d) => d.samples.map((sm) => ({ ...sm, date: d.date })))
    .sort((a, b) => b.at.localeCompare(a.at))

  return (
    <>
      <Card title="The raw record" desc="Everything is kept in its own units. Delete anything logged by mistake.">
        <Chips
          options={[
            { value: 'samples', label: `Attention samples (${sampleRows.length})` },
            { value: 'workouts', label: `Sessions (${state.workouts.length})` },
            { value: 'impulses', label: `Impulses (${state.impulses.length})` },
            { value: 'stress', label: `Stress (${state.stress.length})` },
            { value: 'targets', label: `Weekly targets (${state.weeklyTargets.length})` },
            { value: 'anchors', label: `Anchor checks (${state.anchors.length})` },
            { value: 'focus', label: `Focus Points (${state.focusPoints.length})` },
          ]}
          value={kind}
          onChange={setKind}
          ariaLabel="Record type"
        />
      </Card>

      <Card>
        {kind === 'samples' && (
          <>
            <p className="desc">
              One row per answered ping. These feed the sampled half of Attention coverage — the weight in brackets is
              the credit each answer carries.
            </p>
            <RecordList
              rows={sampleRows.map((sm) => {
                const opt = SAMPLE_OPTIONS.find((o) => o.state === sm.state)
                return {
                  id: sm.id,
                  title: `${opt?.label ?? sm.state} (${opt?.weight ?? 0})`,
                  meta: `${formatShort(sm.date)} ${formatTime(sm.at)} · ${slotLabel(sm.slot)}`,
                }
              })}
              onDelete={
                canEdit
                  ? (id) => {
                      const row = sampleRows.find((r) => r.id === id)
                      if (row) actions.removeSample(row.date, id)
                    }
                  : undefined
              }
            />
          </>
        )}
        {kind === 'workouts' && (
          <RecordList
            rows={[...state.workouts].reverse().map((w) => ({
              id: w.id,
              title: `${EXERCISE_KINDS.find((k) => k.kind === w.kind)?.label ?? w.kind} · ${formatDuration(w.durationMin)}`,
              meta: `${formatShort(w.date)} · RPE ${w.rpe} · load ${w.durationMin * w.rpe} · reserve after ${w.reserveAfter}${w.recoveryCost != null ? ` · next-day cost ${w.recoveryCost}` : ''}`,
            }))}
            onDelete={canEdit ? actions.deleteWorkout : undefined}
          />
        )}
        {kind === 'impulses' && (
          <RecordList
            rows={[...state.impulses].reverse().map((i) => ({
              id: i.id,
              title: `${IMPULSE_KINDS.find((k) => k.kind === i.kind)?.label ?? i.kind} · intensity ${i.intensity}`,
              meta: `${formatShort(i.date)} · urge ${formatDuration(i.urgeMinutes)} · lost ${formatDuration(i.disruptionMinutes)} · ${i.outcome}`,
            }))}
            onDelete={canEdit ? actions.deleteImpulse : undefined}
          />
        )}
        {kind === 'stress' && (
          <RecordList
            rows={[...state.stress].reverse().map((e) => ({
              id: e.id,
              title: `${e.label || 'Stress event'} · intensity ${e.intensity}`,
              meta: `${formatShort(e.date)} · impact ${e.functionalImpact} · back to baseline in ${formatDuration(e.recoveryMinutes)}${e.triggeredImpulse ? ' · triggered an impulse' : ''}`,
            }))}
            onDelete={canEdit ? actions.deleteStress : undefined}
          />
        )}
        {kind === 'targets' && (
          <RecordList
            rows={[...state.weeklyTargets].reverse().map((t) => ({
              id: t.weekStart,
              title: `Week of ${formatShort(t.weekStart)}`,
              meta: state.lifts
                .filter((l) => t.targets[l.key])
                .map((l) => {
                  const x = t.targets[l.key]
                  return `${l.label} ${x.sets}×${x.perSet}${l.measure === 'seconds' ? 's' : ''}${l.loaded && x.loadKg ? ` @ ${x.loadKg}kg` : ''} · rest ${x.restSec}s`
                })
                .join(' · '),
            }))}
            onDelete={canEdit ? actions.deleteWeeklyTarget : undefined}
          />
        )}
        {kind === 'anchors' && (
          <RecordList
            rows={[...state.anchors].reverse().map((b) => {
              const proto = state.anchorProtocols.find((p) => p.id === b.protocolId)
              return {
                id: b.id,
                title: formatShort(b.date),
                meta: proto
                  ? proto.fields.filter((f) => b.values[f.key] != null).map((f) => `${f.label} ${b.values[f.key]}${f.unit}`).join(' · ')
                  : Object.entries(b.values).map(([k, v]) => `${k} ${v}`).join(' · '),
              }
            })}
            onDelete={canEdit ? actions.deleteAnchor : undefined}
          />
        )}
        {kind === 'focus' && (
          <RecordList
            rows={[...state.focusPoints].reverse().map((f) => ({
              id: f.id,
              title: f.title,
              meta: `${formatShort(f.startedAt.slice(0, 10))} → ${f.endedAt ? formatShort(f.endedAt.slice(0, 10)) : 'current'}`,
            }))}
          />
        )}
      </Card>
    </>
  )
}

function RecordList({ rows, onDelete }: { rows: { id: string; title: string; meta: string }[]; onDelete?: (id: string) => void }) {
  if (!rows.length) return <p className="empty">Nothing logged yet.</p>
  return (
    <>
      {rows.slice(0, 60).map((r) => (
        <div key={r.id} className="list-item">
          <div className="grow">
            <div className="small">{r.title}</div>
            <div className="tiny muted">{r.meta}</div>
          </div>
          {onDelete && (
            <button className="linkbtn" onClick={() => onDelete(r.id)}>delete</button>
          )}
        </div>
      ))}
      {rows.length > 60 && <p className="tiny muted center">Showing the 60 most recent. Export for the full record.</p>}
    </>
  )
}

/* ----------------------------------------------------------------- backup */

function BackupCard() {
  const { state, actions } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)

  const applyImport = (text: string) => {
    try {
      const parsed = JSON.parse(text)
      if (!confirm('Replace everything currently stored with this backup?')) return
      actions.replaceState(parsed)
      setPaste(null)
      setMsg('Imported.')
    } catch {
      setMsg('That did not parse as a Capacity export.')
    }
  }

  return (
    <Card title="Backup & data" desc="Everything lives in this browser's storage. Export regularly — clearing site data would take it with it.">
      <div className="tiles" style={{ marginBottom: 12 }}>
        <Tile label="Tracking since" value={formatShort(state.settings.startDate)} />
        <Tile label="Days recorded" value={Object.keys(state.days).length} />
      </div>
      <div className="quick-grid">
        <button
          className="btn"
          onClick={async () => {
            const r = await exportBackup(state)
            setMsg(r.ok ? (r.how === 'saved' ? 'Saved.' : 'Downloaded.') : r.reason)
          }}
        >
          Export file
        </button>
        <button
          className="btn"
          onClick={async () => setMsg((await copyExport(state)) ? 'Full backup copied to the clipboard.' : 'Could not reach the clipboard here.')}
        >
          Copy backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import file</button>
        <button className="btn" onClick={() => setPaste(paste == null ? '' : null)}>Paste backup</button>
      </div>
      {paste != null && (
        <div style={{ marginTop: 12 }}>
          <TextField label="Paste an exported backup" value={paste} onChange={setPaste} multiline placeholder='{ "version": 1, ... }' />
          <button className="btn full" disabled={!paste.trim()} onClick={() => applyImport(paste)}>Replace everything with this</button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) applyImport(await f.text())
          e.target.value = ''
        }}
      />
      <hr className="rule" />
      <div className="quick-grid">
        <button
          className="btn"
          onClick={() => {
            if (!confirm('Replace all current data with 12 weeks of synthetic sample data? Use this only to preview the app.')) return
            actions.replaceState(makeSampleState())
            setMsg('Sample data loaded — erase it before you start recording for real.')
          }}
        >
          Load sample data
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (!confirm('Erase everything and start fresh? This cannot be undone.')) return
            actions.replaceState(createInitialState(today()))
            setMsg('Erased.')
          }}
        >
          Erase all
        </button>
      </div>
      {msg && <p className="tiny muted" style={{ margin: '10px 0 0' }}>{msg}</p>}
    </Card>
  )
}
