import { useMemo, useState } from 'react'
import { SAMPLE_OPTIONS } from '../config/scales'
import { DOMAINS, DOMAIN_META } from '../config/stages'
import { EXERCISE_KINDS } from '../config/taxonomy'
import {
  AnchorForm, EveningForm, FocusPointForm, ImpulseForm, MorningForm, StressForm,
  WeeklyForm, WeeklyTargetForm, WorkoutForm,
} from '../components/forms'
import { BottleneckLine, DOMAIN_COLOR, StageHeadline } from '../components/stage'
import { Card, Empty, ScaleInput, Sheet } from '../components/ui'
import { addDays, daysBetween, formatDay, formatDuration, formatShort, fromISODate, today, weekStart } from '../domain/date'
import { duePings, nextPing, slotLabel } from '../domain/pings'
import { calibrationProgress, isCalibrating } from '../domain/stages'
import { useApp } from '../store/state'
import type { Domain, SampleState } from '../domain/types'

type SheetKind =
  | { k: 'morning' } | { k: 'evening' } | { k: 'workout' } | { k: 'impulse' } | { k: 'stress' }
  | { k: 'weekly'; week: string } | { k: 'target'; week: string } | { k: 'anchor' } | { k: 'focus' }
  | { k: 'recovery'; id: string }

export function Today({ goToStages }: { goToStages: (d: Domain) => void }) {
  const { state, day, evals, actions, activeFocusPoint, canEdit, sharedAsOf } = useApp()
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [extraPing, setExtraPing] = useState(false)
  const date = today()
  const d = day(date)
  const close = () => setSheet(null)

  const due = duePings(state, d, date)
  const upcoming = nextPing(state, d, date)
  const calibrating = isCalibrating(state)
  const cal = calibrationProgress(state)

  /*
   * Weekly reserve is a Sunday question: the week runs Monday to Sunday and is
   * rated on the day it ends, while it is still fresh. A missed Sunday is never
   * lost — an unrated finished week keeps offering itself until it is answered.
   */
  const weeklyDue = useMemo(() => {
    const thisWeek = weekStart(date)
    const lastWeek = addDays(thisWeek, -7)
    const has = (w: string) => state.weekly.some((x) => x.weekStart === w)
    const isSunday = fromISODate(date).getDay() === 0
    const missed = !has(lastWeek) && daysBetween(state.settings.startDate, lastWeek) >= 0 ? lastWeek : null
    const current = has(thisWeek) ? null : thisWeek
    return { missed, current, isSunday, dueOn: addDays(thisWeek, 6) }
  }, [state.weekly, state.settings.startDate, date])

  /*
   * The intensity target opens the week the reserve question closes: set Monday,
   * rated Sunday. An unset target from a past week keeps offering itself.
   */
  const targetDue = useMemo(() => {
    const thisWeek = weekStart(date)
    const lastWeek = addDays(thisWeek, -7)
    const has = (w: string) => state.weeklyTargets.some((t) => t.weekStart === w)
    return {
      current: has(thisWeek) ? null : thisWeek,
      missed: !has(lastWeek) && daysBetween(state.settings.startDate, lastWeek) >= 0 ? lastWeek : null,
      set: state.weeklyTargets.find((t) => t.weekStart === thisWeek) ?? null,
    }
  }, [state.weeklyTargets, state.settings.startDate, date])

  const lastAnchor = state.anchors[state.anchors.length - 1]
  const anchorDue =
    !lastAnchor || daysBetween(lastAnchor.date, date) >= state.settings.anchorIntervalDays
  const protocol = state.anchorProtocols[state.anchorProtocols.length - 1]

  /* a session logged yesterday whose next-day cost has not been filled in */
  const yesterdaysSession = useMemo(() => {
    const y = addDays(date, -1)
    return state.workouts.find((w) => w.date === y && w.recoveryCost == null) ?? null
  }, [state.workouts, date])

  /* Nothing recorded at all: someone opening this for the first time. */
  const firstRun =
    !Object.keys(state.days).length &&
    !state.workouts.length &&
    !state.weekly.length &&
    !state.focusPoints.length

  return (
    <>
      {!canEdit && (
        <div className="banner" style={{ background: 'var(--accent-wash)', borderColor: 'rgba(53,224,139,0.3)' }}>
          <strong>Shared record — read only.</strong> You are looking at someone else's tracker, current to{' '}
          {sharedAsOf ? formatShort(sharedAsOf) : 'the day it was published'}. Nothing here can be changed and nothing
          is saved to your browser.
        </div>
      )}
      {firstRun && canEdit && <FirstRun />}
      {calibrating && canEdit && (
        <div className="banner">
          <strong>Calibration — week {cal.week} of {cal.total}.</strong> Stages are shown so you can see the machinery
          working, but the thresholds are first guesses. Around {formatShort(cal.endsOn)} there will be enough of your own
          data to set them properly.
        </div>
      )}

      {/* ------------------------------------------------------ focus point */}
      <Card
        title="Focus Point"
        right={canEdit ? <button className="btn small ghost" onClick={() => setSheet({ k: 'focus' })}>{activeFocusPoint ? 'Change' : 'Set'}</button> : null}
      >
        {activeFocusPoint ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{activeFocusPoint.title}</div>
            {activeFocusPoint.why && <p className="small muted" style={{ margin: '4px 0 0' }}>{activeFocusPoint.why}</p>}
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>
              Held for {daysBetween(activeFocusPoint.startedAt.slice(0, 10), date)} days
            </p>
          </>
        ) : (
          <Empty>Set the one problem you want your mind to keep returning to.</Empty>
        )}
      </Card>

      {/* ------------------------------------------------------------ ping */}
      {!canEdit ? null : due.length > 0 || extraPing ? (
        <PingCard
          label={due.length > 0 ? due[0].label : 'Extra check'}
          onAnswer={(answer) => {
            actions.addSample(date, { slot: due.length > 0 ? due[0].slot : 'manual', state: answer })
            setExtraPing(false)
          }}
          onCancel={due.length > 0 ? undefined : () => setExtraPing(false)}
        />
      ) : (
        <Card className="tight">
          <div className="row between">
            <div className="grow">
              <div className="small">
                <span className="done-mark">✓</span> Attention samples answered — {d.samples.length} today
              </div>
              <SampleBreakdown samples={d.samples} />
              {upcoming && <div className="tiny muted">Next around {clock(upcoming.at)} · {slotLabel(upcoming.slot)}</div>}
            </div>
            <button className="btn small ghost" onClick={() => setExtraPing(true)} title="Answer one extra attention sample now">
              + sample
            </button>
          </div>
        </Card>
      )}

      {!canEdit && <LatestEntry />}

      {/* -------------------------------------------------------- check-ins */}
      {canEdit && (
      <Card title="Daily check-ins" desc="Two short moments. Everything else is optional.">
        <CheckRow
          label="Morning"
          detail={d.morning ? `clarity ${d.morning.clarity} · baseline ${d.morning.emotionalBaseline}` : 'clarity, emotional baseline'}
          done={!!d.morning}
          onClick={() => setSheet({ k: 'morning' })}
        />
        <CheckRow
          label="End of work"
          detail={d.evening ? `clarity ${d.evening.clarity} · coverage ${d.evening.coverageReported}% · continuity ${d.evening.fpContinuity}` : 'clarity + immersion reflection'}
          done={!!d.evening}
          onClick={() => setSheet({ k: 'evening' })}
        />
        {targetDue.current && (
          <CheckRow
            label={`Intensity target — ${weekLabel(targetDue.current)}`}
            detail={
              state.weeklyTargets.length
                ? 'Carry last week forward, or raise it'
                : 'Five lifts — this first one becomes your baseline'
            }
            done={false}
            onClick={() => setSheet({ k: 'target', week: targetDue.current! })}
          />
        )}
        {targetDue.set && (
          <CheckRow
            label={`Intensity target — ${weekLabel(targetDue.set.weekStart)}`}
            detail={targetSummary(state.lifts, targetDue.set)}
            done
            onClick={() => setSheet({ k: 'target', week: targetDue.set!.weekStart })}
          />
        )}
        {targetDue.missed && (
          <CheckRow
            label={`Intensity target — ${weekLabel(targetDue.missed)}`}
            detail="Last week never had a target set"
            done={false}
            onClick={() => setSheet({ k: 'target', week: targetDue.missed! })}
          />
        )}
        {weeklyDue.missed && (
          <CheckRow
            label={`Weekly reserve — ${weekLabel(weeklyDue.missed)}`}
            detail="Last week was never rated"
            done={false}
            onClick={() => setSheet({ k: 'weekly', week: weeklyDue.missed! })}
          />
        )}
        {weeklyDue.current && (
          <CheckRow
            label={`Weekly reserve — ${weekLabel(weeklyDue.current)}`}
            detail={
              weeklyDue.isSunday
                ? 'Due today — one question about the week you just lived'
                : `Due Sunday ${formatShort(weeklyDue.dueOn)} — you can answer early`
            }
            done={false}
            onClick={() => setSheet({ k: 'weekly', week: weeklyDue.current! })}
          />
        )}
        {anchorDue && protocol && (
          <CheckRow
            label="Objective anchor"
            detail={
              lastAnchor
                ? `Last measured ${daysBetween(lastAnchor.date, date)} days ago — a check on whether "hard" still means what it did`
                : 'Every three months. Set the first measurement.'
            }
            done={false}
            onClick={() => setSheet({ k: 'anchor' })}
          />
        )}
        {yesterdaysSession && (
          <CheckRow
            label="Yesterday's session cost"
            detail={`${EXERCISE_KINDS.find((k) => k.kind === yesterdaysSession.kind)?.label} · ${formatDuration(yesterdaysSession.durationMin)}`}
            done={false}
            onClick={() => setSheet({ k: 'recovery', id: yesterdaysSession.id })}
          />
        )}
      </Card>
      )}

      {/* -------------------------------------------------------- quick log */}
      {canEdit && (
      <Card title="Log an event" desc="Only when it actually happens — these are unscheduled by nature.">
        <div className="quick-grid three">
          <button className="btn" onClick={() => setSheet({ k: 'workout' })}>Exercise</button>
          <button className="btn" onClick={() => setSheet({ k: 'impulse' })}>Impulse</button>
          <button className="btn" onClick={() => setSheet({ k: 'stress' })}>Stress event</button>
        </div>
        <TodayCounts />
      </Card>
      )}

      {/* ----------------------------------------------------------- stages */}
      {DOMAINS.map((dom) => (
        <Card key={dom} className="tight">
          <button
            onClick={() => goToStages(dom)}
            style={{ background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left' }}
          >
            <StageHeadline ev={evals[dom]} />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>{DOMAIN_META[dom].question}</p>
            <BottleneckLine ev={evals[dom]} />
          </button>
        </Card>
      ))}

      {/* ----------------------------------------------------------- sheets */}
      <Sheet open={sheet?.k === 'morning'} title="Morning check-in" onClose={close}>
        <MorningForm date={date} onDone={close} />
      </Sheet>
      <Sheet open={sheet?.k === 'evening'} title="End of work" onClose={close}>
        <EveningForm date={date} onDone={close} />
      </Sheet>
      <Sheet open={sheet?.k === 'workout'} title="Log exercise" onClose={close}>
        <WorkoutForm onDone={close} />
      </Sheet>
      <Sheet open={sheet?.k === 'impulse'} title="Log impulse" onClose={close}>
        <ImpulseForm onDone={close} />
      </Sheet>
      <Sheet open={sheet?.k === 'stress'} title="Log stress event" onClose={close}>
        <StressForm onDone={close} />
      </Sheet>
      <Sheet open={sheet?.k === 'focus'} title="Focus Point" onClose={close}>
        <FocusPointForm onDone={close} />
      </Sheet>
      {sheet?.k === 'weekly' && (
        <Sheet open title={`Week ${weekLabel(sheet.week)}`} onClose={close}>
          <WeeklyForm weekStart={sheet.week} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'target' && (
        <Sheet open title={`Intensity target · ${weekLabel(sheet.week)}`} onClose={close}>
          <WeeklyTargetForm weekStart={sheet.week} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'anchor' && protocol && (
        <Sheet open title={protocol.name} onClose={close}>
          <AnchorForm protocol={protocol} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'recovery' && <RecoverySheet id={sheet.id} onClose={close} />}
    </>
  )
}

/* ------------------------------------------------------------ sub-pieces */

function PingCard({ label, onAnswer, onCancel }: { label: string; onAnswer: (s: SampleState) => void; onCancel?: () => void }) {
  return (
    <Card
      title={`${label} — what was your mind on?`}
      desc="Answer for the moment just before you opened this. One tap."
      right={onCancel ? <button className="btn small ghost" onClick={onCancel}>Cancel</button> : undefined}
    >
      <div className="stack" style={{ gap: 6 }}>
        {SAMPLE_OPTIONS.map((o) => (
          <button key={o.state} className="btn full" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }} onClick={() => onAnswer(o.state)}>
            <span>{o.label}</span>
            <span className="tiny muted">{o.hint}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

/**
 * What a visitor sees in place of the check-in list: the most recent day that
 * actually has entries, with its readings, rather than an empty "today" that
 * only means the snapshot is older than the calendar.
 */
function LatestEntry() {
  const { state } = useApp()
  const latest = Object.values(state.days)
    .filter((d) => d.morning || d.evening)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop()
  if (!latest) return null
  return (
    <Card title={`Latest entry — ${formatDay(latest.date)}`}>
      {latest.morning && (
        <div className="list-item">
          <span className="grow">
            <span className="small" style={{ fontWeight: 550 }}>Morning</span>
            <br />
            <span className="tiny muted">
              clarity {latest.morning.clarity} · baseline {latest.morning.emotionalBaseline}
              {latest.morning.sleepHours != null && ` · ${latest.morning.sleepHours}h sleep`}
            </span>
          </span>
        </div>
      )}
      {latest.evening && (
        <div className="list-item">
          <span className="grow">
            <span className="small" style={{ fontWeight: 550 }}>End of work</span>
            <br />
            <span className="tiny muted">
              clarity {latest.evening.clarity} · coverage {latest.evening.coverageReported}% · continuity{' '}
              {latest.evening.fpContinuity} · slow thinking {latest.evening.slowThinking} · automatic return{' '}
              {latest.evening.automaticReturn}
            </span>
          </span>
        </div>
      )}
      {latest.samples.length > 0 && (
        <div className="list-item">
          <span className="grow">
            <span className="small" style={{ fontWeight: 550 }}>Attention samples</span>
            <br />
            <SampleBreakdown samples={latest.samples} />
          </span>
        </div>
      )}
    </Card>
  )
}

/**
 * Shown only while the record is completely empty. It disappears for good the
 * moment anything is logged, so it costs a returning user nothing.
 */
function FirstRun() {
  return (
    <Card title="What this is">
      <p className="small" style={{ margin: '0 0 12px', color: 'var(--ink-2)' }}>
        Three capacities, tracked separately over years — never averaged into one score, because the
        differences between them are the whole point.
      </p>
      <div className="stack" style={{ gap: 10 }}>
        {DOMAINS.map((d) => (
          <div key={d} className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
            <span className="dot" style={{ background: DOMAIN_COLOR[d], marginTop: 6 }} />
            <div>
              <div className="small" style={{ fontWeight: 600 }}>{DOMAIN_META[d].label}</div>
              <div className="tiny muted">{DOMAIN_META[d].question}</div>
            </div>
          </div>
        ))}
      </div>
      <hr className="rule" />
      <p className="tiny muted" style={{ margin: 0 }}>
        Start with two things: name a <strong style={{ color: 'var(--ink-2)' }}>Focus Point</strong> — the one problem
        you want your mind returning to — then do the morning check-in. Everything else appears as it becomes
        relevant. Nothing leaves this device; back up from Data when you have a few weeks in.
      </p>
    </Card>
  )
}

/** Says what the day's samples actually were, rather than only how many. */
function SampleBreakdown({ samples }: { samples: { state: SampleState }[] }) {
  if (!samples.length) return null
  const counts = SAMPLE_OPTIONS.map((o) => ({ label: o.label, n: samples.filter((s) => s.state === o.state).length })).filter((c) => c.n > 0)
  return (
    <div className="tiny muted">
      {counts.map((c) => `${c.n} ${c.label.toLowerCase()}`).join(' · ')}
    </div>
  )
}

function CheckRow({ label, detail, done, onClick }: { label: string; detail: string; done: boolean; onClick: () => void }) {
  return (
    <button className="list-item" style={{ background: 'none', border: 0, borderTop: '1px solid var(--border)', width: '100%', textAlign: 'left', padding: '11px 0' }} onClick={onClick}>
      <span className={done ? 'done-mark' : undefined} style={{ width: 16 }} aria-hidden="true">{done ? '✓' : ''}</span>
      <span className="grow">
        <span style={{ fontSize: 14, fontWeight: done ? 500 : 560 }}>{label}</span>
        <br />
        <span className="tiny muted">{detail}</span>
      </span>
      <span className="muted small">{done ? 'edit' : '›'}</span>
    </button>
  )
}

function TodayCounts() {
  const { state } = useApp()
  const date = today()
  const w = state.workouts.filter((x) => x.date === date).length
  const i = state.impulses.filter((x) => x.date === date)
  const s = state.stress.filter((x) => x.date === date).length
  if (!w && !i.length && !s) return null
  const lost = i.reduce((a, x) => a + x.disruptionMinutes, 0)
  return (
    <p className="tiny muted" style={{ margin: '10px 0 0' }}>
      Today: {w} session{w === 1 ? '' : 's'} · {i.length} impulse{i.length === 1 ? '' : 's'}
      {lost > 0 && ` (${formatDuration(lost)} lost)`} · {s} stress event{s === 1 ? '' : 's'}
    </p>
  )
}

function RecoverySheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, actions } = useApp()
  const w = state.workouts.find((x) => x.id === id)
  const [v, setV] = useState<number | null>(null)
  if (!w) return null
  return (
    <Sheet open title="Yesterday's session" onClose={onClose}>
      <p className="desc">
        {EXERCISE_KINDS.find((k) => k.kind === w.kind)?.label} · {formatDuration(w.durationMin)} · RPE {w.rpe}
      </p>
      <ScaleInput scale="recoveryCost" value={v} onChange={setV} />
      <div className="sheet-actions row" style={{ gap: 8 }}>
        <button className="btn ghost grow" onClick={onClose}>Skip</button>
        <button className="btn primary grow" disabled={v == null} onClick={() => { actions.updateWorkout(id, { recoveryCost: v! }); onClose() }}>
          Save
        </button>
      </div>
    </Sheet>
  )
}

/** Names the Monday-to-Sunday week being rated, so there is no ambiguity. */
function weekLabel(mondayISO: string) {
  return `${formatShort(mondayISO)} – ${formatShort(addDays(mondayISO, 6))}`
}

/** "3×10 @ 40kg · plank 3×45s", so the row says what this week actually asks for. */
function targetSummary(lifts: { key: string; label: string; measure: 'reps' | 'seconds'; loaded: boolean }[], t: { targets: Record<string, { sets: number; perSet: number; loadKg?: number }> }) {
  const parts = lifts
    .map((l) => {
      const x = t.targets[l.key]
      if (!x) return null
      const unit = l.measure === 'seconds' ? 's' : ''
      return `${l.label} ${x.sets}×${x.perSet}${unit}${l.loaded && x.loadKg ? ` @ ${x.loadKg}kg` : ''}`
    })
    .filter(Boolean)
  return parts.join(' · ')
}

function clock(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
