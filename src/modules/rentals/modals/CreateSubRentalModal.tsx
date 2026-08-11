import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents } from '../../../events/eventBus'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

interface CreateSubRentalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (subRental: {
    vendor: string
    itemName: string
    vendorCostPaisa: Paisa
    clientChargePaisa: Paisa
    marginPaisa: Paisa
  }) => void
  bookingId: string
}

export function CreateSubRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
}: CreateSubRentalModalProps) {
  const [vendor, setVendor] = useState('Cine Gear Nepal')
  const [itemName, setItemName] = useState('ARRI Alexa Mini Body')
  const [vendorCost, setVendorCost] = useState<number>(35000)
  const [clientCharge, setClientCharge] = useState<number>(45000)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const margin = clientCharge - vendorCost

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!itemName.trim() || !vendor.trim()) {
      setError('Vendor and Item Name are required.')
      return
    }
    if (vendorCost <= 0 || clientCharge <= 0) {
      setError('Cost and charge amounts must be greater than 0.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const subRentalData = {
        vendor: vendor.trim(),
        itemName: itemName.trim(),
        vendorCostPaisa: rupees(vendorCost),
        clientChargePaisa: rupees(clientCharge),
        marginPaisa: rupees(margin),
      }

      await DomainEvents.emit('subrental.created', {
        bookingId,
        ...subRentalData,
        timestamp: new Date().toISOString(),
      })

      onSuccess(subRentalData)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create sub-rental')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Create External Sub-Rental — ${bookingId}`}
      subtitle="Source unstocked gear from external rental partners."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Sub-Rental'}
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
              External Vendor <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Cine Gear Nepal"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
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
              Equipment Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. ARRI Alexa Mini"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
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
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Vendor Sub-Rental Cost (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={vendorCost}
              onChange={(e) => setVendorCost(Number(e.target.value))}
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
              Client Charge Price (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={clientCharge}
              onChange={(e) => setClientCharge(Number(e.target.value))}
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
            <span>Vendor Cost:</span>
            <span>{formatMoney(rupees(vendorCost))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Client Charge:</span>
            <span>{formatMoney(rupees(clientCharge))}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px solid var(--border)',
              fontWeight: 700,
            }}
          >
            <span>Sub-Rental Net Margin:</span>
            <span style={{ color: margin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatMoney(rupees(margin))}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
