/** Compact pending-edits indicator shared by the page and rental headers. */
export function UnsavedChangesIndicator({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span title="Unsaved changes" style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--ready-text)' }}>
        <span className="universal-page-header__dirty-dot" aria-hidden="true" />
        <span className="sr-only">Unsaved changes</span>
      </span>
    )
  }
  return (
    <span className="universal-page-header__dirty-indicator" title="Unsaved modifications">
      <span className="universal-page-header__dirty-dot" aria-hidden="true" />
      Unsaved changes
    </span>
  )
}
