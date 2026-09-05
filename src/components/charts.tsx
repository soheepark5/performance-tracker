import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatShort } from '../domain/date'
import type { ISODate } from '../domain/types'

/**
 * Two chart forms, hand-rolled in SVG (no chart library, no network).
 *
 * Conventions held throughout: one y-axis only, hairline solid gridlines, 2px
 * lines, >=8px end markers with a surface ring, a legend whenever more than one
 * series is plotted, and a table view on every chart so no value is reachable
 * only by hovering.
 */

export interface Series {
  key: string
  label: string
  color: string
  points: { date: ISODate; value: number | null; raw?: number | null }[]
}

const PAD = { top: 10, right: 12, bottom: 22, left: 34 }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(320)
  useLayoutEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ro = new ResizeObserver(() => setW(el.clientWidth || 320))
    ro.observe(el)
    setW(el.clientWidth || 320)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const span = max - min
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const stepN = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1
  const step = stepN * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

interface ChartFrameProps {
  title: string
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  table: ReactNode
  legend?: ReactNode
}

function ChartFrame({ title, subtitle, right, children, table, legend }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="card">
      <div className="chart-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="desc" style={{ margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {right}
          <button className="btn small ghost" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>
      {showTable ? <div className="table-scroll">{table}</div> : children}
      {!showTable && legend}
    </section>
  )
}

/* ------------------------------------------------------------- line chart */

export function LineChart({ title, subtitle, series, height = 150, yDomain, format = (v) => v.toFixed(1), right, zeroLine }: {
  title: string
  subtitle?: ReactNode
  series: Series[]
  height?: number
  yDomain?: [number, number]
  format?: (v: number) => string
  right?: ReactNode
  /** draw an emphasised rule at y=0 (for percent-change charts) */
  zeroLine?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const dates = series[0]?.points.map((p) => p.date) ?? []
  const all = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v != null)
  const hasData = all.length > 0

  let lo = yDomain ? yDomain[0] : Math.min(...all)
  let hi = yDomain ? yDomain[1] : Math.max(...all)
  if (!yDomain) {
    if (lo === hi) { lo -= 1; hi += 1 }
    const pad = (hi - lo) * 0.12
    lo -= pad; hi += pad
    if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  }

  const iw = Math.max(40, w - PAD.left - PAD.right)
  const ih = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (dates.length <= 1 ? iw / 2 : (i / (dates.length - 1)) * iw)
  const y = (v: number) => PAD.top + ih - ((v - lo) / (hi - lo || 1)) * ih
  const ticks = niceTicks(lo, hi, 4)

  const onMove = useCallback((clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const rel = clientX - rect.left - PAD.left
    const i = Math.round((rel / iw) * (dates.length - 1))
    setHover(Math.max(0, Math.min(dates.length - 1, i)))
  }, [iw, dates.length])

  const tableEl = (
    <table className="data">
      <thead>
        <tr><th>Date</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr>
      </thead>
      <tbody>
        {dates.map((d, i) => (
          <tr key={d}>
            <td>{formatShort(d)}</td>
            {series.map((s) => {
              const p = s.points[i]
              const v = p?.raw !== undefined ? p.raw : p?.value
              return <td key={s.key}>{v == null ? '—' : format(v)}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )

  const legend = series.length > 1 ? (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  ) : null

  return (
    <ChartFrame title={title} subtitle={subtitle} right={right} table={tableEl} legend={legend}>
      <div className="chart-wrap chart" ref={ref}>
        {!hasData ? (
          <div className="empty" style={{ height }}>Not enough data yet.</div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${w} ${height}`}
              width={w}
              height={height}
              role="img"
              aria-label={title}
              onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
              onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
                  <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{format(t)}</text>
                </g>
              ))}
              {zeroLine && lo < 0 && hi > 0 && (
                <line x1={PAD.left} x2={w - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
              )}

              {dates.length > 0 && [0, dates.length - 1].map((i, k) => (
                <text key={k} x={x(i)} y={height - 6} textAnchor={k === 0 ? 'start' : 'end'} fontSize="10" fill="var(--muted)">
                  {formatShort(dates[i])}
                </text>
              ))}

              {series.map((s) => (
                <g key={s.key}>
                  {segments(s.points).map((seg, si) => (
                    <path
                      key={si}
                      d={seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ')}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {lastPoint(s.points) && (
                    <circle
                      cx={x(lastPoint(s.points)!.i)}
                      cy={y(lastPoint(s.points)!.v)}
                      r="4"
                      fill={s.color}
                      stroke="var(--surface)"
                      strokeWidth="2"
                    />
                  )}
                </g>
              ))}

              {hover != null && (
                <g>
                  <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--axis)" strokeWidth="1" />
                  {series.map((s) => {
                    const v = s.points[hover]?.value
                    return v == null ? null : (
                      <circle key={s.key} cx={x(hover)} cy={y(v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                    )
                  })}
                </g>
              )}
            </svg>
            {hover != null && (
              <div
                className="tooltip"
                style={{
                  left: Math.min(Math.max(0, x(hover) - 60), Math.max(0, w - 130)),
                  top: 0,
                }}
              >
                <div className="t-date">{formatShort(dates[hover])}</div>
                {series.map((s) => {
                  const p = s.points[hover]
                  if (!p || (p.value == null && p.raw == null)) return null
                  return (
                    <div className="t-row" key={s.key}>
                      <i style={{ background: s.color, width: 8, height: 8, borderRadius: 4, display: 'block' }} />
                      <span className="muted">{s.label}</span>
                      <strong>{p.value == null ? '—' : format(p.value)}</strong>
                      {p.raw != null && p.value != null && Math.abs(p.raw - p.value) > 0.05 && (
                        <span className="muted">(day {format(p.raw)})</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </ChartFrame>
  )
}

function segments(points: { value: number | null }[]) {
  const out: { i: number; v: number }[][] = []
  let cur: { i: number; v: number }[] = []
  points.forEach((p, i) => {
    if (p.value == null) {
      if (cur.length) out.push(cur)
      cur = []
    } else cur.push({ i, v: p.value })
  })
  if (cur.length) out.push(cur)
  return out
}

function lastPoint(points: { value: number | null }[]) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].value != null) return { i, v: points[i].value! }
  return null
}

/* ----------------------------------------------------------- column chart */

export interface Column {
  label: string
  value: number
  detail?: string
}

export function ColumnChart({ title, subtitle, columns, color, height = 130, format = (v) => String(Math.round(v)), right, valueLabel }: {
  title: string
  subtitle?: ReactNode
  columns: Column[]
  color: string
  height?: number
  format?: (v: number) => string
  right?: ReactNode
  valueLabel: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(1, ...columns.map((c) => c.value))
  const iw = Math.max(40, w - PAD.left - PAD.right)
  const ih = height - PAD.top - PAD.bottom
  const band = columns.length ? iw / columns.length : iw
  const barW = Math.min(24, Math.max(4, band - 6))
  const y = (v: number) => PAD.top + ih - (v / max) * ih
  const ticks = niceTicks(0, max, 3)

  const table = (
    <table className="data">
      <thead><tr><th>Week of</th><th>{valueLabel}</th></tr></thead>
      <tbody>
        {columns.map((c) => (
          <tr key={c.label}><td>{c.label}</td><td>{format(c.value)}</td></tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <ChartFrame title={title} subtitle={subtitle} right={right} table={table}>
      <div className="chart-wrap chart" ref={ref}>
        {!columns.length ? (
          <div className="empty" style={{ height }}>Not enough data yet.</div>
        ) : (
          <>
            <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
                  <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{format(t)}</text>
                </g>
              ))}
              {columns.map((c, i) => {
                const cx = PAD.left + band * i + band / 2
                const h = Math.max(c.value > 0 ? 2 : 0, PAD.top + ih - y(c.value))
                return (
                  <g key={c.label} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                    <rect x={cx - band / 2} y={PAD.top} width={band} height={ih} fill="transparent" />
                    <rect x={cx - barW / 2} y={PAD.top + ih - h} width={barW} height={h} rx="4" fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />
                  </g>
                )
              })}
              {columns.length > 0 && [0, columns.length - 1].map((i, k) => (
                <text key={k} x={PAD.left + band * i + band / 2} y={height - 6} textAnchor={k === 0 ? 'start' : 'end'} fontSize="10" fill="var(--muted)">
                  {columns[i].label}
                </text>
              ))}
            </svg>
            {hover != null && columns[hover] && (
              <div className="tooltip" style={{ left: Math.min(Math.max(0, PAD.left + band * hover - 40), Math.max(0, w - 140)), top: 0 }}>
                <div className="t-date">{columns[hover].label}</div>
                <div className="t-row">
                  <i style={{ background: color, width: 8, height: 8, borderRadius: 4, display: 'block' }} />
                  <strong>{format(columns[hover].value)}</strong>
                  <span className="muted">{valueLabel}</span>
                </div>
                {columns[hover].detail && <div className="t-row muted">{columns[hover].detail}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </ChartFrame>
  )
}

/* ------------------------------------------------------------- sparkline */

export function Sparkline({ points, color, width = 84, height = 26 }: {
  points: (number | null)[]
  color: string
  width?: number
  height?: number
}) {
  const vals = points.filter((v): v is number => v != null)
  if (vals.length < 2) return <span className="muted tiny">—</span>
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const x = (i: number) => (i / (points.length - 1)) * (width - 4) + 2
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)
  const segs = segments(points.map((v) => ({ value: v })))
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {segs.map((seg, i) => (
        <path key={i} d={seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

/** Hook kept here so screens can re-render when the day rolls over at midnight. */
export function useMidnightTick() {
  const [, force] = useState(0)
  useEffect(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30)
    const t = window.setTimeout(() => force((v) => v + 1), next.getTime() - now.getTime())
    return () => window.clearTimeout(t)
  })
}
