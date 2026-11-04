import assert from 'node:assert/strict'
import test from 'node:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HostContext, SessionPersistenceFace, WebRoute } from '../src/context.ts'
import { apply } from '../src/index.ts'

const AT = Date.parse('2026-11-04T10:00:00+08:00')
const ID = 'session-00000000-0000-4000-8000-000000000000'

const persistence: SessionPersistenceFace = {
  list: async () => [{ id: ID }],
  open: async () => ({
    read: async (offset = 0) => ({
      events: offset > 0
        ? []
        : [
            { type: 'session/title', data: { title: 'Synthetic session' } },
            {
              type: 'request/header',
              data: { header: { config: { provider: 'deepseek', model: 'deepseek-flash' } } },
            },
            {
              type: 'assistant/message',
              time: AT,
              data: { turn: 1, message: { id: 'msg-1' }, usage: { inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 9_000 } },
            },
          ],
    }),
    close: async () => {},
  }),
}

function mount(): WebRoute[] {
  const routes: WebRoute[] = []
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    webServer: {
      register: (route: WebRoute) => {
        routes.push(route)
        return () => {}
      },
    },
    sessionPersistence: persistence,
  } as unknown as HostContext
  apply(ctx)
  return routes
}

async function call(
  route: WebRoute,
  options: { method?: string; url: string; headers?: Record<string, string> },
): Promise<{ status: number; body: { ok: boolean; data?: { calls: number }; error?: string }; cacheControl?: string }> {
  const req = {
    method: options.method ?? 'GET',
    url: options.url,
    headers: { host: '127.0.0.1:52641', ...options.headers },
  } as unknown as IncomingMessage
  let status = 0
  let payload = ''
  let cacheControl: string | undefined
  const res = {
    writeHead: (code: number, headers: Record<string, string>) => {
      status = code
      cacheControl = headers['cache-control']
    },
    end: (body: string) => {
      payload = body
    },
  } as unknown as ServerResponse
  await route.handler(req, res)
  return { status, body: JSON.parse(payload), cacheControl }
}

test('the mounted route serves one session and nothing else', async () => {
  const routes = mount()
  assert.equal(routes.length, 1)
  assert.equal(routes[0]?.kind, 'prefix')
  assert.equal(routes[0]?.path, '/api/dsh-session-budget')
})

test('a valid request returns the session figures', async () => {
  const route = mount()[0]
  assert.ok(route !== undefined)
  const response = await call(route, { url: `/api/dsh-session-budget/session?id=${ID}` })
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.equal(response.body.data?.calls, 1)
  assert.equal(response.cacheControl, 'no-store')
})

test('cross-site, wrong method, unknown path and bad ids are refused', async () => {
  const route = mount()[0]
  assert.ok(route !== undefined)

  const crossSite = await call(route, {
    url: `/api/dsh-session-budget/session?id=${ID}`,
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(crossSite.status, 403)

  const wrongMethod = await call(route, { method: 'POST', url: `/api/dsh-session-budget/session?id=${ID}` })
  assert.equal(wrongMethod.status, 405)

  const unknown = await call(route, { url: '/api/dsh-session-budget/balance' })
  assert.equal(unknown.status, 404)

  const missing = await call(route, { url: '/api/dsh-session-budget/session' })
  assert.equal(missing.status, 400)

  const invalid = await call(route, { url: '/api/dsh-session-budget/session?id=..%2Fetc%2Fpasswd' })
  assert.equal(invalid.status, 400)
})
