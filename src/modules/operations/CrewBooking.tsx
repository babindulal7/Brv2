import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { IconSearch, IconPlus, IconDownload } from '@tabler/icons-react'

type CrewRole = 'Director of Photography' | '1st AC' | '2nd AC' | 'Gaffer' | 'Sound Recordist' | 'Drone Operator' | 'DIT' | 'Grip'
type AssignmentStatus = 'Confirmed' | 'Tentative' | 'Completed' | 'Cancelled'
type PaymentStatus = 'Paid' | 'Pending' | 'Partially Paid'

interface CrewAssignment {
  id: string
  name: string
  role: CrewRole
  phone: string
  production: string
  linkedBooking: string
  startDateBs: string
  endDateBs: string
  startDateAd: string
  endDateAd: string
  days: number
  dayRatePaisa: Paisa
  totalCostPaisa: Paisa
  status: AssignmentStatus
  paymentStatus: PaymentStatus
  isInternalStaff: boolean
  hasConflict: boolean
}

const CREW_DATA: CrewAssignment[] = [
  {
    id: 'CB-2026-0001',
    name: 'Bikram Rai',
    role: 'Director of Photography',
    phone: '+977 980-1234567',
    production: 'Kathmandu Cinema Works - TVC',
    linkedBooking: 'BK-2026-0715',
    startDateBs: '2083/04/10',
    endDateBs: '2083/04/14',
    startDateAd: '25 Jul 2026',
    endDateAd: '29 Jul 2026',
    days: 5,
    dayRatePaisa: rupees(25000),
    totalCostPaisa: rupees(125000),
    status: 'Confirmed',
    paymentStatus: 'Pending',
    isInternalStaff: false,
    hasConflict: false,
  },
  {
    id: 'CB-2026-0002',
    name: 'Sita Tamang',
    role: '1st AC',
    phone: '+977 981-2345678',
    production: 'Kathmandu Cinema Works - TVC',
    linkedBooking: 'BK-2026-0715',
    startDateBs: '2083/04/10',
    endDateBs: '2083/04/14',
    startDateAd: '25 Jul 2026',
    endDateAd: '29 Jul 2026',
    days: 5,
    dayRatePaisa: rupees(15000),
    totalCostPaisa: rupees(75000),
    status: 'Confirmed',
    paymentStatus: 'Pending',
    isInternalStaff: true,
    hasConflict: false,
  },
  {
    id: 'CB-2026-0003',
    name: 'Arjun Magar',
    role: 'Gaffer',
    phone: '+977 982-3456789',
    production: 'Himalayan Films - Doc',
    linkedBooking: 'BK-2026-0708',
    startDateBs: '2083/04/12',
    endDateBs: '2083/04/15',
    startDateAd: '27 Jul 2026',
    endDateAd: '30 Jul 2026',
    days: 4,
    dayRatePaisa: rupees(12000),
    totalCostPaisa: rupees(48000),
    status: 'Tentative',
    paymentStatus: 'Pending',
    isInternalStaff: false,
    hasConflict: true,
  },
  {
    id: 'CB-2026-0004',
    name: 'Nima Sherpa',
    role: 'Drone Operator',
    phone: '+977 984-5678901',
    production: 'Red Dot Films - Corporate',
    linkedBooking: 'BK-2026-0695',
    startDateBs: '2083/03/25',
    endDateBs: '2083/03/26',
    startDateAd: '09 Jul 2026',
    endDateAd: '10 Jul 2026',
    days: 2,
    dayRatePaisa: rupees(18000),
    totalCostPaisa: rupees(36000),
    status: 'Completed',
    paymentStatus: 'Paid',
    isInternalStaff: false,
    hasConflict: false,
  },
]

type FilterKey = AssignmentStatus | 'All'

export function CrewBooking() {
  const { showSuccessToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const filteredCrew = useMemo(() => {
    return CREW_DATA.filter((c) => {
      if (activeFilter !== 'All' && c.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.production.toLowerCase().includes(q) ||
          c.linkedBooking.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredCrew.map((c) => c.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const getStatusColor = (status: AssignmentStatus) => {
    switch (status) {
      case 'Confirmed': return 'var(--good)'
      case 'Tentative': return 'var(--warn)'
      case 'Completed': return 'var(--info)'
      case 'Cancelled': return 'var(--muted)'
    }
  }

  const getPaymentColor = (status: PaymentStatus) => {
    switch (status) {
      case 'Paid': return 'var(--good)'
      case 'Pending': return 'var(--bad)'
      case 'Partially Paid': return 'var(--warn)'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Active Crew
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            28
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Booked today across 5 productions
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Crew Cost (MTD)
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--info)', marginTop: 4 }}>
            Rs 8,45,200
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Total payouts & daily rates
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Pending Payroll
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 4 }}>
            Rs 3,12,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            To be disbursed this week
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Scheduling Conflicts
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--warn)', marginTop: 4 }}>
            1
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Requires manager resolution
          </span>
        </Card>
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'All', count: 120 },
            { label: 'Confirmed', count: 45 },
            { label: 'Tentative', count: 12 },
            { label: 'Completed', count: 58 },
            { label: 'Cancelled', count: 5 },
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 240 }}>
            <Input
              placeholder="Search crew, role, production…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Exporting', 'Generating crew payroll report...')}
            icon={<IconDownload size={16} />}
          >
            Export
          </Button>
          <Button
            variant="primary"
            onClick={() => showSuccessToast('Book Crew', 'Opening crew booking flow')}
            icon={<IconPlus size={16} />}
          >
            Book Crew
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredCrew.length === 0 ? (
          <EmptyState
            title="No crew assignments found"
            description="Adjust your filters or search query to find crew assignments."
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
                      checked={selectedRowIds.size === filteredCrew.length && filteredCrew.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px' }}>Crew Member</th>
                  <th style={{ padding: '12px 14px' }}>Production</th>
                  <th style={{ padding: '12px 14px' }}>Dates & Duration</th>
                  <th style={{ padding: '12px 14px' }}>Financials (Cost)</th>
                  <th style={{ padding: '12px 14px' }}>Assignment Status</th>
                  <th style={{ padding: '12px 14px' }}>Payroll Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCrew.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease', background: c.hasConflict ? 'rgba(234, 179, 8, 0.05)' : 'transparent' }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                        {c.isInternalStaff && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                            STAFF
                          </span>
                        )}
                        {c.hasConflict && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: 'var(--warn)' }}>
                            CONFLICT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.role}</div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.phone}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.production}</div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--info)', marginTop: 2 }}>
                        {c.linkedBooking}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {c.startDateBs} — {c.endDateBs}
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {c.startDateAd} — {c.endDateAd} ({c.days} days)
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {formatMoney(c.totalCostPaisa)}
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {formatMoney(c.dayRatePaisa)} / day
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: getStatusColor(c.status), fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--card2)', border: `1px solid ${getPaymentColor(c.paymentStatus)}`, color: getPaymentColor(c.paymentStatus) }}>
                        {c.paymentStatus}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
