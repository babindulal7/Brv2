import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'
import { rupees, formatMoney, roundHalfUp } from '../lib/money'
import type { Paisa } from '../lib/money'

/**
 * **Finance ▸ Expenses** seed — `03 Core Modules/Expenses.md` v2.2 (Build
 * Locked), read against render `Expenses.PNG`.
 *
 * The spec's §0 correction table is almost entirely about figures that did not
 * reconcile, so nothing aggregate is typed here. **Every total, share, donut
 * slice, rank row and trend point is derived from `EXPENSES` below**, the same
 * move `Finance.tsx` makes for payment methods. A percentage cannot drift from
 * its own numerator when it is computed from it.
 *
 * What the render says and this file does not:
 *  · §2.1 — `Rs` on the value, never `NPR`, never a unit in a column header.
 *    Amounts are **integer paisa** through `lib/money.ts`; no pre-formatted
 *    money string is stored.
 *  · §2.2 — BS is rendered from `lib/bs.ts`, never stored. Rows carry an AD
 *    `Date` only.
 *  · §2.3 — the vendor's own number is `billNo`, free text, **never `INV-`**;
 *    `INV-` is our sales-invoice prefix and the render collides with it.
 *  · §3 — no camera or lens purchase appears as an expense. Capital purchases
 *    become assets (Inventory v3.0), so `Equipment` here is consumables only.
 *  · §4.2 — the render's `Taxes` tab is **Government & Licences**. VAT and TDS
 *    are liabilities, never expense categories.
 *  · §4.3 — `vat` is the reclaimable **input credit**, present only where the
 *    vendor has a PAN and issued a tax invoice; `null` everywhere else.
 *
 * NOT wired to Supabase.
 */

/* ── period ────────────────────────────────────────────────────────────── */

/** UTC midnight, matching every other seed in the app. */
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day))

/** The render's date range: 01 Jul – 31 Jul 2026 (Shrawan 2083). */
export const PERIOD = { from: d(2026, 7, 1), to: d(2026, 7, 31) }

/**
 * Kept for `ClientReports` and `ProductReports`, which import this list. The
 * Expenses ledger filters on a real date range instead of a chip row.
 */
export const PERIOD_CHIPS = [
  'Today',
  'Yesterday',
  'This Week',
  'Last Week',
  'Last 7 Days',
  'Last 30 Days',
  'Last 90 Days',
  'This Month',
  'Last Month',
  'This Quarter',
  'This Year',
  'Last Year',
  'Financial Year',
  'Custom',
]

/* ── vocabularies ──────────────────────────────────────────────────────── */

/**
 * §4.2 — the render's `Taxes` tab is gone. Municipality tax, government fees,
 * licence renewal, road tax and vehicle registration are genuine expenses and
 * live under **Government & Licences**; VAT and TDS are liabilities and are not
 * expenses at all.
 *
 * This is a **screen-local vocabulary for a different entity** — it neither
 * shadows nor redefines `lib/workflow.ts`, which owns booking, job and item
 * state and the flag registry.
 */
export const CATEGORIES = [
  'Office',
  'Equipment',
  'Maintenance',
  'Staff',
  'Transport',
  'Utilities',
  'Software & AI',
  'Marketing',
  'Finance',
  'Government & Licences',
  'Miscellaneous',
] as const
export type ExpenseCategory = (typeof CATEGORIES)[number]

/** §7.2 — six statuses. There is no Delete: a Draft is discarded, a posted expense reversed. */
export const EXPENSE_STATUSES = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Paid',
  'Rejected',
  'Cancelled',
] as const
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

/** Statuses map onto the locked five-colour tokens, never an ad-hoc hue. */
export const STATUS_TOKEN: Record<ExpenseStatus, StatusKey> = {
  Draft: 'neutral',
  'Pending Approval': 'progress',
  Approved: 'primary',
  Paid: 'in',
  Rejected: 'danger',
  Cancelled: 'neutral',
}

/** §7.2 — editability follows status, and the action list follows editability. */
export const STATUS_RULE: Record<ExpenseStatus, { editable: string; actions: string[] }> = {
  Draft: { editable: 'fully', actions: ['Edit', 'Submit', 'Discard'] },
  'Pending Approval': { editable: 'by the submitter', actions: ['Edit', 'Withdraw'] },
  Approved: { editable: 'no', actions: ['Pay', 'Reverse'] },
  Paid: { editable: 'no', actions: ['View', 'Reverse', 'Download Bill'] },
  Rejected: { editable: 'by the submitter', actions: ['Edit', 'Resubmit'] },
  Cancelled: { editable: 'no', actions: ['View'] },
}

/**
 * §6 — `Total = Paid + Pending` must hold. It holds because only these three
 * statuses are *recorded* in the period: a Draft is not yet an expense, and a
 * Rejected or Cancelled one never became one.
 */
export const RECORDED: ExpenseStatus[] = ['Pending Approval', 'Approved', 'Paid']

export const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cash',
  'eSewa',
  'Khalti',
  'Card',
  'ConnectIPS',
  'CellPay',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/**
 * §11.2 — Branch, Department and Project render **only when Settings defines
 * more than one**. Two branches are defined here, so the Branch filter appears;
 * with one it would not, and a single-location business is never asked which
 * branch bought the drinking water.
 */
export const BRANCHES = ['Boudha (Head Office)', 'Thamel Branch'] as const
export type Branch = (typeof BRANCHES)[number]

/** §11.2 — no second Department or Project is defined, so neither renders. */
export const DEPARTMENTS: string[] = []
export const PROJECTS: string[] = []

/* ── rows ──────────────────────────────────────────────────────────────── */

export interface ExpenseRow {
  /** Ours. §2.3. */
  id: string
  /** The **vendor's** own number — free text, never `INV-`. §2.3. */
  billNo: string | null
  /** AD only. BS is rendered from the Date Engine, never stored. §2.2. */
  date: Date
  category: ExpenseCategory
  subCategory: string
  vendor: string
  /** §4.3 — input credit needs a PAN and a tax invoice. */
  vendorPan: string | null
  description: string
  /** Gross total in paisa. Where `vat` is set, `amount − vat` is the taxable value. */
  amount: Paisa
  /** Reclaimable input VAT, or null where the vendor issued no tax invoice. */
  vat: Paisa | null
  method: PaymentMethod
  /** The instrument, with masked digits — as the render shows it. */
  methodDetail: string
  status: ExpenseStatus
  /** Null until settled. */
  paidBy: string | null
  submittedBy: string
  branch: Branch
  /** §8 — driven by a schedule, which creates a Draft and never a payment. */
  recurring: boolean
  /** §11.1 — operational cost is traceable both ways. */
  link?: { kind: 'Booking' | 'Maintenance' | 'Sub-Rental' | 'Case'; id: string }
  attachments: number
  note?: string
}

/**
 * 27 rows, all of Shrawan 2083. The twelve Paid sum to Rs 4,96,000 and the
 * twelve awaiting approval to Rs 86,500 — checked at module load below, because
 * the render states three different budget figures and this file exists to stop
 * that recurring.
 */
export const EXPENSES: ExpenseRow[] = [
  {
    id: 'EXP-2026-0723',
    billNo: '3456',
    date: d(2026, 7, 31),
    category: 'Office',
    subCategory: 'Office Rent',
    vendor: 'Sunrise Complex Pvt. Ltd.',
    vendorPan: '301234567',
    description: 'Monthly office rent (July 2026)',
    amount: rupees(85000),
    vat: null,
    method: 'Bank Transfer',
    methodDetail: 'Nabil Bank ****4521',
    status: 'Paid',
    paidBy: 'Ramesh Dulal',
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 1,
    note: 'The landlord issues a rent receipt, not a tax invoice — no input credit.',
  },
  {
    id: 'EXP-2026-0722',
    billNo: 'NEA/07/83',
    date: d(2026, 7, 30),
    category: 'Utilities',
    subCategory: 'Electricity',
    vendor: 'Nepal Electricity Authority',
    vendorPan: '600001234',
    description: 'Electricity bill (July 2026)',
    amount: rupees(12450),
    vat: null,
    method: 'eSewa',
    methodDetail: '980****1234',
    status: 'Paid',
    paidBy: 'Sunil Shrestha',
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0721',
    billNo: null,
    date: d(2026, 7, 30),
    category: 'Staff',
    subCategory: 'Salary',
    vendor: 'Babin Rentals Pvt. Ltd.',
    vendorPan: null,
    description: 'Staff salary (July 2026)',
    amount: rupees(215000),
    vat: null,
    method: 'Bank Transfer',
    methodDetail: 'Nabil Bank ****4521',
    status: 'Paid',
    paidBy: 'Ramesh Dulal',
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0720',
    billNo: '7788',
    date: d(2026, 7, 29),
    category: 'Maintenance',
    subCategory: 'Camera Service',
    vendor: 'Focus Solutions Nepal',
    vendorPan: '302456789',
    description: 'RED Komodo sensor cleaning',
    amount: rupees(18000),
    vat: 207080 as Paisa,
    method: 'Khalti',
    methodDetail: '980****5678',
    status: 'Paid',
    paidBy: 'Sunil Shrestha',
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: false,
    link: { kind: 'Maintenance', id: 'MNT-2026-0114' },
    attachments: 2,
  },
  {
    id: 'EXP-2026-0719',
    billNo: '6677',
    date: d(2026, 7, 28),
    category: 'Transport',
    subCategory: 'Fuel',
    vendor: 'Himalayan Petroleum',
    vendorPan: '303112233',
    description: 'Diesel for rental vehicle',
    amount: rupees(7850),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Paid',
    paidBy: 'Hari Tamang',
    submittedBy: 'Hari Tamang',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
    note: 'Petroleum carries no reclaimable input credit.',
  },
  {
    id: 'EXP-2026-0718',
    billNo: '8899',
    date: d(2026, 7, 28),
    category: 'Software & AI',
    subCategory: 'Adobe CC',
    vendor: 'Adobe Systems',
    vendorPan: null,
    description: 'Adobe Creative Cloud (Team)',
    amount: rupees(6778),
    vat: null,
    method: 'Card',
    methodDetail: 'Visa ****4242',
    status: 'Paid',
    paidBy: 'Ramesh Dulal',
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 1,
    note: 'Foreign vendor, no Nepali PAN — gross amount, no VAT split.',
  },
  {
    id: 'EXP-2026-0717',
    billNo: '5566',
    date: d(2026, 7, 27),
    category: 'Finance',
    subCategory: 'Loan EMI',
    vendor: 'Nabil Bank Ltd.',
    vendorPan: '300998877',
    description: 'Equipment loan EMI (July 2026)',
    amount: rupees(120000),
    vat: null,
    method: 'Bank Transfer',
    methodDetail: 'Nabil Bank ****4521',
    status: 'Paid',
    paidBy: 'Ramesh Dulal',
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0716',
    billNo: '4455',
    date: d(2026, 7, 26),
    category: 'Marketing',
    subCategory: 'Facebook Ads',
    vendor: 'Meta Platforms',
    vendorPan: null,
    description: 'Facebook ads campaign',
    amount: rupees(5600),
    vat: null,
    method: 'Khalti',
    methodDetail: '980****5678',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Bishal Gurung',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0715',
    billNo: '3344',
    date: d(2026, 7, 25),
    category: 'Office',
    subCategory: 'Internet',
    vendor: 'WorldLink Communications',
    vendorPan: '301778899',
    description: 'Internet bill (July 2026)',
    amount: rupees(2100),
    vat: 24159 as Paisa,
    method: 'eSewa',
    methodDetail: '980****1234',
    status: 'Paid',
    paidBy: 'Sunil Shrestha',
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0714',
    billNo: '2233',
    date: d(2026, 7, 24),
    category: 'Miscellaneous',
    subCategory: 'Pantry',
    vendor: 'Nepal Ice Pvt. Ltd.',
    vendorPan: '304556677',
    description: 'Drinking water supplies',
    amount: rupees(1250),
    vat: 14381 as Paisa,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Paid',
    paidBy: 'Hari Tamang',
    submittedBy: 'Hari Tamang',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0713',
    billNo: 'KMC/2083/0442',
    date: d(2026, 7, 23),
    category: 'Government & Licences',
    subCategory: 'Licence Renewal',
    vendor: 'Kathmandu Metropolitan City',
    vendorPan: null,
    description: 'Business licence renewal 2083/84',
    amount: rupees(18500),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Paid',
    paidBy: 'Ramesh Dulal',
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
    note: 'A government fee is a genuine expense; VAT and TDS are not (§4.1).',
  },
  {
    id: 'EXP-2026-0712',
    billNo: '9911',
    date: d(2026, 7, 22),
    category: 'Transport',
    subCategory: 'Freight',
    vendor: 'Nepal Can Move',
    vendorPan: '305223344',
    description: 'Courier of lens kit to Pokhara unit',
    amount: rupees(3072),
    vat: 35342 as Paisa,
    method: 'ConnectIPS',
    methodDetail: '****7781',
    status: 'Paid',
    paidBy: 'Hari Tamang',
    submittedBy: 'Hari Tamang',
    branch: 'Thamel Branch',
    recurring: false,
    link: { kind: 'Booking', id: 'BK-2026-0710' },
    attachments: 1,
  },
  {
    id: 'EXP-2026-0711',
    billNo: '4102',
    date: d(2026, 7, 21),
    category: 'Equipment',
    subCategory: 'Consumables',
    vendor: 'Photo Concern',
    vendorPan: '306334455',
    description: 'Gaffer tape, gels, memory card wallet',
    amount: rupees(6000),
    vat: 69027 as Paisa,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Paid',
    paidBy: 'Sunil Shrestha',
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
    note: 'Consumables stay expenses; a serialised body above the threshold would be an asset (§3.1).',
  },
  {
    id: 'EXP-2026-0710',
    billNo: '6712',
    date: d(2026, 7, 21),
    category: 'Transport',
    subCategory: 'Fuel',
    vendor: 'Himalayan Petroleum',
    vendorPan: '303112233',
    description: 'Diesel top-up, delivery van',
    amount: rupees(8200),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Sita',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0709',
    billNo: null,
    date: d(2026, 7, 20),
    category: 'Miscellaneous',
    subCategory: 'Crew Meals',
    vendor: 'Bajeko Sekuwa',
    vendorPan: '307445566',
    description: 'Crew meals, night shoot',
    amount: rupees(4500),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Sita',
    branch: 'Thamel Branch',
    recurring: false,
    link: { kind: 'Booking', id: 'BK-2026-0715' },
    attachments: 1,
    note: 'No tax invoice, so the gross amount is recorded with no VAT split.',
  },
  {
    id: 'EXP-2026-0708',
    billNo: '7791',
    date: d(2026, 7, 20),
    category: 'Maintenance',
    subCategory: 'Repair',
    vendor: 'Kathmandu Camera Repair',
    vendorPan: null,
    description: 'Tripod fluid head repair',
    amount: rupees(12000),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: false,
    link: { kind: 'Maintenance', id: 'MNT-2026-0117' },
    attachments: 1,
  },
  {
    id: 'EXP-2026-0707',
    billNo: '1180',
    date: d(2026, 7, 19),
    category: 'Office',
    subCategory: 'Stationery',
    vendor: 'Office Supplier Nepal',
    vendorPan: '308556677',
    description: 'Stationery and printer toner',
    amount: rupees(6400),
    vat: 73628 as Paisa,
    method: 'eSewa',
    methodDetail: '980****1234',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Bishal Gurung',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0706',
    billNo: '2251',
    date: d(2026, 7, 19),
    category: 'Transport',
    subCategory: 'Vehicle',
    vendor: 'Everest Auto Care',
    vendorPan: '309667788',
    description: 'Van servicing and oil change',
    amount: rupees(9800),
    vat: 112743 as Paisa,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Hari Tamang',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 2,
  },
  {
    id: 'EXP-2026-0705',
    billNo: '4417',
    date: d(2026, 7, 18),
    category: 'Equipment',
    subCategory: 'Consumables',
    vendor: 'Photo Concern',
    vendorPan: '306334455',
    description: 'AA batteries, bulk',
    amount: rupees(3500),
    vat: 40265 as Paisa,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0704',
    billNo: '0091',
    date: d(2026, 7, 18),
    category: 'Marketing',
    subCategory: 'Creator Collab',
    vendor: 'Creative Agency Nepal',
    vendorPan: '310778899',
    description: 'Instagram creator collaboration',
    amount: rupees(15000),
    vat: 172566 as Paisa,
    method: 'Bank Transfer',
    methodDetail: 'Nabil Bank ****4521',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Bishal Gurung',
    branch: 'Thamel Branch',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0703',
    billNo: null,
    date: d(2026, 7, 17),
    category: 'Utilities',
    subCategory: 'Water',
    vendor: 'Boudha Water Tanker',
    vendorPan: null,
    description: 'Water tanker, two trips',
    amount: rupees(5200),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Sita',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0702',
    billNo: 'FR-88214',
    date: d(2026, 7, 17),
    category: 'Software & AI',
    subCategory: 'Review Storage',
    vendor: 'Frame.io',
    vendorPan: null,
    description: 'Review storage top-up',
    amount: rupees(7300),
    vat: null,
    method: 'Card',
    methodDetail: 'Visa ****4242',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0701',
    billNo: 'TMO/83/1180',
    date: d(2026, 7, 16),
    category: 'Government & Licences',
    subCategory: 'Road Tax',
    vendor: 'Transport Management Office',
    vendorPan: null,
    description: 'Road tax token, Ba 2 Kha 4471',
    amount: rupees(2800),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Hari Tamang',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 1,
  },
  {
    id: 'EXP-2026-0700',
    billNo: null,
    date: d(2026, 7, 16),
    category: 'Staff',
    subCategory: 'Overtime',
    vendor: 'Babin Rentals Pvt. Ltd.',
    vendorPan: null,
    description: 'Overtime meal allowance, July',
    amount: rupees(6200),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Pending Approval',
    paidBy: null,
    submittedBy: 'Ramesh Dulal',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 0,
  },

  /* ── not recorded in the period ─────────────────────────────────────── */
  {
    id: 'EXP-2026-0724',
    billNo: null,
    date: d(2026, 7, 31),
    category: 'Transport',
    subCategory: 'Fuel',
    vendor: 'Himalayan Petroleum',
    vendorPan: '303112233',
    description: 'Diesel — vendor bill awaited',
    amount: rupees(9400),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Draft',
    paidBy: null,
    submittedBy: 'Sita',
    branch: 'Boudha (Head Office)',
    recurring: true,
    attachments: 0,
    note: 'A schedule creates a Draft on its due date and never a payment (§8). The amount is reviewed, then submitted.',
  },
  {
    id: 'EXP-2026-0699',
    billNo: null,
    date: d(2026, 7, 20),
    category: 'Transport',
    subCategory: 'Taxi',
    vendor: 'Sajha Taxi',
    vendorPan: null,
    description: 'Personal taxi fare',
    amount: rupees(4000),
    vat: null,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Rejected',
    paidBy: null,
    submittedBy: 'Bishal Gurung',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 0,
    note: 'Rejected — not a company cost. The submitter may edit and resubmit (§7.2).',
  },
  {
    id: 'EXP-2026-0698',
    billNo: '4417',
    date: d(2026, 7, 18),
    category: 'Equipment',
    subCategory: 'Consumables',
    vendor: 'Photo Concern',
    vendorPan: '306334455',
    description: 'AA batteries, bulk',
    amount: rupees(3500),
    vat: 40265 as Paisa,
    method: 'Cash',
    methodDetail: 'Counter',
    status: 'Cancelled',
    paidBy: null,
    submittedBy: 'Sunil Shrestha',
    branch: 'Boudha (Head Office)',
    recurring: false,
    attachments: 0,
    note: 'Cancelled after the duplicate check flagged the same vendor and bill number (§7.3).',
  },
]

/* ── budget (§5) ───────────────────────────────────────────────────────── */

/**
 * §5.1 — budgets are set in Settings ▸ Finance, per category, per fiscal
 * period. Only the period total is defined here; used, remaining and the
 * percentage are **all derived from one query** (`budget()` below), which is
 * what §5.2 asks for — the render answers the same question three ways.
 */
export const MONTHLY_BUDGET = rupees(1297500)

/** ⭐ §13 — the capital and approval thresholds are unset; see the page's TODO. */
export const CAPITAL_THRESHOLD: Paisa | null = null
export const APPROVAL_THRESHOLD: Paisa | null = null

/* ── recurring schedules (§8) ──────────────────────────────────────────── */

export interface RecurringSchedule {
  name: string
  vendor: string
  category: ExpenseCategory
  cadence: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'
  /** AD; the panel renders both calendars from the Date Engine. */
  dueAd: Date
  /** **Expected**, not actual — the electricity bill is not the same every month. */
  expected: Paisa
}

export const RECURRING: RecurringSchedule[] = [
  { name: 'Office Rent (Aug 2026)', vendor: 'Sunrise Complex Pvt. Ltd.', category: 'Office', cadence: 'Monthly', dueAd: d(2026, 8, 1), expected: rupees(85000) },
  { name: 'Staff Salary (Aug 2026)', vendor: 'Babin Rentals Pvt. Ltd.', category: 'Staff', cadence: 'Monthly', dueAd: d(2026, 8, 1), expected: rupees(215000) },
  { name: 'Electricity Bill (Aug 2026)', vendor: 'Nepal Electricity Authority', category: 'Utilities', cadence: 'Monthly', dueAd: d(2026, 8, 5), expected: rupees(12000) },
  { name: 'Adobe CC (Team)', vendor: 'Adobe Systems', category: 'Software & AI', cadence: 'Monthly', dueAd: d(2026, 8, 7), expected: rupees(6778) },
  { name: 'Equipment Loan EMI (Aug 2026)', vendor: 'Nabil Bank Ltd.', category: 'Finance', cadence: 'Monthly', dueAd: d(2026, 8, 10), expected: rupees(120000) },
  { name: 'Internet Bill (Aug 2026)', vendor: 'WorldLink Communications', category: 'Office', cadence: 'Monthly', dueAd: d(2026, 8, 12), expected: rupees(2100) },
]

/* ── twelve-month history, for Budget vs Actual ────────────────────────── */

/**
 * The only figures on this page that are not derived from `EXPENSES`, because
 * they predate the seeded month. The last entry **is** the seeded month and is
 * asserted equal to the derived total below, so the chart and the ledger cannot
 * disagree.
 */
export const MONTHLY_HISTORY: Array<{ label: string; budget: Paisa; actual: Paisa }> = [
  { label: 'Aug', budget: MONTHLY_BUDGET, actual: rupees(1142000) },
  { label: 'Sep', budget: MONTHLY_BUDGET, actual: rupees(1086500) },
  { label: 'Oct', budget: MONTHLY_BUDGET, actual: rupees(1340000) },
  { label: 'Nov', budget: MONTHLY_BUDGET, actual: rupees(1210000) },
  { label: 'Dec', budget: MONTHLY_BUDGET, actual: rupees(985000) },
  { label: 'Jan', budget: MONTHLY_BUDGET, actual: rupees(1040000) },
  { label: 'Feb', budget: MONTHLY_BUDGET, actual: rupees(1125000) },
  { label: 'Mar', budget: MONTHLY_BUDGET, actual: rupees(1288000) },
  { label: 'Apr', budget: MONTHLY_BUDGET, actual: rupees(1362000) },
  { label: 'May', budget: MONTHLY_BUDGET, actual: rupees(1105000) },
  { label: 'Jun', budget: MONTHLY_BUDGET, actual: rupees(1240000) },
  { label: 'Jul', budget: MONTHLY_BUDGET, actual: rupees(582500) },
]

/* ── derivations ───────────────────────────────────────────────────────── */

const DAY = 86400000

export function isRecorded(r: ExpenseRow): boolean {
  return RECORDED.includes(r.status)
}

export interface Totals {
  total: number
  paid: number
  pending: number
  /** Awaiting a decision — a count, per §6. */
  pendingCount: number
  /** Reclaimable input credit across the period (§4.3). */
  inputVat: number
  recurring: number
  recurringCount: number
  count: number
}

/** §6 — one pass, so `Total = Paid + Pending` cannot fall out of step. */
export function totalsOf(rows: ExpenseRow[]): Totals {
  const recorded = rows.filter(isRecorded)
  const paid = recorded.filter((r) => r.status === 'Paid')
  const awaiting = recorded.filter((r) => r.status === 'Pending Approval')
  const recurring = recorded.filter((r) => r.recurring)
  const sum = (xs: ExpenseRow[]) => xs.reduce((a, r) => a + r.amount, 0)
  const total = sum(recorded)
  return {
    total,
    paid: sum(paid),
    pending: total - sum(paid),
    pendingCount: awaiting.length,
    inputVat: recorded.reduce((a, r) => a + (r.vat ?? 0), 0),
    recurring: sum(recurring),
    recurringCount: recurring.length,
    count: recorded.length,
  }
}

/** §5.1 — used, remaining and the percentage from one query. None stored. */
export function budgetOf(rows: ExpenseRow[]) {
  const used = totalsOf(rows).total
  const remaining = MONTHLY_BUDGET - used
  return {
    budget: MONTHLY_BUDGET as number,
    used,
    remaining,
    percent: MONTHLY_BUDGET === 0 ? null : (used / MONTHLY_BUDGET) * 100,
    over: used > MONTHLY_BUDGET,
    overspend: Math.max(0, used - MONTHLY_BUDGET),
  }
}

/**
 * Groups to donut slices. `CAT` has eight slots and never cycles, so a ninth
 * group folds into **Others** at the data layer rather than repeating a hue.
 */
export function toSlices(groups: Array<{ label: string; value: number }>, slots = 8): Slice[] {
  const total = groups.reduce((a, g) => a + g.value, 0) || 1
  const ranked = [...groups].filter((g) => g.value > 0).sort((a, b) => b.value - a.value)
  const head = ranked.slice(0, slots - 1)
  const tail = ranked.slice(slots - 1)
  const rest = tail.reduce((a, g) => a + g.value, 0)
  const shown = rest > 0 ? [...head, { label: 'Others', value: rest }] : ranked.slice(0, slots)
  return shown.map((g) => ({
    label: g.label,
    value: g.value,
    display: formatMoney(g.value as Paisa),
    percent: `${((g.value / total) * 100).toFixed(1)}%`,
  }))
}

function groupBy(rows: ExpenseRow[], key: (r: ExpenseRow) => string): Array<{ label: string; value: number }> {
  const map = new Map<string, number>()
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + r.amount)
  return [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

export const byCategory = (rows: ExpenseRow[]) => groupBy(rows.filter(isRecorded), (r) => r.category)
export const byMethod = (rows: ExpenseRow[]) => groupBy(rows.filter(isRecorded), (r) => r.method)
export const byBranch = (rows: ExpenseRow[]) => groupBy(rows.filter(isRecorded), (r) => r.branch)
export const byVendor = (rows: ExpenseRow[]) => groupBy(rows.filter(isRecorded), (r) => r.vendor)

/** Approval mix — every row, including the ones that never became an expense. */
export const byStatus = (rows: ExpenseRow[]) => {
  const order = new Map<string, number>(EXPENSE_STATUSES.map((s, i) => [s, i] as [string, number]))
  return groupBy(rows, (r) => r.status).sort(
    (a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99),
  )
}

/** Days since the expense date, bucketed as the render's ageing donut does. */
export function ageing(rows: ExpenseRow[], today: Date): Array<{ label: string; value: number }> {
  const buckets = [
    { label: 'Current (0–7 days)', max: 7 },
    { label: '8–30 days', max: 30 },
    { label: '31–60 days', max: 60 },
    { label: '61–90 days', max: 90 },
    { label: '90+ days', max: Infinity },
  ]
  const out = buckets.map((b) => ({ label: b.label, value: 0 }))
  for (const r of rows.filter(isRecorded)) {
    const age = Math.floor((today.getTime() - r.date.getTime()) / DAY)
    const i = buckets.findIndex((b) => age <= b.max)
    const slot = out[i < 0 ? out.length - 1 : i]
    if (slot) slot.value += r.amount
  }
  return out.filter((b) => b.value > 0)
}

/** Cumulative spend across the period — the last point is the period total. */
export function cumulativeTrend(rows: ExpenseRow[], from: Date, to: Date) {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY) + 1)
  const perDay = new Array<number>(days).fill(0)
  for (const r of rows.filter(isRecorded)) {
    const i = Math.round((r.date.getTime() - from.getTime()) / DAY)
    if (i >= 0 && i < days) perDay[i] = (perDay[i] ?? 0) + r.amount
  }
  let run = 0
  const points = perDay.map((v) => (run += v))
  /* Seven evenly spaced ticks, deduplicated — a short range must not label the
     same day twice, and `LineChart` keys its labels by text. */
  const ticks = [...new Set([0, 1, 2, 3, 4, 5, 6].map((k) => Math.round((k / 6) * (days - 1))))]
  const labels = ticks.map((i) => {
    const day = new Date(from.getTime() + i * DAY)
    return `${day.getUTCDate()} ${day.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`
  })
  return { points, labels }
}

/**
 * §7.3 — same vendor + same Bill No., or same vendor + same amount + same date.
 * Paying a bill twice is the most common error on a page like this, so the
 * match is surfaced on the row and names the expense it collides with.
 */
export function duplicateOf(row: ExpenseRow, rows: ExpenseRow[]): ExpenseRow | null {
  return (
    rows.find(
      (o) =>
        o.id !== row.id &&
        o.vendor === row.vendor &&
        ((row.billNo !== null && o.billNo === row.billNo) ||
          (o.amount === row.amount && o.date.getTime() === row.date.getTime())),
    ) ?? null
  )
}

/** Axis ticks in lakh, five of them, from the largest value on the chart. */
export function lakhTicks(max: number): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => lakh(max * f))
}

/** `5.8L`, `82K`, `0` — chart axes only; every figure in prose uses `formatMoney`. */
export function lakh(paisa: number): string {
  const rs = paisa / 100
  if (rs >= 100000) return `${(rs / 100000).toFixed(1)}L`
  if (rs >= 1000) return `${Math.round(rs / 1000)}K`
  return String(roundHalfUp(rs))
}

/* ── assertions ────────────────────────────────────────────────────────── */

/**
 * `Finance.tsx` throws when payment methods stop reconciling; the same idea,
 * reported rather than thrown so a seed mistake cannot blank the app. The page
 * renders these strings instead of hiding them.
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []
  const t = totalsOf(EXPENSES)

  if (t.total !== t.paid + t.pending) {
    errs.push(`§6: Total must equal Paid + Pending (${t.total} vs ${t.paid + t.pending} paisa).`)
  }

  const last = MONTHLY_HISTORY[MONTHLY_HISTORY.length - 1]
  if (last && last.actual !== t.total) {
    errs.push(
      `Budget vs Actual disagrees with the ledger for the seeded month (${formatMoney(last.actual)} vs ${formatMoney(t.total as Paisa)}).`,
    )
  }

  for (const r of EXPENSES) {
    if (r.vat === null) continue
    /*
     * `amount` is the VAT-**inclusive** total the vendor billed, so the tax
     * component is `amount − amount/1.13`, rounded once.
     *
     * This used to assert `vat === roundHalfUp((amount − vat) * 0.13)`, which
     * looks equivalent and is not: it asks `vat` to be a fixed point of a
     * function that rounds twice, and for some totals no integer paisa value
     * satisfies it at all. Rs 1,250 is one — the check oscillates between
     * 14380 and 14381 forever. Deriving the expected value in one direction
     * removes the ambiguity, and no seeded row has to carry a figure that
     * cannot be right.
     */
    const expected = r.amount - roundHalfUp(r.amount / 1.13)
    if (expected !== r.vat) {
      errs.push(`${r.id}: VAT must be 13% of the VAT-inclusive total (expected ${expected}, seed has ${r.vat} paisa).`)
    }
    if (r.vendorPan === null) {
      errs.push(`${r.id}: input credit needs a vendor PAN and a tax invoice (§4.3).`)
    }
  }

  const ids = new Set(EXPENSES.map((r) => r.id))
  if (ids.size !== EXPENSES.length) errs.push('Expense IDs are not unique.')

  const bad = EXPENSES.find((r) => r.billNo !== null && r.billNo.startsWith('INV-'))
  if (bad) errs.push(`${bad.id}: a vendor bill must not carry our sales-invoice prefix (§2.3).`)

  return errs
})()

/* ── rail copy ─────────────────────────────────────────────────────────── */

export const QUICK_ACTIONS = [
  { icon: 'plus', label: 'New Expense' },
  { icon: 'upload', label: 'Import' },
] as const

/** §9 — More holds what the fourth and fifth tiles used to be. */
export const QUICK_ACTIONS_MORE = ['Recurring Expenses', 'Export Report'] as const
