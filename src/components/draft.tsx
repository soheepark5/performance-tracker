import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drafts for every logging form.
 *
 * A form is half-filled far more often than it is abandoned on purpose: a call
 * comes in, the phone locks, the sheet is swiped away or closed with the back
 * button. So each form's state is written to this device as it changes and
 * restored the next time the same form opens, until it is saved or discarded.
 *
 * Drafts are per device and never synced. They are unfinished thoughts, not
 * part of the record.
 */

const PREFIX = 'capacity.draft.'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Signing out wipes drafts, so the next person on this device never sees them. */
export function clearAllDrafts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

export interface Draft<T> {
  value: T
  set: (patch: Partial<T>) => void
  /** true when the form opened with unsaved input from last time */
  restored: boolean
  /** call after a successful save */
  clear: () => void
  /** throw the draft away and go back to the form's defaults */
  discard: () => void
}

/**
 * @param key     one key per form instance, e.g. `morning:2026-09-10` or
 *                `impulse:new` — reopening the same key restores the draft
 * @param initial the form's defaults, used when there is no draft
 */
export function useDraft<T extends object>(key: string, initial: () => T): Draft<T> {
  const [saved] = useState(() => read<T>(key))
  const [value, setValue] = useState<T>(() => (saved ? { ...initial(), ...saved } : initial()))
  const [restored, setRestored] = useState(saved != null)
  // Nothing is written until the user actually changes something, so merely
  // opening and closing a form never leaves a phantom draft behind.
  const touched = useRef(false)
  const initialRef = useRef(initial)

  useEffect(() => {
    if (!touched.current) return
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* storage full or unavailable: the form still works, just without a draft */
    }
  }, [key, value])

  const set = useCallback((patch: Partial<T>) => {
    touched.current = true
    setValue((v) => ({ ...v, ...patch }))
  }, [])

  const clear = useCallback(() => {
    touched.current = false
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignore */
    }
  }, [key])

  const discard = useCallback(() => {
    clear()
    setValue(initialRef.current())
    setRestored(false)
  }, [clear])

  return { value, set, restored, clear, discard }
}

export function DraftNote({ draft }: { draft: { restored: boolean; discard: () => void } }) {
  if (!draft.restored) return null
  return (
    <div className="draft-note">
      <span>Unsaved draft restored.</span>
      <button className="linkbtn" onClick={draft.discard}>Discard</button>
    </div>
  )
}
