/**
 * One session's usage plus its wrap-up verdict, read through the plugin's own
 * `/session` cache.
 *
 * Both handoff surfaces show the same numbers, so both read this hook instead of
 * duplicating the cache dance, the expiry pref and the idle clock. The idle
 * clock ticks so "idle 2.9h" becomes "idle 3.1h" without a data refresh.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessionUsageData } from '../contract.ts'
import type { UseSessionHook } from './context.ts'
import { fetchSessionUsage, getCachedSessionUsage, subscribeSessionUsage } from './api.ts'
import {
  cacheHitRate,
  sessionBudget,
  tokenSplitOf,
  type SessionBudgetSnapshot,
} from './session-budget.ts'
import { cacheExpiryMinutesStore, sessionCostBudgetStore } from './store.ts'

const cachedUsage = (sessionId: string): SessionUsageData | null => {
  const response = getCachedSessionUsage(sessionId)
  return response?.ok === true ? response.data ?? null : null
}

/** A session with no usage yet is still being written: keep retrying cheaply
 *  until the first turn lands instead of treating the empty read as final. */
const EMPTY_REFRESH_MS = 4_000

/** Bound on the empty-session retry. A blank session left open should not be
 *  polled forever; the turn-end refresh still covers a first prompt sent later. */
const MAX_EMPTY_RETRIES = 30

/** Read the Session's running flag without requiring the host to provide the
 *  hook (older hosts may omit it; the empty-session retry still applies). */
const NO_SESSION: UseSessionHook = () => undefined as never

/** Whether a model turn is in flight on this seat's Session. */
export function useSessionRunning(useSession: UseSessionHook | undefined): boolean {
  return (useSession ?? NO_SESSION)(state => state.running) === true
}

/**
 * Live session usage, refreshed on three triggers: mount, the end of a model
 * turn, and a cheap retry while the figure is still empty.
 *
 * The retry is the load-bearing one for new sessions: the host renders the
 * header utilities as soon as the first prompt is submitted, which is before
 * the first `assistant/message` carrying usage is written. A one-shot read
 * therefore always sees `calls: 0` and, without a retry, the badge would stay
 * hidden for the whole session (the panel that could force a refresh lives
 * behind the hidden badge).
 */
export function useSessionUsage(sessionId: string | undefined, running = false): SessionUsageData | null {
  const [data, setData] = useState<SessionUsageData | null>(
    () => (sessionId === undefined ? null : cachedUsage(sessionId)),
  )
  const emptyRetries = useRef(0)

  useEffect(() => {
    if (sessionId === undefined) {
      setData(null)
      return
    }
    emptyRetries.current = 0
    const read = (): void => setData(cachedUsage(sessionId))
    read()
    const unsubscribe = subscribeSessionUsage(sessionId, read)
    // The seed read is usually empty for a new session; the retry effect below
    // is what turns it into a visible badge.
    if (cachedUsage(sessionId) === null) void fetchSessionUsage(sessionId)
    return unsubscribe
  }, [sessionId])

  // A turn just settled: its usage record is readable now, so the badge and the
  // reminder dock stop showing the previous turn's numbers. The retry budget is
  // renewed too, in case the record lands a moment after the settle.
  const wasRunning = useRef(running)
  useEffect(() => {
    if (sessionId === undefined) {
      wasRunning.current = running
      return
    }
    if (wasRunning.current && !running) {
      emptyRetries.current = 0
      void fetchSessionUsage(sessionId)
    }
    wasRunning.current = running
  }, [sessionId, running])

  // No usage yet: poll at a human-visible cadence until the first turn is
  // recorded. Once a figure exists the interval retires and turn-end refreshes
  // take over, so a long session is not re-read on a timer.
  useEffect(() => {
    if (sessionId === undefined || (data !== null && data.calls > 0)) return
    const timer = setInterval(() => {
      if (emptyRetries.current >= MAX_EMPTY_RETRIES) {
        clearInterval(timer)
        return
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      emptyRetries.current += 1
      void fetchSessionUsage(sessionId)
    }, EMPTY_REFRESH_MS)
    return () => clearInterval(timer)
  }, [sessionId, data])

  return data
}

/** The cache-expiry assumption, kept in sync with the pref the user can edit. */
export function useCacheExpiryMinutes(): number {
  const [minutes, setMinutes] = useState(cacheExpiryMinutesStore.get())
  useEffect(
    () => cacheExpiryMinutesStore.subscribe(() => setMinutes(cacheExpiryMinutesStore.get())),
    [],
  )
  return minutes
}

/** The per-session cost budget, kept in sync with the pref the user can edit. */
export function useSessionCostBudget(): number {
  const [budget, setBudget] = useState(sessionCostBudgetStore.get())
  useEffect(
    () => sessionCostBudgetStore.subscribe(() => setBudget(sessionCostBudgetStore.get())),
    [],
  )
  return budget
}

export interface SessionVerdict {
  data: SessionUsageData | null
  snapshot: SessionBudgetSnapshot
}

const IDLE_TICK_MS = 30_000

/** Usage plus the dimensional wrap-up verdict for one session. */
export function useSessionVerdict(sessionId: string | undefined, running = false): SessionVerdict {
  const data = useSessionUsage(sessionId, running)
  const cacheExpiryMinutes = useCacheExpiryMinutes()
  const costBudget = useSessionCostBudget()
  const [now, setNow] = useState(() => Date.now())

  // Idle time has to move on its own: a reminder that says "idle 2h59m" forever
  // because no new token arrived would never fire the expiry dimension.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), IDLE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const snapshot: SessionBudgetSnapshot = (() => {
    if (data === null) {
      return sessionBudget({ tokens: 0, turns: [], calls: 0, cacheExpiryMinutes, costBudget })
    }
    const split = tokenSplitOf(data.models)
    return sessionBudget({
      tokens: data.total,
      turns: data.turns,
      calls: data.calls,
      cacheRate: cacheHitRate(split),
      output: split.output,
      idleMinutes: data.lastActive === null ? null : (now - data.lastActive) / 60_000,
      cacheExpiryMinutes,
      cost: data.cost,
      costBudget,
    })
  })()

  return { data, snapshot }
}
