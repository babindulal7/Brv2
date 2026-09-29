/**
 * Productions Management — domain queries, data model and localStorage persistence.
 *
 * Ported from the standalone's productions view (script_1.js:4502-4530).
 * Rolls up bookings and crew assignments into production packages with
 * a 4-phase lifecycle: Pre-Production -> Shoot -> Return -> Wrap.
 */

export type ProductionPhase = 'Pre-Production' | 'Shoot' | 'Return' | 'Wrap'

export interface Production {
  id: string              // e.g. 'PRD-101'
  bookingId: string       // e.g. 'BR-2613'
  title: string           // e.g. '"Echoes of Mustang"'
  client: string          // e.g. 'Himalayan Films Pvt. Ltd.'
  director: string        // e.g. 'Prem Sthapit'
  dop: string             // e.g. 'Bikash Tamang'
  dates: string           // e.g. '21 Jul – 28 Jul 2026'
  startDate: string       // ISO
  endDate: string         // ISO
  phase: ProductionPhase
  gearCount: number
  budgetNpr: number
  crewSummary: string
  location: string
  notes?: string
}

export const PROD_PHASES: ProductionPhase[] = [
  'Pre-Production',
  'Shoot',
  'Return',
  'Wrap',
]

const STORAGE_KEY = 'br.productions'

export const SEED_PRODUCTIONS: Production[] = [
  {
    id: 'PRD-101',
    bookingId: 'BR-2613',
    title: '"Echoes of Mustang"',
    client: 'Himalayan Films Pvt. Ltd.',
    director: 'Prem Sthapit',
    dop: 'Bikash Tamang',
    dates: '21 Jul – 28 Jul 2026',
    startDate: '2026-07-21',
    endDate: '2026-07-28',
    phase: 'Pre-Production',
    gearCount: 24,
    budgetNpr: 185000,
    crewSummary: 'Bikash Tamang (DOP), Suman Rai (Gaffer)',
    location: 'Mustang / Jomsom',
    notes: 'Extreme altitude & dust protection kit required for FX6 and cinema primes.',
  },
  {
    id: 'PRD-102',
    bookingId: 'BR-2611',
    title: '"Sajilo Pay TVC"',
    client: 'Kathmandu Ad Lab',
    director: 'Aayush KC',
    dop: 'Saurav Shrestha',
    dates: '21 Jul – 23 Jul 2026',
    startDate: '2026-07-21',
    endDate: '2026-07-23',
    phase: 'Shoot',
    gearCount: 16,
    budgetNpr: 95000,
    crewSummary: 'Hari KC (Driver), Mingma Sherpa (Lightman)',
    location: 'Jhamsikhel Studio',
    notes: 'Multi-cam setup with studio wireless video feed.',
  },
  {
    id: 'PRD-103',
    bookingId: 'BR-2608',
    title: 'Music Video "Maya"',
    client: 'Studio Nine',
    director: 'Rohan Sharma',
    dop: 'Rajan Thapa',
    dates: '20 Jul – 22 Jul 2026',
    startDate: '2026-07-20',
    endDate: '2026-07-22',
    phase: 'Shoot',
    gearCount: 12,
    budgetNpr: 68000,
    crewSummary: 'Rajan Thapa (Focus Puller)',
    location: 'Bhaktapur Durbar Square',
    notes: 'Night shoot with portable Aputure lighting pack.',
  },
  {
    id: 'PRD-104',
    bookingId: 'BR-2607',
    title: '"Glacier Lines"',
    client: 'White Peak Documentaries',
    director: 'Tenzing Sherpa',
    dop: 'David Miller',
    dates: '14 Jul – 21 Jul 2026',
    startDate: '2026-07-14',
    endDate: '2026-07-21',
    phase: 'Return',
    gearCount: 18,
    budgetNpr: 142000,
    crewSummary: 'Bikash Tamang (DOP)',
    location: 'Pokhara & Annapurna Base',
    notes: 'Client drop-off requested +1 day extension; returned this morning.',
  },
  {
    id: 'PRD-105',
    bookingId: 'BR-2604',
    title: '"Rato Tika"',
    client: 'Mirage Pictures',
    director: 'Sunil Pokhrel',
    dop: 'Arun Adhikari',
    dates: '16 Jul – 20 Jul 2026',
    startDate: '2026-07-16',
    endDate: '2026-07-20',
    phase: 'Return',
    gearCount: 20,
    budgetNpr: 115000,
    crewSummary: 'Suman Rai (Gaffer), Mingma Sherpa (Lightman)',
    location: 'Patan Old City',
    notes: 'Returned at 15:00. 1 item flagged for QC check on RS4 gimbal arm.',
  },
  {
    id: 'PRD-106',
    bookingId: 'BR-2612',
    title: 'Rooftop Commercial',
    client: 'Karma Studios',
    director: 'Nitesh Shrestha',
    dop: 'Subash Gurung',
    dates: '18 Jul – 20 Jul 2026',
    startDate: '2026-07-18',
    endDate: '2026-07-20',
    phase: 'Wrap',
    gearCount: 6,
    budgetNpr: 45000,
    crewSummary: 'Hari KC (Driver)',
    location: 'Baluwatar Rooftop',
    notes: 'All items checked in and reset completed cleanly.',
  },
]

export function getProductions(): Production[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Production[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* fallback to seed */
  }
  return [...SEED_PRODUCTIONS]
}

export function saveProductions(items: Production[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function createProduction(item: Omit<Production, 'id'>): Production {
  const all = getProductions()
  const nextNum = 100 + all.length + 1
  const newProd: Production = {
    ...item,
    id: `PRD-${nextNum}`,
  }
  all.unshift(newProd)
  saveProductions(all)
  return newProd
}

export function updateProductionPhase(id: string, phase: ProductionPhase): Production[] {
  const all = getProductions()
  const idx = all.findIndex((p) => p.id === id)
  if (idx !== -1) {
    const existing = all[idx]
    if (existing) {
      all[idx] = { ...existing, phase }
      saveProductions(all)
    }
  }
  return all
}

export interface ProductionStats {
  totalCount: number
  inShootCount: number
  preProdCount: number
  returnWrapCount: number
  totalBudget: number
  totalGearOut: number
}

export function getProductionStats(items: Production[]): ProductionStats {
  let inShootCount = 0
  let preProdCount = 0
  let returnWrapCount = 0
  let totalBudget = 0
  let totalGearOut = 0

  for (const p of items) {
    totalBudget += p.budgetNpr
    if (p.phase === 'Shoot') {
      inShootCount++
      totalGearOut += p.gearCount
    } else if (p.phase === 'Pre-Production') {
      preProdCount++
    } else {
      returnWrapCount++
    }
  }

  return {
    totalCount: items.length,
    inShootCount,
    preProdCount,
    returnWrapCount,
    totalBudget,
    totalGearOut,
  }
}
