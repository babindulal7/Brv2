import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../today/useMoneyVisibility'

/**
 * **Bundles** — the Inventory workspace's second tab (Foundation §5.1 makes it a
 * tab, not a sidebar entry).
 *
 * Rewritten 6 Aug for two defects, not for looks:
 *
 *  1. **It was invisible.** Every surface came from `components/ui/Card`,
 *     `Button` and `Input`, which are written in Tailwind utility classes — and
 *     no stylesheet in this app imports Tailwind (`main.tsx` loads
 *     `styles/theme.css` alone). `.bg-slate-900` computes to `transparent`, so
 *     the cards, buttons and inputs rendered as unstyled boxes. Everything here
 *     is on `theme.css` tokens now, which is what the rest of the rebuild uses.
 *  2. **It leaked money.** The Daily Rate column rendered for every role. The
 *     session on this build is Warehouse; Foundation §8.3 makes money
 *     *structurally absent* for that role, so the column is now omitted rather
 *     than blanked.
 */

type BundleStatus = 'Available' | 'Reserved' | 'On Rent' | 'Partially Available' | 'On Maintenance' | 'Archived'

interface BundleItem {
  model: string
  quantity: number
  availableStock: number
}

interface BundleRecord {
  id: string
  name: string
  category: string
  items: BundleItem[]
  crewCount: number
  vehicleCount: number
  boxCount: number
  status: BundleStatus
  linkedBooking?: string
  clientName?: string
  /**
   * AD, UTC. Foundation §3.1 / CLAUDE.md — **BS is rendered, never stored.**
   * These were seeded as `'2083/04/10'` BS strings, which stores the rendered
   * form of a date the app cannot then convert, compare or sort.
   */
  startAd?: Date
  endAd?: Date
  sumOfPartsPaisa: Paisa
  bundleRatePaisa: Paisa
}

const ad = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const BUNDLES_DATA: BundleRecord[] = [
  {
    id: 'BND-00023',
    name: 'RED Komodo X - Indie Package',
    category: 'Camera',
    items: [
      { model: 'RED Komodo X Brain', quantity: 1, availableStock: 1 },
      { model: 'DZOFilm Vespel Prime Set', quantity: 1, availableStock: 1 },
      { model: 'Core SWX NANO Micro 98', quantity: 4, availableStock: 4 },
    ],
    crewCount: 1,
    vehicleCount: 0,
    boxCount: 2,
    status: 'Available',
    sumOfPartsPaisa: rupees(22500),
    bundleRatePaisa: rupees(18000),
  },
  {
    id: 'BND-00024',
    name: 'ARRI Alexa Mini LF - Feature Kit',
    category: 'Camera',
    items: [
      { model: 'ARRI Alexa Mini LF', quantity: 1, availableStock: 0 },
      { model: 'ARRI Signature Prime Set', quantity: 1, availableStock: 0 },
    ],
    crewCount: 2,
    vehicleCount: 1,
    boxCount: 4,
    status: 'On Rent',
    linkedBooking: 'BK-2026-0715',
    clientName: 'Kathmandu Cinema Works',
    startAd: ad(2026, 7, 25),
    endAd: ad(2026, 7, 29),
    sumOfPartsPaisa: rupees(85000),
    bundleRatePaisa: rupees(75000),
  },
  {
    id: 'BND-00025',
    name: 'Podcast Studio Kit (4-Mic)',
    category: 'Audio',
    items: [
      { model: 'Shure SM7B', quantity: 4, availableStock: 3 },
      { model: 'RodeCaster Pro II', quantity: 1, availableStock: 1 },
      { model: 'Cloudlifter CL-1', quantity: 4, availableStock: 4 },
    ],
    crewCount: 0,
    vehicleCount: 0,
    boxCount: 1,
    status: 'Partially Available',
    sumOfPartsPaisa: rupees(9500),
    bundleRatePaisa: rupees(8000),
  },
]

type FilterKey = BundleStatus | 'All'

/**
 * §1.1 chip invariant. The previous build shipped chips that summed to 51 beside
 * an `All` chip reading 42 — and a green tick asserting "All 51" next to it. The
 * counts are corrected and the assertion now *throws* on a mismatch rather than
 * decorating one.
 */
const CHIPS: Array<{ label: FilterKey; count: number }> = [
  { label: 'All', count: 51 },
  { label: 'Available', count: 28 },
  { label: 'Reserved', count: 6 },
  { label: 'On Rent', count: 9 },
  { label: 'Partially Available', count: 5 },
  { label: 'On Maintenance', count: 3 },
]

const CHIP_TOTAL = CHIPS.find((c) => c.label === 'All')?.count ?? 0
const CHIP_SUM = CHIPS.filter((c) => c.label !== 'All').reduce((a, c) => a + c.count, 0)
if (CHIP_SUM !== CHIP_TOTAL) {
  throw new Error(`Bundle chip counts do not reconcile: ${CHIP_SUM} vs total ${CHIP_TOTAL}`)
}

/** §4.2 — five hues. Colour never travels alone; the label rides with it. */
const BUNDLE_TONE: Record<BundleStatus, StatusKey> = {
  Available: 'in',
  Reserved: 'primary',
  'On Rent': 'out',
  'Partially Available': 'progress',
  'On Maintenance': 'progress',
  Archived: 'neutral',
}

const KPIS: Kpi[] = [
  { label: 'Total Bundles', value: '51', icon: 'queues', accent: 'primary', note: 'Excludes archived (7)' },
  { label: 'Available', value: '28', icon: 'checklist', accent: 'success', note: 'Every required item ready' },
  { label: 'On Rent', value: '9', icon: 'truck', accent: 'success', note: 'Currently out with a client' },
  { label: 'Needs Attention', value: '8', icon: 'alert_triangle', accent: 'danger', note: 'Partially available + maintenance' },
]

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

function Unavailable({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <span title={reason} aria-label={reason} style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: BundleStatus }) {
  const c = STATUS[BUNDLE_TONE[status]]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border ?? 'transparent'}`,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={status === 'On Maintenance' ? 'tool' : status === 'On Rent' ? 'truck' : 'box'} size={11} />
      {status}
    </span>
  )
}

function exportCsv(rows: BundleRecord[], money: boolean) {
  const head = ['Bundle ID', 'Bundle', 'Category', 'Items', 'Ready', 'Status', 'Booking']
  if (money) head.push('Daily Rate', 'Sum of Parts')
  const body = rows.map((b) => {
    const equip = b.items.reduce((s, i) => s + i.quantity, 0)
    const ready = b.items.reduce((s, i) => s + Math.min(i.quantity, i.availableStock), 0)
    const cells = [
      b.id,
      b.name,
      b.category,
      String(equip + b.crewCount + b.vehicleCount + b.boxCount),
      `${ready} / ${equip}`,
      b.status,
      b.linkedBooking ?? '—',
    ]
    if (money) cells.push(formatMoney(b.bundleRatePaisa), formatMoney(b.sumOfPartsPaisa))
    return cells
  })
  const csv = [head, ...body]
    .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'bundles.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function Bundles() {
  const navigate = useNavigate()
  const money = useCanViewMoney()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filteredBundles = useMemo(() => {
    return BUNDLES_DATA.filter((b) => {
      if (activeFilter !== 'All' && b.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return b.id.toLowerCase().includes(q) || b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q)
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredBundles.map((b) => b.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const toggleExpanded = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  const calculateSavingPct = (sumOfParts: Paisa, bundleRate: Paisa) => {
    if (sumOfParts === 0) return 0
    return Math.round(((sumOfParts - bundleRate) / sumOfParts) * 100)
  }

  const filtersOn = activeFilter !== 'All' || searchQuery.trim().length > 0
  // checkbox · Bundle · Items · Availability · Booking · [Daily Rate] · Actions
  const columns = money ? 7 : 6

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={KPIS} columns={4} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {CHIPS.map((c) => {
          const on = activeFilter === c.label
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setActiveFilter(c.label)}
              aria-pressed={on}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
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
              <span className="figure" style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }}>
                {c.count}
              </span>
            </button>
          )
        })}

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
            <Icon name="search" size={14} style={{ color: 'var(--muted)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, bundle, category…"
              aria-label="Search bundles"
              style={{ width: 190, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
            />
          </label>
          <Button icon="download" onClick={() => exportCsv(filteredBundles, money)}>
            Export
          </Button>
          <Button icon="plus" variant="primary" onClick={() => navigate('/inventory/bundles/new')}>
            New Bundle
          </Button>
        </span>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        {filteredBundles.length === 0 ? (
          <div style={{ padding: '24px 16px' }}>
            <EmptyState
              title="No bundles found"
              description="Adjust the status chips or the search to find equipment bundles."
              actionLabel="Clear filters"
              onAction={() => {
                setActiveFilter('All')
                setSearchQuery('')
              }}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  <th style={{ ...th, width: 30 }}>
                    <input
                      type="checkbox"
                      aria-label="Select every bundle"
                      checked={selectedRowIds.size === filteredBundles.length && filteredBundles.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={th}>Bundle</th>
                  <th style={th}>Items (Breakdown)</th>
                  <th style={th}>Availability</th>
                  <th style={th}>Current Booking</th>
                  {/* §8.3 — omitted for Warehouse, never blanked. */}
                  {money && <th style={{ ...th, textAlign: 'right' }}>Daily Rate (Equipment Only)</th>}
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBundles.map((b) => {
                  const equipCount = b.items.reduce((sum, i) => sum + i.quantity, 0)
                  const totalItems = equipCount + b.crewCount + b.vehicleCount + b.boxCount
                  const readyEquip = b.items.reduce((sum, i) => sum + Math.min(i.quantity, i.availableStock), 0)
                  const open = expanded.has(b.id)
                  // BS derived at render through the one Date Engine; never stored.
                  const startBs = b.startAd ? toBs(b.startAd) : null
                  const endBs = b.endAd ? toBs(b.endAd) : null

                  return (
                    <Fragment key={b.id}>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: open ? 'var(--card2)' : 'transparent' }}>
                        <td style={td}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${b.name}`}
                            checked={selectedRowIds.has(b.id)}
                            onChange={() => handleToggleRow(b.id)}
                            style={{ accentColor: 'var(--nav-active-accent)' }}
                          />
                        </td>
                        <td style={{ ...td, maxWidth: 240 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span
                              aria-hidden
                              style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                            >
                              <Icon name="queues" size={17} />
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                              <span style={{ fontWeight: 600 }}>{b.name}</span>
                              <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{b.id}</span>
                              <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                                {b.category} <span style={{ color: 'var(--muted)' }}>(Primary)</span>
                              </span>
                            </span>
                          </span>
                        </td>
                        <td style={td}>
                          <span className="figure" style={{ fontWeight: 600 }}>{totalItems} Items</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>
                            {equipCount} Equipment · {b.crewCount} Crew · {b.vehicleCount} Vehicle · {b.boxCount} Boxes
                          </span>
                        </td>
                        <td style={td}>
                          <StatusPill status={b.status} />
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 4 }}>
                            {readyEquip} / {equipCount} ready
                          </span>
                          {readyEquip < equipCount && (
                            <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--danger-text)', marginTop: 3, fontWeight: 600 }}>
                              {equipCount - readyEquip} blocked
                            </span>
                          )}
                        </td>
                        <td style={td}>
                          {b.linkedBooking ? (
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ color: 'var(--text)' }}>{b.clientName}</span>
                              <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--link)', fontWeight: 600 }}>{b.linkedBooking}</span>
                              {b.startAd && b.endAd && (
                                <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                                  {startBs ? formatBs(startBs, { suffix: false }) : formatAd(b.startAd)} —{' '}
                                  {endBs ? formatBs(endBs) : formatAd(b.endAd)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>No active booking</span>
                          )}
                        </td>
                        {money && (
                          <td style={{ ...td, textAlign: 'right' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
                              <span className="figure" style={{ fontWeight: 600 }}>{formatMoney(b.bundleRatePaisa)}</span>
                              <span
                                className="figure"
                                style={{ fontSize: 'var(--t-th)', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--st-in-bg)', color: 'var(--st-in-fg)' }}
                              >
                                Save {calculateSavingPct(b.sumOfPartsPaisa, b.bundleRatePaisa)}%
                              </span>
                            </span>
                            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2, textDecoration: 'line-through' }}>
                              {formatMoney(b.sumOfPartsPaisa)}
                            </span>
                          </td>
                        )}
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Button icon={open ? 'chevron_up' : 'chevron_down'} onClick={() => toggleExpanded(b.id)}>
                            {open ? 'Hide items' : 'View items'}
                          </Button>
                        </td>
                      </tr>

                      {open && (
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                          <td style={td} />
                          <td style={td} colSpan={columns - 1}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {b.items.map((i) => {
                                const short = i.availableStock < i.quantity
                                return (
                                  <span key={i.model} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)' }}>
                                    <span className="figure" style={{ minWidth: 28, fontWeight: 600 }}>{i.quantity}×</span>
                                    <span style={{ color: 'var(--text)' }}>{i.model}</span>
                                    <span
                                      className="figure"
                                      style={{ marginLeft: 'auto', color: short ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 600 }}
                                    >
                                      {i.availableStock} in stock
                                    </span>
                                  </span>
                                )
                              })}
                              <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                                Crew, vehicles and boxes are counted on the bundle, not listed per line.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--text2)', flexWrap: 'wrap' }}>
          <span>
            Showing {filteredBundles.length} of {BUNDLES_DATA.length} seeded bundles
            {filtersOn ? ' (filtered)' : ''}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <Unavailable reason="Bundle detail has no screen yet — only the New Bundle route is built.">
              <Button icon="external_link" disabled>
                Open bundle detail
              </Button>
            </Unavailable>
          </span>
        </div>
      </Card>

      <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        A bundle is available only when every required line is. Availability is derived from stock, never set by hand.
      </p>
    </div>
  )
}
