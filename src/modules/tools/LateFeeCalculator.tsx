import { useState } from 'react'
import { Card } from '../../components/ui/Page'
import { formatMoney, rupees, lateFee } from '../../lib/money'

export default function LateFeeCalculator() {
  const [dayRate, setDayRate] = useState('')
  const [minutes, setMinutes] = useState('0')
  const rate = Number(dayRate)
  const overage = Number(minutes)
  const valid = dayRate.trim() !== '' && Number.isFinite(rate) && rate >= 0 && Number.isFinite(overage) && overage >= 0
  const result = valid ? lateFee({ scheduledReturnAt: new Date(0), actualReturnAt: new Date(overage * 60_000), dayRatePaisa: rupees(rate) }) : null
  return <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
    <p style={{ color: 'var(--text2)' }}>Up to 30 minutes free. Under 2 hours: half a day. From 2 hours: a full day, with another day charged for each additional 24 hours.</p>
    <Card title="Late fee estimate">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <label style={{ display: 'grid', gap: 6 }}>Daily rental rate (NPR)<input aria-label="Daily rental rate (NPR)" type="number" min="0" value={dayRate} onChange={e => setDayRate(e.target.value)} style={{ minHeight: 44 }} /></label>
        <label style={{ display: 'grid', gap: 6 }}>Minutes after scheduled return<input aria-label="Minutes after scheduled return" type="number" min="0" value={minutes} onChange={e => setMinutes(e.target.value)} style={{ minHeight: 44 }} /></label>
      </div>
      <p role="status" style={{ marginBottom: 0 }}>{result ? <>{result.band} · <span className="figure" style={{ color: result.feePaisa > 0 ? 'var(--warn-text)' : 'var(--muted)' }}>{formatMoney(result.feePaisa)}</span></> : 'Enter a daily rate to calculate the fee.'}</p>
    </Card>
  </div>
}
