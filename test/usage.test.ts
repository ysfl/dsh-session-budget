import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionEventFace, SessionPersistenceFace } from '../src/context.ts'
import { readSessionUsage } from '../src/usage.ts'

const AT = Date.parse('2026-11-04T10:00:00+08:00')

const events: SessionEventFace[] = [
  { type: 'session/title', data: { title: 'Synthetic session' } },
  { type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'deepseek-flash' } } } },
  // One turn, two model calls: the second call's size is the context reading,
  // while both calls' tokens are billed under the turn.
  {
    type: 'assistant/message',
    time: AT,
    data: { turn: 1, message: { id: 'msg-1' }, usage: { inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 9_000 } },
  },
  {
    type: 'assistant/message',
    time: AT + 1_000,
    data: { turn: 1, message: { id: 'msg-1' }, usage: { inputTokens: 2_000, outputTokens: 200, cacheReadTokens: 8_000 } },
  },
  // A second turn, addressed by its own final message.
  {
    type: 'assistant/message',
    time: AT + 2_000,
    data: { turn: 2, message: { id: 'msg-2' }, usage: { inputTokens: 500, outputTokens: 50, cacheReadTokens: 4_500 } },
  },
  // Malformed record: negative tokens must be skipped, not folded.
  {
    type: 'assistant/message',
    time: AT + 3_000,
    data: { turn: 3, message: { id: 'msg-3' }, usage: { inputTokens: -1, outputTokens: 1, cacheReadTokens: 0 } },
  },
]

const handleHost = (log: SessionEventFace[]): SessionPersistenceFace => ({
  list: async () => [{ id: 'session-00000000-0000-4000-8000-000000000000' }],
  open: async () => ({
    read: async (offset = 0) => ({ events: log.slice(offset) }),
    close: async () => {},
  }),
})

const legacyHost = (log: SessionEventFace[]): SessionPersistenceFace => ({
  list: async () => [{ id: 'session-00000000-0000-4000-8000-000000000000' }],
  readFrom: async () => ({ events: log }),
})

const id = 'session-00000000-0000-4000-8000-000000000000'

test('folds a session log across the handle-era host', async () => {
  const response = await readSessionUsage(handleHost(events), id)
  assert.equal(response.ok, true)
  const data = response.data
  assert.ok(data !== undefined)
  assert.equal(data.title, 'Synthetic session')
  assert.equal(data.calls, 3, 'the malformed record is skipped')
  assert.equal(data.total, 1_000 + 100 + 9_000 + 2_000 + 200 + 8_000 + 500 + 50 + 4_500)
  assert.ok(data.cost > 0)

  assert.equal(data.models.length, 1)
  assert.equal(data.models[0]?.model, 'deepseek-flash')
  assert.equal(data.models[0]?.calls, 3)

  assert.equal(data.turns.length, 2)
  const first = data.turns[0]
  assert.equal(first?.messageId, 'msg-1')
  assert.equal(first?.calls, 2)
  assert.equal(first?.total, 1_000 + 100 + 9_000 + 2_000 + 200 + 8_000)
  assert.equal(first?.lastCallTokens, 2_000 + 200 + 8_000, 'context is the final call, not the turn sum')
  assert.equal(first?.peakCallTokens, 2_000 + 200 + 8_000)
  assert.equal(data.turns[1]?.messageId, 'msg-2')
})

test('reads a legacy host through readFrom', async () => {
  const response = await readSessionUsage(legacyHost(events), id)
  assert.equal(response.ok, true)
  assert.equal(response.data?.calls, 3)
  assert.equal(response.data?.turns.length, 2)
})

test('rejects a malformed session id before reading anything', async () => {
  let read = false
  const host: SessionPersistenceFace = {
    list: async () => [],
    open: async () => {
      read = true
      return { read: async () => ({ events: [] }), close: async () => {} }
    },
  }
  for (const bad of ['', '../etc/passwd', 'a/b', 'a b', 'x'.repeat(129)]) {
    const response = await readSessionUsage(host, bad)
    assert.equal(response.ok, false, bad)
  }
  assert.equal(read, false)
})

test('a session with no usage yields an empty, valid payload', async () => {
  const response = await readSessionUsage(handleHost([{ type: 'session/title', data: { title: 'Empty' } }]), id)
  assert.equal(response.ok, true)
  assert.equal(response.data?.calls, 0)
  assert.equal(response.data?.total, 0)
  assert.deepEqual(response.data?.turns, [])
  assert.equal(response.data?.title, 'Empty')
})
