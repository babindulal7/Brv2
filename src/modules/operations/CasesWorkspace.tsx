import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { IconSearch, IconPlus, IconDownload } from '@tabler/icons-react'


type CaseStatus = 'Open' | 'In Progress' | 'Under Review' | 'Awaiting Decision' | 'Resolved' | 'Closed' | 'Cancelled'
type CasePriority = 'Low' | 'Medium' | 'High' | 'Critical'
type CaseType = 'Damage' | 'Missing' | 'Theft' | 'Client Dispute' | 'Vendor Issue' | 'Late Return'
type Disposition = 'Charge Client' | 'Recover from Partner' | 'Insurance Claim' | 'Write-off' | 'Waived' | 'Pending Decision'

interface CaseRecord {
  id: string
  type: CaseType
  title: string
  counterparty: string
  linkedBooking?: string
  equipment?: string
  priority: CasePriority
  status: CaseStatus
  disposition: Disposition
  assessedPaisa: Paisa
  outstandingPaisa: Paisa
  ageDays: number
  owner: string
  createdBs: string
  createdAd: string
}

// Seed data matching the specification requirements (Open Cases = 36)
const CASES_DATA: CaseRecord[] = [
  {
    id: 'CASE-2026-0041',
    type: 'Damage',
    title: 'ARRI Alexa Mini LF - Cracked Sensor Glass',
    counterparty: 'Kathmandu Cinema Works',
    linkedBooking: 'BK-2026-0715',
    equipment: 'EQ-00104',
    priority: 'Critical',
    status: 'Under Review',
    disposition: 'Pending Decision',
    assessedPaisa: rupees(450000),
    outstandingPaisa: rupees(450000),
    ageDays: 4,
    owner: 'Arjun M.',
    createdBs: '2083/04/05',
    createdAd: '20 Jul 2026',
  },
  {
    id: 'CASE-2026-0040',
    type: 'Missing',
    title: 'Sony NP-FZ100 Battery (x2) Missing on Return',
    counterparty: 'Freelance - Bikram Rai',
    linkedBooking: 'BK-2026-0714',
    priority: 'Low',
    status: 'Awaiting Decision',
    disposition: 'Pending Decision',
    assessedPaisa: rupees(18000),
    outstandingPaisa: rupees(18000),
    ageDays: 6,
    owner: 'Sita T.',
    createdBs: '2083/04/03',
    createdAd: '18 Jul 2026',
  },
  {
    id: 'CASE-2026-0038',
    type: 'Client Dispute',
    title: 'Dispute over late return fees (Traffic Jam claim)',
    counterparty: 'Himalayan Films',
    linkedBooking: 'BK-2026-0708',
    priority: 'Medium',
    status: 'Open',
    disposition: 'Pending Decision',
    assessedPaisa: rupees(15000),
    outstandingPaisa: rupees(15000),
    ageDays: 12,
    owner: 'Manager',
    createdBs: '2083/03/28',
    createdAd: '12 Jul 2026',
  },
  {
    id: 'CASE-2026-0035',
    type: 'Damage',
    title: 'DJI Mavic 3 Pro - Propeller Guard Broken',
    counterparty: 'Shine Pictures Nepal',
    linkedBooking: 'BK-2026-0695',
    equipment: 'EQ-00512',
    priority: 'Medium',
    status: 'Resolved',
    disposition: 'Charge Client',
    assessedPaisa: rupees(4500),
    outstandingPaisa: rupees(0),
    ageDays: 18,
    owner: 'Arjun M.',
    createdBs: '2083/03/22',
    createdAd: '06 Jul 2026',
  },
  {
    id: 'CASE-2026-0032',
    type: 'Vendor Issue',
    title: 'Sub-rented RED V-Raptor arrived with missing plates',
    counterparty: 'GearHouse KTM',
    linkedBooking: 'SR-2026-015',
    equipment: 'EQ-SUB-044',
    priority: 'High',
    status: 'In Progress',
    disposition: 'Recover from Partner',
    assessedPaisa: rupees(25000),
    outstandingPaisa: rupees(25000),
    ageDays: 24,
    owner: 'Manager',
    createdBs: '2083/03/16',
    createdAd: '30 Jun 2026',
  },
]

type FilterKey = CaseStatus | 'All'

export function CasesWorkspace() {
  const { showSuccessToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const filteredCases = useMemo(() => {
    return CASES_DATA.filter((c) => {
      if (activeFilter !== 'All' && c.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.counterparty.toLowerCase().includes(q) ||
          (c.linkedBooking && c.linkedBooking.toLowerCase().includes(q)) ||
          (c.equipment && c.equipment.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredCases.map((c) => c.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const getPriorityColor = (priority: CasePriority) => {
    switch (priority) {
      case 'Critical': return 'var(--bad)'
      case 'High': return 'var(--bad)'
      case 'Medium': return 'var(--warn)'
      case 'Low': return 'var(--info)'
    }
  }

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case 'Resolved':
      case 'Closed':
        return 'var(--good)'
      case 'Cancelled':
        return 'var(--muted)'
      case 'Awaiting Decision':
      case 'Under Review':
        return 'var(--warn)'
      case 'In Progress':
        return 'var(--info)'
      case 'Open':
      default:
        return 'var(--text)'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Open Cases
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            36
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            All active & unresolved
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Awaiting Decision
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--warn)', marginTop: 4 }}>
            9
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Ready for manager review
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Exposure
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 4 }}>
            Rs 6,45,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Assessed value of open cases
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Recovered This Month
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--good)', marginTop: 4 }}>
            Rs 1,12,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Charged, claimed, and settled
          </span>
        </Card>
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'All', count: 46 },
            { label: 'Open', count: 12 },
            { label: 'In Progress', count: 8 },
            { label: 'Under Review', count: 7 },
            { label: 'Awaiting Decision', count: 9 },
            { label: 'Resolved', count: 6 },
            { label: 'Closed', count: 4 },
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
              placeholder="Search ID, title, client…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Exporting', 'Generating cases report...')}
            icon={<IconDownload size={16} />}
          >
            Export
          </Button>
          <Button
            variant="primary"
            onClick={() => showSuccessToast('New Case', 'Opening case logging workspace')}
            icon={<IconPlus size={16} />}
          >
            Log Incident
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredCases.length === 0 ? (
          <EmptyState
            title="No cases found"
            description="Adjust your filters or search query to find incident cases."
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
                      checked={selectedRowIds.size === filteredCases.length && filteredCases.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px', cursor: 'pointer' }}>Case ID</th>
                  <th style={{ padding: '12px 14px' }}>Incident Detail</th>
                  <th style={{ padding: '12px 14px' }}>Counterparty & Links</th>
                  <th style={{ padding: '12px 14px' }}>Priority</th>
                  <th style={{ padding: '12px 14px' }}>Status & Disposition</th>
                  <th style={{ padding: '12px 14px' }}>Financial Impact</th>
                  <th style={{ padding: '12px 14px' }}>Age</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease' }}
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
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.owner}</div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 280 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {c.type}
                        </span>
                      </div>
                      <div style={{ fontWeight: 500, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.title}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.counterparty}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {c.linkedBooking && (
                          <span className="figure" style={{ fontSize: 11, color: 'var(--info)' }}>{c.linkedBooking}</span>
                        )}
                        {c.equipment && (
                          <span className="figure" style={{ fontSize: 11, color: 'var(--muted)' }}>{c.equipment}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: getPriorityColor(c.priority), fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {c.priority}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: getStatusColor(c.status) }}>{c.status}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.disposition}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {formatMoney(c.assessedPaisa)}
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: c.outstandingPaisa > 0 ? 'var(--bad)' : 'var(--muted)', marginTop: 2 }}>
                        {c.outstandingPaisa > 0 ? `${formatMoney(c.outstandingPaisa)} Due` : 'Settled'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 500, color: c.ageDays > 14 ? 'var(--warn)' : 'var(--text)' }}>
                        {c.ageDays} Days
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {c.createdBs}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button variant="secondary" size="sm">
                        Open Case
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
