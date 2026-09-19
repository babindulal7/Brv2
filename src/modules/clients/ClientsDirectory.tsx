import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, KpiStrip, cardStyle, Rail } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import {
  ActiveFilterChips,
  FilterDrawer,
  FilterOptionList,
  filterGroupStyle,
} from '../../components/ui/FilterDrawer'
import type { ActiveFilter } from '../../components/ui/FilterDrawer'
import {
  clientFacetsFor,
  applyFacets,
  optionsOf,
  facetCountsOf,
  selectionCount,
  type FacetSelection,
} from './clientFacets'
import { Modal } from '../../components/ui/Modal'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { STATUS, STATUS_ICON } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { canRecordPayment } from '../../lib/rbac'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { canBlockClient } from '../../lib/rbac'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import type { ActionContext } from '../../actions/core'
import { gateContext, canViewPII } from '../../lib/fieldGating'
import { shouldFlipUp } from '../../lib/menuFlip'
import { IntelCard } from '../../components/ui/IntelCard'
import {
  clientGlance,
  clientDetailGroups,
  TIER_TONE,
  clientMetrics,
  CLIENT_ROWS_PER_PAGE,
  creditStopFactsOf,
  evaluateCreditStop,
  readOverdueStopDays,
  type ClientRecord,
  type CreditStopVerdict,
} from '../../lib/queries/clients'

/* ── last-rental sort key ──────────────────────────────────────────────── */

const AD_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Sort sentinel for a client with no rental yet — see the comparator below. */
const NO_RENTAL = Number.NEGATIVE_INFINITY

/**
 * Parses the `"18 Jul 2026"` label `ClientRecord.lastRentalAd` carries into a
 * UTC epoch for sorting — the same hand parser `ClientCombobox` uses for its
 * recent-clients order, because `Date.parse` is engine-dependent for non-ISO
 * strings. `null` on `'—'` or anything unexpected.
 */
function parseAdLabel(label: string | undefined): number | null {
  if (!label) return null
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(label.trim())
  if (!m) return null
  const [, d, mon, y] = m
  const monthIndex = AD_MONTHS.indexOf((mon ?? '').slice(0, 3).toLowerCase())
  if (monthIndex < 0 || !d || !y) return null
  return Date.UTC(Number(y), monthIndex, Number(d))
}

/* ── filters ───────────────────────────────────────────────────────────── */

/**
 * ⚠ **`blocked` is deliberately NOT a member of this union** — Rulings §11.2.4.
 *
 * It used to be, and that was the defect the ruling names: rendering Active,
 * Blocked and On Stop as one exclusive chip group means selecting any of them
 * hides the others, and the counts stop summing to the total. `0005_clients.sql`
 * is explicit that a block is a **flag** that *"coexists with the client's
 * state"*, never a state of its own — a client is routinely Active **and**
 * blocked **and** on stop.
 *
 * So this union stays the one *exclusive* selector (a client is exactly one of
 * these), and Blocked / On Stop moved to `overlays` below, which intersect with
 * whatever is selected here.
 *
 * ## `active` here is the BOOKING sense, not the account sense
 *
 * ⚠ Read this before adding anything else called "Active". The `active` member
 * selects clients with at least one booking that is neither Closed nor
 * cancelled — see the KPI note further down for the whole chain back to
 * `active_bookings_count`. It says nothing about whether the ACCOUNT is active.
 *
 * There is still no client-STATUS Active chip, and inventing one would be worse
 * than the omission: `ClientRecord` carries no deactivation field at all
 * (`deactivatedAtAd` lives on `ClientProfile`, which the directory never
 * fetches), so a status-Active chip would select exactly what `All` already
 * selects and lie about doing something. Reported rather than faked.
 *
 * TODO(decision): the chip strip reads All · Organisation · Individual ·
 * Unassigned · Active · Payment Due · VIP, and in that company a bare "Active"
 * can be read as the account sense the paragraph above says does not exist.
 * The label was ruled in the 5–6 Sep session and is recorded in this repo at
 * `BUG_AUDIT_LIFECYCLE_2026-09-02.md` under CL-04 — cite that, not this
 * comment. It replaced "On Rent", which was a claim about one of five stages.
 * Whether it should be QUALIFIED — "Active Rentals", the wording the table
 * column and the CSV header now use — is a separate product call, so it is
 * asked here, not decided.
 */
type FilterKey = 'all' | 'active' | 'paymentDue' | 'vip' | 'typeOrg' | 'typeInd' | 'typeUnassigned'

/**
 * §18 — the directory's filter state IS the query string, the same contract
 * RentalsList and OperationsQueues keep: refresh keeps the filters, Back
 * undoes one decision, and "every organisation with a payment due" is a link
 * rather than a screenshot. `?filter=` carries the one exclusive chip,
 * `?blocked=1` / `?stop=1` carry the two intersecting overlays (two params
 * because they are two independent booleans, exactly as the chips render
 * them), and `?q=` carries the search — the param other surfaces already
 * hand in (the Membership tab's row action navigates to `/clients?q=<name>`).
 *
 * Wire values are lowercase words rather than the internal camelCase keys,
 * mirroring `URL_KEY` in `data/operations.ts` — a URL is read and edited by
 * people, and `?filter=organisation` survives that better than `?filter=typeOrg`.
 */
const FILTER_PARAM: Record<Exclude<FilterKey, 'all'>, string> = {
  typeOrg: 'organisation',
  typeInd: 'individual',
  typeUnassigned: 'unassigned',
  active: 'active',
  paymentDue: 'payment-due',
  vip: 'vip',
}

/**
 * A query string is user input in the most literal sense — a bookmark, a
 * hand-edited URL — so it is validated, never trusted. An unknown value
 * selects nothing (`all`), the same fallback `Clients.tsx` applies to `?tab=`.
 *
 * Law 6 — `payment-due` answers *who owes us money*. A money-blind session
 * opening a bookmarked `?filter=payment-due` gets the unfiltered list, the
 * same absence the chip itself keeps for that role: the filter must not run
 * for a session that may not know the answer.
 */
/**
 * Wire values this screen used to mint, kept readable forever.
 *
 * CL-04 renamed the chip's wire value `on-rent` → `active`. A query string is
 * the one piece of this UI that OUTLIVES the build: it sits in bookmarks, in
 * pasted links and in WhatsApp messages. Without this map an old link did not
 * fail loudly — `filterFromParam` returns `all` for anything it does not
 * recognise, so it silently showed the UNFILTERED directory under a URL that
 * named a filter, which is the same class of quiet lie CL-04 was raised about.
 */
const LEGACY_FILTER_PARAM: Record<string, Exclude<FilterKey, 'all'>> = {
  'on-rent': 'active',
}

function filterFromParam(raw: string | null, money: boolean): FilterKey {
  if (!raw) return 'all'
  const legacy = LEGACY_FILTER_PARAM[raw]
  if (legacy) return legacy === 'paymentDue' && !money ? 'all' : legacy
  const hit = (Object.entries(FILTER_PARAM) as Array<[Exclude<FilterKey, 'all'>, string]>).find(
    ([, wire]) => wire === raw,
  )
  if (!hit) return 'all'
  if (hit[0] === 'paymentDue' && !money) return 'all'
  return hit[0]
}

type ViewKey = 'Table' | 'Cards'
type SortKey = 'name' | 'type' | 'membership' | 'rentals' | 'outstanding' | 'deposit' | 'lastRental'
type Density = 'comfortable' | 'compact'

/**
 * The two intersecting overlays. Both are independent booleans, both AND with
 * the exclusive `FilterKey` and with each other, and neither is ever the
 * selected "status".
 */
interface Overlays {
  blocked: boolean
  onStop: boolean
}

const NO_OVERLAYS: Overlays = { blocked: false, onStop: false }

interface SavedView {
  label: string
  filter: FilterKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  /** The overlay state the view restores. Absent means "clear both". */
  overlays?: Partial<Overlays>
  /**
   * "Payment Due" names no figure but still answers *who owes us money*, which
   * §8.3 puts out of reach of Warehouse as surely as the column does.
   */
  money?: boolean
}

/**
 * The render's Saved Views list. Each one is a real preset over the filter and
 * sort state below — a bookmark that does not restore anything is worse than no
 * bookmark.
 */
const SAVED_VIEWS: SavedView[] = [
  { label: 'VIP Clients', filter: 'vip', sort: { key: 'name', dir: 'asc' } },
  { label: 'Payment Due', filter: 'paymentDue', sort: { key: 'outstanding', dir: 'desc' }, money: true },
  { label: 'Active', filter: 'active', sort: { key: 'rentals', dir: 'desc' } },
  { label: 'Recently Added', filter: 'all', sort: { key: 'lastRental', dir: 'desc' } },
  /* Now an OVERLAY over every client, not a status that excludes the rest. */
  { label: 'Blocked Clients', filter: 'all', sort: { key: 'name', dir: 'asc' }, overlays: { blocked: true } },
]

const th = {
  textAlign: 'left' as const,
  padding: '9px 12px',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

/** Mirrors Inventory.tsx's `tdFor` — same helper name, same compact/comfortable split. */
const tdFor = (d: Density) => ({
  padding: d === 'compact' ? '5px 12px' : '11px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top' as const,
})

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string
  sortKey?: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  align?: 'right'
}) {
  if (!sortKey) {
    return <th style={{ ...th, textAlign: align ?? 'left' }}>{label}</th>
  }
  const on = sort.key === sortKey
  return (
    /*
      BUG-009 — the sorting itself always worked and the direction glyph below
      is correct, but `aria-sort` was never set, so a screen reader announced
      only "button, Client": no indication that the table was sorted by this
      column, and none of which way. The sighted operator had the arrow; the
      screen-reader user had nothing.

      It belongs on the `<th>`, not the button — `aria-sort` is defined on the
      column header cell, and a button is not a `columnheader`. The value is
      derived from the same `sort` state that paints the glyph, so the two
      cannot drift: whichever column is active reads ascending/descending, and
      every other sortable column reads `none` (which is the ARIA way of saying
      "sortable, not currently sorted" — omitting it would say "not sortable").
      The non-sortable `<th>`s in the early return above stay bare, correctly.
    */
    <th
      style={{ ...th, textAlign: align ?? 'left' }}
      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-xs)',
          border: 'none',
          background: 'transparent',
          padding: 0,
          fontFamily: 'inherit',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          color: on ? 'var(--text)' : 'var(--text2)',
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        {on && (
          <Icon
            name={sort.dir === 'asc' ? 'arrow_up' : 'arrow_down'}
            size={12}
            style={{ color: 'var(--text2)' }}
          />
        )}
      </button>
    </th>
  )
}

/**
 * Law 11 — *"never colour alone; every status renders colour + icon + label"* —
 * and spec 08 line 45 names this chip specifically: *"⛔ blocked row carries
 * icon + label + colour, never colour"*. It used to render a bare coloured
 * `<span>` with the word in it and no glyph, on both the table row and the card
 * row. The icon defaults out of `STATUS_ICON`, which `lib/status.ts:52` exists
 * for precisely so "a bare colour chip cannot be built by accident".
 */
function Tone({
  text,
  tone,
  icon,
  reason,
  entity,
}: {
  text: string
  /** Omitted for an `entity` mark, which takes no hue at all. */
  tone?: keyof typeof STATUS
  icon?: IconName
  /**
   * This chip names an ENTITY ATTRIBUTE, not an operational state.
   *
   * v4.1 §2 gives each of the seven hues exactly one meaning, so spending one
   * on a client property teaches the eye that the hue means nothing in
   * particular. VIP is the case that forced this: it was yellow here, blue in
   * the booking combobox and `neutral` in the canonical FLAGS map, all at the
   * same time — and yellow ("being worked in-house") was the worst reading of
   * the three. An entity mark is a recessed surface plus its word.
   */
  entity?: boolean
  /**
   * Why this chip is on the row. Rulings §11.2.3 — *"a client told they are on
   * stop will ask why"* — so the On Stop chip carries its firing limb here
   * rather than making the operator open the profile to find out. It becomes
   * both the accessible name and the hover text, so the reason is not
   * hover-only.
   */
  reason?: string
}) {
  const c = entity || tone === undefined ? null : STATUS[tone]
  // No cast: `STATUS_ICON` is `Record<StatusKey, IconName>` now, so a glyph the
  // REGISTRY does not carry fails at compile time rather than rendering red
  // `[Icon:…]` text on this very row, which is what BUG-001 was.
  const glyph: IconName | undefined = icon ?? (tone ? STATUS_ICON[tone] : undefined)
  return (
    <span
      {...(reason ? { title: reason, 'aria-label': `${text} — ${reason}` } : {})}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 19,
        padding: '0 7px',
        borderRadius: 'var(--r-chip)',
        // An entity mark takes a recessed surface and no hue; a status takes
        // its pair. Both keep the word, so §7.4 ("never colour alone") holds
        // either way — and holds trivially for the entity mark, which has no
        // colour to lean on in the first place.
        background: c ? c.bg : 'var(--surface-2)',
        color: c ? c.fg : 'var(--text2)',
        border: c ? (c.border ? `1px solid ${c.border}` : undefined) : '1px solid var(--border)',
        fontSize: 'var(--t-th)',
        fontWeight: c ? 600 : 700,
        letterSpacing: c ? undefined : '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {glyph && <Icon name={glyph} size={10} />}
      {text}
    </span>
  )
}

/* ── screen ────────────────────────────────────────────────────────────── */

/**
 * Clients → **Directory**, built from render `Clients - Directory A.PNG`.
 *
 * Three deliberate departures from that render:
 *   - it says "Search booking, customer…" and heads a column "Customer".
 *     CLAUDE.md: the word never appears in the UI — they are **clients**;
 *   - its money columns are unconditional. Foundation §8.3 makes Outstanding,
 *     Deposit Held and the Outstanding KPI **absent** for Warehouse, not masked;
 *   - its 284 clients over 12 pages are a picture. The counts here are derived
 *     from the list the table is actually showing.
 */
/** Escapes a value for a CSV cell — mirrors `Clients.tsx`'s directory-wide export. */
function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ClientsDirectory({
  clients,
  onRequestAdd,
  onBlockChanged,
  filtersOpen: controlledFiltersOpen,
  onFiltersOpenChange,
}: {
  clients: ClientRecord[]
  onRequestAdd: () => void
  /**
   * Re-read the directory from the database after a block or an unblock landed.
   *
   * ⛔ **Replaces `onBulkBlock(ids, reason)`**, which handed the ids up to
   * `Clients.tsx` so it could render a banner saying nothing had been blocked.
   * `isBlocked` is a database fact (`client_directory_v.is_blocked`, migration
   * 0054, derived from a live `client_flags` row), so the only honest way to
   * show a block is to write it and read it back — never to flip a local copy.
   * This callback is the "read it back" half; `Clients.tsx` wires it to
   * `useClients().refresh`.
   */
  onBlockChanged: () => void
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const money = useCanViewMoney()

  /*
   * ── the faceted filter panel (P6) ──────────────────────────────────────
   *
   * Local state, not a URL param, and deliberately so: the directory's owned
   * params (`filter`, `blocked`, `stop`, `q`) are each ONE value, while a
   * selection here is a map of arrays. Encoding that in the query string would
   * make every checkbox a history entry, so Back would walk the operator out of
   * a filter one tick at a time instead of leaving the screen. The chips above
   * keep their param behaviour; the panel is a working surface.
   */
  const [facetSel, setFacetSel] = useState<FacetSelection>({})
  const [internalFiltersOpen, setInternalFiltersOpen] = useState(false)
  const filtersOpen = controlledFiltersOpen ?? internalFiltersOpen
  const setFiltersOpen = (open: boolean) => {
    setInternalFiltersOpen(open)
    onFiltersOpenChange?.(open)
  }
  const facets = useMemo(() => clientFacetsFor(money), [money])

  const toggleFacet = useCallback((key: string, value: string) => {
    setFacetSel((prev) => {
      const cur = prev[key] ?? []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      if (next.length === 0) {
        const { [key]: _dropped, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: next }
    })
  }, [])
  const { user } = useAuth()
  const online = useNetwork()
  // `gateContext` builds a fresh object every call — memoized on the one
  // primitive it actually derives from so `pageRowsWithIntel` below (and any
  // other memo keyed on `gctx`) doesn't invalidate on every unrelated render.
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  /*
   * The same gate `ClientDetail` applies to the same verb (CL-06).
   *
   * Without it these controls are offered to every seat and refused by the
   * dispatcher on press — `blockClient` carries `permissions: ['client.block']`
   * and `actions/core.ts` resolves it through `rbac.canBlockClient`, which is
   * Owner/Admin/Manager. A Coordinator or Warehouse session got an enabled
   * button and an error, which is the shape CL-06 was raised about; fixing one
   * surface and not the other would have left the two disagreeing about who may
   * block a client.
   */
  const mayBlock = canBlockClient(user?.role ?? 'Client')
  // HIS v2.1 §4.2 — phone/email were rendering unconditionally for every role
  // before this; gated here the same way `money` already gates Outstanding/
  // Deposit, so a Warehouse or Technician session never receives the column.
  const pii = canViewPII(gctx)
  const { showSuccessToast } = useToast()
  const [params, setParams] = useSearchParams()
  /* DEVICES.md §7 build order item 1 — below 768 the table can't be read even
     scrolled, so the phone gets the card view unconditionally (Law 13: branch
     on capability, not platform).
     Spec 8.1 draws THREE layouts, not two, so this reads the band rather than
     the phone-vs-not boolean it used to: `tabular` still decides table-vs-cards
     at 768, and `desktop` decides whether the two rails sit beside the list or
     reflow beneath it. Rulings §7 — "collapse below 1280" is *reflow*, not
     *hide*, so at tablet the Filters/Saved Views and Client-profile content
     renders inline rather than going into `CollapsibleAside`'s handle. */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tabular = viewport !== 'phone'
  const desktop = viewport === 'desktop'
  /** Tablet keeps the table but not nine columns of it — see the `<table>` below. */
  const narrow = viewport === 'tablet'

  /**
   * §18 — chip, overlays and search are DERIVED from the query string rather
   * than mirrored into state, which is what makes Back work for free:
   * react-router re-renders with new params on popstate and these recompute.
   * A mirrored `useState` copy would need an effect to notice the navigation,
   * and that effect is where the classic "Back moves the URL but not the UI"
   * bug lives (the same reasoning as `useFilters`, which this in-browser
   * directory cannot use because it holds no server-side `ListFilters`).
   *
   * ⛔ **What this replaced.** Three `useState`s — `activeFilter`, `overlays`
   * and `searchQuery`, the last seeded from `?q=` once at mount and never
   * written back — so a refresh dropped every chip, Back skipped over filter
   * decisions, and a filtered list could not be handed to anyone as a link.
   *
   * `?q=` also stays the handoff other surfaces use — the Membership tab's
   * row action navigates to `/clients?q=<name>`, so "find this member in the
   * directory" lands on the member rather than on an unfiltered list.
   *
   * The overlays (`?blocked=` / `?stop=`) are derived the same way but
   * further down, after `stopCheckRan` — validating `?stop=` needs it.
   */
  const activeFilter = filterFromParam(params.get('filter'), money)
  const searchQuery = params.get('q') ?? ''
  const [searchInput, setSearchInput] = useState(searchQuery)

  useEffect(() => {
    setSearchInput(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (searchInput === searchQuery) return
    const timer = setTimeout(() => {
      const midBurst = Boolean(searchQuery) && Boolean(searchInput)
      patchParams({ q: searchInput || null }, midBurst)
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced search sync to URL
  }, [searchInput, searchQuery])

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [view, setView] = useState<ViewKey>('Table')
  const [density, setDensity] = useState<Density>('comfortable')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [openMenuId, setOpenMenuId] = useState<{ id: string; up: boolean } | null>(null)
  /** Tallest the row menu gets — profile, new rental, active booking, payments. */
  const CLIENT_MENU_H = 150
  const [perPage, setPerPage] = useState<number>(CLIENT_ROWS_PER_PAGE[1])
  const [page, setPage] = useState(1)
  const [activeSavedView, setActiveSavedView] = useState<string | null>(null)
  const [showBulkBlock, setShowBulkBlock] = useState(false)
  const [bulkBlockReason, setBulkBlockReason] = useState('')
  /** Which direction the open dialog is going. Law 3 — a block is lifted, never deleted. */
  const [blockMode, setBlockMode] = useState<'block' | 'unblock'>('block')
  /** The exact clients the dialog will act on — a bulk selection, or one from the rail. */
  const [blockTargets, setBlockTargets] = useState<ClientRecord[]>([])
  const [blockBusy, setBlockBusy] = useState(false)
  /** Law 12 — persistent and inline, inside the dialog that caused it. */
  const [blockError, setBlockError] = useState<string | null>(null)
  /**
   * **Law 8 — one key per client per press of the dialog's button.**
   *
   * Minted when the dialog opens, not when the request is sent, so pressing
   * Block again after a partial failure replays the SAME key for each client
   * and conflicts on `client_flags_client_uuid_key` instead of writing a second
   * flag row for a client that was already done.
   */
  const blockKeys = useRef<Record<string, string>>({})
  const td = tdFor(density)

  const metrics = useMemo(() => clientMetrics(clients), [clients])
  /* `clientFilterGroupsFor` is gone from this screen: it returned ten
     `{label, icon}` pairs with no options and no predicates, which is why the
     panel it fed could only render an "advanced filters — coming soon" row.
     `clientFacetsFor(money)` above replaces it and carries the same Law 6 rule
     (money-shaped groups are dropped, not rendered empty). */

  /**
   * **Rulings §11.2 — On Stop, derived, once.**
   *
   * *N* comes from Settings ▸ Financial through `readOverdueStopDays()`; no
   * number is written here. Read once per mount rather than per row: it is a
   * `localStorage` read, and a threshold that changed mid-render would put two
   * different answers on one screen. Changing it in Settings and returning here
   * re-reads it.
   *
   * `daysPastDueOnOldestUnpaidInvoice` is left absent on purpose.
   * `ClientRecord` carries no invoice due dates — `client_directory_v` does not
   * publish them and `toClientRecord` cannot invent them — so the overdue limb
   * reports itself **unavailable** on every directory row rather than
   * defaulting to "not overdue". §11.2.7: *do NOT default to false silently.*
   * The client record (`ClientDetail`), which does run the invoices query,
   * evaluates both limbs.
   */
  const stopThresholdDays = useMemo(() => readOverdueStopDays(), [])
  const stopVerdicts = useMemo(() => {
    const verdicts = new Map<string, CreditStopVerdict>()
    for (const c of clients) {
      verdicts.set(
        c.id,
        evaluateCreditStop(creditStopFactsOf(c, { canViewMoney: money }), {
          overdueStopDays: stopThresholdDays,
          canViewMoney: money,
        }),
      )
    }
    return verdicts
  }, [clients, money, stopThresholdDays])

  const onStopCount = useMemo(
    () => [...stopVerdicts.values()].filter((v) => v.onStop).length,
    [stopVerdicts],
  )
  /**
   * False when the check could not run for a single client on this list — which
   * is the ordinary case for a money-blind session, because
   * `toClientRecord` maps the view's withheld money to `0` and a zero that
   * means "not shown to you" cannot be compared against a limit. The chip then
   * says the check did not run instead of filtering to an empty list and
   * implying nobody is on stop.
   */
  const stopCheckRan = useMemo(
    () => [...stopVerdicts.values()].some((v) => !v.indeterminate),
    [stopVerdicts],
  )
  /** The reason to show when it did not — taken from a real verdict, not written here. */
  const stopUnavailableReason = useMemo(
    () => [...stopVerdicts.values()][0]?.unavailable.join(' ') ?? 'No client records were read, so the on-stop check had nothing to run against.',
    [stopVerdicts],
  )

  /**
   * Rulings §11.2.4 — Blocked and On Stop intersect the selection, never
   * replace it. Derived from the URL like the chip above, and declared HERE,
   * after `stopCheckRan`, because `?stop=1` needs it: a bookmarked URL is user
   * input like any other, and when the on-stop check could not run for this
   * session (the ordinary money-blind case) the chip is disabled — so the URL
   * must not do what the chip refuses. Filtering a list of indeterminate
   * verdicts would yield zero rows and read as "nobody is on stop", the exact
   * implication §11.2.7 exists to prevent (*do NOT default to false silently*).
   */
  const blockedParam = params.get('blocked') === '1'
  const stopParam = params.get('stop') === '1'
  /* Memoised on the two primitives. As a fresh literal every render it defeated
     `filteredClients`' memo below — the directory re-filtered and re-sorted on
     every keystroke anywhere on the page. */
  const overlays: Overlays = useMemo(
    () => ({ blocked: blockedParam, onStop: stopParam && stopCheckRan }),
    [blockedParam, stopParam, stopCheckRan],
  )

  const filteredClients = useMemo(() => {
    let rows = clients.filter((client) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matches =
          client.name.toLowerCase().includes(q) ||
          // Guarded, and it never fires on a directory row: nothing fills
          // `company` (see the search placeholder's note). Kept because it is
          // a conditional, not a claim — it costs one falsy check and would
          // start working the day the field has a source. The PROMISE it used
          // to back, "…email, company, PAN…", is what was removed.
          (client.company ? client.company.toLowerCase().includes(q) : false) ||
          client.phone.toLowerCase().includes(q) ||
          client.email.toLowerCase().includes(q) ||
          (client.pan ? client.pan.includes(q) : false) ||
          client.membership.toLowerCase().includes(q) ||
          client.clientType.toLowerCase().includes(q)
        if (!matches) return false
      }

      /* Rulings §11.2.4 — the overlays AND with the selection and with each
         other; neither replaces it. A blocked client still appears under
         "Organisation" unless the Blocked overlay is on. */
      if (overlays.blocked && !client.isBlocked) return false
      if (overlays.onStop && !stopVerdicts.get(client.id)?.onStop) return false

      if (activeFilter === 'active') return client.currentRentalsCount > 0
      if (activeFilter === 'paymentDue') return client.outstandingPaisa > 0
      if (activeFilter === 'vip') return Boolean(client.isVip)
      if (activeFilter === 'typeOrg') return client.clientType === 'Organisation'
      if (activeFilter === 'typeInd') return client.clientType === 'Individual'
      if (activeFilter === 'typeUnassigned') return client.clientType === 'Unassigned'
      return true
    })

    /* The panel ANDs with everything above it, exactly as the overlays do:
       picking "Membership: Elite" narrows whatever the chips already chose, it
       does not replace it. Applied after the predicate pass so the facet counts
       and the row count are computed over the same set. */
    rows = applyFacets(rows, facets, facetSel)

    const dir = sort.dir === 'asc' ? 1 : -1
    const value = (c: ClientRecord): string | number => {
      switch (sort.key) {
        case 'type':
          return c.clientType
        case 'membership':
          return c.membership
        case 'rentals':
          return c.currentRentalsCount
        case 'outstanding':
          return c.outstandingPaisa
        case 'deposit':
          return c.depositHeldPaisa
        case 'lastRental':
          // `lastRentalBs` is a display label — a BS date where the engine can
          // name one, the AD date otherwise (queries/clients.ts) — so its string
          // order is not chronological. The record carries no ISO instant, so
          // the AD label is parsed instead; a client with no rental sorts last.
          return parseAdLabel(c.lastRentalAd) ?? NO_RENTAL
        default:
          return c.name
      }
    }

    return [...rows].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      // "No rental yet" stays at the bottom whichever way the column is sorted.
      if (va === NO_RENTAL || vb === NO_RENTAL) return va === vb ? 0 : va === NO_RENTAL ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [clients, searchQuery, activeFilter, overlays, stopVerdicts, sort, facets, facetSel])

  const pageCount = Math.max(1, Math.ceil(filteredClients.length / perPage))
  const current = Math.min(page, pageCount)
  // Memoized for the same reason as `gctx` above: `.slice()` on every render
  // would hand `pageRowsWithIntel` a new array identity even when nothing on
  // the visible page actually changed, forcing it to recompute every time.
  const pageRows = useMemo(
    () => filteredClients.slice((current - 1) * perPage, current * perPage),
    [filteredClients, current, perPage],
  )

  /**
   * HIS v2.1 card-builder call sites — `clientGlance`/`clientDetailGroups`
   * build a full field-gated object graph per row (role/PII/money filtering
   * included). Both the card view and table view render the same page of
   * clients, so one memo covers both `.map()`s instead of calling the
   * builders inline in either — that ran them on every re-render of this
   * component (a search keystroke, opening the row menu, toggling a
   * checkbox…), not just when a row's underlying data changed.
   */
  const pageRowsWithIntel = useMemo(
    () =>
      pageRows.map((client) => ({
        client,
        glance: clientGlance(client, gctx),
        detail: clientDetailGroups(client, gctx),
      })),
    [pageRows, gctx],
  )

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  )

  const resetPage = () => setPage(1)

  /**
   * Merge-writes the params this directory owns, deleting a key handed `null`
   * — `OperationsQueues.tsx`'s `patch()` helper, the named house pattern for
   * multi-param URL state. Merging from the CURRENT params is what keeps
   * `?tab=`, which `Clients.tsx` owns on this same URL, untouched: two owners,
   * one query string, no clobbering.
   *
   * `replace` exists for one caller — the middle of a search burst — so a
   * word of typing is one history entry, not twelve.
   */
  const patchParams = (next: Record<string, string | null>, replace = false) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    setParams(merged, replace ? { replace: true } : undefined)
  }

  const applyFilter = (f: FilterKey) => {
    patchParams({ filter: f === 'all' ? null : FILTER_PARAM[f] })
    setActiveSavedView(null)
  }

  const toggleOverlay = (which: keyof Overlays) => {
    patchParams({ [which === 'blocked' ? 'blocked' : 'stop']: overlays[which] ? null : '1' })
    setActiveSavedView(null)
  }


  const clearAll = () => {
    /* Every owned param in ONE write — two navigations would make "Clear all"
       take two presses of Back to undo, which is not one action. */
    patchParams({ filter: null, blocked: null, stop: null, q: null })
    setSort({ key: 'name', dir: 'asc' })
    setActiveSavedView(null)
    /* The facet panel is local state, not a URL param, so it is not covered by
       the single `patchParams` write above and has to be cleared beside it —
       otherwise "Clear all" leaves the drawer's badge reading "4 active" over
       an unfiltered list. */
    setFacetSel({})
  }

  /**
   * Pagination is local state, so a filter arriving by Back/Forward — which
   * never passes through the handlers above — must still reset it. Keyed on
   * the derived values themselves rather than on the click sites: page 4 of a
   * freshly-narrowed two-page list would render an empty table under a live
   * pager. (`current` below also clamps, so the intermediate render is safe.)
   */
  const filterSignature = `${activeFilter}|${overlays.blocked}|${overlays.onStop}|${searchQuery}`
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const applySortKey = (k: SortKey) => {
    setSort((prev) => (prev.key === k ? { key: k, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }))
    resetPage()
  }

  const emptyBecauseNoClients = clients.length === 0

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((c) => selectedRowIds.has(c.id))
  const toggleAllOnPage = () =>
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageRows.forEach((c) => next.delete(c.id))
      else pageRows.forEach((c) => next.add(c.id))
      return next
    })

  const selectedClients = useMemo(() => clients.filter((c) => selectedRowIds.has(c.id)), [clients, selectedRowIds])

  /** A real CSV of just the selected rows — same quoting rule as the full-directory export. */
  const exportSelected = () => {
    // No 'Company' column — the same removal, for the same reason, that
    // `Clients.tsx`'s full-directory export already made: `ClientRecord.company`
    // has no source in `client_directory_v`, the mapper never sets it, and the
    // directory only ever holds mapped rows, so every cell under that header
    // was blank on every row.
    const headers = [
      'Client ID',
      'Name',
      'Type',
      'Membership',
      'Phone',
      'Email',
      'PAN',
      ...(money ? ['Outstanding (Rs)', 'Deposit Held (Rs)'] : []),
      'Status',
    ]
    const lines = selectedClients.map((c) =>
      [
        c.id,
        c.name,
        c.clientType,
        c.membership,
        c.phone,
        c.email,
        c.pan ?? '',
        ...(money ? [formatMoney(c.outstandingPaisa), formatMoney(c.depositHeldPaisa)] : []),
        /* NOT "Active": since CL-04 that word means "has a booking that is
           neither Closed nor cancelled", and this column is about the block
           flag — a different fact about a different thing. Two senses of one
           word in one export is a spreadsheet nobody can filter. */
        c.isBlocked ? 'Blocked' : 'Not blocked',
      ]
        .map(csvCell)
        .join(','),
    )
    const blob = new Blob([[headers.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'selected-clients.csv'
    a.click()
    URL.revokeObjectURL(url)
    showSuccessToast('Export ready', `${selectedClients.length} client rows written to selected-clients.csv`)
  }

  /** `ActionContext` — the signed-in identity, or null. The dispatcher substitutes no default. */
  const dispatchContext = (): ActionContext | null =>
    user ? { userId: user.id, role: user.role, isOnline: online } : null

  /** Opens the dialog for a set of clients in one direction, minting this press's Law 8 keys. */
  const openBlockDialog = (mode: 'block' | 'unblock', targets: ClientRecord[]) => {
    if (targets.length === 0) return
    setBlockMode(mode)
    setBlockTargets(targets)
    setBulkBlockReason('')
    setBlockError(null)
    blockKeys.current = Object.fromEntries(targets.map((c) => [c.id, newClientUuid()]))
    setShowBulkBlock(true)
  }

  /**
   * Block or unblock, one dispatch per client, awaited.
   *
   * ⛔ **What this replaced.** It used to call `onBulkBlock(ids, reason)` and
   * immediately close, and before 12 Aug it also fired
   * `showSuccessToast('Clients blocked', …)` unconditionally — a green "5
   * clients blocked" toast for a write that never left the browser, because
   * `blockClient` was a stub and the parent only rendered a red banner saying
   * so. Now the action writes a `client_flags` row and this function reports
   * from its outcome: successes on the resolved path only, failures inline and
   * persistent (Law 12), and the directory is re-read from the database rather
   * than patched locally.
   *
   * Per-client rather than one call, because `client_flags` is one row per
   * client and a partial failure has to be reportable per client — "3 of 5
   * blocked, these 2 were not, and here is why" is a true statement; "blocked"
   * is not.
   */
  const confirmBlockChange = async () => {
    const blocking = blockMode === 'block'
    if (blocking && bulkBlockReason.trim().length < 10) return

    const ctx = dispatchContext()
    if (!ctx) {
      setBlockError(
        'You are not signed in, so this cannot be recorded — a block has to name who applied it. Sign in and try again.',
      )
      return
    }

    setBlockBusy(true)
    setBlockError(null)

    const { blockClient } = await import('../../actions/clients/blockClient')
    const failures: string[] = []
    let landed = 0

    for (const client of blockTargets) {
      try {
        await blockClient(
          {
            // `ClientRecord.id` is the CLIENT CODE — `queries/clients.ts`
            // sets it from `client_code`. `blockClient` takes the code and
            // resolves the uuid itself, which is why this is not a mismatch.
            clientCode: client.id,
            blocked: blocking,
            ...(bulkBlockReason.trim() ? { reason: bulkBlockReason.trim() } : {}),
            ...(blockKeys.current[client.id] ? { clientUuid: blockKeys.current[client.id] } : {}),
          },
          ctx,
        )
        landed += 1
      } catch (err) {
        failures.push(`${client.name} (${client.id}) — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    setBlockBusy(false)

    if (landed > 0) {
      // The directory row's `isBlocked` comes from the view, so the only way to
      // show the change is to re-read it.
      onBlockChanged()
      showSuccessToast(
        blocking ? 'Clients blocked' : 'Blocks lifted',
        `${landed} client${landed === 1 ? '' : 's'} ${blocking ? 'blocked' : 'unblocked'}`,
      )
    }

    if (failures.length > 0) {
      // The dialog stays open holding the reason, so a retry does not retype it.
      setBlockError(
        `${failures.length} of ${blockTargets.length} could not be ${blocking ? 'blocked' : 'unblocked'}:\n` +
          failures.join('\n'),
      )
      return
    }

    setSelectedRowIds(new Set())
    setShowBulkBlock(false)
    setBulkBlockReason('')
    setBlockTargets([])
  }

  /**
   * The row's one primary verb. Receive Payment only exists for a role that may
   * see the balance in the first place — offering it to Warehouse would name a
   * figure that role is not allowed to know.
   *
   * It now also requires the capability to record one. This verb routes to
   * `/finance` rather than opening `RecordPaymentModal`, but it is the same
   * action by name, and `rbac.canRecordPayment` (Owner / Coordinator /
   * Accounts) is what the dispatcher will actually apply — so an Admin or a
   * Manager was being offered "Receive Payment" as their primary verb and sent
   * to a page where the button is absent. Money visibility and permission to
   * act are different questions: a Manager keeps the Outstanding COLUMN and
   * falls through to the next verb in this chain ("Open Rental" / "New
   * Rental"), which is this function's own existing fallback, not a new rule.
   */
  const canTakePayment = user ? canRecordPayment(user.role) : false

  const primaryAction = (client: ClientRecord) => {
    if (client.isBlocked) {
      return { label: 'Review Block', variant: 'secondary' as const, run: () => setSelectedClientId(client.id) }
    }
    if (money && canTakePayment && client.outstandingPaisa > 0) {
      return { label: 'Receive Payment', variant: 'primary' as const, run: () => navigate('/finance') }
    }
    if (client.currentRentalsCount > 0) {
      const booking = client.activeBookings[0]
      return {
        label: 'Open Rental',
        variant: 'secondary' as const,
        run: () => navigate(booking ? `/rentals/${booking}` : '/rentals'),
      }
    }
    return { label: 'New Rental', variant: 'primary' as const, run: () => navigate('/rentals/new') }
  }

  const kpis: Kpi[] = [
    {
      label: 'Total Clients',
      value: String(metrics.total),
      icon: 'users',
      accent: 'primary',
      note: 'All clients (all statuses)',
    },
    /*
     * ⚠ "Active", not "On Rent" — the label is bounded by what the figure can
     * actually answer, and it is not "how many clients have gear out today".
     *
     * Follow the number back: `clientMetrics.onRent` counts rows with
     * `currentRentalsCount > 0` (data/clients.ts:1044); `currentRentalsCount`
     * is `active_bookings_count` (lib/queries/clients.ts:216); and that view
     * column is
     *   `count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null)`
     * (0054_rls_backstops_and_directory_block_flag.sql:321). The canonical
     * stages are Quote · Booked · Packed · On Rent · Returned · Closed
     * (0054:317-319), so `<> 'Closed'` sweeps in the five non-closed stages —
     * a quote nobody has confirmed, and a rental already returned, count here
     * exactly as loudly as gear that is out.
     *
     * The column is honestly named; only the label was lying. Renaming the
     * label is the whole fix available here: a genuine on-rent count needs a
     * SECOND counter in the view (`b.stage = 'On Rent' and b.cancelled_at is
     * null`), which is a migration, not a screen change.
     */
    {
      label: 'Active',
      value: String(metrics.onRent),
      icon: 'checklist',
      accent: 'success',
      note: 'Clients with any booking not closed or cancelled',
    },
    ...(money
      ? [
          {
            label: 'Outstanding',
            value: formatMoney(metrics.outstandingPaisa),
            icon: 'card' as const,
            accent: 'progress' as const,
            note: `${metrics.paymentDue} ${metrics.paymentDue === 1 ? 'client' : 'clients'}`,
          },
        ]
      : []),
    {
      label: 'Blocked',
      value: String(metrics.blocked),
      icon: 'alert_triangle',
      accent: 'danger',
      note: 'Requires review',
    },
  ]

  /**
   * The EXCLUSIVE group — pick exactly one. Blocked has left it (Rulings
   * §11.2.4); these counts are mutually exclusive within each family and every
   * one of them is a subset of `All`.
   */
  const chips: Array<{ label: string; key: FilterKey; count: number }> = [
    { label: 'All', key: 'all', count: metrics.total },
    { label: 'Organisation', key: 'typeOrg', count: metrics.typeOrg },
    { label: 'Individual', key: 'typeInd', count: metrics.typeInd },
    { label: 'Unassigned', key: 'typeUnassigned', count: metrics.typeUnassigned },
    { label: 'Active', key: 'active', count: metrics.onRent },
    ...(money ? [{ label: 'Payment Due', key: 'paymentDue' as FilterKey, count: metrics.paymentDue }] : []),
    { label: 'VIP', key: 'vip', count: metrics.vip },
  ]

  /**
   * The INTERSECTING overlays. Independent toggles, counted over the whole
   * directory rather than over the current selection — an overlay describes how
   * many clients carry that condition, not how many survive the other filters,
   * and the two chips deliberately overlap each other.
   */
  const overlayChips: Array<{
    label: string
    key: keyof Overlays
    count: number
    icon: IconName
    /** Present when the condition cannot be evaluated at all — the chip goes inert and says why. */
    unavailable?: string
  }> = [
    { label: 'Blocked', key: 'blocked', count: metrics.blocked, icon: 'alert_triangle' },
    {
      label: 'On Stop',
      key: 'onStop',
      count: onStopCount,
      icon: 'lock',
      ...(stopCheckRan ? {} : { unavailable: stopUnavailableReason }),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={kpis.length} />

      {/* ── quick filters + view switch ───────────────────────────────── */}
      <div
        className="rsp-chip-scroll"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-sm)',
          flexWrap: phone ? 'nowrap' : 'wrap',
          overflowX: phone ? 'auto' : undefined,
          paddingBottom: phone ? 4 : 0,
        }}
      >
        {chips.map((c) => {
          const on = activeFilter === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => applyFilter(c.key)}
              aria-pressed={on}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                // Law 15 — 44×44 at every width, desktop included. Matches
                // `Inventory.tsx:1547`, the same control built to the rule.
                minHeight: 44,
                padding: '0 11px',
                borderRadius: 'var(--r-sm)',
                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
              <span
                className="figure"
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 5,
                  display: 'inline-grid',
                  placeItems: 'center',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  padding: '0 4px',
                }}
              >
                {c.count}
              </span>
            </button>
          )
        })}

        {/*
          ── the intersecting overlays ─────────────────────────────────────
          Rulings §11.2.4. Separated from the exclusive group by a rule and a
          label so the difference is visible and not merely behavioural: these
          two narrow whatever is selected on the left, they do not replace it,
          and unlike the chips above they can both be on at once.
        */}
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', minHeight: 28, background: 'var(--divider)', margin: '0 2px' }} />
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>Also show only</span>
        {overlayChips.map((c) => {
          const on = overlays[c.key]
          const chip = (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleOverlay(c.key)}
              aria-pressed={on}
              disabled={Boolean(c.unavailable)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                /* Law 15 — 44×44 at every width, as with the chips above. */
                minHeight: 44,
                padding: '0 11px',
                borderRadius: 'var(--r-sm)',
                /* Law 11 — the overlay's state is icon + label + colour, never
                   colour alone: the icon fills when the overlay is on. */
                border: `1px dashed ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                color: c.unavailable ? 'var(--muted)' : on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 600 : 500,
                cursor: c.unavailable ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={c.icon} size={13} fill={on} />
              {c.label}
              {c.unavailable ? (
                <span style={{ fontSize: 'var(--t-th)', fontWeight: 600 }}>check unavailable</span>
              ) : (
                <span
                  className="figure"
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 5,
                    display: 'inline-grid',
                    placeItems: 'center',
                    background: 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 700,
                    padding: '0 4px',
                  }}
                >
                  {c.count}
                </span>
              )}
            </button>
          )
          /* §11.2.7 — when a limb cannot be evaluated the UI says the check did
             not run. It is not silently omitted (an operator would read its
             absence as "nobody is on stop") and it does not filter to an empty
             list, which would say the same thing more convincingly. */
          return c.unavailable ? (
            <Unavailable key={c.key} reason={c.unavailable}>
              {chip}
            </Unavailable>
          ) : (
            chip
          )
        })}

        <span style={{ marginLeft: phone ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', width: phone ? '100%' : 'auto', flexWrap: phone ? 'nowrap' : 'nowrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative', flex: phone ? '1 1 0' : undefined, minWidth: 0 }}>
            <Icon name="search" size={15} style={{ color: 'var(--muted)', position: 'absolute', left: 9 }} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const midBurst = Boolean(searchQuery) && Boolean(searchInput)
                  patchParams({ q: searchInput || null }, midBurst)
                }
              }}
              /* No "company". `ClientRecord.company` has no source in
                 `client_directory_v` — the live view's 31 columns carry no
                 company field and `toClientRecord` never sets one — so this
                 placeholder was advertising a haystack with nothing in it.
                 (0005_clients.sql:36: "There is no separate companies table";
                 for an Organisation the company name IS `clients.name`, which
                 this box already searches.) */
              placeholder="Search client, phone, email, PAN…"
              aria-label="Search clients"
              style={{
                width: phone ? '100%' : 280,
                minHeight: 44,
                padding: '0 10px 0 29px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </label>

          {tabular &&
            (['Table', 'Cards'] as ViewKey[]).map((v) => (
              <Button
                key={v}
                icon={v === 'Table' ? 'queues' : 'box'}
                variant={view === v ? 'primary' : 'secondary'}
                onClick={() => setView(v)}
              >
                {v}
              </Button>
            ))}

          {/* Was an `Unavailable` reading "Advanced client filters are not
              built yet". They are now — `clientFacets.ts` carries the options,
              the predicates and the counts, so the control does the thing its
              label always claimed. */}
        </span>
      </div>

      {/*
        The selection, visible while the drawer is shut.

        Without this the panel is a hidden mode: a list narrowed from 284 rows
        to 9 by a facet chosen minutes ago looks like a directory that has lost
        its clients, and the only clue is a small count on a button. Each chip
        names the facet as well as the value ("Membership: Elite"), because
        "Elite" alone does not say which of eight groups it came from, and
        removing one is a single press rather than reopening the panel.
      */}
      <ActiveFilterChips
        filters={facets.flatMap<ActiveFilter>((facet) =>
          (facetSel[facet.key] ?? []).map((value) => {
            const label = optionsOf(facet, clients).find((o) => o.value === value)?.label ?? value
            return {
              key: `${facet.key}:${value}`,
              label: `${facet.label}: ${label}`,
              onRemove: () => toggleFacet(facet.key, value),
            }
          }),
        )}
        onClearAll={clearAll}
      />

      {/* ── filters (overlay) + list ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: filtersOpen && !phone ? 'minmax(230px, 280px) minmax(0,1fr)' : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/*
          The rail is gone — and Rulings §7 ("below 1280 this content REFLOWS,
          it does not hide") is satisfied better than it was, for the reason
          RentalsList records at its own drawer: there is no rail left to
          collapse, and the panel is reachable from the same Filters button at
          every width. The 210px column it used to hold cost the table 178px at
          the app's own 1280 baseline; `FilterDrawer` is `position: fixed`, so
          it costs zero layout and this grid is now one column.
        */}
        <>
        {(() => {
          const filtersContent = (
            <>
          <Card
            title="Filters"
            action={
              <button
                type="button"
                onClick={clearAll}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--link)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                }}
              >
                Clear all
              </button>
            }
            bodyStyle={{ padding: 'var(--sp-sm)' }}
          >
            {/*
              What stood here was one `Unavailable` row reading "Advanced
              filters — coming soon", standing in for nine dead rows built from
              `CLIENT_FILTER_GROUPS` — ten `{label, icon}` pairs with no options
              and no predicates behind them.

              These are those filters. Every option carries a live count
              (P6: "filters carry live counts on every option"), computed over
              the rows already in memory rather than by a query per option:
              this screen loads the directory once and filters in the browser,
              so a count is a synchronous pass, not a round trip.

              A facet is counted with every OTHER facet applied but not its own
              — `facetCountsOf`'s contract, and the same rule `FilterDrawer` §10
              states for the server path. Picking one membership therefore
              leaves the other memberships answering "and how many instead?"
              rather than collapsing them all to zero.

              Derived facets (Location, Segment, Organisation Type) read their
              options off the loaded rows, so the panel can only ever offer a
              value some client actually has — no dead control, ever.
            */}
            <div style={filterGroupStyle}>
              {facets.map((facet) => {
                const options = optionsOf(facet, clients)
                if (options.length === 0) return null
                const counts = facetCountsOf(facet, clients, facetSel)
                return (
                  <FilterOptionList
                    key={facet.key}
                    label={facet.label}
                    options={options.map((o) => ({ value: o.value, label: o.label, count: counts[o.value] ?? 0 }))}
                    selected={facetSel[facet.key] ?? []}
                    onToggle={(v) => toggleFacet(facet.key, v)}
                  />
                )
              })}
            </div>
          </Card>

          <Card title="Saved Views" bodyStyle={{ padding: 'var(--sp-sm)' }}>
            {SAVED_VIEWS.filter((v) => money || !v.money).map((v) => {
              const on = activeSavedView === v.label
              return (
                <button
                  key={v.label}
                  type="button"
                  onClick={() => {
                    /* A saved view restores the WHOLE state, overlays included —
                       otherwise "Blocked Clients" would leave a stale On Stop
                       overlay on and show a different list each time. One
                       `patchParams` call, so restoring a view is one history
                       entry and one Back undoes it whole. */
                    const restored = { ...NO_OVERLAYS, ...v.overlays }
                    patchParams({
                      filter: v.filter === 'all' ? null : FILTER_PARAM[v.filter],
                      blocked: restored.blocked ? '1' : null,
                      stop: restored.onStop ? '1' : null,
                    })
                    setSort(v.sort)
                    setActiveSavedView(v.label)
                  }}
                  aria-pressed={on}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    width: '100%',
                    minHeight: 44,
                    padding: '0 8px',
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    background: on ? 'var(--nav-active-bg)' : 'transparent',
                    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name="flag" size={14} style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{v.label}</span>
                </button>
              )
            })}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <Unavailable reason="Saving a view is not built yet — views are not persisted anywhere">
                <Button icon="plus" disabled>
                  Save Current View
                </Button>
              </Unavailable>
            </div>
          </Card>
            </>
          )
          return (
            <FilterDrawer
              id="clients-filters"
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              desktopMode="rail"
              /* No `null` branch: `clients` arrives as a prop already resolved
                 by `Clients.tsx`, so this screen has no in-flight state of its
                 own to report — unlike RentalsList, which pages server-side. */
              resultCount={filteredClients.length}
              noun={filteredClients.length === 1 ? 'client' : 'clients'}
              activeCount={selectionCount(facetSel)}
              onClearAll={clearAll}
              standardFooter
              onApply={() => setFiltersOpen(false)}
            >
              {filtersContent}
            </FilterDrawer>
          )
        })()}
        </>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: desktop && selectedClient ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          <Card bodyStyle={{ padding: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 14px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--card2)',
                /* The card body has padding 0, so this strip sits flush in the
                   card's top corners and its own square corners painted over
                   them — visible as a notch once --r-card went 8 -> 14 (v4.2
                   §6). It carries the card's radius rather than the card
                   carrying `overflow: hidden`, because the row-action menu
                   below is absolutely positioned and clipping the card would
                   cut it off. */
                borderRadius: 'var(--r-card) var(--r-card) 0 0',
                flexWrap: 'wrap',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <span>
                {filteredClients.length === 0
                  ? 'Showing 0 clients'
                  : `Showing ${(current - 1) * perPage + 1} to ${Math.min(current * perPage, filteredClients.length)} of ${filteredClients.length} clients`}
              </span>
              {selectedRowIds.size > 0 && (
                <>
                  <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {selectedRowIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedRowIds(new Set())}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--link)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Clear selection
                  </button>
                  <Button icon="download" onClick={exportSelected}>
                    Export Selected
                  </Button>
                  {/* Only the un-blocked ones — asking to block a client that is
                      already blocked has no write to make, and the action says so
                      rather than silently succeeding. */}
                  {/* `mayBlock` — see its definition. This file HIDES what a
                      role may not use, where `ClientDetail` greys it with a
                      stated reason: that is this screen's own precedent, the
                      one `filterFromParam` already keeps for the money-blind
                      Payment Due filter ("the filter must not run for a session
                      that may not know the answer"). A bulk toolbar that
                      appears only when rows are selected has nowhere to put a
                      reason without shouting it at every selection. */}
                  {mayBlock && selectedClients.some((c) => !c.isBlocked) && (
                    <Button
                      variant="danger"
                      icon="alert_triangle"
                      onClick={() => openBlockDialog('block', selectedClients.filter((c) => !c.isBlocked))}
                    >
                      Block Selected
                    </Button>
                  )}
                  {/* Law 3 — a block is lifted, never deleted, so the lift needs a
                      control of its own wherever the block has one. */}
                  {mayBlock && selectedClients.some((c) => c.isBlocked) && (
                    <Button
                      icon="checklist"
                      onClick={() => openBlockDialog('unblock', selectedClients.filter((c) => c.isBlocked))}
                    >
                      Unblock Selected
                    </Button>
                  )}
                </>
              )}
              {!phone && (
                <button
                  type="button"
                  onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                  aria-pressed={density === 'compact'}
                  title={density === 'compact' ? 'Compact rows — click for comfortable' : 'Comfortable rows — click for compact'}
                  style={{
                    marginLeft: 'auto',
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: density === 'compact' ? 'var(--nav-active-bg)' : 'var(--input-bg)',
                    color: density === 'compact' ? 'var(--nav-active-accent)' : 'var(--text2)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name={density === 'compact' ? 'chevron_up' : 'chevron_down'} size={15} />
                </button>
              )}

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                Show
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value))
                    resetPage()
                  }}
                  className="figure"
                  style={{
                    // Law 15 — 44×44 at every width, desktop included. A real
                    // <select> the operator has to hit; it was 26px tall.
                    minHeight: 44,
                    padding: '0 6px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'inherit',
                  }}
                >
                  {CLIENT_ROWS_PER_PAGE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                per page
              </label>
            </div>

            {filteredClients.length === 0 ? (
              <div style={{ padding: 'var(--sp-lg)' }}>
                <EmptyState
                  title={emptyBecauseNoClients ? 'No clients yet' : 'No clients found'}
                  description={
                    emptyBecauseNoClients
                      ? 'The directory is empty. Register the first client to start booking.'
                      : searchQuery
                        ? `No client matches "${searchQuery}" under the current filter.`
                        : 'No client matches the selected filter.'
                  }
                  actionLabel={emptyBecauseNoClients ? 'Register a client' : 'Clear all filters'}
                  onAction={emptyBecauseNoClients ? onRequestAdd : clearAll}
                />
              </div>
            ) : !tabular || view === 'Cards' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))',
                  gap: 'var(--sp-md)',
                  padding: 14,
                }}
              >
                {pageRowsWithIntel.map(({ client, glance, detail }) => {
                  const action = primaryAction(client)
                  return (
                    <article key={client.id} style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <IntelCard
                        glance={glance}
                        detail={detail}
                        detailTitle={client.name}
                        detailSubtitle={`${client.id} · ${client.clientType}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span
                            aria-hidden
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 9,
                              display: 'grid',
                              placeItems: 'center',
                              background: STATUS[TIER_TONE[client.membership]].bg,
                              color: STATUS[TIER_TONE[client.membership]].fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {client.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {client.name}
                            </span>
                            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                              {client.clientType}
                            </span>
                          </span>
                        </div>
                      </IntelCard>

                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <Tone text={client.membership} tone={TIER_TONE[client.membership]} />
                        {client.isVip && <Tone text="VIP" entity />}
                        {client.isBlocked && <Tone text="Blocked" tone="danger" />}
                        {/* Rulings §11.2.5 — icon + label + colour, and the
                            firing limb travels with the chip so the row can
                            answer "why?" without opening the profile. Blocked
                            and On Stop can both be here at once: they are
                            different facts, not two spellings of one. */}
                        {stopVerdicts.get(client.id)?.onStop && (
                          <Tone
                            text="On Stop"
                            tone="danger"
                            icon="lock"
                            reason={stopVerdicts.get(client.id)?.reasons.join(' ') ?? ''}
                          />
                        )}
                      </div>

                      {pii && (
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                          <div className="figure">{client.phone}</div>
                          <div style={{ color: 'var(--muted)' }}>{client.email}</div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <span>
                          <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>
                            {client.currentRentalsCount}
                          </span>{' '}
                          active
                        </span>
                        {money && client.outstandingPaisa > 0 && (
                          <span className="figure" style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                            {formatMoney(client.outstandingPaisa)} due
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
                        <Button variant={action.variant} onClick={action.run}>
                          {action.label}
                        </Button>
                        <Button onClick={() => setSelectedClientId(client.id)}>Profile</Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              /*
                Spec 8.1's TABLET drawing is four columns — `code │ name │
                member │ ⋮` — not the desktop nine scrolled sideways. `narrow`
                drops the five that do not fit and takes the table's floor down
                with them, the same shape `RentalsList` uses for its own tablet
                band; the dropped facts are all still on the row's IntelCard and
                in the profile panel, so nothing becomes unreachable.
              */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: narrow ? 620 : money ? 1180 : 900 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      <th style={{ ...th, width: 30 }}>
                        <input
                          type="checkbox"
                          aria-label="Select all clients on this page"
                          checked={allOnPageSelected}
                          onChange={toggleAllOnPage}
                        />
                      </th>
                      <SortHeader label="Client" sortKey="name" sort={sort} onSort={applySortKey} />
                      {pii && !narrow && <SortHeader label="Contact" sort={sort} onSort={applySortKey} />}
                      {!narrow && <SortHeader label="Type" sortKey="type" sort={sort} onSort={applySortKey} />}
                      <SortHeader label="Membership" sortKey="membership" sort={sort} onSort={applySortKey} />
                      {/* "Active Rentals", not "Current Rentals": the figure is
                          `active_bookings_count` — every booking that is neither
                          Closed nor cancelled, see the KPI note above. */}
                      {!narrow && <SortHeader label="Active Rentals" sortKey="rentals" sort={sort} onSort={applySortKey} />}
                      {money && <SortHeader label="Outstanding" sortKey="outstanding" sort={sort} onSort={applySortKey} />}
                      {money && !narrow && <SortHeader label="Deposit Held" sortKey="deposit" sort={sort} onSort={applySortKey} />}
                      {!narrow && <SortHeader label="Last Rental (BS / AD)" sortKey="lastRental" sort={sort} onSort={applySortKey} />}
                      <SortHeader label="Action" sort={sort} onSort={applySortKey} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRowsWithIntel.map(({ client, glance, detail }) => {
                      const isSelected = selectedClientId === client.id
                      const action = primaryAction(client)
                      return (
                        <tr
                          key={client.id}
                          /* Spec 08 line 67 verbatim: "Rows are keyboard-reachable
                             — `role="button"`, `tabIndex`, Enter and Space." Two of
                             the three shipped; without the role a focusable `<tr>`
                             carrying a click handler is announced as a plain table
                             row, so the interaction was invisible to assistive tech.
                             The accessible name says what pressing it does. */
                          role="button"
                          aria-label={`Open ${client.name}'s profile`}
                          aria-pressed={isSelected}
                          tabIndex={0}
                          onClick={() => setSelectedClientId(isSelected ? null : client.id)}
                          onKeyDown={(e) => {
                            // Only the row itself opening/closing the profile
                            // rail, never a keypress bubbling up from the
                            // checkbox, the IntelCard trigger, the row's
                            // action button or its "more" menu — all of
                            // those are their own focus stops with their own
                            // Enter/Space behaviour already.
                            if (e.target !== e.currentTarget) return
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedClientId(isSelected ? null : client.id)
                            }
                          }}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isSelected ? 'var(--tr-hover)' : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <td style={{ ...td, width: 30 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${client.name}`}
                              checked={selectedRowIds.has(client.id)}
                              onChange={() =>
                                setSelectedRowIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(client.id)) next.delete(client.id)
                                  else next.add(client.id)
                                  return next
                                })
                              }
                            />
                          </td>

                          <td style={td}>
                            <IntelCard
                              glance={glance}
                              detail={detail}
                              detailTitle={client.name}
                              detailSubtitle={`${client.id} · ${client.clientType}`}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <span
                                  aria-hidden
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 'var(--r-badge)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.05,
                                    background: STATUS[TIER_TONE[client.membership]].bg,
                                    color: STATUS[TIER_TONE[client.membership]].fg,
                                    border: STATUS[TIER_TONE[client.membership]].border
                                      ? `1px solid ${STATUS[TIER_TONE[client.membership]].border}`
                                      : undefined,
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  {client.name.slice(0, 2).toUpperCase()}
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                                      {client.name}
                                    </span>
                                    {client.isVip && <Tone text="VIP" entity />}
                                    {client.isVerified && (
                                      <span
                                        title="KYC and PAN verified"
                                        style={{ color: 'var(--success-text)', display: 'inline-flex' }}
                                      >
                                        <Icon name="checklist" size={13} />
                                      </span>
                                    )}
                                    {client.isBlocked && <Tone text="Blocked" tone="danger" />}
                                    {/* Rulings §11.2 — derived, and drawn beside
                                        Blocked rather than instead of it. */}
                                    {stopVerdicts.get(client.id)?.onStop && (
                                      <Tone
                                        text="On Stop"
                                        tone="danger"
                                        icon="lock"
                                        reason={stopVerdicts.get(client.id)?.reasons.join(' ') ?? ''}
                                      />
                                    )}
                                  </span>
                                  {client.company && (
                                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 1 }}>
                                      {client.company}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </IntelCard>
                          </td>

                          {pii && !narrow && (
                            <td style={td}>
                              <span className="figure" style={{ display: 'block', color: 'var(--text)' }}>
                                {client.phone}
                              </span>
                              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                {client.email}
                              </span>
                            </td>
                          )}

                          {!narrow && <td style={{ ...td, color: 'var(--text2)' }}>{client.clientType}</td>}

                          <td style={td}>
                            <Tone text={client.membership} tone={TIER_TONE[client.membership]} />
                          </td>

                          {!narrow && (
                          <td style={td}>
                            {client.currentRentalsCount > 0 ? (
                              <span className="figure" style={{ color: 'var(--link)', fontWeight: 600 }}>
                                {client.currentRentalsCount} active
                              </span>
                            ) : (
                              <span className="figure" style={{ color: 'var(--muted)' }}>
                                0
                              </span>
                            )}
                          </td>
                          )}

                          {money && (
                            <td style={td}>
                              {client.outstandingPaisa > 0 ? (
                                <span className="figure" style={{ fontWeight: 600, color: 'var(--danger-text)' }}>
                                  {formatMoney(client.outstandingPaisa)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                          )}

                          {money && !narrow && (
                            <td style={td}>
                              {client.depositHeldPaisa > 0 ? (
                                <>
                                  <span className="figure" style={{ display: 'block', color: 'var(--text)' }}>
                                    {formatMoney(client.depositHeldPaisa)}
                                  </span>
                                  {client.currentRentalsCount === 0 && (
                                    <span style={{ display: 'inline-block', marginTop: 3 }}>
                                      <Tone text="Review Deposit" tone="progress" />
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                          )}

                          {!narrow && (
                          <td style={td}>
                            {client.lastRentalBs === '—' ? (
                              <span style={{ color: 'var(--muted)' }}>No rental yet</span>
                            ) : (
                              <>
                                {/* No " BS" appended here: `queries/clients.ts` already suffixes a
                                    BS label, and leaves the suffix off when it fell back to the AD
                                    date — appending it blindly stamped "BS" on an English date. */}
                                <span className="figure" style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                                  {client.lastRentalBs}
                                </span>
                                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                  {client.lastRentalAd}
                                </span>
                              </>
                            )}
                          </td>
                          )}

                          <td style={{ ...td, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', position: 'relative' }}>
                              <Button variant={action.variant} onClick={action.run}>
                                {action.label}
                              </Button>
                              <button
                                type="button"
                                aria-label={`More actions for ${client.name}`}
                                aria-haspopup="menu"
                                aria-expanded={openMenuId?.id === client.id}
                                onClick={(e) =>
                                  setOpenMenuId(
                                    openMenuId?.id === client.id
                                      ? null
                                      : { id: client.id, up: shouldFlipUp(e.currentTarget.getBoundingClientRect(), CLIENT_MENU_H) },
                                  )
                                }
                                style={{
                                  border: 'none',
                                  background: openMenuId?.id === client.id ? 'var(--hover-card)' : 'transparent',
                                  color: 'var(--muted)',
                                  cursor: 'pointer',
                                  // Law 15 — the row's overflow menu is a real
                                  // control; 26×26 put it 18px under the floor.
                                  minWidth: 44,
                                  minHeight: 44,
                                  padding: 0,
                                  borderRadius: 'var(--r-xs)',
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                              >
                                <Icon name="more_vert" size={15} />
                              </button>

                              {openMenuId?.id === client.id && (
                                <span
                                  role="menu"
                                  style={{
                                    position: 'absolute',
                                    right: 0,
                                    ...(openMenuId.up ? { bottom: 30 } : { top: 30 }),
                                    zIndex: 30,
                                    minWidth: 208,
                                    padding: 6,
                                    borderRadius: 'var(--r-btn)',
                                    background: 'var(--dropdown)',
                                    border: '1px solid var(--border)',
                                    boxShadow: 'var(--shadow-modal)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    textAlign: 'left',
                                  }}
                                >
                                  {[
                                    {
                                      label: 'Open client profile',
                                      icon: 'users' as const,
                                      run: () => setSelectedClientId(client.id),
                                    },
                                    {
                                      label: 'Start a new rental',
                                      icon: 'plus' as const,
                                      run: () => navigate('/rentals/new'),
                                    },
                                    ...(client.activeBookings[0]
                                      ? [
                                          {
                                            label: `Open ${client.activeBookings[0]}`,
                                            icon: 'external_link' as const,
                                            run: () => navigate(`/rentals/${client.activeBookings[0]}`),
                                          },
                                        ]
                                      : []),
                                    ...(money
                                      ? [
                                          {
                                            label: 'Open payments',
                                            icon: 'card' as const,
                                            run: () => navigate('/finance'),
                                          },
                                        ]
                                      : []),
                                  ].map((item) => (
                                    <button
                                      key={item.label}
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenMenuId(null)
                                        item.run()
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 9,
                                        minHeight: 44,
                                        padding: '0 9px',
                                        borderRadius: 'var(--r-sm)',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text)',
                                        fontSize: 'var(--t-meta)',
                                        fontFamily: 'inherit',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                      }}
                                    >
                                      <Icon name={item.icon} size={14} style={{ color: 'var(--text2)' }} />
                                      <span style={{ flex: 1 }}>{item.label}</span>
                                    </button>
                                  ))}
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-md)',
                padding: '10px 14px',
                flexWrap: 'wrap',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span>
                Page <span className="figure">{current}</span> of <span className="figure">{pageCount}</span>
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                <PageBtn label="‹" disabled={current === 1} onClick={() => setPage(current - 1)} />
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <PageBtn key={p} label={String(p)} active={p === current} onClick={() => setPage(p)} />
                ))}
                <PageBtn label="›" disabled={current === pageCount} onClick={() => setPage(current + 1)} />
              </span>
            </div>
          </Card>

          {/* ── client profile rail ─────────────────────────────────── */}
          {selectedClient && (() => {
            const profileContent = (
            <Card bodyStyle={{ padding: 0 }}>
              <div
                style={{
                  padding: 14,
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--sp-sm)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                      {selectedClient.name}
                    </h3>
                    {selectedClient.isVip && <Tone text="VIP" entity />}
                  </div>
                  <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>
                    {selectedClient.id} · {selectedClient.membership}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close client profile"
                  onClick={() => setSelectedClientId(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    // Law 15 — the rail's only dismiss control.
                    minWidth: 44,
                    minHeight: 44,
                    padding: 0,
                    borderRadius: 'var(--r-xs)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>

              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/*
                  `blockReason` is NEVER set on a directory record, so this
                  banner used to render its title over an empty message.
                  `toClientRecord` deliberately omits the key
                  (lib/queries/clients.ts:280-284) and
                  `__tests__/clientsQuery.test.ts` asserts `'blockReason' in
                  record` is false.

                  The reason is not missing from the DATABASE — `client_flags.reason`
                  is a real nullable text column (0005_clients.sql:231, confirmed
                  on the live schema) — it is missing from THIS READ:
                  `client_directory_v` publishes the `is_blocked` boolean and
                  nothing else about the flag (0054:287-297; the live view has
                  31 columns and no reason among them). So the honest sentence
                  is the one `ClientDetail.tsx` already renders for the same
                  gap (search its "not carried by this view"), reused
                  verbatim rather than reworded into a third variant.
                */}
                {selectedClient.isBlocked && (
                  <ErrorBanner
                    title="Account blocked."
                    message={
                      selectedClient.blockReason ??
                      'The reason is recorded on the flag but is not carried by this view.'
                    }
                  />
                )}

                {/*
                  ── ⛔ ON STOP ────────────────────────────────────────────────
                  Rulings §11.2.3: the reason must name the limb that fired,
                  *"because a client told they are on stop will ask why"*.

                  Law 6 splits the message in two. `reasons` never carries a
                  rupee figure and is shown to every role; `details` carries the
                  amounts and is only populated when `canViewMoney` was true at
                  the point the verdict was computed, so there is no second gate
                  to forget here.

                  It sits ABOVE the money block, not inside it, because being on
                  stop is an operational fact — it stops a booking — while the
                  balances behind it are the money surface Law 6 removes.
                */}
                {(() => {
                  const stop = stopVerdicts.get(selectedClient.id)
                  if (!stop) return null
                  if (stop.onStop) {
                    return (
                      <ErrorBanner
                        /* Stated, not enforced here. Whether a booking may
                           proceed is `modules/rentals/booking/clientHealth.ts`'s
                           question (Law 1 — pages hold no business logic), and
                           promising an enforcement this screen does not perform
                           would be the worse lie. */
                        title="On stop."
                        message={
                          <span>
                            {stop.reasons.map((r) => (
                              <span key={r} style={{ display: 'block' }}>
                                {r}
                              </span>
                            ))}
                            {stop.details.map((d) => (
                              <span key={d} style={{ display: 'block', marginTop: 2, opacity: 0.85 }}>
                                {d}
                              </span>
                            ))}
                            {stop.unavailable.map((u) => (
                              <span key={u} style={{ display: 'block', marginTop: 2, opacity: 0.85 }}>
                                {u}
                              </span>
                            ))}
                          </span>
                        }
                      />
                    )
                  }
                  /* One unavailable limb is enough to say so — see the same
                     note on `ClientDetail`. Gating this on `indeterminate`
                     alone left the rail silent whenever exactly one limb could
                     not run, which reads as "both checks passed". */
                  if (stop.unavailable.length > 0) {
                    return (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 'var(--sp-sm)',
                          padding: '10px 12px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px dashed var(--border)',
                          background: 'var(--card2)',
                          fontSize: 'var(--t-meta)',
                          color: 'var(--text2)',
                        }}
                      >
                        <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                        <span>
                          <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                            {stop.indeterminate
                              ? 'The on-stop check could not run.'
                              : 'Part of the on-stop check could not run.'}
                          </span>
                          {stop.unavailable.map((u) => (
                            <span key={u} style={{ display: 'block', marginTop: 2 }}>
                              {u}
                            </span>
                          ))}
                        </span>
                      </div>
                    )
                  }
                  return null
                })()}

                {/*
                  HIS v2.1 §4.2 — Phone, Email, PAN, Address and the authorised
                  contact sit behind the SAME `pii` gate the table's Contact
                  column and the card view's phone/email block already honour.
                  Absent, not masked, exactly as Law 6 treats money: a Warehouse
                  or Technician session gets no cell to un-hide. This rail was
                  the one surface on the screen still rendering all of it
                  ungated — a money-blind role could not read a balance here but
                  could read a phone number, which is the same class of leak.
                  KYC and Type stay for every role: a status and a category,
                  both already drawn ungated on the table itself.
                */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)', fontSize: 'var(--t-meta)' }}>
                  {pii && (
                    <>
                      <span>
                        <span style={{ color: 'var(--muted)', display: 'block' }}>Phone</span>
                        <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>{selectedClient.phone}</span>
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: 'var(--muted)', display: 'block' }}>Email</span>
                        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{selectedClient.email}</span>
                      </span>
                      <span>
                        <span style={{ color: 'var(--muted)', display: 'block' }}>PAN</span>
                        <span className="figure" style={{ color: 'var(--text)' }}>{selectedClient.pan ?? 'Not on file'}</span>
                      </span>
                    </>
                  )}
                  <span>
                    <span style={{ color: 'var(--muted)', display: 'block' }}>KYC</span>
                    <Tone
                      text={selectedClient.kycStatus}
                      tone={
                        selectedClient.kycStatus === 'Verified'
                          ? 'in'
                          : selectedClient.kycStatus === 'Rejected'
                            ? 'danger'
                            : 'progress'
                      }
                    />
                  </span>
                  <span>
                    <span style={{ color: 'var(--muted)', display: 'block' }}>Type</span>
                    <span style={{ color: 'var(--text)' }}>{selectedClient.clientType}</span>
                  </span>
                  {pii && (
                    <span style={{ minWidth: 0 }}>
                      <span style={{ color: 'var(--muted)', display: 'block' }}>Address</span>
                      <span style={{ color: 'var(--text)' }}>{selectedClient.address}</span>
                    </span>
                  )}
                </div>

                {pii && (
                  <div style={{ fontSize: 'var(--t-meta)' }}>
                    <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Authorized contact</span>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedClient.contactPerson.name}
                    </span>
                    <span style={{ display: 'block', color: 'var(--text2)' }}>
                      {selectedClient.contactPerson.designation} ·{' '}
                      <span className="figure">{selectedClient.contactPerson.phone}</span>
                    </span>
                  </div>
                )}

                {/* §8.3 — credit and lifetime spend are rupee figures, so the whole
                    block is absent for Warehouse rather than blanked out. */}
                {money && (
                  <>
                    {/*
                      ⛔ The "Credit used" METER was removed here on 12 Aug 2026.
                      Law 1 — it was a fabricated financial figure, and it was
                      the dangerous kind: one an operator acts on.

                      It read `selectedClient.creditUsedPaisa`, which
                      `lib/queries/clients.ts:195` sets to a literal `0` on every
                      database-backed record — there is no credit-used column and
                      no ruled formula for one (`ClientDetail.tsx:194` calls it
                      "derived from open bookings, not stored", and nothing
                      derives it). So against a real client the bar rendered
                      "Rs 0 / Rs 5,00,000", a 0%-full track and a healthy blue
                      fill for an account that may be sitting AT its limit, and
                      the 80% danger threshold could never fire. Someone reading
                      "full headroom" approves a rental that should have been
                      refused.

                      `Clients.tsx` (Credit tab: the Utilised KPI, the Used and
                      Headroom columns, the "Near limit" status) and
                      `ClientDetail.tsx` (its own meter and Credit Used row)
                      already dropped this field for exactly this reason; this
                      drawer was the last surface still drawing it, and it was
                      missed because it sits outside `modules/clients/Clients*`.

                      The approved limit IS a real column, so it stays — stated
                      as the fact it is, with no consumption claimed against it.
                    */}
                    <div style={{ padding: '11px 12px', background: 'var(--card2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                        <span style={{ color: 'var(--text2)' }}>Approved credit limit</span>
                        <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(selectedClient.creditLimitPaisa)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', marginTop: 6 }}>
                        <span style={{ color: 'var(--text2)' }}>Outstanding on invoices</span>
                        <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(selectedClient.outstandingPaisa)}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                        How much of the limit is consumed is not recorded — there is no credit-used column, and outstanding
                        invoices are a different question. Neither figure is a headroom.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <span style={{ padding: 10, background: 'var(--card2)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                          {selectedClient.totalRentalsCount}
                        </span>
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Total rentals</span>
                      </span>
                      <span style={{ padding: 10, background: 'var(--card2)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                          {formatMoney(selectedClient.totalSpentPaisa)}
                        </span>
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Lifetime spend</span>
                      </span>
                    </div>
                  </>
                )}

                {!money && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    <span style={{ padding: 10, background: 'var(--card2)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                        {selectedClient.totalRentalsCount}
                      </span>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Total rentals</span>
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {/* Was `${blockReason ?? 'account under review'}` — a reason
                      nobody recorded, presented as the one that was. The field
                      is always absent here (see the banner above), so that
                      fallback was the ONLY string this tooltip ever showed.
                      Same shape as `ClientDetail`'s own blocked notice: name the reason
                      when it is carried, say nothing when it is not. */}
                  {selectedClient.isBlocked ? (
                    <Unavailable
                      reason={`Blocked${
                        selectedClient.blockReason ? `: ${selectedClient.blockReason}` : ''
                      } — clear the block before starting a rental`}
                    >
                      <Button variant="primary" disabled>
                        Start rental
                      </Button>
                    </Unavailable>
                  ) : (
                    <Button variant="primary" icon="plus" onClick={() => navigate('/rentals/new')}>
                      Start rental
                    </Button>
                  )}
                  {money ? (
                    <Button icon="card" onClick={() => navigate('/finance')}>
                      Ledger
                    </Button>
                  ) : (
                    <Unavailable reason="The client ledger is a money surface — not available to this role">
                      <Button icon="card" disabled>
                        Ledger
                      </Button>
                    </Unavailable>
                  )}
                  <Button icon="external_link" onClick={() => navigate(`/clients/${selectedClient.id}`)}>
                    View Full Profile
                  </Button>
                  {/* One client, both directions. Law 3: unblocking must be
                      possible, and this surface has always had it. `ClientDetail`
                      now has it too — CL-06, in this same change, replaced the
                      `Unavailable` reason that claimed `client.block` was unruled
                      with a real dispatch gated on `canBlockClient`. Both
                      surfaces write through `actions/clients/blockClient`. */}
                  {!mayBlock ? (
                    /* Greyed with the rule stated, matching the Ledger control
                       three lines up — the rail already carries `Unavailable`
                       refusals, so here the verb stays discoverable, exactly as
                       `ClientDetail` now does it. */
                    <Unavailable reason="Blocking a client is an Owner, Admin or Manager action (client.block)">
                      <Button icon="alert_triangle" disabled>
                        Block Client
                      </Button>
                    </Unavailable>
                  ) : selectedClient.isBlocked ? (
                    <Button icon="checklist" onClick={() => openBlockDialog('unblock', [selectedClient])}>
                      Unblock Client
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      icon="alert_triangle"
                      onClick={() => openBlockDialog('block', [selectedClient])}
                    >
                      Block Client
                    </Button>
                  )}
                </div>
              </div>
            </Card>
            )
            /* Rulings §7 again — the profile rail is beside the list at
               desktop and inline beneath it below 1280, never behind the
               collapse handle. */
            return desktop ? <Rail width={330} label="Client profile">{profileContent}</Rail> : profileContent
          })()}
        </div>
      </div>

      <Modal
        isOpen={showBulkBlock}
        onClose={() => setShowBulkBlock(false)}
        title={
          blockMode === 'block'
            ? `Block ${blockTargets.length} client${blockTargets.length === 1 ? '' : 's'}?`
            : `Lift the block on ${blockTargets.length} client${blockTargets.length === 1 ? '' : 's'}?`
        }
        subtitle={
          blockMode === 'block'
            ? 'Start Rental is refused on the client’s profile and in this directory while the block stands. Existing bookings, invoices and history are untouched. State a reason; it is kept on the block.'
            : 'The block is lifted, not deleted: the record of who applied it, why, and who lifted it is kept.'
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowBulkBlock(false)} disabled={blockBusy}>
              Cancel
            </Button>
            <Button
              variant={blockMode === 'block' ? 'danger' : 'primary'}
              onClick={confirmBlockChange}
              disabled={blockBusy || (blockMode === 'block' && bulkBlockReason.trim().length < 10)}
            >
              {blockBusy
                ? 'Saving…'
                : blockMode === 'block'
                  ? `Block ${blockTargets.length} Client${blockTargets.length === 1 ? '' : 's'}`
                  : `Unblock ${blockTargets.length} Client${blockTargets.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {/* Law 12 — the failure stays on screen, beside the button that caused
              it, and names every client it applies to. `white-space: pre-line`
              keeps the one-per-line list the handler builds. */}
          {blockError && (
            <ErrorBanner
              title={blockMode === 'block' ? 'Some clients were not blocked' : 'Some blocks were not lifted'}
              message={<span style={{ whiteSpace: 'pre-line' }}>{blockError}</span>}
            />
          )}
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-meta)', color: 'var(--text2)', maxHeight: 140, overflowY: 'auto' }}>
            {blockTargets.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text2)' }}>
              {blockMode === 'block' ? 'Reason (minimum 10 characters)' : 'Reason for lifting it (optional)'}
            </span>
            <textarea
              value={bulkBlockReason}
              onChange={(e) => setBulkBlockReason(e.target.value)}
              rows={3}
              placeholder={
                blockMode === 'block'
                  ? 'e.g. Duplicate accounts consolidated, blocking the closed ones'
                  : 'e.g. Outstanding balance settled in full on 2026-08-12'
              }
              style={{
                padding: 10,
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

function PageBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      style={{
        // Law 15 — pagination is a real target on the tablet this product
        // runs on; 26×26 was 18px under the floor.
        minWidth: 44,
        minHeight: 44,
        padding: '0 6px',
        borderRadius: 7,
        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
        background: active ? 'var(--btn-primary-bg)' : 'transparent',
        color: active ? 'var(--btn-primary-fg)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: active ? 700 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}
