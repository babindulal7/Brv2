import { rupees } from '../lib/money'

export const FORECAST_METRICS = {
  forecastRevenue: rupees(12500000),
  expectedBookings: 840,
  predictedShortages: 15,
  forecastAccuracy: 92.4, // percentage
}

export const PURCHASE_FORECAST = [
  { id: 'REC-01', category: 'Cameras', item: 'Sony FX3', reason: 'High utilization (94%) & upcoming wedding season', confidence: 'High' },
  { id: 'REC-02', category: 'Lenses', item: '24-70mm f/2.8', reason: 'Frequent stockouts in last 30 days', confidence: 'High' },
  { id: 'REC-03', category: 'Lighting', item: 'Aputure 300d', reason: 'Aging fleet (avg 3.2 years)', confidence: 'Medium' },
]

export const MAINTENANCE_FORECAST = [
  { id: 'CAM-112', item: 'RED Komodo', nextService: '2026-09-15', trigger: 'Approaching 500h run time', priority: 'High' },
  { id: 'LEN-044', item: 'Zeiss 35mm', nextService: '2026-10-01', trigger: 'Scheduled 6-month check', priority: 'Medium' },
  { id: 'DRN-005', item: 'DJI Inspire 3', nextService: '2026-09-20', trigger: 'Motor replacement due', priority: 'High' },
]

export const SEASONAL_DEMAND = [
  { event: 'Dashain Festival', dates: 'Oct 2026', expectedLift: '+45%', topCategories: 'Cameras, Drones' },
  { event: 'Wedding Season', dates: 'Nov-Dec 2026', expectedLift: '+60%', topCategories: 'Lenses, Lighting' },
  { event: 'Monsoon Dip', dates: 'Jul-Aug 2026', expectedLift: '-20%', topCategories: 'Outdoor Gear' },
]
