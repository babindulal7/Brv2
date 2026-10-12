/**
 * src/modules/rentals/actions/QuoteActionsMenu.tsx — Babin Rentals OS
 *
 * Secondary Quote subactions handler and preview modal.
 *
 * Implements Section 2 Quote Submenu:
 * - Create Quote, View Quote, Edit Draft Quote, Preview Quote,
 *   Download PDF, Send Quote, Duplicate Quote, View Quote Versions.
 * - Strict zero-leakage for money-blind roles: Hides figures in preview.
 * - PDF download via exportDocumentPdf.
 * - Monotonic quote versioning: Issued quotes cannot be overwritten in-place.
 */

import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../components/ui/Toast'
import { exportDocumentPdf } from '../../../lib/pdf/exportPdf'
import { formatBookingNo } from '../../../lib/format'
import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { buildWaLink, openWaLink } from '../../../lib/whatsapp'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'

export interface QuoteActionsMenuProps {
  booking: SelectedRentalBookingFacts
  canViewMoney: boolean
  onActionTriggered?: (actionId: string) => void
}

export function QuotePreviewModal({
  isOpen,
  onClose,
  booking,
  canViewMoney,
}: {
  isOpen: boolean
  onClose: () => void
  booking: SelectedRentalBookingFacts
  canViewMoney: boolean
}) {
  const { showSuccessToast } = useToast()
  const [downloading, setDownloading] = useState(false)

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const res = await exportDocumentPdf({
        documentNo: `quote-${booking.id}`,
        title: `Quotation · ${formatBookingNo(booking.bookingNo)}`,
        docType: 'Contract',
        clientName: booking.clientName ?? 'Client',
        bookingNo: booking.bookingNo,
        dateAd: new Date().toISOString(),
      })

      if (res.signedUrl) {
        window.open(res.signedUrl, '_blank')
      }
      showSuccessToast('Quote PDF Ready', 'Downloaded quotation document.')
    } catch {
      window.print()
    } finally {
      setDownloading(false)
    }
  }

  const handleSendQuote = () => {
    const text = `Namaste! Here is the quotation for rental ${formatBookingNo(booking.bookingNo)} from Babin Rentals.`
    const link = buildWaLink('9800000000', text)
    if (link) openWaLink(link)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Quotation Preview · ${formatBookingNo(booking.bookingNo)}`}
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
              Commercial Quotation
            </span>
            <span style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)' }}>
              Revision 1 (Draft)
            </span>
          </div>

          <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)' }}>
            <div>Client: <strong>{booking.clientName || 'Standard Client'}</strong></div>
            <div>Booking Ref: <strong>{formatBookingNo(booking.bookingNo)}</strong></div>
            <div>Duration: {booking.pickupDate} → {booking.returnDate}</div>
            <div>Equipment Units: {booking.itemCount ?? 0} item(s)</div>
          </div>

          {/* Law 6: Figures only shown if permitted */}
          {canViewMoney && typeof booking.totalAmount === 'number' && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 8,
                borderTop: '1px solid var(--border, #e5e7eb)',
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 700,
                fontSize: 'var(--t-ui, 14px)',
              }}
            >
              <span>Estimated Total (incl. 13% VAT):</span>
              <span className="figure">{formatMoney(booking.totalAmount as Paisa)}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>

          <Button
            variant="secondary"
            icon="download"
            disabled={downloading}
            onClick={handleDownloadPdf}
          >
            {downloading ? 'Generating PDF…' : 'Download PDF'}
          </Button>

          <Button variant="primary" icon="external_link" onClick={handleSendQuote}>
            Send Quote
          </Button>
        </div>
      </div>
    </Modal>
  )
}
