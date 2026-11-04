/**
 * Composer-side wrap-up reminder: a full-width row above the composer card.
 *
 * Mounted in `conversation.input.dock` (list, Session scope) — the same additive
 * seat the host uses for its queue, todo and goal docks. The seat spans the whole
 * conversation column while the composer card is narrower, so the row measures
 * the composer and matches its width instead of stretching past the input box.
 * Colours come from the host's theme tokens only, so dark mode stays legible.
 */
import { useLayoutEffect, useReducer, useRef, useState, type ReactElement } from 'react'
import type { InputActionsFace, UseInputHook } from './context.ts'
import { getComposerElement } from './dom.ts'
import { fmtCost } from './format.ts'
import { useI18n } from './i18n.tsx'
import { fmtTokensM, sessionBudgetReasonText, type SessionBudgetStatus } from './session-budget.ts'
import { useSessionVerdict } from './session-usage.ts'
import { useHandoffAction } from './use-handoff.ts'

/** Session → the threshold level the user already waved away. */
const dismissals = new Map<string, SessionBudgetStatus>()

export interface HandoffDockProps {
  sessionId: string
  inputActions: InputActionsFace
  useInput: UseInputHook
}

export function HandoffDock(props: HandoffDockProps): ReactElement | null {
  const { t } = useI18n()
  const { data, snapshot } = useSessionVerdict(props.sessionId)
  const [, rerender] = useReducer((value: number) => value + 1, 0)
  const [width, setWidth] = useState<number | null>(null)

  // Match the composer card: the dock seat is wider than the input box, and a
  // full-width row read as "outside the conversation box".
  useLayoutEffect(() => {
    const composer = getComposerElement(null)
    if (composer === null) return
    const apply = (): void => {
      const box = composer.getBoundingClientRect()
      if (box.width > 0) setWidth(Math.round(box.width))
    }
    apply()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(apply)
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  const stats = data === null
    ? ''
    : t('sessionBadge.templateStats', {
      tokens: fmtTokensM(snapshot.tokens),
      cost: fmtCost(data.cost),
      turns: snapshot.turns,
      calls: snapshot.calls,
    })
  const handoff = useHandoffAction({
    sessionId: props.sessionId,
    snapshot,
    stats,
    inputActions: props.inputActions,
    useInput: props.useInput,
  })

  if (data === null || data.calls === 0) return null
  if (snapshot.status === 'ok') return null
  if (dismissals.get(props.sessionId) === snapshot.status) return null

  const reason = sessionBudgetReasonText(snapshot, t)

  // A sent handoff is the point of the reminder: once the model is writing it,
  // the row has done its job and must not keep asking.
  const runHandoff = (): void => {
    if (!handoff.run()) return
    dismissals.set(props.sessionId, snapshot.status)
    rerender()
  }

  return (
    <div
      className={`dq-handoff-dock dq-handoff-dock--${snapshot.status}`}
      role="status"
      style={width === null ? undefined : { width: `${width}px` }}
    >
      <span className={`dq-handoff-dock-dot dq-handoff-dock-dot--${snapshot.status}`} aria-hidden />
      <span className="dq-handoff-dock-text">
        <b>{reason.title}</b>
        <span className="dq-handoff-dock-note">
          {handoff.needsConfirm ? t('sessionBadge.handoffDraftBusy') : t('handoffDock.note')}
        </span>
      </span>
      <span className="dq-handoff-dock-actions">
        <button type="button" className="dq-handoff-dock-primary" onClick={runHandoff}>
          {handoff.needsConfirm ? t('sessionBadge.handoffReplace') : t('sessionBadge.handoff')}
        </button>
        <button
          type="button"
          className="dq-handoff-dock-dismiss"
          onClick={() => {
            dismissals.set(props.sessionId, snapshot.status)
            rerender()
          }}
        >
          {t('handoffDock.dismiss')}
        </button>
      </span>
    </div>
  )
}
