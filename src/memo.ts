/**
 * Tiny TTL memo for the two host data sources.
 *
 * The balance endpoint is a network call and a panel can be opened several
 * times in a minute; the session route is cheap but a reload storm from two
 * mounted surfaces should still read one log. `refresh()` bypasses the TTL for
 * an explicit "show me now" click (`?refresh=1`); concurrent callers share one
 * in-flight load so a double mount never doubles the work.
 */
export interface Memo<T> {
  get(): Promise<T>
  refresh(): Promise<T>
}

export function memoize<T>(ttlMs: number, load: () => Promise<T>): Memo<T> {
  let at = 0
  let value: T | undefined
  let inflight: Promise<T> | null = null

  const run = (): Promise<T> => {
    if (inflight === null) {
      inflight = load().finally(() => {
        inflight = null
      })
    }
    return inflight
  }

  return {
    async get() {
      if (value !== undefined && Date.now() - at < ttlMs) return value
      const next = await run()
      value = next
      at = Date.now()
      return next
    },
    async refresh() {
      if (inflight !== null) return inflight
      const next = await run()
      value = next
      at = Date.now()
      return next
    },
  }
}
