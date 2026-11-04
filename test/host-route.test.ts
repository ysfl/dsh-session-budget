import assert from 'node:assert/strict'
import test from 'node:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CredentialsFace, HostContext, SessionPersistenceFace, WebRoute } from '../src/context.ts'
import { apply } from '../src/index.ts'

const AT = Date.parse('2026-11-04T10:00:00+08:00')
const ID = 'session-00000000-0000-4000-8000-000000000000'

const credentials: CredentialsFace = {
  resolve: async () => ({ value: 'test-key', source: 'test' }),
}

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

function mount(withCredentials: CredentialsFace | null = credentials): WebRoute[] {
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
    credentials: withCredentials ?? undefined,
  } as unknown as HostContext
  apply(ctx)
  return routes
}

interface Body {
  ok: boolean
  error?: string
  data?: {
    calls?: number
    isAvailable?: boolean
    balances?: Array<{ currency: string; total: string }>
  }
}

async function call(
  route: WebRoute,
  options: { method?: string; url: string; headers?: Record<string, string> },
): Promise<{ status: number; body: Body; cacheControl?: string }> {
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

  const unknown = await call(route, { url: '/api/dsh-session-budget/nope' })
  assert.equal(unknown.status, 404)

  const missing = await call(route, { url: '/api/dsh-session-budget/session' })
  assert.equal(missing.status, 400)

  const invalid = await call(route, { url: '/api/dsh-session-budget/session?id=..%2Fetc%2Fpasswd' })
  assert.equal(invalid.status, 400)
})

test('the balance route reads the provider and honors its 60 s memo', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return {
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '0', topped_up_balance: '12.34' }],
      }),
    }
  }) as unknown as typeof fetch
  try {
    const route = mount()[0]
    assert.ok(route !== undefined)

    const first = await call(route, { url: '/api/dsh-session-budget/balance' })
    assert.equal(first.status, 200)
    assert.equal(first.body.ok, true)
    assert.equal(first.body.data?.isAvailable, true)
    assert.equal(first.body.data?.balances?.[0]?.total, '12.34')
    assert.equal(first.cacheControl, 'private, max-age=60')

    const cached = await call(route, { url: '/api/dsh-session-budget/balance' })
    assert.equal(cached.body.ok, true)
    assert.equal(calls, 1, 'a second read inside the TTL must not hit the provider')

    const refreshed = await call(route, { url: '/api/dsh-session-budget/balance?refresh=1' })
    assert.equal(refreshed.body.ok, true)
    assert.equal(calls, 2, '?refresh=1 bypasses the memo')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a host without the credentials service reports no balance instead of failing', async () => {
  const route = mount(null)[0]
  assert.ok(route !== undefined)
  const response = await call(route, { url: '/api/dsh-session-budget/balance' })
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, false)
  assert.match(response.body.error ?? '', /credentials/)
  assert.equal(response.cacheControl, 'no-store')
})
