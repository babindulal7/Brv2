import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/StateViews'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import {
  SAMPLE_STOCK_CHECKS,
  type StockCheckSession,
} from '../../data/stockCheck'

export default function StockCheck() {
  const navigate = useNavigate()
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
  const [filterMode, setFilterMode] = useState<'all' | 'verified' | 'unverified' | 'unexpected'>('all')

  const verifiedCount = session.units.filter((u) => u.scanned).length
  const unverifiedCount = session.units.filter((u) => !u.scanned).length
  const unexpectedCount = unexpectedUnits.length
  const totalCount = session.units.length
  const progressPct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = scanInput.trim().toUpperCase()
    if (!query) return

    // Check if in expected units
    const matchIdx = session.units.findIndex(
      (u) => u.serial.toUpperCase() === query || u.assetCode.toUpperCase() === query
    )

    if (matchIdx !== -1) {
      const unit = session.units[matchIdx]!
      const updatedUnits = [...session.units]
      updatedUnits[matchIdx] = {
        ...unit,
        scanned: true,
        scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isUnverified: false as const,
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
      // Misplaced or Unexpected item found
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
        message: `Warning: Item ${query} is NOT expected in this location manifest. Logged as Misplaced!`,
      })
    }

    setScanInput('')
  }

  const handleFinishAudit = () => {
    setSession((prev) => ({ ...prev, status: 'Completed' }))
    import('../../actions/inventory/reconcileStockCheck').then((m) =>
      m.reconcileStockCheck({ scannedCount: verifiedCount, totalCount })
    )
  }

  const filteredUnits = session.units.filter((u) => {
    if (filterMode === 'verified') return u.scanned
    if (filterMode === 'unverified') return !u.scanned
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 60 }}>
      {/* Header & Session Bar */}
      <PageHeader
        title={`Stock Check Audit: ${session.sessionNo}`}
        description={`Location: ${session.scopeDetail} · Auditor: ${session.startedBy}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="ghost" onClick={() => navigate('/inventory')}>
              Exit Session
            </Button>
            {session.status === 'In Progress' ? (
              <Button
                variant="primary"
                icon={<Icon name="check" size={14} />}
                onClick={handleFinishAudit}
              >
                Reconcile & Complete Audit
              </Button>
            ) : (
              <span
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--r-xs)',
                  background: 'var(--st-in-bg)',
                  color: 'var(--success-text)',
                  fontWeight: 700,
                  fontSize: 'var(--t-meta)',
                }}
              >
                ✓ Audit Completed & Reconciled
              </span>
            )}
          </div>
        }
      />

      {/* Progress & Live Audit KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>AUDIT PROGRESS</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--nav-active-accent)', marginTop: 'var(--sp-xs)' }}>
            {progressPct}%
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--hover)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--nav-active-accent)', transform: `scaleX(${progressPct / 100})`, transformOrigin: 'left', transition: 'transform 0.2s ease' }} />
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>VERIFIED (MATCHED)</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 'var(--sp-xs)' }}>
            {verifiedCount} of {totalCount}
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>Scanned in correct location</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>UNVERIFIED (PENDING)</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: unverifiedCount > 0 ? 'var(--orange-text)' : 'var(--text2)', marginTop: 'var(--sp-xs)' }}>
            {unverifiedCount}
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>Self-heals upon scan</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>MISPLACED / UNEXPECTED</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: unexpectedCount > 0 ? 'var(--danger-text)' : 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
            {unexpectedCount}
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>Found from other zones</div>
        </div>
      </div>

      {/* Main Grid: Barcode Scanner Terminal (Left) | Manifest Table (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 20, alignItems: 'start' }}>
        {/* Scanner Terminal Rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <Card title="Barcode / QR Scan Input">
            <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                  Scan Serial or Asset Tag
                </label>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Scan or type SN-FX3-001..."
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    className="identifier"
                    style={{
                      flex: 1,
                      height: 38,
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
                    Camera Scanner
                  </Button>
                </div>
              </div>

              {/* Quick Barcode Simulation Buttons */}
              <div style={{ marginTop: 'var(--sp-xs)' }}>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginBottom: 6 }}>Quick Test Scanners:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {session.units
                    .filter((u) => !u.scanned)
                    .slice(0, 3)
                    .map((u) => (
                      <button
                        key={u.serial}
                        type="button"
                        onClick={() => {
                          setScanInput(u.serial)
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          background: 'var(--hover)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: 'var(--t-th)',
                          cursor: 'pointer',
                        }}
                      >
                        {u.serial}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setScanInput('SN-AP6-UNKNOWN-99')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: 'var(--hover)',
                      border: '1px solid var(--border)',
                      color: 'var(--orange-text)',
                      fontSize: 'var(--t-th)',
                      cursor: 'pointer',
                    }}
                  >
                    Misplaced Item Test
                  </button>
                </div>
              </div>

              {/* Live Scan Feedback Card */}
              {lastScannedFeedback && (
                <div
                  style={{
                    padding: 'var(--sp-md)',
                    borderRadius: 'var(--r-sm)',
                    background: lastScannedFeedback.match ? 'var(--st-in-bg)' : 'var(--st-out-bg, rgba(234,88,12,0.1))',
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
                    <span>{lastScannedFeedback.match ? 'Item Matched' : 'Location Alert'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text)' }}>
                    {lastScannedFeedback.message}
                  </div>
                </div>
              )}
            </form>
          </Card>

          <Card title="Session Scope">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <div>Facility: <strong style={{ color: 'var(--text)' }}>{session.warehouse}</strong></div>
              <div>Scope: <strong style={{ color: 'var(--text)' }}>{session.scopeDetail}</strong></div>
              <div>Auditor: <strong style={{ color: 'var(--text)' }}>{session.startedBy}</strong></div>
              <div>Started: <strong style={{ color: 'var(--text)' }}>{session.startedAtBS}</strong></div>
            </div>
          </Card>
        </div>

        {/* Manifest Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <Card
            title={`Location Manifest (${filteredUnits.length} Expected Items)`}
            action={
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'all' as const, label: `All (${totalCount})` },
                  { id: 'verified' as const, label: `Verified (${verifiedCount})` },
                  { id: 'unverified' as const, label: `Unverified (${unverifiedCount})` },
                  { id: 'unexpected' as const, label: `Unexpected (${unexpectedCount})` },
                ].map((tab) => {
                  const active = filterMode === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterMode(tab.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        background: active ? 'var(--hover)' : 'transparent',
                        border: `1px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
                        color: active ? 'var(--text)' : 'var(--text2)',
                        fontWeight: active ? 700 : 500,
                        fontSize: 'var(--t-th)',
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            }
          >
            {filterMode === 'unexpected' ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '8px' }}>Scanned Identifier</th>
                      <th style={{ padding: '8px' }}>Status</th>
                      <th style={{ padding: '8px' }}>Location Found</th>
                      <th style={{ padding: '8px' }}>Time Scanned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unexpectedUnits.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                          <EmptyState
                            icon={<Icon name="alert_triangle" size={22} />}
                            title="No misplaced or unexpected items scanned yet"
                            description="Items scanned that don't match this location's manifest will be logged here."
                          />
                        </td>
                      </tr>
                    ) : (
                      unexpectedUnits.map((u, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <span className="identifier" style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                              {u.serial}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--st-out-bg, rgba(239,68,68,0.1))',
                                color: 'var(--danger-text)',
                                fontSize: 'var(--t-th)',
                                fontWeight: 700,
                              }}
                            >
                              MISPLACED
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{u.location}</td>
                          <td style={{ padding: '10px 8px', color: 'var(--muted)' }}>{u.scannedAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '8px' }}>Item & Tag</th>
                      <th style={{ padding: '8px' }}>Serial Number</th>
                      <th style={{ padding: '8px' }}>Rack / Shelf / Bin</th>
                      <th style={{ padding: '8px' }}>Status</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnits.map((u) => (
                      <tr key={u.serial} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <Link
                            to={`/inventory/${encodeURIComponent(u.assetCode || u.serial)}`}
                            style={{ color: 'inherit', textDecoration: 'none' }}
                          >
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                            <div className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                              {u.assetCode}
                            </div>
                          </Link>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className="identifier" style={{ color: 'var(--text2)' }}>
                            {u.serial}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{u.location}</td>
                        <td style={{ padding: '10px 8px' }}>
                          {u.scanned ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 'var(--sp-xs)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--st-in-bg)',
                                color: 'var(--success-text)',
                                fontSize: 'var(--t-th)',
                                fontWeight: 700,
                              }}
                            >
                              <Icon name="check" size={12} />
                              VERIFIED
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--hover)',
                                color: 'var(--orange-text)',
                                border: '1px solid var(--border)',
                                fontSize: 'var(--t-th)',
                                fontWeight: 700,
                              }}
                            >
                              UNVERIFIED
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          {!u.scanned && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setScanInput(u.serial)
                              }}
                            >
                              Manual Verify
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
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
