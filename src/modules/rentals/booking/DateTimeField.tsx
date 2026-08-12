import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../../components/ui/Icon'
import { toBs, formatBs, formatAd, BS_MONTHS } from '../../../lib/bs'

/**
 * redesign v1 §4 — typeable date + time, two separate 44×44 icon buttons,
 * BS rendered under the AD value, default time never blank. The rental day
 * runs 06:00→06:00 (Foundation), so a booking with no time cannot be priced
 * correctly at the boundary — this replaces the bare `<input type="date">`
 * NewRental.tsx used before, which had no time component at all.
 *
 * No date-picker or BS-calendar component existed anywhere in the repo
 * before this one (confirmed by search) — `lib/bs.ts`'s `toBs`/`formatBs`
 * are the only reusable pieces; everything else here is new.
 */

const TOUCH = 44
const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function normalizeDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  // Date rolls over an invalid day (e.g. 31 Feb) into the next month — catching
  // that here is what stops "31/02/2026" silently becoming a March date.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y.toString().padStart(4, '0')}-${pad2(mo)}-${pad2(d)}`
}

/** '2026-07-16' | '16/07/2026' | '16 Jul 2026' → 'YYYY-MM-DD', or null. */
export function parseDateInput(text: string): string | null {
  const s = text.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return normalizeDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (m) return normalizeDate(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(s)
  if (m) {
    const idx = MONTH_ABBR.indexOf(m[2]!.slice(0, 3).toLowerCase())
    if (idx === -1) return null
    return normalizeDate(Number(m[3]), idx + 1, Number(m[1]))
  }
  return null
}

function clampTime(h: number, mi: number): string | null {
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return `${pad2(h)}:${pad2(mi)}`
}

/** '0900' | '9:00' | '09:00' → 'HH:mm', or null. */
export function parseTimeInput(text: string): string | null {
  const s = text.trim()
  if (!s) return null
  let m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (m) return clampTime(Number(m[1]), Number(m[2]))
  m = /^(\d{3,4})$/.exec(s)
  if (m) {
    const raw = m[1]!.padStart(4, '0')
    return clampTime(Number(raw.slice(0, 2)), Number(raw.slice(2)))
  }
  return null
}

function displayDate(v: string): string {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : formatAd(d)
}

/** Same shape as `NewRental.tsx`'s private `TouchInset` — not exported from
 *  that module, so re-declaring nine lines here beats widening its surface. */
function TouchInset() {
  return (
    <span
      aria-hidden="true"
      style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: `max(100%, ${TOUCH}px)`, height: TOUCH }}
    />
  )
}

const iconBtnStyle: CSSProperties = {
  position: 'relative',
  flexShrink: 0,
  width: 26,
  height: 26,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--r-xs)',
  border: 'none',
  background: 'transparent',
  color: 'var(--text2)',
  cursor: 'pointer',
}

function CalendarPopover({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const initial = Number.isNaN(Date.parse(value)) ? new Date() : new Date(value)
  const [viewYear, setViewYear] = useState(initial.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getUTCMonth())

  const first = new Date(Date.UTC(viewYear, viewMonth, 1))
  const startWeekday = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate()
  const cells: Array<{ ad: Date; iso: string } | null> = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const ad = new Date(Date.UTC(viewYear, viewMonth, i + 1))
      return { ad, iso: `${viewYear.toString().padStart(4, '0')}-${pad2(viewMonth + 1)}-${pad2(i + 1)}` }
    }),
  ]
  const monthBs = toBs(new Date(Date.UTC(viewYear, viewMonth, 15)))

  return (
    <div
      role="dialog"
      aria-label="Choose a date"
      style={{
        position: 'absolute',
        zIndex: 40,
        top: 'calc(100% + 6px)',
        left: 0,
        width: 260,
        padding: 10,
        background: 'var(--dropdown)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" className="press" aria-label="Previous month" onClick={() => setViewMonth((m) => (m === 0 ? (setViewYear((y) => y - 1), 11) : m - 1))} style={iconBtnStyle}>
          <TouchInset />
          <Icon name="chevron_left" size={14} />
        </button>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          {monthBs && <span style={{ display: 'block', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{BS_MONTHS[monthBs.month - 1]} {monthBs.year} BS</span>}
        </span>
        <button type="button" className="press" aria-label="Next month" onClick={() => setViewMonth((m) => (m === 11 ? (setViewYear((y) => y + 1), 0) : m + 1))} style={iconBtnStyle}>
          <TouchInset />
          <Icon name="chevron_right" size={14} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, fontSize: 'var(--t-th)', color: 'var(--muted)', textAlign: 'center', marginBottom: 3 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((c, i) => {
          if (!c) return <span key={`empty-${i}`} />
          const selected = c.iso === value
          const bs = toBs(c.ad)
          return (
            <button
              key={c.iso}
              type="button"
              className="press"
              onClick={() => onSelect(c.iso)}
              style={{
                position: 'relative',
                minHeight: 34,
                padding: '2px 0',
                borderRadius: 'var(--r-xs)',
                border: 'none',
                background: selected ? 'var(--btn-primary-bg)' : 'transparent',
                color: selected ? 'var(--btn-primary-fg)' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>{c.ad.getUTCDate()}</span>
              {/* the BS engine only vouches for one anchor month — an honest
                  blank here beats a fabricated BS day outside it (lib/bs.ts). */}
              <span className="figure" style={{ fontSize: 9, opacity: 0.75 }}>{bs ? bs.day : ' '}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimeListPopover({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const times = Array.from({ length: 48 }, (_, i) => `${pad2(Math.floor(i / 2))}:${i % 2 === 0 ? '00' : '30'}`)
  return (
    <div
      role="listbox"
      aria-label="Choose a time"
      style={{
        position: 'absolute',
        zIndex: 40,
        top: 'calc(100% + 6px)',
        right: 0,
        width: 110,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 4,
        background: 'var(--dropdown)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      {times.map((t) => {
        const selected = t === value
        return (
          <button
            key={t}
            type="button"
            role="option"
            aria-selected={selected}
            className="press"
            onClick={() => onSelect(t)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: 30,
              padding: '0 9px',
              border: 'none',
              borderRadius: 'var(--r-xs)',
              background: selected ? 'var(--btn-primary-bg)' : 'transparent',
              color: selected ? 'var(--btn-primary-fg)' : 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: selected ? 700 : 400,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

export interface DateTimeFieldProps {
  label: string
  /** 'YYYY-MM-DD' */
  dateValue: string
  /** 'HH:mm' — never blank; callers seed a default (09:00 pickup / 18:00 return per redesign v1 §4). */
  timeValue: string
  onDateChange: (v: string) => void
  onTimeChange: (v: string) => void
  error?: string | undefined
}

export function DateTimeField({ label, dateValue, timeValue, onDateChange, onTimeChange, error }: DateTimeFieldProps) {
  const [dateText, setDateText] = useState(() => displayDate(dateValue))
  const [timeText, setTimeText] = useState(timeValue)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [timeListOpen, setTimeListOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setDateText(displayDate(dateValue)), [dateValue])
  useEffect(() => setTimeText(timeValue), [timeValue])

  useEffect(() => {
    if (!calendarOpen && !timeListOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) {
        setCalendarOpen(false)
        setTimeListOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCalendarOpen(false)
        setTimeListOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [calendarOpen, timeListOpen])

  const adDate = Number.isNaN(Date.parse(dateValue)) ? null : new Date(dateValue)
  const bs = adDate ? toBs(adDate) : null

  const commitDate = (text: string) => {
    const parsed = parseDateInput(text)
    if (parsed) onDateChange(parsed)
    else setDateText(displayDate(dateValue))
  }
  // Never blank — an unparseable time reverts to the last good value rather
  // than silently becoming midnight (redesign v1 §4).
  const commitTime = (text: string) => {
    const parsed = parseTimeInput(text) ?? timeValue
    onTimeChange(parsed)
    setTimeText(parsed)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>{label}</span>
      {/* 01_NEW_RENTAL §1.1 DATES box — "BS above AD on both". The BS line was
          below the field; the wireframe (and Foundation §3.2's "BS leads AD")
          put it first, so it moved above the input rather than being duplicated.
          `lib/bs.ts` is the one Date Engine — nothing here computes a BS date,
          and outside the month that engine vouches for it says so instead of
          rendering a plausible one. */}
      <div
        className="figure"
        style={{ marginBottom: 3, fontSize: 'var(--t-th)', fontWeight: 700, color: bs ? 'var(--text)' : 'var(--muted)' }}
      >
        {bs ? formatBs(bs) : 'BS not available for this date'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--input-border)', borderRadius: 'var(--r-input)', background: 'var(--input-bg)', padding: '0 4px 0 9px', minHeight: 40 }}>
        <input
          value={dateText}
          onChange={(e) => setDateText(e.target.value)}
          onBlur={(e) => commitDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label={`${label} date`}
          style={{ flex: '1 1 auto', minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
        />
        <input
          value={timeText}
          onChange={(e) => setTimeText(e.target.value)}
          onBlur={(e) => commitTime(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label={`${label} time`}
          style={{ width: 46, flexShrink: 0, border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none', textAlign: 'center', paddingLeft: 7 }}
        />
        <button
          type="button"
          className="press"
          aria-label={`Open calendar for ${label}`}
          onClick={() => {
            setCalendarOpen((o) => !o)
            setTimeListOpen(false)
          }}
          style={iconBtnStyle}
        >
          <TouchInset />
          <Icon name="calendar_event" size={15} />
        </button>
        <button
          type="button"
          className="press"
          aria-label={`Open time picker for ${label}`}
          onClick={() => {
            setTimeListOpen((o) => !o)
            setCalendarOpen(false)
          }}
          style={iconBtnStyle}
        >
          <TouchInset />
          <Icon name="timer" size={15} />
        </button>
      </div>
      {error && <span role="alert" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', marginTop: 3 }}>{error}</span>}

      {calendarOpen && (
        <CalendarPopover
          value={dateValue}
          onSelect={(v) => {
            onDateChange(v)
            setCalendarOpen(false)
          }}
        />
      )}
      {timeListOpen && (
        <TimeListPopover
          value={timeValue}
          onSelect={(v) => {
            onTimeChange(v)
            setTimeListOpen(false)
          }}
        />
      )}
    </div>
  )
}
