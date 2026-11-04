/**
 * Same-origin fetchers for the host half's `/session` and `/balance` payloads,
 * backed by package-local memory caches.
 *
 * Session usage stays memory-only: the badge and the composer dock read the
 * same latest figure without persisting one entry per session. Balance keeps
 * one entry with a 60 s TTL (mirroring the host memo). Non-force calls made
 * while an identical one is in flight join it instead of firing a second
 * request — the common case is both surfaces mounting in the same render.
 */
import type { BalanceResponse, SessionUsageResponse } from '../contract.ts'

const BALANCE_TTL_MS = 60_000

let balanceCache: { at: number; data: BalanceResponse } | null = null
let balanceInflight: Promise<BalanceResponse> | null = null

const sessionUsageInflight = new Map<string, Promise<SessionUsageResponse>>()
const sessionUsageCache = new Map<string, SessionUsageResponse>()
const sessionUsageListeners = new Map<string, Set<() => void>>()

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` } as unknown as T
  }
  return res.json() as Promise<T>
}

export const getCachedSessionUsage = (sessionId: string): SessionUsageResponse | null =>
  sessionUsageCache.get(sessionId) ?? null

export const subscribeSessionUsage = (sessionId: string, fn: () => void): (() => void) => {
  let listeners = sessionUsageListeners.get(sessionId)
  if (listeners === undefined) {
    listeners = new Set()
    sessionUsageListeners.set(sessionId, listeners)
  }
  listeners.add(fn)
  return () => {
    listeners?.delete(fn)
    if (listeners?.size === 0) sessionUsageListeners.delete(sessionId)
  }
}

const publishSessionUsage = (sessionId: string, response: SessionUsageResponse): void => {
  if (!response.ok) return
  sessionUsageCache.set(sessionId, response)
  for (const listener of [...(sessionUsageListeners.get(sessionId) ?? [])]) listener()
}

export async function fetchSessionUsage(sessionId: string, force = false): Promise<SessionUsageResponse> {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return { ok: false, error: 'missing session id' }
  }
  if (!force) {
    const inflight = sessionUsageInflight.get(sessionId)
    if (inflight !== undefined) return inflight
  }
  const task = getJson<SessionUsageResponse>(`/api/dsh-session-budget/session?id=${encodeURIComponent(sessionId)}`)
    .then(response => {
      publishSessionUsage(sessionId, response)
      return response
    })
  if (force) return task
  const tracked = task.finally(() => {
    if (sessionUsageInflight.get(sessionId) === tracked) sessionUsageInflight.delete(sessionId)
  })
  sessionUsageInflight.set(sessionId, tracked)
  return tracked
}

/** Last cached balance (possibly stale), for an instant first render. */
export const getCachedBalance = (): BalanceResponse | null => balanceCache?.data ?? null

export async function fetchBalance(force = false): Promise<BalanceResponse> {
  if (!force && balanceCache !== null && Date.now() - balanceCache.at < BALANCE_TTL_MS) {
    return balanceCache.data
  }
  if (!force && balanceInflight !== null) return balanceInflight
  const task = getJson<BalanceResponse>(`/api/dsh-session-budget/balance${force ? '?refresh=1' : ''}`)
    .then(response => {
      if (response.ok) balanceCache = { at: Date.now(), data: response }
      return response
    })
  if (force) return task
  const tracked = task.finally(() => {
    if (balanceInflight === tracked) balanceInflight = null
  })
  balanceInflight = tracked
  return tracked
}
