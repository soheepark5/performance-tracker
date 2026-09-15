import { useEffect, useMemo, useState } from 'react'
import { SAMPLE_OPTIONS } from '../config/scales'
import { DOMAINS, DOMAIN_META } from '../config/stages'
import { EXERCISE_KINDS, IMPULSE_KINDS, IMPULSE_OUTCOMES, formatUrge } from '../config/taxonomy'
import {
  AnchorForm, EveningForm, FocusPointForm, ImpulseForm, MorningForm, SampleForm, StressForm,
  WeeklyForm, WeeklyTargetForm, WorkoutForm,
} from '../components/forms'
import { DOMAIN_COLOR, StageProgress } from '../components/stage'
import { Card, Empty, ScaleInput, Sheet } from '../components/ui'
import {
  addDays, daysBetween, formatDay, formatDuration, formatShort, formatTime, fromISODate, today, weekStart,
} from '../domain/date'
import { duePings, nextPing, slotLabel, type DuePing, type PingSlot } from '../domain/pings'
import { calibrationProgress, isCalibrating } from '../domain/stages'
import { useApp } from '../store/state'
import type { Domain, SampleState } from '../domain/types'

type SheetKind =
  | { k: 'morning' } | { k: 'evening' }
  | { k: 'workout'; id?: string } | { k: 'impulse'; id?: string } | { k: 'stress'; id?: string }
  | { k: 'weekly'; week: string } | { k: 'target'; week: string } | { k: 'anchor' } | { k: 'focus' }
  | { k: 'recovery'; id: string } | { k: 'sample'; id: string; date: string }

export function Today({ goToStages }: { goToStages: (d: Domain) => void }) {
  const { state, day, evals, activeFocusPoint, canEdit, sharedAsOf } = useApp()
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [extraPing, setExtraPing] = useState(false)

  /*
   * The day being looked at. null means "follow the calendar", so the screen
   * rolls over at midnight by itself instead of getting stuck on yesterday.
   */
  const now = today()
  const [viewDate, setViewDate] = useState<string | null>(null)
  const date = viewDate ?? now
  const isToday = date === now
  const d = day(date)
  const td = day(now)
  const close = () => setSheet(null)

  const due = duePings(state, td, now)
  const upcoming = nextPing(state, td, now)
  const calibrating = isCalibrating(state)
  const cal = calibrationProgress(state)

  /*
   * Weekly reserve is a Sunday question: the week runs Monday to Sunday and is
   * rated on the day it ends, while it is still fresh. A missed Sunday is never
   * lost — an unrated finished week keeps offering itself until it is answered.
   */
  const weeklyDue = useMemo(() => {
    const thisWeek = weekStart(now)
    const lastWeek = addDays(thisWeek, -7)
    const has = (w: string) => state.weekly.some((x) => x.weekStart === w)
    const isSunday = fromISODate(now).getDay() === 0
    const missed = !has(lastWeek) && daysBetween(state.settings.startDate, lastWeek) >= 0 ? lastWeek : null
    const current = has(thisWeek) ? null : thisWeek
    return { missed, current, isSunday, dueOn: addDays(thisWeek, 6) }
  }, [state.weekly, state.settings.startDate, now])

  /*
   * The intensity target opens the week the reserve question closes: set Monday,
   * rated Sunday. An unset target from a past week keeps offering itself.
   */
  const targetDue = useMemo(() => {
    const thisWeek = weekStart(now)
    const lastWeek = addDays(thisWeek, -7)
    const has = (w: string) => state.weeklyTargets.some((t) => t.weekStart === w)
    return {
      current: has(thisWeek) ? null : thisWeek,
      missed: !has(lastWeek) && daysBetween(state.settings.startDate, lastWeek) >= 0 ? lastWeek : null,
      set: state.weeklyTargets.find((t) => t.weekStart === thisWeek) ?? null,
    }
  }, [state.weeklyTargets, state.settings.startDate, now])

  const lastAnchor = state.anchors[state.anchors.length - 1]
  const anchorDue = !lastAnchor || daysBetween(lastAnchor.date, now) >= state.settings.anchorIntervalDays
  const protocol = state.anchorProtocols[state.anchorProtocols.length - 1]

  /* a session logged yesterday whose next-day cost has not been filled in */
  const yesterdaysSession = useMemo(() => {
    const y = addDays(now, -1)
    return state.workouts.find((w) => w.date === y && w.recoveryCost == null) ?? null
  }, [state.workouts, now])

  /* Nothing recorded at all: someone opening this for the first time. */
  const firstRun =
    !Object.keys(state.days).length &&
    !state.workouts.length &&
    !state.weekly.length &&
    !state.focusPoints.length

  const eventTitle = (noun: string, id?: string) => {
    if (id) return `Edit ${noun}`
    return isToday ? `Log ${noun}` : `Log ${noun} · ${formatShort(date)}`
  }

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
      {calibrating && canEdit && isToday && (
        <div className="banner">
          <strong>Calibration — week {cal.week} of {cal.total}.</strong> Stages are shown so you can see the machinery
          working, but the thresholds are first guesses. Around {formatShort(cal.endsOn)} there will be enough of your own
          data to set them properly.
        </div>
      )}

      {canEdit && <OpenImpulses onFinish={(id) => setSheet({ k: 'impulse', id })} />}

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
              Held for {daysBetween(activeFocusPoint.startedAt.slice(0, 10), now)} days
            </p>
          </>
        ) : (
          <Empty>Set the one problem you want your mind to keep returning to.</Empty>
        )}
      </Card>

      {/* ---------------------------------------------------------- the day */}
      {canEdit && (
        <DayBar
          date={date}
          min={state.settings.startDate}
          onChange={(v) => {
            setViewDate(v === today() ? null : v)
            setExtraPing(false)
          }}
        />
      )}

      {/* ------------------------------------------------------- attention */}
      {canEdit && (
        <AttentionCard
          date={date}
          isToday={isToday}
          due={isToday ? due : []}
          upcoming={isToday ? upcoming : null}
          extraPing={isToday && extraPing}
          setExtraPing={setExtraPing}
          onEdit={(id) => setSheet({ k: 'sample', id, date })}
        />
      )}

      {!canEdit && <LatestEntry />}

      {/* -------------------------------------------------------- check-ins */}
      {canEdit && (
        <Card
          title={isToday ? 'Daily check-ins' : `Check-ins — ${formatDay(date)}`}
          desc={isToday ? 'Two short moments. Everything else is optional.' : 'Filling in or correcting a past day.'}
        >
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
          {isToday && targetDue.current && (
            <CheckRow
              label={`Intensity target — ${weekLabel(targetDue.current)}`}
              detail={state.weeklyTargets.length ? 'Carry last week forward, or raise it' : 'Five lifts — this first one becomes your baseline'}
              done={false}
              onClick={() => setSheet({ k: 'target', week: targetDue.current! })}
            />
          )}
          {isToday && targetDue.set && (
            <CheckRow
              label={`Intensity target — ${weekLabel(targetDue.set.weekStart)}`}
              detail={targetSummary(state.lifts, targetDue.set)}
              done
              onClick={() => setSheet({ k: 'target', week: targetDue.set!.weekStart })}
            />
          )}
          {isToday && targetDue.missed && (
            <CheckRow
              label={`Intensity target — ${weekLabel(targetDue.missed)}`}
              detail="Last week never had a target set"
              done={false}
              onClick={() => setSheet({ k: 'target', week: targetDue.missed! })}
            />
          )}
          {isToday && weeklyDue.missed && (
            <CheckRow
              label={`Weekly reserve — ${weekLabel(weeklyDue.missed)}`}
              detail="Last week was never rated"
              done={false}
              onClick={() => setSheet({ k: 'weekly', week: weeklyDue.missed! })}
            />
          )}
          {isToday && weeklyDue.current && (
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
          {isToday && anchorDue && protocol && (
            <CheckRow
              label="Objective anchor"
              detail={
                lastAnchor
                  ? `Last measured ${daysBetween(lastAnchor.date, now)} days ago — a check on whether "hard" still means what it did`
                  : 'Every three months. Set the first measurement.'
              }
              done={false}
              onClick={() => setSheet({ k: 'anchor' })}
            />
          )}
          {isToday && yesterdaysSession && (
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
        <Card
          title="Log an event"
          desc={isToday ? 'Only when it actually happens — these are unscheduled by nature.' : `Logged to ${formatDay(date)} unless you change the time.`}
        >
          <div className="quick-grid three">
            <button className="btn" onClick={() => setSheet({ k: 'workout' })}>Exercise</button>
            <button className="btn" onClick={() => setSheet({ k: 'impulse' })}>Impulse</button>
            <button className="btn" onClick={() => setSheet({ k: 'stress' })}>Stress event</button>
          </div>
          <DayEvents date={date} onEdit={setSheet} />
        </Card>
      )}

      {/* ----------------------------------------------------------- stages */}
      <Card>
        {DOMAINS.map((dom) => (
          <button key={dom} className="stage-pick" onClick={() => goToStages(dom)}>
            <StageProgress ev={evals[dom]} />
          </button>
        ))}
      </Card>

      {/* ----------------------------------------------------------- sheets */}
      {sheet?.k === 'morning' && (
        <Sheet open title={isToday ? 'Morning check-in' : `Morning · ${formatDay(date)}`} onClose={close}>
          <MorningForm date={date} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'evening' && (
        <Sheet open title={isToday ? 'End of work' : `End of work · ${formatDay(date)}`} onClose={close}>
          <EveningForm date={date} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'workout' && (
        <Sheet open key={`workout-${sheet.id ?? 'new'}`} title={eventTitle('exercise', sheet.id)} onClose={close}>
          <WorkoutForm date={date} editId={sheet.id} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'impulse' && (
        <Sheet
          open
          key={`impulse-${sheet.id ?? 'new'}`}
          title={sheet.id && state.impulses.find((i) => i.id === sheet.id)?.open ? 'Finish impulse' : eventTitle('impulse', sheet.id)}
          onClose={close}
        >
          <ImpulseForm date={date} editId={sheet.id} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'stress' && (
        <Sheet open key={`stress-${sheet.id ?? 'new'}`} title={eventTitle('stress event', sheet.id)} onClose={close}>
          <StressForm date={date} editId={sheet.id} onDone={close} />
        </Sheet>
      )}
      {sheet?.k === 'focus' && (
        <Sheet open title="Focus Point" onClose={close}>
          <FocusPointForm onDone={close} />
        </Sheet>
      )}
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
      {sheet?.k === 'sample' && (
        <Sheet open key={`sample-${sheet.id}`} title="Edit attention sample" onClose={close}>
          <SampleForm date={sheet.date} id={sheet.id} onDone={close} />
        </Sheet>
      )}
    </>
  )
}

/* ------------------------------------------------------------ sub-pieces */

/**
 * Which day the check-ins and events below belong to. Tapping the date opens the
 * native picker; the arrows step a day at a time. Tracking start and today are
 * the limits, because data outside them would not reach any metric.
 */
function DayBar({ date, min, onChange }: { date: string; min: string; onChange: (d: string) => void }) {
  const now = today()
  const isToday = date === now
  return (
    <>
      <div className="daybar">
        <button className="btn small ghost" disabled={date <= min} onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <div className={`daybar-label${isToday ? '' : ' past'}`}>
          <span>{isToday ? `Today · ${formatDay(date)}` : formatDay(date)}</span>
          <input
            type="date"
            value={date}
            min={min}
            max={now}
            aria-label="Choose a day"
            onClick={(e) => {
              try {
                e.currentTarget.showPicker()
              } catch {
                /* a tap on the input opens the native picker anyway */
              }
            }}
            onChange={(e) => {
              const v = e.target.value
              if (v && v >= min && v <= now) onChange(v)
            }}
          />
        </div>
        <button className="btn small ghost" disabled={isToday} onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
          ›
        </button>
      </div>
      {!isToday && (
        <p className="tiny muted daybar-sub">
          Viewing a past day.{' '}
          <button className="linkbtn" onClick={() => onChange(now)}>Back to today</button>
        </p>
      )}
    </>
  )
}

/** Urges logged at their start and not yet finished. Global, so a forgotten one from yesterday still surfaces. */
function OpenImpulses({ onFinish }: { onFinish: (id: string) => void }) {
  const { state } = useApp()
  const [, tick] = useState(0)
  useEffect(() => {
    // Keep "12 min ago" honest while the screen is open.
    const t = window.setInterval(() => tick((x) => x + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const open = state.impulses.filter((i) => i.open).sort((a, b) => a.at.localeCompare(b.at))
  if (!open.length) return null
  return (
    <Card
      className="open-impulse"
      title={open.length === 1 ? 'Urge in progress' : `${open.length} urges in progress`}
      desc="Finish it once it is over — the urge duration is filled in from the time that has passed."
    >
      {open.map((i) => {
        const mins = Math.max(1, Math.round((Date.now() - new Date(i.at).getTime()) / 60_000))
        return (
          <div key={i.id} className="row between" style={{ padding: '6px 0' }}>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>{IMPULSE_KINDS.find((k) => k.kind === i.kind)?.label ?? i.kind}</div>
              <div className="tiny muted">
                started {i.date === today() ? '' : `${formatShort(i.date)} `}{formatTime(i.at)} · {formatDuration(mins)} ago
              </div>
            </div>
            <button className="btn small primary" onClick={() => onFinish(i.id)}>It's over</button>
          </div>
        )
      })}
    </Card>
  )
}

type DayItem = { at: string; key: string; title: string; detail: string; open?: boolean; sheet: SheetKind }

/** Everything logged on the viewed day, oldest first. Tap any line to edit it. */
function DayEvents({ date, onEdit }: { date: string; onEdit: (s: SheetKind) => void }) {
  const { state } = useApp()

  const items: DayItem[] = [
    ...state.workouts
      .filter((w) => w.date === date)
      .map((w): DayItem => ({
        at: w.at,
        key: `w-${w.id}`,
        title: `${EXERCISE_KINDS.find((k) => k.kind === w.kind)?.label ?? w.kind} · ${formatDuration(w.durationMin)}`,
        detail: `RPE ${w.rpe} · reserve after ${w.reserveAfter}`,
        sheet: { k: 'workout', id: w.id },
      })),
    ...state.impulses
      .filter((i) => i.date === date)
      .map((i): DayItem => ({
        at: i.at,
        key: `i-${i.id}`,
        title: `${IMPULSE_KINDS.find((k) => k.kind === i.kind)?.label ?? i.kind}${i.intensity != null ? ` · ${i.intensity}/10` : ''}`,
        detail: i.open
          ? 'still open — tap to finish'
          : `urge ${formatUrge(i.urgeMinutes)} · lost ${formatDuration(i.disruptionMinutes ?? 0)} · ${IMPULSE_OUTCOMES.find((o) => o.value === i.outcome)?.label.toLowerCase() ?? ''}`,
        open: i.open,
        sheet: { k: 'impulse', id: i.id },
      })),
    ...state.stress
      .filter((e) => e.date === date)
      .map((e): DayItem => ({
        at: e.at,
        key: `s-${e.id}`,
        title: e.label || 'Stress event',
        detail: `intensity ${e.intensity} · impact ${e.functionalImpact} · ${formatDuration(e.recoveryMinutes)} to baseline`,
        sheet: { k: 'stress', id: e.id },
      })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  if (!items.length) {
    return (
      <p className="tiny muted" style={{ margin: '10px 0 0' }}>
        Nothing logged {date === today() ? 'today' : 'on this day'} yet.
      </p>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      {items.map((it) => (
        <button key={it.key} className="event-row" onClick={() => onEdit(it.sheet)}>
          <span className="when">{formatTime(it.at)}</span>
          <span className="what">
            {it.title}
            <small>{it.detail}</small>
          </span>
          <span className={it.open ? 'small' : 'muted small'} style={it.open ? { color: 'var(--warning)' } : undefined}>
            {it.open ? 'finish' : 'edit'}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Attention samples for the viewed day, in one place: the question when a ping
 * is due, a clear confirmation once it is answered, and every recorded answer
 * underneath — tap one to change or delete it. Past days list their samples
 * but never ask: a sample is about the moment it is answered.
 */
function AttentionCard({ date, isToday, due, upcoming, extraPing, setExtraPing, onEdit }: {
  date: string
  isToday: boolean
  due: DuePing[]
  upcoming: { slot: PingSlot; at: number } | null
  extraPing: boolean
  setExtraPing: (v: boolean) => void
  onEdit: (id: string) => void
}) {
  const { day, actions } = useApp()
  const samples = [...day(date).samples].sort((a, b) => a.at.localeCompare(b.at))
  const [saved, setSaved] = useState<{ id: string; state: SampleState; at: string } | null>(null)

  useEffect(() => {
    if (!saved) return
    const t = window.setTimeout(() => setSaved(null), 8000)
    return () => window.clearTimeout(t)
  }, [saved])

  // The confirmation only stands while the sample it confirms still exists.
  const confirmed = saved && samples.some((s) => s.id === saved.id) ? saved : null
  const asking = due.length > 0 || extraPing
  const labelOf = (s: SampleState) => SAMPLE_OPTIONS.find((o) => o.state === s)?.label ?? s

  const answer = (state: SampleState) => {
    const id = actions.addSample(date, { slot: due.length > 0 ? due[0].slot : 'manual', state })
    setSaved({ id, state, at: new Date().toISOString() })
    setExtraPing(false)
  }

  return (
    <Card
      title={isToday ? 'Attention samples' : `Attention samples — ${formatDay(date)}`}
      right={<span className="pill">{samples.length} {isToday ? 'today' : 'recorded'}</span>}
    >
      {confirmed && (
        <div className="saved-strip" role="status">
          <span className="saved-check" aria-hidden="true">✓</span>
          <span className="grow">
            Recorded <strong>{labelOf(confirmed.state)}</strong> · {formatTime(confirmed.at)}
          </span>
          <button className="linkbtn" onClick={() => { actions.removeSample(date, confirmed.id); setSaved(null) }}>
            Undo
          </button>
        </div>
      )}

      {asking && (
        <div className="ping">
          <div className="ping-q">{due.length > 0 ? due[0].label : 'Extra check'} — what was your mind on?</div>
          <p className="tiny muted" style={{ margin: '2px 0 10px' }}>
            Answer for the moment just before you opened this. One tap.
            {due.length > 1 && ` ${due.length - 1} more missed after this one.`}
          </p>
          <div className="stack" style={{ gap: 6 }}>
            {SAMPLE_OPTIONS.map((o) => (
              <button key={o.state} className="answer" onClick={() => answer(o.state)}>
                <span>{o.label}</span>
                <span className="tiny muted">{o.hint}</span>
              </button>
            ))}
          </div>
          {due.length === 0 && (
            <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setExtraPing(false)}>Cancel</button>
          )}
        </div>
      )}

      {samples.length > 0 ? (
        <>
          {asking && <div className="divider-label">Recorded</div>}
          {samples.map((s) => (
            <button key={s.id} className={`event-row${confirmed?.id === s.id ? ' fresh' : ''}`} onClick={() => onEdit(s.id)}>
              <span className="when">{formatTime(s.at)}</span>
              <span className="what">
                {labelOf(s.state)}
                <small>{slotLabel(s.slot)}</small>
              </span>
              <span className="muted small">edit</span>
            </button>
          ))}
        </>
      ) : (
        !asking && (
          <p className="tiny muted" style={{ margin: 0 }}>
            {isToday ? 'Nothing recorded yet today.' : 'No samples were recorded on this day.'}
          </p>
        )
      )}

      {isToday && !asking && (
        <div className="row between" style={{ marginTop: 10, gap: 10 }}>
          <span className="tiny muted">
            {upcoming ? `Next around ${clock(upcoming.at)} · ${slotLabel(upcoming.slot)}` : 'No more scheduled today.'}
          </span>
          <button className="btn small ghost" onClick={() => setExtraPing(true)} title="Answer one extra attention sample now">
            + sample
          </button>
        </div>
      )}
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
        relevant.
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
