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
