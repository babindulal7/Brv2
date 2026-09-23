import { useState } from 'react'
import Icon from '../../../components/ui/Icon'

/**
 * Evidence — a slide-over *inside* the shell, never a nested modal (§3: "No
 * nested modals... opens as a slide-over panel inside the shell") and never a
 * sixth tab (§7: "Evidence is a panel inside each step... always *of* a
 * packing or *of* a return"). `direction` is required, not inferred from a
 * checkbox — §7 is explicit that without it, out/in condition photos sit in
 * one undifferentiated bucket.
 *
 * Escape is handled by the caller: `evidenceOpen` is lifted to
 * `OperationsShell`, whose window-level key handler checks it before closing
 * the whole shell, so Escape here closes only this panel — not re-implemented
 * locally to avoid two competing handlers racing on the same keypress.
 */
export default function EvidencePanel({
  direction,
  readOnly,
  isOpen,
  onClose,
}: {
  direction: 'out' | 'in'
  readOnly: boolean
  isOpen: boolean
  onClose: () => void
}) {
  const [photos, setPhotos] = useState<Array<{ id: string; kind: string }>>([])

  if (!isOpen) return null

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.4)' }} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence — ${direction === 'out' ? 'outbound' : 'inbound'}`}
        style={{
          position: 'relative',
          width: 'min(360px, 92%)',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <Icon name="photo" size={16} style={{ color: 'var(--text2)' }} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
            Evidence · {direction === 'out' ? 'Outbound (packing)' : 'Inbound (return)'}
          </span>
          <button type="button" onClick={onClose} aria-label="Close evidence panel" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', width: 44, height: 44, marginRight: -8, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Every photo here carries <code>direction: '{direction}'</code> — kept separate from the other
            direction's evidence for the same item, so a scratch that appears mid-rental is provable.
          </p>

          <button
            type="button"
            disabled={readOnly}
            onClick={() => setPhotos((prev) => [...prev, { id: `ph-${prev.length + 1}`, kind: 'condition' }])}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '22px 10px',
              borderRadius: 10,
              border: '1.5px dashed var(--border)',
              background: 'var(--card2)',
              color: 'var(--text2)',
              cursor: readOnly ? 'not-allowed' : 'pointer',
              opacity: readOnly ? 0.5 : 1,
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
            }}
          >
            <Icon name="camera" size={20} style={{ color: 'var(--muted)' }} />
            Add a condition photo
          </button>

          {photos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'center' }}>No photos yet for this direction.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-sm)' }}>
              {photos.map((p) => (
                <div key={p.id} style={{ aspectRatio: '1', borderRadius: 'var(--r-sm)', background: 'var(--card2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                  <Icon name="photo" size={18} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
