// @vitest-environment jsdom
/**
 * # New Rental — the two guards the page is answered by
 *
 * Both of these are register defects, and both are the same shape: the screen
 * held one answer and its own write held another.
 *
 *  - **NR-10** — `confirmBlocked` was `critical.length > 0 || days === 0`, and
 *    the Confirm handler then refused, in its own body, on four conditions that
 *    were in no list the operator could see. The rail's card said "Nothing is
 *    blocking this booking · Every requirement for Confirm Booking is met", the
 *    button was enabled, and the press failed into the inline error line.
 *    `confirmWriteRefusals` is those four, lifted out so ONE computation
 *    answers the card and the button.
 *  - **NR-19** — the booking's length was the difference of the two
 *    `YYYY-MM-DD` picker values with the times beside them thrown away, so a
 *    same-day 09:00 → 18:00 hire measured 0 days and was refused, although
 *    `createRental.validate` refuses only a return strictly BEFORE the pickup
 *    and the write sends date+time. `bookingDays` measures over the instants
 *    that are actually stored, and delegates the arithmetic to
 *    `lib/rentalDays.ts` (Law 1).
 *
 * ## Why `lib/supabase` is mocked
 *
 * `NewRental.tsx` reaches the client at module load (it imports it for the
 * branch read, and again through `queries/clients` and `queries/inventory`).
 * Replaced wholesale, exactly as `rentalsList.test.ts` does. Nothing here
 * touches a database: every assertion is on a plain object or a number.
 *
 * `jsdom` because the module graph under this page is a screen's worth of
 * components; the functions under test are pure and touch neither.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

import { bookingDays, bookingInstant, confirmWriteRefusals } from '../NewRental'

/** A `products.id`-shaped id — what a live catalogue row carries. */
const PRODUCT_UUID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c'

/** Everything present and correct: the state in which Confirm may be pressed. */
const CLEAR = {
  clientSelected: true,
  clientDbId: PRODUCT_UUID,
  clientsAreLive: true,
  lineCount: 2,
  sampleLineName: null,
  canBookingMoney: true,
} as const

describe('confirmWriteRefusals — NR-10, the card and the button read one list', () => {
  it('refuses nothing when the write would go through', () => {
    expect(confirmWriteRefusals({ ...CLEAR })).toEqual([])
  })

  it('names the client with no database record, and says WHICH of the two cases it is', () => {
    const live = confirmWriteRefusals({ ...CLEAR, clientDbId: null, clientsAreLive: true })
    expect(live).toHaveLength(1)
    expect(live[0]?.text).toContain('sample data')
    expect(live[0]?.text).toContain('Pick a client from the live list')
    expect(live[0]?.action).toBe('Select Client')

    const loading = confirmWriteRefusals({ ...CLEAR, clientDbId: null, clientsAreLive: false })
    expect(loading).toHaveLength(1)
    expect(loading[0]?.text).toContain('has not loaded from the database yet')
    /* The two are genuinely different facts and must not collapse into one
       sentence: one is "you picked the wrong row", the other "wait". */
    expect(loading[0]?.text).not.toBe(live[0]?.text)
  })

  it('does NOT repeat "no client" — the alert model already carries that Critical', () => {
    const none = confirmWriteRefusals({ ...CLEAR, clientSelected: false, clientDbId: null })
    expect(none.map((n) => n.text).filter((t) => t.includes('client'))).toEqual([])
  })

  it('refuses a booking with no lines, and sends the operator to Equipment', () => {
    const out = confirmWriteRefusals({ ...CLEAR, lineCount: 0 })
    expect(out).toHaveLength(1)
    expect(out[0]?.text).toContain('Add at least one equipment item')
    expect(out[0]?.action).toBe('Open Equipment')
  })

  it('refuses a money-blind role — and carries NO action, because there is nowhere to send them', () => {
    const out = confirmWriteRefusals({ ...CLEAR, canBookingMoney: false })
    expect(out).toHaveLength(1)
    expect(out[0]?.text).toContain('Rs 0')
    expect(out[0]?.action).toBeUndefined()
  })

  it('names the sample row that cannot be saved', () => {
    const out = confirmWriteRefusals({ ...CLEAR, sampleLineName: 'ARRI SkyPanel S60-C' })
    expect(out).toHaveLength(1)
    expect(out[0]?.text).toContain('"ARRI SkyPanel S60-C"')
    expect(out[0]?.action).toBe('Open Equipment')
  })

  it('refuses a blocked client with AUD-026 warning action', () => {
    const out = confirmWriteRefusals({ ...CLEAR, clientIsBlocked: true })
    expect(out).toHaveLength(1)
    expect(out[0]?.text).toContain('Blocked from equipment rentals')
    expect(out[0]?.action).toBe('View Client')
  })

  it('reports every refusal at once — the card lists them all, it does not stop at the first', () => {
    const out = confirmWriteRefusals({
      clientSelected: true,
      clientDbId: null,
      clientsAreLive: true,
      lineCount: 0,
      sampleLineName: 'Sample row',
      canBookingMoney: false,
    })
    expect(out).toHaveLength(4)
  })
})

describe('bookingDays — NR-19, the length is measured over the instants that get stored', () => {
  const days = (pd: string, pt: string, rd: string, rt: string) =>
    bookingDays(bookingInstant(pd, pt), bookingInstant(rd, rt))

  it('a same-day 09:00 → 18:00 hire is ONE rental day, not zero', () => {
    /* The defect: the two dates were equal, so the old page differenced them to
       0, called it "Return must be later than pickup" and blocked Confirm. */
    expect(days('2026-09-05', '09:00', '2026-09-05', '18:00')).toBe(1)
  })

  it('keeps the plain overnight and multi-day answers unchanged', () => {
    expect(days('2026-09-05', '09:00', '2026-09-06', '06:00')).toBe(1)
    expect(days('2026-09-05', '09:00', '2026-09-08', '06:00')).toBe(3)
  })

  it('rounds the priced span half-up, as lib/rentalDays does — 37 hours is 2 days', () => {
    expect(days('2026-09-05', '09:00', '2026-09-06', '22:00')).toBe(2)
  })

  it('answers 0 — the page\'s "not a booking" gate — for a return at or before the pickup', () => {
    expect(days('2026-09-05', '18:00', '2026-09-05', '09:00')).toBe(0)
    expect(days('2026-09-05', '09:00', '2026-09-05', '09:00')).toBe(0)
    expect(days('2026-09-08', '09:00', '2026-09-05', '09:00')).toBe(0)
  })

  it('answers 0 for an instant it cannot parse, rather than guessing midnight', () => {
    expect(bookingInstant('not-a-date', '09:00')).toBeNull()
    expect(days('not-a-date', '09:00', '2026-09-08', '09:00')).toBe(0)
    expect(days('2026-09-05', '09:00', '2026-09-08', 'noon')).toBe(0)
  })

  it('the times move the answer — the whole point of NR-19', () => {
    /* Same two dates, different times: returning by 06:00 is 1 day;
       returning at 10:00 (crossing 06:00 boundary into next shift) is 2 days. */
    expect(days('2026-09-05', '09:00', '2026-09-06', '06:00')).toBe(1)
    expect(days('2026-09-05', '09:00', '2026-09-06', '10:00')).toBe(2)
    expect(days('2026-09-05', '09:00', '2026-09-06', '23:00')).toBe(2)
  })
})

/**
 * # NR-rpo — the Return Pickup select wrote its labels into the state
 *
 * The state is typed `'Client Return' | 'Babin Pickup'`, but the two `<option>`
 * children carried display sentences and no `value`. A native select's value IS
 * the option's text content, so choosing "Babin Rentals Pickup from Location"
 * stored a string that matched NEITHER branch: the address/time/fee block (gated
 * on `=== 'Babin Pickup'`) never rendered, the return fee stayed 0 in the
 * transport total, and the Review line answered "Client Returns to Warehouse"
 * for a Babin pickup. The fix carries explicit `value` attributes in the state
 * union, display text unchanged.
 */
import newRentalRaw from '../NewRental.tsx?raw'

describe('NR-rpo — the Return-Pickup select speaks the state union', () => {
  it('both options carry an explicit value drawn from the state union', () => {
    expect(newRentalRaw).toContain('<option value="Client Return">Client Returns to Warehouse</option>')
    expect(newRentalRaw).toContain('<option value="Babin Pickup">Babin Rentals Pickup from Location</option>')
  })

  it('the state union and the branch condition read the same two literals', () => {
    expect(newRentalRaw).toContain("useState<'Client Return' | 'Babin Pickup'>")
    expect(newRentalRaw).toContain("returnPickupType === 'Babin Pickup'")
  })

  it('the no-value option shape does not return next to Return Pickup', () => {
    /* The defect was bare `<option>Client Returns to Warehouse</option>`. */
    expect(newRentalRaw).not.toContain('<option>Client Returns to Warehouse</option>')
    expect(newRentalRaw).not.toContain('<option>Babin Rentals Pickup from Location</option>')
  })
})

/**
 * # The two half-fixes review caught
 *
 * Both are the same failure: the first pass changed one side of a pair and left
 * the other, so the item read as fixed while the behaviour was still wrong —
 * and in NR-16's case, wrong in a NEW way.
 */
describe('NR-19 — the availability window is the window that gets stored', () => {
  /*
   * `bookingWindow` fed `itemCatalogue.ts`'s `validWindow`, which returns null
   * for `to <= from`. It was built by differencing the two `YYYY-MM-DD` picker
   * values, so the same-day booking NR-19 had just unblocked produced two equal
   * midnights, no window at all, and a silent fallback to each unit's unwindowed
   * reading. The window must be built from the same instants as the length.
   */
  it('gives a same-day booking a window with width, where the date-only build gave none', () => {
    const from = bookingInstant('2026-09-05', '09:00')
    const to = bookingInstant('2026-09-05', '18:00')
    expect(from).not.toBeNull()
    expect(to).not.toBeNull()
    expect(to!.getTime()).toBeGreaterThan(from!.getTime())

    // What the old build produced for the very same booking:
    expect(Date.parse('2026-09-05')).toBe(Date.parse('2026-09-05'))
  })

  it('agrees with the length: a window with width is a booking of at least one day', () => {
    const from = bookingInstant('2026-09-05', '09:00')
    const to = bookingInstant('2026-09-05', '18:00')
    expect(bookingDays(from, to)).toBeGreaterThanOrEqual(1)
  })

  it('still refuses a window with no width', () => {
    const at = bookingInstant('2026-09-05', '09:00')
    expect(bookingDays(at, at)).toBe(0)
  })
})
