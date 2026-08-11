import { useState } from 'react'
import Icon from '../../../../components/ui/Icon'
import { cardStyle } from '../../../../components/ui/Page'
import type { OperationItem } from '../../../../data/operationsShell'
import EvidencePanel from '../EvidencePanel'

/**
 * Handover — the client signs, packing locks (§5.2). Attempting to edit a
 * locked line afterward is refused; a correction entry is offered instead of
 * a silent rewrite. Acceptance criteria #4.
 *
 * Revised after an adversarial review pass: every write control here except
 * the signature itself was missing `disabled={readOnly}` — the single
 * biggest write-gate gap in the shell relative to §4.1's "write actions gate
 * on status." Also validates the correction quantity now (it advertised
 * `min={0}` on the input but never enforced it — a negative value silently
 * failed `effectiveDispatchedQty`'s regex and the correction looked
 * successful while being a no-op).
 */
export default function HandoverStep({
  items,
  readOnly,
  evidenceOpen,
  onEvidenceOpenChange,
  onSign,
  onAttemptEditLocked,
}: {
  items: OperationItem[]
  readOnly: boolean
  evidenceOpen: boolean
  onEvidenceOpenChange: (open: boolean) => void
  onSign: () => void
  onAttemptEditLocked: (itemId: string, newQty: number, reason: string) => void
}) {
  const [signerName, setSignerName] = useState('')
  const [correctingId, setCorrectingId] = useState<string | null>(null)
  const [correctionQty, setCorrectionQty] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  const packed = items.filter((i) => i.packState !== 'Pending')
  const locked = packed.some((i) => i.lockedAt)
  const canSign = packed.length > 0 && !locked

  const parsedQty = Number(correctionQty)
  const correctionQtyValid = correctionQty.trim() !== '' && Number.isInteger(parsedQty) && parsedQty >= 0
  const correctionValid = correctionQtyValid && correctionReason.trim().length >= 5
  const correctionError = correctionQty.trim() !== '' && !correctionQtyValid ? 'Enter a whole number, 0 or greater.' : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', height: '100%' }}>
      <section style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {locked ? 'Signed — packing is locked' : 'Client signature'}
        </h3>
        {locked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--success-text)' }}>
            <Icon name="checklist" size={16} />
            Handover signed. {packed.length} item{packed.length === 1 ? '' : 's'} are now read-only for Packing.
          </div>
        ) : (
          <>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Signer name"
              disabled={readOnly}
              style={{ height: 44, padding: '0 12px', borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontFamily: 'inherit', maxWidth: 320 }}
            />
            <button
              type="button"
              disabled={readOnly || !canSign || !signerName.trim()}
              onClick={onSign}
              style={{
                alignSelf: 'flex-start',
                height: 44,
                padding: '0 16px',
                borderRadius: 'var(--r-btn)',
                border: 'none',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                fontWeight: 700,
                fontSize: 'var(--t-meta)',
                cursor: readOnly || !canSign || !signerName.trim() ? 'not-allowed' : 'pointer',
                opacity: readOnly || !canSign || !signerName.trim() ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              Sign &amp; Lock Packing
            </button>
            {packed.length === 0 && <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Nothing packed yet — Packing must produce a dispatched set first.</p>}
          </>
        )}
      </section>

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
        Outbound evidence
      </button>

      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>Dispatched lines ({packed.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {packed.map((it) => (
            <div key={it.id} style={{ ...cardStyle, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{it.name}</span>
                  <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {it.trackingMode === 'serial' ? it.packedSerial : `${it.qtyPacked}/${it.qtyExpected}`}
                  </span>
                </span>
                {it.lockedAt ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-expanded={correctingId === it.id}
                    onClick={() => setCorrectingId(correctingId === it.id ? null : it.id)}
                    style={{
                      height: 44,
                      padding: '0 12px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-th)',
                      fontWeight: 600,
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                      opacity: readOnly ? 0.5 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    Edit (locked)
                  </button>
                ) : (
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Editable until signed</span>
                )}
              </div>
              {correctingId === it.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: '10px', borderRadius: 'var(--r-sm)', background: 'var(--st-neutral-bg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    <Icon name="info" size={13} />
                    This line is locked (§5.2) — a direct edit is refused. Submitting below appends a correction
                    entry instead; both the original and the correction stay in the audit trail.
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={readOnly}
                        value={correctionQty}
                        onChange={(e) => setCorrectionQty(e.target.value)}
                        placeholder="Corrected qty"
                        style={{ width: 120, height: 44, padding: '0 8px', borderRadius: 'var(--r-input)', border: `1px solid ${correctionError ? 'var(--danger-text)' : 'var(--border)'}`, background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
                      />
                      {correctionError && <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>{correctionError}</span>}
                    </div>
                    <input
                      disabled={readOnly}
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="Reason (required)"
                      style={{ flex: 1, minWidth: 160, height: 44, padding: '0 8px', borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                    <button
                      type="button"
                      disabled={readOnly || !correctionValid}
                      onClick={() => {
                        onAttemptEditLocked(it.id, parsedQty, correctionReason.trim())
                        setCorrectingId(null)
                        setCorrectionQty('')
                        setCorrectionReason('')
                      }}
                      style={{
                        height: 44,
                        padding: '0 14px',
                        borderRadius: 'var(--r-btn)',
                        border: 'none',
                        background: 'var(--danger)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 'var(--t-th)',
                        cursor: readOnly || !correctionValid ? 'not-allowed' : 'pointer',
                        opacity: readOnly || !correctionValid ? 0.5 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      Submit correction entry
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <EvidencePanel direction="out" readOnly={readOnly} isOpen={evidenceOpen} onClose={() => onEvidenceOpenChange(false)} />
    </div>
  )
}
