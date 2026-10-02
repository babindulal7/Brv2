import Icon from '../../ui/Icon'
import { Badge } from '../../ui/Badge'
import type { DocumentPreview } from '../previewTypes'

/** A registry document is its own record. Invoice ledger details stay in the
 * separate invoice preview and are never inferred from a document number. */
export function RegistryDocumentHoverCard({ preview, onFollow }: {
  preview: DocumentPreview
  onFollow: (path: string) => void
}) {
  return <div style={{ display: 'grid', gap: 12, padding: '12px 4px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <strong className="identifier">{preview.documentNo}</strong>
      <Badge label={preview.status} tone="neutral" size="sm" icon={<Icon name="file" size={14} />} />
    </div>
    <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
      <Row label="Document" value={preview.type} />
      <Row label="Created" value={preview.createdAt} />
      {preview.signedAt ? <Row label="Signed" value={preview.signedAt} /> : null}
    </dl>
    {preview.bookingRef ? <button
      type="button"
      onClick={() => onFollow(`/rentals/${encodeURIComponent(preview.bookingRef!)}`)}
      style={{ minHeight: 'var(--tap)', justifySelf: 'start', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--link)', padding: '6px 10px', cursor: 'pointer' }}
    >Open linked rental ›</button> : null}
  </div>
}

function Row({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><dt style={{ color: 'var(--muted)' }}>{label}</dt><dd style={{ margin: 0, textAlign: 'right' }}>{value}</dd></div>
}
