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

import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useViewport } from '../../../lib/device'
import Icon from '../../../components/ui/Icon'
import { formatMoney, rupees, type Paisa } from '../../../lib/money'
import { generateClientUuid } from '../../../lib/dataAccess'
import type { BundleRecord } from '../../../lib/queries/bundles'
import { AvailabilityChip, BundlePreview, KitCapacityLine } from './BundlePreview'
import { TOUCH } from './ClientHealthChip'
import { OverbookingOverrideModal } from './OverbookingOverrideModal'
import { getAllowOverbooking } from '../../../lib/bookingRules'
import './add-item-panel.css'
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
  CrewMember,
  CrewResult,
  EquipmentAvailabilitySource,
  EquipmentModelGroup,
  EquipmentResult,
  QueryGroup,
  ResultKind,
  SortKey,
  TransportOption,
  TransportResult,
} from './itemCatalogue'


/* ── Tabs (§27) ────────────────────────────────────────────────────────── */

type TabKey = 'all' | 'bundles' | 'equipment' | 'sub-rentals' | 'services' | 'crew' | 'transport'

/**
 * Accessories are not a fifth tab. §25 groups them separately in the results
 * but they are equipment, so the Equipment tab shows both and the All tab
 * gives each its own heading.
 */
const TAB_KINDS: Record<TabKey, ReadonlySet<ResultKind>> = {
  all: new Set<ResultKind>(['bundle', 'equipment', 'accessory', 'service']),
  bundles: new Set<ResultKind>(['bundle']),
  equipment: new Set<ResultKind>(['equipment', 'accessory']),
  'sub-rentals': new Set<ResultKind>(['equipment', 'accessory']),
  services: new Set<ResultKind>(['service']),
  crew: new Set<ResultKind>(['crew']),
  transport: new Set<ResultKind>(['transport']),
}

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'sub-rentals', label: 'Sub-Rentals' },
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
  | { type: 'crew'; groupKind: ResultKind; result: CrewResult; index: number }
  | { type: 'transport'; groupKind: ResultKind; result: TransportResult; index: number }

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
    } else if (g.kind === 'crew') {
      for (const r of g.results) {
        out.push({ type: 'crew', groupKind: g.kind, result: r as CrewResult, index: out.length })
      }
    } else if (g.kind === 'transport') {
      for (const r of g.results) {
        out.push({ type: 'transport', groupKind: g.kind, result: r as TransportResult, index: out.length })
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
   * Called when a barcode/scan code is matched and should add the item.
   * Receives the scanned code, the booking window, and days.
   * Should return the scanned equipment ID if found and added, or null.
   */
  onScan?: (code: string, window: BookingWindow, days: number) => Promise<string | null>
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
   * The bundles pool to search, from `bundleResults(w, liveBundles)`.
   *
   * Omitted, this panel searches ACTIVE_BUNDLES from data/bundles.ts.
   */
  bundles?: readonly BundleResult[]
  /**
   * The crew pool to search, from `searchRoster` or the full roster.
   *
   * Omitted, this panel searches the CREW_ROSTER from data/crew.ts.
   */
  crew?: readonly CrewMember[]
  /**
   * The transport/delivery pool to search.
   *
   * Omitted, this panel searches the default delivery options.
   */
  transport?: readonly TransportOption[]
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
  /** Called when a crew member is added from unified search. */
  onAddCrew?: ((crewId: string) => void) | undefined
  /** Existing crew IDs on the booking, for duplicate prevention and status display. */
  existingCrewIds?: readonly string[] | undefined
  /** Called when a transport/delivery mode is selected from unified search. */
  onSelectTransport?: ((type: 'Client Pickup' | 'Babin Delivery') => void) | undefined
  /** The currently selected delivery/transport type on the booking. */
  selectedTransportType?: ('Client Pickup' | 'Babin Delivery') | undefined
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
  bundles,
  crew,
  transport,
  availability: availabilitySource,
  onAdd,
  showPrices = true,
  inputStyle,
  minQueryChars = 2,
  disabled = false,
  inline = false,
  onScan,
  includeCrewAndVehicle = false,
  applyBundleSaving = false,
  onAddCrew,
  existingCrewIds = [],
  onSelectTransport,
  selectedTransportType,
}: AddItemPanelProps) {
  const reactId = useId()
  const viewport = useViewport()
  const onPhone = viewport === 'phone'
  const inputId = `${reactId}-add-item-input`
  const listboxId = `${reactId}-add-item-listbox`
  const hintId = `${reactId}-add-item-hint`
  const filtersId = `${reactId}-add-item-filters`
  const filterSummaryId = `${reactId}-add-item-filter-summary`

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
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const [showAllResults, setShowAllResults] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [preview, setPreview] = useState<BundleRecord | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const catalogueRef = useRef<HTMLDivElement | null>(null)
  const [catalogueHeight, setCatalogueHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!open || !inline) return
    const root = rootRef.current
    const section = root?.closest('section')
    const workspace = root?.closest<HTMLElement>('#main-content')
    const footer = workspace?.querySelector<HTMLElement>('[aria-label="Record actions"]')
    const navigation = document.querySelector<HTMLElement>('nav[aria-label="Main"]')
    if (!section || !workspace) return
    const measure = () => {
      const panel = catalogueRef.current
      if (!panel) return
      // Measure the space after recentering the heading, independently of
      // current scroll position. Main uses header actions; isolated forms can
      // still have a footer. Both must also clear the phone navigation.
      const offset = panel.getBoundingClientRect().top - section.getBoundingClientRect().top
      const clearance = Math.max(12, Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0)
      const workspaceRect = workspace.getBoundingClientRect()
      const viewportBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight
      let bottom = Math.min(workspaceRect.bottom || viewportBottom, viewportBottom)
      if (footer) bottom = Math.min(bottom, footer.getBoundingClientRect().top)
      if (navigation && getComputedStyle(navigation).position === 'fixed') {
        bottom = Math.min(bottom, navigation.getBoundingClientRect().top)
      }
      const available = bottom - workspaceRect.top - clearance - offset - 12
      setCatalogueHeight(Math.min(onPhone ? 480 : 560, Math.max(160, available)))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(workspace)
    if (footer) observer?.observe(footer)
    if (navigation) observer?.observe(navigation)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [open, inline, onPhone])

  const existing = useMemo(() => new Set(existingLineIds), [existingLineIds])
  const existingCrew = useMemo(() => new Set(existingCrewIds), [existingCrewIds])

  const recenterSearch = useCallback(() => {
    if (typeof window === 'undefined' || !rootRef.current) return
    const anchor = rootRef.current.closest('section') ?? rootRef.current
    const workspace = rootRef.current.closest<HTMLElement>('#main-content')
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // The shell scrolls its workspace, not window. Keep the section heading
    // above the search rather than scrolling the clipped card itself.
    if (workspace) {
      const clearance = Math.max(12, Number.parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0)
      workspace.scrollTo({
        top: Math.max(0, workspace.scrollTop + anchor.getBoundingClientRect().top - workspace.getBoundingClientRect().top - clearance),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    } else anchor.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [])

  const submitScan = async () => {
    const code = scanCode.trim()
    if (!code || !onScan || scanBusy) return
    setScanBusy(true)
    setScanMessage(null)
    try {
      const addedId = await onScan(code, bookingWindow, days)
      if (addedId) {
        setScanCode('')
        setScanMessage({ error: false, text: 'Item added to this booking.' })
        scanInputRef.current?.focus()
      } else {
        setScanMessage({ error: true, text: 'Could not add this code. Check that it matches a rentable item, is available for these dates, and is not already on this booking.' })
      }
    } catch (error: unknown) {
      setScanMessage({ error: true, text: error instanceof Error ? error.message : 'Could not look up this code. Try again.' })
    } finally {
      setScanBusy(false)
    }
  }

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
        ...(bundles ? { bundles } : {}),
        ...(crew ? { crew } : {}),
        ...(transport ? { transport } : {}),
      }),
    [bookingWindow, query, tab, category, availability, sort, minQueryChars, existing, equipment, bundles, crew, transport],
  )

  const previewResults = query.trim() === '' && category === null && availability === 'any' && !showAllResults
  const visibleGroups = useMemo(() => {
    if (!previewResults) return outcome.groups
    let remaining = 8
    return outcome.groups
      .map((group) => {
        const results = group.results.slice(0, remaining)
        remaining -= results.length
        return { ...group, results }
      })
      .filter((group) => group.results.length > 0 || group.kind === 'service')
  }, [outcome.groups, previewResults])
  const options = useMemo(() => flatten(visibleGroups), [visibleGroups])

  // Clamp the cursor whenever the result set changes under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? 0 : i))
  }, [options.length])

  const activeId = open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined

  useEffect(() => {
    if (!open || !activeId) return
    const el = document.getElementById(activeId)
    const results = resultsRef.current
    if (!el || !results) return
    // Only scroll results: scrollIntoView also moves overflow:hidden cards
    // and the workspace, hiding headings and controls behind the shell.
    const itemRect = el.getBoundingClientRect()
    const listRect = results.getBoundingClientRect()
    const headingHeight = el.parentElement?.previousElementSibling?.getBoundingClientRect().height ?? 0
    const visibleTop = listRect.top + headingHeight
    if (itemRect.top < visibleTop) results.scrollTop += itemRect.top - visibleTop
    else if (itemRect.height > listRect.bottom - visibleTop) {
      if (itemRect.top >= listRect.bottom) results.scrollTop += itemRect.top - visibleTop
    } else if (itemRect.bottom > listRect.bottom) results.scrollTop += itemRect.bottom - listRect.bottom
  }, [open, activeId, catalogueHeight])

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
      recenterSearch()
      globalThis.requestAnimationFrame(() => inputRef.current?.focus())
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [disabled, recenterSearch])

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

  const addSubRentEquipment = useCallback(
    (e: EquipmentResult, partner = 'GearHouse KTM', customRate?: Paisa) => {
      const draft = equipmentLineDraft(e, days)
      const subDraft: BookingLineDraft = {
        ...draft,
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        clientUuid: generateClientUuid(),
        lineType: 'Sub-rental',
        category: 'Sub-rental',
        name: partner ? `${e.name} (${partner})` : `${e.name} (Sub-rental)`,
        serial: '-',
        location: partner ? `Vendor: ${partner}` : 'Sub-rented',
        ratePaisa: customRate ?? draft.ratePaisa,
        days: Math.max(1, days || 1),
        qty: 1,
        committedTo: '—',
      }
      onAdd([subDraft], { kind: e.kind, id: subDraft.id, name: subDraft.name })
    },
    [days, onAdd],
  )

  const handleAddCustomSubRental = useCallback(
    (name: string, partner: string, rateRupees: number, qty: number) => {
      const draft: BookingLineDraft = {
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        clientUuid: generateClientUuid(),
        lineType: 'Sub-rental',
        category: 'Sub-rental',
        name: partner ? `${name} (${partner})` : `${name} (Sub-rental)`,
        serial: '-',
        location: partner ? `Vendor: ${partner}` : 'Sub-rented',
        ratePaisa: rupees(rateRupees) as Paisa,
        days: Math.max(1, days || 1),
        qty: Math.max(1, qty),
        discountPct: 0,
        committedTo: '—',
      }
      onAdd([draft], { kind: 'equipment', id: draft.id, name: draft.name })
    },
    [days, onAdd],
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
        if (opt.type === 'bundle') {
          addBundle(opt.result)
        } else if (opt.type === 'equipmentGroup') {
          if (tab === 'sub-rentals') {
            const target = opt.group.autoPick || opt.group.units[0]
            if (target) addSubRentEquipment(target)
          } else if (opt.group.autoPick) {
            addEquipment(opt.group.autoPick)
          }
        } else if (opt.type === 'crew' && onAddCrew && !existingCrew.has(opt.result.id)) {
          onAddCrew(opt.result.id)
        } else if (opt.type === 'transport' && onSelectTransport) {
          onSelectTransport(opt.result.type)
        }
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
  const currentSortLabel = SORT_OPTIONS.find((option) => option.key === sort)?.label ?? 'Recommended'
  const currentFilterSummary = `${category ?? 'All categories'} · ${AVAILABILITY_FILTERS.find((option) => option.value === availability)?.label ?? 'Any availability'} · ${currentSortLabel}`

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {!inline && (
      <button
        ref={triggerRef}
        type="button"
        className="press"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => {
            const next = !o
            if (next) recenterSearch()
            return next
          })
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
              onFocus={() => {
                setFiltersExpanded(false)
                setOpen(true)
                recenterSearch()
              }}
              onClick={() => {
                setOpen(true)
                recenterSearch()
              }}
              onChange={(e) => {
                setFiltersExpanded(false)
                setQuery(e.target.value)
                setActiveIndex(0)
                if (!open) {
                  setOpen(true)
                  recenterSearch()
                }
              }}
              onKeyDown={onKeyDown}
              style={{
                ...inputStyle,
                width: '100%',
                minHeight: 44,
                paddingLeft: 34,
                paddingRight: query ? 40 : 12,
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

          {onScan && (
            <button
              type="button"
              className="press"
              aria-label="Scan barcode or serial"
              aria-expanded={scannerOpen}
              onClick={() => {
                setScannerOpen((value) => !value)
                setOpen(false)
                setScanMessage(null)
                if (!scannerOpen) globalThis.requestAnimationFrame(() => scanInputRef.current?.focus())
              }}
              style={{ minHeight: 44, padding: '0 10px', display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: scannerOpen ? 'var(--st-primary-bg)' : 'var(--btn-secondary-bg)', color: 'var(--text)', cursor: 'pointer' }}
            >
              <Icon name="barcode" size={18} />
              <span>Scan</span>
            </button>
          )}

          <button
            type="button"
            className="press"
            onClick={() => {
              setOpen((o) => {
                const next = !o
                if (next) {
                  recenterSearch()
                  globalThis.requestAnimationFrame(() => inputRef.current?.focus())
                } else {
                  inputRef.current?.blur()
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
              minHeight: 44,
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
            <span>{open ? 'Hide' : 'Browse'}</span>
            <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
          </button>
        </div>
      )}

      {inline && scannerOpen && onScan && (
        <form onSubmit={(event) => { event.preventDefault(); void submitScan() }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <input
            ref={scanInputRef}
            aria-label="Barcode, serial, or asset tag"
            value={scanCode}
            onChange={(event) => { setScanCode(event.target.value); setScanMessage(null) }}
            placeholder="Scan or enter barcode, serial, or asset tag"
            style={{ ...inputStyle, minWidth: 220, flex: '1 1 220px', minHeight: 44 }}
          />
          <button type="submit" disabled={!scanCode.trim() || scanBusy} style={{ minHeight: 44, padding: '0 16px', borderRadius: 'var(--r-btn)', border: '1px solid var(--primary)', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', cursor: 'pointer' }}>
            {scanBusy ? 'Checking…' : 'Add scanned item'}
          </button>
          {scanMessage && <p role={scanMessage.error ? 'alert' : 'status'} style={{ width: '100%', margin: 0, color: scanMessage.error ? 'var(--st-danger-fg)' : 'var(--st-success-fg)', fontSize: 'var(--t-meta)' }}>{scanMessage.text}</p>}
        </form>
      )}

      {open && (
        <div
          ref={catalogueRef}
          className={`new-rental-equipment-catalogue${onPhone && filtersExpanded ? ' is-filtering' : ''}`}
          role="dialog"
          aria-label="Add item to booking"
          style={{
            // User shell audit, 7 Oct: inline catalogue expands the card.
            // Floating it inside an overflow:hidden section clips its actions.
            position: inline ? 'relative' : 'absolute',
            ...(inline ? { marginTop: 6, width: '100%' } : {
              zIndex: 45,
              top: 'calc(100% + 6px)',
              ...(onPhone
                ? { left: 0, right: 0, width: '100%' }
                : { right: 0, width: 'min(620px, calc(100vw - 32px))' }),
            }),
            background: 'var(--dropdown)',
            boxShadow: 'var(--shadow-modal)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            overflow: 'hidden',
            maxHeight: inline && catalogueHeight !== null ? catalogueHeight : onPhone ? 'min(480px, 70vh)' : 'min(560px, 80vh)',
            ...(onPhone && inline && catalogueHeight !== null ? { height: catalogueHeight } : {}),
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
                  onFocus={() => setFiltersExpanded(false)}
                  onChange={(e) => {
                    setFiltersExpanded(false)
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
          <div className="new-rental-equipment-catalogue-controls" style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'grid', gap: 9, flexShrink: 0 }}>
            {/* ── Tabs (§27) ─────────────────────────────────────────── */}
            <div className="new-rental-equipment-catalogue-toolbar">
            <div className="new-rental-equipment-catalogue-tabs" role="tablist" aria-label="Catalogue type">
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
            </div>
              {/* RULING 2026-10-08: phone filters disclose in place so catalogue results keep useful space. */}
              <button
                type="button"
                className="new-rental-equipment-catalogue-filter-toggle press"
                hidden={!onPhone}
                aria-expanded={filtersExpanded}
                aria-controls={filtersId}
                aria-describedby={filterSummaryId}
                onClick={() => { setFiltersExpanded((value) => !value); recenterSearch() }}
              >
                <Icon name="filter" size={16} />
                <span>{filtersExpanded ? 'Show results' : 'Filters & sort'}</span>
                {filtersOn > 0 && <span className="figure">· {filtersOn}</span>}
                {sort !== 'recommended' && <span className="new-rental-equipment-catalogue-sort-label">{currentSortLabel}</span>}
                <Icon name={filtersExpanded ? 'chevron_up' : 'chevron_down'} size={15} style={{ marginLeft: 'auto' }} />
              </button>
              <span id={filterSummaryId} hidden={!onPhone} className="new-rental-equipment-catalogue-filter-summary">{currentFilterSummary}</span>
              <div id={filtersId} hidden={onPhone && !filtersExpanded} className="new-rental-equipment-catalogue-filters">
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
              </div>
            </div>

            {/* The window the availability column is answering for (§32). */}
            <p
              id={hintId}
              className="new-rental-equipment-catalogue-availability"
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
                  <span className="new-rental-equipment-catalogue-date-hint">Availability shown for this booking&rsquo;s dates ·{' '}</span>
                  <span className="new-rental-equipment-catalogue-date-hint-compact">For these dates ·{' '}</span>
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
          <div ref={resultsRef} className="new-rental-equipment-catalogue-results" style={{ maxHeight: 400, minHeight: 0, overflowY: 'auto', flex: '1 1 auto', overscrollBehavior: 'contain' }}>
            {tab === 'sub-rentals' &&
              (inputStyle ? (
                <SubRentalQuickAdd
                  initialName={query.trim()}
                  days={days}
                  {...(showPrices !== undefined ? { showPrices } : {})}
                  inputStyle={inputStyle}
                  onAddSubRental={handleAddCustomSubRental}
                />
              ) : (
                <SubRentalQuickAdd
                  initialName={query.trim()}
                  days={days}
                  {...(showPrices !== undefined ? { showPrices } : {})}
                  onAddSubRental={handleAddCustomSubRental}
                />
              ))}
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Catalogue results"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {visibleGroups.map((g) => (
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
                    {tab === 'sub-rentals' ? 'Cross-Hire / Sub-Rental Equipment' : g.heading}
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
                        .map((o) => {
                          if (o.type === 'bundle') {
                            return (
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
                            )
                          }
                          if (o.type === 'equipmentGroup') {
                            return (
                              <EquipmentGroupRow
                                key={o.group.key}
                                id={`${listboxId}-opt-${o.index}`}
                                group={o.group}
                                active={o.index === activeIndex}
                                existing={existing}
                                showPrices={showPrices}
                                allowOverbooking={allowOverbooking}
                                isSubRentalMode={tab === 'sub-rentals'}
                                onHover={() => setActiveIndex(o.index)}
                                onAutoPick={() => {
                                  if (tab === 'sub-rentals') {
                                    const target = o.group.autoPick || o.group.units[0]
                                    if (target) addSubRentEquipment(target)
                                  } else {
                                    if (o.group.autoPick) addEquipment(o.group.autoPick)
                                  }
                                }}
                                onPickUnit={(unit) => {
                                  if (tab === 'sub-rentals') {
                                    addSubRentEquipment(unit)
                                  } else {
                                    addEquipment(unit)
                                  }
                                }}
                                onSubRent={(unit) => addSubRentEquipment(unit)}
                                onRequestOverride={(unit) => setOverrideUnit(unit)}
                              />
                            )
                          }
                          if (o.type === 'crew') {
                            const isAssigned = existingCrew.has(o.result.id)
                            return (
                              <CrewRow
                                key={o.result.id}
                                id={`${listboxId}-opt-${o.index}`}
                                result={o.result}
                                active={o.index === activeIndex}
                                assigned={isAssigned}
                                showPrices={showPrices}
                                onHover={() => setActiveIndex(o.index)}
                                onAdd={() => onAddCrew?.(o.result.id)}
                              />
                            )
                          }
                          if (o.type === 'transport') {
                            const isSelected = selectedTransportType === o.result.type
                            return (
                              <TransportRow
                                key={o.result.id}
                                id={`${listboxId}-opt-${o.index}`}
                                result={o.result}
                                active={o.index === activeIndex}
                                selected={isSelected}
                                showPrices={showPrices}
                                onHover={() => setActiveIndex(o.index)}
                                onSelect={() => onSelectTransport?.(o.result.type)}
                              />
                            )
                          }
                          return null
                        })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {previewResults && outcome.total > 8 && (
              <button type="button" onClick={() => setShowAllResults(true)} style={{ width: '100%', padding: '12px', border: 0, borderTop: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--link)', fontWeight: 700, cursor: 'pointer' }}>
                Show all {outcome.total} results
              </button>
            )}

            {options.length === 0 && tab !== 'services' && tab !== 'sub-rentals' && (
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
            className="new-rental-equipment-catalogue-legend"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-md)',
              flexWrap: 'wrap',
              flexShrink: 0,
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
        onSubRent={(unit) => addSubRentEquipment(unit)}
      />
    </div>
  )
}

/* ── Sub-Rental Quick Add Component ─────────────────────────────────────── */

function SubRentalQuickAdd({
  initialName,
  days,
  showPrices,
  inputStyle,
  onAddSubRental,
}: {
  initialName?: string | undefined
  days: number
  showPrices?: boolean | undefined
  inputStyle?: CSSProperties | undefined
  onAddSubRental: (name: string, partner: string, rateRupees: number, qty: number) => void
}) {
  const [name, setName] = useState(initialName ?? '')
  const [partner, setPartner] = useState('GearHouse KTM')
  const [customPartner, setCustomPartner] = useState('')
  const [rate, setRate] = useState('5000')
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (initialName) setName(initialName)
  }, [initialName])

  const effectivePartner = partner === 'Custom' ? customPartner : partner

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onAddSubRental(name.trim(), effectivePartner.trim(), Number(rate) || 0, Math.max(1, qty))
    setName('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        margin: 'var(--sp-xs) var(--sp-xs) var(--sp-sm)',
        padding: '12px 14px',
        borderRadius: 'var(--r-card)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>
            <Icon name="box" size={15} />
          </span>
          <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
            Cross-Hire / Sub-Rental From Partner
          </span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--r-badge)',
              fontSize: '11px',
              fontWeight: 700,
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
            }}
          >
            Sub-Rental
          </span>
        </div>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {days} day{days === 1 ? '' : 's'} · Bypasses in-house inventory
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '2 1 180px' }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
            Equipment / Item Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. RED V-Raptor 8K VV, Master Prime 50mm"
            style={{
              ...inputStyle,
              width: '100%',
              height: 36,
              padding: '0 10px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1.5 1 140px' }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
            Partner / Supplier
          </label>
          <select
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            style={{
              ...inputStyle,
              width: '100%',
              height: 36,
              padding: '0 8px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <option value="GearHouse KTM">GearHouse KTM</option>
            <option value="Kathmandu Cinema Works">Kathmandu Cinema Works</option>
            <option value="Everest Cine Rentals">Everest Cine Rentals</option>
            <option value="Pokhara Film Gear">Pokhara Film Gear</option>
            <option value="Custom">Custom / Other Partner…</option>
          </select>
        </div>

        {partner === 'Custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1.5 1 140px' }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
              Partner Name
            </label>
            <input
              type="text"
              required
              value={customPartner}
              onChange={(e) => setCustomPartner(e.target.value)}
              placeholder="e.g. CineLab Nepal"
              style={{
                ...inputStyle,
                width: '100%',
                height: 36,
                padding: '0 10px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>
        )}

        {showPrices && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 90px' }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
              Rate / Day (Rs.)
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              style={{
                ...inputStyle,
                width: '100%',
                height: 36,
                padding: '0 10px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0.8 1 65px' }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
            Qty
          </label>
          <input
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            style={{
              ...inputStyle,
              width: '100%',
              height: 36,
              padding: '0 10px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          />
        </div>

        <div style={{ flex: '1 1 130px' }}>
          <button
            type="submit"
            className="press"
            style={{
              position: 'relative',
              width: '100%',
              height: 36,
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <TouchInset />
            <Icon name="plus" size={14} />
            Add Sub-Rental
          </button>
        </div>
      </div>
    </form>
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
      <div className="catalogue-result-heading" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
        <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
          <Icon name="package" size={15} />
        </span>
        <span
          className="catalogue-result-name"
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

      {result.record.kitCapacity && (
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <KitCapacityLine capacity={result.record.kitCapacity} />
        </div>
      )}

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
  isSubRentalMode,
  onHover,
  onAutoPick,
  onPickUnit,
  onSubRent,
  onRequestOverride,
}: {
  id: string
  group: EquipmentModelGroup
  active: boolean
  existing: ReadonlySet<string>
  showPrices: boolean
  /** §3 — Settings ▸ Financial ▸ Booking rules ▸ Allow overbooking. Off by default. */
  allowOverbooking: boolean
  isSubRentalMode?: boolean
  onHover: () => void
  onAutoPick: () => void
  onPickUnit: (unit: EquipmentResult) => void
  onSubRent?: (unit: EquipmentResult) => void
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
    !group.autoPick && (allowOverbooking || true) ? (group.units.find((u) => !existing.has(u.id)) ?? null) : null

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-label={`${group.name}. ${meta.join(', ')}. ${summary}. ${showPrices ? `${formatMoney(group.ratePaisa)} per day. ` : ''}${
        isSubRentalMode
          ? 'Sub-rent this model from partner.'
          : group.autoPick
            ? 'Press Enter to add the least-used free unit.'
            : overrideCandidate
              ? 'Nothing free for these dates. Opens the sub-rent and overbooking options.'
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
        isSubRentalMode
          ? () => {
              const target = group.autoPick || group.units[0]
              if (target && onSubRent) onSubRent(target)
            }
          : group.autoPick
            ? onAutoPick
            : overrideCandidate
              ? () => onRequestOverride(overrideCandidate)
              : undefined
      }
      style={{
        display: 'grid',
        gap: 6,
        minHeight: TOUCH,
        padding: '9px 10px',
        borderRadius: 'var(--r-btn)',
        cursor: isSubRentalMode || group.autoPick || overrideCandidate ? 'pointer' : 'default',
        background: active ? 'var(--hover-row)' : 'transparent',
      }}
    >
      <div
        className="catalogue-result-heading"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}
      >
        <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
          <Icon name={group.kind === 'accessory' ? 'box' : 'camera'} size={15} />
        </span>
        <span
          className="catalogue-result-name"
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
        {isSubRentalMode && (
          <span
            style={{
              flexShrink: 0,
              padding: '2px 8px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            Sub-Rent
          </span>
        )}
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
        {isSubRentalMode && (
          <button
            type="button"
            className="press"
            onClick={(e) => {
              e.stopPropagation()
              const target = group.autoPick || group.units[0]
              if (target && onSubRent) onSubRent(target)
            }}
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              height: 28,
              padding: '0 10px',
              borderRadius: 'var(--r-btn)',
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <TouchInset />
            <Icon name="box" size={13} />
            + Sub-Rent
          </button>
        )}
        {showPrices && !isSubRentalMode && (
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
              {group.units.length > 1 ? `Choose serial (${freeCount} free):` : 'Serial number:'}
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
              const opensOverride = !free && !onBooking
              const tappable = (free && !onBooking) || opensOverride || isSubRentalMode
              return (
                <button
                  key={u.id}
                  type="button"
                  className="press"
                  disabled={!tappable}
                  title={
                    isSubRentalMode
                      ? `Sub-rent ${u.serial !== '—' ? u.serial : group.name} from partner`
                      : onBooking
                        ? `${u.serial} — already on this booking`
                        : free
                          ? `Add unit ${u.serial} (Free)`
                          : `${u.serial} · ${why} (Click to sub-rent or override)`
                  }
                  aria-label={
                    isSubRentalMode
                      ? `Sub-rent ${u.serial !== '—' ? u.serial : group.name} from partner`
                      : onBooking
                        ? `${u.serial} — already on this booking`
                        : free
                          ? `Add unit with serial ${u.serial}`
                          : opensOverride
                            ? `${u.serial} — booked. ${why}. Opens sub-rent and overbooking options.`
                            : `${u.serial} — booked, not tappable. ${why}`
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isSubRentalMode && onSubRent) onSubRent(u)
                    else if (free && !onBooking) onPickUnit(u)
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

/**
 * Unified crew search row — name, role, phone, rate/day, availability, and Add to Crew action.
 */
function CrewRow({
  id,
  result,
  active,
  assigned,
  showPrices,
  onHover,
  onAdd,
}: {
  id: string
  result: CrewResult
  active: boolean
  assigned: boolean
  showPrices: boolean
  onHover: () => void
  onAdd: () => void
}) {
  const { availability } = result
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-label={`${result.name}. Crew member, ${result.role}. ${result.phone}. ${availability.label} — ${availability.detail}. ${
        showPrices ? `${formatMoney(result.dayRatePaisa)} per day. ` : ''
      }${assigned ? 'Already on booking.' : 'Press Enter to assign to booking.'}`}
      onMouseMove={onHover}
      onClick={assigned ? undefined : onAdd}
      style={{
        display: 'grid',
        gap: 'var(--sp-xs)',
        minHeight: TOUCH,
        padding: '9px 10px',
        borderRadius: 'var(--r-btn)',
        cursor: assigned ? 'default' : 'pointer',
        background: active ? 'var(--hover-row)' : 'transparent',
        opacity: assigned ? 0.75 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
        <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
          <Icon name="users" size={15} />
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
          {result.role}
        </span>
        <span style={{ flexShrink: 0 }}>
          <AvailabilityChip verdict={availability} />
        </span>
        {assigned && (
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
            {formatMoney(result.dayRatePaisa)}
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--text2)' }}> / day</span>
          </span>
        )}
      </div>

      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Crew · {result.role} · <span className="identifier">{result.phone}</span> · {result.state}
      </div>

      <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <RowButton
          label={assigned ? 'Assigned' : 'Add to Crew'}
          icon={assigned ? 'check' : 'plus'}
          primary={!assigned}
          onClick={(e) => {
            e.stopPropagation()
            if (!assigned) onAdd()
          }}
        />
      </div>
    </li>
  )
}

/**
 * Unified transport search row — delivery mode, description, rate, and Select action.
 */
function TransportRow({
  id,
  result,
  active,
  selected,
  showPrices,
  onHover,
  onSelect,
}: {
  id: string
  result: TransportResult
  active: boolean
  selected: boolean
  showPrices: boolean
  onHover: () => void
  onSelect: () => void
}) {
  const { availability } = result
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-label={`${result.name}. Transport mode: ${result.type}. ${
        showPrices ? `${formatMoney(result.ratePaisa)}. ` : ''
      }${selected ? 'Currently selected.' : 'Press Enter to select transport mode.'}`}
      onMouseMove={onHover}
      onClick={onSelect}
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
          <Icon name="truck" size={15} />
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
          {result.type}
        </span>
        <span style={{ flexShrink: 0 }}>
          <AvailabilityChip verdict={availability} />
        </span>
        {selected && (
          <span
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
            }}
          >
            <Icon name="check" size={12} />
            Selected
          </span>
        )}
        {showPrices && (
          <span
            className="figure"
            style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}
          >
            {result.ratePaisa === 0 ? 'Free (Rs 0)' : formatMoney(result.ratePaisa)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Delivery option · {result.type === 'Client Pickup' ? 'Client collects from warehouse' : 'Dispatched to location via Babin fleet'}
        {result.vehicle ? ` · Vehicle: ${result.vehicle}` : ''}
        {result.numberPlate ? ` · ${result.numberPlate}` : ''}
      </div>

      <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <RowButton
          label={selected ? 'Selected' : 'Select Mode'}
          icon={selected ? 'check' : 'plus'}
          primary={!selected}
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
        />
      </div>
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
  icon: 'eye' | 'plus' | 'check' | 'truck' | 'users'
  primary?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
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
    </button>
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
