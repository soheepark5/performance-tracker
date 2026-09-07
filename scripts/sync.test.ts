/**
 * Tests for the two failure modes that matter most: losing an offline edit to a
 * pull, and a migration that "verifies" without actually comparing content.
 *
 *   npm run test:sync
 */
import { canonical, mergeStates, verifyMigration } from '../src/store/cloud'
import { createInitialState } from '../src/store/storage'
import type { AppState, DayLog } from '../src/domain/types'

let failures = 0
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const day = (date: string, clarity: number): DayLog => ({
  date,
  samples: [],
  morning: { at: `${date}T08:00:00.000Z`, clarity, emotionalBaseline: 6 },
})

function stateWith(days: DayLog[], extra: Partial<AppState> = {}): AppState {
  const s = createInitialState('2026-09-01')
  return { ...s, days: Object.fromEntries(days.map((d) => [d.date, d])), ...extra }
}

/** What a round trip through Postgres jsonb does: key order is not preserved. */
function throughJsonb(state: AppState): AppState {
  const shuffle = (v: any): any => {
    if (Array.isArray(v)) return v.map(shuffle)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).reverse().map((k) => [k, shuffle(v[k])]))
    }
    return v
  }
  return shuffle(JSON.parse(JSON.stringify(state)))
}

console.log('\nofflineedit survives a pull after a full restart')
{
  // Baseline: both sides agree on Monday and Tuesday.
  const baseline = stateWith([day('2026-09-07', 5), day('2026-09-08', 5)])

  // Offline on this device: Tuesday edited, Wednesday added. Never pushed.
  const local = stateWith([day('2026-09-07', 5), day('2026-09-08', 9), day('2026-09-09', 7)])

  // Meanwhile the other device added Thursday.
  const remote = stateWith([day('2026-09-07', 5), day('2026-09-08', 5), day('2026-09-10', 4)])

  const merged = mergeStates(baseline, local, remote)

  check('offline edit to Tuesday is kept', merged.days['2026-09-08']?.morning?.clarity === 9,
    `got ${merged.days['2026-09-08']?.morning?.clarity}`)
  check('offline day added here is kept', merged.days['2026-09-09']?.morning?.clarity === 7)
  check('day added on the other device arrives', merged.days['2026-09-10']?.morning?.clarity === 4)
  check('untouched day is unchanged', merged.days['2026-09-07']?.morning?.clarity === 5)
}

console.log('\na deletion made here is not resurrected by the pull')
{
  const baseline = stateWith([day('2026-09-07', 5), day('2026-09-08', 5)])
  const local = stateWith([day('2026-09-07', 5)]) // Tuesday deleted locally
  const remote = stateWith([day('2026-09-07', 5), day('2026-09-08', 5)])

  const merged = mergeStates(baseline, local, remote)
  check('locally deleted day stays deleted', merged.days['2026-09-08'] === undefined)
}

console.log('\nwithout a baseline the merge never destroys local work')
{
  const local = stateWith([day('2026-09-08', 9)])
  const remote = stateWith([day('2026-09-10', 4)])
  const merged = mergeStates(null, local, remote)
  check('local day survives', merged.days['2026-09-08']?.morning?.clarity === 9)
  check('remote day survives', merged.days['2026-09-10']?.morning?.clarity === 4)
}

console.log('\nrecords merge on the same rules as days')
{
  const w = (id: string, rpe: number) => ({
    id, date: '2026-09-07', at: '2026-09-07T18:00:00.000Z', kind: 'strength' as const,
    durationMin: 50, rpe, reserveAfter: 5, metrics: {},
  })
  const baseline = stateWith([], { workouts: [w('a', 6)] })
  const local = stateWith([], { workouts: [w('a', 8), w('b', 7)] })   // edited + added offline
  const remote = stateWith([], { workouts: [w('a', 6), w('c', 5)] })  // other device added one

  const merged = mergeStates(baseline, local, remote)
  const byId = Object.fromEntries(merged.workouts.map((x) => [x.id, x]))
  check('offline edit to a session is kept', byId.a?.rpe === 8, `got ${byId.a?.rpe}`)
  check('offline session is kept', byId.b?.rpe === 7)
  check('other device session arrives', byId.c?.rpe === 5)
}

console.log('\nverification compares content, not counts')
{
  const local = stateWith([day('2026-09-07', 5), day('2026-09-08', 9)])

  check('identical data verifies', verifyMigration(local, local).ok)

  // Same number of rows, different content — the case counts cannot catch.
  const corrupted = stateWith([day('2026-09-07', 5), day('2026-09-08', 2)])
  const r1 = verifyMigration(local, corrupted)
  check('a changed value fails verification', !r1.ok, r1.problems.join('; '))

  // Same count, different ids — one lost, one invented.
  const swapped = stateWith([day('2026-09-07', 5), day('2026-09-99', 9)])
  const r2 = verifyMigration(local, swapped)
  check('a wrong id fails verification', !r2.ok, r2.problems.join('; '))

  // A record dropped on the way up.
  const short = stateWith([day('2026-09-07', 5)])
  check('a missing day fails verification', !verifyMigration(local, short).ok)

  // Key reordering by jsonb must NOT look like corruption.
  check('a jsonb round trip still verifies', verifyMigration(local, throughJsonb(local)).ok,
    verifyMigration(local, throughJsonb(local)).problems.join('; '))
}

console.log('\ncanonical form is order-independent')
{
  check('key order does not change the fingerprint',
    canonical({ a: 1, b: { c: 2, d: 3 } }) === canonical({ b: { d: 3, c: 2 }, a: 1 }))
  check('array order still matters', canonical([1, 2]) !== canonical([2, 1]))
}


console.log('\na fresh device with an empty cache adopts the cloud record')
{
  // Exactly the reinstall / second-device case: no baseline, nothing local,
  // a populated cloud. The merge must return the cloud record untouched.
  const remote = stateWith([day('2026-09-06', 7)], {
    focusPoints: [{ id: 'fp1', title: 'Held problem', startedAt: '2026-09-06T08:00:00.000Z' }],
  })
  const local = createInitialState('2026-09-01')

  const merged = mergeStates(null, local, remote)
  check('cloud day is adopted', merged.days['2026-09-06']?.morning?.clarity === 7,
    `days = ${JSON.stringify(Object.keys(merged.days))}`)
  check('cloud focus point is adopted', merged.focusPoints.length === 1,
    `focusPoints = ${merged.focusPoints.length}`)
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`)
process.exit(failures === 0 ? 0 : 1)
