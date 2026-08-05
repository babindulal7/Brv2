import type { Kpi } from '../components/ui/Page'
import type { IconName } from '../components/ui/Icon'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'

/**
 * Documents seed data.
 *
 * Built against the approved render `03 Core Modules/Documents.PNG` and the
 * `Documents.md` v2.1 (Build Locked) spec. Where the two disagree the render
 * wins on **layout** — card set, ordering, density — and the spec wins on
 * **meaning**, because the render predates the lock and conflates things the
 * spec separated. Every such call is commented at the point it is made.
 *
 * §1: **a document exists once.** Tabs and categories are two controls over one
 * store, never two stores — which is why they share a single selection here.
 */

/* ── categories ────────────────────────────────────────────────────────── */

export type CategoryKey =
  | 'Rental'
  | 'Finance'
  | 'Operations'
  | 'Maintenance'
  | 'Cases'
  | 'Inventory'
  | 'Templates'
  | 'Archived'

export interface CategoryMeta {
  key: CategoryKey
  /** Tab label — the render's tab row. */
  tab: string
  /** Left-rail label — the render spells these out. */
  rail: string
  icon: IconName
  /** Installation total. The table below carries a representative sample. */
  count: number
  /** §14 — Warehouse never sees invoices, receipts, credit or debit notes. */
  finance?: boolean
}

/** The render's ninth entry is `Recycle Bin`; see `ARCHIVED_NOT_RECYCLE_BIN`. */
export const CATEGORIES: CategoryMeta[] = [
  { key: 'Rental', tab: 'Rental', rail: 'Rental Documents', icon: 'file', count: 542 },
  { key: 'Finance', tab: 'Finance', rail: 'Finance Documents', icon: 'receipt', count: 312, finance: true },
  { key: 'Operations', tab: 'Operations', rail: 'Operations Documents', icon: 'queues', count: 126 },
  { key: 'Maintenance', tab: 'Maintenance', rail: 'Maintenance Documents', icon: 'tool', count: 88 },
  { key: 'Cases', tab: 'Cases', rail: 'Case Documents', icon: 'alert_triangle', count: 54 },
  { key: 'Inventory', tab: 'Inventory', rail: 'Inventory Documents', icon: 'box', count: 72 },
  { key: 'Templates', tab: 'Templates', rail: 'Templates', icon: 'checklist', count: 36 },
  { key: 'Archived', tab: 'Archived', rail: 'Archived', icon: 'folder', count: 18 },
]

/**
 * §6 — **there is no Recycle Bin.** The render's ninth tab is one, holding 18
 * documents, and counts them inside its 1,248 total. A signed agreement and an
 * issued invoice are legal records; CLAUDE.md's "nothing is deleted, every
 * entity has a named terminal action" says the same thing. The slot, the count
 * and the position in the row are the render's; the verb is Archive.
 */
export const ARCHIVED_NOT_RECYCLE_BIN =
  'Archived documents are hidden from the other tabs and kept for ever — there is no delete.'

export const ALL_TAB = 'All Documents'

/* ── status ────────────────────────────────────────────────────────────── */

/** §5.1 — the document lifecycle, exclusive. */
export type DocStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Pending Signature'
  | 'Signed'
  | 'Issued'
  | 'Void'
  | 'Expired'

export const DOC_STATUSES: readonly DocStatus[] = [
  'Draft',
  'Pending Approval',
  'Pending Signature',
  'Signed',
  'Issued',
  'Void',
  'Expired',
]

export const DOC_STATUS: Record<DocStatus, StatusKey> = {
  Draft: 'neutral',
  'Pending Approval': 'progress',
  'Pending Signature': 'progress',
  Signed: 'in',
  Issued: 'primary',
  Void: 'neutral',
  Expired: 'danger',
}

/* ── rows ──────────────────────────────────────────────────────────────── */

/** §11 — `Related To` points at the **source record**, never at another document. */
export type RelatedKind = 'booking' | 'payment' | 'case' | 'job' | 'equipment' | 'template'

/**
 * What each kind would open, and whether that screen exists yet. Only Booking
 * does, so only Booking is a link — the rest state the reason instead of
 * pretending.
 */
export const RELATED_TARGET: Record<RelatedKind, { label: string; route: string | null }> = {
  booking: { label: 'Booking', route: '/rentals' },
  payment: { label: 'Payment', route: null },
  case: { label: 'Case', route: null },
  job: { label: 'Maintenance job', route: null },
  equipment: { label: 'Equipment record', route: null },
  template: { label: 'Template', route: null },
}

export interface DocRow {
  /**
   * §4 — one prefix per document type, no compounds. The render's
   * `DOC-RNT-2026-0715`, `RPT-`, `MNT-` and the duplicate `INV-VAT-` row are
   * all gone: `RA-`, `RTN-`, `JOB-`/`SVC-`, and one invoice.
   *
   * Templates carry `templateId · version` (§7) rather than a document number,
   * because a template is not an issued document.
   */
  id: string
  name: string
  type: string
  category: Exclude<CategoryKey, 'Archived'>
  /** §6 — archived rows are hidden from every other tab, never deleted. */
  archived?: boolean
  relatedTo: string
  relatedKind: RelatedKind
  /** The render's column reads "Client / Vendor" — never "customer". */
  party: string
  branch: string
  status: DocStatus
  /**
   * §5.2 — the state of the **record**, which is not the state of the document.
   * `Paid` belongs to the invoice, `Completed` to the maintenance job, `Sent`
   * to delivery. The render puts them in the status pill; they live on their
   * own line here so a document and its record cannot drift unnoticed.
   *
   * TODO(decision): this is free text today, so nothing stops it drifting from
   * the vocabularies that own each record. `Booking:` values come from
   * `lib/workflow.ts` `BookingStatus` and `Case:` from `data/cases.ts`
   * `CaseStatus`, both verified. But `Invoice: Unpaid` and `Invoice: Adjusted`
   * are not members of `types/database.ts` `InvoiceStatus`
   * (Draft · Sent · Partially Paid · Paid · Overdue · Void), `Payment: Cleared`
   * is not a `PaymentStatus` (Received · Refunded · Failed · Cancelled), and
   * `Job: Scheduled` has no maintenance-job vocabulary at all because that
   * screen is unbuilt. What an invoice's state becomes once a credit note is
   * issued against it is a product ruling, not a rename — it is not guessed
   * here. Once settled, this field should be a discriminated union over the
   * real per-record status types rather than a string.
   */
  recordState: string
  recordTone: StatusKey
  createdAd: Date
  createdTime: string
  /** §14 — structurally absent for Warehouse, not masked. */
  finance?: boolean
  /** Days a signature has been outstanding, for the rail panel. */
  ageing?: string
  ageingSevere?: boolean
}

/**
 * Newest first — the default sort. All dates sit inside Shrawan 2083, the month
 * `lib/bs.ts` can vouch for, so every row renders a real BS line above its AD.
 */
export const DOCUMENTS: DocRow[] = [
  { id: 'DMG-2026-0041', name: 'Damage Report', type: 'Damage Report', category: 'Cases', relatedTo: 'CASE-2026-0041', relatedKind: 'case', party: 'Himalayan Films', branch: 'Boudha', status: 'Draft', recordState: 'Case: Open', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 31)), createdTime: '10:15 AM' },
  { id: 'RTN-2026-0715', name: 'Return Report', type: 'Return Report', category: 'Operations', relatedTo: 'BK-2026-0715', relatedKind: 'booking', party: 'Himalayan Films', branch: 'Boudha', status: 'Pending Signature', recordState: 'Booking: On Rent', recordTone: 'out', createdAd: new Date(Date.UTC(2026, 6, 31)), createdTime: '10:10 AM', ageing: 'Today' },
  { id: 'RA-2026-0716', name: 'Rental Agreement', type: 'Rental Agreement', category: 'Rental', relatedTo: 'BK-2026-0716', relatedKind: 'booking', party: 'Creative Studio', branch: 'Boudha', status: 'Pending Signature', recordState: 'Booking: Booked', recordTone: 'primary', createdAd: new Date(Date.UTC(2026, 6, 29)), createdTime: '09:05 AM', ageing: '2d' },
  { id: 'CN-2026-0012', name: 'Credit Note', type: 'Credit Note', category: 'Finance', relatedTo: 'BK-2026-0710', relatedKind: 'booking', party: 'Vision Production', branch: 'Thamel', status: 'Issued', recordState: 'Invoice: Adjusted', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 28)), createdTime: '12:15 PM', finance: true },
  { id: 'INV-2026-0161', name: 'Tax Invoice', type: 'Tax Invoice', category: 'Finance', relatedTo: 'BK-2026-0716', relatedKind: 'booking', party: 'Creative Studio', branch: 'Boudha', status: 'Issued', recordState: 'Invoice: Unpaid', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 28)), createdTime: '10:40 AM', finance: true },
  { id: 'INV-2026-0156', name: 'Tax Invoice', type: 'Tax Invoice', category: 'Finance', relatedTo: 'BK-2026-0715', relatedKind: 'booking', party: 'Himalayan Films', branch: 'Boudha', status: 'Issued', recordState: 'Invoice: Paid', recordTone: 'in', createdAd: new Date(Date.UTC(2026, 6, 27)), createdTime: '11:40 AM', finance: true },
  { id: 'RA-2026-0715', name: 'Rental Agreement', type: 'Rental Agreement', category: 'Rental', relatedTo: 'BK-2026-0715', relatedKind: 'booking', party: 'Himalayan Films', branch: 'Boudha', status: 'Signed', recordState: 'Booking: On Rent', recordTone: 'out', createdAd: new Date(Date.UTC(2026, 6, 27)), createdTime: '11:35 AM' },
  { id: 'DLV-2026-0715', name: 'Delivery Note', type: 'Delivery Note', category: 'Operations', relatedTo: 'BK-2026-0715', relatedKind: 'booking', party: 'Himalayan Films', branch: 'Boudha', status: 'Issued', recordState: 'Sent · 26 Jul, 06:40 PM', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 26)), createdTime: '06:25 PM' },
  { id: 'PKL-2026-0715', name: 'Packing List', type: 'Packing List', category: 'Operations', relatedTo: 'BK-2026-0715', relatedKind: 'booking', party: 'Himalayan Films', branch: 'Boudha', status: 'Issued', recordState: 'Sent · 26 Jul, 06:30 PM', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 26)), createdTime: '06:20 PM' },
  { id: 'RCT-2026-0321', name: 'Receipt', type: 'Receipt', category: 'Finance', relatedTo: 'PAY-2026-0745', relatedKind: 'payment', party: 'Himalayan Films', branch: 'Boudha', status: 'Issued', recordState: 'Payment: Cleared', recordTone: 'in', createdAd: new Date(Date.UTC(2026, 6, 26)), createdTime: '11:30 AM', finance: true },
  { id: 'DLV-2026-0716', name: 'Delivery Note', type: 'Delivery Note', category: 'Operations', relatedTo: 'BK-2026-0716', relatedKind: 'booking', party: 'Creative Studio', branch: 'Boudha', status: 'Pending Signature', recordState: 'Booking: Booked', recordTone: 'primary', createdAd: new Date(Date.UTC(2026, 6, 25)), createdTime: '05:20 PM', ageing: '6d', ageingSevere: true },
  { id: 'PKL-2026-0716', name: 'Packing List', type: 'Packing List', category: 'Operations', relatedTo: 'BK-2026-0716', relatedKind: 'booking', party: 'Creative Studio', branch: 'Boudha', status: 'Draft', recordState: 'Booking: Booked', recordTone: 'primary', createdAd: new Date(Date.UTC(2026, 6, 25)), createdTime: '05:15 PM' },
  { id: 'INS-2026-0710', name: 'Inspection Report', type: 'Inspection Report', category: 'Operations', relatedTo: 'BK-2026-0710', relatedKind: 'booking', party: 'Vision Production', branch: 'Thamel', status: 'Signed', recordState: 'Booking: Closed', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 25)), createdTime: '03:40 PM' },
  { id: 'SVC-2026-0012', name: 'Service Report', type: 'Service Report', category: 'Maintenance', relatedTo: 'MT-2026-0012', relatedKind: 'job', party: 'Tech Solutions Nepal', branch: 'Boudha', status: 'Pending Approval', recordState: 'Job: In Progress', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 24)), createdTime: '04:15 PM' },
  { id: 'JOB-2026-0012', name: 'Job Card', type: 'Job Card', category: 'Maintenance', relatedTo: 'MT-2026-0012', relatedKind: 'job', party: 'In-House', branch: 'Boudha', status: 'Issued', recordState: 'Job: In Progress', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 24)), createdTime: '09:30 AM' },
  { id: 'RA-2026-0710', name: 'Rental Agreement', type: 'Rental Agreement', category: 'Rental', relatedTo: 'BK-2026-0710', relatedKind: 'booking', party: 'Vision Production', branch: 'Thamel', status: 'Signed', recordState: 'Booking: Closed', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 24)), createdTime: '08:55 AM' },
  { id: 'ICL-2026-0004', name: 'Insurance Claim', type: 'Insurance Claim', category: 'Cases', relatedTo: 'CASE-2026-0041', relatedKind: 'case', party: 'Sagarmatha Insurance', branch: 'Boudha', status: 'Pending Approval', recordState: 'Case: Open', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 22)), createdTime: '02:40 PM' },
  { id: 'INC-2026-0034', name: 'Incident Report', type: 'Incident Report', category: 'Cases', relatedTo: 'CASE-2026-0041', relatedKind: 'case', party: 'Himalayan Films', branch: 'Boudha', status: 'Issued', recordState: 'Case: Open', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 22)), createdTime: '02:05 PM' },
  { id: 'RA-2026-0711', name: 'Rental Agreement', type: 'Rental Agreement', category: 'Rental', relatedTo: 'BK-2026-0711', relatedKind: 'booking', party: 'Inside Out Films', branch: 'Patan', status: 'Draft', recordState: 'Booking: Quote', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 21)), createdTime: '05:20 PM' },
  { id: 'QT-2026-0088', name: 'Quotation', type: 'Quotation', category: 'Finance', relatedTo: 'BK-2026-0713', relatedKind: 'booking', party: 'Mirage Weddings', branch: 'Patan', status: 'Expired', recordState: 'Quote validity ended', recordTone: 'danger', createdAd: new Date(Date.UTC(2026, 6, 21)), createdTime: '04:10 PM', finance: true },
  { id: 'INS-2026-0221', name: 'Inspection Report', type: 'Inspection Report', category: 'Inventory', relatedTo: 'EQ-RED-0004', relatedKind: 'equipment', party: 'In-House', branch: 'Boudha', status: 'Signed', recordState: 'Equipment: Available', recordTone: 'in', createdAd: new Date(Date.UTC(2026, 6, 20)), createdTime: '11:10 AM' },
  { id: 'DMG-2026-0198', name: 'Damage Report', type: 'Damage Report', category: 'Inventory', relatedTo: 'SN-AP6-0204', relatedKind: 'equipment', party: 'In-House', branch: 'Boudha', status: 'Issued', recordState: 'Equipment: Maintenance', recordTone: 'progress', createdAd: new Date(Date.UTC(2026, 6, 19)), createdTime: '03:05 PM' },
  { id: 'JOB-2026-0018', name: 'Job Card', type: 'Job Card', category: 'Maintenance', relatedTo: 'MT-2026-0018', relatedKind: 'job', party: 'In-House', branch: 'Thamel', status: 'Draft', recordState: 'Job: Scheduled', recordTone: 'primary', createdAd: new Date(Date.UTC(2026, 6, 19)), createdTime: '09:15 AM' },
  /* §7 — a template carries its id **and** its version; documents pin the
     version they were generated from, so editing a template never rewrites a
     signed agreement. */
  { id: 'RA · v4', name: 'Rental Agreement', type: 'Template', category: 'Templates', relatedTo: '—', relatedKind: 'template', party: 'In-House', branch: 'All Branches', status: 'Issued', recordState: 'Active · 412 documents pinned', recordTone: 'in', createdAd: new Date(Date.UTC(2026, 6, 18)), createdTime: '10:00 AM' },
  { id: 'INV · v2', name: 'Tax Invoice', type: 'Template', category: 'Templates', relatedTo: '—', relatedKind: 'template', party: 'In-House', branch: 'All Branches', status: 'Issued', recordState: 'Active · 268 documents pinned', recordTone: 'in', createdAd: new Date(Date.UTC(2026, 6, 18)), createdTime: '09:45 AM', finance: true },
  /* Archived — kept, reachable, never deleted (§6). */
  { id: 'INV-2026-0140', name: 'Tax Invoice', type: 'Tax Invoice', category: 'Finance', archived: true, relatedTo: 'BK-2026-0709', relatedKind: 'booking', party: 'Lumen House', branch: 'Thamel', status: 'Void', recordState: 'Voided · replaced by INV-2026-0141', recordTone: 'danger', createdAd: new Date(Date.UTC(2026, 6, 19)), createdTime: '04:30 PM', finance: true },
  { id: 'RA-2026-0702', name: 'Rental Agreement', type: 'Rental Agreement', category: 'Rental', archived: true, relatedTo: 'BK-2026-0702', relatedKind: 'booking', party: 'Mountain Stories', branch: 'Boudha', status: 'Signed', recordState: 'Superseded by RA-2026-0703', recordTone: 'neutral', createdAd: new Date(Date.UTC(2026, 6, 18)), createdTime: '02:15 PM' },
]

/* ── filter vocabularies ───────────────────────────────────────────────── */

export const ALL_TYPES = 'All Types'
export const ALL_STATUS = 'All Status'
export const ALL_RELATED = 'All'
export const ALL_BRANCHES = 'All Branches'

/**
 * §16 — the branch filter is hidden unless more than one branch is configured.
 * `data/expenseReports.ts` and `data/audit.ts` both carry four, so it shows.
 */
export const BRANCHES = [ALL_BRANCHES, 'Boudha', 'Thamel', 'Patan', 'Pokhara']

export const SORTS = ['Created Date', 'Document Name', 'Type', 'Status', 'Client / Vendor'] as const
export type SortKey = (typeof SORTS)[number]

/**
 * The render's footer reads `10 / page`. §11 asks for 25. The render's density
 * is what this pass is matching, so 10 leads and 25 is one click away.
 */
export const PER_PAGE = [10, 25, 50, 100]

/* ── role filtering — §14 ───────────────────────────────────────────────── */

/**
 * §14 — "Warehouse never sees invoices, receipts, credit or debit notes, or
 * cost assessments." Foundation §8.3 makes that structural: the rows, the
 * Finance tab, the Finance category and the Finance donut slice are removed
 * from the arrays **before** anything renders, so there is nothing masked,
 * blurred or collapsed for a warehouse session to reveal.
 */
export function documentsFor(money: boolean): DocRow[] {
  return money ? DOCUMENTS : DOCUMENTS.filter((d) => !d.finance)
}

export function categoriesFor(money: boolean): CategoryMeta[] {
  return money ? CATEGORIES : CATEGORIES.filter((c) => !c.finance)
}

export function totalDocuments(money: boolean): number {
  return categoriesFor(money).reduce((a, c) => a + c.count, 0)
}

/* ── donut ─────────────────────────────────────────────────────────────── */

/** §0 — the Document Summary donut reconciles exactly against the categories. */
export function summarySlices(cats: CategoryMeta[]): Slice[] {
  const total = cats.reduce((a, c) => a + c.count, 0) || 1
  return cats.map((c) => ({
    label: c.tab,
    value: c.count,
    display: c.count.toLocaleString('en-IN'),
    percent: `${((c.count / total) * 100).toFixed(1)}%`,
  }))
}

/* ── KPI cards ─────────────────────────────────────────────────────────── */

/**
 * The render shows **five** cards; §10 cut `This Month Created` to four. This
 * pass keeps the render's five, in the render's order, because matching the
 * render is what was asked — see the report's open decisions.
 *
 * The render's `Total Documents` tile is purple. Foundation §4.2 bans the hue
 * outright, so it takes the neutral tile; the other four keep the render's
 * colours, which are all inside the five-colour law already.
 */
export function kpisFor(money: boolean): Kpi[] {
  return [
    {
      label: 'Total Documents',
      value: totalDocuments(money).toLocaleString('en-IN'),
      icon: 'file',
      accent: 'neutral',
      // §6 — Total counts everything not deleted, **including archived**, and says so.
      note: 'All categories, including archived',
    },
    {
      label: 'This Month Created',
      value: '132',
      icon: 'calendar_stats',
      accent: 'primary',
      delta: { direction: 'up', text: '18%', good: true },
      note: 'vs last month',
    },
    { label: 'Pending Signatures', value: '18', icon: 'crew', accent: 'success', note: 'Require client or staff signature' },
    { label: 'Expiring / Due Soon', value: '24', icon: 'timer', accent: 'progress', note: 'Within the next 7 days' },
    { label: 'Missing Documents', value: '16', icon: 'alert_triangle', accent: 'danger', note: 'Across active rentals' },
  ]
}

/* ── right rail ────────────────────────────────────────────────────────── */

/** The rail states the installation total under the sample it lists. */
export const PENDING_SIGNATURE_TOTAL = 18
export const MISSING_TOTAL = 16

/** §0 — the Missing Documents panel names the booking **and** the client. */
export interface MissingDoc {
  doc: string
  booking: string
  client: string
  finance?: boolean
}

export const MISSING: MissingDoc[] = [
  { doc: 'Rental Agreement', booking: 'BK-2026-0722', client: 'Pixel Studio' },
  { doc: 'Packing List', booking: 'BK-2026-0722', client: 'Pixel Studio' },
  { doc: 'Delivery Note', booking: 'BK-2026-0722', client: 'Pixel Studio' },
  { doc: 'Tax Invoice', booking: 'BK-2026-0713', client: 'Mirage Weddings', finance: true },
]

export function missingFor(money: boolean): MissingDoc[] {
  return money ? MISSING : MISSING.filter((m) => !m.finance)
}

/**
 * §9 — `Expiring / Due Soon` must say **what** expires, with an owner and an
 * action. The render's tile only counts.
 */
export interface ExpiringDoc {
  doc: string
  what: string
  when: string
  action: string
  /** §14 — same structural rule as the table: finance never reaches Warehouse. */
  finance?: boolean
}

export const EXPIRING: ExpiringDoc[] = [
  // QT-2026-0088 is a finance document in `DOCUMENTS` above, so it is removed
  // from this panel for the same session that cannot see its row.
  { doc: 'Quotation QT-2026-0088', what: 'Quote validity ends', when: 'in 2 days', action: 'Resend or convert to booking', finance: true },
  { doc: 'Insurance Certificate', what: 'Policy cover ends', when: 'in 9 days', action: 'Renew' },
  { doc: 'Citizenship — Mirage Weddings', what: 'Client ID validity ends', when: 'in 21 days', action: 'Request updated copy' },
]

export function expiringFor(money: boolean): ExpiringDoc[] {
  return money ? EXPIRING : EXPIRING.filter((e) => !e.finance)
}

/* ── actions ───────────────────────────────────────────────────────────── */

export interface QuickAction {
  label: string
  icon: IconName
  finance?: boolean
}

/** The render's four Quick Action tiles, in its order. */
export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Create Quote', icon: 'file', finance: true },
  { label: 'Create Invoice', icon: 'invoice', finance: true },
  { label: 'Create Receipt', icon: 'receipt', finance: true },
  { label: 'Upload Document', icon: 'upload' },
]

export function quickActionsFor(money: boolean): QuickAction[] {
  return money ? QUICK_ACTIONS : QUICK_ACTIONS.filter((q) => !q.finance)
}

/** §11 — the row menu. No Delete: documents are archived, never deleted (§6). */
export const ROW_MENU: Array<{ label: string; icon: IconName }> = [
  { label: 'Download', icon: 'download' },
  { label: 'Print', icon: 'file' },
  { label: 'Email', icon: 'external_link' },
  { label: 'WhatsApp', icon: 'external_link' },
  { label: 'Share Link', icon: 'external_link' },
  { label: 'Duplicate', icon: 'queues' },
  { label: 'Archive', icon: 'folder' },
]

/** Every control that needs a backend says this, rather than doing nothing. */
export const NOT_BUILT = 'Not built yet — document storage, generation and delivery are unwired'
