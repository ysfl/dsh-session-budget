/**
 * One session's usage plus its wrap-up verdict, read through the plugin's own
 * `/session` cache.
 *
 * Both handoff surfaces show the same numbers, so both read this hook instead of
 * duplicating the cache dance, the expiry pref and the idle clock. The idle
 * clock ticks so "idle 2.9h" becomes "idle 3.1h" without a data refresh.
 */
import { useEffect, useState } from 'react'
import type { SessionUsageData } from '../contract.ts'
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

/** Live session usage; refreshes from the plugin's own cache and subscriptions. */
export function useSessionUsage(sessionId: string | undefined): SessionUsageData | null {
  const [data, setData] = useState<SessionUsageData | null>(
    () => (sessionId === undefined ? null : cachedUsage(sessionId)),
  )

  useEffect(() => {
    if (sessionId === undefined) {
      setData(null)
      return
    }
    setData(cachedUsage(sessionId))
    const unsubscribe = subscribeSessionUsage(sessionId, () => setData(cachedUsage(sessionId)))
    if (cachedUsage(sessionId) === null) void fetchSessionUsage(sessionId)
    return unsubscribe
  }, [sessionId])

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
export function useSessionVerdict(sessionId: string | undefined): SessionVerdict {
  const data = useSessionUsage(sessionId)
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
