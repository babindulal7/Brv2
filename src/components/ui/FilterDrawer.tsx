import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Icon from './Icon'
import { useViewport, useCapability } from '../../lib/device'

/**
 * # Filters as an overlay, not a column
 *
 * ## What was wrong
 *
 * Filters lived in `SideRail` → `CollapsibleAside`, which is a **layout
 * column**. Collapsed, it still renders a 32px flex container holding a 28px
 * chevron, and — more expensively — it stays in the page's
 * `minmax(0,1fr) auto` grid, so content cannot reflow into the space. That is
 * the "it only shows > and takes space" complaint, and the larger version of it
 * is already on record: on Rentals an always-visible-but-inert 210px filter
 * rail pushed the row Operations menu off-screen at the app's own 1280px
 * baseline, and collapsing it by default recovered 178px of table width.
 *
 * This panel is `position: fixed`. It occupies **zero** layout space at every
 * width, open or closed. The rail's contents drop in unchanged as `children`.
 *
 * ## Non-modal on desktop and tablet — deliberately
 *
 * Results update live, on every change. An overlay that covers the list it is
 * filtering fights that, and `booking/Drawer.tsx`'s modal treatment — a 45%
 * black scrim, `aria-modal`, `body { overflow: hidden }` — would make it worse:
 * the scrim dims exactly what the user is watching change, and the scroll lock
 * stops them scrolling the results they just narrowed.
 *
 * So on desktop and tablet there is no scrim, no scroll lock, and the page
 * stays interactive. The panel sits at the left edge and the list stays
 * readable beside it. **Click-outside does not close it**, because with a live
 * list every click on a row would dismiss the panel mid-filter; Escape and the
 * close button do. Filter System v1.0 §5 says desktop click-outside *may*
 * close, and in the same breath that the "table remains usable for context" —
 * which only holds if clicking the table does not dismiss the panel. The
 * non-closing reading is the one §5's own sentence needs.
 *
 * Phone gets the modal treatment, because at that width there is no "beside".
 *
 * ## The live count is not decoration
 *
 * At every width the header shows the current match count. It is what makes
 * "live" legible while the panel covers part of the list — the number moves
 * even when the rows behind it are hidden. Without it, live filtering under an
 * overlay is invisible feedback.
 */

/** §20 — 180–240ms. `--dur-drawer` is 200ms; this must stay in step with it. */
const DRAWER_MS = 200

/**
 * True when the OS asks for less motion.
 *
 * Read here as well as in CSS because the exit animation is unmounted on a
 * timer, and that timer has to collapse to zero for the same people the
 * `prefers-reduced-motion` block in `theme.css` has already opted out of the
 * animation. Otherwise the panel would sit there, motionless and still
 * on-screen, for 200ms after they closed it.
 */
/*
 * This was a private `prefersReducedMotion()` helper querying matchMedia
 * directly. `lib/device.ts:useCapability()` is the module that exists to
 * answer exactly this question, and it does so REACTIVELY — the private
 * version was read once per close, so a person who changed their motion
 * preference mid-session kept the old timer until a reload. Routed through the
 * hook below; the reasoning above about WHY the timer needs the value in JS
 * (rather than leaving it to the CSS block) still stands unchanged.
 */

export interface FilterDrawerProps {
  open: boolean
  onClose: () => void
  /** Stable DOM id so the invoking button's `aria-controls` can point at it. */
  id: string
  /** The rail's existing contents, unchanged. */
  children: ReactNode
  /**
   * Live match count. Renders in the header so the effect of a change is
   * visible even where the panel covers the list. `null` while loading.
   */
  resultCount?: number | null
  /** What is being counted — "rentals", "assets". Used in the header sentence. */
  noun?: string
  /** Number of active filters, for the header's Clear all. */
  activeCount?: number
  onClearAll?: () => void
  /** Panel width on desktop and tablet. */
  width?: number
  /**
   * Which edge the panel comes from.
   *
   * Defaults to `'left'`, matching where filters already live in this app
   * (`SideRail` is `side="left"`). The uploaded Filter System v1.0 doc specifies
   * a right-side drawer throughout (§4, §5, §21) — that is a live disagreement,
   * flagged rather than silently resolved. Changing it is this one prop.
   */
  side?: 'left' | 'right'
  /**
   * §15's hybrid. Omit for live filtering (the default, and what was chosen for
   * every screen so far); pass this on a page where a query is expensive enough
   * that it should not run on every keystroke — Reports is the named case — and
   * the footer becomes `Apply Filters (n)` instead of Clear all.
   */
  apply?: { pendingCount: number; onApply: () => void } | undefined
}

export function FilterDrawer({
  open,
  onClose,
  id,
  children,
  resultCount = null,
  noun = 'results',
  activeCount = 0,
  onClearAll,
  width = 360,
  side = 'left',
  apply,
}: FilterDrawerProps) {
  const viewport = useViewport()
  const phone = viewport === 'phone'
  // See the note above prefersReducedMotion's former home: the exit timer needs
  // this in JS, and useCapability keeps it reactive.
  const { reducedMotion } = useCapability()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  /**
   * `open` is the caller's intent; this is what is on screen.
   *
   * They differ for exactly one window — the 200ms of the exit animation, when
   * the caller has said closed and the panel is still sliding out. Unmounting
   * on `open` alone is why a drawer that slides in usually vanishes instantly:
   * there is nothing left to animate.
   *
   * The unmount is a TIMER, not `animationend`. Under
   * `prefers-reduced-motion: reduce` the stylesheet sets `animation: none`
   * globally, the event never fires, and a panel waiting for it would never
   * close at all.
   */
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const ms = reducedMotion ? 0 : DRAWER_MS
    const t = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, ms)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    // Scroll lock ONLY on phone. On desktop the user must still be able to
    // scroll the list they are filtering while the panel is open.
    if (phone) document.body.style.overflow = 'hidden'

    const raf = window.requestAnimationFrame(() => panelRef.current?.focus())

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (phone) document.body.style.overflow = ''
      window.cancelAnimationFrame(raf)
      restoreFocusTo.current?.focus()
    }
  }, [open, onClose, phone])

  if (!mounted) return null

  const headingId = `${id}-title`
  const enter = phone ? 'drawer-in-up' : side === 'left' ? 'drawer-in-left' : 'drawer-in-right'
  const exit = phone ? 'drawer-out-down' : side === 'left' ? 'drawer-out-left' : 'drawer-out-right'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        top: phone ? 0 : 'var(--header-h)',
        zIndex: 60,
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'stretch',
        justifyContent: phone ? 'center' : side === 'left' ? 'flex-start' : 'flex-end',
        // Desktop: the wrapper must not swallow clicks meant for the list.
        pointerEvents: phone ? 'auto' : 'none',
      }}
    >
      {/* Scrim on phone only — see the header note. */}
      {phone && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            animation: `${closing ? 'scrim-out' : 'scrim-in'} var(--dur-drawer) ease-out both`,
          }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        ref={panelRef}
        role="dialog"
        // Not `aria-modal` on desktop: the page behind genuinely stays usable,
        // and claiming otherwise would tell a screen reader the opposite.
        {...(phone ? { 'aria-modal': true } : {})}
        aria-labelledby={headingId}
        id={id}
        tabIndex={-1}
        style={{
          position: 'relative',
          zIndex: 1,
          pointerEvents: 'auto',
          width: phone ? '100%' : `min(${width}px, 100vw)`,
          maxHeight: phone ? '85vh' : 'none',
          // Full height on desktop so the scroll lives INSIDE the body and the
          // Clear all footer stays pinned rather than scrolling away.
          height: phone ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          borderLeft: phone || side === 'left' ? 'none' : '1px solid var(--border)',
          borderRight: phone || side === 'right' ? 'none' : '1px solid var(--border)',
          borderTop: phone ? '1px solid var(--border)' : 'none',
          borderRadius: phone ? 'var(--r-modal) var(--r-modal) 0 0' : 0,
          boxShadow: 'var(--shadow-modal)',
          outline: 'none',
          // §20. `both` holds the last frame, so a panel mid-exit stays off the
          // edge for the rest of its timer instead of snapping back into view.
          animation: `${closing ? exit : enter} var(--dur-drawer) ease-out both`,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 id={headingId} style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
              Filters
            </h2>
            {/* The live count. Updates on every change, which is what makes
                live filtering legible while this panel covers the list. */}
            <p aria-live="polite" style={{ margin: '3px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {resultCount === null ? 'Counting…' : `${resultCount} ${noun}`}
            </p>
          </div>
          <button
            type="button"
            className="press"
            onClick={onClose}
            aria-label="Close filters"
            style={{
              border: '1px solid transparent',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--r-btn)',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        {/*
          Its own scroll, and `overscroll-behavior: contain` so reaching the end
          of this list does NOT start scrolling the results behind it. That is
          what "scroll to a specific place" needs: hovering the panel scrolls
          the panel, hovering the list scrolls the list, and neither steals the
          other's wheel.
        */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '14px 16px',
            display: 'grid',
            alignContent: 'start',
            gap: 'var(--sp-md)',
          }}
        >
          {children}
        </div>

        {apply ? (
          <footer style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              type="button"
              onClick={apply.onApply}
              disabled={apply.pendingCount === 0}
              style={{
                width: '100%',
                minHeight: 44,
                borderRadius: 'var(--r-btn)',
                border: '1px solid transparent',
                background: apply.pendingCount === 0 ? 'var(--disabled)' : 'var(--primary)',
                color: apply.pendingCount === 0 ? 'var(--muted)' : 'var(--on-brand)',
                fontFamily: 'inherit',
                fontWeight: 700,
                cursor: apply.pendingCount === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {apply.pendingCount === 0 ? 'No unapplied changes' : `Apply Filters (${apply.pendingCount})`}
            </button>
          </footer>
        ) : (
          activeCount > 0 &&
          onClearAll && (
            <footer style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={onClearAll}
                style={{
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Clear all {activeCount} filter{activeCount === 1 ? '' : 's'}
              </button>
            </footer>
          )
        )}
      </div>
    </div>
  )
}

/**
 * The toolbar control that opens the drawer.
 *
 * The count badge is load-bearing, not ornament: with the panel closed and the
 * rail gone, this badge is the ONLY thing telling a user their list is
 * narrowed. Without it, someone returns to a page whose filters persisted from
 * last visit, sees four rows, and concludes the data is missing.
 */
export function FilterButton({
  onClick,
  activeCount = 0,
  controls,
  expanded,
  label = 'Filters',
}: {
  onClick: () => void
  activeCount?: number
  controls: string
  expanded: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      className="press"
      onClick={onClick}
      aria-controls={controls}
      aria-expanded={expanded}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        minHeight: 44,
        padding: '0 13px',
        borderRadius: 'var(--r-btn)',
        border: `1px solid ${activeCount > 0 ? 'var(--primary)' : 'var(--btn-secondary-border)'}`,
        background: 'transparent',
        color: activeCount > 0 ? 'var(--primary)' : 'var(--text)',
        fontFamily: 'inherit',
        fontSize: 'var(--t-ui)',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {/* The registry has no `filter` glyph (Icon.tsx REGISTRY, ~60 names).
          `queues` is the funnel-adjacent one already in use for stacked lists;
          adding a Tabler filter icon would widen the icon budget for one control. */}
      <Icon name="queues" size={15} />
      {label}
      {activeCount > 0 && (
        <span
          className="figure"
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 'var(--r-badge)',
            background: 'var(--primary)',
            color: 'var(--on-brand)',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
          }}
        >
          {activeCount}
        </span>
      )}
    </button>
  )
}

/**
 * A row of removable chips showing which filters are currently on.
 *
 * This is the other half of hiding the rail. A count badge says *how many*
 * filters are active; this says *which*, and lets one be dropped without
 * reopening the panel. It renders nothing when no filter is active, so it costs
 * zero height on an unfiltered page — which is the state most pages are in most
 * of the time.
 */
export interface ActiveFilter {
  /** Stable key, e.g. `stage:Booked`. */
  key: string
  /** What the user reads — "Stage: Booked". */
  label: string
  onRemove: () => void
}

export function ActiveFilterChips({
  filters,
  onClearAll,
  /** §8 — show this many, then a "+N more" that reveals the rest. */
  maxVisible = 4,
}: {
  filters: readonly ActiveFilter[]
  onClearAll?: () => void
  maxVisible?: number
}) {
  const listId = useId()
  const [expanded, setExpanded] = useState(false)
  if (filters.length === 0) return null

  // §8 — "do not allow active chips to destroy the toolbar layout". Wrapping to
  // three rows pushes the table down as far as the old rail pushed it sideways.
  const overflow = filters.length - maxVisible
  const shown = expanded || overflow <= 0 ? filters : filters.slice(0, maxVisible)

  return (
    <div
      role="list"
      aria-label="Active filters"
      id={listId}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
    >
      {shown.map((f) => (
        <span
          key={f.key}
          role="listitem"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 28,
            padding: '0 4px 0 10px',
            borderRadius: 'var(--r-badge)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          {f.label}
          {/* The glyph stays 20px because its chip is only 28px tall — a target
              painted at the full touch minimum would stand taller than its own
              parent and burst the row. §5 sanctions exactly this trade: keep the
              paint compact, extend the hit area underneath it, because the law
              is the hit area and not the paint.

              This used to carry its own hand-rolled `aria-hidden` span holding a
              literal 44×44. That worked — a plain descendant with default
              pointer-events is genuinely part of the button's hit region — but it
              was a private copy of a rule that now has one home in `theme.css`,
              and it hard-coded the number `--tap` owns. `.tap` brings its own
              `position: relative`, so the inline one left with the span. */}
          <button
            type="button"
            className="tap"
            onClick={f.onRemove}
            aria-label={`Remove filter ${f.label}`}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 20,
              height: 20,
              border: 'none',
              borderRadius: 'var(--r-badge)',
              background: 'transparent',
              color: 'var(--text2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}

      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={listId}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 'var(--r-badge)',
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--text2)',
            fontFamily: 'inherit',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Show fewer' : `+${overflow} more`}
        </button>
      )}

      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 'var(--r-badge)',
            border: 'none',
            background: 'transparent',
            color: 'var(--text2)',
            fontFamily: 'inherit',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Clear all
        </button>
      )}
    </div>
  )
}

export interface FilterOption {
  value: string
  /** Defaults to `value`. */
  label?: string
  /**
   * §10 — how many rows this option would leave. `undefined` means the page has
   * not asked for facet counts; `null` means it asked and they have not landed
   * yet, which renders as a dash rather than as a zero. A zero and an unknown
   * must not look the same: one says "clicking this empties the list", the
   * other says "we do not know yet".
   */
  count?: number | null | undefined
}

/**
 * One filter group: a labelled list of checkboxes.
 *
 * ## §9 · the search box appears, it is not always there
 *
 * A search field over six stages is furniture — it costs a row of height and a
 * tab stop to filter a list you can already read in one glance. Over 40 product
 * categories it is the only way to reach the one you want. So it appears at
 * `searchFrom` options and not before, which is what "only earns its place on
 * Inventory and Reports" means in code.
 *
 * The search narrows the OPTIONS, never the rows. It is a client-side match
 * over a list already in hand — no query, no debounce, nothing to get wrong.
 *
 * ## §10 · counts sit beside the option, and they are computed without it
 *
 * `☑ Open 45` is the difference between filtering and guessing. The count for
 * each option must be computed with THIS group's own selection dropped —
 * otherwise ticking Open drives every sibling to 0 and the group can never be
 * widened, only narrowed. `facetCounts.ts` is where that happens; this
 * component only draws what it is handed.
 */
export function FilterOptionList({
  label,
  options,
  selected,
  onToggle,
  searchFrom = 8,
  countsLoading = false,
}: {
  label: string
  options: readonly FilterOption[]
  selected: readonly string[]
  onToggle: (value: string) => void
  /** Show the §9 search box once the group has at least this many options. */
  searchFrom?: number
  /** Render every count as "—" while a facet query is in flight. */
  countsLoading?: boolean
}) {
  const [term, setTerm] = useState('')
  const searchId = useId()
  const groupId = useId()

  const searchable = options.length >= searchFrom
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (!t) return options
    return options.filter((o) => (o.label ?? o.value).toLowerCase().includes(t))
  }, [options, term])

  const chosen = useMemo(() => new Set(selected), [selected])

  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }} aria-describedby={groupId}>
      <legend
        id={groupId}
        style={{ padding: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}
      >
        {label}
      </legend>

      {searchable && (
        <input
          id={searchId}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          aria-label={`Search within ${label}`}
          style={{
            width: '100%',
            minHeight: 36,
            marginBottom: 6,
            padding: '0 10px',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 'var(--t-meta)',
          }}
        />
      )}

      {shown.length === 0 ? (
        <p style={{ margin: '4px 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          No {label.toLowerCase()} matches “{term}”.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {shown.map((o) => {
            const text = o.label ?? o.value
            const on = chosen.has(o.value)
            return (
              /*
                The ROW grows to the touch minimum; the checkbox stays 16px.
                A label forwards its clicks to the control it wraps, so the whole
                strip — box, option name and facet count — is one target, and we
                get there without the grotesquerie of a 44px native checkbox.
                Same bargain the packing, handover and reset card rows already
                make.

                36px was simply short of the line. Nothing about a filter panel
                is dense enough to earn §5's compact exception, and the drawer
                body scrolls on its own axis, so the extra height per option
                costs a little scroll rather than a clipped option. The rows are
                real boxes in a grid, not pseudo-elements, so growing them pushes
                their neighbours apart instead of overlapping them.
              */
              <label
                key={o.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  minHeight: 44,
                  padding: '0 8px',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text)',
                  background: on ? 'var(--hover-card)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(o.value)}
                  style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--primary)' }}
                />
                <span style={{ flex: 1, minWidth: 0, fontWeight: on ? 700 : 400 }}>{text}</span>
                {o.count !== undefined && (
                  <span
                    className="figure"
                    style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {countsLoading || o.count === null ? '—' : o.count}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

/** Shared by callers that lay their own controls out inside the drawer. */
export const filterGroupStyle: CSSProperties = { display: 'grid', gap: 'var(--sp-md)', alignContent: 'start' }
