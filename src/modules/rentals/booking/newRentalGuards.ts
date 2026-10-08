import { validateDiscount } from '../../../lib/discount'
import { formatMoney, type Paisa } from '../../../lib/money'
import type { ClientRecord } from '../../../lib/queries/clients'
import type { CrewRole } from '../../../lib/queries/crew'
import type { PricingPipelineResult } from '../../../lib/pricingPipeline'
import { dbRejectsRole } from './CrewSearch'
import type { EquipmentAvailabilitySource } from './itemCatalogue'
import { PRODUCT_ID_RE } from './newRentalUtils'

/**
 * One reason Confirm Booking is refused, in the shape the rail's blocking-
 * notices card renders.
 *
 * `action` is one of `runNoticeAction`'s verbs and is **optional**: a refusal
 * the operator cannot act on from this screen gets no button rather than a
 * button that silently does nothing. (§12's "every alert carries exactly one
 * action" governs `alerts`, and every alert-derived notice still carries one.)
 */
export interface BlockingNotice {
  text: string
  action?: string
}

export interface RentalAlertItem {
  text: string
  severity: 'Critical' | 'Warning' | 'Information'
  action: string
}

/** Everything `confirmWriteRefusals` needs to know, and nothing else. */
export interface ConfirmWriteState {
  /** Whether a client is chosen at all. `false` is the alert model's own Critical, not ours. */
  clientSelected: boolean
  /** The chosen client's `clients.id` uuid — `null` when it came from the seed array. */
  clientDbId: string | null
  /** Has the live client read landed? It changes what a missing uuid MEANS. */
  clientsAreLive: boolean
  lineCount: number
  /** The first line whose id is not a `products.id` uuid, by name; `null` if none. */
  sampleLineName: string | null
  /** Law 6 — whether this role is shown equipment rates at all. */
  canBookingMoney: boolean
  /** AUD-026: Whether the selected client is flagged as Blocked or On-Stop. */
  clientIsBlocked?: boolean
}

/**
 * ⛔ NR-10 — the four refusals that used to live ONLY inside the Confirm
 * handler, lifted out so one computation answers both the card and the button.
 *
 * The defect: `confirmBlocked` was `critical.length > 0 || days === 0`, and the
 * handler then refused, in its own body and with its own sentences, on a client
 * with no `dbId`, on zero lines, on a money-blind role and on a line id that is
 * not a uuid. None of those four reached `blockingNotices`, so the rail's card
 * said **"Nothing is blocking this booking · Every requirement for Confirm
 * Booking is met"**, the button was enabled, and the press failed into the
 * inline error line. Two lists describing one rule, and they had already
 * drifted.
 *
 * These are the handler's own refusals, verbatim in substance, re-written as
 * standalone sentences so they read correctly in the card as well as after
 * "Not confirmed — " in the error line.
 *
 * Pure and exported for `__tests__/newRentalGuards.test.ts`.
 */
export function confirmWriteRefusals(s: ConfirmWriteState): BlockingNotice[] {
  const out: BlockingNotice[] = []
  /* Only when a client IS chosen: "No client selected" is already a Critical in
     the alert model, and stating it twice is its own defect. */
  if (s.clientSelected && !s.clientDbId) {
    out.push({
      text: s.clientsAreLive
        ? 'The selected client came from sample data and has no database record, so there is nothing to book against. Pick a client from the live list.'
        : 'The client list has not loaded from the database yet, so the selected client is sample data. Wait for it to load, then re-select the client.',
      action: 'Select Client',
    })
  }
  if (s.clientIsBlocked) {
    out.push({
      text: 'This client is flagged as Blocked from equipment rentals. Quotation or confirmation is restricted without manager override.',
      action: 'View Client',
    })
  }
  if (s.lineCount === 0) {
    out.push({
      text: 'Add at least one equipment item before confirming.',
      action: 'Open Equipment',
    })
  }
  /* Law 6 — `listInventory({ withMoney: false })` returns no `dailyRate`, so
     every line this role holds carries `ratePaisa` 0. Sending that would
     persist the display placeholder as the price of the booking. */
  if (!s.canBookingMoney) {
    out.push({
      text: 'Equipment rates are hidden for your role, so this booking cannot be priced from this screen — every line would be saved at Rs 0. Ask a colleague who can see rates to confirm it.',
    })
  }
  if (s.sampleLineName !== null) {
    out.push({
      text: `"${s.sampleLineName}" is a sample row, not a product in the catalogue, so it cannot be saved. Remove it and add the item from the live catalogue.`,
      action: 'Open Equipment',
    })
  }
  return out
}

export interface RentalAlertsInput {
  conflictLines: readonly { id?: string; text: string }[]
  availabilitySource: EquipmentAvailabilitySource
  client: ClientRecord | undefined
  govId: string
  kind: string
  discountPct: number
  crew: Array<{ role: CrewRole | string; name: string }>
  canBookingMoney: boolean
  depositRequiredPaisa: Paisa
  depositReceivedPaisa: Paisa
  depositPendingPaisa: Paisa
  outstandingPaisa: Paisa
  days: number
  clientsAreLive: boolean
  lines: readonly { productId?: string | null | undefined; id?: string | undefined; name: string }[]
  equipmentLines: readonly { productId?: string | null | undefined; id?: string | undefined; name: string }[]
  pricing: PricingPipelineResult
}

export interface RentalAlertsResult {
  alerts: RentalAlertItem[]
  critical: RentalAlertItem[]
  advisories: RentalAlertItem[]
  blockingNotices: BlockingNotice[]
  confirmBlocked: boolean
}

export const MISSING_GOV_ID_TEXT = 'Missing client ID or PAN'

export function deriveRentalAlertsAndNotices(input: RentalAlertsInput): RentalAlertsResult {
  const discountVerdict = validateDiscount(input.discountPct)
  const discountUnapproved = !discountVerdict.valid

  const alerts: RentalAlertItem[] = [
    ...input.conflictLines.map((c) => ({
      text: `Equipment conflict — ${c.text}`,
      severity: 'Critical' as const,
      action: 'Open Inventory',
    })),
    ...(input.availabilitySource.state === 'failed'
      ? [
          {
            text: `Availability could not be checked for these dates: ${input.availabilitySource.reason}. Confirm will re-check and refuse if anything is short.`,
            severity: 'Warning' as const,
            action: 'Open Equipment',
          },
        ]
      : []),
    ...(!input.client ? [{ text: 'No client selected', severity: 'Critical' as const, action: 'Select Client' }] : []),
    ...(input.kind.trim() === ''
      ? [{ text: 'Select a project type before confirming this rental.', severity: 'Critical' as const, action: 'Open Client & Dates' }]
      : []),
    /* Ruled 8 Oct 2026 (RULINGS-2026-10-08.md): a missing ID/PAN is a WARNING.
       Neither confirmRental nor the database requires one, and a page may not
       invent a gate the engines do not hold. It stays visible as an advisory. */
    ...(input.client && input.govId.trim().length === 0 ? [{ text: MISSING_GOV_ID_TEXT, severity: 'Warning' as const, action: 'Edit Client' }] : []),
    ...(input.client && (input.client.isBlocked || input.client.onStop)
      ? [
          {
            text: `Client is blocked: ${input.client.blockReason || input.client.onStop?.reason || 'Account flagged as on-stop'}`,
            severity: 'Critical' as const,
            action: 'View Client',
          },
        ]
      : []),
    ...(discountUnapproved
      ? [{ text: discountVerdict.error ?? 'Discount is not a valid percentage.', severity: 'Critical' as const, action: 'Fix Discount' }]
      : []),
    ...input.crew
      .filter((c) => dbRejectsRole(c.role as CrewRole))
      .map((c) => ({
        text: `${c.name}'s role — ${c.role} — is not one the database accepts, so this booking cannot be confirmed while they are on it`,
        severity: 'Critical' as const,
        action: 'Open Crew',
      })),
    ...(input.canBookingMoney && input.client && input.client.outstandingPaisa > 0
      ? [{ text: `Client has ${formatMoney(input.client.outstandingPaisa)} outstanding`, severity: 'Warning' as const, action: 'View Client' }]
      : []),
    ...(input.canBookingMoney && input.depositRequiredPaisa > input.depositReceivedPaisa
      ? [{ text: `Deposit ${formatMoney(input.depositPendingPaisa)} pending`, severity: 'Warning' as const, action: 'Receive Deposit' }]
      : []),
    ...(input.canBookingMoney && input.outstandingPaisa > 0 ? [{ text: 'Rental outstanding', severity: 'Warning' as const, action: 'Receive Payment' }] : []),
  ]
  const critical = alerts.filter((a) => a.severity === 'Critical')

  const blockingNotices: BlockingNotice[] = [
    ...(input.days === 0 ? [{ text: 'The return must be later than the pickup — check the times as well as the dates.', action: 'Open Dates' }] : []),
    ...critical.map((a) => ({ text: a.text, action: a.action })),
    ...confirmWriteRefusals({
      clientSelected: Boolean(input.client),
      clientDbId: input.client?.dbId ?? null,
      clientIsBlocked: Boolean(input.client?.isBlocked || input.client?.onStop),
      clientsAreLive: input.clientsAreLive,
      lineCount: input.lines.length,
      sampleLineName: input.equipmentLines.find((l) => !PRODUCT_ID_RE.test(l.productId ?? l.id ?? ''))?.name ?? null,
      canBookingMoney: input.canBookingMoney,
    }),
    ...input.pricing.discounts.validationErrors.map((err) => ({ text: err, action: 'Open Pricing' })),
    ...input.pricing.securityDeposit.validationErrors.map((err) => ({ text: err, action: 'Open Pricing' })),
  ]
  const confirmBlocked = blockingNotices.length > 0

  // Warnings the confirm panel shows without blocking. Only the ID/PAN notice
  // for now; deposit and outstanding warnings keep their existing surfaces.
  const advisories = alerts.filter((a) => a.text === MISSING_GOV_ID_TEXT)
  return { alerts, critical, advisories, blockingNotices, confirmBlocked }
}

