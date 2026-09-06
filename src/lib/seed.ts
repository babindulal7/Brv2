/**
 * **Seed corpus generator** — PLAN.md Phase 1, last checklist line:
 * *"Seed data **generated through the engines**, never hand-typed."*
 *
 * `supabase/migrations/0012_seed_data.sql` is reference data only — number
 * sequences, branches, warehouses, users, a fiscal period, bank accounts,
 * expense and inventory categories. Not one booking, client, product, invoice
 * or payment exists in it, so nothing in the seed exercises `money.ts`'s
 * calculation order, `workflow.ts`'s stage machine, `discount.ts`'s Law 10
 * gate or `validation.ts`'s causal-order rule. A regression in any of the four
 * would leave the seed looking exactly as healthy as it does now.
 *
 * This module is the missing half. It **runs** those four engines (plus
 * `bs.ts`, the Date Engine) over a declared corpus, refuses to emit if any of
 * them disagrees with the specs, and prints the SQL. The emitted file is
 * therefore a *legal output of the engines* by construction rather than by
 * inspection — which is the whole point of the checklist line.
 *
 * `Appendix/Sample Data.md`, verbatim, on why:
 *
 * > Hand-typed demo data produced all of the following in the build:
 * > 21 items on an 18-item booking · a return timestamped before its pickup ·
 * > payments larger than the booking total · a booking confirmed at 09:20
 * > sitting below events at 05:30.
 *
 * ## How to regenerate
 *
 * ```
 * npm run seed:sql
 * ```
 *
 * `scripts/emit-seed-sql.mjs` calls {@link seedSql} and writes the migration.
 * Re-running produces a byte-identical file — every identifier in it is
 * derived, never random (see {@link seedUuid}).
 *
 * ## What this file does NOT do
 *
 * It does not apply anything. `CLAUDE.md`: *"Never apply a migration to a live
 * Supabase project without explicit approval."* The output is a file.
 *
 * ## Deliberate gaps
 *
 * `Sample Data.md`'s "what good seed data must contain" list is longer than
 * this corpus. Not modelled here, each for a stated reason:
 *
 *   - **A booking crossing a BS month boundary.** The reason changed on 5 Sep
 *     2026 and the gap did not: `bs.ts` used to carry one month (Shrawan 2083)
 *     and return `null` outside it, so the engine could not *verify* such a
 *     booking. It now carries the published 2078-2095 table, so it could. The
 *     corpus still has none — that is now an omission rather than a limit, and
 *     adding one is a corpus change, not a comment change. TODO(corpus): a
 *     booking spanning 31 Ashadh -> 1 Shrawan 2083 would exercise the boundary
 *     the old note said was unreachable.
 *   - **A reversed payment.** `payment_reversals` rows never flow back into
 *     `invoices.paid_amount` (PLAN.md §6.8 records this, unfixed and blocked
 *     on a flooring/reversal formula ruling). A seeded reversal would make
 *     the invoice's own reconciliation assertion below false.
 *   - **Operation sessions, cases, damage findings, a blocked client, the ten
 *     inventory states.** Each needs tables outside the four engines this
 *     checklist line names; adding them here would widen the change past the
 *     one item it closes.
 */

import { price, rupees, toRupees, REFERENCE_CASE, REFERENCE_CASE_ERROR, discountGate } from './money.ts'
import type { Paisa, PriceBreakdown } from './money.ts'
import { validateDiscount } from './discount.ts'
import { validateRentalDates } from './validation.ts'
import { assertItemCounts, canAdvance, closeGates, BOOKING_STATUS, STATUS_ORDER } from './workflow.ts'
import type { BookingStatus } from './workflow.ts'
import { toBs, formatBs } from './bs.ts'
import { prefixOf } from '../data/numbering.ts'

/* ── 0 · the corpus, declared ──────────────────────────────────────────────
 *
 * Everything below this point is *input*. Every figure that reaches the SQL is
 * computed from it by an engine — no total, no tax, no outstanding and no
 * stage is written down twice.
 */

/**
 * Settings ▸ Finance. `price()`'s contract is explicit that the VAT rate is
 * "from Settings ▸ Finance, never hardcoded" — there is no Settings table row
 * for it yet, so the seed's value is stated once, here, and matches both
 * `invoices.vat_rate`'s schema default (0.1300, `0006_finance.sql`) and
 * `Sample Data.md`'s worked example.
 */
export const VAT_PERCENT = 13

/**
 * The status every seeded invoice is **issued** at.
 *
 * It is reached by an UPDATE once the lines are in, never by inserting the
 * invoice already issued — see the lifecycle comment in {@link emitSql}. The
 * reference invoice ends at `Partially Paid` rather than here, and that is not
 * written down either: `sync_payment_to_invoice()` (0010) sets it when the
 * payment row lands.
 */
export const INVOICE_ISSUED_STATUS = 'Sent'

/**
 * `0012_seed_data.sql` section 1's rows. Record numbers are formatted from
 * these, never typed.
 *
 * `prefix` is **not** written down here. `WIREFRAME_RULINGS_2026-08-12.md` §2.2
 * makes prefixes configuration, and `data/numbering.ts` is the registry of
 * record, so each spec names the registry `code` it draws from and `prefixOf()`
 * supplies the string. Typing `'BK-'` here is exactly the second source of
 * truth the ruling exists to remove.
 *
 * `year` and `padding` survive only for the three sequences the ruling does
 * **not** cover. Booking, Client and Invoice set both to their ruled values —
 * no year, no padding — which is what `year: null, padding: 1` means.
 */
interface SequenceSpec {
  key: string
  /** The `SEQUENCES` row in `data/numbering.ts` this draws its prefix from. */
  code: string
  padding: number
  /** `null` = no year segment. Ruled sequences and `equipment` carry none. */
  year: number | null
}

export const SEQUENCES = {
  booking: { key: 'booking', code: 'BK', padding: 1, year: null },
  client: { key: 'client', code: 'CL', padding: 1, year: null },
  invoice: { key: 'invoice', code: 'INV', padding: 1, year: null },
  /* Payment keeps the year-bearing `PAY-YYYY-NNNN` here, but the claim this
     comment used to make — "nothing has ruled it" — was overtaken on 4 Sep.
     R-18 (RULINGS-2026-09-04.md) rules that `number_sequences.payment` must
     stop resetting yearly: `include_year = false`, a direct breach of the
     15 Aug never-reset ruling. That is a change to the SEQUENCE, made by
     migration, and R-18 is explicit that numbers already issued are not
     rewritten. The corpus below is historical payments — already issued — so
     the shape stays put and this spec does NOT move until a migration lands.
     Do not "fix" it here: changing the emitted shape without the sequence
     change would make the seed disagree with what the database mints. */
  payment: { key: 'payment', code: 'PAY', padding: 4, year: 2026 },
  /* Deposit IS ruled: 0056_ruled_sequences_completion.sql rewrites every
     `DEP-YYYY-NNNN` to `DEP-<n>` and then asserts none survive. This spec
     used to emit the retired year-bearing shape, so 0056 rewrote the seeded
     rows on a fresh build and a second apply then missed its own
     `on conflict (deposit_no)` arbiter and died on the client_uuid unique
     (measured 3 Sep 2026: DEP-2026-0001 written, DEP-1 stored). Emitting the
     ruled shape makes 0056's rewrite a no-op and lets a second apply get past
     deposits (it still fails closed later — see the file header).
     numbering.ts:211 carries the DEP row with `format: null`, so this is the
     one place the shape is decided. Movement numbers derive from this and
     become `DEP-<n>-M<k>`; nothing constrains or rewrites them. */
  deposit: { key: 'deposit', code: 'DEP', padding: 1, year: null },
  equipment: { key: 'equipment', code: 'EQ', padding: 6, year: null },
} as const satisfies Record<string, SequenceSpec>

/**
 * `EQ000234` and `DEP-2026-0001` are separator-less / year-bearing shapes the
 * registry's format engine cannot express, so the join stays here rather than
 * being faked into `numbering.ts`. Only the **prefix** comes from the registry.
 */
export function recordNo(spec: SequenceSpec, value: number): string {
  const prefix = prefixOf(spec.code)
  const counter = String(value).padStart(spec.padding, '0')
  if (spec.year !== null) return `${prefix}-${spec.year}-${counter}`
  /* `EQ` is the one sequence whose stored form carries no separator at all —
     `products_asset_code_format` in `0004_inventory.sql` enforces
     `^EQ[0-9]{6}$`. Every other sequence joins on the ruled separator. */
  return spec.code === 'EQ' ? `${prefix}${counter}` : `${prefix}-${counter}`
}

interface ProductSpec {
  /** Feeds `equipment` sequence → `asset_code`. */
  seq: number
  name: string
  brand: string
  model: string
  /** `inventory_categories.code`, seeded by `0012` section 8. */
  categoryCode: string
  /** `storage_zones.code`, seeded by `0012` section 3. */
  zoneCode: string
  dailyRateRupees: number
  replacementValueRupees: number
  /** How many `product_units` rows exist for this product. */
  units: number
  /** `SN-<tag>-<n>`. */
  serialTag: string
  /** First serial number. The lens starts at 35 so its first unit is the spec's `SN-LEN-0035`. */
  serialFrom: number
}

/**
 * Six products, eighteen units — `Sample Data.md`'s "18 items × 3 days" for
 * `B-715`, and the daily rates that make the spec's Rs 60,750 equipment
 * subtotal come out of the arithmetic rather than being asserted on top of it.
 * `assertEquals` at the bottom of {@link buildCorpus} is what actually checks
 * that; if a rate here is edited, the generator stops rather than emitting a
 * corpus that quietly contradicts §2.8.
 *
 * `EQ000234` and `SN-LEN-0035` are the identifiers `Sample Data.md` fixes by
 * name; the rest follow from the sequences.
 */
const REFERENCE_PRODUCTS: readonly ProductSpec[] = [
  {
    seq: 234,
    name: 'Sony FX9 Cinema Camera',
    brand: 'Sony',
    model: 'PXW-FX9',
    categoryCode: 'camera',
    zoneCode: 'ZONE-CAM-A',
    dailyRateRupees: 6500,
    replacementValueRupees: 1450000,
    units: 1,
    serialTag: 'CAM',
    serialFrom: 1,
  },
  {
    seq: 235,
    name: 'Sony FX6 Cinema Camera',
    brand: 'Sony',
    model: 'ILME-FX6',
    categoryCode: 'camera',
    zoneCode: 'ZONE-CAM-A',
    dailyRateRupees: 4500,
    replacementValueRupees: 890000,
    units: 1,
    serialTag: 'CAM',
    serialFrom: 2,
  },
  {
    seq: 236,
    name: 'NISI Athena 35mm',
    brand: 'NISI',
    model: 'Athena Prime 35mm T1.9',
    categoryCode: 'lens',
    zoneCode: 'ZONE-LENS-B',
    dailyRateRupees: 1000,
    replacementValueRupees: 260000,
    units: 4,
    serialTag: 'LEN',
    serialFrom: 35,
  },
  {
    seq: 237,
    name: 'Aputure LS 600d Pro',
    brand: 'Aputure',
    model: 'LS 600d Pro',
    categoryCode: 'lighting',
    zoneCode: 'ZONE-GRIP-C',
    dailyRateRupees: 1200,
    replacementValueRupees: 245000,
    units: 2,
    serialTag: 'LIT',
    serialFrom: 1,
  },
  {
    seq: 238,
    name: 'Matthews C-Stand 40in',
    brand: 'Matthews',
    model: 'Hollywood C-Stand',
    categoryCode: 'grip',
    zoneCode: 'ZONE-GRIP-C',
    dailyRateRupees: 150,
    replacementValueRupees: 32000,
    units: 4,
    serialTag: 'GRP',
    serialFrom: 1,
  },
  {
    seq: 239,
    name: 'Manfrotto 504X Tripod System',
    brand: 'Manfrotto',
    model: '504X / 645 FAST',
    categoryCode: 'support',
    zoneCode: 'ZONE-GRIP-C',
    dailyRateRupees: 375,
    replacementValueRupees: 96000,
    units: 6,
    serialTag: 'SUP',
    serialFrom: 1,
  },
]

/**
 * The rest of the catalogue.
 *
 * Only the six categories and three storage zones `0012_seed_data.sql` actually
 * seeds are used — a product pointing at a category code that does not exist
 * would fail its FK on apply, and inventing one here would be seeding reference
 * data from the wrong file.
 *
 * Serial ranges start at 100 so no generated unit can collide with a reference
 * product's `SN-LEN-0035`, which `Sample Data.md` fixes by name.
 */
const CATALOGUE: ReadonlyArray<{
  name: string
  brand: string
  model: string
  categoryCode: string
  zoneCode: string
  dailyRateRupees: number
  replacementValueRupees: number
  units: number
  serialTag: string
}> = [
  { name: 'Sony FX3 Full-Frame Camera', brand: 'Sony', model: 'ILME-FX3', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 3500, replacementValueRupees: 560000, units: 3, serialTag: 'CAM' },
  { name: 'Sony A7S III', brand: 'Sony', model: 'ILCE-7SM3', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 2800, replacementValueRupees: 420000, units: 3, serialTag: 'CAM' },
  { name: 'Canon C70 Cinema Camera', brand: 'Canon', model: 'EOS C70', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 4000, replacementValueRupees: 720000, units: 2, serialTag: 'CAM' },
  { name: 'Canon R5 C', brand: 'Canon', model: 'EOS R5 C', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 3800, replacementValueRupees: 640000, units: 2, serialTag: 'CAM' },
  { name: 'Blackmagic URSA Mini Pro 12K', brand: 'Blackmagic', model: 'URSA Mini Pro 12K', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 5500, replacementValueRupees: 980000, units: 1, serialTag: 'CAM' },
  { name: 'Blackmagic Pocket 6K Pro', brand: 'Blackmagic', model: 'BMPCC 6K Pro', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 2200, replacementValueRupees: 310000, units: 4, serialTag: 'CAM' },
  { name: 'RED Komodo 6K', brand: 'RED', model: 'Komodo 6K', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 6000, replacementValueRupees: 1180000, units: 1, serialTag: 'CAM' },
  { name: 'DJI Ronin 4D-6K', brand: 'DJI', model: 'Ronin 4D', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 7000, replacementValueRupees: 1320000, units: 1, serialTag: 'CAM' },
  { name: 'Panasonic Lumix S5 II', brand: 'Panasonic', model: 'DC-S5M2', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 1800, replacementValueRupees: 260000, units: 3, serialTag: 'CAM' },
  { name: 'Sony FX30', brand: 'Sony', model: 'ILME-FX30', categoryCode: 'camera', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 2000, replacementValueRupees: 280000, units: 3, serialTag: 'CAM' },

  { name: 'NISI Athena 25mm', brand: 'NISI', model: 'Athena Prime 25mm T1.9', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 1000, replacementValueRupees: 260000, units: 3, serialTag: 'LEN' },
  { name: 'NISI Athena 50mm', brand: 'NISI', model: 'Athena Prime 50mm T1.9', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 1000, replacementValueRupees: 260000, units: 3, serialTag: 'LEN' },
  { name: 'NISI Athena 85mm', brand: 'NISI', model: 'Athena Prime 85mm T1.9', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 1000, replacementValueRupees: 260000, units: 3, serialTag: 'LEN' },
  { name: 'Sigma 18-35mm Art', brand: 'Sigma', model: '18-35mm F1.8 DC HSM', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 600, replacementValueRupees: 96000, units: 4, serialTag: 'LEN' },
  { name: 'Sigma 24-70mm Art', brand: 'Sigma', model: '24-70mm F2.8 DG DN', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 700, replacementValueRupees: 128000, units: 4, serialTag: 'LEN' },
  { name: 'Canon CN-E 24mm', brand: 'Canon', model: 'CN-E 24mm T1.5 L F', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 1400, replacementValueRupees: 480000, units: 2, serialTag: 'LEN' },
  { name: 'Canon CN-E 50mm', brand: 'Canon', model: 'CN-E 50mm T1.3 L F', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 1400, replacementValueRupees: 480000, units: 2, serialTag: 'LEN' },
  { name: 'Sony 70-200mm GM II', brand: 'Sony', model: 'FE 70-200mm F2.8 GM OSS II', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 900, replacementValueRupees: 210000, units: 3, serialTag: 'LEN' },
  { name: 'Laowa 12mm Zero-D', brand: 'Laowa', model: '12mm f/2.8 Zero-D', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 550, replacementValueRupees: 88000, units: 2, serialTag: 'LEN' },
  { name: 'DZOFilm Vespid 35mm', brand: 'DZOFilm', model: 'Vespid Prime 35mm T2.1', categoryCode: 'lens', zoneCode: 'ZONE-LENS-B', dailyRateRupees: 850, replacementValueRupees: 175000, units: 3, serialTag: 'LEN' },

  { name: 'Aputure LS 300x', brand: 'Aputure', model: 'LS 300x Bi-Colour', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 900, replacementValueRupees: 145000, units: 4, serialTag: 'LIT' },
  { name: 'Aputure Nova P300c', brand: 'Aputure', model: 'Nova P300c RGBWW', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1600, replacementValueRupees: 320000, units: 2, serialTag: 'LIT' },
  { name: 'Aputure MC Pro 4-Light Kit', brand: 'Aputure', model: 'MC Pro', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 400, replacementValueRupees: 62000, units: 5, serialTag: 'LIT' },
  { name: 'Nanlite Forza 500B II', brand: 'Nanlite', model: 'Forza 500B II', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1300, replacementValueRupees: 265000, units: 2, serialTag: 'LIT' },
  { name: 'Nanlux Evoke 1200B', brand: 'Nanlux', model: 'Evoke 1200B', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 2400, replacementValueRupees: 590000, units: 1, serialTag: 'LIT' },
  { name: 'Astera Titan Tube 8-Pack', brand: 'Astera', model: 'Titan Tube', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 2000, replacementValueRupees: 480000, units: 2, serialTag: 'LIT' },
  { name: 'Godox SL200 III', brand: 'Godox', model: 'SL200 III Bi', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 500, replacementValueRupees: 74000, units: 5, serialTag: 'LIT' },
  { name: 'Aputure Amaran 200x', brand: 'Aputure', model: 'Amaran 200x S', categoryCode: 'lighting', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 450, replacementValueRupees: 58000, units: 6, serialTag: 'LIT' },

  { name: 'Manfrotto Super Clamp', brand: 'Manfrotto', model: '035', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 60, replacementValueRupees: 7500, units: 12, serialTag: 'GRP' },
  { name: 'Avenger Wind-Up Stand', brand: 'Avenger', model: 'A4050', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 350, replacementValueRupees: 68000, units: 4, serialTag: 'GRP' },
  { name: 'Matthews Floppy Flag 24x36', brand: 'Matthews', model: 'Floppy Cutter', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 200, replacementValueRupees: 24000, units: 6, serialTag: 'GRP' },
  { name: 'Sandbag 15lb', brand: 'Matthews', model: 'Sandbag', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 50, replacementValueRupees: 4200, units: 12, serialTag: 'GRP' },
  { name: 'Dana Dolly Kit', brand: 'Dana Dolly', model: 'Portable Dolly', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1500, replacementValueRupees: 280000, units: 1, serialTag: 'GRP' },
  { name: 'Kupo Grip Head 4in', brand: 'Kupo', model: 'KG series', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 70, replacementValueRupees: 8800, units: 10, serialTag: 'GRP' },
  { name: 'Butterfly Frame 6x6', brand: 'Matthews', model: '6x6 Frame + Silk', categoryCode: 'grip', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 800, replacementValueRupees: 96000, units: 2, serialTag: 'GRP' },

  { name: 'Sachtler Flowtech 75', brand: 'Sachtler', model: 'Flowtech 75 MS', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 900, replacementValueRupees: 235000, units: 3, serialTag: 'SUP' },
  { name: 'DJI RS 3 Pro Gimbal', brand: 'DJI', model: 'RS 3 Pro', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1200, replacementValueRupees: 128000, units: 3, serialTag: 'SUP' },
  { name: 'DJI RS 4 Gimbal', brand: 'DJI', model: 'RS 4', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1100, replacementValueRupees: 112000, units: 2, serialTag: 'SUP' },
  { name: 'Easyrig Vario 5', brand: 'Easyrig', model: 'Vario 5 + Flowcine', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1400, replacementValueRupees: 320000, units: 1, serialTag: 'SUP' },
  { name: 'Tilta Shoulder Rig', brand: 'Tilta', model: 'Advanced Shoulder Kit', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 500, replacementValueRupees: 64000, units: 3, serialTag: 'SUP' },
  { name: 'Slider 120cm Motorised', brand: 'Zeapon', model: 'Micro 2 Plus', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 700, replacementValueRupees: 92000, units: 2, serialTag: 'SUP' },
  { name: 'Jib Arm 3m', brand: 'Proaim', model: 'Wave-2 Jib', categoryCode: 'support', zoneCode: 'ZONE-GRIP-C', dailyRateRupees: 1800, replacementValueRupees: 240000, units: 1, serialTag: 'SUP' },

  { name: 'Sennheiser MKH 416', brand: 'Sennheiser', model: 'MKH 416-P48U3', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 700, replacementValueRupees: 135000, units: 4, serialTag: 'AUD' },
  { name: 'Rode NTG5 Kit', brand: 'Rode', model: 'NTG5', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 550, replacementValueRupees: 78000, units: 3, serialTag: 'AUD' },
  { name: 'Sound Devices MixPre-6 II', brand: 'Sound Devices', model: 'MixPre-6 II', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 1200, replacementValueRupees: 195000, units: 2, serialTag: 'AUD' },
  { name: 'Zoom F6 Field Recorder', brand: 'Zoom', model: 'F6', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 800, replacementValueRupees: 108000, units: 2, serialTag: 'AUD' },
  { name: 'Rode Wireless PRO Kit', brand: 'Rode', model: 'Wireless PRO', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 600, replacementValueRupees: 62000, units: 5, serialTag: 'AUD' },
  { name: 'Sennheiser EW 112P G4', brand: 'Sennheiser', model: 'EW 112P G4', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 650, replacementValueRupees: 82000, units: 4, serialTag: 'AUD' },
  { name: 'Boom Pole Carbon 3m', brand: 'Rode', model: 'Boompole Pro', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 150, replacementValueRupees: 22000, units: 5, serialTag: 'AUD' },
  { name: 'Sony MDR-7506 Headphones', brand: 'Sony', model: 'MDR-7506', categoryCode: 'audio', zoneCode: 'ZONE-CAM-A', dailyRateRupees: 100, replacementValueRupees: 14000, units: 8, serialTag: 'AUD' },
]

/**
 * The catalogue, numbered. Sequences run on from the reference products, so
 * `EQ000234`–`EQ000239` keep their meaning and the rest follow.
 *
 * `serialFrom` is spaced 100 apart per product rather than per tag, so no two
 * products of the same tag can ever mint the same `SN-CAM-0003`.
 */
const PRODUCTS: readonly ProductSpec[] = [
  ...REFERENCE_PRODUCTS,
  ...CATALOGUE.map((p, i): ProductSpec => ({ ...p, seq: 240 + i, serialFrom: 100 + i * 100 })),
]

interface LineSpec {
  /** `ProductSpec.seq`. */
  product: number
  qty: number
}

interface CrewSpec {
  name: string
  /** `crew_role` enum, `0001_enums.sql`. Never one of the six RBAC roles. */
  role: string
  dayRateRupees: number
}

interface BookingSpec {
  /** Feeds `booking` sequence → `booking_no`. */
  seq: number
  /** `ClientSpec.seq` — who booked it. */
  clientSeq: number
  project: string
  /** AD, UTC. Law 7 — BS is rendered from this, never stored. */
  pickupAt: Date
  returnAt: Date
  /** The stage the corpus leaves this booking at. Reached one transition at a time. */
  stage: BookingStatus
  lines: readonly LineSpec[]
  crew: readonly CrewSpec[]
  discountPercent: number
  /** Law 10 — required above 10%; `null` below it, never an empty string. */
  discountReason: string | null
  /** `users.email` of the approver. Law 10 — required above 10%, Owner included. */
  discountApproverEmail: string | null
  /**
   * A fixed rupee figure — used by the reference bookings, whose amounts
   * `Sample Data.md` states.
   *
   * Ignored when {@link BookingSpec.paymentShare} is set, which is how every
   * generated booking pays: a *fraction of what the Financial Engine computed*,
   * resolved after `price()` has run. Declaring a rupee figure for a booking
   * whose total this file does not know would be asserting a number the engine
   * is supposed to produce — and getting it wrong by a rupee makes `outstanding`
   * negative and stops the build.
   */
  paymentRupees: number
  /** 0–1. `1` pays the rental total exactly, which is the only way to reach Closed. */
  paymentShare?: number
  depositRequiredRupees: number
  depositReceivedRupees: number
  /** Whether the packed units are recorded on `booking_line_units`. */
  unitsAssigned: boolean
}

/**
 * `16 Jul 2026, 06:00 AM` in Kathmandu (UTC+05:45), stored as the UTC instant —
 * `Sample Data.md`'s date for the reference booking.
 *
 * ⛔ That spec pairs this instant with `1 Shrawan 2083 BS`, which is wrong: under
 * the corrected month-length table 16 Jul 2026 is **32 Ashadh 2083**. Law 7 keeps
 * the instant and moves the label — see the guard at the end of this file.
 */
const NPT_OFFSET_MIN = 345

function kathmandu(year: number, monthIndex: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute) - NPT_OFFSET_MIN * 60_000)
}

const REFERENCE_BOOKINGS: readonly BookingSpec[] = [
  {
    // `Sample Data.md`'s reference booking. Its figures are the single
    // assertion that catches most financial defects.
    seq: 715,
    clientSeq: 34,
    project: 'Annapurna Circuit — documentary shoot',
    pickupAt: kathmandu(2026, 6, 16, 6),
    returnAt: kathmandu(2026, 6, 19, 6),
    // Packed, not On Rent: the spec's own gate checklist for this booking
    // reads "✗ Items Handed Over", with Outstanding Payment and Deposit
    // Pending both still warning. `validate_booking_gates()` (0010) would
    // reject On Rent for exactly those two reasons.
    stage: 'Packed',
    lines: [
      { product: 234, qty: 1 },
      { product: 235, qty: 1 },
      { product: 236, qty: 4 },
      { product: 237, qty: 2 },
      { product: 238, qty: 4 },
      { product: 239, qty: 6 },
    ],
    crew: [
      { name: 'Suman Tamang', role: 'Camera Assistant', dayRateRupees: 8000 },
      { name: 'Prakash Gurung', role: 'Gaffer', dayRateRupees: 8000 },
      { name: 'Nabin Rai', role: 'Grip', dayRateRupees: 8000 },
    ],
    discountPercent: 7,
    discountReason: null,
    discountApproverEmail: null,
    paymentRupees: 15000,
    depositRequiredRupees: 50000,
    depositReceivedRupees: 25000,
    unitsAssigned: true,
  },
  {
    // The second booking exists for one reason: `Sample Data.md` requires
    // "a discount above 10% with reason and named approver" in the corpus,
    // and 7% never reaches that branch of the Law 10 gate. It is the row
    // that proves `booking_discounts_over_ten_needs_reason_and_approver`,
    // `invoices_discount_over_ten_needs_reason_and_approver` and
    // `enforce_booking_discount_stacking()` (0044) all accept a *legal*
    // over-threshold discount, not merely that they reject an illegal one.
    seq: 716,
    clientSeq: 34,
    project: 'Kathmandu Valley — brand film',
    pickupAt: kathmandu(2026, 7, 1, 8),
    returnAt: kathmandu(2026, 7, 3, 8),
    stage: 'Booked',
    lines: [
      { product: 234, qty: 1 },
      { product: 237, qty: 2 },
    ],
    crew: [],
    discountPercent: 15,
    discountReason: 'Repeat production house, three-booking package agreed for Shrawan',
    discountApproverEmail: 'manager@babinrentals.com',
    paymentRupees: 0,
    depositRequiredRupees: 0,
    depositReceivedRupees: 0,
    unitsAssigned: false,
  },
]

interface ClientSpec {
  /** Feeds the `client` sequence → `client_code`. */
  seq: number
  name: string
  typeParent: 'Organisation' | 'Individual'
  /** `client_organisation_subtype`. Null on an Individual — the schema forbids it there. */
  orgSubtype: string | null
  phone: string
  email: string
  addressLine: string
  city: string
  district: string
  /** `client_segment[]`. */
  segments: readonly string[]
  /** `payment_terms`. */
  paymentTerms: string
  /** `client_since`, an AD date. */
  since: string
}

/** `C-34` — the client id `Sample Data.md` fixes by name. Always first. */
const REFERENCE_CLIENT: ClientSpec = {
  seq: 34,
  name: 'Sagarmatha Pictures Pvt. Ltd.',
  typeParent: 'Organisation',
  orgSubtype: 'Production House',
  phone: '+9779801230034',
  email: 'bookings@sagarmathapictures.com.np',
  addressLine: 'Jhamsikhel, Lalitpur',
  city: 'Lalitpur',
  district: 'Lalitpur',
  segments: ['Documentary', 'Commercial'],
  paymentTerms: 'Immediate',
  since: '2024-03-11',
}

/* ── 0b · the demo corpus ──────────────────────────────────────────────────
 *
 * Everything below exists so the screens have something to draw. The reference
 * corpus above is two bookings — enough to prove the engines, and nowhere near
 * enough to tell whether a list, a pager, a KPI or a filter works.
 *
 * ## It is generated, not typed
 *
 * `PLAN.md` Phase 1: *"Seed data generated through the engines, never
 * hand-typed."* That rule is not about volume, it is about which component
 * decides a figure — and it binds here exactly as it binds above. Nothing below
 * states a subtotal, a VAT amount, an outstanding balance, a day count or a
 * stage path. Each of those still comes out of `buildCorpus`, which runs
 * `money.ts`, `validation.ts`, `discount.ts` and `workflow.ts` over every one of
 * these rows and refuses to emit on the first disagreement. What is declared
 * here is only what a human would have chosen anyway: names, rates, dates, who
 * booked what.
 *
 * ## Deterministic, never random
 *
 * No `Math.random`. Every value is an index arithmetic over a fixed pool, so
 * `npm run seed:sql` is byte-identical run to run — the property `seedUuid`
 * already gives the identifiers, extended to the corpus itself. A random corpus
 * would make the emitted migration a diff every time it was regenerated and
 * would make a failure impossible to reproduce.
 */

/** `readonly T[]` indexing is `T | undefined` under `noUncheckedIndexedAccess`; the modulo makes it total. */
function cycle<T>(pool: readonly T[], index: number): T {
  const value = pool[((index % pool.length) + pool.length) % pool.length]
  if (value === undefined) fail('cycle() over an empty pool')
  return value
}

const ORG_STEMS = [
  'Himalaya', 'Annapurna', 'Machhapuchhre', 'Gandaki', 'Bagmati', 'Langtang', 'Manaslu', 'Dhaulagiri',
  'Rara', 'Phewa', 'Gosaikunda', 'Chitwan', 'Lumbini', 'Janaki', 'Newa', 'Kirat', 'Tamang', 'Sherpa',
  'Everest', 'Kailash',
] as const

const ORG_KINDS: ReadonlyArray<{ word: string; subtype: string; segments: readonly string[] }> = [
  { word: 'Films', subtype: 'Production House', segments: ['Feature', 'Documentary'] },
  { word: 'Media', subtype: 'Broadcaster', segments: ['Corporate'] },
  { word: 'Studios', subtype: 'Production House', segments: ['Commercial', 'Music Video'] },
  { word: 'Creatives', subtype: 'Corporate / Agency', segments: ['Corporate', 'Commercial'] },
  { word: 'Rentals', subtype: 'Rental House', segments: ['Commercial'] },
  { word: 'College of Media', subtype: 'College / Institution', segments: ['Documentary'] },
  { word: 'Foundation', subtype: 'Government / NGO', segments: ['Documentary'] },
  { word: 'Weddings', subtype: 'Corporate / Agency', segments: ['Wedding / Event'] },
] as const

const PLACES: ReadonlyArray<{ area: string; city: string; district: string }> = [
  { area: 'Jhamsikhel', city: 'Lalitpur', district: 'Lalitpur' },
  { area: 'Thamel', city: 'Kathmandu', district: 'Kathmandu' },
  { area: 'Baluwatar', city: 'Kathmandu', district: 'Kathmandu' },
  { area: 'Lakeside', city: 'Pokhara', district: 'Kaski' },
  { area: 'Bharatpur', city: 'Chitwan', district: 'Chitwan' },
  { area: 'Durbar Square', city: 'Bhaktapur', district: 'Bhaktapur' },
  { area: 'Traffic Chowk', city: 'Butwal', district: 'Rupandehi' },
  { area: 'Dharan Road', city: 'Biratnagar', district: 'Morang' },
] as const

const INDIVIDUALS = [
  'Rupesh Karki', 'Sunita Gurung', 'Bikash Shrestha', 'Anjali Thapa', 'Prakash Rai',
  'Nisha Maharjan', 'Deepak Lama', 'Sarita Bhandari',
] as const

const PAYMENT_TERMS = ['Immediate', '7 days', '15 days', '30 days'] as const

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * 40 clients: the reference one, 31 organisations, 8 individuals.
 *
 * Individuals carry `orgSubtype: null` because `0005_clients.sql` constrains
 * the subtype to organisations — a demo that set one on a person would seed a
 * row the schema is entitled to reject.
 */
const CLIENTS: readonly ClientSpec[] = [
  REFERENCE_CLIENT,
  ...Array.from({ length: 31 }, (_, i): ClientSpec => {
    const stem = cycle(ORG_STEMS, i)
    const kind = cycle(ORG_KINDS, i)
    const place = cycle(PLACES, i)
    const name = `${stem} ${kind.word}${kind.subtype === 'College / Institution' ? '' : ' Pvt. Ltd.'}`
    const seq = 35 + i
    return {
      seq,
      name,
      typeParent: 'Organisation',
      orgSubtype: kind.subtype,
      phone: `+97798${String(11200000 + seq * 137).slice(0, 8)}`,
      email: `bookings@${slug(stem + kind.word)}.com.np`,
      addressLine: `${place.area}, ${place.city}`,
      city: place.city,
      district: place.district,
      segments: kind.segments,
      paymentTerms: cycle(PAYMENT_TERMS, i),
      since: `202${3 + (i % 3)}-0${1 + (i % 9)}-1${i % 10}`,
    }
  }),
  ...INDIVIDUALS.map((person, i): ClientSpec => {
    const place = cycle(PLACES, i + 3)
    const seq = 66 + i
    return {
      seq,
      name: person,
      typeParent: 'Individual',
      orgSubtype: null,
      phone: `+97798${String(41200000 + seq * 211).slice(0, 8)}`,
      email: `${slug(person)}@gmail.com`,
      addressLine: `${place.area}, ${place.city}`,
      city: place.city,
      district: place.district,
      segments: [cycle(['Wedding / Event', 'Music Video', 'Documentary'] as const, i)],
      paymentTerms: 'Immediate',
      since: `2025-0${1 + (i % 9)}-2${i % 8}`,
    }
  }),
]

/**
 * The day this corpus treats as *now* — 31 Jul 2026 (month is 0-indexed).
 *
 * Every generated booking is placed relative to this rather than to a real
 * clock, for the same reason the corpus has no `Math.random`: a seed whose
 * meaning drifts with the calendar shows an empty Today screen a week after it
 * was written, and "is Today broken or is the data just old" is not a question
 * anyone should have to ask. The rental day runs 06:00→06:00, so that is the
 * hour these land on.
 *
 * ⛔ **This comment used to say "`bs.ts`'s `TODAY`, 31 Jul 2026". That constant
 * no longer exists,** and the justification above has quietly inverted.
 * `bs.ts:255` records that `export const TODAY = new Date(Date.UTC(2026, 6, 31))`
 * was replaced by `getBusinessToday()`, which reads the **real clock**, because
 * "every overdue chip, ageing count and days-left figure derived from it was
 * measuring distance from a day in the past".
 *
 * **The app was un-frozen; this anchor was not.** They now disagree by however
 * long ago 31 Jul 2026 was, and the failure the paragraph above warns about is
 * the one this constant now causes: `STAGE_PLAN` puts `Packed` at 0–2 days out,
 * so regenerating the corpus today emits Packed pickups dated 31 Jul – 2 Aug and
 * **Today ▸ Going out renders empty anyway**. Both a drifting anchor and a frozen
 * one end at the same empty screen; only the direction of the lie differs.
 *
 * TODO(decision): PLAN.md §4 — should the anchor track the clock at GENERATION
 * time (`npm run seed:sql` emits dates relative to the day it is run) or stay
 * fixed? Fixed keeps `0047` byte-reproducible and keeps the test suite's
 * expectations stable, which is why it is not simply changed here. Clock-relative
 * keeps the Today screens meaningful without a re-anchor every month. The cost of
 * getting it wrong: fixed means every demo after the anchor date shows an empty
 * floor; clock-relative means a regenerated `0047` no longer matches the one on
 * record, and any test asserting a literal seeded instant breaks.
 *
 * Not urgent for the live corpus, which is not generated from this file at all —
 * see `supabase/migrations/0074_seed_operational_stage_corpus.sql`, which seeds
 * the two missing stages from the clock at apply time.
 */
const ANCHOR = kathmandu(2026, 6, 31, 6, 0)
const DAY_MS = 24 * 60 * 60_000

/**
 * How many bookings sit at each stage, and where their pickup falls relative to
 * {@link ANCHOR}.
 *
 * The windows are what make the screens mean something. `On Rent` reaching back
 * twelve days against runs of 2–7 days is what puts real rows behind the
 * **Overdue** chip — bookings out now whose return time has passed — rather
 * than leaving it an empty state nobody can tell from a broken query. `Packed`
 * sitting on 0–2 days is what gives Today's outgoing queue and the packing
 * floor something to show.
 */
const STAGE_PLAN: ReadonlyArray<{ stage: BookingStatus; count: number; from: number; to: number }> = [
  { stage: 'Quote', count: 18, from: 3, to: 30 },
  { stage: 'Booked', count: 30, from: 1, to: 24 },
  { stage: 'Packed', count: 16, from: 0, to: 2 },
  { stage: 'On Rent', count: 24, from: -12, to: -1 },
  { stage: 'Returned', count: 14, from: -30, to: -8 },
  { stage: 'Closed', count: 16, from: -60, to: -20 },
]

const PROJECTS = [
  'Everest Base Camp Documentary', 'Nepal Tourism Board TVC', 'Kathmandu Street Food Series',
  'Himalayan Airlines Safety Film', 'Ncell Brand Campaign', 'Chitwan Wildlife Feature',
  'Wedding — Shrestha / Rai', 'Pathao Nepal Launch Spot', 'Sagarmatha Music Video',
  'Lumbini Heritage Short', 'Nepal Investment Bank AGM', 'Pokhara Paragliding Promo',
  'Dashain Family Campaign', 'Annapurna Trek Series', 'Kathmandu Jazz Festival',
  'Daraz 11.11 Campaign', 'Nepal Cricket Highlights', 'Rara Lake Travel Film',
  'F1Soft Corporate Profile', 'Thamel After Dark',
] as const

const CREW_POOL: readonly CrewSpec[] = [
  { name: 'Anish Tamang', role: 'DoP', dayRateRupees: 8000 },
  { name: 'Sabina Rai', role: 'Focus Puller', dayRateRupees: 4500 },
  { name: 'Kiran Magar', role: 'Gaffer', dayRateRupees: 5000 },
  { name: 'Prabin Shrestha', role: 'Grip', dayRateRupees: 3500 },
  { name: 'Melina Thapa', role: 'Sound Recordist', dayRateRupees: 5500 },
  { name: 'Roshan Karki', role: 'Drone Pilot', dayRateRupees: 7000 },
  { name: 'Dipesh Gurung', role: 'Camera Assistant', dayRateRupees: 3000 },
  { name: 'Sujata Basnet', role: 'Rental Coordinator', dayRateRupees: 3200 },
]

/**
 * `A % n` where the spread is coprime with `n`, so consecutive bookings do not
 * all land on the same client or the same product. A plain `i % n` would give
 * client 1 every eighth booking and nothing to the rest.
 */
function spread(i: number, size: number, step: number): number {
  return (i * step) % size
}

/**
 * The demo bookings.
 *
 * Read what is NOT here: no subtotal, no VAT, no total, no outstanding, no day
 * count, no stage path. `buildCorpus` derives every one of those by running the
 * engines over what this returns, and refuses to emit if any disagrees. This
 * function chooses only what a coordinator would have chosen — who, what, when,
 * how long, how much was paid.
 */
function demoBookings(): readonly BookingSpec[] {
  const out: BookingSpec[] = []
  let i = 0

  for (const plan of STAGE_PLAN) {
    for (let n = 0; n < plan.count; n += 1, i += 1) {
      const span = plan.to - plan.from
      const dayOffset = plan.from + (span === 0 ? 0 : spread(n, span + 1, 7))
      const durationDays = 2 + (n % 6)
      const pickupAt = new Date(ANCHOR.getTime() + dayOffset * DAY_MS)
      const returnAt = new Date(pickupAt.getTime() + durationDays * DAY_MS)

      /* 2–5 lines, each a different product, each within its own unit count —
         `buildCorpus` fails the build on `qty > product.units`, which is the
         generator's half of §1.6. */
      const lineCount = 2 + (i % 4)
      const lines: LineSpec[] = []
      for (let k = 0; k < lineCount; k += 1) {
        const product = PRODUCTS[spread(i * 5 + k, PRODUCTS.length, 13)]
        if (product === undefined) fail('demoBookings: product pool exhausted')
        if (lines.some((l) => l.product === product.seq)) continue
        lines.push({ product: product.seq, qty: 1 + ((i + k) % Math.min(3, product.units)) })
      }

      const crewCount = i % 3
      const crew = Array.from({ length: crewCount }, (_, c) => cycle(CREW_POOL, i + c))

      /* Law 10. A discount over 10% carries a reason and a named approver, or
         `validateDiscount` refuses it and nothing is emitted. */
      const bigDiscount = i % 17 === 0
      const discountPercent = bigDiscount ? 15 : i % 5 === 0 ? 10 : i % 3 === 0 ? 5 : 0

      /* Closed is not a label here — `closeGates` decides it. A booking may only
         be Closed with nothing outstanding and its deposit resolved, so these
         two lines are what make the stage above legal rather than asserted. */
      const closed = plan.stage === 'Closed'
      const paymentShare = closed ? 1 : cycle([0, 0.25, 0.5, 0.4], i)
      const depositRequiredRupees = i % 4 === 0 ? 0 : 5000 * (1 + (i % 4))
      const depositReceivedRupees = closed ? depositRequiredRupees : i % 3 === 0 ? 0 : depositRequiredRupees / 2

      out.push({
        seq: 800 + i,
        clientSeq: cycle(CLIENTS, spread(i, CLIENTS.length, 11)).seq,
        project: cycle(PROJECTS, i),
        pickupAt,
        returnAt,
        stage: plan.stage,
        lines,
        crew,
        discountPercent,
        discountReason: bigDiscount ? 'Repeat client, multi-week booking negotiated with the owner' : null,
        discountApproverEmail: bigDiscount ? 'owner@babinrentals.com' : null,
        paymentRupees: 0,
        paymentShare,
        depositRequiredRupees,
        depositReceivedRupees,
        /* ⚠ Deliberately false on every generated booking.
         *
         * `booking_line_units` names a specific physical unit, and this
         * generator does not model which unit is free on which day. Assigning
         * them by index would put the same `EQ000241-U01` on two bookings whose
         * dates overlap — a lie the floor screens would render as fact, and
         * exactly the class of defect `Sample Data.md` says hand-typed demo data
         * produced. The reference booking keeps its units because its dates are
         * fixed and its units are named by the spec. */
        unitsAssigned: false,
      })
    }
  }

  return out
}

const BOOKINGS: readonly BookingSpec[] = [...REFERENCE_BOOKINGS, ...demoBookings()]

/* ── 1 · deterministic identity ────────────────────────────────────────────*/

/**
 * Law 8 — *"Every write carries a client UUID. Duplicates rejected."* Every
 * row this generator emits needs one, and `dataAccess.ts`'s
 * `generateClientUuid()` is deliberately **not** used: it returns
 * `crypto.randomUUID()`, so regenerating the migration would rewrite all
 * ~60 keys and the diff would be unreadable — worse, a re-applied seed would
 * duplicate rather than conflict, which is the exact failure `client_uuid`
 * exists to prevent.
 *
 * Derived from the row's natural key instead: same corpus in, same keys out,
 * and `on conflict (client_uuid) do nothing` makes a second apply of that ROW a no-op. (The file as a whole is one-shot — see its header and PLAN.md §4.42(a).)
 * Well-formed (version 4 nibble, RFC 4122 variant) but not random — a hash of
 * the key, which is what an idempotency key is supposed to be.
 */
export function seedUuid(key: string): string {
  return SEED_UUID_HEX(key)
}

/**
 * MD5, in about sixty lines, because **Postgres has the same function**.
 *
 * The identity above used to be FNV-1a with a splitmix finaliser — a fine hash
 * with one disqualifying property: nothing on the database side can reproduce
 * it. That forced every derivable row to be shipped as a literal, because a
 * `product_unit` invented by a `generate_series` could not be given the same
 * `client_uuid` the TypeScript would have given it, and Law 8's idempotency key
 * would differ between two renderings of one corpus.
 *
 * `md5(text)` is in core Postgres and returns the same 32 hex characters this
 * does, so `md5('product_unit:' || tag)::uuid` in SQL and `seedUuid()` here
 * agree exactly. That is what lets {@link compactSeedSql} derive units, invoice
 * lines and stage transitions server-side while staying byte-identical to the
 * reviewable migration — and it is why this is MD5 rather than a better hash.
 * Nothing here is a security decision; it is an identity decision, and the
 * requirement is agreement, not strength.
 *
 * ⚠ The version-4 nibble the old scheme forced is gone. These were never random
 * and stamping a `4` on them said they were. A `uuid` column stores 128 bits;
 * Postgres does not read the version nibble, and neither does anything here.
 *
 * Verified against the live database's own `md5()` on apply — see PROGRESS.md.
 */
function SEED_UUID_HEX(key: string): string {
  const hex = md5Hex(`babin-rentals-os/seed/${key}`)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** The string Postgres must be handed to reproduce {@link seedUuid} for a key. */
export function seedUuidSqlKey(keyExpression: string): string {
  return `md5('babin-rentals-os/seed/' || ${keyExpression})::uuid`
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

/** `floor(abs(sin(i + 1)) * 2^32)`, the constants RFC 1321 defines. */
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296))

function utf8Bytes(input: string): number[] {
  const out: number[] = []
  for (const ch of input) {
    let cp = ch.codePointAt(0) ?? 0
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else {
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
      cp = 0
    }
  }
  return out
}

function md5Hex(input: string): string {
  const bytes = utf8Bytes(input)
  const bitLength = bytes.length * 8

  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  // Length appended little-endian, low 32 bits then high 32.
  for (let i = 0; i < 4; i += 1) bytes.push((bitLength >>> (8 * i)) & 0xff)
  for (let i = 0; i < 4; i += 1) bytes.push(Math.floor(bitLength / 4294967296) >>> (8 * i) & 0xff)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const rotl = (x: number, c: number): number => (x << c) | (x >>> (32 - c))

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const m: number[] = []
    for (let j = 0; j < 16; j += 1) {
      const o = chunk + j * 4
      m.push(
        ((bytes[o] ?? 0) | ((bytes[o + 1] ?? 0) << 8) | ((bytes[o + 2] ?? 0) << 16) | ((bytes[o + 3] ?? 0) << 24)) >>> 0,
      )
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i += 1) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const tmp = d
      d = c
      c = b
      const sum = (a + f + (MD5_K[i] ?? 0) + (m[g] ?? 0)) >>> 0
      b = (b + rotl(sum, MD5_S[i] ?? 0)) >>> 0
      a = tmp
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const le = (n: number): string =>
    Array.from({ length: 4 }, (_, i) => (((n >>> (8 * i)) & 0xff).toString(16).padStart(2, '0'))).join('')
  return le(a0) + le(b0) + le(c0) + le(d0)
}

/* ── 2 · the corpus, computed ──────────────────────────────────────────────*/

export interface SeedLine {
  clientUuid: string
  assetCode: string
  description: string
  qty: number
  days: number
  rateRupees: number
  /** `qty × rate × days`. */
  lineTotal: Paisa
  sortOrder: number
}

export interface SeedCrewLine {
  clientUuid: string
  name: string
  role: string
  dayRateRupees: number
  days: number
  lineTotal: Paisa
}

export interface SeedUnit {
  clientUuid: string
  assetCode: string
  assetTag: string
  serialNo: string
  zoneCode: string
  replacementValueRupees: number
}

export interface SeedTransition {
  clientUuid: string
  from: BookingStatus | null
  to: BookingStatus
  occurredAt: Date
}

export interface SeedBooking {
  spec: BookingSpec
  bookingNo: string
  /** The ruled `C-<n>` of whoever booked it. */
  clientCode: string
  invoiceNo: string
  paymentNo: string | null
  depositNo: string | null
  /** From `validateRentalDates` — never counted here, never defaulted by omission (Law 9). */
  days: number
  lines: readonly SeedLine[]
  crew: readonly SeedCrewLine[]
  units: readonly SeedUnit[]
  transitions: readonly SeedTransition[]
  breakdown: PriceBreakdown
  equipment: Paisa
  crewTotal: Paisa
  /** Law 5 — a liability, never in `breakdown`. */
  depositPending: Paisa
  itemCount: number
  bsPickup: string | null
}

export interface SeedCorpus {
  bookings: readonly SeedBooking[]
  products: readonly ProductSpec[]
  clients: readonly ClientSpec[]
  /** The reference client, `C-34`. Kept named because `Sample Data.md` names it. */
  clientCode: string
  /** `sequence_key` → the highest counter the corpus consumes. */
  sequenceHighWater: ReadonlyMap<string, number>
}

function fail(message: string): never {
  throw new Error(`Seed generator refused to emit — ${message}`)
}

function productBySeq(seq: number): ProductSpec {
  const found = PRODUCTS.find((p) => p.seq === seq)
  if (!found) fail(`no product with equipment sequence ${seq} in PRODUCTS`)
  return found
}

/** Paisa is a branded integer; summing needs the brand reapplied once, not per term. */
function sumPaisa(values: readonly Paisa[]): Paisa {
  return values.reduce<number>((total, v) => total + v, 0) as Paisa
}

/**
 * Runs every engine over {@link BOOKINGS} and throws on the first disagreement.
 * Nothing downstream of here decides a figure.
 */
export function buildCorpus(): SeedCorpus {
  // Foundation §2.8's own assertion, checked before anything else: if the
  // Financial Engine does not reproduce the worked example, no seed generated
  // from it is worth writing.
  if (REFERENCE_CASE_ERROR !== null) fail(REFERENCE_CASE_ERROR)

  const highWater = new Map<string, number>()
  const raise = (key: string, value: number): void => {
    highWater.set(key, Math.max(highWater.get(key) ?? 0, value))
  }
  for (const c of CLIENTS) raise(SEQUENCES.client.key, c.seq)
  for (const product of PRODUCTS) raise(SEQUENCES.equipment.key, product.seq)

  const clientBySeq = new Map(CLIENTS.map((c) => [c.seq, c]))

  const bookings: SeedBooking[] = []
  let invoiceSeq = 0
  let paymentSeq = 0
  let depositSeq = 0

  for (const spec of BOOKINGS) {
    const bookingNo = recordNo(SEQUENCES.booking, spec.seq)
    raise(SEQUENCES.booking.key, spec.seq)

    const clientSpec = clientBySeq.get(spec.clientSeq)
    if (!clientSpec) fail(`${bookingNo}: no client with sequence ${spec.clientSeq} in CLIENTS`)
    const clientCode = recordNo(SEQUENCES.client, clientSpec.seq)

    /* Validation Engine — causal order, and the day count itself. Law 9 says
     * days is mandatory on every priced line and explicit; taking it from the
     * engine rather than counting it here is what makes that true of the seed. */
    const dates = validateRentalDates(spec.pickupAt.toISOString(), spec.returnAt.toISOString())
    if (!dates.valid) fail(`${bookingNo}: ${dates.error ?? 'invalid rental dates'}`)
    const days = dates.days

    /* Discount Engine — both implementations, cross-checked. `discount.ts` is
     * the Law 10 gate the schema mirrors; `money.ts`'s `discountGate` is the
     * one the Financial Engine ships. A seed that satisfies one and not the
     * other would hide a divergence between them. */
    const verdict = validateDiscount(spec.discountPercent, spec.discountReason, spec.discountApproverEmail)
    const gate = discountGate(spec.discountPercent, spec.discountReason ?? '', spec.discountApproverEmail)
    if (!verdict.valid) fail(`${bookingNo}: ${verdict.error ?? 'discount rejected'}`)
    if (gate.ok !== verdict.valid) {
      fail(`${bookingNo}: discount.ts and money.ts disagree at ${spec.discountPercent}% — ${gate.ok ? 'money.ts accepts' : gate.why}`)
    }
    if (verdict.requiresApproval && (spec.discountReason === null || spec.discountApproverEmail === null)) {
      fail(`${bookingNo}: ${spec.discountPercent}% needs a reason and a named approver (Law 10)`)
    }

    const lines: SeedLine[] = []
    const units: SeedUnit[] = []
    let sortOrder = 0
    for (const line of spec.lines) {
      const product = productBySeq(line.product)
      const assetCode = recordNo(SEQUENCES.equipment, product.seq)
      if (line.qty > product.units) {
        fail(`${bookingNo}: ${assetCode} is booked ${line.qty}× but only ${product.units} unit(s) exist`)
      }
      lines.push({
        clientUuid: seedUuid(`booking_line:${bookingNo}:${assetCode}`),
        assetCode,
        // `ProductSpec.name` already leads with the brand; the brand is its own
        // column on `products` and repeating it here read as "Sony Sony FX9".
        description: product.name,
        qty: line.qty,
        days,
        rateRupees: product.dailyRateRupees,
        lineTotal: (rupees(product.dailyRateRupees) * line.qty * days) as Paisa,
        sortOrder: (sortOrder += 10),
      })
      if (spec.unitsAssigned) {
        for (let n = 0; n < line.qty; n += 1) {
          const assetTag = `${assetCode}-U${String(n + 1).padStart(2, '0')}`
          units.push({
            clientUuid: seedUuid(`booking_line_unit:${bookingNo}:${assetTag}`),
            assetCode,
            assetTag,
            serialNo: `SN-${product.serialTag}-${String(product.serialFrom + n).padStart(4, '0')}`,
            zoneCode: product.zoneCode,
            replacementValueRupees: product.replacementValueRupees,
          })
        }
      }
    }

    const crew: SeedCrewLine[] = spec.crew.map((member) => ({
      clientUuid: seedUuid(`booking_crew_line:${bookingNo}:${member.name}`),
      name: member.name,
      role: member.role,
      dayRateRupees: member.dayRateRupees,
      days,
      lineTotal: (rupees(member.dayRateRupees) * days) as Paisa,
    }))

    /* Financial Engine — the calculation order, §2.1. Every money figure in
     * the emitted SQL comes out of this one call. */
    const equipment = sumPaisa(lines.map((l) => l.lineTotal))
    const crewTotal = sumPaisa(crew.map((c) => c.lineTotal))
    const priced = {
      equipment,
      crew: crewTotal,
      // §2.1 — "Rs 0 on client pickup". Explicit, not omitted.
      transport: rupees(0),
      discountPercent: spec.discountPercent,
      vatPercent: VAT_PERCENT,
    }

    /**
     * A share is resolved against what the engine computed, not against a
     * figure this file guessed.
     *
     * `price()` is called twice on purpose: once to learn the rental total with
     * nothing paid, then again with the payment that total implies. The
     * alternative — declaring rupees per booking — means the corpus asserting a
     * number the Financial Engine is supposed to produce, and a rupee of drift
     * makes `outstanding` negative and stops the build. `Math.round` keeps it a
     * whole paisa; `Paisa` is an integer brand.
     */
    const unpaid = price({ ...priced, payments: rupees(0) })
    const payments: Paisa =
      spec.paymentShare === undefined
        ? rupees(spec.paymentRupees)
        : (Math.round(unpaid.rentalTotal * spec.paymentShare) as Paisa)

    const breakdown = price({ ...priced, payments })

    if (breakdown.outstanding < 0) fail(`${bookingNo}: payments exceed the rental total`)

    /* Status Engine — the stage is reached one legal transition at a time,
     * starting from the genesis row at Quote. `canAdvance` is what rejects a
     * skipped stage; the DB's own trigger (0021) re-checks the same rule when
     * these rows land. */
    const target = BOOKING_STATUS[spec.stage]
    const path = STATUS_ORDER.filter((s) => BOOKING_STATUS[s].order <= target.order)
    const transitions: SeedTransition[] = []
    let previous: BookingStatus | null = null
    let offsetMinutes = 0
    for (const stage of path) {
      if (previous !== null && !canAdvance(previous, stage)) {
        fail(`${bookingNo}: ${previous} → ${stage} is not a legal advance`)
      }
      transitions.push({
        clientUuid: seedUuid(`booking_stage_transition:${bookingNo}:${stage}`),
        from: previous,
        to: stage,
        // Causal order: strictly increasing, and all before pickup. The
        // "booking confirmed at 09:20 sitting below events at 05:30" defect
        // came from timestamps that did not order.
        occurredAt: new Date(spec.pickupAt.getTime() - (72 - offsetMinutes) * 60 * 60_000),
      })
      previous = stage
      offsetMinutes += 1
    }

    /* Status Engine §1.6 — the item-quantity invariant. This is the check that
     * makes "21 items on an 18-item booking" unrepresentable. */
    const itemCount = lines.reduce((total, l) => total + l.qty, 0)
    if (spec.unitsAssigned) {
      assertItemCounts({ Ready: units.length, 'Picked Up': 0, Returned: 0, Missing: 0 }, itemCount)
    }

    /* Status Engine §1.7 — a booking carrying an outstanding balance must not
     * be closeable. Asserted here so the corpus cannot drift into a state the
     * close gates would wave through. */
    const depositPending = (rupees(spec.depositRequiredRupees) - rupees(spec.depositReceivedRupees)) as Paisa
    if (depositPending < 0) fail(`${bookingNo}: deposit received exceeds deposit required`)
    const gates = closeGates({
      rentalOutstandingPaisa: breakdown.outstanding,
      depositResolved: depositPending === 0,
      openCases: 0,
      damageChargesPendingApproval: 0,
    })
    const closeable = gates.every((g) => g.passing)
    if (closeable !== (spec.stage === 'Closed')) {
      fail(
        `${bookingNo}: close gates say closeable=${String(closeable)} but the corpus leaves it at ${spec.stage} — ` +
          gates.filter((g) => !g.passing).map((g) => `${g.label} (${g.blocking ?? ''})`).join(', '),
      )
    }

    invoiceSeq += 1
    raise(SEQUENCES.invoice.key, invoiceSeq)
    let paymentNo: string | null = null
    // The engine's figure, not the spec's — a share of zero writes no payment row.
    if (breakdown.payments > 0) {
      paymentSeq += 1
      raise(SEQUENCES.payment.key, paymentSeq)
      paymentNo = recordNo(SEQUENCES.payment, paymentSeq)
    }
    let depositNo: string | null = null
    if (spec.depositRequiredRupees > 0) {
      depositSeq += 1
      raise(SEQUENCES.deposit.key, depositSeq)
      depositNo = recordNo(SEQUENCES.deposit, depositSeq)
    }

    /* Date Engine — Law 7. BS never reaches a column; it is derived here only
     * so the generator can prove the stored UTC instant is the day the spec
     * names. Since 5 Sep 2026 `bs.ts` vouches for BS 2078-2095 (14 Apr 2021 to
     * 2039) and returns null only outside that range. */
    const bs = toBs(spec.pickupAt)

    bookings.push({
      spec,
      bookingNo,
      clientCode,
      invoiceNo: recordNo(SEQUENCES.invoice, invoiceSeq),
      paymentNo,
      depositNo,
      days,
      lines,
      crew,
      units,
      transitions,
      breakdown,
      equipment,
      crewTotal,
      depositPending,
      itemCount,
      bsPickup: bs === null ? null : formatBs(bs),
    })
  }

  /* The one figure the specs state independently of this generator. If the
   * reference booking's composition ever stops reproducing §2.8, the seed
   * stops being emitted rather than silently becoming the new truth. */
  const reference = bookings.find((b) => b.bookingNo === 'B-715')
  if (!reference) fail('B-715 is missing from the corpus — Sample Data.md names it as the reference booking')
  const mismatches = (Object.keys(REFERENCE_CASE) as Array<keyof PriceBreakdown>)
    .filter((k) => reference.breakdown[k] !== REFERENCE_CASE[k])
    .map((k) => `${k}: corpus Rs ${toRupees(reference.breakdown[k])}, §2.8 Rs ${toRupees(REFERENCE_CASE[k])}`)
  if (mismatches.length > 0) fail(`B-715 does not reproduce Foundation §2.8 — ${mismatches.join('; ')}`)
  if (reference.itemCount !== 18) fail(`B-715 must carry 18 items (Sample Data.md), corpus has ${reference.itemCount}`)
  if (reference.days !== 3) fail(`B-715 must run 3 days (Sample Data.md), corpus has ${reference.days}`)
  /*
   * ⛔ Was `'1 Shrawan 2083 BS'` until 5 Sep 2026, and that guard pinned a bug.
   *
   * `Sample Data.md` states the pairing **"1 Shrawan 2083 BS · 16 Jul 2026,
   * 06:00 AM"**. Under the corrected month-length table those cannot both be
   * true: 16 Jul 2026 is **32 Ashadh 2083**, and 1 Shrawan is the 17th. The spec
   * inherited the same off-by-one the engine had, and this assertion then held
   * it in place — it would have failed the corrected engine and looked like the
   * engine was wrong.
   *
   * **Law 7 decides which half survives: AD is stored, BS is rendered and never
   * stored.** The UTC instant is the fact; the BS string was a derived label the
   * spec mis-derived. So the instant is unchanged and the expectation moves.
   *
   * To revert the other way — move the booking rather than the label — set this
   * booking's pickup/return to 17/20 Jul and restore `'1 Shrawan 2083 BS'`.
   * That is a data change, not an engine change, and needs a ruling because it
   * moves a reference booking every money assertion in the suite is keyed to.
   */
  if (reference.bsPickup !== '32 Ashadh 2083 BS') {
    fail(`B-715 pickup must render as 32 Ashadh 2083 BS (16 Jul 2026 under the corrected BS table), bs.ts renders ${reference.bsPickup ?? 'null'}`)
  }

  return {
    bookings,
    products: PRODUCTS,
    clients: CLIENTS,
    clientCode: recordNo(SEQUENCES.client, REFERENCE_CLIENT.seq),
    sequenceHighWater: highWater,
  }
}

/* ── 3 · SQL emission ──────────────────────────────────────────────────────*/

function txt(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function uuid(value: string): string {
  return `'${value}'::uuid`
}

/** Paisa → the `numeric(14,2)` the schema stores. Money never crosses as a float literal. */
function money(value: Paisa): string {
  return toRupees(value).toFixed(2)
}

function ts(value: Date): string {
  return `'${value.toISOString()}'::timestamptz`
}

function textArray(values: readonly string[]): string {
  return `array[${values.map(txt).join(', ')}]`
}

const BRANCH = `(select id from branches where branch_code = 'BR-KTM-01')`
const WAREHOUSE = `(select id from warehouses where warehouse_code = 'WH-KTM-MAIN')`
const BANK = `(select id from bank_accounts where account_number = '01201017500001')`

function user(email: string): string {
  return `(select id from users where email = ${txt(email)})`
}

function zone(code: string): string {
  return `(select id from storage_zones where code = ${txt(code)})`
}

function category(code: string): string {
  return `(select id from inventory_categories where code = ${txt(code)})`
}

function client(code: string): string {
  return `(select id from clients where client_code = ${txt(code)})`
}

function product(assetCode: string): string {
  return `(select id from products where asset_code = ${txt(assetCode)})`
}

function unit(assetTag: string): string {
  return `(select id from product_units where asset_tag = ${txt(assetTag)})`
}

function booking(bookingNo: string): string {
  return `(select id from bookings where booking_no = ${txt(bookingNo)})`
}

function invoice(invoiceNo: string): string {
  return `(select id from invoices where invoice_no = ${txt(invoiceNo)})`
}

function deposit(depositNo: string): string {
  return `(select id from security_deposits where deposit_no = ${txt(depositNo)})`
}

function byClientUuid(table: string, clientUuid: string): string {
  return `(select id from ${table} where client_uuid = ${uuid(clientUuid)})`
}

const OWNER = user('owner@babinrentals.com')
const WAREHOUSE_STAFF = user('warehouse@babinrentals.com')
const BILLING = user('billing@babinrentals.com')

function section(title: string): string {
  const rule = '-'.repeat(77)
  return `-- ${rule}\n-- ${title}\n-- ${rule}`
}

/**
 * Renders {@link buildCorpus}'s output as the seed migration. Pure string
 * assembly — every decision was already taken by an engine upstream.
 */
export function emitSql(corpus: SeedCorpus): string {
  const out: string[] = []
  const reference = corpus.bookings.find((b) => b.bookingNo === 'B-715')
  if (!reference) fail('emitSql called without the reference booking')

  out.push(`-- =============================================================================
-- Seed corpus — GENERATED FILE. Do not edit by hand.
--
--   source:    src/lib/seed.ts
--   regenerate: npm run seed:sql
--
-- PLAN.md Phase 1's last checklist line asks for seed data "generated through
-- the engines, never hand-typed". Every figure below came out of
-- src/lib/money.ts (calculation order, §2.1/§2.4), src/lib/workflow.ts (the
-- canonical six stages and the §1.6 item invariant), src/lib/discount.ts
-- (Law 10), src/lib/validation.ts (causal order and the day count) and
-- src/lib/bs.ts (Law 7 — BS derived, never stored). The generator refuses to
-- emit if any of them disagrees with Appendix/Sample Data.md, so this file
-- cannot drift away from the engines without the drift being fatal at
-- generation time.
--
-- 0012_seed_data.sql stays exactly as it is: it seeds the reference data this
-- file depends on (branches, warehouses, users, categories, bank accounts,
-- number sequences) and every reference below resolves through those rows'
-- natural keys, never through 0012's literal UUIDs.
--
-- NOT APPLIED. CLAUDE.md: "Never apply a migration to a live Supabase project
-- without explicit approval." This file has been generated and reviewed, not
-- executed — no local Postgres instance exists in this repo.
--
-- Re-applying is NOT a no-op — it is a one-shot seed that FAILS CLOSED, and the
-- earlier header claiming otherwise was never tested until 3 Sep 2026. What is
-- true, measured: every INSERT is idempotent (natural-key / client_uuid
-- arbiters all conflict on a second run — 40/125/120/89/64/93 rows before and
-- after, nothing duplicated), and the gate prologue and 0056's deposit rewrite
-- are both no-ops on a built database. What is not: the invoice issuance
-- UPDATE (Draft -> Sent) ahead of each payment is unguarded, so on a re-apply
-- it re-runs while the payment INSERT that would move the invoice on is
-- skipped, and this file's own self-check then refuses ('INV-1 is Sent after
-- a part payment, expected Partially Paid'). The single transaction rolls the
-- whole file back and re-enables the gate. Apply it ONCE, into a database that
-- has never held it; the fix is a where status = 'Draft' guard on that
-- update — filed, not done here (PLAN.md §4.42a residual).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- The handover/close gate is SUSPENDED for this load, and only for this load.
--
-- trg_booking_gate_check (0010:369) refuses a move into 'On Rent' or 'Closed'
-- while the booking has a pending deposit or an outstanding invoice. 38 of the
-- bookings below are exactly that: gear that went out against an invoice the
-- client had not yet settled. The trigger is right about a TRANSITION a user
-- performs; this file performs no transitions. It restates a STATE the business
-- was already in, in bulk, in one transaction — the same distinction that lets a
-- restore reinstate rows a workflow would have had to earn.
--
-- Ruled 2 Sep 2026 (PLAN.md §4.42a). Two things this deliberately does NOT do:
-- it does not weaken the gate, which stays fully armed for every write the
-- application makes; and it does not restate the corpus to dodge it, which would
-- have cost the fixture the On Rent / Returned spread every operational screen is
-- built against.
--
-- ⬅ TODO(decision) §4.42(a), still open and NOT answered by the above: may gear
-- go out against an unsettled rental invoice at all? clients.payment_terms
-- (Net 15/30) says the business already sells on terms, which the gate forbids.
-- If that is ruled a defect in the GATE, this suspension becomes unnecessary
-- rather than wrong.
--
-- The re-enable is unconditional and inside the same transaction: if anything
-- below raises, the whole file rolls back and the trigger was never disabled.
-- -----------------------------------------------------------------------------
alter table bookings disable trigger trg_booking_gate_check;

-- -----------------------------------------------------------------------------
-- Identifier CHECKs, pulled forward from 0055 when — and only when — needed.
--
-- 0005 (clients:89) and 0002 (bookings:58) constrain client_code / booking_no to the RETIRED shapes
-- (CL-YYYY-NNNN / BK-YYYY-NNNN). 0055 is what legalises the ruled C-<n> / B-<n>
-- this corpus has always carried, and 0055 sits eighteen files LATER. So on a
-- from-scratch build the very first client below would fail its own CHECK.
--
-- The fix is NOT to seed the retired shape and let 0055 rewrite it (tried, and
-- measured: that shape-locks this file to pre-0055, breaks --from 0047 on any
-- built database, and makes it disagree with seedCompact.ts — the transport
-- form that actually reached live). The fix is to swap the two CHECKs to their
-- ruled form HERE if the retired form is still in force, exactly as 0055 will.
--
-- Idempotent with 0055 by construction: 0055 does drop constraint if exists
-- then add constraint with the same names and the same regexes, and its
-- update … where … ~ '^CL-…' rewrite finds zero rows because nothing retired
-- was ever seeded. Final state is identical whether 0055 runs before this file
-- (production's actual order) or after it (filename order). Nothing between
-- 0047 and 0055 references either shape (checked). The regexes are copied from
-- 0055:101-105 and must stay verbatim.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'clients'::regclass
      and conname = 'clients_client_code_format'
      and pg_get_constraintdef(oid) like '%CL-%'
  ) then
    alter table clients drop constraint clients_client_code_format;
    alter table clients add constraint clients_client_code_format
      check (client_code ~ '^C-[0-9]+$');
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'bookings'::regclass
      and conname = 'bookings_booking_no_format'
      and pg_get_constraintdef(oid) like '%BK-%'
  ) then
    alter table bookings drop constraint bookings_booking_no_format;
    alter table bookings add constraint bookings_booking_no_format
      check (booking_no ~ '^B-[0-9]+$');
  end if;
end $$;
`)

  /* clients */
  out.push(section(`1 · Clients — ${corpus.clients.length}`))
  for (const c of corpus.clients) {
    const code = recordNo(SEQUENCES.client, c.seq)
    out.push(`insert into clients (
  client_uuid, client_code, type_parent, org_subtype, name, phone, email,
  address_line, city, district, country, payment_terms, client_since,
  segments, preferred_contact_channels, status, created_by
) values (
  ${uuid(seedUuid(`client:${code}`))},
  ${txt(code)},
  ${txt(c.typeParent)}::client_type_parent,
  ${c.orgSubtype === null ? 'null' : `${txt(c.orgSubtype)}::client_organisation_subtype`},
  ${txt(c.name)},
  ${txt(c.phone)},
  ${txt(c.email)},
  ${txt(c.addressLine)},
  ${txt(c.city)},
  ${txt(c.district)},
  'Nepal',
  ${txt(c.paymentTerms)}::payment_terms,
  date '${c.since}',
  ${textArray(c.segments)}::client_segment[],
  array['Email', 'WhatsApp']::preferred_contact_channel[],
  'Active'::client_status,
  ${BILLING}
)
on conflict (client_code) do nothing;
`)
  }

  /* products */
  out.push(section('2 · Products — the catalogue the booking lines price against'))
  for (const p of corpus.products) {
    const assetCode = recordNo(SEQUENCES.equipment, p.seq)
    out.push(`insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  ${uuid(seedUuid(`product:${assetCode}`))},
  ${txt(assetCode)},
  ${txt(p.name)},
  ${category(p.categoryCode)},
  ${txt(p.brand)},
  ${txt(p.model)},
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  ${p.units},
  ${p.dailyRateRupees.toFixed(2)},
  ${p.replacementValueRupees.toFixed(2)},
  1,
  true,
  true,
  ${OWNER}
)
on conflict (asset_code) do nothing;
`)
  }

  /* product_units */
  /*
   * One row per physical item in the CATALOGUE, not per booked item.
   *
   * These used to be emitted from the booking's own units, which meant a
   * product nobody had booked owned no units at all — and Inventory counts
   * units, so two thirds of the catalogue would have rendered as a name with
   * nothing behind it. The unit is a property of the product; being on a
   * booking is a property of the booking.
   *
   * A unit the reference booking packed is `Packed`; everything else is
   * `In Stock`. That set is read from the corpus rather than assumed, so a unit
   * cannot be marked Packed by this file while the booking that packed it moved
   * on.
   */
  const packedTags = new Set(corpus.bookings.flatMap((b) => b.units.map((u) => u.assetTag)))
  const totalUnits = corpus.products.reduce((n, p) => n + p.units, 0)
  out.push(section(`3 · Product units — ${totalUnits} physical items`))
  for (const p of corpus.products) {
    const assetCode = recordNo(SEQUENCES.equipment, p.seq)
    for (let n = 0; n < p.units; n += 1) {
      const assetTag = `${assetCode}-U${String(n + 1).padStart(2, '0')}`
      const serialNo = `SN-${p.serialTag}-${String(p.serialFrom + n).padStart(4, '0')}`
      out.push(`insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  ${uuid(seedUuid(`product_unit:${assetTag}`))},
  ${product(assetCode)},
  ${txt(serialNo)},
  ${txt(assetTag)},
  ${packedTags.has(assetTag) ? `'Packed'` : `'In Stock'`}::inventory_state,
  'Good'::unit_condition,
  ${BRANCH},
  ${WAREHOUSE},
  ${zone(p.zoneCode)},
  ${p.replacementValueRupees.toFixed(2)},
  ${WAREHOUSE_STAFF}
)
on conflict (asset_tag) do nothing;
`)
    }
  }

  /* bookings and their children */
  for (const b of corpus.bookings) {
    const s = b.spec
    out.push(section(`4 · ${b.bookingNo} — ${s.project}`))
    out.push(`-- ${b.itemCount} item(s) × ${b.days} day(s), ${b.crew.length} crew.
-- Pickup renders as ${b.bsPickup ?? 'a BS date bs.ts cannot vouch for'} (Law 7 — derived, never stored).
-- Engine figures: subtotal Rs ${money(b.breakdown.subtotal)} · discount ${s.discountPercent}% Rs ${money(b.breakdown.discount)}
--   · taxable Rs ${money(b.breakdown.taxable)} · VAT ${VAT_PERCENT}% Rs ${money(b.breakdown.vat)}
--   · rental total Rs ${money(b.breakdown.rentalTotal)} · payments Rs ${money(b.breakdown.payments)}
--   · outstanding Rs ${money(b.breakdown.outstanding)}
insert into bookings (
  client_uuid, booking_no, branch_id, client_id, project,
  pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
) values (
  ${uuid(seedUuid(`booking:${b.bookingNo}`))},
  ${txt(b.bookingNo)},
  ${BRANCH},
  ${client(b.clientCode)},
  ${txt(s.project)},
  ${ts(s.pickupAt)},
  ${ts(s.returnAt)},
  -- Sample Data.md: transport Rs 0 — the client collects. 'Customer Pickup' is
  -- the delivery_type enum member's own spelling (0001), not UI copy; Law 17
  -- governs what the screens say, and no screen renders this literal.
  'Customer Pickup'::delivery_type,
  ${money(rupees(s.depositRequiredRupees))},
  ${BILLING},
  ${BILLING}
)
on conflict (booking_no) do nothing;
`)

    for (const line of b.lines) {
      out.push(`insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  ${uuid(line.clientUuid)},
  ${booking(b.bookingNo)},
  'Equipment'::booking_line_type,
  ${product(line.assetCode)},
  ${txt(line.description)},
  ${line.qty},
  -- Law 9: days is written explicitly on every priced line, never by omission.
  ${line.days},
  ${line.rateRupees.toFixed(2)},
  ${line.sortOrder},
  ${BILLING}
)
on conflict (client_uuid) do nothing;
`)
    }

    // Packing finished when the booking reached Packed, not later — a
    // packed_at after its own stage transition is the "confirmed at 09:20
    // sitting below events at 05:30" defect in another table.
    const packedAt = b.transitions.find((t) => t.to === 'Packed')?.occurredAt ?? s.pickupAt
    for (const u of b.units) {
      const parent = b.lines.find((l) => l.assetCode === u.assetCode)
      if (!parent) fail(`${b.bookingNo}: unit ${u.assetTag} has no booking line`)
      out.push(`insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  ${uuid(u.clientUuid)},
  ${byClientUuid('booking_lines', parent.clientUuid)},
  ${unit(u.assetTag)},
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  ${ts(packedAt)},
  ${WAREHOUSE_STAFF},
  ${WAREHOUSE_STAFF}
)
on conflict (client_uuid) do nothing;
`)
    }

    for (const c of b.crew) {
      out.push(`insert into booking_crew_lines (
  client_uuid, booking_id, name, crew_role, day_rate, days, created_by
) values (
  ${uuid(c.clientUuid)},
  ${booking(b.bookingNo)},
  ${txt(c.name)},
  ${txt(c.role)}::crew_role,
  ${c.dayRateRupees.toFixed(2)},
  ${c.days},
  ${BILLING}
)
on conflict (client_uuid) do nothing;
`)
    }

    /* Law 10 — the discount row, and the audit event it is required to carry.
     *
     * `actor_role` below is 'Coordinator', not 'Billing'. 'Billing' is retired
     * vocabulary: 0013_business_8_roles.sql renamed that enum value in place
     * ("the coordinator takes the advance", PLAN.md §4.3), which also rewrote
     * 0012's seeded user. This generator kept emitting the old label and
     * aborted the entire corpus on its first real apply, 11 Aug 2026. It is
     * NOT 'Accounts' — PLAN.md §6.25 records that exact mis-mapping being
     * caught before it shipped. The `BILLING` constant is only an email lookup
     * (billing@babinrentals.com), which is still a real seeded row. */
    const discountAuditUuid = seedUuid(`audit_event:discount:${b.bookingNo}`)
    const approver = s.discountApproverEmail === null ? 'null' : user(s.discountApproverEmail)
    out.push(`-- Law 10. ${
      s.discountPercent > 10
        ? `${s.discountPercent}% is above the 10% threshold, so the reason (>=10 chars) and the named approver below are what make this row legal — for anyone, Owner included.`
        : `${s.discountPercent}% is at or below the 10% threshold: no reason and no approver, which is what discount.ts returned.`
    }
insert into audit_events (
  client_uuid, event_class, category, module, action, severity, status,
  table_name, record_id, actor_id, actor_role, branch_id, reason
) values (
  ${uuid(discountAuditUuid)},
  'discount'::audit_event_class,
  'Finance'::audit_category,
  'Rentals'::audit_module,
  'Approve'::audit_action,
  'Informational'::audit_severity,
  'Success'::audit_status,
  'booking_discounts',
  ${booking(b.bookingNo)},
  ${BILLING},
  'Coordinator'::system_role,
  ${BRANCH},
  ${s.discountReason === null ? txt(`${s.discountPercent}% applied — at or below the Law 10 approval threshold`) : txt(s.discountReason)}
)
on conflict (client_uuid) do nothing;

insert into booking_discounts (
  client_uuid, booking_id, branch_id, discount_source, percent, reason, approver_id,
  applied_by, applied_at, audit_event_id
) values (
  ${uuid(seedUuid(`booking_discount:${b.bookingNo}`))},
  ${booking(b.bookingNo)},
  ${BRANCH},
  'Manual'::discount_source,
  ${s.discountPercent.toFixed(2)},
  ${s.discountReason === null ? 'null' : txt(s.discountReason)},
  ${approver},
  ${BILLING},
  ${ts(b.transitions[0]?.occurredAt ?? s.pickupAt)},
  ${byClientUuid('audit_events', discountAuditUuid)}
)
on conflict (client_uuid) do nothing;
`)

    /* Invoice — inserted at **Draft**, issued further down. That order is the
     * whole point, not a stylistic choice.
     *
     * This generator used to emit the invoice already `'Sent'` and *then* its
     * `invoice_lines`, which made the file unappliable. Every `invoice_lines`
     * insert fires `recalculate_invoice_totals()` (0010), whose internal
     * `update invoices` is then rejected by `reject_invoice_edit_after_issue()`
     * (0006):
     *
     *   Law 4/finance: invoice INV-… is issued (status Sent) — its figures are
     *   immutable. Corrections take Void + Credit Note, never a direct edit.
     *
     * Both triggers are correct. 0006's own header states the contract the seed
     * was breaking: the recalc "only fires while status is still 'Draft' in the
     * intended flow; if lines are ever edited after issue, this trigger
     * correctly blocks the resulting invoices UPDATE, which is the point."
     *
     * So the seed now follows the intended flow — Draft → lines → the engine
     * restate → issue. The figures are still written on this insert; the
     * trigger overwrites them with its own arithmetic, which is why the restate
     * block below exists. */
    const dueDate = new Date(s.returnAt.getTime() + 7 * 24 * 60 * 60_000)
    out.push(`insert into invoices (
  client_uuid, invoice_no, booking_id, client_id, branch_id, status,
  issue_date, due_date, subtotal, discount_amount, discount_percent, discount_reason,
  discount_approved_by, taxable_amount, vat_rate, vat_amount, total_amount,
  paid_amount, outstanding_amount, created_by, updated_by
) values (
  ${uuid(seedUuid(`invoice:${b.invoiceNo}`))},
  ${txt(b.invoiceNo)},
  ${booking(b.bookingNo)},
  ${client(b.clientCode)},
  ${BRANCH},
  -- Draft, deliberately. The lines below cannot be added to an issued invoice;
  -- the issuing UPDATE comes after them and after the restate.
  'Draft'::invoice_status,
  ${`date '${s.pickupAt.toISOString().slice(0, 10)}'`},
  ${`date '${dueDate.toISOString().slice(0, 10)}'`},
  ${money(b.breakdown.subtotal)},
  ${money(b.breakdown.discount)},
  ${s.discountPercent.toFixed(2)},
  ${s.discountReason === null ? 'null' : txt(s.discountReason)},
  ${approver},
  ${money(b.breakdown.taxable)},
  ${(VAT_PERCENT / 100).toFixed(4)},
  ${money(b.breakdown.vat)},
  ${money(b.breakdown.rentalTotal)},
  0.00,
  ${money(b.breakdown.rentalTotal)},
  ${BILLING},
  ${BILLING}
)
on conflict (invoice_no) do nothing;
`)

    let invoiceSort = 0
    for (const line of b.lines) {
      out.push(`insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  ${uuid(seedUuid(`invoice_line:${b.invoiceNo}:${line.assetCode}`))},
  ${invoice(b.invoiceNo)},
  'Equipment Rental'::line_kind,
  ${txt(line.description)},
  ${line.qty},
  ${line.days},
  ${line.rateRupees.toFixed(2)},
  ${money(line.lineTotal)},
  ${(invoiceSort += 10)}
)
on conflict (client_uuid) do nothing;
`)
    }
    if (b.crew.length > 0) {
      const crewRate = b.crew[0]?.dayRateRupees ?? 0
      out.push(`insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  ${uuid(seedUuid(`invoice_line:${b.invoiceNo}:crew`))},
  ${invoice(b.invoiceNo)},
  'Crew Charges'::line_kind,
  ${txt(`Crew — ${b.crew.map((c) => c.role).join(', ')}`)},
  ${b.crew.length},
  ${b.days},
  ${crewRate.toFixed(2)},
  ${money(b.crewTotal)},
  ${(invoiceSort += 10)}
)
on conflict (client_uuid) do nothing;
`)
    }

    /* The restate. See the migration header and PLAN.md: 0010's
     * recalculate_invoice_totals() rounds to 2dp and hardcodes 0.13, so it
     * does not reproduce §2.4's half-up-to-whole-rupee-at-each-step. */
    out.push(`-- The invoice_lines trigger (recalculate_invoice_totals(), 0010) has just
-- overwritten the four calculated columns with its own arithmetic: it rounds
-- to 2 decimal places rather than §2.4's "Half Up, applied at each displayed
-- step" (whole rupees), and it hardcodes 0.13 instead of reading
-- invoices.vat_rate. On this invoice that is the difference between the
-- engine's Rs ${money(b.breakdown.rentalTotal)} and the trigger's own figure. The Financial Engine is
-- authoritative (Foundation §2.4, §2.8), so the engine's figures are restated
-- here. The NOTICE records the deviation at apply time rather than hiding it;
-- fixing the trigger belongs to Phase 1's "constraints and triggers" lines,
-- not to this seed.
do $$
declare
  v_trigger_total numeric(14,2);
begin
  select total_amount into v_trigger_total from invoices where invoice_no = ${txt(b.invoiceNo)};
  if v_trigger_total is distinct from ${money(b.breakdown.rentalTotal)} then
    raise notice 'Seed %: recalculate_invoice_totals() produced a total of %, the Financial Engine produces %. Engine figure restated.',
      ${txt(b.invoiceNo)}, v_trigger_total, ${money(b.breakdown.rentalTotal)};
  end if;
end $$;

update invoices set
  subtotal           = ${money(b.breakdown.subtotal)},
  discount_amount    = ${money(b.breakdown.discount)},
  taxable_amount     = ${money(b.breakdown.taxable)},
  vat_amount         = ${money(b.breakdown.vat)},
  total_amount       = ${money(b.breakdown.rentalTotal)},
  outstanding_amount = ${money(b.breakdown.rentalTotal)} - paid_amount,
  updated_by         = ${BILLING}
where invoice_no = ${txt(b.invoiceNo)};
`)

    /* …and only now is it issued. Everything above — the lines, the recalc
     * trigger they fire, the restate — is lawful precisely because the invoice
     * was still Draft while it happened. */
    out.push(`-- The figures are final, so the invoice is issued. Draft was never a fiction:
-- it is the only window in which recalculate_invoice_totals() and the restate
-- above may touch these columns at all. reject_invoice_edit_after_issue()
-- (0006) lets this statement through because OLD.status is still 'Draft' — and
-- 'status' is not one of the columns it protects once issued.${
      b.paymentNo === null
        ? ''
        : `\n-- ${b.invoiceNo} moves on to Partially Paid when the payment below lands;\n-- sync_payment_to_invoice() (0010) owns that status, not this seed.`
    }
update invoices set status = ${txt(INVOICE_ISSUED_STATUS)}::invoice_status
where invoice_no = ${txt(b.invoiceNo)};
`)

    /* Law 5 — the deposit, in its own liability account. */
    if (b.depositNo !== null) {
      out.push(`-- Law 5: deposits are liabilities. security_deposits is a separate account
-- from the invoice; nothing below touches total_amount or outstanding_amount,
-- and the assertion block at the foot of this file proves it.
insert into security_deposits (
  client_uuid, deposit_no, booking_id, client_id, branch_id, required_amount, created_by, updated_by
) values (
  ${uuid(seedUuid(`security_deposit:${b.depositNo}`))},
  ${txt(b.depositNo)},
  ${booking(b.bookingNo)},
  ${client(b.clientCode)},
  ${BRANCH},
  ${money(rupees(s.depositRequiredRupees))},
  ${BILLING},
  ${BILLING}
)
on conflict (deposit_no) do nothing;
`)
      if (s.depositReceivedRupees > 0) {
        const movementNo = `${b.depositNo}-M1`
        out.push(`insert into deposit_movements (
  client_uuid, movement_no, security_deposit_id, movement_type, amount, bank_account_id, handled_by
) values (
  ${uuid(seedUuid(`deposit_movement:${movementNo}`))},
  ${txt(movementNo)},
  ${deposit(b.depositNo)},
  'Received'::deposit_movement_type,
  ${money(rupees(s.depositReceivedRupees))},
  ${BANK},
  ${BILLING}
)
on conflict (movement_no) do nothing;
`)
      }
    }

    /* Law 4 — payments are ledger rows, immutable once written. */
    if (b.paymentNo !== null) {
      out.push(`insert into payments (
  client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
  amount, payment_type, status, payment_date, bank_account_id, received_by
) values (
  ${uuid(seedUuid(`payment:${b.paymentNo}`))},
  ${txt(b.paymentNo)},
  ${booking(b.bookingNo)},
  ${invoice(b.invoiceNo)},
  ${client(b.clientCode)},
  ${BRANCH},
  ${money(b.breakdown.payments)},
  -- Law 5 again: a deposit is never a payment_type here; the schema forbids it.
  'Advance Payment'::payment_type,
  'Received'::payment_status,
  ${ts(new Date(s.pickupAt.getTime() - 48 * 60 * 60_000))},
  ${BANK},
  ${BILLING}
)
on conflict (payment_no) do nothing;
`)
    }

    /* The stage machine. booking_stage_transitions is the sole writer of
     * bookings.stage (0021); the rows below walk the booking up one legal
     * step at a time, and the DB re-validates each one. */
    out.push(`-- Status Engine: ${b.transitions.map((t) => t.to).join(' → ')}. Forward-only,
-- no skipping, causal order — checked by workflow.ts at generation time and
-- again by apply_booking_stage_transition() (0021) when these rows land.`)
    for (const t of b.transitions) {
      out.push(`insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  ${uuid(t.clientUuid)},
  ${booking(b.bookingNo)},
  ${BRANCH},
  ${t.from === null ? 'null' : `${txt(t.from)}::booking_stage`},
  ${txt(t.to)}::booking_stage,
  ${ts(t.occurredAt)},
  ${t.to === 'Packed' ? WAREHOUSE_STAFF : BILLING},
  ${t.to === 'Packed' ? txt('Warehouse') : txt('Coordinator')},
  'seed'
)
on conflict (client_uuid) do nothing;
`)
    }
  }

  /* number_sequences */
  out.push(section('5 · Number sequences — advanced past everything the corpus consumed'))
  out.push(`-- Without this the next booking the app numbers would collide with a seeded
-- one. greatest() so a re-apply, or a sequence already ahead, is never rewound.`)
  for (const [key, value] of [...corpus.sequenceHighWater].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`update number_sequences
   set current_value = greatest(current_value, ${value}), updated_at = now()
 where sequence_key = ${txt(key)};`)
  }
  out.push('')

  /* assertions */
  out.push(section('6 · Reconciliation assertions'))
  out.push(`-- Foundation §2.8: "Any screen showing 1,39,208 / 1,24,208 / 91,550 / 1,08,548
-- / 58,548 is rendering superseded seed data and is a defect." These figures
-- are Sample Data.md's, not this generator's — the generator already refused
-- to emit unless money.ts reproduces them, so this block closes the loop by
-- checking the database agrees once every trigger has run.
do $$
declare
  v_subtotal    numeric(14,2);
  v_discount    numeric(14,2);
  v_taxable     numeric(14,2);
  v_vat         numeric(14,2);
  v_total       numeric(14,2);
  v_paid        numeric(14,2);
  v_outstanding numeric(14,2);
  v_status      invoice_status;
  v_lines       numeric(14,2);
  v_pending     numeric(14,2);
  v_stage       booking_stage;
  v_items       integer;
  v_units       integer;
begin
  select subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
         paid_amount, outstanding_amount, status
    into v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding, v_status
    from invoices where invoice_no = ${txt(reference.invoiceNo)};

  if (v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding)
     is distinct from
     (${money(reference.breakdown.subtotal)}, ${money(reference.breakdown.discount)}, ${money(reference.breakdown.taxable)}, ${money(reference.breakdown.vat)}, ${money(reference.breakdown.rentalTotal)}, ${money(reference.breakdown.payments)}, ${money(reference.breakdown.outstanding)}) then
    raise exception 'Foundation §2.8 violated on %: got subtotal %, discount %, taxable %, VAT %, total %, paid %, outstanding %.',
      ${txt(reference.invoiceNo)}, v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding;
  end if;

  if v_status is distinct from 'Partially Paid'::invoice_status then
    raise exception 'Payment sync failed: % is % after a part payment, expected Partially Paid.', ${txt(reference.invoiceNo)}, v_status;
  end if;

  select coalesce(sum(line_total), 0) into v_lines
    from invoice_lines where invoice_id = ${invoice(reference.invoiceNo)};
  if v_lines is distinct from v_subtotal then
    raise exception 'Invoice % does not reconcile: lines sum to % but subtotal is %.', ${txt(reference.invoiceNo)}, v_lines, v_subtotal;
  end if;

  -- Law 5. Rs ${money(rupees(reference.spec.depositReceivedRupees))} of deposit has been received against this booking;
  -- outstanding must be untouched by it.
  select pending_amount into v_pending
    from security_deposits where booking_id = ${booking(reference.bookingNo)};
  if v_pending is distinct from ${money(reference.depositPending)} then
    raise exception 'Law 5: deposit pending on % is %, expected %.', ${txt(reference.bookingNo)}, v_pending, ${money(reference.depositPending)};
  end if;
  if v_outstanding is distinct from ${money(reference.breakdown.outstanding)} then
    raise exception 'Law 5: the deposit moved Rental Outstanding on % to %.', ${txt(reference.bookingNo)}, v_outstanding;
  end if;

  -- The "21 items on an 18-item booking" defect, made detectable.
  select coalesce(sum(qty), 0) into v_items from booking_lines where booking_id = ${booking(reference.bookingNo)};
  select count(*) into v_units
    from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
   where bl.booking_id = ${booking(reference.bookingNo)};
  if v_items is distinct from ${reference.itemCount} or v_units is distinct from ${reference.itemCount} then
    raise exception 'Item invariant violated on %: % line items but % assigned units, expected % of each.',
      ${txt(reference.bookingNo)}, v_items, v_units, ${reference.itemCount};
  end if;
`)
  for (const b of corpus.bookings) {
    out.push(`  select stage into v_stage from bookings where booking_no = ${txt(b.bookingNo)};
  if v_stage is distinct from ${txt(b.spec.stage)}::booking_stage then
    raise exception 'Stage machine: % is at %, the corpus put it at %.', ${txt(b.bookingNo)}, v_stage, ${txt(b.spec.stage)};
  end if;
`)
  }
  out.push(`  raise notice 'Seed corpus verified: % booking(s), Foundation §2.8 reconciles.', ${corpus.bookings.length};
end $$;

-- Gate back on before commit — see the note at the top of this file.
alter table bookings enable trigger trg_booking_gate_check;

commit;
`)

  return out.join('\n')
}

/** `buildCorpus()` then `emitSql()`. What `npm run seed:sql` calls. */
export function seedSql(): string {
  return emitSql(buildCorpus())
}
