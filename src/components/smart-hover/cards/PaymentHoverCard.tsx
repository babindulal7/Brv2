import { formatMoney } from '../../../lib/money'
import { formatAdDateTime } from '../../../lib/bs'
import type { PaymentPreview } from '../previewTypes'
import { Badge } from '../../ui/Badge'
import Icon from '../../ui/Icon'
import { paymentStatusTone } from '../../../lib/status'

export function PaymentHoverCard({ preview, onFollow }: { preview: PaymentPreview; onFollow: (path: string) => void }) {
  return <div style={{ display: 'grid', gap: 10, padding: '12px 4px' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <strong className="identifier">{preview.paymentNo}</strong>
      <Badge label={preview.status} tone={paymentStatusTone(preview.status)} size="sm" icon={<Icon name={preview.status === 'Received' ? 'check' : 'alert_triangle'} size={14} />} />
    </div>
    <div className="figure" style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(preview.amountPaisa)}</div>
    <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
      <Row label="Type" value={preview.type} />
      {preview.method ? <Row label="Method" value={preview.method} /> : null}
      <Row label="Received" value={formatAdDateTime(preview.paidAt)} />
      {preview.reference ? <Row label="Reference" value={preview.reference} /> : null}
    </dl>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <LinkButton label={`Rental ${preview.bookingNo}`} onClick={() => onFollow(`/rentals/${encodeURIComponent(preview.bookingNo)}`)} />
      <LinkButton label={preview.clientName} onClick={() => onFollow(`/clients/${encodeURIComponent(preview.clientId)}`)} />
    </div>
    <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>Corrections are separate reversal records in the ledger.</p>
  </div>
}

function Row({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><dt style={{ color: 'var(--muted)' }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>
}

function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ minHeight: 'var(--tap)', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--link)', padding: '6px 10px', cursor: 'pointer' }}>{label} ›</button>
}
