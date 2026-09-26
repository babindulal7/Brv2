import { useState, useMemo } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { formatMoney, rupees, toRupees, type Paisa } from '../../../lib/money'
import {
  lateFee,
  formatOverage,
  bandExplanation,
  validateWaiver,
  WAIVER_REASON_MIN,
  type LateFeeResult,
} from '../../../lib/lateFee'
import { returnReceipt } from '../../../lib/whatsappTemplates'
import { buildWaLink, normalisePhone, NO_PHONE_REASON } from '../../../lib/whatsapp'
import { useAuth } from '../../../lib/auth'
import { canApproveLateFeeWaiver } from '../../../lib/rbac'

export interface ReturnSettlementDamageItem {
  key: string
  name: string
  serial?: string | null | undefined
  condition?: string | undefined
  isMissing?: boolean | undefined
  notes?: string | undefined
}

export interface ReturnSettlementSummary {
  bookingNo: string
  clientName: string
  totalItems: number
  damagedCount: number
  missingCount: number
  depositHeldPaisa: Paisa
  lateFeeSuggestedPaisa: Paisa
  lateFeeChargedPaisa: Paisa
  lateFeeWaiver?: { staffName: string; reason: string; approverName: string } | undefined
  damageChargesPaisa: Paisa
  totalPenaltiesPaisa: Paisa
  depositRefundPaisa: Paisa
  balanceDuePaisa: Paisa
  settledAtIso: string
}

export interface ReturnSettlementModalProps {
  isOpen: boolean
  onClose: () => void
  bookingNo: string
  clientName: string
  clientPhone?: string | null | undefined
  /** Security deposit currently held (Law 5 liability). */
  depositHeldPaisa?: Paisa | null | undefined
  scheduledReturnIso: string
  actualReturnIso?: string | undefined
  /** 1-day rate in Paisa for late fee calculation */
  dayRatePaisa?: Paisa | null | undefined
  dayRateBasis?: string | undefined
  totalItemCount: number
  /** Damaged or missing line items triaged during return inspection */
  itemsWithIssues?: ReturnSettlementDamageItem[] | undefined
  onConfirmSettlement?: ((summary: ReturnSettlementSummary) => Promise<void> | void) | undefined
}

export function ReturnSettlementModal({
  isOpen,
  onClose,
  bookingNo,
  clientName,
  clientPhone,
  depositHeldPaisa,
  scheduledReturnIso,
  actualReturnIso,
  dayRatePaisa,
  dayRateBasis = 'Standard 1-Day Equipment Rate',
  totalItemCount,
  itemsWithIssues = [],
  onConfirmSettlement,
}: ReturnSettlementModalProps) {
  const { user } = useAuth()
  const resolvedDayRate = dayRatePaisa ?? rupees(0)

  // 1. Damage charge estimates in whole Rupees (Law 1: converted to Paisa via rupees())
  const [damageEstimates, setDamageEstimates] = useState<Record<string, number>>({})

  // 2. Late Fee State
  const actualReturnDate = useMemo(
    () => (actualReturnIso ? new Date(actualReturnIso) : new Date()),
    [actualReturnIso],
  )
  const scheduledReturnDate = useMemo(
    () => new Date(scheduledReturnIso),
    [scheduledReturnIso],
  )

  const lateResult = useMemo<LateFeeResult>(() => {
    return lateFee({
      scheduledReturnAt: scheduledReturnDate,
      actualReturnAt: actualReturnDate,
      dayRatePaisa: resolvedDayRate,
    })
  }, [scheduledReturnDate, actualReturnDate, resolvedDayRate])

  const [lateDecision, setLateDecision] = useState<'Apply' | 'Waive'>(() =>
    lateResult.feePaisa > 0 ? 'Apply' : 'Apply',
  )
  const [waiverReason, setWaiverReason] = useState('')
  const [waiverError, setWaiverError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [settled, setSettled] = useState(false)

  const mayApprove = user ? canApproveLateFeeWaiver(user.role) : false
  const staffName = user?.name?.trim() || 'Floor Staff'
  const approverName = user?.name?.trim() || ''

  // Damage charges total
  const totalDamagePaisa = useMemo<Paisa>(() => {
    const totalRupees = Object.values(damageEstimates).reduce((sum, val) => sum + (Number(val) || 0), 0)
    return rupees(Math.max(0, totalRupees))
  }, [damageEstimates])

  // Late fee charged
  const lateFeeChargedPaisa = useMemo<Paisa>(() => {
    if (lateResult.band === 'None') return rupees(0)
    return lateDecision === 'Apply' ? lateResult.feePaisa : rupees(0)
  }, [lateResult, lateDecision])

  // Total Penalties (Late fee + Damages)
  const totalPenaltiesPaisa = useMemo<Paisa>(() => {
    return rupees(toRupees(lateFeeChargedPaisa) + toRupees(totalDamagePaisa))
  }, [lateFeeChargedPaisa, totalDamagePaisa])

  // Security Deposit Reconciliation (Law 5)
  const depositHeld = depositHeldPaisa ?? rupees(0)

  const { depositRefundPaisa, balanceDuePaisa } = useMemo(() => {
    const held = toRupees(depositHeld)
    const penalties = toRupees(totalPenaltiesPaisa)

    if (held >= penalties) {
      return {
        depositRefundPaisa: rupees(held - penalties),
        balanceDuePaisa: rupees(0),
      }
    } else {
      return {
        depositRefundPaisa: rupees(0),
        balanceDuePaisa: rupees(penalties - held),
      }
    }
  }, [depositHeld, totalPenaltiesPaisa])

  const damagedCount = itemsWithIssues.filter((i) => !i.isMissing).length
  const missingCount = itemsWithIssues.filter((i) => i.isMissing).length

  // WhatsApp return receipt message
  const waBody = useMemo(() => {
    return returnReceipt(
      {
        clientName,
        bookingNo,
        startIso: scheduledReturnIso,
        endIso: actualReturnDate.toISOString(),
        itemCount: totalItemCount,
        hasDamagedOrLost: itemsWithIssues.length > 0,
        damageCount: damagedCount > 0 ? damagedCount : undefined,
        lostCount: missingCount > 0 ? missingCount : undefined,
        depositRefundPaisa,
        balanceDuePaisa,
        receiptUrl: null,
      },
      {
        businessName: 'Babin Rentals',
        businessPhone: '+977-9712052571',
      },
    )
  }, [
    clientName,
    bookingNo,
    scheduledReturnIso,
    actualReturnDate,
    totalItemCount,
    itemsWithIssues.length,
    damagedCount,
    missingCount,
    depositRefundPaisa,
    balanceDuePaisa,
  ])

  const waHref = useMemo(() => {
    return buildWaLink(clientPhone, waBody)
  }, [clientPhone, waBody])

  const phoneValid = normalisePhone(clientPhone) !== null

  const handleEstimateChange = (key: string, valStr: string) => {
    const parsed = parseInt(valStr.replace(/\D/g, ''), 10)
    setDamageEstimates((prev) => ({
      ...prev,
      [key]: isNaN(parsed) ? 0 : parsed,
    }))
  }

  const handleConfirm = async () => {
    if (lateDecision === 'Waive' && lateResult.feePaisa > 0) {
      const check = validateWaiver({
        staffName,
        reason: waiverReason,
        approverName,
      })
      if (!check.valid) {
        setWaiverError(check.error)
        return
      }
    }

    setWaiverError(null)
    setSubmitting(true)

    const summary: ReturnSettlementSummary = {
      bookingNo,
      clientName,
      totalItems: totalItemCount,
      damagedCount,
      missingCount,
      depositHeldPaisa: depositHeld,
      lateFeeSuggestedPaisa: lateResult.feePaisa,
      lateFeeChargedPaisa,
      lateFeeWaiver:
        lateDecision === 'Waive' && lateResult.feePaisa > 0
          ? {
              staffName,
              reason: waiverReason.trim(),
              approverName,
            }
          : undefined,
      damageChargesPaisa: totalDamagePaisa,
      totalPenaltiesPaisa,
      depositRefundPaisa,
      balanceDuePaisa,
      settledAtIso: new Date().toISOString(),
    }

    try {
      if (onConfirmSettlement) {
        await onConfirmSettlement(summary)
      }
      setSettled(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={`Return Settlement & Deposit Reconciliation · ${bookingNo}`}
      subtitle={`Client: ${clientName} · ${totalItemCount} total items inspected`}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
          <Button variant="secondary" onClick={onClose} style={{ minHeight: 44 }}>
            {settled ? 'Close' : 'Cancel'}
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 'var(--r-btn, 6px)',
                  background: '#25D366',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 'var(--t-meta, 12px)',
                  textDecoration: 'none',
                }}
              >
                <Icon name="message" size={16} />
                Send Return Receipt
              </a>
            ) : (
              <button
                type="button"
                disabled
                title={NO_PHONE_REASON}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 'var(--r-btn, 6px)',
                  background: 'var(--card2)',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  fontSize: 'var(--t-meta, 12px)',
                  cursor: 'not-allowed',
                }}
              >
                <Icon name="message" size={16} />
                WhatsApp Unavailable ({!phoneValid ? 'No Phone' : 'Blocked'})
              </button>
            )}

            {!settled && (
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={submitting}
                style={{ minHeight: 44, padding: '0 18px', fontWeight: 600 }}
              >
                {submitting ? 'Recording Settlement…' : 'Record Settlement & Release'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {settled && (
          <div
            role="status"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--success, #22c55e) 15%, var(--card))',
              border: '1px solid var(--success, #22c55e)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--success-text, #22c55e)',
              fontWeight: 600,
              fontSize: 'var(--t-ui, 13px)',
            }}
          >
            <Icon name="check" size={18} />
            <span>Return settlement recorded. Deposit and penalty ledgers reconciled successfully.</span>
          </div>
        )}

        {/* ── SECTION 1: DEPOSIT & CHARGES SUMMARY TILES ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {/* Security Deposit Held */}
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--r-btn, 8px)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Security Deposit Held
            </div>
            <div className="figure" style={{ fontSize: 'var(--t-h3, 20px)', fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
              {formatMoney(depositHeld)}
            </div>
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--text2)', marginTop: 2 }}>
              Liability (Law 5)
            </div>
          </div>

          {/* Total Deductions / Penalties */}
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--r-btn, 8px)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Deductions
            </div>
            <div
              className="figure"
              style={{
                fontSize: 'var(--t-h3, 20px)',
                fontWeight: 700,
                color: totalPenaltiesPaisa > 0 ? 'var(--danger-text, #ef4444)' : 'var(--text)',
                marginTop: 4,
              }}
            >
              {formatMoney(totalPenaltiesPaisa)}
            </div>
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--text2)', marginTop: 2 }}>
              Late Fee + Damage Charges
            </div>
          </div>

          {/* Net Settlement Outcome */}
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--r-btn, 8px)',
              background:
                balanceDuePaisa > 0
                  ? 'color-mix(in srgb, var(--danger, #ef4444) 12%, var(--card))'
                  : 'color-mix(in srgb, var(--success, #22c55e) 12%, var(--card))',
              border: `1px solid ${balanceDuePaisa > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)'}`,
            }}
          >
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {balanceDuePaisa > 0 ? 'Balance Owed by Client' : 'Net Deposit Refund'}
            </div>
            <div
              className="figure"
              style={{
                fontSize: 'var(--t-h3, 20px)',
                fontWeight: 700,
                color: balanceDuePaisa > 0 ? 'var(--danger-text, #ef4444)' : 'var(--success-text, #22c55e)',
                marginTop: 4,
              }}
            >
              {formatMoney(balanceDuePaisa > 0 ? balanceDuePaisa : depositRefundPaisa)}
            </div>
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--text2)', marginTop: 2 }}>
              {balanceDuePaisa > 0 ? '⚠️ Under-secured liability' : 'Release via Cash/Bank Transfer'}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: LATE RETURN ASSESSMENT ── */}
        <div
          style={{
            padding: 14,
            borderRadius: 'var(--r-btn, 8px)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon
                name={lateResult.band === 'None' ? 'check' : 'timer'}
                size={16}
                style={{ color: lateResult.band === 'None' ? 'var(--success-text)' : 'var(--progress-text)' }}
              />
              <strong style={{ fontSize: 'var(--t-ui, 13px)' }}>
                Late Return Duration: {formatOverage(lateResult.overageMinutes)}
              </strong>
            </div>
            <div style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--text2)' }}>
              Band: <b>{lateResult.band}</b> · Suggested Fee: <b>{formatMoney(lateResult.feePaisa)}</b>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
            {bandExplanation(lateResult)} <span style={{ opacity: 0.7 }}>({dayRateBasis})</span>
          </p>

          {lateResult.band !== 'None' && (
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--t-meta, 12px)' }}>
                  <input
                    type="radio"
                    name="lateDecision"
                    checked={lateDecision === 'Apply'}
                    onChange={() => setLateDecision('Apply')}
                    style={{ accentColor: 'var(--primary, #2563eb)' }}
                  />
                  <span>Charge Late Fee (<b>{formatMoney(lateResult.feePaisa)}</b>)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--t-meta, 12px)' }}>
                  <input
                    type="radio"
                    name="lateDecision"
                    checked={lateDecision === 'Waive'}
                    onChange={() => setLateDecision('Waive')}
                    style={{ accentColor: 'var(--primary, #2563eb)' }}
                  />
                  <span>Waive Late Fee</span>
                </label>
              </div>

              {lateDecision === 'Waive' && (
                <div style={{ background: 'var(--card2)', padding: 12, borderRadius: 'var(--r-btn, 6px)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 'var(--t-meta, 11px)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                    Waiver Authorization (Manager / Owner approval required · min {WAIVER_REASON_MIN} characters):
                  </div>
                  <textarea
                    value={waiverReason}
                    onChange={(e) => setWaiverReason(e.target.value)}
                    placeholder="State detailed business rationale for waiving the late fee…"
                    aria-label="Late fee waiver reason"
                    rows={2}
                    style={{
                      width: '100%',
                      padding: 8,
                      borderRadius: 'var(--r-input, 4px)',
                      border: `1px solid ${waiverReason.trim().length < WAIVER_REASON_MIN ? 'var(--danger, #ef4444)' : 'var(--input-border)'}`,
                      background: 'var(--input-bg)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta, 12px)',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
                    <span>Approver: <b>{approverName || 'Current Session'}</b> {mayApprove ? '✓ (Authorized)' : '⚠️ (Requires Manager)'}</span>
                    <span>{waiverReason.trim().length}/{WAIVER_REASON_MIN} min chars</span>
                  </div>
                  {waiverError && (
                    <div role="alert" style={{ color: 'var(--danger-text, #ef4444)', fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                      {waiverError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION 3: DAMAGED & MISSING GEAR DEDUCTIONS ── */}
        <div
          style={{
            padding: 14,
            borderRadius: 'var(--r-btn, 8px)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 'var(--t-ui, 13px)' }}>
              Damaged & Missing Equipment Charges ({itemsWithIssues.length})
            </strong>
            <span style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: totalDamagePaisa > 0 ? 'var(--danger-text, #ef4444)' : 'var(--muted)' }}>
              Total Damage Claim: {formatMoney(totalDamagePaisa)}
            </span>
          </div>

          {itemsWithIssues.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              ✓ No damaged or missing items flagged during return inspection. All equipment accounted for.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {itemsWithIssues.map((item) => {
                const currentEst = damageEstimates[item.key] ?? 0
                return (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'var(--card2)',
                      borderRadius: 'var(--r-btn, 6px)',
                      border: '1px solid var(--border)',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon
                          name={item.isMissing ? 'alert_circle' : 'tool'}
                          size={14}
                          style={{ color: item.isMissing ? 'var(--danger-text)' : 'var(--progress-text)' }}
                        />
                        <strong style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--text)' }}>
                          {item.name}
                        </strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {item.serial ? `Serial: ${item.serial} · ` : ''}
                        Condition: <b>{item.isMissing ? 'Missing / Not Returned' : item.condition ?? 'Damaged'}</b>
                        {item.notes ? ` · Note: "${item.notes}"` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--muted)' }}>Repair / Replacement: Rs</span>
                      <input
                        type="text"
                        value={currentEst > 0 ? currentEst.toLocaleString('en-IN') : ''}
                        onChange={(e) => handleEstimateChange(item.key, e.target.value)}
                        placeholder="0"
                        aria-label={`Damage charge for ${item.name}`}
                        style={{
                          width: 100,
                          minHeight: 36,
                          padding: '0 8px',
                          borderRadius: 'var(--r-input, 4px)',
                          border: '1px solid var(--input-border)',
                          background: 'var(--input-bg)',
                          color: 'var(--text)',
                          fontSize: 'var(--t-meta, 12px)',
                          fontFamily: 'inherit',
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
