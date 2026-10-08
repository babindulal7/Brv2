import { toAd, fiscalYear } from './bs'

export type DatePresetKey =
  | 'all_time'
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'this_week'
  | 'last_week'
  | 'next_week'
  | 'this_month'
  | 'last_month'
  | 'next_month'
  | 'this_year'
  | 'last_year'
  | 'next_year'
  | 'next_7_days'
  | 'this_fiscal_year'
  | 'last_fiscal_year'

export interface DateRangeResult {
  from: string
  to: string
  label: string
}

export interface PresetGroup {
  name: string
  presets: Array<{ key: DatePresetKey; label: string }>
}

export const PRESET_GROUPS: PresetGroup[] = [
  {
    name: 'General',
    presets: [{ key: 'all_time', label: 'All time' }],
  },
  {
    name: 'Days',
    presets: [
      { key: 'today', label: 'Today' },
      { key: 'yesterday', label: 'Yesterday' },
      { key: 'tomorrow', label: 'Tomorrow' },
      { key: 'next_7_days', label: 'Next 7 days' },
    ],
  },
  {
    name: 'Weeks',
    presets: [
      { key: 'this_week', label: 'This week' },
      { key: 'last_week', label: 'Last week' },
      { key: 'next_week', label: 'Next week' },
    ],
  },
  {
    name: 'Months',
    presets: [
      { key: 'this_month', label: 'This month' },
      { key: 'last_month', label: 'Last month' },
      { key: 'next_month', label: 'Next month' },
    ],
  },
  {
    name: 'Years',
    presets: [
      { key: 'this_year', label: 'This year' },
      { key: 'last_year', label: 'Last year' },
      { key: 'next_year', label: 'Next year' },
    ],
  },
  {
    name: 'Nepal Fiscal (BS)',
    presets: [
      { key: 'this_fiscal_year', label: 'This fiscal year' },
      { key: 'last_fiscal_year', label: 'Last fiscal year' },
    ],
  },
]

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function isoDay(d: Date): string {
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function parseUtcDay(dayStr: string): Date {
  const [y, m, d] = dayStr.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function shiftDay(dayStr: string, offsetDays: number): string {
  const dt = parseUtcDay(dayStr)
  dt.setUTCDate(dt.getUTCDate() + offsetDays)
  return isoDay(dt)
}

/**
 * Computes date range for a Booqable preset from a given anchor day ('YYYY-MM-DD').
 */
export function computeDatePreset(key: DatePresetKey, anchorDay: string): DateRangeResult {
  const d = parseUtcDay(anchorDay)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()

  switch (key) {
    case 'all_time':
      return { from: '', to: '', label: 'All time' }

    case 'today':
      return { from: anchorDay, to: anchorDay, label: 'Today' }

    case 'yesterday': {
      const p = shiftDay(anchorDay, -1)
      return { from: p, to: p, label: 'Yesterday' }
    }

    case 'tomorrow': {
      const n = shiftDay(anchorDay, 1)
      return { from: n, to: n, label: 'Tomorrow' }
    }

    case 'next_7_days': {
      return { from: anchorDay, to: shiftDay(anchorDay, 6), label: 'Next 7 days' }
    }

    case 'this_week': {
      // Booqable §1: week starts Sunday (or according to regional setting)
      const dayOfWeek = d.getUTCDay() // 0 = Sun, 6 = Sat
      const start = shiftDay(anchorDay, -dayOfWeek)
      const end = shiftDay(start, 6)
      return { from: start, to: end, label: 'This week' }
    }

    case 'last_week': {
      const dayOfWeek = d.getUTCDay()
      const thisSunday = shiftDay(anchorDay, -dayOfWeek)
      const start = shiftDay(thisSunday, -7)
      const end = shiftDay(start, 6)
      return { from: start, to: end, label: 'Last week' }
    }

    case 'next_week': {
      const dayOfWeek = d.getUTCDay()
      const thisSunday = shiftDay(anchorDay, -dayOfWeek)
      const start = shiftDay(thisSunday, 7)
      const end = shiftDay(start, 6)
      return { from: start, to: end, label: 'Next week' }
    }

    case 'this_month': {
      const start = isoDay(new Date(Date.UTC(y, m, 1)))
      const end = isoDay(new Date(Date.UTC(y, m + 1, 0)))
      return { from: start, to: end, label: 'This month' }
    }

    case 'last_month': {
      const start = isoDay(new Date(Date.UTC(y, m - 1, 1)))
      const end = isoDay(new Date(Date.UTC(y, m, 0)))
      return { from: start, to: end, label: 'Last month' }
    }

    case 'next_month': {
      const start = isoDay(new Date(Date.UTC(y, m + 1, 1)))
      const end = isoDay(new Date(Date.UTC(y, m + 2, 0)))
      return { from: start, to: end, label: 'Next month' }
    }

    case 'this_year': {
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: 'This year' }
    }

    case 'last_year': {
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: 'Last year' }
    }

    case 'next_year': {
      return { from: `${y + 1}-01-01`, to: `${y + 1}-12-31`, label: 'Next year' }
    }

    case 'this_fiscal_year': {
      const fy = fiscalYear(d)
      if (fy) {
        return { from: isoDay(fy.startAd), to: isoDay(fy.endAd), label: `FY ${fy.label}` }
      }
      return { from: `${y}-07-16`, to: `${y + 1}-07-15`, label: 'This fiscal year' }
    }

    case 'last_fiscal_year': {
      const fy = fiscalYear(d)
      if (fy) {
        const prevStartBsYear = fy.startBsYear - 1
        const prevStartAd = toAd({ year: prevStartBsYear, month: 4, day: 1 })
        const prevEndAd = new Date(fy.startAd.getTime() - 86400000)
        if (prevStartAd) {
          const shortNext = String(fy.startBsYear % 100).padStart(2, '0')
          return { from: isoDay(prevStartAd), to: isoDay(prevEndAd), label: `FY ${prevStartBsYear}/${shortNext}` }
        }
      }
      return { from: `${y - 1}-07-16`, to: `${y}-07-15`, label: 'Last fiscal year' }
    }
  }
}
