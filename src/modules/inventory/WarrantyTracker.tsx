/**
 * WarrantyTracker — Equipment coverage & RMA claims management.
 *
 * Ported from the standalone's WARRANTY engine (script_1.js:6950-6992).
 * Monitors warranty periods, upcoming expirations (<=60d), RMA claims,
 * and warranty ROI (% of premiums recovered).
 */
import { useState, useMemo, useCallback } from 'react'
import { Card, KpiStrip, PageHeader } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { SearchInput } from '../../components/ui/SearchInput'
import { PageShell } from '../../components/ui/PageShell'
import { DataTableShell } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  getWarrantyItems,
  recordWarrantyClaim,
  getWarrantyStats,
  type WarrantyItem,
  type WarrantyState,
} from '../../lib/queries/warranty'

const chipStyle = (active: boolean): React.CSSProperties => ({
  minHeight: 'var(--tap, 44px)',
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  border: active ? '1px solid rgba(47, 125, 255, 0.4)' : '1px solid var(--border)',
  background: active ? 'rgba(47, 125, 255, 0.14)' : 'transparent',
  color: active ? 'var(--info)' : 'var(--text3)',
  transition: 'all 0.15s',
})

export default function WarrantyTracker() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const canViewMoney = useCanViewMoney()

  const [items, setItems] = useState<WarrantyItem[]>(getWarrantyItems)
  const [filter, setFilter] = useState<'All' | WarrantyState>('All')
  const [search, setSearch] = useState('')
  const [claimTarget, setClaimTarget] = useState<WarrantyItem | null>(null)
  const [claimAmount, setClaimAmount] = useState('10000')
  const [claimNotes, setClaimNotes] = useState('')

  const stats = useMemo(() => getWarrantyStats(items), [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filter !== 'All' && item.status !== filter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          item.serialNo.toLowerCase().includes(q) ||
          item.provider.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, filter, search])

  const handleRecordClaim = useCallback(() => {
    if (!claimTarget) return
    const amt = Number(claimAmount) || 0
    const updated = recordWarrantyClaim(claimTarget.id, amt, claimNotes)
    setItems(updated)
    setClaimTarget(null)
    setClaimAmount('10000')
    setClaimNotes('')
    showSuccessToast(
      canViewMoney
        ? `Claim of ${formatMoney(rupees(amt))} recorded for ${claimTarget.name}`
        : `Warranty claim recorded for ${claimTarget.name}`,
    )
  }, [claimTarget, claimAmount, claimNotes, canViewMoney, showSuccessToast])

  const kpis: Kpi[] = useMemo(() => [
    ...(canViewMoney
      ? [
          {
            label: 'Premiums Paid',
            value: formatMoney(rupees(stats.totalPremiums)),
            icon: 'card' as const,
            accent: 'primary' as const,
            definition: 'Total cost of warranty policies & care packages across gear.',
          },
          {
            label: 'Claims Recovered',
            value: formatMoney(rupees(stats.totalRecovered)),
            icon: 'check' as const,
            accent: 'success' as const,
            definition: 'Value of repairs and replacements recovered through RMA warranty.',
          },
        ]
      : []),
    { label: 'Expiring ≤ 60d', value: String(stats.expiringSoonCount), icon: 'alert_triangle', accent: 'warn' },
    { label: 'Expired / Void', value: String(stats.expiredCount), icon: 'alert_triangle', accent: 'danger' },
  ], [stats, canViewMoney])

  return (
    <PageShell
      header={
        <PageHeader
          title="Equipment Warranty & RMA Tracker"
          description="Manufacturer guarantees, care packages, upcoming expirations (≤60d), and claims."
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search equipment, serial, provider… (press /)',
          }}
        />
      }
    >
      {/* KPI strip */}
      <KpiStrip items={kpis} columns={isPhone || !canViewMoney ? 2 : 4} />

      {/* Filter and search bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: 'var(--sp-md) 0' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['All', 'Expiring', 'Active', 'Expired'] as const).map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={filter === st}
              style={chipStyle(filter === st)}
              onClick={() => setFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search equipment, serial, provider…" />
        </div>
      </div>

      {/* Table of items */}
      <Card>
        <DataTableShell ariaLabel="Warranty tracker">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)' }}>Equipment / Serial</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)' }}>Coverage Provider</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)' }}>End Date</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)' }}>Status</th>
                {canViewMoney && (
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>Premium</th>
                )}
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>
                  {canViewMoney ? 'Claims Recovered' : 'Claims'}
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canViewMoney ? 7 : 6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)' }}>
                    No warranty records matching "{search}"
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const roi = item.premiumCost > 0 ? Math.round((item.claimsRecovered / item.premiumCost) * 100) : 0
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {item.serialNo} · {item.category}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                      <div>{item.provider}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{item.termMonths} mos</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div>{item.endDate}</div>
                      <div style={{ fontSize: '11px', color: item.daysRemaining < 0 ? 'var(--red)' : item.daysRemaining <= 60 ? 'var(--gold)' : 'var(--text3)' }}>
                        {item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)}d ago` : `${item.daysRemaining}d left`}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <Badge
                        tone={item.status === 'Active' ? 'in' : item.status === 'Expiring' ? 'warning' : 'danger'}
                        label={item.status}
                      />
                    </td>
                    {canViewMoney && (
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 500 }}>
                        {formatMoney(rupees(item.premiumCost))}
                      </td>
                    )}
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      {canViewMoney && (
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(rupees(item.claimsRecovered))}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: canViewMoney && roi >= 100 ? 'var(--green)' : item.claimsCount > 0 ? 'var(--gold)' : 'var(--text3)' }}>
                        {item.claimsCount} claim{item.claimsCount === 1 ? '' : 's'} {canViewMoney && item.claimsCount > 0 ? `· ${roi}% ROI` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClaimTarget(item)}
                      >
                        Record Claim
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTableShell>
      </Card>

      {/* Record Claim Modal */}
      {claimTarget && (
        <Modal isOpen onClose={() => setClaimTarget(null)} title={`Record Warranty Claim — ${claimTarget.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: '8px', fontSize: 'var(--t-meta)' }}>
              <div><strong>Serial No:</strong> {claimTarget.serialNo}</div>
              <div><strong>Provider:</strong> {claimTarget.provider}</div>
              <div>
                <strong>Current Claims:</strong> {claimTarget.claimsCount}
                {canViewMoney ? ` (${formatMoney(rupees(claimTarget.claimsRecovered))} recovered)` : ''}
              </div>
            </div>

            {canViewMoney && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Claim Value Recovered (NPR) *</label>
                <input
                  type="number"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Claim / RMA Description</label>
              <textarea
                placeholder="e.g. Shutter replacement, optical re-centering, sensor cleaning..."
                value={claimNotes}
                onChange={(e) => setClaimNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button onClick={() => setClaimTarget(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleRecordClaim}>
                Save Claim
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}
