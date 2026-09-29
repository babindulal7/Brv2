/**
 * Shift Handover Panel — collapsible section for the Today dashboard.
 *
 * Ported from the standalone's shifthandover screen. Shows a 5-item checklist,
 * a "Complete Handover" action, and an expandable log of past handovers with KPIs.
 */
import { useState, useMemo, useCallback } from 'react'
import { Card, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useViewport } from '../../lib/device'
import {
  SHIFT_CHECKLIST,
  getHandoverRecords,
  completeHandover,
  getHandoverStats,
  type HandoverRecord,
} from '../../lib/queries/shiftHandover'

// ── Styles ───────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-md)',
  marginTop: 'var(--sp-lg)',
}

const headerBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--sp-sm)',
  cursor: 'pointer',
  padding: '12px 16px',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
}

const checklistStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
}

const checkItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  cursor: 'pointer',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  transition: 'background 0.15s',
}

const logRowStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  cursor: 'pointer',
}

const logRowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
}

const logRowMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
  fontSize: 'var(--t-meta)',
  color: 'var(--text2)',
}

const noteBoxStyle: React.CSSProperties = {
  marginTop: '8px',
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'var(--surface)',
  fontSize: 'var(--t-meta)',
  color: 'var(--text2)',
  lineHeight: 1.5,
}

// ── Component ────────────────────────────────────────────────────────

export default function ShiftHandoverPanel() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'

  const [expanded, setExpanded] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [records, setRecords] = useState<HandoverRecord[]>(getHandoverRecords)
  const [openLogId, setOpenLogId] = useState<number | null>(null)

  const todayRecord = records.find((r) => r.status === 'Pending')
  const handoverDone = !todayRecord

  const allChecked = SHIFT_CHECKLIST.every((item) => handoverDone || checks[item.key])

  const toggleCheck = useCallback((key: string) => {
    if (handoverDone) return
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [handoverDone])

  const handleCompleteHandover = useCallback(() => {
    if (!allChecked || handoverDone || !todayRecord) return
    const updated = completeHandover(
      todayRecord.id,
      'All pickups staged, drawer counted, no discrepancies.',
    )
    setRecords(updated)
    setChecks({})
    const minute = Math.floor(Math.random() * 10)
    showSuccessToast(`Shift handover recorded · ${todayRecord.from} → ${todayRecord.to} · 14:0${minute}`)
  }, [allChecked, handoverDone, todayRecord, showSuccessToast])

  const handleRecountCash = useCallback(() => {
    showSuccessToast('Cash count opened — count the drawer, then enter the amount')
  }, [showSuccessToast])

  const stats = useMemo(() => getHandoverStats(records), [records])

  const kpis: Kpi[] = useMemo(() => [
    { label: 'Handovers (7D)', value: String(stats.handovers7d), icon: 'checklist', accent: 'primary' },
    { label: 'On-Time Rate', value: stats.onTimeRate, icon: 'check', accent: 'success' },
    { label: 'Cash Variance Flags', value: String(stats.cashFlags), icon: 'alert_triangle', accent: 'warn' },
    { label: 'Checklist Misses', value: String(stats.checklistMisses), icon: 'alert_triangle', accent: 'warn' },
  ], [stats])

  const checkedCount = SHIFT_CHECKLIST.filter((item) => handoverDone || checks[item.key]).length

  return (
    <div style={sectionStyle}>
      {/* ── Section header ─────────────────────────────────────────── */}
      <div
        style={headerBarStyle}
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Shift Handover"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((p) => !p) } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon name={expanded ? 'chevron_down' : 'chevron_right'} size={16} />
          <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>Shift Handover</span>
        </div>
        <Badge
          tone={handoverDone ? 'in' : 'warning'}
          label={handoverDone ? 'Handover complete' : 'Overlap window open · 14:00–15:00'}
        />
      </div>

      {/* ── Expanded content ───────────────────────────────────────── */}
      {expanded && (
        <Card>
          {/* Checklist */}
          <div style={checklistStyle}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Handover Checklist
            </div>

            {SHIFT_CHECKLIST.map((item) => {
              const isChecked = handoverDone || !!checks[item.key]
              return (
                <div
                  key={item.key}
                  style={{
                    ...checkItemStyle,
                    background: isChecked ? 'rgba(46, 204, 143, 0.06)' : 'transparent',
                  }}
                  onClick={() => toggleCheck(item.key)}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCheck(item.key) } }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                      background: isChecked ? 'rgba(46, 204, 143, 0.16)' : 'var(--surface)',
                      border: isChecked ? '1.5px solid rgba(46, 204, 143, 0.5)' : '1.5px solid var(--border)',
                      color: 'var(--green)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isChecked ? '✓' : ''}
                  </div>

                  {/* Label + hint */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', marginTop: '2px' }}>
                      {item.hint}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexDirection: isPhone ? 'column' : 'row' }}>
              <Button
                variant={handoverDone ? undefined : allChecked ? 'primary' : undefined}
                disabled={handoverDone || !allChecked}
                onClick={handleCompleteHandover}
                style={{
                  flex: 1,
                  background: handoverDone
                    ? 'var(--surface)'
                    : allChecked
                      ? 'var(--green)'
                      : 'var(--surface)',
                  border: handoverDone || !allChecked ? '1px solid var(--border)' : 'none',
                  color: handoverDone
                    ? 'var(--green)'
                    : allChecked
                      ? '#04120B'
                      : 'var(--text3)',
                  fontWeight: 700,
                }}
              >
                {handoverDone
                  ? '✓ Handover Complete'
                  : `Complete Handover (${checkedCount} / ${SHIFT_CHECKLIST.length})`}
              </Button>

              <Button onClick={handleRecountCash}>
                Recount Cash
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Handover log ───────────────────────────────────────────── */}
      {expanded && (
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: logExpanded ? '1px solid var(--border)' : 'none',
            }}
            onClick={() => setLogExpanded((p) => !p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLogExpanded((p) => !p) } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name={logExpanded ? 'chevron_down' : 'chevron_right'} size={14} />
              <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
                Handover Log · {records.length} records
              </span>
            </div>
          </div>

          {logExpanded && (
            <>
              {/* KPI strip */}
              <div style={{ padding: '12px 16px 0' }}>
                <KpiStrip items={kpis} columns={isPhone ? 2 : 4} />
              </div>

              {/* Log rows */}
              {records.map((record) => {
                const isOpen = openLogId === record.id
                return (
                  <div key={record.id} style={logRowStyle}>
                    <div
                      style={logRowHeaderStyle}
                      onClick={() => setOpenLogId(isOpen ? null : record.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenLogId(isOpen ? null : record.id) } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={12} />
                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{record.date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Badge
                          tone={record.status === 'Complete' ? 'in' : 'warning'}
                          label={record.status}
                        />
                      </div>
                    </div>

                    <div style={{ ...logRowMetaStyle, marginTop: '6px' }}>
                      <span>{record.from} → {record.to}</span>
                      <span>{record.cashDisplay}</span>
                      <span>Checks: {record.checksCompleted}</span>
                    </div>

                    {isOpen && (
                      <div style={noteBoxStyle}>
                        {record.notes}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
