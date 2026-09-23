import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { InfoTooltip } from '../../components/ui/InfoTooltip'
import { Card, PageHeader, FooterNote, cardStyle } from '../../components/ui/Page'
import { useViewport } from '../../lib/device'
import { price, formatMoney, parseMoney, rupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { validateDiscount } from '../../lib/discount'
import { getSetting } from '../../lib/settingsStore'
import { isMoneySurface } from '../../lib/queries/tools'

/**
 * **Pricing Calculator — `10_TOOLS.md` §10.3.**
 *
 * ```
 * ┌ ← Pricing ───────────────────────────────┐
 * │ items ＋   qty · days · rate             │
 * │ discount chips  ▢ ▢ ▢   custom %         │
 * │ VAT ▢                                    │
 * │ subtotal · discount · VAT · TOTAL        │
 * │ advance due · deposit (separate)         │
 * │                        [Use in a booking]│
 * └──────────────────────────────────────────┘
 * Same engine as New Rental — a quote sandbox, it books nothing.
 * PHONE: stacked, sticky total bar.
 * ```
 *
 * ## The engine, not a second one
 *
 * Law 1 and §10.3's own sentence: every figure below comes from `lib/money.ts`'s
 * `price()` — the same call New Rental makes, in the same order, with the same
 * whole-rupee rounding at each step. Nothing here multiplies a rate by a VAT
 * percentage. If this page and the booking page ever disagree about a total,
 * one of them is not calling the engine, and it is not this one.
 *
 * ## Three laws this screen has to carry even though it saves nothing
 *
 * **Law 10 — discount, as amended 31 Aug 2026: THE GATE IS GONE.** D3 (ruled
 * 30 Aug, Babin's final word 31 Aug: "don't put any gate on discount") removed
 * the reason/approver ceremony, the 25% cap and the role tiers everywhere in
 * one change set. `validateDiscount()` still gates the total, but it now
 * checks only arithmetic validity — negative is a price rise (the R3-1 hole
 * stays closed), above 100% is a negative price. The chips are common presets,
 * not a ceiling; the custom field takes anything valid.
 *
 * **Law 5 — the deposit is a liability.** It is never in the rental total, never
 * reduces outstanding, and is never a payment. It renders in its own block,
 * below a rule, labelled as refundable — which is why it is not simply another
 * row in the ladder.
 *
 * **§5 Conventions — never a hardcoded VAT rate.** The rate is read from
 * `lib/settingsStore.ts`'s `vatRatePercent` and the label renders `VAT {rate}%`.
 * `NewRental.tsx`'s `VAT_PCT = 13` is the violation this screen must not repeat.
 *
 * ## What "advance due" is, and is not
 *
 * §10.3 draws it. Nothing in this build derives it: no settings key holds an
 * advance percentage, and the deposit-% -per-category the Financial section is
 * supposed to carry does not exist either. So both are **entered**, and the
 * absence is stated on the control rather than filled with a plausible 30%.
 * *"Never fabricate a figure"* — Rulings §8.
 *
 * `[Use in a booking]` is drawn by the spec and is a stated `Unavailable`: New
 * Rental owns the draft it would have to hand off to, this page owns no write
 * path, and a button that navigates away silently discarding the sheet would be
 * worse than one that says what is missing.
 */

interface Line {
  id: number
  label: string
  qty: string
  days: string
  rate: string
}

/** Law 9 — days are explicit on every priced line, defaulted to `1`, never by omission. */
const NEW_LINE = (id: number): Line => ({ id, label: '', qty: '1', days: '1', rate: '' })

/**
 * §10.3's `▢ ▢ ▢` — common presets, NOT a ceiling. The old cap (`DISCOUNT_CAP`
 * when it read 25) left with the gate; the custom field beside these takes any
 * valid percentage.
 */
const DISCOUNT_CHIPS = [0, 5, 10, 15, 20, 25] as const

export default function PricingCalculator() {
  const navigate = useNavigate()
  const viewport = useViewport()
  const isMoney = isMoneySurface('/tools/pricing')

  const [lines, setLines] = useState<Line[]>([NEW_LINE(1)])
  const [nextId, setNextId] = useState(2)

  const [discountChip, setDiscountChip] = useState<number | null>(0)
  const [customDiscount, setCustomDiscount] = useState('')

  const [vatOn, setVatOn] = useState(true)
  const [advance, setAdvance] = useState('')
  const [deposit, setDeposit] = useState('')

  /** §5 Conventions — read, never typed. `13` appears nowhere in this file. */
  const vatRatePercent = Number(getSetting('vatRatePercent'))

  const requested = customDiscount.trim() !== '' ? Number(customDiscount) : (discountChip ?? 0)
  const discountPercent = Number.isFinite(requested) ? requested : 0

  /* Law 10 as amended (D3, Babin's final word 31 Aug: "don't put any gate on
     discount") — no reason, no approver, no cap below 100. The gate that
     remains is arithmetic validity only, so the old reason/approver fields
     are gone: an input that influences nothing is a control that lies. */
  const gate = validateDiscount(discountPercent)

  const equipment = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const rate = parseMoney(l.rate)
        const qty = Number(l.qty)
        const days = Number(l.days)
        if (rate === null || !Number.isFinite(qty) || !Number.isFinite(days)) return sum
        return sum + rate * Math.max(0, qty) * Math.max(0, days)
      }, 0) as Paisa,
    [lines],
  )

  /* An unapproved discount is not applied. The ladder shows the undiscounted
     figures and the banner says why — never a total the gate has refused. */
  const appliedDiscount = gate.valid ? discountPercent : 0

  const handleCreateBookingFromQuote = () => {
    const validLines = lines
      .filter((l) => l.label.trim() !== '' || parseMoney(l.rate) !== null)
      .map((l) => ({
        label: l.label.trim() || 'Custom Item',
        qty: Math.max(1, Number(l.qty) || 1),
        days: Math.max(1, Number(l.days) || 1),
        ratePaisa: parseMoney(l.rate) ?? 0,
      }))

    navigate('/rentals/new', {
      state: {
        quote: {
          lines: validLines,
          discountPct: appliedDiscount,
        },
      },
    })
  }

  const breakdown = price({
    equipment,
    discountPercent: appliedDiscount,
    vatPercent: vatOn ? vatRatePercent : 0,
    payments: rupees(0),
  })

  const advancePaisa = parseMoney(advance)
  const depositPaisa = parseMoney(deposit)

  function patch(id: number, field: keyof Omit<Line, 'id'>, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  const stacked = viewport !== 'desktop'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="dollar"
        title="Pricing"
        description={isMoney ? "A quote sandbox on the same engine as New Rental. It books nothing and saves nothing." : "A quote sandbox."}
      />

      <div
        style={{
          display: 'grid',
          /* Desktop: sheet beside the ladder. Below 1280 the ladder reflows
             underneath — visible, not hidden behind a handle (Rulings §7). */
          gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(300px, 340px)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Card
            title="Items"
            action={
              <button
                type="button"
                onClick={() => {
                  setLines((prev) => [...prev, NEW_LINE(nextId)])
                  setNextId((n) => n + 1)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--btn-secondary-border)',
                  background: 'var(--btn-secondary-bg)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={14} />
                Add item
              </button>
            }
            bodyStyle={{ padding: 0 }}
          >
            {lines.map((l) => (
              <div
                key={l.id}
                style={{
                  display: 'grid',
                  /* Phone stacks the four fields; tablet and desktop keep the
                     spec's `qty · days · rate` on one row beside the label. */
                  gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,2fr) 80px 80px minmax(0,1fr) auto',
                  gap: 'var(--sp-sm)',
                  alignItems: 'end',
                  padding: 14,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <LabelledInput label="Item" value={l.label} onChange={(v) => patch(l.id, 'label', v)} placeholder="Description" />
                <LabelledInput label="Qty" value={l.qty} onChange={(v) => patch(l.id, 'qty', v)} numeric />
                <LabelledInput label="Days" value={l.days} onChange={(v) => patch(l.id, 'days', v)} numeric />
                <LabelledInput label="Rate / day" value={l.rate} onChange={(v) => patch(l.id, 'rate', v)} numeric placeholder="Rs" />
                <button
                  type="button"
                  aria-label={`Remove ${l.label || 'item'}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: lines.length === 1 ? 'var(--muted)' : 'var(--text2)',
                    cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                    opacity: lines.length === 1 ? 0.5 : 1,
                    justifySelf: viewport === 'phone' ? 'start' : 'auto',
                  }}
                >
                  <Icon name="minus" size={15} />
                </button>
              </div>
            ))}
            <p style={{ margin: 0, padding: '0 14px 14px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Law 9 — days are explicit on every priced line, never implied. A blank rate contributes nothing rather than zero.
            </p>
          </Card>

          <Card title="Discount">
            <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
              {DISCOUNT_CHIPS.map((pct) => {
                const on = customDiscount.trim() === '' && discountChip === pct
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setDiscountChip(pct)
                      setCustomDiscount('')
                    }}
                    style={{
                      minHeight: 44,
                      padding: '0 15px',
                      borderRadius: 'var(--r-btn)',
                      border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                      background: on ? 'var(--btn-primary-bg)' : 'var(--card2)',
                      color: on ? 'var(--btn-primary-fg)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {pct}%
                  </button>
                )
              })}
              <input
                inputMode="decimal"
                aria-label="Custom discount percent"
                placeholder="Custom %"
                value={customDiscount}
                onChange={(e) => setCustomDiscount(e.target.value)}
                style={{ ...controlStyle, width: 120, minHeight: 44 }}
              />
            </div>

            {/* Law 12 — inline and persistent. No toast carries a failure. */}
            {!gate.valid && gate.error && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 9,
                  marginTop: 'var(--sp-md)',
                  padding: '11px 12px',
                  borderRadius: 'var(--r-card)',
                  background: 'var(--st-danger-bg)',
                  color: 'var(--st-danger-fg)',
                }}
              >
                <Icon name="alert_triangle" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
                  {gate.error} The ladder shows the undiscounted figures until this clears — no role bypasses it, Owner
                  included.
                </span>
              </div>
            )}
          </Card>

          <Card title="Tax, advance and deposit">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={vatOn} onChange={() => setVatOn((v) => !v)} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {/* Never a literal. Rate comes from Settings ▸ Financial. */}
                  VAT <span className="figure">{vatRatePercent}%</span>
                  <InfoTooltip content="Read from Settings, never hardcoded" />
                </span>
              </label>

              <LabelledInput
                label="Advance due"
                value={advance}
                onChange={setAdvance}
                numeric
                placeholder="Rs"
                hint="Entered, not derived — no advance percentage is configured anywhere in this build."
              />
              <LabelledInput
                label="Security deposit"
                value={deposit}
                onChange={setDeposit}
                numeric
                placeholder="Rs"
                hint="Law 5 — a liability. It is shown separately below and never enters the rental total."
              />
            </div>
          </Card>
        </div>

        {/* ── the ladder ─────────────────────────────────────────────────── */}
        <div
          style={{
            ...cardStyle,
            padding: 'var(--sp-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-sm)',
            minWidth: 0,
            /* PHONE: "sticky total bar" — the ladder itself sticks to the
               bottom of the viewport once the sheet is longer than the screen. */
            position: viewport === 'phone' ? 'sticky' : 'static',
            bottom: viewport === 'phone' ? 0 : undefined,
            zIndex: viewport === 'phone' ? 5 : undefined,
          }}
        >
          <h2 style={{ margin: '0 0 4px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Quote</h2>

          <Row label="Subtotal" value={formatMoney(breakdown.subtotal)} />
          <Row
            label={appliedDiscount > 0 ? `Discount ${appliedDiscount}%` : 'Discount'}
            value={`− ${formatMoney(breakdown.discount)}`}
          />
          <Row label="Taxable" value={formatMoney(breakdown.taxable)} muted />
          <Row label={vatOn ? `VAT ${vatRatePercent}%` : 'VAT (off)'} value={formatMoney(breakdown.vat)} />

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <Row label="Total" value={formatMoney(breakdown.rentalTotal)} strong />

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 4px' }} />

          <Row
            label="Advance due"
            value={advancePaisa === null ? 'Not entered' : formatMoney(advancePaisa)}
            muted={advancePaisa === null}
          />

          {/* Law 5 — separated by a rule and labelled, so it can never be read
              as part of the total above it. */}
          <div
            style={{
              marginTop: 'var(--sp-sm)',
              padding: '11px 12px',
              borderRadius: 'var(--r-card)',
              border: '1px dashed var(--border)',
              background: 'var(--card2)',
            }}
          >
            <Row
              label="Security deposit"
              value={depositPaisa === null ? 'Not entered' : formatMoney(depositPaisa)}
              muted={depositPaisa === null}
            />
            <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Refundable. Not part of the total, not a payment, and it never reduces what is outstanding.
            </p>
          </div>

          <Button
            variant="primary"
            icon="file"
            onClick={handleCreateBookingFromQuote}
            style={{
              width: '100%',
              minHeight: 44,
              justifyContent: 'center',
              marginTop: 'var(--sp-md)',
              fontWeight: 600,
            }}
          >
            Create Booking from Quote
          </Button>
        </div>
      </div>

      <FooterNote extra={['Quote sandbox — nothing here is booked, invoiced or stored']} />
    </div>
  )
}

/* ── small parts ───────────────────────────────────────────────────────── */

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: strong ? 'var(--t-ui)' : 'var(--t-meta)', fontWeight: strong ? 700 : 500, color: 'var(--text2)' }}>
        {label}
      </span>
      <span
        className="figure"
        style={{
          fontSize: strong ? 'var(--t-h4, 18px)' : 'var(--t-meta)',
          fontWeight: strong ? 700 : 600,
          color: muted ? 'var(--muted)' : 'var(--text)',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  numeric?: boolean
  hint?: string
}): ReactNode {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {label}
        </span>
        {hint && <InfoTooltip content={hint} />}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(numeric ? { inputMode: 'decimal' as const } : {})}
        style={controlStyle}
      />
    </label>
  )
}

const controlStyle: CSSProperties = {
  width: '100%',
  /* Law 15 — 44×44 at every width. */
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-body)',
  fontFamily: 'inherit',
}
