import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionBudget, sessionBudgetReasonText } from '../src/client/session-budget.ts'
import { zh } from '../src/client/locales.ts'

test('idle time alone still produces a readable reminder', () => {
  const snapshot = sessionBudget({
    tokens: 2_000_000,
    turns: [{ total: 120_000 }],
    calls: 20,
    cacheRate: 0.9,
    idleMinutes: 181,
  })
  assert.equal(snapshot.status, 'warn')
  const reason = sessionBudgetReasonText(snapshot, (key, params) => {
    const template = zh[key]
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match)
  })
  assert.equal(reason.code, 'idle')
  assert.ok(reason.title.length > 0, 'an idle-only reminder must not render a blank line')
  assert.ok(reason.title.includes('3.0'), reason.title)
})
