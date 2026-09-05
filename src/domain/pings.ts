import { minutesSinceMidnight, parseClock } from './date'
import type { AppState, DayLog, ISODate, Sample } from './types'

/**
 * Attention sampling.
 *
 * There is no timer and no "start focus" button anywhere in this app: a timer
 * would change the thing being measured. Instead a handful of moments each day
 * ask one question about what your mind was on just before — experience
 * sampling rather than instrumentation.
 */

export type PingSlot = Sample['slot']

export interface DuePing {
  slot: PingSlot
  label: string
  /** minutes since midnight the ping became due */
  dueAt: number
}

const SLOT_LABEL: Record<PingSlot, string> = {
  start: 'Starting work',
  mid: 'Midday',
  end: 'Finishing work',
  random: 'Random check',
  manual: 'Manual',
}

/** Stable pseudo-random minute for the day's optional random ping. */
function randomPingMinute(date: ISODate, from: number, to: number): number {
  let h = 0
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) >>> 0
  return from + (h % Math.max(1, to - from))
}

export function scheduledPings(state: AppState, date: ISODate): { slot: PingSlot; at: number }[] {
  const { pingTimes, randomPing } = state.settings
  const out: { slot: PingSlot; at: number }[] = [
    { slot: 'start', at: parseClock(pingTimes.start) },
    { slot: 'end', at: parseClock(pingTimes.end) },
  ]
  if (pingTimes.mid) out.push({ slot: 'mid', at: parseClock(pingTimes.mid) })
  if (randomPing) {
    const lo = parseClock(pingTimes.start) + 45
    const hi = Math.max(lo + 60, parseClock(pingTimes.end) - 45)
    out.push({ slot: 'random', at: randomPingMinute(date, lo, hi) })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Pings whose moment has passed today and that have not been answered. */
export function duePings(state: AppState, day: DayLog, date: ISODate, now = minutesSinceMidnight()): DuePing[] {
  const answered = new Set(day.samples.map((s) => s.slot))
  return scheduledPings(state, date)
    .filter((p) => p.at <= now && !answered.has(p.slot))
    .map((p) => ({ slot: p.slot, label: SLOT_LABEL[p.slot], dueAt: p.at }))
}

export function nextPing(state: AppState, day: DayLog, date: ISODate, now = minutesSinceMidnight()): { slot: PingSlot; at: number } | null {
  const answered = new Set(day.samples.map((s) => s.slot))
  return scheduledPings(state, date).find((p) => p.at > now && !answered.has(p.slot)) ?? null
}

export function slotLabel(slot: PingSlot) {
  return SLOT_LABEL[slot]
}

/* ------------------------------------------------------- browser reminders */

/**
 * Reminders fire from the page itself. A background push would need a server
 * and an account; this app deliberately has neither, so reminders work while
 * the app is open (including as an installed home-screen app) and the Today
 * screen always shows any ping you missed. For hard alarms, use the phone's
 * own clock app at the same times.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export function fireNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: 'capacity-ping', silent: false })
  } catch {
    /* some browsers only allow notifications from a service worker; ignore */
  }
}
