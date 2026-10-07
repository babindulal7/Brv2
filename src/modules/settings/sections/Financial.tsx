import { Card } from '../../../components/ui/Page'
import { DataTableShell } from '../../../components/ui/DataTable'
import { thStyle as th } from '../../../components/ui/TableHeaderCell'
import { toRupees } from '../../../lib/money'
import { FEE_PER_CREW_DAY_PAISA } from '../../../lib/queries/crew'
import {
  MEMBERSHIP_MATRIX,
  DEPOSIT_BY_CATEGORY_UNAVAILABLE,
  CANCELLATION_TIERS_UNAVAILABLE,
} from '../../../lib/queries/settings'
import type { Dest } from '../../../lib/queries/settings'
import { NotTrackedYet, SectionCards, ToneChip, td } from './shared'
import type { Section } from './shared'

/**
 * **Settings ▸ Financial** — §11.4: tax & fiscal year · currency & terms ·
 * deposit % per category · membership matrix · cancellation fee tiers.
 *
 * The section's whole point is its closing line: *"⚠ Every value here is read
 * by a screen. None is hardcoded."* Two things follow from taking that
 * literally.
 *
 * **1. Where a value IS read, the row names its readers.** `vatRatePercent`
 * is read live by `NewRental.tsx:90`, `PricingCalculator.tsx:100` and
 * `CreateInvoiceModal.tsx:194`, all through `getSetting` — so changing it here
 * changes the next quote, and the row says so rather than implying it. (Two
 * hardcoded 13s remain outside this pass's files: `data/booking.ts:47` and
 * `lib/seed.ts:83`, both seed/demo generators rather than screens.)
 *
 * **2. Where a value does NOT exist, the panel says "not tracked yet".** The
 * deposit-percentage table and the cancellation fee tiers are drawn in §11.4
 * and exist nowhere in this build — `data/pulse.ts:824` and
 * `data/clientIntel.ts:196` both already name them as outstanding. Rulings §8
 * is unconditional: never a plausible default, never a zero. A seeded "40% of
 * replacement value" would be charged to a real client by the first operator
 * who trusted this screen.
 *
 * **3. A ruling that needs a number puts the number HERE.** Rulings §11.2 made
 * "On Stop" a derived state rather than a fourth `client_flag_type`, and gave
 * it a threshold — *N* days past due. `overdueStopDays` (default 30) is that
 * threshold, added to Currency & terms beside the payment terms exactly as the
 * ruling directs. `data/clients.ts:readOverdueStopDays()` is its only reader,
 * and the predicate every On Stop surface calls takes it as an argument, so no
 * module carries a literal 30.
 *
 * ⚠ 15 Aug — "Tax office" and "Exchange rates" were DELETED. Both were rows
 * whose only content was that they are not built, and rule 2 above is about a
 * FIGURE that would be trusted if invented, not about a row that names an
 * absent screen. The "not tracked yet" PANELS below stay: those sit where a
 * number would otherwise be read off the screen and charged to a client.
 *
 * **The crew coordination fee is Rs 1,000, from `data/crew.ts`.** The Rs 500
 * duplicate that used to be exported from `data/settings.ts` under the same
 * name is deleted (Rulings §9.11) — splitting this file was exactly the moment
 * someone would have imported it by name and halved a billed rate.
 */

const R = (to: string): Dest => ({ kind: 'route', to })

export const FINANCIAL_SECTIONS: Section[] = [
  {
    key: 'tax',
    title: 'Tax & fiscal year',
    icon: 'receipt',
    fields: [
      {
        label: 'VAT rate',
        note: /* Applied after discount, per Foundation §2.1. */ "Applied after discount, per",
        settingKey: 'vatRatePercent',
        readBy: 'New Rental, the Pricing Calculator and Create Invoice',
      },
      {
        label: 'PAN / VAT number',
        note: 'Printed on every tax invoice. Nine digits.',
        settingKey: 'vatNumber',
        readBy: 'the invoice header',
      },
      {
        label: 'Crew coordination fee',
        note: `Default charge per crew-day (Rs ${toRupees(FEE_PER_CREW_DAY_PAISA)}). Proposed default, not yet confirmed.`,
        settingKey: 'crewCoordinationFeeRupees',
        readBy: 'Crew Assist’s payout ledger',
      },
      {
        label: 'Fiscal year',
        note: 'Nepali fiscal year runs Shrawan – Ashadh.',
        value: 'FY 2083/84',
        readOnlyWhy: 'Derived from the Date Engine’s current BS year, not stored. It rolls on 1 Shrawan by itself.',
      },
      { label: 'Invoice rules', note: 'Numbering, reversal and void behaviour.', dest: R('/admin/numbering') },
    ],
  },
  {
    key: 'currency',
    title: 'Currency & terms',
    icon: 'card',
    fields: [
      {
        label: 'Default currency',
        note: 'South Asian grouping — Rs 1,85,000.',
        value: 'NPR (Rs)',
        readOnlyWhy: 'Every ledger column is integer paisa. A second base currency is a schema change, not a setting.',
      },
      {
        label: 'Number grouping',
        note: 'Lakh and crore, not thousands.',
        value: 'Lakh / crore grouping',
        readOnlyWhy: '`lib/money.ts` groups this way and nothing else. Changing it is a code change, not a setting.',
      },
      {
        label: 'Additional currencies',
        note: 'Quoted only; ledgers stay in NPR.',
        value: 'USD · EUR · INR',
        readOnlyWhy: 'No rate feed is connected, so nothing can convert. The list is illustrative until one is.',
      },
      {
        label: 'Payment terms',
        note: 'Default credit terms on a new invoice.',
        settingKey: 'paymentTermsDays',
        readBy: 'Create Invoice’s due date',
      },
      /*
       * Rulings §11.2 — "On Stop" is DERIVED from credit state, and this is the
       * threshold it derives from. It sits beside the payment terms because the
       * ruling puts it there and because the two are read together: the terms
       * decide when an invoice falls due, this decides how long a late one is
       * carried before the client stops trading.
       *
       * They are separate settings on purpose. Deriving one from the other
       * would move the stop threshold every time somebody edited the terms.
       */
      {
        label: 'On stop after',
        note: 'Days past an invoice due date before a client counts as On Stop. On Stop is not a flag — a client is also on stop the moment their outstanding exceeds their credit limit, and comes off it by itself when they pay.',
        settingKey: 'overdueStopDays',
        readBy: 'the Clients directory’s On Stop chip and the client record’s credit box',
      },
      { label: 'Late payment penalties', note: 'Interest on an overdue invoice.', settingKey: 'latePaymentPercentPerMonth' },
    ],
  },
  {
    key: 'deposit-rules',
    title: 'Deposit rules',
    icon: 'lock',
    fields: [
      {
        label: 'Allow closing without settling the deposit',
        note: 'Off by default. When On, Manager and above see "Close without settling deposit" on a rental whose deposit is still held; it needs a written reason of at least 10 characters and is recorded in the audit log. The deposit stays held — nothing is released, refunded or turned into revenue. The database refuses a skip without the reason or from a lower role, whatever this says.',
        settingKey: 'allowDepositSkipOnClose',
        readBy: 'the Close control on a booking',
      },
    ],
  },
  {
    key: 'booking-rules',
    title: 'Booking rules',
    icon: 'lock',
    fields: [
      {
        label: 'Allow overbooking',
        note: 'Off by default. When on, a booked/maintenance chip in Add Item becomes tappable and opens an override — sub-rent (preferred) or book anyway, both requiring a written reason and a named approver.',
        on: false,
      },
    ],
  },
]

export function FinancialPane() {
  return (
    <>
      <SectionCards sections={FINANCIAL_SECTIONS} />

      <Card title="Deposit by category">
        <NotTrackedYet title="Deposit % of replacement value, per gear category" why={DEPOSIT_BY_CATEGORY_UNAVAILABLE} />
      </Card>

      {/* Rulings §5 — the plan matrix lives here **in addition to** the
          Memberships tab on Clients, which a user ruling keeps. It is a
          projection of `data/membership.ts:PLANS`, so the two surfaces cannot
          quote different discounts. Law 6 already removed this whole tab for a
          money-blind session, so the credit column needs no second gate. */}
      <Card
        title="Membership matrix"
        action={
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Projected from the plan list — Clients ▸ Memberships shows the same five
          </span>
        }
      >
        <DataTableShell ariaLabel="Membership matrix" data-table-scroll style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Level</th>
                <th scope="col" style={th}>Discount %</th>
                <th scope="col" style={th}>Credit</th>
                <th scope="col" style={th}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {MEMBERSHIP_MATRIX.map((m) => (
                <tr key={m.level}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      {m.level}
                      <ToneChip tone="neutral" icon="dot">
                        {m.badge}
                      </ToneChip>
                    </span>
                  </td>
                  <td style={td} className="figure">
                    {m.discount}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }} className="figure">
                    {m.credit}
                  </td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{m.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.55 }}>
          {/* Discounts are ungated — ruled by the owner, 31 Aug 2026 (Law 10 as amended). No reason, no approver, no cap
          below 100%; a negative discount is refused because it is a price rise, and above 100% because it is a negative
          price. A plan discount simply sets the starting figure. */}Discounts may be between 0% and 100%. </p>
      </Card>

      <Card title="Cancellation fee tiers">
        <NotTrackedYet title="Notice period → fee %" why={CANCELLATION_TIERS_UNAVAILABLE} />
      </Card>
    </>
  )
}
