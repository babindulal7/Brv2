import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../../components/ui/Icon'
import { TouchTarget } from '../../../components/ui/TouchTarget'
import {
  CalendarPopover,
  TimeListPopover,
  displayDate,
  parseDateInput,
  parseTimeInput,
} from '../../../components/ui/DateField'
import { toBs, formatBs } from '../../../lib/bs'

/**
 * redesign v1 §4 — typeable date + time, two separate 44×44 icon buttons,
 * BS rendered above the AD value, default time never blank. The rental day
 * runs 06:00→06:00 (Foundation), so a booking with no time cannot be priced
 * correctly at the boundary — this replaced the bare `<input type="date">`
 * NewRental used before, which had no time component at all.
 *
 * ## The calendar moved out, 4 Sep 2026
 *
 * The month grid, the time list and the date/time parsers used to live in this
 * file, which meant the app's only real date picker was reachable from exactly
 * one screen while 24 other date inputs across 13 files fell back to the
 * browser's native control — and a native control cannot render a BS date at
 * all (Law 9 §9.4).
 *
 * They now live in `components/ui/DateField`, and this file composes them.
 * Nothing about the rendered field changed; the parsers are re-exported below
 * because `booking/index.ts` publishes them and tests import them from here.
 */

export { parseDateInput, parseTimeInput }

/*
 * ⚠ KNOWN, pre-existing: the calendar and timer buttons are 26px wide and share
 * an edge, so two 44px-wide targets cannot both fit inside 52px of space.
 * RESOLVED 25 Aug 2026 by taking only the axis that is free — both use
 * `<TouchTarget axis="y" />`, giving a full 44px vertical target at the
 * control's own 26px width, with no overlap and neither button able to steal
 * the other's glyph. Closing the width gap needs a layout change (widen the
 * field, or collapse the two pickers into one), which is a design decision
 * about this field rather than something a hit-area pass should force.
 * 26×44 with no mis-fire beats 44×44 with one.
 */
const iconBtnStyle = {
  position: 'relative' as const,
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
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelAdjusted = useRef(false)
  /* Floating position of the portaled popups. The New Rental sections clip
     overflow (`new-rental-section-card`), so inline absolute popups get cut —
     the portal wrapper is a viewport-positioned box matching the field, and
     the inner absolute panels resolve against it. */
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const measurePanel = () => {
    const el = rootRef.current
    if (!el) return
    panelAdjusted.current = false
    const r = el.getBoundingClientRect()
    const panelW = Math.min(360, window.innerWidth - 24)
    setPanelPos({
      top: r.bottom,
      left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - panelW - 8)),
      width: Math.max(r.width, 120),
    })
  }

  useEffect(() => {
    if (!calendarOpen && !timeListOpen) {
      panelAdjusted.current = false
      return
    }
    measurePanel()
    window.addEventListener('scroll', measurePanel, true)
    window.addEventListener('resize', measurePanel)
    return () => {
      window.removeEventListener('scroll', measurePanel, true)
      window.removeEventListener('resize', measurePanel)
    }
  }, [calendarOpen, timeListOpen])

  /* Pull up when the panel would run past the viewport bottom. */
  useLayoutEffect(() => {
    if ((!calendarOpen && !timeListOpen) || !panelPos || panelAdjusted.current) return
    const panel = panelRef.current?.firstElementChild as HTMLElement | null
    if (!panel) return
    const overflow = panel.getBoundingClientRect().bottom - window.innerHeight + 8
    if (overflow > 0) {
      panelAdjusted.current = true
      setPanelPos((p) => (p ? { ...p, top: Math.max(8, p.top - overflow) } : p))
    }
  }, [calendarOpen, timeListOpen, panelPos])

  useEffect(() => setDateText(displayDate(dateValue)), [dateValue])
  useEffect(() => setTimeText(timeValue), [timeValue])

  useEffect(() => {
    if (!calendarOpen && !timeListOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      // Popups are portaled to document.body — a pointer inside them is
      // logically inside, even though outside `rootRef` in the DOM.
      if (panelRef.current?.contains(target)) return
      if (!rootRef.current?.contains(target)) {
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
      {/* 01_NEW_RENTAL §1.1 DATES box — "BS above AD on both". The wireframe and
          Foundation §3.2's "BS leads AD" put it first, so it sits above the
          input rather than under it. `lib/bs.ts` is the one Date Engine: nothing
          here computes a BS date, and outside the month that engine vouches for
          it says so instead of rendering a plausible one. */}
      <div
        className="figure"
        style={{ marginBottom: 3, fontSize: 'var(--t-th)', fontWeight: 700, color: bs ? 'var(--text)' : 'var(--muted)' }}
      >
        {bs ? formatBs(bs) : 'BS not available for this date'}
      </div>
      <div className="focus-host" style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--input-border)', borderRadius: 'var(--r-input)', background: 'var(--input-bg)', padding: '0 4px 0 9px', minHeight: 40 }}>
        <input
          value={dateText}
          onChange={(e) => setDateText(e.target.value)}
          onBlur={(e) => commitDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          onClick={() => {
            // Tapping the date box opens the calendar — the icon is a second
            // way in, not the only one.
            setTimeListOpen(false)
            setCalendarOpen(true)
          }}
          aria-label={`${label} date`}
          style={{ flex: '1 1 auto', minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          type="button"
          className="press"
          aria-label={`Open calendar for ${label}`}
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
          onClick={() => {
            setCalendarOpen((o) => !o)
            setTimeListOpen(false)
          }}
          style={iconBtnStyle}
        >
          <TouchTarget axis="y" />
          <Icon name="calendar_event" size={15} />
        </button>
        <input
          value={timeText}
          onChange={(e) => setTimeText(e.target.value)}
          onBlur={(e) => commitTime(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label={`${label} time`}
          style={{ width: 46, flexShrink: 0, border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', textAlign: 'center', paddingLeft: 7 }}
        />
        <button
          type="button"
          className="press"
          aria-label={`Open time picker for ${label}`}
          aria-haspopup="listbox"
          aria-expanded={timeListOpen}
          onClick={() => {
            setTimeListOpen((o) => !o)
            setCalendarOpen(false)
          }}
          style={iconBtnStyle}
        >
          <TouchTarget axis="y" />
          <Icon name="timer" size={15} />
        </button>
      </div>
      {error && <span role="alert" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', marginTop: 3 }}>{error}</span>}

      {(calendarOpen || timeListOpen) && panelPos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, width: panelPos.width, height: 0, zIndex: 'var(--z-dropdown)' }}>
          {calendarOpen && (
        <CalendarPopover
          value={dateValue}
          onSelect={(v) => {
            onDateChange(v)
            setCalendarOpen(false)
            // Chained flow: once the day is set, the time list opens on its
            // own so the operator never hunts for the second picker.
            setTimeListOpen(true)
          }}
          onDismiss={() => setCalendarOpen(false)}
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
        </div>,
        document.body,
      )}
    </div>
  )
}
