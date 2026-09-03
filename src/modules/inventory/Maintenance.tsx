import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd, getBusinessToday } from '../../lib/bs'
import { useViewport } from '../../lib/device'
import { DamageTab } from './DamageTab'
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
import { useAuth } from '../../lib/auth'
import { gateContext } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import { maintenanceGlance, maintenanceDetailGroups } from '../../data/maintenanceIntel'
import { LogMaintenanceModal, type MaintenanceJobPayload } from './modals/LogMaintenanceModal'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


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

/**
 * Hover Intel System v2.1 — three fields added for the Maintenance card
 * (`data/maintenanceIntel.ts`). All three are optional and seeded on real
 * rows only, never invented:
 *
 *  - `linkedCaseId` stays `undefined` on every row below. No case in
 *    `data/cases.ts` shares equipment or a serial with any of the three
 *    seeded jobs here, and the one case that already models this exact
 *    link — CASE-2026-0039, which carries `linked.maintenanceJobId:
 *    'MT-2026-0043'` — points at equipment (a NISI 35mm lens) that isn't one
 *    of the three jobs seeded below. Drawing a link would mean inventing a
 *    row on one side or the other, so the field is left honestly absent
 *    instead. See the report for this gap.
 *
 *    The *other* half of that mismatch is now fixed. This file used to number
 *    its jobs `MNT-1042` while `data/cases.ts`, `data/documents.ts` and
 *    `numbering.ts`'s registry row all use `MT-` — two prefixes for one
 *    entity, which `WIREFRAME_RULINGS_2026-08-12.md` §2.1 rules out. Collapsed
 *    onto the registered `MT` sequence, numeric part unchanged
 *    (`MNT-1042` → `MT-2026-1042`); the 1042–1045 range does not collide with
 *    the seeded MT-2026-0012 / 0018 / 0043. Maintenance is not in the ruling's
 *    prefix table, so the *shape* (`MT-YYYY-NNNN`, as cases.ts and documents.ts
 *    write it) is left exactly as it was rather than de-padded.
 *  - `parts` / `downtimeDays` are seeded on two of the three rows below,
 *    from figures consistent with each row's own `costEstPaisa` /
 *    `costActualPaisa` — never a new invented job.
 */
export interface MaintenanceRecord {
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
  /** CASE-YYYY-NNNN, `data/cases.ts`. Undefined here — see the doc comment above. */
  linkedCaseId?: string
  /** Itemised parts for this job. A missing `costPaisa` means the part's cost is bundled into a vendor's lump-sum quote, not that it is free. */
  parts?: Array<{ name: string; costPaisa?: Paisa }>
  /** Whole days this job has held its equipment out of service so far. */
  downtimeDays?: number
}

const ad = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const MAINTENANCE_DATA: MaintenanceRecord[] = [
  {
    id: 'MT-2026-1042',
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
    bookingImpact: 'B-715',
    // Critical, In Progress, already past its 25 Jul ETA against `TODAY`
    // (31 Jul) — a plausible in-flight downtime count for a job holding a
    // booking. No case matches this equipment; see the interface doc comment.
    downtimeDays: 9,
  },
  {
    id: 'MT-2026-1043',
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
    // At Vendor — the service centre bills a single lump sum, so the part
    // itself is real but its cost isn't broken out separately from
    // `costEstPaisa` above.
    parts: [{ name: 'Full sensor recalibration (vendor service bundle)' }],
  },
  {
    id: 'MT-2026-1045',
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
    // Waiting Parts — the two line items below reconcile exactly with
    // `costActualPaisa` (2500 + 1000 = 3500), not a guessed figure.
    parts: [
      { name: 'Battery cell pack (98Wh)', costPaisa: rupees(2500) },
      { name: 'Output connector board assembly', costPaisa: rupees(1000) },
    ],
    downtimeDays: 3,
  },
]

type FilterKey = MaintenanceStatus | MaintenanceRegistryFlag | MaintenanceCondition | 'All'

/**
 * **Every count on this screen is derived from `MAINTENANCE_DATA` above.**
 *
 * The chips used to be hand-typed — `All 86`, `Completed 54`, `Scheduled 12` —
 * over a seed holding three jobs, and the KPI strip claimed 18 active against
 * the same three rows rendered directly beneath it. Rulings §8: *"a report with
 * no data source shows 'not tracked yet', never zeros… Never seed a plausible
 * default."* A screen that states 86 and shows 3 is the strongest form of that
 * defect, because the contradiction is visible in one glance.
 *
 * The reconciliation guard below is kept — it now checks arithmetic that is
 * derived rather than typed, which is where an invariant belongs.
 */
const STATUS_CHIPS: Array<{ label: FilterKey; count: number }> = [
  { label: 'All', count: MAINTENANCE_DATA.length },
  ...MAINTENANCE_STATUSES.map((s) => ({
    label: s as FilterKey,
    count: MAINTENANCE_DATA.filter((m) => m.status === s).length,
  })),
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

/**
 * Pill counts, keyed by the same union the pills and the filter use — and, like
 * the status chips above, counted off `MAINTENANCE_DATA` rather than typed. The
 * pill is a filter: a pill reading 12 that selects 1 row is a broken control,
 * not just a wrong number.
 */
const PILL_COUNTS: Record<MaintenanceRegistryFlag | MaintenanceCondition, number> = Object.fromEntries([
  ...MAINTENANCE_REGISTRY_FLAGS.map((f) => [f, MAINTENANCE_DATA.filter((m) => (m.flags as string[]).includes(f)).length]),
  ...MAINTENANCE_CONDITIONS.map((c) => [c, MAINTENANCE_DATA.filter((m) => (m.conditions as string[]).includes(c)).length]),
]) as Record<MaintenanceRegistryFlag | MaintenanceCondition, number>

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
/*
 * `height` on a `<td>` behaves as a MINIMUM, so §7.3's row floor
 * ("rows >= 56px") is stated with the token instead of by padding arithmetic;
 * horizontal padding is untouched and taller rows keep the height they had.
 *
 * The reason is data integrity, not density. Column one of every job row is the
 * checkbox feeding the bulk bar and the last column is the row's own action;
 * both carry a 44px hit area that a 10 + one line + 10 row cannot contain. The
 * overhang lands on the neighbouring rows, and the later row in the DOM takes
 * the tap — so a tap near a boundary ticks the job BELOW the one aimed at, and
 * whatever the bulk bar then runs, runs against the wrong maintenance job. At
 * 56 the target sits inside its row and the overlap is gone.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

/** Whole days between two UTC midnights — no calendar arithmetic, so no engine is bypassed. */
const DAY_MS = 86_400_000
const daysFromToday = (d: Date) => Math.round((d.getTime() - TODAY.getTime()) / DAY_MS)

/** The three statuses that mean a job is in flight. Named once so the KPI and any later filter agree. */
const ACTIVE_STATUSES: MaintenanceStatus[] = ['In Progress', 'Waiting Parts', 'At Vendor']

/** Past its estimated completion and not yet finished. `Cancelled` cannot be overdue — it is closed (Law 3's terminal action). */
const isOverdue = (m: MaintenanceRecord): boolean =>
  Boolean(m.estCompletion) && m.status !== 'Completed' && m.status !== 'Cancelled' && daysFromToday(m.estCompletion as Date) < 0

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

/**
 * §7.4's phone layout: `ticket / asset / badge / [primary]`. One card per job,
 * one primary action — the locked alternative to a 1080px table on a 375px
 * screen (`lib/device.ts:139`).
 */
function JobCard({ record: m, money }: { record: MaintenanceRecord; money: boolean }) {
  const bs = m.estCompletion ? toBs(m.estCompletion) : null
  const days = m.estCompletion ? daysFromToday(m.estCompletion) : null
  return (
    <article style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-card)', background: 'var(--card)', padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{m.id}</span>
        <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>{m.equipmentName}</span>
        <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{m.serialNumber}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-xs)' }}>
        <Pill tone={STATUS_TONE[m.status]} icon={STATUS_ICON[m.status]}>{m.status}</Pill>
        {m.flags.map((f) => (
          <Pill key={f} tone={registryFlagTone(f)} icon={MAINTENANCE_REGISTRY_FLAG_ICON[f]} title={REGISTRY_FLAG_TITLE}>
            {f}
          </Pill>
        ))}
        {m.conditions.map((c) => (
          <Pill key={c} tone={MAINTENANCE_CONDITION_META[c].token} icon={MAINTENANCE_CONDITION_META[c].icon} title={MAINTENANCE_CONDITION_META[c].why}>
            {c}
          </Pill>
        ))}
      </div>

      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {m.type} · {m.priority} priority
        {m.technician || m.vendor ? ` · ${m.technician ?? m.vendor}` : ''}
      </div>

      {m.estCompletion && (
        <div className="figure" style={{ fontSize: 'var(--t-meta)', color: days !== null && days < 0 ? 'var(--danger-text)' : 'var(--text2)' }}>
          Due {bs ? formatBs(bs, { suffix: true }) : formatAd(m.estCompletion)} · {formatAd(m.estCompletion)}
          {days !== null && ` · ${days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? 'today' : `in ${days} days`}`}
        </div>
      )}

      {/* §8.3 — omitted for a money-blind role, never blanked. */}
      {money && (
        <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {m.costActualPaisa
            ? `${formatMoney(m.costActualPaisa)} actual`
            : m.costEstPaisa > 0
              ? `${formatMoney(m.costEstPaisa)} estimate`
              : 'Not quoted'}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        {m.bookingImpact ? (
          <Link to={`/rentals/${m.bookingImpact}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}>
            {m.bookingImpact}
          </Link>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>No booking held</span>
        )}
        <Unavailable reason="The maintenance job detail screen is not built yet.">
          <Button icon="external_link" disabled>
            Open job
          </Button>
        </Unavailable>
      </div>
    </article>
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
 * figures that disagree. `components/ui/StateViews`'s dead-Tailwind bug (this
 * comment used to route around it by hand-rolling this banner) was fixed this
 * session — routes through the shared `ErrorBanner` now.
 */
function SeedDefectBanner({ message }: { message: string }) {
  return <ErrorBanner title="These counts do not reconcile." message={message} />
}

/* What `MAINTENANCE_STARTED` is expected to carry. Its only emitter,
   `actions/maintenance/createMaintenanceJob`, is `implemented: false`, so
   nothing reaches the handler yet — the shape is the record it builds. */
type MaintenanceStartedPayload = Pick<MaintenanceRecord, 'equipmentName' | 'type' | 'priority' | 'technician' | 'vendor' | 'bookingImpact'> & {
  id: string
  serialNo: MaintenanceRecord['serialNumber']
  estCompletionAd?: string
  estCostPaisa?: MaintenanceRecord['costEstPaisa']
}

export function Maintenance() {
  const money = useCanViewMoney()
  const { user } = useAuth()
  /* Spec 07 §7.4: "TABLET: same, fewer columns.  PHONE: card rows." — and the
     shell block at the top of all eleven specs repeats "Tables become card rows
     below 768". This table's `minWidth: 1080` made a 375px phone a sideways
     scroll rather than a layout; the sibling Equipment tab in the same page
     (`Inventory.tsx:1815`) already branched and this one did not. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  // gateContext() returns a fresh object literal on every call (see
  // lib/fieldGating.ts), so calling it inline on every render would defeat
  // the useMemo below — its dependency array would never see a stable
  // reference to compare against. Memoized on the one primitive it actually
  // derives from.
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])

  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<'Maintenance' | 'Damage'>('Maintenance')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [isLogMaintenanceOpen, setIsLogMaintenanceOpen] = useState(false)
  const [recordsList, setRecordsList] = useState<MaintenanceRecord[]>(() => [...MAINTENANCE_DATA])

  useDomainEvent<MaintenanceStartedPayload>(EVENT_TYPES.MAINTENANCE_STARTED, (payload) => {
    if (payload?.id) {
      const estDate = payload.estCompletionAd ? new Date(payload.estCompletionAd) : new Date()
      const newRec: MaintenanceRecord = {
        id: payload.id,
        equipmentName: payload.equipmentName,
        serialNumber: payload.serialNo,
        type: payload.type,
        priority: payload.priority,
        status: 'In Progress',
        flags: [],
        conditions: ['Holding a Booking'],
        /* Optional fields are spread in only when present — an explicit
           `undefined` is not a legal value for them. */
        ...(payload.technician !== undefined ? { technician: payload.technician } : {}),
        ...(payload.vendor !== undefined ? { vendor: payload.vendor } : {}),
        estCompletion: estDate,
        costEstPaisa: payload.estCostPaisa ?? (0 as Paisa),
        ...(payload.bookingImpact !== undefined ? { bookingImpact: payload.bookingImpact } : {}),
      }
      setRecordsList((prev) => [newRec, ...prev])
    }
  })

  /**
   * §8.3 — the cost tile is *added* for a role that may see money; it is not a
   * placeholder that a Warehouse session sees blanked. Bookings Held is the
   * figure the floor actually needs, so it is there for everyone.
   */
  /**
   * ⚠ All four counts were hand-typed — 18 / 12 / 4 / 3 — over a seed of three
   * jobs rendered in the table directly below, and the money tile printed a
   * `rupees(45000)` literal under the note "Actual, jobs completed" with no
   * relationship to any row's `costActualPaisa`. Rulings §8 forbids exactly
   * this, and two of the figures were trivially checkable against the rows
   * beside them: Overdue is 1, not 4, and Bookings Held is 1, not 3.
   *
   * Each is now counted off `MAINTENANCE_DATA`, the same source
   * `filteredRecords` renders, so the strip and the list cannot disagree.
   */
  const kpis: Kpi[] = [
    {
      label: 'Active Maintenance',
      value: String(MAINTENANCE_DATA.filter((m) => ACTIVE_STATUSES.includes(m.status)).length),
      icon: 'tool',
      accent: 'progress',
      note: 'In progress, waiting parts, at vendor',
    },
    {
      label: 'Scheduled',
      value: String(MAINTENANCE_DATA.filter((m) => m.status === 'Scheduled').length),
      icon: 'calendar',
      accent: 'primary',
      note: 'Upcoming jobs',
    },
    {
      label: 'Overdue',
      value: String(MAINTENANCE_DATA.filter(isOverdue).length),
      icon: 'timer',
      accent: 'danger',
      note: 'Past estimated completion',
    },
    // Paired with the `Holding a Booking` chip below, and worded so it cannot be read
    // as §1.9's client-scoped `Blocked` flag.
    {
      label: 'Bookings Held',
      value: String(MAINTENANCE_DATA.filter((m) => Boolean(m.bookingImpact)).length),
      icon: 'alert_triangle',
      accent: 'danger',
      note: 'A booking is waiting on a repair',
    },
  ]
  if (money) {
    // `MaintenanceRecord` carries no completion date, so "this month" cannot be
    // selected for and the figure cannot be derived. Rulings §8: it says so,
    // rather than printing a plausible Rs 45,000.
    kpis.push({
      label: 'Cost This Month',
      value: 'Not tracked yet',
      icon: 'receipt',
      accent: 'neutral',
      note: 'No completion date is recorded, so a monthly actual cannot be selected',
    })
  }

  const filteredRecords = useMemo(() => {
    return recordsList.filter((m) => {
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
  }, [
    /* `recordsList` was missing: a record added through the domain event
       landed in state but not on screen until a chip was flicked. */
    recordsList,
    searchQuery,
    activeFilter,
  ])

  /*
   * §HIS v2.1 perf — `maintenanceGlance`/`maintenanceDetailGroups` each build
   * a full field-gated object graph (role/PII/money filtering) per row.
   * Computing them inline inside the table's `.map()` reran that work on
   * every re-render of the whole page (a search keystroke, a chip toggle,
   * etc.) even for rows whose record/gate context hadn't changed. Memoized
   * here per `filteredRecords` + `gctx`, so the builders only rerun when the
   * filtered set or the viewing role/surface actually changes.
   */
  const filteredWithIntel = useMemo(
    () =>
      filteredRecords.map((m) => ({
        record: m,
        glance: maintenanceGlance(m, gctx),
        detail: maintenanceDetailGroups(m, gctx),
      })),
    [filteredRecords, gctx],
  )

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

  /* Law 14 / v4.1 §7.3 — the hit area is 44 everywhere, and here the box itself
     carries it. These status chips were painted 30px tall: under the touch
     minimum, and under even the 34px compact paint §5 allows in a dense strip.

     They grow rather than wear a `.tap` pseudo-element, because nothing stops
     them: the strip is a wrapping flex row that already carries a 34px search
     field and two full-height buttons, so the row was never 30px tall anyway.
     The compact route would have been worse than cosmetic here — this row wraps
     at `--sp-sm` (8px), and a 30px chip carrying a 44px pseudo-element spills 7px
     above and below itself, so on a wrapped line two chips' targets would have
     overlapped by 6px with the lower one winning the click. A real 44px control
     has no such seam.

     `minHeight`, not `height`: 44 is the floor the law sets, not a ceiling the
     chip has to fit inside, so a reader running a larger body size gets a taller
     chip rather than a label pressed against its own border. */
  const chipStyle = (on: boolean) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 'var(--tap)',
    padding: '0 10px',
    borderRadius: 'var(--r-sm)',
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
      {/* §4.1 — the Damage tab the 12 Aug spec asks for. Damage is a different
          question from a repair job (who approves it, what it does to the
          deposit), so it is a tab rather than another status chip on the
          maintenance list. */}
      <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)' }}>
        {(['Maintenance', 'Damage'] as const).map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
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
              {t}
            </button>
          )
        })}
      </div>

      {tab === 'Damage' ? (
        <DamageTab />
      ) : (
        <>
      <KpiStrip items={kpis} columns={money ? 5 : 4} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
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
                borderRadius: 'var(--r-xs)',
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

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <label className="focus-host" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
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
          <Button icon="plus" variant="primary" onClick={() => setIsLogMaintenanceOpen(true)}>
            Log Maintenance
          </Button>
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
        ) : phone ? (
          /* §7.4 PHONE — card rows, one primary action each. */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-md)' }}>
            {filteredRecords.map((m) => (
              <JobCard key={m.id} record={m} money={money} />
            ))}
          </div>
        ) : (
          /* The scroller is flush in the card's top corners (body padding is 0)
             and the header row paints an opaque --th-bg into them, which showed
             as square notches once --r-card went 8 -> 14 (v4.2 §6). `overflowX:
             auto` already makes this element a clip box, so giving it the
             card's top radius rounds the header with it. */
          <div style={{ overflowX: 'auto', borderRadius: 'var(--r-card) var(--r-card) 0 0' }}>
            {/* §7.4 TABLET — "same, fewer columns". Technician, Vendor and
                Booking Impact are dropped there, which takes the 1080px minimum
                down inside the 768–1279 band instead of scrolling it sideways. */}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: desktop ? 1080 : 660 }}>
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
                  {desktop && <th style={th}>Technician</th>}
                  {desktop && <th style={th}>Vendor</th>}
                  <th style={th}>Est. Completion</th>
                  {/* §8.3 — omitted for Warehouse, never blanked. */}
                  {money && <th style={{ ...th, textAlign: 'right' }}>Cost (Est / Actual)</th>}
                  {desktop && <th style={th}>Booking Impact</th>}
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWithIntel.map(({ record: m, glance, detail }) => {
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
                        <IntelCard
                          glance={glance}
                          detail={detail}
                          detailTitle={m.equipmentName}
                          detailSubtitle={`${m.id} · ${m.serialNumber}`}
                        >
                          <span style={{ display: 'block' }}>
                            <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{m.id}</span>
                            <span style={{ display: 'block', fontWeight: 600 }}>{m.equipmentName}</span>
                            <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>{m.serialNumber}</span>
                          </span>
                        </IntelCard>
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
                            marginTop: 'var(--sp-xs)',
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
                          <span style={{ display: 'flex', gap: 'var(--sp-xs)', marginTop: 6, flexWrap: 'wrap' }}>
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
                      {desktop && <td style={td}>{m.technician ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>}
                      {desktop && <td style={td}>{m.vendor ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>}
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
                      {desktop && (
                        <td style={td}>
                          {m.bookingImpact ? (
                            <Link to={`/rentals/${m.bookingImpact}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}>
                              {m.bookingImpact}
                            </Link>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>None</span>
                          )}
                        </td>
                      )}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--text2)', flexWrap: 'wrap' }}>
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
        </>
      )}

      <LogMaintenanceModal
        isOpen={isLogMaintenanceOpen}
        onClose={() => setIsLogMaintenanceOpen(false)}
        onSuccess={(job: MaintenanceJobPayload) => {
          const estDate = job.estCompletionAd ? new Date(job.estCompletionAd) : new Date()
          const newRec: MaintenanceRecord = {
            id: job.id,
            equipmentName: job.equipmentName,
            serialNumber: job.serialNo,
            type: job.type,
            priority: job.priority,
            status: 'In Progress',
            flags: [],
            conditions: ['Holding a Booking'],
            technician: job.technician,
            ...(job.vendor ? { vendor: job.vendor } : {}),
            estCompletion: estDate,
            costEstPaisa: job.estCostPaisa,
            ...(job.bookingImpact ? { bookingImpact: job.bookingImpact } : {}),
          }
          setRecordsList((prev) => [newRec, ...prev])
        }}
      />
    </div>
  )
}
