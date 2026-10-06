import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Page'
import { formatMoney, type Paisa } from '../../../lib/money'
import { formatAd } from '../../../lib/bs'
import { MoneyRow } from './BookingFormWidgets'
import type { BlockingNotice } from './newRentalGuards'

export interface BookingSummaryCardProps {
  client?: { name: string } | null | undefined
  pickupAt?: Date | string | null | undefined
  pickupTime: string
  returnAt?: Date | string | null | undefined
  returnTime: string
  totalUnits: number
  days: number
  dayWord: string
  canBookingMoney: boolean
  pricing: {
    rentalTotalPaisa: Paisa
    securityDeposit: { requiredPaisa: Paisa }
    advanceRequiredPaisa: Paisa
  }
  blockingNotices: BlockingNotice[]
  runNoticeAction: (action: string) => void
}

export function BookingSummaryCard({
  client,
  pickupAt,
  pickupTime,
  returnAt,
  returnTime,
  totalUnits,
  days,
  dayWord,
  canBookingMoney,
  pricing,
  blockingNotices,
  runNoticeAction,
}: BookingSummaryCardProps) {
  return (
    <Card id="rail-booking-summary" title="Booking Summary">
      <dl className="new-rental-summary-context">
        <div>
          <dt>Client</dt>
          <dd>{client?.name || 'Select a client'}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>
            {pickupAt ? formatAd(new Date(pickupAt)) : 'Choose date'} · {pickupTime || 'Choose time'}
          </dd>
        </div>
        <div>
          <dt>Return</dt>
          <dd>
            {returnAt ? formatAd(new Date(returnAt)) : 'Choose date'} · {returnTime || 'Choose time'}
          </dd>
        </div>
        <div>
          <dt>Equipment</dt>
          <dd>
            {totalUnits} {totalUnits === 1 ? 'item' : 'items'} · {days > 0 ? `${days} ${dayWord}` : 'Check dates'}
          </dd>
        </div>
      </dl>
      {canBookingMoney ? (
        <>
          <div className="new-rental-bento-hero-total">
            <div className="new-rental-bento-hero-total-label">
              <span>Estimated Rental Total</span>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'none' }}>
                {days > 0 ? `${days} ${dayWord}` : 'Dates pending'}
              </span>
            </div>
            <div className="new-rental-bento-hero-total-val">
              {formatMoney(pricing.rentalTotalPaisa)}
            </div>
          </div>

          {/* Security Deposit (separate liability guarantee) and Advance Required */}
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--card2)',
              border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <MoneyRow
              label="Security Deposit (Refundable)"
              value={formatMoney(pricing.securityDeposit.requiredPaisa)}
              tone="var(--text2)"
            />
            <MoneyRow
              label="Advance Required"
              value={formatMoney(pricing.advanceRequiredPaisa)}
              tone="var(--text)"
              strong
            />
          </div>
        </>
      ) : (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          Prices are hidden for your role.
        </p>
      )}

      {blockingNotices.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div
            data-testid="booking-attention-status"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
              color: 'var(--st-danger-fg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'var(--t-meta)' }}>
              <Icon name="error" size={14} style={{ flexShrink: 0 }} />
              <span>
                {blockingNotices.length} {blockingNotices.length === 1 ? 'thing needs' : 'things need'} attention:
              </span>
            </div>
            <ul style={{ listStyle: 'disc', margin: '6px 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)' }}>
              {blockingNotices.map((n) => (
                <li key={n.text} style={{ lineHeight: 1.35 }}>
                  <span>{n.text}</span>
                  {n.action && (
                    <button
                      type="button"
                      className="press"
                      onClick={() => runNoticeAction(n.action!)}
                      style={{
                        display: 'inline-block',
                        minHeight: 44,
                        marginLeft: 6,
                        padding: '1px 8px',
                        borderRadius: 'var(--r-badge)',
                        border: '1px solid var(--st-danger-fg)',
                        background: 'transparent',
                        color: 'var(--st-danger-fg)',
                        fontSize: 'var(--t-th)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {n.action}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

    </Card>
  )
}
