import { useState } from 'react'
import type { RefObject } from 'react'
import Icon from '../../../../components/ui/Icon'
import { cardStyle } from '../../../../components/ui/Page'
import type { OperationItem } from '../../../../data/operationsShell'

/**
 * Packing — produces the dispatched set (spec §5). Scan (or type) a serial to
 * pack it exactly as booked; "Substitute" packs a *different* serial, which
 * `ReturnStep` then expects automatically — no separate reconciliation step.
 */
export default function PackingStep({
  items,
  readOnly,
  scanRef,
  onPack,
}: {
  items: OperationItem[]
  readOnly: boolean
  scanRef: RefObject<HTMLInputElement>
  onPack: (itemId: string, input: { serial?: string | undefined; qty: number }) => void
}) {
  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [substituting, setSubstituting] = useState<string | null>(null)
  const [substituteValue, setSubstituteValue] = useState('')
  const [shortQty, setShortQty] = useState<Record<string, string>>({})

  const pending = items.filter((i) => i.packState === 'Pending')
  const done = items.filter((i) => i.packState !== 'Pending')

  function flash(itemId: string) {
    setFlashId(itemId)
    window.setTimeout(() => setFlashId((cur) => (cur === itemId ? null : cur)), 700)
  }

  function handleScan(raw: string) {
    const q = raw.trim().toLowerCase()
    if (!q) return
    const match = pending.find((it) => (it.bookingSerial && it.bookingSerial.toLowerCase() === q) || it.name.toLowerCase().includes(q))
    if (!match) {
      setScanError(`No pending item matches "${raw.trim()}".`)
      return
    }
    onPack(match.id, { serial: match.bookingSerial, qty: match.qtyExpected })
    flash(match.id)
    setScanError(null)
    setScanValue('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Icon name="search" size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
          <input
            ref={scanRef}
            value={scanValue}
            disabled={readOnly}
            onChange={(e) => {
              setScanValue(e.target.value)
              if (scanError) setScanError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleScan(scanValue)
            }}
            placeholder="Scan or type a serial…"
            aria-label="Scan or manually enter a serial to pack"
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px 0 32px',
              borderRadius: 'var(--r-input)',
              border: `1px solid ${scanError ? 'var(--danger-text)' : 'var(--border)'}`,
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-ui)',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Enter to pack · manual entry always available</span>
      </div>
      {scanError && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
          <Icon name="error" size={14} />
          {scanError}
        </div>
      )}

      {pending.length === 0 && done.length === 0 && (
        <p style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No items on this booking.</p>
      )}

      {pending.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>Pending ({pending.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((it) => (
              <div key={it.id} style={{ ...cardStyle, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{it.name}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      {it.trackingMode === 'serial' ? it.bookingSerial : `Qty ${it.qtyExpected}`} · {it.location}
                    </span>
                  </span>
                  {it.trackingMode === 'count' ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={it.qtyExpected}
                        placeholder={String(it.qtyExpected)}
                        value={shortQty[it.id] ?? ''}
                        disabled={readOnly}
                        onChange={(e) => setShortQty((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        style={{ width: 56, height: 44, padding: '0 8px', borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontFamily: 'inherit' }}
                      />
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => {
                          const qty = Number(shortQty[it.id] ?? it.qtyExpected)
                          onPack(it.id, { qty })
                          flash(it.id)
                        }}
                        style={btnStyle}
                      >
                        Pack
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={readOnly} onClick={() => onPack(it.id, { serial: it.bookingSerial, qty: 1 })} style={btnStyle}>
                        Pack as booked
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        aria-expanded={substituting === it.id}
                        onClick={() => setSubstituting(substituting === it.id ? null : it.id)}
                        style={{ ...btnStyle, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' }}
                      >
                        Substitute
                      </button>
                    </>
                  )}
                </div>
                {substituting === it.id && (
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', paddingLeft: 2 }}>
                    <input
                      value={substituteValue}
                      disabled={readOnly}
                      onChange={(e) => setSubstituteValue(e.target.value)}
                      placeholder="Substitute serial, e.g. RS4-0042"
                      style={{ flex: 1, maxWidth: 240, height: 44, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}
                    />
                    <button
                      type="button"
                      disabled={readOnly || !substituteValue.trim()}
                      onClick={() => {
                        if (!substituteValue.trim()) return
                        onPack(it.id, { serial: substituteValue.trim(), qty: 1 })
                        flash(it.id)
                        setSubstituting(null)
                        setSubstituteValue('')
                      }}
                      style={{ ...btnStyle, cursor: readOnly || !substituteValue.trim() ? 'not-allowed' : 'pointer', opacity: readOnly || !substituteValue.trim() ? 0.5 : 1 }}
                    >
                      Confirm substitution
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>Packed ({done.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {done.map((it) => {
              const substituted = it.trackingMode === 'serial' && it.packedSerial && it.bookingSerial && it.packedSerial !== it.bookingSerial
              return (
                <div
                  key={it.id}
                  style={{
                    ...cardStyle,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: flashId === it.id ? 'var(--st-in-bg)' : 'var(--card2)',
                    transition: 'background-color 0.5s ease',
                  }}
                >
                  <Icon name="checklist" size={16} style={{ color: it.packState === 'Short' ? 'var(--progress-text)' : 'var(--success-text)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{it.name}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      {it.trackingMode === 'serial' ? it.packedSerial : `${it.qtyPacked}/${it.qtyExpected} packed`}
                      {substituted && <span style={{ color: 'var(--progress-text)', fontWeight: 600 }}> · substituted from {it.bookingSerial}</span>}
                      {it.packState === 'Short' && <span style={{ color: 'var(--progress-text)', fontWeight: 600 }}> · short-pack</span>}
                    </span>
                  </span>
                  {it.lockedAt && (
                    <span title="Packing locked at handover signature — §5.2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      <Icon name="checklist" size={11} />
                      Locked
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

const btnStyle = {
  height: 44,
  padding: '0 12px',
  borderRadius: 'var(--r-btn)',
  border: '1px solid transparent',
  background: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
}
