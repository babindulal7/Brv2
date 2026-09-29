/**
 * LateFeeCalculator — Overtime billing calculation engine.
 *
 * Ported from the standalone's latefee tool (script_1.js:6877-6885).
 * Calculates late returns past the 6:00 AM cutoff rule with optional
 * +25% delay surcharge for emergency crew holdover.
 */
import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Page'
import { formatMoney, rupees } from '../../lib/money'

export default function LateFeeCalculator() {
  const [dayRate, setDayRate] = useState('3500')
  const [overtimeDays, setOvertimeDays] = useState('1')
  const [hasSurcharge, setHasSurcharge] = useState(false)

  const rateNum = Math.max(0, Number(dayRate) || 0)
  const daysNum = Math.max(0, Number(overtimeDays) || 0)

  const calculation = useMemo(() => {
    const base = Math.round(rateNum * daysNum)
    const surcharge = hasSurcharge ? Math.round(base * 0.25) : 0
    const total = base + surcharge
    return { base, surcharge, total }
  }, [rateNum, daysNum, hasSurcharge])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Calculate overdue equipment return penalties. Rental days end at <strong>6:00 AM</strong>;
        returns past the grace window incur the standard day rate plus an optional surcharge for dispatch disruption.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
            Equipment Day Rate (NPR)
          </label>
          <input
            type="number"
            value={dayRate}
            onChange={(e) => setDayRate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              marginTop: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
            Overdue Days (or Day Fractions)
          </label>
          <input
            type="number"
            step="0.5"
            value={overtimeDays}
            onChange={(e) => setOvertimeDays(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              marginTop: '4px',
              fontSize: '14px',
            }}
          />
        </div>
      </div>

      {/* Surcharge switch */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
          Surcharge Tier
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setHasSurcharge(false)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: !hasSurcharge ? '1px solid var(--info)' : '1px solid var(--border)',
              background: !hasSurcharge ? 'rgba(47, 125, 255, 0.14)' : 'var(--surface)',
              color: !hasSurcharge ? 'var(--info)' : 'var(--text3)',
            }}
          >
            Standard rate (1.0×)
          </button>
          <button
            type="button"
            onClick={() => setHasSurcharge(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: hasSurcharge ? '1px solid var(--gold)' : '1px solid var(--border)',
              background: hasSurcharge ? 'rgba(255, 159, 67, 0.14)' : 'var(--surface)',
              color: hasSurcharge ? 'var(--gold)' : 'var(--text3)',
            }}
          >
            +25% Delay Surcharge (Dispatch conflict)
          </button>
        </div>
      </div>

      {/* Result Card */}
      <Card>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)' }}>
            <span style={{ color: 'var(--text2)' }}>Base Overtime Fee:</span>
            <span style={{ fontWeight: 600 }}>{formatMoney(rupees(calculation.base))}</span>
          </div>

          {hasSurcharge && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)', color: 'var(--gold)' }}>
              <span>Late Dispatch Surcharge (+25%):</span>
              <span style={{ fontWeight: 600 }}>+{formatMoney(rupees(calculation.surcharge))}</span>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Total Late Fee Due:</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--red)' }}>
              {formatMoney(rupees(calculation.total))}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
