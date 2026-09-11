import type { ISODate } from './types'

/** All date handling is local-time; a "day" is the user's day, not UTC. */

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): ISODate {
  return toISODate(new Date())
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Monday-start week. */
export function weekStart(s: ISODate): ISODate {
  const d = fromISODate(s)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toISODate(d)
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) out.push(d)
  return out
}

export function formatDay(s: ISODate): string {
  return fromISODate(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatShort(s: ISODate): string {
  return fromISODate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Minutes rendered in whatever unit reads most naturally, without losing the raw value. */
export function formatDuration(min: number): string {
  if (!Number.isFinite(min)) return '—'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

/** 'HH:mm' -> minutes since local midnight */
export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesSinceMidnight(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** The local calendar day an ISO timestamp falls on. */
export function localDateOf(iso: string): ISODate {
  return toISODate(new Date(iso))
}

/** A Date as a `datetime-local` input value: "YYYY-MM-DDTHH:mm", local time. */
export function toLocalInput(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${toISODate(d)}T${hh}:${mm}`
}

/** Parses a `datetime-local` value as local time, without relying on engine quirks. */
export function fromLocalInput(s: string): Date {
  const [datePart, timePart = '12:00'] = s.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, h || 0, mi || 0)
}
