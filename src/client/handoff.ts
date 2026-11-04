/**
 * One-click handoff: put the handoff request into the composer and send it.
 *
 * The prompt itself lives in ./session-budget.ts (pure, unit-tested); this file
 * owns the two host-facing bits: the rule that protects whatever the user was
 * already typing, and a single place both surfaces call.
 */
import type { InputActionsFace } from './context.ts'

/** What a click did — `needs-replace` means the composer held text and nothing was sent. */
export type HandoffOutcome = 'sent' | 'needs-replace'

/**
 * Ask the model for the handoff.
 *
 * The composer is the user's property: when it already holds text, sending
 * would silently overwrite it, so the first click only reports that a second,
 * explicit click is needed. An empty composer sends immediately — that is the
 * "one click" case.
 */
export function requestHandoff(options: {
  inputActions: InputActionsFace
  draft: string
  prompt: string
  replace?: boolean
}): HandoffOutcome {
  const { inputActions, draft, prompt, replace = false } = options
  if (!replace && draft.trim() !== '') return 'needs-replace'
  inputActions.setDraft(prompt)
  inputActions.submit()
  return 'sent'
}
