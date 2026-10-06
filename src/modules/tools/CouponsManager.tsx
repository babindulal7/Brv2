/**
 * CouponsManager — Full promo codes management & validation workspace.
 *
 * Ported from the standalone's coupon engine (script_1.js:2310-2360, 2410-2440).
 * Enforces the 25% discount cap rule, redemption quotas, and client-tier targeting.
 */
import { useState, useMemo } from 'react'
import { Card, PageHeader, Button, KpiStrip, type Kpi } from '../../components/ui/Page'
import { Badge } from '../../components/ui/Badge'
import Icon from '../../components/ui/Icon'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { Modal } from '../../components/ui/Modal'
import {
  listCoupons,
  toggleCoupon,
  createCoupon,
  validateCoupon,
  getCouponStatus,
  type Coupon,
} from '../../lib/queries/coupons'
import { getBusinessToday } from '../../lib/bs'

export default function CouponsManager() {
  const { showSuccessToast } = useToast()
  const canViewMoney = useCanViewMoney()
  const [coupons, setCoupons] = useState<Coupon[]>(() => listCoupons())
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Sandbox state
  const [testCode, setTestCode] = useState('DASHAIN10')
  const [testSpend, setTestSpend] = useState('20000')
  const [testResult, setTestResult] = useState<ReturnType<typeof validateCoupon> | null>(null)

  // New coupon modal state
  const [newCode, setNewCode] = useState('')
  const [newType, setNewType] = useState<'pct' | 'flat'>('pct')
  const [newValue, setNewValue] = useState('10')
  const [newMinSpend, setNewMinSpend] = useState('10000')
  const [newCapNpr, setNewCapNpr] = useState('5000')
  const [newLimit, setNewLimit] = useState('100')
  const [newFrom, setNewFrom] = useState(() => getBusinessToday().toISOString().slice(0, 10))
  const [newTo, setNewTo] = useState(() => {
    const d = getBusinessToday()
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  })
  const [newClientType, setNewClientType] = useState('All')
  const [newStackable, setNewStackable] = useState(true)
  const [createError, setCreateError] = useState('')

  const todayIso = useMemo(() => getBusinessToday().toISOString().slice(0, 10), [])

  const refreshedCoupons = () => {
    setCoupons(listCoupons())
  }

  const handleToggle = (code: string) => {
    toggleCoupon(code)
    refreshedCoupons()
    showSuccessToast('Coupon Updated', `Status changed for voucher ${code}`)
  }

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    showSuccessToast('Copied to Clipboard', `Voucher code ${code} is ready to paste`)
  }

  const handleTestValidate = () => {
    const spendNum = Math.max(0, Number(testSpend) || 0)
    const res = validateCoupon(testCode, { preTotal: spendNum, today: todayIso })
    setTestResult(res)
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    if (!newCode.trim()) {
      setCreateError('Coupon code is required.')
      return
    }
    const valNum = Number(newValue) || 0
    if (valNum <= 0) {
      setCreateError('Discount value must be greater than zero.')
      return
    }

    try {
      createCoupon({
        code: newCode,
        type: newType,
        value: valNum,
        minBooking: Math.max(0, Number(newMinSpend) || 0),
        capNpr: Math.max(0, Number(newCapNpr) || 0),
        limit: Math.max(1, Number(newLimit) || 1),
        from: newFrom,
        to: newTo,
        perClient: 1,
        types: newClientType === 'All' ? ['All'] : [newClientType],
        cats: ['All'],
        stackable: newStackable,
        by: 'Ops Admin',
      })
      refreshedCoupons()
      setIsModalOpen(false)
      showSuccessToast('Coupon Created', `Promo voucher ${newCode.toUpperCase()} is now live.`)
      // reset form
      setNewCode('')
      setNewValue('10')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCreateError(err.message)
      } else {
        setCreateError('Failed to create coupon')
      }
    }
  }

  // KPIs
  const kpiItems: Kpi[] = useMemo(() => {
    const activeCount = coupons.filter(c => getCouponStatus(c, todayIso) === 'Active').length
    const totalUsed = coupons.reduce((sum, c) => sum + (c.used || 0), 0)
    const expiringSoon = coupons.filter(c => {
      const st = getCouponStatus(c, todayIso)
      if (st !== 'Active') return false
      const diffMs = new Date(c.to).getTime() - new Date(todayIso).getTime()
      const days = Math.round(diffMs / (1000 * 3600 * 24))
      return days >= 0 && days <= 30
    }).length

    return [
      {
        label: 'Active Codes',
        value: `${activeCount}`,
        icon: 'receipt',
        accent: 'success',
        note: `${coupons.length} total vouchers configured`,
      },
      {
        label: 'Redemptions',
        value: `${totalUsed}`,
        icon: 'checklist',
        accent: 'primary',
        note: 'Applied to verified bookings',
      },
      {
        label: 'Stacking Policy',
        value: '25% Cap',
        icon: 'card',
        accent: 'neutral',
        note: 'Hard ceiling per booking',
      },
      {
        label: 'Expiring Soon',
        value: `${expiringSoon}`,
        icon: 'timer',
        accent: expiringSoon > 0 ? 'progress' : 'neutral',
        note: 'Expiring within 30 days',
      },
    ]
  }, [coupons, todayIso])

  const filteredCoupons = useMemo(() => {
    return coupons.filter(c => {
      const st = getCouponStatus(c, todayIso)
      if (filterStatus !== 'all' && st.toLowerCase() !== filterStatus.toLowerCase()) {
        return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        return c.code.toLowerCase().includes(q) || c.by.toLowerCase().includes(q)
      }
      return true
    })
  }, [coupons, filterStatus, search, todayIso])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        title="Coupons & Promotional Vouchers"
        description="Manage promotional discount codes, enforce the 25% discount stacking ceiling, and track client redemptions."
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            <Icon name="plus" size={16} />
            New Promo Code
          </Button>
        }
      />

      <KpiStrip items={kpiItems} />

      {/* Interactive Voucher Sandbox */}
      <Card
        style={{
          borderLeft: '4px solid var(--accent)',
          background: 'var(--card)',
          padding: 'var(--sp-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', marginBottom: 'var(--sp-xs)' }}>
          <Icon name="zap" size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>Voucher Simulator & Sandbox</span>
        </div>
        <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)', marginBottom: 'var(--sp-md)' }}>
          Test any voucher code against a booking subtotal to verify discount rates, minimum thresholds, and 25% cap behavior before client delivery.
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
              Voucher Code
            </label>
            <input
              type="text"
              value={testCode}
              onChange={e => setTestCode(e.target.value.toUpperCase())}
              placeholder="e.g. DASHAIN10"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'var(--font-id, sans-serif)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
              }}
            />
          </div>

          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
              Test Booking Subtotal (NPR)
            </label>
            <input
              type="number"
              value={testSpend}
              onChange={e => setTestSpend(e.target.value)}
              placeholder="e.g. 25000"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
              }}
            />
          </div>

          <Button variant="secondary" onClick={handleTestValidate} style={{ minHeight: 44 }}>
            <Icon name="check" size={16} />
            Simulate Checkout
          </Button>
        </div>

        {testResult && (
          <div
            style={{
              marginTop: 'var(--sp-md)',
              padding: '12px 16px',
              borderRadius: 'var(--r-btn)',
              background: testResult.ok ? 'rgba(46, 204, 143, 0.1)' : 'rgba(255, 71, 87, 0.1)',
              border: `1px solid ${testResult.ok ? 'var(--success-border, #2ECC8F)' : 'var(--danger-border, #FF4757)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--sp-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <Icon
                name={testResult.ok ? 'check' : 'error'}
                size={20}
                style={{ color: testResult.ok ? 'var(--success-text)' : 'var(--danger-text)' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
                  {testResult.ok ? `Valid Code: ${formatMoney(rupees(testResult.amount))} Discount` : 'Voucher Rejected'}
                </div>
                <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
                  {testResult.ok
                    ? `Eligible voucher applied successfully. Code status: ${testResult.status}. Stacking cap: 25% verified.`
                    : testResult.reason}
                </div>
              </div>
            </div>
            {testResult.ok && canViewMoney && (
              <div style={{ fontWeight: 700, fontSize: 'var(--t-subhead)', color: 'var(--success-text)' }}>
                - {formatMoney(rupees(testResult.amount))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'active', 'expired', 'scheduled', 'disabled'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterStatus(tab)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--border)',
                background: filterStatus === tab ? 'var(--accent)' : 'var(--card)',
                color: filterStatus === tab ? '#fff' : 'var(--text2)',
                fontSize: 'var(--t-caption)',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <input
            type="text"
            aria-label="Search coupon code or author"
            placeholder="Search code or author..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 12px 6px 32px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-caption)',
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)' }}>
            <Icon name="search" size={14} />
          </span>
        </div>
      </div>

      {/* Vouchers Table */}
      <Card style={{ overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-body)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 'var(--t-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px' }}>Voucher Code</th>
              <th style={{ padding: '12px 16px' }}>Discount</th>
              <th style={{ padding: '12px 16px' }}>Validity Window</th>
              <th style={{ padding: '12px 16px' }}>Min Spend</th>
              <th style={{ padding: '12px 16px' }}>Usage / Quota</th>
              <th style={{ padding: '12px 16px' }}>Target Group</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCoupons.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                  No coupons found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredCoupons.map(c => {
                const status = getCouponStatus(c, todayIso)
                const isPct = c.type === 'pct'
                const pctUsed = Math.min(100, Math.round(((c.used || 0) / (c.limit || 1)) * 100))

                return (
                  <tr key={c.code} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--t-body)', color: 'var(--accent)' }}>
                          {c.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(c.code)}
                          title="Copy code"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                            padding: 2,
                          }}
                        >
                          <Icon name="file" size={13} />
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Created by {c.by}</div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700 }}>
                        {isPct ? `${c.value}% OFF` : `${formatMoney(rupees(c.value))} FLAT`}
                      </div>
                      {c.capNpr > 0 && isPct && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Cap: {formatMoney(rupees(c.capNpr))}</div>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 'var(--t-caption)' }}>{c.from} → {c.to}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {status === 'Active' ? 'Active now' : status}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: 'var(--t-caption)' }}>
                      {c.minBooking > 0 ? formatMoney(rupees(c.minBooking)) : 'None'}
                    </td>

                    <td style={{ padding: '14px 16px', minWidth: 140 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 4 }}>
                        <span>{c.used} / {c.limit}</span>
                        <span style={{ color: 'var(--muted)' }}>{pctUsed}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pctUsed}%`,
                            background: pctUsed >= 90 ? 'var(--danger-text)' : 'var(--accent)',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 'var(--t-caption)', color: 'var(--text2)' }}>
                        {c.types.join(', ')}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <Badge
                        label={status}
                        tone={
                          status === 'Active'
                            ? 'in'
                            : status === 'Expired'
                            ? 'danger'
                            : status === 'Scheduled'
                            ? 'primary'
                            : 'neutral'
                        }
                      />
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        onClick={() => handleToggle(c.code)}
                        className="tap"
                        style={{ fontSize: 'var(--t-caption)', minHeight: 'var(--tap)', padding: '0 8px' }}
                      >
                        {c.disabled ? 'Enable' : 'Deactivate'}
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* Create Coupon Modal */}
      {isModalOpen && (
        <Modal
          title="Create Promotional Coupon"
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        >
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {createError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--r-btn)',
                  background: 'rgba(255, 71, 87, 0.1)',
                  border: '1px solid var(--danger-border, #FF4757)',
                  color: 'var(--danger-text)',
                  fontSize: 'var(--t-caption)',
                }}
              >
                {createError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                Voucher Code *
              </label>
              <input
                type="text"
                required
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase())}
                placeholder="e.g. DASHAIN26"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-id, sans-serif)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Discount Type
                </label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as 'pct' | 'flat')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="pct">Percentage (%)</option>
                  <option value="flat">Flat Amount (NPR)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  {newType === 'pct' ? 'Percentage (%)' : 'Amount (NPR)'} *
                </label>
                <input
                  type="number"
                  required
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  placeholder="e.g. 10"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Min Booking Spend (NPR)
                </label>
                <input
                  type="number"
                  value={newMinSpend}
                  onChange={e => setNewMinSpend(e.target.value)}
                  placeholder="e.g. 15000"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Maximum Discount Cap (NPR)
                </label>
                <input
                  type="number"
                  value={newCapNpr}
                  onChange={e => setNewCapNpr(e.target.value)}
                  placeholder="e.g. 10000"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Valid From
                </label>
                <input
                  type="date"
                  value={newFrom}
                  onChange={e => setNewFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Valid Until
                </label>
                <input
                  type="date"
                  value={newTo}
                  onChange={e => setNewTo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Total Redemption Quota
                </label>
                <input
                  type="number"
                  value={newLimit}
                  onChange={e => setNewLimit(e.target.value)}
                  placeholder="e.g. 100"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--t-caption)', fontWeight: 600, marginBottom: 4 }}>
                  Target Client Group
                </label>
                <select
                  value={newClientType}
                  onChange={e => setNewClientType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="All">All Clients</option>
                  <option value="Student">Students Only</option>
                  <option value="Production Company">Production Companies</option>
                  <option value="Rental House">Sub-Rental Houses</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="stackableCheck"
                checked={newStackable}
                onChange={e => setNewStackable(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              <label htmlFor="stackableCheck" style={{ fontSize: 'var(--t-caption)', color: 'var(--text)' }}>
                Allow combining with client membership tiers (Subject to 25% max total discount cap)
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Create Voucher
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
