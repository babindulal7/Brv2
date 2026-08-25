import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Input, Select } from '../../components/ui'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { Donut, Legend, HBars, GroupedBars } from '../../components/ui/Charts'
import WarehouseMap from '../../components/ui/WarehouseMap'
import type { Slice } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_ON } from '../../lib/status'
import type { BrandKey, StatusKey } from '../../lib/status'
import { grouped } from '../../lib/money'
import { getBusinessToday, toBs, formatBs, formatAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import { gateContext } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import { rackGlance, rackDetailGroups } from '../../data/rackIntel'
import {
  WAREHOUSES,
  STORAGE_LOCATIONS,
  TRANSFERS,
  EQUIPMENT_DISTRIBUTION,
  WAREHOUSE_STATUS_TONE,
  WAREHOUSE_STATUS_ICON,
  TRANSFER_STATUS_TONE,
  TRANSFER_STATUS_ICON,
  TRANSFER_FLOW,
  TRANSFER_TERMINAL,
  SEED_ERRORS,
  CAPACITY_ALERT_PCT,
  totalsOf,
  usedOf,
  pct,
  zonesOf,
  staffOf,
  transfersOf,
  alertsOf,
  warehousesForAlert,
  recentActivity,
  transferActivity,
  insightsOf,
} from '../../data/warehouse'
import type {
  Warehouse,
  StockTransfer,
  TransferType,
  AlertKey,
} from '../../data/warehouse'
import type { ActionContext } from '../../actions/core'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * **Inventory ▸ Warehouse Management** — built against
 * `06 Inventory/Warehouse.PNG` and its spec `Warehouse.md` v3.0 (Build Locked).
 *
 * Composition follows the render: six KPI cards, the four facility cards, the
 * Warehouse List table, a four-card analytics row, and the right intelligence
 * rail (Summary · Alerts · Quick Actions · Recent Activity · Insights). The
 * warehouse profile the spec details sits below the analytics row, because the
 * render's "View Warehouse →" and the row action need somewhere real to land.
 *
 * The render stands each of those three strips in **one row**, and the grid
 * bases here are sized to that: with the rail open this column measures 958px
 * at the render's own 1536 width, so the KPI basis is 132 and the facility and
 * analytics bases are 228. The earlier 140/264 pair wrapped both card rows 3+1
 * at the render's own width. The card internals were tightened to survive the
 * narrower cell — 80px photo, wrapping name/pill row, 54px ring.
 *
 * **Deviations from the render — each one a locked rule, never copy back:**
 *  · The render's KPI tiles are purple and teal. §4.2 bans both; the tiles wear
 *    blue / amber / green from `BRAND`.
 *  · Every KPI, rail row and chart is **computed from `data/warehouse`**, so the
 *    set reads 81% capacity used, not the render's 82% — the render's figure
 *    does not divide into its own table.
 *  · "AI Warehouse Insights" is titled **Warehouse Insights**: the lines are
 *    rules over the seeded rows, and labelling deterministic arithmetic as a
 *    model output would be a false claim.
 *  · The render's fourth analytics card is an accuracy *trend*. No time series
 *    of verifications exists in this build, and seeding one would be inventing
 *    figures, so the card states current accuracy per warehouse instead.
 *  · Three of the render's five alert rows ("Low stock items", "Maintenance
 *    due", "Audit due in 10 days") count records this module does not hold. They
 *    are absent rather than guessed — see `alertsOf`.
 *  · The render's Capacity Utilization legend carries a third "Reserved" slice.
 *    Reserved slots are not a field on a warehouse record, so the donut is
 *    Used / Available only — see the Capacity tab's TODO(decision).
 *  · The render's rail cards each carry a "View All →" and the summary card a
 *    "This Month" period picker. Neither has a destination or a second period in
 *    this build, and §Law "no dead controls" outranks the render, so they are
 *    absent rather than inert.
 *  · The Transfer Center's step buttons — Approve / Start Packing / Dispatch /
 *    Mark Received / Reconcile & Complete, and Cancel beside them — are
 *    disabled with a stated reason. No stock-transfer state-change action
 *    exists in this build, and a card that says "Received 18:00" when nothing
 *    was written leaves two warehouses disagreeing about where the gear is.
 *    See the note where `advance()` used to be.
 *
 * **Profile tabs** — Overview carries §Warehouse Profile ▸ General and
 * ▸ Location, the only two of the spec's eleven profile sections whose fields
 * are actually seeded (`address` and `phone` had no reader at all before it).
 * Equipment Summary, QR & Barcode, Warehouse Map, Documents and Audit have no
 * records behind them and are called out in the Overview note rather than
 * mocked up.
 *
 * **Money:** there is none on this screen and none is derivable from its rows,
 * so nothing here is gated — the earlier build printed an invented
 * "NPR 42.8M Replacement Value" on a warehouse tile, which was both a figure
 * nobody supplied and a rupee total in front of the floor. It is gone.
 */

/* ── shared geometry ───────────────────────────────────────────────────── */

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  padding: '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap' as const,
  verticalAlign: 'middle' as const,
}

const inputStyle = {
  height: 32,
  padding: '0 9px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

const selectStyle = { ...inputStyle, cursor: 'pointer' }

const linkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--sp-xs)',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--link)',
  textDecoration: 'none',
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/* ── small pieces ──────────────────────────────────────────────────────── */

/** §4.2 — the occupancy hue is the alarm ladder, never decoration. */
function occupancyTone(value: number): StatusKey {
  if (value >= CAPACITY_ALERT_PCT) return 'danger'
  if (value >= 70) return 'progress'
  return 'in'
}

function occupancyFill(value: number): string {
  if (value >= CAPACITY_ALERT_PCT) return 'var(--danger)'
  if (value >= 70) return 'var(--progress)'
  return 'var(--success)'
}

function Pill({ label, tone, icon }: { label: string; tone: StatusKey; icon: IconName }) {
  const t = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border ?? 'transparent'}`,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={11} />
      {label}
    </span>
  )
}

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 'var(--r-badge)',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        color: 'var(--text2)',
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
      }}
    >
      {initials}
    </span>
  )
}

/**
 * The render's facility photograph — on the warehouse card and, at 28px, in the
 * first column of the Warehouse List, which the render also thumbnails. A
 * blocked or missing file degrades to a tile, not a broken icon.
 */
function Photo({
  src,
  alt,
  width = '100%',
  height = 108,
  radius = 8,
  glyph = 26,
}: {
  src: string
  alt: string
  width?: number | string
  height?: number
  radius?: number
  glyph?: number
}) {
  const [broken, setBroken] = useState(false)
  const shell = {
    width,
    height,
    flexShrink: 0,
    borderRadius: radius,
    border: '1px solid var(--border)',
    display: 'block' as const,
    objectFit: 'cover' as const,
  }
  if (broken) {
    return (
      <span
        aria-label={alt}
        role="img"
        style={{ ...shell, background: 'var(--card2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}
      >
        <Icon name="home" size={glyph} />
      </span>
    )
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} style={shell} />
}

function Ring({ value, size = 58 }: { value: number; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const mid = size / 2
  return (
    <svg width={size} height={size} role="img" aria-label={`${value}% of capacity used`} style={{ flexShrink: 0 }}>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={occupancyFill(value)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text
        x={mid}
        y={mid}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 13, fontWeight: 700, fill: 'var(--text)' }}
      >
        {value}%
      </text>
    </svg>
  )
}

/** `width` takes a CSS length — pass `"100%"` for a bar that fills its card. */
function Bar({ value, width = 78 }: { value: number; width?: number | string }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-block', width, height: 6, borderRadius: 'var(--r-badge)', background: 'var(--chart-grid)', overflow: 'hidden' }}
    >
      <span style={{ display: 'block', width: `${Math.min(100, value)}%`, height: '100%', background: occupancyFill(value) }} />
    </span>
  )
}

/** `icon` mirrors the render, which glyphs the Assets and Capacity labels on the facility card. */
function Figure({ label, value, note, icon }: { label: string; value: string; note?: string; icon?: IconName }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>
        {icon && <Icon name={icon} size={11} style={{ flexShrink: 0 }} />}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
      {note && <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 1 }}>{note}</div>}
    </div>
  )
}

/** Label/value pair for the profile's General and Location panels. */
function DetailRow({
  label,
  value,
  icon,
  mono,
  wrap,
}: {
  label: string
  value: string
  icon?: IconName
  mono?: boolean
  wrap?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: wrap ? 'flex-start' : 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
      <dt style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600, width: 78, flexShrink: 0 }}>{label}</dt>
      <dd
        {...(mono ? { className: 'identifier' } : {})}
        style={{
          margin: 0,
          display: 'flex',
          alignItems: wrap ? 'flex-start' : 'center',
          gap: 6,
          minWidth: 0,
          fontSize: 'var(--t-meta)',
          color: 'var(--text)',
          ...(wrap ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }),
        }}
      >
        {icon && <Icon name={icon} size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: wrap ? 2 : 0 }} />}
        <span style={{ minWidth: 0, ...(wrap ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }) }}>
          {value}
        </span>
      </dd>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  note,
  footer,
}: {
  label: string
  value: string
  icon: IconName
  accent: BrandKey
  note?: string
  footer?: ReactNode
}) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--r-sm)',
            background: BRAND[accent],
            color: BRAND_ON[accent],
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={16} fill />
        </span>
        {/* Wraps rather than ellipsising. Six cards across leaves ~83px beside
            the icon tile, and "Total Assets Stored" clipped to "Total Asse…" —
            a KPI whose own name is unreadable is not a KPI. */}
        <div
          style={{
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--text2)',
            minWidth: 0,
            lineHeight: 1.25,
          }}
        >
          {label}
        </div>
      </div>
      <div
        className="figure"
        style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 9, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      {note && <div style={{ marginTop: 3, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{note}</div>}
      {footer && <div style={{ marginTop: 'auto', paddingTop: 9 }}>{footer}</div>}
    </article>
  )
}

/* ── export ────────────────────────────────────────────────────────────── */

function exportCsv(rows: Warehouse[]) {
  const head = ['Warehouse', 'Code', 'Branch', 'Manager', 'Zones', 'Capacity', 'Occupancy %', 'Equipment', 'Transfers', 'Status']
  const body = rows.map((w) => [
    w.name,
    w.code,
    w.branch,
    w.manager,
    w.zonesCount,
    w.capacity,
    w.occupancy,
    w.equipmentCount,
    w.activeTransfers,
    w.status,
  ])
  const csv = [head, ...body]
    .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'warehouses.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* ── table sorting ─────────────────────────────────────────────────────── */

type SortKey = 'name' | 'code' | 'branch' | 'manager' | 'zonesCount' | 'capacity' | 'occupancy' | 'equipmentCount' | 'activeTransfers' | 'status'

const COLUMNS: Array<{ key: SortKey; header: string; numeric?: boolean }> = [
  { key: 'name', header: 'Warehouse' },
  { key: 'code', header: 'Code' },
  { key: 'branch', header: 'Branch' },
  { key: 'manager', header: 'Manager' },
  { key: 'zonesCount', header: 'Zones', numeric: true },
  { key: 'capacity', header: 'Capacity', numeric: true },
  { key: 'occupancy', header: 'Occupancy', numeric: true },
  { key: 'equipmentCount', header: 'Equipment', numeric: true },
  { key: 'activeTransfers', header: 'Transfers', numeric: true },
  { key: 'status', header: 'Status' },
]

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50]

/**
 * Why every Transfer Center step button is stated as unbuilt — see the note
 * where `advance()` used to be. One string so the Cancel and the Next Step
 * button can never drift apart in what they claim.
 */
const TRANSFER_TRANSITION_UNAVAILABLE =
  'Advancing a transfer is not built — src/actions/inventory has no state-change action for a stock transfer, and the create action is not one. This button would move nothing.'

/* ── screen ────────────────────────────────────────────────────────────── */

export default function Warehouses() {
  const { user } = useAuth()
  const online = useNetwork()
  /* Stable identity so the `rackGlance`/`rackDetailGroups` memo below (and
     anything else keyed on `gctx`) only recomputes when the viewing role
     actually changes — `gateContext` returns a fresh object literal on every
     call, so leaving this uncached would defeat that memo on every render. */
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])

  /* list controls */
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('All')
  const [status, setStatus] = useState('All')
  const [alertFilter, setAlertFilter] = useState<AlertKey | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'capacity', dir: 'desc' })
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  /* profile */
  const [selectedId, setSelectedId] = useState(WAREHOUSES[0]?.id ?? '')
  const [profileTab, setProfileTab] = useState<'overview' | 'layout' | 'map' | 'capacity' | 'transfers' | 'staff'>('overview')

  /* transfers */
  const [transfers, setTransfers] = useState<StockTransfer[]>(TRANSFERS)
  const [modalOpen, setModalOpen] = useState(false)
  /* Law 12 — a create that did not land says so, in the modal's own existing
     ErrorBanner slot, and persists there until the next attempt. */
  const [transferError, setTransferError] = useState<string | null>(null)
  /**
   * Law 8 — the idempotency keys for THIS transfer, minted when the modal
   * opens and reused across every retry of it (`blockKeys` ref pattern,
   * `clients/ClientsDirectory.tsx:325`): one for the `stock_transfers` header,
   * one for its line row. A resubmit after a failure conflicts on
   * `client_uuid` and resolves to what already landed instead of raising the
   * transfer twice.
   */
  const transferKeys = useRef<{ header: string; line: string } | null>(null)
  const openTransferModal = () => {
    setTransferError(null)
    transferKeys.current = { header: newClientUuid(), line: newClientUuid() }
    setModalOpen(true)
  }

  const selected = WAREHOUSES.find((w) => w.id === selectedId) ?? WAREHOUSES[0]

  const totals = totalsOf(WAREHOUSES)
  const alerts = alertsOf(WAREHOUSES, transfers)
  const activity = recentActivity(transfers)
  const insights = insightsOf(WAREHOUSES)
  const activitySeries = transferActivity(transfers)

  const branches = useMemo(() => [...new Set(WAREHOUSES.map((w) => w.branch))].sort(), [])
  const statuses = useMemo(() => [...new Set(WAREHOUSES.map((w) => w.status))].sort(), [])

  const filtersOn = query.trim() !== '' || branch !== 'All' || status !== 'All' || alertFilter !== null

  const clearFilters = () => {
    setQuery('')
    setBranch('All')
    setStatus('All')
    setAlertFilter(null)
    setPage(1)
  }

  const focusList = () => document.getElementById('warehouse-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const focusProfile = () => document.getElementById('warehouse-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const openWarehouse = (id: string) => {
    setSelectedId(id)
    setProfileTab('overview')
    window.setTimeout(focusProfile, 0)
  }

  const openTransferCentre = () => {
    setProfileTab('transfers')
    window.setTimeout(focusProfile, 0)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const allowed = alertFilter ? new Set(warehousesForAlert(alertFilter, WAREHOUSES).map((w) => w.id)) : null

    const rows = WAREHOUSES.filter((w) => {
      if (allowed && !allowed.has(w.id)) return false
      if (branch !== 'All' && w.branch !== branch) return false
      if (status !== 'All' && w.status !== status) return false
      if (!q) return true
      /* §Search — warehouse, code, zone, shelf, asset, staff, branch. Room and
         rack join them because a picker searching "Audio Vault" is naming a
         room, and a search that silently misses it reads as no such warehouse. */
      const locationHit = STORAGE_LOCATIONS.some(
        (l) =>
          l.warehouseId === w.id &&
          [l.zone, l.room, l.rack, l.shelf, l.bin].some((field) => field.toLowerCase().includes(q)),
      )
      const staffHit = staffOf(w.name).some((s) => s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q))
      const assetHit = transfersOf(transfers, w.name).some((t) =>
        t.items.some((i) => i.name.toLowerCase().includes(q) || i.serial.toLowerCase().includes(q)),
      )
      return (
        w.name.toLowerCase().includes(q) ||
        w.code.toLowerCase().includes(q) ||
        w.branch.toLowerCase().includes(q) ||
        w.manager.toLowerCase().includes(q) ||
        w.address.toLowerCase().includes(q) ||
        locationHit ||
        staffHit ||
        assetHit
      )
    })

    return [...rows].sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    /* `transfers` belongs here: the asset branch of the search reads the live
       ledger, so without it a transfer created in the modal stayed unsearchable
       by its own asset name until some unrelated filter changed. */
  }, [query, branch, status, alertFilter, sort, transfers])

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * rowsPerPage
  const visible = filtered.slice(start, start + rowsPerPage)

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const applyAlert = (key: AlertKey) => {
    if (warehousesForAlert(key, WAREHOUSES).length === 0) {
      openTransferCentre()
      return
    }
    setAlertFilter((k) => (k === key ? null : key))
    setPage(1)
    window.setTimeout(focusList, 0)
  }

  /* ── transfer workflow ───────────────────────────────────────────────── */

  /**
   * No session, no dispatch — and never a substituted identity. Same shape as
   * `rentals/NewRental.tsx`'s `dispatchContext()` and `today/MovementList.tsx`'s
   * `runMovementAction`.
   *
   * `isOnline` is passed because this screen knows it and `lib/rbac` degrades
   * several approvals offline; omitting it lets `ActionContext` default to
   * online in `actions/core.ts`, which is the fail-OPEN direction. Same as
   * `clients/DuplicateCenter.tsx`.
   */
  const dispatchContext = (): ActionContext | null =>
    user ? { userId: user.id, role: user.role, isOnline: online } : null

  /**
   * ⛔ `advance(id, next)` lived here and is **deleted**.
   *
   * It wrote the new transfer status into local state — plus a
   * `dispatchedAt` / `receivedAt` timestamp built from `TODAY` and a literal
   * clock time — and then fired `createStockTransfer` fire-and-forget with no
   * `ActionContext` and no `.catch()`. An operator marking a branch transfer
   * Received at 18:00 saw the card say Received, with a time on it, while
   * nothing persisted: the destination's stock never incremented and the
   * source's never decremented, so two warehouses disagreed about where the
   * gear was with no error anywhere.
   *
   * It is not re-pointed at another action, because there is no action for
   * this operation. `src/actions/inventory/` holds `createStockTransfer`
   * (`CREATE_STOCK_TRANSFER`) and nothing that advances or cancels an existing
   * transfer. That input happens to carry optional `transferId`/`status`
   * fields, which is what made the original call typecheck — but a create is
   * not a transition, and deciding that `CREATE_STOCK_TRANSFER` also means
   * "move TR-2026-0045 from In Transit to Received" would be inventing a
   * semantic mapping that produces wrong data the moment the action is wired
   * to the database. So the Transfer Center's step buttons are stated as
   * unbuilt (`TRANSFER_TRANSITION_UNAVAILABLE`) in the same
   * `Unavailable`-with-a-reason idiom this screen already uses for Add
   * Warehouse, Print Labels and Refresh, rather than moving a card that
   * nothing behind it has moved.
   *
   * Cancel goes with them: Law 3 makes cancelling a *named state change*, so
   * it needs the same missing transition action — it is not a delete and it is
   * not a create either.
   */

  const [form, setForm] = useState({
    type: 'Branch Transfer' as TransferType,
    source: WAREHOUSES[0]?.name ?? '',
    destination: WAREHOUSES[1]?.name ?? '',
    item: '',
    serial: '',
    notes: '',
  })
  const formError =
    form.source === form.destination
      ? 'Source and destination must be different warehouses.'
      : form.item.trim() === ''
        ? 'Name the asset being moved.'
        : null

  /**
   * Create is the one transfer operation this build has a real action for
   * (`CREATE_STOCK_TRANSFER`), so it dispatches — but nothing appears in the
   * ledger until that dispatch resolves.
   *
   * ⛔ It used to append the row, close the modal and jump to the Transfer
   * Center having called no action at all, under a transfer number minted here
   * (`nextTransferNo()`, "the highest seeded number plus one"). That reference
   * was shown to the operator, and quoted between warehouses, for a transfer
   * that existed only in this tab. Both are gone: the row is built on the
   * resolved path, and it carries the identifier the write itself reports back
   * rather than one this screen guessed.
   *
   * `createStockTransfer` writes the `stock_transfers` header and its line
   * through `lib/dataAccess`, under the Law 8 keys minted when this modal
   * opened. Everything the form collects is sent: the type, both facilities,
   * the asset name, the serial and the notes — the old two-field dispatch
   * that dropped them (the audit's TODO(decision) on this input) is closed.
   *
   * The action resolves the typed names against the DATABASE — warehouses by
   * name, the asset against `products`, the serial against `product_units` —
   * so on a store that does not hold this screen's seed rows the create
   * refuses with the reason, the modal stays open, and no local row appears.
   * That refusal is honest: this screen's facility list is still seed data.
   */
  const createTransfer = () => {
    if (formError) return
    const ctx = dispatchContext()
    /* `!user` is exactly what makes `ctx` null, so this reads as redundant — it
       is not. The committed row below stamps `requestedBy` with the session's
       own name, and this is what lets the compiler see that a session exists at
       that point. Refuse rather than substitute: an actor field carries the real
       identity or the write does not happen. */
    if (!ctx || !user) {
      setTransferError(
        'Not created — you are not signed in, so this transfer cannot be attributed to anyone. Sign in and try again.',
      )
      return
    }
    const keys = transferKeys.current ?? { header: newClientUuid(), line: newClientUuid() }
    transferKeys.current = keys
    const from = WAREHOUSES.find((w) => w.name === form.source)
    const to = WAREHOUSES.find((w) => w.name === form.destination)
    setTransferError(null)
    void import('../../actions/inventory/createStockTransfer')
      .then((m) =>
        m.createStockTransfer(
          {
            clientUuid: keys.header,
            lineClientUuid: keys.line,
            transferType: form.type,
            sourceWarehouse: form.source,
            destinationWarehouse: form.destination,
            assetName: form.item.trim(),
            serial: form.serial.trim() || undefined,
            notes: form.notes.trim() || undefined,
          },
          ctx,
        ),
      )
      .then((res) => {
        const created: StockTransfer = {
          /* A local React key, not an identifier anyone is shown. */
          id: `tr-${Date.now()}`,
          /* The number the DATABASE issued via next_document_number('transfer')
             — allocated, not guessed. The clock-minted `TR-xxxx` this comment
             used to warn about is gone with the stub. */
          transferNo: res.transferNo,
          type: form.type,
          sourceWarehouse: form.source,
          sourceZone: zonesOf(from?.id ?? '')[0]?.zone ?? 'Unassigned',
          destinationWarehouse: form.destination,
          destinationZone: zonesOf(to?.id ?? '')[0]?.zone ?? 'Unassigned',
          assetCount: 1,
          items: [
            {
              assetCode: '—',
              name: form.item.trim(),
              serial: form.serial.trim() || '—',
              category: '—',
              condition: '—',
            },
          ],
          status: 'Pending',
          /*
           * The requester is **the signed-in person who filled this form in** —
           * the same identity `ctx` carries to the action, so the row and the
           * write name the same actor.
           *
           * ⛔ It used to be `from?.manager ?? 'Warehouse'`: the source
           * facility's manager, who may not have been anywhere near this, and
           * a bare literal `'Warehouse'` when no facility matched. The Transfer
           * Center prints this string in its "Requested By" column, so a
           * transfer raised by a coordinator was attributed on screen to a
           * manager who never raised it — the same defect class as the invented
           * `USR-001`. An actor field carries the real session or the write is
           * refused (see the guard above); it is never substituted.
           */
          requestedBy: user.name,
          dateAD: TODAY.toISOString().slice(0, 10),
          notes: form.notes.trim(),
        }
        setTransfers((prev) => [created, ...prev])
        /* This transfer landed — the next modal-open mints fresh Law 8 keys. */
        transferKeys.current = null
        setModalOpen(false)
        /* Land on a profile the new row is actually visible in — the Transfer Center
           lists transfers touching the selected warehouse, so open the source. */
        if (from) setSelectedId(from.id)
        openTransferCentre()
      })
      .catch((err: unknown) => {
        console.error('create stock transfer failed:', err)
        setTransferError(`Not created — ${err instanceof Error ? err.message : String(err)}`)
      })
  }

  /* ── derived panels ──────────────────────────────────────────────────── */

  const capacitySlices: Slice[] = [
    { label: 'Used', value: totals.used, display: grouped(totals.used), percent: `${totals.occupancyPct}%` },
    { label: 'Available', value: totals.available, display: grouped(totals.available), percent: `${100 - totals.occupancyPct}%` },
  ]

  const distributionMax = EQUIPMENT_DISTRIBUTION.reduce((m, c) => Math.max(m, c.count), 0)
  const distributionRows = EQUIPMENT_DISTRIBUTION.map((c) => ({
    label: c.category,
    value: c.count,
    display: `${grouped(c.count)} · ${pct(c.count, totals.assets)}%`,
  }))

  const activityMax = activitySeries.reduce((m, d) => Math.max(m, d.completed, d.inProgress, d.pending), 0)

  const zoneRows = selected ? zonesOf(selected.id) : []
  const binRows = useMemo(
    () => (selected ? STORAGE_LOCATIONS.filter((l) => l.warehouseId === selected.id) : []),
    [selected],
  )
  const profileStaff = selected ? staffOf(selected.name) : []
  const profileTransfers = selected ? transfersOf(transfers, selected.name) : []

  /*
   * §HIS v2.1 perf — `rackGlance`/`rackDetailGroups` each build a full
   * field-gated object graph (role/PII/money filtering) per bin row. Calling
   * them inline inside the Storage Layout table's `.map()` reran that work
   * on every re-render of this whole screen (a filter change, a transfer
   * status update, a chip toggle) even for bins whose rack/gate context
   * hadn't changed. Memoized here per `binRows` + `gctx`, so the builders
   * only rerun when the selected warehouse's bins or the viewing role
   * actually change.
   */
  const binRowsWithIntel = useMemo(
    () =>
      binRows.map((l) => ({
        loc: l,
        glance: rackGlance(l, gctx),
        detail: rackDetailGroups(l, gctx),
      })),
    [binRows, gctx],
  )

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="home"
        title="Warehouse Management"
        description="Manage warehouses, storage locations, capacity, transfers and warehouse operations."
        actions={
          <>
            <Unavailable reason="Add Warehouse is not built — there is no warehouse intake screen or route in this release.">
              <Button icon="plus" variant="primary" disabled>
                Add Warehouse
              </Button>
            </Unavailable>
            <Button icon="truck" onClick={openTransferModal}>
              Transfer Stock
            </Button>
            <Unavailable reason="Print Labels is not built — no shelf, zone or rack label pipeline exists yet.">
              <Button icon="file" disabled>
                Print Labels
              </Button>
            </Unavailable>
            <Button icon="download" onClick={() => exportCsv(filtered)}>
              Export
            </Button>
            <Unavailable reason="Refresh does nothing here — this screen reads a seeded module, so there is no source to re-fetch.">
              <Button icon="refresh" disabled>
                Refresh
              </Button>
            </Unavailable>
          </>
        }
      />

      {/* A seed that stops reconciling is shown, not thrown — a module-scope throw
          runs before React mounts and blanks the app with no message. */}
      {SEED_ERRORS.length > 0 && (
        <ErrorBanner
          title="Warehouse seed does not reconcile"
          message={
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
              {SEED_ERRORS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          }
        />
      )}

      {/*
        Flex-wrap rather than a two-track grid. `minmax(0,1fr) auto` gives the
        rail its 296px first and hands the content whatever is left — on a 375px
        tablet in the warehouse that left the table column 27px wide. Wrapping on
        a 560px basis drops the rail below the content instead, with no media
        query and no change to the desktop layout.
      */}
      <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0, flex: '1 1 560px' }}>
          {/* ── six KPI cards ─────────────────────────────────────────── */}
          <section
            aria-label="Key figures"
            /* 132px. The render puts all six on one row, and the spec locks
               "exactly six"; with the rail open this column measures 958px at
               the render's own 1536 width and 862 at 1440, so the basis has to
               clear 6·min + 5·12 at 862. 140 did not — it dropped the sixth
               card onto a row of its own from 1440 down. Widening beyond the
               min is auto-fit's job: the cards still render ~150px at 1536. */
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 'var(--sp-md)' }}
          >
            <KpiCard
              label="Total Warehouses"
              value={grouped(totals.warehouses)}
              icon="home"
              accent="primary"
              note={`Across ${branches.length} branches`}
              footer={
                <button type="button" style={linkStyle} onClick={clearFilters} disabled={!filtersOn} title={filtersOn ? 'Clear every filter' : 'No filters are applied'}>
                  View All <Icon name="arrow_right" size={12} />
                </button>
              }
            />
            <KpiCard
              label="Active Warehouses"
              value={grouped(totals.active)}
              icon="check"
              accent="success"
              note={`${pct(totals.active, totals.warehouses)}% active`}
              footer={
                <button
                  type="button"
                  style={linkStyle}
                  onClick={() => {
                    setStatus('Active')
                    setPage(1)
                    focusList()
                  }}
                >
                  View Active <Icon name="arrow_right" size={12} />
                </button>
              }
            />
            <KpiCard
              label="Total Assets Stored"
              value={grouped(totals.assets)}
              icon="box"
              accent="primary"
              note={`${EQUIPMENT_DISTRIBUTION.length} categories`}
              footer={
                <Link to="/inventory" style={linkStyle}>
                  View Details <Icon name="arrow_right" size={12} />
                </Link>
              }
            />
            <KpiCard
              label="Capacity Used"
              value={`${totals.occupancyPct}%`}
              icon="queues"
              accent="progress"
              note={`${grouped(totals.used)} of ${grouped(totals.capacity)} slots`}
              footer={<Bar value={totals.occupancyPct} width="100%" />}
            />
            <KpiCard
              label="Open Transfers"
              value={grouped(totals.transfers)}
              icon="truck"
              accent="progress"
              note="Across all facilities"
              footer={
                <button type="button" style={linkStyle} onClick={openTransferCentre}>
                  View Transfers <Icon name="arrow_right" size={12} />
                </button>
              }
            />
            <KpiCard
              label="Inventory Accuracy"
              value={`${totals.accuracyPct}%`}
              icon="chart"
              accent="success"
              note="Asset-weighted, last verification"
              footer={
                <Link to="/reports/inventory" style={linkStyle}>
                  View Report <Icon name="arrow_right" size={12} />
                </Link>
              }
            />
          </section>

          {/* ── facility cards ────────────────────────────────────────── */}
          <section
            aria-label="Warehouses"
            /* 228px, not 264. The render stands all four facilities in one row;
               264 needed 1,092px and this column is 958 at the render's own
               width, so it wrapped 3+1. 4·228 + 3·12 = 948 fits, and the cards
               still stretch to ~230 each. */
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(228px, 1fr))', gap: 'var(--sp-md)' }}
          >
            {WAREHOUSES.map((w) => {
              const on = w.id === selectedId
              return (
                <article
                  key={w.id}
                  className="lift"
                  style={{
                    ...cardStyle,
                    padding: 13,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    minWidth: 0,
                    borderColor: on ? 'var(--nav-active-accent)' : 'var(--border)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0,1fr)', gap: 10 }}>
                    <Photo src={w.image} alt={`${w.name} storage floor`} height={100} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                      {/* Wraps: four cards across leaves ~130px here, and these
                          facility names are far longer than the render's. The
                          pill drops under the name rather than crushing it. */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', minWidth: 0, flex: '1 1 auto' }}>
                          {w.name}
                        </span>
                        <span style={{ flexShrink: 0 }}>
                          <Pill label={w.status} tone={WAREHOUSE_STATUS_TONE[w.status]} icon={WAREHOUSE_STATUS_ICON[w.status]} />
                        </span>
                      </div>
                      <span
                        className="identifier"
                        style={{
                          alignSelf: 'flex-start',
                          padding: '1px 7px',
                          borderRadius: 4,
                          background: 'var(--card2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text2)',
                          fontSize: 'var(--t-th)',
                          fontWeight: 700,
                        }}
                      >
                        {w.code}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)', minWidth: 0 }}>
                        <Icon name="company" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.branch}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <Avatar name={w.manager} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Manager</span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {w.manager}
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <Ring value={w.occupancy} size={54} />
                    <Figure label="Assets" value={grouped(w.equipmentCount)} icon="box" />
                    <Figure label="Capacity" value={grouped(w.capacity)} icon="queues" />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', paddingTop: 9, borderTop: '1px solid var(--border)', flexWrap: 'wrap', marginTop: 'auto' }}>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Available Space</span>
                    <span className="figure" style={{ fontWeight: 700, color: STATUS[occupancyTone(w.occupancy)].fg }}>
                      {grouped(w.availableSpace)}
                    </span>
                    <button type="button" style={{ ...linkStyle, marginLeft: 'auto' }} onClick={() => openWarehouse(w.id)}>
                      View Warehouse <Icon name="arrow_right" size={12} />
                    </button>
                  </div>
                </article>
              )
            })}
          </section>

          {/* ── warehouse list ────────────────────────────────────────── */}
          <div id="warehouse-list">
            <Card bodyStyle={{ padding: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-sm)',
                  padding: '11px 13px',
                  borderBottom: '1px solid var(--border)',
                  flexWrap: 'wrap',
                }}
              >
                <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Warehouse List</h2>

                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  <Input
                    icon={<Icon name="search" size={14} />}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Search warehouse, code, zone, shelf, asset, staff…"
                    aria-label="Search warehouses"
                    style={{ ...inputStyle, width: 258 }}
                  />

                  <Select
                    value={branch}
                    onChange={(e) => {
                      setBranch(e.target.value)
                      setPage(1)
                    }}
                    aria-label="Filter by branch"
                    style={selectStyle}
                  >
                    <option value="All">All Branches</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value)
                      setPage(1)
                    }}
                    aria-label="Filter by status"
                    style={selectStyle}
                  >
                    <option value="All">All Status</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>

                  <span style={{ display: 'inline-flex', border: '1px solid var(--input-border)', borderRadius: 'var(--r-input)', overflow: 'hidden' }}>
                    {(['table', 'cards'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        aria-pressed={view === v}
                        aria-label={v === 'table' ? 'Table view' : 'Card view'}
                        title={v === 'table' ? 'Table view' : 'Card view'}
                        style={{
                          width: 32,
                          height: 32,
                          border: 'none',
                          background: view === v ? 'var(--nav-active-bg)' : 'var(--input-bg)',
                          color: view === v ? 'var(--nav-active-accent)' : 'var(--text2)',
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name={v === 'table' ? 'checklist' : 'queues'} size={15} />
                      </button>
                    ))}
                  </span>
                </span>
              </div>

              {alertFilter && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-sm)',
                    padding: '8px 13px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--card2)',
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text2)',
                  }}
                >
                  <Icon name="flag" size={13} style={{ color: 'var(--muted)' }} />
                  Filtered by alert: {alerts.find((a) => a.key === alertFilter)?.label}
                  <button type="button" style={{ ...linkStyle, marginLeft: 'auto' }} onClick={() => setAlertFilter(null)}>
                    Clear
                  </button>
                </div>
              )}

              {visible.length === 0 ? (
                <div style={{ padding: '20px 14px' }}>
                  <EmptyState
                    title="No warehouse matches these filters"
                    description="Nothing in the facility register satisfies the search, branch, status and alert filters together."
                    actionLabel="Clear filters"
                    onAction={clearFilters}
                  />
                </div>
              ) : view === 'cards' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 'var(--sp-md)', padding: 'var(--sp-md)' }}>
                  {visible.map((w) => (
                    <article key={w.id} style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{w.name}</span>
                      <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        {w.code} · {w.branch}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <span className="figure">{w.occupancy}%</span>
                        <Bar value={w.occupancy} width={72} />
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                        <Pill label={w.status} tone={WAREHOUSE_STATUS_TONE[w.status]} icon={WAREHOUSE_STATUS_ICON[w.status]} />
                        <button type="button" style={{ ...linkStyle, marginLeft: 'auto' }} onClick={() => openWarehouse(w.id)}>
                          Open <Icon name="arrow_right" size={12} />
                        </button>
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1010 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {COLUMNS.map((c) => {
                          const on = sort.key === c.key
                          return (
                            <th key={c.key} style={{ ...th, textAlign: c.numeric ? 'right' : 'left' }}>
                              <button
                                type="button"
                                onClick={() => toggleSort(c.key)}
                                aria-label={`Sort by ${c.header}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 'var(--sp-xs)',
                                  border: 'none',
                                  background: 'transparent',
                                  padding: 0,
                                  color: on ? 'var(--nav-active-accent)' : 'inherit',
                                  font: 'inherit',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {c.header}
                                {on && <Icon name={sort.dir === 'asc' ? 'arrow_up' : 'arrow_down'} size={11} />}
                              </button>
                            </th>
                          )
                        })}
                        <th style={{ ...th, textAlign: 'right', width: 84 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((w) => (
                        <tr
                          key={w.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: w.id === selectedId ? 'var(--card2)' : 'transparent',
                          }}
                        >
                          <td style={td}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              {/* The render thumbnails the facility photograph here, not a generic glyph. */}
                              <Photo src={w.image} alt="" width={28} height={28} radius={6} glyph={14} />
                              <span style={{ fontWeight: 600 }}>{w.name}</span>
                            </span>
                          </td>
                          <td style={{ ...td }}>
                            <span className="identifier" style={{ color: 'var(--text2)' }}>
                              {w.code}
                            </span>
                          </td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{w.branch}</td>
                          <td style={td}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <Avatar name={w.manager} size={22} />
                              <span style={{ color: 'var(--text2)' }}>{w.manager}</span>
                            </span>
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>
                            {grouped(w.zonesCount)}
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>
                            {grouped(w.capacity)}
                          </td>
                          {/* Stacked, as the render draws it — the percent reads first, the bar sits under it. */}
                          <td style={{ ...td, textAlign: 'right' }}>
                            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--sp-xs)' }}>
                              <span className="figure" style={{ fontWeight: 600 }}>
                                {w.occupancy}%
                              </span>
                              <Bar value={w.occupancy} />
                            </span>
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>
                            {grouped(w.equipmentCount)}
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>
                            {grouped(w.activeTransfers)}
                          </td>
                          <td style={td}>
                            <Pill label={w.status} tone={WAREHOUSE_STATUS_TONE[w.status]} icon={WAREHOUSE_STATUS_ICON[w.status]} />
                          </td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => openWarehouse(w.id)}
                                aria-label={`Open ${w.name}`}
                                title={`Open ${w.name}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 'var(--r-xs)',
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: 'var(--text2)',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                              >
                                <Icon name="eye" size={14} />
                              </button>
                              <Unavailable reason="Warehouse edit and the row menu are not built — there is no warehouse edit screen in this release.">
                                <span style={{ color: 'var(--disabled)', display: 'grid', placeItems: 'center', width: 28, height: 28 }}>
                                  <Icon name="more_vert" size={14} />
                                </span>
                              </Unavailable>
                            </span>
                          </td>
                        </tr>
                      ))}
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
                  Showing {filtered.length === 0 ? 0 : start + 1} to {start + visible.length} of {filtered.length} warehouses
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Rows per page
                  <Select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    aria-label="Rows per page"
                    style={selectStyle}
                  >
                    {ROWS_PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </label>

                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setPage(safePage - 1)}
                    disabled={safePage === 1}
                    aria-label="Previous page"
                    style={{
                      minWidth: 26,
                      height: 26,
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: safePage === 1 ? 'var(--disabled)' : 'var(--text2)',
                      cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ‹
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
                    const on = n === safePage
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        aria-current={on ? 'page' : undefined}
                        style={{
                          minWidth: 26,
                          height: 26,
                          borderRadius: 7,
                          border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                          background: on ? 'var(--btn-primary-bg)' : 'transparent',
                          color: on ? 'var(--btn-primary-fg)' : 'var(--text2)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 700 : 500,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {n}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setPage(safePage + 1)}
                    disabled={safePage === pageCount}
                    aria-label="Next page"
                    style={{
                      minWidth: 26,
                      height: 26,
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: safePage === pageCount ? 'var(--disabled)' : 'var(--text2)',
                      cursor: safePage === pageCount ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ›
                  </button>
                </span>
              </div>
            </Card>
          </div>

          {/* ── analytics row ─────────────────────────────────────────── */}
          <section
            aria-label="Warehouse analytics"
            /* Four across, as the render draws them — same 228px basis as the
               facility row above, so the two rows share a column rhythm. */
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(228px, 1fr))', gap: 'var(--sp-md)' }}
          >
            <Card title="Capacity Utilization">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
                <Donut slices={capacitySlices} centreLabel="Capacity used" centreValue={`${totals.occupancyPct}%`} size={116} />
                {/* `Legend` is `flex:1 / minWidth:0`, so in a four-across card it
                    shrank and clipped its own nowrap labels rather than wrapping.
                    A 132px floor makes the row wrap the legend under the donut. */}
                <div style={{ display: 'flex', flex: '1 1 132px', minWidth: 132 }}>
                  <Legend slices={capacitySlices} />
                </div>
              </div>
              <button
                type="button"
                style={{ ...linkStyle, marginTop: 'var(--sp-md)' }}
                onClick={() => {
                  setSort({ key: 'occupancy', dir: 'desc' })
                  setPage(1)
                  focusList()
                }}
              >
                Rank warehouses by occupancy <Icon name="arrow_right" size={12} />
              </button>
            </Card>

            <Card title="Inventory Distribution">
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 10 }}>
                Total assets: <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>{grouped(totals.assets)}</span>
              </div>
              <HBars rows={distributionRows} axisTicks={['0', grouped(Math.round(distributionMax / 2)), grouped(distributionMax)]} />
              <Link to="/inventory" style={{ ...linkStyle, marginTop: 'var(--sp-md)' }}>
                View in Inventory <Icon name="arrow_right" size={12} />
              </Link>
            </Card>

            <Card title="Transfer Activity">
              {activitySeries.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No transfers are on the ledger.</p>
              ) : (
                /* `GroupedBars` centres its three-swatch legend on one nowrap
                   row; four cards across leaves 201px and the row wants 212, so
                   it scrolls in its own box rather than shaving "Completed" and
                   "Pending" off both ends. */
                <div style={{ overflowX: 'auto' }}>
                  <GroupedBars
                    groups={activitySeries.map((d) => ({ label: d.label, values: [d.completed, d.inProgress, d.pending] }))}
                    series={['Completed', 'In Progress', 'Pending']}
                    yTicks={Array.from({ length: activityMax + 1 }, (_, i) => String(i))}
                    format={(v) => `${v} ${v === 1 ? 'transfer' : 'transfers'}`}
                    height={148}
                  />
                </div>
              )}
              <button type="button" style={{ ...linkStyle, marginTop: 'var(--sp-md)' }} onClick={openTransferCentre}>
                Open Transfer Center <Icon name="arrow_right" size={12} />
              </button>
            </Card>

            <Card title="Inventory Accuracy">
              <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--success-text)', letterSpacing: '-0.02em' }}>
                {totals.accuracyPct}%
              </div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 10 }}>
                Asset-weighted across {totals.warehouses} warehouses
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {WAREHOUSES.map((w) => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.name}
                    </span>
                    <span aria-hidden style={{ width: 84, height: 6, borderRadius: 'var(--r-badge)', background: 'var(--chart-grid)', overflow: 'hidden', flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          height: '100%',
                          width: `${Math.max(0, Math.min(100, (w.accuracyPct - 98) * 50))}%`,
                          background: w.accuracyPct < 99 ? 'var(--danger)' : 'var(--success)',
                        }}
                      />
                    </span>
                    <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
                      {w.accuracyPct}%
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Bars are scaled 98–100% so the four are distinguishable. No verification history is seeded, so this states
                current accuracy rather than a trend.
              </p>
              <Link to="/reports/inventory" style={{ ...linkStyle, marginTop: 10 }}>
                View Inventory Report <Icon name="arrow_right" size={12} />
              </Link>
            </Card>
          </section>

          {/* ── warehouse profile ─────────────────────────────────────── */}
          {selected && (
            <div id="warehouse-profile">
              <Card
                title={`${selected.name} — ${selected.code}`}
                action={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    <Icon name="company" size={13} style={{ color: 'var(--muted)' }} />
                    {selected.branch} · {selected.address}
                  </span>
                }
                bodyStyle={{ padding: 0 }}
              >
                <div style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 12px', flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'overview', label: 'Overview' },
                      { id: 'layout', label: `Storage Layout (${zoneRows.length})` },
                      { id: 'map', label: 'Warehouse Map' },
                      { id: 'capacity', label: 'Capacity' },
                      { id: 'transfers', label: `Transfer Center (${profileTransfers.length})` },
                      { id: 'staff', label: `Staff (${profileStaff.length})` },
                    ] as const
                  ).map((t) => {
                    const on = profileTab === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setProfileTab(t.id)}
                        aria-current={on ? 'page' : undefined}
                        style={{
                          height: 36,
                          padding: '0 12px',
                          border: 'none',
                          borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                          background: 'transparent',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 700 : 500,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          marginBottom: -1,
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>

                {/* General + Location — §Warehouse Profile ▸ General and ▸ Location. */}
                {profileTab === 'overview' && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '128px minmax(0,1fr)', gap: 'var(--sp-md)' }}>
                        <Photo src={selected.image} alt={`${selected.name} storage floor`} height={124} />
                        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                          <DetailRow label="Warehouse" value={selected.name} />
                          <DetailRow label="Code" value={selected.code} mono />
                          <DetailRow label="Branch" value={selected.branch} icon="company" />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                            <dt style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600, width: 78, flexShrink: 0 }}>Status</dt>
                            <dd style={{ margin: 0 }}>
                              <Pill
                                label={selected.status}
                                tone={WAREHOUSE_STATUS_TONE[selected.status]}
                                icon={WAREHOUSE_STATUS_ICON[selected.status]}
                              />
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                        <DetailRow label="Manager" value={selected.manager} icon="person" />
                        <DetailRow label="Address" value={selected.address} icon="home" wrap />
                        <DetailRow label="Phone" value={selected.phone} icon="phone" mono />
                        <DetailRow label="Zones" value={`${grouped(selected.zonesCount)} declared`} icon="queues" />
                        <DetailRow label="Assets" value={`${grouped(selected.equipmentCount)} stored`} icon="box" />
                      </dl>
                    </div>

                    <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)', paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
                      <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      The spec's Description, GPS, Google Maps link, Floor and Building are not fields on a warehouse record
                      in this build, so they are absent rather than estimated — and no per-warehouse category split exists,
                      so §Equipment Summary stays at the whole-set Inventory Distribution card above.
                      TODO(decision): whether a warehouse carries a geocode and a floor/building line.
                    </p>
                  </div>
                )}

                {/* Storage Layout */}
                {profileTab === 'layout' && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      Warehouse → Room → Zone → Rack → Shelf → Bin. {zoneRows.length} of {selected.zonesCount} declared zones
                      {zoneRows.length === 1 ? ' has ' : ' have '}seeded bin records ({binRows.length}{' '}
                      {binRows.length === 1 ? 'bin' : 'bins'}) — the remainder are not yet mapped.
                    </p>

                    {zoneRows.length === 0 ? (
                      <EmptyState
                        title="No bins are mapped for this warehouse"
                        description="Storage locations exist for other facilities; this one has no seeded zone, rack, shelf or bin records yet."
                      />
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--sp-md)' }}>
                          {zoneRows.map((z) => {
                            const fill = pct(z.used, z.capacity)
                            return (
                              <div key={z.zone} style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{z.zone}</span>
                                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                                  {z.room} · {z.bins} {z.bins === 1 ? 'bin' : 'bins'}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                                  <span className="figure" style={{ fontWeight: 700, color: STATUS[occupancyTone(fill)].fg }}>
                                    {fill}%
                                  </span>
                                  <Bar value={fill} width={70} />
                                  <span className="figure" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                                    {grouped(z.used)}/{grouped(z.capacity)}
                                  </span>
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
                            <thead>
                              <tr style={{ background: 'var(--th-bg)' }}>
                                {['Zone', 'Room', 'Rack', 'Shelf', 'Bin'].map((h) => (
                                  <th key={h} style={th}>
                                    {h}
                                  </th>
                                ))}
                                <th style={{ ...th, textAlign: 'right' }}>Occupancy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {binRowsWithIntel.map(({ loc: l, glance, detail }) => {
                                const fill = pct(l.used, l.capacity)
                                return (
                                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ ...td, fontWeight: 600 }}>{l.zone}</td>
                                    <td style={{ ...td, color: 'var(--text2)' }}>{l.room}</td>
                                    <td style={{ ...td, color: 'var(--text2)' }}>
                                      <IntelCard
                                        glance={glance}
                                        detail={detail}
                                        detailTitle={l.rack}
                                        detailSubtitle={`${l.zone} · ${l.room}`}
                                      >
                                        <span style={{ cursor: 'default' }}>{l.rack}</span>
                                      </IntelCard>
                                    </td>
                                    <td style={{ ...td, color: 'var(--text2)' }}>{l.shelf}</td>
                                    <td style={{ ...td, color: 'var(--text2)' }}>
                                      <span className="identifier">{l.bin}</span>
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                                        <span className="figure" style={{ color: 'var(--muted)' }}>
                                          {grouped(l.used)}/{grouped(l.capacity)}
                                        </span>
                                        <Bar value={fill} width={62} />
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Warehouse Map */}
                {profileTab === 'map' && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <WarehouseMap warehouseId={selected.id} />
                    
                    {/* AI Warehouse Insights Prompt — not built, so it reads as
                        disabled-with-a-reason rather than an input that silently
                        does nothing when typed into and submitted (Law 6). */}
                    <Unavailable reason="AI Warehouse Assistant is not built — there is no query engine behind this prompt yet.">
                      <div className="focus-host" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                        <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}>
                          <Icon name="message" size={16} />
                        </span>
                        <input
                          type="text"
                          disabled
                          placeholder="Ask AI Assistant (e.g. Which warehouse is full? Show empty storage...)"
                          style={{ height: 32, padding: '0 9px', borderRadius: 'var(--r-input)', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', flex: 1, minWidth: 0, outline: 'none' }}
                        />
                        <Button variant="primary" disabled>Ask</Button>
                      </div>
                    </Unavailable>
                  </div>
                )}

                {/* Capacity */}
                {profileTab === 'capacity' && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-md)' }}>
                      <Figure label="Total Capacity" value={`${grouped(selected.capacity)} slots`} />
                      <Figure label="Used" value={grouped(usedOf(selected))} note={`${selected.occupancy}% of capacity`} />
                      <Figure label="Free" value={grouped(selected.availableSpace)} />
                      <Figure label="Assets Stored" value={grouped(selected.equipmentCount)} />
                      <Figure label="Zones Declared" value={grouped(selected.zonesCount)} />
                      <Figure label="Last Verified Accuracy" value={`${selected.accuracyPct}%`} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
                      <Ring value={selected.occupancy} size={72} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Bar value={selected.occupancy} width="100%" />
                        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                          {grouped(usedOf(selected))} of {grouped(selected.capacity)} slots in use · {grouped(selected.availableSpace)} free
                        </p>
                      </div>
                    </div>

                    <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      Reserved and expansion capacity are in the spec but are not fields on a warehouse record in this build,
                      so they are absent rather than estimated. TODO(decision): whether reserved slots are tracked per zone or
                      per warehouse.
                    </p>
                  </div>
                )}

                {/* Transfer Center */}
                {profileTab === 'transfers' && (
                  <div style={{ padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {profileTransfers.length} transfers touch {selected.name}
                      </span>
                      <span style={{ marginLeft: 'auto' }}>
                        <Button icon="plus" variant="primary" onClick={openTransferModal}>
                          Create Transfer
                        </Button>
                      </span>
                    </div>
                    {profileTransfers.length === 0 ? (
                      <div style={{ padding: '20px 14px' }}>
                        <EmptyState title="No transfers touch this warehouse" description="Nothing has moved in or out of this facility on the seeded ledger." />
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                          <thead>
                            <tr style={{ background: 'var(--th-bg)' }}>
                              {['Transfer', 'Type', 'Route', 'Assets', 'Status', 'Requested', 'Date', 'Next Step'].map((h) => (
                                <th key={h} style={{ ...th, textAlign: h === 'Next Step' ? 'right' : 'left' }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {profileTransfers.map((t) => {
                              const flow = TRANSFER_FLOW[t.status]
                              const bs = toBs(new Date(`${t.dateAD}T00:00:00Z`))
                              return (
                                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={td}>
                                    <span className="identifier" style={{ fontWeight: 600 }}>
                                      {t.transferNo}
                                    </span>
                                  </td>
                                  <td style={{ ...td, color: 'var(--text2)' }}>{t.type}</td>
                                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 220 }}>
                                    <span style={{ display: 'block', color: 'var(--text)' }}>{t.sourceWarehouse}</span>
                                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                                      → {t.destinationWarehouse} · {t.destinationZone}
                                    </span>
                                  </td>
                                  <td className="figure" style={{ ...td, textAlign: 'left' }}>
                                    {grouped(t.assetCount)}
                                  </td>
                                  <td style={td}>
                                    <Pill label={t.status} tone={TRANSFER_STATUS_TONE[t.status]} icon={TRANSFER_STATUS_ICON[t.status]} />
                                  </td>
                                  <td style={{ ...td, color: 'var(--text2)' }}>{t.requestedBy}</td>
                                  <td style={td}>
                                    <span style={{ display: 'block', color: 'var(--text)' }}>{bs ? formatBs(bs) : '—'}</span>
                                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                                      {formatAd(new Date(`${t.dateAD}T00:00:00Z`))}
                                    </span>
                                  </td>
                                  <td style={{ ...td, textAlign: 'right' }}>
                                    <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                                      {!TRANSFER_TERMINAL.has(t.status) && (
                                        <Unavailable reason={TRANSFER_TRANSITION_UNAVAILABLE}>
                                          <Button icon="close" disabled>
                                            Cancel
                                          </Button>
                                        </Unavailable>
                                      )}
                                      {flow ? (
                                        <Unavailable reason={TRANSFER_TRANSITION_UNAVAILABLE}>
                                          <Button variant="primary" icon="arrow_right" disabled>
                                            {flow.label}
                                          </Button>
                                        </Unavailable>
                                      ) : (
                                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Closed</span>
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
                  </div>
                )}

                {/* Staff */}
                {profileTab === 'staff' && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                    {profileStaff.length === 0 ? (
                      <EmptyState title="No staff are posted here" description="No warehouse personnel record names this facility." />
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(238px, 1fr))', gap: 'var(--sp-md)' }}>
                        {profileStaff.map((s) => (
                          <div key={s.id} style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', alignItems: 'center', gap: 11 }}>
                            <Avatar name={s.name} size={38} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{s.name}</div>
                              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{s.role}</div>
                              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{s.shift}</div>
                              <div className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>
                                {s.phone}
                              </div>
                            </div>
                            <Pill
                              label={s.status}
                              tone={s.status === 'On Duty' ? 'in' : s.status === 'Leave' ? 'progress' : 'neutral'}
                              icon={s.status === 'On Duty' ? 'check' : 'timer'}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      Manager, Warehouse Officer, Technician, Helper and Security are floor job titles printed on the card.
                      They are not system roles and nothing on this screen reads them to grant or withhold anything —
                      capability comes from the business 8 alone.
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* ── right intelligence rail ───────────────────────────────────── */}
        <Rail width={296} label="Warehouse summary">
          <Card title="Warehouse Summary">
            <SummaryRows
              rows={[
                { label: 'Total Capacity', value: `${grouped(totals.capacity)} slots` },
                { label: 'Used Capacity', value: grouped(totals.used) },
                { label: 'Available Space', value: grouped(totals.available), tone: 'success' },
                { label: 'Total Assets', value: grouped(totals.assets) },
                { label: 'Zones Declared', value: grouped(totals.zones) },
                { label: 'Active Staff', value: grouped(totals.staff) },
                { label: 'Open Transfers', value: grouped(totals.transfers), tone: 'progress' },
                { label: 'Inventory Accuracy', value: `${totals.accuracyPct}%`, tone: 'success' },
              ]}
            />
          </Card>

          <Card title="Alerts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {alerts.map((a) => {
                const on = alertFilter === a.key
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => applyAlert(a.key)}
                    title={a.rule}
                    aria-pressed={on}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      width: '100%',
                      padding: '7px 6px',
                      borderRadius: 7,
                      border: `1px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                      background: on ? 'var(--nav-active-bg)' : 'transparent',
                      fontFamily: 'inherit',
                      fontSize: 'var(--t-meta)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--text2)',
                    }}
                  >
                    <Icon name={a.icon} size={14} style={{ color: STATUS[a.tone].fg, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{a.label}</span>
                    <span
                      className="figure"
                      style={{
                        minWidth: 20,
                        height: 20,
                        padding: '0 6px',
                        borderRadius: 'var(--r-badge)',
                        display: 'grid',
                        placeItems: 'center',
                        background: STATUS[a.tone].bg,
                        color: STATUS[a.tone].fg,
                        fontWeight: 700,
                        fontSize: 'var(--t-th)',
                        flexShrink: 0,
                      }}
                    >
                      {a.count}
                    </span>
                  </button>
                )
              })}
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Each row states its own threshold on hover. Low stock, maintenance and audit-due counts live in other modules
              and are not read here.
            </p>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 9 }}>
              {(
                [
                  { label: 'Add Warehouse', icon: 'plus' as IconName, reason: 'No warehouse intake screen exists in this release.' },
                  { label: 'Transfer Equipment', icon: 'truck' as IconName, onClick: openTransferModal },
                  { label: 'Print QR Labels', icon: 'file' as IconName, reason: 'No shelf, zone or rack label pipeline exists yet.' },
                  { label: 'Export Report', icon: 'download' as IconName, onClick: () => exportCsv(WAREHOUSES) },
                ] as const
              ).map((q) => {
                const disabled = !('onClick' in q)
                const tile = (
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      minHeight: 66,
                      padding: 'var(--sp-sm)',
                      borderRadius: 9,
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: disabled ? 'var(--disabled)' : 'var(--text2)',
                      fontSize: 'var(--t-th)',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    <Icon name={q.icon} size={17} />
                    {q.label}
                  </span>
                )
                return disabled ? (
                  <Unavailable key={q.label} reason={'reason' in q ? q.reason : ''}>
                    {tile}
                  </Unavailable>
                ) : (
                  <button
                    key={q.label}
                    type="button"
                    onClick={'onClick' in q ? q.onClick : undefined}
                    style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {tile}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card title="Recent Activity">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {activity.map((a) => {
                const bs = toBs(a.ad)
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Avatar name={a.user} size={26} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.user}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{a.action}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{a.warehouse}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        {bs ? formatBs(bs) : '—'} · {formatAd(a.ad)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Warehouse Insights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {insights.map((i) => (
                <div key={i.text} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <Icon name={i.icon} size={14} style={{ color: STATUS[i.tone].fg, flexShrink: 0, marginTop: 2 }} />
                  <span>{i.text}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Rules over the seeded rows, recomputed on every render — not a model output.
            </p>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Warehouses are closed, never deleted']} />

      {/* ── create transfer ───────────────────────────────────────────── */}
      {modalOpen && (
        <div
          role="presentation"
          onClick={() => setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 'var(--sp-lg)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create stock transfer"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle,
              background: 'var(--modal)',
              boxShadow: 'var(--shadow-modal)',
              borderRadius: 'var(--r-modal)',
              width: 520,
              maxWidth: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Create Stock Transfer</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
              Transfer Type
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TransferType }))} style={selectStyle}>
                {(['Branch Transfer', 'Warehouse Transfer', 'Zone Transfer', 'Temporary Holding', 'Transit'] as TransferType[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                Source Facility
                <Select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} style={selectStyle}>
                  {WAREHOUSES.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                Destination Facility
                <Select value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} style={selectStyle}>
                  {WAREHOUSES.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                Asset
                <Input value={form.item} onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))} placeholder="Sony FX3 Cinema Camera" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                Serial
                <Input value={form.serial} onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))} placeholder="SN-FX3-009" style={inputStyle} />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
              Reason / Notes
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                style={{ ...inputStyle, height: 'auto', padding: 'var(--sp-sm)', resize: 'vertical' }}
              />
            </label>

            {/* Law 12 — errors are inline and persistent; toasts carry successes only. */}
            {formError && <ErrorBanner title="Can't create this transfer" message={formError} />}
            {!formError && transferError && <ErrorBanner title="Transfer was not created" message={transferError} />}

            {/* This note used to promise a workflow that no longer runs: "advance
                one step at a time through the Transfer Center", written when
                `advance()` still existed. It was deleted (see the note in its
                place), the step buttons are disabled with
                `TRANSFER_TRANSITION_UNAVAILABLE` on them, and a modal that
                describes the old behaviour sends the operator looking for
                controls that will not act. */}
            <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              A transfer that is created opens at <strong>Pending</strong> and stays there. Advancing or
              cancelling one is not built in this release — the Transfer Center's step buttons are
              disabled with the reason on them.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
              <Button onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" icon="check" onClick={createTransfer} disabled={formError !== null}>
                Create Transfer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
