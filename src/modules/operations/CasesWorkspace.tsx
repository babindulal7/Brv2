import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { toBs, formatBs } from '../../lib/bs'
import { findClientIdByBooking } from '../../data/clients'
import {
  CASES,
  CASE_WORKSPACE_ROUTE,
  STATUS_COUNTS,
  openCasesCount,
  awaitingDecisionCount,
  exposurePaisa,
  recoveredThisMonthPaisa,
  outstandingOf,
  type Case,
  type CaseStatus,
  type CasePriority,
} from '../../data/cases'
import { IconSearch, IconPlus, IconDownload } from '@tabler/icons-react'

/** Age in whole days from openedAd to today (lib/bs TODAY is fixed to 31 Jul 2026). */
function ageDaysOf(c: Case): number {
  const MS_PER_DAY = 86_400_000
  // TODAY from lib/bs is 2026-07-31 UTC-midnight; use it via the module-level CASES constant
  // which already imports it. We just compare against the same epoch.
  const todayMs = Date.UTC(2026, 6, 31) // 31 Jul 2026 — matches lib/bs TODAY
  return Math.floor((todayMs - c.openedAd.getTime()) / MS_PER_DAY)
}

function createdBsOf(c: Case): string {
  const bs = toBs(c.openedAd)
  return bs ? formatBs(bs) : '—'
}


type FilterKey = CaseStatus | 'All'

export function CasesWorkspace() {
  const { showSuccessToast } = useToast()
  const navigate = useNavigate()
  const money = useCanViewMoney()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const filteredCases = useMemo(() => {
    return CASES.filter((c) => {
      if (activeFilter !== 'All' && c.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const equipNames = Array.isArray(c.equipment)
          ? c.equipment.map((e) => e.name + ' ' + e.serial).join(' ')
          : ''
        return (
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.counterpartyName.toLowerCase().includes(q) ||
          c.linked.linkedRecordId.toLowerCase().includes(q) ||
          equipNames.toLowerCase().includes(q)
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
      {/* KPIs — derived from canonical CASES array, never hand-typed (§3 / AUDIT_FINDINGS P1 #13) */}
      <div style={{ display: 'grid', gridTemplateColumns: money ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Open Cases
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>
            {openCasesCount()}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            All active & unresolved
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Awaiting Decision
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--warn)', marginTop: 'var(--sp-xs)' }}>
            {awaitingDecisionCount()}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Ready for manager review
          </span>
        </Card>
        {money && (
          <Card padding="md">
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Exposure
            </span>
            <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 'var(--sp-xs)' }}>
              {formatMoney(exposurePaisa())}
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
              Assessed value of open cases
            </span>
          </Card>
        )}
        {money && (
          <Card padding="md">
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Recovered This Month
            </span>
            <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--good)', marginTop: 'var(--sp-xs)' }}>
              {formatMoney(recoveredThisMonthPaisa())}
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
              Charged, claimed, and settled
            </span>
          </Card>
        )}
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          {([
            { label: 'All', count: CASES.length },
            { label: 'Open', count: STATUS_COUNTS['Open'] },
            { label: 'In Progress', count: STATUS_COUNTS['In Progress'] },
            { label: 'Under Review', count: STATUS_COUNTS['Under Review'] },
            { label: 'Awaiting Decision', count: STATUS_COUNTS['Awaiting Decision'] },
            { label: 'Resolved', count: STATUS_COUNTS['Resolved'] },
            { label: 'Closed', count: STATUS_COUNTS['Closed'] },
          ] as const).map((chip) => (
            <button
              key={chip.label}
              onClick={() => setActiveFilter(chip.label as FilterKey)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--r-modal)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: activeFilter === chip.label ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                background: activeFilter === chip.label ? 'var(--nav-active-accent)' : 'var(--card)',
                color: activeFilter === chip.label ? '#ffffff' : 'var(--text)',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label} <span className="figure" style={{ opacity: 0.85, marginLeft: 'var(--sp-xs)' }}>{chip.count}</span>
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
                  {money && <th style={{ padding: '12px 14px' }}>Financial Impact</th>}
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
                        <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {c.type}
                        </span>
                      </div>
                      <div style={{ fontWeight: 500, color: 'var(--text)', marginTop: 'var(--sp-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.title}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {(() => {
                          const clientId = findClientIdByBooking(c.linked.linkedRecordId)
                          return clientId ? (
                            <Link to={`/clients/${clientId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {c.counterpartyName}
                            </Link>
                          ) : (
                            c.counterpartyName
                          )
                        })()}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 'var(--sp-xs)' }}>
                        <Link to={`/rentals/${c.linked.linkedRecordId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          <span className="figure" style={{ fontSize: 11, color: 'var(--info)' }}>{c.linked.linkedRecordId}</span>
                        </Link>
                        {Array.isArray(c.equipment) && c.equipment.length > 0 && (
                          <span className="figure" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {c.equipment[0]?.serial}{c.equipment.length > 1 ? ` +${c.equipment.length - 1}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', color: getPriorityColor(c.priority), fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {c.priority}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: getStatusColor(c.status) }}>{c.status}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.disposition ?? '—'}</div>
                    </td>
                    {money && (
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(c.assessedPaisa)}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: outstandingOf(c) > 0 ? 'var(--bad)' : 'var(--muted)', marginTop: 2 }}>
                          {outstandingOf(c) > 0 ? `${formatMoney(outstandingOf(c))} Due` : 'Settled'}
                        </div>
                      </td>
                    )}
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 500, color: ageDaysOf(c) > 14 ? 'var(--warn)' : 'var(--text)' }}>
                        {ageDaysOf(c)} Days
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {createdBsOf(c)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button variant="secondary" size="sm" onClick={() => navigate(CASE_WORKSPACE_ROUTE(c.id))}>
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
