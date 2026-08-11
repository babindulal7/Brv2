import { rupees } from '../lib/money'

export const EQUIPMENT_METRICS = {
  revenue: rupees(8500000),
  roi: 1.45,
  payback: '8.2 months',
  idleCost: rupees(240000)
}

export const TOP_PERFORMERS = [
  { id: 'CAM-001', name: 'RED Komodo 6K', category: 'Cameras', revenue: rupees(1200000), roi: 2.1, utilization: 85 },
  { id: 'LEN-042', name: 'Canon RF 28-70 f/2', category: 'Lenses', revenue: rupees(450000), roi: 1.8, utilization: 92 },
  { id: 'LIG-011', name: 'Aputure 600d Pro', category: 'Lighting', revenue: rupees(380000), roi: 1.5, utilization: 78 }
]

export const WORST_PERFORMERS = [
  { id: 'CAM-015', name: 'Blackmagic URSA Mini', category: 'Cameras', revenue: rupees(45000), roi: 0.2, utilization: 12 },
  { id: 'AUD-021', name: 'Rode NTG3', category: 'Audio', revenue: rupees(12000), roi: 0.4, utilization: 18 }
]
