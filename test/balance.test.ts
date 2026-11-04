import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchBalance } from '../src/balance.ts'
import type { CredentialsFace } from '../src/context.ts'

const credentials = (value: string | undefined): CredentialsFace => ({
  resolve: async () => (value === undefined ? undefined : { value, source: 'test' }),
})

test('reads the provider balance with the resolved key, and never logs it', async () => {
  const originalFetch = globalThis.fetch
  let seenUrl = ''
  let seenAuthorization = ''
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input)
    seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
    return {
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{
          currency: 'CNY',
          total_balance: '12.34',
          granted_balance: '0',
          topped_up_balance: '12.34',
        }],
      }),
    } as Response
  }) as typeof fetch
  try {
    const response = await fetchBalance(credentials('secret-key'))
    assert.equal(response.ok, true)
    assert.equal(response.data?.isAvailable, true)
    assert.deepEqual(response.data?.balances, [{
      currency: 'CNY',
      total: '12.34',
      granted: '0',
      toppedUp: '12.34',
    }])
    assert.equal(seenUrl, 'https://api.deepseek.com/user/balance')
    assert.equal(seenAuthorization, 'Bearer secret-key')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a missing credentials service, missing key or resolve failure is reported, not thrown', async () => {
  const noService = await fetchBalance(undefined)
  assert.equal(noService.ok, false)
  assert.match(noService.error ?? '', /credentials/)

  const noKey = await fetchBalance(credentials(undefined))
  assert.equal(noKey.ok, false)
  assert.match(noKey.error ?? '', /DEEPSEEK_API_KEY/)

  const emptyKey = await fetchBalance(credentials(''))
  assert.equal(emptyKey.ok, false)
  assert.match(emptyKey.error ?? '', /DEEPSEEK_API_KEY/)

  const failing: CredentialsFace = {
    resolve: async () => {
      throw new Error('vault locked')
    },
  }
  const readError = await fetchBalance(failing)
  assert.equal(readError.ok, false)
  assert.match(readError.error ?? '', /vault locked/)
})

test('an HTTP failure or an unreadable body does not break the panel', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => ({ ok: false, status: 503 } as Response)) as typeof fetch
    const httpError = await fetchBalance(credentials('secret-key'))
    assert.equal(httpError.ok, false)
    assert.match(httpError.error ?? '', /HTTP 503/)

    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)) as typeof fetch
    const parseError = await fetchBalance(credentials('secret-key'))
    assert.equal(parseError.ok, false)
    assert.match(parseError.error ?? '', /parse/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
