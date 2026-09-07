import { DEFAULT_ANCHOR, DEFAULT_LIFTS } from '../config/taxonomy'
import { today } from '../domain/date'
import type { AppState } from '../domain/types'

/**
 * Local-first persistence: one JSON document in localStorage, plus explicit
 * export/import so the record can be backed up or moved between devices.
 * Nothing leaves the device, and no server is required to run the app.
 */

export const STORAGE_KEY = 'capacity.state.v1'
export const SCHEMA_VERSION = 1

/**
 * The last state confirmed to be in the cloud — the common ancestor a pull needs
 * in order to tell "this row changed here while offline" from "this row changed
 * on the other device". It must outlive the process, or a restart loses the
 * ability to distinguish them and unsynced work gets overwritten.
 */
export const SYNCED_KEY = 'capacity.synced.v1'

export function loadSynced(): AppState | null {
  try {
    const raw = localStorage.getItem(SYNCED_KEY)
    return raw ? migrate(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveSynced(state: AppState | null) {
  try {
    if (state) localStorage.setItem(SYNCED_KEY, JSON.stringify(state))
    else localStorage.removeItem(SYNCED_KEY)
  } catch (err) {
    console.error('Could not persist the sync baseline', err)
  }
}

export function createInitialState(startDate = today()): AppState {
  return {
    version: SCHEMA_VERSION,
    settings: {
      startDate,
      calibrationWeeks: 8,
      pingTimes: { start: '09:00', mid: '14:00', end: '18:30' },
      randomPing: true,
      notificationsEnabled: false,
      anchorIntervalDays: 91,
      thresholdOverrides: {},
    },
    focusPoints: [],
    days: {},
    workouts: [],
    weekly: [],
    lifts: DEFAULT_LIFTS,
    weeklyTargets: [],
    anchors: [],
    anchorProtocols: [DEFAULT_ANCHOR],
    stress: [],
    impulses: [],
  }
}

/** Forward-compatible: unknown older shapes are filled in rather than discarded. */
export function migrate(raw: any): AppState {
  const base = createInitialState(raw?.settings?.startDate ?? today())
  if (!raw || typeof raw !== 'object') return base
  const state: AppState = {
    ...base,
    ...raw,
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...(raw.settings ?? {}), pingTimes: { ...base.settings.pingTimes, ...(raw.settings?.pingTimes ?? {}) }, thresholdOverrides: raw.settings?.thresholdOverrides ?? {} },
    days: raw.days ?? {},
    lifts: raw.lifts?.length ? raw.lifts : base.lifts,
    weeklyTargets: raw.weeklyTargets ?? [],
    anchors: raw.anchors ?? [],
    anchorProtocols: raw.anchorProtocols?.length ? raw.anchorProtocols : base.anchorProtocols,
  }
  for (const d of Object.values(state.days)) if (!(d as any).samples) (d as any).samples = []
  return state
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    return migrate(JSON.parse(raw))
  } catch {
    return createInitialState()
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.error('Could not persist state', err)
  }
}

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

declare global {
  interface Window {
    claude?: { use?: (name: string) => Promise<any> }
  }
}

export type ExportOutcome =
  | { ok: true; how: 'saved' | 'downloaded' }
  | { ok: false; reason: string }

/**
 * Save a backup.
 *
 * Two hosts, two mechanisms: run from a file or a local server, an anchor
 * download works. Run inside the claude.ai artifact viewer, page-initiated
 * downloads are blocked and the file has to go through the viewer's own save
 * confirmation. Whichever host this is, the copy-to-clipboard route always works.
 */
export async function exportBackup(state: AppState): Promise<ExportOutcome> {
  const json = exportJSON(state)
  const filename = `capacity-${today()}.json`

  // window.claude only exists inside the artifact viewer, so this costs a
  // plain browser nothing.
  try {
    const downloads = await window.claude?.use?.('downloads')
    if (downloads) {
      await downloads.save({ filename, data: json })
      return { ok: true, how: 'saved' }
    }
  } catch (err: any) {
    if (err?.code === 'declined') return { ok: false, reason: 'Save cancelled.' }
    return { ok: false, reason: 'The file could not be saved here — use Copy instead.' }
  }

  try {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { ok: true, how: 'downloaded' }
  } catch {
    return { ok: false, reason: 'Download is not available here — use Copy instead.' }
  }
}

export async function copyExport(state: AppState): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(exportJSON(state))
    return true
  } catch {
    return false
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
