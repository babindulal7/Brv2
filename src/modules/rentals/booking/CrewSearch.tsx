import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { formatMoney } from '../../../lib/money'
import { CREW_ROSTER, searchRoster, type CrewMember, type CrewRole } from '../../../lib/queries/crew'
import { CREW_ROLES } from '../../../actions/rentals/createRental'
import { Field, inputStyle } from './BookingFormWidgets'

export type RoleRejectedByDb = Exclude<CrewRole, (typeof CREW_ROLES)[number]>

export const ROLES_ACCEPTED_BY_DB: ReadonlySet<string> = new Set<string>(CREW_ROLES)

export function dbRejectsRole(role: CrewRole): role is RoleRejectedByDb {
  return !ROLES_ACCEPTED_BY_DB.has(role)
}

/** One sentence, no jargon, same wording in the row and in its accessible name. */
export function rejectionNote(role: CrewRole): string {
  return `The database has no “${role}” role, so Confirm will refuse this booking until that is settled.`
}

export interface CrewSearchProps {
  /** Who is already on the booking. Excluded from the list — nobody is added twice. */
  onBooking: readonly { crewId: string }[]
  onAdd: (crewId: string) => void
  /** The page's `canCrewMoney`. A money-blind role sees the roster and never a rate. */
  showRates: boolean
  roster?: readonly CrewMember[]
}

export function CrewSearch({
  onBooking,
  onAdd,
  showRates,
  roster = CREW_ROSTER,
}: CrewSearchProps) {
  const reactId = useId()
  const labelId = `${reactId}-crew-label`
  const listboxId = `${reactId}-crew-listbox`
  const hintId = `${reactId}-crew-hint`

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [cursorMoved, setCursorMoved] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const excludeIds = useMemo(() => onBooking.map((c) => c.crewId), [onBooking])
  const options = useMemo(() => searchRoster(query, excludeIds, roster), [query, excludeIds, roster])
  const rosterExhausted = useMemo(() => searchRoster('', excludeIds, roster).length === 0, [excludeIds, roster])

  // Clamp the cursor whenever the result set shrinks under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? 0 : i))
  }, [options.length])

  const activeId = open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined

  useEffect(() => {
    if (!open || !cursorMoved || !activeId) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [open, cursorMoved, activeId])

  /** Close on outside pointer interaction */
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const commit = (m: CrewMember) => {
    onAdd(m.id)
    setQuery('')
    setActiveIndex(0)
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const count = options.length
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          return
        }
        setCursorMoved(true)
        setActiveIndex((i) => (count === 0 ? 0 : e.key === 'ArrowDown' ? (i + 1) % count : (i - 1 + count) % count))
        return
      case 'Home':
      case 'End': {
        if (query !== '') return
        e.preventDefault()
        setCursorMoved(true)
        setActiveIndex(e.key === 'Home' ? 0 : Math.max(0, count - 1))
        return
      }
      case 'Enter': {
        const m = options[activeIndex]
        if (!m) return
        e.preventDefault()
        commit(m)
        return
      }
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        if (query !== '') {
          setQuery('')
          setActiveIndex(0)
        }
        setCursorMoved(false)
        inputRef.current?.blur()
        return
      default:
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', marginBottom: 'var(--sp-md)' }}>
      <Field label="Add crew" labelId={labelId}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-labelledby={labelId}
              aria-describedby={hintId}
              {...(activeId ? { 'aria-activedescendant': activeId } : {})}
              placeholder="Search the roster by name or role…"
              value={query}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
                if (!open) setOpen(true)
              }}
              onKeyDown={onKeyDown}
              style={{ ...inputStyle, paddingLeft: 32, paddingRight: query ? 32 : 10 }}
            />
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                color: 'var(--muted)',
                pointerEvents: 'none',
              }}
            >
              <Icon name="search" size={15} />
            </span>
            {query && (
              <button
                type="button"
                className="press"
                aria-label="Clear search query"
                onClick={() => {
                  setQuery('')
                  setActiveIndex(0)
                  inputRef.current?.focus()
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="press"
            onClick={() => {
              setOpen((o) => {
                const next = !o
                if (next) globalThis.requestAnimationFrame(() => inputRef.current?.focus())
                else inputRef.current?.blur()
                return next
              })
            }}
            aria-expanded={open}
            aria-label={open ? 'Hide crew roster' : 'Browse crew roster'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 38,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              background: open ? 'var(--st-primary-bg)' : 'var(--btn-secondary-bg)',
              color: open ? 'var(--st-primary-fg)' : 'var(--text)',
              border: `1px solid ${open ? 'var(--primary)' : 'var(--btn-secondary-border)'}`,
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span>{open ? 'Hide' : 'Browse'}</span>
            <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
          </button>
        </div>
      </Field>

      {open && (
        <div
          role="dialog"
          aria-label="Crew roster search results"
          style={{
            position: 'absolute',
            zIndex: 35,
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            maxHeight: 260,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            background: 'var(--dropdown)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <p id={hintId} style={{ margin: '8px 10px 4px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Up and Down to move, Enter to add, Escape to close. Anyone already on this booking is left out of the list.
          </p>

          <ul id={listboxId} role="listbox" aria-labelledby={labelId} style={{ listStyle: 'none', margin: 0, padding: 4 }}>
            {options.map((m, i) => {
              const active = i === activeIndex
              const rejected = dbRejectsRole(m.role)
              const note = rejected ? rejectionNote(m.role) : ''
              return (
                <li
                  key={m.id}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  aria-label={`${m.name}, ${m.role}.${
                    showRates ? ` ${formatMoney(m.dayRatePaisa)} per day.` : ''
                  }${note ? ` ${note}` : ''} Press Enter to add to this booking.`}
                  onMouseMove={() => {
                    setCursorMoved(false)
                    setActiveIndex(i)
                  }}
                  onClick={() => commit(m)}
                  style={{
                    display: 'grid',
                    gap: 2,
                    minHeight: 'var(--tap)',
                    alignContent: 'center',
                    padding: '7px 9px',
                    borderRadius: 'var(--r-btn)',
                    cursor: 'pointer',
                    background: active ? 'var(--hover-row)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
                    <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
                      <Icon name="crew" size={15} />
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--t-ui)',
                        fontWeight: 600,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.name}
                    </span>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{m.role}</span>
                    {showRates && (
                      <span
                        className="figure"
                        style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}
                      >
                        {formatMoney(m.dayRatePaisa)}/day
                      </span>
                    )}
                  </div>
                  {note && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--warn-text)' }}>
                      <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0 }}>
                        <Icon name="alert_triangle" size={13} />
                      </span>
                      <span style={{ minWidth: 0 }}>{note}</span>
                    </div>
                  )}
                </li>
              )
            })}
            {options.length === 0 && (
              <li role="presentation" style={{ padding: '10px 9px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {rosterExhausted
                  ? 'Everyone on the roster is already on this booking.'
                  : `No one on the roster matches “${query.trim()}”. Names and roles are searched.`}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
