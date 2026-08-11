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
import { clientHealth, creditUtilisation } from './clientHealth'
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
  const utilisation = creditUtilisation(client)

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
          {client.isVip && (
            <span
              style={{
                height: 20,
                padding: '0 7px',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 'var(--r-badge)',
                border: '1px solid var(--ext-line)',
                color: 'var(--gold)',
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              VIP
            </span>
          )}
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
        {showMoney && utilisation !== null && (
          <DrawerRow
            label="Credit used"
            value={`${formatMoney(client.creditUsedPaisa)} · ${Math.round(utilisation * 100)}%`}
            figure
            {...(utilisation > 1 ? { tone: 'danger' as const } : utilisation >= 0.8 ? { tone: 'warning' as const } : {})}
          />
        )}
        <DrawerRow label="Payment status" value={paymentStatus.text} tone={paymentStatus.tone} />
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
