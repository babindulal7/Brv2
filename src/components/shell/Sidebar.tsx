import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useTheme } from '../../lib/theme'
import { BRANCH, permittedNav, activeNavTo } from '../../data/nav'
import type { NavSection } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { useCollapsed } from '../../lib/collapse'
import { useViewport } from '../../lib/device'

/**
 * Widths are the wireframe's, not ours. "Shell — identical on every page":
 * desktop rail **219**, tablet icon rail **72**. 219 rather than the 220 this
 * file carried since the Generation C transcription — the spec draws `│219│`.
 */
const SIDEBAR_W = 219
const RAIL_W = 72

/** Law 15 — 44×44 at every width, desktop included. Applies to the rows too. */
const ROW_H = 44

/** How long a press must be held before the icon rail speaks its label. */
const LONG_PRESS_MS = 450

interface SidebarProps {
  /** Current pathname (with query) — decides which single row is active. */
  active: string
}

/**
 * **Sidebar — the fixed 11, in three width states.**
 *
 * The wireframe shell block, identical in all eleven specs:
 *
 * > DESKTOP ≥1280 `│nav│219│` · TABLET 768–1279 `│▮│72│`, "labels on
 * > hover/long-press" · PHONE <768 — no sidebar, a bottom bar instead.
 *
 * Law 13 — width decides, never platform. `useViewport()` is the only source of
 * the band; this component adds no breakpoint of its own. Phone renders
 * nothing at all: `App.tsx`'s Shell swaps in `BottomBar` below 768 and never
 * mounts this, and the early return here means a stale mount cannot leak a rail
 * onto a phone either.
 *
 * The manual collapse toggle (`useCollapsed('sidebar:main')`) predates the
 * width-driven rail and would otherwise fight it — a user who expanded the rail
 * on a desktop would drag the window to 900px and get a 219px sidebar in a band
 * the spec says is 72px. So collapse is now a **desktop-only affordance**: at
 * tablet the rail is forced by width, the toggle is not rendered, and the
 * persisted preference is ignored until the viewport is wide enough to honour
 * it again. The preference is kept, not cleared — it is the user's desktop
 * choice, and a resize is not a decision to discard it.
 *
 * The active accent is theme-dependent (blue in light, gold in dark); both
 * resolve through `--nav-active-accent`, so this component never branches on
 * theme either.
 */
export default function Sidebar({ active }: SidebarProps) {
  const { theme, setMode } = useTheme()
  const { user } = useAuth()
  const viewport = useViewport()
  /* Persisted independently of any one rail — this is the app shell, not a
     page panel, so it gets its own fixed key rather than a route-derived one. */
  const [collapsed, toggleCollapsed] = useCollapsed('sidebar:main', false)

  /* Tablet is always a rail. Desktop is a rail only if the user asked for one. */
  const rail = viewport === 'tablet' || (viewport === 'desktop' && collapsed)

  const allowedNav = permittedNav(user?.role)
  /* `data/nav.ts` — most specific match wins, so exactly one row can be
     `aria-current="page"`. The phone bar reads the same function. */
  const activeTo = activeNavTo(allowedNav, active)

  if (viewport === 'phone') return null

  return (
    <aside
      style={{
        width: rail ? RAIL_W : SIDEBAR_W,
        flexShrink: 0,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        /* v4.2 §5 — the collapse animates at 240ms on the app easing token.
           Width transitions lay the page out every frame; the spec accepts that
           as a one-off on collapse. theme.css's prefers-reduced-motion block
           (`* { transition: none !important }`) beats this inline value, so the
           opt-out is already honoured. */
        transition: 'width 240ms var(--ease), background-color var(--dur-theme) ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: rail ? '18px 10px 16px' : '18px 16px 16px',
          flexShrink: 0,
          justifyContent: rail ? 'center' : 'flex-start',
        }}
      >
        {/* The wordmark is brand voice, not a figure — §4.3.2 gives it Outfit. */}
        <span
          className="title"
          style={{ fontWeight: 700, fontSize: 'var(--t-kpi)', color: 'var(--brand-mark)', lineHeight: 1, flexShrink: 0 }}
        >
          BR
        </span>
        {!rail && (
          <span style={{ lineHeight: 1.15, minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>Babin</span>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
              Rentals OS
            </span>
          </span>
        )}
        {/* Desktop only. At tablet the 72px rail is the spec, not a preference. */}
        {viewport === 'desktop' && !collapsed && (
          <CollapseButton onClick={toggleCollapsed} direction="collapse" />
        )}
      </div>
      {viewport === 'desktop' && collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 'var(--sp-sm)', flexShrink: 0 }}>
          <CollapseButton onClick={toggleCollapsed} direction="expand" />
        </div>
      )}

      <NavList sections={allowedNav} activeTo={activeTo} rail={rail} />

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 10 }}>
        {!rail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 4px 10px' }}>
            <span
              className="title"
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-sm)',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--border)',
                color: 'var(--brand-mark)',
                fontWeight: 700,
                fontSize: 'var(--t-ui)',
                flexShrink: 0,
              }}
            >
              BR
            </span>
            <span style={{ lineHeight: 1.3, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {BRANCH.name}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{BRANCH.address}</span>
              <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {BRANCH.vat}
              </span>
            </span>
          </div>
        )}

        {/* Two labelled halves, not an icon button — the renders always show both
            options with the current one filled. Collapsed to one icon toggle in
            the rail, since there is no room for either label. */}
        {rail ? (
          <button
            type="button"
            onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: 44,
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              cursor: 'pointer',
            }}
          >
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
          </button>
        ) : (
          <div role="group" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(['dark', 'light'] as const).map((m) => {
              const on = theme === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    minHeight: 44,
                    borderRadius: 'var(--r-btn)',
                    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: on ? 'var(--nav-active-bg)' : 'transparent',
                    color: on ? 'var(--text)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textTransform: 'capitalize',
                  }}
                >
                  <Icon name={m === 'dark' ? 'moon' : 'sun'} size={14} />
                  {m}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}

/* ── rows ──────────────────────────────────────────────────────────────── */

/**
 * The eleven rows.
 *
 * In the rail there is no label to read, so one is produced on demand: `title`
 * for a mouse that stops moving, a rendered tooltip on hover for one that has
 * not, and the same tooltip after a {@link LONG_PRESS_MS} press for a finger —
 * the wireframe's "labels on hover/long-press". The tooltip is positioned
 * `fixed` from the row's own rect because the scroll container has
 * `overflow-y: auto`, which clips a sibling positioned at `left: 100%`.
 */
function NavList({
  sections,
  activeTo,
  rail,
}: {
  sections: NavSection[]
  activeTo: string | null
  rail: boolean
}) {
  const [hint, setHint] = useState<{ label: string; top: number } | null>(null)
  const pressTimer = useRef<number | null>(null)

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  useEffect(() => clearPress, [])
  /* A rail that expands mid-hover must not leave its tooltip behind. */
  useEffect(() => {
    if (!rail) setHint(null)
  }, [rail])

  const show = (el: HTMLElement, label: string) => {
    const r = el.getBoundingClientRect()
    setHint({ label, top: r.top + r.height / 2 })
  }

  return (
    <>
      <nav
        aria-label="Main"
        style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        {sections.map((s) => {
          const on = s.to === activeTo
          return (
            <Link
              key={s.to}
              to={s.to}
              aria-current={on ? 'page' : undefined}
              title={rail ? s.label : undefined}
              onMouseEnter={(e) => {
                if (rail) show(e.currentTarget, s.label)
                else if (!on) e.currentTarget.style.background = 'var(--hover-sidebar)'
              }}
              onMouseLeave={(e) => {
                setHint(null)
                if (!rail && !on) e.currentTarget.style.background = 'transparent'
              }}
              onPointerDown={(e) => {
                if (!rail || e.pointerType === 'mouse') return
                const el = e.currentTarget
                clearPress()
                pressTimer.current = window.setTimeout(() => show(el, s.label), LONG_PRESS_MS)
              }}
              /* Lifting the finger must dismiss the label as well as cancel the
                 timer. Clearing only the timer left a long-press tooltip pinned
                 on screen after the press ended: no `mouseleave`, `blur` or
                 `pointercancel` follows a touch release, `NavList` is not
                 unmounted by navigation, and the rail does not change, so
                 nothing else in this component ever cleared it — the label
                 survived the route change the same tap triggered. */
              onPointerUp={() => {
                clearPress()
                setHint(null)
              }}
              onPointerCancel={() => {
                clearPress()
                setHint(null)
              }}
              onBlur={() => setHint(null)}
              onFocus={(e) => {
                if (rail) show(e.currentTarget, s.label)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: rail ? 'center' : 'flex-start',
                gap: 10,
                /* Law 15 — 44×44 minimum hit area per row, every width. */
                minHeight: ROW_H,
                minWidth: rail ? ROW_H : undefined,
                padding: rail ? 0 : '0 10px',
                borderRadius: 9,
                textDecoration: 'none',
                fontSize: 'var(--t-ui)',
                fontWeight: on ? 600 : 500,
                color: on ? 'var(--text)' : 'var(--text2)',
                background: on ? 'var(--nav-active-bg)' : 'transparent',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color var(--dur) ease, color var(--dur) ease',
              }}
            >
              {on && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: '0 3px 3px 0',
                    background: 'var(--nav-active-accent)',
                  }}
                />
              )}
              <Icon
                name={s.icon}
                size={rail ? 20 : 16}
                style={{ color: on ? 'var(--nav-active-accent)' : 'var(--nav-icon)', flexShrink: 0 }}
              />
              {!rail && (
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {rail && hint && (
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: RAIL_W + 6,
            top: hint.top,
            transform: 'translateY(-50%)',
            padding: '6px 10px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 70,
          }}
        >
          {hint.label}
        </span>
      )}
    </>
  )
}

function CollapseButton({ onClick, direction }: { onClick: () => void; direction: 'collapse' | 'expand' }) {
  const label = direction === 'collapse' ? 'Collapse navigation' : 'Expand navigation'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        /* Law 15 — the box is 26px for the renders' proportions, the hit area
           is 44px via padding, which is what the law actually measures. */
        width: 26,
        height: 26,
        boxSizing: 'content-box',
        padding: 9,
        margin: -9,
        borderRadius: 7,
        border: 'none',
        background: 'transparent',
        color: 'var(--text2)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name={direction === 'collapse' ? 'chevron_left' : 'chevron_right'} size={13} />
      </span>
    </button>
  )
}
