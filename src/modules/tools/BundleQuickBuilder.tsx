/**
 * BundleQuickBuilder — Fast equipment package & discount calculator.
 *
 * Ported from the standalone's bundle builder (script_1.js:6886-6906).
 * Selects gear, applies a package bundle discount %, and computes
 * combined daily rental rates for quotation.
 */
import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { formatMoney, rupees } from '../../lib/money'
import { useToast } from '../../components/ui/Toast'

interface CatalogItem {
  key: string
  name: string
  cat: string
  rate: number
}

const CATALOG: CatalogItem[] = [
  { key: 'fx3', name: 'Sony FX3 Body', cat: 'Cameras', rate: 6500 },
  { key: 'fx6', name: 'Sony FX6 Cinema', cat: 'Cameras', rate: 9500 },
  { key: 'nisi', name: 'NiSi Athena Prime 5-Lens Set', cat: 'Lenses', rate: 12000 },
  { key: 'sigma', name: 'Sigma 18-35 T2 Cine', cat: 'Lenses', rate: 2500 },
  { key: 'ap600', name: 'Aputure 600x Pro Light', cat: 'Lighting', rate: 4500 },
  { key: 'mc', name: 'Aputure MC Pro 4-Kit', cat: 'Lighting', rate: 1500 },
  { key: 'rs4', name: 'DJI RS4 Pro Gimbal', cat: 'Grip', rate: 2500 },
  { key: 'mkh', name: 'Sennheiser MKH 416 Boom', cat: 'Audio', rate: 1800 },
  { key: 'batt', name: '99Wh V-Mount Battery Set (x2)', cat: 'Power', rate: 1200 },
  { key: 'atomos', name: 'Atomos Ninja V+ Recorder', cat: 'Monitoring', rate: 2200 },
]

export default function BundleQuickBuilder() {
  const { showSuccessToast } = useToast()
  const [bundleName, setBundleName] = useState('Documentary Shoot Kit')
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({
    fx3: true,
    nisi: true,
    rs4: true,
  })
  const [discountPct, setDiscountPct] = useState(15)

  const chosenItems = useMemo(() => {
    return CATALOG.filter((item) => selectedKeys[item.key])
  }, [selectedKeys])

  const totals = useMemo(() => {
    const sum = chosenItems.reduce((acc, it) => acc + it.rate, 0)
    const disc = Math.round((sum * discountPct) / 100)
    const rate = sum - disc
    return { sum, disc, rate }
  }, [chosenItems, discountPct])

  const toggleItem = (k: string) => {
    setSelectedKeys((prev) => ({ ...prev, [k]: !prev[k] }))
  }

  const handleSave = () => {
    if (chosenItems.length === 0) return
    showSuccessToast(`“${bundleName}” bundle configured — ${chosenItems.length} items at ${formatMoney(rupees(totals.rate))}/day`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Build custom equipment packages with combined package discounts.
        Bundling simplifies check-out, protects profit margins, and provides clients with predictable per-day shoot costs.
      </div>

      {/* Bundle Name & Discount */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Kit / Bundle Name</label>
          <input
            type="text"
            value={bundleName}
            onChange={(e) => setBundleName(e.target.value)}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
              Package Discount: {discountPct}%
            </label>
          </div>
          <input
            type="range"
            min="0"
            max="40"
            step="5"
            value={discountPct}
            onChange={(e) => setDiscountPct(Number(e.target.value))}
            style={{ width: '100%', marginTop: '12px' }}
          />
        </div>
      </div>

      {/* Equipment Selector */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '8px' }}>
          Select Equipment for this Bundle
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {CATALOG.map((item) => {
            const isSelected = !!selectedKeys[item.key]
            return (
              <div
                key={item.key}
                onClick={() => toggleItem(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid var(--info)' : '1px solid var(--border)',
                  background: isSelected ? 'rgba(47, 125, 255, 0.08)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{item.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{item.cat}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                    {formatMoney(rupees(item.rate))}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>/day</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)' }}>
            <span style={{ color: 'var(--text2)' }}>Individual Items Sum ({chosenItems.length} items):</span>
            <span style={{ fontWeight: 600 }}>{formatMoney(rupees(totals.sum))}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)', color: 'var(--green)' }}>
            <span>Bundle Package Savings ({discountPct}%):</span>
            <span style={{ fontWeight: 600 }}>-{formatMoney(rupees(totals.disc))}</span>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Package Day-Rate:</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Inclusive of all selected package equipment</div>
            </div>
            <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--green)' }}>
              {formatMoney(rupees(totals.rate))}<span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text3)' }}>/day</span>
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <Button variant="primary" onClick={handleSave} disabled={chosenItems.length === 0}>
              Save Bundle Configuration
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
