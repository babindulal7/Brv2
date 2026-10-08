import { useState, useRef, useEffect } from 'react'

export interface SerializedGearItem {
  id: string
  name: string
  serialNumber: string
  category: string
  scanned: boolean
  isKitComponent?: boolean
  parentKitName?: string
}

export interface RentalQuickActionDrawerProps {
  open: boolean
  onClose: () => void
  stage: 'booked' | 'packed' | 'on_rent' | 'returned' | 'closed'
  orderNumber: string
  clientName: string
  rentalWindow: string
  items: SerializedGearItem[]
  onToggleItemScanned: (itemId: string) => void
  onScanBarcode: (barcode: string) => boolean
  onConfirmOperation: (signatureData?: string) => Promise<void> | void
  isSubmitting?: boolean
  className?: string
}

/**
 * RentalQuickActionDrawer — Slide-over Operational Cockpit for Babin Rentals OS.
 * Powers Job: Pack, Job: Handover, Job: Return, and Job: Reset on the Boudha prep bench.
 * Strictly enforces Law 6 (Floor Blindness), Law 15 (Touch Targets), and Law 17 (Client Terminology).
 */
export function RentalQuickActionDrawer({
  open,
  onClose,
  stage,
  orderNumber,
  clientName,
  rentalWindow,
  items,
  onToggleItemScanned,
  onScanBarcode,
  onConfirmOperation,
  isSubmitting = false,
  className = '',
}: RentalQuickActionDrawerProps) {
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanMessage, setScanMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)

  // Configure operational verb based on active stage
  const stageConfig = {
    booked: {
      jobName: 'Job: Pack',
      primaryVerb: 'Complete Packing & Stage Kit',
      accentColor: '#4F46E5', // Indigo
      requiresSignature: false,
    },
    packed: {
      jobName: 'Job: Handover',
      primaryVerb: 'Confirm Handover & Release Gear',
      accentColor: '#F97316', // Orange
      requiresSignature: true,
    },
    on_rent: {
      jobName: 'Job: Return',
      primaryVerb: 'Receive Return & Quarantine for QC',
      accentColor: '#16A34A', // Green
      requiresSignature: true,
    },
    returned: {
      jobName: 'Job: Reset & Inspect',
      primaryVerb: 'Clear QC & Return to Fleet',
      accentColor: '#D97706', // Amber
      requiresSignature: false,
    },
    closed: {
      jobName: 'Order Closed',
      primaryVerb: 'View Final Reconciled Record',
      accentColor: '#64748B',
      requiresSignature: false,
    },
  }[stage]

  // Signature canvas setup
  useEffect(() => {
    if (!open || !stageConfig.requiresSignature) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = '#0F172A'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [open, stageConfig.requiresSignature])

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const touch = 'touches' in e && e.touches.length > 0 ? e.touches[0] : null
    const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0)
    const clientY = touch ? touch.clientY : ('clientY' in e ? e.clientY : 0)

    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
    isDrawingRef.current = true
    setHasSignature(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const touch = 'touches' in e && e.touches.length > 0 ? e.touches[0] : null
    const clientX = touch ? touch.clientX : ('clientX' in e ? e.clientX : 0)
    const clientY = touch ? touch.clientY : ('clientY' in e ? e.clientY : 0)

    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    isDrawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  // Handle Barcode Submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcodeInput.trim()) return

    const success = onScanBarcode(barcodeInput.trim())
    if (success) {
      setScanMessage({ text: `Matched: ${barcodeInput.trim()}` })
      setBarcodeInput('')
    } else {
      setScanMessage({ text: `Barcode not found on this booking: ${barcodeInput.trim()}`, error: true })
    }
  }

  // Handle final submission
  const handleFinalConfirm = () => {
    let signatureData: string | undefined
    if (stageConfig.requiresSignature && canvasRef.current && hasSignature) {
      signatureData = canvasRef.current.toDataURL('image/png')
    }
    onConfirmOperation(signatureData)
  }

  const totalItems = items.length
  const scannedItemsCount = items.filter((i) => i.scanned).length
  const allVerified = totalItems > 0 && scannedItemsCount === totalItems

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`rental-quick-action-drawer-overlay ${className}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Slide-over Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 91,
          width: '480px',
          maxWidth: '100vw',
          height: '100%',
          background: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-6px 0 25px rgba(0,0,0,0.15)',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: stageConfig.accentColor,
                  background: 'rgba(255,255,255,0.8)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${stageConfig.accentColor}33`,
                }}
              >
                {stageConfig.jobName}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                Order #{orderNumber}
              </span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B' }}>
              Client: {clientName}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Window: {rentalWindow}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close action drawer"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '18px',
              color: '#64748B',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body: Item Manifest & Checklist */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Progress Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '6px',
              background: allVerified ? '#F0FDF4' : '#F1F5F9',
              border: allVerified ? '1px solid #86EFAC' : '1px solid #CBD5E1',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: allVerified ? '#166534' : '#334155' }}>
              Gear Verification Checklist
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {scannedItemsCount} / {totalItems} verified
            </span>
          </div>

          {/* Barcode Scanner Input Dock */}
          <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan barcode or type serial..."
              style={{
                flex: 1,
                minHeight: '40px',
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              style={{
                minHeight: '40px',
                padding: '0 14px',
                borderRadius: '6px',
                border: 'none',
                background: '#0F172A',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Verify
            </button>
          </form>

          {scanMessage && (
            <div
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: scanMessage.error ? '#DC2626' : '#16A34A',
              }}
            >
              {scanMessage.text}
            </div>
          )}

          {/* Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map((item) => (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minHeight: '44px', // Law 15 minimum touch target
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: item.scanned ? '#F0FDF4' : '#FFFFFF',
                  border: item.scanned ? '1px solid #86EFAC' : '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.scanned}
                  onChange={() => onToggleItemScanned(item.id)}
                  style={{ width: '18px', height: '18px', accentColor: '#16A34A' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                    {item.name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        background: '#E2E8F0',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        color: '#475569',
                      }}
                    >
                      SN: {item.serialNumber}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>{item.category}</span>
                  </div>
                </div>
                {item.scanned && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A' }}>
                    ✓ Checked
                  </span>
                )}
              </label>
            ))}
          </div>

          {/* Digital Signature on Glass (Required for Handover & Return) */}
          {stageConfig.requiresSignature && (
            <div style={{ marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                  Client Digital Signature (Law 17)
                </span>
                {hasSignature && (
                  <button
                    type="button"
                    onClick={clearSignature}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#DC2626',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div
                style={{
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  background: '#FFFFFF',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={440}
                  height={120}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ width: '100%', height: '120px', display: 'block', touchAction: 'none' }}
                />
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                Client signs to acknowledge physical custody and kit integrity.
              </div>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            gap: '12px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: '44px', // Law 15 minimum touch target
              padding: '0 16px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSubmitting || (stageConfig.requiresSignature && !hasSignature)}
            onClick={handleFinalConfirm}
            style={{
              flex: 1,
              minHeight: '44px', // Law 15 minimum touch target
              padding: '0 16px',
              borderRadius: '6px',
              border: 'none',
              background:
                isSubmitting || (stageConfig.requiresSignature && !hasSignature)
                  ? '#94A3B8'
                  : stageConfig.accentColor,
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor:
                isSubmitting || (stageConfig.requiresSignature && !hasSignature)
                  ? 'not-allowed'
                  : 'pointer',
              transition: 'background 150ms ease',
            }}
          >
            {isSubmitting ? 'Recording Operational Job...' : stageConfig.primaryVerb}
          </button>
        </div>
      </div>
    </div>
  )
}
export default RentalQuickActionDrawer
