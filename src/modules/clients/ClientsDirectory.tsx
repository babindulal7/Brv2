import { Fragment, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, KpiStrip, cardStyle, Rail, SideRail } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { PageBody } from '../../components/ui/PageBody'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { STATUS, STATUS_ICON } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { canRecordPayment } from '../../lib/rbac'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import type { ActionContext } from '../../actions/core'
import { gateContext, canViewPII } from '../../lib/fieldGating'
import { shouldFlipUp } from '../../lib/menuFlip'
import { IntelCard } from '../../components/ui/IntelCard'
import { clientGlance, clientDetailGroups } from '../../data/clientIntel'
import {
  TIER_TONE,
  clientMetrics,
  CLIENT_ROWS_PER_PAGE,
  creditStopFactsOf,
  evaluateCreditStop,
  readOverdueStopDays,
  type ClientRecord,
  type ClientType,
  type CreditStopVerdict,
} from '../../data/clients'

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
 * There is no `(Active)` chip, and inventing one would be worse than the
 * omission: `ClientRecord` carries no deactivation field at all
 * (`deactivatedAtAd` lives on `ClientProfile`, which the directory never
 * fetches), so an Active chip would select exactly what `All` already selects
 * and lie about doing something. Reported rather than faked.
 */
type StatusKey = 'onRent' | 'paymentDue' | 'vip'

/**
 * The filter rail's two facet families. Within a family the ticks OR (Organisation
 * or Individual); across families they AND (Organisation that is On Rent). An
 * empty family filters nothing — no ticks means every type, every status.
 */
interface Facets {
  types: ClientType[]
  statuses: StatusKey[]
}

const NO_FACETS: Facets = { types: [], statuses: [] }

const STATUS_MATCH: Record<StatusKey, (c: ClientRecord) => boolean> = {
  onRent: (c) => c.currentRentalsCount > 0,
  paymentDue: (c) => c.outstandingPaisa > 0,
  vip: (c) => Boolean(c.isVip),
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
  /** The facet ticks the view restores. Absent means "clear both families". */
  facets?: Partial<Facets>
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
  { label: 'VIP Clients', facets: { statuses: ['vip'] }, sort: { key: 'name', dir: 'asc' } },
  { label: 'Payment Due', facets: { statuses: ['paymentDue'] }, sort: { key: 'outstanding', dir: 'desc' }, money: true },
  { label: 'On Rent', facets: { statuses: ['onRent'] }, sort: { key: 'rentals', dir: 'desc' } },
  { label: 'Recently Added', sort: { key: 'lastRental', dir: 'desc' } },
  /* Now an OVERLAY over every client, not a status that excludes the rest. */
  { label: 'Blocked Clients', sort: { key: 'name', dir: 'asc' }, overlays: { blocked: true } },
]

type RailSection = 'type' | 'status' | 'flags' | 'views'

/** One collapsible group of the filter rail. The whole header row is the toggle. */
function FilterSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const bodyId = useId()
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minHeight: 44,
          padding: '0 14px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 'var(--t-ui)',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1 }}>{title}</span>
        <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} style={{ color: 'var(--muted)' }} />
      </button>
      {open && (
        <div id={bodyId} style={{ display: 'flex', flexDirection: 'column', padding: '0 8px 10px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/** A ticked filter row: box · label · count. Law 15 — the whole row is a 44px target. */
function CheckRow({
  label,
  count,
  checked,
  onChange,
  unavailableNote,
}: {
  label: string
  count: number
  checked: boolean
  onChange: () => void
  /** Present when the condition cannot be evaluated — the row goes inert and says so. */
  unavailableNote?: string
}) {
  const disabled = unavailableNote !== undefined
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        padding: '0 6px',
        borderRadius: 'var(--r-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        fontSize: 'var(--t-meta)',
        fontWeight: checked ? 600 : 500,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ width: 18, height: 18, margin: 0, flexShrink: 0, accentColor: 'var(--nav-active-accent)', cursor: 'inherit' }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {disabled ? (
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600 }}>{unavailableNote}</span>
      ) : (
        <span className="figure" style={{ color: 'var(--muted)' }}>
          ({count})
        </span>
      )}
    </label>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
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
    <th style={{ ...th, textAlign: align ?? 'left' }}>
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
          fontSize: 'var(--t-th)',
          fontWeight: 600,
          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
          cursor: 'pointer',
        }}
      >
        {label}
        <Icon
          name={on && sort.dir === 'asc' ? 'arrow_up' : 'arrow_down'}
          size={11}
          style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }}
        />
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
}: {
  text: string
  tone: keyof typeof STATUS
  icon?: IconName
  /**
   * Why this chip is on the row. Rulings §11.2.3 — *"a client told they are on
   * stop will ask why"* — so the On Stop chip carries its firing limb here
   * rather than making the operator open the profile to find out. It becomes
   * both the accessible name and the hover text, so the reason is not
   * hover-only.
   */
  reason?: string
}) {
  const c = STATUS[tone]
  const glyph = (icon ?? STATUS_ICON[tone]) as IconName
  return (
    <span
      {...(reason ? { title: reason, 'aria-label': `${text} — ${reason}` } : {})}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 19,
        padding: '0 7px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        border: c.border ? `1px solid ${c.border}` : undefined,
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={glyph} size={10} />
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
}) {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
  const online = useNetwork()
  // `gateContext` builds a fresh object every call — memoized on the one
  // primitive it actually derives from so `pageRowsWithIntel` below (and any
  // other memo keyed on `gctx`) doesn't invalidate on every unrelated render.
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  // HIS v2.1 §4.2 — phone/email were rendering unconditionally for every role
  // before this; gated here the same way `money` already gates Outstanding/
  // Deposit, so a Warehouse or Technician session never receives the column.
  const pii = canViewPII(gctx)
  const { showSuccessToast } = useToast()
  const [params] = useSearchParams()
  /* DEVICES.md §7 build order item 1 — below 768 the table can't be read even
     scrolled, so the phone gets the card view unconditionally (Law 13: branch
     on capability, not platform).
     Spec 8.1 draws THREE layouts, not two, so this reads the band rather than
     the phone-vs-not boolean it used to: `tabular` still decides table-vs-cards
     at 768, and `desktop` decides whether the two rails sit beside the list or
     reflow beneath it. Rulings §7 — "collapse below 1180" is *reflow*, not
     *hide*, so at tablet the Filters/Saved Views and Client-profile content
     renders inline rather than going into `CollapsibleAside`'s handle. */
  const viewport = useViewport()
  const tabular = viewport !== 'phone'
  const desktop = viewport === 'desktop'
  /** Tablet keeps the table but not nine columns of it — see the `<table>` below. */
  const narrow = viewport === 'tablet'

  const [facets, setFacets] = useState<Facets>(NO_FACETS)
  /** Open on desktop, where the rail has the room; closed below it, where the panel reflows above the list. */
  const [openSections, setOpenSections] = useState<Record<RailSection, boolean>>(() => ({
    type: desktop,
    status: desktop,
    flags: desktop,
    views: desktop,
  }))
  /** Rulings §11.2.4 — Blocked and On Stop intersect the selection, never replace it. */
  const [overlays, setOverlays] = useState<Overlays>(NO_OVERLAYS)
  /**
   * `?q=` lets another surface hand this table a client — the Membership tab's
   * row action uses it, so "find this member in the directory" lands on the
   * member rather than on an unfiltered list.
   */
  const [searchQuery, setSearchQuery] = useState(() => params.get('q') ?? '')
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

  const filteredClients = useMemo(() => {
    const rows = clients.filter((client) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matches =
          client.name.toLowerCase().includes(q) ||
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

      if (facets.types.length > 0 && !facets.types.includes(client.clientType)) return false
      if (facets.statuses.length > 0 && !facets.statuses.some((s) => STATUS_MATCH[s](client))) return false
      return true
    })

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
          // BS renders as YYYY/MM/DD, so lexical order is chronological.
          return c.lastRentalBs === '—' ? '' : c.lastRentalBs
        default:
          return c.name
      }
    }

    return [...rows].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [clients, searchQuery, facets, overlays, stopVerdicts, sort])

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

  const toggleFacet = <K extends keyof Facets>(family: K, value: Facets[K][number]) => {
    setFacets((prev) => {
      const list = prev[family] as Array<Facets[K][number]>
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      return { ...prev, [family]: next }
    })
    setActiveSavedView(null)
    resetPage()
  }

  const toggleSection = (s: RailSection) => setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }))

  const toggleOverlay = (which: keyof Overlays) => {
    setOverlays((prev) => ({ ...prev, [which]: !prev[which] }))
    setActiveSavedView(null)
    resetPage()
  }

  const clearAll = () => {
    setFacets(NO_FACETS)
    setOverlays(NO_OVERLAYS)
    setSearchQuery('')
    setSort({ key: 'name', dir: 'asc' })
    setActiveSavedView(null)
    resetPage()
  }

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
    const headers = [
      'Client ID',
      'Name',
      'Company',
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
        c.company ?? '',
        c.clientType,
        c.membership,
        c.phone,
        c.email,
        c.pan ?? '',
        ...(money ? [formatMoney(c.outstandingPaisa), formatMoney(c.depositHeldPaisa)] : []),
        c.isBlocked ? 'Blocked' : 'Active',
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
    {
      label: 'On Rent',
      value: String(metrics.onRent),
      icon: 'checklist',
      accent: 'success',
      note: 'Clients with active rentals',
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
   * The rail's facet rows. Counts are over the whole directory, not over the
   * current selection — a count says how many clients carry the condition, so
   * it stays put while you tick.
   */
  const typeRows: Array<{ label: string; value: ClientType; count: number }> = [
    { label: 'Organisation', value: 'Organisation', count: metrics.typeOrg },
    { label: 'Individual', value: 'Individual', count: metrics.typeInd },
    { label: 'Unassigned', value: 'Unassigned', count: metrics.typeUnassigned },
  ]

  const statusRows: Array<{ label: string; value: StatusKey; count: number }> = [
    { label: 'On Rent', value: 'onRent', count: metrics.onRent },
    /* §8.3 — who owes us money is money: omitted for money-blind roles, not blanked. */
    ...(money ? [{ label: 'Payment Due', value: 'paymentDue' as StatusKey, count: metrics.paymentDue }] : []),
    { label: 'VIP', value: 'vip', count: metrics.vip },
  ]

  /**
   * Rulings §11.2.4 — the INTERSECTING overlays. Each narrows whatever else is
   * ticked, never replaces it, and both can be on at once.
   */
  const overlayRows: Array<{ label: string; key: keyof Overlays; count: number; unavailable?: string }> = [
    { label: 'Blocked', key: 'blocked', count: metrics.blocked },
    {
      label: 'On Stop',
      key: 'onStop',
      count: onStopCount,
      ...(stopCheckRan ? {} : { unavailable: stopUnavailableReason }),
    },
  ]

  const activeFilterCount =
    facets.types.length + facets.statuses.length + (overlays.blocked ? 1 : 0) + (overlays.onStop ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={kpis.length} />

      {/* ── search + view switch — every filter lives in the rail below ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            <Icon name="search" size={15} style={{ color: 'var(--muted)', position: 'absolute', left: 9 }} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                resetPage()
              }}
              placeholder="Search client, phone, email, company, PAN…"
              aria-label="Search clients"
              style={{
                width: 280,
                minHeight: 44,
                padding: '0 10px 0 29px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
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
      </div>

      {/* ── filter rail + list ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'auto minmax(0,1fr)' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/*
          Rulings §7 — below 1180 this content REFLOWS, it does not hide. At
          desktop the panel sits in `SideRail` (`CollapsibleAside`, a 44px
          handle at tablet/phone); below that it renders as a plain block that
          `order: -1` lifts above the list, sections closed, so the filters are
          the first thing on the warehouse tablet and on a phone rather than
          something found after scrolling past every row.
        */}
        <div style={desktop ? undefined : { order: -1 }}>
          {(() => {
            const panel = (
              <section
                aria-label="Filters"
                style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minHeight: 48, padding: '0 14px' }}>
                  <h2 style={{ flex: 1, margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="figure" style={{ marginLeft: 6, color: 'var(--nav-active-accent)' }}>
                        · {activeFilterCount}
                      </span>
                    )}
                  </h2>
                  {(activeFilterCount > 0 || activeSavedView !== null) && (
                    <button
                      type="button"
                      onClick={clearAll}
                      style={{
                        minHeight: 44,
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
                  )}
                </div>

                <FilterSection title="Client type" open={openSections.type} onToggle={() => toggleSection('type')}>
                  {typeRows.map((r) => (
                    <CheckRow
                      key={r.value}
                      label={r.label}
                      count={r.count}
                      checked={facets.types.includes(r.value)}
                      onChange={() => toggleFacet('types', r.value)}
                    />
                  ))}
                </FilterSection>

                <FilterSection title="Status" open={openSections.status} onToggle={() => toggleSection('status')}>
                  {statusRows.map((r) => (
                    <CheckRow
                      key={r.value}
                      label={r.label}
                      count={r.count}
                      checked={facets.statuses.includes(r.value)}
                      onChange={() => toggleFacet('statuses', r.value)}
                    />
                  ))}
                </FilterSection>

                <FilterSection title="Flags" open={openSections.flags} onToggle={() => toggleSection('flags')}>
                  {overlayRows.map((r) => {
                    const row = (
                      <CheckRow
                        label={r.label}
                        count={r.count}
                        checked={overlays[r.key]}
                        onChange={() => toggleOverlay(r.key)}
                        {...(r.unavailable ? { unavailableNote: 'check unavailable' } : {})}
                      />
                    )
                    /* §11.2.7 — a limb that cannot be evaluated says the check did
                       not run; it is not silently omitted (read as "nobody is on
                       stop") and does not filter to an empty list. */
                    return r.unavailable ? (
                      <Unavailable key={r.key} reason={r.unavailable}>
                        {row}
                      </Unavailable>
                    ) : (
                      <Fragment key={r.key}>{row}</Fragment>
                    )
                  })}
                </FilterSection>

                <FilterSection title="Saved views" open={openSections.views} onToggle={() => toggleSection('views')}>
                  {SAVED_VIEWS.filter((v) => money || !v.money).map((v) => {
                    const on = activeSavedView === v.label
                    return (
                      <button
                        key={v.label}
                        type="button"
                        onClick={() => {
                          setFacets({ ...NO_FACETS, ...v.facets })
                          /* A saved view restores the WHOLE state, overlays included —
                             otherwise "Blocked Clients" would leave a stale On Stop
                             overlay on and show a different list each time. */
                          setOverlays({ ...NO_OVERLAYS, ...v.overlays })
                          setSort(v.sort)
                          setActiveSavedView(v.label)
                          resetPage()
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
                </FilterSection>
              </section>
            )
            return desktop ? (
              <SideRail width={240} label="Filters">
                {panel}
              </SideRail>
            ) : (
              panel
            )
          })()}
        </div>

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
                  {selectedClients.some((c) => !c.isBlocked) && (
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
                  {selectedClients.some((c) => c.isBlocked) && (
                    <Button
                      icon="checklist"
                      onClick={() => openBlockDialog('unblock', selectedClients.filter((c) => c.isBlocked))}
                    >
                      Unblock Selected
                    </Button>
                  )}
                </>
              )}
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

            <PageBody
              empty={filteredClients.length === 0}
              emptyIsFiltered={!emptyBecauseNoClients}
              emptyTitle={emptyBecauseNoClients ? 'No clients yet' : 'No clients found'}
              emptyMessage={
                emptyBecauseNoClients
                  ? 'The directory is empty. Register the first client to start booking.'
                  : searchQuery
                    ? `No client matches "${searchQuery}" under the current filter.`
                    : 'No client matches the selected filter.'
              }
              {...(emptyBecauseNoClients
                ? {
                    emptyActionLabel: 'Register a client',
                    onEmptyAction: onRequestAdd,
                  }
                : {
                    onClearFilters: clearAll,
                  })}
              noun="clients"
            >
              {!tabular || view === 'Cards' ? (
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
                        {client.isVip && <Tone text="VIP" tone="progress" />}
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
                          on rent
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
                      {!narrow && <SortHeader label="Current Rentals" sortKey="rentals" sort={sort} onSort={applySortKey} />}
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
                                    width: 32,
                                    height: 32,
                                    borderRadius: 'var(--r-sm)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: STATUS[TIER_TONE[client.membership]].bg,
                                    color: STATUS[TIER_TONE[client.membership]].fg,
                                    fontSize: 'var(--t-th)',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  {client.name.slice(0, 2).toUpperCase()}
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{client.name}</span>
                                    {client.isVip && <Tone text="VIP" tone="progress" />}
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
                                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 1 }}>
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
                                {client.currentRentalsCount} on rent
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
                                <span className="figure" style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                                  {client.lastRentalBs} BS
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
            </PageBody>

            {filteredClients.length > 0 && (
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
            )}
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
                    {selectedClient.isVip && <Tone text="VIP" tone="progress" />}
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
                {selectedClient.isBlocked && (
                  <ErrorBanner title="Account blocked." message={selectedClient.blockReason} />
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)', fontSize: 'var(--t-meta)' }}>
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
                  <span style={{ minWidth: 0 }}>
                    <span style={{ color: 'var(--muted)', display: 'block' }}>Address</span>
                    <span style={{ color: 'var(--text)' }}>{selectedClient.address}</span>
                  </span>
                </div>

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
                  {selectedClient.isBlocked ? (
                    <Unavailable reason={`Blocked: ${selectedClient.blockReason ?? 'account under review'} — clear the block before starting a rental`}>
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
                      possible, and this is the surface that has it — the Block
                      control on `ClientDetail` is still disabled behind an
                      `Unavailable` reason that this change makes stale (reported). */}
                  {selectedClient.isBlocked ? (
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
               desktop and inline beneath it below 1180, never behind the
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
            ? 'A blocked client cannot start a new rental — the database refuses it, for every role including Owner. Existing bookings, invoices and history are untouched. State a reason; it is kept on the block.'
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
