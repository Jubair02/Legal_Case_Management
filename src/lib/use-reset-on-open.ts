"use client"

import { useState } from "react"

/**
 * Reset a dialog's form state whenever it opens (or its target record changes).
 *
 * Every dialog in the app previously did this in an effect:
 *
 *     useEffect(() => { if (!open) return; setName(x); ... }, [open, entity])
 *
 * which commits the stale values first and then immediately re-renders with
 * the fresh ones — a visible flash of the previous record's data, and the
 * cascading render `react-hooks/set-state-in-effect` warns about.
 *
 * This is the "adjusting state when a prop changes" pattern from the React
 * docs instead: the comparison happens during render, so React re-runs the
 * render with the new state before anything reaches the DOM. Updating a
 * component's *own* state during its render is explicitly supported.
 *
 * Pass a `key` that identifies what the form is currently editing — typically
 * `open ? (entity?.id ?? "new") : null`. Passing null (closed) resets nothing
 * but re-arms, so the next open fires `reset` again.
 */
export function useResetOnOpen(key: string | null, reset: () => void): void {
  const [previousKey, setPreviousKey] = useState<string | null>(null)
  if (key !== previousKey) {
    setPreviousKey(key)
    if (key !== null) reset()
  }
}
