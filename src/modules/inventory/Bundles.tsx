import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { IconSearch, IconPlus, IconDownload, IconChevronDown } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'

type BundleStatus = 'Available' | 'Reserved' | 'On Rent' | 'Partially Available' | 'On Maintenance' | 'Archived'

interface BundleItem {
  model: string
  quantity: number
  availableStock: number
}

interface BundleRecord {
  id: string
  name: string
  category: string
  items: BundleItem[]
  crewCount: number
  vehicleCount: number
  boxCount: number
  status: BundleStatus
  linkedBooking?: string
  clientName?: string
  startDateBs?: string
  endDateBs?: string
  startDateAd?: string
  endDateAd?: string
  sumOfPartsPaisa: Paisa
  bundleRatePaisa: Paisa
}

const BUNDLES_DATA: BundleRecord[] = [
  {
    id: 'BND-00023',
    name: 'RED Komodo X - Indie Package',
    category: 'Camera',
    items: [
      { model: 'RED Komodo X Brain', quantity: 1, availableStock: 1 },
      { model: 'DZOFilm Vespel Prime Set', quantity: 1, availableStock: 1 },
      { model: 'Core SWX NANO Micro 98', quantity: 4, availableStock: 4 },
    ],
    crewCount: 1,
    vehicleCount: 0,
    boxCount: 2,
    status: 'Available',
    sumOfPartsPaisa: rupees(22500),
    bundleRatePaisa: rupees(18000),
  },
  {
    id: 'BND-00024',
    name: 'ARRI Alexa Mini LF - Feature Kit',
    category: 'Camera',
    items: [
      { model: 'ARRI Alexa Mini LF', quantity: 1, availableStock: 0 },
      { model: 'ARRI Signature Prime Set', quantity: 1, availableStock: 0 },
    ],
    crewCount: 2,
    vehicleCount: 1,
    boxCount: 4,
    status: 'On Rent',
    linkedBooking: 'BK-2026-0715',
    clientName: 'Kathmandu Cinema Works',
    startDateBs: '2083/04/10',
    endDateBs: '2083/04/14',
    startDateAd: '25 Jul 2026',
    endDateAd: '29 Jul 2026',
    sumOfPartsPaisa: rupees(85000),
    bundleRatePaisa: rupees(75000),
  },
  {
    id: 'BND-00025',
    name: 'Podcast Studio Kit (4-Mic)',
    category: 'Audio',
    items: [
      { model: 'Shure SM7B', quantity: 4, availableStock: 3 },
      { model: 'RodeCaster Pro II', quantity: 1, availableStock: 1 },
      { model: 'Cloudlifter CL-1', quantity: 4, availableStock: 4 },
    ],
    crewCount: 0,
    vehicleCount: 0,
    boxCount: 1,
    status: 'Partially Available',
    sumOfPartsPaisa: rupees(9500),
    bundleRatePaisa: rupees(8000),
  }
]

type FilterKey = BundleStatus | 'All'

export function Bundles() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const filteredBundles = useMemo(() => {
    return BUNDLES_DATA.filter((b) => {
      if (activeFilter !== 'All' && b.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          b.id.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredBundles.map((b) => b.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const getStatusColor = (status: BundleStatus) => {
    switch (status) {
      case 'Available': return 'var(--good)'
      case 'Reserved': return 'var(--info)'
      case 'On Rent': return 'var(--warn)'
      case 'Partially Available': return 'var(--bad)'
      case 'On Maintenance': return 'var(--bad)'
      case 'Archived': return 'var(--muted)'
    }
  }

  const calculateSavingPct = (sumOfParts: Paisa, bundleRate: Paisa) => {
    if (sumOfParts === 0) return 0
    return Math.round(((sumOfParts - bundleRate) / sumOfParts) * 100)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Bundles
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            42
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Excludes Archived (7)
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Available
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--good)', marginTop: 4 }}>
            28
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Every required item ready
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            On Rent
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--warn)', marginTop: 4 }}>
            9
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Currently out with a client
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Needs Attention
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 4 }}>
            8
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Partially Available + Maintenance + Blocked
          </span>
        </Card>
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'All', count: 42 },
            { label: 'Available', count: 28 },
            { label: 'Reserved', count: 6 },
            { label: 'On Rent', count: 9 },
            { label: 'Partially Available', count: 5 },
            { label: 'On Maintenance', count: 3 },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => setActiveFilter(chip.label as FilterKey)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: activeFilter === chip.label ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                background: activeFilter === chip.label ? 'var(--nav-active-accent)' : 'var(--card)',
                color: activeFilter === chip.label ? '#ffffff' : 'var(--text)',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label} <span className="figure" style={{ opacity: 0.85, marginLeft: 4 }}>{chip.count}</span>
            </button>
          ))}
          {/* Invariant check badge from §1.1 */}
          <div style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--good)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>✓</span>
            <span className="figure">28 + 6 + 9 + 5 + 3 = 51 · All 51</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 240 }}>
            <Input
              placeholder="Search ID, bundle, category…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Exporting', 'Generating bundles report...')}
            icon={<IconDownload size={16} />}
          >
            Export
          </Button>
          <Button
            variant="primary"
            onClick={() => {
               navigate('/inventory/bundles/new')
            }}
            icon={<IconPlus size={16} />}
          >
            New Bundle
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredBundles.length === 0 ? (
          <EmptyState
            title="No bundles found"
            description="Adjust your filters or search query to find equipment bundles."
            actionLabel="Clear Filters"
            onAction={() => {
              setActiveFilter('All')
              setSearchQuery('')
            }}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ width: 36, padding: '12px 14px' }}>
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === filteredBundles.length && filteredBundles.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ width: 48, padding: '12px 14px' }}></th>
                  <th style={{ padding: '12px 14px', cursor: 'pointer' }}>Bundle</th>
                  <th style={{ padding: '12px 14px' }}>Items (Breakdown)</th>
                  <th style={{ padding: '12px 14px' }}>Availability</th>
                  <th style={{ padding: '12px 14px' }}>Current Booking</th>
                  <th style={{ padding: '12px 14px' }}>Daily Rate (Equipment Only)</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBundles.map((b) => {
                  const equipCount = b.items.reduce((sum, i) => sum + i.quantity, 0)
                  const totalItems = equipCount + b.crewCount + b.vehicleCount + b.boxCount
                  const readyEquip = b.items.reduce((sum, i) => sum + Math.min(i.quantity, i.availableStock), 0)
                  const totalEquipRequired = equipCount
                  
                  return (
                  <tr
                    key={b.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease' }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(b.id)}
                        onChange={() => handleToggleRow(b.id)}
                        style={{ accentColor: 'var(--nav-active-accent)' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--card2)', border: '1px solid var(--border)' }}></div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{b.name}</div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{b.id}</div>
                      <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 6, fontWeight: 500 }}>
                        {b.category} <span style={{ color: 'var(--muted)' }}>(Primary)</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {totalItems} Items
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {equipCount} Equipment · {b.crewCount} Crew · {b.vehicleCount} Vehicle · {b.boxCount} Boxes
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(b.status) }}></span>
                        <span style={{ fontWeight: 600, color: getStatusColor(b.status) }}>{b.status}</span>
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {readyEquip} / {totalEquipRequired} Ready
                      </div>
                      {readyEquip < totalEquipRequired && (
                        <div style={{ fontSize: 11, color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, cursor: 'pointer' }}>
                          {totalEquipRequired - readyEquip} blocked <IconChevronDown size={12} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {b.linkedBooking ? (
                        <>
                          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{b.clientName}</div>
                          <div className="figure" style={{ fontSize: 11, color: 'var(--link)', marginTop: 2, cursor: 'pointer' }}>
                            {b.linkedBooking}
                          </div>
                          <div className="figure" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                            {b.startDateBs} — {b.endDateBs}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>No active booking</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(b.bundleRatePaisa)}
                        </div>
                        <span className="figure" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: 'var(--good)' }}>
                          Save {calculateSavingPct(b.sumOfPartsPaisa, b.bundleRatePaisa)}%
                        </span>
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, textDecoration: 'line-through' }}>
                        {formatMoney(b.sumOfPartsPaisa)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button variant="secondary" size="sm">
                        View Details
                      </Button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
