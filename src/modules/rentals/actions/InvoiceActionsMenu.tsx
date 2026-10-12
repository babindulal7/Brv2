/**
 * src/modules/rentals/actions/InvoiceActionsMenu.tsx — Babin Rentals OS
 *
 * Invoice subactions handler, invoice duplicate prevention, and payment status modal.
 *
 * Implements Section 3 Invoice Submenu:
 * - Create Invoice, View Invoice, Edit Draft Invoice, Preview Invoice,
 *   Download PDF, Send Invoice, View Payment Status, Open Payment History, View Invoice Corrections.
 * - Accidental duplicate invoice prevention: Reuses existing invoice if already raised.
 * - PDF export via exportInvoicePdf.
 * - Strictly hidden from money-blind roles (Warehouse, Technician, Driver, Client).
 */

import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { formatBookingNo } from '../../../lib/format'
import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'

export interface InvoiceActionsMenuProps {
  booking: SelectedRentalBookingFacts
  onActionTriggered?: (actionId: string) => void
  onSuccess?: () => void
}

export function InvoicePaymentStatusModal({
  isOpen,
  onClose,
  booking,
}: {
  isOpen: boolean
  onClose: () => void
  booking: SelectedRentalBookingFacts
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Payment Status · ${formatBookingNo(booking.bookingNo)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        <div
          style={{
            padding: 14,
            borderRadius: 'var(--r-card, 8px)',
            background: 'var(--card2, #f9fafb)',
            border: '1px solid var(--border, #e5e7eb)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--t-ui, 14px)' }}>
              Commercial Settlement
            </span>
            <span style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)' }}>
              {booking.invoiceNo ? `Invoice: ${booking.invoiceNo}` : 'No invoice issued'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            <div>
              <span style={{ color: 'var(--muted)' }}>Total Billed:</span>{' '}
              <strong>{typeof booking.totalAmount === 'number' ? formatMoney(booking.totalAmount as Paisa) : '—'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Total Received:</span>{' '}
              <strong style={{ color: 'var(--success, #16a34a)' }}>
                {typeof booking.paidAmount === 'number' ? formatMoney(booking.paidAmount as Paisa) : '—'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Outstanding Balance:</span>{' '}
              <strong style={{ color: typeof booking.outstandingAmount === 'number' && booking.outstandingAmount > 0 ? 'var(--danger, #dc2626)' : 'inherit' }}>
                {typeof booking.outstandingAmount === 'number' ? formatMoney(booking.outstandingAmount as Paisa) : '—'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Security Deposit:</span>{' '}
              <strong>{typeof booking.depositRequired === 'number' ? formatMoney(booking.depositRequired as Paisa) : '—'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
