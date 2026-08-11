import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

interface LineItem {
  id: string
  desc: string
  amount: number
}

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (invoice: {
    id: string
    client: string
    booking: string
    amount: string
    due: string
    status: 'Sent' | 'Draft'
    lines: Array<{ desc: string; amountPaisa: Paisa }>
    vatPaisa: Paisa
  }) => void
}

export function CreateInvoiceModal({ isOpen, onClose, onSuccess }: CreateInvoiceModalProps) {
  const [client, setClient] = useState('')
  const [booking, setBooking] = useState('BK-2026-0720')
  const [dueDate, setDueDate] = useState('15 Aug 2026')
  const [includeVat, setIncludeVat] = useState(true)
  const [status, setStatus] = useState<'Sent' | 'Draft'>('Sent')
  const [lines, setLines] = useState<LineItem[]>([
    { id: '1', desc: 'Camera Package Rental', amount: 150000 },
    { id: '2', desc: 'Grip & Lighting Gear', amount: 35000 },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddLine = () => {
    setLines([...lines, { id: Date.now().toString(), desc: '', amount: 0 }])
  }

  const handleRemoveLine = (id: string) => {
    if (lines.length === 1) return
    setLines(lines.filter((l) => l.id !== id))
  }

  const handleLineChange = (id: string, field: 'desc' | 'amount', val: any) => {
    setLines(
      lines.map((l) => (l.id === id ? { ...l, [field]: field === 'amount' ? Number(val) : val } : l)),
    )
  }

  const taxableSubtotal = lines.reduce((sum, l) => sum + (l.amount || 0), 0)
  const vatAmount = includeVat ? Math.round(taxableSubtotal * 0.13) : 0
  const grandTotal = taxableSubtotal + vatAmount

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!client.trim()) {
      setError('Client name is required.')
      return
    }
    if (grandTotal <= 0) {
      setError('Invoice total must be greater than 0.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const generatedId = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`

      const createdInvoice = {
        id: generatedId,
        client: client.trim(),
        booking: booking.trim(),
        amount: `Rs ${grandTotal.toLocaleString('en-IN')}`,
        due: status === 'Draft' ? '—' : dueDate,
        status,
        lines: lines.map((l) => ({ desc: l.desc || 'Line item', amountPaisa: rupees(l.amount) })),
        vatPaisa: rupees(vatAmount),
      }

      // Emit domain event
      await DomainEvents.emit(EVENT_TYPES.INVOICE_CREATED, {
        ...createdInvoice,
        timestamp: new Date().toISOString(),
      })

      onSuccess(createdInvoice)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Invoice"
      subtitle="Generate an official VAT/PAN invoice for a booking."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Issue Invoice'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--danger-bg, #fee2e2)',
              color: 'var(--danger-text, #991b1b)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Client Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Manaslu Motion Pictures Pvt. Ltd."
              value={client}
              onChange={(e) => setClient(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Associated Booking Ref
            </label>
            <input
              type="text"
              value={booking}
              onChange={(e) => setBooking(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Due Date</label>
            <input
              type="text"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Initial Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            >
              <option value="Sent">Sent</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              Line Items Breakdown
            </label>
            <button
              type="button"
              onClick={handleAddLine}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--nav-active-accent)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Item
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={line.id} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
              <input
                type="text"
                placeholder={`Item #${idx + 1} Description`}
                value={line.desc}
                onChange={(e) => handleLineChange(line.id, 'desc', e.target.value)}
                style={{
                  flex: 1,
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                }}
              />
              <input
                type="number"
                min={0}
                placeholder="Amount (Rs)"
                value={line.amount || ''}
                onChange={(e) => handleLineChange(line.id, 'amount', e.target.value)}
                style={{
                  width: 130,
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                }}
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveLine(line.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 'var(--t-meta)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Pre-VAT Subtotal:</span>
            <span style={{ fontWeight: 600 }}>{formatMoney(rupees(taxableSubtotal))}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeVat}
                onChange={(e) => setIncludeVat(e.target.checked)}
              />
              Include 13% IRD VAT
            </label>
            <span style={{ color: 'var(--muted)' }}>{formatMoney(rupees(vatAmount))}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px solid var(--border)',
              fontWeight: 700,
              fontSize: 'var(--t-body)',
            }}
          >
            <span>Grand Total:</span>
            <span style={{ color: 'var(--nav-active-accent)' }}>{formatMoney(rupees(grandTotal))}</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
