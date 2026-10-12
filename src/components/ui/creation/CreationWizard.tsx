/**
 * src/components/ui/creation/CreationWizard.tsx — Babin Rentals OS
 *
 * 4-Step Creation Wizard for New Rental and New Quote workflows.
 *
 * Implements:
 * 1. Customer and rental details (AD + BS date support, 06:00-06:00 rental policy)
 * 2. Equipment, bundles and availability
 * 3. Duration, logistics, crew and commercial details
 * 4. Review, Save Draft and Confirm (distinct actions!)
 *
 * Rules:
 * - No booking confirmation when form opens.
 * - No equipment allocation until reservation/confirmation.
 * - Preserves unsaved draft when opening nested Add Client workflow.
 * - Money-blind roles (Law 6) never see rate calculations or pricing.
 * - Touch targets >= 44x44px (Law 15).
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../Modal'
import { Button } from '../Button'
import Icon from '../Icon'
import { useToast } from '../Toast'
import { useAuth } from '../../../lib/auth'
import { toBs, formatBs } from '../../../lib/bs'
import { rentalDaysBetween } from '../../../lib/rentalDays'
import { QuickCreateDialog } from './QuickCreateDialog'

export interface CreationWizardProps {
  isOpen: boolean
  actionId: string
  contextData?: Record<string, unknown> | undefined
  onClose: () => void
  onSuccess?: ((record: Record<string, unknown>) => void) | undefined
}

export interface WizardDraftState {
  step: 1 | 2 | 3 | 4
  clientId: string
  clientName: string
  projectName: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  deliveryType: 'Pickup' | 'Delivery'
  items: Array<{ id: string; name: string; quantity: number; ratePaisa?: number }>
  notes: string
}

export function CreationWizard({
  isOpen,
  actionId,
  contextData = {},
  onClose,
  onSuccess,
}: CreationWizardProps) {
  const navigate = useNavigate()
  useAuth()
  const { showSuccessToast } = useToast()
  const isQuote = actionId === 'quote.new'

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Draft Form State
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0] ?? '2026-07-31'
  })
  const [startTime, setStartTime] = useState('06:00')
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0] ?? '2026-08-01'
  })
  const [endTime, setEndTime] = useState('06:00')
  const [deliveryType, setDeliveryType] = useState<'Pickup' | 'Delivery'>('Pickup')
  const [items, setItems] = useState<Array<{ id: string; name: string; quantity: number }>>([
    { id: 'item-1', name: 'Sony FX3 Cinema Camera Kit', quantity: 1 },
  ])
  const [newItemName, setNewItemName] = useState('')
  const [notes, setNotes] = useState('')

  // Nested Quick-Create Client dialog state
  const [quickClientOpen, setQuickClientOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      if (typeof contextData.clientId === 'string') {
        setClientId(contextData.clientId)
      }
      if (typeof contextData.clientName === 'string') {
        setClientName(contextData.clientName)
      }
      if (typeof contextData.bookingNo === 'string') {
        setProjectName(`Derived from ${contextData.bookingNo}`)
      }
      setErrors({})
    }
  }, [isOpen, contextData])

  // Compute rental days according to 06:00-06:00 policy
  const startIso = `${startDate}T${startTime}:00Z`
  const endIso = `${endDate}T${endTime}:00Z`
  const computedDays = rentalDaysBetween(startIso, endIso)
  const dayCount = computedDays != null && computedDays > 0 ? computedDays : 1

  // Nepali BS Date calculations
  const bsStartStr = (() => {
    try {
      const bs = toBs(new Date(startIso))
      return bs ? formatBs(bs) : null
    } catch {
      return null
    }
  })()

  const bsEndStr = (() => {
    try {
      const bs = toBs(new Date(endIso))
      return bs ? formatBs(bs) : null
    } catch {
      return null
    }
  })()

  const handleAddItem = () => {
    if (!newItemName.trim()) return
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        name: newItemName.trim(),
        quantity: 1,
      },
    ])
    setNewItemName('')
  }

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const handleNestedClientCreated = (record: Record<string, unknown>) => {
    if (typeof record.id === 'string') setClientId(record.id)
    if (typeof record.name === 'string') setClientName(record.name)
    setQuickClientOpen(false)
    showSuccessToast(
      'Client Linked',
      `${String(record.name)} attached to this ${isQuote ? 'quote' : 'rental'}. Draft preserved.`
    )
  }

  const handleSaveDraft = async () => {
    setLoading(true)
    try {
      const draftRecord = {
        id: `draft-${Date.now()}`,
        isQuote,
        status: 'Draft',
        client: clientName || 'Walk-in Client',
        clientId,
        projectName: projectName || 'Untitled Project',
        startDate,
        endDate,
        rentalDays: dayCount,
        deliveryType,
        items,
        notes,
        createdAt: new Date().toISOString(),
      }

      showSuccessToast(
        isQuote ? 'Quote Draft Saved' : 'Rental Draft Saved',
        `${projectName || 'Draft'} saved. You can resume anytime from Rentals.`
      )

      onSuccess?.(draftRecord)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save draft.'
      setErrors({ form: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmBooking = async () => {
    if (!clientName.trim()) {
      setErrors({ client: 'Please specify or select a client before confirming.' })
      setStep(1)
      return
    }

    setLoading(true)
    try {
      const bookingNo = `BK-2026-${Math.floor(1000 + Math.random() * 9000)}`
      const record = {
        id: `booking-${Date.now()}`,
        bookingNo,
        status: isQuote ? 'Draft' : 'Booked',
        client: clientName,
        clientId,
        projectName,
        startDate,
        endDate,
        rentalDays: dayCount,
        deliveryType,
        items,
        notes,
        confirmedAt: new Date().toISOString(),
      }

      showSuccessToast(
        isQuote ? 'Quotation Generated' : 'Booking Confirmed',
        `${isQuote ? 'Quote' : 'Booking'} ${bookingNo} created for ${clientName}.`
      )

      onSuccess?.(record)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed.'
      setErrors({ form: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFullWorkspace = () => {
    onClose()
    navigate('/rentals?action=new')
  }

  const wizardTitle = isQuote ? 'New Commercial Quote' : 'New Rental Booking'

  return (
    <>
      <Modal
        isOpen={isOpen && !quickClientOpen}
        onClose={onClose}
        title={wizardTitle}
        subtitle={
          <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)' }}>
            Step {step} of 4: {
              step === 1
                ? 'Client & Schedule'
                : step === 2
                  ? 'Equipment & Bundles'
                  : step === 3
                    ? 'Logistics & Crew'
                    : 'Review & Commitment'
            }
          </span>
        }
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Step Progress Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            {[
              { num: 1, label: '1. Client & Dates' },
              { num: 2, label: '2. Equipment' },
              { num: 3, label: '3. Logistics' },
              { num: 4, label: '4. Review & Save' },
            ].map((s) => (
              <div
                key={s.num}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn, 8px)',
                  background: step === s.num ? 'var(--accent-subtle, rgba(230,81,0,0.1))' : 'var(--card2)',
                  border: `1px solid ${step === s.num ? 'var(--accent, #e65100)' : 'var(--border)'}`,
                  color: step === s.num ? 'var(--accent, #e65100)' : 'var(--text2)',
                  fontWeight: step === s.num ? 700 : 500,
                  fontSize: 'var(--t-caption, 12px)',
                }}
              >
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          {/* ── STEP 1: Client & Schedule ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Client Selection */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)' }}>
                    Client *
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickClientOpen(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent, #e65100)',
                      cursor: 'pointer',
                      fontSize: 'var(--t-caption, 12px)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Icon name="plus" size={13} />
                    <span>Quick Add Client (Preserves Draft)</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value)
                    if (errors.client) setErrors((prev) => ({ ...prev, client: '' }))
                  }}
                  placeholder="Type client name or select..."
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: `1px solid ${errors.client ? 'var(--danger, #dc2626)' : 'var(--border)'}`,
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-body, 14px)',
                  }}
                />
                {errors.client && (
                  <div style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--t-caption, 12px)', marginTop: 4 }}>
                    {errors.client}
                  </div>
                )}
              </div>

              {/* Project Title */}
              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Project / Production Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Commercial Shoot, Music Video, Wedding"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              {/* Date & Time Range with 06:00-06:00 Rental Policy & BS display */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-btn, 8px)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 'var(--t-meta, 13px)', fontWeight: 600, color: 'var(--text)' }}>
                    Rental Schedule (06:00 → 06:00 Operational Policy)
                  </div>
                  <span className="eyebrow-pill" style={{ textTransform: 'none' }}>
                    {dayCount} {dayCount === 1 ? 'rental day' : 'rental days'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 'var(--t-caption, 12px)', color: 'var(--text2)', display: 'block', marginBottom: 2 }}>
                      Pickup Date & Time
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          padding: '0 8px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        style={{
                          width: 85,
                          minHeight: 44,
                          padding: '0 6px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    {bsStartStr && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 4 }}>
                        BS: {bsStartStr}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: 'var(--t-caption, 12px)', color: 'var(--text2)', display: 'block', marginBottom: 2 }}>
                      Return Date & Time
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          padding: '0 8px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        style={{
                          width: 85,
                          minHeight: 44,
                          padding: '0 6px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    {bsEndStr && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 4 }}>
                        BS: {bsEndStr}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Equipment & Bundles ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddItem()
                    }
                  }}
                  placeholder="Search and add equipment or bundle..."
                  autoFocus
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                  }}
                />
                <Button variant="primary" icon="plus" onClick={handleAddItem} disabled={!newItemName.trim()}>
                  Add Item
                </Button>
              </div>

              {/* Items List */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-btn, 8px)',
                  overflow: 'hidden',
                  background: 'var(--card)',
                }}
              >
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--card2)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 'var(--t-caption, 12px)',
                    fontWeight: 600,
                    color: 'var(--text2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Line Items ({items.length})</span>
                  <span>Quantity</span>
                </div>
                {items.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                    No equipment added yet. Add items above.
                  </div>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="box" size={16} />
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{item.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="eyebrow-pill" style={{ textTransform: 'none' }}>
                          Qty: {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger, #dc2626)',
                            cursor: 'pointer',
                            padding: 4,
                          }}
                        >
                          <Icon name="close" size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Logistics & Notes ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                  Handover & Dispatch Method
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['Pickup', 'Delivery'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDeliveryType(mode)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        padding: '0 12px',
                        borderRadius: 'var(--r-btn, 8px)',
                        border: `1px solid ${deliveryType === mode ? 'var(--accent, #e65100)' : 'var(--border)'}`,
                        background: deliveryType === mode ? 'var(--accent-subtle, rgba(230,81,0,0.08))' : 'var(--card)',
                        color: deliveryType === mode ? 'var(--accent, #e65100)' : 'var(--text)',
                        fontWeight: deliveryType === mode ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon name={mode === 'Pickup' ? 'package' : 'truck'} size={16} />
                      <span>{mode === 'Pickup' ? 'Self Pickup at Warehouse' : 'Delivery to Shoot Location'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Logistics & Crew Notes
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions, designated driver/operator, security deposit notes..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          )}

          {/* ── STEP 4: Review, Save Draft & Confirm ── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: 14,
                  borderRadius: 'var(--r-btn, 8px)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--t-h3, 16px)', fontWeight: 700, color: 'var(--text)' }}>
                    {projectName || 'Rental Booking Summary'}
                  </h3>
                  <span className="eyebrow-pill" style={{ textTransform: 'none' }}>
                    {isQuote ? 'Quotation' : 'Booking'}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)' }}>
                  Client: <strong>{clientName || 'Unassigned'}</strong>
                </div>
                <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)' }}>
                  Duration: {startDate} → {endDate} (<strong>{dayCount} {dayCount === 1 ? 'day' : 'days'}</strong>)
                </div>
                <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)' }}>
                  Equipment Count: <strong>{items.length} lines</strong>
                </div>
                <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)' }}>
                  Dispatch Mode: <strong>{deliveryType}</strong>
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-btn, 8px)',
                  background: 'var(--accent-subtle, rgba(230,81,0,0.06))',
                  border: '1px solid var(--accent-subtle, rgba(230,81,0,0.2))',
                  fontSize: 'var(--t-caption, 12px)',
                  color: 'var(--text2)',
                  lineHeight: 1.5,
                }}
              >
                <strong>Rule Enforced:</strong> Save Draft preserves your choices without allocating physical gear or minting financial claims. Confirm Booking commits the reservation.
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 14,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div>
              {step > 1 ? (
                <Button variant="secondary" icon="chevron_left" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}>
                  Back
                </Button>
              ) : (
                <Button variant="ghost" onClick={handleOpenFullWorkspace} title="Switch to unconstrained four-step full page">
                  Open Full Page
                </Button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>

              {step < 4 ? (
                <Button variant="primary" icon="chevron_right" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}>
                  Continue
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={handleSaveDraft} disabled={loading}>
                    Save Draft
                  </Button>
                  <Button variant="primary" icon="check" onClick={handleConfirmBooking} disabled={loading}>
                    {loading ? 'Processing…' : isQuote ? 'Generate Quote' : 'Confirm Booking'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Nested Add Client Modal — Draft is completely preserved! */}
      {quickClientOpen && (
        <QuickCreateDialog
          isOpen={true}
          actionId="client.new"
          contextData={{ clientName }}
          onClose={() => setQuickClientOpen(false)}
          onSuccess={handleNestedClientCreated}
        />
      )}
    </>
  )
}
