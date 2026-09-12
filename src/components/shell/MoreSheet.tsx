import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'
import { moreNav } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { usePwaInstall } from '../../lib/usePwaInstall'

// Matches --dur in theme.css (the app's generic transition-duration token),
// the same constant and the same reason as `components/ui/Modal.tsx`: the
// close-unmount timer has to outlast the CSS fade or the sheet vanishes
// instead of sliding. Update both together if that token changes.
const TRANSITION_MS = 150

/** Law 15 — 44×44 at every width. These are thumb targets on a phone. */
const ROW_H = 48

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * **Phone overflow sheet — the "More" slot of the five-slot bar.**
 *
 * The wireframe shell block, identical in all eleven specs:
 *
 * > **Phone bar (5 slots):** Today · Rentals · **Scan ⦿** · Inventory · More.
 * > Nav items 1, 3, 5, 6, 9, 10, 11 live under **More**.
 *
 * Contents come from `moreNav()` in `data/nav.ts`, which resolves that list
 * against `permittedNav()` — so a money-blind role gets a sheet without Finance
 * in it rather than a row that opens a `RestrictedState` (Law 6). It also
 * carries **Clients**, which the spec's own list omits; the reasoning and the
 * `TODO(decision)` live next to `MORE_ROUTES` in `data/nav.ts` rather than
 * being restated here.
 *
 * Built on the conventions `components/ui/Modal.tsx` already established —
 * fixed overlay at `rgba(0,0,0,0.6)`, a separate click-through backdrop element,
 * `role="dialog"` + `aria-modal`, `document.body.style.overflow = 'hidden'`,
 * Escape to close, and a delayed unmount so the transition plays. It is not
 * `Modal` itself: `Modal`'s `sheet` variant is a centred dialog pinned to the
 * bottom with a title bar and a 90vh cap, and it does **not** trap focus. A
 * navigation sheet that lets Tab wander into the page behind it is unusable
 * with a keyboard or a screen reader, so the trap is added here.
 */
export default function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { canInstall, isInstalled, hasPrompt, isIos, promptInstall } = usePwaInstall()
  const items = moreNav(user?.role)
  const [iosTip, setIosTip] = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)
  /* Where focus came from, so closing puts it back on the More button rather
     than at the top of the document. */
  const opener = useRef<Element | null>(null)

  // Kept mounted for a beat after `open` flips to false so the slide-out plays.
  const [shouldRender, setShouldRender] = useState(open)

  useEffect(() => {
    if (open) {
      setShouldRender(true)
      return
    }
    const timeout = window.setTimeout(() => setShouldRender(false), TRANSITION_MS)
    return () => window.clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement

    const focusables = (): HTMLElement[] =>
      Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) return
      /* The trap: wrap at both ends instead of letting focus escape to the
         page underneath, which is still in the document and still tabbable. */
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    /* After the mount, so the row exists to receive it. */
    const focusTimer = window.setTimeout(() => focusables()[0]?.focus(), 0)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimer)
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [open, onClose])

  if (!shouldRender) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        /* Above the bottom bar (50) and below the Scanner panel (60). */
        zIndex: 55,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        opacity: open ? 1 : 0,
        transition: 'opacity var(--dur) ease',
      }}
    >
      <div style={{ position: 'fixed', inset: 0 }} onClick={onClose} aria-hidden="true" />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: open ? 'translateY(0)' : 'translateY(12px)',
          opacity: open ? 1 : 0,
          transition: 'opacity var(--dur) ease, transform var(--dur) ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>More</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              borderRadius: 'var(--r-btn)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav aria-label="More" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 12px' }}>
          {items.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: ROW_H,
                padding: '0 10px',
                borderRadius: 'var(--r-sm)',
                textDecoration: 'none',
                fontSize: 'var(--t-ui)',
                fontWeight: 500,
                color: 'var(--text)',
              }}
            >
              <Icon name={s.icon} size={20} style={{ color: 'var(--nav-icon)', flexShrink: 0 }} />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.label}
              </span>
              <Icon name="chevron_right" size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </Link>
          ))}

          {canInstall && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={async () => {
                  if (isIos && !hasPrompt) {
                    setIosTip((prev) => !prev)
                  } else {
                    const outcome = await promptInstall()
                    if (outcome === 'accepted') {
                      onClose()
                    }
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  minHeight: ROW_H,
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-ui)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon name="download" size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Install Babin Rentals OS
                </span>
                <span
                  style={{
                    fontSize: 'var(--t-th)',
                    padding: '2px 8px',
                    borderRadius: 'var(--r-full)',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontWeight: 600,
                  }}
                >
                  PWA
                </span>
              </button>
              {isIos && !hasPrompt && iosTip && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text2)',
                    background: 'var(--card)',
                    padding: '8px 10px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                  }}
                >
                  On iOS Safari: tap the Share button <span style={{ fontWeight: 600 }}>⎋</span> and select{' '}
                  <span style={{ fontWeight: 600 }}>&quot;Add to Home Screen&quot;</span>.
                </div>
              )}
            </div>
          )}

          {isInstalled && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 'var(--t-meta)',
                color: 'var(--muted)',
              }}
            >
              <Icon name="check" size={16} style={{ color: 'var(--success-text, #15803d)' }} />
              <span>Babin Rentals OS (Standalone)</span>
            </div>
          )}
        </nav>
      </div>
    </div>
  )
}
