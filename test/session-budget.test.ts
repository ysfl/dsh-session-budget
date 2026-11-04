import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CACHE_EXPIRY_MINUTES_DEFAULT,
  cacheHitRate,
  compactionOf,
  compactionsOf,
  contextTokensOf,
  costSplitOf,
  fmtTokensM,
  handoffPrompt,
  SESSION_STEP_OVER,
  SESSION_STEP_WARN,
  sessionBudget,
  tokenShare,
  tokenSplitOf,
  ymd,
} from '../src/client/session-budget.ts'
import { requestHandoff } from '../src/client/handoff.ts'

const turnsOf = (...totals: number[]) => totals.map(total => ({ total }))

test('a small session with a healthy cache stays ok', () => {
  const snapshot = sessionBudget({
    tokens: 1_200_000,
    turns: turnsOf(80_000, 120_000, 180_000),
    calls: 20,
    cacheRate: 0.9,
  })
  assert.equal(snapshot.status, 'ok')
  assert.deepEqual(snapshot.reasons, [])
  assert.equal(snapshot.contextTokens, 180_000)
  assert.equal(snapshot.growth, 60_000)
})

test('context pressure is its own dimension, independent of step count', () => {
  const atTwoHundredK = sessionBudget({
    tokens: 2_000_000, turns: turnsOf(200_000), calls: 5, cacheRate: 0.9,
  })
  assert.equal(atTwoHundredK.status, 'ok', '20% of a 1M window is not a reason to leave')

  const atHalfWindow = sessionBudget({ tokens: 0, turns: turnsOf(500_000), calls: 5, cacheRate: 0.9 })
  assert.equal(atHalfWindow.status, 'warn')
  assert.equal(atHalfWindow.reasons[0].code, 'context')

  const atThreeQuarters = sessionBudget({ tokens: 0, turns: turnsOf(760_000), calls: 5, cacheRate: 0.9 })
  assert.equal(atThreeQuarters.status, 'over')
})

test('a compacted context is the strongest signal', () => {
  // Peak 600K, then the host trims to 150K and the session keeps going.
  const snapshot = sessionBudget({
    tokens: 9_000_000,
    turns: turnsOf(200_000, 400_000, 600_000, 620_000, 150_000, 180_000),
    calls: 40,
    cacheRate: 0.9,
  })
  assert.equal(snapshot.compaction, true)
  assert.equal(snapshot.status, 'over')
  assert.equal(snapshot.reasons[0].code, 'compaction')
  assert.deepEqual(compactionOf(turnsOf(100_000, 200_000, 300_000)), false)
})

test('a low cache hit rate is reported even when nothing else fires', () => {
  const snapshot = sessionBudget({
    tokens: 3_000_000, turns: turnsOf(90_000, 120_000), calls: 30, cacheRate: 0.2,
  })
  assert.equal(snapshot.status, 'warn')
  assert.deepEqual(snapshot.reasons.map(r => r.code), ['cache'])
})

test('cumulative tokens alone never trigger a wrap-up', () => {
  const snapshot = sessionBudget({
    tokens: 26_300_000, turns: turnsOf(40_000, 45_000), calls: 12, cacheRate: 0.95,
  })
  assert.equal(snapshot.status, 'ok')
})

test('non-finite and negative figures collapse to a clean session', () => {
  const snapshot = sessionBudget({
    tokens: Number.NaN,
    turns: turnsOf(Number.NaN, -5),
    calls: -5,
    cacheRate: Number.POSITIVE_INFINITY,
  })
  assert.equal(snapshot.tokens, 0)
  assert.equal(snapshot.calls, 0)
  assert.equal(snapshot.contextTokens, 0)
  assert.equal(snapshot.status, 'ok')
  assert.equal(snapshot.cacheRate, null, 'a non-finite rate is unknown, not 0%')
})

test('token volume reads in M and K units for both locales', () => {
  assert.equal(fmtTokensM(12_345_678), '12.3M')
  assert.equal(fmtTokensM(1_000_000), '1M')
  assert.equal(fmtTokensM(999_400), '999K')
  assert.equal(fmtTokensM(820), '820')
  assert.equal(fmtTokensM(Number.NaN), '0')
})

test('handoff prompt hands the model the six headings and the measured figures', () => {
  const prompt = handoffPrompt({
    sessionId: 'session-abc123',
    stats: '累计 12.3M tokens · ¥ 13.40 · 47 轮 · 152 次模型调用',
    locale: 'zh',
  })
  for (const heading of ['目标', '已完成', '当前状态', '已知坑', '下一步', '不要碰']) {
    assert.ok(prompt.includes(heading), heading)
  }
  assert.ok(prompt.includes('session-abc123'))
  assert.ok(prompt.includes('12.3M tokens'))
  // The two instructions that keep a handoff usable.
  assert.ok(prompt.includes('不要复述历史'))
  assert.ok(prompt.includes('写完就停下等我确认'))
  assert.ok(!prompt.includes('# 交接：'), 'prompt must not be a fill-in template')
})

test('handoff prompt speaks English for an English session', () => {
  const prompt = handoffPrompt({
    sessionId: 'session-abc123',
    stats: '12.3M tokens · ¥ 13.40 · 47 turns · 152 model calls',
    locale: 'en',
  })
  assert.ok(prompt.includes('1. Goal'))
  assert.ok(prompt.includes('Stop after writing it'))
})

test('ymd pads a local calendar date into the handoff file naming form', () => {
  assert.equal(ymd(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.equal(ymd(new Date(2026, 10, 4, 0, 1)), '2026-11-04')
})

test('token split folds the per-model rows and ignores non-finite values', () => {
  const split = tokenSplitOf([
    { input: 100, output: 20, cache: 380 },
    { input: 5, output: Number.NaN, cache: -7 },
  ])
  assert.deepEqual(split, { input: 105, output: 20, cache: 380 })
})

test('token share rounds to integers that always add up to 100', () => {
  // 61.9 / 3.4 / 34.7 would print as 62 / 3 / 35 only if the leftover points
  // go to the largest remainders rather than being dropped.
  const share = tokenShare({ input: 619, output: 34, cache: 347 })
  assert.equal(share.input + share.output + share.cache, 100)
  assert.deepEqual(share, { input: 62, output: 3, cache: 35 })

  const even = tokenShare({ input: 1, output: 1, cache: 1 })
  assert.deepEqual(even, { input: 34, output: 33, cache: 33 })
})

test('token share reports an empty session as zero rather than NaN', () => {
  assert.deepEqual(tokenShare({ input: 0, output: 0, cache: 0 }), { input: 0, output: 0, cache: 0 })
})

test('token share keeps the total at 100 across lopsided splits', () => {
  const cases = [
    { input: 999_999, output: 1, cache: 0 },
    { input: 0, output: 0, cache: 12_345_678 },
    { input: 7, output: 11, cache: 13 },
  ]
  for (const split of cases) {
    const share = tokenShare(split)
    assert.equal(share.input + share.output + share.cache, 100, JSON.stringify(split))
  }
})

test('cache hit rate divides by prompt tokens, not by the session total', () => {
  // 380 hit of a 480-token prompt is 79.2%; dividing by total (400 + output)
  // would understate it and mix output volume into a prompt-cache metric.
  const rate = cacheHitRate({ input: 100, output: 20, cache: 380 })
  assert.equal(rate.toFixed(3), '0.792')
  assert.equal(cacheHitRate({ input: 0, output: 500, cache: 0 }), 0)
})

test('handoff respects a composer that already holds text', () => {
  const calls: Array<[string, string]> = []
  const inputActions = {
    setDraft: (text: string) => calls.push(['setDraft', text]),
    submit: () => calls.push(['submit', '']),
  }

  const blocked = requestHandoff({ inputActions, draft: '我还在写一半', prompt: 'PROMPT' })
  assert.equal(blocked, 'needs-replace')
  assert.deepEqual(calls, [], 'nothing may be written or sent without a second click')

  const sent = requestHandoff({ inputActions, draft: '我还在写一半', prompt: 'PROMPT', replace: true })
  assert.equal(sent, 'sent')
  assert.deepEqual(calls, [['setDraft', 'PROMPT'], ['submit', '']])
})

test('handoff on an empty composer is genuinely one click', () => {
  const calls: string[] = []
  const inputActions = {
    setDraft: () => calls.push('setDraft'),
    submit: () => calls.push('submit'),
  }
  assert.equal(requestHandoff({ inputActions, draft: '   ', prompt: 'PROMPT' }), 'sent')
  assert.deepEqual(calls, ['setDraft', 'submit'])
})

test('idle past the assumed cache expiry is its own warning, and the assumption is editable', () => {
  const base = { tokens: 2_000_000, turns: turnsOf(120_000, 130_000), calls: 20, cacheRate: 0.9 }
  const fresh = sessionBudget({ ...base, idleMinutes: 30 })
  assert.equal(fresh.status, 'ok')
  assert.deepEqual(fresh.reasons, [])

  const stale = sessionBudget({ ...base, idleMinutes: 181 })
  assert.equal(stale.status, 'warn')
  assert.deepEqual(stale.reasons.map(r => r.code), ['idle'])
  assert.equal(stale.cacheExpiryMinutes, CACHE_EXPIRY_MINUTES_DEFAULT)

  // The 3h figure is a guess: raising it must silence the same session.
  const relaxed = sessionBudget({ ...base, idleMinutes: 181, cacheExpiryMinutes: 600 })
  assert.equal(relaxed.status, 'ok')
})

test('compactions are counted, not just detected', () => {
  const turns = turnsOf(100_000, 300_000, 600_000, 150_000, 200_000, 240_000, 80_000)
  assert.equal(compactionsOf(turns), 2)
  const snapshot = sessionBudget({ tokens: 0, turns, calls: 40, cacheRate: 0.9 })
  assert.equal(snapshot.compactions, 2)
  assert.equal(snapshot.status, 'over')
})

test('output share and per-step output come from the model rows', () => {
  const snapshot = sessionBudget({
    tokens: 1_000_000,
    output: 100_000,
    turns: turnsOf(50_000, 60_000),
    calls: 20,
    cacheRate: 0.9,
  })
  assert.equal(snapshot.outputShare, 0.1)
  assert.equal(snapshot.outputPerCall, 5_000)

  const noOutput = sessionBudget({ tokens: 100_000, turns: turnsOf(10_000), calls: 1, cacheRate: 0.9 })
  assert.equal(noOutput.outputShare, 0)
})

test('step cost compares the last ten turns with the ten before them', () => {
  const cheap = Array.from({ length: 10 }, () => ({ total: 100_000, cost: 0.02 }))
  const dear = Array.from({ length: 10 }, () => ({ total: 300_000, cost: 0.06 }))
  const snapshot = sessionBudget({
    tokens: 4_000_000,
    turns: [...cheap, ...dear],
    calls: 40,
    cacheRate: 0.9,
  })
  assert.equal(stepCostOf(snapshot.stepCostEarlier), 0.02)
  assert.equal(stepCostOf(snapshot.stepCostRecent), 0.06)
  assert.equal(stepCostOf(snapshot.stepCostChange), 2)
})

const stepCostOf = (value: number): number => Math.round(value * 100) / 100

test('cost split prices each bucket, so output can dominate the money while barely showing in tokens', () => {
  const split = { input: 0, output: 100_000, cache: 3_000_000 }
  const cost = costSplitOf(split, 'deepseek-flash', Date.parse('2026-11-04T10:00:00+08:00'))
  assert.ok(cost.total > 0)
  assert.ok(cost.outputShare > 0.5, `output should dominate cost, got ${cost.outputShare}`)
  // 100K output tokens are ~1% of tokens but the biggest line of the bill.
  assert.ok(100_000 / 3_100_000 < 0.05)
})

test('a single turn with many steps is judged by its final call, not by its step sum', () => {
  // Reported from the live GUI: 1 turn, 40 steps, 3.4M billed tokens, and the
  // badge claimed the context was 342% of a 1M window. A 40-step turn bills 40
  // prompts; the context itself was ~85K.
  const snapshot = sessionBudget({
    tokens: 112_000_000,
    turns: [{ total: 3_400_000, lastCallTokens: 85_000, calls: 40 }],
    calls: 40,
    cacheRate: 0.92,
    idleMinutes: 5,
  })
  assert.equal(snapshot.contextTokens, 85_000)
  assert.equal(Math.round(snapshot.contextRatio * 100), 9)
  assert.equal(snapshot.status, 'ok', JSON.stringify(snapshot.reasons))
  assert.equal(snapshot.reasons.length, 0)
})

test('context falls back to the per-call average when the host is too old to report the size', () => {
  assert.equal(contextTokensOf({ total: 3_400_000, calls: 40 }), 85_000)
  assert.equal(contextTokensOf({ total: 90_000, calls: 1 }), 90_000)
  assert.equal(contextTokensOf(undefined), 0)
})

test('a short session still reports a cost direction instead of "not enough turns"', () => {
  const turns = [
    { total: 100_000, cost: 0.01 }, { total: 110_000, cost: 0.01 },
    { total: 120_000, cost: 0.04 }, { total: 130_000, cost: 0.04 },
  ]
  const snapshot = sessionBudget({ tokens: 500_000, turns, calls: 8, cacheRate: 0.9 })
  assert.equal(stepCostOf(snapshot.stepCostEarlier), 0.01)
  assert.equal(stepCostOf(snapshot.stepCostRecent), 0.04)
  assert.equal(stepCostOf(snapshot.stepCostChange), 3)
})

test('a long but light session is left alone (measured: 292 calls, 36% context, 99.7% cache)', () => {
  // Real session from the field: 292 model calls across 6 turns, last call
  // prompt 359K (36% of the window), cache hit 99.7%, no compaction, low cost.
  // A bare "150 calls" rule nagged exactly this healthy session, so steps now
  // need corroboration from the context dimension.
  const snapshot = sessionBudget({
    tokens: 57_949_850,
    turns: [{ total: 3_200_000, lastCallTokens: 359_699, calls: 292 }],
    calls: 292,
    cacheRate: 0.997,
    cost: 4.18,
    costBudget: 0,
    idleMinutes: 12,
  })
  assert.equal(Math.round(snapshot.contextRatio * 100), 36)
  assert.equal(snapshot.status, 'ok', JSON.stringify(snapshot.reasons))
})

test('steps still count once the context is heavy', () => {
  const heavy = sessionBudget({
    tokens: 60_000_000,
    turns: [{ total: 6_000_000, lastCallTokens: 620_000, calls: 200 }],
    calls: 200,
    cacheRate: 0.99,
  })
  assert.equal(heavy.status, 'warn')
  // 62% context warns on its own; steps corroborate it in the same pass.
  assert.deepEqual(heavy.reasons.map(r => r.code), ['context', 'steps'])
})

test('the per-session budget is off by default and only fires when set', () => {
  const base = { tokens: 1_000_000, turns: turnsOf(100_000), calls: 10, cacheRate: 0.9, cost: 12 }
  assert.equal(sessionBudget(base).status, 'ok')
  const bounded = sessionBudget({ ...base, costBudget: 10 })
  assert.equal(bounded.status, 'warn')
  assert.deepEqual(bounded.reasons.map(r => r.code), ['cost'])
})
