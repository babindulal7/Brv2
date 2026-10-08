import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Page'
import { formatMoney, type Paisa } from '../../../lib/money'
import { BsAdDate } from '../../../components/ui/BsAdDate'
import type { BlockingNotice } from './newRentalGuards'
import './booking-summary-card.css'

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
  /** Shown without blocking Confirm — e.g. a missing client ID/PAN. */
  advisories?: BlockingNotice[]
  validationAttempted?: boolean
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
  advisories = [],
  validationAttempted = false,
  runNoticeAction,
}: BookingSummaryCardProps) {
  const noticeList = (notices: BlockingNotice[]) => (
    <ul className="new-rental-review-notices">
      {notices.map((n) => (
        <li key={n.text}>
          <span>{n.text}</span>
          {n.action && (
            <button
              type="button"
              className="press new-rental-review-notice-action"
              onClick={() => runNoticeAction(n.action!)}
            >
              <span>{n.action}</span>
              <Icon name="arrow_right" size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
  // RULING 2026-10-08: review follows the form's real blockers and keeps their
  // existing actions; layout changes must never invent a new confirmation gate.
  return (
    <Card id="rail-booking-summary" title="Booking Summary" bodyStyle={{ padding: 16 }}>
      <div className="new-rental-review">
        <dl className="new-rental-review-context">
          <div className="new-rental-review-client">
            <dt>Client</dt>
            <dd>{client?.name || 'Select a client'}</dd>
          </div>
          <div className="new-rental-review-items">
            <dt>Equipment</dt>
            <dd>
              {totalUnits} {totalUnits === 1 ? 'item' : 'items'} · {days > 0 ? `${days} ${dayWord}` : 'Check dates'}
            </dd>
          </div>
        </dl>
        <dl className="new-rental-review-dates">
          <div>
            <dt><Icon name="calendar" size={14} /> Pickup</dt>
            <dd>
              {pickupAt ? <BsAdDate date={pickupAt} tone="booking" /> : 'Choose date'}
              <span className="new-rental-review-time" style={{ color: pickupAt ? 'var(--booking-date-text)' : undefined }}>{pickupTime || 'Choose time'}</span>
            </dd>
          </div>
          <div>
            <dt><Icon name="calendar" size={14} /> Return</dt>
            <dd>
              {returnAt ? <BsAdDate date={returnAt} tone="booking" /> : 'Choose date'}
              <span className="new-rental-review-time" style={{ color: returnAt ? 'var(--booking-date-text)' : undefined }}>{returnTime || 'Choose time'}</span>
            </dd>
          </div>
        </dl>
        {canBookingMoney ? (
          <div className="new-rental-review-money">
            <div className="new-rental-review-total">
              <span>Estimated Rental Total</span>
              <strong>
                {formatMoney(pricing.rentalTotalPaisa)}
              </strong>
            </div>

            {/* Security Deposit (separate liability guarantee) and Advance Required */}
            <dl className="new-rental-review-payments">
              <div>
                <dt>Security Deposit <span>(Refundable)</span></dt>
                <dd>{formatMoney(pricing.securityDeposit.requiredPaisa)}</dd>
              </div>
              <div>
                <dt>Advance Required</dt>
                <dd>{formatMoney(pricing.advanceRequiredPaisa)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="new-rental-review-role-note">
            Prices are hidden for your role.
          </p>
        )}

        {blockingNotices.length > 0 ? (
          <div
            data-testid="booking-attention-status"
            className={`new-rental-review-attention${validationAttempted ? ' new-rental-review-attention--error' : ''}`}
          >
            <div className="new-rental-review-status-heading">
              <Icon name={validationAttempted ? 'error' : 'checklist'} size={17} />
              <h3>{validationAttempted ? 'Needs attention' : 'Before confirming'}</h3>
            </div>
            <p className="new-rental-review-status-copy">
              {validationAttempted ? `${blockingNotices.length} ${blockingNotices.length === 1 ? 'thing needs' : 'things need'} attention:` : `${blockingNotices.length} ${blockingNotices.length === 1 ? 'thing' : 'things'} left before confirming`}
            </p>
            {noticeList(blockingNotices)}
          </div>
        ) : (
          <div className="new-rental-review-ready">
            <Icon name="check" size={17} />
            <span>Ready to confirm</span>
          </div>
        )}

        {advisories.length > 0 && (
          <div
            data-testid="booking-advisories"
            className="new-rental-review-advisories"
          >
            <div className="new-rental-review-status-heading">
              <Icon name="info" size={17} />
              <h3>Worth checking</h3>
            </div>
            <p className="new-rental-review-status-copy">Does not block confirming</p>
            {noticeList(advisories)}
          </div>
        )}
      </div>
    </Card>
  )
}
