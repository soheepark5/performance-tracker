import { useEffect, useRef } from 'react'

/**
 * The phone's back button.
 *
 * An installed PWA has no browser chrome, so on Android "back" is the only way
 * out of a sheet or a tab — and an app that never touches history has nothing to
 * go back to, so it simply exits.
 *
 * Design: what "back" should do lives in an in-memory stack of handlers (open
 * sheets, previous tabs). The browser only ever holds ONE extra history entry —
 * a guard — and only while that stack is non-empty. Pressing back leaves the
 * guard; we run the top handler and, if more remain, put a fresh guard back.
 *
 * A first version pushed one history entry per sheet and withdrew each with its
 * own history.back(), tallying the resulting popstates to ignore. Any single
 * missed popstate (React's development mode mounts effects twice, for one)
 * left the tally and the real history out of step, and a later withdrawal
 * overshot straight out of the app. Tracking the guard as a yes/no instead of
 * a count removes that whole failure class: there is exactly one history.back()
 * we ever issue, and only when the stack empties.
 */

type Entry = { onBack: () => void }

const handlers: Entry[] = []
let guarded = false
let ignore = 0
let installed = false
let dropTimer: number | undefined

function ensureGuard() {
  if (dropTimer !== undefined) {
    // A step arrived before the pending drop ran (React remounting an effect,
    // or one sheet closing as another opens): keep the guard we already have.
    window.clearTimeout(dropTimer)
    dropTimer = undefined
  }
  if (guarded) return
  window.history.pushState({ capacityGuard: true }, '')
  guarded = true
}

/**
 * Removing the guard is deferred a tick and cancelled if anything needs it
 * again, so a close-then-reopen never costs a history.back() at all.
 */
function scheduleDrop() {
  if (dropTimer !== undefined) window.clearTimeout(dropTimer)
  dropTimer = window.setTimeout(() => {
    dropTimer = undefined
    if (handlers.length || !guarded) return
    guarded = false
    ignore += 1
    window.history.back()
  }, 0)
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore -= 1
      return
    }
    // The user pressed back, which moved the browser off our guard.
    guarded = false
    handlers.pop()?.onBack()
    if (handlers.length) ensureGuard()
  })
}

/** Register a back step. The returned function withdraws it when the UI closes it instead. */
export function pushBack(onBack: () => void): () => void {
  install()
  const entry: Entry = { onBack }
  handlers.push(entry)
  ensureGuard()
  return () => {
    const i = handlers.lastIndexOf(entry)
    if (i === -1) return // already consumed by a back press
    handlers.splice(i, 1)
    if (!handlers.length) scheduleDrop()
  }
}

/** Ties a back step to something that is open while `active` is true. */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack)
  latest.current = onBack
  useEffect(() => {
    if (!active) return
    return pushBack(() => latest.current())
  }, [active])
}
