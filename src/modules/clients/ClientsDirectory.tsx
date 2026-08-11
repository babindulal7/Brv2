import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, KpiStrip, cardStyle, Rail, SideRail } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { STATUS } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useTabularLayout } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewPII } from '../../lib/fieldGating'
import { shouldFlipUp } from '../../lib/menuFlip'
import { IntelCard } from '../../components/ui/IntelCard'
import { clientGlance, clientDetailGroups } from '../../data/clientIntel'
import {
  TIER_TONE,
  clientMetrics,
  clientFilterGroupsFor,
  CLIENT_ROWS_PER_PAGE,
  type ClientRecord,
} from '../../data/clients'

/* ── filters ───────────────────────────────────────────────────────────── */

type FilterKey = 'all' | 'onRent' | 'paymentDue' | 'blocked' | 'vip' | 'typeOrg' | 'typeInd' | 'typeUnassigned'
type ViewKey = 'Table' | 'Cards'
type SortKey = 'name' | 'type' | 'membership' | 'rentals' | 'outstanding' | 'deposit' | 'lastRental'
type Density = 'comfortable' | 'compact'

interface SavedView {
  label: string
  filter: FilterKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
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
  { label: 'On Rent', filter: 'onRent', sort: { key: 'rentals', dir: 'desc' } },
  { label: 'Recently Added', filter: 'all', sort: { key: 'lastRental', dir: 'desc' } },
  { label: 'Blocked Clients', filter: 'blocked', sort: { key: 'name', dir: 'asc' } },
]

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

function Tone({ text, tone }: { text: string; tone: keyof typeof STATUS }) {
  const c = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
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
  onBulkBlock,
}: {
  clients: ClientRecord[]
  onRequestAdd: () => void
  onBulkBlock: (ids: string[], reason: string) => void
}) {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
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
     on capability, not platform). */
  const tabular = useTabularLayout()

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
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
  const td = tdFor(density)

  const metrics = useMemo(() => clientMetrics(clients), [clients])
  const filterGroups = useMemo(() => clientFilterGroupsFor(money), [money])

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

      if (activeFilter === 'onRent') return client.currentRentalsCount > 0
      if (activeFilter === 'paymentDue') return client.outstandingPaisa > 0
      if (activeFilter === 'blocked') return Boolean(client.isBlocked)
      if (activeFilter === 'vip') return Boolean(client.isVip)
      if (activeFilter === 'typeOrg') return client.clientType === 'Organisation'
      if (activeFilter === 'typeInd') return client.clientType === 'Individual'
      if (activeFilter === 'typeUnassigned') return client.clientType === 'Unassigned'
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
  }, [clients, searchQuery, activeFilter, sort])

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

  const applyFilter = (f: FilterKey) => {
    setActiveFilter(f)
    setActiveSavedView(null)
    resetPage()
  }

  const clearAll = () => {
    setActiveFilter('all')
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

  const confirmBulkBlock = () => {
    if (bulkBlockReason.trim().length < 10) return
    const blockedCount = selectedClients.length
    onBulkBlock(selectedClients.map((c) => c.id), bulkBlockReason.trim())
    setSelectedRowIds(new Set())
    setShowBulkBlock(false)
    setBulkBlockReason('')
    showSuccessToast('Clients blocked', `${blockedCount} client${blockedCount === 1 ? '' : 's'} blocked`)
  }

  /**
   * The row's one primary verb. Receive Payment only exists for a role that may
   * see the balance in the first place — offering it to Warehouse would name a
   * figure that role is not allowed to know.
   */
  const primaryAction = (client: ClientRecord) => {
    if (client.isBlocked) {
      return { label: 'Review Block', variant: 'secondary' as const, run: () => setSelectedClientId(client.id) }
    }
    if (money && client.outstandingPaisa > 0) {
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

  const chips: Array<{ label: string; key: FilterKey; count: number }> = [
    { label: 'All', key: 'all', count: metrics.total },
    { label: 'Organisation', key: 'typeOrg', count: metrics.typeOrg },
    { label: 'Individual', key: 'typeInd', count: metrics.typeInd },
    { label: 'Unassigned', key: 'typeUnassigned', count: metrics.typeUnassigned },
    { label: 'On Rent', key: 'onRent', count: metrics.onRent },
    ...(money ? [{ label: 'Payment Due', key: 'paymentDue' as FilterKey, count: metrics.paymentDue }] : []),
    { label: 'Blocked', key: 'blocked', count: metrics.blocked },
    { label: 'VIP', key: 'vip', count: metrics.vip },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={kpis.length} />

      {/* ── quick filters + view switch ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
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
                height: 32,
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

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
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
                height: 34,
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

          <Unavailable reason="Advanced client filters are not built yet — the chips, search and column sort on this screen are the ones that exist">
            <Button icon="tool" disabled>
              More Filters
            </Button>
          </Unavailable>
        </span>
      </div>

      {/* ── filter rail + list ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: tabular ? 'auto minmax(0,1fr)' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {tabular && (
        <SideRail width={210} label="Filters">
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
            {/* Nine dead filter rows (one per `filterGroups` entry) duplicated the
                header's disabled "More Filters" button for a wall of chrome that
                did nothing nine times over. Collapsed to the one row that pattern
                needs — same `Unavailable` reason-on-long-press/hover it always had. */}
            <Unavailable
              reason={`Advanced filters (${filterGroups.map((g) => g.label).join(', ')}) are not built yet — use the chips, search or a saved view`}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  height: 34,
                  padding: '0 8px',
                  borderRadius: 'var(--r-sm)',
                  color: 'var(--muted)',
                  fontSize: 'var(--t-meta)',
                  cursor: 'not-allowed',
                }}
              >
                <Icon name="tool" size={15} style={{ color: 'var(--disabled)', flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Advanced filters — coming soon</span>
              </span>
            </Unavailable>
          </Card>

          <Card title="Saved Views" bodyStyle={{ padding: 'var(--sp-sm)' }}>
            {SAVED_VIEWS.filter((v) => money || !v.money).map((v) => {
              const on = activeSavedView === v.label
              return (
                <button
                  key={v.label}
                  type="button"
                  onClick={() => {
                    setActiveFilter(v.filter)
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
                    height: 32,
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
        </SideRail>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: tabular && selectedClient ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
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
                  <Button variant="danger" icon="alert_triangle" onClick={() => setShowBulkBlock(true)}>
                    Block Selected
                  </Button>
                </>
              )}
              <button
                type="button"
                onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                aria-pressed={density === 'compact'}
                title={density === 'compact' ? 'Compact rows — click for comfortable' : 'Comfortable rows — click for compact'}
                style={{
                  marginLeft: 'auto',
                  width: 32,
                  height: 32,
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
                    height: 26,
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
                        {client.isVip && <Tone text="VIP" tone="progress" />}
                        {client.isBlocked && <Tone text="Blocked" tone="danger" />}
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: money ? 1180 : 900 }}>
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
                      {pii && <SortHeader label="Contact" sort={sort} onSort={applySortKey} />}
                      <SortHeader label="Type" sortKey="type" sort={sort} onSort={applySortKey} />
                      <SortHeader label="Membership" sortKey="membership" sort={sort} onSort={applySortKey} />
                      <SortHeader label="Current Rentals" sortKey="rentals" sort={sort} onSort={applySortKey} />
                      {money && <SortHeader label="Outstanding" sortKey="outstanding" sort={sort} onSort={applySortKey} />}
                      {money && <SortHeader label="Deposit Held" sortKey="deposit" sort={sort} onSort={applySortKey} />}
                      <SortHeader label="Last Rental (BS / AD)" sortKey="lastRental" sort={sort} onSort={applySortKey} />
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

                          {pii && (
                            <td style={td}>
                              <span className="figure" style={{ display: 'block', color: 'var(--text)' }}>
                                {client.phone}
                              </span>
                              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                {client.email}
                              </span>
                            </td>
                          )}

                          <td style={{ ...td, color: 'var(--text2)' }}>{client.clientType}</td>

                          <td style={td}>
                            <Tone text={client.membership} tone={TIER_TONE[client.membership]} />
                          </td>

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

                          {money && (
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
                                  width: 26,
                                  height: 26,
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
                                        height: 32,
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
          {selectedClient && (
            <Rail width={330} label="Client profile">
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
                    width: 26,
                    height: 26,
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
                    <div style={{ padding: '11px 12px', background: 'var(--card2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', marginBottom: 6 }}>
                        <span style={{ color: 'var(--text2)' }}>Credit used</span>
                        <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(selectedClient.creditUsedPaisa)} / {formatMoney(selectedClient.creditLimitPaisa)}
                        </span>
                      </div>
                      <span
                        aria-hidden
                        style={{ display: 'block', width: '100%', height: 6, borderRadius: 'var(--r-badge)', background: 'var(--border)', overflow: 'hidden' }}
                      >
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${
                              selectedClient.creditLimitPaisa > 0
                                ? Math.min(100, Math.round((selectedClient.creditUsedPaisa / selectedClient.creditLimitPaisa) * 100))
                                : 0
                            }%`,
                            background:
                              selectedClient.creditUsedPaisa > selectedClient.creditLimitPaisa * 0.8
                                ? 'var(--danger)'
                                : 'var(--primary)',
                          }}
                        />
                      </span>
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
                </div>
              </div>
            </Card>
            </Rail>
          )}
        </div>
      </div>

      <Modal
        isOpen={showBulkBlock}
        onClose={() => setShowBulkBlock(false)}
        title={`Block ${selectedClients.length} client${selectedClients.length === 1 ? '' : 's'}?`}
        subtitle="Blocked clients cannot start a new rental until unblocked. State a reason — it appears on each profile."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowBulkBlock(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmBulkBlock} disabled={bulkBlockReason.trim().length < 10}>
              Block {selectedClients.length} Client{selectedClients.length === 1 ? '' : 's'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-meta)', color: 'var(--text2)', maxHeight: 140, overflowY: 'auto' }}>
            {selectedClients.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Reason (minimum 10 characters)</span>
            <textarea
              value={bulkBlockReason}
              onChange={(e) => setBulkBlockReason(e.target.value)}
              rows={3}
              placeholder="e.g. Duplicate accounts consolidated, blocking the closed ones"
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
        minWidth: 26,
        height: 26,
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
