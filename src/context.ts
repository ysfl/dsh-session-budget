/**
 * Structural service faces the host half reads from the Cordis context.
 * They are deliberately minimal: the plugin only touches the methods it needs,
 * so no extra `@deepseek-ai/dsh-*` type packages are required to build it.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** One HTTP route served by the host web server. */
export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** Structural face of the host `webServer` service. */
export interface WebServerFace {
  register(route: WebRoute): () => void
}

/** Structural face of the host `sessionPersistence` service. */
export interface SessionHeaderFace {
  id?: string
  sessionId?: string
  /** Handle-era `list()` returns snapshots; the header (and its id) rides
   *  one level deeper at `snapshot.header.id` instead of at the entry top. */
  header?: SessionHeaderFace
}

export interface TokenUsageFace {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
}

export interface SessionEventFace {
  type?: string
  time?: number
  data?: {
    usage?: TokenUsageFace
    header?: { config?: { provider?: string; model?: string } }
    /** Stable turn identity carried by modern `assistant/message` events.
     *  Optional for legacy logs. */
    turn?: number
    /** The turn's finalized assistant message, whose id addresses it in chat. */
    message?: { id?: string }
    /** Payload of a `session/title` event. */
    title?: string
  }
}

/** One open read channel onto a session log (`SessionPersistence.open`). */
export interface SessionHandleFace {
  read(offset?: number, length?: number): Promise<{ events?: readonly SessionEventFace[] }>
  close(): Promise<void>
}

export interface SessionPersistenceFace {
  list(): Promise<SessionHeaderFace[]>
  /** Legacy hosts: whole-log read from a seq. Removed in handle-era DSH. */
  readFrom?(id: string, fromSeq: number): Promise<{ events?: SessionEventFace[] }>
  /** Handle-era hosts: per-session read handle, preferred when present. */
  open?(id: string, access: 'read'): Promise<SessionHandleFace>
}

/** The host context this plugin's apply() receives. */
export interface HostContext extends Context {
  webServer: WebServerFace
  sessionPersistence: SessionPersistenceFace
}
