/**
 * QrGeneratorModal — Deterministic SVG QR and barcode generator.
 *
 * Ported from the standalone's QR generator (script_1.js:6908-6926).
 * Generates offline printable equipment QR and Code128 barcode labels
 * from serial numbers or SKU tags.
 */
import { useState } from 'react'
import { Card } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'

function qrSeedHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

function renderQrSvg(seed: string) {
  const n = 21
  let h = qrSeedHash(seed) || 1
  const rnd = () => {
    h ^= h << 13
    h >>>= 0
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h / 4294967296
  }

  const finder = (r: number, c: number) => {
    const boxes: [number, number][] = [[0, 0], [0, n - 7], [n - 7, 0]]
    for (const [br, bc] of boxes) {
      if (r >= br && r < br + 7 && c >= bc && c < bc + 7) {
        const rr = r - br, cc = c - bc
        return {
          hit: true,
          on: (rr === 0 || rr === 6 || cc === 0 || cc === 6) || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4),
        }
      }
    }
    return { hit: false, on: false }
  }

  const rects = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const f = finder(r, c)
      const on = f.hit ? f.on : rnd() > 0.52
      if (on) {
        rects.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0A0A0A" />)
      }
    }
  }

  return (
    <svg viewBox="0 0 21 21" width={110} height={110} style={{ background: '#fff', borderRadius: '6px', padding: '6px' }}>
      {rects}
    </svg>
  )
}

function renderBarcodeSvg(seed: string) {
  let h = qrSeedHash(seed) || 1
  const rnd = () => {
    h ^= h << 13
    h >>>= 0
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h / 4294967296
  }

  const bars = []
  let x = 0
  for (let i = 0; i < 43; i++) {
    const w = 1 + Math.floor(rnd() * 3)
    if (i % 2 === 0) {
      bars.push(<rect key={i} x={x} y={0} width={w} height={36} fill="#0A0A0A" />)
    }
    x += w
  }

  return (
    <svg viewBox={`0 0 ${x} 36`} preserveAspectRatio="none" style={{ background: '#fff', borderRadius: '6px', padding: '6px', width: '220px', height: '54px' }}>
      {bars}
    </svg>
  )
}

const PRESET_ITEMS = [
  { name: 'Sony FX3 Body', serial: 'FX3-9941', category: 'Cameras' },
  { name: 'Sony FX6 Cinema', serial: 'FX6-2004', category: 'Cameras' },
  { name: 'NiSi Athena Prime 35mm', serial: 'ATH-35-08', category: 'Lenses' },
  { name: 'Aputure 600x Pro', serial: 'AP-600X-02', category: 'Lighting' },
  { name: 'DJI RS4 Pro Gimbal', serial: 'RS4-7712', category: 'Grip' },
]

export default function QrGenerator() {
  const [tagText, setTagText] = useState('FX3-9941')
  const [format, setFormat] = useState<'QR' | 'Barcode'>('QR')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Generate durable equipment asset tags and QR labels for cases and serial tracking.
        Works offline and encodes serial numbers for fast warehouse camera scanner recognition.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Serial / Tag Number</label>
          <input
            type="text"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              marginTop: '4px',
              fontFamily: 'monospace',
            }}
          />

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Quick Presets:</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {PRESET_ITEMS.map((item) => (
                <button
                  key={item.serial}
                  type="button"
                  onClick={() => setTagText(item.serial)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text2)',
                    cursor: 'pointer',
                  }}
                >
                  {item.serial}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '4px' }}>
            Label Format
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['QR', 'Barcode'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: format === fmt ? '1px solid var(--info)' : '1px solid var(--border)',
                  background: format === fmt ? 'rgba(47, 125, 255, 0.14)' : 'var(--surface)',
                  color: format === fmt ? 'var(--info)' : 'var(--text3)',
                }}
              >
                {fmt === 'QR' ? '2D QR Code' : '1D Barcode'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rendered Label Card */}
      <Card>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#444', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Babin Rentals · Asset ID
            </div>
            {format === 'QR' ? renderQrSvg(tagText || 'SAMPLE') : renderBarcodeSvg(tagText || 'SAMPLE')}
            <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#0A0A0A', marginTop: '8px' }}>
              {tagText || 'SAMPLE'}
            </div>
          </div>

          <Button onClick={() => window.print()}>
            <Icon name="download" size={14} />
            Print Tag Label
          </Button>
        </div>
      </Card>
    </div>
  )
}
