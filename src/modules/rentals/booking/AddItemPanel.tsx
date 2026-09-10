/**
 * **Add Item — the smart search panel ("New Booking" spec §23–35).**
 *
 * Replaces Section 2's `<select><option>Add Item…</option></select>`. That
 * control could not be searched, could not show a price, could not show
 * whether the thing was even available for the booking's dates, and could not
 * offer a bundle at all — the section is titled *Equipment, Bundles &
 * Services* and the picker only ever offered one of the three.
 *
 * This is a **refinement of that control**, not a new step. It renders in the
 * same section-header action slot, at the same height, and it raises a
 * callback; the page still owns the lines, the pricing and the conflict check.
 * There is no wizard here and nothing navigates.
 *
 * ## The contract, point by point
 *
 * - **§25 one query, four groups.** Typing searches bundles, equipment,
 *   accessories and services at once. The operator never has to decide what
 *   kind of thing they are looking for before they type; the type is how the
 *   answer is grouped.
 * - **§26 the fields.** Name, bundle name, SKU, bundle code, serial, brand,
 *   category, tags — and every model *inside* a bundle, so "FX3" finds the
 *   Sony FX3 Documentary Kit.
 * - **§27 tabs.** All | Bundles | Equipment | Services, defaulting to All.
 * - **§28–30 categories.** Derived from the catalogue, never typed. See
 *   `itemCatalogue.DERIVED_CATEGORIES`.
 * - **§32 availability.** Icon + label + colour on every row, filterable,
 *   checked against the booking's own dates.
 * - **§35 sort.** Four sorts that work; the two that cannot be honestly
 *   derived are named, with the reason, instead of shipped as no-ops.
 *
 * ## Keyboard and a11y
 *
 * ARIA 1.2 combobox, matching `ClientCombobox` so Section 1 and Section 2
 * behave identically: `role="combobox"` on the input, a `listbox` of
 * `option`s, `aria-activedescendant`, ↑/↓/Home/End/Enter/Esc, and a 2-char
 * search threshold. ⌘K / Ctrl+K opens the panel and focuses the field.
 *
 * One deliberate deviation, documented because it is a real trade-off: a
 * bundle row carries a second action ([View]) and **interactive content is not
 * allowed inside `role="option"`**. Rather than break the listbox or drop the
 * affordance, the [View] button is a mouse affordance only — `tabIndex={-1}`
 * and `aria-hidden` — and its function is exposed to the keyboard and to
 * assistive tech on the option itself: `→` opens the preview, and every
 * bundle option's accessible name ends with "press Right Arrow to preview its
 * components". Nothing is reachable by mouse that is not reachable by
 * keyboard.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import Icon from '../../../components/ui/Icon'
import { formatMoney } from '../../../lib/money'
import type { BundleRecord } from '../../../lib/queries/bundles'
import { AvailabilityChip, BundlePreview } from './BundlePreview'
import { TOUCH } from './ClientHealthChip'
import { OverbookingOverrideModal } from './OverbookingOverrideModal'
import { getAllowOverbooking } from '../../../lib/bookingRules'
import {
  DERIVED_CATEGORIES,
  OMITTED_SORTS,
  SERVICES_UNAVAILABLE_REASON,
  SORT_OPTIONS,
  addBundleToBooking,
  equipmentLineDraft,
  groupEquipmentResults,
  runQuery,
} from './itemCatalogue'
import type {
  AddBundleResult,
  AvailabilityLevel,
  BookingLineDraft,
  BookingWindow,
  BundleResult,
  EquipmentAvailabilitySource,
  EquipmentModelGroup,
  EquipmentResult,
  QueryGroup,
  ResultKind,
  SortKey,
} from './itemCatalogue'

/* ── Tabs (§27) ────────────────────────────────────────────────────────── */

type TabKey = 'all' | 'bundles' | 'equipment' | 'services'

/**
 * Accessories are not a fifth tab. §25 groups them separately in the results
 * but they are equipment, so the Equipment tab shows both and the All tab
 * gives each its own heading.
 */
const TAB_KINDS: Record<TabKey, ReadonlySet<ResultKind>> = {
  all: new Set<ResultKind>(['bundle', 'equipment', 'accessory', 'service']),
  bundles: new Set<ResultKind>(['bundle']),
  equipment: new Set<ResultKind>(['equipment', 'accessory']),
  services: new Set<ResultKind>(['service']),
}

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'services', label: 'Services' },
]

/*
 * `AvailabilityLevel` gained `'unknown'` when the windowed read arrived, and
 * this list did not follow it. Two consequences, both real: there was no way
 * to see the unchecked rows, and "Available only" emptied the entire catalogue
 * for as long as the read was in flight — every live row is `unknown` until it
 * lands, and on the live project (no `product_units`) every row stays that way.
 */
const AVAILABILITY_FILTERS: ReadonlyArray<{ value: AvailabilityLevel | 'any'; label: string }> = [
  { value: 'any', label: 'Any availability' },
  { value: 'available', label: 'Available only' },
  { value: 'partial', label: 'Partial only' },
  { value: 'unavailable', label: 'Unavailable only' },
  { value: 'unknown', label: 'Not checked only' },
]

/* ── Flattened options, so ↑/↓ can cross a group heading ───────────────── */

/**
 * redesign v1 §2 — one row per model, so the flat cursor list is one entry
 * per bundle and one entry per **model group**, not one per physical unit.
 * Arrow keys move row to row; the chips inside an equipment row are reachable
 * by mouse, touch, and native Tab order, same trade-off already documented
 * above for a bundle's [View] button.
 */
type FlatOption =
  | { type: 'bundle'; groupKind: ResultKind; result: BundleResult; index: number }
  | { type: 'equipmentGroup'; groupKind: ResultKind; group: EquipmentModelGroup; index: number }

/**
 * ⛔ `groupKind` is carried so the list below can be RENDERED from this array
 * rather than by calling `groupEquipmentResults` a second time.
 *
 * The second call was a real defect, not a tidiness point. Every row looks up
 * its cursor position with `options.findIndex((o) => o.group === group)` —
 * reference equality — and `groupEquipmentResults` returns freshly built
 * objects on every call, so a group built in the render could never equal the
 * one built here. Every equipment row got `flatIndex === -1`: it never
 * highlighted as active, hovering set the cursor to −1, and
 * `aria-activedescendant` pointed at an id (`…-opt-<n>`) that no element on the
 * page carried, because the element rendered was `…-opt--1`. Bundle rows were
 * unaffected — they match on `o.result === r`, and `r` is the same object in
 * both places.
 */
function flatten(groups: readonly QueryGroup[]): FlatOption[] {
  const out: FlatOption[] = []
  for (const g of groups) {
    if (g.kind === 'bundle') {
      for (const r of g.results) {
        out.push({ type: 'bundle', groupKind: g.kind, result: r as BundleResult, index: out.length })
      }
    } else if (g.kind === 'equipment' || g.kind === 'accessory') {
      for (const group of groupEquipmentResults(g.results as EquipmentResult[])) {
        out.push({ type: 'equipmentGroup', groupKind: g.kind, group, index: out.length })
      }
    }
  }
  return out
}

/* ── Props ─────────────────────────────────────────────────────────────── */

export interface AddItemPanelProps {
  /** The booking's dates. Availability is answered for these, not for today (§32). */
  window: BookingWindow
  /** The booking's length in days — seeds every draft's Days column. */
  days: number
  /** Ids already on the booking. Those rows show "On booking" and cannot be re-added. */
  existingLineIds: readonly string[]
  /**
   * Receives ready-to-append `BookingLineDraft`s. One for an equipment row, N
   * for a bundle. The page appends them; this panel never writes.
   */
  onAdd: (lines: readonly BookingLineDraft[], source: AddItemSource) => void
  /** Money gating — pass the page's `canViewMoneyField(gctx, 'booking-money')`. */
  showPrices?: boolean
  /** The page's own `inputStyle`, so the field cannot drift from its siblings. */
  inputStyle?: CSSProperties
  /** §64's threshold, shared with the client combobox. */
  minQueryChars?: number
  disabled?: boolean
  /**
   * Render the search field **in the section** instead of behind an "Add Item"
   * trigger.
   *
   * Babin, 4 Sep 2026: "in new rental equipment bundle & services don't put
   * +add equipment button, i want search button over there directly." Adding
   * gear is the whole job of that section, so a button whose only purpose is to
   * reveal a search box is a click in the way of it.
   *
   * The panel body is unchanged — same field, tabs, filters, results and
   * keyboard model. Inline mode only stops it being a popover: no trigger, no
   * absolute positioning, no close-on-blur, and Escape clears the query rather
   * than hiding the control the section is built around.
   */
  inline?: boolean
  /**
   * The equipment pool to search, from `equipmentResultsFrom(liveRows)`.
   *
   * Omitted, this panel searches the SEED catalogue, whose ids are product
   * names — browsable, but a line built from one cannot be saved. A page that
   * creates bookings must pass this.
   */
  equipment?: readonly EquipmentResult[]
  /**
   * The state of the windowed availability read behind `equipment` (NR-09).
   *
   * Only the hint line reads it — every row already carries its own verdict.
   * It is here so that line cannot claim *"Availability shown for this
   * booking's dates"* while the read that answers for those dates is still in
   * flight or has failed, which is the BD-02 / NR-13 defect written as a
   * sentence. Omitted, the panel is searching the seed pool and says so.
   */
  availability?: EquipmentAvailabilitySource
  /** Crew and vehicle lines ride along with a bundle. Off — both are priced in Section 3. */
  includeCrewAndVehicle?: boolean
  /** Stamp the bundle's saving on each component line. Off — pricing is the page's (§67). */
  applyBundleSaving?: boolean
}

/** What was added, so the page can toast or log it without re-deriving anything. */
export interface AddItemSource {
  kind: ResultKind
  id: string
  name: string
  /** Present when a bundle was added — carries the notes and the skipped list. */
  bundle?: AddBundleResult
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function AddItemPanel({
  window: bookingWindow,
  days,
  existingLineIds,
  equipment,
  availability: availabilitySource,
  onAdd,
  showPrices = true,
  inputStyle,
  minQueryChars = 2,
  disabled = false,
  inline = false,
  includeCrewAndVehicle = false,
  applyBundleSaving = false,
}: AddItemPanelProps) {
  const reactId = useId()
  const inputId = `${reactId}-add-item-input`
  const listboxId = `${reactId}-add-item-listbox`
  const hintId = `${reactId}-add-item-hint`

  /* Starts closed by default so catalogue results do not clutter the page up front.
     Shows on search or when clicking the input / browse button. */
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabKey>('all')
  const [category, setCategory] = useState<string | null>(null)
  // redesign v1 §3 — read once per mount, same reasoning as `lib/bookingRules.ts`'s
  // header comment: Settings and this panel are never mounted together.
  const [allowOverbooking] = useState<boolean>(() => getAllowOverbooking())
  const [overrideUnit, setOverrideUnit] = useState<EquipmentResult | null>(null)
  const [availability, setAvailability] = useState<AvailabilityLevel | 'any'>('any')
  const [sort, setSort] = useState<SortKey>('recommended')
  const [activeIndex, setActiveIndex] = useState(0)
  const [preview, setPreview] = useState<BundleRecord | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const existing = useMemo(() => new Set(existingLineIds), [existingLineIds])

  const outcome = useMemo(
    () =>
      runQuery(bookingWindow, {
        query,
        kinds: TAB_KINDS[tab],
        category,
        availability: availability === 'any' ? null : availability,
        sort,
        minQueryChars,
        existingLineIds: existing,
        ...(equipment ? { equipment } : {}),
      }),
    [bookingWindow, query, tab, category, availability, sort, minQueryChars, existing, equipment],
  )

  const options = useMemo(() => flatten(outcome.groups), [outcome.groups])

  // Clamp the cursor whenever the result set changes under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? 0 : i))
  }, [options.length])

  const activeId = open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined

  useEffect(() => {
    if (!open || !activeId) return
    const el = document.getElementById(activeId)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeId])

  /** Close on outside pointer interaction */
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (rootRef.current && !rootRef.current.contains(target)) {
        if (preview !== null || overrideUnit !== null) return
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, preview, overrideUnit])

  /** ⌘K / Ctrl+K — open the panel and put the cursor in the field. */
  useEffect(() => {
    if (disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      setOpen(true)
      globalThis.requestAnimationFrame(() => inputRef.current?.focus())
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [disabled])

  const close = useCallback(() => {
    setOpen(false)
    if (inline) {
      inputRef.current?.blur()
    } else {
      triggerRef.current?.focus()
    }
  }, [inline])

  /* ── Committing ─────────────────────────────────────────────────────── */

  const addEquipment = useCallback(
    (e: EquipmentResult) => {
      if (existing.has(e.id)) return
      onAdd([equipmentLineDraft(e, days)], { kind: e.kind, id: e.id, name: e.name })
    },
    [existing, onAdd, days],
  )

  const addBundle = useCallback(
    (b: BundleResult) => {
      const result = addBundleToBooking(b.record, bookingWindow, {
        days,
        existingLineIds: existing,
        includeCrewAndVehicle,
        applyBundleSaving,
      })
      if (result.lines.length === 0) return
      onAdd(result.lines, { kind: 'bundle', id: b.id, name: b.name, bundle: result })
    },
    [bookingWindow, days, existing, includeCrewAndVehicle, applyBundleSaving, onAdd],
  )

  /* ── Keyboard ───────────────────────────────────────────────────────── */

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const count = options.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => (count === 0 ? 0 : (i + 1) % count))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => (count === 0 ? 0 : (i - 1 + count) % count))
        return
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        e.preventDefault()
        setActiveIndex(Math.max(0, count - 1))
        return
      case 'ArrowRight': {
        // The keyboard equivalent of the [View] button on a bundle row.
        const opt = options[activeIndex]
        if (!opt || opt.type !== 'bundle') return
        e.preventDefault()
        setPreview(opt.result.record)
        return
      }
      case 'Enter': {
        const opt = options[activeIndex]
        if (!opt) return
        // Never let the keystroke that picks an item submit the booking form.
        e.preventDefault()
        // redesign v1 §2 — Enter on a model row is the keyboard equivalent of
        // tapping the model name: auto-pick the least-used free unit.
        if (opt.type === 'bundle') addBundle(opt.result)
        else if (opt.group.autoPick) addEquipment(opt.group.autoPick)
        return
      }
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      default:
    }
  }

  /* ── Trigger ────────────────────────────────────────────────────────── */

  const filtersOn = (category !== null ? 1 : 0) + (availability !== 'any' ? 1 : 0)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {!inline && (
      <button
        ref={triggerRef}
        type="button"
        className="press"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o)
          globalThis.requestAnimationFrame(() => inputRef.current?.focus())
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Add item — search bundles, equipment and services"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          minHeight: TOUCH,
          padding: '0 12px',
          borderRadius: 'var(--r-btn)',
          background: 'var(--btn-secondary-bg)',
          color: 'var(--text)',
          border: '1px solid var(--btn-secondary-border)',
          fontFamily: 'inherit',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        <Icon name="plus" size={16} />
        Add Item
        <kbd
          aria-hidden="true"
          style={{
            marginLeft: 3,
            padding: '1px 5px',
            borderRadius: 4,
            border: '1px solid currentColor',
            opacity: 0.65,
            fontFamily: 'var(--font-id)',
            fontSize: 'var(--t-th)',
            lineHeight: '14px',
          }}
        >
          ⌘K
        </kbd>
      </button>
      )}

      {inline && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-describedby={hintId}
              {...(activeId ? { 'aria-activedescendant': activeId } : {})}
              placeholder="Search equipment, bundles & services by name, SKU, serial, brand, category…"
              value={query}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
                if (!open) setOpen(true)
              }}
              onKeyDown={onKeyDown}
              style={{
                ...inputStyle,
                width: '100%',
                height: 38,
                paddingLeft: 34,
                paddingRight: query ? 32 : 12,
                borderRadius: 'var(--r-btn)',
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                color: 'var(--muted)',
                pointerEvents: 'none',
              }}
            >
              <Icon name="search" size={16} />
            </span>
            {query && (
              <button
                type="button"
                className="press"
                aria-label="Clear search query"
                onClick={() => {
                  setQuery('')
                  setActiveIndex(0)
                  inputRef.current?.focus()
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="press"
            onClick={() => {
              setOpen((o) => {
                const next = !o
                if (next) {
                  globalThis.requestAnimationFrame(() => inputRef.current?.focus())
                }
                return next
              })
            }}
            aria-expanded={open}
            aria-label={open ? 'Hide catalogue' : 'Browse catalogue'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 38,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              background: open ? 'var(--st-primary-bg)' : 'var(--btn-secondary-bg)',
              color: open ? 'var(--st-primary-fg)' : 'var(--text)',
              border: `1px solid ${open ? 'var(--primary)' : 'var(--btn-secondary-border)'}`,
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
            <span>{open ? 'Hide' : 'Browse'}</span>
          </button>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Add item to booking"
          style={{
            position: 'absolute' as const,
            zIndex: 45,
            top: 'calc(100% + 6px)',
            ...(inline
              ? { left: 0, width: '100%' }
              : { right: 0, width: 'min(620px, calc(100vw - 32px))' }),
            background: 'var(--dropdown)',
            boxShadow: 'var(--shadow-modal)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            overflow: 'hidden',
            maxHeight: 'min(560px, 80vh)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Search field (popover mode only) ─────────────────────── */}
          {!inline && (
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  role="combobox"
                  autoComplete="off"
                  spellCheck={false}
                  aria-expanded
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-haspopup="listbox"
                  aria-describedby={hintId}
                  {...(activeId ? { 'aria-activedescendant': activeId } : {})}
                  placeholder="Search name, SKU, serial, brand, category, bundle code — or a model inside a bundle…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={onKeyDown}
                  style={{
                    ...inputStyle,
                    width: '100%',
                    height: 36,
                    paddingLeft: 32,
                    paddingRight: 10,
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'inline-flex',
                    color: 'var(--muted)',
                    pointerEvents: 'none',
                  }}
                >
                  <Icon name="search" size={15} />
                </span>
              </div>
            </div>
          )}

          {/* ── Tabs & filters ───────────────────────────────────────── */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'grid', gap: 9 }}>
            {/* ── Tabs (§27) ─────────────────────────────────────────── */}
            <div role="tablist" aria-label="Catalogue type" style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
              {TABS.map((t) => {
                const on = tab === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className="press"
                    onClick={() => {
                      setTab(t.key)
                      setActiveIndex(0)
                    }}
                    style={{
                      position: 'relative',
                      height: 28,
                      padding: '0 11px',
                      borderRadius: 'var(--r-badge)',
                      border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                      background: on ? 'var(--st-primary-bg)' : 'transparent',
                      color: on ? 'var(--st-primary-fg)' : 'var(--text2)',
                      fontFamily: 'inherit',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {/* 44×44 hit area without a 44px-tall chip. */}
                    <TouchInset />
                    {t.label}
                  </button>
                )
              })}

              <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                {/* ── Category (§28–30) — derived, never typed ───────── */}
                <select
                  aria-label="Filter by category"
                  value={category ?? ''}
                  onChange={(e) => {
                    setCategory(e.target.value === '' ? null : e.target.value)
                    setActiveIndex(0)
                  }}
                  style={{ ...inputStyle, width: 'auto', height: 28, fontSize: 'var(--t-meta)' }}
                >
                  <option value="">All categories</option>
                  {DERIVED_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* ── Availability (§32) ─────────────────────────────── */}
                <select
                  aria-label="Filter by availability"
                  value={availability}
                  onChange={(e) => {
                    setAvailability(e.target.value as AvailabilityLevel | 'any')
                    setActiveIndex(0)
                  }}
                  style={{ ...inputStyle, width: 'auto', height: 28, fontSize: 'var(--t-meta)' }}
                >
                  {AVAILABILITY_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                {/* ── Sort (§35) ─────────────────────────────────────── */}
                <select
                  aria-label="Sort results"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  title={`Not offered: ${OMITTED_SORTS.map((s) => `${s.label} — ${s.reason}`).join('; ')}`}
                  style={{ ...inputStyle, width: 'auto', height: 28, fontSize: 'var(--t-meta)' }}
                >
                  {SORT_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>

            {/* The window the availability column is answering for (§32). */}
            <p
              id={hintId}
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <Icon name="calendar" size={12} />
              {/*
                NR-09 — this line used to promise "Availability shown for this
                booking's dates" over rows whose own strings said "right now",
                and to offer "availability is shown for today" as the fallback,
                which is the answer to a question nobody asked. It now states
                what the read behind the rows actually is.
              */}
              {availabilitySource === undefined ? (
                <span style={{ color: 'var(--warn-text)', fontWeight: 600 }}>
                  Sample catalogue — availability here is not checked against this booking&rsquo;s dates.
                </span>
              ) : availabilitySource.state === 'ready' ? (
                <>
                  Availability shown for this booking&rsquo;s dates ·{' '}
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {days} day{days === 1 ? '' : 's'}
                  </span>
                </>
              ) : availabilitySource.state === 'checking' ? (
                <span style={{ fontWeight: 600 }}>Checking availability for this booking&rsquo;s dates…</span>
              ) : availabilitySource.state === 'no-window' ? (
                <span style={{ color: 'var(--ready-text)', fontWeight: 600 }}>
                  No valid pickup/return yet — availability is not checked.
                </span>
              ) : (
                <span style={{ color: 'var(--warn-text)', fontWeight: 600 }}>
                  Availability could not be checked for these dates: {availabilitySource.reason}
                </span>
              )}
              {filtersOn > 0 && (
                <button
                  type="button"
                  className="press"
                  onClick={() => {
                    setCategory(null)
                    setAvailability('any')
                  }}
                  style={{
                    position: 'relative',
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--link)',
                    fontFamily: 'inherit',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '0 2px',
                  }}
                >
                  <TouchInset />
                  Clear {filtersOn} filter{filtersOn === 1 ? '' : 's'}
                </button>
              )}
            </p>
          </div>

          {/* ── Results ──────────────────────────────────────────────── */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Catalogue results"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {outcome.groups.map((g) => (
                <li key={g.kind} role="presentation">
                  <div
                    role="presentation"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      padding: '7px 12px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      background: 'var(--card2)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--text2)',
                    }}
                  >
                    {g.heading}
                    <span className="figure" style={{ marginLeft: 'auto', fontWeight: 600, letterSpacing: 0 }}>
                      {g.results.length}
                    </span>
                  </div>

                  {g.kind === 'service' ? (
                    <p
                      style={{
                        margin: 0,
                        padding: '10px 12px',
                        display: 'flex',
                        gap: 7,
                        alignItems: 'flex-start',
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text2)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0, color: 'var(--muted)' }}>
                        <Icon name="info" size={13} />
                      </span>
                      <span style={{ minWidth: 0 }}>{SERVICES_UNAVAILABLE_REASON}</span>
                    </p>
                  ) : (
                    <ul role="presentation" style={{ listStyle: 'none', margin: 0, padding: 'var(--sp-xs)' }}>
                      {/* Rendered from `options` — the SAME objects the cursor
                          indexes — so `o.index` is the row's real position and
                          no second grouping pass can disagree with it. */}
                      {options
                        .filter((o) => o.groupKind === g.kind)
                        .map((o) =>
                          o.type === 'bundle' ? (
                            <BundleRow
                              key={o.result.id}
                              id={`${listboxId}-opt-${o.index}`}
                              result={o.result}
                              active={o.index === activeIndex}
                              showPrices={showPrices}
                              onHover={() => setActiveIndex(o.index)}
                              onAdd={() => addBundle(o.result)}
                              onView={() => setPreview(o.result.record)}
                            />
                          ) : (
                            // redesign v1 §2 — one row per model, one chip per unit.
                            // NR-21 — keyed on the group's own identity (a
                            // product uuid live, the model name in seed), never
                            // on the display name two products can share.
                            <EquipmentGroupRow
                              key={o.group.key}
                              id={`${listboxId}-opt-${o.index}`}
                              group={o.group}
                              active={o.index === activeIndex}
                              existing={existing}
                              showPrices={showPrices}
                              allowOverbooking={allowOverbooking}
                              onHover={() => setActiveIndex(o.index)}
                              onAutoPick={() => o.group.autoPick && addEquipment(o.group.autoPick)}
                              onPickUnit={(unit) => addEquipment(unit)}
                              onRequestOverride={(unit) => setOverrideUnit(unit)}
                            />
                          ),
                        )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {options.length === 0 && tab !== 'services' && (
              <EmptyResults
                query={query}
                searching={outcome.searching}
                minQueryChars={minQueryChars}
                narrowedBy={outcome.narrowedBy}
                onClearFilters={() => {
                  setCategory(null)
                  setAvailability('any')
                }}
                onSearchAll={() => setTab('all')}
                tab={tab}
              />
            )}
          </div>

          {/* ── Keyboard legend ──────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-md)',
              flexWrap: 'wrap',
              padding: '7px 12px',
              borderTop: '1px solid var(--border)',
              background: 'var(--card2)',
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
            }}
          >
            <span>
              <Key>↑</Key>
              <Key>↓</Key> move
            </span>
            <span>
              <Key>Enter</Key> add
            </span>
            <span>
              <Key>→</Key> preview bundle
            </span>
            <span>
              <Key>Esc</Key> close
            </span>
            <span className="figure" style={{ marginLeft: 'auto' }}>
              {outcome.total} result{outcome.total === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}

      <BundlePreview
        bundle={preview}
        open={preview !== null}
        onClose={() => {
          setPreview(null)
          globalThis.requestAnimationFrame(() => inputRef.current?.focus())
        }}
        window={bookingWindow}
        days={days}
        existingLineIds={existing}
        showPrices={showPrices}
        includeCrewAndVehicle={includeCrewAndVehicle}
        applyBundleSaving={applyBundleSaving}
        onAdd={(result) => {
          if (result.lines.length === 0) return
          onAdd(result.lines, {
            kind: 'bundle',
            id: result.lines[0]?.id.split('::')[0] ?? '',
            name: preview?.name ?? '',
            bundle: result,
          })
        }}
      />

      {/* §3 — only reachable when a booked/maintenance chip is tapped while
          the valve is on; `overrideUnit` is null otherwise. */}
      <OverbookingOverrideModal
        isOpen={overrideUnit !== null}
        unit={overrideUnit}
        onClose={() => setOverrideUnit(null)}
        onOverbook={(unit) => addEquipment(unit)}
      />
    </div>
  )
}

/* ── Rows ──────────────────────────────────────────────────────────────── */

/**
 * §31 — name, "Bundle · Category · N Items", price/day, availability, the
 * component summary line, and the two actions.
 */
function BundleRow({
  id,
  result,
  active,
  showPrices,
  onHover,
  onAdd,
  onView,
}: {
  id: string
  result: BundleResult
  active: boolean
  showPrices: boolean
  onHover: () => void
  onAdd: () => void
  onView: () => void
}) {
  const { facts, availability } = result
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-label={`${result.name}. Bundle, ${result.category}, ${facts.totalItems} items. ${availability.label} — ${availability.detail}. ${
        showPrices ? `${formatMoney(result.ratePaisa)} per day. ` : ''
      }Press Enter to add its components, or press Right Arrow to preview them.`}
      onMouseMove={onHover}
      onClick={onAdd}
      style={{
        display: 'grid',
        gap: 'var(--sp-xs)',
        minHeight: TOUCH,
        padding: '9px 10px',
        borderRadius: 'var(--r-btn)',
        cursor: 'pointer',
        background: active ? 'var(--hover-row)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
        <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
          <Icon name="package" size={15} />
        </span>
        <span
          style={{
            fontSize: 'var(--t-ui)',
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.name}
        </span>
        <span style={{ flexShrink: 0 }}>
          <AvailabilityChip verdict={availability} />
        </span>
        {showPrices && (
          <span
            className="figure"
            style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}
          >
            {formatMoney(result.ratePaisa)}
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--text2)' }}> / day</span>
          </span>
        )}
      </div>

      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Bundle · {result.category} · <span className="figure">{facts.totalItems}</span> Items ·{' '}
        <span className="identifier">{result.id}</span>
      </div>

      <div
        style={{
          fontSize: 'var(--t-meta)',
          color: 'var(--text2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {result.componentSummary}
      </div>

      {availability.level !== 'available' && (
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
          {availability.detail}
          {availability.shortLines.length > 0 && (
            <>
              {' — '}
              {availability.shortLines
                .slice(0, 2)
                .map((l) => l.model)
                .join(', ')}
              {availability.shortLines.length > 2 ? ` +${availability.shortLines.length - 2} more` : ''}
            </>
          )}
        </div>
      )}

      {/*
        Mouse affordances. Interactive content is invalid inside role="option",
        so both are removed from the tab order and from the accessibility tree —
        the option's own label above states the Enter and Right Arrow paths.
      */}
      <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <RowButton
          label="View"
          icon="eye"
          onClick={(e) => {
            e.stopPropagation()
            onView()
          }}
        />
        <RowButton
          label="Add Bundle"
          icon="plus"
          primary
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
        />
      </div>
    </li>
  )
}

/**
 * redesign v1 §2 — one row per model, one chip per unit. Bulk (non-serialised)
 * stock renders as before — a chip is a physical unit, and pooled stock has
 * none to point at. Tapping the model name (anywhere in the header) auto-picks
 * `group.autoPick`; tapping a chip adds that exact serial. A booked/maintenance
 * chip is not tappable — colour never carries the state alone, so every chip
 * also carries a glyph and its accessible name states the status in words.
 *
 * "Sub-rented in" (gold outline, tappable) from the spec has no corresponding
 * `InvStatus` in this build's data model — an honest gap, not implemented,
 * rather than a fabricated third status.
 */
function EquipmentGroupRow({
  id,
  group,
  active,
  existing,
  showPrices,
  allowOverbooking,
  onHover,
  onAutoPick,
  onPickUnit,
  onRequestOverride,
}: {
  id: string
  group: EquipmentModelGroup
  active: boolean
  existing: ReadonlySet<string>
  showPrices: boolean
  /** §3 — Settings ▸ Financial ▸ Booking rules ▸ Allow overbooking. Off by default. */
  allowOverbooking: boolean
  onHover: () => void
  onAutoPick: () => void
  onPickUnit: (unit: EquipmentResult) => void
  /** A booked/maintenance chip while the valve is on opens the override dialog instead of adding directly. */
  onRequestOverride: (unit: EquipmentResult) => void
}) {
  const bulk = group.units.length === 1 && group.units[0]!.serial === '—'
  /* Counted on free availability or In Stock status so serials are honestly accounted for */
  const freeCount = group.units.filter(
    (u) =>
      u.availability.level !== 'unavailable' &&
      u.status !== 'On Rent' &&
      u.status !== 'Reserved' &&
      u.status !== 'Maintenance',
  ).length
  const allOnBooking = group.units.every((u) => existing.has(u.id))
  const meta = [group.kind === 'accessory' ? 'Accessory' : 'Equipment', group.category, group.sku ?? null, group.brand ?? null].filter(
    (x): x is string => Boolean(x),
  )
  /* One row, one honest sentence: the group's own verdict carries the window
     (or says it has no answer), and only a multi-unit row can count units. */
  const summary = bulk ? group.availability.detail : `${freeCount} of ${group.units.length} free for these dates`
  /**
   * §3 — the escape hatch when nothing is auto-pickable.
   *
   * Without this the row is simply inert: since NR-09 a live product row CAN be
   * `unavailable` for the window (it never could before — the old code stamped
   * `'In Stock'` whenever any unit was free today), so `autoPick` is null and
   * clicking does nothing at all. When the valve is on, the click opens the
   * override dialog on the first unit not already booked instead.
   */
  const overrideCandidate =
    !group.autoPick && allowOverbooking ? (group.units.find((u) => !existing.has(u.id)) ?? null) : null

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-label={`${group.name}. ${meta.join(', ')}. ${summary}. ${showPrices ? `${formatMoney(group.ratePaisa)} per day. ` : ''}${
        group.autoPick
          ? 'Press Enter to add the least-used free unit.'
          : overrideCandidate
            ? 'Nothing free for these dates. Opens the overbooking override.'
            : 'Nothing free for these dates.'
      }`}
      onMouseMove={onHover}
      /* The WHOLE row adds, as the bundle row above already did.
         It used to sit on the inner name line only, so a click on the price,
         the meta line, the availability chip or any whitespace did nothing at
         all — the operator hit the row and no item was added (Babin, 4 Sep
         2026: "when i want to add equipment ... doesn't add"). The inline
         panel made it constant: the list is now always on screen to be
         clicked at.

         Safe against the controls inside: every one of them — the per-unit
         chips below and the bundle row's [View] — already calls
         `e.stopPropagation()`, so picking a specific unit still picks that
         unit and never also auto-picks another. */
      onClick={
        group.autoPick ? onAutoPick : overrideCandidate ? () => onRequestOverride(overrideCandidate) : undefined
      }
      style={{
        display: 'grid',
        gap: 6,
        minHeight: TOUCH,
        padding: '9px 10px',
        borderRadius: 'var(--r-btn)',
        cursor: group.autoPick || overrideCandidate ? 'pointer' : 'default',
        background: active ? 'var(--hover-row)' : 'transparent',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}
      >
        <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
          <Icon name={group.kind === 'accessory' ? 'box' : 'camera'} size={15} />
        </span>
        <span
          style={{
            fontSize: 'var(--t-ui)',
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.name}
        </span>
        {!bulk && group.units.length > 1 && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              fontWeight: 500,
              background: 'var(--hover-row)',
              padding: '1px 6px',
              borderRadius: 'var(--r-badge)',
            }}
          >
            {group.units.length} serials
          </span>
        )}
        <span style={{ flexShrink: 0 }}>
          <AvailabilityChip verdict={group.availability} />
        </span>
        {allOnBooking && (
          <span
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-neutral-bg)',
              color: 'var(--st-neutral-fg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
            }}
          >
            <Icon name="check" size={12} />
            On booking
          </span>
        )}
        {showPrices && (
          <span
            className="figure"
            style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}
          >
            {formatMoney(group.ratePaisa)}
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--text2)' }}> / day</span>
          </span>
        )}
      </div>

      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meta.map((m, i) => (
          <span key={`${m}-${i}`}>
            {i > 0 ? ' · ' : ''}
            {m}
          </span>
        ))}
        {meta.length > 0 ? ' · ' : ''}
        {summary}
        {group.inBundles.length > 0 && ` · In ${group.inBundles.length} bundle${group.inBundles.length === 1 ? '' : 's'}`}
      </div>

      {!bulk && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 4,
            padding: '8px 10px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-btn)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
              {group.units.length > 1 ? `Choose serial (${group.units.length} available):` : 'Serial number:'}
            </span>
            {group.units.length > 1 && (
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Click a serial button to select that exact unit
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {group.units.map((u) => {
              const free =
                u.availability.level !== 'unavailable' &&
                u.status !== 'On Rent' &&
                u.status !== 'Reserved' &&
                u.status !== 'Maintenance'
              const onBooking = existing.has(u.id)
              const why = `${u.status ?? u.availability.detail}${u.committedTo !== '—' ? ` · ${u.committedTo}` : ''}`
              const opensOverride = !free && allowOverbooking && !onBooking
              const tappable = (free && !onBooking) || opensOverride
              return (
                <button
                  key={u.id}
                  type="button"
                  className="press"
                  disabled={!tappable}
                  title={
                    onBooking
                      ? `${u.serial} — already on this booking`
                      : free
                        ? `Add unit ${u.serial} (Free)`
                        : `${u.serial} · ${why}`
                  }
                  aria-label={
                    onBooking
                      ? `${u.serial} — already on this booking`
                      : free
                        ? `Add unit with serial ${u.serial}`
                        : opensOverride
                          ? `${u.serial} — booked. ${why}. Opens the overbooking override.`
                          : `${u.serial} — booked, not tappable. ${why}`
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    if (free && !onBooking) onPickUnit(u)
                    else if (opensOverride) onRequestOverride(u)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    minHeight: 28,
                    padding: '3px 10px',
                    borderRadius: 'var(--r-btn)',
                    border: onBooking
                      ? '1px solid var(--border)'
                      : free
                        ? '1px solid var(--border)'
                        : '1px solid var(--st-danger-fg)',
                    background: onBooking
                      ? 'var(--st-neutral-bg)'
                      : free
                        ? 'var(--btn-secondary-bg)'
                        : 'var(--st-danger-bg)',
                    color: onBooking
                      ? 'var(--st-neutral-fg)'
                      : free
                        ? 'var(--text)'
                        : 'var(--st-danger-fg)',
                    fontFamily: 'inherit',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: tappable ? 'pointer' : 'not-allowed',
                    opacity: onBooking ? 0.75 : 1,
                  }}
                >
                  <Icon name={onBooking ? 'check' : free ? 'plus' : 'error'} size={12} />
                  <span className="identifier" style={{ fontWeight: 700 }}>{u.serial}</span>
                  {onBooking ? (
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>(Added)</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </li>
  )
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

/**
 * A transparent 44×44 hit area centred on a control that is visually smaller.
 * CLAUDE.md's touch minimum applies on desktop too, and inflating a filter
 * chip to 44px tall would wreck the panel's density — so the target grows and
 * the glyph does not.
 */
function TouchInset() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: `max(100%, ${TOUCH}px)`,
        height: TOUCH,
      }}
    />
  )
}

function RowButton({
  label,
  icon,
  primary = false,
  onClick,
}: {
  label: string
  icon: 'eye' | 'plus'
  primary?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <span
      role="presentation"
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 26,
        padding: '0 10px',
        borderRadius: 'var(--r-btn)',
        border: `1px solid ${primary ? 'transparent' : 'var(--btn-secondary-border)'}`,
        background: primary ? 'var(--btn-primary-bg)' : 'var(--btn-secondary-bg)',
        color: primary ? 'var(--btn-primary-fg)' : 'var(--text)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <TouchInset />
      <Icon name={icon} size={13} />
      {label}
    </span>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        minWidth: 18,
        padding: '0 4px',
        marginRight: 4,
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        fontFamily: 'var(--font-id)',
        fontSize: 'var(--t-th)',
        lineHeight: '16px',
        textAlign: 'center',
        color: 'var(--text2)',
      }}
    >
      {children}
    </kbd>
  )
}

/**
 * The empty state names the query back, says which of the three narrowers
 * emptied the list, and offers the way out of each. A bare "No results" makes
 * the operator guess whether the search or a filter they forgot is at fault.
 */
function EmptyResults({
  query,
  searching,
  minQueryChars,
  narrowedBy,
  tab,
  onClearFilters,
  onSearchAll,
}: {
  query: string
  searching: boolean
  minQueryChars: number
  narrowedBy: string | null
  tab: TabKey
  onClearFilters: () => void
  onSearchAll: () => void
}) {
  const trimmed = query.trim()
  return (
    <div style={{ padding: '16px 14px', display: 'grid', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
        {searching ? <>Nothing matches &ldquo;{trimmed}&rdquo;</> : 'Nothing to show'}
      </p>

      {trimmed.length > 0 && trimmed.length < minQueryChars && (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Keep typing — search starts at <span className="figure">{minQueryChars}</span> characters.
        </p>
      )}

      {narrowedBy !== null && (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          The <strong>{narrowedBy}</strong> filter removed every match.{' '}
          <button
            type="button"
            onClick={onClearFilters}
            style={{
              position: 'relative',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--link)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <TouchInset />
            Clear the filters
          </button>
          .
        </p>
      )}

      {tab !== 'all' && (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Only the <strong>{tab}</strong> tab was searched.{' '}
          <button
            type="button"
            onClick={onSearchAll}
            style={{
              position: 'relative',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--link)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <TouchInset />
            Search everything
          </button>
          .
        </p>
      )}

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        Searched product and bundle names, SKUs, bundle codes, serials, brands, categories, tags, and the models
        inside every bundle.
      </p>
    </div>
  )
}
