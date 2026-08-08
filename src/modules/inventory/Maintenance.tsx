import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd, TODAY } from '../../lib/bs'
import {
  MAINTENANCE_REGISTRY_FLAGS,
  MAINTENANCE_REGISTRY_FLAG_ICON,
  MAINTENANCE_CONDITIONS,
  MAINTENANCE_CONDITION_META,
  REGISTRY_FLAG_TITLE,
  registryFlagTone,
} from '../../data/maintenance'
import type { MaintenanceRegistryFlag, MaintenanceCondition } from '../../data/maintenance'
import { useCanViewMoney } from '../../lib/moneyVisibility'

/**
 * **Maintenance** — the Inventory workspace's fourth tab (Foundation §5.1).
 *
 * Rewritten 6 Aug for three defects:
 *
 *  1. **Invisible chrome.** `components/ui/Card`, `Button` and `Input` are
 *     written in Tailwind classes and no stylesheet in this app imports
 *     Tailwind, so every one of them computed to a transparent, padding-less
 *     box. Rebuilt on `theme.css` tokens like the rest of the workspace.
 *  2. **A money leak.** The Cost column and the "Total Cost (This Month)" tile
 *     rendered for every role, including the Warehouse session this build signs
 *     in as. §8.3 makes money *structurally absent*, so both are omitted.
 *  3. **A banned colour.** `At Vendor` was painted `var(--purple)` — a hue §4.2
 *     bans, and a token `theme.css` does not even define, so it resolved to
 *     nothing. It now takes the gold *outline* §4.2 reserves for equipment in an
 *     external party's hands, which is exactly what At Vendor means.
 *  4. **A redefined Flag registry** (fixed 6 Aug). This file declared its own
 *     `MaintenanceFlag` union carrying `Overdue` — a `lib/workflow.ts` §1.9
 *     registry entry — plus three words that sat close enough to registry
 *     entries to be mistaken for them. `Overdue` now comes from the registry;
 *     the other three are renamed maintenance-record *conditions* and live in
 *     `src/data/maintenance.ts` with the reason each is not a booking flag.
 *     One open question is marked `TODO(decision)` in that file.
 *
 * Dates are stored AD and rendered through `lib/bs`; no BS arithmetic is done
 * here (Foundation §2 — BS is rendered, never stored).
 */

/** A vocabulary for the repair job, not the booking — it does not shadow `BookingStatus`. */
type MaintenanceStatus = 'Scheduled' | 'In Progress' | 'Waiting Parts' | 'At Vendor' | 'Completed' | 'Cancelled'
type MaintenanceType = 'Repair' | 'Service' | 'Calibration' | 'Inspection'
type Priority = 'Low' | 'Medium' | 'High' | 'Critical'

const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'Scheduled',
  'In Progress',
  'Waiting Parts',
  'At Vendor',
  'Completed',
  'Cancelled',
]

interface MaintenanceRecord {
  id: string
  equipmentName: string
  serialNumber: string
  type: MaintenanceType
  priority: Priority
  status: MaintenanceStatus
  /** §1.9 registry flags carried by this record — never a local re-declaration. */
  flags: MaintenanceRegistryFlag[]
  /** Repair-job conditions. Not registry flags; see `data/maintenance.ts`. */
  conditions: MaintenanceCondition[]
  technician?: string
  vendor?: string
  /** AD, UTC. BS is derived at render time. */
  estCompletion?: Date
  costEstPaisa: Paisa
  costActualPaisa?: Paisa
  bookingImpact?: string
}

const ad = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const MAINTENANCE_DATA: MaintenanceRecord[] = [
  {
    id: 'MNT-1042',
    equipmentName: 'RED Komodo X Brain',
    serialNumber: 'SN-RKX-001',
    type: 'Repair',
    priority: 'Critical',
    status: 'In Progress',
    flags: ['Overdue'],
    conditions: ['Under Warranty', 'Holding a Booking'],
    technician: 'Ramesh Dulal',
    estCompletion: ad(2026, 7, 25),
    costEstPaisa: rupees(0),
    bookingImpact: 'BK-2026-0715',
  },
  {
    id: 'MNT-1043',
    equipmentName: 'ARRI Signature Prime 35mm',
    serialNumber: 'SN-ASP-35',
    type: 'Calibration',
    priority: 'High',
    status: 'At Vendor',
    flags: [],
    conditions: ['Repair Approval Pending'],
    vendor: 'ARRI Service Center',
    estCompletion: ad(2026, 8, 3),
    costEstPaisa: rupees(15000),
  },
  {
    id: 'MNT-1045',
    equipmentName: 'Core SWX NANO Micro 98',
    serialNumber: 'SN-NX-012',
    type: 'Inspection',
    priority: 'Medium',
    status: 'Waiting Parts',
    flags: [],
    conditions: [],
    technician: 'Hari Shrestha',
    estCompletion: ad(2026, 8, 8),
    costEstPaisa: rupees(3000),
    costActualPaisa: rupees(3500),
  },
]

type FilterKey = MaintenanceStatus | MaintenanceRegistryFlag | MaintenanceCondition | 'All'

const STATUS_CHIPS: Array<{ label: FilterKey; count: number }> = [
  { label: 'All', count: 86 },
  { label: 'Scheduled', count: 12 },
  { label: 'In Progress', count: 8 },
  { label: 'Waiting Parts', count: 6 },
  { label: 'At Vendor', count: 4 },
  { label: 'Completed', count: 54 },
  { label: 'Cancelled', count: 2 },
]

const CHIP_TOTAL = STATUS_CHIPS.find((c) => c.label === 'All')?.count ?? 0
const CHIP_SUM = STATUS_CHIPS.filter((c) => c.label !== 'All').reduce((a, c) => a + c.count, 0)

/**
 * ⛔ This check used to `throw` here, at module scope. A module-evaluation throw
 * is **uncatchable** — the module is evaluated while React is still loading the
 * lazy route, before anything is mounted, so no boundary catches it and the
 * operator gets a blank white screen with nothing in it. `lib/money.ts` hit
 * exactly this and fixed it by *reporting* the failure instead of throwing.
 *
 * The invariant still runs on every load; the failure is now stated on the
 * screen, above the chips it contradicts, instead of blanking the app.
 */
const CHIP_ERROR: string | null =
  CHIP_SUM === CHIP_TOTAL
    ? null
    : `The status chips sum to ${CHIP_SUM}, but the All chip reads ${CHIP_TOTAL}. They are required to reconcile, so these counts are wrong — see src/modules/inventory/Maintenance.tsx.`

/** Seeded pill counts, keyed by the same union the pills and the filter use. */
const PILL_COUNTS: Record<MaintenanceRegistryFlag | MaintenanceCondition, number> = {
  Overdue: 4,
  'Under Warranty': 12,
  'Holding a Booking': 3,
  'Repair Approval Pending': 5,
}

interface PillChip {
  key: MaintenanceRegistryFlag | MaintenanceCondition
  tone: StatusKey
  icon: IconName
  title: string
  count: number
}

/**
 * The registry flag first, then the repair-job conditions. Tone for the
 * registry flag is read out of §1.9; the conditions bring their own, and each
 * carries the tooltip explaining why it is not a registry flag.
 */
const PILL_CHIPS: PillChip[] = [
  ...MAINTENANCE_REGISTRY_FLAGS.map<PillChip>((f) => ({
    key: f,
    tone: registryFlagTone(f),
    icon: MAINTENANCE_REGISTRY_FLAG_ICON[f],
    title: REGISTRY_FLAG_TITLE,
    count: PILL_COUNTS[f],
  })),
  ...MAINTENANCE_CONDITIONS.map<PillChip>((c) => ({
    key: c,
    tone: MAINTENANCE_CONDITION_META[c].token,
    icon: MAINTENANCE_CONDITION_META[c].icon,
    title: MAINTENANCE_CONDITION_META[c].why,
    count: PILL_COUNTS[c],
  })),
]

/**
 * §4.2 — five hues plus gold. `At Vendor` takes the gold outline: the spec
 * reserves it for kit in an external party's hands, and a service centre is
 * exactly that. Everything else lands on the five.
 */
const STATUS_TONE: Record<MaintenanceStatus, StatusKey> = {
  Scheduled: 'primary',
  'In Progress': 'progress',
  'Waiting Parts': 'progress',
  'At Vendor': 'ext',
  Completed: 'in',
  Cancelled: 'neutral',
}

const STATUS_ICON: Record<MaintenanceStatus, IconName> = {
  Scheduled: 'calendar',
  'In Progress': 'tool',
  'Waiting Parts': 'timer',
  'At Vendor': 'external_link',
  Completed: 'checklist',
  Cancelled: 'close',
}

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

/** Whole days between two UTC midnights — no calendar arithmetic, so no engine is bypassed. */
const DAY_MS = 86_400_000
const daysFromToday = (d: Date) => Math.round((d.getTime() - TODAY.getTime()) / DAY_MS)

function Pill({ tone, icon, title, children }: { tone: StatusKey; icon: IconName; title?: string; children: ReactNode }) {
  const c = STATUS[tone]
  return (
    <span
      title={title}
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
      <Icon name={icon} size={11} />
      {children}
    </span>
  )
}

function exportCsv(rows: MaintenanceRecord[], money: boolean) {
  // Two columns, not one: a booking flag and a repair-job condition are not the same thing.
  const head = [
    'Job',
    'Equipment',
    'Serial',
    'Type',
    'Priority',
    'Status',
    'Booking flags',
    'Repair conditions',
    'Technician',
    'Vendor',
    'Est. completion (AD)',
  ]
  if (money) head.push('Cost')
  const body = rows.map((m) => {
    const cells = [
      m.id,
      m.equipmentName,
      m.serialNumber,
      m.type,
      m.priority,
      m.status,
      m.flags.join(' · ') || '—',
      m.conditions.join(' · ') || '—',
      m.technician ?? '—',
      m.vendor ?? '—',
      m.estCompletion ? formatAd(m.estCompletion) : '—',
    ]
    if (money) cells.push(formatMoney(m.costActualPaisa ?? m.costEstPaisa))
    return cells
  })
  const csv = [head, ...body]
    .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'maintenance.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Foundation §6 — "A blank page is never acceptable. 'Something went wrong' is
 * never acceptable." A reconciliation failure is stated, in place, naming the
 * figures that disagree. Tokens only: `components/ui/StateViews` is written in
 * Tailwind classes that this app never loads (see the file header).
 */
function SeedDefectBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--r-card)',
        border: '1px solid var(--danger)',
        background: 'var(--st-danger-bg)',
        color: 'var(--st-danger-fg)',
        fontSize: 'var(--t-meta)',
        lineHeight: 1.55,
      }}
    >
      <Icon name="alert_triangle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        <strong style={{ display: 'block', marginBottom: 2 }}>These counts do not reconcile.</strong>
        {message}
      </span>
    </div>
  )
}

export function Maintenance() {
  const money = useCanViewMoney()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  /**
   * §8.3 — the cost tile is *added* for a role that may see money; it is not a
   * placeholder that a Warehouse session sees blanked. Bookings Held is the
   * figure the floor actually needs, so it is there for everyone.
   */
  const kpis: Kpi[] = [
    { label: 'Active Maintenance', value: '18', icon: 'tool', accent: 'progress', note: 'In progress, waiting parts, at vendor' },
    { label: 'Scheduled', value: '12', icon: 'calendar', accent: 'primary', note: 'Upcoming jobs' },
    { label: 'Overdue', value: '4', icon: 'timer', accent: 'danger', note: 'Past estimated completion' },
    // Paired with the `Holding a Booking` chip below, and worded so it cannot be read
    // as §1.9's client-scoped `Blocked` flag.
    { label: 'Bookings Held', value: '3', icon: 'alert_triangle', accent: 'danger', note: 'A booking is waiting on a repair' },
  ]
  if (money) {
    kpis.push({ label: 'Cost This Month', value: formatMoney(rupees(45000)), icon: 'receipt', accent: 'neutral', note: 'Actual, jobs completed' })
  }

  const filteredRecords = useMemo(() => {
    return MAINTENANCE_DATA.filter((m) => {
      if (activeFilter !== 'All') {
        if ((MAINTENANCE_STATUSES as string[]).includes(activeFilter)) {
          if (m.status !== activeFilter) return false
        } else if (
          !(m.flags as string[]).includes(activeFilter) &&
          !(m.conditions as string[]).includes(activeFilter)
        ) {
          return false
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          m.id.toLowerCase().includes(q) ||
          m.equipmentName.toLowerCase().includes(q) ||
          m.serialNumber.toLowerCase().includes(q) ||
          Boolean(m.technician?.toLowerCase().includes(q)) ||
          Boolean(m.vendor?.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredRecords.map((m) => m.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const filtersOn = activeFilter !== 'All' || searchQuery.trim().length > 0
  const clearFilters = () => {
    setActiveFilter('All')
    setSearchQuery('')
  }

  const chipStyle = (on: boolean) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    height: 30,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
    fontSize: 'var(--t-meta)',
    fontWeight: on ? 600 : 500,
    cursor: 'pointer' as const,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {CHIP_ERROR && <SeedDefectBanner message={CHIP_ERROR} />}
      <KpiStrip items={kpis} columns={money ? 5 : 4} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {STATUS_CHIPS.map((c) => (
          <button key={c.label} type="button" onClick={() => setActiveFilter(c.label)} aria-pressed={activeFilter === c.label} style={chipStyle(activeFilter === c.label)}>
            {c.label}
            <span className="figure" style={{ color: activeFilter === c.label ? 'var(--nav-active-accent)' : 'var(--muted)' }}>
              {c.count}
            </span>
          </button>
        ))}

        <span aria-hidden style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />

        {PILL_CHIPS.map((c) => {
          const on = activeFilter === c.key
          const tone = STATUS[c.tone]
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveFilter(c.key)}
              aria-pressed={on}
              title={c.title}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 26,
                padding: '0 9px',
                borderRadius: 6,
                border: `1px solid ${on ? tone.fg : 'var(--border)'}`,
                background: on ? tone.bg : 'transparent',
                color: on ? tone.fg : 'var(--muted)',
                fontSize: 'var(--t-th)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={c.icon} size={11} />
              {c.key}
              <span className="figure">{c.count}</span>
            </button>
          )
        })}

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
            <Icon name="search" size={14} style={{ color: 'var(--muted)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search job, equipment, serial…"
              aria-label="Search maintenance jobs"
              style={{ width: 190, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
            />
          </label>
          <Button icon="download" onClick={() => exportCsv(filteredRecords, money)}>
            Export
          </Button>
          <Unavailable reason="Logging a job needs the maintenance intake form, which is not built in this release.">
            <Button icon="plus" variant="primary" disabled>
              Log Maintenance
            </Button>
          </Unavailable>
        </span>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        {filteredRecords.length === 0 ? (
          <div style={{ padding: '24px 16px' }}>
            <EmptyState
              title="No maintenance jobs match"
              description="Adjust the status chips, the flag chips or the search."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  <th style={{ ...th, width: 30 }}>
                    <input
                      type="checkbox"
                      aria-label="Select every job"
                      checked={selectedRowIds.size === filteredRecords.length && filteredRecords.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={th}>Job / Equipment</th>
                  <th style={th}>Type &amp; Priority</th>
                  <th style={th}>Status &amp; Flags</th>
                  <th style={th}>Technician</th>
                  <th style={th}>Vendor</th>
                  <th style={th}>Est. Completion</th>
                  {/* §8.3 — omitted for Warehouse, never blanked. */}
                  {money && <th style={{ ...th, textAlign: 'right' }}>Cost (Est / Actual)</th>}
                  <th style={th}>Booking Impact</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((m) => {
                  const overdue = m.flags.includes('Overdue')
                  const bs = m.estCompletion ? toBs(m.estCompletion) : null
                  const days = m.estCompletion ? daysFromToday(m.estCompletion) : null
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${m.id}`}
                          checked={selectedRowIds.has(m.id)}
                          onChange={() => handleToggleRow(m.id)}
                          style={{ accentColor: 'var(--nav-active-accent)' }}
                        />
                      </td>
                      <td style={td}>
                        <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{m.id}</span>
                        <span style={{ display: 'block', fontWeight: 600 }}>{m.equipmentName}</span>
                        <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>{m.serialNumber}</span>
                      </td>
                      <td style={td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="tool" size={13} style={{ color: 'var(--muted)' }} />
                          {m.type}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'var(--t-th)',
                            marginTop: 4,
                            fontWeight: 600,
                            color:
                              m.priority === 'Critical'
                                ? 'var(--danger-text)'
                                : m.priority === 'High'
                                  ? 'var(--progress-text)'
                                  : 'var(--muted)',
                          }}
                        >
                          {m.priority} priority
                        </span>
                      </td>
                      <td style={td}>
                        <Pill tone={STATUS_TONE[m.status]} icon={STATUS_ICON[m.status]}>
                          {m.status}
                        </Pill>
                        {(m.flags.length > 0 || m.conditions.length > 0) && (
                          <span style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {/* §1.9 registry flags. */}
                            {m.flags.map((f) => (
                              <Pill key={f} tone={registryFlagTone(f)} icon={MAINTENANCE_REGISTRY_FLAG_ICON[f]} title={REGISTRY_FLAG_TITLE}>
                                {f}
                              </Pill>
                            ))}
                            {/* Repair-job conditions — not registry flags; each says why on hover. */}
                            {m.conditions.map((c) => (
                              <Pill
                                key={c}
                                tone={MAINTENANCE_CONDITION_META[c].token}
                                icon={MAINTENANCE_CONDITION_META[c].icon}
                                title={MAINTENANCE_CONDITION_META[c].why}
                              >
                                {c}
                              </Pill>
                            ))}
                          </span>
                        )}
                      </td>
                      <td style={td}>{m.technician ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={td}>{m.vendor ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={td}>
                        {m.estCompletion ? (
                          <>
                            <span className="figure" style={{ display: 'block', fontWeight: 600, color: overdue ? 'var(--danger-text)' : 'var(--text)' }}>
                              {bs ? formatBs(bs, { suffix: true }) : formatAd(m.estCompletion)}
                            </span>
                            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>
                              {formatAd(m.estCompletion)}
                            </span>
                            {days !== null && (
                              <span
                                className="figure"
                                style={{ display: 'block', fontSize: 'var(--t-th)', marginTop: 3, fontWeight: 600, color: days < 0 ? 'var(--danger-text)' : 'var(--success-text)' }}
                              >
                                {days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? 'today' : `in ${days} days`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right' }}>
                          {m.costActualPaisa ? (
                            <>
                              <span className="figure" style={{ display: 'block', fontWeight: 600 }}>{formatMoney(m.costActualPaisa)}</span>
                              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Actual</span>
                            </>
                          ) : m.costEstPaisa > 0 ? (
                            <>
                              <span className="figure" style={{ display: 'block' }}>{formatMoney(m.costEstPaisa)}</span>
                              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Estimate</span>
                            </>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>Not quoted</span>
                          )}
                        </td>
                      )}
                      <td style={td}>
                        {m.bookingImpact ? (
                          <Link to={`/rentals/${m.bookingImpact}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}>
                            {m.bookingImpact}
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>None</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Unavailable reason="The maintenance job detail screen is not built yet.">
                          <Button icon="external_link" disabled>
                            Open job
                          </Button>
                        </Unavailable>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--text2)', flexWrap: 'wrap' }}>
          <span>
            Showing {filteredRecords.length} of {MAINTENANCE_DATA.length} seeded jobs{filtersOn ? ' (filtered)' : ''}
          </span>
          {filtersOn && (
            <button
              type="button"
              onClick={clearFilters}
              style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        A job holds its equipment out of stock for its whole life. Dates are stored AD and rendered BS · AD.
      </p>
    </div>
  )
}
