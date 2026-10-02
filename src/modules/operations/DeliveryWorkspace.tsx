import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, PageActions, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
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

const STATUS_BADGE_STYLE: Record<DeliveryStatus, { bg: string; color: string; border: string; icon: IconName }> = {
  Scheduled: { bg: 'rgba(255, 255, 255, 0.06)', color: 'var(--text3)', border: '1px solid var(--border)', icon: 'timer' },
  Ready: { bg: 'rgba(0, 168, 255, 0.12)', color: 'var(--info)', border: '1px solid rgba(0, 168, 255, 0.3)', icon: 'box' },
  'In Transit': { bg: 'rgba(255, 179, 0, 0.14)', color: 'var(--gold)', border: '1px solid rgba(255, 179, 0, 0.35)', icon: 'truck' },
  Delivered: { bg: 'rgba(46, 204, 143, 0.14)', color: 'var(--green)', border: '1px solid rgba(46, 204, 143, 0.4)', icon: 'check' },
  Failed: { bg: 'rgba(255, 71, 87, 0.14)', color: 'var(--red)', border: '1px solid rgba(255, 71, 87, 0.4)', icon: 'alert_circle' },
}

export function DeliveryWorkspace() {
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(() => getDeliveries())
  const [statusFilter, setStatusFilter] = useState<'All' | DeliveryStatus>('All')
  const [searchQuery, setSearchQuery] = useState('')
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
  /* Kathmandu's calendar day, not `toISOString()`'s — between 00:00 and 05:45
   * local those are different days, so a dispatch raised after midnight was
   * scheduled for yesterday. `data/today.ts` is where the offset lives. */
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
    /* Empty, not pre-filled. These used to fall back to a sample driver — a real
     * name, a real +977 number and a real vehicle plate — so opening the dialog
     * and pressing Save wrote a fabricated rider onto a live dispatch, and the
     * plate went on the gate pass. Nothing here invents a value the operator did
     * not type. */
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
        {/* KPI Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
            gap: 'var(--sp-sm)',
            marginBottom: 'var(--sp-md)',
          }}
        >
          <Card style={{ padding: '14px', borderLeft: '3px solid var(--info)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
              In Transit
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--gold)', marginTop: '4px' }}>
              {inTransitCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Active on road</div>
          </Card>

          <Card style={{ padding: '14px', borderLeft: '3px solid var(--info)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
              Ready / Staged
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
              {readyCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Awaiting rider pickup</div>
          </Card>

          <Card style={{ padding: '14px', borderLeft: '3px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
              Scheduled
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>
              {scheduledCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Upcoming dispatches</div>
          </Card>

          <Card style={{ padding: '14px', borderLeft: '3px solid var(--green)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
              Delivered
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--green)', marginTop: '4px' }}>
              {deliveredCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Completed handovers</div>
          </Card>

          {canMoney && (
            <Card style={{ padding: '14px', borderLeft: '3px solid var(--green)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
                Delivery Revenue
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--green)', marginTop: '4px' }}>
                {formatMoney(rupees(totalRevenue))}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Delivered fees collected</div>
            </Card>
          )}
        </div>

        {/* Toolbar & Filters */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            marginBottom: 'var(--sp-md)',
          }}
        >
          {/* Status Filter Chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['All', 'In Transit', 'Ready', 'Scheduled', 'Delivered', 'Failed'] as const).map((st) => {
              const active = statusFilter === st
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: active ? 'var(--accent2)' : 'var(--surface2)',
                    color: active ? '#04120B' : 'var(--text2)',
                    border: active ? '1px solid var(--accent2)' : '1px solid var(--border)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {st}
                </button>
              )
            })}
          </div>

          {/* Search Box */}
          <div style={{ minWidth: '260px' }}>
            <input
              type="text"
              placeholder="Search dispatch, booking, address, rider…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>
        </div>

        {/* Deliveries Table */}
        <DataTableShell ariaLabel="Deliveries">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontSize: '12px' }}>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>DISPATCH / BOOKING</th>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>CLIENT & DESTINATION</th>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>SCHEDULED</th>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>RIDER / VEHICLE</th>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>STATUS</th>
                {canMoney && <th style={{ padding: '12px 10px', fontWeight: 600 }}>FEE</th>}
                <th style={{ padding: '12px 10px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canMoney ? 7 : 6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text3)' }}>
                    No delivery jobs matching current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const badge = STATUS_BADGE_STYLE[d.status]
                  return (
                    <tr
                      key={d.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        fontSize: '13px',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Dispatch & Booking */}
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--accent2)' }}>{d.id}</div>
                        <Link
                          to={`/rentals/${d.bookingNo}`}
                          style={{
                            fontSize: '12px',
                            color: 'var(--text2)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '2px',
                          }}
                        >
                          <Icon name="truck" size={12} /> {d.bookingNo}
                        </Link>
                      </td>

                      {/* Client & Address */}
                      <td style={{ padding: '12px 10px', maxWidth: '280px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{d.clientName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                          <Icon name="truck" size={12} /> {d.address}
                        </div>
                        {d.clientPhone && (
                          <a
                            href={`tel:${d.clientPhone}`}
                            style={{
                              fontSize: '11px',
                              color: 'var(--info)',
                              textDecoration: 'none',
                              marginTop: '2px',
                              display: 'inline-block',
                            }}
                          >
                            📞 {d.clientPhone}
                          </a>
                        )}
                      </td>

                      {/* Scheduled Date/Time */}
                      <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                        <div>{d.scheduledDate}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{d.scheduledTime}</div>
                      </td>

                      {/* Driver / Rider */}
                      <td style={{ padding: '12px 10px' }}>
                        {d.driverName ? (
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text)' }}>{d.driverName}</div>
                            {d.vehiclePlate && (
                              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{d.vehiclePlate}</div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenAssign(d)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              background: 'rgba(255, 179, 0, 0.12)',
                              color: 'var(--gold)',
                              border: '1px dashed var(--gold)',
                              cursor: 'pointer',
                            }}
                          >
                            + Assign Driver
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 10px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: badge.bg,
                            color: badge.color,
                            border: badge.border,
                          }}
                        >
                          <Icon name={badge.icon} size={12} />
                          {d.status}
                        </span>
                        {d.deliveredAt && (
                          <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '2px' }}>
                            at {d.deliveredAt.slice(11)}
                          </div>
                        )}
                      </td>

                      {/* Fee */}
                      {canMoney && (
                        <td style={{ padding: '12px 10px', fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(rupees(d.deliveryFeeNpr))}
                        </td>
                      )}

                      {/* Actions */}
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            title="Print Gate Pass / Delivery Slip"
                            onClick={() => setGatePassSlip(d)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                              color: 'var(--text2)',
                              cursor: 'pointer',
                            }}
                          >
                            <Icon name="file" size={14} />
                          </button>

                          {d.status === 'Scheduled' && (
                            <button
                              type="button"
                              onClick={() => handleOpenAssign(d)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: 'var(--surface2)',
                                border: '1px solid var(--border)',
                                color: 'var(--text)',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              Assign
                            </button>
                          )}

                          {d.status === 'Ready' && (
                            <button
                              type="button"
                              onClick={() => handleStartTransit(d)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: 'rgba(255, 179, 0, 0.16)',
                                border: '1px solid var(--gold)',
                                color: 'var(--gold)',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Dispatch
                            </button>
                          )}

                          {d.status === 'In Transit' && (
                            <button
                              type="button"
                              onClick={() => handleOpenDeliver(d)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: 'rgba(46, 204, 143, 0.16)',
                                border: '1px solid var(--green)',
                                color: 'var(--green)',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Delivered ✓
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </DataTableShell>

        {/* Modal: Assign Rider / Driver */}
        {assignTarget && (
          <Modal
            isOpen
            onClose={() => setAssignTarget(null)}
            title={`Assign Driver / Rider — ${assignTarget.id}`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                  Driver / Rider Name
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                  Driver Contact Phone
                </label>
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                  Vehicle Plate / Description
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  placeholder="e.g. Ba 3 Cha 8821 (Scorpio Van) / Pathao Rider"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
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
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(46, 204, 143, 0.08)',
                  border: '1px solid rgba(46, 204, 143, 0.3)',
                  fontSize: '13px',
                }}
              >
                Booking <strong>{deliverTarget.bookingNo}</strong> for{' '}
                <strong>{deliverTarget.clientName}</strong> at <strong>{deliverTarget.address}</strong>.
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                  Received By (Name & Designation)
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="e.g. Anil Gurung (Director / PM)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
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
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
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
            <form onSubmit={handleCreateDelivery} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                    Booking Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="BR-2616"
                    value={newBookingNo}
                    onChange={(e) => setNewBookingNo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                    Delivery Mode
                  </label>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as DeliveryMode)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="Babin Delivery">Babin Delivery (Van / Staff)</option>
                    <option value="Courier / Rider">Courier / Rider (Pathao / Cargo)</option>
                    <option value="Self Pickup">Self Pickup</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
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
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                    Client Phone
                  </label>
                  <input
                    type="text"
                    placeholder="+977 98..."
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
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
                    padding: '8px',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                    Neighborhood / Area
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Jhamsikhel, Naxal, Baluwatar"
                    value={newNeighborhood}
                    onChange={(e) => setNewNeighborhood(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                      Date
                    </label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                      Time
                    </label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>
                  Logistics & Cargo Notes
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Security check details, floor number, fragile equipment instructions…"
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
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

        {/* Modal: Gate Pass & Delivery Slip */}
        {gatePassSlip && (
          <Modal isOpen onClose={() => setGatePassSlip(null)} title={`Gate Pass & Delivery Slip — ${gatePassSlip.id}`}>
            <div
              style={{
                background: '#fff',
                color: '#000',
                padding: '24px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>BABIN RENTALS OS</h2>
                <div style={{ fontSize: '12px', color: '#555' }}>Kathmandu Film Equipment Hub · Tel: +977 1 4567890</div>
                <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '15px' }}>EQUIPMENT GATE PASS & DELIVERY SLIP</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div><strong>Dispatch ID:</strong> {gatePassSlip.id}</div>
                <div><strong>Gate Pass No:</strong> {gatePassSlip.gatePassNo || 'GP-0499'}</div>
                <div><strong>Booking Ref:</strong> {gatePassSlip.bookingNo}</div>
                <div><strong>Security Seal:</strong> {gatePassSlip.packageSealNo || 'BR-SEAL-889'}</div>
                <div><strong>Client:</strong> {gatePassSlip.clientName}</div>
                <div><strong>Contact:</strong> {gatePassSlip.clientPhone}</div>
                <div><strong>Destination:</strong> {gatePassSlip.address}</div>
                <div><strong>Date/Time:</strong> {gatePassSlip.scheduledDate} {gatePassSlip.scheduledTime}</div>
                <div><strong>Carrier:</strong> {gatePassSlip.driverName || 'Unassigned'}</div>
                <div><strong>Vehicle:</strong> {gatePassSlip.vehiclePlate || 'N/A'}</div>
              </div>

              {gatePassSlip.notes && (
                <div style={{ border: '1px dashed #888', padding: '8px', marginBottom: '16px' }}>
                  <strong>Special Instructions:</strong> {gatePassSlip.notes}
                </div>
              )}

              <div style={{ marginTop: '36px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
                <div>
                  <div style={{ borderBottom: '1px solid #000', height: '30px' }}></div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Warehouse Dispatcher</div>
                </div>
                <div style={{ padding: '0 10px' }}>
                  <div style={{ borderBottom: '1px solid #000', height: '30px' }}></div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Driver / Carrier</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1px solid #000', height: '30px' }}></div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Receiver on Set</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button variant="secondary" onClick={() => setGatePassSlip(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => window.print()}>
                Print Gate Pass ⎙
              </Button>
            </div>
          </Modal>
        )}
      </PageBody>
    </PageShell>
  )
}
export default DeliveryWorkspace
