import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import Icon from '../../../components/ui/Icon'
import type { IconName } from '../../../components/ui/Icon'
import { useToast } from '../../../components/ui/Toast'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import { formatMoney, parseMoney, rupees } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { createClient } from '../../../actions/clients/createClient'
import {
  CLIENTS_DATA,
  PAYMENT_TERMS_OPTIONS,
  normalizedPhone,
  type ClientRecord,
  type ClientType,
  type MembershipTier,
} from '../../../data/clients'
import { PHONE_LOCAL_RE, PHONE_REJECTION, canonicalPhone, phoneLocalDigits } from '../../../lib/phone'
import { clientHealth } from './clientHealth'
import { ClientHealthChip, ClientHealthReasons, TOUCH } from './ClientHealthChip'

/**
 * **Add Client — New Booking spec §15-19.**
 *
 * §15: opens from a **+ New Client** control sitting beside the Client search
 * on the booking workspace, and must *not* navigate away. Today that control
 * does `navigate('/clients/new')`, which abandons a half-built booking; this
 * modal replaces that trip.
 *
 * ## §17 — "use the existing Client database fields, do not create a separate
 * duplicate Client model"
 *
 * `src/modules/clients/AddClient.tsx` is a full-page screen (`useNavigate` +
 * `PageHeader` + `Rail`, its state fanned out across ~25 `useState` calls, and
 * it exports nothing but its default component). Nothing in it is embeddable
 * and nothing in it is importable.
 *
 * So the shared pieces are taken from where AddClient itself takes them —
 * `src/data/clients.ts` (the `ClientRecord` shape, `ClientType`,
 * `MembershipTier`, `PAYMENT_TERMS_OPTIONS`, `normalizedPhone`) and
 * `src/actions/clients/createClient.ts` (the create action, permissions and
 * domain event). **No client shape is redeclared in this file.** What this
 * modal produces is a real `ClientRecord`, the same record `ClientDetail`,
 * `ClientsDirectory` and `NewRental` already read, so nothing downstream has
 * to learn a second shape.
 *
 * ## Why the dialog shell is local rather than `components/ui/Modal`
 *
 * `Modal` is the right *look*, and this shell mirrors its structure, tokens
 * and 150 ms fade exactly. It is not reused because it cannot do four things
 * §19 and the accessibility law require, and bolting them on would mean
 * editing a component six other screens depend on while other sessions are
 * live in this repo:
 *   1. no focus trap;
 *   2. no `aria-labelledby` — the dialog has no accessible name;
 *   3. Esc calls `onClose` unconditionally, so a stray Esc silently destroys
 *      typed client details (§19 wants the form to survive);
 *   4. nesting a second `Modal` for the discard confirm gives two competing
 *      `document.body.style.overflow` effects and two Esc listeners, so one
 *      Esc would dismiss both dialogs at once.
 * Folding these back into `components/ui/Modal` is the right follow-up; it is
 * a shared-component change and deliberately out of this pass's scope.
 *
 * ## Laws observed
 * - Law 17 — every label, prop and identifier reads "Client"; the banned
 *   synonym appears in no copy and no identifier here.
 * - Never colour alone — client health is icon + label + colour + reasons.
 * - 44px minimum touch target on every control, desktop included.
 * - Money is integer `Paisa` via `parseMoney`/`formatMoney`, never a float,
 *   never `toLocaleString`; every figure carries `className="figure"`.
 * - Errors are inline, beside the field, and persistent. Toasts carry the
 *   success only. No `alert()`.
 * - AD stored in UTC (`clientSinceAd`); BS is never stored.
 */

/* ── phone ───────────────────────────────────────────────────────────────
 *
 * The rule these helpers carry — the CHECK in migration 0005, what
 * normalisation may and may not touch, and why a bad number is rejected rather
 * than reshaped — is documented once in `lib/phone`. It moved out of this file
 * when `modules/clients/AddClient` turned out to be enforcing a looser rule
 * that accepted numbers the database rejects: the fix was one engine, not a
 * second correct copy.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ── client health (§18: "load client health") ───────────────────────────
 *
 * Deliberately **not** computed here. `./clientHealth` is this folder's single
 * health engine — the same verdict the combobox row, the quick view and the
 * history drawer render — and §13 fixes it at three bands (Good / Warning /
 * Attention Required) with a strict priority.
 *
 * An earlier draft of this file carried its own four-band engine
 * (`good | new | watch | risk`). Two engines in one folder is the precise drift
 * the stack exists to prevent: the same client would have read "Watch" here and
 * "Warning" one row away, with nothing to say which was right. That engine is
 * gone; `clientHealth()` is the only source, so a client's health cannot change
 * meaning depending on which control you happened to look at.
 */

/* ── defaults for a freshly created record ───────────────────────────────
 *
 * Both match what `modules/clients/AddClient.tsx` already defaults to, so a
 * client created from a booking and a client created from the Clients module
 * come out identical. Neither is a new product decision made here.
 */
const DEFAULT_MEMBERSHIP: MembershipTier = 'Creator'
const DEFAULT_CLIENT_TYPE: ClientType = 'Organisation'

const CLIENT_TYPE_OPTIONS: ReadonlyArray<{ value: ClientType; label: string; icon: IconName }> = [
  { value: 'Organisation', label: 'Organisation', icon: 'company' },
  { value: 'Individual', label: 'Individual', icon: 'person' },
]

/* ── styling — mirrors components/ui/Modal + modules/rentals/modals ──────── */

/** Matches `--dur` in theme.css, same constant `components/ui/Modal` keeps. */
const TRANSITION_MS = 150

/**
 * The backdrop scrim, matching `components/ui/Modal.tsx` exactly so this dialog
 * does not dim the app to a different depth than every other modal. theme.css
 * carries no scrim token, so the literal is the convention; it is named once
 * here and reused by the nested discard confirm rather than that confirm
 * inventing a third opacity of its own.
 */
const SCRIM = 'rgba(0, 0, 0, 0.6)'

/**
 * PLAN.md §0 — 44px minimum touch target on every device, desktop included.
 * Re-exported from `ClientHealthChip` rather than redeclared, so the booking
 * stack has one number for this and not two that can drift apart.
 */
const TAP = TOUCH

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function controlStyle(invalid: boolean): CSSProperties {
  return {
    width: '100%',
    minHeight: TAP,
    height: TAP,
    padding: '0 12px',
    borderRadius: 'var(--r-input)',
    border: `1px solid ${invalid ? 'var(--danger-text)' : 'var(--input-border)'}`,
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 'var(--t-ui)',
    fontFamily: 'inherit',
  }
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 'var(--sp-md)',
}

/**
 * Same skin as `components/ui/Page`'s `Button`, at 44px instead of 34px.
 * The shared button is below the minimum touch target and raising it there
 * would resize every button in the product — out of scope for this pass.
 */
function ActionButton({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  icon,
  buttonRef,
}: {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  icon?: IconName
  buttonRef?: RefObject<HTMLButtonElement>
}) {
  const skin: CSSProperties =
    variant === 'primary'
      ? { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', border: '1px solid transparent' }
      : variant === 'danger'
        ? { background: 'var(--btn-danger-bg)', color: 'var(--btn-danger-fg)', border: '1px solid transparent' }
        : variant === 'ghost'
          ? { background: 'transparent', color: 'var(--text2)', border: '1px solid transparent' }
          : { background: 'var(--btn-secondary-bg)', color: 'var(--text)', border: '1px solid var(--btn-secondary-border)' }

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onClick}
      disabled={disabled}
      className="press"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: TAP,
        padding: '0 16px',
        borderRadius: 'var(--r-btn)',
        fontSize: 'var(--t-ui)',
        fontWeight: 600,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...skin,
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

/** Label + control + persistent inline error, sitting beside the field it belongs to (§19). */
function Field({
  id,
  label,
  required,
  error,
  help,
  group,
  children,
}: {
  id: string
  label: string
  required?: boolean
  /* `| undefined` is spelled out because tsconfig sets exactOptionalPropertyTypes
     and every call site reads `errors[key]`, which is `string | undefined`. */
  error?: string | undefined
  help?: ReactNode
  /**
   * The control is a set of buttons, not one labelable element. `htmlFor` on a
   * `<button>` is legal but replaces that button's own accessible name, so the
   * Organisation button would announce as "Client Type" — the label becomes a
   * plain `<span>` instead and the group points at it with `aria-labelledby`.
   */
  group?: boolean
  children: ReactNode
}) {
  const labelContent = (
    <>
      {label}
      {required && (
        <span style={{ color: 'var(--danger-text)' }} aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </>
  )
  const labelStyle: CSSProperties = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {group ? (
        <span id={`${id}-label`} style={labelStyle}>
          {labelContent}
        </span>
      ) : (
        <label htmlFor={id} style={labelStyle}>
          {labelContent}
        </label>
      )}
      {children}
      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 5,
            fontSize: 'var(--t-th)',
            fontWeight: 600,
            color: 'var(--danger-text)',
          }}
        >
          <Icon name="error" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </span>
      ) : (
        help && (
          <span id={`${id}-help`} style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            {help}
          </span>
        )
      )}
    </div>
  )
}

/* ── props ───────────────────────────────────────────────────────────────── */

export interface AddClientModalProps {
  isOpen: boolean
  /** Called when the dialog should close. Never called while the form is dirty and unsaved — the discard confirm runs first. */
  onClose: () => void
  /**
   * §18 — fires the moment the client is saved, *before* the operator dismisses
   * the dialog, so the booking behind it already has the new client selected.
   * Hands back a complete `ClientRecord`: selecting it loads client health,
   * pricing rules (membership tier + any standing discount) and payment terms
   * from one object, with no follow-up lookup.
   *
   * **Do not close the modal from this handler** — the modal shows its own
   * success confirmation and calls `onClose` when the operator continues.
   */
  onCreated: (client: ClientRecord) => void
  /**
   * Used when the phone number matches a client that already exists and the
   * operator picks it instead of creating a duplicate. Falls back to
   * `onCreated` when not supplied.
   */
  onUseExisting?: ((client: ClientRecord) => void) | undefined
  /** Seeds the name field from whatever was typed in the client search. */
  initialName?: string | undefined
  /** Existing clients, for duplicate detection. Defaults to the live store. */
  clients?: ClientRecord[] | undefined
}

export function AddClientModal({
  isOpen,
  onClose,
  onCreated,
  onUseExisting,
  initialName,
  clients = CLIENTS_DATA,
}: AddClientModalProps) {
  const { showSuccessToast } = useToast()
  const canSeeMoney = useCanViewMoney()
  const uid = useId()

  const headingId = `${uid}-heading`
  const confirmHeadingId = `${uid}-confirm-heading`

  /* §16 — the field set, and nothing beyond it except Payment Terms, which §18
     names as part of the mandatory save chain ("load payment terms"). It is an
     existing `ClientRecord` field, not a new one, and without capturing it the
     last step of that chain could only ever resolve to nothing. */
  const [clientType, setClientType] = useState<ClientType>(DEFAULT_CLIENT_TYPE)
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pan, setPan] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<ClientRecord | null>(null)
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)

  // Kept mounted for one transition after isOpen flips false so the fade plays,
  // the same contract components/ui/Modal uses.
  const [shouldRender, setShouldRender] = useState(isOpen)

  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const keepEditingRef = useRef<HTMLButtonElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  const localDigits = phoneLocalDigits(phone)
  const phoneWillSave = phone.trim() ? canonicalPhone(phone) : ''
  const creditLimitPaisa: Paisa | null = creditLimit.trim() ? parseMoney(creditLimit) : null

  /* The name the field was seeded with from the search box. Dirtiness is
     measured against it, not against empty, so Esc immediately after opening
     a pre-filled dialog just closes instead of asking about work nobody did. */
  const [seededName, setSeededName] = useState('')

  const isDirty =
    !created &&
    Boolean(
      name.trim() !== seededName ||
        contactPerson.trim() ||
        phone.trim() ||
        email.trim() ||
        pan.trim() ||
        notes.trim() ||
        creditLimit.trim() ||
        paymentTerms ||
        clientType !== DEFAULT_CLIENT_TYPE,
    )

  /* `initialName` tracks the booking page's live search box, so it is read
     through a ref rather than a dependency: as a dependency, every keystroke
     in the search field behind the dialog would re-run this and wipe the form
     the operator is currently filling in. */
  const initialNameRef = useRef(initialName)
  initialNameRef.current = initialName

  /* Reset on each fresh open so a cancelled draft never bleeds into the next
     booking, and re-seed the name from the search box the operator came from. */
  useEffect(() => {
    if (!isOpen) return
    const seed = initialNameRef.current?.trim() ?? ''
    setClientType(DEFAULT_CLIENT_TYPE)
    setSeededName(seed)
    setName(seed)
    setContactPerson('')
    setPhone('')
    setEmail('')
    setPan('')
    setCreditLimit('')
    setPaymentTerms('')
    setNotes('')
    setErrors({})
    setSubmitError(null)
    setSaving(false)
    setCreated(null)
    setDismissedDuplicate(false)
    setShowDiscard(false)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      return
    }
    const t = window.setTimeout(() => setShouldRender(false), TRANSITION_MS)
    return () => window.clearTimeout(t)
  }, [isOpen])

  // Body scroll lock + focus restore.
  useEffect(() => {
    if (!isOpen) return
    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      restoreFocusTo.current?.focus()
    }
  }, [isOpen])

  // Initial focus lands on the first field (§ modal mechanics).
  useEffect(() => {
    if (!isOpen) return
    const t = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [isOpen])

  // Focus moves into the discard confirm when it opens, onto the safe choice.
  useEffect(() => {
    if (!showDiscard) return
    const t = window.setTimeout(() => keepEditingRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [showDiscard])

  /** Esc, and the backdrop, both route through here — never straight to onClose. */
  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscard(true)
      return
    }
    onClose()
  }, [isDirty, onClose])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (showDiscard) {
        setShowDiscard(false)
        return
      }
      requestClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen, showDiscard, requestClose])

  /** Tab cycles inside the dialog — or inside the discard confirm when it is up. */
  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab') return
    const root = showDiscard ? confirmRef.current : dialogRef.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
    )
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    } else if (showDiscard && !root.contains(document.activeElement)) {
      e.preventDefault()
      first.focus()
    }
  }

  const clearError = (key: string) =>
    setErrors((prev) => (prev[key] === undefined ? prev : { ...prev, [key]: undefined }))

  /** Phone match against clients already on file — a duplicate client is worse than a re-search. */
  const duplicate = useMemo<ClientRecord | null>(() => {
    if (dismissedDuplicate || created) return null
    if (!PHONE_LOCAL_RE.test(localDigits)) return null
    const digits = normalizedPhone(canonicalPhone(phone))
    return clients.find((c) => !c.mergedIntoId && normalizedPhone(c.phone) === digits) ?? null
  }, [dismissedDuplicate, created, localDigits, phone, clients])

  /** §19 — every miss reports beside its own field, and the dialog stays open. */
  function validate(): boolean {
    const next: Record<string, string | undefined> = {}

    if (!name.trim()) {
      next.name = clientType === 'Organisation' ? 'Company / client name is required.' : 'Client name is required.'
    }

    if (!phone.trim()) {
      next.phone = 'Phone number is required.'
    } else if (!PHONE_LOCAL_RE.test(localDigits)) {
      next.phone = PHONE_REJECTION
    }

    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address, or leave it blank.'
    }

    if (creditLimit.trim()) {
      if (creditLimitPaisa === null) {
        next.creditLimit = 'Enter an amount in rupees — for example 1,00,000.'
      } else if (creditLimitPaisa < 0) {
        next.creditLimit = 'Credit limit cannot be negative.'
      }
    }

    setErrors(next)

    const firstBad = (['name', 'phone', 'email', 'creditLimit'] as const).find((k) => next[k])
    if (firstBad === 'name') nameRef.current?.focus()
    else if (firstBad === 'phone') phoneRef.current?.focus()

    return firstBad === undefined
  }

  /**
   * §18's chain, in order: create client → save → the booking behind this
   * dialog selects it (`onCreated`) → health, pricing rules and payment terms
   * all resolve off the one record that is handed back → the operator sees a
   * confirmation naming the client and its health.
   */
  async function handleSave() {
    if (saving || created) return
    setSubmitError(null)
    if (!validate()) return

    setSaving(true)
    try {
      const savedPhone = canonicalPhone(phone)
      const res = await createClient({
        name: name.trim(),
        phone: savedPhone,
        email: email.trim(),
        isDraft: false,
      })

      const record: ClientRecord = {
        id: res.clientId,
        name: name.trim(),
        clientType,
        membership: DEFAULT_MEMBERSHIP,
        phone: savedPhone,
        email: email.trim(),
        currentRentalsCount: 0,
        activeBookings: [],
        outstandingPaisa: rupees(0),
        depositHeldPaisa: rupees(0),
        creditLimitPaisa: creditLimitPaisa ?? rupees(0),
        creditUsedPaisa: rupees(0),
        lastRentalAd: '—',
        lastRentalBs: '—',
        address: '',
        contactPerson: { name: contactPerson.trim(), designation: '', phone: savedPhone },
        kycStatus: 'Not Submitted',
        kycDocsCount: 0,
        totalRentalsCount: 0,
        totalSpentPaisa: rupees(0),
        // Law: AD stored in UTC, BS rendered and never stored.
        clientSinceAd: new Date().toISOString().slice(0, 10),
        ...(pan.trim() ? { pan: pan.trim() } : {}),
        ...(paymentTerms ? { paymentTerms } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }

      /* Phase 1 has no data layer — `CLIENTS_DATA` *is* the store every client
         screen reads, including the booking page's own selector, which
         resolves the selected client with `CLIENTS_DATA.find(...)`. Without
         this the new client would be selected against a record that does not
         exist and §18's "never have to search for it" would not hold. Replace
         with the real insert + refetch when the query layer lands.

         ⚠ `actions/clients/createClient.ts` mints ids as
         `CL-${Date.now().toString().slice(-4)}`, which both drifts from the
         seed convention (`CL-2026-0001`) and repeats every 10 seconds. A
         collision is stated rather than swallowed: silently skipping the push
         would leave the booking pointing at somebody else's record. */
      const collision = CLIENTS_DATA.find((c) => c.id === record.id)
      if (collision && collision !== record) {
        setSubmitError(
          `The client was saved but its generated id (${record.id}) already belongs to “${collision.name}”. ` +
            'Open the Clients module and confirm the record before booking against it.',
        )
        return
      }
      CLIENTS_DATA.push(record)

      setCreated(record)
      onCreated(record)
      showSuccessToast('Client created', `${record.id} · ${record.name}`)
    } catch (err) {
      // Law 12 — the failure states itself inline and stays there. No toast, no alert().
      setSubmitError(err instanceof Error ? err.message : 'Could not save the client. Nothing was created.')
    } finally {
      setSaving(false)
    }
  }

  function handleUseExisting(c: ClientRecord) {
    ;(onUseExisting ?? onCreated)(c)
    onClose()
  }

  if (!shouldRender) return null

  const health = created ? clientHealth(created) : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-lg)',
        background: SCRIM,
        opacity: isOpen ? 1 : 0,
        transition: 'opacity var(--dur) ease',
      }}
    >
      <div style={{ position: 'fixed', inset: 0 }} onClick={requestClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={trapTab}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 580,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-modal)',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : 'scale(0.97)',
          transition: 'opacity var(--dur) ease, transform var(--dur) ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 id={headingId} style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
              {created ? 'Client Created' : 'Add New Client'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {created
                ? 'Selected on this booking — no need to search for it.'
                : 'Creates the client and selects it here. Your booking stays exactly as it is.'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close Add New Client"
            className="press"
            style={{
              width: TAP,
              height: TAP,
              flexShrink: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              borderRadius: 'var(--r-btn)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {created && health ? (
            /* ── §18 · the confirmation ─────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--sp-md)',
                  padding: 14,
                  borderRadius: 'var(--r-card)',
                  background: 'var(--st-in-bg)',
                  color: 'var(--st-in-fg)',
                }}
              >
                <Icon name="check" size={20} fill style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>{created.name}</div>
                  <div style={{ fontSize: 'var(--t-meta)', marginTop: 2 }}>
                    <span className="figure">{created.id}</span> · {created.clientType} ·{' '}
                    <span className="figure">{created.phone}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-card)',
                  background: 'var(--card2)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Client health</span>
                  <ClientHealthChip verdict={health} size="md" />
                </div>
                {/* The sentences behind the colour — same renderer the combobox row
                    and quick view use, so the reasons cannot be worded two ways. */}
                <ClientHealthReasons verdict={health} />

                <div style={{ height: 1, background: 'var(--divider)' }} />

                <SummaryRow label="Pricing rule" value={`Membership tier — ${created.membership}`} />
                <SummaryRow
                  label="Standing discount"
                  value={
                    created.standingDiscountPercent !== undefined ? `${created.standingDiscountPercent}%` : 'None set'
                  }
                  mono={created.standingDiscountPercent !== undefined}
                />
                <SummaryRow label="Payment terms" value={created.paymentTerms ?? 'Not set'} />
                {canSeeMoney && (
                  <SummaryRow label="Credit limit" value={formatMoney(created.creditLimitPaisa)} mono />
                )}
              </div>

              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Address, documents and KYC are not captured here. Complete them from the client record when the
                booking is done — a booking cannot be confirmed without a PAN on file.
              </p>
            </div>
          ) : (
            /* ── the form ───────────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              {submitError && (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--sp-sm)',
                    padding: '10px 14px',
                    borderRadius: 'var(--r-btn)',
                    background: 'var(--st-danger-bg)',
                    color: 'var(--st-danger-fg)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                  }}
                >
                  <Icon name="error" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  {submitError}
                </div>
              )}

              {duplicate && (
                <div
                  style={{
                    padding: 'var(--sp-md)',
                    borderRadius: 'var(--r-card)',
                    background: 'var(--st-progress-bg)',
                    color: 'var(--st-progress-fg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)' }}>
                    <Icon name="alert_triangle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0, fontSize: 'var(--t-meta)' }}>
                      <strong style={{ fontWeight: 700 }}>This phone number is already on file.</strong>
                      <div style={{ marginTop: 2 }}>
                        {duplicate.name} · <span className="figure">{duplicate.id}</span> ·{' '}
                        <span className="figure">{duplicate.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                    <ActionButton variant="secondary" icon="check" onClick={() => handleUseExisting(duplicate)}>
                      Use This Client
                    </ActionButton>
                    <ActionButton variant="ghost" onClick={() => setDismissedDuplicate(true)}>
                      Not the same — carry on
                    </ActionButton>
                  </div>
                </div>
              )}

              <Field id={`${uid}-type`} label="Client Type" group>
                <div
                  style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}
                  role="group"
                  aria-labelledby={`${uid}-type-label`}
                >
                  {CLIENT_TYPE_OPTIONS.map((opt) => {
                    const on = clientType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setClientType(opt.value)}
                        aria-pressed={on}
                        className="press"
                        style={{
                          flex: '1 1 140px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                          minHeight: TAP,
                          padding: '0 12px',
                          borderRadius: 'var(--r-btn)',
                          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                          background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text)',
                          fontWeight: on ? 700 : 500,
                          fontSize: 'var(--t-ui)',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name={opt.icon} size={16} />
                        {opt.label}
                        {on && <Icon name="check" size={14} />}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div style={rowStyle}>
                <Field
                  id={`${uid}-name`}
                  label={clientType === 'Organisation' ? 'Company / Client Name' : 'Client Name'}
                  required
                  error={errors.name}
                >
                  <input
                    id={`${uid}-name`}
                    ref={nameRef}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      clearError('name')
                    }}
                    placeholder={clientType === 'Organisation' ? 'e.g. Himalayan Films Pvt. Ltd.' : 'e.g. Suman Karki'}
                    aria-required="true"
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? `${uid}-name-error` : undefined}
                    style={controlStyle(Boolean(errors.name))}
                  />
                </Field>

                <Field id={`${uid}-contact`} label="Contact Person" help="Who to call on the day of pickup.">
                  <input
                    id={`${uid}-contact`}
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Anjali Rai"
                    aria-describedby={`${uid}-contact-help`}
                    style={controlStyle(false)}
                  />
                </Field>
              </div>

              <div style={rowStyle}>
                <Field
                  id={`${uid}-phone`}
                  label="Phone"
                  required
                  error={errors.phone}
                  help={
                    <>
                      Nepali mobile — 10 digits starting <span className="figure">97</span> or{' '}
                      <span className="figure">98</span>.{' '}
                      {phoneWillSave && PHONE_LOCAL_RE.test(localDigits) ? (
                        <>
                          Saved as <span className="figure">{phoneWillSave}</span>
                        </>
                      ) : (
                        <>
                          For example <span className="figure">9801234567</span>
                        </>
                      )}
                    </>
                  }
                >
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        ...controlStyle(false),
                        width: 78,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text2)',
                        background: 'var(--card2)',
                      }}
                      className="figure"
                    >
                      +977
                    </span>
                    <input
                      id={`${uid}-phone`}
                      ref={phoneRef}
                      value={phone}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      onChange={(e) => {
                        setPhone(e.target.value)
                        setDismissedDuplicate(false)
                        clearError('phone')
                      }}
                      placeholder="9801234567"
                      aria-required="true"
                      aria-invalid={errors.phone ? true : undefined}
                      aria-describedby={errors.phone ? `${uid}-phone-error` : `${uid}-phone-help`}
                      className="figure"
                      style={{ ...controlStyle(Boolean(errors.phone)), flex: 1 }}
                    />
                  </div>
                </Field>

                <Field id={`${uid}-email`} label="Email" error={errors.email}>
                  <input
                    id={`${uid}-email`}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      clearError('email')
                    }}
                    placeholder="e.g. bookings@company.com"
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? `${uid}-email-error` : undefined}
                    style={controlStyle(Boolean(errors.email))}
                  />
                </Field>
              </div>

              <div style={rowStyle}>
                <Field
                  id={`${uid}-pan`}
                  label="Government ID / PAN"
                  help="Needed before this booking can be confirmed."
                >
                  <input
                    id={`${uid}-pan`}
                    value={pan}
                    onChange={(e) => setPan(e.target.value)}
                    placeholder="e.g. 600123456"
                    aria-describedby={`${uid}-pan-help`}
                    className="figure"
                    style={controlStyle(false)}
                  />
                </Field>

                {canSeeMoney && (
                  <Field
                    id={`${uid}-credit`}
                    label="Credit Limit"
                    error={errors.creditLimit}
                    help={
                      creditLimitPaisa !== null && creditLimitPaisa >= 0 ? (
                        <>
                          <span className="figure">{formatMoney(creditLimitPaisa)}</span>
                        </>
                      ) : (
                        <>
                          Rupees. Leave blank for <span className="figure">Rs 0</span> — pay-later off.
                        </>
                      )
                    }
                  >
                    <input
                      id={`${uid}-credit`}
                      value={creditLimit}
                      inputMode="numeric"
                      onChange={(e) => {
                        setCreditLimit(e.target.value)
                        clearError('creditLimit')
                      }}
                      placeholder="e.g. 1,00,000"
                      aria-invalid={errors.creditLimit ? true : undefined}
                      aria-describedby={errors.creditLimit ? `${uid}-credit-error` : `${uid}-credit-help`}
                      className="figure"
                      style={controlStyle(Boolean(errors.creditLimit))}
                    />
                  </Field>
                )}
              </div>

              {canSeeMoney && (
                <Field id={`${uid}-terms`} label="Payment Terms">
                  <select
                    id={`${uid}-terms`}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    style={controlStyle(false)}
                  >
                    <option value="">Not set</option>
                    {PAYMENT_TERMS_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field id={`${uid}-notes`} label="Notes">
                <textarea
                  id={`${uid}-notes`}
                  value={notes}
                  maxLength={300}
                  rows={3}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the crew should know about this client…"
                  style={{ ...controlStyle(false), height: 'auto', minHeight: 84, padding: 10, resize: 'vertical' }}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 'var(--sp-md)',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--card2)',
            flexShrink: 0,
          }}
        >
          {created ? (
            <ActionButton variant="primary" icon="arrow_right" onClick={onClose}>
              Continue Booking
            </ActionButton>
          ) : (
            <>
              <ActionButton variant="secondary" onClick={requestClose} disabled={saving}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" icon="plus" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Creating Client…' : 'Create & Select Client'}
              </ActionButton>
            </>
          )}
        </div>

        {/* Discard confirm — losing typed client details to a stray Esc is a real loss. */}
        {showDiscard && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              display: 'grid',
              placeItems: 'center',
              padding: 20,
              background: SCRIM,
            }}
          >
            <div
              ref={confirmRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={confirmHeadingId}
              style={{
                width: '100%',
                maxWidth: 380,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card)',
                boxShadow: 'var(--shadow-modal)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="alert_triangle" size={20} style={{ color: 'var(--warning-text)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <h3
                    id={confirmHeadingId}
                    style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}
                  >
                    Discard this client?
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    Nothing has been saved. The details you typed will be lost — your booking is untouched either way.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <ActionButton variant="secondary" onClick={() => setShowDiscard(false)} buttonRef={keepEditingRef}>
                  Keep Editing
                </ActionButton>
                <ActionButton
                  variant="danger"
                  onClick={() => {
                    setShowDiscard(false)
                    onClose()
                  }}
                >
                  Discard
                </ActionButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{label}</span>
      <span
        className={mono ? 'figure' : undefined}
        style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}
      >
        {value}
      </span>
    </div>
  )
}

export default AddClientModal
