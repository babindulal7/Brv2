/**
 * **Client quick view — "New Booking" spec §11 and §14.**
 *
 * §11: an eye control sits at the right of the Client field, and *the eye is
 * both the quick-view action and the health indicator*. §11 is also explicit
 * that it **must not navigate away** — checking whether a client owes money is
 * not worth losing a half-built booking, which is exactly what a route change
 * to `/clients/:id` costs today. So this is a drawer over the workspace, and
 * the one control that does leave (`[View Client]`) is an explicit, labelled
 * choice at the bottom, raised as a callback so the page owns the routing.
 *
 * §14's section list is rendered exactly: CLIENT STATUS, FINANCIAL, EQUIPMENT,
 * RENTAL HISTORY, Last Rental, [View Client].
 *
 * ## Honesty rule
 *
 * Several §14 figures have no field behind them in `src/data/clients.ts`. Every
 * one of those renders an em-dash carrying a `title` that says *what* is not
 * tracked and *why* — never a 0, and never a plausible invented number. A zero
 * on a line called "Unreturned" is a claim that the client has nothing out; the
 * data cannot support that claim, so it is not made. Where the record *does*
 * carry a number but it means something narrower than the §14 label suggests
 * (lifetime damage/missing *cases*, which have no resolution state), the row
 * label says so rather than letting the heading imply currency.
 */

import { formatMoney } from '../../../lib/money'
import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Page'
import type { ClientRecord } from '../../../data/clients'
import { CLIENT_HEALTH_THRESHOLDS, clientHealth, creditCheck } from './clientHealth'
import type { ClientHealthSignals } from './clientHealth'
import { ClientHealthChip, ClientHealthReasons } from './ClientHealthChip'
import { Drawer, DrawerRow, DrawerSection, DrawerUnavailable } from './Drawer'

export interface ClientQuickViewProps {
  client: ClientRecord
  open: boolean
  onClose: () => void
  /** `[View Client]`. The page routes; this component never does. */
  onViewClient: (client: ClientRecord) => void
  /** Pass the page's `canViewMoneyField(gctx, 'client-balance')`. */
  showMoney?: boolean
  /** Real signals once Phase 2 supplies them — see `ClientHealthSignals`. */
  signals?: ClientHealthSignals
  /** DOM id, so the eye's `aria-controls` can point at the panel. */
  id?: string
}

const RESTRICTED = (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', color: 'var(--muted)' }}>
    <Icon name="lock" size={12} />
    Restricted
  </span>
)

export function ClientQuickView({
  client,
  open,
  onClose,
  onViewClient,
  showMoney = true,
  signals,
  id = 'client-quick-view',
}: ClientQuickViewProps) {
  const verdict = signals ? clientHealth(client, signals) : clientHealth(client)
  /**
   * Three states, not a ratio-or-null. `unavailable` means a credit limit IS
   * configured but nothing computes how much of it is used, so this panel may
   * not print a percentage — see `creditCheck`. It renders the em-dash and says
   * why, and the health chip above is already holding the client at Attention
   * for the same reason.
   */
  const credit = creditCheck(client, signals)

  /**
   * §14's "Payment Status", from what the record actually knows.
   *
   * ⚠ TODO(decision) — a real payment status needs invoice due dates, and no
   * invoice source exists in `src/data/` (see `ClientHealthSignals`). "Overdue"
   * is therefore *not* a value this can return; On-Stop is the strongest state
   * the data supports. Stated in the panel rather than implied.
   */
  const paymentStatus: { text: string; tone: 'danger' | 'warning' | 'success' } =
    client.isBlocked || client.onStop
      ? { text: 'On Stop', tone: 'danger' }
      : client.outstandingPaisa > 0
        ? { text: 'Balance due', tone: 'warning' }
        : { text: 'Clear', tone: 'success' }

  const reliability = client.reliability

  /**
   * "Completed" is not stored. `reliability.totalReturns` is the real figure
   * where a record carries it; otherwise this is a stated derivation
   * (lifetime rentals minus the ones still running), and the `title` says so
   * on the row so nobody reads a derived number as a recorded one.
   */
  const completed =
    reliability?.totalReturns ?? Math.max(0, client.totalRentalsCount - client.currentRentalsCount)
  const completedIsDerived = reliability?.totalReturns === undefined

  return (
    <Drawer
      open={open}
      onClose={onClose}
      id={id}
      title="Client Status"
      subtitle={`${client.name} · ${client.id}`}
      width={400}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon="external_link" onClick={() => onViewClient(client)}>
            View Client
          </Button>
        </>
      }
    >
      {/* ── CLIENT STATUS ─────────────────────────────────────────────── */}
      <DrawerSection title="Client Status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)', minWidth: 0 }}>
            {client.name}
          </span>
          {/*
            * The drawer's copy of `ClientCombobox`'s VIP chip, and it carried
            * the same bug: `--ext-line` + `--gold`, which v4.1 §2 reserves for
            * sub-rented / external gear and forbids as a status outright. See
            * the long note at `ClientCombobox.tsx` for the full reasoning; the
            * short version is that a VIP client is not external gear, and blue
            * ("committed · scheduled", §2) is the one hue of the seven that
            * describes a standing client relationship.
            *
            * Both copies now render the same <Badge>, so the drawer and the
            * option row cannot drift apart the way they already had — this one
            * was 20px at radius 999, the other 18px at radius 999, neither
            * matching §4's block.
            */}
          {client.isVip && <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 7px',
                      borderRadius: 'var(--r-chip)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-th)',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                    }}
                  >
                    VIP
                  </span>}
          <ClientHealthChip verdict={verdict} size="md" style={{ marginLeft: 'auto' }} />
        </div>
        {client.company && (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{client.company}</div>
        )}
        {/* The colour never travels alone — these are the sentences behind it. */}
        <ClientHealthReasons verdict={verdict} />
      </DrawerSection>

      {/* ── FINANCIAL ─────────────────────────────────────────────────── */}
      <DrawerSection title="Financial">
        <DrawerRow
          label="Outstanding"
          value={showMoney ? formatMoney(client.outstandingPaisa) : RESTRICTED}
          figure
          {...(showMoney && client.outstandingPaisa > 0 ? { tone: 'danger' as const } : {})}
        />
        <DrawerRow
          label="Credit limit"
          value={
            !showMoney
              ? RESTRICTED
              : client.creditLimitPaisa > 0
                ? formatMoney(client.creditLimitPaisa)
                : 'Not configured'
          }
          figure={showMoney && client.creditLimitPaisa > 0}
        />
        {showMoney && credit.state === 'computed' && (
          <DrawerRow
            label="Credit used"
            value={`${formatMoney(credit.usedPaisa)} · ${Math.round(credit.ratio * 100)}%`}
            figure
            {...(credit.ratio > 1
              ? { tone: 'danger' as const }
              : credit.ratio >= CLIENT_HEALTH_THRESHOLDS.creditLimitApproachingRatio
                ? { tone: 'warning' as const }
                : {})}
          />
        )}
        {showMoney && credit.state === 'unavailable' && (
          <DrawerRow
            label="Credit used"
            value={null}
            unavailableNote="Not computed anywhere in the system — there is no credit-used column and no ruled formula, so the credit-limit check cannot be run for this client."
          />
        )}
        <DrawerRow label="Payment status" value={paymentStatus.text} tone={paymentStatus.tone} />
        {showMoney && credit.state === 'unavailable' && (
          <DrawerUnavailable>
            <strong>The credit-limit check could not be run.</strong> A limit of{' '}
            {formatMoney(credit.limitPaisa)} is approved, but nothing in the system computes how much of it
            is committed — so this client is <strong>unverified</strong>, which is not the same as within
            limit. The health above is held at Attention Required until a credit-used figure exists.
          </DrawerUnavailable>
        )}
        <DrawerUnavailable>
          Invoice-level status (overdue, days past due) is not tracked yet — no invoice source exists in the
          data layer, so this reflects the client balance only.
        </DrawerUnavailable>
      </DrawerSection>

      {/* ── EQUIPMENT ─────────────────────────────────────────────────── */}
      <DrawerSection title="Equipment">
        <DrawerRow
          label="Unreturned (open)"
          value={null}
          unavailableNote="Not tracked yet — no booking return date is recorded against a client in the current data layer."
        />
        <DrawerRow
          label="Missing — cases on record"
          value={reliability ? reliability.missingCases : null}
          unavailableNote="Not tracked for this client — the reliability record is absent."
          figure
          {...(reliability && reliability.missingCases > 0 ? { tone: 'warning' as const } : {})}
        />
        <DrawerRow
          label="Damaged — cases on record"
          value={reliability ? reliability.damageCases : null}
          unavailableNote="Not tracked for this client — the reliability record is absent."
          figure
          {...(reliability && reliability.damageCases > 0 ? { tone: 'warning' as const } : {})}
        />
        <DrawerUnavailable>
          These are <strong>lifetime case counts</strong>, not open items — the record carries no resolution
          state, so a settled case and an open one look the same here.
        </DrawerUnavailable>
      </DrawerSection>

      {/* ── RENTAL HISTORY ────────────────────────────────────────────── */}
      <DrawerSection title="Rental History">
        <DrawerRow label="Total rentals" value={client.totalRentalsCount} figure />
        <DrawerRow
          label={completedIsDerived ? 'Completed (derived)' : 'Completed'}
          value={
            completedIsDerived ? (
              <span title="Derived: lifetime rentals minus the rentals still running. Not a recorded figure.">
                {completed}
              </span>
            ) : (
              completed
            )
          }
          figure
        />
        <DrawerRow label="Currently on rent" value={client.currentRentalsCount} figure />
        <DrawerRow
          label="Late returns"
          value={reliability ? reliability.lateReturns : null}
          unavailableNote="Not tracked for this client — the reliability record is absent."
          figure
          {...(reliability && reliability.lateReturns > 0 ? { tone: 'warning' as const } : {})}
        />
        <DrawerRow label="Last rental" value={client.lastRentalAd} figure />
      </DrawerSection>
    </Drawer>
  )
}
