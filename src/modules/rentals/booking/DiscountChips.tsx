import { TouchInset } from './BookingFormWidgets'

export interface DiscountPresetMeta {
  readonly pct: number
  readonly label: string
  readonly reason?: string
}

export const DISCOUNT_PRESETS: readonly DiscountPresetMeta[] = [
  { pct: 0, label: '0%' },
  { pct: 5, label: '5% (Repeat)', reason: 'Repeat Client Loyalty' },
  { pct: 10, label: '10% (Partner)', reason: 'Production Partner Discount' },
  { pct: 15, label: '15% (Weekly)', reason: 'Long-term / Weekly Production' },
  { pct: 20, label: '20% (Festival)', reason: 'Dashain / Festival Production Privilege' },
  { pct: 25, label: '25% (Promo)', reason: 'Promotional / Sponsorship Booking' },
] as const

export interface DiscountChipsProps {
  percent: number
  onPercent: (n: number) => void
  amount: string
  onSelectPreset?: (pct: number, reason?: string) => void
}

/**
 * The rail's `Discount  chips` row.
 *
 * Common presets, NOT a ceiling. Law 10 as amended 31 Aug 2026 (D3, Babin:
 * "don't put any gate on discount"): no reason, no approver, no cap below
 * 100%. The chips set a percent and nothing else needs to happen.
 * `validateDiscount()` still gates Confirm, but only on arithmetic
 * validity (negative, >100%), which no chip can produce.
 */
export function DiscountChips({
  percent,
  onPercent,
  amount,
  onSelectPreset,
}: DiscountChipsProps) {
  return (
    <div style={{ position: 'relative', padding: '3px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Discount</span>
        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: percent > 0 ? 'var(--danger-text)' : 'var(--text)', whiteSpace: 'nowrap' }}>
          {percent > 0 ? `− ${amount}` : amount}
        </span>
      </div>
      <div role="group" aria-label="Discount percentage" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
        {DISCOUNT_PRESETS.map((p) => {
          const active = percent === p.pct
          return (
            <button
              key={p.pct}
              type="button"
              className="press"
              aria-pressed={active}
              aria-label={`${p.pct}% discount`}
              title={p.reason ? `${p.label} — ${p.reason}` : `${p.pct}% discount`}
              onClick={() => {
                onPercent(p.pct)
                onSelectPreset?.(p.pct, p.reason)
              }}
              style={{
                position: 'relative',
                minHeight: 24,
                padding: '0 9px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${active ? 'var(--st-primary-fg)' : 'var(--border)'}`,
                background: active ? 'var(--st-primary-bg)' : 'var(--card2)',
                color: active ? 'var(--st-primary-fg)' : 'var(--text2)',
                fontFamily: 'inherit',
                fontSize: 'var(--t-th)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <TouchInset />
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
