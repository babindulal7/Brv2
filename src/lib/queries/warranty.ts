/**
 * Equipment Warranty Tracker — domain queries and coverage tracker.
 *
 * Ported from the standalone's WARRANTY engine (script_1.js:6950-6992).
 * Monitors warranty periods, expiring coverage (<=60d), RMA claims,
 * and warranty ROI (% of premiums recovered).
 */

export type WarrantyState = 'Active' | 'Expiring' | 'Expired'

export interface WarrantyItem {
  id: string             // e.g. 'WAR-01'
  name: string           // e.g. 'Sony FX3'
  serialNo: string       // e.g. 'SN-882910'
  category: string       // e.g. 'Cameras'
  provider: string       // e.g. 'Sony Pro Nepal'
  startDate: string      // e.g. '2024-03-14'
  endDate: string        // e.g. '2027-03-14'
  termMonths: number     // e.g. 36
  premiumCost: number    // NPR
  claimsCount: number
  claimsRecovered: number // NPR
  status: WarrantyState
  daysRemaining: number
  notes?: string | undefined
}

const STORAGE_KEY = 'br.warranties'

const NOW_MS = new Date('2026-07-23').getTime()

const SEED_WARRANTY_DATA = [
  { name: 'Sony FX3', serialNo: 'FX3-9941', category: 'Cameras', provider: 'Sony Pro Nepal', startDate: '2024-03-14', endDate: '2027-03-14', months: 36, cost: 18000, claims: 1, claimed: 42000, notes: 'Sensor cleaning and shutter calibration claimed at 14 months.' },
  { name: 'Sony FX6', serialNo: 'FX6-2004', category: 'Cameras', provider: 'Sony Pro Nepal', startDate: '2024-09-02', endDate: '2026-09-02', months: 24, cost: 24000, claims: 0, claimed: 0, notes: 'Full cinema coverage with priority loaner turnaround.' },
  { name: 'NiSi Athena Prime Set', serialNo: 'ATH-SET-6', category: 'Lenses', provider: 'NiSi Intl (via Cine Hub)', startDate: '2024-08-20', endDate: '2026-08-20', months: 24, cost: 15000, claims: 0, claimed: 0, notes: 'Optical alignment & barrel coating guarantee.' },
  { name: 'Sigma 18-35 T2 Cine', serialNo: 'SIG-1835-9', category: 'Lenses', provider: 'Sigma Distributor', startDate: '2023-01-10', endDate: '2028-01-10', months: 60, cost: 9000, claims: 0, claimed: 0, notes: '5-year manufacturer warranty with local agent.' },
  { name: 'Aputure 600x Pro', serialNo: 'AP-600X-02', category: 'Lighting', provider: 'Aputure APAC', startDate: '2024-07-30', endDate: '2026-07-30', months: 24, cost: 6500, claims: 1, claimed: 12000, notes: 'Ballast replacement handled by RMA courier.' },
  { name: 'Aputure MC Pro 4-Kit', serialNo: 'MC-KIT-4', category: 'Lighting', provider: 'Aputure APAC', startDate: '2025-05-18', endDate: '2027-05-18', months: 24, cost: 3000, claims: 0, claimed: 0, notes: 'Wireless charging case and internal cells covered.' },
  { name: 'DJI RS4 Pro', serialNo: 'RS4-7712', category: 'Grip', provider: 'DJI Care', startDate: '2025-08-05', endDate: '2026-08-05', months: 12, cost: 8000, claims: 2, claimed: 15500, notes: 'Gimbal motor replacement done under quick exchange.' },
  { name: 'Sennheiser MKH 416', serialNo: 'MKH-416-55', category: 'Audio', provider: 'Sennheiser APAC', startDate: '2019-02-01', endDate: '2029-02-01', months: 120, cost: 12000, claims: 0, claimed: 0, notes: '10-year factory capsule guarantee.' },
  { name: 'Atomos Ninja V+', serialNo: 'ATM-NV-88', category: 'Monitoring', provider: 'Atomos Care', startDate: '2023-12-11', endDate: '2026-12-11', months: 36, cost: 5500, claims: 0, claimed: 0, notes: 'Screen panel and ProRes RAW activation license.' },
  { name: 'Teradek Bolt 4K 750', serialNo: 'TDK-750-14', category: 'Wireless', provider: 'Teradek RMA', startDate: '2023-11-20', endDate: '2025-11-20', months: 24, cost: 14000, claims: 3, claimed: 61000, notes: 'High-wear RF module repaired twice in RMA hub.' },
]

function computeState(endDateStr: string): { state: WarrantyState; days: number } {
  const endMs = new Date(endDateStr).getTime()
  const days = Math.round((endMs - NOW_MS) / (1000 * 60 * 60 * 24))
  if (days < 0) return { state: 'Expired', days }
  if (days <= 60) return { state: 'Expiring', days }
  return { state: 'Active', days }
}

export function getWarrantyItems(): WarrantyItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WarrantyItem[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* fallback to seed */
  }

  return SEED_WARRANTY_DATA.map((d, i) => {
    const { state, days } = computeState(d.endDate)
    return {
      id: `WAR-${String(i + 1).padStart(2, '0')}`,
      name: d.name,
      serialNo: d.serialNo,
      category: d.category,
      provider: d.provider,
      startDate: d.startDate,
      endDate: d.endDate,
      termMonths: d.months,
      premiumCost: d.cost,
      claimsCount: d.claims,
      claimsRecovered: d.claimed,
      status: state,
      daysRemaining: days,
      notes: d.notes,
    }
  })
}

export function saveWarrantyItems(items: WarrantyItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function recordWarrantyClaim(id: string, amountRecovered: number, notes?: string): WarrantyItem[] {
  const all = getWarrantyItems()
  const idx = all.findIndex((w) => w.id === id)
  if (idx !== -1) {
    const existing = all[idx]
    if (existing) {
      all[idx] = {
        ...existing,
        claimsCount: existing.claimsCount + 1,
        claimsRecovered: existing.claimsRecovered + amountRecovered,
        notes: notes ? `${existing.notes ?? ''} [Claim: Rs ${amountRecovered}] ${notes}`.trim() : existing.notes,
      }
      saveWarrantyItems(all)
    }
  }
  return all
}

export interface WarrantyStats {
  totalPremiums: number
  totalRecovered: number
  expiringSoonCount: number
  expiredCount: number
  activeCount: number
  recoveryRatePct: number
}

export function getWarrantyStats(items: WarrantyItem[]): WarrantyStats {
  let totalPremiums = 0
  let totalRecovered = 0
  let expiringSoonCount = 0
  let expiredCount = 0
  let activeCount = 0

  for (const item of items) {
    totalPremiums += item.premiumCost
    totalRecovered += item.claimsRecovered
    if (item.status === 'Expiring') expiringSoonCount++
    else if (item.status === 'Expired') expiredCount++
    else activeCount++
  }

  const recoveryRatePct = totalPremiums > 0 ? Math.round((totalRecovered / totalPremiums) * 100) : 0

  return {
    totalPremiums,
    totalRecovered,
    expiringSoonCount,
    expiredCount,
    activeCount,
    recoveryRatePct,
  }
}
