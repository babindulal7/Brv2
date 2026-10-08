import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import Icon from './Icon'
import { TouchTarget } from './TouchTarget'
import { floatingLayer } from './floatingLayer'
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

/** ISO day → '16/7/2026'. Unparseable text is handed back untouched. */
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
  width: 44,
  height: 44,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--r-full)',
  border: 'none',
  background: 'transparent',
  color: 'var(--text2)',
  cursor: 'pointer',
}

const popoverStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 'var(--z-dropdown)',
  top: 'calc(100% + 6px)',
  padding: '16px',
  background: 'var(--card, #ffffff)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
  width: 'min(360px, calc(100vw - 24px))',
}

/* ── the calendar ────────────────────────────────────────────────────────── */

export interface CalendarPopoverProps {
  /** 'YYYY-MM-DD', or '' when nothing is chosen. */
  value?: string | undefined
  onSelect?: ((v: string) => void) | undefined
  /** Closes without choosing. Escape and a click outside both route here. */
  onDismiss: () => void
  /** Offers "Clear" — a range bound can be unset; a required date cannot. */
  clearable?: boolean | undefined
  /** Anchors the popover to the right edge, for a control near the viewport edge. */
  align?: ('left' | 'right') | undefined
  /** Header title, e.g. "Check availability", "Select date" */
  title?: string | undefined
  /** Range selection support: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } */
  range?: { from: string; to: string } | undefined
  onSelectRange?: ((range: { from: string; to: string }) => void) | undefined
  /** Quantity stepper support */
  quantity?: number | undefined
  onQuantityChange?: ((qty: number) => void) | undefined
  showQuantity?: boolean | undefined
  /** Per-date availability map: { '2026-07-22': 9, '2026-07-26': 0 } */
  availability?: Record<string, number> | undefined
  /** Min and Max allowable selectable dates ('YYYY-MM-DD') */
  minDate?: string | undefined
  maxDate?: string | undefined
  /** When true, renders inline in normal document flow instead of absolutely positioned popup */
  embedded?: boolean | undefined
  /** Controls rendering of the title + close header (default true) */
  showHeader?: boolean | undefined
  /** Override the calendar's Today action with the caller's operational day. */
  todayDate?: string | undefined
  /** Keep historical dates visually active when the caller filters past records. */
  shadePastDates?: boolean | undefined
}

/**
 * Modern circular date & availability calendar popup matching the canonical rental design:
 * - Header with title & accessible 44×44 close button
 * - Optional Quantity stepper
 * - Centered bold Month Year with BS Nepali subtitle
 * - MO TU WE TH FR SA SU 2-letter uppercase headers (Monday-first)
 * - Circular day cells with top day number, separator line, and sub-metric (available qty or BS day)
 * - Color-coded availability nodes: Green (available), Amber (low stock), Red (0 available)
 * - Continuous connected blue rounded pill/capsule outline enclosing selected date ranges
 * - Muted diagonal hatching for past/inactive dates
 * - Keyboard navigation (roving tabindex, arrows, PageUp/Down, Home/End)
 */
export function CalendarPopover({
  value = '',
  onSelect,
  onDismiss,
  clearable,
  align = 'left',
  title,
  range,
  onSelectRange,
  quantity,
  onQuantityChange,
  showQuantity = false,
  availability,
  minDate,
  maxDate,
  embedded = false,
  showHeader = true,
  todayDate,
  shadePastDates = true,
}: CalendarPopoverProps) {
  const today = todayDate ?? todayIso()
  const anchor = (range?.from && !Number.isNaN(Date.parse(range.from)))
    ? range.from
    : value && !Number.isNaN(Date.parse(value))
      ? value
      : today

  const [cursor, setCursor] = useState(anchor)
  const [localRange, setLocalRange] = useState<{ from: string; to: string }>(() => {
    if (range) return range
    if (value) return { from: value, to: value }
    return { from: '', to: '' }
  })
  const [localQty, setLocalQty] = useState<number>(quantity ?? 1)
  const currentQty = quantity !== undefined ? quantity : localQty
  const gridRef = useRef<HTMLDivElement | null>(null)
  const movedByKey = useRef(false)

  // Sync external range updates
  useEffect(() => {
    if (range) setLocalRange(range)
  }, [range])

  const cursorDate = new Date(`${cursor}T00:00:00.000Z`)
  const viewYear = cursorDate.getUTCFullYear()
  const viewMonth = cursorDate.getUTCMonth()

  const startWeekday = useMemo(() => {
    const first = new Date(Date.UTC(viewYear, viewMonth, 1))
    // Monday-first: 0 = Mon, ..., 6 = Sun
    return (first.getUTCDay() + 6) % 7
  }, [viewYear, viewMonth])

  const cells = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate()
    return [
      ...Array.from({ length: startWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const ad = new Date(Date.UTC(viewYear, viewMonth, i + 1))
        return { ad, iso: isoOf(ad) }
      }),
    ] as Array<{ ad: Date; iso: string } | null>
  }, [viewYear, viewMonth, startWeekday])

  useLayoutEffect(() => {
    if (!movedByKey.current) return
    movedByKey.current = false
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus()
  }, [cursor])

  const monthBs = useMemo(() => {
    for (const c of cells) {
      if (!c) continue
      const bs = toBs(c.ad)
      if (bs) return bs
    }
    return null
  }, [cells])

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

  const handleSelectDay = (iso: string) => {
    if (minDate && iso < minDate) return
    if (maxDate && iso > maxDate) return

    if (onSelectRange) {
      if (!localRange.from || (localRange.from && localRange.to && localRange.from !== localRange.to)) {
        const next = { from: iso, to: iso }
        setLocalRange(next)
        onSelectRange(next)
      } else {
        const next = iso >= localRange.from
          ? { from: localRange.from, to: iso }
          : { from: iso, to: localRange.from }
        setLocalRange(next)
        onSelectRange(next)
      }
    } else {
      setLocalRange({ from: iso, to: iso })
      onSelect?.(iso)
    }
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
        handleSelectDay(cursor)
        break
      default:
        break
    }
  }

  const resolvedTitle = title ?? (availability || showQuantity ? 'Check availability' : 'Select date')

  return (
    <div
      role={embedded ? undefined : 'dialog'}
      aria-label={embedded ? undefined : resolvedTitle}
      style={{
        ...(embedded
          ? {
              position: 'relative',
              width: '100%',
              maxWidth: '100%',
              padding: 0,
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              boxShadow: 'none',
            }
          : {
              ...popoverStyle,
              ...(align === 'right' ? { right: 0 } : { left: 0 }),
            }),
      }}
    >
      {/* ── Top Header with Title and 44x44 Close '×' button ── */}
      {showHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: showQuantity ? 12 : 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--t-ui, 15px)',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
            }}
          >
            {resolvedTitle}
          </h3>
          <button
            type="button"
            aria-label="Close calendar"
            onClick={onDismiss}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--r-xs)',
              marginRight: -10,
              marginTop: -8,
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      {/* ── Quantity Stepper (when enabled) ── */}
      {showQuantity && (
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="calendar-popover-qty"
            style={{
              display: 'block',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 6,
            }}
          >
            Quantity
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 44,
              borderRadius: 'var(--r-sm, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              overflow: 'hidden',
            }}
          >
            <span
              id="calendar-popover-qty"
              style={{
                paddingLeft: 14,
                fontSize: 'var(--t-ui, 15px)',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              {currentQty}
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: 38,
                height: '100%',
                borderLeft: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => {
                  const next = currentQty + 1
                  setLocalQty(next)
                  onQuantityChange?.(next)
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  lineHeight: 1,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => {
                  const next = Math.max(1, currentQty - 1)
                  setLocalQty(next)
                  onQuantityChange?.(next)
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                −
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Month & Year Navigation ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          className="press"
          aria-label="Previous month"
          onClick={() => moveMonths(-1)}
          style={iconBtnStyle}
        >
          <TouchTarget axis="both" />
          <Icon name="chevron_left" size={16} />
        </button>
        <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--t-ui, 15px)',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {monthLabel}
          </span>
          {monthBs && (
            <span
              style={{
                display: 'block',
                fontSize: 'var(--t-th, 11px)',
                fontWeight: 600,
                color: 'var(--text2)',
                marginTop: 1,
              }}
            >
              {`${BS_MONTHS[monthBs.month - 1]} ${monthBs.year} BS`}
            </span>
          )}
        </div>
        <button
          type="button"
          className="press"
          aria-label="Next month"
          onClick={() => moveMonths(1)}
          style={iconBtnStyle}
        >
          <TouchTarget axis="both" />
          <Icon name="chevron_right" size={16} />
        </button>
      </div>

      {/* ── Weekday Headers: MO TU WE TH FR SA SU ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          textAlign: 'center',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--muted, #718096)',
          letterSpacing: '0.04em',
          marginBottom: 8,
        }}
        aria-hidden="true"
      >
        {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((d) => (
          <span key={d} style={{ padding: '4px 0' }}>{d}</span>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      <div
        ref={gridRef}
        role="grid"
        onKeyDown={onGridKeyDown}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          rowGap: 4,
          columnGap: 0,
        }}
      >
        {cells.map((c, i) => {
          if (!c) {
            return (
              <div
                key={`empty-${i}`}
                role="presentation"
                style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
            )
          }

          const iso = c.iso
          const colIndex = (startWeekday + c.ad.getUTCDate() - 1) % 7
          const isCursor = iso === cursor
          const isToday = iso === today
          const isPast = shadePastDates && Boolean(minDate ? iso < minDate : iso < today)
          const bs = toBs(c.ad)

          // Range and selection checks
          const hasRange = Boolean(localRange.from && localRange.to)
          const inRange = hasRange && iso >= localRange.from && iso <= localRange.to
          const isStart = localRange.from === iso
          const isEnd = localRange.to === iso
          const isSingle = (isStart && isEnd) || (localRange.from === iso && !localRange.to) || (value === iso && !onSelectRange)
          const isSelected = isSingle || inRange

          // Availability mapping
          const hasAvail = availability !== undefined && iso in availability
          const availCount = hasAvail ? availability[iso] : null

          // Badge coloring
          let circleBg = 'transparent'
          let circleColor = 'var(--text)'

          if (hasAvail) {
            if (availCount === 0) {
              circleBg = '#F56565' // Crimson Red
              circleColor = '#FFFFFF'
            } else if (availCount! < currentQty) {
              circleBg = '#F6AD55' // Warm Amber / Orange
              circleColor = '#1A202C'
            } else {
              circleBg = '#48BB78' // Fresh Green
              circleColor = '#1A202C'
            }
          } else if (isPast) {
            circleBg = 'var(--card2, #f7fafc)'
            circleColor = 'var(--muted, #a0aec0)'
          } else if (isSingle && !inRange) {
            circleBg = 'var(--btn-primary-bg, #3182ce)'
            circleColor = 'var(--btn-primary-fg, #ffffff)'
          }

          // Blue capsule outline calculation
          const rangeBorderColor = 'var(--primary, #3182ce)'
          const hasLeftBorder = isStart || (inRange && colIndex === 0) || isSingle
          const hasRightBorder = isEnd || (inRange && colIndex === 6) || isSingle

          return (
            <div
              key={iso}
              style={{
                position: 'relative',
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // Capsule border enclosing the range
                borderTop: (inRange || isSingle) ? `2px solid ${rangeBorderColor}` : '2px solid transparent',
                borderBottom: (inRange || isSingle) ? `2px solid ${rangeBorderColor}` : '2px solid transparent',
                borderLeft: hasLeftBorder ? `2px solid ${rangeBorderColor}` : 'none',
                borderRight: hasRightBorder ? `2px solid ${rangeBorderColor}` : 'none',
                borderTopLeftRadius: hasLeftBorder ? 9999 : 0,
                borderBottomLeftRadius: hasLeftBorder ? 9999 : 0,
                borderTopRightRadius: hasRightBorder ? 9999 : 0,
                borderBottomRightRadius: hasRightBorder ? 9999 : 0,
                background: inRange ? 'rgba(49, 130, 206, 0.08)' : 'transparent',
              }}
            >
              <button
                type="button"
                role="gridcell"
                className="press"
                tabIndex={isCursor ? 0 : -1}
                aria-selected={isSelected}
                {...(isToday ? { 'aria-current': 'date' as const } : {})}
                aria-label={`${formatAd(c.ad)}${hasAvail ? ` (${availCount} available)` : ''}`}
                onClick={() => handleSelectDay(iso)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                  background: circleBg,
                  color: circleColor,
                  cursor: isPast && minDate && !hasAvail ? 'default' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  ...(isPast && !hasAvail ? {
                    backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 5px)',
                  } : {}),
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.1 }}>
                  {c.ad.getUTCDate()}
                </span>
                {(hasAvail || bs) && (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 1,
                        background: 'currentColor',
                        opacity: 0.35,
                        margin: '1px 0',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        lineHeight: 1,
                        opacity: hasAvail ? 1 : 0.8,
                      }}
                    >
                      {hasAvail ? availCount : (bs?.day ?? '')}
                    </span>
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Footer Quick Actions ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
          gap: 8,
        }}
      >
        <button
          type="button"
          className="press"
          onClick={() => handleSelectDay(today)}
          style={{
            position: 'relative',
            minHeight: 44,
            padding: '0 12px',
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
          <TouchTarget axis="both" />
          Today
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {clearable && (
            <button
              type="button"
              className="press"
              onClick={() => {
                setLocalRange({ from: '', to: '' })
                onSelectRange?.({ from: '', to: '' })
                onSelect?.('')
              }}
              style={{
                position: 'relative',
                minHeight: 44,
                padding: '0 12px',
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
              <TouchTarget axis="both" />
              Clear
            </button>
          )}

          <button
            type="button"
            className="press"
            onClick={onDismiss}
            style={{
              position: 'relative',
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 'var(--r-xs)',
              border: 'none',
              background: 'var(--btn-primary-bg, #3182ce)',
              color: 'var(--btn-primary-fg, #ffffff)',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <TouchTarget axis="both" />
            Done
          </button>
        </div>
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
  /** Use the shared orange for a booking schedule rather than a filter date. */
  bookingDate?: boolean
  /** Offers Clear in the popover and permits '' — for a range bound. */
  clearable?: boolean
  /** Anchor the popover to the control's right edge. */
  align?: 'left' | 'right'
  error?: string | undefined
  disabled?: boolean
  required?: boolean
  id?: string
  placeholder?: string
  /** Header title override for the popover */
  title?: string
  /** Range selection support: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } */
  range?: { from: string; to: string }
  onSelectRange?: (range: { from: string; to: string }) => void
  /** Stepper quantity support */
  quantity?: number
  onQuantityChange?: (qty: number) => void
  showQuantity?: boolean
  /** Per-date availability map: { '2026-07-22': 9, '2026-07-26': 0 } */
  availability?: Record<string, number>
  /** Min and Max allowable dates */
  minDate?: string
  maxDate?: string
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
  bookingDate = false,
  clearable = false,
  align = 'left',
  error,
  disabled = false,
  required = false,
  id,
  placeholder = 'dd/mm/yyyy',
  title,
  range,
  onSelectRange,
  quantity,
  onQuantityChange,
  showQuantity,
  availability,
  minDate,
  maxDate,
}: DateFieldProps) {
  const [text, setText] = useState(() => displayDate(value))
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelAdjusted = useRef(false)
  /* Floating position of the portaled calendar. Measured from the field on
     open and re-measured on scroll/resize so it tracks. */
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const measurePanel = () => {
    // Zero-size anchor: the inner CalendarPopover keeps its own absolute
    // `top: calc(100% + 6px)` + left/right positioning, which now resolves
    // against this fixed point instead of the clipping field wrapper.
    const el = rootRef.current
    if (!el) return
    panelAdjusted.current = false
    const r = el.getBoundingClientRect()
    // Panel width is min(360px, 100vw-24px) per popoverStyle. The inner panel
    // keeps its own absolute left:0 / right:0 anchoring against this
    // zero-size point, so: left-anchored needs the point clamped by width,
    // right-anchored needs just the trigger's right edge (the panel extends
    // left from it) unless that would run off the left edge.
    const panelW = Math.min(360, window.innerWidth - 24)
    const left = align === 'right' && r.right - panelW >= 8
      ? r.right
      : Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - panelW - 8))
    setPanelPos({ top: r.bottom, left, width: 0 })
  }

  useEffect(() => {
    if (!open) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* After the panel lands, pull it up if it runs past the viewport bottom —
     a trigger near the fold would otherwise open its calendar off-screen. */
  useLayoutEffect(() => {
    if (!open || !panelPos || panelAdjusted.current) return
    const panel = panelRef.current?.firstElementChild as HTMLElement | null
    if (!panel) return
    const overflow = panel.getBoundingClientRect().bottom - window.innerHeight + 8
    if (overflow > 0) {
      panelAdjusted.current = true
      setPanelPos((p) => (p ? { ...p, top: Math.max(8, p.top - overflow) } : p))
    }
  }, [open, panelPos])

  useEffect(() => setText(displayDate(value)), [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      // The open calendar is portaled to document.body — a pointer inside it
      // is logically inside, even though it is outside `rootRef` in the DOM.
      if (panelRef.current?.contains(target)) return
      if (!rootRef.current?.contains(target)) setOpen(false)
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
          style={{ marginBottom: 3, fontSize: 'var(--t-th)', fontWeight: 700, color: bs ? bookingDate ? 'var(--booking-date-text)' : 'var(--text)' : 'var(--muted)' }}
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
          required={required}
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
            color: bookingDate ? 'var(--booking-date-text)' : 'var(--text)',
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

      {open && panelPos && createPortal(
        // A 0×0 positioning anchor for the popover, not a control — the
        // popover inside it carries its own 44px targets.
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            left: panelPos.left,
            width: 0,
            height: 0,
            zIndex: floatingLayer(buttonRef.current),
          }}
        >
          <CalendarPopover
          value={value}
          clearable={clearable}
          align={align}
          title={title ?? (label || ariaLabel)}
          range={range}
          onSelectRange={onSelectRange}
          quantity={quantity}
          onQuantityChange={onQuantityChange}
          showQuantity={showQuantity}
          availability={availability}
          minDate={minDate}
          maxDate={maxDate}
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
        </div>,
        document.body,
      )}
    </div>
  )
}
