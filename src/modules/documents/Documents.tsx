import { useMemo, useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CreateDocumentModal } from './CreateDocumentModal'
import './documents.css'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { SearchInput } from '../../components/ui/SearchInput'
import { Select } from '../../components/ui/Select'
import { Card, Button, KpiStrip, Rail, FooterNote } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { DataTableShell } from '../../components/ui/DataTable'
import { useViewport } from '../../lib/device'
import { ScreenHeader } from '../finance/TabHeader'
import { Unavailable } from '../../components/ui/Unavailable'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS } from '../../lib/status'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import type { Role as SystemRole } from '../../lib/rbac'
import { useAuth } from '../../lib/auth'
import { gateContext } from '../../lib/fieldGating'
import { useMenuFlip } from '../../lib/menuFlip'
import { IntelCard } from '../../components/ui/IntelCard'
import type { IntelGlance, IntelGroup } from '../../components/ui/IntelCard'
import {
  listDocuments,
  documentGlance,
  documentDetailGroups,
  ALL_TAB,
  ALL_BRANCHES,
  ALL_RELATED,
  ALL_STATUS,
  ALL_TYPES,
  ARCHIVED_NOT_RECYCLE_BIN,
  BRANCHES,
  DOC_STATUS,
  DOC_STATUSES,
  MISSING_TOTAL,
  NOT_BUILT,
  PENDING_SIGNATURE_TOTAL,
  PER_PAGE,
  RELATED_TARGET,
  ROW_MENU,
  SORTS,
  documentsFor,
  categoriesFor,
  expiringFor,
  kpisFor,
  missingFor,
  quickActionsFor,
  summarySlices,
  type CategoryKey,
  type DocRow,
  type RelatedKind,
  type SortKey,
} from '../../lib/queries/documents'
import { DateField } from '../../components/ui/DateField'
import { AppPageToolbar } from '../../components/ui/AppPageToolbar'
import { Pagination } from '../../components/ui/Pagination'

/* Law 15 — the law is the hit area, and `--tap` holds the number. Kept as
   `minHeight` so the three call sites that used to bump this to 34 or shrink it
   to 28 (search, sort, rows-per-page) can no longer opt below the floor: a
   local `height` loses to `min-height`, which is exactly what we want here. */
const fieldStyle = {
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '0 8px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
} as const
const labelStyle = {
  display: 'block',
  marginBottom: 'var(--sp-xs)',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
} as const

/** `<input type="date">` speaks ISO; the seed speaks `Date`. */
function isoToDate(v: string): number | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return Date.UTC(y, m - 1, d)
}

/** Outline chip — the render draws Type as a bordered pill, not a filled one. */
function TypeChip({ text }: { text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        borderRadius: 'var(--r-xs)',
        border: '1px solid var(--border2)',
        background: 'var(--card2)',
        color: 'var(--text2)',
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

function StatusPill({ status }: { status: DocRow['status'] }) {
  const tone = STATUS[DOC_STATUS[status]]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 21,
        padding: '0 9px',
        borderRadius: 'var(--r-badge)',
        background: tone.bg,
        color: tone.fg,
        border: tone.border ? `1px solid ${tone.border}` : undefined,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

/** Square glyph tile in front of the document name, tinted by its category. */
function DocTile({ icon, index }: { icon: IconName; index: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: 30,
        height: 30,
        borderRadius: 'var(--r-sm)',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--card2)',
        border: '1px solid var(--border2)',
        color: catColor(index),
      }}
    >
      <Icon name={icon} size={15} fill />
    </span>
  )
}

function ActionIcon({ name, label, why }: { name: IconName; label: string; why: string }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} — unavailable`}
      title={`${label} — ${why}`}
      className="doc-action-btn"
      style={{
        minWidth: 'var(--tap)',
        minHeight: 'var(--tap)',
        width: 'var(--tap)',
        height: 'var(--tap)',
        borderRadius: 'var(--r-xs)',
        border: 'none',
        background: 'transparent',
        color: 'var(--disabled)',
        cursor: 'not-allowed',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Icon name={name} size={16} />
    </button>
  )
}

/**
 * §11's row menu — Download · Print · Email · WhatsApp · Share Link ·
 * Duplicate · Archive. **No Delete**: §6 keeps every document for ever.
 *
 * The menu itself is real; each entry that needs storage or delivery says why
 * it cannot run. `Open related record` is the one that works today.
 */
/** Tallest the menu gets — the related-record link, divider, all 7 `ROW_MENU` entries, and the closing note.
 *  Rose from 320 when the rows went to the 44px `--tap` floor: 8 × 44 + 13 divider + ~34 note + 12 padding. */
const DOC_MENU_H = 420

function RowMenu({ row, open, onToggle }: { row: DocRow; open: boolean; onToggle: () => void }) {
  const target = RELATED_TARGET[row.relatedKind]
  const { ref, up, measure } = useMenuFlip<HTMLButtonElement>(DOC_MENU_H)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={ref}
        type="button"
        aria-label={`Actions for ${row.id}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`doc-action-btn ${open ? 'is-active' : ''}`}
        onClick={() => {
          if (!open) measure()
          onToggle()
        }}
        style={{
          minWidth: 'var(--tap)',
          minHeight: 'var(--tap)',
          width: 'var(--tap)',
          height: 'var(--tap)',
          borderRadius: 'var(--r-xs)',
          border: 'none',
          background: open ? 'var(--hover-card)' : 'transparent',
          color: open ? 'var(--text)' : 'var(--muted)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="more_vert" size={16} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            ...(up ? { bottom: 30 } : { top: 30 }),
            minWidth: 208,
            padding: 6,
            borderRadius: 'var(--r-btn)',
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            zIndex: 30,
            whiteSpace: 'nowrap',
          }}
        >
          {target.route ? (
            <Link
              to={`${target.route}/${row.relatedTo}`}
              role="menuitem"
              style={{ ...menuItem, color: 'var(--text)', cursor: 'pointer' }}
            >
              <Icon name="external_link" size={15} style={{ color: 'var(--text2)' }} />
              <span style={{ flex: 1 }}>Open {row.relatedTo}</span>
            </Link>
          ) : (
            <span
              role="menuitem"
              aria-disabled
              tabIndex={0}
              title={`${target.label} screen is not built yet`}
              style={{ ...menuItem, color: 'var(--muted)', cursor: 'not-allowed' }}
            >
              <Icon name="external_link" size={15} style={{ color: 'var(--disabled)' }} />
              <span style={{ flex: 1 }}>Open {row.relatedTo}</span>
            </span>
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

          {ROW_MENU.map((m) => (
            <span
              key={m.label}
              role="menuitem"
              aria-disabled
              tabIndex={0}
              title={NOT_BUILT}
              style={{ ...menuItem, color: 'var(--muted)', cursor: 'not-allowed' }}
            >
              <Icon name={m.icon} size={15} style={{ color: 'var(--disabled)' }} />
              <span style={{ flex: 1 }}>{m.label}</span>
              <Icon name="close" size={12} style={{ color: 'var(--disabled)' }} />
            </span>
          ))}

          {/* §6 — the absence of Delete is the point, so the menu says so. */}
          <p style={{ margin: '6px 8px 2px', fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'normal', lineHeight: 1.4 }}>
            {ARCHIVED_NOT_RECYCLE_BIN}
          </p>
        </div>
      )}
    </span>
  )
}

/*
 * Law 14 / §7.3 — the floor is the HIT AREA, not the paint, and for THIS shape
 * the two cannot be separated.
 *
 * The compact-34-with-a-pseudo-element escape in §5 works for an icon button
 * sitting alone in a toolbar: the invisible 44 spills into empty chrome and
 * steals nothing. It cannot work in a stacked menu. These rows are contiguous —
 * item N's bottom edge IS item N+1's top edge — so inflating each one to 44
 * would give every row a 6px band of invisible target lying on top of its
 * neighbour's visible paint, and the later row in the DOM wins the tap. A menu
 * whose last entry is Archive is exactly where a silently-wrong-row tap is
 * least affordable.
 *
 * So the paint grows. It costs nothing here: the popover is absolutely
 * positioned with no max-height, `useMenuFlip` only *predicts* the height to
 * choose up-or-down, and `DOC_MENU_H` is updated alongside to keep that
 * prediction honest.
 */
const menuItem = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '0 9px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'transparent',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  textAlign: 'left' as const,
  textDecoration: 'none',
}

/**
 * **Create Document** — the one control on this screen that claimed to work.
 *
 * `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` §D lists it. The primary
 * dispatched
 * `createDocument({ title: 'New Agreement Document', docType: 'Agreement' })` —
 * hardcoded placeholder content — with no `ActionContext`, no `.catch()`, and
 * **no feedback of any kind**, on success or on failure. So the operator
 * clicked, saw nothing move, and clicked again, and again. Today each of those
 * clicks is a separately rejected dispatch (`actions/core.ts` refuses anything
 * without `implemented: true`) whose rejection nobody handles; the moment
 * `CREATE_DOCUMENT` is wired, the same three clicks become three real documents
 * all called "New Agreement Document" — which is worse than the silence.
 *
 * The title was never the operator's. A document is named for what it is, and
 * nothing on this screen asks. `Upload Document`, `Import`, all seven row-menu
 * entries, the three bulk actions and every Quick Action tile already say the
 * same thing in the same words (`NOT_BUILT`), and the Quick Actions card's own
 * footnote states it outright: creating and uploading documents needs storage,
 * which is unwired. This button was the single hole in an otherwise honest
 * screen; it now says what its neighbours say. `Export` is untouched and still
 * works — it builds its CSV here, needing nothing that is missing.
 *
 * TODO(decision): the create flow itself — which document types an operator may
 * raise by hand, what each needs beyond a title, and which record it attaches
 * to. `CreateDocumentInput` already takes `relatedBookingId`, and nothing in
 * this repo rules who chooses it. A page may not answer that (CLAUDE.md).
 */

/**
 * **Documents** — built against `03 Core Modules/Documents.PNG` with the
 * `Documents.md` v2.1 corrections applied where the render and the lock
 * disagree on meaning rather than on layout:
 *
 *  · §5 **document lifecycle is not record state.** The render puts `Paid`,
 *    `Sent` and `Completed` in the status pill; those belong to the invoice,
 *    the delivery and the maintenance job. Pill = lifecycle, line below =
 *    record state.
 *  · §6 **there is no Recycle Bin** — the ninth tab is Archived, same slot,
 *    same count, and the row menu offers Archive with no Delete.
 *  · §4 one prefix per document type — the render's `DOC-RNT-`, `RPT-`, `MNT-`
 *    and its duplicate `INV-VAT-` row are gone.
 *  · §14 / Foundation §8.3 **Warehouse sees no finance documents at all** —
 *    the rows, the tab, the category, the donut slice and the finance quick
 *    actions are removed from the arrays before render, not masked.
 */
/**
 * **`embedded`** — hosted as Finance's Documents TAB (`09_FINANCE.md` §9.5)
 * rather than reached at `/documents`.
 *
 * Two things are stripped when it is, and both are named in `CONFLICTS.md`
 * §09.2 (*"stripping the duplicate PageHeader and search box … not just
 * importing them"*):
 *
 *  1. **The `<h1>`** — `ScreenHeader` demotes it to a subtitle. The four header
 *     actions, `[Create Document]` among them, are kept.
 *  2. **The search box** — the app Shell already renders one for `/finance`
 *     (`App.tsx`'s `search="…"` prop), so hosting this screen unchanged puts two
 *     search fields on one page, filtering different things, neither labelled to
 *     say which. The rail's own `[🔍 filter documents]` stays: it filters the
 *     rail's category list, which is a different control with a different job.
 *
 * `/documents` and `/finance/documents` both render `embedded={false}` and keep
 * both, because a deep link arrives with no tab strip above it.
 */
export default function Documents({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  /* §8.3 — the shared hook, same call site as every other screen. `role` is
     still read off the session below, but only for `gateContext`'s field-level
     gating; the money answer itself has one owner. */
  const money = useCanViewMoney()
  const role: SystemRole = user ? user.role : 'Client'
  // `gateContext` returns a fresh object each call — memoized so it is a
  // stable dependency for the row-intel memo below instead of invalidating
  // it on every render.
  const gctx = useMemo(() => gateContext(role), [role])

  const [docRows, setDocRows] = useState<DocRow[]>(() => documentsFor(money))
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const refetchDocs = useCallback(() => {
    listDocuments().then((res) => {
      if (res.rows.length > 0) {
        setDocRows(money ? res.rows : res.rows.filter((d) => !d.finance))
      }
    }).catch(() => {})
  }, [money])

  useEffect(() => {
    let mounted = true
    listDocuments().then((res) => {
      if (mounted && res.rows.length > 0) {
        setDocRows(money ? res.rows : res.rows.filter((d) => !d.finance))
      }
    }).catch(() => {})
    return () => {
      mounted = false
    }
  }, [money])

  const allDocs: DocRow[] = docRows.length > 0 ? docRows : documentsFor(money)
  const categories = useMemo(() => categoriesFor(money, allDocs), [money, allDocs])
  const kpis = useMemo(() => kpisFor(money, allDocs), [money, allDocs])
  const slices = useMemo(() => summarySlices(categories), [categories])
  const missing = useMemo(() => missingFor(money), [money])
  const expiring = useMemo(() => expiringFor(money), [money])
  const quickActions = useMemo(() => quickActionsFor(money), [money])
  const total = useMemo(() => categories.reduce((a, c) => a + c.count, 0), [categories])

  /*
   * 3.7 — the category selection (the tab strip and the rail's category list,
   * one shared selection) lives in the URL as `?cat=`, per the house pattern
   * (Inventory `?tab=`, OperationsQueues `patch()`): a category is linkable
   * and survives a reload. `replace: true` keeps tab flicks out of the
   * history stack.
   *
   * The key is `cat`, not `tab`, deliberately: this screen is also hosted as
   * Finance's Documents tab (`embedded`), so its param must never collide
   * with a `?tab=` that strip may claim.
   *
   * Validated against `categories` — the MONEY-FILTERED list — so a
   * money-blind session pasting `?cat=finance` lands on All rather than being
   * told a Finance category exists (§14 / Foundation §8.3).
   */
  const [params, setParams] = useSearchParams()
  const catParam = params.get('cat')
  const category: CategoryKey | 'All' = categories.find((c) => c.key.toLowerCase() === catParam)?.key ?? 'All'
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState(ALL_TYPES)
  const [status, setStatus] = useState<string>(ALL_STATUS)
  const [related, setRelated] = useState(ALL_RELATED)
  const [branch, setBranch] = useState(ALL_BRANCHES)
  const [sort, setSort] = useState<SortKey>('Created Date')
  const [filtersOpen, setFiltersOpen] = useState(false)
  /*
    Spec 9.5 draws a card grid ("TABLET 3-up · PHONE 2-up") and this screen
    had no width read at all: `cards` defaulted to false at every width, so a
    375px phone landed on an 820px table behind a horizontal scrollbar and only
    a manual toggle reached the drawn layout. The toggle stays — it is the
    desktop preference — but below 768 cards are forced, and the grid's column
    count is set per band rather than left to `auto-fill`.
  */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const desktop = viewport === 'desktop'
  const [cards, setCards] = useState(false)
  const cardView = viewport === 'phone' ? true : cards
  const [perPage, setPerPage] = useState<number>(PER_PAGE[0] ?? 10)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const types = useMemo(() => {
    const set = new Set(allDocs.map((d) => d.type))
    return [ALL_TYPES, ...Array.from(set).sort()]
  }, [allDocs])

  const relatedKinds = useMemo(() => {
    const set = new Set(allDocs.map((d) => d.relatedKind))
    return [ALL_RELATED, ...Array.from(set)]
  }, [allDocs])

  const dirty = query !== '' || from !== '' || to !== '' || type !== ALL_TYPES || status !== ALL_STATUS || related !== ALL_RELATED || branch !== ALL_BRANCHES

  function clearAll() {
    setQuery('')
    setFrom('')
    setTo('')
    setType(ALL_TYPES)
    setStatus(ALL_STATUS)
    setRelated(ALL_RELATED)
    setBranch(ALL_BRANCHES)
    setPage(1)
  }

  function pickCategory(c: CategoryKey | 'All') {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (c === 'All') next.delete('cat')
        else next.set('cat', c.toLowerCase())
        return next
      },
      { replace: true },
    )
    setPage(1)
    setMenuFor(null)
  }

  function clearDocumentFilters() {
    clearAll()
    pickCategory('All')
    setSelected(new Set())
  }

  const rows = useMemo(() => {
    const f = isoToDate(from)
    const t = isoToDate(to)
    const q = query.trim().toLowerCase()

    const list = allDocs.filter((d) => {
      // §6 — archived documents are hidden from every other view, never deleted.
      if (category === 'Archived') {
        if (!d.archived) return false
      } else {
        if (d.archived) return false
        if (category !== 'All' && d.category !== category) return false
      }
      if (q && ![d.name, d.id, d.type, d.relatedTo, d.party].some((s) => s.toLowerCase().includes(q))) return false
      if (type !== ALL_TYPES && d.type !== type) return false
      if (status !== ALL_STATUS && d.status !== status) return false
      if (related !== ALL_RELATED && d.relatedKind !== related) return false
      if (branch !== ALL_BRANCHES && d.branch !== branch && d.branch !== ALL_BRANCHES) return false
      const ms = d.createdAd.getTime()
      if (f !== null && ms < f) return false
      if (t !== null && ms > t) return false
      return true
    })

    const sorted = [...list]
    if (sort === 'Created Date') sorted.sort((a, b) => b.createdAd.getTime() - a.createdAd.getTime())
    else if (sort === 'Document Name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'Type') sorted.sort((a, b) => a.type.localeCompare(b.type))
    else if (sort === 'Status') sorted.sort((a, b) => a.status.localeCompare(b.status))
    else sorted.sort((a, b) => a.party.localeCompare(b.party))
    return sorted
  }, [allDocs, category, query, type, status, related, branch, from, to, sort])

  const documentFilterCount = [
    category !== 'All',
    query.trim() !== '',
    from !== '' || to !== '',
    type !== ALL_TYPES,
    status !== ALL_STATUS,
    related !== ALL_RELATED,
    branch !== ALL_BRANCHES,
  ].filter(Boolean).length

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  // Memoized so its identity only changes when the page's actual row set
  // does — a stable dependency for `visibleWithIntel` below.
  const visible = useMemo(() => rows.slice((current - 1) * perPage, current * perPage), [rows, current, perPage])
  const allOnPageSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))

  /**
   * Perf: `documentGlance`/`documentDetailGroups` build a full field-gated
   * object graph per row. Calling them inline inside the table's `.map()`
   * reran that work on every render of `Documents` (a search keystroke, a
   * menu toggle, anything) even when the visible rows and `gctx` hadn't
   * changed. Computed once per row here instead, keyed on the same
   * dependencies the builders actually read.
   */
  const visibleWithIntel = useMemo<{ row: DocRow; glance: IntelGlance; detail: IntelGroup[] }[]>(
    () => visible.map((d) => ({ row: d, glance: documentGlance(d, gctx), detail: documentDetailGroups(d, gctx) })),
    [visible, gctx],
  )

  /** The render's `Export`. Nothing else on this screen can produce a file. */
  function exportCsv() {
    const head = ['ID', 'Document', 'Type', 'Related To', 'Client / Vendor', 'Status', 'Record State', 'Created']
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
    const body = rows.map((r) =>
      [r.id, r.name, r.type, r.relatedTo, r.party, r.status, r.recordState, `${formatAd(r.createdAd)} ${r.createdTime}`]
        .map(cell)
        .join(','),
    )
    const blob = new Blob([[head.map(cell).join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'documents.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const categoryIndex = (key: CategoryKey) => categories.findIndex((c) => c.key === key)

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        border: 'none',
        background: 'transparent',
        padding: 0,
        color: sort === key ? 'var(--text)' : 'var(--text2)',
        fontSize: 'var(--t-th)',
        fontWeight: sort === key ? 700 : 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {label}
      {sort === key && <Icon name="chevron_down" size={11} />}
    </button>
  )

  return (
    <PageShell width="full" onClick={() => setMenuFor(null)}>
      <div className="doc-v2">
        <ScreenHeader
          embedded={embedded}
          leading={
            <FilterButton
              onClick={() => setFiltersOpen(!filtersOpen)}
              activeCount={documentFilterCount}
              controls="documents-filters"
              expanded={filtersOpen}
            />
          }
          title="Documents"
          actions={
            <>
              {!phone && (
                <>
                  <Unavailable reason={NOT_BUILT}>
                    <Button icon="upload" disabled>
                      Upload Document
                    </Button>
                  </Unavailable>
                  <Unavailable reason={NOT_BUILT}>
                    <Button icon="upload" disabled>
                      Import
                    </Button>
                  </Unavailable>
                </>
              )}
              <Button icon="download" aria-label="Export documents" onClick={exportCsv}>
                {phone ? '' : 'Export'}
              </Button>
              <Button
                icon="plus"
                variant="primary"
                aria-label="Create Document"
                onClick={() => setIsCreateOpen(true)}
              >
                {phone ? '' : 'Create Document'}
              </Button>
            </>
          }
        />

        <KpiStrip items={kpis} columns={kpis.length} />

        {/* §2 — tabs. The rail's category list below shares this one selection,
            so the two controls can never disagree about what is on screen. */}
        <div className="doc-tab-track rsp-chip-scroll">
          {[{ key: 'All' as const, tab: ALL_TAB, count: total }, ...categories].map((t) => {
            const on = category === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pickCategory(t.key)}
                aria-current={on ? 'page' : undefined}
                className={`doc-tab-btn ${on ? 'is-active' : ''}`}
              >
                <span>{t.tab}</span>
                <span className="doc-tab-count doc-mono">{t.count}</span>
              </button>
            )
          })}
        </div>

        {/* Filters open from the list toolbar and occupy no grid width. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: filtersOpen && !phone
              ? 'minmax(230px, 280px) minmax(0,1fr) auto'
              : desktop
                ? 'minmax(0,1fr) auto'
                : 'minmax(0,1fr)',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          {(() => {
            const categoriesContent = (
            <>
            <Card title="Document Categories" bodyStyle={{ padding: 6 }}>
              {[{ key: 'All' as const, rail: ALL_TAB, icon: 'file' as IconName, count: total }, ...categories].map((c) => {
                const on = category === c.key
                const tint = c.key === 'All' ? 'var(--text2)' : catColor(categoryIndex(c.key as CategoryKey))
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => pickCategory(c.key)}
                    aria-pressed={on}
                    className={`doc-rail-cat-btn ${on ? 'is-active' : ''}`}
                  >
                    <span className="doc-rail-cat-icon">
                      <Icon name={c.icon} size={14} style={{ color: on ? 'var(--nav-active-accent)' : tint, flexShrink: 0 }} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.rail}
                    </span>
                    <span className="doc-rail-cat-count figure doc-mono" style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)', flexShrink: 0 }}>
                      {c.count.toLocaleString('en-IN')}
                    </span>
                  </button>
                )
              })}
            </Card>

          <Card
            title="Filters"
            action={
              <button
                type="button"
                onClick={clearAll}
                disabled={!dirty}
                title={dirty ? 'Reset every filter' : 'No filters applied'}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: dirty ? 'var(--link)' : 'var(--disabled)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: dirty ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  padding: 0,
                }}
              >
                Clear All
              </button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div>
                <span style={labelStyle}>Date Range</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <DateField
                    ariaLabel="Created from"
                    value={from}
                    onChange={(v) => {
                      setFrom(v)
                      setPage(1)
                    }}
                    showBs={false}
                    clearable
                    style={fieldStyle}
                  />
                  <DateField
                    ariaLabel="Created to"
                    value={to}
                    onChange={(v) => {
                      setTo(v)
                      setPage(1)
                    }}
                    showBs={false}
                    clearable
                    align="right"
                    style={fieldStyle}
                  />
                </div>
              </div>

              <label>
                <span style={labelStyle}>Document Type</span>
                <Select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value)
                    setPage(1)
                  }}
                  style={fieldStyle}
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </label>

              <label>
                <span style={labelStyle}>Status</span>
                <Select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(1)
                  }}
                  style={fieldStyle}
                >
                  {[ALL_STATUS, ...DOC_STATUSES].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </label>

              <label>
                <span style={labelStyle}>Related To</span>
                <Select
                  value={related}
                  onChange={(e) => {
                    setRelated(e.target.value)
                    setPage(1)
                  }}
                  style={fieldStyle}
                >
                  {relatedKinds.map((k) => (
                    <option key={k} value={k}>
                      {k === ALL_RELATED ? ALL_RELATED : RELATED_TARGET[k as RelatedKind].label}
                    </option>
                  ))}
                </Select>
              </label>

              {/* §16 — the branch filter shows because Settings carries more
                  than one branch; with a single branch it would be hidden. */}
              <label>
                <span style={labelStyle}>Branch</span>
                <Select
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value)
                    setPage(1)
                  }}
                  style={fieldStyle}
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </label>

              {/* §2 — filters apply instantly; the render's Apply Filters button
                  would be a control with nothing left to do. */}
              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
                Filters apply instantly — there is no Apply step.
              </p>
            </div>
          </Card>
          </>
          )
          return (
            <FilterDrawer
              id="documents-filters"
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              desktopMode="rail"
              width={360}
              resultCount={rows.length}
              noun={rows.length === 1 ? 'document' : 'documents'}
              activeCount={documentFilterCount}
              onClearAll={clearDocumentFilters}
              standardFooter
              onApply={() => setFiltersOpen(false)}
            >
              {categoriesContent}
            </FilterDrawer>
          )
        })()}

        {/* ── centre ────────────────────────────────────────────────────── */}
        <Card bodyStyle={{ padding: 0 }}>
          <AppPageToolbar
            pagination={
              <Pagination
                page={current}
                total={rows.length}
                pageSize={perPage}
                pageSizeOptions={PER_PAGE}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPerPage(size)
                  setPage(1)
                }}
              />
            }
          />
          <div className="doc-toolbar-shell">
            {/* Global command search navigates records; this field filters the
                displayed documents, including when hosted inside Finance. */}
            <div className="doc-search-wrapper">
              <SearchInput
                value={query}
                onChange={(val) => {
                  setQuery(val)
                  setPage(1)
                }}
                onClear={() => {
                  setQuery('')
                  setPage(1)
                }}
                placeholder="Search in documents…"
                aria-label="Search documents by name, ID, type, record or client"
              />
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Sort by
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="doc-sort-select"
              >
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </label>

            <span className="doc-view-toggle">
              {([['Table', false], ['Cards', true]] as const).map(([label, isCards]) => {
                // `cardView`, not `cards` — below 768 the width forces cards, so
                // the pressed state has to say what is actually rendering.
                const on = cardView === isCards
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCards(isCards)}
                    aria-pressed={on}
                    aria-label={`${label} view`}
                    title={`${label} view`}
                    className={`doc-view-btn ${on ? 'is-active' : ''}`}
                  >
                    <Icon name={isCards ? 'queues' : 'checklist'} size={15} />
                  </button>
                )
              })}
            </span>
          </div>

          {/* §11 — the bulk bar appears only on selection. */}
          {selected.size > 0 && (
            <div className="doc-bulk-bar">
              <span className="doc-bulk-count figure doc-mono">
                {selected.size} selected
              </span>
              {/*
                §9.5 — *"Merge: pick several → [Consolidate] (on demand, not
                monthly)."* Consolidate joins the bulk bar because that is what
                the wireframe describes: a selection verb, not a scheduled job.
                "On demand, not monthly" is a real instruction — it rules out
                the batch/statement-run reading — and the control being here
                rather than in a settings screen is what encodes it.

                Drawn disabled with its own reason, not the shared one: merging
                is not merely unbuilt, it is undecided. Nothing rules whether the
                consolidated PDF is a NEW document in the register (and if so,
                under which type and whose number from `numbering.ts`) or a
                one-off download that is never stored. Law 3 makes that a
                consequential difference — a new document has a terminal action
                and an audit trail; a download has neither. TODO(decision).

                Archive keeps its place beside it: §9.5's *"Terminal action is
                Archive"*, and there is no Delete anywhere on this screen.
              */}
              <Unavailable reason="Consolidating several documents into one is not built, and the shape is not ruled: whether the result is a new document in the register — with its own type, its own number from numbering.ts and its own terminal action — or a one-off download that is never stored. TODO(decision) — PLAN.md §4.">
                <Button icon="file" disabled>
                  Consolidate
                </Button>
              </Unavailable>
              {['Download', 'Email', 'Archive'].map((b) => (
                <Unavailable key={b} reason={NOT_BUILT}>
                  <Button disabled>{b}</Button>
                </Unavailable>
              ))}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                style={{
                  marginLeft: 'auto',
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
            </div>
          )}

          {visible.length === 0 ? (
            <div style={{ padding: '26px 16px' }}>
              <EmptyState
                title="No documents match this view"
                description={
                  category === 'All'
                    ? 'Nothing matches the current filters.'
                    : `No ${category} documents match the current filters.`
                }
                actionLabel={dirty ? 'Clear All filters' : 'Back to All Documents'}
                onAction={dirty ? clearAll : () => pickCategory('All')}
              />
            </div>
          ) : cardView ? (
            <div
              className="doc-cards-grid"
              style={{
                gridTemplateColumns:
                  viewport === 'phone' ? 'repeat(2, minmax(0,1fr))' : viewport === 'tablet' ? 'repeat(3, minmax(0,1fr))' : 'repeat(auto-fill, minmax(238px, 1fr))',
              }}
            >
              {visible.map((d) => {
                const cat = categories.find((c) => c.key === d.category)
                const bs = toBs(d.createdAd)
                return (
                  <article key={d.id} className="doc-card">
                    <div className="doc-card-header">
                      <DocTile icon={cat?.icon ?? 'file'} index={categoryIndex(d.category)} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="doc-card-title">
                          {d.name}
                        </span>
                        <span className="identifier doc-card-id doc-mono">
                          {d.id}
                        </span>
                      </span>
                    </div>
                    <div className="doc-card-meta">
                      <TypeChip text={d.type} />
                      <StatusPill status={d.status} />
                    </div>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 500 }}>{d.party}</span>
                    <div className="doc-card-footer">
                      <span>{d.recordState}</span>
                      <span className="figure doc-mono">
                        {bs ? formatBs(bs) : formatAd(d.createdAd)}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <DataTableShell ariaLabel="Documents" data-table-scroll className="doc-table-shell">
              <table className="doc-table">
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th className="doc-th" style={{ width: 30 }}>
                      <input
                        type="checkbox"
                        aria-label="Select every document on this page"
                        checked={allOnPageSelected}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (allOnPageSelected) visible.forEach((r) => next.delete(r.id))
                            else visible.forEach((r) => next.add(r.id))
                            return next
                          })
                        }
                      />
                    </th>
                    <th className="doc-th">{sortHeader('Document Name', 'Document Name')}</th>
                    <th className="doc-th">{sortHeader('Type', 'Type')}</th>
                    <th className="doc-th">Related To</th>
                    {/* The render's header reads "Client / Vendor"; the word
                        "customer" appears nowhere in this product. */}
                    <th className="doc-th">{sortHeader('Client / Vendor', 'Client / Vendor')}</th>
                    <th className="doc-th">{sortHeader('Status', 'Status')}</th>
                    <th className="doc-th">{sortHeader('Created On', 'Created Date')}</th>
                    {/* Eight columns do not fit a 300px-rail layout below a very
                        wide viewport, so the actions pin to the right edge and
                        stay reachable instead of scrolling out of sight. */}
                    <th className="doc-th doc-sticky-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWithIntel.map(({ row: d, glance, detail }) => {
                    const cat = categories.find((c) => c.key === d.category)
                    const bs = toBs(d.createdAd)
                    const target = RELATED_TARGET[d.relatedKind]
                    return (
                      <tr key={d.id} className="doc-row">
                        <td className="doc-td" style={{ width: 30 }}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${d.id}`}
                            checked={selected.has(d.id)}
                            onChange={() => toggleRow(d.id)}
                          />
                        </td>

                        <td className="doc-td">
                          <IntelCard
                            glance={glance}
                            detail={detail}
                            detailTitle={d.name}
                            detailSubtitle={`${d.id} · ${d.type}`}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <DocTile icon={cat?.icon ?? 'file'} index={categoryIndex(d.category)} />
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                                  {d.name}
                                </span>
                                {/* §4 — one prefix per type; templates carry id · version. */}
                                <span className="identifier doc-mono" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 1 }}>
                                  {d.id}
                                </span>
                              </span>
                            </span>
                          </IntelCard>
                        </td>

                        <td className="doc-td">
                          <TypeChip text={d.type} />
                        </td>

                        <td className="doc-td">
                          {target.route ? (
                            <Link
                              to={`${target.route}/${d.relatedTo}`}
                              className="identifier doc-mono"
                              style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--link)', textDecoration: 'none' }}
                            >
                              {d.relatedTo}
                            </Link>
                          ) : d.relatedTo === '—' ? (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          ) : (
                            <Unavailable reason={`The ${target.label} screen is not built yet`}>
                              <span className="identifier doc-mono" style={{ fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                {d.relatedTo}
                              </span>
                            </Unavailable>
                          )}
                        </td>

                        <td className="doc-td" style={{ color: 'var(--text2)', whiteSpace: 'normal' }}>{d.party}</td>

                        <td className="doc-td">
                          <StatusPill status={d.status} />
                          {/* §5.2 — the record's state, never merged into the pill. */}
                          <span
                            style={{
                              display: 'block',
                              marginTop: 'var(--sp-xs)',
                              fontSize: 'var(--t-th)',
                              fontWeight: 600,
                              color: STATUS[d.recordTone].fg,
                              whiteSpace: 'normal',
                            }}
                          >
                            {d.recordState}
                          </span>
                        </td>

                        <td className="doc-td">
                          {/* §3 — BS above AD, both from the one Date Engine. */}
                          <span className="figure doc-mono" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600 }}>
                            {bs ? formatBs(bs) : '—'}
                          </span>
                          <span className="figure doc-mono" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 1 }}>
                            {formatAd(d.createdAd)}, {d.createdTime}
                          </span>
                        </td>

                        <td
                          className="doc-td doc-sticky-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                            <ActionIcon name="eye" label="View" why={NOT_BUILT} />
                            <ActionIcon name="download" label="Download" why={NOT_BUILT} />
                            <ActionIcon name="upload" label="Send" why={NOT_BUILT} />
                            <RowMenu
                              row={d}
                              open={menuFor === d.id}
                              onToggle={() => setMenuFor((m) => (m === d.id ? null : d.id))}
                            />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </DataTableShell>
          )}

          <div style={{ padding: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
            <Pagination
              page={current}
              total={rows.length}
              pageSize={perPage}
              pageSizeOptions={PER_PAGE}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPerPage(size)
                setPage(1)
              }}
            />
          </div>
        </Card>

        {/* ── right rail ────────────────────────────────────────────────── */}
        {(() => {
          const summaryContent = (
          <>
          <Card title="Document Summary">
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <Donut slices={slices} centreLabel="Total" centreValue={total.toLocaleString('en-IN')} size={96} />
              <Legend slices={slices} />
            </div>
          </Card>

          <Card
            title="Pending Signatures"
            action={
              <button
                type="button"
                onClick={() => {
                  pickCategory('All')
                  setStatus('Pending Signature')
                  setPage(1)
                }}
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
                View All
              </button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {allDocs
                .filter((d) => d.status === 'Pending Signature' && !d.archived)
                .map((p) => (
                  <div key={p.id} className="doc-alert-item">
                    <Icon name="crew" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.type}
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        <span className="identifier doc-mono">{p.relatedTo}</span> · {p.party}
                      </span>
                    </span>
                    <span
                      className="doc-alert-ageing doc-mono"
                      style={{
                        color: p.ageingSevere ? 'var(--danger-text)' : 'var(--progress-text)',
                      }}
                    >
                      {p.ageing ?? '—'}
                    </span>
                  </div>
                ))}
              <p style={{ margin: 0, paddingTop: 2, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                <span className="figure doc-mono">{PENDING_SIGNATURE_TOTAL}</span> documents pending signature across the
                installation.
              </p>
            </div>
          </Card>

          <Card
            title="Missing Documents"
            action={
              <Unavailable
                reason="A missing document has no row to open — the gate that requires it lives on the booking"
                style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}
              >
                View All
              </Unavailable>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {missing.map((m) => (
                <div key={m.doc + m.booking} className="doc-alert-item">
                  <Icon name="alert_triangle" size={13} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>{m.doc}</span>
                    {/* §0 — the panel names the booking and the client. */}
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      <Link to={`/rentals/${m.booking}`} className="identifier doc-mono" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                        {m.booking}
                      </Link>{' '}
                      · {m.client}
                    </span>
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 19,
                      padding: '0 7px',
                      borderRadius: 'var(--r-badge)',
                      background: STATUS.danger.bg,
                      color: STATUS.danger.fg,
                      fontSize: 'var(--t-th)',
                      fontWeight: 700,
                    }}
                  >
                    Missing
                  </span>
                </div>
              ))}
              <p style={{ margin: 0, paddingTop: 2, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                <span className="figure doc-mono">{MISSING_TOTAL}</span> missing in active rentals — each blocks its own gate.
              </p>
            </div>
          </Card>

          {/* §9 — the render only counts what is expiring. This says what.
              §14 — the list is role-filtered like every other panel here, so a
              Warehouse session is never told a quotation exists. */}
          <Card title="Expiring / Due Soon">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {expiring.map((e) => (
                <div key={e.doc} className="doc-alert-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                  <span style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>{e.doc}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    {e.what} <span className="doc-mono" style={{ color: 'var(--progress-text)', fontWeight: 700 }}>{e.when}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{e.action}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Actions" bodyStyle={{ padding: 10 }}>
            <div className="doc-qa-grid" style={{ gridTemplateColumns: `repeat(${Math.min(quickActions.length, 4)}, minmax(0,1fr))` }}>
              {quickActions.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled
                  title={`${q.label} — ${NOT_BUILT}`}
                  className="doc-qa-tile"
                >
                  <Icon name={q.icon} size={17} />
                  {q.label}
                </button>
              ))}
            </div>

            {/* The one tile with somewhere real to go. */}
            <button
              type="button"
              onClick={() => pickCategory('Templates')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                width: '100%',
                minHeight: 44,
                height: 44,
                marginTop: 'var(--sp-sm)',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--btn-secondary-border)',
                background: 'var(--btn-secondary-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <Icon name="checklist" size={14} />
              Document Templates
            </button>

            <p style={{ margin: '8px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Creating and uploading documents needs storage, which is unwired — the tiles stay visible and say so.
            </p>
          </Card>
          </>
          )
          return desktop ? (
            <Rail width={300} label="Document summary">{summaryContent}</Rail>
          ) : (
            <div style={{ order: 3, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{summaryContent}</div>
          )
        })()}
      </div>

      <FooterNote
        extra={[
          'A document exists once and is linked wherever needed',
          ARCHIVED_NOT_RECYCLE_BIN,
          'Category counts are installation totals; the table lists the seeded sample',
        ]}
      />

      <CreateDocumentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={refetchDocs}
      />
      </div>
    </PageShell>
  )
}
