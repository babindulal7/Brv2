/**
 * **Client history — "New Booking" spec §20.**
 *
 * §20 wants the existing "Client History" button to open a *compact drawer*
 * showing previous rentals, payment history, outstanding balance, late returns,
 * damaged items, missing items and recent bookings — and, like §11's quick
 * view, to **not navigate away**. Today that button calls
 * `navigate('/clients/:id')`, which discards a half-built booking to answer a
 * question that takes four seconds to read.
 *
 * ## What the data layer can and cannot back
 *
 * This drawer is mostly **honest gaps**, and that is the point. `src/data/` has
 * no per-client rental ledger and no per-client payment ledger:
 *
 * - `data/rentals.ts`' `ROWS` is the Rentals list's own seed. Its `client`
 *   field is a *display string* (`'ABC Films'`, `'Creative Studio'`) and those
 *   strings do not exist in `data/clients.ts` at all. Worse, the two layers
 *   contradict each other on ownership: `C-1` (Kathmandu Cinema Works)
 *   claims `B-715`, and `ROWS` attributes that exact booking number to
 *   "ABC Films". Joining them would print one client's project, dates and money
 *   under another client's name on a booking screen. So this component **does
 *   not join**. It shows the booking *numbers* the client record itself
 *   asserts, and takes richer rows only from the `bookings` prop — the seam for
 *   Phase 2's real per-client booking query.
 * - `data/booking.ts`' `PAYMENT_HISTORY` is two rows belonging to one demo
 *   booking. It is not client-scoped and is not shown here.
 *
 * ⚠ TODO(decision) — the `ROWS` / `CLIENTS_DATA` ownership contradiction above
 * is a real seed-data defect, not just a missing join. Whichever layer is wrong
 * needs correcting before any screen claims to list a client's bookings.
 */

import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Button'
import type { ClientRecord } from '../../../lib/queries/clients'
import { TOUCH } from './ClientHealthChip'
import { creditCheck } from './clientHealth'
import type { ClientHealthSignals } from './clientHealth'
import { Drawer, DrawerRow, DrawerSection, DrawerUnavailable } from './Drawer'

/**
 * One booking row, as supplied by the page. Everything beyond `bookingNo` is
 * optional because the only fact the client record itself carries is the
 * number — see the module note above.
 */
export interface ClientBookingSummary {
  bookingNo: string
  project?: string
  /** Pre-formatted AD label, same convention as `ClientRecord.lastRentalAd`. */
  dateLabel?: string
  /** Plain text, deliberately uncoloured — a coloured pill here would need an icon and a label to be lawful, and the status vocabulary is the Rentals list's, not this drawer's. */
  status?: string
  amountPaisa?: Paisa
  duePaisa?: Paisa
}

export interface ClientHistoryDrawerProps {
  client: ClientRecord
  open: boolean
  onClose: () => void
  /**
   * Real per-client bookings once they exist. Defaults to the booking numbers
   * on the client record, with no invented detail attached.
   */
  bookings?: readonly ClientBookingSummary[]
  /** Opening a booking is an explicit choice; the page decides how (route or tab). */
  onOpenBooking?: (bookingNo: string) => void
  /** Escape hatch to the full client record. The page routes; this never does. */
  onViewClient?: (client: ClientRecord) => void
  /** Pass the page's `canViewMoneyField(gctx, 'client-balance')`. */
  showMoney?: boolean
  /**
   * The same seam `ClientQuickView` takes. Only `creditUsedPaisa` is read here,
   * and only to decide whether the credit line can be stated at all — see
   * `creditCheck`. Absent (the case today) means the credit-limit check cannot
   * be run, and this drawer says so instead of printing a figure.
   */
  signals?: ClientHealthSignals
  id?: string
}

export function ClientHistoryDrawer({
  client,
  open,
  onClose,
  bookings,
  onOpenBooking,
  onViewClient,
  showMoney = true,
  signals,
  id = 'client-history-drawer',
}: ClientHistoryDrawerProps) {
  const rows: ClientBookingSummary[] =
    bookings && bookings.length > 0
      ? [...bookings]
      : client.activeBookings.map((bookingNo) => ({ bookingNo }))

  const reliability = client.reliability
  const depositPending = null // Deposit *pending* is a per-booking figure; the client record only holds deposit held.
  const credit = creditCheck(client, signals)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      id={id}
      title="Client History"
      subtitle={`${client.name} · ${client.id}`}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {onViewClient && (
            <Button variant="primary" icon="external_link" onClick={() => onViewClient(client)}>
              View Client
            </Button>
          )}
        </>
      }
    >
      {/* ── Outstanding balance ───────────────────────────────────────── */}
      <DrawerSection title="Outstanding Balance">
        {showMoney ? (
          <DrawerRow
            label="Rental outstanding"
            value={formatMoney(client.outstandingPaisa)}
            figure
            {...(client.outstandingPaisa > 0 ? { tone: 'danger' as const } : { tone: 'success' as const })}
          />
        ) : (
          <DrawerRow
            label="Rental outstanding"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', color: 'var(--muted)' }}>
                <Icon name="lock" size={12} />
                Restricted
              </span>
            }
          />
        )}
        {/*
          This row used to print `creditUsedPaisa` as a fact. It is not one —
          the field has no column and no ruled formula behind it, so a real
          client's "credit used" is Rs 0 by construction. Printing "Rs 0 of
          Rs 500,000" beside an outstanding balance states that the client has
          committed nothing against their facility, which nothing in the system
          knows. `creditCheck` reports that as `unavailable` and the row becomes
          the honest em-dash.
        */}
        {showMoney && credit.state === 'computed' && (
          <DrawerRow
            label="Credit used of limit"
            value={`${formatMoney(credit.usedPaisa)} of ${formatMoney(credit.limitPaisa)}`}
            figure
          />
        )}
        {showMoney && credit.state === 'unavailable' && (
          <>
            <DrawerRow
              label="Credit used of limit"
              value={null}
              unavailableNote="Not computed anywhere in the system — there is no credit-used column and no ruled formula, so how much of this limit is committed is unknown."
            />
            <DrawerUnavailable>
              A credit limit of {formatMoney(credit.limitPaisa)} is approved, but nothing computes how much
              of it is used — so the credit-limit check cannot be run and this client is{' '}
              <strong>unverified</strong>, not confirmed within limit.
            </DrawerUnavailable>
          </>
        )}
        {showMoney && credit.state === 'not-applicable' && (
          <DrawerRow label="Credit used of limit" value="No credit limit configured" />
        )}
      </DrawerSection>

      {/*
        Deposits are liabilities — Foundation §2.2 / PLAN.md §0. They get their
        own block and are never added to, netted against, or shown beside the
        rental outstanding above as if they were the same kind of money.
      */}
      {showMoney && (
        <DrawerSection title="Deposit — Liability, Not Revenue">
          <DrawerRow label="Deposit held" value={formatMoney(client.depositHeldPaisa)} figure />
          <DrawerRow
            label="Deposit pending"
            value={depositPending}
            unavailableNote="Not tracked at client level — deposit pending is a per-booking figure and lives on the booking."
          />
          <DrawerUnavailable>
            Held deposits are refundable client money. They are never part of the outstanding balance above.
          </DrawerUnavailable>
        </DrawerSection>
      )}

      {/* ── Recent bookings ───────────────────────────────────────────── */}
      <DrawerSection title="Recent Bookings">
        {rows.length === 0 ? (
          <DrawerUnavailable>No bookings are recorded against this client.</DrawerUnavailable>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {rows.map((b) => {
              const meta = [b.project, b.dateLabel, b.status].filter(Boolean).join(' · ')
              const inner = (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
                    <span className="booking-id" style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
                      {b.bookingNo}
                    </span>
                    {showMoney && b.amountPaisa !== undefined && (
                      <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                        {formatMoney(b.amountPaisa)}
                      </span>
                    )}
                  </div>
                  {meta && (
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      {b.project}{b.project && (b.dateLabel || b.status) ? ' · ' : ''}
                      {b.dateLabel && <span style={{ color: 'var(--booking-date-text)' }}>{b.dateLabel}</span>}
                      {b.dateLabel && b.status ? ' · ' : ''}{b.status}
                    </div>
                  )}
                  {showMoney && b.duePaisa !== undefined && b.duePaisa > 0 && (
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
                      {formatMoney(b.duePaisa)} due
                    </div>
                  )}
                </>
              )
              return (
                <li key={b.bookingNo}>
                  {onOpenBooking ? (
                    <button
                      type="button"
                      className="press"
                      onClick={() => onOpenBooking(b.bookingNo)}
                      style={{
                        display: 'grid',
                        gap: 2,
                        width: '100%',
                        minHeight: TOUCH,
                        padding: '8px 10px',
                        textAlign: 'left',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gap: 2,
                        minHeight: TOUCH,
                        padding: '8px 10px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                      }}
                    >
                      {inner}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {!bookings && (
          <DrawerUnavailable>
            Booking numbers come from this client&apos;s own record. Project, dates and amounts are not shown
            because the bookings seed layer attributes these numbers to different client names — joining the
            two would print another client&apos;s figures here.
          </DrawerUnavailable>
        )}
      </DrawerSection>

      {/* ── Previous rentals ──────────────────────────────────────────── */}
      <DrawerSection title="Previous Rentals">
        <DrawerRow label="Lifetime rentals" value={client.totalRentalsCount} figure />
        {showMoney && <DrawerRow label="Lifetime spend" value={formatMoney(client.totalSpentPaisa)} figure />}
        <DrawerRow label="Currently on rent" value={client.currentRentalsCount} figure />
        <DrawerRow label="Last rental" value={<span style={{ color: client.lastRentalAd && client.lastRentalAd !== '—' ? 'var(--booking-date-text)' : undefined }}>{client.lastRentalAd}</span>} figure />
        <DrawerRow label="Client since" value={client.clientSinceAd ?? null} unavailableNote="Not recorded on this client." figure />
        <DrawerUnavailable>
          An itemised list of completed rentals is not available — no per-client rental ledger exists in the
          data layer yet. The figures above are the aggregates the client record maintains.
        </DrawerUnavailable>
      </DrawerSection>

      {/* ── Payment history ───────────────────────────────────────────── */}
      <DrawerSection title="Payment History">
        <DrawerUnavailable>
          Not available yet — payments are recorded against a booking, and there is no client-scoped payment
          ledger in the data layer. Payments for a specific booking are on that booking&apos;s page.
        </DrawerUnavailable>
        <DrawerRow
          label="Payment terms"
          value={client.paymentTerms ?? null}
          unavailableNote="Not recorded on this client."
        />
      </DrawerSection>

      {/* ── Reliability: late returns, damaged, missing ───────────────── */}
      <DrawerSection title="Late Returns, Damage & Missing Items">
        {reliability ? (
          <>
            <DrawerRow
              label="Late returns"
              value={`${reliability.lateReturns} of ${reliability.totalReturns} returns`}
              figure
              {...(reliability.lateReturns > 0 ? { tone: 'warning' as const } : { tone: 'success' as const })}
            />
            <DrawerRow
              label="Average days late"
              value={reliability.avgDaysLateOverall}
              figure
              {...(reliability.avgDaysLateOverall > 1 ? { tone: 'warning' as const } : {})}
            />
            <DrawerRow
              label="Damage cases"
              value={reliability.damageCases}
              figure
              {...(reliability.damageCases > 0 ? { tone: 'warning' as const } : {})}
            />
            <DrawerRow
              label="Missing-item cases"
              value={reliability.missingCases}
              figure
              {...(reliability.missingCases > 0 ? { tone: 'warning' as const } : {})}
            />
            <DrawerUnavailable>
              Lifetime case counts. The record carries no resolution state, so a settled case and an open one
              are indistinguishable here — treat these as history, not as open items.
            </DrawerUnavailable>
          </>
        ) : (
          <DrawerUnavailable>
            No reliability record exists for this client. That is not the same as a clean record — late
            returns, damage and missing items have simply never been captured for them.
          </DrawerUnavailable>
        )}
      </DrawerSection>
    </Drawer>
  )
}
