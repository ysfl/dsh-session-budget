/**
 * dsh-session-budget client half: mounts the session budget badge
 * (`conversation.session.header.utilities`) and the wrap-up reminder dock
 * (`conversation.input.dock`). Data arrives through the package's own host API
 * via same-origin fetch.
 */
import { ErrorBoundary } from './boundary.tsx'
import type { ClientContext, InputActionsFace, UseInputHook, UseSessionHook } from './context.ts'
import { LocaleProvider, type Translate } from './i18n.tsx'
import { en, NS, zh } from './locales.ts'
import { HandoffDock } from './handoff-dock.tsx'
import { SessionBadge } from './session-badge.tsx'
import { css } from './styles.ts'

/** Plugin identity for the client bundle. */
export const name = 'dsh-session-budget'

/** Services required before load. */
export const inject = ['slots', 'locale']

/**
 * Mount the two surfaces.
 * @param ctx - client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-budget: browser dictionaries')
  const t = ctx.locale.bind(NS)

  // One stylesheet for the whole plugin; the module loader claims and removes
  // plugin-owned style tags on unload.
  if (typeof document !== 'undefined') {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-session-budget'
    tag.textContent = css
    document.head.appendChild(tag)
  }

  // Both surfaces live on Session-scoped seats, because those are the ones that
  // hand out `sessionId`, the session summary (`useSession`), the composer
  // snapshot (`useInput`) and `inputActions` — without them a "one-click
  // handoff" would be a copy-paste.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
    {
      name: 'conversation.session.header.utilities',
      id: 'dsh-session-budget-badge',
      order: 20,
      locale: NS,
      label: () => t('sessionBadge.label'),
    },
    ({ t: slotT, sessionId, inputActions, useInput, useSession }: {
      t: Translate
      sessionId: string
      inputActions: InputActionsFace
      useInput: UseInputHook
      useSession?: UseSessionHook
    }) => (
      <LocaleProvider t={slotT}>
        <ErrorBoundary>
          <SessionBadge
            sessionId={sessionId}
            inputActions={inputActions}
            useInput={useInput}
            useSession={useSession}
          />
        </ErrorBoundary>
      </LocaleProvider>
    ),
  ))

  // `conversation.input.dock` is the additive full-width strip above the
  // composer (the host parks its queue / todo / goal rows there). Replacing
  // `conversation.composer.bar` would have shadowed the composer itself.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    {
      name: 'conversation.input.dock',
      id: 'dsh-session-budget-dock',
      order: 40,
      locale: NS,
      label: () => t('handoffDock.label'),
    },
    ({ t: slotT, sessionId, inputActions, useInput, useSession }: {
      t: Translate
      sessionId: string
      inputActions: InputActionsFace
      useInput: UseInputHook
      useSession?: UseSessionHook
    }) => (
      <LocaleProvider t={slotT}>
        <ErrorBoundary>
          <HandoffDock
            sessionId={sessionId}
            inputActions={inputActions}
            useInput={useInput}
            useSession={useSession}
          />
        </ErrorBoundary>
      </LocaleProvider>
    ),
  ))
}
