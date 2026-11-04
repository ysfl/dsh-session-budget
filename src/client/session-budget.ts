/**
 * Session budget: turn the host's public session-usage figures into a wrap-up
 * verdict, across the dimensions that actually decide one.
 *
 * An earlier version keyed off one number — 150 model calls. That ceiling is a
 * proxy, not the thing itself:
 * what makes a session expensive and forgetful is how much context every step
 * re-sends, whether that prefix is cached, and whether the context has already
 * been compacted. Steps only count once the context is heavy (measured: a
 * 292-call session at 36% of the window and 99.7% cache hits was healthy);
 * the switch to a new session happens when a dimension says it is time, not
 * when a counter hits a round number.
 *
 * Cost arithmetic behind the design (CNY per 1M tokens, see src/pricing.ts):
 * re-sending a 300K prefix costs ¥0.012 at the flash cache-hit rate (0.04) but
 * ¥0.60 at the cache-miss rate (2.00) — fifty times more. So "30万 tokens per
 * step" is not the waste; the miss rate is. Every step does re-send the whole
 * prefix (that is how the model works), which is why the cache dimension exists.
 */

/**
 * The host's configured window for the models this plugin prices
 * (`contextWindow: 1000000` in the web profile's llm config). A per-model value
 * would need a host API the plugin contract does not expose, so this is the
 * documented default and the one place to change it.
 */
export const CONTEXT_WINDOW_TOKENS = 1_000_000

/** Context share of the window at which a handoff is worth starting. */
export const CONTEXT_WARN_RATIO = 0.5

/** Context share at which the next steps are mostly drag. */
export const CONTEXT_OVER_RATIO = 0.75

import { ratesAt } from '../pricing.ts'
import type { LocaleKey } from './locales.ts'

/** Model calls at which the spec's experience ceiling warns. */
export const SESSION_STEP_WARN = 150

/** Model calls at which the spec says stop starting anything new. */
export const SESSION_STEP_OVER = 300

/** Cache hit rate under which every step is paying near full price again. */
export const CACHE_RATE_WARN = 0.5

/** A turn whose prompt drops below this share of the previous peak means the
 *  host compacted the context — facts were dropped, whatever the counters say. */
export const COMPACTION_DROP_RATIO = 0.6

/**
 * Idle time after which the next step is assumed to re-read its prefix at
 * cache-miss price.
 *
 * DeepSeek does not publish a prefix-cache TTL, so 3 hours is a **guess** and
 * deliberately user-editable (see `cacheExpiryMinutesStore`). Being wrong here
 * only changes when the reminder shows, never the numbers it shows.
 */
export const CACHE_EXPIRY_MINUTES_DEFAULT = 180

/** How many recent turns the step-cost slope compares. */
export const STEP_SLOPE_WINDOW = 10

export type SessionBudgetStatus = 'ok' | 'warn' | 'over'

export type SessionBudgetReason = 'context' | 'compaction' | 'steps' | 'cache' | 'idle' | 'cost'

/** One completed turn, reduced to what the verdict reads. */
export interface TurnPoint {
  /** Tokens billed across every step of this turn — NOT a context size. */
  total: number
  /**
   * Size of the turn's final model call (prompt + its output): the context the
   * next step would carry. Preferred over `total` whenever present, because a
   * turn that made 40 calls bills ~40 prompts while the context stays one.
   */
  lastCallTokens?: number
  /** Model calls folded into this turn; also the fallback context divisor. */
  calls?: number
  /** Estimated cost of this turn, in CNY. */
  cost?: number
}

export interface SessionBudgetInput {
  /** Cumulative tokens in the session (input + output + cache). */
  tokens: number
  /** Completed turns. */
  turns: readonly TurnPoint[]
  /** Assistant usage records, i.e. model calls. The step proxy. */
  calls: number
  /** Prompt-cache hit share over the session; omit when unknown. */
  cacheRate?: number
  /** Context window override; defaults to CONTEXT_WINDOW_TOKENS. */
  window?: number
  /** Total output tokens in the session; omit when unknown. */
  output?: number
  /** Minutes since the session's last usage record; null when unknown. */
  idleMinutes?: number | null
  /** Cache-expiry assumption in minutes; defaults to CACHE_EXPIRY_MINUTES_DEFAULT. */
  cacheExpiryMinutes?: number
  /** Estimated cost of this session in CNY. */
  cost?: number
  /** Per-session cost the user is willing to let one session reach; 0 disables. */
  costBudget?: number
}

export interface SessionBudgetReasonDetail {
  code: SessionBudgetReason
  level: SessionBudgetStatus
}

export interface SessionBudgetSnapshot {
  tokens: number
  /** Turn count (the "轮数" the badge shows). */
  turns: number
  calls: number
  status: SessionBudgetStatus
  /** Context size at the latest step, i.e. what the next step re-sends. */
  contextTokens: number
  /** `contextTokens` as a share of the window. */
  contextRatio: number
  /** Tokens the latest step added over the previous one (negative after a compaction). */
  growth: number
  /** Whether a prompt collapse suggests the host compacted the context. */
  compaction: boolean
  /** How many collapses were seen — a session compacted twice is overdue. */
  compactions: number
  cacheRate: number | null
  /** Estimated session cost in CNY. */
  cost: number
  /** The per-session budget in force (0 = not set). */
  costBudget: number
  /** Minutes since the session's last usage record, when known. */
  idleMinutes: number | null
  /** The expiry assumption actually used. */
  cacheExpiryMinutes: number
  /** Output tokens as a share of every token the session spent (0..1). */
  outputShare: number
  /** Average output tokens per model call. */
  outputPerCall: number
  /** Average cost of the most recent turns, and of the turns before those. */
  stepCostRecent: number
  stepCostEarlier: number
  /** Relative change between the two, e.g. 0.4 for "+40%". */
  stepCostChange: number
  /** Every dimension that fired, worst first. */
  reasons: SessionBudgetReasonDetail[]
}

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0)


const rank: Record<SessionBudgetStatus, number> = { ok: 0, warn: 1, over: 2 }

/**
 * The context size a turn ended with. Prefers the final call's own size; falls
 * back to the turn's average per call for responses from an older host.
 */
export function contextTokensOf(turn: TurnPoint | undefined): number {
  if (turn === undefined) return 0
  if (turn.lastCallTokens !== undefined && Number.isFinite(turn.lastCallTokens)) return count(turn.lastCallTokens)
  const calls = count(turn.calls ?? 1)
  return calls > 0 ? count(turn.total) / calls : count(turn.total)
}

/** How many prompt collapses between turns suggest the context was compacted. */
export function compactionsOf(turns: readonly TurnPoint[]): number {
  let peak = 0
  let index = 0
  let drops = 0
  for (const turn of turns) {
    const total = contextTokensOf(turn)
    // Ignore the first few steps: a session legitimately starts small.
    if (index >= 3 && peak > 0 && total < peak * COMPACTION_DROP_RATIO) {
      drops += 1
      // Re-baseline from the compacted size so one compaction is not counted
      // again on every following step.
      peak = total
    }
    if (total > peak) peak = total
    index += 1
  }
  return drops
}

/** Whether any collapse was seen (kept for callers that only ask the yes/no). */
export const compactionOf = (turns: readonly TurnPoint[]): boolean => compactionsOf(turns) > 0

/** Classify one session against all four wrap-up dimensions. */
export function sessionBudget(input: SessionBudgetInput): SessionBudgetSnapshot {
  const tokens = count(input.tokens)
  const calls = count(input.calls)
  const turns = input.turns.length
  const window = (input.window ?? CONTEXT_WINDOW_TOKENS) > 0 ? (input.window ?? CONTEXT_WINDOW_TOKENS) : CONTEXT_WINDOW_TOKENS
  const last = input.turns.at(-1)
  const previous = input.turns.at(-2)
  const contextTokens = contextTokensOf(last)
  const contextRatio = contextTokens / window
  const growth = previous === undefined ? contextTokens : contextTokens - contextTokensOf(previous)
  const compaction = compactionOf(input.turns)
  const compactions = compactionsOf(input.turns)
  const idleMinutes = input.idleMinutes === undefined || input.idleMinutes === null || !Number.isFinite(input.idleMinutes)
    ? null
    : Math.max(0, input.idleMinutes)
  const cacheExpiryMinutes = (input.cacheExpiryMinutes ?? CACHE_EXPIRY_MINUTES_DEFAULT) > 0
    ? (input.cacheExpiryMinutes ?? CACHE_EXPIRY_MINUTES_DEFAULT)
    : CACHE_EXPIRY_MINUTES_DEFAULT
  // A missing or non-finite rate means "unknown", never "zero": a false 0%
  // would claim every step is paying full price.
  const cost = count(input.cost ?? 0)
  const cacheRate = input.cacheRate === undefined || !Number.isFinite(input.cacheRate)
    ? null
    : Math.min(1, Math.max(0, input.cacheRate))

  const reasons: SessionBudgetReasonDetail[] = []
  if (contextRatio >= CONTEXT_OVER_RATIO) reasons.push({ code: 'context', level: 'over' })
  else if (contextRatio >= CONTEXT_WARN_RATIO) reasons.push({ code: 'context', level: 'warn' })

  // A compaction answers the question by itself: the session has already lost
  // facts, and the next one starts from a handoff instead of a trimmed history.
  if (compaction) reasons.push({ code: 'compaction', level: 'over' })

  // Step count is NOT a trigger on its own. Measured on a real 292-call session
  // that was perfectly healthy (36% of the window, 99.7% cache hits, no
  // compaction), a bare 150-call rule nags exactly the sessions that need it
  // least. Steps only count once the context is already heavy — the case where
  // every extra step really does re-send a big prefix.
  if (contextRatio >= CONTEXT_WARN_RATIO && calls >= SESSION_STEP_WARN) {
    reasons.push({ code: 'steps', level: calls >= SESSION_STEP_OVER ? 'over' : 'warn' })
  }

  if (cacheRate !== null && cacheRate < CACHE_RATE_WARN) reasons.push({ code: 'cache', level: 'warn' })

  // Idle time is a forward-looking warning: the next step may pay full price.
  if (idleMinutes !== null && idleMinutes >= cacheExpiryMinutes) reasons.push({ code: 'idle', level: 'warn' })

  // Money is the one dimension with no universal default: the user says what a
  // single session is worth, and 0 keeps the check off.
  const budget = count(input.costBudget ?? 0)
  if (budget > 0 && cost >= budget) reasons.push({ code: 'cost', level: 'warn' })

  reasons.sort((a, b) => rank[b.level] - rank[a.level])
  const status: SessionBudgetStatus = reasons.length === 0 ? 'ok' : reasons[0].level

  // Output is priced four times the input rate and two hundred times the
  // cache-hit rate (8 vs 2 vs 0.04 CNY/1M for flash), so its token share is the
  // first thing to read when asking "what is this session made of".
  const outputs = input.output === undefined || !Number.isFinite(input.output) ? null : count(input.output)
  const outputShare = outputs === null || tokens === 0 ? 0 : Math.min(1, outputs / tokens)
  const outputPerCall = outputs === null || calls === 0 ? 0 : outputs / calls

  // Slope: last N turns against the N before them, so a session that is getting
  // dearer per step says so before the counters look alarming.
  const costs = input.turns.map(turn => count(turn.cost ?? 0))
  // Two full windows when the session is long enough; otherwise split what
  // exists in half, so a 8-turn session still reports a direction instead of
  // "not enough turns" — the row is read live, not only at wrap-up.
  const recent = costs.length >= STEP_SLOPE_WINDOW * 2
    ? costs.slice(-STEP_SLOPE_WINDOW)
    : costs.slice(Math.floor(costs.length / 2))
  const earlier = costs.length >= STEP_SLOPE_WINDOW * 2
    ? costs.slice(-STEP_SLOPE_WINDOW * 2, -STEP_SLOPE_WINDOW)
    : costs.slice(0, Math.floor(costs.length / 2))
  const average = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
  const stepCostRecent = average(recent)
  const stepCostEarlier = average(earlier)
  const stepCostChange = stepCostEarlier > 0 ? (stepCostRecent - stepCostEarlier) / stepCostEarlier : 0

  return {
    tokens,
    turns,
    calls,
    status,
    contextTokens,
    contextRatio,
    growth,
    compaction,
    compactions,
    cost,
    costBudget: budget,
    cacheRate,
    idleMinutes,
    cacheExpiryMinutes,
    outputShare,
    outputPerCall,
    stepCostRecent,
    stepCostEarlier,
    stepCostChange,
    reasons,
  }
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** Local calendar date as `YYYY-MM-DD`, the handoff file's naming form. */
export const ymd = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Token volume split the way DeepSeek bills it. */
export interface TokenSplit {
  input: number
  output: number
  cache: number
}

export type TokenKind = keyof TokenSplit

export interface TokenPercent {
  input: number
  output: number
  cache: number
}

/**
 * Fold the per-model rows of a session into one split. The session response
 * carries no top-level input/output/cache totals, only the per-model rows, and
 * every row is already priced by the same estimator (see src/usage.ts).
 */
export function tokenSplitOf(models: readonly { input: number; output: number; cache: number }[]): TokenSplit {
  const split: TokenSplit = { input: 0, output: 0, cache: 0 }
  for (const model of models) {
    split.input += count(model.input)
    split.output += count(model.output)
    split.cache += count(model.cache)
  }
  return split
}

/**
 * Share of prompt tokens that hit the prefix cache — `cache / (input + cache)`,
 * the same formula the dashboard's cache card uses, because `input` counts
 * cache-miss tokens only (see src/usage.ts: total = input + output + cache).
 */
export function cacheHitRate(split: TokenSplit): number {
  const prompt = count(split.input) + count(split.cache)
  return prompt === 0 ? 0 : count(split.cache) / prompt
}

/**
 * Integer percentages that always add up to 100 — a three-way bar whose legend
 * reads 62 / 3 / 35 rather than 61.9 / 3.4 / 34.7. Leftover points go to the
 * largest fractional remainders (largest-remainder method), ties broken by the
 * fixed input → output → cache order so the result is deterministic.
 */
export function tokenShare(split: TokenSplit): TokenPercent {
  const parts: Array<{ key: TokenKind; share: number }> = [
    { key: 'input', share: count(split.input) },
    { key: 'output', share: count(split.output) },
    { key: 'cache', share: count(split.cache) },
  ]
  const total = parts.reduce((sum, part) => sum + part.share, 0)
  if (total === 0) return { input: 0, output: 0, cache: 0 }

  const exact = parts.map(part => ({ key: part.key, exact: (part.share / total) * 100 }))
  const result: TokenPercent = { input: 0, output: 0, cache: 0 }
  for (const part of exact) result[part.key] = Math.floor(part.exact)
  let leftover = 100 - (result.input + result.output + result.cache)
  const byRemainder = [...exact].sort((a, b) =>
    (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)))
  for (const part of byRemainder) {
    if (leftover <= 0) break
    result[part.key] += 1
    leftover -= 1
  }
  return result
}


const trimZero = (value: string): string => (value.endsWith('.0') ? value.slice(0, -2) : value)

/** Token volume in M/K units — the unit DSH users already read token budgets in,
 *  and the one the session budget spec quotes (400K per step, millions per session). */
export function fmtTokensM(value: number): string {
  const tokens = count(value)
  if (tokens >= 1_000_000) return `${trimZero((tokens / 1_000_000).toFixed(1))}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return String(Math.round(tokens))
}

/**
 * The message a one-click handoff sends. A template a human fills in asks the
 * wrong person to do the summarizing — the model already holds the session, so
 * the click hands it the six headings and the measured figures instead, and
 * forbids the two things that make a handoff useless: re-narrating history and
 * writing next steps that cannot be verified.
 */
export function handoffPrompt(input: {
  sessionId: string
  stats: string
  locale: 'zh' | 'en'
  /** Prefix the request with "this task is done" so the model stops adding scope. */
  taskDone?: boolean
}): string {
  if (input.locale === 'en') {
    return [
      input.taskDone === true
        ? 'This task is done. Write a handoff summary of this session so I can start the next one. Use these six headings, in this order:'
        : 'Write a handoff summary of this session so I can continue in a new one. Use these six headings, in this order:',
      '1. Goal — the one thing this session was doing',
      '2. Done — key files:lines, so the next session never re-reads whole files',
      '3. Current state — works / half-built / the exact error text',
      '4. Known traps — what was tried and failed, so it is not retried',
      '5. Next — at most 3 items, each verifiable',
      '6. Do not touch — other repos and anyone else\'s uncommitted work',
      '',
      'Only state what actually happened in this session: no re-narrating history, no speculation, no filler.',
      `Session ${input.sessionId}: ${input.stats}.`,
      'Stop after writing it and wait for me to confirm.',
    ].join('\n')
  }
  return [
    input.taskDone === true
      ? '这次任务已经完成。按 12 行交接格式汇总本会话，我要开新会话做下一件事，用这六个标题、按这个顺序：'
      : '按 12 行交接格式汇总本会话，我要开新会话继续，用这六个标题、按这个顺序：',
    '1. 目标——这次只做这一件',
    '2. 已完成——关键文件:行号，让下个会话不用重读整文件',
    '3. 当前状态——能跑 / 半成品 / 失败报错原文',
    '4. 已知坑——试过且不行的，别再试',
    '5. 下一步——最多 3 条，每条可验证',
    '6. 不要碰——其他仓库、别人未提交的改动',
    '',
    '只写这次会话里实际发生的事：不要复述历史、不要推测、不要写空话。',
    `本会话 ${input.sessionId}：${input.stats}。`,
    '写完就停下等我确认。',
  ].join('\n')
}

/**
 * The one line a narrow surface (the composer dock, the badge tooltip) can show:
 * the worst dimension in plain words, not the counter that happened to trip.
 */
export function sessionBudgetReasonText(
  snapshot: SessionBudgetSnapshot,
  t: (key: LocaleKey, params?: Record<string, unknown>) => string,
): { title: string; code: SessionBudgetReason | null } {
  const top = snapshot.reasons[0]
  if (top === undefined) return { title: '', code: null }
  const percent = Math.round(snapshot.contextRatio * 100)
  switch (top.code) {
    case 'context':
      return { title: t('reason.context', { percent }), code: top.code }
    case 'compaction':
      return { title: t('reason.compaction'), code: top.code }
    case 'steps':
      return { title: t('reason.steps', { calls: snapshot.calls }), code: top.code }
    case 'cache':
      return { title: t('reason.cache', { percent: Math.round((snapshot.cacheRate ?? 0) * 100) }), code: top.code }
    case 'cost':
      return { title: t('reason.cost', { cost: snapshot.cost.toFixed(2), budget: snapshot.costBudget.toFixed(2) }), code: top.code }
    case 'idle':
      return {
        title: t('reason.idle', {
          hours: ((snapshot.idleMinutes ?? 0) / 60).toFixed(1),
          threshold: (snapshot.cacheExpiryMinutes / 60).toFixed(1),
        }),
        code: top.code,
      }
    default:
      return { title: '', code: null }
  }
}

/** What each token bucket of a session cost, estimated with the rates in force. */
export interface CostSplit {
  hit: number
  miss: number
  output: number
  total: number
  /** Output's share of the money, which is what a wrap-up decision cares about. */
  outputShare: number
}

/**
 * Price the three buckets separately. The whole session is priced with the
 * rates in force at its last activity: a session that straddled a price change
 * would be off by the difference, and no session is long enough for that to
 * matter more than the order of magnitude it communicates.
 */
export function costSplitOf(split: TokenSplit, model: string, timeMs: number): CostSplit {
  const rates = ratesAt(timeMs, model)
  const hit = (count(split.cache) * rates.cacheHit) / 1_000_000
  const miss = (count(split.input) * rates.input) / 1_000_000
  const output = (count(split.output) * rates.output) / 1_000_000
  const total = hit + miss + output
  return { hit, miss, output, total, outputShare: total === 0 ? 0 : output / total }
}
