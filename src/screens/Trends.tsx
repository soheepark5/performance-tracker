import { useMemo, useState } from 'react'
import { ColumnChart, LineChart, type Series } from '../components/charts'
import { DOMAIN_COLOR } from '../components/stage'
import { Card, Empty, Segmented, Tile } from '../components/ui'
import { formatMetric } from '../config/metrics'
import { addDays, daysBetween, formatShort, today } from '../domain/date'
import { adaptationRead, impulsePressureRead, strengthVerdict, withinDayRead } from '../domain/insights'
import { anchorSeries, dailySeries, stressPoints, weeklyRows } from '../domain/series'
import { useApp } from '../store/state'
import type { Domain } from '../domain/types'

/**
 * Trends. One filter row scopes every chart on the tab; each chart carries its
 * own table view, and no chart ever plots two different units on one axis.
 */

const RANGES = [
  { value: 14, label: '14d' },
  { value: 28, label: '28d' },
  { value: 90, label: '90d' },
  { value: 3650, label: 'All' },
]

export function Trends({ domain, setDomain }: { domain: Domain; setDomain: (d: Domain) => void }) {
  const { state } = useApp()
  const [range, setRange] = useState(28)
  const to = today()
  const start = state.settings.startDate
  const naive = addDays(to, -(range - 1))
  const from = daysBetween(start, naive) < 0 ? start : naive
  const weeklyNaive = addDays(to, -Math.max(range, 56))
  const weeklyFrom = daysBetween(start, weeklyNaive) < 0 ? start : weeklyNaive

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <div className="grow">
          <Segmented
            options={[
              { value: 'body', label: 'Body' },
              { value: 'brain', label: 'Brain' },
              { value: 'immersion', label: 'Immersion' },
            ]}
            value={domain}
            onChange={(v) => setDomain(v as Domain)}
            ariaLabel="Domain"
          />
        </div>
        <div style={{ width: 160 }}>
          <Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="Time range" />
        </div>
      </div>

      {domain === 'body' && <BodyTrends from={from} to={to} weeklyFrom={weeklyFrom} />}
      {domain === 'brain' && <BrainTrends from={from} to={to} />}
      {domain === 'immersion' && <ImmersionTrends from={from} to={to} weeklyFrom={weeklyFrom} />}
    </>
  )
}

/* ------------------------------------------------------------------ body */

function BodyTrends({ from, to, weeklyFrom }: { from: string; to: string; weeklyFrom: string }) {
  const { state, metrics } = useApp()
  const color = DOMAIN_COLOR.body
  const weeks = useMemo(() => weeklyRows(state, weeklyFrom, to), [state, weeklyFrom, to])
  const bench = useMemo(() => anchorSeries(state), [state])
  const read = adaptationRead(state, metrics)

  const reserveSeries: Series[] = [{
    key: 'reserve',
    label: 'Weekly reserve',
    color,
    points: weeks.map((w) => ({ date: w.weekStart, value: w.reserve, raw: w.reserve })),
  }]

  return (
    <>
      <Card title={read.headline} desc="Training load and recovery, read together — the difference between adapting and simply accumulating fatigue.">
        <p className="small" style={{ margin: 0 }}>{read.detail}</p>
        <div className="tiles" style={{ marginTop: 12 }}>
          <Tile label="Weekly reserve" value={formatMetric('weeklyReserve', metrics.weeklyReserve.value)} detail="mean, last 4 weeks" />
          <Tile label="Sessions / week" value={formatMetric('sessionsPerWeek', metrics.sessionsPerWeek.value)} detail="28-day average" />
          <Tile label="Weekly load" value={formatMetric('weeklyLoad', metrics.weeklyLoad.value)} detail="duration x RPE" />
          <Tile label="Acute : chronic" value={formatMetric('acwr', metrics.acwr.value)} detail="0.8–1.3 is progressive" />
          <Tile label="Reserve after sessions" value={formatMetric('postSessionReserve', metrics.postSessionReserve.value)} detail="left in the tank" />
          <Tile label="Next-day cost" value={formatMetric('recoveryCost', metrics.recoveryCost.value)} detail="lower is better" />
        </div>
      </Card>

      <LineChart
        title="Weekly reserve"
        subtitle="Could you repeat that week? One point per weekly check-in."
        series={reserveSeries}
        yDomain={[0, 10]}
        format={(v) => v.toFixed(0)}
      />

      <ColumnChart
        title="Weekly training load"
        subtitle="Session RPE x minutes, summed per week. Same weeks as the chart above."
        columns={weeks.map((w) => ({ label: formatShort(w.weekStart), value: w.load, detail: `${w.sessions} session${w.sessions === 1 ? '' : 's'}` }))}
        color={color}
        valueLabel="AU"
      />

      <StrengthPanel weeks={weeks} />

      {bench.length >= 2 ? (
        <LineChart
          title="Objective anchor"
          subtitle="Measured every three months. If this stalls while the strength index climbs, your sense of effort has drifted — not your body."
          series={[{ key: 'anchor', label: 'Composite', color, points: bench.map((b) => ({ date: b.date, value: b.composite, raw: b.composite })) }]}
          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
          zeroLine
        />
      ) : (
        <Card title="Objective anchor" desc="Resting HR, a genuine 3-rep max, and heart-rate recovery — measured every three months.">
          <Empty>Two checks are needed before drift can be seen. The first sets the baseline.</Empty>
        </Card>
      )}

      <RecentSessions from={from} />
    </>
  )
}

function RecentSessions({ from }: { from: string }) {
  const { state } = useApp()
  const list = state.workouts.filter((w) => daysBetween(from, w.date) >= 0).slice(-12).reverse()
  if (!list.length) return null
  return (
    <Card title="Recent sessions">
      <div className="table-scroll">
        <table className="data">
          <thead><tr><th>Date</th><th>Type</th><th>Min</th><th>RPE</th><th>Reserve</th></tr></thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td>{formatShort(w.date)}</td>
                <td style={{ textAlign: 'left' }}>{w.kind}</td>
                <td>{w.durationMin}</td>
                <td>{w.rpe}</td>
                <td>{w.reserveAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * Prescribed work and what it costs, kept on separate axes. Plotting a goal
 * ratio and an RPE on one scale would be exactly the dual-axis mistake, so they
 * are two charts sharing an x, with the verdict naming which quadrant you are in.
 */
function StrengthPanel({ weeks }: { weeks: ReturnType<typeof weeklyRows> }) {
  const { state, metrics } = useApp()
  const v = strengthVerdict(state)
  const color = DOMAIN_COLOR.body

  return (
    <>
      <Card title={v.headline} desc="Is the goal moving up while the effort it takes moves down?">
        {v.index != null && (
          <div className="row" style={{ alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span className="hero" style={{ fontSize: 40 }}>{v.index.toFixed(2)}</span>
            <span className="small muted">strength index · 1.00 = your baseline week</span>
          </div>
        )}
        <p className="small" style={{ margin: 0 }}>{v.detail}</p>
        <div className="tiles" style={{ marginTop: 12 }}>
          <Tile label="Goal" value={formatMetric('goalIndex', metrics.goalIndex.value)} detail="prescribed work vs baseline" />
          <Tile label="Perceived cost" value={formatMetric('costIndex', metrics.costIndex.value)} detail="RPE vs baseline — lower is better" />
          <Tile label="Weeks trained to target" value={formatMetric('targetAdherence', metrics.targetAdherence.value)} detail="the index rests on this" />
          <Tile label="Objective anchor" value={formatMetric('anchorDelta', metrics.anchorDelta.value)} detail="measured, every 3 months" />
        </div>
      </Card>

      <LineChart
        title="Prescribed work"
        subtitle="Each lift compared against your baseline week, then averaged — so kilograms and plank seconds combine honestly."
        series={[{ key: 'goal', label: 'Goal', color, points: weeks.map((w) => ({ date: w.weekStart, value: w.goalRatio, raw: w.goalRatio })) }]}
        format={(v2) => `${v2.toFixed(2)}x`}
      />

      <LineChart
        title="What it cost"
        subtitle="Mean RPE of the sessions you logged against that target. Falling while the chart above rises is the whole point."
        series={[{ key: 'rpe', label: 'Prescribed session RPE', color, points: weeks.map((w) => ({ date: w.weekStart, value: w.prescribedRpe, raw: w.prescribedRpe })) }]}
        yDomain={[0, 10]}
        format={(v2) => v2.toFixed(0)}
      />
    </>
  )
}

/* ----------------------------------------------------------------- brain */

function BrainTrends({ from, to }: { from: string; to: string }) {
  const { state, metrics } = useApp()
  const stress = useMemo(() => stressPoints(state, from, to), [state, from, to])

  const clarity: Series[] = [
    { key: 'am', label: 'Morning', color: 'var(--series-1)', points: dailySeries(state, 'clarityAm', from, to) },
    { key: 'pm', label: 'Later in the day', color: 'var(--series-3)', points: dailySeries(state, 'clarityPm', from, to) },
  ]

  return (
    <>
      <Card title="Where the brain is" desc="Seven-day rolling averages; the raw daily reading stays in the tooltip and the table.">
        <div className="tiles">
          <Tile label="Morning clarity" value={formatMetric('clarityAm', metrics.clarityAm.value)} />
          <Tile label="Later-day clarity" value={formatMetric('clarityPm', metrics.clarityPm.value)} />
          <Tile label="Within-day decay" value={formatMetric('clarityDrop', metrics.clarityDrop.value)} detail="lower is better" />
          <Tile label="Emotional baseline" value={formatMetric('emotionalBaseline', metrics.emotionalBaseline.value)} />
          <Tile label="Baseline volatility" value={formatMetric('emotionalVolatility', metrics.emotionalVolatility.value)} detail="lower is steadier" />
          <Tile label="Low days" value={formatMetric('lowDayRate', metrics.lowDayRate.value)} detail="clarity or baseline below 4" />
        </div>
        {withinDayRead(metrics) && <p className="small" style={{ margin: '12px 0 0' }}>{withinDayRead(metrics)}</p>}
      </Card>

      <LineChart
        title="Clarity: morning vs later in the day"
        subtitle="The gap between the two lines is the within-day decay."
        series={clarity}
        yDomain={[0, 10]}
        format={(v) => v.toFixed(0)}
      />

      <LineChart
        title="Emotional baseline"
        subtitle="Background state, not a reaction to events."
        series={[{ key: 'base', label: 'Baseline', color: 'var(--series-3)', points: dailySeries(state, 'emotionalBaseline', from, to) }]}
        yDomain={[0, 10]}
        format={(v) => v.toFixed(0)}
      />

      <Card title="Stress response" desc="Logged only when something meaningful happened. Durations stay in real minutes.">
        <div className="tiles">
          <Tile label="Impact per unit stress" value={formatMetric('stressImpactRatio', metrics.stressImpactRatio.value)} detail="functional impact / intensity" />
          <Tile label="Recovery per unit stress" value={formatMetric('stressRecoveryPerIntensity', metrics.stressRecoveryPerIntensity.value)} detail="minutes back to baseline" />
          <Tile label="Set off an impulse" value={formatMetric('stressImpulseRate', metrics.stressImpulseRate.value)} detail="share of stress events" />
          <Tile label="Stress events" value={formatMetric('stressPerWeek', metrics.stressPerWeek.value)} detail="per week" />
        </div>
      </Card>

      {stress.length >= 2 ? (
        <>
          <LineChart
            title="Recovery time per unit of stress"
            subtitle="One point per stress event, oldest first. Falling means the same size of hit clears faster."
            series={[{ key: 'rec', label: 'Minutes per intensity point', color: 'var(--series-3)', points: stress.map((s) => ({ date: s.date, value: s.recoveryPerIntensity, raw: s.recoveryPerIntensity })) }]}
            format={(v) => `${Math.round(v)}m`}
          />
          <LineChart
            title="Functional impact per unit of stress"
            subtitle="How much a given size of hit degrades your ability to work."
            series={[{ key: 'imp', label: 'Impact ratio', color: 'var(--series-3)', points: stress.map((s) => ({ date: s.date, value: s.impactRatio, raw: s.impactRatio })) }]}
            format={(v) => v.toFixed(1)}
          />
        </>
      ) : (
        <Card title="Stress response over time">
          <Empty>Two or more stress events are needed before a trend means anything.</Empty>
        </Card>
      )}
    </>
  )
}

/* ------------------------------------------------------------- immersion */

function ImmersionTrends({ from, to, weeklyFrom }: { from: string; to: string; weeklyFrom: string }) {
  const { state, metrics, activeFocusPoint } = useApp()
  const color = DOMAIN_COLOR.immersion
  const weeks = useMemo(() => weeklyRows(state, weeklyFrom, to), [state, weeklyFrom, to])

  const quality: Series[] = [
    { key: 'cont', label: 'FP continuity', color: 'var(--series-1)', points: dailySeries(state, 'fpContinuity', from, to) },
    { key: 'slow', label: 'Slow thinking', color: 'var(--series-2)', points: dailySeries(state, 'slowThinking', from, to) },
    { key: 'auto', label: 'Automatic return', color: 'var(--series-3)', points: dailySeries(state, 'automaticReturn', from, to) },
  ]

  return (
    <>
      <Card title="Immersion" desc={activeFocusPoint ? `Focus Point: ${activeFocusPoint.title}` : 'No Focus Point set.'}>
        <div className="tiles">
          <Tile label="Attention coverage" value={formatMetric('attentionCoverage', metrics.attentionCoverage.value)} detail="sampling + evening estimate" />
          <Tile label="FP continuity" value={formatMetric('fpContinuity', metrics.fpContinuity.value)} />
          <Tile label="Slow thinking" value={formatMetric('slowThinking', metrics.slowThinking.value)} />
          <Tile label="Automatic return" value={formatMetric('automaticReturn', metrics.automaticReturn.value)} />
          <Tile label="Enjoyment" value={formatMetric('enjoyment', metrics.enjoyment.value)} detail="0 draining – 3 rewarding" />
          <Tile label="Strong impulses" value={formatMetric('strongImpulsesPerWeek', metrics.strongImpulsesPerWeek.value)} detail="intensity 7+, per week" />
        </div>
        {impulsePressureRead(metrics) && <p className="small" style={{ margin: '12px 0 0' }}>{impulsePressureRead(metrics)}</p>}
      </Card>

      <LineChart
        title="Attention coverage"
        subtitle="Share of meaningful time connected to the Focus Point. An estimate from sampling, not a measurement."
        series={[
          { key: 'cov', label: 'Coverage', color, points: dailySeries(state, 'coverage', from, to) },
        ]}
        yDomain={[0, 100]}
        format={(v) => `${Math.round(v)}%`}
      />

      <LineChart
        title="Quality of immersion"
        subtitle="Seven-day rolling averages of the three evening ratings."
        series={quality}
        yDomain={[0, 10]}
        format={(v) => v.toFixed(0)}
      />

      <ColumnChart
        title="Strong impulses per week"
        subtitle="Logged at intensity 7 or above."
        columns={weeks.map((w) => ({ label: formatShort(w.weekStart), value: w.strongImpulses }))}
        color={color}
        valueLabel="impulses"
        height={110}
      />

      <ColumnChart
        title="Work time lost per week"
        subtitle="Actual disruption in minutes — separate from how long the urges lasted."
        columns={weeks.map((w) => ({ label: formatShort(w.weekStart), value: w.disruptionMin }))}
        color={color}
        valueLabel="minutes"
        height={110}
      />

      <Card title="Impulse profile" desc="Wanting something and losing work to it are tracked apart.">
        <div className="tiles">
          <Tile label="Average intensity" value={formatMetric('impulseIntensityAvg', metrics.impulseIntensityAvg.value)} />
          <Tile label="Average urge duration" value={formatMetric('urgeMinutesAvg', metrics.urgeMinutesAvg.value)} />
          <Tile label="Work lost" value={formatMetric('disruptionPerDay', metrics.disruptionPerDay.value)} />
          <Tile label="Acted on" value={formatMetric('impulseActedRate', metrics.impulseActedRate.value)} detail="share of impulses" />
        </div>
      </Card>
    </>
  )
}
