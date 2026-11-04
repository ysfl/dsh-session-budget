/** Package-local stores for the two settings the badge exposes. Every value is
 *  persisted (see ./prefs.ts), so a choice survives a page refresh. */
import { loadPref, savePref } from './prefs.ts'

export interface Store<T> {
  get(): T
  set(value: T): void
  subscribe(fn: () => void): () => void
}

function createStore<T>(key: string, isValid: (value: unknown) => boolean, fallback: T): Store<T> {
  let current = loadPref<T>(key, isValid, fallback)
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (value: T) => {
      current = value
      savePref(key, value)
      for (const listener of [...listeners]) listener()
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

/**
 * Minutes of inactivity after which the next step is assumed to re-read its
 * prefix at cache-miss price. The provider publishes no prefix-cache TTL, so
 * 180 (three hours) is a **guess**, and this pref is how a user changes it
 * without a rebuild.
 */
export const cacheExpiryMinutesStore = createStore<number>(
  'session.cacheExpiryMinutes',
  (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value > 0,
  180,
)

/**
 * How much one session may cost before the badge suggests a handoff. 0 (the
 * default) leaves the check off: a sensible per-session amount depends on the
 * user's plan, so there is no honest universal default.
 */
export const sessionCostBudgetStore = createStore<number>(
  'session.costBudget',
  (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  0,
)
