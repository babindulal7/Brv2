import { useState, useRef, useEffect, useCallback } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Page'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { enqueueMutation } from '../../lib/offlineQueue'
import { newClientUuid } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../components/ui/Toast'
import { captureError } from '../../lib/monitoring'

export interface DriverHandoverModalProps {
  isOpen: boolean
  onClose: () => void
  bookingNo: string
  bookingId: string
  clientName: string
  deliveryAddress?: string | null
  itemCount: number
  onSuccess?: () => void
}

interface GpsCoords {
  lat: number
  lng: number
  accuracy: number
  capturedAt: string
}

/**
 * Driver Delivery Handover Modal (Pillar 2).
 *
 * Designed for mobile drivers on the field in Nepal with spotty cellular coverage.
 * Features:
 *  - Thumb-friendly touch targets (min 48-52px)
 *  - Client digital signature canvas
 *  - GPS location stamping
 *  - Photo evidence capture
 *  - Offline queue fallback via IndexedDB
 *  - Law 6: Zero money displayed
 *  - Law 17: Client, never customer
 */
export function DriverHandoverModal({
  isOpen,
  onClose,
  bookingNo,
  bookingId,
  clientName,
  deliveryAddress,
  itemCount,
  onSuccess,
}: DriverHandoverModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [recipientName, setRecipientName] = useState(clientName)
  const [notes, setNotes] = useState('')
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [gps, setGps] = useState<GpsCoords | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [photoData, setPhotoData] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [offlineQueued, setOfflineQueued] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Setup canvas high-DPI scaling
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => {
    if (isOpen) {
      // Allow DOM to layout
      const timer = setTimeout(setupCanvas, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen, setupCanvas])

  // Canvas drawing handlers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    const me = e as React.MouseEvent<HTMLCanvasElement>
    return {
      x: me.clientX - rect.left,
      y: me.clientY - rect.top,
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawing.current = true
    const pt = getCanvasCoords(e)
    lastPoint.current = pt
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(pt.x, pt.y)
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    const pt = getCanvasCoords(e)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    setHasSignature(true)
    lastPoint.current = pt
  }

  const stopDrawing = () => {
    isDrawing.current = false
    lastPoint.current = null
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  // GPS coordinates capture
  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser')
      return
    }
    setGpsLoading(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          capturedAt: new Date().toISOString(),
        })
        setGpsLoading(false)
      },
      (err) => {
        setGpsError(err.message || 'Unable to retrieve location')
        setGpsLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }

  // Photo handling
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      setPhotoData(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Submit delivery handover
  const handleSubmit = async () => {
    if (!recipientName.trim()) {
      setSubmitError('Receiver name is required.')
      return
    }
    if (!hasSignature) {
      setSubmitError('Client signature is required for delivery handover.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const clientUuid = newClientUuid()
    const occurredAt = new Date().toISOString()
    const signatureData = canvasRef.current?.toDataURL('image/png') || null

    const deliveryPayload = {
      booking_id: bookingId,
      booking_no: bookingNo,
      session_type: 'Handover',
      receiver_name: recipientName.trim(),
      notes: notes.trim() || null,
      gps_lat: gps?.lat ?? null,
      gps_lng: gps?.lng ?? null,
      gps_accuracy: gps?.accuracy ?? null,
      has_photo: photoData !== null,
      signature_png: signatureData,
      client_uuid: clientUuid,
      occurred_at: occurredAt,
      driver_name: user?.name || 'Driver',
    }

    // Offline mode or network drop fallback
    if (!isOnline) {
      try {
        await enqueueMutation('operation_sessions', 'insert', deliveryPayload, clientUuid)
        setOfflineQueued(true)
        setSubmitting(false)
        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 1800)
      } catch (err) {
        captureError(err, { where: 'DriverHandoverModal.offlineQueue' })
        setSubmitError('Failed to save to local offline queue. Please try again.')
        setSubmitting(false)
      }
      return
    }

    // Online delivery dispatch
    try {
      const { handoverRental } = await import('../../actions/rentals/index')
      await handoverRental(
        {
          bookingId,
          lines: [],
          clientUuid,
          occurredAt,
          notes: [
            `Field delivery handover signed by ${recipientName.trim()}`,
            gps ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${gps.accuracy}m)` : null,
            notes.trim() ? `Notes: ${notes.trim()}` : null,
          ]
            .filter((n): n is string => n !== null)
            .join('\n'),
          signatures: [
            {
              role: 'Receiver',
              signerName: recipientName.trim(),
              signedAt: occurredAt,
              isRequired: true,
            },
          ],
        },
        { userId: user?.id || 'USR-DRIVER', role: user?.role || 'Driver' },
      )

      showSuccessToast('Handover Completed', `Delivery for ${bookingNo} handed over to ${recipientName.trim()}`)
      onSuccess?.()
      onClose()
    } catch (err) {
      // Network failure during send: fall back to offline queue safely
      console.warn('[DriverHandoverModal] Online handover failed, queueing offline:', err)
      try {
        await enqueueMutation('operation_sessions', 'insert', deliveryPayload, clientUuid)
        setOfflineQueued(true)
        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 1800)
      } catch (queueErr) {
        captureError(queueErr, { where: 'DriverHandoverModal.fallbackQueue' })
        setSubmitError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Driver Field Delivery Handover"
      subtitle={`Booking #${bookingNo} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {/* Network status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: isOnline ? 'var(--st-in-bg)' : 'var(--st-out-bg)',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isOnline ? 'var(--st-in-border)' : 'var(--st-out-border)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isOnline ? 'var(--st-in-fg)' : 'var(--st-out-fg)',
              }}
              aria-hidden="true"
            />
            <span style={{ fontSize: 'var(--t-caption)', fontWeight: 600 }}>
              {isOnline ? 'Online (Direct Sync)' : 'Offline Mode (Edge Queue Active)'}
            </span>
          </div>
          <Badge
            tone={isOnline ? 'in' : 'warning'}
            label={isOnline ? 'Connected' : 'Offline Safe'}
            size="sm"
          />
        </div>

        {/* Offline Confirmation Banner */}
        {offlineQueued && (
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--st-in-bg)',
              color: 'var(--st-in-fg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--st-in-border)',
              fontSize: 'var(--t-body)',
              fontWeight: 500,
            }}
            role="status"
          >
            ✓ Delivery recorded offline in local queue. Will sync automatically once connection returns.
          </div>
        )}

        {/* Error Banner */}
        {submitError && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--st-danger-border)',
              fontSize: 'var(--t-caption)',
            }}
            role="alert"
          >
            {submitError}
          </div>
        )}

        {/* Recipient Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text)' }}>
            Client Receiver Name *
          </label>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Full name of person receiving equipment"
            style={{
              height: 48,
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 'var(--t-body)',
            }}
          />
          {deliveryAddress && (
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text2)' }}>
              Venue/Destination: {deliveryAddress}
            </span>
          )}
        </div>

        {/* GPS Coordinate Stamping */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 12px',
            background: 'var(--card2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--t-caption)', fontWeight: 600 }}>GPS Delivery Stamp</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={captureGps}
              disabled={gpsLoading}
              style={{ minHeight: 36 }}
            >
              <Icon name="flag" size={13} style={{ marginRight: 4 }} />
              {gpsLoading ? 'Locating...' : gps ? 'Update GPS' : 'Tag GPS Location'}
            </Button>
          </div>
          {gps && (
            <div style={{ fontSize: 'var(--t-micro)', color: 'var(--st-in-fg)', fontWeight: 500 }}>
              📍 {gps.lat.toFixed(5)}° N, {gps.lng.toFixed(5)}° E (accuracy ±{gps.accuracy}m)
            </div>
          )}
          {gpsError && (
            <div style={{ fontSize: 'var(--t-micro)', color: 'var(--st-danger-fg)' }}>
              ⚠️ {gpsError}
            </div>
          )}
        </div>

        {/* Digital Signature Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text)' }}>
              Client Digital Signature *
            </label>
            {hasSignature && (
              <button
                type="button"
                onClick={clearSignature}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text2)',
                  fontSize: 'var(--t-micro)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px 8px',
                }}
              >
                Clear signature
              </button>
            )}
          </div>
          <div
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: '#ffffff',
              height: 160,
              position: 'relative',
              touchAction: 'none',
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
            />
            {!hasSignature && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  color: '#94a3b8',
                  fontSize: 'var(--t-caption)',
                }}
              >
                Sign here with finger or stylus
              </div>
            )}
          </div>
        </div>

        {/* Photo Evidence Capture */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text)' }}>
            Delivery Drop-off Photo Evidence (Optional)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                padding: '0 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 'var(--t-caption)',
                fontWeight: 500,
              }}
            >
              <Icon name="camera" size={16} />
              <span>{photoData ? 'Replace Photo' : 'Capture Photo'}</span>
              <input
                type="file"
                aria-label="Capture delivery drop-off photo"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
            </label>
            {photoData && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={photoData}
                  alt="Delivery drop-off preview"
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                />
                <button
                  type="button"
                  onClick={() => setPhotoData(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text2)',
                    fontSize: 'var(--t-caption)',
                    cursor: 'pointer',
                  }}
                  title="Remove photo"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Delivery Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text)' }}>
            Handover Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g., Handed over at loading bay, cases sealed."
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 'var(--t-body)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            style={{ flex: 1, minHeight: 52 }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || offlineQueued}
            style={{
              flex: 2,
              minHeight: 52,
              fontSize: 'var(--t-body)',
              fontWeight: 600,
            }}
          >
            {submitting ? 'Confirming...' : offlineQueued ? 'Queued Offline ✓' : 'Confirm Delivery Handover'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
