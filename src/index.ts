/**
 * dsh-session-budget host plugin.
 *
 * Serves one read-only JSON endpoint, `/api/dsh-session-budget/session?id=…`,
 * which folds a single session log into the figures the client badge reads:
 * cumulative tokens, estimated cost, model calls, per-model rows and completed
 * turns (each with its final-call context size). No DSH data is written, and
 * the endpoint is deliberately not memoized — a single session read is cheap
 * and must reflect that session's live state.
 */
import type { HostContext } from './context.ts'
import { isValidSessionId } from './contract.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import { readSessionUsage } from './usage.ts'
import { writeJson } from './wire.ts'

/** Plugin identity for the cordis.patch.yml row (and the client bundle id). */
export const name = 'dsh-session-budget'

/** Services required before load: the web server plus the session logs. */
export const inject = ['webServer', 'sessionPersistence']

const PREFIX = '/api/dsh-session-budget'

/**
 * Mount the /api/dsh-session-budget routes.
 * @param ctx - host Cordis context.
 */
export function apply(ctx: HostContext): void {
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
