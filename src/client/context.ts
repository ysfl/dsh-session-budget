/** Structural faces the client half reads from the Cordis context. */
import type { Context } from '@deepseek-ai/cordis'
import type { Translate } from './i18n.tsx'

export interface SlotOptions {
  name: string
  id?: string
  order?: number
  label?: string | (() => string)
  locale?: string
}

export interface SlotsFace {
  inject(key: string, callback: () => unknown): unknown
  register(options: SlotOptions, component: unknown): unknown
}

export interface LocaleFace {
  register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
  bind(namespace: string): Translate
}

/**
 * The composer action face a Session-scoped slot hands out (`inputActions`).
 * `setDraft` writes the composer text and `submit` sends it — together they are
 * what a one-click handoff needs, so the plugin never reaches into the DOM.
 */
export interface InputActionsFace {
  setDraft(text: string): void
  submit(): void
}

/** The composer snapshot a Session-scoped slot exposes through `useInput`. */
export interface InputSnapshotFace {
  /** Current composer text (the host's own name for it is `draft`). */
  draft?: string
  /** Submission phase, e.g. `idle` / `submitting`. */
  phase?: string
}

export type UseInputHook = <T>(selector: (state: InputSnapshotFace) => T) => T

/** The Session summary a Session-scoped seat exposes through `useSession`.
 *  Only the field this plugin reads is declared; the host snapshot carries more. */
export interface SessionSnapshotFace {
  /** A model turn is in flight; flips false once the turn settles. */
  running?: boolean
}

export type UseSessionHook = <T>(selector: (state: SessionSnapshotFace) => T) => T

/** The client context this plugin's apply() receives. */
export interface ClientContext extends Context {
  slots: SlotsFace
  locale: LocaleFace
}
