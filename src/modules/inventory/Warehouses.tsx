import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import {
  WAREHOUSES,
  TRANSFERS,
  STORAGE_LOCATIONS,
  WAREHOUSE_STAFF,
  WAREHOUSE_KPIS,
  type Warehouse,
  type StockTransfer,
  type TransferStatus,
} from '../../data/warehouse'

export default function Warehouses() {
  const navigate = useNavigate()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('wh-01')
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'locations' | 'transfers' | 'staff'>('overview')
  const [transfers, setTransfers] = useState<StockTransfer[]>(TRANSFERS)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)

  // New Transfer Form State
  const [transferOrigin, setTransferOrigin] = useState('Kathmandu Main Hub (HQ)')
  const [transferDestination, setTransferDestination] = useState('Pokhara Regional Hub')
  const [transferItem, setTransferItem] = useState('Sony FX3 Cinema Camera')
  const [transferSerial, setTransferSerial] = useState('SN-FX3-009')
  const [transferNotes, setTransferNotes] = useState('Shoot Requirement for Pokhara Film Fest')

  const currentWarehouse = (WAREHOUSES.find((w) => w.id === selectedWarehouseId) ?? WAREHOUSES[0])!
  const warehouseLocations = STORAGE_LOCATIONS.filter((l) => l.warehouseId === currentWarehouse.id)
  const warehouseStaff = WAREHOUSE_STAFF.filter((s) => s.warehouse === currentWarehouse.name)

  const handleCreateTransfer = () => {
    const newTransfer: StockTransfer = {
      id: `tr-${Date.now().toString().slice(-4)}`,
      transferNo: `TR-2026-00${transfers.length + 1}`,
      type: 'Branch Transfer',
      sourceWarehouse: transferOrigin,
      sourceZone: 'Zone A (Cinema Bodies)',
      destinationWarehouse: transferDestination,
      destinationZone: 'Zone A (Outdoor & Drone)',
      assetCount: 1,
      items: [
        {
          assetCode: 'EQ000999',
          name: transferItem,
          serial: transferSerial,
          category: 'Camera',
          condition: 'Excellent',
        },
      ],
      status: 'Pending',
      requestedBy: 'Babin Staff',
      dateAD: new Date().toISOString().slice(0, 10),
      dateBS: '2083-04-22',
      notes: transferNotes,
    }
    setTransfers((prev) => [newTransfer, ...prev])
    setIsTransferModalOpen(false)
  }

  const handleAdvanceTransfer = (id: string, nextStatus: TransferStatus) => {
    setTransfers((prev) =>
      prev.map((t): StockTransfer => {
        if (t.id !== id) return t
        return {
          ...t,
          status: nextStatus,
          ...(nextStatus === 'In Transit' ? { dispatchedAt: 'Today 14:30' } : {}),
          ...(nextStatus === 'Completed' ? { receivedAt: 'Today 18:00' } : {}),
        }
      })
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 60 }}>
      {/* Header & Actions */}
      <PageHeader
        title="Warehouses & Depots"
        description="Multi-facility inventory storage, bin slotting, inter-branch logistics & staff allocation."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              variant="secondary"
              icon={<Icon name="truck" size={14} />}
              onClick={() => setIsTransferModalOpen(true)}
            >
              New Stock Transfer
            </Button>
            <Button
              variant="primary"
              icon={<Icon name="checklist" size={14} />}
              onClick={() => navigate('/inventory/stock-check')}
            >
              Start Stock Check
            </Button>
          </div>
        }
      />

      {/* KPI Cards Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {WAREHOUSE_KPIS.map((kpi, idx) => (
          <div
            key={idx}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--nav-active-bg)',
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

      {/* Facility Selector Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {WAREHOUSES.map((w: Warehouse) => {
          const isSelected = w.id === currentWarehouse.id
          return (
            <div
              key={w.id}
              onClick={() => setSelectedWarehouseId(w.id)}
              style={{
                background: isSelected ? 'var(--hover)' : 'var(--card)',
                border: isSelected ? '2px solid var(--nav-active-accent)' : '1px solid var(--border)',
                borderRadius: 'var(--r-card)',
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>{w.name}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>{w.address}</div>
                </div>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: w.status === 'Active' ? 'var(--st-in-bg)' : 'var(--hover)',
                    color: w.status === 'Active' ? 'var(--success-text)' : 'var(--muted)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 700,
                  }}
                >
                  {w.code}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginTop: 6,
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Assets</div>
                  <div className="figure" style={{ fontWeight: 700, fontSize: 'var(--t-meta)', marginTop: 2 }}>
                    {w.equipmentCount}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Occupancy</div>
                  <div
                    className="figure"
                    style={{
                      fontWeight: 700,
                      fontSize: 'var(--t-meta)',
                      marginTop: 2,
                      color: 'var(--nav-active-accent)',
                    }}
                  >
                    {w.occupancy}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Manager</div>
                  <div
                    style={{
                      fontSize: 'var(--t-th)',
                      color: 'var(--text)',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {w.manager}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Facility Workspace Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {[
          { id: 'overview' as const, label: `${currentWarehouse.name} Overview`, icon: 'box' as const },
          { id: 'locations' as const, label: `Storage Locations & Bins (${warehouseLocations.length})`, icon: 'home' as const },
          { id: 'transfers' as const, label: `Stock Transfers (${transfers.length})`, icon: 'truck' as const },
          { id: 'staff' as const, label: `Warehouse Staff (${warehouseStaff.length})`, icon: 'users' as const },
        ].map((tab) => {
          const active = activeSubTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: active ? 'var(--hover)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text2)',
                fontWeight: active ? 700 : 500,
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
              }}
            >
              <Icon name={tab.icon} size={14} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* 1. Overview */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>TOTAL ASSETS STORED</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4 }}>
                {currentWarehouse.equipmentCount}
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>NPR 42.8M Replacement Value</div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>OCCUPANCY CAPACITY</div>
              <div
                className="figure"
                style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--nav-active-accent)', marginTop: 4 }}
              >
                {currentWarehouse.occupancy}%
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{currentWarehouse.capacity - currentWarehouse.availableSpace} of {currentWarehouse.capacity} slots in use</div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>OPEN TRANSFERS</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--orange-text)', marginTop: 4 }}>
                {transfers.filter((t) => t.status === 'In Transit' || t.status === 'Pending').length} Active
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Inbound & Outbound</div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>LAST AUDIT / ACCURACY</div>
              <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success-text)', marginTop: 4 }}>
                {currentWarehouse.accuracyPct}%
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Verified 4 Shrawan 2083</div>
            </div>
          </div>

          <Card title="Storage Zone Layout & Quick Allocation">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {[
                { zone: 'Zone A — Cinema Cameras & Lenses', racks: 'Racks 01 to 04', items: '210 items', status: '88% full' },
                { zone: 'Zone B — Lighting & Ballasts', racks: 'Racks 05 to 10', items: '420 items', status: '75% full' },
                { zone: 'Zone C — Grip, Stands & Heavy Support', racks: 'Racks 11 to 18', items: '680 items', status: '92% full' },
                { zone: 'Zone D — Audio & Wireless Mic Vault', racks: 'Vault Cabinet D1-D4', items: '145 items', status: '60% full' },
                { zone: 'Zone E — Drone & Gimbal Tech Bay', racks: 'Bench E1-E3', items: '90 items', status: '50% full' },
                { zone: 'Zone F — Cables & Bulk Distribution', racks: 'Bins F1 to F24', items: '940 items', status: '82% full' },
              ].map((z, i) => (
                <div
                  key={i}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: 'var(--hover)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{z.zone}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {z.racks} · {z.items}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--nav-active-accent)' }}>
                      {z.status}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setActiveSubTab('locations')}>
                      View Bins
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 2. Locations & Bins */}
      {activeSubTab === 'locations' && (
        <Card title={`Storage Hierarchy & Bin Allocations — ${currentWarehouse.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px' }}>Zone</th>
                  <th style={{ padding: '8px' }}>Room</th>
                  <th style={{ padding: '8px' }}>Rack / Shelf / Bin</th>
                  <th style={{ padding: '8px' }}>Occupancy</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {warehouseLocations.map((loc) => (
                  <tr key={loc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text)' }}>{loc.zone}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{loc.room}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                      {loc.rack} · {loc.shelf} {loc.bin ? `· ${loc.bin}` : ''}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span className="figure" style={{ fontWeight: 600 }}>{loc.used}</span>
                      <span style={{ color: 'var(--muted)' }}> / {loc.capacity} slots</span>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <Button variant="ghost" size="sm">
                        Reallocate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 3. Stock Transfers */}
      {activeSubTab === 'transfers' && (
        <Card
          title="Stock Transfers (Inter-Warehouse Logistics)"
          action={
            <Button variant="primary" size="sm" icon={<Icon name="plus" size={13} />} onClick={() => setIsTransferModalOpen(true)}>
              Create Transfer
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px' }}>Transfer #</th>
                  <th style={{ padding: '8px' }}>Origin › Destination</th>
                  <th style={{ padding: '8px' }}>Items & Units</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Requested By</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Verification Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <span className="identifier" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {tr.transferNo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{tr.sourceWarehouse}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>› {tr.destinationWarehouse}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {tr.items.map((it, idx) => (
                        <div key={idx} style={{ fontSize: 'var(--t-meta)' }}>
                          {it.name} <span style={{ color: 'var(--muted)' }}>({it.serial})</span>
                        </div>
                      ))}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            tr.status === 'Completed' ? 'var(--st-in-bg)'
                            : tr.status === 'Received' ? 'var(--st-res-bg)'
                            : tr.status === 'In Transit' ? 'var(--orange-bg, rgba(234,88,12,0.1))'
                            : tr.status === 'Packing' ? 'var(--blue-bg, rgba(59,130,246,0.1))'
                            : tr.status === 'Approved' ? 'var(--st-rtn-bg)'
                            : tr.status === 'Cancelled' ? 'var(--st-out-bg)'
                            : 'var(--hover)',
                          color:
                            tr.status === 'Completed' ? 'var(--success-text)'
                            : tr.status === 'Received' ? 'var(--st-res-fg)'
                            : tr.status === 'In Transit' ? 'var(--orange-text)'
                            : tr.status === 'Packing' ? 'var(--blue-text, #2563eb)'
                            : tr.status === 'Approved' ? 'var(--st-rtn-fg)'
                            : tr.status === 'Cancelled' ? 'var(--danger)'
                            : 'var(--text2)',
                          border: '1px solid var(--border)',
                          fontSize: 'var(--t-th)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {tr.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                      <div>{tr.requestedBy}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{tr.dateAD}</div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {tr.status !== 'Completed' && tr.status !== 'Cancelled' && (
                          <Button variant="ghost" size="sm" onClick={() => handleAdvanceTransfer(tr.id, 'Cancelled')} style={{ color: 'var(--danger)' }}>
                            Cancel
                          </Button>
                        )}
                        {tr.status === 'Pending' && (
                          <Button variant="secondary" size="sm" onClick={() => handleAdvanceTransfer(tr.id, 'Approved')}>
                            Approve Transfer
                          </Button>
                        )}
                        {tr.status === 'Approved' && (
                          <Button variant="secondary" size="sm" onClick={() => handleAdvanceTransfer(tr.id, 'Packing')}>
                            Start Packing
                          </Button>
                        )}
                        {tr.status === 'Packing' && (
                          <Button variant="secondary" size="sm" onClick={() => handleAdvanceTransfer(tr.id, 'In Transit')}>
                            Dispatch (In Transit)
                          </Button>
                        )}
                        {tr.status === 'In Transit' && (
                          <Button variant="primary" size="sm" onClick={() => handleAdvanceTransfer(tr.id, 'Received')}>
                            Mark as Received
                          </Button>
                        )}
                        {tr.status === 'Received' && (
                          <Button variant="primary" size="sm" icon={<Icon name="check" size={13} />} onClick={() => handleAdvanceTransfer(tr.id, 'Completed')}>
                            Reconcile & Complete
                          </Button>
                        )}
                        {tr.status === 'Completed' && (
                          <span style={{ fontSize: 'var(--t-th)', color: 'var(--success-text)', fontWeight: 600 }}>
                            ✓ Reconciled
                          </span>
                        )}
                        {tr.status === 'Cancelled' && (
                          <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger)', fontWeight: 600 }}>
                            Cancelled
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4. Warehouse Staff */}
      {activeSubTab === 'staff' && (
        <Card title={`Warehouse Floor Personnel — ${currentWarehouse.name}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {warehouseStaff.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: 14,
                  borderRadius: 8,
                  background: 'var(--hover)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--nav-active-accent)',
                    fontWeight: 700,
                  }}
                >
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{s.name}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    {s.role} · {s.shift}
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>{s.phone}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: s.status === 'On Duty' ? 'var(--st-in-bg)' : 'var(--card)',
                    color: s.status === 'On Duty' ? 'var(--success-text)' : 'var(--muted)',
                  }}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* New Transfer Modal */}
      {isTransferModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setIsTransferModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: 8,
              width: 500,
              maxWidth: '90vw',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--t-title)', color: 'var(--text)' }}>Create Stock Transfer</h3>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Source Facility</label>
                <select
                  value={transferOrigin}
                  onChange={(e) => setTransferOrigin(e.target.value)}
                  style={{ width: '100%', padding: 8, marginTop: 4, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                >
                  {WAREHOUSES.map((w) => (
                    <option key={w.id} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Destination Facility</label>
                <select
                  value={transferDestination}
                  onChange={(e) => setTransferDestination(e.target.value)}
                  style={{ width: '100%', padding: 8, marginTop: 4, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                >
                  {WAREHOUSES.map((w) => (
                    <option key={w.id} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Item Name</label>
                <input
                  type="text"
                  value={transferItem}
                  onChange={(e) => setTransferItem(e.target.value)}
                  style={{ width: '100%', padding: 8, marginTop: 4, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Serial Number</label>
                <input
                  type="text"
                  value={transferSerial}
                  onChange={(e) => setTransferSerial(e.target.value)}
                  style={{ width: '100%', padding: 8, marginTop: 4, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Reason / Notes</label>
                <textarea
                  rows={2}
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  style={{ width: '100%', padding: 8, marginTop: 4, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', resize: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateTransfer}>
                Dispatch Transfer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
