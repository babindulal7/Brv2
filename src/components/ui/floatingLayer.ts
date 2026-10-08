/** Body portals must stay above their owning modal, but below unrelated modals. */
export function floatingLayer(anchor: Element | null): string {
  return anchor?.closest('[aria-modal="true"]')
    ? 'calc(var(--z-modal) + 1)'
    : 'var(--z-dropdown)'
}
