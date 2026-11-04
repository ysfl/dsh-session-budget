/**
 * dsh-session-budget host plugin.
 *
 * Serves two read-only JSON endpoints consumed by the client half:
 *
 * - `/api/dsh-session-budget/session?id=…` folds one session log into the
 *   figures the badge reads (tokens, estimated cost, model calls, per-model
 *   rows, completed turns and each turn's final-call context size). It is
 *   deliberately not memoized: a single session read is cheap and must reflect
 *   that session's live state.
 * - `/api/dsh-session-budget/balance` asks the provider for the account
 *   balance with the key the host already holds, memoized for 60 s so opening
 *   the panel repeatedly does not hammer the API.
 *
 * No DSH data is written.
 */
import { fetchBalance } from './balance.ts'
import type { HostContext } from './context.ts'
import { isValidSessionId } from './contract.ts'
import { memoize } from './memo.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import { readSessionUsage } from './usage.ts'
import { writeJson } from './wire.ts'

/** Plugin identity for the cordis.patch.yml row (and the client bundle id). */
export const name = 'dsh-session-budget'

/** Services required before load: web server, session logs and the credential
 *  store the balance read resolves the API key from. */
export const inject = ['webServer', 'credentials', 'sessionPersistence']

const PREFIX = '/api/dsh-session-budget'

/** Balance is a network call; one minute keeps panel opens cheap while still
 *  showing a figure that can move within a working session. */
const BALANCE_TTL_MS = 60_000

/**
 * Mount the /api/dsh-session-budget routes.
 * @param ctx - host Cordis context.
 */
export function apply(ctx: HostContext): void {
  const balanceMemo = memoize(BALANCE_TTL_MS, () => fetchBalance(ctx.credentials))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const force = url.searchParams.get('refresh') === '1'

      if (url.pathname === `${PREFIX}/balance`) {
        const payload = await (force ? balanceMemo.refresh() : balanceMemo.get())
        const headers = payload.ok
          ? { 'cache-control': `private, max-age=${Math.round(BALANCE_TTL_MS / 1000)}` }
          : { 'cache-control': 'no-store' }
        writeJson(res, 200, payload, headers)
        return
      }

      if (url.pathname !== `${PREFIX}/session`) {
        writeJson(res, 404, { ok: false, error: 'not found' })
        return
      }

      // `id` arrives verbatim from the browser-controlled `?id=` query
      // parameter, so it is rejected here — before it can reach the log read —
      // with a real 4xx. Any downstream failure keeps the same "200 with
      // ok:false" shape as the other payloads so the client has one error path.
      const id = url.searchParams.get('id')
      if (id === null || id.trim() === '') {
        writeJson(res, 400, { ok: false, error: 'missing session id' }, { 'cache-control': 'no-store' })
        return
      }
      if (!isValidSessionId(id)) {
        writeJson(res, 400, { ok: false, error: 'invalid session id' }, { 'cache-control': 'no-store' })
        return
      }

      const payload = await readSessionUsage(ctx.sessionPersistence, id)
      writeJson(res, 200, payload, { 'cache-control': 'no-store' })
    },
  }), 'dsh-session-budget: /api routes')
}
