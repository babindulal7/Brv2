import { rupees } from '../lib/money'

/**
 * ⚠ `roi: 1.45` and `payback: '8.2 months'` used to live here and were printed
 * as "Average ROI" and "Avg Payback Period" — and, after the rebuild added a
 * CSV export, left the app in a file. Nothing in this repo records what any
 * unit cost, so neither figure had a source. Rulings §8: they are deleted here
 * rather than left exported, so no later screen can pick them up again. Same
 * for the per-item `roi` multiples on the two lists below.
 *
 * `ReportCatalog.tsx` reached the same conclusion in the same rebuild wave and
 * refuses to label its top-8 table ROI; this is that ruling applied here.
 */
export const EQUIPMENT_METRICS = {
  revenue: rupees(8500000),
  idleCost: rupees(240000)
}

export const TOP_PERFORMERS = [
  { id: 'CAM-001', name: 'RED Komodo 6K', category: 'Cameras', revenue: rupees(1200000), utilization: 85 },
  { id: 'LEN-042', name: 'Canon RF 28-70 f/2', category: 'Lenses', revenue: rupees(450000), utilization: 92 },
  { id: 'LIG-011', name: 'Aputure 600d Pro', category: 'Lighting', revenue: rupees(380000), utilization: 78 }
]

export const WORST_PERFORMERS = [
  { id: 'CAM-015', name: 'Blackmagic URSA Mini', category: 'Cameras', revenue: rupees(45000), utilization: 12 },
  { id: 'AUD-021', name: 'Rode NTG3', category: 'Audio', revenue: rupees(12000), utilization: 18 }
]
