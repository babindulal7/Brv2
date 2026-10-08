import { useState } from 'react'
import type { RefObject } from 'react'
import Icon from '../../../../components/ui/Icon'
import { cardStyle } from '../../../../components/ui/Page'
import { expectedForReturn, type CorrectionEntry, type OperationItem } from '../../../../data/operationsShell'
import EvidencePanel from '../EvidencePanel'

type Condition = NonNullable<OperationItem['returnCondition']>
const CONDITIONS: Condition[] = ['Excellent', 'Good', 'Fair', 'Damaged']

/**
 * Return — checks against the dispatched set (§5.1: discrepancy is dispatched
 * vs returned, never quoted vs returned). If Packing substituted a serial,
 * this step expects the substitute automatically — no manual reconciliation,
 * no caretaker flagging a returned item as "unexpected" because paperwork
 * disagrees. Acceptance criteria #1.
 *
 * Revised after an adversarial review pass: count-tracked lines always
 * received the *full* expected quantity — there was no control to enter a
 * lesser amount, so a partial/"Missing" return (a state `receiveReturn`
 * already supports) was unreachable for anything but serial-tracked items.
 * A per-line qty input now feeds the real quantity through.
 */
export default function ReturnStep({
  items,
  corrections,
  readOnly,
  scanRef,
  evidenceOpen,
  onEvidenceOpenChange,
  onReceive,
}: {
  items: OperationItem[]
  corrections: CorrectionEntry[]
  readOnly: boolean
  scanRef: RefObject<HTMLInputElement>
  evidenceOpen: boolean
  onEvidenceOpenChange: (open: boolean) => void
  onReceive: (itemId: string, input: { qty: number; condition: Condition }) => void
}) {
  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [returnQty, setReturnQty] = useState<Record<string, string>>({})

  const dispatched = items.filter((i) => i.packState !== 'Pending')
  const outstanding = dispatched.filter((i) => i.returnState === 'Pending')
  const settled = dispatched.filter((i) => i.returnState !== 'Pending')

  if (dispatched.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-sm)', padding: '40px 0', textAlign: 'center' }}>
        <Icon name="info" size={22} style={{ color: 'var(--muted)' }} />
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', maxWidth: 360 }}>
          Nothing has been dispatched yet — Return has nothing to check against until Packing produces a
          dispatched set.
        </p>
      </div>
    )
  }

  function flash(itemId: string) {
    setFlashId(itemId)
    window.setTimeout(() => setFlashId((cur) => (cur === itemId ? null : cur)), 700)
  }

  function qtyFor(item: OperationItem, expectedQty: number): number {
    const raw = returnQty[item.id]
    if (raw === undefined || raw.trim() === '') return expectedQty
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 0) return expectedQty
    return Math.min(parsed, expectedQty)
  }

  function receive(itemId: string, condition: Condition) {
    const item = outstanding.find((i) => i.id === itemId)
    if (!item) return
    const expected = expectedForReturn(item, corrections)
    onReceive(itemId, { qty: qtyFor(item, expected.qty), condition })
    setReturnQty((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    flash(itemId)
  }

  function handleScan(raw: string) {
    const q = raw.trim().toLowerCase()
    if (!q) return
    const match = outstanding.find((it) => {
      const exp = expectedForReturn(it, corrections)
      return (exp.serial && exp.serial.toLowerCase() === q) || it.name.toLowerCase().includes(q)
    })
    if (!match) {
      setScanError(`"${raw.trim()}" doesn't match anything dispatched and still outstanding.`)
      return
    }
    // A scan is always a full-unit receive — the fast path. Partial/Missing
    // returns go through the qty input in the Outstanding list below.
    const expected = expectedForReturn(match, corrections)
    onReceive(match.id, { qty: expected.qty, condition: 'Good' })
    setScanError(null)
    setScanValue('')
    flash(match.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', height: '100%' }}>
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
            aria-label="Scan or manually enter a returning serial"
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
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Scans against the dispatched set, not the original booking line</span>
      </div>
      {scanError && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
          <Icon name="error" size={14} />
          {scanError}
        </div>
      )}

      <button
        type="button"
        disabled={readOnly}
        onClick={() => onEvidenceOpenChange(true)}
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 44,
          padding: '0 14px',
          borderRadius: 'var(--r-btn)',
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text2)',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          cursor: readOnly ? 'not-allowed' : 'pointer',
          opacity: readOnly ? 0.5 : 1,
          fontFamily: 'inherit',
        }}
      >
        <Icon name="camera" size={14} />
        Inbound evidence
      </button>

      {outstanding.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>Outstanding ({outstanding.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {outstanding.map((it) => {
              const exp = expectedForReturn(it, corrections)
              const qtyValue = returnQty[it.id] ?? ''
              const parsedQty = Number(qtyValue)
              const qtyInvalid = qtyValue.trim() !== '' && (!Number.isInteger(parsedQty) || parsedQty < 0 || parsedQty > exp.qty)
              return (
                <div key={it.id} style={{ ...cardStyle, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{it.name}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      Expect: {it.trackingMode === 'serial' ? exp.serial : `${exp.qty} unit${exp.qty === 1 ? '' : 's'}`}
                      {exp.substituted && (
                        <span style={{ color: 'var(--progress-text)', fontWeight: 600 }}> · substituted at packing from {it.bookingSerial}, expecting the substitute — no reconciliation needed</span>
                      )}
                    </span>
                  </span>
                  {it.trackingMode === 'count' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <input
                        type="number"
                        min={0}
                        max={exp.qty}
                        step={1}
                        disabled={readOnly}
                        value={qtyValue}
                        onChange={(e) => setReturnQty((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        placeholder={String(exp.qty)}
                        aria-label={`Quantity returned for ${it.name} (of ${exp.qty} expected)`}
                        style={{
                          width: 64,
                          height: 44,
                          padding: '0 8px',
                          borderRadius: 'var(--r-input)',
                          border: `1px solid ${qtyInvalid ? 'var(--danger-text)' : 'var(--border)'}`,
                          background: 'var(--card2)',
                          color: 'var(--text)',
                          fontFamily: 'inherit',
                        }}
                      />
                      {qtyInvalid && <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>0–{exp.qty}</span>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {CONDITIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={readOnly || qtyInvalid}
                        onClick={() => receive(it.id, c)}
                        style={{
                          height: 44,
                          padding: '0 12px',
                          borderRadius: 'var(--r-btn)',
                          border: `1px solid ${c === 'Damaged' ? 'var(--danger-text)' : 'var(--border)'}`,
                          background: 'transparent',
                          color: c === 'Damaged' ? 'var(--danger-text)' : 'var(--text2)',
                          fontSize: 'var(--t-th)',
                          fontWeight: 600,
                          cursor: readOnly || qtyInvalid ? 'not-allowed' : 'pointer',
                          opacity: readOnly || qtyInvalid ? 0.5 : 1,
                          fontFamily: 'inherit',
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {settled.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>Checked in ({settled.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {settled.map((it) => (
              <div
                key={it.id}
                style={{
                  ...cardStyle,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: flashId === it.id ? (it.returnState === 'Damaged' ? 'var(--st-danger-bg)' : 'var(--st-in-bg)') : 'var(--card2)',
                  transition: 'background-color 0.5s ease',
                }}
              >
                <Icon
                  name={it.returnState === 'Damaged' || it.returnState === 'Missing' ? 'alert_triangle' : 'checklist'}
                  size={16}
                  style={{ color: it.returnState === 'Damaged' || it.returnState === 'Missing' ? 'var(--danger-text)' : 'var(--success-text)', flexShrink: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{it.name}</span>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {it.returnState} · {it.trackingMode === 'count' ? `${it.qtyReturned}/${it.qtyExpected} · ` : ''}
                    {it.returnCondition} · by {it.returnedBy}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <EvidencePanel direction="in" readOnly={readOnly} isOpen={evidenceOpen} onClose={() => onEvidenceOpenChange(false)} />
    </div>
  )
}
