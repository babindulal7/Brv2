import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import type { StatusKey } from '../../lib/status'
import { formatMoney, type Paisa } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import {
  listSubRentals,
  groupByCounterparty,
  supplierGlance,
  supplierDetailGroups,
  supplierDirectoryRow,
  type SupplierGroup,
  type SupplierDirectoryRow,
  type SubRentalStatus,
  type SubRentalRecord,
} from '../../lib/queries/subrentals'
import type { GateContext } from '../../lib/fieldGating'
import { IconSearch, IconPlus, IconDownload, IconArrowUpRight, IconArrowDownLeft } from '@tabler/icons-react'

export type { SubRentalRecord }



/**
 * The §4 hue for each sub-rental status — the shape `Finance.tsx`'s
 * `INVOICE_TOKEN` already uses, so a screen names a TOKEN and <Badge> owns the
 * paint. This replaces a `getStatusColor()` switch that returned raw CSS
 * variables, and it corrects two of them, both of which were semantic errors
 * rather than styling ones:
 *
 *  - **On Rent / Picked Up returned `var(--info)` — BLUE.** §4 puts On Rent,
 *    Picked Up and Partial Pickup on ORANGE, and §2 gives blue exactly one
 *    meaning: "committed · scheduled". Painting gear that is physically out
 *    with a supplier's client in the committed hue told an operator scanning
 *    the column by colour that the kit was still booked and still on the
 *    shelf. Orange is the one hue that means "out".
 *
 *  - **Reserved returned `var(--ready-text)` — YELLOW.** §2 gives yellow to
 *    "being worked in-house / waiting", which is the workshop: Packed,
 *    Cleaning, Maintenance. A Reserved sub-rental is not being worked on; it
 *    is committed and scheduled, which §4 spells BLUE. The two errors were
 *    each other's mirror, so the column read its lifecycle backwards at the
 *    two moments — leaving and arriving — where being wrong costs the most.
 *
 * Returned / Checked In stay GREEN ("home & ready", §2) and Cancelled stays
 * DIM ("finished / inactive"); those two were already right, and `--good` /
 * `--muted` are simply the pre-token spellings of them.
 */
const SUB_RENTAL_TOKEN: Record<SubRentalStatus, StatusKey> = {
  Reserved: 'primary',
  'Picked Up': 'out',
  'On Rent': 'out',
  Returned: 'in',
  'Checked In': 'in',
  Cancelled: 'dim',
}

type FilterKey = SubRentalStatus | 'All' | 'Overdue'

/*
 * ── The header actions state what they cannot do ───────────────────────────
 *
 * **New Sub-Rental.** What stood here dispatched, from a header button with no
 * gate of any kind:
 *
 *   createSubRental({ itemDescription: 'Sub-Rental Item', costPaisa: 500000 })
 *
 * — a Rs 5,000 vendor cost and a placeholder description that no vendor quoted
 * and no operator typed, reaching a dispatch payload on a single click, followed
 * by `showSuccessToast('New Record', 'Opening Sub-Rental wizard')`. No wizard
 * opens. Nothing on this page creates a sub-rental.
 *
 * The real creation flow exists and is `modals/CreateSubRentalModal.tsx`, which
 * `BookingDetail` mounts — it takes a `bookingId` and is titled for it, because
 * a sub-rental is gear sourced *for a booking*. This index has no booking in
 * hand, and picking one would be the same fabrication one level up. So the
 * button points at the flow instead of imitating it.
 *
 * Two further facts, so the refusal is not merely cosmetic:
 *  · `createSubRental` has no `implemented: true` (`actions/subrentals/
 *    createSubRental.ts`), so `createAction` refuses it before validate/execute
 *    — the dispatch that stood here could never have written anything, while the
 *    toast said it had.
 *  · `TODO(decision)` — its capability is `subrental.create`, and
 *    `actions/core.ts:109-125` maps no rule for that string. An unmapped
 *    capability is denied fail-closed, so *no role* may create a sub-rental
 *    today. Who may is unruled; record it in `PLAN.md` §4 rather than choosing
 *    one here.
 *
 * **Export.** `showSuccessToast('Exporting', 'Generating sub-rental report...')`
 * with nothing behind it — no report is generated, no file is written. Same
 * defect class, same treatment: the control says why instead of claiming work.
 *
 * `Unavailable` is this codebase's "grey it out, but say why" control, and it
 * carries the reason on touch as well as on hover.
 */
function exportSubRentalsCsv(rows: SubRentalRecord[], canViewMoney: boolean) {
  const head = ['Reference', 'Direction', 'Supplier / Client', 'Equipment', 'Quantity', 'Status', 'Start Date', 'End Date', 'Linked Booking']
  if (canViewMoney) head.push('Rental Value (NPR)', 'Revenue / Cost (NPR)')
  const body = rows.map((r) => {
    const cells = [
      r.id,
      r.direction,
      r.counterparty,
      r.equipment,
      String(r.quantity),
      r.status,
      r.startDateAd,
      r.endDateAd,
      r.linkedBooking ?? '',
    ]
    if (canViewMoney) {
      cells.push(
        r.rentalValuePaisa ? formatMoney(r.rentalValuePaisa) : '',
        r.revenuePaisa ? formatMoney(r.revenuePaisa) : (r.costPaisa ? formatMoney(r.costPaisa) : ''),
      )
    }
    return cells
  })
  const csv = [head, ...body]
    .map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `sub-rentals-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const NEW_SUB_RENTAL_REASON =
  'A sub-rental belongs to the booking it supplies. Open that booking and use Create Sub-Rental there — there is no booking-less path, and no rule yet for who may create one.'

/*
 * ── The KPI strip states what it cannot count ──────────────────────────────
 *
 * "30 active · Borrowing (18) · Lending (12)", "Rs 1,20,000", "Rs 80,000" and
 * "33.3%" were string literals over a four-row seed, and the chip row beneath
 * them ("All 48", "Overdue 4", …) was a second set of literals that disagreed
 * with the table it filtered. WIREFRAME_RULINGS §8: a number with no source
 * renders "Not tracked yet".
 *
 *  - The record count and the chip counts are derived from `SUB_RENTAL_DATA`,
 *    the same rows the table renders, so they cannot disagree with it.
 *  - The ₨ totals and the margin have no source: there is no sub-rental
 *    ledger, and summing four seed rows' `revenuePaisa` would print a demo
 *    figure as revenue. They say so instead.
 *
 * TODO(decision) — "Active Records" has no ruled definition (which statuses
 * count as active?). The tile counts every record and says so; rename it
 * once the rule exists.
 */
const NOT_TRACKED = 'Not tracked yet'
const NOT_TRACKED_NOTE = 'No sub-rental ledger is wired yet — there is nothing to total.'



/**
 * **Suppliers directory** — promotes `SUPPLIER_GROUPS` (already grouped by
 * counterparty for the hover card) into a real one-row-per-supplier screen,
 * per HIS v2.1's Tier 3 pass. Lives as a second tab *inside* `SubRental`
 * rather than a fifth entry on `data/inventory.ts`'s `TABS` / a new
 * `App.tsx` route — the same "related view within an existing module, not a
 * new top-level route" convention `Inventory.tsx` already uses for Bundles /
 * Sub Rental / Maintenance / Cases, just one level deeper, since a supplier
 * profile is a view *over Sub Rental's own data*, not a sibling module. That
 * also keeps this change inside a single file already named for this task —
 * `App.tsx` is left untouched.
 *
 * Every field either comes straight off `SupplierDirectoryRow` (which
 * already applied `canViewMoneyField(gctx, 'asset-finance')`, so `financial`
 * is only ever present when the role may see it) or wraps the row in the
 * same `IntelCard` + `supplierGlance`/`supplierDetailGroups` the transaction
 * table's counterparty cell already uses — no new gating logic, no new
 * hover-card content.
 */
function SupplierDirectoryTable({
  rows,
  canSeeFinance,
  gctx,
  search,
  onSearchChange,
}: {
  rows: { group: SupplierGroup; row: SupplierDirectoryRow }[]
  canSeeFinance: boolean
  gctx: GateContext
  search: string
  onSearchChange: (value: string) => void
}) {
  // Perf: `supplierGlance`/`supplierDetailGroups` build a full field-gated
  // object graph per counterparty — memoized here so a re-render of this
  // table (e.g. from an unrelated parent state change) doesn't re-run the
  // gating logic for every row unless `rows` or the gate identity actually
  // changed. `gctx` is itself memoized by the caller (`SubRental`'s own
  // `gctx` below), so depending on the object reference directly is safe —
  // the same convention every other Hover Intel screen's `rowsWithIntel`/
  // `visibleWithIntel` memo already uses.
  const rowsWithIntel = useMemo(
    () =>
      rows.map(({ group, row }) => ({
        row,
        glance: supplierGlance(group, gctx),
        detail: supplierDetailGroups(group, gctx),
      })),
    [rows, gctx],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-lg)' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {rows.length} counterpart{rows.length === 1 ? 'y' : 'ies'} — every Sub Rental record grouped by who it&apos;s with
        </span>
        <div style={{ width: 240 }}>
          <Input
            placeholder="Search supplier name…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            icon={<IconSearch size={16} />}
          />
        </div>
      </div>

      <Card padding="none" style={{ overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <EmptyState
            title="No suppliers match"
            description="Adjust your search to find a sub-rental partner."
            actionLabel="Clear search"
            onAction={() => onSearchChange('')}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--card2)',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '12px 14px' }}>Supplier</th>
                  <th style={{ padding: '12px 14px' }}>Relationship</th>
                  <th style={{ padding: '12px 14px' }}>Units In-House</th>
                  <th style={{ padding: '12px 14px' }}>Records</th>
                  <th style={{ padding: '12px 14px' }}>Last Transaction</th>
                  {canSeeFinance && <th style={{ padding: '12px 14px' }}>Lifetime Revenue &amp; Cost</th>}
                  {canSeeFinance && <th style={{ padding: '12px 14px' }}>Margin</th>}
                </tr>
              </thead>
              <tbody>
                {rowsWithIntel.map(({ row, glance, detail }) => (
                  <tr key={row.counterparty} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <IntelCard
                        glance={glance}
                        detail={detail}
                        detailTitle={row.counterparty}
                        detailSubtitle="Sub-rental partner"
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                          <span
                            aria-hidden
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              flexShrink: 0,
                              display: 'grid',
                              placeItems: 'center',
                              background: 'var(--card2)',
                              border: '1px solid var(--border)',
                              color: 'var(--muted)',
                            }}
                          >
                            <Icon name="truck" size={13} />
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.counterparty}</span>
                            {row.hasOverdueActive && (
                              <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--bad)', marginTop: 2 }}>
                                OVERDUE ACTIVE
                              </span>
                            )}
                          </span>
                        </span>
                      </IntelCard>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {/* The gold mark, from `EXT_MARK` via <Badge tone="ext">
                          rather than hand-rolled a third time. §2 keeps gold
                          outline-only so it can never read as a yellow status,
                          and §3.3 puts it on `--r-chip` (6) — this carried
                          `--r-badge` (999), which §3.3 reserves for numeric
                          count badges. A supplier relationship IS the external
                          -gear axis, so `ext` is the right key here. */}
                      <Badge tone="ext" label={row.relationship} size="sm" />
                    </td>
                    <td className="figure" style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text)' }}>
                      {row.unitsInHouse}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ color: 'var(--text)' }}>
                        {row.activeCount} active
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {row.pastCount} past · {row.totalCount} total
                      </div>
                    </td>
                    <td className="figure" style={{ padding: '12px 14px', color: 'var(--text2)' }}>
                      {row.lastTransactionAd}
                    </td>
                    {canSeeFinance && (
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {row.financial ? formatMoney(row.financial.revenuePaisa) : '—'}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          Cost: {row.financial ? formatMoney(row.financial.costPaisa) : '—'}
                        </div>
                      </td>
                    )}
                    {canSeeFinance && (
                      <td style={{ padding: '12px 14px' }}>
                        {row.financial?.marginPct !== undefined ? (
                          <span
                            className="figure"
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: row.financial.marginPct < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                              color: row.financial.marginPct < 0 ? 'var(--bad)' : 'var(--good)',
                            }}
                          >
                            {row.financial.marginPct > 0 ? '+' : ''}
                            {row.financial.marginPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export function SubRental() {
  const navigate = useNavigate()

  const { user } = useAuth()
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  // §4.1: supplier cost/margin is explicitly excluded from Coordinator ("no
  // supplier margin"), so this reads 'asset-finance', not 'booking'. Every
  // ₨ figure below — the KPI strip, the table's Revenue & Cost column, and
  // the per-row Rental Value line — is gated on this flag rather than
  // rendered and then hidden.
  const canSeeFinance = canViewMoneyField(gctx, 'asset-finance')

  const [records, setRecords] = useState<SubRentalRecord[]>([])

  useEffect(() => {
    let active = true
    listSubRentals().then((res) => {
      if (active) {
        setRecords(res.rows)
      }
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const supplierGroups = useMemo(() => groupByCounterparty(records), [records])

  const recordCount = records.length
  const directionCount = useMemo(() => ({
    Borrowing: records.filter((r) => r.direction === 'Borrowing').length,
    Lending: records.filter((r) => r.direction === 'Lending').length,
  }), [records])

  const filterChips = useMemo(() => (
    ['All', 'Overdue', 'Reserved', 'Picked Up', 'On Rent', 'Returned', 'Checked In'] as const
  ).map((label) => ({
    label,
    count:
      label === 'All'
        ? recordCount
        : label === 'Overdue'
          ? records.filter((r) => r.isOverdue).length
          : records.filter((r) => r.status === label).length,
  })), [records, recordCount])

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [subTab, setSubTab] = useState<'Transactions' | 'Suppliers'>('Transactions')
  const [supplierSearch, setSupplierSearch] = useState('')

  const supplierRows = useMemo(() => {
    const all = Array.from(supplierGroups.values())
      .map((group) => ({ group, row: supplierDirectoryRow(group, gctx) }))
      .sort((a, b) => a.group.counterparty.localeCompare(b.group.counterparty))
    const q = supplierSearch.trim().toLowerCase()
    return q ? all.filter(({ group }) => group.counterparty.toLowerCase().includes(q)) : all
  }, [supplierGroups, gctx, supplierSearch])

  const filteredData = useMemo(() => {
    return records.filter((c) => {
      if (activeFilter === 'Overdue' && !c.isOverdue) return false
      if (activeFilter !== 'All' && activeFilter !== 'Overdue' && c.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          c.id.toLowerCase().includes(q) ||
          c.counterparty.toLowerCase().includes(q) ||
          c.equipment.toLowerCase().includes(q) ||
          (c.linkedBooking && c.linkedBooking.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [records, searchQuery, activeFilter])

  // Perf: same reasoning as `SupplierDirectoryTable`'s `rowsWithIntel` above
  // — `supplierGlance`/`supplierDetailGroups` build a full field-gated
  // object graph per row, so this precomputes it once per relevant change
  // (the filtered rows or the gate identity) instead of re-running it on
  // every render inside the JSX `.map()` (e.g. on every `searchQuery`
  // keystroke that doesn't even change `filteredData`, or any unrelated
  // parent re-render). `gctx` is memoized above, so the object reference is
  // a safe dependency.
  const rowsWithIntel = useMemo(
    () =>
      filteredData.map((c) => {
        // Falls back to a single-transaction group rather than a
        // non-null assertion — every real row's counterparty is
        // present in `supplierGroups` since that map is built from
        // this same `records`, but a card builder degrading
        // gracefully instead of ever throwing matches §6's "a blank
        // page is never acceptable."
        const supplierGroup = supplierGroups.get(c.counterparty) ?? { counterparty: c.counterparty, transactions: [c] }
        return {
          record: c,
          glance: supplierGlance(supplierGroup, gctx),
          detail: supplierDetailGroups(supplierGroup, gctx),
        }
      }),
    [filteredData, supplierGroups, gctx],
  )

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredData.map((c) => c.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const calculateMargin = (revenue: Paisa, cost: Paisa) => {
    if (revenue === 0) return 0
    return ((revenue - cost) / revenue) * 100
  }

  return (
    <PageShell width="full">
      <PageHeader
        breadcrumb={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <Link to="/operations" style={{ color: 'var(--link)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="chevron_left" size={14} />
              Operations
            </Link>
            <span>›</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Sub-Rentals</span>
          </div>
        }
        title="Sub-Rentals"
      />

      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <SegmentedControl
          ariaLabel="Sub-Rental sections"
          options={[
            { id: 'Transactions', label: 'Transactions', icon: 'file' },
            { id: 'Suppliers', label: 'Suppliers Directory', icon: 'users' },
          ]}
          value={subTab}
          onChange={(val) => setSubTab(val as 'Transactions' | 'Suppliers')}
        />
      </div>

      {subTab === 'Suppliers' ? (
        <SupplierDirectoryTable
          rows={supplierRows}
          canSeeFinance={canSeeFinance}
          gctx={gctx}
          search={supplierSearch}
          onSearchChange={setSupplierSearch}
        />
      ) : (
        <>
      {/* KPIs — Law 6 / §4.1: the three ₨ tiles are omitted entirely for a
          role without asset-finance visibility, not rendered then hidden. */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${canSeeFinance ? 4 : 1}, 1fr)`, gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Records
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>
            {recordCount}
          </div>
          <span className="figure" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Borrowing ({directionCount.Borrowing}) · Lending ({directionCount.Lending}) · every record in the table
          </span>
        </Card>
        {canSeeFinance && (
          <>
            <Card padding="md">
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Total Revenue
              </span>
              <div style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                {NOT_TRACKED}
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
                {NOT_TRACKED_NOTE}
              </span>
            </Card>
            <Card padding="md">
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Total Cost
              </span>
              <div style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                {NOT_TRACKED}
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
                {NOT_TRACKED_NOTE}
              </span>
            </Card>
            <Card padding="md">
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Blended Margin
              </span>
              <div style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                {NOT_TRACKED}
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
                {NOT_TRACKED_NOTE}
              </span>
            </Card>
          </>
        )}
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          {filterChips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => setActiveFilter(chip.label)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--r-modal)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: activeFilter === chip.label
                  ? chip.label === 'Overdue' ? '1px solid var(--bad)' : '1px solid var(--nav-active-accent)'
                  : '1px solid var(--border)',
                background: activeFilter === chip.label
                  ? chip.label === 'Overdue' ? 'var(--bad)' : 'var(--nav-active-accent)'
                  : 'var(--card)',
                color: activeFilter === chip.label ? (chip.label === 'Overdue' ? 'var(--on-danger)' : 'var(--on-primary)') : 'var(--text)',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label} <span className="figure" style={{ opacity: 0.85, marginLeft: 'var(--sp-xs)' }}>{chip.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 240 }}>
            <Input
              placeholder="Search SR ID, equipment, partner…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            icon={<IconDownload size={16} />}
            onClick={() => exportSubRentalsCsv(filteredData, canSeeFinance)}
          >
            Export
          </Button>
          {/* Law 6 / §4.1 — the gate this button never had. A sub-rental is a
              vendor cost against a client charge, so it is `asset-finance`
              work, and the same flag that omits the ₨ tiles and the Revenue &
              Cost column omits the control that would create one: forbidden
              items are absent, not disabled (rbac.ts's header rule). Roles
              that MAY see finance get the control with its reason attached,
              because for them the gap is a build gap, not a permission. */}
          {canSeeFinance && (
            <Unavailable reason={NEW_SUB_RENTAL_REASON}>
              <Button variant="primary" disabled icon={<IconPlus size={16} />}>
                New Sub-Rental
              </Button>
            </Unavailable>
          )}
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredData.length === 0 ? (
          <EmptyState
            title="No records found"
            description="Adjust your filters or search query to find sub-rental records."
            actionLabel="Clear Filters"
            onAction={() => {
              setActiveFilter('All')
              setSearchQuery('')
            }}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ width: 36, padding: '12px 14px' }}>
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === filteredData.length && filteredData.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px' }}>SR ID & Direction</th>
                  <th style={{ padding: '12px 14px' }}>Counterparty</th>
                  <th style={{ padding: '12px 14px' }}>Equipment</th>
                  <th style={{ padding: '12px 14px' }}>Dates</th>
                  {canSeeFinance && <th style={{ padding: '12px 14px' }}>Revenue & Cost</th>}
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithIntel.map(({ record: c, glance, detail }) => {
                  return (
                    <tr
                      key={c.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease' }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.has(c.id)}
                          onChange={() => handleToggleRow(c.id)}
                          style={{ accentColor: 'var(--nav-active-accent)' }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{c.id}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', marginTop: 'var(--sp-xs)', color: c.direction === 'Borrowing' ? 'var(--info)' : 'var(--good)' }}>
                          {c.direction === 'Borrowing' ? <IconArrowDownLeft size={14} /> : <IconArrowUpRight size={14} />}
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{c.direction}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <IntelCard
                          glance={glance}
                          detail={detail}
                          detailTitle={c.counterparty}
                          detailSubtitle="Sub-rental partner"
                        >
                          <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text)' }}>{c.counterparty}</span>
                          </span>
                        </IntelCard>
                        {c.linkedBooking && (
                          <Link to={`/rentals/${c.linkedBooking}`} className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'block', textDecoration: 'none' }}>{c.linkedBooking}</Link>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {c.quantity}x {c.equipment}
                        </div>
                        {canSeeFinance && (
                          <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            Rental Value: {formatMoney(c.rentalValuePaisa)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {c.startDateBs} — {c.endDateBs}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {c.startDateAd} — {c.endDateAd}
                        </div>
                      </td>
                      {canSeeFinance && (() => {
                        const marginPct = calculateMargin(c.revenuePaisa, c.costPaisa)
                        return (
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                              <div className="figure" style={{ fontWeight: 600, color: c.status === 'Cancelled' ? 'var(--muted)' : 'var(--text)' }}>
                                {formatMoney(c.revenuePaisa)}
                              </div>
                              {c.status !== 'Cancelled' && (
                                <span className="figure" style={{ fontSize: 'var(--t-th)', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: marginPct < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: marginPct < 0 ? 'var(--bad)' : 'var(--good)' }}>
                                  {marginPct > 0 && '+'}{marginPct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                              Cost: {formatMoney(c.costPaisa)}
                            </div>
                          </td>
                        )
                      })()}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.isOverdue && (
                            <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--bad)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                              OVERDUE
                            </span>
                          )}
                          {/* §8 step 2 — the status is painted by <Badge> and
                              nowhere else. The dot-plus-coloured-word this
                              replaces was colour on TYPE, which §4 does not
                              have: every status is a solid block. */}
                          <Badge tone={SUB_RENTAL_TOKEN[c.status]} label={c.status} size="sm" />
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {/*
                          BUG-006 — `View` navigates to the linked booking, and
                          `linkedBooking` is optional (`:31`). On a contract
                          without one the ternary passed `onClick={undefined}`,
                          so the button rendered fully enabled and did nothing:
                          the dead half was invisible, because the live and dead
                          copies of the button were pixel-identical.

                          A sub-rental with no linked booking is a real state,
                          not a data fault — kit hired in against stock rather
                          than against a specific job — so the row keeps its
                          column and the button states the reason instead of
                          disappearing, which would misalign the column and read
                          as "this row has no action" rather than "this contract
                          has nothing to open".
                        */}
                        {c.linkedBooking ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/rentals/${c.linkedBooking}`)}
                          >
                            View
                          </Button>
                        ) : (
                          <Unavailable reason="This sub-rental is not linked to a booking, so there is nothing to open. Link it to a booking to view the job it was hired for.">
                            <Button variant="secondary" size="sm" disabled>
                              View
                            </Button>
                          </Unavailable>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}
    </PageShell>
  )
}
