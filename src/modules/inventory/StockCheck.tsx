import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { formatAd, formatAdDateTime, formatBs, toBs } from '../../lib/bs'
import { captureError } from '../../lib/monitoring'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  auditItemKpiFilters,
  findStockAuditItemByCode,
  itemsOfAudit,
  listStockAuditItems,
  listStockAudits,
  OUTCOME_OF_STATE,
  recentAudits,
  stockAuditRestriction,
  unitStateOfOutcome,
  withOutcomes,
  STOCK_CHECK_STATE_META,
} from '../../lib/queries/stockAudits'
import type { StockAuditItemRow, StockAuditListRow, StockCheckUnitState } from '../../lib/queries/stockAudits'

/**
 * **§7.3 Stock Check.**
 *
 * ## The correctness rule this screen exists to hold
 *
 * > *"unscanned = Unverified, never auto-Missing."*
 *
 * That is not a label. Nothing on this page may turn an unscanned unit into a
 * missing one, and the database now says the same thing: a manifest line's
 * `outcome` DEFAULTS to `'Left unverified'` (0004:650), which maps to
 * `Unverified` here and nowhere near Missing. **`[Confirm missing]` is the only
 * path from Unverified to Confirmed missing, and a person presses it** — and in
 * Phase 1 there is NO action file to record that assertion, so the control is
 * rendered through `Unavailable` with the reason spelled out rather than
 * pretending a local `setState` wrote a loss into the record.
 *
 * ## What is real now, and what is not yet
 *
 * The audits list and the manifest are REAL reads: `stock_audits` and
 * `stock_audit_items` through `lib/queries/stockAudits.ts` (Law 2), unit
 * identity resolved through `product_units_v`/`products_v`, KPIs counted from
 * the items with one-row count queries — never read off the session row's
 * stored totals, which nothing reconciles. The scan box answers against the
 * server (`findStockAuditItemByCode`, exact match on serial / asset tag /
 * barcode) and says honestly that the scan itself is NOT recorded — there is no
 * scan-write action yet, and inventing a local "Verified" flip over rows the
 * database owns would fabricate success. The `Unexpected` list is the one
 * deliberately session-local thing left: a scratch log of codes that answered
 * "not on this manifest", labelled as unsaved.
 *
 * In mock mode neither table is served (`lib/mock/corpus.ts`), and the mock
 * engine answers with `[]` (`lib/mock/client.ts:100-106`) — the screen degrades
 * to its honest "No stock audits yet" empty state.
 *
 * ## Two surfaces, one component
 *
 * `/inventory/stock-check` is still a route — `data/caseIntel.ts:202`,
 * `data/rackIntel.ts:197` link straight to it — and the same component is also
 * the `?tab=stock-check` pane of `/inventory`. `embedded` drops the page header
 * the tab strip already provides; nothing else changes between them. There is
 * still no per-session route param, so deep links land on the default
 * selection: the first session that is started-but-not-completed, else the most
 * recently scheduled.
 *
 * ## Three layouts
 *
 * §7.3 draws DESKTOP and TABLET identically — session card, list, `[Confirm
 * missing]`, scanner FAB — and PHONE as progress · list · scan bar. The session
 * picker + scanner terminal is a rail at desktop and **reflows beneath the
 * list** below 1280 (`WIREFRAME_RULINGS_2026-08-12.md` §7: collapse means
 * reflow, not hide).
 */

/**
 * Named reason, per the Unavailable rule: no `src/actions/` file exists for
 * confirming a unit missing, and no capability string is declared for it —
 * so the assertion cannot land anywhere. The old build set a local flag and
 * showed the badge, which is a fabricated write on what is now a real record.
 */
const CONFIRM_MISSING_UNAVAILABLE =
  'Confirming a unit missing is not wired yet — no confirm-missing action exists, so the assertion would not be recorded. Phase 2 adds the write; until then the unit stays Unverified, which is the truthful state.'

type FilterMode = 'all' | 'verified' | 'unverified' | 'missing' | 'unexpected'

/** Which screen-state each narrowing chip means. The outcome it sends is `OUTCOME_OF_STATE`'s single mapping. */
const CHIP_STATE: Record<Exclude<FilterMode, 'all' | 'unexpected'>, StockCheckUnitState> = {
  verified: 'Verified',
  unverified: 'Unverified',
  missing: 'Confirmed missing',
}

/**
 * A figure, or an explicit non-value while it is unknown. A KPI reading `0`
 * during the first load or after a failure is a WRONG figure, not a missing one
 * — same helper, same reasoning, as `Inventory.tsx` and `AuditLog.tsx`.
 */
function countOf(list: { loading: boolean; error: string | null }, value: number | null): string {
  return list.loading || list.error !== null || value === null ? '—' : String(value)
}

/** `scheduled_date` (`YYYY-MM-DD`, AD) → "22 Shrawan 2083 BS · 6 Aug 2026", BS via `lib/bs.ts` only (Law 7). */
function scheduledLabel(dayAd: string): string {
  const d = new Date(`${dayAd}T00:00:00+05:45`)
  if (Number.isNaN(d.getTime())) return dayAd
  const bs = toBs(d)
  return bs ? `${formatBs(bs)} · ${formatAd(d)}` : formatAd(d)
}

function scopeLine(a: StockAuditListRow): string {
  return a.warehouseName ? `${a.scope} · ${a.warehouseName}` : a.scope
}

/** Display fallbacks, in honesty order — never an invented serial, the uuid last. */
function titleOf(it: StockAuditItemRow): string {
  return it.productName ?? it.serialNo ?? it.assetTag ?? it.productUnitId
}

function codeLineOf(it: StockAuditItemRow): string {
  const parts = [it.productAssetCode, it.serialNo ?? it.assetTag].filter(Boolean)
  return parts.length ? parts.join(' · ') : it.productUnitId
}

function locationOf(it: StockAuditItemRow): string {
  const parts = [it.rack, it.shelf, it.bin].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

function linkTargetOf(it: StockAuditItemRow): string | null {
  const key = it.productAssetCode ?? it.serialNo
  return key ? `/inventory/${encodeURIComponent(key)}` : null
}

/** What `[Manual verify]` types into the scan box. Null when the unit embed did not resolve — no code to type. */
function verifySeedOf(it: StockAuditItemRow): string | null {
  return it.serialNo ?? it.assetTag
}

export default function StockCheck({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const viewport = useViewport()
  /** The one identity this session's reconcile may be recorded against. */
  const { user } = useAuth()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  /** A failed LOOKUP is an error, not a "not on manifest" verdict. Law 12 — inline. */
  const [scanError, setScanError] = useState<string | null>(null)
  const [showScannerModal, setShowScannerModal] = useState(false)
  /**
   * Codes that answered "not on this manifest" — a statement about where a unit
   * IS, never that an expected unit is gone. Deliberately session-local and
   * labelled as such: no table receives unexpected scans in Phase 1.
   */
  const [unexpectedUnits, setUnexpectedUnits] = useState<
    Array<{ serial: string; location: string; scannedAt: string }>
  >([])
  const [lastScannedFeedback, setLastScannedFeedback] = useState<{
    serial: string
    name: string
    match: boolean
    message: string
  } | null>(null)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  /**
   * The last RECONCILE_STOCK_CHECK rejection. Law 12 — inline and persistent;
   * `useToast()` carries successes only and no error toast is invented here.
   */
  const [reconcileError, setReconcileError] = useState<string | null>(null)

  const phone = viewport === 'phone'
  const desktop = viewport === 'desktop'

  /* ── The audits list — the real `stock_audits` table ─────────────────── */

  const fetchAudits = useCallback((f: ListFilters) => listStockAudits(f), [])
  const auditsBaseline = useMemo(() => recentAudits(), [])
  const audits = useList<StockAuditListRow>(fetchAudits, auditsBaseline, { baseline: auditsBaseline })

  /**
   * The working session: an explicit pick when it still exists in the list,
   * else the first started-but-not-completed session, else the most recently
   * scheduled. Derived, not an effect — no frame renders a stale selection.
   * Lifecycle is read off the TIMESTAMPS: `status` is free text with no CHECK
   * (0004:618) and is displayed but never branched on.
   */
  const selected: StockAuditListRow | null = useMemo(() => {
    if (selectedId) {
      const hit = audits.rows.find((a) => a.id === selectedId)
      if (hit) return hit
    }
    return audits.rows.find((a) => a.startedAtAd !== null && a.completedAtAd === null) ?? audits.rows[0] ?? null
  }, [audits.rows, selectedId])

  const auditId = selected?.id ?? ''
  const completed = selected?.completedAtAd != null

  /* ── The manifest — real `stock_audit_items`, chip-narrowed SERVER-side ── */

  const fetchItems = useCallback((f: ListFilters) => listStockAuditItems(f), [])
  const manifestBaseline = useMemo(() => itemsOfAudit(auditId), [auditId])
  const manifestFilters = useMemo(() => {
    if (filterMode === 'all' || filterMode === 'unexpected') return manifestBaseline
    return withOutcomes(manifestBaseline, [OUTCOME_OF_STATE[CHIP_STATE[filterMode]]])
  }, [manifestBaseline, filterMode])
  const items = useList<StockAuditItemRow>(fetchItems, manifestFilters, { baseline: manifestBaseline })

  /*
   * The four figures — counted from the ITEMS with one-row count queries (the
   * `INVENTORY_KPI_FILTERS` pattern), never read from the session row's stored
   * `total_*` columns, which a writer maintains and nothing reconciles. Four
   * fixed calls in a fixed order, never a loop, so hook order cannot change.
   */
  const countFetcher = useCallback((f: ListFilters) => listStockAuditItems({ ...f, withCount: true }), [])
  const kpiFilters = useMemo(() => auditItemKpiFilters(auditId), [auditId])
  const expectedKpi = useList<StockAuditItemRow>(countFetcher, kpiFilters.expected, { isFilteredOverride: false })
  const foundKpi = useList<StockAuditItemRow>(countFetcher, kpiFilters.found, { isFilteredOverride: false })
  const unverifiedKpi = useList<StockAuditItemRow>(countFetcher, kpiFilters.unverified, { isFilteredOverride: false })
  const missingKpi = useList<StockAuditItemRow>(countFetcher, kpiFilters.missing, { isFilteredOverride: false })

  /* `useList` memoises `refetch`; naming them keeps the callback keyed on
     the functions rather than on the whole list objects, which are fresh
     literals every render (react-hooks/exhaustive-deps, TODO_SWEEP A13). */
  const { refetch: refetchAudits } = audits
  const { refetch: refetchItems } = items
  const { refetch: refetchExpected } = expectedKpi
  const { refetch: refetchFound } = foundKpi
  const { refetch: refetchUnverified } = unverifiedKpi
  const { refetch: refetchMissing } = missingKpi
  const refetchAll = useCallback(() => {
    refetchAudits()
    refetchItems()
    refetchExpected()
    refetchFound()
    refetchUnverified()
    refetchMissing()
  }, [refetchAudits, refetchItems, refetchExpected, refetchFound, refetchUnverified, refetchMissing])

  const progressPct =
    foundKpi.total !== null && expectedKpi.total !== null && expectedKpi.total > 0
      ? Math.round((foundKpi.total / expectedKpi.total) * 100)
      : null

  /**
   * The scan box, answered by the SERVER against the whole manifest — the list
   * in hand may be chip-narrowed to one outcome, so matching against it would
   * call an unverified serial "not on this manifest".
   *
   * A match does NOT flip anything: the rows are the database's, and there is
   * no scan-write action yet. The feedback says what is true — on the manifest,
   * current outcome, nothing saved. Fabricating a local "Verified" over a real
   * record is the exact failure "never fabricate success" names.
   */
  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = scanInput.trim()
    if (!query || scanBusy || !selected) return

    setScanBusy(true)
    setScanError(null)

    findStockAuditItemByCode(selected.id, query)
      .then((hit) => {
        if (hit) {
          const code = hit.serialNo ?? hit.assetTag ?? hit.productUnitId
          setLastScannedFeedback({
            serial: code,
            name: hit.productName ?? 'Manifest unit',
            match: true,
            message: `${hit.productName ?? 'Unit'} (${code}) is on this manifest — currently ${unitStateOfOutcome(
              hit.outcome,
            )}. Recording a scan is not wired yet (Phase 2), so nothing was saved.`,
          })
        } else {
          const serial = query.toUpperCase()
          // Not on this manifest — a MISPLACED statement about where a unit is,
          // not a statement that any expected unit is gone. Deduped: scanning
          // the same unknown code twice is one fact, not two rows.
          setUnexpectedUnits((prev) =>
            prev.some((u) => u.serial === serial)
              ? prev
              : [
                  {
                    serial,
                    location: scopeLine(selected),
                    scannedAt: formatAdDateTime(new Date().toISOString()),
                  },
                  ...prev,
                ],
          )
          setLastScannedFeedback({
            serial,
            name: 'Unexpected item',
            match: false,
            message: `${serial} is not on this audit's manifest. Logged under Unexpected for this session only — nothing was saved, and no expected unit was marked missing.`,
          })
        }
        setScanInput('')
      })
      .catch((err: unknown) => {
        setScanError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setScanBusy(false))
  }

  /**
   * Completing the audit closes the session. It does **not** touch a single
   * line's outcome: whatever is Unverified when the officer stops stays
   * Unverified, and the completion note says so out loud.
   *
   * ⭐ 12 Aug 2026 — nothing local flips on dispatch. The action is a Phase 2
   * stub (`reconcileStockCheck` never sets `implemented`, so `actions/core.ts`
   * fails it closed before anything observable); the `.then` re-reads the
   * database, which is the only party allowed to say the session completed.
   * The rejection lands in the inline banner and the session keeps reading
   * In Progress — which is the truth.
   */
  const handleFinishAudit = () => {
    if (!user) {
      setReconcileError(
        'You are not signed in, so this audit cannot be reconciled against anyone. Nothing was written and the session is unchanged.',
      )
      return
    }
    if (!selected) {
      setReconcileError('No audit session is selected, so there is nothing to reconcile.')
      return
    }
    const scannedCount = foundKpi.total
    const totalCount = expectedKpi.total
    if (scannedCount === null || totalCount === null) {
      setReconcileError(
        'The audit counts have not finished loading, so the reconcile totals would be wrong. Wait for the counts, then try again.',
      )
      return
    }
    setReconcileError(null)
    void import('../../actions/inventory/reconcileStockCheck')
      .then((m) => m.reconcileStockCheck({ scannedCount, totalCount }, { userId: user.id, role: user.role }))
      .then(() => refetchAll())
      .catch((err: unknown) => {
        captureError(err, { where: 'StockCheck.reconcile' })
        setReconcileError(err instanceof Error ? err.message : String(err))
      })
  }

  const kpis: Kpi[] = [
    {
      label: 'Audit progress',
      value: progressPct === null ? '—' : `${progressPct}%`,
      icon: 'activity',
      accent: 'primary',
      note: `${countOf(foundKpi, foundKpi.total)} of ${countOf(expectedKpi, expectedKpi.total)} verified`,
    },
    {
      label: 'Verified',
      value: countOf(foundKpi, foundKpi.total),
      icon: 'check',
      accent: 'success',
      note: 'Outcome Found on the record',
    },
    {
      label: 'Unverified',
      value: countOf(unverifiedKpi, unverifiedKpi.total),
      icon: 'alert_triangle',
      accent: 'progress',
      note: 'No scan yet — never counted as missing',
    },
    {
      label: 'Confirmed missing',
      value: countOf(missingKpi, missingKpi.total),
      icon: 'error',
      accent: 'danger',
      note: 'Asserted by a person, one at a time',
    },
  ]

  const stateBadge = (state: StockCheckUnitState) => {
    const meta = STOCK_CHECK_STATE_META[state]
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-xs)',
          padding: '2px 8px',
          borderRadius: 4,
          background: meta.bg,
          color: meta.fg,
          border: `1px solid ${meta.border}`,
          fontSize: 'var(--t-th)',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {/* Law 11 — never colour alone. */}
        <Icon name={meta.icon} size={12} />
        {state}
      </span>
    )
  }

  /** The two row buttons. Confirm-missing is Unavailable, not fake — see the constant. */
  const rowActions = (it: StockAuditItemRow) => {
    const seed = verifySeedOf(it)
    return (
      <span style={{ display: 'inline-flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {seed && (
          <Button variant="ghost" size="sm" onClick={() => setScanInput(seed)}>
            Manual verify
          </Button>
        )}
        <Unavailable reason={CONFIRM_MISSING_UNAVAILABLE}>
          <Button variant="outline" size="sm" disabled>
            Confirm missing
          </Button>
        </Unavailable>
      </span>
    )
  }

  /* ── Session picker — the audits list, on screen ─────────────────────── */

  const sessionsCard = (
    <Card title={`Audit sessions (${audits.rows.length})`} bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {audits.rows.map((a) => {
          const active = a.id === auditId
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId(a.id)}
              aria-pressed={active}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 4,
                textAlign: 'left',
                minHeight: 44,
                padding: '10px 14px',
                background: active ? 'var(--hover)' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
                borderBottom: '1px solid var(--border)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'var(--t-meta)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                <span className="identifier" style={{ fontWeight: 700 }}>
                  {a.auditNo}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>{a.status}</span>
              </span>
              <span style={{ color: 'var(--text2)', fontSize: 'var(--t-th)' }}>{scopeLine(a)}</span>
              <span style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                scheduled {scheduledLabel(a.scheduledDateAd)}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )

  /* ── Scanner terminal ────────────────────────────────────────────────── */

  const scannerCard = (
    <Card title="Barcode / QR scan input">
      <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <div>
          <label
            htmlFor="stock-check-scan"
            style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}
          >
            Scan serial, asset tag or barcode
          </label>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <input
              id="stock-check-scan"
              type="text"
              autoFocus={!embedded}
              placeholder="Scan or type a serial…"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              className="identifier"
              style={{
                flex: 1,
                minWidth: 140,
                height: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-xs)',
                border: '2px solid var(--nav-active-accent)',
                background: 'var(--hover)',
                color: 'var(--text)',
                fontSize: 'var(--t-ui)',
              }}
            />
            <Button variant="primary" icon={<Icon name="checklist" size={13} />} disabled={scanBusy} onClick={handleScanSubmit}>
              {scanBusy ? 'Checking…' : 'Scan'}
            </Button>
            <Button type="button" icon={<Icon name="camera" size={13} />} onClick={() => setShowScannerModal(true)}>
              Camera
            </Button>
          </div>
        </div>

        {/* A failed lookup is an error about the QUERY, never a verdict about the unit. Law 12 — inline. */}
        {scanError && <ErrorBanner title="The scan could not be checked" message={scanError} />}

        {/* Law 12 — inline and persistent; a toast never carries this. */}
        {lastScannedFeedback && (
          <div
            style={{
              padding: 'var(--sp-md)',
              borderRadius: 'var(--r-sm)',
              background: lastScannedFeedback.match ? 'var(--st-in-bg)' : 'var(--st-progress-bg)',
              border: `1px solid ${lastScannedFeedback.match ? 'var(--success-text)' : 'var(--ready-text)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-xs)',
              marginTop: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                fontSize: 'var(--t-meta)',
                color: lastScannedFeedback.match ? 'var(--success-text)' : 'var(--ready-text)',
              }}
            >
              <Icon name={lastScannedFeedback.match ? 'check' : 'alert_triangle'} size={14} />
              <span>{lastScannedFeedback.match ? 'On this manifest' : 'Location alert'}</span>
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--text)' }}>{lastScannedFeedback.message}</div>
          </div>
        )}
      </form>
    </Card>
  )

  /* ── Session scope ───────────────────────────────────────────────────── */

  const scopeCard = selected && (
    <Card title="Session scope">
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}
      >
        <div>
          Facility: <strong style={{ color: 'var(--text)' }}>{selected.warehouseName ?? '—'}</strong>
        </div>
        <div>
          Scope: <strong style={{ color: 'var(--text)' }}>{selected.scope}</strong>
        </div>
        <div>
          Status: <strong style={{ color: 'var(--text)' }}>{selected.status}</strong>
        </div>
        <div>
          Scheduled: <strong style={{ color: 'var(--text)' }}>{scheduledLabel(selected.scheduledDateAd)}</strong>
        </div>
        <div>
          Started:{' '}
          <strong style={{ color: 'var(--text)' }}>
            {selected.startedAtAd ? formatAdDateTime(selected.startedAtAd) : '—'}
          </strong>
        </div>
        {selected.completedAtAd && (
          <div>
            Completed: <strong style={{ color: 'var(--text)' }}>{formatAdDateTime(selected.completedAtAd)}</strong>
          </div>
        )}
        {/* The auditor is `audited_by`, a users.id — `users` is self-scoped by RLS
            (0020:55), so a name cannot be resolved for anyone but the viewer and
            no name is invented here. */}
        {selected.notes && <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{selected.notes}</p>}
      </div>
    </Card>
  )

  /** §7.3's `[Confirm missing] (manual)` — present, disabled, and it says why. */
  const confirmMissingBar = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-md)',
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        flexWrap: 'wrap',
        fontSize: 'var(--t-meta)',
        color: 'var(--text2)',
      }}
    >
      <span>
        {countOf(unverifiedKpi, unverifiedKpi.total)} unverified · {countOf(missingKpi, missingKpi.total)} confirmed
        missing
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <Unavailable reason={CONFIRM_MISSING_UNAVAILABLE}>
          <Button variant="outline" size="sm" disabled>
            Confirm missing
          </Button>
        </Unavailable>
      </span>
    </div>
  )

  /* ── The manifest ────────────────────────────────────────────────────── */

  const chipRow = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', maxWidth: '100%' }}>
      {(
        [
          { id: 'all', label: `All (${countOf(expectedKpi, expectedKpi.total)})` },
          { id: 'verified', label: `Verified (${countOf(foundKpi, foundKpi.total)})` },
          { id: 'unverified', label: `Unverified (${countOf(unverifiedKpi, unverifiedKpi.total)})` },
          { id: 'missing', label: `Missing (${countOf(missingKpi, missingKpi.total)})` },
          { id: 'unexpected', label: `Unexpected (${unexpectedUnits.length})` },
        ] as Array<{ id: FilterMode; label: string }>
      ).map((t) => {
        const active = filterMode === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilterMode(t.id)}
            aria-pressed={active}
            style={{
              flexShrink: 0,
              minHeight: 44,
              padding: '4px 10px',
              borderRadius: 4,
              background: active ? 'var(--hover)' : 'transparent',
              border: `1px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
              color: active ? 'var(--text)' : 'var(--text2)',
              fontWeight: active ? 700 : 500,
              fontSize: 'var(--t-th)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )

  const itemMeta = (it: StockAuditItemRow) => (
    <>
      {it.exclusionReason && (
        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Excluded — {it.exclusionReason}</div>
      )}
      {it.scannedAtAd && (
        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>scanned {formatAdDateTime(it.scannedAtAd)}</div>
      )}
      {it.discrepancyNotes && (
        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontStyle: 'italic' }}>{it.discrepancyNotes}</div>
      )}
    </>
  )

  const itemTitle = (it: StockAuditItemRow) => {
    const target = linkTargetOf(it)
    const inner = (
      <>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{titleOf(it)}</div>
        <div className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {codeLineOf(it)}
        </div>
      </>
    )
    return target ? (
      <Link to={target} style={{ color: 'inherit', textDecoration: 'none' }}>
        {inner}
      </Link>
    ) : (
      inner
    )
  }

  const manifest = (
    <Card
      title={
        filterMode === 'unexpected'
          ? `Unexpected scans (${unexpectedUnits.length})`
          : `Location manifest (${items.rows.length}${expectedKpi.total !== null ? ` of ${expectedKpi.total}` : ''})`
      }
      action={chipRow}
      bodyStyle={{ padding: 0 }}
    >
      {filterMode === 'unexpected' ? (
        <div style={{ overflowX: 'auto', padding: 'var(--sp-md)' }}>
          {unexpectedUnits.length === 0 ? (
            <EmptyState
              icon={<Icon name="alert_triangle" size={22} />}
              title="No misplaced or unexpected items scanned yet"
              description="Codes that answer 'not on this manifest' are listed here for this session only — nothing is saved, and a misplaced item never marks an expected unit missing."
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: 8 }}>Scanned identifier</th>
                  <th style={{ padding: 8 }}>State</th>
                  <th style={{ padding: 8 }}>Location scanned</th>
                  <th style={{ padding: 8 }}>Time scanned</th>
                </tr>
              </thead>
              <tbody>
                {unexpectedUnits.map((u) => (
                  <tr key={u.serial} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <span className="identifier" style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                        {u.serial}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--sp-xs)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'var(--st-danger-bg)',
                          color: 'var(--danger-text)',
                          fontSize: 'var(--t-th)',
                          fontWeight: 700,
                        }}
                      >
                        <Icon name="alert_triangle" size={12} />
                        Misplaced
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{u.location}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--muted)' }}>{u.scannedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <PageBody
          loading={items.loading}
          error={items.error}
          onRetry={items.refetch}
          hasRows={items.rows.length > 0}
          empty={items.isEmpty}
          emptyIsFiltered={items.isFiltered}
          onClearFilters={() => setFilterMode('all')}
          noun="manifest lines"
          skeleton="table"
          skeletonRows={6}
          {...(items.isFiltered
            ? {}
            : {
                emptyTitle: 'No lines on this manifest',
                emptyMessage: 'This audit has no expected units recorded against it.',
              })}
        >
          {phone ? (
            /* Below 768 the manifest is card rows — `▪ item  Unverified`. */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.rows.map((it) => {
                const state = unitStateOfOutcome(it.outcome)
                return (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '12px 14px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {itemTitle(it)}
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{locationOf(it)}</div>
                    {itemMeta(it)}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                      {stateBadge(state)}
                      {state === 'Unverified' && rowActions(it)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: 8 }}>Item &amp; tag</th>
                    {/* Tablet drops the serial column — §7.3's "same, fewer columns". */}
                    {desktop && <th style={{ padding: 8 }}>Serial number</th>}
                    <th style={{ padding: 8 }}>Rack / shelf / bin</th>
                    <th style={{ padding: 8 }}>State</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.rows.map((it) => {
                    const state = unitStateOfOutcome(it.outcome)
                    return (
                      <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px' }}>{itemTitle(it)}</td>
                        {desktop && (
                          <td style={{ padding: '10px 8px' }}>
                            <span className="identifier" style={{ color: 'var(--text2)' }}>
                              {it.serialNo ?? '—'}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                          {locationOf(it)}
                          {itemMeta(it)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{stateBadge(state)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          {state === 'Unverified' && rowActions(it)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PageBody>
      )}

      {filterMode !== 'unexpected' && confirmMissingBar}
    </Card>
  )

  /* ── Page ────────────────────────────────────────────────────────────── */

  const restriction = stockAuditRestriction(user?.role)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)', paddingBottom: phone ? 76 : 'var(--sp-3xl)' }}>
      {/* §5 — breadcrumb only. The Shell carries the crumb trail and PLAN.md
          Phase 5 forbids a Back button. Embedded, the tab strip above already
          says where we are. */}
      {!embedded && (
        <PageHeader
          title={selected ? `Stock check: ${selected.auditNo}` : 'Stock check'}
          description={selected ? scopeLine(selected) : 'Physical count sessions against the live inventory record'}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => navigate('/inventory')}>
                Exit session
              </Button>
              {selected && !completed && (
                <Button variant="primary" icon={<Icon name="check" size={14} />} onClick={handleFinishAudit}>
                  Reconcile &amp; complete audit
                </Button>
              )}
              {selected && completed && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 'var(--r-xs)',
                    background: 'var(--st-in-bg)',
                    color: 'var(--success-text)',
                    fontWeight: 700,
                    fontSize: 'var(--t-meta)',
                  }}
                >
                  <Icon name="check" size={13} />
                  Audit completed
                </span>
              )}
            </div>
          }
        />
      )}

      {/* Law 12 — the reconcile rejection, inline and persistent. The session
          above it still reads In Progress, which is the truth. */}
      {reconcileError && <ErrorBanner title="The audit was not reconciled" message={reconcileError} />}

      <PageBody
        {...restriction}
        loading={audits.loading}
        error={audits.error}
        onRetry={audits.refetch}
        hasRows={audits.rows.length > 0}
        empty={audits.isEmpty}
        noun="stock audits"
        skeleton="card"
        emptyTitle="No stock audits yet"
        emptyMessage="No stock-take session exists in the record. Creating one from this screen is not wired yet; sessions appear here once they exist in the database."
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            <KpiStrip items={kpis} columns={4} />

            {/* §7.3's session card — `session · scheduled` over the progress bar. */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  <span className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {selected.auditNo}
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    scheduled {scheduledLabel(selected.scheduledDateAd)} · {selected.status}
                  </span>
                  <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                    {countOf(foundKpi, foundKpi.total)} / {countOf(expectedKpi, expectedKpi.total)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={progressPct ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Audit progress"
                  style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--hover)', overflow: 'hidden' }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: 'var(--nav-active-accent)',
                      transform: `scaleX(${(progressPct ?? 0) / 100})`,
                      transformOrigin: 'left',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </div>
                <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  An unscanned unit stays <strong>Unverified</strong>. Nothing on this screen marks one missing — that
                  is [Confirm missing], and a person presses it.
                </p>
              </div>
            </Card>

            {/*
              Desktop: session picker + scanner terminal to the left of the
              manifest. Below 1280 they reflow BENEATH the manifest — still
              visible, still operable, never behind a handle.
            */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: desktop ? 'minmax(300px, 360px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                gap: 'var(--sp-lg)',
                alignItems: 'start',
              }}
            >
              {desktop && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
                  {sessionsCard}
                  {scannerCard}
                  {scopeCard}
                </div>
              )}

              {manifest}

              {!desktop && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
                  {sessionsCard}
                  {scannerCard}
                  {scopeCard}
                </div>
              )}
            </div>
          </div>
        )}
      </PageBody>

      {/* §7.3 phone — a sticky `⦿ scan to verify` bar under the list. The Scanner
          FAB exists at every width in the shell; this is the screen's own
          in-context entry to the same modal. */}
      {phone && selected && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 5,
            padding: 'var(--sp-sm) var(--sp-md)',
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Button variant="primary" size="md" icon={<Icon name="camera" size={16} />} onClick={() => setShowScannerModal(true)}>
            Scan to verify
          </Button>
        </div>
      )}

      <BarcodeScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        mode="reset"
        items={items.rows.map((it) => ({
          id: it.id,
          name: titleOf(it),
          ...(it.serialNo ? { serial: it.serialNo } : {}),
          ...(it.assetTag ? { assetTag: it.assetTag } : {}),
        }))}
        matchLabel="matched — code copied to the scan field; press Scan to check it against the manifest (nothing saved)"
        onItemScanned={(item) => {
          setScanInput(item.serial ?? item.assetTag ?? item.id)
        }}
      />
    </div>
  )
}
