import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useTheme } from '../../lib/theme'
import { permittedNav, permittedMoreNav, permittedNavGroups, activeNavTo } from '../../data/nav'
import type { NavSection, NavGroup } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { useCollapsed } from '../../lib/collapse'
import { useViewport } from '../../lib/device'

/**
 * The application navigation is part of the same shell system as filters and
 * action panels. Expanded navigation therefore reads the shared sidebar token;
 * only the intentionally collapsed icon rail has its own token.
 */
const SIDEBAR_W = 'var(--app-sidebar-width)'
const RAIL_W = 'var(--app-sidebar-collapsed-width)'

/** Law 15 — 44×44 at every width, desktop included. Applies to the rows too. */
const ROW_H = 44

/** How long a press must be held before the icon rail speaks its label. */
const LONG_PRESS_MS = 450

/** Rail tooltip timing — calm, not jumpy and not browser-slow. */
const TOOLTIP_OPEN_DELAY_MS = 120
const TOOLTIP_CLOSE_DELAY_MS = 75
/** Gap between the rail and the floating tooltip. */
const TOOLTIP_GAP = 10
/** Minimum distance kept from the viewport top/bottom edges. */
const TOOLTIP_EDGE_MARGIN = 24

/**
 * The single collapsed-rail tooltip. Portaled to `document.body` so no
 * sidebar overflow rule can clip it, `position: fixed` against the hovered
 * row's rect, `pointer-events: none` so the cursor can never touch it (which
 * is what used to flicker it), clamped into the viewport for bottom rows.
 * One instance exists at a time — `NavList` owns the only `hint` state.
 */
function RailTooltip({ label, anchorRight, anchorCy }: { label: string; anchorRight: number; anchorCy: number }) {
  const top = Math.min(Math.max(anchorCy, TOOLTIP_EDGE_MARGIN), Math.max(TOOLTIP_EDGE_MARGIN, window.innerHeight - TOOLTIP_EDGE_MARGIN))
  return createPortal(
    <span
      role="tooltip"
      style={{
        position: 'fixed',
        left: anchorRight + TOOLTIP_GAP,
        top,
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
        width: 'max-content',
        maxWidth: 'calc(100vw - 96px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
        zIndex: 'var(--z-dropdown)',
      }}
    >
      {label}
    </span>,
    document.body,
  )
}

interface SidebarProps {
  /** Current pathname (with query) — decides which single row is active. */
  active: string
}

/**
 * **Sidebar — the fixed 11, in three width states.**
 *
 * The wireframe shell block, identical in all eleven specs:
 *
 * Desktop and tablet share the token-sized expanded navigation or compact
 * icon rail. Phone uses the bottom bar instead.
 *
 * Law 13 — width decides, never platform. `useViewport()` is the only source of
 * the band; this component adds no breakpoint of its own. Phone renders
 * nothing at all: `App.tsx`'s Shell swaps in `BottomBar` below 768 and never
 * mounts this, and the early return here means a stale mount cannot leak a rail
 * onto a phone either.
 *
 * Tablets default to the compact rail on the first visit. Both tablet and
 * desktop retain the user's manual preference across navigation and reloads.
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
  const [collapsed, toggleCollapsed] = useCollapsed('sidebar:main', viewport === 'tablet')

  /* A resize must not override a deliberate navigation preference. */
  const rail = collapsed

  /* Page-level filter drawers begin after the app navigation, matching the
     two-rail Booqable layout instead of covering the primary navigation. */
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--shell-nav-w', rail ? RAIL_W : SIDEBAR_W)
    return () => {
      root.style.removeProperty('--shell-nav-w')
    }
  }, [rail])

  const allowedGroups = permittedNavGroups(user?.role)
  const allowedNav = permittedNav(user?.role)
  const allowedMore = permittedMoreNav(user?.role)
  const allPermitted = [...allowedNav, ...allowedMore]
  /* `data/nav.ts` — most specific match wins, so exactly one row can be
     `aria-current="page"`. The phone bar reads the same function. */
  const activeTo = activeNavTo(allPermitted, active)

  if (viewport === 'phone') return null

  return (
    <aside
      className="app-navigation"
      style={{
        width: rail ? RAIL_W : SIDEBAR_W,
        flexShrink: 0,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
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
        {/* Manual collapse remains available on tablet and desktop. */}
        {!collapsed && (
          <CollapseButton onClick={toggleCollapsed} direction="collapse" />
        )}
      </div>
      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 'var(--sp-sm)', flexShrink: 0 }}>
          <CollapseButton onClick={toggleCollapsed} direction="expand" />
        </div>
      )}

      <NavList groups={allowedGroups} moreSections={allowedMore} activeTo={activeTo} rail={rail} />

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 10 }}>

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
 * Grouped navigation across 3 operational domains.
 *
 * In the rail there is no label to read, so one is produced on demand: `title`
 * for a mouse that stops moving, a rendered tooltip on hover for one that has
 * not, and the same tooltip after a LONG_PRESS_MS press for a finger.
 */
function NavList({
  groups,
  moreSections,
  activeTo,
  rail,
}: {
  groups: NavGroup[]
  moreSections: NavSection[]
  activeTo: string | null
  rail: boolean
}) {
  const navigate = useNavigate()
  const [hint, setHint] = useState<{ label: string; anchorRight: number; anchorCy: number } | null>(null)
  const isMoreActive = moreSections.some((m) => m.to === activeTo)
  const [moreOpen, setMoreOpen] = useState(isMoreActive)
  const [moreFlyoutTop, setMoreFlyoutTop] = useState<number>(0)
  const pressTimer = useRef<number | null>(null)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreFlyoutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isMoreActive && !rail) setMoreOpen(true)
  }, [isMoreActive, rail])

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const clearTooltipTimers = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  useEffect(() => clearPress, [])
  useEffect(() => clearTooltipTimers, [])
  /* A rail that expands mid-hover must not leave its tooltip behind. */
  useEffect(() => {
    if (!rail) {
      clearTooltipTimers()
      setHint(null)
      if (rail) setMoreOpen(false)
    }
  }, [rail])

  useEffect(() => {
    if (!rail || !moreOpen) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    const onClickAway = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onEscape)
    window.addEventListener('mousedown', onClickAway)
    return () => {
      window.removeEventListener('keydown', onEscape)
      window.removeEventListener('mousedown', onClickAway)
    }
  }, [rail, moreOpen])

  /* Keep the rail flyout fully inside the viewport. The anchor is the More
     button's vertical center, which sits near the bottom of the rail — without
     clamping, translateY(-50%) pushes half the flyout under the page footer
     where it reads as "hidden behind" the content. Measured, not estimated:
     the item count varies by role. Same 24px edge margin as RailTooltip. */
  useLayoutEffect(() => {
    if (!rail || !moreOpen) return
    const el = moreFlyoutRef.current
    if (!el) return
    const half = el.offsetHeight / 2
    const min = half + TOOLTIP_EDGE_MARGIN
    const max = window.innerHeight - half - TOOLTIP_EDGE_MARGIN
    if (max < min) return
    setMoreFlyoutTop((t) => {
      const clamped = Math.min(Math.max(t, min), max)
      return clamped === t ? t : clamped
    })
  }, [rail, moreOpen, moreFlyoutTop])

  /* Immediate — touch long-press. Hover/focus go through the delayed pair
     below so rapid travel never stacks tooltips. */
  const show = (el: HTMLElement, label: string) => {
    clearTooltipTimers()
    const r = el.getBoundingClientRect()
    // Anchor to the rail edge, not the row: rows sit inside the nav's 8px
    // padding, so row.right would eat most of the tooltip gap.
    const railRight = el.closest('aside')?.getBoundingClientRect().right ?? r.right
    setHint({ label, anchorRight: railRight, anchorCy: r.top + r.height / 2 })
  }

  const scheduleShow = (el: HTMLElement, label: string) => {
    clearTooltipTimers()
    showTimer.current = window.setTimeout(() => show(el, label), TOOLTIP_OPEN_DELAY_MS)
  }

  const scheduleHide = () => {
    clearTooltipTimers()
    hideTimer.current = window.setTimeout(() => setHint(null), TOOLTIP_CLOSE_DELAY_MS)
  }

  return (
    <>
      <nav
        aria-label="Main"
        style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {groups.map((group, groupIdx) => (
          <div key={group.id} data-nav-group={group.title} role="group" aria-label={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {groupIdx > 0 && (
              <div
                aria-hidden
                style={{
                  height: 1,
                  background: 'var(--border)',
                  margin: rail ? '6px 8px' : '8px 10px',
                  opacity: 0.6,
                }}
              />
            )}
            {group.sections.map((s) => {
              const on = s.to === activeTo
              return (
                <div
                  key={s.to}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <Link
                    to={s.to}
                    aria-current={on ? 'page' : undefined}
                    /* No native `title`: the rail renders one custom tooltip
                       (RailTooltip, portaled). A title here would fire the
                       browser tooltip as a duplicate. The accessible name
                       comes from aria-label in rail, visible text otherwise. */
                    aria-label={s.label}
                    onMouseEnter={(e) => {
                      if (rail) {
                        scheduleShow(e.currentTarget, s.label)
                        if (!on) e.currentTarget.style.background = 'var(--hover-sidebar)'
                      } else {
                        if (!on) e.currentTarget.style.background = 'var(--hover-sidebar)'
                        e.currentTarget.style.transform = 'translateX(2px)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (rail) scheduleHide()
                      else setHint(null)
                      if (!on) e.currentTarget.style.background = 'transparent'
                      if (!rail) e.currentTarget.style.transform = 'none'
                    }}
                    onPointerDown={(e) => {
                      if (!rail || e.pointerType === 'mouse') return
                      const el = e.currentTarget
                      clearPress()
                      pressTimer.current = window.setTimeout(() => show(el, s.label), LONG_PRESS_MS)
                    }}
                    onPointerUp={() => {
                      clearPress()
                      clearTooltipTimers()
                      setHint(null)
                    }}
                    onPointerCancel={() => {
                      clearPress()
                      clearTooltipTimers()
                      setHint(null)
                    }}
                    onBlur={(e) => {
                      if (rail) scheduleHide()
                      else setHint(null)
                      if (rail && !on) e.currentTarget.style.background = 'transparent'
                    }}
                    onFocus={(e) => {
                      if (rail) {
                        scheduleShow(e.currentTarget, s.label)
                        if (!on) e.currentTarget.style.background = 'var(--hover-sidebar)'
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: rail ? 'center' : 'flex-start',
                      gap: 10,
                      /* Law 15 — 44×44 minimum hit area per row, every width. */
                      minHeight: ROW_H,
                      minWidth: rail ? ROW_H : undefined,
                      width: '100%',
                      padding: rail ? 0 : s.action ? '0 64px 0 10px' : '0 10px',
                      borderRadius: 'var(--r-btn)',
                      textDecoration: 'none',
                      fontSize: 'var(--t-ui)',
                      fontWeight: on ? 600 : 500,
                      color: on ? 'var(--text)' : 'var(--text2)',
                      background: on ? 'var(--nav-active-bg)' : 'transparent',
                      boxShadow: on ? 'var(--specular-rim), 0 1px 2px rgba(0, 0, 0, 0.04)' : undefined,
                      position: 'relative',
                      cursor: 'pointer',
                      transition:
                        'transform var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)',
                    }}
                  >
                    {on && (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 2,
                          top: 10,
                          bottom: 10,
                          width: 3,
                          borderRadius: 999,
                          background: 'var(--nav-active-accent)',
                          boxShadow: '0 0 6px var(--nav-active-accent)',
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
                  {s.action && !rail && (
                    <button
                      type="button"
                      title={s.action.title ?? s.action.label}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        navigate(s.action!.to)
                      }}
                      style={{
                        position: 'absolute',
                        right: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px 8px',
                        borderRadius: 'var(--r-btn)',
                        background: on ? 'var(--nav-active-accent)' : 'var(--card2)',
                        color: on ? '#fff' : 'var(--text2)',
                        fontSize: 11,
                        fontWeight: 600,
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        lineHeight: 1.3,
                        zIndex: 2,
                      }}
                    >
                      {s.action.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Secondary navigation under More */}
        {moreSections.length > 0 && (
          rail ? (
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label="More"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMoreFlyoutTop(r.top + r.height / 2)
                  setMoreOpen((v) => !v)
                }}
                onMouseEnter={(e) => {
                  scheduleShow(e.currentTarget, 'More')
                  if (!isMoreActive) e.currentTarget.style.background = 'var(--hover-sidebar)'
                }}
                onMouseLeave={(e) => {
                  scheduleHide()
                  if (!isMoreActive) e.currentTarget.style.background = 'transparent'
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') return
                  const el = e.currentTarget
                  clearPress()
                  pressTimer.current = window.setTimeout(() => {
                    const r = el.getBoundingClientRect()
                    setMoreFlyoutTop(r.top + r.height / 2)
                    setMoreOpen(true)
                  }, LONG_PRESS_MS)
                }}
                onPointerUp={clearPress}
                onPointerCancel={clearPress}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: ROW_H,
                  minWidth: ROW_H,
                  borderRadius: 9,
                  border: 'none',
                  background: isMoreActive ? 'var(--nav-active-bg)' : 'transparent',
                  color: isMoreActive ? 'var(--nav-active-accent)' : 'var(--text2)',
                  position: 'relative',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {isMoreActive && (
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
                  name="more_vert"
                  size={20}
                  style={{ color: isMoreActive ? 'var(--nav-active-accent)' : 'var(--nav-icon)' }}
                />
              </button>

              {moreOpen && (
                <div
                  ref={moreFlyoutRef}
                  role="menu"
                  aria-label="More modules"
                  style={{
                    position: 'fixed',
                    left: `calc(${RAIL_W} + 6px)`,
                    top: moreFlyoutTop,
                    transform: 'translateY(-50%)',
                    padding: '6px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-modal)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 'var(--z-dropdown)',
                    minWidth: 160,
                    maxHeight: 'calc(100vh - 48px)',
                    overflowY: 'auto',
                  }}
                >
                  {moreSections.map((m) => {
                    const on = m.to === activeTo
                    return (
                      <Link
                        key={m.to}
                        to={m.to}
                        role="menuitem"
                        aria-current={on ? 'page' : undefined}
                        onClick={() => setMoreOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          minHeight: ROW_H,
                          padding: '0 10px',
                          borderRadius: 'var(--r-sm)',
                          textDecoration: 'none',
                          fontSize: 'var(--t-ui)',
                          fontWeight: on ? 600 : 500,
                          color: on ? 'var(--text)' : 'var(--text2)',
                          background: on ? 'var(--nav-active-bg)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name={m.icon} size={16} style={{ color: on ? 'var(--nav-active-accent)' : 'var(--nav-icon)' }} />
                        <span>{m.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-haspopup="true"
                onClick={() => setMoreOpen((v) => !v)}
                onMouseEnter={(e) => {
                  if (!isMoreActive) e.currentTarget.style.background = 'var(--hover-sidebar)'
                }}
                onMouseLeave={(e) => {
                  if (!isMoreActive) e.currentTarget.style.background = 'transparent'
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 10,
                  minHeight: ROW_H,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: 'none',
                  fontSize: 'var(--t-ui)',
                  fontWeight: isMoreActive ? 600 : 500,
                  color: isMoreActive ? 'var(--text)' : 'var(--text2)',
                  background: isMoreActive ? 'var(--nav-active-bg)' : 'transparent',
                  position: 'relative',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'background-color var(--dur) ease, color var(--dur) ease',
                }}
              >
                {isMoreActive && (
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
                  name="more_vert"
                  size={16}
                  style={{ color: isMoreActive ? 'var(--nav-active-accent)' : 'var(--nav-icon)', flexShrink: 0 }}
                />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  More
                </span>
                <Icon
                  name={moreOpen ? 'chevron_down' : 'chevron_right'}
                  size={14}
                  style={{ color: 'var(--muted)', flexShrink: 0 }}
                />
              </button>

              {moreOpen && (
                <div
                  role="region"
                  aria-label="More navigation"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    paddingLeft: 12,
                    margin: '2px 0 4px',
                  }}
                >
                  {moreSections.map((m) => {
                    const on = m.to === activeTo
                    return (
                      <Link
                        key={m.to}
                        to={m.to}
                        aria-current={on ? 'page' : undefined}
                        onMouseEnter={(e) => {
                          if (!on) e.currentTarget.style.background = 'var(--hover-sidebar)'
                        }}
                        onMouseLeave={(e) => {
                          if (!on) e.currentTarget.style.background = 'transparent'
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          minHeight: ROW_H,
                          padding: '0 10px',
                          borderRadius: 8,
                          textDecoration: 'none',
                          fontSize: 'var(--t-meta)',
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
                          name={m.icon}
                          size={15}
                          style={{ color: on ? 'var(--nav-active-accent)' : 'var(--nav-icon)' }}
                        />
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        )}
      </nav>

      {rail && hint && (
        <RailTooltip label={hint.label} anchorRight={hint.anchorRight} anchorCy={hint.anchorCy} />
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
