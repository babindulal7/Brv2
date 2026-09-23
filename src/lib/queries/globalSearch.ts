import { listBookings, type BookingListRow } from './bookings'
import { listClientRecords, type ClientRecord } from './clients'
import { listInventory, type InventoryListRow } from './inventory'
import { listInvoices, type InvoiceListRow } from './finance'
import { canViewMoney, isStaff } from '../rbac'
import type { SystemRole } from '../../types/database'

export type GlobalSearchKind = 'booking' | 'client' | 'equipment' | 'invoice'

export interface GlobalSearchOptions {
  role: SystemRole
  term: string
  limit?: number
}

export interface GlobalSearchResult {
  kind: GlobalSearchKind
  id: string
  label: string
  detail: string
  to: string
}

const clean = (term: string) =>
  Array.from(term)
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : char
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * One permission-aware read contract for the global palette. Each underlying
 * list query keeps its own server-side filters and column allow-list; this
 * adapter only normalizes small result cards and never reads money for a role
 * that cannot see it.
 */
export async function searchRecords({ role, term, limit = 5 }: GlobalSearchOptions): Promise<GlobalSearchResult[]> {
  const search = clean(term)
  if (search.length < 2 || !isStaff(role)) return []
  const capped = Math.max(1, Math.min(10, limit))

  const [bookings, clients, equipment, invoices] = await Promise.all([
    listBookings({ search, page: { index: 0, size: capped } }),
    listClientRecords({ search }),
    listInventory({ search, page: { index: 0, size: capped } }),
    canViewMoney(role) ? listInvoices({ search, page: { index: 0, size: capped } }) : Promise.resolve({ rows: [] as InvoiceListRow[] }),
  ])

  const results: GlobalSearchResult[] = [
    ...bookings.rows.slice(0, capped).map((row: BookingListRow) => ({
      kind: 'booking' as const, id: row.id, label: `#${row.bookingNo} · ${row.clientName}`,
      detail: row.project ?? row.stage, to: `/rentals/${row.id}`,
    })),
    ...clients.slice(0, capped).map((row: ClientRecord) => ({
      kind: 'client' as const, id: row.id, label: row.name, detail: row.phone ?? 'Client record', to: `/clients/${row.id}`,
    })),
    ...equipment.rows.slice(0, capped).map((row: InventoryListRow) => ({
      kind: 'equipment' as const, id: row.id, label: row.name, detail: row.category ?? row.trackingMode, to: `/inventory/${row.id}`,
    })),
    ...invoices.rows.slice(0, capped).map((row: InvoiceListRow) => ({
      kind: 'invoice' as const, id: row.id, label: row.invoiceNo || 'Invoice', detail: row.status, to: `/finance?invoice=${row.id}`,
    })),
  ]
  return results.slice(0, capped * 4)
}
