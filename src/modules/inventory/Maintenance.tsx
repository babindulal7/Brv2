import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { IconSearch, IconPlus, IconDownload, IconTool, IconShieldCheck, IconAlertCircle, IconClock } from '@tabler/icons-react'

type MaintenanceStatus = 'Scheduled' | 'In Progress' | 'Waiting Parts' | 'At Vendor' | 'Completed' | 'Cancelled'
type MaintenanceFlag = 'Overdue' | 'Warranty' | 'Blocked Booking' | 'Awaiting Approval'
type MaintenanceType = 'Repair' | 'Service' | 'Calibration' | 'Inspection'
type Priority = 'Low' | 'Medium' | 'High' | 'Critical'

interface MaintenanceRecord {
  id: string
  equipmentName: string
  serialNumber: string
  type: MaintenanceType
  priority: Priority
  status: MaintenanceStatus
  flags: MaintenanceFlag[]
  technician?: string
  vendor?: string
  estCompletionBs?: string
  estCompletionAd?: string
  daysUntilCompletion?: number
  costEstPaisa: Paisa
  costActualPaisa?: Paisa
  bookingImpact?: string
}

const MAINTENANCE_DATA: MaintenanceRecord[] = [
  {
    id: 'MNT-1042',
    equipmentName: 'RED Komodo X Brain',
    serialNumber: 'SN-Rkx-001',
    type: 'Repair',
    priority: 'Critical',
    status: 'In Progress',
    flags: ['Overdue', 'Warranty', 'Blocked Booking'],
    technician: 'Ramesh Dulal',
    estCompletionBs: '2083/04/10',
    estCompletionAd: '25 Jul 2026',
    daysUntilCompletion: -2,
    costEstPaisa: rupees(0),
    bookingImpact: 'BK-2026-0715',
  },
  {
    id: 'MNT-1043',
    equipmentName: 'ARRI Signature Prime 35mm',
    serialNumber: 'SN-ASP-35',
    type: 'Calibration',
    priority: 'High',
    status: 'At Vendor',
    flags: ['Awaiting Approval'],
    vendor: 'ARRI Service Center',
    estCompletionBs: '2083/04/15',
    estCompletionAd: '30 Jul 2026',
    daysUntilCompletion: 3,
    costEstPaisa: rupees(15000),
  },
  {
    id: 'MNT-1045',
    equipmentName: 'Core SWX NANO Micro 98',
    serialNumber: 'SN-NX-012',
    type: 'Inspection',
    priority: 'Medium',
    status: 'Waiting Parts',
    flags: [],
    technician: 'Hari Shrestha',
    estCompletionBs: '2083/04/20',
    estCompletionAd: '04 Aug 2026',
    daysUntilCompletion: 8,
    costEstPaisa: rupees(3000),
    costActualPaisa: rupees(3500),
  }
]

type FilterKey = MaintenanceStatus | MaintenanceFlag | 'All'

export function Maintenance() {
  const { showSuccessToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const filteredRecords = useMemo(() => {
    return MAINTENANCE_DATA.filter((m) => {
      if (activeFilter !== 'All') {
        const isStatus = ['Scheduled', 'In Progress', 'Waiting Parts', 'At Vendor', 'Completed', 'Cancelled'].includes(activeFilter)
        if (isStatus && m.status !== activeFilter) return false
        if (!isStatus && !m.flags.includes(activeFilter as MaintenanceFlag)) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          m.id.toLowerCase().includes(q) ||
          m.equipmentName.toLowerCase().includes(q) ||
          m.serialNumber.toLowerCase().includes(q) ||
          m.technician?.toLowerCase().includes(q) ||
          m.vendor?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [searchQuery, activeFilter])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredRecords.map((m) => m.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const getStatusColor = (status: MaintenanceStatus) => {
    switch (status) {
      case 'Completed': return 'var(--good)'
      case 'Scheduled': return 'var(--info)'
      case 'In Progress': return 'var(--accent)'
      case 'Waiting Parts': return 'var(--warn)'
      case 'At Vendor': return 'var(--purple)'
      case 'Cancelled': return 'var(--muted)'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Active Maintenance
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
            18
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            In Progress, Waiting Parts, At Vendor
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Scheduled
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--info)', marginTop: 4 }}>
            12
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Upcoming jobs
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Overdue (Flag)
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 4 }}>
            4
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Past estimated completion
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Cost (This Month)
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            {formatMoney(rupees(45000))}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Actual cost of jobs completed
          </span>
        </Card>
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'All', count: 86 },
            { label: 'Scheduled', count: 12 },
            { label: 'In Progress', count: 8 },
            { label: 'Waiting Parts', count: 6 },
            { label: 'At Vendor', count: 4 },
            { label: 'Completed', count: 54 },
            { label: 'Cancelled', count: 2 },
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
          
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
          
          {[
            { label: 'Overdue', count: 4 },
            { label: 'Warranty', count: 12 },
            { label: 'Blocked Booking', count: 3 },
            { label: 'Awaiting Approval', count: 5 },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => setActiveFilter(chip.label as FilterKey)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                border: activeFilter === chip.label ? '1px solid var(--text)' : '1px solid transparent',
                background: activeFilter === chip.label ? 'var(--bg)' : 'transparent',
                color: activeFilter === chip.label ? 'var(--text)' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 240 }}>
            <Input
              placeholder="Search equipment, serial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Exporting', 'Generating maintenance report...')}
            icon={<IconDownload size={16} />}
          >
            Export
          </Button>
          <Button
            variant="primary"
            onClick={() => showSuccessToast('New Job', 'Opening maintenance log')}
            icon={<IconPlus size={16} />}
          >
            Log Maintenance
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredRecords.length === 0 ? (
          <EmptyState
            title="No maintenance records found"
            description="Adjust your filters or search query."
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
                      checked={selectedRowIds.size === filteredRecords.length && filteredRecords.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px', cursor: 'pointer' }}>ID & Equipment</th>
                  <th style={{ padding: '12px 14px' }}>Type & Priority</th>
                  <th style={{ padding: '12px 14px' }}>Status & Flags</th>
                  <th style={{ padding: '12px 14px' }}>Technician</th>
                  <th style={{ padding: '12px 14px' }}>Vendor</th>
                  <th style={{ padding: '12px 14px' }}>Est. Completion</th>
                  <th style={{ padding: '12px 14px' }}>Cost (Est/Actual)</th>
                  <th style={{ padding: '12px 14px' }}>Booking Impact</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((m) => (
                  <tr
                    key={m.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease' }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(m.id)}
                        onChange={() => handleToggleRow(m.id)}
                        style={{ accentColor: 'var(--nav-active-accent)' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{m.id}</div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.equipmentName}</div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.serialNumber}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: 'var(--text)' }}>
                        <IconTool size={14} style={{ color: 'var(--muted)' }} /> {m.type}
                      </div>
                      <div style={{ fontSize: 11, color: m.priority === 'Critical' ? 'var(--bad)' : m.priority === 'High' ? 'var(--warn)' : 'var(--muted)', marginTop: 4 }}>
                        {m.priority} Priority
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(m.status) }}></span>
                        <span style={{ fontWeight: 600, color: getStatusColor(m.status) }}>{m.status}</span>
                      </div>
                      {m.flags.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                          {m.flags.map(f => {
                            let icon = null
                            let color = 'var(--muted)'
                            if (f === 'Overdue') { icon = <IconClock size={12}/>; color = 'var(--bad)' }
                            if (f === 'Warranty') { icon = <IconShieldCheck size={12}/>; color = 'var(--good)' }
                            if (f === 'Blocked Booking') { icon = <IconAlertCircle size={12}/>; color = 'var(--warn)' }
                            return (
                              <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, border: `1px solid ${color}`, color: color }}>
                                {icon} {f}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {m.technician ? (
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{m.technician}</div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {m.vendor ? (
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{m.vendor}</div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {m.estCompletionBs ? (
                        <>
                          <div className="figure" style={{ fontWeight: 500, color: m.flags.includes('Overdue') ? 'var(--bad)' : 'var(--text)' }}>
                            {m.estCompletionBs}
                          </div>
                          <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            {m.estCompletionAd}
                          </div>
                          {typeof m.daysUntilCompletion === 'number' && (
                            <div className="figure" style={{ fontSize: 11, color: m.flags.includes('Overdue') ? 'var(--bad)' : 'var(--good)', marginTop: 4 }}>
                              {m.daysUntilCompletion < 0 ? `${Math.abs(m.daysUntilCompletion)} days ago` : `in ${m.daysUntilCompletion} days`}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {m.costActualPaisa ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{formatMoney(m.costActualPaisa)}</div>
                          <div className="figure" style={{ fontSize: 10, color: 'var(--muted)' }}>Actual</div>
                        </div>
                      ) : m.costEstPaisa > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div className="figure" style={{ fontWeight: 500, color: 'var(--text)' }}>{formatMoney(m.costEstPaisa)}</div>
                          <div className="figure" style={{ fontSize: 10, color: 'var(--muted)' }}>Est.</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>TBD</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {m.bookingImpact ? (
                        <div className="figure" style={{ fontSize: 11, color: 'var(--link)', cursor: 'pointer', fontWeight: 500 }}>
                          {m.bookingImpact}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button variant="secondary" size="sm">
                        Open Maintenance
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
