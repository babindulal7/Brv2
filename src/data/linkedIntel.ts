/** Read a linked entity into the existing Detail Peek without leaving its workflow. */
import type { IntelGroup } from '../components/ui/IntelCard'
import { rentalDetailGroups, toRentalListRow } from './rentals'
import { getClientPreviewRecord } from '../lib/queries/clients'
import { listBookings } from '../lib/queries/bookings'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelEntityType } from '../lib/intel/context'
import { loadEquipmentPreview } from '../lib/smartHoverLoaders'
import { formatMoney } from '../lib/money'
import { parseBookingNoSearch } from '../lib/format'

export interface LinkedIntelDetail {
  entityType: IntelEntityType
  entityId: string
  title: string
  subtitle: string
  groups: IntelGroup[]
}

/** Only controlled entity links are intercepted; other links keep normal navigation. */
export function isLinkedIntelPath(path: string): boolean {
  return /^\/(clients|rentals|inventory)\/[^/?#]+$/.test(path)
}

export async function loadLinkedIntel(path: string, ctx: GateContext): Promise<LinkedIntelDetail> {
  if (!isLinkedIntelPath(path)) throw new Error('Unsupported Intel link')
  const parts = path.split('/')
  const type = parts[1]
  const ref = decodeURIComponent(parts[2] ?? '')
  if (type === 'clients') {
    const profile = await getClientPreviewRecord(ref, ctx)
    if (!profile) throw new Error('Client record not found')
    const bookings = await listBookings({ chips: { client_id: [profile.id] }, sort: { column: 'pickup_at', ascending: false }, page: { index: 0, size: 20 } })
    const active = bookings.rows.filter((row) => !row.isClosed && !row.isCancelled)
    const groups: IntelGroup[] = [{ title: 'Account', fields: [
      { label: 'Client', value: profile.name },
      { label: 'Code', value: profile.code },
      { label: 'Restriction', value: profile.blocked ? 'On Stop' : 'Clear' },
      ...(profile.membership ? [{ label: 'Membership', value: profile.membership }] : []),
    ] }]
    if (profile.contact) groups.push({ title: 'Contact', fields: [
      ...(profile.contact.phone ? [{ label: 'Phone', value: profile.contact.phone }] : []),
      ...(profile.contact.email ? [{ label: 'Email', value: profile.contact.email }] : []),
    ] })
    if (profile.outstandingPaisa !== undefined && profile.depositHeldPaisa !== undefined) groups.push({ title: 'Balance', fields: [
      { label: 'Outstanding', value: formatMoney(profile.outstandingPaisa) },
      { label: 'Deposit held', value: formatMoney(profile.depositHeldPaisa) },
    ] })
    if (active.length > 0) groups.push({ title: 'Current rentals', fields: active.map((row) => ({ label: row.bookingNo, value: row.stage, trigger: { label: 'Open', to: `/rentals/${encodeURIComponent(row.bookingNo)}` } })) })
    return {
      entityType: 'client',
      entityId: profile.id,
      title: profile.name,
      subtitle: profile.code,
      groups,
    }
  }
  if (type === 'inventory') {
    const equipment = await loadEquipmentPreview(ref, ctx)
    const fields = equipment.info.map((field) => ({ label: field.label, value: field.value }))
    const groups: IntelGroup[] = [{ title: 'Identity and state', fields: [
      { label: 'Name', value: equipment.name },
      { label: 'Code', value: equipment.assetCode },
      ...(equipment.serial ? [{ label: 'Serial', value: equipment.serial }] : []),
      { label: 'State', value: equipment.statusLabel },
      ...fields,
    ] }]
    if (equipment.finance?.length) groups.push({ title: 'Money', fields: equipment.finance.map((field) => ({ label: field.label, value: field.value })) })
    return {
      entityType: 'equipment',
      entityId: equipment.id,
      title: equipment.name,
      subtitle: equipment.serial ?? equipment.assetCode,
      groups,
    }
  }
  const money = canViewMoneyField(ctx, 'booking')
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  const bare = isUuid ? ref : parseBookingNoSearch(ref)
  const result = await listBookings({
    chips: isUuid ? { id: [bare] } : { booking_no: Array.from(new Set([ref, bare])) },
    ...(money ? { withDeposit: true, withTotalAmount: true } : {}),
  })
  const booking = result.rows.find((row) => row.id === ref || row.id === bare || row.bookingNo === ref || row.bookingNo === bare) ?? (result.rows.length === 1 ? result.rows[0] : undefined)
  if (!booking) throw new Error('Rental record not found')
  const row = toRentalListRow(booking)
  return {
    entityType: 'rental',
    entityId: booking.id,
    title: row.bookingNo,
    subtitle: `${row.client} · ${row.status}`,
    groups: rentalDetailGroups(row, ctx),
  }
}
