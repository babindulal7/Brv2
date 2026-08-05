import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'
import { TODAY, toBs, formatBs, formatAd } from '../lib/bs'

/**
 * Documents seed data.
 *
 * ⚠ **Spec-derived** — `03 Core Modules/Documents.md` v2.1 (Build Locked).
 * No render in the reference set covers this screen.
 *
 * §1: **a document exists once.** Tabs and categories are views of one store,
 * never separate stores.
 */

/** §2 — tabs. The left rail holds filters only; it does not repeat these. */
export const TABS = ['All', 'Rental', 'Finance', 'Operations', 'Maintenance', 'Cases', 'Inventory', 'Templates'] as const

/** §2 — filters apply instantly. There is no Apply button. */
export const FILTER_GROUPS = ['Date Range', 'Type', 'Status', 'Related Record', 'Client / Vendor', 'Created By']

/**
 * §10 — four cards. `This Month Created` was removed: a count of documents
 * produced tells nobody what to do; the three operational cards do. Each is
 * clickable to its filtered view.
 */
export const KPIS: Kpi[] = [
  { label: 'Missing Documents', value: '14', icon: 'alert_triangle', accent: 'danger', note: 'Required, absent from active records' },
  { label: 'Pending Signatures', value: '9', icon: 'crew', accent: 'progress', note: 'Awaiting client or staff' },
  { label: 'Expiring Soon', value: '6', icon: 'timer', accent: 'progress', note: 'Within 30 days' },
  { label: 'Total Documents', value: '4,182', icon: 'file', accent: 'primary', note: 'Including archived' },
]

/**
 * §5 — document lifecycle is not record state. `Paid` is a *record* state and
 * is never a document status; the build the spec reviewed conflated them, so
 * they are separate columns here.
 */
export type DocStatus = 'Draft' | 'Issued' | 'Signed' | 'Approved' | 'Expired' | 'Archived'
export type RecordState = 'Paid' | 'Unpaid' | 'Partial' | 'Open' | 'Closed' | '—'

export const DOC_STATUS: Record<DocStatus, StatusKey> = {
  Draft: 'neutral',
  Issued: 'primary',
  Signed: 'in',
  Approved: 'in',
  Expired: 'danger',
  Archived: 'neutral',
}

export interface DocRow {
  name: string
  id: string
  type: string
  /** §11 — links to the *source record*, e.g. a tax invoice relates to the booking. */
  relatedTo: string
  party: string
  status: DocStatus
  recordState: RecordState
  createdBs: string
  createdAd: string
}

const bs = toBs(TODAY)
const CREATED_BS = bs ? formatBs(bs) : '—'
const CREATED_AD = `${formatAd(TODAY)}, 11:35 AM`

export const DOCUMENTS: DocRow[] = [
  { name: 'Tax Invoice – ABC Films', id: 'INV-2026-0492', type: 'Tax Invoice', relatedTo: 'BK-2026-0715', party: 'ABC Films Pvt. Ltd.', status: 'Issued', recordState: 'Unpaid', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Rental Agreement – Vision Production', id: 'AGR-2026-0188', type: 'Agreement', relatedTo: 'BK-2026-0710', party: 'Vision Production', status: 'Signed', recordState: 'Paid', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Packing List – RED Komodo X', id: 'PKL-2026-0341', type: 'Packing List', relatedTo: 'BK-2026-0715', party: 'ABC Films Pvt. Ltd.', status: 'Approved', recordState: 'Open', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Quotation – Mirage Weddings', id: 'QT-2026-0088', type: 'Quotation', relatedTo: 'BK-2026-0713', party: 'Mirage Weddings', status: 'Expired', recordState: '—', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Damage Report – Aputure 600D', id: 'CASE-2026-0041', type: 'Case Report', relatedTo: 'BK-2026-0711', party: 'Inside Out Films', status: 'Draft', recordState: 'Open', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Maintenance Record – AP6-0204', id: 'MT-2026-0054', type: 'Maintenance', relatedTo: 'AP6-0204', party: 'Tech Solutions Nepal', status: 'Approved', recordState: 'Closed', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Payment Receipt – Creative Studio', id: 'PAY-2026-6103', type: 'Receipt', relatedTo: 'BK-2026-0716', party: 'Creative Studio', status: 'Issued', recordState: 'Paid', createdBs: CREATED_BS, createdAd: CREATED_AD },
  { name: 'Delivery Note – NISI Athena Set', id: 'DN-2026-0225', type: 'Delivery Note', relatedTo: 'BK-2026-0710', party: 'Vision Production', status: 'Signed', recordState: 'Closed', createdBs: CREATED_BS, createdAd: CREATED_AD },
]

/** §0 — the Document Summary donut reconciles exactly. */
export const SUMMARY_MIX: Slice[] = [
  { label: 'Signed', value: 1842, display: '1,842', percent: '44.0%' },
  { label: 'Issued', value: 1204, display: '1,204', percent: '28.8%' },
  { label: 'Approved', value: 618, display: '618', percent: '14.8%' },
  { label: 'Draft', value: 342, display: '342', percent: '8.2%' },
  { label: 'Expired', value: 112, display: '112', percent: '2.7%' },
  { label: 'Archived', value: 64, display: '64', percent: '1.5%' },
]
export const SUMMARY_TOTAL = '4,182'

/* The donut must sum to the stated total — §0 says it "reconciles exactly". */
const MIX_SUM = SUMMARY_MIX.reduce((a, s) => a + s.value, 0)
if (MIX_SUM !== 4182) {
  throw new Error(`Document summary does not reconcile: ${MIX_SUM} vs 4182`)
}

/** §0 — the Missing Documents panel names the booking and the client. */
export const MISSING = [
  { doc: 'Signed Agreement', booking: 'BK-2026-0716', client: 'Creative Studio' },
  { doc: 'Tax Invoice', booking: 'BK-2026-0713', client: 'Mirage Weddings' },
  { doc: 'Delivery Note', booking: 'BK-2026-0711', client: 'Inside Out Films' },
  { doc: 'Packing List', booking: 'BK-2026-0717', client: 'Mountain Stories' },
]

/** §0 — Pending Signatures carries ageing. */
export const PENDING_SIGNATURES = [
  { doc: 'Rental Agreement', party: 'ABC Films Pvt. Ltd.', ageing: '3 days', severe: false },
  { doc: 'Damage Acknowledgement', party: 'Inside Out Films', ageing: '11 days', severe: true },
  { doc: 'Sub-Rental Contract', party: 'Lumen House', ageing: '2 days', severe: false },
]

/** §9 — "Expiring / Due Soon" must say *what* expires. */
export const EXPIRING = [
  { doc: 'Quotation QT-2026-0088', what: 'Quote validity ends', when: 'in 2 days' },
  { doc: 'Insurance Certificate', what: 'Policy cover ends', when: 'in 9 days' },
  { doc: 'VAT Registration', what: 'Renewal due', when: 'in 21 days' },
]

/** §11 — three quick actions plus More. */
export const QUICK_ACTIONS = ['Create Invoice', 'Upload Document']
export const MORE_ACTIONS = ['Create Quote', 'Create Receipt', 'Document Templates']

/** §11 — row menu. No Delete: documents are archived, never deleted (§6). */
export const ROW_MENU = ['Download', 'Print', 'Email', 'WhatsApp', 'Share Link', 'Duplicate', 'Archive']

export const SHOWING = 'Showing 1 to 8 of 4,182 documents'
