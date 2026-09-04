import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from './Icon'
import { TouchTarget } from './TouchTarget'
import { toBs, formatBs, formatAd, BS_MONTHS } from '../../lib/bs'

/**
 * # The one date picker
 *
 * ## Why this file exists
 *
 * A complete calendar popover — month grid, BS sub-digits, month navigation —
 * already existed, but it lived inside `modules/rentals/booking/DateTimeField`
 * and only New Rental could reach it. Everywhere else the app fell back to a
 * bare `<input type="date">`: **24 of them across 13 files**, each rendering
 * whatever calendar the browser happens to ship, in the browser's locale, with
 * no BS date anywhere near it.
 *
 * That is a Law 9 problem before it is a consistency problem. §9.4 puts BS
 * above AD, and a native date input cannot show a BS date at all — so on two
 * dozen screens the Nepali date simply was not there.
 *
 * This module is that popover, lifted out and made shared. `DateTimeField`
 * now imports from here rather than carrying its own copy, so there is exactly
 * one calendar implementation in the app.
 *
 * ## What it does not do
 *
 * It does not compute BS dates. `lib/bs.ts` is the one Date Engine, and it
 * currently vouches for **Shrawan 2083 only** — its own header says a full
 * 2080–2090 month-length table has to land before it can do more, and
 * `RULINGS-2026-09-04.md` R-00 says the authoritative 2078–2095 table produced
 * on 16 Aug must be **ported, not re-sourced**. So outside that one month the
 * grid leaves the BS sub-digit blank and the field says so in words. A
 * fabricated BS day would be worse than a missing one: it is the date a Nepali
 * client reads on an invoice.
 */

/* ── parsing ─────────────────────────────────────────────────────────────── */

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function normalizeDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  // `Date` rolls an invalid day over into the next month — catching that here
  // is what stops "31/02/2026" silently becoming a March date.
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

/** ISO day → '16 Jul 2026'. Unparseable text is handed back untouched. */
export function displayDate(v: string): string {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : formatAd(d)
}

/** Today as an ISO day, in Kathmandu civil terms via the Date Engine's own AD helper. */
function todayIso(): string {
  const now = new Date()
  return `${now.getUTCFullYear().toString().padStart(4, '0')}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`
}

function isoOf(d: Date): string {
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoOf(d)
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  // Clamp rather than roll: 31 Jan + 1 month is 28/29 Feb, not 2/3 Mar.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return isoOf(d)
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

const popoverStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 40,
  top: 'calc(100% + 6px)',
  padding: 10,
  background: 'var(--dropdown)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-modal)',
}

/* ── the calendar ────────────────────────────────────────────────────────── */

export interface CalendarPopoverProps {
  /** 'YYYY-MM-DD', or '' when nothing is chosen. */
  value: string
  onSelect: (v: string) => void
  /** Closes without choosing. Escape and a click outside both route here. */
  onDismiss: () => void
  /** Offers "Clear" — a range bound can be unset; a required date cannot. */
  clearable?: boolean
  /** Anchors the popover to the right edge, for a control near the viewport edge. */
  align?: 'left' | 'right'
}

/**
 * A month grid with the BS day under each AD day.
 *
 * **Keyboard.** The grid is a roving-tabindex: one day holds tab focus and the
 * arrows move it (day, week, month via PageUp/PageDown, Home/End for the
 * month's ends). This is the half the previous version did not have — a
 * calendar reachable only by mouse is one a keyboard user cannot use at all,
 * and the day cells were already `<button>`s, so it was 30 lines away.
 */
export function CalendarPopover({ value, onSelect, onDismiss, clearable, align = 'left' }: CalendarPopoverProps) {
  const today = todayIso()
  const anchor = value && !Number.isNaN(Date.parse(value)) ? value : today
  const [cursor, setCursor] = useState(anchor)
  const gridRef = useRef<HTMLDivElement | null>(null)
  /* Focus follows the cursor only after a key moves it — opening the popover
     should not yank focus off the field the operator is typing in. */
  const movedByKey = useRef(false)

  const cursorDate = new Date(`${cursor}T00:00:00.000Z`)
  const viewYear = cursorDate.getUTCFullYear()
  const viewMonth = cursorDate.getUTCMonth()

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(viewYear, viewMonth, 1))
    const startWeekday = first.getUTCDay()
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate()
    return [
      ...Array.from({ length: startWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const ad = new Date(Date.UTC(viewYear, viewMonth, i + 1))
        return { ad, iso: isoOf(ad) }
      }),
    ] as Array<{ ad: Date; iso: string } | null>
  }, [viewYear, viewMonth])

  useLayoutEffect(() => {
    if (!movedByKey.current) return
    movedByKey.current = false
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus()
  }, [cursor])

  /*
   * The BS month label, derived from the first day in the grid the engine can
   * actually place.
   *
   * This used to probe the 15th, which reads correctly only when a whole AD
   * month sits inside one BS month — and no AD month does. Driving it on 4 Sep
   * showed the failure plainly: July 2026 rendered "BS not available" in the
   * header while sixteen of its own day cells carried a Shrawan 2083 sub-digit.
   * The header contradicted the grid directly underneath it.
   *
   * Taking the first day that resolves means the label describes the BS month
   * the operator can actually see in the grid, and still says "not available"
   * only when genuinely no day in view has one.
   */
  const monthBs = (() => {
    for (const c of cells) {
      if (!c) continue
      const bs = toBs(c.ad)
      if (bs) return bs
    }
    return null
  })()
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const move = (days: number) => {
    movedByKey.current = true
    setCursor((c) => addDaysIso(c, days))
  }
  const moveMonths = (months: number) => {
    movedByKey.current = true
    setCursor((c) => addMonthsIso(c, months))
  }

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); move(-1); break
      case 'ArrowRight': e.preventDefault(); move(1); break
      case 'ArrowUp': e.preventDefault(); move(-7); break
      case 'ArrowDown': e.preventDefault(); move(7); break
      case 'PageUp': e.preventDefault(); moveMonths(-1); break
      case 'PageDown': e.preventDefault(); moveMonths(1); break
      case 'Home': {
        e.preventDefault()
        movedByKey.current = true
        setCursor(isoOf(new Date(Date.UTC(viewYear, viewMonth, 1))))
        break
      }
      case 'End': {
        e.preventDefault()
        movedByKey.current = true
        setCursor(isoOf(new Date(Date.UTC(viewYear, viewMonth + 1, 0))))
        break
      }
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect(cursor)
        break
      default:
        break
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Choose a date"
      style={{ ...popoverStyle, width: 268, ...(align === 'right' ? { right: 0 } : { left: 0 }) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 4 }}>
        <button type="button" className="press" aria-label="Previous month" onClick={() => moveMonths(-1)} style={iconBtnStyle}>
          <TouchTarget axis="y" />
          <Icon name="chevron_left" size={14} />
        </button>
        <span style={{ textAlign: 'center', lineHeight: 1.25 }}>
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{monthLabel}</span>
          {/* Law 9 — the BS month leads, where the engine can vouch for it. */}
          <span style={{ display: 'block', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>
            {monthBs ? `${BS_MONTHS[monthBs.month - 1]} ${monthBs.year} BS` : 'BS not available'}
          </span>
        </span>
        <button type="button" className="press" aria-label="Next month" onClick={() => moveMonths(1)} style={iconBtnStyle}>
          <TouchTarget axis="y" />
          <Icon name="chevron_right" size={14} />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7,1fr)',
          gap: 2,
          fontSize: 'var(--t-th)',
          color: 'var(--muted)',
          textAlign: 'center',
          marginBottom: 3,
        }}
        aria-hidden="true"
      >
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d}>{d}</span>)}
      </div>

      {/* The key handler sits on the grid rather than on each cell: the arrows
          move the roving tabindex between cells, so the container is the only
          element that sees every key regardless of which day holds focus. */}
      <div ref={gridRef} role="grid" onKeyDown={onGridKeyDown} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((c, i) => {
          if (!c) return <span key={`empty-${i}`} role="presentation" />
          const selected = c.iso === value
          const isCursor = c.iso === cursor
          const isToday = c.iso === today
          const bs = toBs(c.ad)
          return (
            <button
              key={c.iso}
              type="button"
              role="gridcell"
              className="press"
              tabIndex={isCursor ? 0 : -1}
              aria-selected={selected}
              {...(isToday ? { 'aria-current': 'date' as const } : {})}
              aria-label={formatAd(c.ad)}
              onClick={() => onSelect(c.iso)}
              style={{
                position: 'relative',
                minHeight: 34,
                padding: '2px 0',
                borderRadius: 'var(--r-xs)',
                /* Law 11 — never colour alone. Today carries an outline as well
                   as its tint, so it is still distinguishable in monochrome and
                   for a red-green colour-blind operator. */
                border: isToday && !selected ? '1px solid var(--primary)' : '1px solid transparent',
                background: selected ? 'var(--btn-primary-bg)' : 'transparent',
                color: selected ? 'var(--btn-primary-fg)' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: selected || isToday ? 700 : 500 }}>
                {c.ad.getUTCDate()}
              </span>
              {/* The engine vouches for one month only — an honest blank beats a
                  fabricated BS day outside it. See the header. */}
              <span className="figure" style={{ fontSize: 9, opacity: 0.75, minHeight: 11 }}>{bs ? bs.day : ''}</span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'space-between' }}>
        <button
          type="button"
          className="press"
          onClick={() => onSelect(today)}
          style={{
            position: 'relative',
            padding: '5px 10px',
            borderRadius: 'var(--r-xs)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <TouchTarget axis="y" />
          Today
        </button>
        {clearable && (
          <button
            type="button"
            className="press"
            onClick={() => onSelect('')}
            style={{
              position: 'relative',
              padding: '5px 10px',
              borderRadius: 'var(--r-xs)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <TouchTarget axis="y" />
            Clear
          </button>
        )}
        <button
          type="button"
          className="press"
          onClick={onDismiss}
          style={{
            position: 'relative',
            padding: '5px 10px',
            borderRadius: 'var(--r-xs)',
            border: 'none',
            background: 'transparent',
            color: 'var(--text2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <TouchTarget axis="y" />
          Close
        </button>
      </div>
    </div>
  )
}

/* ── the time list ───────────────────────────────────────────────────────── */

export interface TimeListPopoverProps {
  /** 'HH:mm'. */
  value: string
  onSelect: (v: string) => void
  /** Minutes between entries. 30 gives the 48 half-hours the booking form uses. */
  stepMinutes?: number
}

/**
 * Half-hour slots by default. Scrolls the selected entry into view on open —
 * a 48-item list that opens at midnight when the value is 18:00 is a list the
 * operator has to hunt through every time.
 */
export function TimeListPopover({ value, onSelect, stepMinutes = 30 }: TimeListPopoverProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const times = useMemo(() => {
    const perDay = Math.max(1, Math.floor((24 * 60) / stepMinutes))
    return Array.from({ length: perDay }, (_, i) => {
      const total = i * stepMinutes
      return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
    })
  }, [stepMinutes])

  useLayoutEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (selected) selected.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Choose a time"
      style={{ ...popoverStyle, right: 0, width: 110, maxHeight: 220, overflowY: 'auto', padding: 4 }}
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

/* ── the field ───────────────────────────────────────────────────────────── */

export interface DateFieldProps {
  /** 'YYYY-MM-DD', or '' when unset. */
  value: string
  onChange: (v: string) => void
  /**
   * Accessible name. Required, not optional: most of these sit in filter bars
   * with no visible label, and `Input`'s own id-from-label trick collides when
   * two fields share a label ("From"/"To" appear on nine screens).
   */
  ariaLabel: string
  /** Optional visible label rendered above the control. */
  label?: string
  /**
   * Merged onto the control's **shell**, after the defaults, so a toolbar keeps
   * its own metrics — the existing call sites all pass shell-level styling
   * (`minHeight`, `border`, `background`), which is why this lands there rather
   * than on the inner input.
   */
  style?: CSSProperties
  /**
   * Render the BS line above the value (Law 9 §9.4). Default true.
   *
   * Passed `false` only on **filter and range bars**, where the control is a
   * query bound rather than a business date being shown to the operator — and
   * where, because the Date Engine covers one month, it would otherwise print
   * "BS not available for this date" twice on every screen. The BS date is
   * still in the calendar popover. If that reading of §9.4 is wrong, this is
   * the one flag to flip.
   */
  showBs?: boolean
  /** Offers Clear in the popover and permits '' — for a range bound. */
  clearable?: boolean
  /** Anchor the popover to the control's right edge. */
  align?: 'left' | 'right'
  error?: string | undefined
  disabled?: boolean
  id?: string
  placeholder?: string
}

/**
 * A typeable date with a calendar button, replacing `<input type="date">`.
 *
 * Typing still works and accepts the three shapes people actually use
 * (`2026-07-16`, `16/07/2026`, `16 Jul 2026`); the calendar is for picking.
 * An unparseable entry reverts on blur rather than clearing the field — losing
 * a date because it was mistyped is worse than keeping the old one.
 */
export function DateField({
  value,
  onChange,
  ariaLabel,
  label,
  style,
  showBs = true,
  clearable = false,
  align = 'left',
  error,
  disabled = false,
  id,
  placeholder = 'dd/mm/yyyy',
}: DateFieldProps) {
  const [text, setText] = useState(() => displayDate(value))
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => setText(displayDate(value)), [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const adDate = value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null
  const bs = adDate ? toBs(adDate) : null

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      // Only a clearable field may become empty; otherwise the last good value
      // stands, which is what stops a stray Backspace wiping a required date.
      if (clearable) onChange('')
      else setText(displayDate(value))
      return
    }
    const parsed = parseDateInput(trimmed)
    if (parsed) onChange(parsed)
    else setText(displayDate(value))
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 0 }}>
      {label && (
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>
          {label}
        </span>
      )}
      {showBs && (
        <div
          className="figure"
          style={{ marginBottom: 3, fontSize: 'var(--t-th)', fontWeight: 700, color: bs ? 'var(--text)' : 'var(--muted)' }}
        >
          {bs ? formatBs(bs) : value ? 'BS not available for this date' : '—'}
        </div>
      )}
      <div
        className="focus-host"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          border: `1px solid var(${error ? '--danger' : '--input-border'})`,
          borderRadius: 'var(--r-input)',
          background: 'var(--input-bg)',
          padding: '0 4px 0 9px',
          minHeight: 40,
          opacity: disabled ? 0.6 : 1,
          ...style,
        }}
      >
        <input
          id={id}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label={ariaLabel}
          {...(error ? { 'aria-invalid': true } : {})}
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          ref={buttonRef}
          type="button"
          className="press"
          disabled={disabled}
          aria-label={`Open calendar for ${ariaLabel}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={iconBtnStyle}
        >
          <TouchTarget axis="y" />
          <Icon name="calendar_event" size={15} />
        </button>
      </div>
      {error && (
        <span role="alert" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', marginTop: 3 }}>
          {error}
        </span>
      )}

      {open && (
        <CalendarPopover
          value={value}
          clearable={clearable}
          align={align}
          onSelect={(v) => {
            onChange(v)
            setOpen(false)
            buttonRef.current?.focus()
          }}
          onDismiss={() => {
            setOpen(false)
            buttonRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
