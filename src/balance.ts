/**
 * Account balance, read from DeepSeek's official endpoint with the key the host
 * already holds.
 *
 * This is the plugin's only outbound request: a GET to the provider's own
 * `/user/balance` with the user's API key. The key is resolved per call through
 * the host `credentials` service and is never logged, stored or forwarded
 * anywhere else. A missing service, missing key or HTTP failure is reported as
 * `ok:false` so the panel can say "no balance available" instead of breaking.
 */
import type { BalanceResponse } from './contract.ts'
import type { CredentialsFace } from './context.ts'

const BALANCE_URL = 'https://api.deepseek.com/user/balance'

function errorMessage(err: unknown): string {
  return (err as { message?: string } | null)?.message ?? String(err)
}

export async function fetchBalance(credentials: CredentialsFace | undefined): Promise<BalanceResponse> {
  if (credentials === undefined) return { ok: false, error: 'credentials service unavailable' }

  let credential: { value: string } | undefined
  try {
    credential = await credentials.resolve('DEEPSEEK_API_KEY')
  } catch (err) {
    return { ok: false, error: `failed to read API key: ${errorMessage(err)}` }
  }
  if (credential === undefined || credential.value === '') {
    return { ok: false, error: 'DEEPSEEK_API_KEY is not configured' }
  }

  let response: Response
  try {
    response = await fetch(BALANCE_URL, {
      headers: { authorization: `Bearer ${credential.value}` },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return { ok: false, error: `balance request failed: ${errorMessage(err)}` }
  }
  if (!response.ok) return { ok: false, error: `balance endpoint returned HTTP ${response.status}` }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return { ok: false, error: 'failed to parse balance response' }
  }

  const body = parsed as {
    is_available?: boolean
    balance_infos?: Array<{
      currency?: string
      total_balance?: string
      granted_balance?: string
      topped_up_balance?: string
    }>
  }
  return {
    ok: true,
    data: {
      isAvailable: body.is_available === true,
      balances: (body.balance_infos ?? []).map(info => ({
        currency: info.currency ?? '',
        total: info.total_balance ?? '0',
        granted: info.granted_balance ?? '0',
        toppedUp: info.topped_up_balance ?? '0',
      })),
    },
  }
}
