import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { IconSearch, IconPlus, IconDownload, IconArrowUpRight, IconArrowDownLeft } from '@tabler/icons-react'

type SubRentalDirection = 'Borrowing' | 'Lending'
type SubRentalStatus = 'Reserved' | 'Picked Up' | 'On Rent' | 'Returned' | 'Checked In' | 'Cancelled'

interface SubRentalRecord {
  id: string
  counterparty: string
  linkedBooking?: string
  direction: SubRentalDirection
  equipment: string
  quantity: number
  startDateBs: string
  endDateBs: string
  startDateAd: string
  endDateAd: string
  rentalValuePaisa: Paisa
  revenuePaisa: Paisa
  costPaisa: Paisa
  status: SubRentalStatus
  isOverdue: boolean
}

const SUB_RENTAL_DATA: SubRentalRecord[] = [
  {
    id: 'SR-2026-0032',
    counterparty: 'GearHouse KTM',
    linkedBooking: 'BK-2026-0715',
    direction: 'Borrowing',
    equipment: 'RED V-Raptor 8K VV',
    quantity: 1,
    startDateBs: '2083/03/10',
    endDateBs: '2083/03/15',
    startDateAd: '24 Jun 2026',
    endDateAd: '29 Jun 2026',
    rentalValuePaisa: rupees(120000),
    revenuePaisa: rupees(120000),
    costPaisa: rupees(91500), // ~23.75% margin (120000 - 91500 = 28500 / 120000)
    status: 'On Rent',
    isOverdue: false,
  },
  {
    id: 'SR-2026-0033',
    counterparty: 'Kathmandu Cinema Works',
    direction: 'Lending',
    equipment: 'ARRI SkyPanel S60-C',
    quantity: 2,
    startDateBs: '2083/03/12',
    endDateBs: '2083/03/14',
    startDateAd: '26 Jun 2026',
    endDateAd: '28 Jun 2026',
    rentalValuePaisa: rupees(30000),
    revenuePaisa: rupees(30000),
    costPaisa: rupees(0), // Lending idle stock
    status: 'Returned',
    isOverdue: true, // Returned late
  },
  {
    id: 'SR-2026-0034',
    counterparty: 'Freelance - Bikram',
    linkedBooking: 'BK-2026-0718',
    direction: 'Borrowing',
    equipment: 'DJI Inspire 3 Drone',
    quantity: 1,
    startDateBs: '2083/03/18',
    endDateBs: '2083/03/20',
    startDateAd: '02 Jul 2026',
    endDateAd: '04 Jul 2026',
    rentalValuePaisa: rupees(85000),
    revenuePaisa: rupees(85000),
    costPaisa: rupees(75000),
    status: 'Reserved',
    isOverdue: false,
  },
  {
    id: 'SR-2026-0035',
    counterparty: 'Shine Pictures',
    direction: 'Lending',
    equipment: 'Sony FX9 Camera Package',
    quantity: 1,
    startDateBs: '2083/03/05',
    endDateBs: '2083/03/08',
    startDateAd: '19 Jun 2026',
    endDateAd: '22 Jun 2026',
    rentalValuePaisa: rupees(100000),
    revenuePaisa: rupees(0),
    costPaisa: rupees(0),
    status: 'Cancelled',
    isOverdue: false,
  }
]

type FilterKey = SubRentalStatus | 'All' | 'Overdue'

export function SubRental() {
  const { showSuccessToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const filteredData = useMemo(() => {
    return SUB_RENTAL_DATA.filter((c) => {
      if (activeFilter === 'Overdue' && !c.isOverdue) return false
      if (activeFilter !== 'All' && activeFilter !== 'Overdue' && c.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          c.id.toLowerCase().includes(q) ||
          c.counterparty.toLowerCase().includes(q) ||
          c.equipment.toLowerCase().includes(q) ||
          (c.linkedBooking && c.linkedBooking.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredData.map((c) => c.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const getStatusColor = (status: SubRentalStatus) => {
    switch (status) {
      case 'Returned':
      case 'Checked In':
        return 'var(--good)'
      case 'Cancelled':
        return 'var(--muted)'
      case 'Reserved':
        return 'var(--warn)'
      case 'Picked Up':
      case 'On Rent':
        return 'var(--info)'
    }
  }

  const calculateMargin = (revenue: Paisa, cost: Paisa) => {
    if (revenue === 0) return 0
    return ((revenue - cost) / revenue) * 100
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Active Records
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            30
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Borrowing (18) · Lending (12)
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Revenue
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--good)', marginTop: 4 }}>
            Rs 1,20,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Gross generated value
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Cost
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 4 }}>
            Rs 80,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Partner payments & fees
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Blended Margin
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--info)', marginTop: 4 }}>
            33.3%
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Across all active sub-rentals
          </span>
        </Card>
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'All', count: 48 },
            { label: 'Overdue', count: 4 }, // Explicit flag
            { label: 'Reserved', count: 6 },
            { label: 'Picked Up', count: 8 },
            { label: 'On Rent', count: 16 },
            { label: 'Returned', count: 9 },
            { label: 'Checked In', count: 5 },
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
                border: activeFilter === chip.label
                  ? chip.label === 'Overdue' ? '1px solid var(--bad)' : '1px solid var(--nav-active-accent)'
                  : '1px solid var(--border)',
                background: activeFilter === chip.label
                  ? chip.label === 'Overdue' ? 'var(--bad)' : 'var(--nav-active-accent)'
                  : 'var(--card)',
                color: activeFilter === chip.label ? '#ffffff' : chip.label === 'Overdue' ? 'var(--bad)' : 'var(--text)',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label} <span className="figure" style={{ opacity: 0.85, marginLeft: 4 }}>{chip.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 240 }}>
            <Input
              placeholder="Search SR ID, equipment, partner…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Exporting', 'Generating sub-rental report...')}
            icon={<IconDownload size={16} />}
          >
            Export
          </Button>
          <Button
            variant="primary"
            onClick={() => showSuccessToast('New Record', 'Opening Sub-Rental wizard')}
            icon={<IconPlus size={16} />}
          >
            New Sub-Rental
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredData.length === 0 ? (
          <EmptyState
            title="No records found"
            description="Adjust your filters or search query to find sub-rental records."
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
                      checked={selectedRowIds.size === filteredData.length && filteredData.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px' }}>SR ID & Direction</th>
                  <th style={{ padding: '12px 14px' }}>Counterparty</th>
                  <th style={{ padding: '12px 14px' }}>Equipment</th>
                  <th style={{ padding: '12px 14px' }}>Dates</th>
                  <th style={{ padding: '12px 14px' }}>Revenue & Cost</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((c) => {
                  const marginPct = calculateMargin(c.revenuePaisa, c.costPaisa)
                  return (
                    <tr
                      key={c.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease', background: c.isOverdue ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.has(c.id)}
                          onChange={() => handleToggleRow(c.id)}
                          style={{ accentColor: 'var(--nav-active-accent)' }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{c.id}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: c.direction === 'Borrowing' ? 'var(--info)' : 'var(--good)' }}>
                          {c.direction === 'Borrowing' ? <IconArrowDownLeft size={14} /> : <IconArrowUpRight size={14} />}
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{c.direction}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.counterparty}</div>
                        {c.linkedBooking && (
                          <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.linkedBooking}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {c.quantity}x {c.equipment}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          Rental Value: {formatMoney(c.rentalValuePaisa)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {c.startDateBs} — {c.endDateBs}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {c.startDateAd} — {c.endDateAd}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="figure" style={{ fontWeight: 600, color: c.status === 'Cancelled' ? 'var(--muted)' : 'var(--text)' }}>
                            {formatMoney(c.revenuePaisa)}
                          </div>
                          {c.status !== 'Cancelled' && (
                            <span className="figure" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: marginPct < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: marginPct < 0 ? 'var(--bad)' : 'var(--good)' }}>
                              {marginPct > 0 && '+'}{marginPct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          Cost: {formatMoney(c.costPaisa)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.isOverdue && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--bad)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                              OVERDUE
                            </span>
                          )}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: getStatusColor(c.status), fontWeight: 600 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                            {c.status}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <Button variant="secondary" size="sm">
                          View
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
