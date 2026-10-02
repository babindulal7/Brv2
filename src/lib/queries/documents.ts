import { IS_MOCK, supabase } from '../supabase'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'
import type { SystemRole } from '../../types/database'
import {
  DOCUMENTS,
  type DocRow,
  type DocStatus,
  type CategoryKey,
  type CategoryMeta,
  type RelatedKind,
  type SortKey,
  type MissingDoc,
  type ExpiringDoc,
  type QuickAction,
  CATEGORIES,
  ARCHIVED_NOT_RECYCLE_BIN,
  ALL_TAB,
  DOC_STATUSES,
  DOC_STATUS,
  RELATED_TARGET,
  ALL_TYPES,
  ALL_STATUS,
  ALL_RELATED,
  ALL_BRANCHES,
  BRANCHES,
  SORTS,
  PER_PAGE,
  documentsFor,
  categoriesFor,
  totalDocuments,
  summarySlices,
  kpisFor,
  PENDING_SIGNATURE_TOTAL,
  MISSING_TOTAL,
  MISSING,
  missingFor,
  EXPIRING,
  expiringFor,
  QUICK_ACTIONS,
  quickActionsFor,
  ROW_MENU,
  NOT_BUILT,
} from '../../data/documents'
import { documentGlance, documentDetailGroups } from '../../data/documentIntel'

export type {
  DocRow,
  DocStatus,
  CategoryKey,
  CategoryMeta,
  RelatedKind,
  SortKey,
  MissingDoc,
  ExpiringDoc,
  QuickAction,
}

export {
  DOCUMENTS,
  CATEGORIES,
  ARCHIVED_NOT_RECYCLE_BIN,
  ALL_TAB,
  DOC_STATUSES,
  DOC_STATUS,
  RELATED_TARGET,
  ALL_TYPES,
  ALL_STATUS,
  ALL_RELATED,
  ALL_BRANCHES,
  BRANCHES,
  SORTS,
  PER_PAGE,
  documentsFor,
  categoriesFor,
  totalDocuments,
  summarySlices,
  kpisFor,
  PENDING_SIGNATURE_TOTAL,
  MISSING_TOTAL,
  MISSING,
  missingFor,
  EXPIRING,
  expiringFor,
  QUICK_ACTIONS,
  quickActionsFor,
  ROW_MENU,
  NOT_BUILT,
  documentGlance,
  documentDetailGroups,
}

export type SystemRoleDb = Database['public']['Enums']['system_role']

export interface DocumentRowDb {
  id: string
  client_uuid: string
  document_no: string
  document_type: string
  booking_id: string | null
  client_id: string | null
  lifecycle_status: string
  file_url: string
  file_size_bytes: number | null
  generated_by: string | null
  signed_at: string | null
  signed_by_name: string | null
  created_at: string
}

/** Operational document types that a money-blind role may inspect. Finance
 * documents are excluded in the query itself, before their rows reach JS. */
const OPERATIONAL_PREVIEW_TYPES = [
  'Rental Agreement', 'Packing List', 'Delivery Note', 'Return Report',
  'Inspection Report', 'Damage Report', 'Job Card', 'Service Report',
  'Incident Report', 'Insurance Claim', 'Call Sheet',
] as const

export interface DocumentPreviewRecord {
  id: string
  documentNo: string
  type: string
  status: string
  createdAt: string
  signedAt: string | null
  bookingRef: string | null
}

export async function getDocumentPreviewRecord(ref: string, canSeeFinance: boolean, role?: SystemRole): Promise<DocumentPreviewRecord | null> {
  if (role === 'Driver' || role === 'Client') return null
  const allowedTypes = role === 'Warehouse'
    ? ['Rental Agreement', 'Packing List', 'Delivery Note']
    : canSeeFinance ? null : [...OPERATIONAL_PREVIEW_TYPES]
  if (IS_MOCK) {
    const row = documentsFor(canSeeFinance).find((item) => item.id === ref && (!allowedTypes || allowedTypes.includes(item.type)))
    if (!row) return null
    return {
      id: row.id, documentNo: row.id, type: row.type, status: row.status,
      createdAt: row.createdAd.toISOString(), signedAt: null,
      bookingRef: row.relatedKind === 'booking' ? row.relatedTo : null,
    }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  let query = supabase.from('document_registry')
    .select('id, document_no, document_type, lifecycle_status, booking_id, created_at, signed_at')
  if (allowedTypes) query = query.in('document_type', allowedTypes)
  const { data, error } = await (isUuid ? query.eq('id', ref) : query.eq('document_no', ref)).maybeSingle()
  if (error) throw new Error(`Document preview unavailable: ${error.message}`)
  if (!data) return null
  return {
    id: data.id,
    documentNo: data.document_no,
    type: data.document_type,
    status: data.lifecycle_status,
    createdAt: data.created_at,
    signedAt: data.signed_at,
    bookingRef: data.booking_id,
  }
}

function mapTypeToCategory(docType: string): Exclude<CategoryKey, 'Archived'> {
  switch (docType) {
    case 'Tax Invoice':
    case 'Receipt':
    case 'Credit Note':
    case 'Debit Note':
    case 'Quotation':
      return 'Finance'
    case 'Rental Agreement':
    case 'Packing List':
    case 'Delivery Note':
    case 'Return Report':
      return 'Rental'
    case 'Job Card':
    case 'Service Report':
      return 'Maintenance'
    case 'Incident Report':
    case 'Damage Report':
    case 'Insurance Claim':
      return 'Cases'
    default:
      return 'Rental'
  }
}

function mapStatusToDocStatus(status: string): DocStatus {
  switch (status) {
    case 'Draft':
      return 'Draft'
    case 'Pending Approval':
      return 'Pending Approval'
    case 'Pending Signature':
      return 'Pending Signature'
    case 'Signed':
      return 'Signed'
    case 'Issued':
      return 'Issued'
    case 'Void':
      return 'Void'
    case 'Expired':
      return 'Expired'
    default:
      return 'Draft'
  }
}

function isFinanceDocument(docType: string): boolean {
  return ['Tax Invoice', 'Receipt', 'Credit Note', 'Debit Note', 'Quotation'].includes(docType)
}


export function mapDbRowToDocRow(row: DocumentRowDb): DocRow {
  const isArchived = row.lifecycle_status === 'Void'
  const category = mapTypeToCategory(row.document_type)
  const createdDate = row.created_at ? new Date(row.created_at) : new Date()
  const hours = createdDate.getHours().toString().padStart(2, '0')
  const mins = createdDate.getMinutes().toString().padStart(2, '0')
  // The registry stores a booking UUID. Mock records may carry B-numbers.
  // Neither form may be truncated and presented as an invented booking no.
  const relatedTo = row.booking_id ?? 'General'

  return {
    id: row.document_no || row.id,
    name: `${row.document_type} ${row.document_no}`,
    type: row.document_type,
    category,
    ...(isArchived ? { archived: true } : {}),
    relatedTo,
    relatedKind: row.booking_id ? 'booking' : 'template',
    party: 'Client',
    branch: 'Kathmandu',
    status: mapStatusToDocStatus(row.lifecycle_status),
    recordState: row.lifecycle_status,
    recordTone: 'neutral',
    createdAd: createdDate,
    createdTime: `${hours}:${mins}`,
    ...(isFinanceDocument(row.document_type) ? { finance: true } : {}),
  }
}

const DOCUMENT_COLUMNS =
  'id, client_uuid, document_no, document_type, booking_id, client_id, lifecycle_status, file_url, file_size_bytes, generated_by, signed_at, signed_by_name, created_at'

export async function listDocuments(filters?: ListFilters): Promise<ListQueryResult<DocRow>> {
  try {
    let query = supabase
      .from('document_registry')
      .select(DOCUMENT_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (filters?.search && filters.search.trim().length > 0) {
      const term = filters.search.trim()
      query = query.or(`document_no.ilike.%${term}%,document_type.ilike.%${term}%`)
    }

    if (filters?.chips?.booking_id?.[0]) {
      query = query.eq('booking_id', filters.chips.booking_id[0])
    }

    if (filters?.chips?.client_id?.[0]) {
      query = query.eq('client_id', filters.chips.client_id[0])
    }

    if (filters?.page) {
      const from = filters.page.index * filters.page.size
      query = query.range(from, from + filters.page.size - 1)
    }

    const { data, error, count } = await query

    if (error) {
      return {
        rows: [],
        total: 0,
      }
    }

    const mapped = ((data ?? []) as unknown as DocumentRowDb[]).map(mapDbRowToDocRow)
    return {
      rows: mapped,
      total: count ?? mapped.length,
    }
  } catch {
    return {
      rows: [],
      total: 0,
    }
  }
}

export function documentsForBooking(bookingId: string): ListFilters {
  return { chips: { booking_id: [bookingId] } }
}

export function documentsForClient(clientId: string): ListFilters {
  return { chips: { client_id: [clientId] } }
}
