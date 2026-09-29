import type { EquipmentResult } from '../modules/rentals/booking/itemCatalogue'
import type { IntelGlance, IntelGroup } from '../components/ui/IntelCard'

/** The catalogue verdict is already computed for New Rental's current window. */
export function newRentalEquipmentGlance(row: EquipmentResult): IntelGlance {
  return {
    avatarLabel: row.category.slice(0, 2).toUpperCase(),
    avatarIcon: 'package',
    avatarTone: row.availability.tone,
    title: row.name,
    statusDot: row.availability.tone,
    subtitle: row.serial === '—' ? row.category : `${row.category} · ${row.serial}`,
    badges: [{ label: row.availability.label, tone: row.availability.tone }],
    lines: [row.availability.detail, ...(row.location && row.location !== '—' ? [`Location: ${row.location}`] : [])],
  }
}

export function newRentalEquipmentDetail(row: EquipmentResult): IntelGroup[] {
  return [
    { title: 'Identity', fields: [
      { label: 'Model', value: row.name },
      { label: 'Category', value: row.category },
      { label: 'Serial', value: row.serial === '—' ? 'Bulk stock' : row.serial },
      { label: 'Brand', value: row.brand ?? 'Not recorded' },
      { label: 'SKU', value: row.sku ?? 'Not recorded' },
    ] },
    { title: 'Selected rental period', fields: [
      { label: 'Availability', value: `${row.availability.label} · ${row.availability.detail}` },
      { label: 'Location', value: row.location || 'Not recorded' },
    ] },
  ]
}
