/**
 * Shared lookups into the DSH host shell DOM.
 *
 * Slot wrappers are 0×0, and which neighbour carries the real box differs per
 * slot: the session header renders inside its wrapper, while the composer's
 * wrapper sits inside the seat that reserves the space. The caller says which
 * side it means; picking the wrong side silently yields a box in the wrong
 * place.
 */

function slotElement(frame: HTMLElement, slot: string, side: 'child' | 'ancestor'): HTMLElement | null {
  const anchor = frame.querySelector(`[data-slot="${slot}"]`)
  if (anchor === null) return null
  if (side === 'child') {
    const el = anchor.firstElementChild as HTMLElement | null
    return el !== null && el.getBoundingClientRect().height > 0 ? el : null
  }
  let el: HTMLElement | null = anchor.parentElement
  for (let depth = 0; depth < 4 && el !== null && el !== frame; depth++) {
    if (el.getBoundingClientRect().height > 0) return el
    el = el.parentElement
  }
  return null
}

/**
 * The composer's laid-out element (the seat that reserves its space, not the
 * 0×0 slot wrapper), or null if the slot is not present in the current DOM.
 *
 * `frame` may be null: the composer is unique in the active shell, so a
 * document-wide lookup cannot hit an ambiguous element.
 */
export function getComposerElement(frame: HTMLElement | null): HTMLElement | null {
  if (frame === null) {
    return slotElement(document.documentElement, 'conversation.composer.dock', 'ancestor')
  }
  return slotElement(frame, 'conversation.composer.dock', 'ancestor')
}
