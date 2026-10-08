import { useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Button, Input } from '../../../components/ui'
import { Field, MoneyRow, Section, inputStyle } from './BookingFormWidgets'
import { DiscountChips } from './DiscountChips'
import { VatToggle } from './VatToggle'
import { formatMoney, toRupees } from '../../../lib/money'
import { lookupCouponByCode } from '../../../lib/queries/couponLookup'
import {
  type PricingPipelineResult,
  DISCOUNT_STACKING_CAP_PERCENT,
  type PromoCodeDefinition,
} from '../../../lib/pricingPipeline'
import './rental-pricing.css'

const sub = {
  margin: '0 0 12px',
  fontSize: 'var(--t-ui)',
  fontWeight: 700,
  color: 'var(--text)',
} as const

const moneyBlock = {
  background: 'var(--card2)',
  borderRadius: 'var(--r-card)',
  padding: 'var(--sp-md)',
  minWidth: 0,
} as const

export interface RentalPricingSectionProps {
  open: boolean
  onToggle: () => void
  isDesktop: boolean
  pricing: PricingPipelineResult
  canCrewMoney: boolean
  vatOn: boolean
  setVatOn: (val: boolean) => void
  vatRatePercent: number
  discountPct: number
  setDiscountPct: (pct: number) => void
  manualDiscountReason: string
  setManualDiscountReason: (r: string) => void
  manualDiscountAuthorizedBy: string
  setManualDiscountAuthorizedBy: (a: string) => void
  womenDopEligible: boolean
  setWomenDopEligible: (val: boolean) => void
  isStudentBundle: boolean
  promoCodeInput: string
  setPromoCodeInput: (code: string) => void
  promoCodeApplied: PromoCodeDefinition | null
  setPromoCodeApplied: (promo: PromoCodeDefinition | null) => void
  promoNotice: { tone: 'success' | 'danger'; text: string } | null
  setPromoNotice: (notice: { tone: 'success' | 'danger'; text: string } | null) => void
  pickupAt: Date | null
  manualDepositOverride: boolean
  setManualDepositOverride: (val: boolean) => void
  manualDepositAmount: string
  setManualDepositAmount: (val: string) => void
  depositOverrideReason: string
  setDepositOverrideReason: (r: string) => void
  depositAuthorizedBy: string
  setDepositAuthorizedBy: (a: string) => void
  title?: string
}

export function RentalPricingSection({
  open,
  onToggle,
  pricing,
  canCrewMoney,
  vatOn,
  setVatOn,
  vatRatePercent,
  discountPct,
  setDiscountPct,
  manualDiscountReason,
  setManualDiscountReason,
  manualDiscountAuthorizedBy,
  setManualDiscountAuthorizedBy,
  womenDopEligible,
  setWomenDopEligible,
  isStudentBundle,
  promoCodeInput,
  setPromoCodeInput,
  promoCodeApplied,
  setPromoCodeApplied,
  promoNotice,
  setPromoNotice,
  pickupAt,
  manualDepositOverride,
  setManualDepositOverride,
  manualDepositAmount,
  setManualDepositAmount,
  depositOverrideReason,
  setDepositOverrideReason,
  depositAuthorizedBy,
  setDepositAuthorizedBy,
  title = 'Pricing & Terms',
}: RentalPricingSectionProps) {
  const hasDiscountOptions = womenDopEligible || Boolean(promoCodeApplied) || Boolean(promoCodeInput) || Boolean(promoNotice)
  const [discountOptionsOpen, setDiscountOptionsOpen] = useState(hasDiscountOptions)

  useEffect(() => {
    if (hasDiscountOptions) setDiscountOptionsOpen(true)
  }, [hasDiscountOptions])

  return (
    <Section
      id="section-5"
      title={title}
      badge={
        pricing.rentalTotalPaisa > 0 ? (
          <span
            className="figure"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-success-bg)',
              color: 'var(--st-success-fg)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {formatMoney(pricing.rentalTotalPaisa)}
          </span>
        ) : null
      }
      open={open}
      onToggle={onToggle}
      collapsible={false}
      summary={`${formatMoney(pricing.rentalTotalPaisa)} total`}
    >
      {/* RULING 2026-10-08: common pricing controls first; optional adjustments disclose their active state. */}
      <div className="new-rental-pricing-layout">
        {/* User ruling, 7 Oct: Discounts & Taxes precede Rental Charges. */}
        <div className="new-rental-pricing-adjustments" style={moneyBlock}>
          <h3 style={sub}>Discounts & Taxes</h3>
          <div style={{ marginTop: 8 }}>
            <div className="new-rental-pricing-presets">
              <DiscountChips
                percent={discountPct}
                onPercent={setDiscountPct}
                amount={formatMoney(pricing.discounts.discountPaisa)}
                onSelectPreset={(pct, reason) => {
                  setDiscountPct(pct)
                  if (reason && (!manualDiscountReason || manualDiscountReason.trim() === '')) {
                    setManualDiscountReason(reason)
                  }
                }}
              />
            </div>
            {/* User accepted label clarity, 7 Oct: optional adjustments have no star. */}
            <div className="new-rental-pricing-custom-discount">
              <Field label="Manual Discount %">
                <Input
                  type="number"
                  min={0}
                  max={DISCOUNT_STACKING_CAP_PERCENT}
                  value={discountPct}
                  onChange={(e) =>
                    setDiscountPct(
                      Math.min(DISCOUNT_STACKING_CAP_PERCENT, Math.max(0, Number(e.target.value) || 0)),
                    )
                  }
                  style={inputStyle}
                />
              </Field>
              <p className="new-rental-pricing-help">Choose a preset above or enter a percentage.</p>
            </div>

            {discountPct > 0 && (
              <div className="new-rental-pricing-discount-details">
                <Field label="Discount Reason *">
                  <Input
                    value={manualDiscountReason}
                    onChange={(e) => setManualDiscountReason(e.target.value)}
                    placeholder="e.g. Director courtesy"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Authorized By *">
                  <Input
                    value={manualDiscountAuthorizedBy}
                    onChange={(e) => setManualDiscountAuthorizedBy(e.target.value)}
                    placeholder="e.g. Babin"
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}

            <div className="new-rental-pricing-vat">
              <VatToggle ratePercent={vatRatePercent} on={vatOn} onChange={setVatOn} />
            </div>

            <details
              className="new-rental-pricing-options"
              open={discountOptionsOpen}
              onToggle={(event) => setDiscountOptionsOpen(event.currentTarget.open)}
            >
              <summary>
                <span>More discount options</span>
                <span className="new-rental-pricing-option-state">
                  {[womenDopEligible ? 'Women DoP +5%' : '', promoCodeApplied?.code ?? ''].filter(Boolean).join(' · ') || 'Promo & eligibility'}
                </span>
                <Icon name="chevron_down" size={16} />
              </summary>
              <div className="new-rental-pricing-options-body">
                {/* Women DoP / Director toggle */}
                <label
                  htmlFor="women-dop-eligible"
                  className="new-rental-pricing-checkbox"
                >
                  <input
                    id="women-dop-eligible"
                    type="checkbox"
                    aria-label="Women DoP / Director (+5% discount)"
                    checked={womenDopEligible}
                    onChange={(e) => setWomenDopEligible(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                  <span>
                    <strong>Women DoP / Director (+5% discount)</strong>
                  </span>
                </label>

                {/* Promo code */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <Field label="Promo code (optional)" labelId="new-rental-promo-label">
                    <div className="new-rental-pricing-promo">
                      <Input
                        aria-labelledby="new-rental-promo-label"
                        value={promoCodeInput}
                        onChange={(e) => {
                          setPromoCodeInput(e.target.value.toUpperCase())
                          setPromoNotice(null)
                        }}
                        placeholder="Promo code"
                        style={{ ...inputStyle, textTransform: 'uppercase' }}
                      />
                      <Button
                        variant="secondary"
                        type="button"
                        aria-label="Apply promo code"
                        onClick={async () => {
                          const code = promoCodeInput.trim().toUpperCase()
                          if (!code) {
                            setPromoNotice({ tone: 'danger', text: 'Enter a promo code.' })
                            return
                          }
                          /* RULING 2026-10-07: a code is a `coupons` row, never an in-code constant. */
                          const today = (pickupAt ?? new Date()).toISOString().slice(0, 10)
                          const found = await lookupCouponByCode(code, today)
                          if (!found.ok) {
                            setPromoNotice({ tone: 'danger', text: found.reason })
                            return
                          }
                          const promo = found.promo
                          if (promo.minSpendPaisa && pricing.grossSubtotalPaisa < promo.minSpendPaisa) {
                            setPromoNotice({
                              tone: 'danger',
                              text: `Promo "${code}" requires minimum rental spend of ${formatMoney(promo.minSpendPaisa)}.`,
                            })
                            return
                          }
                          setPromoCodeApplied(promo)
                          setPromoNotice({
                            tone: 'success',
                            text: `Promo "${code}" applied: ${promo.discountPercent}% off${promo.description ? ` (${promo.description})` : ''}.`,
                          })
                        }}
                      >
                        Apply
                      </Button>
                      {promoCodeApplied && (
                        <Button
                          variant="ghost"
                          type="button"
                          aria-label="Clear promo code"
                          onClick={() => {
                            setPromoCodeApplied(null)
                            setPromoCodeInput('')
                            setPromoNotice(null)
                          }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </Field>
                </div>
              </div>
            </details>
            {promoNotice && (
                <div
                  role={promoNotice.tone === 'danger' ? 'alert' : 'status'}
                  style={{
                    marginTop: 6,
                    fontSize: '12px',
                    color:
                      promoNotice.tone === 'success' ? 'var(--st-success-fg, #065f46)' : 'var(--danger-text)',
                  }}
                >
                  {promoNotice.text}
                </div>
            )}

            {/* Active pricing rules remain visible even when optional controls are closed. */}
            {isStudentBundle && (
              <p className="new-rental-pricing-notice new-rental-pricing-notice--info">
                <Icon name="info" size={16} />
                Student/College flat-rate bundle lines do not receive stacking discounts.
              </p>
            )}

            {/* Stacking cap indicator */}
            {pricing.discounts.capped && (
              <div
                style={{
                  marginTop: 10,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--st-warning-bg, #fffbeb)',
                  color: 'var(--st-warning-fg, #92400e)',
                  fontSize: '12px',
                }}
              >
                <Icon
                  name="alert_triangle"
                  size={12}
                  style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }}
                />
                Discounts capped at 25% maximum per company policy.
              </div>
            )}

            {/* Validation errors */}
            {pricing.discounts.validationErrors.length > 0 && (
              <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                {pricing.discounts.validationErrors.map((err, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'flex-start',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      color: 'var(--st-danger-fg)',
                      lineHeight: 1.4,
                    }}
                  >
                    <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                    {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="new-rental-pricing-totals">
          <div className="new-rental-pricing-charges" style={moneyBlock}>
            <h3 style={sub}>Rental Charges</h3>
            {[
              { l: 'Equipment Rental', v: formatMoney(pricing.equipmentSubtotalPaisa) },
              { l: 'Bundles', v: pricing.bundleSubtotalPaisa > 0 ? formatMoney(pricing.bundleSubtotalPaisa) : '—' },
              { l: 'Sub-Rental', v: pricing.subRentalSubtotalPaisa > 0 ? formatMoney(pricing.subRentalSubtotalPaisa) : '—' },
              {
                l: 'Services & custom lines',
                v: pricing.servicesSubtotalPaisa > 0 ? formatMoney(pricing.servicesSubtotalPaisa) : '—',
              },
              ...(canCrewMoney
                ? [{ l: 'Crew Charges', v: pricing.crewSubtotalPaisa > 0 ? formatMoney(pricing.crewSubtotalPaisa) : '—' }]
                : []),
              { l: 'Transport', v: pricing.deliverySubtotalPaisa > 0 ? formatMoney(pricing.deliverySubtotalPaisa) : '—' },
            ].map((r) => (
              <MoneyRow key={r.l} label={r.l} value={r.v} {...(r.v === '—' ? { tone: 'var(--muted)' } : {})} />
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
              <MoneyRow label="Subtotal" value={formatMoney(pricing.grossSubtotalPaisa)} />
              <MoneyRow
                label={
                  pricing.discounts.appliedPercent > 0
                    ? `Discount (${pricing.discounts.appliedPercent}%${pricing.discounts.capped ? ' - CAPPED' : ''})`
                    : 'Discount'
                }
                value={pricing.discounts.discountPaisa > 0 ? `− ${formatMoney(pricing.discounts.discountPaisa)}` : '—'}
                {...(pricing.discounts.discountPaisa > 0 ? { tone: 'var(--danger-text)' } : {})}
              />
              <MoneyRow label="Taxable Amount" value={formatMoney(pricing.taxableSubtotalPaisa)} />
              <MoneyRow
                label={vatOn ? `VAT (${pricing.vatRatePercent}%)` : 'VAT — off for this booking'}
                value={vatOn ? formatMoney(pricing.vatPaisa) : '—'}
                {...(vatOn ? {} : { tone: 'var(--muted)' })}
              />
            </div>
            <div className="new-rental-pricing-total">
              <MoneyRow label="RENTAL TOTAL" value={formatMoney(pricing.rentalTotalPaisa)} big />
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <MoneyRow
                label="Security Deposit (Refundable)"
                value={formatMoney(pricing.securityDeposit.requiredPaisa)}
                tone="var(--text2)"
              />
              <p style={{ margin: '2px 0 8px', fontSize: '11px', color: 'var(--muted)' }}>
                Held as a separate liability guarantee. Excluded from rental charges and VAT.
              </p>
              <MoneyRow
                label={`Advance Required (${pricing.advanceRequiredPaisa === pricing.rentalTotalPaisa && pricing.rentalTotalPaisa <= 500000 ? '100%' : pricing.rentalTotalPaisa <= 1000000 ? 'Rs 5,000' : '50%'})`}
                value={formatMoney(pricing.advanceRequiredPaisa)}
                tone="var(--st-primary-fg)"
                strong
              />
              <details className="new-rental-pricing-policy">
                <summary>How the advance is calculated</summary>
                <p className="new-rental-pricing-help">
                  Rental total ≤ Rs 5,000: 100%. Up to Rs 10,000: Rs 5,000. Above Rs 10,000: 50%.
                </p>
              </details>
            </div>
          </div>

          {/* Security Deposit Block */}
          <div style={moneyBlock}>
            <h3 style={sub}>Security Deposit</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Recommended Deposit</span>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                {formatMoney(pricing.securityDeposit.recommendedPaisa)}
              </span>
            </div>

            <label
              htmlFor="manual-deposit-override"
              className="new-rental-pricing-checkbox new-rental-pricing-override"
            >
              <input
                id="manual-deposit-override"
                type="checkbox"
                aria-label="Manual security deposit override"
                aria-controls="new-rental-deposit-fields"
                aria-expanded={manualDepositOverride}
                checked={manualDepositOverride}
                onChange={(e) => {
                  setManualDepositOverride(e.target.checked)
                  if (!e.target.checked) {
                    setManualDepositAmount('')
                    setDepositOverrideReason('')
                    setDepositAuthorizedBy('')
                  } else {
                    setManualDepositAmount(String(toRupees(pricing.securityDeposit.recommendedPaisa)))
                  }
                }}
              />
              <span>Manual Deposit Override</span>
              <span className="new-rental-pricing-option-state">{manualDepositOverride ? 'On' : 'Off'}</span>
            </label>

            {manualDepositOverride && (
              <div id="new-rental-deposit-fields" className="new-rental-pricing-deposit-fields">
                <Field label="Override Amount (Rs) *">
                  <Input
                    type="number"
                    min={0}
                    value={manualDepositAmount}
                    onChange={(e) => setManualDepositAmount(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Override Reason *">
                  <Input
                    value={depositOverrideReason}
                    onChange={(e) => setDepositOverrideReason(e.target.value)}
                    placeholder="e.g. Low risk repeat client with corporate guarantee"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Authorized By *">
                  <Input
                    value={depositAuthorizedBy}
                    onChange={(e) => setDepositAuthorizedBy(e.target.value)}
                    placeholder="e.g. Managing Director Babin"
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}

            {pricing.securityDeposit.validationErrors.length > 0 && (
              <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                {pricing.securityDeposit.validationErrors.map((err, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'flex-start',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      color: 'var(--st-danger-fg)',
                      lineHeight: 1.4,
                    }}
                  >
                    <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                    {err}
                  </div>
                ))}
              </div>
            )}

            <p className="new-rental-pricing-help" style={{ marginTop: 12 }}>
              Refundable and separate from rent. It never reduces rental outstanding.
            </p>
          </div>
          <p className="new-rental-pricing-payment-note">
            <Icon name="info" size={16} />
            <span>Record advance payments and deposits in Booking Detail after the booking and invoice are created.</span>
          </p>
        </div>
      </div>
    </Section>
  )
}
