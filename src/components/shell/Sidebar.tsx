import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useTheme } from '../../lib/theme'
import { SETTINGS_NAV, BRANCH, permittedNav } from '../../data/nav'
import type { NavSection } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { useCollapsed } from '../../lib/collapse'

const EXPANDED_W = 220
const COLLAPSED_W = 68

interface SidebarProps {
  /** Current pathname — decides both the active row and which section opens. */
  active: string
}

/**
 * A section owns the current route if it or any child matches.
 *
 * `path` carries the query string, because Operations' five queues are
 * distinguished only by `?queue=`. The *section* is matched on the bare path —
 * `/operations?queue=reset` is still inside Operations — while a *child* is
 * matched on the whole thing, which is the only way one queue can highlight
 * without all five lighting up.
 */
function owns(section: NavSection, path: string): boolean {
  const base = path.split('?')[0] ?? path
  if (base === section.to || base.startsWith(section.to + '/')) return true
  return Boolean(section.children?.some((c) => c.to === path))
}

/**
 * Sidebar — Foundation v2.0 §5.1: eight sections plus Settings, no numbering.
 *
 * Transcribed from renders `12402A27` and `09168AC3`. The active accent is
 * theme-dependent (blue in light, gold in dark); both resolve through
 * `--nav-active-accent`, so this component never branches on theme.
 */
export default function Sidebar({ active }: SidebarProps) {
  const { theme, setMode } = useTheme()
  const { user } = useAuth()
  /* Persisted independently of any one rail — this is the app shell, not a
     page panel, so it gets its own fixed key rather than a route-derived one. */
  const [collapsed, toggleCollapsed] = useCollapsed('sidebar:main', false)

  const allowedNav = permittedNav(user?.role)

  const owner = allowedNav.find((s) => owns(s, active))?.to ?? null

  // Only the section owning the current route is open — the renders never show
  // two expanded at once.
  const [open, setOpen] = useState<string | null>(owner)

  /*
   * Re-open the owning section whenever the route changes. Without this the
   * open state is set once on mount, so navigating to a child of a *collapsed*
   * section lands you on the right screen with nothing highlighted — the nav
   * silently loses your place. `lastRoute` keeps a manual collapse from being
   * undone on the next render.
   */
  const [lastRoute, setLastRoute] = useState(active)
  if (lastRoute !== active) {
    setLastRoute(active)
    if (owner !== null && owner !== open) setOpen(owner)
  }

  return (
    <aside
      style={{
        width: collapsed ? COLLAPSED_W : EXPANDED_W,
        flexShrink: 0,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        transition: 'background-color var(--dur-theme) ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: collapsed ? '18px 10px 16px' : '18px 16px 16px',
          flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {/* The wordmark is brand voice, not a figure — §4.3.2 gives it Outfit. */}
        <span className="title" style={{ fontWeight: 700, fontSize: 'var(--t-kpi)', color: 'var(--brand-mark)', lineHeight: 1, flexShrink: 0 }}>
          BR
        </span>
        {!collapsed && (
          <span style={{ lineHeight: 1.15, minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>Babin</span>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>Rentals OS</span>
          </span>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse navigation"
            title="Collapse navigation"
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text2)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Icon name="chevron_left" size={13} />
          </button>
        )}
      </div>
      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand navigation"
            title="Expand navigation"
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text2)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="chevron_right" size={13} />
          </button>
        </div>
      )}

      <nav
        aria-label="Main"
        style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        {allowedNav.map((s) => {
          const isOpen = open === s.to
          const owned = owns(s, active)
          const selfActive = s.to === active
          return (
            <div key={s.to}>
              {/*
                A real router Link, not an <a> with preventDefault. A section
                with children both navigates *and* expands: expanding without
                navigating leaves the main pane showing whatever was there
                before, which reads as a broken click.
              */}
              <Link
                to={s.to}
                aria-current={selfActive ? 'page' : undefined}
                aria-expanded={s.children ? isOpen : undefined}
                title={collapsed ? s.label : undefined}
                onClick={() => {
                  if (s.children) setOpen(s.to)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  height: 38,
                  padding: collapsed ? '0' : '0 10px',
                  borderRadius: 9,
                  textDecoration: 'none',
                  fontSize: 'var(--t-ui)',
                  fontWeight: owned ? 600 : 500,
                  color: owned ? 'var(--text)' : 'var(--text2)',
                  background: owned ? 'var(--nav-active-bg)' : 'transparent',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color var(--dur) ease, color var(--dur) ease',
                }}
                onMouseEnter={(e) => {
                  if (!owned) e.currentTarget.style.background = 'var(--hover-sidebar)'
                }}
                onMouseLeave={(e) => {
                  if (!owned) e.currentTarget.style.background = 'transparent'
                }}
              >
                {owned && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 7,
                      bottom: 7,
                      width: 3,
                      borderRadius: '0 3px 3px 0',
                      background: 'var(--nav-active-accent)',
                    }}
                  />
                )}
                <Icon
                  name={s.icon}
                  size={16}
                  style={{ color: owned ? 'var(--nav-active-accent)' : 'var(--nav-icon)', flexShrink: 0 }}
                />
                {!collapsed && (
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.label}
                  </span>
                )}
                {!collapsed && s.children && (
                  <Icon
                    name={isOpen ? 'chevron_up' : 'chevron_right'}
                    size={14}
                    style={{ color: 'var(--muted)', flexShrink: 0 }}
                  />
                )}
              </Link>

              {!collapsed && s.children && isOpen && (
                <div style={{ padding: '2px 0 4px' }}>
                  {s.children.map((c) => {
                    const on = c.to === active
                    return (
                      <Link
                        key={c.to + c.label}
                        to={c.to}
                        aria-current={on ? 'page' : undefined}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          height: 30,
                          padding: '0 10px 0 22px',
                          borderRadius: 8,
                          textDecoration: 'none',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 600 : 500,
                          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                          background: on ? 'var(--nav-active-bg)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!on) e.currentTarget.style.background = 'var(--hover-sidebar)'
                        }}
                        onMouseLeave={(e) => {
                          if (!on) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 999,
                            flexShrink: 0,
                            background: on ? 'var(--nav-active-accent)' : 'var(--disabled)',
                          }}
                        />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/*
          §5.1 — "Settings" is pinned below the divider, outside the eight. The
          rule is a hard ceiling on the *sections*, so Settings is rendered
          separately rather than as a ninth entry in NAV; that way the ceiling
          cannot be raised by appending to the array.
        */}
        <span aria-hidden style={{ height: 1, background: 'var(--border)', margin: '10px 10px 8px' }} />
        <Link
          to={SETTINGS_NAV.to}
          aria-current={active === SETTINGS_NAV.to ? 'page' : undefined}
          title={collapsed ? SETTINGS_NAV.label : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            height: 36,
            padding: collapsed ? '0' : '0 10px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 'var(--t-ui)',
            fontWeight: active === SETTINGS_NAV.to ? 600 : 500,
            color: active === SETTINGS_NAV.to ? 'var(--nav-active-accent)' : 'var(--text2)',
            background: active === SETTINGS_NAV.to ? 'var(--nav-active-bg)' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (active !== SETTINGS_NAV.to) e.currentTarget.style.background = 'var(--hover-sidebar)'
          }}
          onMouseLeave={(e) => {
            if (active !== SETTINGS_NAV.to) e.currentTarget.style.background = 'transparent'
          }}
        >
          <Icon
            name={SETTINGS_NAV.icon}
            size={16}
            style={{ color: active === SETTINGS_NAV.to ? 'var(--nav-active-accent)' : 'var(--nav-icon)', flexShrink: 0 }}
          />
          {!collapsed && <span style={{ flex: 1 }}>{SETTINGS_NAV.label}</span>}
        </Link>
      </nav>

      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 10 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 4px 10px' }}>
            <span
              className="title"
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
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
            options with the current one filled. Collapsed to one icon toggle when
            the rail itself is collapsed, since there is no room for either label. */}
        {collapsed ? (
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
              height: 34,
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
                    height: 34,
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
