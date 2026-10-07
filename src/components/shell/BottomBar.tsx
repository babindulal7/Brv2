import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'
import { bottomBarSlots, permittedNav, activeNavTo } from '../../data/nav'
import type { BottomBarSlot } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { toggleScanner } from './ScannerFab'
import MoreSheet from './MoreSheet'

/** The bar's own height, above the home-indicator inset — see {@link BAR_BOX}. */
export const BOTTOM_BAR_HEIGHT = 58

/**
 * What the bar actually occupies: its 58px of slots **plus** the safe area
 * underneath, added rather than carved out of it.
 *
 * `theme.css` sets `* { box-sizing: border-box }`, so the previous
 * `height: 58` + `paddingBottom: env(safe-area-inset-bottom)` pair reserved
 * nothing at all — the padding ate the content box instead of extending the
 * element. On a phone with a 34px inset that left a 24px content box for five
 * 44px slots, which overflowed into exactly the strip the padding existed to
 * keep clear: the labels, and the Scan pill that is already lifted 14px, sat
 * over the home indicator. jsdom performs no layout, so the Law 15 test in
 * `__tests__/shell.test.tsx` could not see it.
 *
 * The slots are held off the indicator by an explicit `${BOTTOM_BAR_HEIGHT}px`
 * grid row plus `alignContent: 'start'`, not by the padding this element used to
 * carry: growing the height alone would spread the five slots across the whole
 * box and put them straight back over the indicator. A grid row is also the one
 * form of this jsdom can represent — it drops `padding-bottom: env(…)` as an
 * unparseable value, so a test could never see the padding at all.
 *
 * Anything reserving space beneath the bar must use this, not
 * `BOTTOM_BAR_HEIGHT` — `App.tsx`'s page padding and `ScannerFab`'s offset both
 * do. `env()` resolves to 0px on every device without an inset.
 */
export const BAR_BOX = `calc(${BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`

/** Law 15 — 44×44 minimum per slot, and these are the thumb targets. */
const SLOT_MIN = 44

/**
 * **Phone bottom bar — the wireframe's five fixed slots.**
 *
 * > **Phone bar (5 slots):** Today · Rentals · **Scan ⦿** · Inventory · More.
 * > Nav items 1, 3, 5, 6, 9, 10, 11 live under **More**.
 *
 * Only ever mounted below 768 — `Shell` in `App.tsx` swaps this in for the
 * Sidebar.
 *
 * ## Two things this file used to say that the updated spec reverses
 *
 * **1. "A Driver's bar is not a Coordinator's."** It was a per-role curated
 * three (`DEVICES.md` §4) plus Settings. The wireframe gives every role the same
 * five slots. Fixed is not unfiltered, though: `bottomBarSlots()` still resolves
 * each routed slot through `permittedNav()`, so a role that cannot reach a route
 * gets no slot for it and the fixed bar cannot become an RBAC hole (Law 6). A
 * filtered-out slot leaves a four-slot bar, never a dead button.
 *
 * **2. "Deliberately carries no Scanner slot."** That was Foundation §5.5's
 * "a FAB at every width, never a nav item", and the bar's job was only to leave
 * room beneath the FAB. The wireframe now draws `▪ ▪ ⦿ ▪ ▪` — Scan is the
 * centre slot. It is still not a *nav item*: the slot has no route and dispatches
 * `toggleScanner()`, which opens the one `ScannerFab` panel. There is exactly one
 * scanner in the app and this is a second trigger for it, not a second scanner.
 *
 * ## AUD-014 (Ruled): Single scan entry point on phone
 * The floating FAB button is hidden below 768px (`!phone` in `ScannerFab.tsx`).
 * On mobile/phone viewports, the bottom bar's centre Scan slot is the single,
 * thumb-reachable entry point to open the Scanner sheet. On desktop and tablet,
 * the floating FAB is rendered at the bottom-right corner.
 */
export default function BottomBar({ active }: { active: string }) {
  const { user } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  /* Stable, because `MoreSheet` keys its focus-trap effect on this — an inline
     arrow would re-run the trap (and re-lock body scroll) on every render. */
  const closeMore = useCallback(() => setMoreOpen(false), [])

  const slots: BottomBarSlot[] = bottomBarSlots(user?.role)
  const activeTo = activeNavTo(permittedNav(user?.role), active)

  return (
    <>
      <nav
        aria-label="Main"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: BAR_BOX,
          display: 'grid',
          gridTemplateColumns: `repeat(${slots.length}, minmax(0,1fr))`,
          /* The slots get the top 58px exactly; whatever the inset adds stays
             empty below them. Without `start` the single row stretches to the
             full box and the labels sit over the home indicator again. */
          gridTemplateRows: `${BOTTOM_BAR_HEIGHT}px`,
          alignContent: 'start',
          /* v4.2 §4 — chrome glass, same reasoning as Header.tsx: content
             scrolls under this fixed bar, so the 0.88 tint needs the blur. */
          background: 'var(--sidebar)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border)',
          zIndex: 50,
        }}
      >
        {slots.map((slot) => (
          <Slot
            key={slotKey(slot)}
            slot={slot}
            activeTo={activeTo}
            moreOpen={moreOpen}
            onMore={() => setMoreOpen((v) => !v)}
          />
        ))}
      </nav>

      <MoreSheet open={moreOpen} onClose={closeMore} />
    </>
  )
}

function slotKey(slot: BottomBarSlot): string {
  return slot.kind === 'nav' ? slot.section.to : slot.kind
}

const slotStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  minHeight: SLOT_MIN,
  minWidth: SLOT_MIN,
  border: 'none',
  background: 'transparent',
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const labelStyle = { fontSize: 'var(--t-th)', whiteSpace: 'nowrap' as const }

function Slot({
  slot,
  activeTo,
  moreOpen,
  onMore,
}: {
  slot: BottomBarSlot
  activeTo: string | null
  moreOpen: boolean
  onMore: () => void
}) {
  if (slot.kind === 'scan') {
    return (
      <button
        type="button"
        /* Marks this as part of the scanner for `ScannerFab`'s outside-click
           handler, which would otherwise close the panel on pointerdown and
           see it reopened by the click — a button that never appears to work. */
        data-scanner
        onClick={toggleScanner}
        aria-label="Scan"
        style={{ ...slotStyle, color: 'var(--text2)' }}
      >
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            marginTop: -14,
            borderRadius: 'var(--r-badge)',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            boxShadow: 'var(--shadow-card)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name="search" size={19} />
        </span>
        <span style={{ ...labelStyle, fontWeight: 500 }}>Scan</span>
      </button>
    )
  }

  if (slot.kind === 'more') {
    return (
      <button
        type="button"
        onClick={onMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        style={{ ...slotStyle, color: moreOpen ? 'var(--nav-active-accent)' : 'var(--text2)' }}
      >
        <Icon name="more_vert" size={20} fill={moreOpen} />
        <span style={{ ...labelStyle, fontWeight: moreOpen ? 700 : 500 }}>More</span>
      </button>
    )
  }

  const { section } = slot
  const on = section.to === activeTo

  return (
    <Link
      to={section.to}
      aria-current={on ? 'page' : undefined}
      style={{ ...slotStyle, color: on ? 'var(--nav-active-accent)' : 'var(--text2)' }}
    >
      <Icon name={section.icon} size={20} fill={on} />
      <span style={{ ...labelStyle, fontWeight: on ? 700 : 500 }}>{section.label}</span>
    </Link>
  )
}
