import { useEffect, useMemo, type ReactNode } from 'react'
import { SCALES, type ScaleAnchors, type ScaleKey } from '../config/scales'

/* -------------------------------------------------------------------- card */

export function Card({ title, desc, right, children, className = '' }: {
  title?: ReactNode
  desc?: ReactNode
  right?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="row between" style={{ marginBottom: desc ? 2 : 10 }}>
          {title ? <h2>{title}</h2> : <span />}
          {right}
        </div>
      )}
      {desc && <p className="desc">{desc}</p>}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------- scale input */

/**
 * A snapping slider. The track is continuous to drag along, but `step` means only
 * the fixed values are reachable (0..10, or 0..100 by tens), so a rating is always
 * one of the anchored points and never a number in between.
 *
 * Until it is touched the control renders "unset": greyed track, "–" readout, no
 * value written. Releasing anywhere on the track commits — including on the
 * midpoint, which would otherwise fire no change event.
 */
export function ScaleInput({ scale, value, onChange, max = 10, min = 0, step = 1, compact = false }: {
  scale: ScaleKey
  value: number | null
  onChange: (v: number) => void
  max?: number
  min?: number
  step?: number
  compact?: boolean
}) {
  const s: ScaleAnchors = SCALES[scale]
  const steps = useMemo(() => {
    const out: number[] = []
    for (let v = min; v <= max; v += step) out.push(v)
    return out
  }, [min, max, step])

  const unset = value == null
  const shown = unset ? steps[Math.floor(steps.length / 2)] : value
  const pct = ((shown - min) / (max - min || 1)) * 100

  const anchors = s.anchors as Record<number, string>
  const anchorText = unset ? 'Drag the slider to rate.' : nearestAnchor(anchors, value)

  return (
    <div className="scale">
      <div className="scale-head">
        <span className="scale-q">{s.question}</span>
        <span className={`scale-val${unset ? ' not-set' : ''}`}>{unset ? 'not rated' : value}</span>
      </div>
      {!compact && s.hint && <p className="scale-hint">{s.hint}</p>}
      <div className="scale-slider">
        <input
          type="range"
          className={`scale-range${unset ? ' unset' : ''}`}
          style={{ ['--pct' as string]: `${pct}%` }}
          min={min}
          max={max}
          step={step}
          value={shown}
          aria-label={s.question}
          aria-valuetext={unset ? 'not set' : `${value} — ${anchorText}`}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={() => { if (value == null) onChange(shown) }}
        />
        <div className="scale-ticks" aria-hidden="true">
          {steps.map((v) => (
            <span key={v} className={!unset && v === value ? 'on' : undefined}>{v}</span>
          ))}
        </div>
      </div>
      <div className={`scale-anchor${unset ? ' muted' : ''}`}>{anchorText}</div>
    </div>
  )
}

function nearestAnchor(anchors: Record<number, string>, value: number): string {
  const keys = Object.keys(anchors).map(Number).sort((a, b) => a - b)
  let best = keys[0]
  for (const k of keys) if (Math.abs(k - value) <= Math.abs(best - value)) best = k
  return anchors[best] ?? ''
}

/* ------------------------------------------------------------------- chips */

export function Chips<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="chips" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string | number>({ options, value, onChange, ariaLabel }: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ fields */

export function NumberField({ label, value, onChange, unit, step = 1, placeholder, min }: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  step?: number
  placeholder?: string
  min?: number
}) {
  return (
    <div className="field">
      <label>{label}{unit ? <span className="suffix"> ({unit})</span> : null}</label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  )
}

export function TextField({ label, value, onChange, placeholder, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {multiline ? (
        <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- sheet */

export function Sheet({ open, title, onClose, children, footer }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>
        {children}
        {footer && <div className="sheet-actions">{footer}</div>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- stat tiles */

export function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="tile">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {detail && <div className="d">{detail}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
