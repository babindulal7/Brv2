/**
 * **Client selector — "New Booking" spec §8–10, §64.**
 *
 * Replaces the plain `<select>` the Client field used to be. A native select
 * cannot be searched, cannot show a health state, cannot show a balance, and
 * on 37 clients it is already a scroll-and-squint exercise; §8 asks for search
 * across six fields, §10 asks each row to carry health, VIP, phone, email and
 * Outstanding, and neither is expressible in an `<option>`.
 *
 * This is a *refinement of the field*, not a new page: it renders in the same
 * grid cell, at the same height, with the same `inputStyle` the rest of
 * Section 1 uses (passed in, so it cannot drift from the page's own tokens).
 *
 * ## §64's interaction contract, point by point
 *
 * - **↑ / ↓** move the active option, wrapping at both ends.
 * - **Enter** commits the active option (a client, "View All", or "Create New").
 * - **Esc** closes the list and restores the previously selected client's name
 *   to the input — it never clears a selection you already made.
 * - Searching starts at `minQueryChars` (2 by default, §64's "2–3 characters").
 * - Matches are **partial and unanchored**, across all six fields of §8.
 * - Nothing here navigates or reloads: "Create New Client" raises a callback
 *   and the page decides (a modal, a drawer, a route) — this component never
 *   calls `navigate`, so a half-built booking cannot be lost by touching it.
 * - The empty state names the query back and still offers the create action.
 *
 * ## Accessibility
 *
 * ARIA 1.2 combobox: the input owns `role="combobox"`, `aria-expanded`,
 * `aria-controls` and `aria-activedescendant`; the popup is a `listbox` of
 * `option`s. Each option's accessible name carries the health verdict in words
 * — "never colour alone" applies to the screen reader too, not just the screen.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  ReactNode,
} from 'react'
import Icon from '../../../components/ui/Icon'
import { formatMoney } from '../../../lib/money'
import { CLIENTS_DATA } from '../../../lib/queries/clients'
import type { ClientRecord } from '../../../lib/queries/clients'
import { clientHealth, healthAccessibleName } from './clientHealth'
import type { ClientHealthVerdict } from './clientHealth'
import { ClientHealthChip, TOUCH } from './ClientHealthChip'

/* ── Search ────────────────────────────────────────────────────────────── */

/** Lower-cased, punctuation-stripped, so "+977 980-1234567" matches "9801234567". */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s\-()./+]/g, '')
}

/**
 * §8's six searchable fields, in one place so the row rendering and the match
 * rule cannot disagree about what "searchable" means.
 */
function haystack(c: ClientRecord): string[] {
  return [
    c.name,
    c.company ?? '',
    c.contactPerson.name,
    c.phone,
    c.contactPerson.phone,
    c.email,
    c.pan ?? '',
    c.id,
  ].filter(Boolean)
}

function matches(c: ClientRecord, q: string): boolean {
  const n = normalise(q)
  return haystack(c).some((field) => normalise(field).includes(n))
}

/** Rank: name-prefix hits first, then any-field hits, then alphabetical. */
function relevance(c: ClientRecord, q: string): number {
  const n = normalise(q)
  if (normalise(c.name).startsWith(n)) return 0
  if (c.company && normalise(c.company).startsWith(n)) return 1
  if (normalise(c.name).includes(n)) return 2
  return 3
}

/* ── Recent clients (§9) ───────────────────────────────────────────────── */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Parses the `"18 Jul 2026"` label `ClientRecord.lastRentalAd` carries.
 *
 * Hand-parsed rather than `Date.parse`, which is engine- and locale-dependent
 * for non-ISO strings — the same reasoning `lib/money.ts` gives for not using
 * `toLocaleString`. Returns `null` on anything unexpected, and an unparseable
 * date simply sorts last instead of throwing.
 */
function parseAdLabel(label: string | undefined): number | null {
  if (!label) return null
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(label.trim())
  if (!m) return null
  const [, d, mon, y] = m
  const monthIndex = MONTHS.indexOf((mon ?? '').slice(0, 3).toLowerCase())
  if (monthIndex < 0 || !d || !y) return null
  return Date.UTC(Number(y), monthIndex, Number(d))
}

/**
 * §9's "Recent Clients", derived rather than invented.
 *
 * ⚠ TODO(decision) — there is no per-operator "recently used" list in the data
 * layer, and inventing one (a random slice, a hardcoded five) would put a fake
 * ordering in front of the operator every time they open the field. Most-recent
 * *rental* is the closest true signal the records carry, so that is what this
 * shows, and the panel is labelled "Recent Clients · by last rental" so nobody
 * reads it as their own history. Swap in a real recency list via the
 * `recentClientIds` prop the day one exists.
 */
function recentByLastRental(clients: readonly ClientRecord[], limit: number): ClientRecord[] {
  return [...clients]
    .sort((a, b) => (parseAdLabel(b.lastRentalAd) ?? -1) - (parseAdLabel(a.lastRentalAd) ?? -1))
    .slice(0, limit)
}

/* ── Options ───────────────────────────────────────────────────────────── */

type Option =
  | { kind: 'client'; client: ClientRecord; verdict: ClientHealthVerdict }
  | { kind: 'view-all' }
  | { kind: 'create' }

/* ── Props ─────────────────────────────────────────────────────────────── */

export interface ClientComboboxProps {
  /** Defaults to the real `CLIENTS_DATA` — injectable so a test never needs the seed layer. */
  clients?: readonly ClientRecord[]
  /** The page owns selection; this component is controlled. */
  selectedClientId: string | null
  onSelect: (client: ClientRecord) => void
  /** Raised by the "+ Create New Client" row. The page decides how to host Add Client (§15). */
  onCreateNew: () => void
  /** Raised by §9's "View All Clients" affordance. Omit to hide the row. */
  onViewAll?: () => void
  /** Real per-operator recency, once it exists. Falls back to last-rental order. */
  recentClientIds?: readonly string[]
  /** The page's own `inputStyle`, so the field matches every sibling in Section 1. */
  inputStyle?: CSSProperties
  /** `id` of the label element, for `aria-labelledby`. */
  labelledBy?: string
  /** Money gating — pass the page's `canViewMoneyField(gctx, 'client-balance')`. */
  showOutstanding?: boolean
  /** §64: "starts searching at 2–3 characters". */
  minQueryChars?: number
  /** Options rendered before the list truncates with a stated count. */
  maxResults?: number
  /** Rendered inside the field's right edge — the page puts the §11 eye here. */
  trailing?: ReactNode
  disabled?: boolean
  /** Inline, persistent error (never a toast, never an alert). */
  error?: string
  /**
   * A **one-shot** escape from §9's "focus opens the list".
   *
   * Focus normally means the operator is about to search, so the list opens on
   * it. A page that moves focus here for some other reason — New Rental hands
   * `AddClientModal` this input as its focus-restore target, because the
   * add-client control that was pressed is replaced by the health eye and is
   * gone by the time the modal restores focus — sets this to `true`
   * immediately before doing so. The next focus then does not open the list,
   * and the flag is consumed. It is a ref rather than a boolean prop because
   * both moments (focusing before the modal opens, and the modal's own restore
   * on close) happen outside React's render, so a prop would not have
   * propagated in time.
   */
  suppressNextFocusOpen?: { current: boolean }
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ClientCombobox({
  clients = CLIENTS_DATA,
  selectedClientId,
  onSelect,
  onCreateNew,
  onViewAll,
  recentClientIds,
  inputStyle,
  labelledBy,
  showOutstanding = true,
  minQueryChars = 2,
  maxResults = 8,
  trailing,
  disabled = false,
  error,
  suppressNextFocusOpen,
}: ClientComboboxProps) {
  const reactId = useId()
  const inputId = `${reactId}-client-input`
  const listboxId = `${reactId}-client-listbox`
  const errorId = `${reactId}-client-error`

  /**
   * A merged-away record is closed (see `ClientRecord.mergedIntoId`). It stays
   * in the Clients directory — nothing is deleted — but it must not be
   * *bookable*, so it is out of this selector's pool rather than filtered out
   * of the data.
   */
  const pool = useMemo(() => clients.filter((c) => !c.mergedIntoId), [clients])

  const selected = useMemo(
    () => pool.find((c) => c.id === selectedClientId || (c.dbId && c.dbId === selectedClientId)) ?? null,
    [pool, selectedClientId],
  )

  const [query, setQuery] = useState(selected?.name ?? '')
  /** False until the operator actually types — a focused, untouched field shows Recent (§9). */
  const [typed, setTyped] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  // Keep the field's text in step when the page changes the selection itself.
  useEffect(() => {
    setQuery(selected?.name ?? '')
    setTyped(false)
  }, [selected])

  const effectiveQuery = typed ? query.trim() : ''
  const searching = effectiveQuery.length >= minQueryChars

  const verdicts = useMemo(() => {
    const m = new Map<string, ClientHealthVerdict>()
    for (const c of pool) m.set(c.id, clientHealth(c))
    return m
  }, [pool])

  const results = useMemo(() => {
    if (!searching) {
      if (recentClientIds && recentClientIds.length > 0) {
        return recentClientIds
          .map((id) => pool.find((c) => c.id === id))
          .filter((c): c is ClientRecord => Boolean(c))
          .slice(0, maxResults)
      }
      return recentByLastRental(pool, maxResults)
    }
    return pool
      .filter((c) => matches(c, effectiveQuery))
      .sort(
        (a, b) => relevance(a, effectiveQuery) - relevance(b, effectiveQuery) || a.name.localeCompare(b.name),
      )
  }, [pool, searching, effectiveQuery, recentClientIds, maxResults])

  const shown = results.slice(0, maxResults)
  const truncated = results.length - shown.length

  const options = useMemo<Option[]>(() => {
    const list: Option[] = shown.map((client) => ({
      kind: 'client' as const,
      client,
      verdict: verdicts.get(client.id) ?? clientHealth(client),
    }))
    if (!searching && onViewAll) list.push({ kind: 'view-all' })
    // §10 — the list always ends with Create New Client, including on no matches.
    list.push({ kind: 'create' })
    return list
  }, [shown, searching, onViewAll, verdicts])

  // Clamp the active option whenever the option set changes under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? 0 : i))
  }, [options.length])

  const activeId = open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined

  // Keep the active row inside the scroll viewport during keyboard travel.
  useEffect(() => {
    if (!open || !activeId) return
    const el = document.getElementById(activeId)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeId])

  function openList() {
    if (disabled) return
    setOpen(true)
    setActiveIndex(0)
  }

  /** Esc / blur: put the committed selection's name back. Never clears it. */
  function revert() {
    setQuery(selected?.name ?? '')
    setTyped(false)
    setOpen(false)
  }

  function commit(option: Option) {
    if (option.kind === 'client') {
      onSelect(option.client)
      setQuery(option.client.name)
      setTyped(false)
      setOpen(false)
      inputRef.current?.focus()
      return
    }
    if (option.kind === 'view-all') {
      onViewAll?.()
      setOpen(false)
      return
    }
    onCreateNew()
    setOpen(false)
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) {
          openList()
          return
        }
        setActiveIndex((i) => (options.length === 0 ? 0 : (i + 1) % options.length))
        return
      case 'ArrowUp':
        e.preventDefault()
        if (!open) {
          openList()
          return
        }
        setActiveIndex((i) => (options.length === 0 ? 0 : (i - 1 + options.length) % options.length))
        return
      case 'Home':
        if (!open) return
        e.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        if (!open) return
        e.preventDefault()
        setActiveIndex(Math.max(0, options.length - 1))
        return
      case 'Enter': {
        if (!open) return
        const option = options[activeIndex]
        if (!option) return
        // Stop the booking form submitting on the keystroke that picks a client.
        e.preventDefault()
        commit(option)
        return
      }
      case 'Escape':
        if (!open) return
        e.preventDefault()
        e.stopPropagation()
        revert()
        return
      case 'Tab':
        setOpen(false)
        return
      default:
    }
  }

  const fieldStyle: CSSProperties = {
    ...inputStyle,
    width: '100%',
    // Law 15's 44px floor — this stays a raw `<input>` (see below) rather than
    // the shared `<Input>`, so unlike its Section 1 siblings it does not pick
    // up `Input.tsx`'s own `minHeight: 44` for free. Set directly here instead
    // of relying on whatever `inputStyle` the calling page passed in.
    minHeight: 44,
    paddingRight: 34,
    ...(error ? { borderColor: 'var(--danger)' } : {}),
  }

  return (
    <div
      ref={rootRef}
      /* `flexWrap` is here for the error paragraph below, which used to be
         `position: absolute; top: 100%` — out of flow, and therefore drawn
         straight over whatever the calling page had put in the next row. It
         now takes a full-width line of its own inside this widget, so the
         field grows by the height of its own error instead of covering a
         neighbour. The input keeps its line: it is `flex: 1` with
         `minWidth: 0`, so it shrinks rather than wrapping, and the trailing
         slot stays beside it. */
      style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}
      onBlur={(e) => {
        // Only close when focus actually leaves the whole widget.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) revert()
      }}
    >
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
          {...(activeId ? { 'aria-activedescendant': activeId } : {})}
          {...(error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {})}
          disabled={disabled}
          placeholder="Search name, contact, phone, email, PAN or client ID…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setTyped(true)
            setOpen(true)
            setActiveIndex(0)
          }}
          onFocus={(e) => {
            // One focus without the list, when the page asked for one — see
            // `suppressNextFocusOpen`. The flag is consumed here, so the very
            // next focus behaves normally again.
            if (suppressNextFocusOpen?.current) {
              suppressNextFocusOpen.current = false
            } else {
              openList()
            }
            // Typing replaces the committed name instead of appending to it.
            e.currentTarget.select()
          }}
          onKeyDown={onKeyDown}
          style={fieldStyle}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            color: 'var(--muted)',
            pointerEvents: 'none',
          }}
        >
          <Icon name={open ? 'chevron_up' : 'search'} size={15} />
        </span>

        {open && (
          <ClientListbox
            id={listboxId}
            listRef={listRef}
            options={options}
            activeIndex={activeIndex}
            selectedClientId={selected?.id ?? null}
            searching={searching}
            query={effectiveQuery}
            minQueryChars={minQueryChars}
            truncated={truncated}
            showOutstanding={showOutstanding}
            onHover={setActiveIndex}
            onCommit={commit}
            inputRef={inputRef}
          />
        )}
      </div>

      {trailing}

      {error && (
        <p
          id={errorId}
          role="alert"
          style={{
            /* In flow, on its own wrapped line — see the note on the root. */
            flexBasis: '100%',
            width: '100%',
            margin: 0,
            fontSize: 'var(--t-meta)',
            color: 'var(--danger-text)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="error" size={12} />
          {error}
        </p>
      )}
    </div>
  )
}

/* ── Listbox ───────────────────────────────────────────────────────────── */

function ClientListbox({
  id,
  listRef,
  options,
  activeIndex,
  selectedClientId,
  searching,
  query,
  minQueryChars,
  truncated,
  showOutstanding,
  onHover,
  onCommit,
  inputRef,
}: {
  id: string
  listRef: MutableRefObject<HTMLUListElement | null>
  options: Option[]
  activeIndex: number
  selectedClientId: string | null
  searching: boolean
  query: string
  minQueryChars: number
  truncated: number
  showOutstanding: boolean
  onHover: (i: number) => void
  onCommit: (o: Option) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const noMatches = searching && !options.some((o) => o.kind === 'client')

  // Calculate dropdown position from the input element
  const getDropdownStyle = () => {
    const input = inputRef?.current
    if (!input) return { position: 'fixed', zIndex: 50, top: 0, left: 0, opacity: 0 } as CSSProperties

    const rect = input.getBoundingClientRect()
    const dropdownWidth = Math.max(320, rect.width)
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const dropdownHeight = 380 // approximate max height
    const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow

    return {
      position: 'fixed',
      zIndex: 50,
      top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: dropdownWidth,
      minWidth: 320,
      maxWidth: Math.min(dropdownWidth, viewportWidth - 32),
      background: 'var(--dropdown)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-card)',
      boxShadow: 'var(--shadow-modal)',
      overflow: 'hidden',
    } as CSSProperties
  }

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const dropdownStyle = getDropdownStyle()

  // Portal to document.body to avoid any ancestor overflow clipping
  return createPortal(
    <div
      style={dropdownStyle}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        style={{
          padding: '7px 12px',
          fontSize: 'var(--t-meta)',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--text2)',
          background: 'var(--card2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {searching ? 'Matching Clients' : 'Recent Clients · by last rental'}
      </div>

      {noMatches && (
        <div style={{ padding: '12px 12px 4px', display: 'grid', gap: 'var(--sp-xs)' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
            No clients match “{query}”
          </p>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Searched name, company, contact person, phone, email, PAN and client ID.
          </p>
        </div>
      )}

      {!searching && query.length > 0 && query.length < minQueryChars && (
        <div style={{ padding: '10px 12px 0' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Keep typing — search starts at {minQueryChars} characters.
          </p>
        </div>
      )}

      <ul
        ref={listRef}
        id={id}
        role="listbox"
        aria-label="Clients"
        style={{ listStyle: 'none', margin: 0, padding: 'var(--sp-xs)', maxHeight: 340, overflowY: 'auto' }}
      >
        {options.map((option, i) => {
          const optionId = `${id}-opt-${i}`
          const active = i === activeIndex
          if (option.kind === 'client') {
            return (
              <ClientOptionRow
                key={option.client.id}
                id={optionId}
                option={option}
                active={active}
                selected={option.client.id === selectedClientId}
                showOutstanding={showOutstanding}
                onHover={() => onHover(i)}
                onClick={() => onCommit(option)}
              />
            )
          }
          return (
            <ActionRow
              key={option.kind}
              id={optionId}
              active={active}
              icon={option.kind === 'create' ? 'plus' : 'users'}
              label={option.kind === 'create' ? 'New Client' : 'View All Clients'}
              hint={
                option.kind === 'create'
                  ? 'Opens the Add Client form — your booking stays open'
                  : 'Browse the full Clients directory'
              }
              onHover={() => onHover(i)}
              onClick={() => onCommit(option)}
            />
          )
        })}
      </ul>

      {truncated > 0 && (
        <div
          style={{
            padding: '7px 12px',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
            borderTop: '1px solid var(--border)',
            background: 'var(--card2)',
          }}
        >
          <span className="figure">{truncated}</span> more match — refine the search to narrow it.
        </div>
      )}
    </div>,
    document.body
  )
}

/* ── Rows ──────────────────────────────────────────────────────────────── */

function ClientOptionRow({
  id,
  option,
  active,
  selected,
  showOutstanding,
  onHover,
  onClick,
}: {
  id: string
  option: Extract<Option, { kind: 'client' }>
  active: boolean
  selected: boolean
  showOutstanding: boolean
  onHover: () => void
  onClick: () => void
}) {
  const { client, verdict } = option
  const outstanding = showOutstanding
    ? client.outstandingPaisa > 0
      ? `Outstanding ${formatMoney(client.outstandingPaisa)}`
      : 'No balance due'
    : null

  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      // The health reaches assistive tech as words, never as a colour.
      aria-label={`${healthAccessibleName(client, verdict)}${client.isVip ? '. VIP client' : ''}${
        outstanding ? `. ${outstanding}` : ''
      }. Phone ${client.phone}`}
      onMouseMove={onHover}
      onClick={onClick}
      style={{
        display: 'grid',
        gap: 3,
        minHeight: TOUCH,
        padding: '8px 10px',
        borderRadius: 'var(--r-btn)',
        cursor: 'pointer',
        background: active ? 'var(--hover-row)' : 'transparent',
        boxShadow: selected ? 'inset 2px 0 0 var(--primary)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
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
          {client.name}
        </span>
        {/*
          * VIP is BLUE, and it used to be GOLD. That was a real bug, not a
          * taste call.
          *
          * DESIGN_DIRECTION_SPEC_v4.1 §2: gold (`--ext-*`) "is NOT a status
          * ... it is the only outline on screen, marking sub-rented /
          * external gear", and §4 repeats it — "never solid, never on an
          * action, never a status". A VIP client is not external gear. The
          * chip painted `border: 1px solid var(--ext-line)` with
          * `color: var(--gold)`, which is the sub-rental mark's exact
          * signature, and it sat INSIDE this row's `role="option"` — so gold
          * appeared inside a clickable affordance as well as outside its one
          * meaning. `lib/status.ts` names the cost precisely: "a gold Save
          * button beside a gold sub-rental badge destroys the one distinction
          * a warehouse must see."
          *
          * `primary` is the replacement because §2 gives blue exactly one
          * meaning — "committed · scheduled" — and a VIP flag is a standing,
          * committed relationship with the client. It is the only one of the
          * seven that fits: yellow is in-house work, orange is out with a
          * client, green is settled, red is a problem, gray is not started,
          * dim is finished.
          *
          * The old comment cited "Foundation §4.2". That document is
          * superseded; v4.1 §2/§4 is the standing rule and is what this reads.
          */}
        {client.isVip && <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 7px',
                      borderRadius: 'var(--r-chip)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-th)',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                    }}
                  >
                    VIP
                  </span>}
        <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <ClientHealthChip verdict={verdict} />
        </span>
      </div>

      {client.company && (
        <div
          style={{
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {client.company}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-md)',
          flexWrap: 'wrap',
          fontSize: 'var(--t-meta)',
          color: 'var(--text2)',
        }}
      >
        <span className="figure" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
          <Icon name="phone" size={12} />
          {client.phone}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-xs)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <Icon name="mail" size={12} />
          {client.email}
        </span>
        {outstanding !== null && (
          <span
            className="figure"
            style={{
              marginLeft: 'auto',
              fontWeight: 600,
              color: client.outstandingPaisa > 0 ? 'var(--danger-text)' : 'var(--text2)',
              whiteSpace: 'nowrap',
            }}
          >
            {outstanding}
          </span>
        )}
      </div>
    </li>
  )
}

function ActionRow({
  id,
  active,
  icon,
  label,
  hint,
  onHover,
  onClick,
}: {
  id: string
  active: boolean
  icon: 'plus' | 'users'
  label: string
  hint: string
  onHover: () => void
  onClick: () => void
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={false}
      aria-label={`${label}. ${hint}`}
      onMouseMove={onHover}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        minHeight: TOUCH,
        padding: '8px 10px',
        marginTop: 2,
        borderTop: '1px solid var(--divider)',
        borderRadius: 'var(--r-btn)',
        cursor: 'pointer',
        background: active ? 'var(--hover-row)' : 'transparent',
        color: 'var(--link)',
        fontSize: 'var(--t-ui)',
        fontWeight: 600,
      }}
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 400, color: 'var(--text2)' }}>
        {hint}
      </span>
    </li>
  )
}
