import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { SAMPLE_STOCK_CHECKS, unitState, STOCK_CHECK_STATE_META } from '../../data/stockCheck'
import type { StockCheckSession, StockCheckUnitState } from '../../data/stockCheck'

/**
 * **§7.3 Stock Check.**
 *
 * ## The correctness rule this screen exists to hold
 *
 * > *"unscanned = Unverified, never auto-Missing."*
 *
 * That is not a label. Nothing on this page — not the scan handler, not the
 * filter, not `Reconcile & Complete` — may turn an unscanned unit into a missing
 * one. A unit that nobody walked past is a unit nobody has information about,
 * and calling it Missing writes a loss into the record on the strength of a
 * warehouse officer being interrupted. **`[Confirm missing]` is the only path
 * from Unverified to Confirmed missing, and a person presses it**, per unit or
 * per selection, behind a `ConfirmDialog` that names what is being asserted.
 *
 * The three states therefore are: `Verified` (a scan saw it), `Unverified` (no
 * scan yet — the default and the resting state) and `Confirmed missing` (a human
 * said so). `data/stockCheck.ts`'s `unitState()` is the single derivation and
 * this file never re-derives one inline.
 *
 * ## Two surfaces, one component
 *
 * `/inventory/stock-check` is still a route — `data/caseIntel.ts:202`,
 * `data/rackIntel.ts:197` and `modules/reports/ProductReports.tsx:452` link
 * straight to it — and the same component is also the `?tab=stock-check` pane of
 * `/inventory`. `embedded` drops the page header the tab strip already provides;
 * nothing else changes between them.
 *
 * ## Three layouts
 *
 * §7.3 draws DESKTOP and TABLET identically — session card, list,
 * `[Confirm missing]`, scanner FAB — and PHONE as progress · list · scan bar. The
 * scanner terminal is a rail at desktop and **reflows beneath the list** below
 * 1180 (`WIREFRAME_RULINGS_2026-08-12.md` §7: collapse means reflow, not hide).
 */
export default function StockCheck({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const viewport = useViewport()
  const [session, setSession] = useState<StockCheckSession>(SAMPLE_STOCK_CHECKS[0]!)
  const [scanInput, setScanInput] = useState('')
  const [showScannerModal, setShowScannerModal] = useState(false)
  const [unexpectedUnits, setUnexpectedUnits] = useState<
    Array<{ serial: string; name: string; location: string; scannedAt: string }>
  >([])
  const [lastScannedFeedback, setLastScannedFeedback] = useState<{
    serial: string
    name: string
    match: boolean
    message: string
  } | null>(null)
  const [filterMode, setFilterMode] = useState<'all' | 'verified' | 'unverified' | 'missing' | 'unexpected'>('all')
  /** Serials queued for the manual `[Confirm missing]` assertion. Never auto-filled. */
  const [missingCandidates, setMissingCandidates] = useState<string[]>([])
  /** The one identity this session's reconcile may be recorded against. */
  const { user } = useAuth()
  /**
   * The last RECONCILE_STOCK_CHECK rejection. Law 12 — inline and persistent;
   * `useToast()` carries successes only and no error toast is invented here.
   */
  const [reconcileError, setReconcileError] = useState<string | null>(null)

  const phone = viewport === 'phone'
  const desktop = viewport === 'desktop'

  const counts = useMemo(() => {
    let verified = 0
    let unverified = 0
    let missing = 0
    for (const u of session.units) {
      const s = unitState(u)
      if (s === 'Verified') verified += 1
      else if (s === 'Confirmed missing') missing += 1
      else unverified += 1
    }
    return { verified, unverified, missing }
  }, [session])

  const totalCount = session.units.length
  const progressPct = totalCount > 0 ? Math.round((counts.verified / totalCount) * 100) : 0
  const unexpectedCount = unexpectedUnits.length

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = scanInput.trim().toUpperCase()
    if (!query) return

    const matchIdx = session.units.findIndex(
      (u) => u.serial.toUpperCase() === query || u.assetCode.toUpperCase() === query,
    )

    if (matchIdx !== -1) {
      const unit = session.units[matchIdx]!
      const updatedUnits = [...session.units]
      /*
       * A scan can only ever move a unit TOWARDS Verified. It also clears a
       * `confirmedMissing` that a person set earlier — finding the thing is
       * better evidence than not finding it — but nothing here sets that flag.
       */
      updatedUnits[matchIdx] = {
        ...unit,
        scanned: true,
        scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confirmedMissing: false,
      }

      setSession((prev) => ({
        ...prev,
        totalScanned: prev.totalScanned + (unit.scanned ? 0 : 1),
        totalUnverified: Math.max(0, prev.totalUnverified - (unit.scanned ? 0 : 1)),
        units: updatedUnits,
      }))

      setLastScannedFeedback({
        serial: unit.serial,
        name: unit.name,
        match: true,
        message: `Verified: ${unit.name} (${unit.serial}) at ${session.scopeDetail}`,
      })
    } else {
      // Not on this manifest. That is a MISPLACED item, which is a statement
      // about where a unit is — not a statement that any expected unit is gone.
      const newUnexpected = {
        serial: query,
        name: 'Unexpected Item Scanned',
        location: session.scopeDetail,
        scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setUnexpectedUnits((prev) => [newUnexpected, ...prev])

      setLastScannedFeedback({
        serial: query,
        name: 'Unexpected Item',
        match: false,
        message: `Warning: Item ${query} is NOT expected in this location manifest. Logged as Misplaced.`,
      })
    }

    setScanInput('')
  }

  /**
   * Completing the audit closes the session. It does **not** touch a single
   * unit's state: whatever is Unverified when the officer stops stays
   * Unverified, and the completion note says so out loud.
   *
   * ⭐ 12 Aug 2026 — the status flip now happens **after** RECONCILE_STOCK_CHECK
   * resolves. It used to be committed first, followed by a context-less,
   * catch-less dispatch: the header swapped to "Audit completed" and the
   * `Reconcile & complete audit` button disappeared, while `actions/core.ts`
   * refused the call outright and the rejection went nowhere. A closed audit
   * that was never reconciled is a count nobody can find later.
   */
  const handleFinishAudit = () => {
    if (!user) {
      setReconcileError(
        'You are not signed in, so this audit cannot be reconciled against anyone. Nothing was written and the session is still In Progress.',
      )
      return
    }
    setReconcileError(null)
    void import('../../actions/inventory/reconcileStockCheck')
      .then((m) =>
        m.reconcileStockCheck({ scannedCount: counts.verified, totalCount }, { userId: user.id, role: user.role }),
      )
      .then(() => setSession((prev) => ({ ...prev, status: 'Completed' })))
      .catch((err: unknown) => {
        console.error('reconcileStockCheck failed:', err)
        setReconcileError(err instanceof Error ? err.message : String(err))
      })
  }

  /** The one path from Unverified to Confirmed missing, and a person walks it. */
  const confirmMissing = () => {
    const queued = new Set(missingCandidates)
    setSession((prev) => ({
      ...prev,
      units: prev.units.map((u) => (queued.has(u.serial) && !u.scanned ? { ...u, confirmedMissing: true } : u)),
    }))
    setMissingCandidates([])
  }

  const unverifiedSerials = useMemo(
    () => session.units.filter((u) => unitState(u) === 'Unverified').map((u) => u.serial),
    [session],
  )

  const filteredUnits = session.units.filter((u) => {
    const s = unitState(u)
    if (filterMode === 'verified') return s === 'Verified'
    if (filterMode === 'unverified') return s === 'Unverified'
    if (filterMode === 'missing') return s === 'Confirmed missing'
    return true
  })

  /*
   * Per `WIREFRAME_RULINGS_2026-08-12.md` §1 the KPI strip stays — the wireframe
   * is a layout spec, not a content inventory. The four cards are counted from
   * the session in hand rather than read out of a seeded constant, so they
   * cannot disagree with the list beneath them.
   */
  const kpis: Kpi[] = [
    { label: 'Audit progress', value: `${progressPct}%`, icon: 'activity', accent: 'primary', note: `${counts.verified} of ${totalCount} verified` },
    { label: 'Verified', value: String(counts.verified), icon: 'check', accent: 'success', note: 'Scanned in this location' },
    { label: 'Unverified', value: String(counts.unverified), icon: 'alert_triangle', accent: 'progress', note: 'No scan yet — never counted as missing' },
    { label: 'Confirmed missing', value: String(counts.missing), icon: 'error', accent: 'danger', note: 'Asserted by a person, one at a time' },
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

  const scannerCard = (
    <Card title="Barcode / QR scan input">
      <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <div>
          <label htmlFor="stock-check-scan" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
            Scan serial or asset tag
          </label>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <input
              id="stock-check-scan"
              type="text"
              autoFocus={!embedded}
              placeholder="Scan or type SN-FX3-001…"
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
            <Button variant="primary" icon={<Icon name="checklist" size={13} />} onClick={handleScanSubmit}>
              Scan
            </Button>
            <Button type="button" icon={<Icon name="camera" size={13} />} onClick={() => setShowScannerModal(true)}>
              Camera
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-xs)' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginBottom: 6 }}>Quick test scanners:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {session.units
              .filter((u) => !u.scanned)
              .slice(0, 3)
              .map((u) => (
                <button
                  key={u.serial}
                  type="button"
                  onClick={() => setScanInput(u.serial)}
                  style={{
                    minHeight: 44,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: 'var(--hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-th)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {u.serial}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setScanInput('SN-AP6-UNKNOWN-99')}
              style={{
                minHeight: 44,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'var(--hover)',
                border: '1px solid var(--border)',
                color: 'var(--orange-text)',
                fontSize: 'var(--t-th)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Misplaced item test
            </button>
          </div>
        </div>

        {/* Law 12 — inline and persistent; a toast never carries this. */}
        {lastScannedFeedback && (
          <div
            style={{
              padding: 'var(--sp-md)',
              borderRadius: 'var(--r-sm)',
              background: lastScannedFeedback.match ? 'var(--st-in-bg)' : 'var(--st-out-bg)',
              border: `1px solid ${lastScannedFeedback.match ? 'var(--success-text)' : 'var(--orange-text)'}`,
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
                color: lastScannedFeedback.match ? 'var(--success-text)' : 'var(--orange-text)',
              }}
            >
              <Icon name={lastScannedFeedback.match ? 'check' : 'alert_triangle'} size={14} />
              <span>{lastScannedFeedback.match ? 'Item matched' : 'Location alert'}</span>
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--text)' }}>{lastScannedFeedback.message}</div>
          </div>
        )}
      </form>
    </Card>
  )

  const scopeCard = (
    <Card title="Session scope">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        <div>
          Facility: <strong style={{ color: 'var(--text)' }}>{session.warehouse}</strong>
        </div>
        <div>
          Scope: <strong style={{ color: 'var(--text)' }}>{session.scopeDetail}</strong>
        </div>
        <div>
          Auditor: <strong style={{ color: 'var(--text)' }}>{session.startedBy}</strong>
        </div>
        <div>
          Started: <strong style={{ color: 'var(--text)' }}>{session.startedAtBS}</strong>
        </div>
      </div>
    </Card>
  )

  /** §7.3's `[Confirm missing] (manual)`. Disabled while there is nothing to assert. */
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
        {counts.unverified} unverified · {counts.missing} confirmed missing
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <Button
          variant="outline"
          size="sm"
          disabled={unverifiedSerials.length === 0}
          onClick={() => setMissingCandidates(unverifiedSerials)}
        >
          Confirm missing — all {unverifiedSerials.length} unverified
        </Button>
      </span>
    </div>
  )

  const manifest = (
    <Card
      title={`Location manifest (${filteredUnits.length} of ${totalCount})`}
      action={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', maxWidth: '100%' }}>
          {[
            { id: 'all' as const, label: `All (${totalCount})` },
            { id: 'verified' as const, label: `Verified (${counts.verified})` },
            { id: 'unverified' as const, label: `Unverified (${counts.unverified})` },
            { id: 'missing' as const, label: `Missing (${counts.missing})` },
            { id: 'unexpected' as const, label: `Unexpected (${unexpectedCount})` },
          ].map((t) => {
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
      }
      bodyStyle={{ padding: 0 }}
    >
      {filterMode === 'unexpected' ? (
        <div style={{ overflowX: 'auto', padding: 'var(--sp-md)' }}>
          {unexpectedUnits.length === 0 ? (
            <EmptyState
              icon={<Icon name="alert_triangle" size={22} />}
              title="No misplaced or unexpected items scanned yet"
              description="Items scanned that don't match this location's manifest are logged here. A misplaced item says where something IS — it never marks an expected unit missing."
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: 8 }}>Scanned identifier</th>
                  <th style={{ padding: 8 }}>State</th>
                  <th style={{ padding: 8 }}>Location found</th>
                  <th style={{ padding: 8 }}>Time scanned</th>
                </tr>
              </thead>
              <tbody>
                {unexpectedUnits.map((u, i) => (
                  <tr key={`${u.serial}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
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
      ) : phone ? (
        /* Below 768 the manifest is card rows — `▪ item  Unverified`. */
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredUnits.map((u) => {
            const state = unitState(u)
            return (
              <div
                key={u.serial}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Link to={`/inventory/${encodeURIComponent(u.assetCode || u.serial)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                  <div className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {u.assetCode} · {u.serial}
                  </div>
                </Link>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{u.location}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {stateBadge(state)}
                  {state === 'Unverified' && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setScanInput(u.serial)}>
                        Manual verify
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setMissingCandidates([u.serial])}>
                        Confirm missing
                      </Button>
                    </>
                  )}
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
              {filteredUnits.map((u) => {
                const state = unitState(u)
                return (
                  <tr key={u.serial} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <Link to={`/inventory/${encodeURIComponent(u.assetCode || u.serial)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                        <div className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          {u.assetCode}
                          {!desktop && ` · ${u.serial}`}
                        </div>
                      </Link>
                    </td>
                    {desktop && (
                      <td style={{ padding: '10px 8px' }}>
                        <span className="identifier" style={{ color: 'var(--text2)' }}>
                          {u.serial}
                        </span>
                      </td>
                    )}
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{u.location}</td>
                    <td style={{ padding: '10px 8px' }}>{stateBadge(state)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {state === 'Unverified' && (
                        <span style={{ display: 'inline-flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <Button variant="ghost" size="sm" onClick={() => setScanInput(u.serial)}>
                            Manual verify
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setMissingCandidates([u.serial])}>
                            Confirm missing
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filterMode !== 'unexpected' && confirmMissingBar}
    </Card>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)', paddingBottom: phone ? 76 : 'var(--sp-3xl)' }}>
      {/* §5 — breadcrumb only. The `←` in §7.3's phone panel is wireframe
          shorthand for "this is a sub-page"; the Shell carries the crumb trail
          and PLAN.md Phase 5 forbids a Back button. Embedded, the tab strip
          above already says where we are. */}
      {!embedded && (
        <PageHeader
          title={`Stock check: ${session.sessionNo}`}
          description={`${session.scopeDetail} · auditor ${session.startedBy}`}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => navigate('/inventory')}>
                Exit session
              </Button>
              {session.status === 'In Progress' ? (
                <Button variant="primary" icon={<Icon name="check" size={14} />} onClick={handleFinishAudit}>
                  Reconcile &amp; complete audit
                </Button>
              ) : (
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

      <KpiStrip items={kpis} columns={4} />

      {/* §7.3's session card — `session · started · by` over the progress bar. */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <span className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>
              {session.sessionNo}
            </span>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              started {session.startedAtBS} · {session.startedBy}
            </span>
            <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
              {counts.verified} / {totalCount}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPct}
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
                transform: `scaleX(${progressPct / 100})`,
                transformOrigin: 'left',
                transition: 'transform 0.2s ease',
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            An unscanned unit stays <strong>Unverified</strong>. Nothing on this screen marks one missing — that is
            [Confirm missing], and a person presses it.
          </p>
        </div>
      </Card>

      {/*
        Desktop: scanner terminal to the left of the manifest, as built.
        Below 1180 it reflows BENEATH the manifest — still visible, still
        operable, never behind a handle.
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
            {scannerCard}
            {scopeCard}
          </div>
        )}

        {manifest}

        {!desktop && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            {scannerCard}
            {scopeCard}
          </div>
        )}
      </div>

      {/* §7.3 phone — a sticky `⦿ scan to verify` bar under the list. The Scanner
          FAB exists at every width in the shell; this is the screen's own
          in-context entry to the same modal. */}
      {phone && (
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

      <ConfirmDialog
        isOpen={missingCandidates.length > 0}
        onClose={() => setMissingCandidates([])}
        onConfirm={confirmMissing}
        variant="danger"
        title={
          missingCandidates.length === 1
            ? `Confirm ${missingCandidates[0]} is missing?`
            : `Confirm ${missingCandidates.length} units are missing?`
        }
        confirmLabel="Confirm missing"
        description={
          <>
            <p style={{ margin: '0 0 var(--sp-sm)' }}>
              This records a positive assertion that the unit is not where the manifest says it is. It is not the same
              statement as “not scanned yet”, which is what Unverified means and what these units are now.
            </p>
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {missingCandidates.slice(0, 8).map((s) => (
                <li key={s} className="identifier">
                  {s}
                </li>
              ))}
              {missingCandidates.length > 8 && <li>and {missingCandidates.length - 8} more</li>}
            </ul>
          </>
        }
      />

      <BarcodeScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        mode="reset"
        items={session.units.map((u) => ({
          id: u.serial,
          name: u.name,
          serial: u.serial,
          assetTag: u.serial,
        }))}
        onItemScanned={(item) => {
          setScanInput(item.serial ?? item.id)
        }}
      />
    </div>
  )
}
