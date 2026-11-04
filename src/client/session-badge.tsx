/**
 * Session budget badge: how much this conversation has burned, and a one-click
 * handoff once it is due for one.
 *
 * Mounted in `conversation.session.header.utilities` — a session-scoped list
 * seat, so the host hands out `sessionId`, the composer's `useInput` snapshot
 * and `inputActions`. That is what makes the handoff a click instead of a
 * copy-paste: the request is written into the composer and sent from there.
 * The wrap-up numbers themselves are classified in ./session-budget.ts.
 */
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import type { InputActionsFace, UseInputHook } from './context.ts'
import { fetchSessionUsage } from './api.ts'
import { fmtCost } from './format.ts'
import { useI18n } from './i18n.tsx'
import {
  CACHE_RATE_WARN,
  CONTEXT_OVER_RATIO,
  CONTEXT_WARN_RATIO,
  cacheHitRate,
  costSplitOf,
  fmtTokensM,
  sessionBudgetReasonText,
  SESSION_STEP_OVER,
  SESSION_STEP_WARN,
  tokenShare,
  tokenSplitOf,
} from './session-budget.ts'
import { useCacheExpiryMinutes, useSessionCostBudget, useSessionVerdict } from './session-usage.ts'
import { cacheExpiryMinutesStore, sessionCostBudgetStore } from './store.ts'
import { useHandoffAction } from './use-handoff.ts'

export interface SessionBadgeProps {
  sessionId: string
  inputActions: InputActionsFace
  useInput: UseInputHook
}

export function SessionBadge(props: SessionBadgeProps): ReactElement | null {
  const { t } = useI18n()
  const { data, snapshot } = useSessionVerdict(props.sessionId)
  const cacheExpiryMinutes = useCacheExpiryMinutes()
  const costBudget = useSessionCostBudget()
  const [open, setOpen] = useState(false)
  const [expiryHours, setExpiryHours] = useState(() => Math.round((cacheExpiryMinutes / 60) * 10) / 10)
  const [budgetInput, setBudgetInput] = useState(() => String(costBudget))
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelId = useId()

  // A popover hanging off a header seat must close on both exits the user
  // reaches for: a click outside, and Escape (which hands focus back).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const node = rootRef.current
      if (node !== null && event.target instanceof Node && node.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Opening the panel is a "show me now" gesture: force a fresh read instead of
  // rendering whatever the cache happened to hold, so the slope and the per-step
  // average are current at the moment the decision is made.
  useEffect(() => {
    if (!open) return
    void fetchSessionUsage(props.sessionId, true)
  }, [open, props.sessionId])

  useEffect(() => {
    setExpiryHours(Math.round((cacheExpiryMinutes / 60) * 10) / 10)
  }, [cacheExpiryMinutes])

  useEffect(() => {
    setBudgetInput(String(costBudget))
  }, [costBudget])

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
  // The explicit "task finished" path: topic boundaries are the best handoff
  // moment and no counter can detect them.
  const taskDoneHandoff = useHandoffAction({
    sessionId: props.sessionId,
    snapshot,
    stats,
    inputActions: props.inputActions,
    useInput: props.useInput,
    taskDone: true,
  })

  if (data === null || data.calls === 0) return null

  const cost = fmtCost(data.cost)
  const tokens = fmtTokensM(snapshot.tokens)
  const metrics = t('sessionBadge.metrics', { cost, tokens, turns: snapshot.turns })
  const split = tokenSplitOf(data.models)
  const share = tokenShare(split)
  const rate = (cacheHitRate(split) * 100).toFixed(1)
  const statusText = snapshot.status === 'over'
    ? t('sessionBadge.statusOver')
    : (snapshot.status === 'warn' ? t('sessionBadge.statusWarn') : t('sessionBadge.statusOk'))
  const due = snapshot.status !== 'ok'
  const reason = sessionBudgetReasonText(snapshot, t)
  const contextPercent = Math.round(snapshot.contextRatio * 100)
  const costSplit = costSplitOf(split, data.models[0]?.model ?? 'deepseek-flash', data.lastActive ?? Date.now())
  const dimensions = [
    {
      code: 'context',
      label: t('verdict.context'),
      value: t('sessionBadge.contextValue', { tokens: fmtTokensM(snapshot.contextTokens), percent: contextPercent }),
      level: snapshot.contextRatio >= CONTEXT_OVER_RATIO
        ? 'over'
        : (snapshot.contextRatio >= CONTEXT_WARN_RATIO ? 'warn' : 'ok'),
    },
    {
      code: 'growth',
      label: t('verdict.growth'),
      value: t('sessionBadge.growthValue', { tokens: fmtTokensM(Math.abs(snapshot.growth)), sign: snapshot.growth < 0 ? '−' : '+' }),
      level: 'ok' as const,
    },
    {
      code: 'cache',
      label: t('verdict.cache'),
      value: snapshot.cacheRate === null ? t('common.unknown') : `${(snapshot.cacheRate * 100).toFixed(1)}%`,
      level: snapshot.cacheRate !== null && snapshot.cacheRate < CACHE_RATE_WARN ? 'warn' : 'ok',
    },
    {
      code: 'compaction',
      label: t('verdict.compaction'),
      value: snapshot.compaction ? t('verdict.compactionYes') : t('verdict.compactionNo'),
      level: snapshot.compaction ? 'over' : 'ok',
    },
    {
      code: 'output',
      label: t('verdict.output'),
      // Token share alone reads as "1%" and hides the money: output is priced
      // 4x the input rate and 200x the cache-hit rate, so both shares matter.
      value: t('sessionBadge.outputValue', {
        percent: Math.round(snapshot.outputShare * 100),
        costPercent: Math.round(costSplit.outputShare * 100),
        tokens: fmtTokensM(snapshot.outputPerCall),
      }),
      level: 'ok' as const,
    },
    {
      code: 'stepCost',
      label: t('verdict.stepCost'),
      value: snapshot.stepCostEarlier === 0
        ? t('sessionBadge.noSlope')
        : t('sessionBadge.stepCostValue', {
          cost: fmtCost(snapshot.stepCostRecent),
          change: `${snapshot.stepCostChange >= 0 ? '+' : '−'}${Math.abs(Math.round(snapshot.stepCostChange * 100))}%`,
        }),
      level: snapshot.stepCostChange >= 1 ? 'warn' : 'ok',
    },
    {
      code: 'idle',
      label: t('verdict.idle'),
      value: snapshot.idleMinutes === null
        ? t('common.unknown')
        : t('sessionBadge.idleValue', { hours: (snapshot.idleMinutes / 60).toFixed(1) }),
      level: snapshot.idleMinutes !== null && snapshot.idleMinutes >= snapshot.cacheExpiryMinutes ? 'warn' : 'ok',
    },
    {
      code: 'cost',
      label: t('verdict.cost'),
      value: snapshot.costBudget > 0
        ? t('sessionBadge.costValue', {
          cost: fmtCost(snapshot.cost),
          budget: fmtCost(snapshot.costBudget),
        })
        : `${t('sessionBadge.costValue', { cost: fmtCost(snapshot.cost), budget: '—' })} · ${t('sessionBadge.costUnset')}`,
      level: snapshot.costBudget > 0 && snapshot.cost >= snapshot.costBudget ? 'warn' : 'ok',
    },
    {
      code: 'steps',
      label: t('verdict.steps'),
      value: String(snapshot.calls),
      level: snapshot.calls >= SESSION_STEP_OVER ? 'over' : (snapshot.calls >= SESSION_STEP_WARN ? 'warn' : 'ok'),
    },
  ]
  // `input` counts cache-miss tokens only and `cache` counts the hits, so the
  // legend uses the pricing table's two bucket names rather than calling 7%
  // "input" while 92% of the same prompt sits under "cache".
  const kinds = [
    { key: 'input' as const, label: t('pricing.inputCacheMiss'), percent: share.input, value: fmtTokensM(split.input) },
    { key: 'cache' as const, label: t('pricing.inputCacheHit'), percent: share.cache, value: fmtTokensM(split.cache) },
    { key: 'output' as const, label: t('common.output'), percent: share.output, value: fmtTokensM(split.output) },
  ]

  const runHandoff = (): void => {
    if (handoff.run()) setOpen(false)
  }
  const runTaskDone = (): void => {
    if (taskDoneHandoff.run()) setOpen(false)
  }

  return (
    <span className="dq-session-badge" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`dq-session-badge-trigger dq-session-badge-trigger--${snapshot.status}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('sessionBadge.aria', { metrics, status: statusText })}
        title={t('sessionBadge.label')}
        onClick={() => setOpen(value => !value)}
      >
        <span className={`dq-session-badge-dot dq-session-badge-dot--${snapshot.status}`} aria-hidden />
        <span className="dq-session-badge-metrics">{metrics}</span>
      </button>
      {open
        ? (
          <div
            className="dq-session-badge-panel"
            id={panelId}
            role="dialog"
            aria-label={t('sessionBadge.title')}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="dq-session-badge-panel-head">
              <span className="dq-session-badge-panel-title">{t('sessionBadge.title')}</span>
              <button
                type="button"
                className="dq-session-badge-close"
                aria-label={t('sessionBadge.close')}
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
              >
                ✕
              </button>
            </div>
            {due
              ? (
                <p className={`dq-session-badge-callout dq-session-badge-callout--${snapshot.status}`}>
                  {reason.title}
                </p>
              )
              : null}
            <dl className="dq-session-badge-stats">
              <dt>{t('sessionBadge.cost')}</dt>
              <dd>¥ {cost}</dd>
              <dt>{t('sessionBadge.tokens')}</dt>
              <dd>{tokens}</dd>
              <dt>{t('sessionBadge.turns')}</dt>
              <dd>{snapshot.turns}</dd>
              <dt>{t('sessionBadge.calls')}</dt>
              <dd>{snapshot.calls}</dd>
            </dl>
            <div
              className="dq-session-badge-split"
              role="img"
              aria-label={t('sessionBadge.splitAria', {
                miss: share.input, hit: share.cache, output: share.output, rate,
              })}
            >
              {kinds.map(kind => (kind.percent === 0
                ? null
                : (
                  <span
                    key={kind.key}
                    className={`dq-session-badge-split-seg dq-session-badge-split-seg--${kind.key}`}
                    style={{ width: `${kind.percent}%` }}
                  />
                )))}
            </div>
            <ul className="dq-session-badge-legend">
              {kinds.map(kind => (
                <li key={kind.key} title={kind.value}>
                  <span className={`dq-session-badge-key dq-session-badge-key--${kind.key}`} aria-hidden />
                  {kind.label} <b>{kind.percent}%</b>
                </li>
              ))}
              <li className="dq-session-badge-legend-rate">
                {t('cache.rate')} <b>{rate}%</b>
              </li>
            </ul>
            <p className="dq-session-badge-section">{t('verdict.title')}</p>
            <ul className="dq-session-badge-dimensions">
              {dimensions.map(dimension => (
                <li key={dimension.code} className={`dq-session-badge-dimension dq-session-badge-dimension--${dimension.level}`}>
                  <span className="dq-session-badge-dimension-label">{dimension.label}</span>
                  <span className="dq-session-badge-dimension-value">{dimension.value}</span>
                </li>
              ))}
            </ul>
            <div className="dq-session-badge-expiry">
              <span>{t('sessionBadge.expiryLabel')}</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={expiryHours}
                aria-label={t('sessionBadge.expiryLabel')}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setExpiryHours(value)
                  if (Number.isFinite(value) && value > 0) cacheExpiryMinutesStore.set(value * 60)
                }}
              />
              <span>{t('sessionBadge.expiryUnit')}</span>
            </div>
            <div className="dq-session-badge-expiry">
              <span>{t('sessionBadge.costBudgetLabel')}</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={budgetInput}
                aria-label={t('sessionBadge.costBudgetLabel')}
                onChange={(event) => {
                  setBudgetInput(event.target.value)
                  const value = Number(event.target.value)
                  if (Number.isFinite(value) && value >= 0) sessionCostBudgetStore.set(value)
                }}
              />
              <span>{t('sessionBadge.costBudgetUnit')}</span>
            </div>
            <p className="dq-session-badge-note">
              {t('sessionBadge.threshold', {
                contextWarn: Math.round(CONTEXT_WARN_RATIO * 100),
                contextOver: Math.round(CONTEXT_OVER_RATIO * 100),
                warn: SESSION_STEP_WARN,
                over: SESSION_STEP_OVER,
                cache: Math.round(CACHE_RATE_WARN * 100),
              })}
            </p>
            <div className="dq-session-badge-actions">
              <button type="button" className="dq-session-badge-handoff" onClick={runHandoff}>
                {handoff.needsConfirm ? t('sessionBadge.handoffReplace') : t('sessionBadge.handoff')}
              </button>
              <button type="button" className="dq-session-badge-secondary" onClick={runTaskDone}>
                {taskDoneHandoff.needsConfirm ? t('sessionBadge.handoffReplace') : t('sessionBadge.handoffTaskDone')}
              </button>
            </div>
            <p className="dq-session-badge-hint">
              {handoff.needsConfirm ? t('sessionBadge.handoffDraftBusy') : t('sessionBadge.handoffHint')}
            </p>
          </div>
        )
        : null}
    </span>
  )
}
