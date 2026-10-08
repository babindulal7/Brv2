/**
 * Shift Handover — domain model and localStorage persistence.
 *
 * Ported from the standalone's shiftDefs / shiftLogData blocks.
 * Two shifts per day (A 06:00–15:00, B 14:00–22:00) with a mandatory
 * 14:00–15:00 overlap window where the checklist handover runs.
 */

// ── Checklist ────────────────────────────────────────────────────────

export interface ShiftCheckItem {
  key: string
  label: string
  hint: string
}

export const SHIFT_CHECKLIST: ShiftCheckItem[] = [
  { key: 'gear', label: 'Out-gear walked through', hint: '5 bookings out' },
  { key: 'cash', label: 'Cash drawer counted', hint: 'Rs 42,500 · match' },
  { key: 'keys', label: 'Keys & lockup handed over', hint: 'Warehouse + van' },
  { key: 'issues', label: 'Open issues briefed', hint: 'Teradek repair ETA' },
  { key: 'tomorrow', label: 'Tomorrow 6 AM pickups staged', hint: '2 bookings' },
]

// ── Handover log ─────────────────────────────────────────────────────

export type HandoverStatus = 'Complete' | 'Pending'
export type CashStatus = 'matched' | 'short' | 'over'

export interface HandoverRecord {
  id: number
  date: string        // display label, e.g. 'Today, 21 Jul'
  dateISO: string     // ISO date for sorting
  from: string        // e.g. 'Hari KC (A)'
  to: string          // e.g. 'Raju Thapa (B)'
  cashAmount: number
  cashStatus: CashStatus
  cashDisplay: string // e.g. 'Rs 18,400 · matched'
  checksCompleted: string // e.g. '5 / 5'
  status: HandoverStatus
  notes: string
}

const STORAGE_KEY = 'br.shiftHandovers'

const SEED_RECORDS: HandoverRecord[] = [
  {
    id: 0,
    date: 'Today, 21 Jul',
    dateISO: '2026-07-21',
    from: 'Hari KC (A)',
    to: 'Raju Thapa (B)',
    cashAmount: 18400,
    cashStatus: 'matched',
    cashDisplay: 'Rs 18,400 · matched',
    checksCompleted: '5 / 5',
    status: 'Pending',
    notes: 'Overlap window open — handover not yet confirmed.',
  },
  {
    id: 1,
    date: 'Yesterday, 20 Jul',
    dateISO: '2026-07-20',
    from: 'Raju Thapa (B)',
    to: 'Hari KC (A)',
    cashAmount: 21200,
    cashStatus: 'matched',
    cashDisplay: 'Rs 21,200 · matched',
    checksCompleted: '5 / 5',
    status: 'Complete',
    notes: 'Evening deliveries closed out clean, keys logged.',
  },
  {
    id: 2,
    date: '19 Jul',
    dateISO: '2026-07-19',
    from: 'Hari KC (A)',
    to: 'Raju Thapa (B)',
    cashAmount: 16800,
    cashStatus: 'short',
    cashDisplay: 'Rs 16,800 · short Rs 200',
    checksCompleted: '5 / 5',
    status: 'Complete',
    notes: 'Rs 200 short — logged as till variance, no action needed (under Rs 500 threshold).',
  },
  {
    id: 3,
    date: '18 Jul',
    dateISO: '2026-07-18',
    from: 'Raju Thapa (B)',
    to: 'Hari KC (A)',
    cashAmount: 19500,
    cashStatus: 'matched',
    cashDisplay: 'Rs 19,500 · matched',
    checksCompleted: '4 / 5',
    status: 'Complete',
    notes: 'Tomorrow-pickup staging skipped — flagged to manager, resolved next morning.',
  },
]

// ── CRUD ─────────────────────────────────────────────────────────────

export function getHandoverRecords(): HandoverRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as HandoverRecord[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* corrupt storage — fall through to seed */
  }
  return [...SEED_RECORDS]
}

export function saveHandoverRecords(records: HandoverRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function completeHandover(id: number, notes: string): HandoverRecord[] {
  const records = getHandoverRecords()
  const idx = records.findIndex((r) => r.id === id)
  const existing = records[idx]
  if (idx !== -1 && existing) {
    records[idx] = {
      ...existing,
      status: 'Complete',
      checksCompleted: '5 / 5',
      notes: notes || existing.notes,
    }
    saveHandoverRecords(records)
  }
  return records
}

// ── KPI stats ────────────────────────────────────────────────────────

export interface HandoverStats {
  handovers7d: number
  onTimeRate: string
  cashFlags: number
  checklistMisses: number
}

export function getHandoverStats(records: HandoverRecord[]): HandoverStats {
  const total = records.length
  const onTime = records.filter((r) => r.checksCompleted === '5 / 5').length
  const cashFlags = records.filter((r) => r.cashStatus === 'short' || r.cashStatus === 'over').length
  const misses = total - onTime

  return {
    handovers7d: total,
    onTimeRate: total > 0 ? Math.round((onTime / total) * 100) + '%' : '—',
    cashFlags,
    checklistMisses: misses,
  }
}
