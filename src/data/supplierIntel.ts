/**
 * Hover Intel System v2.1 — the Supplier card (Tier 2).
 *
 * There is no supplier directory or profile screen anywhere in this app —
 * `data/inventory.ts`'s filter rail lists "Supplier" as a `blocked` facet with
 * the comment "Suppliers arrive with Sub Rental, which is blocked on open
 * decisions." So unlike `clientIntel.ts`/`equipmentIntel.ts`, which each read
 * one row of an existing directory, this card is built by *grouping* the
 * existing `SubRentalRecord[]` by `counterparty` — a supplier "profile" is
 * simply that counterparty's set of Sub Rental transactions, aggregated. No
 * separate supplier list is invented.
 *
 * `SubRentalRecord` and `SUB_RENTAL_DATA` live inline in
 * `modules/operations/SubRental.tsx` rather than in a dedicated `data/`
 * module. Only the *type* is imported back from the page component here (a
 * type-only import, erased at compile time, so it cannot create a runtime
 * circular dependency with `SubRental.tsx`, which imports this file's
 * `groupByCounterparty`/`supplierGlance`/`supplierDetailGroups`) — the same
 * structural choice `maintenanceIntel.ts` documents for `MaintenanceRecord`/
 * `Maintenance.tsx`. A future pass that gives Supplier a real directory
 * should move both into a `data/subRentals.ts` of their own, the way
 * `inventory.ts` and `clients.ts` already do for their entities.
 *
 * Every gating decision goes through `lib/fieldGating.ts`. §4.1's explicit
 * "no supplier margin" Coordinator carve-out is why cost/revenue/margin *and*
 * the subrental discount % all sit behind `canViewMoneyField(gctx,
 * 'asset-finance')` — a discount % a supplier extends is the same cost-side
 * commercial fact as their margin, not a neutral rate-card detail, so it is
 * gated the same way rather than left open the way `Care`'s dates are on the
 * Equipment card.
 *
 * Follow-up pass: promotes this grouping into an actual directory screen (a
 * "Suppliers" tab inside `SubRental.tsx`, one row per counterparty) rather
 * than only a hover card on the transaction table's counterparty cell.
 * `supplierDirectoryRow` below is the row-shaped read of the same
 * `SupplierGroup` the Glance/Detail builders above already consume — it
 * exists so the *page* doesn't re-derive `isActive`/`directionSummary`/money
 * gating itself (Foundation's "pages never implement business logic — the
 * engines own it"). It adds exactly one new derived fact the directory needs
 * that the card never did — a last-transaction date — computed from the
 * `endDateAd` strings already on every seeded `SubRentalRecord`, not a new
 * field.
 */

import { createElement } from 'react'
import type { SubRentalRecord } from '../modules/operations/SubRental'
import { formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField, canViewPII } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField, IntelBadge } from '../components/ui/IntelCard'

export interface SupplierGroup {
  counterparty: string
  transactions: SubRentalRecord[]
}

/**
 * Small optional per-counterparty lookup for what genuinely isn't on the
 * transaction record itself — a supplier's contact details and the standing
 * discount they extend. Keyed by the exact `counterparty` strings already
 * present in `SUB_RENTAL_DATA`; only two real counterparties are seeded
 * (`GearHouse KTM`, `Kathmandu Cinema Works`) and every other counterparty
 * — `Freelance - Bikram`, `Shine Pictures` — is left undefined on purpose,
 * rendering "Not on file" rather than a guessed number.
 */
export interface SupplierContactInfo {
  contactPhone?: string
  contactEmail?: string
  /** What this supplier discounts off their own rate card, as a plain percentage — not derived from any transaction row. */
  subrentalDiscountPercent?: number
}

const SUPPLIER_CONTACTS: Record<string, SupplierContactInfo> = {
  'GearHouse KTM': {
    contactPhone: '+977 980-4551210',
    contactEmail: 'bookings@gearhousektm.com.np',
    subrentalDiscountPercent: 10,
  },
  'Kathmandu Cinema Works': {
    contactEmail: 'partnerships@kathmanducinemaworks.com.np',
  },
}

const ACTIVE_STATUSES: ReadonlySet<SubRentalRecord['status']> = new Set(['Reserved', 'Picked Up', 'On Rent'])

function isActive(r: SubRentalRecord): boolean {
  return ACTIVE_STATUSES.has(r.status)
}

/** "Borrowing", "Lending", or "Borrowing & Lending" if this counterparty appears on both sides. */
function directionSummary(transactions: SubRentalRecord[]): string {
  const directions = new Set(transactions.map((r) => r.direction))
  if (directions.size > 1) return 'Borrowing & Lending'
  return directions.has('Borrowing') ? 'Borrowing' : 'Lending'
}

/** Groups the flat transaction log into one aggregate per counterparty — the "supplier profile" this card is standing in for. */
export function groupByCounterparty(records: SubRentalRecord[]): Map<string, SupplierGroup> {
  const map = new Map<string, SupplierGroup>()
  for (const r of records) {
    const existing = map.get(r.counterparty)
    if (existing) existing.transactions.push(r)
    else map.set(r.counterparty, { counterparty: r.counterparty, transactions: [r] })
  }
  return map
}

function sumPaisa(records: SubRentalRecord[], field: 'revenuePaisa' | 'costPaisa'): Paisa {
  return records.reduce((sum, r) => (sum + r[field]) as Paisa, 0 as Paisa)
}

export function supplierGlance(group: SupplierGroup, gctx: GateContext): IntelGlance {
  const { counterparty, transactions } = group
  const active = transactions.filter(isActive)
  const pastCount = transactions.length - active.length
  const unitsInHouse = active
    .filter((r) => r.direction === 'Borrowing')
    .reduce((sum, r) => sum + r.quantity, 0)
  const hasOverdueActive = active.some((r) => r.isOverdue)
  const directionLabel = directionSummary(transactions)

  const lines: string[] = [
    `${unitsInHouse} unit${unitsInHouse === 1 ? '' : 's'} in-house · ${pastCount} past sub-rent${pastCount === 1 ? '' : 's'}`,
  ]
  if (canViewMoneyField(gctx, 'asset-finance')) {
    const revenue = sumPaisa(transactions, 'revenuePaisa')
    if (revenue > 0) lines.push(`Lifetime revenue ${formatMoney(revenue)}`)
  }

  const badges: IntelBadge[] = [
    { label: directionLabel, tone: 'ext' },
    ...(active.length > 0 ? [{ label: `${active.length} active` }] : []),
  ]

  return {
    avatarLabel: counterparty.slice(0, 2).toUpperCase(),
    avatarIcon: 'truck',
    avatarTone: 'ext',
    title: counterparty,
    statusDot: hasOverdueActive ? 'danger' : active.length > 0 ? 'in' : 'neutral',
    subtitle: `${transactions.length} sub-rental record${transactions.length === 1 ? '' : 's'}`,
    badges,
    lines,
  }
}

export function supplierDetailGroups(group: SupplierGroup, gctx: GateContext): IntelGroup[] {
  const { counterparty, transactions } = group
  const groups: IntelGroup[] = []
  const active = transactions.filter(isActive)
  const overdueActive = active.filter((r) => r.isOverdue).length
  const directionLabel = directionSummary(transactions)

  groups.push({
    title: 'Profile',
    fields: [
      { label: 'Counterparty', value: counterparty },
      { label: 'Relationship', value: directionLabel },
      { label: 'Sub-rental records', value: String(transactions.length) },
      { label: 'Active now', value: String(active.length) },
      { label: 'Overdue currently', value: String(overdueActive) },
    ],
  })

  // Gold rows — §4.2's outline-only gold, the same 'ext' token `status.ts`
  // reserves for sub-rental/partner equipment (never a fill), applied per
  // active unit here. `IntelField.value` is typed as `ReactNode` precisely so
  // a builder can reach for this instead of a plain string; `createElement`
  // rather than JSX because this module stays a plain `.ts` file, matching
  // every sibling card builder in this directory.
  if (active.length > 0) {
    groups.push({
      title: 'Active external units',
      fields: active.map((r): IntelField => {
        const goldLine = `${r.status}${r.direction === 'Lending' ? ' · out with them' : ' · in-house'}`
        return {
          label: `${r.quantity}x ${r.equipment}`,
          value: createElement(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 'var(--r-badge)',
                border: '1px solid var(--ext-line)',
                color: 'var(--ext-fg)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
              },
            },
            goldLine,
          ),
          ...(r.linkedBooking ? { trigger: { label: 'Open', to: `/rentals/${r.linkedBooking}` } } : {}),
        }
      }),
    })
  }

  if (canViewMoneyField(gctx, 'asset-finance')) {
    const revenue = sumPaisa(transactions, 'revenuePaisa')
    const cost = sumPaisa(transactions, 'costPaisa')
    const marginPct = revenue > 0 ? ((revenue - cost) / revenue) * 100 : undefined
    const contact = SUPPLIER_CONTACTS[counterparty]

    groups.push({
      title: 'Commercial',
      fields: [
        { label: 'Lifetime revenue', value: formatMoney(revenue) },
        { label: 'Lifetime cost', value: formatMoney(cost) },
        { label: 'Blended margin', value: marginPct !== undefined ? `${marginPct.toFixed(1)}%` : '—' },
        {
          label: 'Subrental discount',
          value: contact?.subrentalDiscountPercent !== undefined ? `${contact.subrentalDiscountPercent}%` : 'Not on file',
        },
      ],
    })

    groups.push({
      title: 'Transaction history',
      fields: transactions.map(
        (r): IntelField => ({
          label: `${r.id} · ${r.equipment}`,
          value:
            r.status === 'Cancelled'
              ? 'Cancelled — no revenue or cost'
              : `${formatMoney(r.revenuePaisa)} revenue · ${formatMoney(r.costPaisa)} cost`,
          ...(r.linkedBooking ? { trigger: { label: 'Open', to: `/rentals/${r.linkedBooking}` } } : {}),
        }),
      ),
    })
  }

  if (canViewPII(gctx)) {
    const contact = SUPPLIER_CONTACTS[counterparty]
    groups.push({
      title: 'Contact',
      fields: [
        { label: 'Phone', value: contact?.contactPhone ?? 'Not on file' },
        { label: 'Email', value: contact?.contactEmail ?? 'Not on file' },
      ],
    })
  }

  return groups
}

/**
 * English month abbreviations only — every seeded `startDateAd`/`endDateAd`
 * comes out of `lib/bs.ts`'s `formatAd()` (`"24 Jun 2026"`), so a small fixed
 * map round-trips it exactly rather than trusting the platform `Date`
 * constructor's non-ISO string parsing, which the spec (`bs.ts`'s own header
 * comment) treats as unreliable enough to hand-roll a Kathmandu-correct
 * formatter in the first place.
 */
const AD_MONTH: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseAd(s: string): number {
  const [day, mon, year] = s.split(' ')
  const month = AD_MONTH[mon ?? '']
  if (month === undefined || !day || !year) return 0
  return Date.UTC(Number(year), month, Number(day))
}

/**
 * The one new fact a directory row needs that the Glance/Detail card never
 * did — "when did we last do business with them" — read off the latest
 * `endDateAd` already sitting on that counterparty's own transactions. Not a
 * new field: every value it returns traces back to a real `SubRentalRecord`.
 */
function lastTransactionAd(transactions: SubRentalRecord[]): string {
  return transactions.reduce((latest, r) => (parseAd(r.endDateAd) > parseAd(latest.endDateAd) ? r : latest)).endDateAd
}

export interface SupplierDirectoryRow {
  counterparty: string
  /** "Borrowing" / "Lending" / "Borrowing & Lending" — same derivation the Glance badge uses. */
  relationship: string
  unitsInHouse: number
  activeCount: number
  pastCount: number
  totalCount: number
  hasOverdueActive: boolean
  lastTransactionAd: string
  /**
   * Omitted (not zeroed) when `canViewMoneyField(gctx, 'asset-finance')` is
   * false — HIS v2.1 §4.5's "gated blocks are omitted from the payload, not
   * CSS-hidden" applies to a directory row exactly as it does to a card.
   */
  financial?: { revenuePaisa: Paisa; costPaisa: Paisa; marginPct?: number }
}

/**
 * The row-shaped read of one `SupplierGroup` for the Suppliers directory tab.
 * Reuses `isActive`/`directionSummary`/`sumPaisa` and the same
 * `canViewMoneyField` gate `supplierGlance`/`supplierDetailGroups` use above,
 * so a role that cannot see supplier margin in the hover card cannot see it
 * in the directory table either — one gating decision, read twice.
 */
export function supplierDirectoryRow(group: SupplierGroup, gctx: GateContext): SupplierDirectoryRow {
  const { counterparty, transactions } = group
  const active = transactions.filter(isActive)

  const row: SupplierDirectoryRow = {
    counterparty,
    relationship: directionSummary(transactions),
    unitsInHouse: active.filter((r) => r.direction === 'Borrowing').reduce((sum, r) => sum + r.quantity, 0),
    activeCount: active.length,
    pastCount: transactions.length - active.length,
    totalCount: transactions.length,
    hasOverdueActive: active.some((r) => r.isOverdue),
    lastTransactionAd: lastTransactionAd(transactions),
  }

  if (canViewMoneyField(gctx, 'asset-finance')) {
    const revenuePaisa = sumPaisa(transactions, 'revenuePaisa')
    const costPaisa = sumPaisa(transactions, 'costPaisa')
    row.financial = {
      revenuePaisa,
      costPaisa,
      // `exactOptionalPropertyTypes` — omit the key entirely rather than set
      // it to `undefined` when there's no revenue to divide by.
      ...(revenuePaisa > 0 ? { marginPct: ((revenuePaisa - costPaisa) / revenuePaisa) * 100 } : {}),
    }
  }

  return row
}
