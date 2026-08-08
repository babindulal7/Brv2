import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { useAuth } from '../../lib/auth'
import { rupees, formatMoney } from '../../lib/money'
import { formatAd } from '../../lib/bs'
import { PARENTS } from '../../data/inventory'

type AssetTab = 'Units' | 'Timeline' | 'Maintenance' | 'Money' | 'Documents' | 'Activity'

export default function AssetDetail() {
  const { assetId } = useParams<{ assetId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isFloorRole = user?.role === ('technician' as any)

  const [activeTab, setActiveTab] = useState<AssetTab>('Units')
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set(['SN-FX3-001', 'SN-FX3-002']))
  const [selectedUnitForQr, setSelectedUnitForQr] = useState<string | null>(null)

  // Find asset or fallback to Sony FX3
  const asset = (PARENTS.find(p => p.code === assetId || p.children?.some(c => c.serial === assetId)) ?? PARENTS[0]) as typeof PARENTS[0]

  const toggleUnit = (serial: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      if (next.has(serial)) next.delete(serial)
      else next.add(serial)
      return next
    })
  }

  const availableCount = asset?.children?.filter(c => c.status === 'In Stock').length ?? 3
  const totalUnits = asset?.children?.length ?? 5
  const isSubRented = asset?.isSubRented ?? false

  const tabs: AssetTab[] = [
    'Units',
    'Timeline',
    'Maintenance',
    ...(!isFloorRole ? ['Money' as const] : []),
    'Documents',
    'Activity',
  ]

  // Seed maintenance history
  const maintenanceHistory = [
    { date: '2026-07-15', unit: 'SN-FX3-002', type: 'Routine Inspection', details: 'Sensor cleaning & firmware update to v5.0', cost: 4500, downtime: '1 day', tech: 'Dipendra KC' },
    { date: '2026-05-20', unit: 'SN-FX3-001', type: 'Repair', details: 'Replaced XLR handle bracket screws', cost: 3200, downtime: '2 days', tech: 'Studio Tech Center' },
    { date: '2026-02-10', unit: 'SN-FX3-004', type: 'Calibration', details: 'Full diagnostic & button tension reset', cost: 6000, downtime: '2 days', tech: 'Dipendra KC' },
  ]

  // Seed Activity DNA
  const activityLog = [
    { time: 'Today 09:15', event: 'Stock Check Verified', by: 'Ramesh Karki', note: 'Scan matched at Rack 01 · Shelf 02 · Bin A-1' },
    { time: '2026-08-04 17:30', event: 'Return Inspection QC Passed', by: 'Pooja Thapa', note: 'Condition marked Good, zero damage logged' },
    { time: '2026-08-01 10:00', event: 'Dispatched on Booking', by: 'Sunil Sharma', note: 'Assigned to BR-2026-0189 (Gorkha Productions)' },
    { time: '2026-07-28 14:20', event: 'Reset & Cleaned', by: 'Ramesh Karki', note: 'Profile reset to factory defaults, batteries fully charged' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>
      {/* Breadcrumbs & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Link to="/inventory" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Inventory</Link>
          <span>›</span>
          <span style={{ color: 'var(--text2)' }}>{asset?.category}</span>
          <span>›</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{asset?.name}</span>
          <span
            className="identifier"
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              fontSize: 'var(--t-th)',
              color: 'var(--nav-active-accent)',
            }}
          >
            {asset?.code ?? 'EQ000234'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="secondary" icon="download" onClick={() => setSelectedUnitForQr(asset?.children?.[0]?.serial ?? 'SN-FX3-001')}>
            Print Labels
          </Button>
          <Button variant="primary" icon="checklist" onClick={() => navigate('/rentals/new')}>
            Book Asset
          </Button>
        </div>
      </div>

      {/* Hero Header Block */}
      <div
        style={{
          ...cardStyle,
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
          border: isSubRented ? '2px solid var(--orange-text)' : '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 10,
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            {asset?.image ? (
              <img src={asset?.image} alt={asset?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Icon name="box" size={36} style={{ color: 'var(--muted)' }} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)' }}>
                {asset?.name}
              </h1>
              {isSubRented && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--orange-bg, rgba(234,88,12,0.1))',
                    border: '1px solid var(--orange-text)',
                    color: 'var(--orange-text)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 700,
                  }}
                >
                  External Sub-Rental
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>Brand: <strong style={{ color: 'var(--text)' }}>{asset?.brand ?? 'Sony'}</strong></span>
              <span>·</span>
              <span>Category: <strong style={{ color: 'var(--text)' }}>{asset?.category}</strong></span>
              <span>·</span>
              <span className="identifier" style={{ color: 'var(--nav-active-accent)' }}>{asset?.code ?? 'EQ000234'}</span>
            </div>
          </div>
        </div>

        {/* Derived Availability Ratio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--card2)', padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Live Availability
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success-text)' }}>
                {availableCount}
              </span>
              <span style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>/</span>
              <span className="figure" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
                {totalUnits} Units
              </span>
            </div>
          </div>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: availableCount > 0 ? 'var(--success-text)' : 'var(--danger-text)',
            }}
          />
        </div>
      </div>

      {/* Answer Strip: 4 Figures (No donuts) */}
      <div style={{ display: 'grid', gridTemplateColumns: isFloorRole ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>AVAILABLE NOW</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 4 }}>
            {availableCount} of {totalUnits}
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>In Kathmandu HQ</div>
        </div>

        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>NEXT FREE</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--nav-active-accent)', marginTop: 4 }}>
            Tomorrow 14:00
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>SN-FX3-004 returning</div>
        </div>

        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>UTILISATION (90D)</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
            {asset?.utilizationPct ?? 78}%
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>70 shoot days</div>
        </div>

        {!isFloorRole && (
          <div style={{ ...cardStyle, padding: '14px 16px' }}>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>RECOVERY %</div>
            <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 4 }}>
              {asset?.recoveryPct ?? 142}%
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>Paid for itself 14 Nov 2025</div>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {tabs.map(t => {
          const active = activeTab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: active ? 'var(--card2)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text2)',
                fontWeight: active ? 700 : 500,
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* Tab 1: Units */}
      {activeTab === 'Units' && (
        <Card title="Fleet Units & Serial Records">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px', width: 30 }} />
                  <th style={{ padding: '8px' }}>Serial Number</th>
                  <th style={{ padding: '8px' }}>Asset Tag</th>
                  <th style={{ padding: '8px' }}>Condition</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Location</th>
                  <th style={{ padding: '8px' }}>Usage / Rentals</th>
                  <th style={{ padding: '8px' }}>Last Seen</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {asset?.children?.map(u => {
                  const expanded = expandedUnits.has(u.serial)
                  return (
                    <>
                      <tr key={u.serial} style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <button
                            type="button"
                            onClick={() => toggleUnit(u.serial)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                          >
                            <Icon name={expanded ? 'arrow_down' : 'arrow_right'} size={12} />
                          </button>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className="identifier" style={{ fontWeight: 600, color: 'var(--text)' }}>
                            {u.serial}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className="identifier" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                            {u.assetTag ?? 'EQ000234-01'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: u.condition === 'Excellent' ? 'var(--st-in-bg)' : 'var(--card2)',
                              color: u.condition === 'Excellent' ? 'var(--success-text)' : 'var(--text2)',
                              border: '1px solid var(--border)',
                              fontSize: 'var(--t-th)',
                              fontWeight: 600,
                            }}
                          >
                            {u.condition}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{u.status}</span>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                          {u.location}
                        </td>
                        {/* No unit carries metered hours, a run count or a last
                            scan yet. These used to fall back to `120h`, `24 runs`
                            and `Today 09:12`, which reads as a measurement and is
                            not one — an em dash says "not recorded" honestly. */}
                        <td style={{ padding: '10px 8px' }}>
                          {u.usageHours === undefined && u.rentalCount === undefined ? (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          ) : (
                            <>
                              <span className="figure">{u.usageHours ?? '—'}h</span>
                              <span style={{ color: 'var(--muted)' }}> · {u.rentalCount ?? '—'} runs</span>
                            </>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          {u.lastSeen ? formatAd(u.lastSeen) : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button variant="ghost" onClick={() => setSelectedUnitForQr(u.serial)}>Label</Button>
                            <Button variant="ghost" onClick={() => navigate('/inventory')}>Edit</Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Child Accessories Checklist */}
                      {expanded && (
                        <tr key={`${u.serial}-child`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                          <td />
                          <td colSpan={8} style={{ padding: '8px 12px 14px' }}>
                            <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                              Child Accessories Checklist (Ticked during Packing & Return QC)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                              {(u.childAccessories ?? [
                                { id: 'ca-1', name: 'XLR Top Handle Unit', quantity: 1, required: true },
                                { id: 'ca-2', name: 'NP-FZ100 Battery (x2)', quantity: 2, required: true },
                                { id: 'ca-3', name: 'Body Cap & Sensor Protector', quantity: 1, required: true },
                                { id: 'ca-4', name: 'BC-QZ1 Dual Charger', quantity: 1, required: true },
                              ]).map(ca => (
                                <span
                                  key={ca.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    fontSize: 'var(--t-meta)',
                                  }}
                                >
                                  <Icon name="check" size={12} style={{ color: 'var(--success-text)' }} />
                                  <span>{ca.name}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Timeline */}
      {activeTab === 'Timeline' && (
        <Card title="Gantt Timeline — Availability & Bookings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Horizontal visual timeline per unit. Maintenance blocks render in the same lane to lock availability.
            </p>
            {asset?.children?.map(u => (
              <div key={u.serial} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="identifier" style={{ width: 120, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  {u.serial}
                </span>
                <div style={{ flex: 1, height: 32, borderRadius: 6, background: 'var(--card2)', position: 'relative', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                  {u.status === 'On Rent' && (
                    <div style={{ height: 24, width: '40%', borderRadius: 4, background: 'var(--orange-bg, rgba(234,88,12,0.2))', border: '1px solid var(--orange-text)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 'var(--t-th)', color: 'var(--orange-text)', fontWeight: 600 }}>
                      On Rent · BR-2026-0189 (Vision Prod)
                    </div>
                  )}
                  {u.status === 'Reserved' && (
                    <div style={{ height: 24, width: '35%', marginLeft: '30%', borderRadius: 4, background: 'var(--st-progress-bg)', border: '1px solid var(--nav-active-accent)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 'var(--t-th)', color: 'var(--nav-active-accent)', fontWeight: 600 }}>
                      Reserved · BR-2026-0195 (10-14 Aug)
                    </div>
                  )}
                  {u.status === 'In Stock' && (
                    <div style={{ height: 24, width: '100%', borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 'var(--t-th)', color: 'var(--success-text)', fontWeight: 600 }}>
                      ✓ Free & Ready in Kathmandu HQ
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 3: Maintenance */}
      {activeTab === 'Maintenance' && (
        <Card title="Service & Maintenance Record">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Unit</th>
                  <th style={{ padding: '8px' }}>Type</th>
                  <th style={{ padding: '8px' }}>Service Details</th>
                  <th style={{ padding: '8px' }}>Downtime</th>
                  <th style={{ padding: '8px' }}>Cost</th>
                  <th style={{ padding: '8px' }}>Technician</th>
                </tr>
              </thead>
              <tbody>
                {maintenanceHistory.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{m.date}</td>
                    <td style={{ padding: '10px 8px' }}><span className="identifier">{m.unit}</span></td>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{m.type}</td>
                    <td style={{ padding: '10px 8px' }}>{m.details}</td>
                    <td style={{ padding: '10px 8px' }}>{m.downtime}</td>
                    <td style={{ padding: '10px 8px' }} className="figure">{formatMoney(rupees(m.cost))}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{m.tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 4: Money (Omitted for Floor Roles) */}
      {activeTab === 'Money' && !isFloorRole && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>PURCHASE PRICE</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4 }}>NPR 465,000</div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Per unit avg</div>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>LIFETIME EARNINGS</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success-text)', marginTop: 4 }}>NPR 3,301,500</div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Across 5 units</div>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>RECOVERY %</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 4 }}>142%</div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Net ROI: +42%</div>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>REPAIRS TO DATE</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--danger-text)', marginTop: 4 }}>NPR 13,700</div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>0.6% of fleet value</div>
            </div>
          </div>

          <Card title="Monthly Fleet Revenue Progression">
            <div style={{ padding: '20px 10px', display: 'flex', alignItems: 'flex-end', gap: 14, height: 180 }}>
              {[
                { month: 'Magh', amt: 180000 },
                { month: 'Falgun', amt: 245000 },
                { month: 'Chaitra', amt: 320000 },
                { month: 'Baisakh', amt: 290000 },
                { month: 'Jestha', amt: 380000 },
                { month: 'Ashadh', amt: 410000 },
                { month: 'Shrawan', amt: 350000 },
              ].map(bar => (
                <div key={bar.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{Math.round(bar.amt / 1000)}k</div>
                  <div
                    style={{
                      width: '100%',
                      height: `${(bar.amt / 450000) * 120}px`,
                      borderRadius: 4,
                      background: 'var(--nav-active-accent)',
                      opacity: 0.85,
                    }}
                  />
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', fontWeight: 600 }}>{bar.month}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 5: Documents */}
      {activeTab === 'Documents' && (
        <Card title="Asset Documents & Certificates">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { name: 'Original Purchase Invoice (Tax VAT)', size: '1.4 MB', date: '15 Jun 2025' },
              { name: 'Sony Alpha Official Warranty Card', size: '820 KB', date: '15 Jun 2025' },
              { name: 'Sagarmatha Insurance Policy Schedule', size: '2.1 MB', date: '01 Jul 2026' },
              { name: 'Sony FX3 User Operating Manual (PDF)', size: '4.8 MB', date: '15 Jun 2025' },
              { name: 'Intake Inspection & QC Photos', size: '12.4 MB', date: '16 Jun 2025' },
            ].map((doc, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon name="file" size={24} style={{ color: 'var(--nav-active-accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{doc.size} · {doc.date}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 6: Activity DNA */}
      {activeTab === 'Activity' && (
        <Card title="Immutable Asset DNA (Activity Log)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activityLog.map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--nav-active-accent)',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <Icon name="error" size={12} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{log.event}</span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{log.time}</span>
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>{log.note}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>Recorded by {log.by}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Label Modal */}
      {selectedUnitForQr && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{ ...cardStyle, width: 400, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700 }}>Print Asset QR Label</h2>
              <button
                type="button"
                onClick={() => setSelectedUnitForQr(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div style={{ padding: 20, borderRadius: 8, background: '#fff', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: 0.5 }}>BABIN RENTALS</div>
              <div style={{ width: 120, height: 120, border: '2px solid #000', display: 'grid', placeItems: 'center', padding: 8 }}>
                <Icon name="queues" size={80} style={{ color: '#000' }} />
              </div>
              <div className="identifier" style={{ fontSize: '1rem', fontWeight: 800, color: '#000' }}>
                {selectedUnitForQr}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#444' }}>
                {asset?.name} · {asset?.code ?? 'EQ000234'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setSelectedUnitForQr(null)}>Close</Button>
              <Button variant="primary" icon="download" onClick={() => setSelectedUnitForQr(null)}>Print Label Sheet</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
