import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AddBundle } from './AddBundle'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Select } from '../../components/ui/Select'
import { Card, Button, KpiStrip, cardStyle, Rail, SummaryRows } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import type { Kpi } from '../../components/ui/Page'
import { Unavailable } from '../../components/ui/Unavailable'
import { EmptyState } from '../../components/ui/StateViews'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { gateContext } from '../../lib/fieldGating'
import { useMenuFlip } from '../../lib/menuFlip'
import { useViewport } from '../../lib/device'
import { IntelCard } from '../../components/ui/IntelCard'
import {
  bundleGlance,
  bundleDetailGroups,
  BUNDLE_STATES,
  factsOf,
  ratioLabelOf,
  iconFor,
  isPriced,
  type BundleRecord,
  type BundleState,
  type BundleLine,
  type BundleFacts,
} from '../../lib/queries/bundles'
import { useBundleRecords } from '../../lib/queries/useBundles'
import { useRentalWindowParams, dayValue } from '../../lib/rentalWindowParams'
import { DateField } from '../../components/ui/DateField'

/**
 * **Bundles** — Inventory's second tab (Foundation §5.1 makes it a tab, never a
 * sidebar entry; the shell owns the rail).
 *
 * Rebuilt 8 Aug against `06 Inventory/Bundles.PNG` + spec v1.1. What the render
 * had that this did not: the Category `(Primary)` column, the four-line item
 * breakdown with Not-in-Rate markers, the blocked-items expander, BS **above**
 * AD in Current Booking, the Archived chip, the invariant readout, the filter
 * bar, sorting, paging, the selection-gated bulk bar, and the entire right rail
 * — Bundle Preview, the summary donut, Pricing and Quick Actions.
 *
 * What it deliberately does **not** copy from the render: the numbers. §1 is
 * blunt — *"Every number on this page is computed at render. None is stored,
 * seeded or typed."* The old build typed `All 51 · 28 · 6 · 9 · 5 · 3` above
 * three seeded rows; the render types `42` above chips summing to 51, `18 Items`
 * above `14 + 1 + 1 + 3`, and `Save 10%` above a 20% discount. Every one of those
 * is now a function of `data/bundles.ts`, so it cannot drift.
 */

/* ── cell geometry ─────────────────────────────────────────────────────── */

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'bottom',
}

/*
 * `height` on a `<td>` behaves as a MINIMUM, so this states §7.3's row floor
 * ("rows >= 56px") with the token rather than with padding arithmetic, and
 * leaves the horizontal padding alone.
 *
 * It is here for correctness, not for air. Every row starts with the selection
 * checkbox that feeds the bulk bar and ends in a `Menu` trigger, and a 44px hit
 * area does not fit inside 10 + one line + 10. What overflows does not stop at
 * the row edge: it reaches into the rows above and below, and the later row in
 * the DOM wins a tap in that band. A bulk action then runs against a bundle the
 * user never ticked, with nothing on screen to say why. At 56 the target sits
 * inside its own row with room each side, so the overlap cannot form. Rows
 * already taller than the floor do not move — this is a minimum, not a height.
 */
const td: CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top',
}

/* Law 15 — the hit area is the law and `--tap` is the token. Every consumer is
   a Select in the wrapping filter card or the pager, so a taller box costs a
   few pixels of chrome and nothing else. */
const selectStyle: CSSProperties = {
  minHeight: 'var(--tap)',
  padding: '0 8px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const subtle: CSSProperties = { fontSize: 'var(--t-th)', color: 'var(--muted)' }

/* ── small pieces ──────────────────────────────────────────────────────── */

/** §4.2 — colour never travels alone; every pill carries an icon and its label. */
const STATE_TONE: Record<BundleState | 'Archived', StatusKey> = {
  Available: 'in',
  Reserved: 'primary',
  'On Rent': 'out',
  'Partially Available': 'progress',
  'On Maintenance': 'progress',
  Archived: 'neutral',
}

const STATE_ICON: Record<BundleState | 'Archived', IconName> = {
  Available: 'check',
  Reserved: 'calendar_event',
  'On Rent': 'truck',
  'Partially Available': 'alert_triangle',
  'On Maintenance': 'tool',
  Archived: 'box',
}

function StatePill({ state }: { state: BundleState | 'Archived' }) {
  const c = STATUS[STATE_TONE[state]]
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
      <Icon name={STATE_ICON[state]} size={11} />
      {state}
    </span>
  )
}

/**
 * §8 — crew and vehicle ride along so the van is not forgotten, but the money is
 * calculated once, in the Financial Engine. The badge says where.
 */
function NotInRate({ what }: { what: string }) {
  const reason = `Not in the bundle rate — ${what} is priced in the booking's own section, at its own rate.`
  return (
    <span title={reason} style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--muted)' }}>
      <Icon name="info" size={11} label={reason} />
    </span>
  )
}

/** Foundation §3.1 — BS above AD, Latin digits, always with a year. */
function BsAd({ date, prefix }: { date: Date; prefix?: string }) {
  const bs = toBs(date)
  return (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
        {prefix ? `${prefix} ` : ''}
        {bs ? formatBs(bs) : formatAd(date)}
      </span>
      {bs && (
        <span className="figure" style={subtle}>
          {formatAd(date)}
        </span>
      )}
    </span>
  )
}

/** A menu that closes on backdrop click — used by the row `⋮` and the split button. */
function Menu({
  label,
  icon,
  variant,
  items,
}: {
  label: string
  icon?: IconName
  variant?: 'primary' | 'secondary' | 'ghost'
  items: Array<{ key: string; label: string; onSelect?: () => void; reason?: string }>
}) {
  const [open, setOpen] = useState(false)
  // ~32px per row (7px vertical padding + line height) plus the 4px container padding.
  const { ref, up, measure } = useMenuFlip<HTMLSpanElement>(items.length * 32 + 8)
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'transparent', border: 'none', cursor: 'default', zIndex: 20 }}
        />
      )}
      <span aria-haspopup="menu" aria-expanded={open}>
        <Button
          {...(icon ? { icon } : {})}
          {...(variant ? { variant } : {})}
          onClick={() => {
            if (!open) measure()
            setOpen((v) => !v)
          }}
        >
          {label}
        </Button>
      </span>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            ...(up ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
            right: 0,
            zIndex: 21,
            minWidth: 224,
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--shadow-modal)',
            padding: 'var(--sp-xs)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={!it.onSelect}
              title={it.reason}
              aria-label={it.reason ? `${it.label} — ${it.reason}` : it.label}
              onClick={() => {
                it.onSelect?.()
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 9px',
                borderRadius: 'var(--r-xs)',
                border: 'none',
                background: 'transparent',
                color: it.onSelect ? 'var(--text)' : 'var(--disabled)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                cursor: it.onSelect ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

/* ── export ────────────────────────────────────────────────────────────── */

function download(name: string, rows: string[][]) {
  const csv = rows.map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** §11 — for a money-blind session the rate columns are absent from the file too. */
function exportBundles(rows: BundleRecord[], money: boolean) {
  const head = ['Bundle ID', 'Bundle', 'Category', 'State', 'Total Items', 'Equipment', 'Crew', 'Vehicle', 'Boxes/Bags', 'Ready', 'Blocked', 'Booking', 'Client']
  if (money) head.push('Daily Rate', 'Sum of Parts', 'You Save', 'Save %')
  const body = rows.map((b) => {
    const f = factsOf(b)
    const cells = [
      b.id,
      b.name,
      b.category,
      b.archived ? 'Archived' : f.state,
      String(f.totalItems),
      String(f.equipment),
      String(f.crew),
      String(f.vehicle),
      String(f.boxes),
      String(f.readyItems),
      String(f.blockedItems),
      b.booking?.id ?? '—',
      b.booking?.client ?? '—',
    ]
    if (money) {
      cells.push(formatMoney(b.bundleRatePaisa), formatMoney(f.sumOfPartsPaisa), formatMoney(f.savingPaisa), `${f.savingPct}%`)
    }
    return cells
  })
  download('bundles.csv', [head, ...body])
}

function exportOneBundle(b: BundleRecord, money: boolean) {
  const head = ['Bundle ID', 'Group', 'Model', 'Kind', 'Required Qty', 'Units Available', 'Units in Stock', 'Blocked By']
  if (money) head.push('Unit Rate', 'Line Total')
  const body = b.lines.map((l) => {
    const cells = [
      b.id,
      l.group,
      l.model,
      l.kind,
      String(l.quantity),
      String(l.unitsAvailable),
      String(l.unitsStock),
      l.unitsAvailable < l.quantity ? (l.blockedBy ?? '—') : '—',
    ]
    if (money) {
      cells.push(
        isPriced(l) ? formatMoney(l.unitRatePaisa) : 'Not in rate',
        isPriced(l) ? formatMoney((l.unitRatePaisa * l.quantity) as Paisa) : 'Not in rate',
      )
    }
    return cells
  })
  download(`${b.id}-lines.csv`, [head, ...body])
}

/* ── filters and sorting ───────────────────────────────────────────────── */

type ChipKey = BundleState | 'All' | 'Archived'
type SortKey = 'name' | 'category' | 'items' | 'ready' | 'rate'
type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null
type Triple = 'Any' | 'Yes' | 'No'

const SORT_OPTIONS: Array<{ value: string; label: string; money?: boolean }> = [
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'category:asc', label: 'Category A–Z' },
  { value: 'items:desc', label: 'Items, most first' },
  { value: 'ready:asc', label: 'Least ready first' },
  { value: 'rate:desc', label: 'Daily rate, high to low', money: true },
]

const ROWS_PER_PAGE = [10, 25, 50]


/* ── the screen ────────────────────────────────────────────────────────── */

export function Bundles() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isNewBundle = params.get('action') === 'new'
  const money = useCanViewMoney()
  const { user } = useAuth()
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])

  /*
   * §4.44 (ruled 4 Sep 2026) — the window availability is measured against.
   *
   * A bundle is not "available" in the abstract; it is available for a window.
   * The seed baked one figure in as though the question had a single answer,
   * which is why this pane could show `Available` for gear that was out. The
   * window lives in the URL beside `?tab=`, so a checked availability can be
   * linked and shared, and defaults to today→tomorrow: one day, half-open,
   * matching `RENTAL_WINDOW_BOUNDS`.
   */
  const { window: availabilityWindow, setWindow, search: windowSearch } = useRentalWindowParams(
    () => setPage(1),
  )
  const { fromAd, toAd } = availabilityWindow

  const bundles = useBundleRecords(availabilityWindow, money)

  const activeBundles = useMemo(() => bundles.rows.filter((b) => !b.archived), [bundles.rows])
  const archivedBundles = useMemo(() => bundles.rows.filter((b) => b.archived), [bundles.rows])

  /* §1 — every number on this page is computed at render, none is stored. That
     rule is why these move from module scope to here without changing: they were
     always derivations, they just used to derive from a literal. */
  const stateCounts = useMemo(() => {
    const acc = {} as Record<BundleState, number>
    for (const state of BUNDLE_STATES) acc[state] = 0
    for (const b of activeBundles) acc[factsOf(b).state] += 1
    return acc
  }, [activeBundles])

  /* §3 — deliberately overlaps two chips and is never summed with them. A bundle
     that is out is doing its job, so On Rent is not attention. */
  const needsAttention = useMemo(
    () =>
      activeBundles.filter((b) => {
        const state = factsOf(b).state
        return state === 'Partially Available' || state === 'On Maintenance'
      }).length,
    [activeBundles],
  )

  const allCategories = useMemo(
    () => Array.from(new Set(bundles.rows.map((b) => b.category))).sort(),
    [bundles.rows],
  )
  /* Empty against live data — `bundles` has no tags column (§4.44). The filter
     renders its `All` option and nothing else rather than being removed, so the
     day a tags column lands the control is already in place. */
  const allTags = useMemo(
    () => Array.from(new Set(bundles.rows.flatMap((b) => b.tags))).sort(),
    [bundles.rows],
  )


  const [chip, setChip] = useState<ChipKey>('All')
  const [category, setCategory] = useState('All')
  const [tag, setTag] = useState('All')
  const [hasCrew, setHasCrew] = useState<Triple>('Any')
  const [hasVehicle, setHasVehicle] = useState<Triple>('Any')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  /*
    Spec 7.2 draws a bundle-CARD grid, not a table: "TABLET 2-up · PHONE 1-up,
    full-width cards." This defaulted to `'list'` at every width, so a 375px
    phone landed on a 960–1100px table behind a horizontal scrollbar and only a
    manual toggle reached the layout the spec draws. The toggle survives (Law 3
    / Rulings §1 — nothing is deleted) but the width now chooses the default,
    and below 768 the grid is forced: `effectiveView` is what renders, `view`
    is only the operator's desktop preference.
  */
  const viewport = useViewport()
  const [view, setView] = useState<'list' | 'grid'>(() => 'list')
  const effectiveView: 'list' | 'grid' = viewport === 'phone' ? 'grid' : viewport === 'tablet' && view === 'list' ? 'grid' : view
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string>('')
  const [serialsOpen, setSerialsOpen] = useState<Set<string>>(new Set())
  const [groupsClosed, setGroupsClosed] = useState<Set<string>>(new Set())

  const filtersOn =
    chip !== 'All' || category !== 'All' || tag !== 'All' || hasCrew !== 'Any' || hasVehicle !== 'Any'

  const clearAll = () => {
    setChip('All')
    setCategory('All')
    setTag('All')
    setHasCrew('Any')
    setHasVehicle('Any')
    setPage(1)
  }

  const filtered = useMemo(() => {
    const source = chip === 'Archived' ? archivedBundles : activeBundles
    const rows = source.filter((b) => {
      const f = factsOf(b)
      if (chip !== 'All' && chip !== 'Archived' && f.state !== chip) return false
      if (category !== 'All' && b.category !== category) return false
      if (tag !== 'All' && !b.tags.includes(tag)) return false
      if (hasCrew !== 'Any' && (f.crew > 0) !== (hasCrew === 'Yes')) return false
      if (hasVehicle !== 'Any' && (f.vehicle > 0) !== (hasVehicle === 'Yes')) return false
      return true
    })

    if (!sort) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const fa = factsOf(a)
      const fb = factsOf(b)
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * dir
        case 'category':
          return (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) * dir
        case 'items':
          return (fa.totalItems - fb.totalItems || a.name.localeCompare(b.name)) * dir
        case 'ready':
          return (fa.readyItems / fa.totalItems - fb.readyItems / fb.totalItems || a.name.localeCompare(b.name)) * dir
        case 'rate':
          return (a.bundleRatePaisa - b.bundleRatePaisa || a.name.localeCompare(b.name)) * dir
        default:
          return 0
      }
    })
  }, [chip, category, tag, hasCrew, hasVehicle, sort, activeBundles, archivedBundles])

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * rowsPerPage
  const visible = useMemo(
    () => filtered.slice(start, start + rowsPerPage),
    [filtered, start, rowsPerPage],
  )

  /*
   * §HIS v2.1 perf — `bundleGlance`/`bundleDetailGroups` each build a full
   * field-gated object graph (role/PII/money filtering) per row. Computing
   * them inline inside the table's `.map()` reran that work on every
   * re-render of the whole page (a search keystroke, a chip toggle, etc.)
   * even for rows whose bundle/gate context hadn't changed. Memoized here
   * per page of `visible` rows + `gctx`, so the builders only rerun when the
   * page's rows or the viewing role/surface actually change.
   */
  const visibleWithIntel = useMemo(
    () =>
      visible.map((b) => ({
        bundle: b,
        glance: bundleGlance(b, gctx),
        detail: bundleDetailGroups(b, gctx),
      })),
    [visible, gctx],
  )

  const preview = filtered.find((b) => b.id === previewId) ?? filtered[0] ?? activeBundles[0]
  const previewFacts = preview ? factsOf(preview) : null

  /* §1 — chips, the invariant and the KPI cards all read one query. */
  const chipRow: Array<{ label: ChipKey; count: number }> = [
    { label: 'All', count: activeBundles.length },
    ...BUNDLE_STATES.map((s) => ({ label: s as ChipKey, count: stateCounts[s] })),
    { label: 'Archived', count: archivedBundles.length },
  ]
  const chipSum = BUNDLE_STATES.reduce((sum, k) => sum + stateCounts[k], 0)
  const chipsReconcile = chipSum === activeBundles.length

  const kpis: Kpi[] = [
    {
      label: 'Total Bundles',
      value: String(activeBundles.length),
      icon: 'queues',
      accent: 'primary',
      note: `Excludes archived (${archivedBundles.length})`,
    },
    {
      // §3 — "`Availables` is not a word. The card is Available, matching its chip."
      label: 'Available',
      value: String(stateCounts.Available),
      icon: 'check',
      accent: 'success',
      note: 'Ready to rent',
    },
    {
      label: 'On Rent',
      value: String(stateCounts['On Rent']),
      icon: 'truck',
      accent: 'progress',
      note: 'Currently out with a client',
    },
    {
      label: 'Needs Attention',
      value: String(needsAttention),
      icon: 'alert_triangle',
      accent: 'danger',
      note: 'Partial, blocked or maintenance',
    },
  ]

  const allOnPageSelected = visible.length > 0 && visible.every((b) => selected.has(b.id))
  const toggleAllOnPage = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) visible.forEach((b) => next.delete(b.id))
      else visible.forEach((b) => next.add(b.id))
      return next
    })
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleIn = (set: Set<string>, apply: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const sortHeader = (key: SortKey, label: string, sub?: string, align: 'left' | 'right' = 'left') => {
    const on = sort?.key === key
    const ariaSort: 'ascending' | 'descending' | 'none' = on
      ? sort?.dir === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none'
    return (
      <th style={{ ...th, textAlign: align }} aria-sort={ariaSort} scope="col">
        <button
          type="button"
          onClick={() =>
            setSort((prev) =>
              prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null,
            )
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-xs)',
            border: 'none',
            background: 'transparent',
            padding: 0,
            color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
            font: 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {label}
          <Icon name={on && sort?.dir === 'desc' ? 'arrow_down' : 'arrow_up'} size={11} style={{ opacity: on ? 1 : 0.3 }} />
        </button>
        {sub && <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>{sub}</span>}
      </th>
    )
  }

  if (isNewBundle) {
    return (
      <AddBundle
        embedded
        onDone={() => {
          const next = new URLSearchParams(params)
          next.delete('action')
          setParams(next, { replace: true })
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Create and manage equipment kits and rental packages.
        </p>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <Unavailable reason="Import is not built — there is no bundle intake pipeline in this release.">
            <Button icon="upload" disabled>
              Import
            </Button>
          </Unavailable>
          <Button icon="download" onClick={() => exportBundles(filtered, money)}>
            Export
          </Button>
          <Button
            icon="plus"
            variant="primary"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.set('action', 'new')
              setParams(next, { replace: true })
            }}
          >
            New Bundle
          </Button>
          <Menu
            label="More"
            icon="chevron_down"
            items={[
              {
                key: 'blank',
                label: 'Start a blank bundle',
                onSelect: () => {
                  const next = new URLSearchParams(params)
                  next.set('action', 'new')
                  setParams(next, { replace: true })
                },
              },
              {
                key: 'dup',
                label: preview ? `Duplicate ${preview.id}` : 'Duplicate a bundle',
                onSelect: () => {
                  const next = new URLSearchParams(params)
                  next.set('action', 'new')
                  setParams(next, { replace: true })
                },
              },
              {
                key: 'tpl',
                label: 'Import a bundle template',
                reason: 'Templates are not built — there is no template store in this release.',
              },
            ]}
          />
        </span>
      </div>

      {/* Rulings §7 — the Bundle preview rail sits beside the grid at desktop
          and reflows inline beneath it below 1280, never behind a handle. */}
      <div style={{ display: 'grid', gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={kpis} columns={4} />

          {/* §2 — chips, then the invariant readout that can fail (§1.1). */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {chipRow.map((c) => {
              const on = chip === c.label
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    setChip(c.label)
                    setPage(1)
                  }}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 30,
                    padding: '0 10px',
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
                  <span className="figure" style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }}>
                    {c.count}
                  </span>
                </button>
              )
            })}

            <span
              aria-live="polite"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 'var(--t-th)',
                fontWeight: 600,
                color: chipsReconcile ? 'var(--success-text)' : 'var(--ready-text)',
              }}
            >
              <Icon name={chipsReconcile ? 'check' : 'alert_triangle'} size={12} />
              <span className="figure">
                {BUNDLE_STATES.map((s) => stateCounts[s]).join(' + ')} = {chipSum}
              </span>
              {chipsReconcile
                ? ` · All ${activeBundles.length}`
                : ` — does not reconcile against All ${activeBundles.length}`}
            </span>
          </div>

          {/*
            §4.44 — the window every availability figure on this page is measured
            against. It sits ABOVE the filters and is separated from them,
            because it is not a filter: it does not decide which bundles are
            listed, it decides what "available" means for all of them. Putting it
            in the filter row would have read as one more narrowing control.
          */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-sm)',
              flexWrap: 'wrap',
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 'var(--r-input)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
              <Icon name="calendar" size={14} />
              Available for
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              From
              <DateField
                ariaLabel="Availability window from"
                value={dayValue(fromAd)}
                onChange={(v) => setWindow('from', v)}
                showBs={false}
                style={selectStyle}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              To
              <DateField
                ariaLabel="Availability window to"
                value={dayValue(toAd)}
                onChange={(v) => setWindow('to', v)}
                showBs={false}
                align="right"
                style={selectStyle}
              />
            </label>
            <BsAd date={new Date(fromAd)} prefix="From" />
            <BsAd date={new Date(toAd)} prefix="To" />
            <span style={{ ...subtle, flexBasis: '100%' }}>
              Every ready / blocked figure below answers “free for this window”, not “free in
              general”. Returns are half-open: a rental ending on the To date does not block it.
            </span>
          </div>

          {/* Filter bar — the render's row, with every control wired to state. */}
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
              <Icon name="checklist" size={14} />
              Filters
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Category
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} style={selectStyle}>
                <option value="All">All</option>
                {allCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Tags
              <Select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1) }} style={selectStyle}>
                <option value="All">All</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Contains Crew
              <Select value={hasCrew} onChange={(e) => { setHasCrew(e.target.value as Triple); setPage(1) }} style={selectStyle}>
                <option value="Any">Any</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </Select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Contains Vehicle
              <Select value={hasVehicle} onChange={(e) => { setHasVehicle(e.target.value as Triple); setPage(1) }} style={selectStyle}>
                <option value="Any">Any</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </Select>
            </label>
            {filtersOn ? (
              <Button icon="close" onClick={clearAll}>
                Clear All
              </Button>
            ) : (
              <Unavailable reason="No filter is set, so there is nothing to clear.">
                <Button icon="close" disabled>
                  Clear All
                </Button>
              </Unavailable>
            )}

            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Sort by
                <Select
                  value={sort ? `${sort.key}:${sort.dir}` : 'none'}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === 'none') {
                      setSort(null)
                      return
                    }
                    const [key = 'name', dir = 'asc'] = raw.split(':')
                    setSort({ key: key as SortKey, dir: dir === 'desc' ? 'desc' : 'asc' })
                  }}
                  style={selectStyle}
                >
                  <option value="none">Unsorted</option>
                  {SORT_OPTIONS.filter((o) => !o.money || money).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </label>
              <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                {(['list', 'grid'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    /* `effectiveView`, not `view` — below 768 the width forces the
                       grid, so the pressed state has to say what is rendering. */
                    aria-pressed={effectiveView === v}
                    aria-label={v === 'list' ? 'List view' : 'Grid view'}
                    style={{
                      // Law 15 — 44×44 at every width; this was 34×32.
                      minWidth: 44,
                      minHeight: 44,
                      display: 'grid',
                      placeItems: 'center',
                      border: 'none',
                      background: effectiveView === v ? 'var(--nav-active-bg)' : 'var(--card)',
                      color: effectiveView === v ? 'var(--nav-active-accent)' : 'var(--text2)',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name={v === 'list' ? 'checklist' : 'queues'} size={15} />
                  </button>
                ))}
              </span>
            </span>
          </div>

          <Card bodyStyle={{ padding: 0 }}>
            <PageBody
              loading={bundles.loading}
              error={bundles.error}
              onRetry={bundles.refetch}
              hasRows={bundles.rows.length > 0}
              empty={bundles.isEmpty}
              noun="bundles"
              emptyTitle="No bundles yet"
              emptyMessage="Nothing has been built as a bundle. Create one and it appears here."
            >
            {visible.length === 0 ? (
              <EmptyState
                icon={<Icon name="queues" size={22} />}
                title="No bundles match these filters"
                description={
                  chip === 'Archived'
                    ? 'Nothing is on the archive shelf.'
                    : 'Adjust the status chips or the filter row above.'
                }
                actionLabel="Clear all filters"
                onAction={clearAll}
              />
            ) : effectiveView === 'grid' ? (
              <div
                style={{
                  display: 'grid',
                  // Spec 7.2 sets the bands explicitly — TABLET 2-up, PHONE
                  // 1-up full-width — rather than letting `auto-fill` decide.
                  gridTemplateColumns:
                    viewport === 'phone' ? '1fr' : viewport === 'tablet' ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fill, minmax(232px, 1fr))',
                  gap: 10,
                  padding: 'var(--sp-md)',
                }}
              >
                {visible.map((b) => {
                  const f = factsOf(b)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPreviewId(b.id)}
                      aria-pressed={preview?.id === b.id}
                      style={{
                        ...cardStyle,
                        textAlign: 'left',
                        padding: 11,
                        cursor: 'pointer',
                        borderColor: preview?.id === b.id ? 'var(--nav-active-accent)' : 'var(--border)',
                        font: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                        <span
                          aria-hidden
                          style={{ width: 30, height: 30, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                        >
                          <Icon name={iconFor(b.category)} size={15} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{b.name}</span>
                          <span className="identifier" style={{ ...subtle, display: 'block' }}>{b.id}</span>
                        </span>
                      </span>
                      <StatePill state={b.archived ? 'Archived' : f.state} />
                      <span className="figure" style={{ ...subtle }}>
                        {f.totalItems} items · {ratioLabelOf(f)}
                      </span>
                      {money && (
                        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                          {formatMoney(b.bundleRatePaisa)}
                          <span style={{ ...subtle, marginLeft: 6, textDecoration: 'line-through' }}>
                            {formatMoney(f.sumOfPartsPaisa)}
                          </span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              /* Flush in the card's top corners with an opaque --th-bg header
                 behind it; takes the card radius so the header does not paint
                 square notches over the 14px arc. See Maintenance.tsx. */
              <div style={{ overflowX: 'auto', borderRadius: 'var(--r-card) var(--r-card) 0 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: money ? 1100 : 960 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      <th style={{ ...th, width: 30 }} scope="col">
                        <input
                          type="checkbox"
                          aria-label="Select every bundle on this page"
                          checked={allOnPageSelected}
                          onChange={toggleAllOnPage}
                          style={{ accentColor: 'var(--nav-active-accent)' }}
                        />
                      </th>
                      {sortHeader('name', 'Bundle')}
                      {sortHeader('category', 'Category', '(Primary)')}
                      {sortHeader('items', 'Items', '(Breakdown)')}
                      {sortHeader('ready', 'Availability')}
                      <th style={th} scope="col">
                        Current Booking
                        <span style={{ display: 'block', ...subtle, fontWeight: 400 }}>(Client &amp; Dates)</span>
                      </th>
                      {/* §11 — omitted for a money-blind session, never blanked. */}
                      {money && sortHeader('rate', 'Daily Rate', '(Equipment Only)', 'right')}
                      <th style={{ ...th, textAlign: 'right' }} scope="col">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWithIntel.map(({ bundle: b, glance, detail }) => {
                      const f = factsOf(b)
                      const open = expanded.has(b.id)
                      const isPreview = preview?.id === b.id
                      const showBlocked = f.state === 'Partially Available' || f.state === 'On Maintenance'
                      return (
                        <tr
                          key={b.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isPreview ? 'var(--nav-active-bg)' : 'transparent',
                          }}
                        >
                          <td style={td}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${b.name}`}
                              checked={selected.has(b.id)}
                              onChange={() => toggleRow(b.id)}
                              style={{ accentColor: 'var(--nav-active-accent)' }}
                            />
                          </td>

                          <td style={{ ...td, maxWidth: 250 }}>
                            <IntelCard
                              glance={glance}
                              detail={detail}
                              detailTitle={b.name}
                              detailSubtitle={`${b.id} · ${b.category}`}
                            >
                              <button
                                type="button"
                                onClick={() => setPreviewId(b.id)}
                                aria-pressed={isPreview}
                                title="Show this bundle in the preview rail"
                                style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }}
                              >
                                <span
                                  aria-hidden
                                  style={{ width: 38, height: 34, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                                >
                                  <Icon name={iconFor(b.category)} size={17} />
                                </span>
                                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                  <span style={{ fontWeight: 600 }}>{b.name}</span>
                                  <span className="identifier" style={subtle}>
                                    {b.id}
                                  </span>
                                </span>
                              </button>
                            </IntelCard>
                          </td>

                          <td style={td}>
                            <span style={{ display: 'block' }}>{b.category}</span>
                            <span style={{ display: 'block', ...subtle }}>(Primary)</span>
                          </td>

                          <td style={td}>
                            <span className="figure" style={{ fontWeight: 600 }}>
                              {f.totalItems} Items
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3 }}>
                              <span className="figure" style={subtle}>
                                {f.equipment} Equipment
                              </span>
                              <span className="figure" style={subtle}>
                                {f.crew} Crew <NotInRate what="crew" />
                              </span>
                              <span className="figure" style={subtle}>
                                {f.vehicle} Vehicle <NotInRate what="transport" />
                              </span>
                              <span className="figure" style={subtle}>
                                {f.boxes} Boxes/Bags
                              </span>
                            </span>
                          </td>

                          <td style={{ ...td, minWidth: 190 }}>
                            <StatePill state={b.archived ? 'Archived' : f.state} />
                            <span className="figure" style={{ display: 'block', ...subtle, marginTop: 'var(--sp-xs)' }}>
                              {ratioLabelOf(f)}
                            </span>
                            {showBlocked ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => toggleIn(expanded, setExpanded, b.id)}
                                  aria-expanded={open}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--sp-xs)',
                                    marginTop: 3,
                                    padding: 0,
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--danger-text)',
                                    fontSize: 'var(--t-th)',
                                    fontWeight: 700,
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {f.blockedItems} blocked
                                  <Icon name={open ? 'chevron_up' : 'chevron_down'} size={11} />
                                </button>
                                {open && (
                                  <span style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 5 }}>
                                    {f.blockedLines.map((l) => (
                                      <span key={l.model} style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 'var(--t-th)', color: 'var(--text)', fontWeight: 600 }}>
                                          {l.model} — short by {l.quantity - l.unitsAvailable} ({l.blockedBy})
                                        </span>
                                        {l.freesAd ? (
                                          <BsAd date={l.freesAd} prefix="Returns" />
                                        ) : (
                                          <span style={subtle}>No return date recorded</span>
                                        )}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ display: 'block', ...subtle, marginTop: 3 }}>
                                {f.state === 'On Rent'
                                  ? 'All items out'
                                  : f.state === 'Reserved'
                                    ? 'For upcoming booking'
                                    : 'All items available'}
                              </span>
                            )}
                          </td>

                          <td style={td}>
                            {b.booking ? (
                              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Link
                                  to={`/rentals/${b.booking.id}`}
                                  className="identifier"
                                  style={{ fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600 }}
                                >
                                  {b.booking.id}
                                </Link>
                                <span style={{ color: 'var(--text2)', fontSize: 'var(--t-th)' }}>{b.booking.client}</span>
                                <BsAd date={b.booking.startAd} />
                                <BsAd date={b.booking.endAd} prefix="Return:" />
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>—</span>
                            )}
                          </td>

                          {money && (
                            <td style={{ ...td, textAlign: 'right' }}>
                              <span className="figure" style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-ui)' }}>
                                {formatMoney(b.bundleRatePaisa)}
                              </span>
                              <span className="figure" style={{ display: 'block', ...subtle, textDecoration: 'line-through' }}>
                                {formatMoney(f.sumOfPartsPaisa)}
                              </span>
                              <span
                                className="figure"
                                style={{
                                  display: 'inline-block',
                                  marginTop: 3,
                                  fontSize: 'var(--t-th)',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: 'var(--st-in-bg)',
                                  color: 'var(--st-in-fg)',
                                }}
                              >
                                Save {f.savingPct}%
                              </span>
                            </td>
                          )}

                          <td style={{ ...td, textAlign: 'right' }}>
                            <Menu
                              label=""
                              icon="more_vert"
                              variant="ghost"
                              items={[
                                { key: 'preview', label: 'Show in preview rail', onSelect: () => setPreviewId(b.id) },
                                { key: 'csv', label: 'Export this bundle’s lines', onSelect: () => exportOneBundle(b, money) },
                                b.booking
                                  ? {
                                      key: 'booking',
                                      label: `Open booking ${b.booking.id}`,
                                      onSelect: () => navigate(`/rentals/${b.booking?.id}`),
                                    }
                                  : {
                                      key: 'booking',
                                      label: 'Open booking',
                                      reason: 'This bundle is not on a booking right now.',
                                    },
                                {
                                  key: 'detail',
                                  label: 'Open bundle detail',
                                  /* The window travels with the link (§4.44): the
                                     detail page must answer availability for the
                                     same dates this row was measured against. */
                                  onSelect: () => navigate(`/inventory/bundles/${b.id}${windowSearch}`),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* §4.5 / §5.3 — the bulk bar appears only when a selection exists. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-md)',
                padding: '10px 14px',
                borderTop: '1px solid var(--border)',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                flexWrap: 'wrap',
              }}
            >
              {selected.size > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {selected.size} selected
                  </span>
                  <Menu
                    label="Bulk Actions"
                    icon="chevron_down"
                    items={[
                      {
                        key: 'export',
                        label: `Export ${selected.size} selected`,
                        onSelect: () => exportBundles(filtered.filter((b) => selected.has(b.id)), money),
                      },
                      { key: 'clear', label: 'Clear selection', onSelect: () => setSelected(new Set()) },
                      {
                        key: 'archive',
                        label: 'Archive selected',
                        reason: 'Archiving writes to the database, and this build has no write path yet.',
                      },
                    ]}
                  />
                </span>
              )}

              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
                <span className="figure">
                  Showing {filtered.length === 0 ? 0 : start + 1} to {Math.min(start + rowsPerPage, filtered.length)} of{' '}
                  {filtered.length} bundles
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...subtle }}>
                  Rows per page
                  <Select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    style={selectStyle}
                  >
                    {ROWS_PER_PAGE.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </label>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Button icon="chevron_left" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                    Prev
                  </Button>
                  <span className="figure" style={{ minWidth: 58, textAlign: 'center' }}>
                    {safePage} / {pageCount}
                  </span>
                  <Button icon="chevron_right" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                    Next
                  </Button>
                </span>
              </span>
            </div>
            </PageBody>
          </Card>

          <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            A bundle stores models, never serials — serials are assigned at packing from whatever is free. A bundle is
            unavailable only when no unit of a required model is free.
          </p>
        </div>

        {/* ── right rail ─────────────────────────────────────────────────── */}
        {(() => {
          const railContent = (
          <>
          {preview && previewFacts ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <PreviewCard
                bundle={preview}
                facts={previewFacts}
                detailTo={`/inventory/bundles/${preview.id}${windowSearch}`}
                closed={groupsClosed}
                onToggleGroup={(g) => toggleIn(groupsClosed, setGroupsClosed, g)}
                serialsOpen={serialsOpen}
                onToggleSerials={(m) => toggleIn(serialsOpen, setSerialsOpen, m)}
              />
              <SummaryCard bundle={preview} facts={previewFacts} />
              {/* §11 — the Pricing panel is not rendered for a money-blind session. */}
              {money && <PricingCard bundle={preview} facts={previewFacts} />}
              <QuickActionsCard bundle={preview} money={money} />
            </div>
          ) : (
            <Card title="Bundle Preview">
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                No bundle is selected. Choose a row to preview its models.
              </p>
            </Card>
          )}
          </>
          )
          return viewport === 'desktop' ? <Rail width={324} label="Bundle preview">{railContent}</Rail> : railContent
        })()}
      </div>
    </div>
  )
}

/* ── rail cards ────────────────────────────────────────────────────────── */

/**
 * §5 — the model tree. Each line shows the model, the quantity required and
 * **stock availability**: `Sony FX3 Body ×1 — 1 of 3 available`.
 *
 * §10 — serials sit behind an expander because the bundle does not hold them.
 * The expander says so, rather than inventing serial numbers this build has no
 * source for.
 */
function PreviewCard({
  bundle,
  facts,
  detailTo,
  closed,
  onToggleGroup,
  serialsOpen,
  onToggleSerials,
}: {
  bundle: BundleRecord
  facts: BundleFacts
  /** Built by the pane so the caller's window rides along — see §4.44. */
  detailTo: string
  closed: Set<string>
  onToggleGroup: (g: string) => void
  serialsOpen: Set<string>
  onToggleSerials: (m: string) => void
}) {
  const groups: Array<{ name: string; lines: BundleLine[] }> = []
  for (const l of bundle.lines) {
    const found = groups.find((g) => g.name === l.group)
    if (found) found.lines.push(l)
    else groups.push({ name: l.group, lines: [l] })
  }

  return (
    <Card
      title="Bundle Preview"
      action={
        <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', padding: '2px 6px' }}>
          {bundle.id}
        </span>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 'var(--sp-sm)' }}>
        <Icon name={iconFor(bundle.category)} size={15} style={{ color: 'var(--text2)' }} />
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{bundle.name}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.map((g) => {
          const open = !closed.has(`${bundle.id}:${g.name}`)
          const count = g.lines.reduce((s, l) => s + l.quantity, 0)
          const notInRate = g.lines.every((l) => !isPriced(l))
          return (
            <div key={g.name}>
              <button
                type="button"
                onClick={() => onToggleGroup(`${bundle.id}:${g.name}`)}
                aria-expanded={open}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '4px 2px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon name={open ? 'chevron_down' : 'chevron_right'} size={12} style={{ color: 'var(--muted)' }} />
                <Icon name={iconFor(g.name)} size={13} style={{ color: 'var(--muted)' }} />
                <span style={{ fontWeight: 600 }}>{g.name}</span>
                {notInRate && (
                  <span style={{ ...subtle, fontStyle: 'italic' }}>
                    (not in rate) <NotInRate what={g.name.toLowerCase()} />
                  </span>
                )}
                <span className="figure" style={{ marginLeft: 'auto', ...subtle }}>
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </button>

              {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 0 4px 26px' }}>
                  {g.lines.map((l) => {
                    const short = l.unitsAvailable < l.quantity
                    const key = `${bundle.id}:${l.model}`
                    const showSerials = serialsOpen.has(key)
                    return (
                      <div key={l.model}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-sm)', fontSize: 'var(--t-th)' }}>
                          <span style={{ color: 'var(--text2)', minWidth: 0, flex: 1 }}>
                            {l.model} <span className="figure">×{l.quantity}</span>
                          </span>
                          <span
                            className="figure"
                            style={{ color: short ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            {l.unitsAvailable} of {l.unitsStock} available
                          </span>
                        </div>
                        {/* Only a physical model has units to assign — a crew role and a van do not. */}
                        {isPriced(l) && (
                          <>
                            <button
                              type="button"
                              onClick={() => onToggleSerials(key)}
                              aria-expanded={showSerials}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 0', border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-th)', fontFamily: 'inherit', cursor: 'pointer' }}
                            >
                              <Icon name={showSerials ? 'chevron_up' : 'chevron_down'} size={10} />
                              {showSerials ? 'Hide assigned serials' : 'Show assigned serials'}
                            </button>
                            {showSerials && (
                              <p style={{ margin: '2px 0 4px', ...subtle, lineHeight: 1.5 }}>
                                None. A bundle stores models, never serials — a unit is assigned at packing from
                                whatever is free, and swapped in one click if it stops being free.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
        <Link to={detailTo} style={{ textDecoration: 'none' }}>
          <Button icon="external_link">
            View full breakdown ({facts.totalItems} items)
          </Button>
        </Link>
      </div>
    </Card>
  )
}

/**
 * §6.2 — *"Centre and legend are computed from the same array. A centre reading
 * `18/18 Ready` above a legend of 16 + 1 + 1 cannot occur, because the centre
 * **is** the first legend value."* Both read `facts.segments`.
 */
function SummaryCard({ bundle, facts }: { bundle: BundleRecord; facts: BundleFacts }) {
  const total = facts.segments.reduce((s, x) => s + x.value, 0) || 1
  const slices: Slice[] = facts.segments.map((s) => ({
    label: s.label,
    value: s.value,
    display: String(s.value),
    percent: `${Math.round((s.value / total) * 100)}%`,
  }))
  const centre = facts.segments[0]?.value ?? 0

  return (
    <Card title="Bundle Summary">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', marginBottom: 10 }}>
        <Donut slices={slices} size={112} centreValue={`${centre} / ${facts.totalItems}`} centreLabel="Available" />
        <Legend slices={slices} showPercent={false} />
      </div>
      <SummaryRows
        rows={[
          { label: 'Total Items', value: String(facts.totalItems) },
          { label: 'Equipment', value: String(facts.equipment) },
          { label: 'Crew (not in rate)', value: String(facts.crew) },
          { label: 'Vehicle (not in rate)', value: String(facts.vehicle) },
          { label: 'Boxes / Bags', value: String(facts.boxes) },
          {
            /* §9 — `—` where any line has no weight, never 0. No weight exists in
               the item master, so nothing is invented here. */
            label: 'Total Weight',
            value: facts.totalWeightKg === null ? '—' : `${facts.totalWeightKg.toFixed(2)} KG`,
          },
        ]}
      />
      {facts.totalWeightKg === null && (
        <p style={{ margin: '8px 0 0', ...subtle, lineHeight: 1.5 }}>
          No weight is recorded against these models, so the total is shown as `—` rather than 0.{' '}
          <span className="identifier">TODO(decision)</span> — where do per-model weights come from?
        </p>
      )}
      <p style={{ margin: '8px 0 0', ...subtle, lineHeight: 1.5 }}>
        The donut counts the {facts.totalItems} items {bundle.name} requires. The tree above counts stock units, which is
        a different question — §6.1.
      </p>
    </Card>
  )
}

/** §7 — sum of parts is computed from current line rates, never stored. */
function PricingCard({ bundle, facts }: { bundle: BundleRecord; facts: BundleFacts }) {
  return (
    <Card title="Pricing" action={<span style={subtle}>(Equipment Only)</span>}>
      <SummaryRows
        rows={[
          { label: 'Sum of parts', value: formatMoney(facts.sumOfPartsPaisa) },
          { label: 'Bundle daily rate', value: formatMoney(bundle.bundleRatePaisa) },
        ]}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-sm)',
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--st-in-bg)',
          color: 'var(--st-in-fg)',
          fontSize: 'var(--t-meta)',
          fontWeight: 700,
        }}
      >
        <Icon name="check" size={13} />
        You save
        <span className="figure" style={{ marginLeft: 'auto' }}>
          {formatMoney(facts.savingPaisa)} ({facts.savingPct}%)
        </span>
      </div>
      <p style={{ margin: '8px 0 0', ...subtle, lineHeight: 1.5 }}>
        Crew and vehicle are not in this rate — they are priced in the booking's Crew and Transport sections (§8).
      </p>
    </Card>
  )
}

/** §5 of the render — exactly three tiles. Every one states what it does or why it cannot. */
function QuickActionsCard({ bundle, money }: { bundle: BundleRecord; money: boolean }) {
  const navigate = useNavigate()
  const tile: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    padding: '11px 6px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    fontSize: 'var(--t-th)',
    fontFamily: 'inherit',
    color: 'var(--text)',
    textAlign: 'center',
  }

  return (
    <Card title="Quick Actions">
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        {bundle.booking ? (
          <button
            type="button"
            onClick={() => navigate(`/rentals/${bundle.booking?.id}/packing`)}
            style={{ ...tile, cursor: 'pointer' }}
          >
            <Icon name="checklist" size={17} style={{ color: 'var(--text2)' }} />
            Packing List
          </button>
        ) : (
          <Unavailable reason="A packing list belongs to a booking, and this bundle is not on one.">
            <span style={{ ...tile, color: 'var(--disabled)', cursor: 'not-allowed' }}>
              <Icon name="checklist" size={17} />
              Packing List
            </span>
          </Unavailable>
        )}

        <Unavailable reason="Label printing is not built — there is no label renderer in this release.">
          <span style={{ ...tile, color: 'var(--disabled)', cursor: 'not-allowed' }}>
            <Icon name="receipt" size={17} />
            Generate Labels
          </span>
        </Unavailable>

        <button type="button" onClick={() => exportOneBundle(bundle, money)} style={{ ...tile, cursor: 'pointer' }}>
          <Icon name="download" size={17} style={{ color: 'var(--text2)' }} />
          Export Lines
        </button>
      </div>
    </Card>
  )
}
