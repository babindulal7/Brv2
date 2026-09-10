import { supabase } from '../supabase'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'
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

  return {
    id: row.document_no || row.id,
    name: `${row.document_type} ${row.document_no}`,
    type: row.document_type,
    category,
    ...(isArchived ? { archived: true } : {}),
    relatedTo: row.booking_id ? `B-${row.booking_id.slice(0, 4)}` : 'General',
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

export async function listDocuments(filters?: ListFilters): Promise<ListQueryResult<DocRow>> {
  try {
    let query = supabase
      .from('document_registry')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.search && filters.search.trim().length > 0) {
      const term = filters.search.trim()
      query = query.or(`document_no.ilike.%${term}%,document_type.ilike.%${term}%`)
    }

    const { data, error } = await query

    if (error || !data || data.length === 0) {
      return {
        rows: [...DOCUMENTS],
        total: DOCUMENTS.length,
      }
    }

    const mapped = (data as unknown as DocumentRowDb[]).map(mapDbRowToDocRow)
    return {
      rows: mapped,
      total: mapped.length,
    }
  } catch {
    return {
      rows: [...DOCUMENTS],
      total: DOCUMENTS.length,
    }
  }
}
