/**
 * Session usage, read from the local DSH session logs.
 *
 * One record per `assistant/message` event that carries `usage`. Both host
 * generations are supported: legacy hosts return the whole log from
 * `readFrom(id, 0)`, handle-era hosts expose `open(id, 'read')` with slice
 * reads that must be looped until an empty slice and then closed.
 *
 * The per-turn figure is folded by turn identity (falling back to the final
 * message id) so a turn that made forty tool-call steps stays one row, with
 * `lastCallTokens` describing the context after the turn rather than billing
 * forty re-sent prompts as if they were the context.
 */
import { isValidSessionId, type SessionModelUsage, type SessionUsageData, type SessionUsageResponse } from './contract.ts'
import type { SessionEventFace, SessionPersistenceFace } from './context.ts'
import { costOf } from './pricing.ts'

function errorMessage(err: unknown): string {
  return (err as { message?: string } | null)?.message ?? String(err)
}

/** The session's own title, folded from its log: `session/title` events are
 *  append-only and the last one wins. */
function titleOf(events: readonly SessionEventFace[], id: string): string {
  let title = ''
  for (const ev of events) {
    if (ev?.type !== 'session/title') continue
    const next = ev.data?.title
    if (typeof next === 'string' && next !== '') title = next
  }
  return title !== '' ? title : `Session ${id.slice(0, 8)}`
}

/**
 * Read one session's full event log across host generations. One shared path
 * so every outcome (success or failure) closes the handle exactly once.
 */
async function readSessionEvents(persistence: SessionPersistenceFace, id: string): Promise<SessionEventFace[]> {
  if (typeof persistence.open === 'function') {
    const handle = await persistence.open(id, 'read')
    try {
      const events: SessionEventFace[] = []
      for (;;) {
        const slice = await handle.read(events.length)
        const batch = slice.events ?? []
        if (batch.length === 0) return events
        // Loop, not spread: one slice can carry a whole long session and
        // `push(...batch)` would overflow the call-argument stack.
        for (const event of batch) events.push(event)
      }
    } finally {
      // A read handle has nothing durable to drain, and a close failure
      // must not mask the read's result or error.
      try { await handle.close() } catch { /* nothing to drain */ }
    }
  }
  if (persistence.readFrom === undefined) {
    throw new Error('host sessionPersistence exposes neither open() nor readFrom()')
  }
  const { events } = await persistence.readFrom(id, 0)
  return [...(events ?? [])]
}

interface ModelBucket {
  input: number
  output: number
  cache: number
  total: number
  cost: number
  calls: number
}

interface TurnBucket {
  messageId: string
  total: number
  cost: number
  calls: number
  lastCallTokens: number
  peakCallTokens: number
}

/** Usage for exactly one session, keyed by its id. */
export async function readSessionUsage(
  persistence: SessionPersistenceFace | undefined,
  sessionId: string,
): Promise<SessionUsageResponse> {
  if (persistence === undefined) return { ok: false, error: 'session persistence unavailable' }
  if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, error: 'missing session id' }
  // Defense in depth: the route already rejects a malformed `id` before this
  // function runs, but the same check is repeated here so a direct caller
  // cannot reach the log read with a path-shaped value.
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'invalid session id' }

  let events: SessionEventFace[]
  try {
    events = await readSessionEvents(persistence, sessionId)
  } catch (err) {
    return { ok: false, error: `failed to read session log: ${errorMessage(err)}` }
  }

  const modelTotals = new Map<string, ModelBucket>()
  const turnTotals = new Map<string, TurnBucket>()
  let provider = ''
  let model = ''
  let total = 0
  let cost = 0
  let calls = 0
  let firstActive: number | null = null
  let lastActive: number | null = null

  for (const ev of events) {
    if (ev?.type === 'request/header') {
      const cfg = ev.data?.header?.config
      if (cfg?.provider !== undefined && cfg?.model !== undefined) {
        provider = cfg.provider
        model = cfg.model
      }
      continue
    }
    if (ev?.type !== 'assistant/message') continue
    const usage = ev.data?.usage
    if (usage === undefined) continue

    const values = [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens]
      .map(value => (value === undefined ? 0 : Number(value)))
    if (typeof ev.time !== 'number' || !Number.isFinite(ev.time) || values.some(value => !Number.isFinite(value) || value < 0)) {
      continue
    }
    const [input = 0, output = 0, cache = 0] = values
    const eventTotal = input + output + cache
    const eventCost = costOf(ev.time, model, input, cache, output)

    const modelKey = `${provider}/${model}`
    const bucket = modelTotals.get(modelKey)
      ?? { input: 0, output: 0, cache: 0, total: 0, cost: 0, calls: 0 }
    bucket.input += input
    bucket.output += output
    bucket.cache += cache
    bucket.total += eventTotal
    bucket.cost += eventCost
    bucket.calls += 1
    modelTotals.set(modelKey, bucket)

    total += eventTotal
    cost += eventCost
    calls += 1
    if (firstActive === null || ev.time < firstActive) firstActive = ev.time
    if (lastActive === null || ev.time > lastActive) lastActive = ev.time

    const rawMessageId = ev.data?.message?.id
    if (typeof rawMessageId === 'string' && rawMessageId !== '') {
      const rawTurn = ev.data?.turn
      const key = typeof rawTurn === 'number' && Number.isFinite(rawTurn) ? `turn:${rawTurn}` : `message:${rawMessageId}`
      const turn = turnTotals.get(key)
        ?? { messageId: rawMessageId, total: 0, cost: 0, calls: 0, lastCallTokens: 0, peakCallTokens: 0 }
      turn.messageId = rawMessageId
      turn.total += eventTotal
      turn.cost += eventCost
      turn.calls += 1
      turn.lastCallTokens = eventTotal
      turn.peakCallTokens = Math.max(turn.peakCallTokens, eventTotal)
      turnTotals.set(key, turn)
    }
  }

  const models: SessionModelUsage[] = [...modelTotals.entries()]
    .map(([modelKey, bucket]): SessionModelUsage => {
      const slash = modelKey.indexOf('/')
      return {
        provider: slash < 0 ? '' : modelKey.slice(0, slash),
        model: slash < 0 ? modelKey : modelKey.slice(slash + 1),
        ...bucket,
      }
    })
    .sort((a, b) => b.cost - a.cost)

  const data: SessionUsageData = {
    sessionId,
    title: titleOf(events, sessionId),
    total,
    cost,
    calls,
    firstActive,
    lastActive,
    models,
    turns: [...turnTotals.values()],
  }
  return { ok: true, data }
}
