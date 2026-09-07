import type {
  AnchorCheck, AppState, DayLog, FocusPoint, ImpulseEvent, ISODate,
  StressEvent, WeeklyCheck, WeeklyTarget, Workout,
} from '../domain/types'
import { createInitialState, migrate } from './storage'
import { supabase } from './supabase'

/**
 * The sync layer: AppState <-> three Postgres tables.
 *
 * Shape of the deal, deliberately simple for V1:
 *   - one row per day and one row per logged item, so two devices editing
 *     different days never collide;
 *   - the same row edited on both devices resolves last-write-wins, which is
 *     the only conflict case left and not worth a CRDT;
 *   - pushes send a diff, computed by object identity, because every reducer in
 *     state.tsx preserves the identity of items it did not touch;
 *   - a failed push simply does not advance the synced baseline, so the next
 *     diff still contains it. That is the whole offline story — no queue.
 *
 * Nothing here computes anything about the measurement model. Stages,
 * thresholds and bottlenecks stay pure functions of AppState in domain/.
 */

export type RecordKind = 'workout' | 'weekly' | 'target' | 'anchor' | 'stress' | 'impulse' | 'focus'

interface RecordRow {
  kind: RecordKind
  record_id: string
  occurred_on: ISODate | null
  payload: unknown
}

/** The state, flattened into exactly the rows the database holds. */
interface RowSet {
  config: { settings: AppState['settings']; lifts: AppState['lifts']; anchorProtocols: AppState['anchorProtocols'] }
  days: Map<ISODate, DayLog>
  records: Map<string, RecordRow>
}

const recordKey = (kind: RecordKind, id: string) => `${kind}:${id}`

export function toRows(state: AppState): RowSet {
  const records = new Map<string, RecordRow>()
  const put = (kind: RecordKind, id: string, occurred_on: ISODate | null, payload: unknown) =>
    records.set(recordKey(kind, id), { kind, record_id: id, occurred_on, payload })

  for (const w of state.workouts) put('workout', w.id, w.date, w)
  for (const c of state.weekly) put('weekly', c.weekStart, c.weekStart, c)
  for (const t of state.weeklyTargets) put('target', t.weekStart, t.weekStart, t)
  for (const a of state.anchors) put('anchor', a.id, a.date, a)
  for (const e of state.stress) put('stress', e.id, e.date, e)
  for (const i of state.impulses) put('impulse', i.id, i.date, i)
  for (const f of state.focusPoints) put('focus', f.id, f.startedAt.slice(0, 10), f)

  return {
    config: { settings: state.settings, lifts: state.lifts, anchorProtocols: state.anchorProtocols },
    days: new Map(Object.entries(state.days)),
    records,
  }
}

/** Rebuilds AppState from rows, then runs it through the usual migration. */
export function fromRows(
  config: RowSet['config'] | null,
  days: { day: string; payload: unknown }[],
  records: RecordRow[],
): AppState {
  const base = createInitialState()
  const of = <T>(kind: RecordKind) => records.filter((r) => r.kind === kind).map((r) => r.payload as T)

  return migrate({
    ...base,
    settings: config?.settings ?? base.settings,
    lifts: config?.lifts ?? base.lifts,
    anchorProtocols: config?.anchorProtocols ?? base.anchorProtocols,
    days: Object.fromEntries(days.map((d) => [d.day, d.payload as DayLog])),
    workouts: of<Workout>('workout').sort((a, b) => a.date.localeCompare(b.date)),
    weekly: of<WeeklyCheck>('weekly').sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    weeklyTargets: of<WeeklyTarget>('target').sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    anchors: of<AnchorCheck>('anchor').sort((a, b) => a.date.localeCompare(b.date)),
    stress: of<StressEvent>('stress').sort((a, b) => a.at.localeCompare(b.at)),
    impulses: of<ImpulseEvent>('impulse').sort((a, b) => a.at.localeCompare(b.at)),
    focusPoints: of<FocusPoint>('focus').sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
  })
}

/* -------------------------------------------------------------------- pull */

export interface PullResult {
  state: AppState
  /** true when the account has no rows at all — the migration decision point */
  empty: boolean
}

export async function pull(userId: string): Promise<PullResult> {
  if (!supabase) throw new Error('cloud not configured')

  const [configRes, daysRes, recordsRes] = await Promise.all([
    supabase.from('capacity_config').select('payload').eq('user_id', userId).maybeSingle(),
    supabase.from('capacity_days').select('day,payload').eq('user_id', userId),
    supabase.from('capacity_records').select('kind,record_id,occurred_on,payload').eq('user_id', userId),
  ])

  for (const r of [configRes, daysRes, recordsRes]) if (r.error) throw r.error

  const config = (configRes.data?.payload as RowSet['config'] | undefined) ?? null
  const days = (daysRes.data ?? []) as { day: string; payload: unknown }[]
  const records = (recordsRes.data ?? []) as RecordRow[]

  return {
    state: fromRows(config, days, records),
    empty: !config && days.length === 0 && records.length === 0,
  }
}

/* -------------------------------------------------------------------- push */

export interface PushSummary {
  config: boolean
  daysUpserted: number
  daysDeleted: number
  recordsUpserted: number
  recordsDeleted: number
}

/**
 * Pushes the difference between two states. `prev` is the last state known to
 * be in the database; pass null to push everything (first sync, or migration).
 */
export async function pushDiff(userId: string, prev: AppState | null, next: AppState): Promise<PushSummary> {
  if (!supabase) throw new Error('cloud not configured')

  const before = prev ? toRows(prev) : null
  const after = toRows(next)
  const summary: PushSummary = { config: false, daysUpserted: 0, daysDeleted: 0, recordsUpserted: 0, recordsDeleted: 0 }

  /* config — small enough to compare by value */
  if (!before || JSON.stringify(before.config) !== JSON.stringify(after.config)) {
    const { error } = await supabase
      .from('capacity_config')
      .upsert({ user_id: userId, payload: after.config }, { onConflict: 'user_id' })
    if (error) throw error
    summary.config = true
  }

  /* days — identity comparison; untouched days keep their object reference */
  const dayUpserts: { user_id: string; day: string; payload: DayLog }[] = []
  for (const [day, payload] of after.days) {
    if (!before || before.days.get(day) !== payload) dayUpserts.push({ user_id: userId, day, payload })
  }
  const dayDeletes = before ? [...before.days.keys()].filter((d) => !after.days.has(d)) : []

  for (const batch of chunk(dayUpserts, 400)) {
    const { error } = await supabase.from('capacity_days').upsert(batch, { onConflict: 'user_id,day' })
    if (error) throw error
    summary.daysUpserted += batch.length
  }
  if (dayDeletes.length) {
    const { error } = await supabase.from('capacity_days').delete().eq('user_id', userId).in('day', dayDeletes)
    if (error) throw error
    summary.daysDeleted = dayDeletes.length
  }

  /* records — same identity trick, keyed by kind + id */
  const recUpserts: (RecordRow & { user_id: string })[] = []
  for (const [key, row] of after.records) {
    if (!before || before.records.get(key)?.payload !== row.payload) recUpserts.push({ user_id: userId, ...row })
  }
  const recDeletes = before ? [...before.records.values()].filter((r) => !after.records.has(recordKey(r.kind, r.record_id))) : []

  for (const batch of chunk(recUpserts, 400)) {
    const { error } = await supabase.from('capacity_records').upsert(batch, { onConflict: 'user_id,kind,record_id' })
    if (error) throw error
    summary.recordsUpserted += batch.length
  }
  for (const row of recDeletes) {
    const { error } = await supabase
      .from('capacity_records')
      .delete()
      .eq('user_id', userId)
      .eq('kind', row.kind)
      .eq('record_id', row.record_id)
    if (error) throw error
    summary.recordsDeleted += 1
  }

  return summary
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/* ---------------------------------------------------------- canonical form */

/**
 * A stable string for a value, with object keys sorted at every depth.
 *
 * Necessary, not decorative: Postgres `jsonb` does not preserve key order, so a
 * payload that round-trips through the database comes back with its keys
 * rearranged. A plain JSON.stringify comparison would report that as data
 * corruption on every single row.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    )
  }
  return v
}

/* ------------------------------------------------------------------- merge */

/**
 * Three-way merge of a pull against unsynced local work.
 *
 * `baseline` is the last state known to be in the cloud. A row that differs
 * between baseline and local was edited on THIS device and has not been pushed;
 * it must survive the pull. Anything else takes the cloud's version, which is
 * where the other device's work arrives.
 *
 * Without this, a pull is a plain overwrite, and any edit made offline is
 * destroyed the moment the app reconnects.
 */
export function mergeStates(baseline: AppState | null, local: AppState, remote: AppState): AppState {
  const b = baseline ? toRows(baseline) : null
  const l = toRows(local)
  const r = toRows(remote)

  /* config */
  const configChangedLocally = b ? canonical(l.config) !== canonical(b.config) : hasAnyConfig(local)
  const config = configChangedLocally ? l.config : r.config

  /* days and records: identical rules, so one helper does both */
  const days = mergeMap(
    b?.days ?? null,
    l.days,
    r.days,
    (x) => canonical(x),
  )
  const records = mergeMap(
    b?.records ?? null,
    l.records,
    r.records,
    (x) => canonical(x.payload),
  )

  return fromRows(
    config,
    [...days].map(([day, payload]) => ({ day, payload })),
    [...records.values()],
  )
}

/**
 * @param base  the common ancestor, or null when this device has never synced
 * @param local what is on this device now
 * @param rem   what the cloud holds
 */
function mergeMap<T>(
  base: Map<string, T> | null,
  local: Map<string, T>,
  rem: Map<string, T>,
  fingerprint: (v: T) => string,
): Map<string, T> {
  const out = new Map<string, T>(rem)

  for (const [key, localValue] of local) {
    const baseValue = base?.get(key)
    const editedHere = !base || baseValue === undefined || fingerprint(baseValue) !== fingerprint(localValue)
    // A local edit that has not reached the cloud always wins the merge.
    if (editedHere) out.set(key, localValue)
  }

  // A row this device deleted since its last sync should stay deleted — but only
  // when we can prove the deletion, which needs the baseline.
  if (base) {
    for (const key of base.keys()) {
      if (!local.has(key) && rem.has(key) && fingerprint(base.get(key)!) === fingerprint(rem.get(key)!)) {
        out.delete(key)
      }
    }
  }

  return out
}

function hasAnyConfig(state: AppState): boolean {
  return Object.keys(state.settings.thresholdOverrides ?? {}).length > 0
}

/* --------------------------------------------------- migration verification */

export interface Verification {
  ok: boolean
  checked: number
  problems: string[]
}

/**
 * Proves an upload landed intact by comparing every row's content, not just how
 * many there are. Counts alone would pass a dataset whose payloads were
 * truncated, whose ids collided, or where one row was lost and another
 * duplicated — exactly the failures worth catching in a two-year record.
 */
export function verifyMigration(local: AppState, remote: AppState): Verification {
  const l = toRows(local)
  const r = toRows(remote)
  const problems: string[] = []
  let checked = 0

  if (canonical(l.config) !== canonical(r.config)) {
    problems.push('settings / lifts / anchor protocols differ after upload')
  }
  checked += 1

  const compare = (label: string, a: Map<string, unknown>, b: Map<string, unknown>, fp: (v: any) => string) => {
    for (const [key, value] of a) {
      checked += 1
      if (!b.has(key)) {
        problems.push(`${label} ${key} is missing from the cloud`)
        continue
      }
      if (fp(value) !== fp(b.get(key))) problems.push(`${label} ${key} came back with different content`)
    }
    for (const key of b.keys()) {
      if (!a.has(key)) problems.push(`${label} ${key} exists in the cloud but not on this device`)
    }
  }

  compare('day', l.days, r.days, (v) => canonical(v))
  compare('record', l.records, r.records, (v: RecordRow) => canonical(v.payload))

  return { ok: problems.length === 0, checked, problems: problems.slice(0, 12) }
}

/* --------------------------------------------------------------- counting */

/**
 * Counts are for telling you what is about to be uploaded — never for proving
 * it arrived. verifyMigration compares content, which is the check that matters.
 */
export interface RecordCounts {
  days: number
  workouts: number
  weekly: number
  targets: number
  anchors: number
  stress: number
  impulses: number
  focusPoints: number
}

export function countOf(state: AppState): RecordCounts {
  return {
    days: Object.keys(state.days).length,
    workouts: state.workouts.length,
    weekly: state.weekly.length,
    targets: state.weeklyTargets.length,
    anchors: state.anchors.length,
    stress: state.stress.length,
    impulses: state.impulses.length,
    focusPoints: state.focusPoints.length,
  }
}

