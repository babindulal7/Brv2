import type { CSSProperties } from 'react'
import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui'
import type { PricingPipelineResult } from '../../../lib/pricingPipeline'
import { formatMoney } from '../../../lib/money'
import { DiscountChips } from './DiscountChips'
import { Field, MoneyRow } from './BookingFormWidgets'
import { VatToggle } from './VatToggle'

export interface PromoNotice {
  tone: 'success' | 'danger'
  text: string
}

export interface RentalFinancialRailProps {
  pricing: PricingPipelineResult
  vatOn: boolean
  vatRatePercent: number
  onToggleVat: (on: boolean) => void
  canCrewMoney: boolean
  canViewMoney: boolean
  isDesktop: boolean
  inputStyle: CSSProperties
  discountPct: number
  discountCap: number
  onDiscountPct: (n: number) => void
  onSelectDiscountPreset: (pct: number, reason?: string) => void
  manualDiscountReason: string
  onManualDiscountReason: (v: string) => void
  manualDiscountAuthorizedBy: string
  onManualDiscountAuthorizedBy: (v: string) => void
  womenDopEligible: boolean
  onWomenDopEligible: (v: boolean) => void
  isStudentBundle: boolean
  promoCodeInput: string
  onPromoCodeInput: (v: string) => void
  promoCodeApplied: string | null
  onApplyPromo: (code: string) => void
  onRemovePromo: () => void
  promoNotice: PromoNotice | null
  manualDepositOverride: boolean
  onManualDepositOverrideChange: (on: boolean) => void
  manualDepositAmount: string
  onManualDepositAmount: (v: string) => void
  depositOverrideReason: string
  onDepositOverrideReason: (v: string) => void
  depositAuthorizedBy: string
  onDepositAuthorizedBy: (v: string) => void
}

const sub = {
  margin: '0 0 8px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
} as const

const moneyBlock = {
  background: 'var(--card2)',
  borderRadius: 'var(--r-card)',
  padding: 'var(--sp-md)',
  minWidth: 0,
} as const

/**
 * New Rental Section 5 — Pricing & Terms (extracted from `NewRental.tsx`).
 *
 * Read-only breakdown from `pricing` (engine-computed paisa integers) plus
 * controlled discount / promo / VAT / deposit inputs. No arithmetic here:
 * every figure comes from `src/lib/pricingPipeline.ts` and is formatted by
 * `src/lib/money.ts`. Law 5: the deposit card is liability-isolated, never in
 * the rental total. Law 6: money-blind roles get nothing (`null`), not a mask.
 */
export function RentalFinancialRail({
  pricing,
  vatOn,
  vatRatePercent,
  onToggleVat,
  canCrewMoney,
  canViewMoney,
  isDesktop,
  inputStyle,
  discountPct,
  discountCap,
  onDiscountPct,
  onSelectDiscountPreset,
  manualDiscountReason,
  onManualDiscountReason,
  manualDiscountAuthorizedBy,
  onManualDiscountAuthorizedBy,
  womenDopEligible,
  onWomenDopEligible,
  isStudentBundle,
  promoCodeInput,
  onPromoCodeInput,
  promoCodeApplied,
  onApplyPromo,
  onRemovePromo,
  promoNotice,
  manualDepositOverride,
  onManualDepositOverrideChange,
  manualDepositAmount,
  onManualDepositAmount,
  depositOverrideReason,
  onDepositOverrideReason,
  depositAuthorizedBy,
  onDepositAuthorizedBy,
}: RentalFinancialRailProps) {
  if (!canViewMoney) return null
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0,1fr))' : '1fr',
        gap: 'var(--sp-md)',
      }}
    >
      {/* Column 1: Rental Charges Breakdown */}
      <div style={moneyBlock}>
        <h3 style={sub}>Rental Charges</h3>
        {[
          { l: 'Equipment Rental', v: formatMoney(pricing.equipmentSubtotalPaisa) },
          {
            l: 'Bundles',
            v: pricing.bundleSubtotalPaisa > 0 ? formatMoney(pricing.bundleSubtotalPaisa) : '—',
          },
          {
            l: 'Sub-Rental',
            v:
              pricing.subRentalSubtotalPaisa > 0
                ? formatMoney(pricing.subRentalSubtotalPaisa)
                : '—',
          },
          {
            l: 'Services & custom lines',
            v:
              pricing.servicesSubtotalPaisa > 0
                ? formatMoney(pricing.servicesSubtotalPaisa)
                : '—',
          },
          ...(canCrewMoney
            ? [
                {
                  l: 'Crew Charges',
                  v:
                    pricing.crewSubtotalPaisa > 0
                      ? formatMoney(pricing.crewSubtotalPaisa)
                      : '—',
                },
              ]
            : []),
          {
            l: 'Transport',
            v:
              pricing.deliverySubtotalPaisa > 0
                ? formatMoney(pricing.deliverySubtotalPaisa)
                : '—',
          },
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
            value={
              pricing.discounts.discountPaisa > 0
                ? `− ${formatMoney(pricing.discounts.discountPaisa)}`
                : '—'
            }
            {...(pricing.discounts.discountPaisa > 0 ? { tone: 'var(--danger-text)' } : {})}
          />
          <MoneyRow label="Taxable Amount" value={formatMoney(pricing.taxableSubtotalPaisa)} />
          <MoneyRow
            label={vatOn ? `VAT (${pricing.vatRatePercent}%)` : 'VAT — off for this booking'}
            value={vatOn ? formatMoney(pricing.vatPaisa) : '—'}
            {...(vatOn ? {} : { tone: 'var(--muted)' })}
          />
        </div>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <MoneyRow label="RENTAL TOTAL" value={formatMoney(pricing.rentalTotalPaisa)} big />
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <MoneyRow
            label="Security Deposit (Refundable)"
            value={formatMoney(pricing.securityDeposit.requiredPaisa)}
            tone="var(--text2)"
          />
          <p style={{ margin: '2px 0 8px', fontSize: '11px', color: 'var(--muted)' }}>
            Held as a separate liability guarantee. Not taxable, not rental revenue.
          </p>
          <MoneyRow
            label={`Advance Required (${pricing.advanceRequiredPaisa === pricing.rentalTotalPaisa && pricing.rentalTotalPaisa <= 500000 ? '100%' : pricing.rentalTotalPaisa <= 1000000 ? 'Rs 5,000' : '50%'})`}
            value={formatMoney(pricing.advanceRequiredPaisa)}
            tone="var(--st-primary-fg)"
            strong
          />
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
            Tier policy: ≤ Rs 5,000 (100%) · ≤ Rs 10,000 (Rs 5,000) · &gt; Rs 10,000 (50%)
          </p>
        </div>
      </div>

      {/* Column 2: Discounts, VAT & Security Deposit Policy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <div style={moneyBlock}>
          <h3 style={sub}>Discounts & Taxes</h3>
          <div style={{ marginTop: 8 }}>
            <Field label="Manual Discount % *">
              <Input
                type="number"
                min={0}
                max={discountCap}
                value={discountPct}
                onChange={(e) =>
                  onDiscountPct(Math.min(discountCap, Math.max(0, Number(e.target.value) || 0)))
                }
                style={inputStyle}
              />
            </Field>
            <div style={{ marginTop: 8 }}>
              <DiscountChips
                percent={discountPct}
                onPercent={onDiscountPct}
                amount={formatMoney(pricing.discounts.discountPaisa)}
                onSelectPreset={onSelectDiscountPreset}
              />
            </div>

            {discountPct > 0 && (
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}
              >
                <Field label="Discount Reason *">
                  <Input
                    value={manualDiscountReason}
                    onChange={(e) => onManualDiscountReason(e.target.value)}
                    placeholder="e.g. Director courtesy"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Authorized By *">
                  <Input
                    value={manualDiscountAuthorizedBy}
                    onChange={(e) => onManualDiscountAuthorizedBy(e.target.value)}
                    placeholder="e.g. Babin"
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}

            {/* Women DoP / Director toggle */}
            <label
              htmlFor="women-dop-eligible"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 12,
                cursor: 'pointer',
                fontSize: 'var(--t-meta)',
              }}
            >
              <input
                id="women-dop-eligible"
                type="checkbox"
                aria-label="Women DoP / Director (+5% discount)"
                checked={womenDopEligible}
                onChange={(e) => onWomenDopEligible(e.target.checked)}
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <span>
                <strong>Women DoP / Director (+5% discount)</strong>
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px' }}>
                  Encouraging women cinematographers & filmmakers in Nepal.
                </span>
              </span>
            </label>

            {/* Student bundle indicator */}
            {isStudentBundle && (
              <div
                style={{
                  marginTop: 10,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--st-info-bg, #eff6ff)',
                  color: 'var(--st-info-fg, #1e40af)',
                  fontSize: '12px',
                }}
              >
                <Icon
                  name="info"
                  size={12}
                  style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }}
                />
                Student/College bundle detected — subsidized flat rate lines are protected from
                stacking discounts.
              </div>
            )}

            {/* Promo code */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <Field label="Promo code (optional)">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={promoCodeInput}
                    onChange={(e) => {
                      onPromoCodeInput(e.target.value.toUpperCase())
                    }}
                    placeholder="Promo code"
                    style={{ ...inputStyle, textTransform: 'uppercase' }}
                  />
                  <Button variant="secondary" type="button" onClick={() => onApplyPromo(promoCodeInput.trim().toUpperCase())}>
                    Apply
                  </Button>
                  {promoCodeApplied && (
                    <Button variant="ghost" type="button" onClick={onRemovePromo}>
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
              {promoNotice && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: '12px',
                    color:
                      promoNotice.tone === 'success'
                        ? 'var(--st-success-fg, #065f46)'
                        : 'var(--danger-text)',
                  }}
                >
                  {promoNotice.text}
                </div>
              )}
            </div>

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
              <div
                style={{
                  marginTop: 9,
                  padding: 10,
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--st-danger-bg)',
                }}
              >
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

          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <VatToggle ratePercent={vatRatePercent} on={vatOn} onChange={onToggleVat} />
          </div>
        </div>

        {/* Security Deposit Block */}
        <div style={moneyBlock}>
          <h3 style={sub}>Security Deposit</h3>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Recommended Deposit
            </span>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>
              {formatMoney(pricing.securityDeposit.recommendedPaisa)}
            </span>
          </div>

          <label
            htmlFor="manual-deposit-override"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              cursor: 'pointer',
              fontSize: 'var(--t-meta)',
            }}
          >
            <input
              id="manual-deposit-override"
              type="checkbox"
              aria-label="Manual security deposit override"
              checked={manualDepositOverride}
              onChange={(e) => onManualDepositOverrideChange(e.target.checked)}
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
            <span>Manual Deposit Override</span>
          </label>

          {manualDepositOverride && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label="Override Amount (Rs) *">
                <Input
                  type="number"
                  min={0}
                  value={manualDepositAmount}
                  onChange={(e) => onManualDepositAmount(e.target.value)}
                  placeholder="0"
                  style={inputStyle}
                />
              </Field>
              <Field label="Override Reason *">
                <Input
                  value={depositOverrideReason}
                  onChange={(e) => onDepositOverrideReason(e.target.value)}
                  placeholder="e.g. Low risk repeat client with corporate guarantee"
                  style={inputStyle}
                />
              </Field>
              <Field label="Authorized By *">
                <Input
                  value={depositAuthorizedBy}
                  onChange={(e) => onDepositAuthorizedBy(e.target.value)}
                  placeholder="e.g. Managing Director Babin"
                  style={inputStyle}
                />
              </Field>
            </div>
          )}

          {pricing.securityDeposit.validationErrors.length > 0 && (
            <div
              style={{
                marginTop: 9,
                padding: 10,
                borderRadius: 'var(--r-btn)',
                background: 'var(--st-danger-bg)',
              }}
            >
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

          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--t-meta)',
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            <strong>Security Deposit Policy:</strong> Any security deposit required is held as a
            separate liability guarantee. It is never credited towards rental charges and does not
            reduce rental outstanding.
          </p>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--t-meta)',
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            <strong>Payment Recording:</strong> New Rental creates the booking reservation. Advance
            payments and security deposits are officially recorded with receipt numbers directly on
            the <strong>Booking Detail</strong> page once the booking and invoice are created.
          </p>
        </div>
      </div>
    </div>
  )
}
