/**
 * localStorage-backed user preferences.
 *
 * Only the settings the user deliberately edits live here, so a page refresh
 * does not throw the choice away. Keys share one prefix and carry a version
 * suffix so the shape can evolve without reading back stale values; every read
 * is validated by the caller's guard, so a corrupted or hand-edited entry falls
 * back instead of poisoning the UI.
 */

const PREFIX = 'dsh-session-budget:pref:'
const VERSION = 1

const keyOf = (key: string): string => `${PREFIX}${key}:v${VERSION}`

export function loadPref<T>(key: string, isValid: (value: unknown) => boolean, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(keyOf(key))
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    return isValid(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(keyOf(key), JSON.stringify(value))
  } catch {
    // Quota / private-mode failures must never break the UI.
  }
}
