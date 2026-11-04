/**
 * The handoff click shared by the header badge and the composer dock: build the
 * request from the session's measured figures, respect whatever the user is
 * already typing, and report whether a second (explicit) click is needed.
 */
import { useState } from 'react'
import type { InputActionsFace, UseInputHook } from './context.ts'
import { requestHandoff } from './handoff.ts'
import { useI18n } from './i18n.tsx'
import { handoffPrompt, type SessionBudgetSnapshot } from './session-budget.ts'

export interface HandoffAction {
  /** True once a click found text in the composer: the next click replaces it. */
  needsConfirm: boolean
  /** Returns true when the request was actually sent. */
  run: () => boolean
}

export function useHandoffAction(options: {
  sessionId: string
  snapshot: SessionBudgetSnapshot
  stats: string
  inputActions: InputActionsFace
  useInput: UseInputHook
  /** Ask for the handoff of a finished task instead of a continuation. */
  taskDone?: boolean
}): HandoffAction {
  const { locale } = useI18n()
  const draft = options.useInput(state => state.draft ?? '')
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const prompt = handoffPrompt({
    sessionId: options.sessionId,
    stats: options.stats,
    locale,
    taskDone: options.taskDone,
  })

  const run = (): boolean => {
    const outcome = requestHandoff({
      inputActions: options.inputActions,
      draft,
      prompt,
      replace: needsConfirm,
    })
    if (outcome === 'sent') {
      setNeedsConfirm(false)
      return true
    }
    setNeedsConfirm(true)
    return false
  }

  return { needsConfirm, run }
}
