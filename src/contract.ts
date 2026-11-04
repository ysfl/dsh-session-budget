/** Wire contracts shared by the host API and the client fetchers. */

/** One balance bucket returned by the provider (usually one currency). */
export interface BalanceInfo {
  currency: string
  total: string
  granted: string
  toppedUp: string
}

export interface BalanceData {
  isAvailable: boolean
  balances: BalanceInfo[]
}

export interface BalanceResponse {
  ok: boolean
  error?: string
  data?: BalanceData
}

/** CNY per 1M tokens for one model tier. */
export interface PricingRates {
  cacheHit: number
  input: number
  output: number
}

/** One model's contribution to a single session's bill. */
export interface SessionModelUsage {
  provider: string
  model: string
  input: number
  output: number
  cache: number
  total: number
  cost: number
  calls: number
}

/** One completed conversation turn's usage. `messageId` is the durable id of
 *  the turn's final assistant message — the same identity the chat action-strip
 *  slot exposes to client plugins. Tool-call steps inside the turn are folded
 *  into this one figure rather than shown as misleading separate charges. */
export interface TurnUsage {
  messageId: string
  total: number
  cost: number
  calls: number
  /**
   * Size of the turn's final model call (prompt + that call's output): the
   * closest public reading of the context size after this turn. `total` sums
   * every step in the turn, so it grows with the step count, not with the
   * context. Absent on responses from a host that predates this field.
   */
  lastCallTokens?: number
  /** Largest single call inside the turn, for callers that want the peak. */
  peakCallTokens?: number
}

/** Usage for exactly one session, read from its local log. */
export interface SessionUsageData {
  sessionId: string
  /** The session's own title from its log; falls back to a short id. */
  title: string
  total: number
  cost: number
  calls: number
  /** Epoch ms of the first/last valid usage record in this session, or null
   *  when the session has produced no usage yet. */
  firstActive: number | null
  lastActive: number | null
  /** Most expensive model first. */
  models: SessionModelUsage[]
  /** Completed turns, in log order, addressed by their final message id. */
  turns: TurnUsage[]
}

export interface SessionUsageResponse {
  ok: boolean
  error?: string
  data?: SessionUsageData
}

/**
 * Session ids observed in this codebase (host-issued) are plain ASCII-safe
 * tokens. No documented format contract exists outside the host, so this is a
 * defensive charset whitelist: letters, digits, `-`, `_` only, with a generous
 * length cap. It stops path-separator / `..` / null-byte payloads from ever
 * reaching the session-log read — `id` arrives verbatim from the browser's
 * `?id=` query parameter.
 */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export const isValidSessionId = (id: string): boolean => SESSION_ID_PATTERN.test(id)
