import { useState, useMemo } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import {
  PURCHASE_REQUESTS,
  PURCHASE_REQUEST_KPIS,
  type PRStatus,
  type PRPriority,
} from '../../data/purchaseRequests'
import { rupees } from '../../lib/money'

export default function PurchaseRequests() {
  const [activeTab, setActiveTab] = useState<'All' | 'Draft' | 'Submitted' | 'Approved' | 'Ordered' | 'Received'>('All')
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)

  const activePR = useMemo(() => {
    return PURCHASE_REQUESTS.find((pr) => pr.id === selectedPrId) ?? null
  }, [selectedPrId])

  const filteredPRs = useMemo(() => {
    if (activeTab === 'All') return PURCHASE_REQUESTS
    return PURCHASE_REQUESTS.filter((pr) => pr.status === activeTab)
  }, [activeTab])

  const handleStatusChange = (id: string, newStatus: PRStatus) => {
    // In real app, this would dispatch to store/backend
    console.log(`Advancing PR ${id} to ${newStatus}`)
  }

  const PRIORITY_COLORS: Record<PRPriority, { bg: string; text: string }> = {
    High: { bg: 'var(--st-out-bg, rgba(239, 68, 68, 0.1))', text: 'var(--danger-text)' },
    Medium: { bg: 'var(--st-progress-bg)', text: 'var(--progress-text)' },
    Low: { bg: 'var(--st-in-bg)', text: 'var(--success-text)' },
  }

  const STATUS_COLORS: Record<PRStatus, { bg: string; text: string }> = {
    Draft: { bg: 'var(--hover)', text: 'var(--text2)' },
    Submitted: { bg: 'var(--st-progress-bg)', text: 'var(--progress-text)' },
    Approved: { bg: 'var(--st-in-bg, rgba(16, 185, 129, 0.15))', text: 'var(--success-text)' },
    Ordered: { bg: 'var(--st-out-bg)', text: 'var(--orange-text)' },
    Received: { bg: 'var(--st-in-bg)', text: 'var(--success-text)' },
    Rejected: { bg: 'var(--st-out-bg, rgba(239, 68, 68, 0.15))', text: 'var(--danger-text)' },
    Cancelled: { bg: 'var(--hover)', text: 'var(--muted)' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 60 }}>
      {/* Header & Metrics */}
      <PageHeader
        title="Purchase Requests"
        description="Data-driven equipment acquisition workflows based on turnaways and sub-rental evidence."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" icon={<Icon name="file" size={14} />}>
              Filter
            </Button>
            <Button variant="primary" icon={<Icon name="plus" size={14} />}>
              New Draft PR
            </Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {PURCHASE_REQUEST_KPIS.map((kpi, idx) => (
          <div key={idx} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--hover)',
                  color: 'var(--nav-active-accent)',
                }}
              >
                <Icon name={kpi.icon} size={15} />
              </span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div className="figure" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>{kpi.change}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {(['All', 'Draft', 'Submitted', 'Approved', 'Ordered', 'Received'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: activeTab === t ? 'var(--hover)' : 'transparent',
              color: activeTab === t ? 'var(--text)' : 'var(--text2)',
              border: `1px solid ${activeTab === t ? 'var(--nav-active-accent)' : 'transparent'}`,
              fontWeight: activeTab === t ? 700 : 500,
              fontSize: 'var(--t-meta)',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: activePR ? '1fr 420px' : '1fr', gap: 16, alignItems: 'start' }}>
        {/* Table View */}
        <Card title={`${activeTab} Purchase Requests (${filteredPRs.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px' }}>PR Number</th>
                  <th style={{ padding: '8px' }}>Equipment Item</th>
                  <th style={{ padding: '8px' }}>Qty</th>
                  <th style={{ padding: '8px' }}>Priority</th>
                  <th style={{ padding: '8px' }}>Total Cost (Est)</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Requested By</th>
                </tr>
              </thead>
              <tbody>
                {filteredPRs.map((pr) => {
                  const isSel = pr.id === selectedPrId
                  return (
                    <tr
                      key={pr.id}
                      onClick={() => setSelectedPrId(pr.id)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSel ? 'var(--hover)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <span className="identifier" style={{ color: 'var(--nav-active-accent)', fontWeight: 600 }}>
                          {pr.prNo}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{pr.fleetItemName}</div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          {pr.reason}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{pr.requestedQty}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: PRIORITY_COLORS[pr.priority].bg,
                            color: PRIORITY_COLORS[pr.priority].text,
                            fontSize: 'var(--t-th)',
                            fontWeight: 700,
                          }}
                        >
                          {pr.priority}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span className="figure" style={{ fontWeight: 600 }}>
                          {rupees(pr.totalEstimatedCost)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: STATUS_COLORS[pr.status].bg,
                            color: STATUS_COLORS[pr.status].text,
                            fontSize: 'var(--t-th)',
                            fontWeight: 700,
                          }}
                        >
                          {pr.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ color: 'var(--text2)' }}>{pr.requestedBy.split(' ')[0]}</div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{pr.dateCreatedAD}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* PR Detail Flyout / Side Panel */}
        {activePR && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
              title={`PR Overview — ${activePR.prNo}`}
              action={
                <button onClick={() => setSelectedPrId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                  <Icon name="close" size={14} />
                </button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Equipment</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
                    {activePR.fleetItemName} <span style={{ color: 'var(--muted)' }}>(x{activePR.requestedQty})</span>
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Category: {activePR.category}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Est Unit Cost</div>
                    <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{rupees(activePR.estimatedUnitCost)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Total Cost</div>
                    <div className="figure" style={{ fontWeight: 700, color: 'var(--nav-active-accent)' }}>{rupees(activePR.totalEstimatedCost)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Preferred Supplier</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{activePR.suggestedSupplier || 'TBD'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Priority Score</div>
                    <div className="figure" style={{ fontWeight: 700, color: PRIORITY_COLORS[activePR.priority].text }}>
                      {activePR.priorityScore} ({activePR.priority})
                    </div>
                  </div>
                </div>

                {activePR.notes && (
                  <div style={{ padding: 10, background: 'var(--hover)', borderRadius: 6, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginBottom: 4 }}>Justification Notes:</div>
                    {activePR.notes}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Acquisition Evidence (Data Room)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Refused Bookings (Losses)</div>
                    <div className="figure" style={{ color: 'var(--danger-text)', fontWeight: 700 }}>{activePR.refusedCount} Events</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-th)' }}>
                      <thead style={{ background: 'var(--hover)' }}>
                        <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Booking</th>
                          <th style={{ padding: '6px 8px' }}>Client</th>
                          <th style={{ padding: '6px 8px' }}>Shortage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePR.refusedBookings.map((rb) => (
                          <tr key={rb.bookingId} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }} className="identifier">{rb.bookingRef}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{rb.client}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--danger-text)', fontWeight: 600 }}>-{rb.quantityShort}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Sub-Rental Expenses</div>
                    <div className="figure" style={{ color: 'var(--orange-text)', fontWeight: 700 }}>{rupees(activePR.totalSubRentPaid)}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-th)' }}>
                      <thead style={{ background: 'var(--hover)' }}>
                        <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Sub-Rent Ref</th>
                          <th style={{ padding: '6px 8px' }}>Supplier</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePR.subRentals.map((sr) => (
                          <tr key={sr.subRentalId} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }} className="identifier">{sr.subRentalRef}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{sr.supplier}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }} className="figure">{rupees(sr.costPaid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>

            {/* Approvals Block */}
            {activePR.status === 'Submitted' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button variant="secondary" onClick={() => handleStatusChange(activePR.id, 'Rejected')} style={{ flex: 1, color: 'var(--danger-text)' }}>
                  Reject PR
                </Button>
                <Button variant="primary" icon={<Icon name="check" size={14} />} onClick={() => handleStatusChange(activePR.id, 'Approved')} style={{ flex: 1 }}>
                  Approve Purchase
                </Button>
              </div>
            )}
            {activePR.status === 'Approved' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button variant="primary" icon={<Icon name="truck" size={14} />} onClick={() => handleStatusChange(activePR.id, 'Ordered')} style={{ flex: 1 }}>
                  Mark as Ordered
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
