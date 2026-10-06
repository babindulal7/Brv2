import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, PageActions, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { SearchInput } from '../../components/ui/SearchInput'
import { EmptyState } from '../../components/ui/StateViews'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  getDeliveries,
  updateDeliveryStatus,
  assignDeliveryRider,
  createDeliveryRecord,
  type DeliveryRecord,
  type DeliveryStatus,
  type DeliveryMode,
} from '../../lib/queries/delivery'
import { useToast } from '../../components/ui/Toast'
import { businessDayAd } from '../../lib/bs'
import './delivery.css'

const STATUS_BADGE_STYLE: Record<DeliveryStatus, { bg: string; color: string; border: string; icon: IconName }> = {
  Scheduled: { bg: 'var(--st-neutral-bg)', color: 'var(--st-neutral-fg)', border: '1px solid var(--border)', icon: 'timer' },
  Ready: { bg: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)', border: '1px solid var(--border)', icon: 'box' },
  'In Transit': { bg: 'var(--st-out-bg)', color: 'var(--st-out-fg)', border: '1px solid var(--border)', icon: 'truck' },
  Delivered: { bg: 'var(--st-in-bg)', color: 'var(--st-in-fg)', border: '1px solid var(--border)', icon: 'check' },
  Failed: { bg: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)', border: '1px solid var(--border)', icon: 'alert_circle' },
}

type ViewMode = 'table' | 'kanban'

export function DeliveryWorkspace() {
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(() => getDeliveries())
  const [statusFilter, setStatusFilter] = useState<'All' | DeliveryStatus>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const canMoney = useCanViewMoney()
  const viewport = useViewport()
  const isMobile = viewport === 'phone'
  const { showSuccessToast } = useToast()

  // Modal states
  const [assignTarget, setAssignTarget] = useState<DeliveryRecord | null>(null)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')

  const [deliverTarget, setDeliverTarget] = useState<DeliveryRecord | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')

  const [newModalOpen, setNewModalOpen] = useState(false)
  const [newBookingNo, setNewBookingNo] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newNeighborhood, setNewNeighborhood] = useState('')
  const [newMode, setNewMode] = useState<DeliveryMode>('Babin Delivery')
  const [newDate, setNewDate] = useState(() => businessDayAd())
  const [newTime, setNewTime] = useState('10:00')
  const [newNotes, setNewNotes] = useState('')

  const [gatePassSlip, setGatePassSlip] = useState<DeliveryRecord | null>(null)

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (statusFilter !== 'All' && d.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match =
          d.id.toLowerCase().includes(q) ||
          d.bookingNo.toLowerCase().includes(q) ||
          d.clientName.toLowerCase().includes(q) ||
          d.neighborhood.toLowerCase().includes(q) ||
          d.address.toLowerCase().includes(q) ||
          (d.driverName && d.driverName.toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [deliveries, statusFilter, searchQuery])

  // KPIs
  const inTransitCount = deliveries.filter((d) => d.status === 'In Transit').length
  const readyCount = deliveries.filter((d) => d.status === 'Ready').length
  const scheduledCount = deliveries.filter((d) => d.status === 'Scheduled').length
  const deliveredCount = deliveries.filter((d) => d.status === 'Delivered').length
  const totalRevenue = deliveries.reduce((acc, d) => acc + (d.status === 'Delivered' ? d.deliveryFeeNpr : 0), 0)

  const handleOpenAssign = (rec: DeliveryRecord) => {
    setAssignTarget(rec)
    setDriverName(rec.driverName ?? '')
    setDriverPhone(rec.driverPhone ?? '')
    setVehiclePlate(rec.vehiclePlate ?? '')
  }

  const handleSaveAssign = () => {
    if (!assignTarget) return
    const updated = assignDeliveryRider(assignTarget.id, driverName, driverPhone, vehiclePlate)
    setDeliveries(updated)
    setAssignTarget(null)
    showSuccessToast(`Rider/Driver assigned to ${assignTarget.id}`)
  }

  const handleStartTransit = (rec: DeliveryRecord) => {
    const updated = updateDeliveryStatus(rec.id, 'In Transit')
    setDeliveries(updated)
    showSuccessToast(`${rec.id} marked In Transit · Driver en route`)
  }

  const handleOpenDeliver = (rec: DeliveryRecord) => {
    setDeliverTarget(rec)
    setRecipientName(rec.recipientName || rec.clientName)
    setDeliveryNote('')
  }

  const handleConfirmDelivered = () => {
    if (!deliverTarget) return
    const updated = updateDeliveryStatus(deliverTarget.id, 'Delivered', {
      recipientName,
      notes: deliveryNote,
    })
    setDeliveries(updated)
    setDeliverTarget(null)
    showSuccessToast(`${deliverTarget.id} successfully marked Delivered to ${recipientName}`)
  }

  const handleCreateDelivery = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBookingNo || !newClientName || !newAddress) {
      showSuccessToast('Please fill all required delivery details')
      return
    }
    const created = createDeliveryRecord({
      bookingNo: newBookingNo.toUpperCase(),
      clientName: newClientName,
      clientPhone: newClientPhone,
      address: newAddress,
      neighborhood: newNeighborhood || 'Kathmandu Valley',
      mode: newMode,
      status: 'Scheduled',
      scheduledDate: newDate,
      scheduledTime: newTime,
      deliveryFeeNpr: newMode === 'Babin Delivery' ? 3500 : 1500,
      notes: newNotes,
      gatePassNo: `GP-${Math.floor(1000 + Math.random() * 9000)}`,
      packageSealNo: `BR-SEAL-${Math.floor(100 + Math.random() * 900)}`,
    })
    setDeliveries([created, ...deliveries])
    setNewModalOpen(false)
    showSuccessToast(`Created delivery order ${created.id}`)
  }

  return (
    <PageShell
      title="Delivery & Logistics"
      header={
        <PageHeader
          title="Delivery & Logistics"
          description="Kathmandu Valley rider & vehicle dispatch, gate passes, and delivery tracking."
          actions={
            <PageActions
              primary={
                <Button variant="primary" onClick={() => setNewModalOpen(true)}>
                  <Icon name="truck" size={16} /> + New Dispatch
                </Button>
              }
            />
          }
        />
      }
    >
      <PageBody>
        <div className="delivery-workspace">
          {/* KPI Strip */}
          <div className="delivery-kpi-grid">
            <div className="delivery-kpi-card delivery-kpi-card--transit">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">In Transit</span>
                <span className="delivery-kpi-icon" style={{ color: 'var(--gold)' }}>
                  <Icon name="truck" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--gold)' }}>{inTransitCount}</div>
                <div className="delivery-kpi-sub">Active on road</div>
              </div>
            </div>

            <div className="delivery-kpi-card delivery-kpi-card--ready">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">Ready / Staged</span>
                <span className="delivery-kpi-icon" style={{ color: 'var(--info)' }}>
                  <Icon name="box" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--info)' }}>{readyCount}</div>
                <div className="delivery-kpi-sub">Awaiting rider pickup</div>
              </div>
            </div>

            <div className="delivery-kpi-card delivery-kpi-card--scheduled">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">Scheduled</span>
                <span className="delivery-kpi-icon">
                  <Icon name="timer" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--text)' }}>{scheduledCount}</div>
                <div className="delivery-kpi-sub">Upcoming dispatches</div>
              </div>
            </div>

            <div className="delivery-kpi-card delivery-kpi-card--delivered">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">Delivered</span>
                <span className="delivery-kpi-icon" style={{ color: 'var(--green)' }}>
                  <Icon name="check" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--green)' }}>{deliveredCount}</div>
                <div className="delivery-kpi-sub">Completed handovers</div>
              </div>
            </div>

            {canMoney && (
              <div className="delivery-kpi-card delivery-kpi-card--revenue">
                <div className="delivery-kpi-top">
                  <span className="delivery-kpi-label">Delivery Revenue</span>
                  <span className="delivery-kpi-icon" style={{ color: 'var(--st-in-fg, #2ecc71)' }}>
                    <Icon name="dollar" size={16} />
                  </span>
                </div>
                <div>
                  <div className="delivery-kpi-val" style={{ color: 'var(--st-in-fg, #2ecc71)', fontSize: '22px' }}>
                    {formatMoney(rupees(totalRevenue))}
                  </div>
                  <div className="delivery-kpi-sub">Delivered fees collected</div>
                </div>
              </div>
            )}
          </div>

          {/* Toolbar & Filter Bar */}
          <div className="delivery-toolbar">
            <div className="delivery-toolbar-left">
              <SegmentedControl
                options={[
                  { id: 'All', label: 'All' },
                  { id: 'In Transit', label: 'In Transit', badge: inTransitCount > 0 ? inTransitCount : undefined },
                  { id: 'Ready', label: 'Ready', badge: readyCount > 0 ? readyCount : undefined },
                  { id: 'Scheduled', label: 'Scheduled', badge: scheduledCount > 0 ? scheduledCount : undefined },
                  { id: 'Delivered', label: 'Delivered' },
                  { id: 'Failed', label: 'Failed' },
                ]}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as 'All' | DeliveryStatus)}
                ariaLabel="Delivery status filter"
                size="sm"
              />
            </div>

            <div className="delivery-toolbar-right">
              <div style={{ width: isMobile ? '100%' : '260px' }}>
                <SearchInput
                  value={searchQuery}
                  onChange={(val) => setSearchQuery(val)}
                  onClear={() => setSearchQuery('')}
                  placeholder="Search dispatch, booking, address, rider…"
                  aria-label="Search deliveries"
                />
              </div>

              {!isMobile && (
                <SegmentedControl
                  options={[
                    { id: 'table', label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="checklist" size={14} /> Table</span> },
                    { id: 'kanban', label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="queues" size={14} /> Dispatch Board</span> },
                  ]}
                  value={viewMode}
                  onChange={(val) => setViewMode(val as ViewMode)}
                  ariaLabel="View mode"
                  size="sm"
                />
              )}
            </div>
          </div>

          {/* Main Content: Table or Kanban Board */}
          {filtered.length === 0 ? (
            <div className="delivery-table-wrapper" style={{ padding: '48px 16px' }}>
              <EmptyState
                kind={searchQuery || statusFilter !== 'All' ? 'no-results' : 'nothing-yet'}
                title={searchQuery || statusFilter !== 'All' ? 'No matching deliveries' : 'No deliveries scheduled'}
                description={
                  searchQuery || statusFilter !== 'All'
                    ? 'No dispatch records matched your active search query or status filter.'
                    : 'Dispatch records and courier runs will appear here as bookings get scheduled for delivery.'
                }
                actionLabel={searchQuery || statusFilter !== 'All' ? 'Clear Filters' : '+ New Dispatch'}
                onAction={() => {
                  if (searchQuery || statusFilter !== 'All') {
                    setSearchQuery('')
                    setStatusFilter('All')
                  } else {
                    setNewModalOpen(true)
                  }
                }}
              />
            </div>
          ) : viewMode === 'kanban' && !isMobile ? (
            /* Kanban Board View */
            <div className="delivery-kanban-board">
              {(['Scheduled', 'Ready', 'In Transit', 'Delivered'] as const).map((colStatus) => {
                const colDeliveries = filtered.filter((d) => d.status === colStatus)
                const colBadge = STATUS_BADGE_STYLE[colStatus]
                return (
                  <div key={colStatus} className="delivery-kanban-col">
                    <div className="delivery-kanban-header">
                      <div className="delivery-kanban-col-title">
                        <span style={{ color: colBadge.color }}>
                          <Icon name={colBadge.icon} size={15} />
                        </span>
                        <span>{colStatus}</span>
                      </div>
                      <span className="delivery-kanban-col-badge">{colDeliveries.length}</span>
                    </div>

                    <div className="delivery-kanban-list">
                      {colDeliveries.length === 0 ? (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                          No jobs in {colStatus}
                        </div>
                      ) : (
                        colDeliveries.map((d) => (
                          <div key={d.id} className="delivery-card-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <span className="identifier" style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: '13px' }}>
                                  {d.id}
                                </span>
                                <div style={{ marginTop: 2 }}>
                                  <Link
                                    to={`/rentals/${d.bookingNo}`}
                                    style={{
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      color: 'var(--text)',
                                      textDecoration: 'none',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <Icon name="truck" size={12} /> {d.bookingNo}
                                  </Link>
                                </div>
                              </div>
                              <button
                                type="button"
                                title="Print Gate Pass"
                                onClick={() => setGatePassSlip(d)}
                                style={{
                                  padding: '4px 6px',
                                  borderRadius: 'var(--r-xs)',
                                  background: 'var(--surface2)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text2)',
                                  cursor: 'pointer',
                                }}
                              >
                                <Icon name="file" size={13} />
                              </button>
                            </div>

                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>
                                {d.clientName}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="truck" size={12} /></span>
                                <span style={{ wordBreak: 'break-word' }}>{d.address}</span>
                              </div>
                              {d.clientPhone && (
                                <a
                                  href={`tel:${d.clientPhone}`}
                                  style={{
                                    fontSize: '11px',
                                    color: 'var(--info)',
                                    textDecoration: 'none',
                                    display: 'inline-block',
                                    marginTop: 3,
                                  }}
                                >
                                  📞 {d.clientPhone}
                                </a>
                              )}
                            </div>

                            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8, fontSize: '11px', color: 'var(--text3)' }}>
                              <div><strong>Scheduled:</strong> {d.scheduledDate} {d.scheduledTime}</div>
                              {d.driverName ? (
                                <div style={{ color: 'var(--text)', marginTop: 2 }}>
                                  <strong>Driver:</strong> {d.driverName} {d.vehiclePlate ? `(${d.vehiclePlate})` : ''}
                                </div>
                              ) : (
                                <div style={{ color: 'var(--gold)', marginTop: 2 }}>
                                  <em>Rider Unassigned</em>
                                </div>
                              )}
                            </div>

                            {/* Card action footer */}
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {d.status === 'Scheduled' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  style={{ width: '100%' }}
                                  onClick={() => handleOpenAssign(d)}
                                >
                                  Assign Driver
                                </Button>
                              )}
                              {d.status === 'Ready' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  style={{ width: '100%', background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }}
                                  onClick={() => handleStartTransit(d)}
                                >
                                  Dispatch Now
                                </Button>
                              )}
                              {d.status === 'In Transit' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  style={{ width: '100%', background: 'var(--green)', borderColor: 'var(--green)', color: '#fff' }}
                                  onClick={() => handleOpenDeliver(d)}
                                >
                                  Confirm Delivered ✓
                                </Button>
                              )}
                              {d.status === 'Delivered' && (
                                <div style={{ fontSize: '11px', color: 'var(--text3)', width: '100%', textAlign: 'center', padding: '4px' }}>
                                  ✓ Received{d.recipientName ? ` by ${d.recipientName}` : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Table View */
            <div className="delivery-table-wrapper">
              <DataTableShell ariaLabel="Deliveries">
                <table className="delivery-table">
                  <thead>
                    <tr>
                      <th>DISPATCH / BOOKING</th>
                      <th>CLIENT & DESTINATION</th>
                      <th>SCHEDULED</th>
                      <th>RIDER / VEHICLE</th>
                      <th>STATUS</th>
                      {canMoney && <th>FEE</th>}
                      <th style={{ textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const badge = STATUS_BADGE_STYLE[d.status]
                      return (
                        <tr key={d.id} className="delivery-row">
                          {/* Dispatch & Booking */}
                          <td>
                            <div className="identifier" style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: '13px' }}>
                              {d.id}
                            </div>
                            <Link
                              to={`/rentals/${d.bookingNo}`}
                              style={{
                                fontSize: '12px',
                                color: 'var(--text)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginTop: '3px',
                                fontWeight: 600,
                              }}
                            >
                              <Icon name="truck" size={13} /> {d.bookingNo}
                            </Link>
                          </td>

                          {/* Client & Address */}
                          <td style={{ maxWidth: '300px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{d.clientName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="truck" size={12} /> {d.address}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                              {d.clientPhone && (
                                <a
                                  href={`tel:${d.clientPhone}`}
                                  style={{
                                    fontSize: '11px',
                                    color: 'var(--info)',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  📞 {d.clientPhone}
                                </a>
                              )}
                              {d.neighborhood && (
                                <span style={{ fontSize: '10.5px', color: 'var(--text4)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>
                                  {d.neighborhood}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Scheduled Date/Time */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600 }}>{d.scheduledDate}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Icon name="timer" size={12} /> {d.scheduledTime}
                            </div>
                          </td>

                          {/* Driver / Rider */}
                          <td>
                            {d.driverName ? (
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{d.driverName}</div>
                                {d.vehiclePlate && (
                                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 1 }}>{d.vehiclePlate}</div>
                                )}
                                {d.driverPhone && (
                                  <a href={`tel:${d.driverPhone}`} style={{ fontSize: '11px', color: 'var(--info)', textDecoration: 'none', marginTop: 1, display: 'inline-block' }}>
                                    {d.driverPhone}
                                  </a>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAssign(d)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 'var(--r-btn)',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  background: 'rgba(255, 179, 0, 0.12)',
                                  color: 'var(--gold)',
                                  border: '1px dashed var(--gold)',
                                  cursor: 'pointer',
                                }}
                              >
                                + Assign Rider
                              </button>
                            )}
                          </td>

                          {/* Status */}
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 9px',
                                borderRadius: 'var(--r-chip)',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: badge.bg,
                                color: badge.color,
                                border: badge.border,
                              }}
                            >
                              <Icon name={badge.icon} size={12} />
                              {d.status}
                            </span>
                            {d.deliveredAt && (
                              <div style={{ fontSize: '10.5px', color: 'var(--text3)', marginTop: '3px' }}>
                                at {d.deliveredAt.slice(11)}
                              </div>
                            )}
                          </td>

                          {/* Fee */}
                          {canMoney && (
                            <td style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatMoney(rupees(d.deliveryFeeNpr))}
                            </td>
                          )}

                          {/* Actions */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                title="Print Gate Pass / Delivery Slip"
                                onClick={() => setGatePassSlip(d)}
                                style={{
                                  minWidth: 36,
                                  height: 34,
                                  padding: '0 8px',
                                  borderRadius: 'var(--r-btn)',
                                  background: 'var(--surface2)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text2)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '12px',
                                }}
                              >
                                <Icon name="file" size={14} />
                                <span>Slip</span>
                              </button>

                              {d.status === 'Scheduled' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenAssign(d)}
                                >
                                  Assign
                                </Button>
                              )}

                              {d.status === 'Ready' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  style={{ background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }}
                                  onClick={() => handleStartTransit(d)}
                                >
                                  Dispatch
                                </Button>
                              )}

                              {d.status === 'In Transit' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  style={{ background: 'var(--green)', borderColor: 'var(--green)', color: '#fff' }}
                                  onClick={() => handleOpenDeliver(d)}
                                >
                                  Delivered ✓
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          )}

          {/* Modal: Assign Rider / Driver */}
          {assignTarget && (
            <Modal
              isOpen
              onClose={() => setAssignTarget(null)}
              title={`Assign Driver / Rider — ${assignTarget.id}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Dispatch for booking <strong>{assignTarget.bookingNo}</strong> · {assignTarget.clientName}
                  <div style={{ color: 'var(--text3)', fontSize: '12px', marginTop: 2 }}>
                    Destination: {assignTarget.address} ({assignTarget.neighborhood})
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Driver / Rider Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Suman Rai (Babin Staff) / Ramesh Thapa"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Driver Contact Phone
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="+977 98..."
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Vehicle Plate / Transportation Type
                  </label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="e.g. Ba 3 Cha 8821 (Scorpio Van) or Pathao 2-Wheeler"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setAssignTarget(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSaveAssign}>
                    Save & Stage (Ready)
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: Confirm Delivered */}
          {deliverTarget && (
            <Modal
              isOpen
              onClose={() => setDeliverTarget(null)}
              title={`Confirm Equipment Delivery — ${deliverTarget.id}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'rgba(46, 204, 143, 0.08)',
                    border: '1px solid rgba(46, 204, 143, 0.3)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Booking <strong>{deliverTarget.bookingNo}</strong> for{' '}
                  <strong>{deliverTarget.clientName}</strong> at <strong>{deliverTarget.address}</strong>.
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Received By (Name & Designation) *
                  </label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Anil Gurung (Director / Production Manager)"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Handover Notes / Verification Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="Case seal verified intact, client signed physical delivery voucher."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setDeliverTarget(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleConfirmDelivered}>
                    Confirm Delivery ✓
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: New Delivery Dispatch Order */}
          {newModalOpen && (
            <Modal isOpen onClose={() => setNewModalOpen(false)} title="Create New Delivery Dispatch">
              <form onSubmit={handleCreateDelivery} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Booking Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BR-2616"
                      value={newBookingNo}
                      onChange={(e) => setNewBookingNo(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Delivery Mode
                    </label>
                    <select
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value as DeliveryMode)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    >
                      <option value="Babin Delivery">Babin Delivery (Van / Staff)</option>
                      <option value="Courier / Rider">Courier / Rider (Pathao / Cargo)</option>
                      <option value="Self Pickup">Self Pickup</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Client Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Production House or Director"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Client Phone
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="+977 98..."
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Delivery Full Address *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Street, Landmark, Ward, City"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Neighborhood / Area
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Jhamsikhel, Naxal, Baluwatar"
                      value={newNeighborhood}
                      onChange={(e) => setNewNeighborhood(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                        Date
                      </label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '44px',
                          padding: '8px 10px',
                          borderRadius: 'var(--r-btn)',
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                        Time
                      </label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '44px',
                          padding: '8px 10px',
                          borderRadius: 'var(--r-btn)',
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Logistics & Cargo Notes
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Security check details, floor number, fragile equipment instructions…"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setNewModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Create Dispatch Order
                  </Button>
                </div>
              </form>
            </Modal>
          )}

          {/* Modal: Gate Pass & Delivery Slip (Clean Printable Slip) */}
          {gatePassSlip && (
            <Modal isOpen onClose={() => setGatePassSlip(null)} title={`Gate Pass & Delivery Slip — ${gatePassSlip.id}`}>
              <div
                className="gatepass-print-area"
                style={{
                  background: 'var(--card)',
                  color: 'var(--text)',
                  padding: '24px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-id, "Source Sans 3", sans-serif)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ textAlign: 'center', borderBottom: '2px solid var(--border)', paddingBottom: '14px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent2)', fontWeight: 800 }}>
                    Official Dispatch Document
                  </div>
                  <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>BABIN RENTALS OS</h2>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Kathmandu Film Equipment Hub · Tel: +977 1 4567890</div>
                  <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                    EQUIPMENT GATE PASS & DELIVERY SLIP
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                  <div><strong>Dispatch ID:</strong> <span className="identifier">{gatePassSlip.id}</span></div>
                  <div><strong>Gate Pass No:</strong> <span className="identifier">{gatePassSlip.gatePassNo || 'GP-0499'}</span></div>
                  <div><strong>Booking Ref:</strong> <span className="identifier">{gatePassSlip.bookingNo}</span></div>
                  <div><strong>Security Seal:</strong> <span className="identifier">{gatePassSlip.packageSealNo || 'BR-SEAL-889'}</span></div>
                  <div><strong>Client:</strong> {gatePassSlip.clientName}</div>
                  <div><strong>Contact:</strong> {gatePassSlip.clientPhone}</div>
                  <div><strong>Destination:</strong> {gatePassSlip.address}</div>
                  <div><strong>Date / Time:</strong> {gatePassSlip.scheduledDate} · {gatePassSlip.scheduledTime}</div>
                  <div><strong>Carrier / Rider:</strong> {gatePassSlip.driverName || 'Unassigned'}</div>
                  <div><strong>Vehicle Plate:</strong> {gatePassSlip.vehiclePlate || 'N/A'}</div>
                </div>

                {gatePassSlip.notes && (
                  <div style={{ border: '1px dashed var(--border)', padding: '10px 12px', borderRadius: 'var(--r-xs)', marginBottom: '20px', background: 'var(--surface2)' }}>
                    <strong>Special Instructions:</strong> {gatePassSlip.notes}
                  </div>
                )}

                <div style={{ marginTop: '36px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', height: '36px' }}></div>
                    <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: 'var(--text3)' }}>Warehouse Dispatcher</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', height: '36px' }}></div>
                    <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: 'var(--text3)' }}>Driver / Carrier</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', height: '36px' }}></div>
                    <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: 'var(--text3)' }}>Receiver on Set</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <Button variant="secondary" onClick={() => setGatePassSlip(null)}>
                  Close
                </Button>
                <Button variant="primary" onClick={() => window.print()}>
                  <Icon name="download" size={15} /> Print Gate Pass ⎙
                </Button>
              </div>
            </Modal>
          )}
        </div>
      </PageBody>
    </PageShell>
  )
}

export default DeliveryWorkspace
