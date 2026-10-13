/**
 * DocumentHoverCard — §54 invoice/quote/contract summary + recent payments.
 * Payment preview rows reuse the shared transaction row (§43).
 */

import { formatMoney } from '../../../lib/money'
import { sortTxNewestFirst } from '../../../lib/smartHover'
import { ClearanceBlock, PaymentTransactionRow } from '../shared'
import type { InvoicePreview } from '../previewTypes'

export function DocumentHoverCard({ preview, canViewFinance }: { preview: InvoicePreview; canViewFinance: boolean }) {
  return (
    <div>
      <div id="smart-hover-title" style={{ padding: '14px 14px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span className="identifier" style={{ fontWeight: 800, fontSize: 15 }}>{preview.invoiceNo}</span>
          {preview.state ? <span style={{ fontSize: 12, fontWeight: 800 }}>{preview.state}</span> : null}
        </div>
        <div style={{ fontSize: 13 }}>{preview.clientName}</div>
        {preview.rentalNo ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>#{preview.rentalNo} · {preview.invoiceDate} → due {preview.dueDate}</div> : null}
      </div>
      <div role="tabpanel" style={{ display: 'grid', gap: 10 }}>
        {canViewFinance && preview.totalPaisa !== undefined ? (
          <div style={{ fontSize: 13 }}>
            {preview.subtotalPaisa !== undefined ? <Row label="Subtotal" paisa={preview.subtotalPaisa} /> : null}
            {preview.vatPaisa !== undefined ? <Row label="VAT" paisa={preview.vatPaisa} /> : null}
            <Row label="Total" paisa={preview.totalPaisa} strong />
            {preview.paidPaisa !== undefined ? <Row label="Paid" paisa={preview.paidPaisa} /> : null}
            {preview.duePaisa !== undefined ? <Row label="Due" paisa={preview.duePaisa} strong /> : null}
          </div>
        ) : (
          <ClearanceBlock paymentClear={preview.handoverClear ?? null} depositClear={null} />
        )}
        {canViewFinance ? <section aria-label="Recent payments">
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', margin: '0 0 4px' }}>RECENT</h4>
          <ul style={{ margin: 0, padding: 0 }}>
            {sortTxNewestFirst(preview.recent).map((t) => <PaymentTransactionRow key={t.id} t={t} />)}
            {preview.recent.length === 0 ? <li style={{ listStyle: 'none', fontSize: 13, color: 'var(--muted)' }}>No payments recorded.</li> : null}
          </ul>
        </section> : null}
      </div>
    </div>
  )
}

function Row({ label, paisa, strong = false }: { label: string; paisa: number; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: strong ? 700 : 400 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="figure" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(paisa as never)}</span>
    </div>
  )
}
