"use client"

import { useCallback, useEffect, useState } from "react"

import { apiGet } from "@/lib/api-client"

export interface UseApiDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

interface AsyncState<T> {
  path: string | null
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Fetch `path` (unwrapped from `{ data }`) with loading/error state.
 * - `path === null` → idle (data null, loading false, no request).
 * - `refreshIntervalMs` → poll in the background (errors during polling are silent).
 * - `refetch()` re-runs the fetch.
 *
 * Displayed values are DERIVED from the stored path, so switching paths never
 * shows stale data and no state is set synchronously inside effects.
 */
export function useApiData<T>(path: string | null, refreshIntervalMs?: number): UseApiDataResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ path: null, data: null, loading: false, error: null })
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!path) return

    let active = true
    apiGet<T>(path)
      .then((result) => {
        if (!active) return
        setState({ path, data: result, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (!active) return
        setState({
          path,
          data: null,
          loading: false,
          error: e instanceof Error ? e.message : "Request failed. Please try again.",
        })
      })

    let timer: ReturnType<typeof setInterval> | undefined
    if (refreshIntervalMs && refreshIntervalMs > 0) {
      timer = setInterval(() => {
        apiGet<T>(path)
          .then((result) => {
            if (!active) return
            setState({ path, data: result, loading: false, error: null })
          })
          .catch(() => {
            /* silent: polling errors should not surface as page errors */
          })
      }, refreshIntervalMs)
    }

    return () => {
      active = false
      if (timer) clearInterval(timer)
    }
  }, [path, refreshIntervalMs, tick])

  // Derived: while a new path is loading (or idle) never leak the previous path's data.
  const current: AsyncState<T> =
    state.path === path
      ? state
      : { path, data: null, loading: path !== null, error: null }

  return { data: current.data, loading: current.loading, error: current.error, refetch }
}
