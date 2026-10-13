/**
 * Staff Timesheet — full weekly view with per-day bar charts.
 *
 * Replaces the stub at src/archive/Timesheet.tsx. Ported from
 * the standalone's timesheet screen with weekly hours grid,
 * expandable per-staff day charts, KPI strip, and CSV export.
 */
import { useState, useMemo, useCallback } from 'react'
import { Card, KpiStrip, PageHeader } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageActions } from '../../components/ui/PageActions'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { SearchInput } from '../../components/ui/SearchInput'
import { PageShell } from '../../components/ui/PageShell'
import { DataTableShell } from '../../components/ui/DataTable'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  TIMESHEET_DAYS,
  getTimesheetRows,
  getTimesheetStats,
  exportTimesheetCsv,
  type TimesheetWeek,
  type TimesheetRow,
} from '../../lib/queries/timesheet'

// ── Styles ───────────────────────────────────────────────────────────

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
}

const weekChipBase: React.CSSProperties = {
  minHeight: 'var(--tap, 44px)',
  padding: '7px 14px',
  borderRadius: '9px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text3)',
  transition: 'all 0.15s',
}

const weekChipActive: React.CSSProperties = {
  ...weekChipBase,
  background: 'rgba(47, 125, 255, 0.14)',
  color: 'var(--info)',
  border: '1px solid rgba(47, 125, 255, 0.4)',
}

const dayBarWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '4px',
  height: 50,
  padding: '8px 0',
}

const dayBarColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  flex: 1,
  minWidth: 0,
}

// ── Phone card layout ────────────────────────────────────────────────

function StaffCard({
  row,
  isOpen,
  onToggle,
  canViewMoney,
}: {
  row: TimesheetRow
  isOpen: boolean
  onToggle: () => void
  canViewMoney: boolean
}) {
  return (
    <Card>
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{row.name}</div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', marginTop: '2px' }}>{row.role}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{row.totalHrs}h</div>
              {canViewMoney && (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)' }}>
                  {formatMoney(rupees(row.pay))}
                </div>
              )}
            </div>
            <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={14} />
          </div>
        </div>

        {/* Daily hours summary */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          {row.hrs.map((h, i) => (
            <div key={i} style={{ fontSize: '11px', display: 'flex', gap: '2px' }}>
              <span style={{ color: 'var(--text3)' }}>{TIMESHEET_DAYS[i]}</span>
              <span style={{
                fontWeight: 600,
                color: h === 0 ? 'var(--text3)' : h > 8 ? 'var(--gold)' : 'var(--text)',
              }}>
                {h}h
              </span>
            </div>
          ))}
        </div>

        {/* Expanded bar chart */}
        {isOpen && (
          <div style={dayBarWrapStyle}>
            {row.hrs.map((h, i) => (
              <div key={i} style={dayBarColStyle}>
                <div
                  style={{
                    width: '100%',
                    height: Math.round((h / 9) * 40),
                    borderRadius: '3px 3px 0 0',
                    background: h === 0 ? 'var(--border)' : h >= 8 ? 'var(--green)' : 'var(--gold)',
                    minHeight: h > 0 ? 4 : 2,
                    transition: 'height 0.2s',
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{TIMESHEET_DAYS[i]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Overtime flag */}
        {row.hrs.some((h) => h > 8) && (
          <div style={{ marginTop: '6px' }}>
            <Badge tone="warning" label="Overtime" />
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Main component ───────────────────────────────────────────────────

export default function TimesheetTab() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const canViewMoney = useCanViewMoney()

  const [week, setWeek] = useState<TimesheetWeek>('This Week')
  const [search, setSearch] = useState('')
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const rows = useMemo(() => getTimesheetRows(week), [week])
  const stats = useMemo(() => getTimesheetStats(rows), [rows])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q),
    )
  }, [rows, search])

  const handleExport = useCallback(() => {
    exportTimesheetCsv(rows, week)
    showSuccessToast(`Exported payroll CSV for ${week.toLowerCase()}`)
  }, [rows, week, showSuccessToast])

  const kpis: Kpi[] = useMemo(() => [
    { label: 'Total Hours', value: `${stats.totalHours}h`, icon: 'timer', accent: 'primary' },
    ...(canViewMoney
      ? [
          {
            label: 'Total Payroll',
            value: formatMoney(rupees(stats.totalPayroll)),
            icon: 'card' as const,
            accent: 'success' as const,
            definition: 'Sum of (total hours × hourly rate) for all staff this period.',
          },
        ]
      : []),
    { label: 'Staff Logged', value: `${stats.staffLogged} / ${stats.totalStaff}`, icon: 'users', accent: 'progress' },
    { label: 'Overtime Flags', value: String(stats.overtimeFlags), icon: 'alert_triangle', accent: 'warn' },
  ], [stats, canViewMoney])

  return (
    <PageShell
      header={
        <PageHeader
          title="Presence Log & Timesheet"
          description="Staff hours, payroll calculations, and overtime tracking."
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search staff, role… (press /)',
          }}
          actions={
            canViewMoney ? (
              <PageActions
                secondary={
                  <Button onClick={handleExport}>
                    <Icon name="download" size={14} />
                    Export CSV
                  </Button>
                }
              />
            ) : undefined
          }
        />
      }
    >
      {/* KPI strip */}
      <KpiStrip items={kpis} columns={isPhone ? 2 : (canViewMoney ? 4 : 3)} />

      {/* Controls row: week chips + search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: 'var(--sp-md) 0' }}>
        <div style={chipRowStyle}>
          {(['This Week', 'Last Week'] as TimesheetWeek[]).map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={week === label}
              style={week === label ? weekChipActive : weekChipBase}
              onClick={() => { setWeek(label); setOpenIdx(null) }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search staff…" />
        </div>
      </div>

      {/* ── Phone: card layout ─────────────────────────────────────── */}
      {isPhone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {filteredRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
              No staff matching "{search}"
            </div>
          )}
          {filteredRows.map((row, i) => (
            <StaffCard
              key={row.name}
              row={row}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
              canViewMoney={canViewMoney}
            />
          ))}
        </div>
      ) : (
        /* ── Desktop: table layout ──────────────────────────────────── */
        <Card>
          <DataTableShell ariaLabel="Staff timesheet">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Staff</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)' }}>Role</th>
                  {TIMESHEET_DAYS.map((d) => (
                    <th key={d} style={{ padding: '10px 6px', fontWeight: 600, color: 'var(--text3)', textAlign: 'center', minWidth: 36 }}>{d}</th>
                  ))}
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>Hours</th>
                  {canViewMoney && (
                    <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>Pay</th>
                  )}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={canViewMoney ? 11 : 10} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)' }}>
                      No staff matching "{search}"
                    </td>
                  </tr>
                )}
                {filteredRows.map((row, i) => {
                  const isOpen = openIdx === i
                  return (
                    <tbody key={row.name}>
                      <tr
                        role="row"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        aria-label={`Timesheet details for ${row.name}`}
                        style={{
                          borderBottom: isOpen ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                        }}
                        onClick={() => setOpenIdx(isOpen ? null : i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setOpenIdx(isOpen ? null : i)
                          }
                        }}
                      >
                        <td style={{ padding: '10px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>{row.name}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{row.role}</td>
                        {row.hrs.map((h, di) => (
                          <td
                            key={di}
                            style={{
                              padding: '10px 6px',
                              textAlign: 'center',
                              fontWeight: h > 8 ? 600 : 400,
                              color: h === 0 ? 'var(--text3)' : h > 8 ? 'var(--gold)' : 'var(--text)',
                            }}
                          >
                            {h > 0 ? `${h}h` : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{row.totalHrs}h</td>
                        {canViewMoney && (
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500 }}>
                            {formatMoney(rupees(row.pay))}
                          </td>
                        )}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={12} />
                        </td>
                      </tr>

                      {/* Expanded row: daily bar chart */}
                      {isOpen && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={canViewMoney ? 11 : 10} style={{ padding: '0 16px 12px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', padding: '8px 0', maxWidth: 400 }}>
                              {row.hrs.map((h, di) => (
                                <div key={di} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flex: 1 }}>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: h > 0 ? 'var(--text)' : 'var(--text3)' }}>{h}h</span>
                                  <div
                                    style={{
                                      width: '100%',
                                      height: Math.max(Math.round((h / 9) * 40), h > 0 ? 4 : 2),
                                      borderRadius: '3px 3px 0 0',
                                      background: h === 0 ? 'var(--border)' : h >= 8 ? 'var(--green)' : 'var(--gold)',
                                      transition: 'height 0.2s',
                                    }}
                                  />
                                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{TIMESHEET_DAYS[di]}</span>
                                </div>
                              ))}
                            </div>

                            {/* Rate & overtime info */}
                            {(canViewMoney || row.hrs.some((h) => h > 8)) && (
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', marginTop: '4px' }}>
                                {canViewMoney && (
                                  <span>
                                    Rate: {formatMoney(rupees(row.rate))}/day · {formatMoney(rupees(Math.round(row.rate / 8)))}/hr
                                  </span>
                                )}
                                {row.hrs.some((h) => h > 8) && (
                                  <span style={{ marginLeft: canViewMoney ? '8px' : 0 }}>
                                    <Badge tone="warning" label="Overtime flagged" />
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  )
                })}
              </tbody>
            </table>
          </DataTableShell>
        </Card>
      )}
    </PageShell>
  )
}
