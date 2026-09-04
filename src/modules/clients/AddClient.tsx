import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Input, Select, DateField } from '../../components/ui'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney, parseMoney } from '../../lib/money'
import { toBs, formatBs, formatAd, getBusinessToday } from '../../lib/bs'
import { useViewport } from '../../lib/device'
/* The phone rule is `lib/phone`'s, not this screen's — see that module's header
   for the CHECK it mirrors and why three screens may not each own a copy.
   Deliberately NOT gated on the `country` field below: the constraint is
   unconditional, this field is fixed at +977, and gating it meant an address
   outside Nepal reopened the identical hole. */
import { PHONE_LOCAL_RE, PHONE_REJECTION, canonicalPhone, phoneLocalDigits } from '../../lib/phone'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import type { ActionContext } from '../../actions/core'
import { findClientsByPhoneTail } from '../../lib/queries/clients'
import {
  CLIENT_SOURCES,
  PAYMENT_TERMS_OPTIONS,
  PREFERRED_CONTACT_METHODS,
  NEPAL_DISTRICTS,
  MEMBERSHIP_TIERS,
  type ClientType,
  type ClientRecord,
  type MembershipTier,
  type OrganisationType,
  type Profession,
  type Segment,
} from '../../data/clients'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * Add Client — full-page creation workflow, replacing the old "Register New
 * Client" modal (Foundation-style Global spec §14: rental/inventory/customer
 * creation are full pages, never modals — the app already follows this for
 * Rentals and Inventory; Clients was the one holdout).
 *
 * CLAUDE.md / PLAN.md law 17 — the word "customer" never appears in the UI.
 * The source design this was built from used "Customer" throughout; every
 * label, route and field name here reads "Client" instead. "Customer Group"
 * had no equivalent in this app's data model, so it is not a new field — it
 * is the existing Membership Tier, which already drives credit/discount
 * policy elsewhere (Clients → Credit tab).
 *
 * Save dispatches the implemented `createClient` action and reports from its
 * own outcome (see `handleSave`), and the duplicate warning asks the database
 * — `client_directory_v` through `lib/queries/clients` (Law 2), not the
 * retired `CLIENTS_DATA` seed array, so it can only ever name a client that
 * actually exists.
 */

const TYPE_OPTIONS: Array<{ value: ClientType; label: string; icon: IconName; blurb: string; example: string }> = [
  { value: 'Organisation', label: 'Organisation', icon: 'company', blurb: 'Production houses, companies, organizations.', example: 'e.g. Himalayan Films Pvt. Ltd.' },
  { value: 'Individual', label: 'Individual', icon: 'person', blurb: 'Freelancers, directors, DOPs, photographers.', example: 'e.g. Suman Karki' },
]

const ORG_TYPES: OrganisationType[] = [
  'Production House', 'Rental House', 'College / Institution', 
  'Corporate / Agency', 'Government / NGO', 'Broadcaster', 'Other'
]

const PROFESSIONS: Profession[] = [
  'Cinematographer', 'Director', 'Assistant Camera', 'Gaffer', 
  'Editor', 'Photographer', 'Producer', 'Sound', 'Other'
]

const SEGMENTS: Segment[] = [
  'Wedding / Event', 'Corporate', 'Documentary', 'Music Video', 
  'Commercial', 'Feature', 'YouTube / Creator', 'Education', 'Other'
]

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_BYTES = 10 * 1024 * 1024

interface DocDraft {
  id: string
  file: File
}

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatSinceDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return '—'
  const bs = toBs(d)
  return bs ? `${formatBs(bs)} · ${formatAd(d)}` : formatAd(d)
}

/* Law 15 — 44 is the minimum hit area, and `--tap` is the single place that
   number is written. Every consumer here is a field in the New Client form, one
   per line with nothing to collide with, so `minHeight` (not `height`) — the
   notes textarea at the bottom still overrides to `auto` and grows past it. */
const inputStyle = (hasError?: boolean): CSSProperties => ({
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '0 12px',
  borderRadius: 'var(--r-input)',
  border: `1px solid ${hasError ? 'var(--danger-text)' : 'var(--border)'}`,
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-ui)',
  fontFamily: 'inherit',
})

function Field({
  label,
  required,
  error,
  help,
  children,
}: {
  label: string
  required?: boolean
  /* `| undefined` is explicit because tsconfig sets exactOptionalPropertyTypes:
     callers read `errors[field]`, which is `string | undefined` on a miss, and
     without it every call site would need a `?? null`. */
  error?: string | null | undefined
  /** Standing rule for the field, shown until an error takes its place. */
  help?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
        {label} {required && <span style={{ color: 'var(--danger-text)' }}>*</span>}
      </label>
      {children}
      {error ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
          <Icon name="error" size={12} />
          {error}
        </span>
      ) : (
        help && <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{help}</span>
      )}
    </div>
  )
}

function SectionCard({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 'var(--t-th)',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
      </div>
      <div style={{ padding: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>{children}</div>
    </section>
  )
}

const fieldRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--sp-lg)' }

/**
 * Everything this form collects that the `clients` table has nowhere to put.
 *
 * Stated on the page, next to Save, rather than dropped in silence. A form that
 * accepts a credit limit and discards it is the same class of untruth as a
 * success toast for a write that did not happen — the operator typed a fact and
 * has no way to learn it was not kept.
 *
 * Each line names the reason, and none of them is "not built yet":
 *  - credit limit / payment terms — `0005_clients.sql:162-164`: writable ONLY by
 *    an Approved `client_commercial_overrides` row, "no direct UPDATE path, for
 *    any role including Owner". This screen is not that path and must not be.
 *  - membership tier — a `client_memberships` row, not a column on `clients`.
 *  - preferred contact — the `preferred_contact_channel` enum is
 *    Email | SMS | WhatsApp | Push; this form offers Phone, which is not a
 *    member. The column keeps its `{WhatsApp}` default rather than having the
 *    operator's answer mapped onto a channel they did not pick.
 *  - documents — KYC files need a storage bucket and a `client_documents` row;
 *    neither is wired.
 *  - professions / segments / source / referred by — enum arrays and a uuid FK
 *    that this form collects as free text.
 */
const NOT_SAVED_YET: string[] = [
  'Credit limit and payment terms — these are set by an approved commercial override, never typed on a client form',
  'Membership tier — held on a separate membership record',
  'Preferred contact methods — the stored list has no “Phone” option, so the default (WhatsApp) is kept',
  'Uploaded documents — KYC file storage is not wired',
  'Professions, segments, source and “referred by”',
]

export default function AddClient() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()
  const money = useCanViewMoney()
  const viewport = useViewport()
  const { user } = useAuth()
  const online = useNetwork()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [clientType, setClientType] = useState<ClientType>('Organisation')
  const [orgType, setOrgType] = useState<OrganisationType>('Production House')
  const [professions, setProfessions] = useState<Profession[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [designation, setDesignation] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('Nepal')
  const [businessRegNo, setBusinessRegNo] = useState('')
  const [pan, setPan] = useState('')
  const [website, setWebsite] = useState('')
  const [govIdType, setGovIdType] = useState('Citizenship')

  const [clientSince, setClientSince] = useState(TODAY.toISOString().slice(0, 10))
  const [source, setSource] = useState('')
  const [referredBy, setReferredBy] = useState('')
  const [membership, setMembership] = useState<MembershipTier>('Creator')
  const [creditLimit, setCreditLimit] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [preferredMethods, setPreferredMethods] = useState<string[]>(['Phone', 'Email', 'WhatsApp'])
  const [notes, setNotes] = useState('')

  const [documents, setDocuments] = useState<DocDraft[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false)
  const [duplicateMatch, setDuplicateMatch] = useState<ClientRecord | null>(null)
  /**
   * Set when the duplicate lookup itself failed — a degraded check is stated,
   * never silently skipped (Law 12: inline and persistent). The database's
   * phone unique constraint remains the real backstop at Save.
   */
  const [dupCheckError, setDupCheckError] = useState<string | null>(null)
  const [showDiscard, setShowDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  /**
   * The one place a failed save is reported. Law 12 — errors are inline and
   * persistent; the toast channel carries successes only, and `useToast`
   * exposes nothing else.
   */
  const [saveError, setSaveError] = useState<string | null>(null)

  /**
   * **Law 8 — one key per user action, not one per attempt.**
   *
   * Minted the first time Save is pressed and reused by every retry of that
   * same press, so a double-click or a "try again" after a network wobble
   * conflicts on `clients_client_uuid_key` and returns the client that already
   * exists, instead of creating a second one that then collides on the phone
   * unique constraint.
   *
   * ⛔ **Keyed on the identity fields, not on the mount** (item 2.6c). The
   * previous version minted once per page load and never again — so after a
   * FAILED save, correcting the form into a genuinely different client
   * (another name, another phone) replayed the first client's key:
   * `idempotentInsert` read the 23505 on `client_uuid` as "already saved" and
   * handed back the FIRST client, silently swallowing the second. The key is
   * therefore paired with the identity (name/phone/email) it was minted for:
   * a pure retry of the same client replays the same key; an edit into a
   * different client mints a fresh one. Non-identity edits (address, notes)
   * keep the key — correcting a typo in the city is still the same client.
   */
  const saveKey = useRef<{ key: string; identity: string } | null>(null)

  const clearError = (key: string) => setErrors((prev) => (prev[key] ? { ...prev, [key]: null } : prev))

  const phoneLocal = phoneLocalDigits(phone)
  const phoneIsValid = PHONE_LOCAL_RE.test(phoneLocal)
  /** The exact string that will be saved — echoed under the field, never guessed at. */
  const phoneWillSave = phoneIsValid ? canonicalPhone(phone) : ''

  const toggleProfession = (p: Profession) =>
    setProfessions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  
  const toggleSegment = (s: Segment) =>
    setSegments((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const togglePreferred = (m: string) =>
    setPreferredMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  /**
   * Duplicate detection, against the database. Debounced because it runs as
   * the operator types; cancelled on every phone change so a slow older
   * response cannot overwrite a newer one. The check queries
   * `client_directory_v` server-side (`findClientsByPhoneTail`) — it never
   * downloads the client table to match in the browser.
   *
   * A changed number is a fresh question, so a "Continue Anyway" dismissal is
   * cleared here the moment the phone changes — previously the dismissal was
   * permanent and a *second, different* duplicate typed after dismissing the
   * first produced no warning at all (docs/pages/05 §7.8).
   */
  useEffect(() => {
    setDismissedDuplicate(false)
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) {
      setDuplicateMatch(null)
      setDupCheckError(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      findClientsByPhoneTail(phone)
        .then((matches) => {
          if (cancelled) return
          setDuplicateMatch(matches[0] ?? null)
          setDupCheckError(null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          // An unreachable check must not pretend it found nothing.
          setDuplicateMatch(null)
          setDupCheckError(err instanceof Error ? err.message : String(err))
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [phone])

  const isDirty = Boolean(
    name.trim() ||
      contactName.trim() ||
      designation.trim() ||
      email.trim() ||
      phone.trim() ||
      address.trim() ||
      city.trim() ||
      district.trim() ||
      postalCode.trim() ||
      businessRegNo.trim() ||
      pan.trim() ||
      referredBy.trim() ||
      notes.trim() ||
      documents.length > 0 ||
      (money && creditLimit.trim().length > 0) ||
      (money && paymentTerms.length > 0),
  )

  const summaryRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = []
    if (contactName.trim()) rows.push({ label: 'Contact', value: contactName.trim() })
    if (phone.trim()) {
      // The summary echoes what will be stored, so it cannot show a different
      // number than the one the CHECK will see. Computed from `phone` rather
      // than read off the component so this memo's deps stay honest.
      const local = phoneLocalDigits(phone)
      rows.push({ label: 'Phone', value: PHONE_LOCAL_RE.test(local) ? canonicalPhone(phone) : `+977 ${local}` })
    }
    if (email.trim()) rows.push({ label: 'Email', value: email.trim() })
    if (city.trim()) rows.push({ label: 'City', value: city.trim() })
    rows.push({ label: 'Group', value: membership })
    if (money && paymentTerms) rows.push({ label: 'Payment Terms', value: paymentTerms })
    if (money && creditLimit.trim()) {
      const parsed = parseMoney(creditLimit)
      if (parsed !== null) rows.push({ label: 'Credit Limit', value: formatMoney(parsed) })
    }
    rows.push({ label: 'Client Since', value: formatSinceDate(clientSince) })
    return rows
  }, [contactName, phone, email, city, membership, money, paymentTerms, creditLimit, clientSince])

  /**
   * The required set (ruling, 12 Aug 2026): **name and phone**.
   *
   * Phone is the one that earns it — it is the only unique key a client has, so
   * duplicate detection and the merge tool have nothing to match on without it.
   * Contact person, address and city used to gate Save and no longer do: they
   * are information someone fills in later, and gating on them meant a
   * correction had to be a re-creation.
   *
   * Format checks are untouched. Optional does not mean unvalidated — a phone
   * or an email that is *present* still has to be shaped correctly.
   *
   * **Ruled 12 Aug 2026 (PLAN.md §4.25): country is optional too.** The whole
   * address block — address, city, district, postal code, country — is now
   * fillable later. The incoherence this comment used to flag (a client with a
   * country and no city) is gone because the last gate went with it.
   */
  function validate(): boolean {
    const e: Record<string, string | null> = {}
    if (!name.trim()) e.name = clientType === 'Organisation' ? 'Organisation Name is required.' : 'Full Name is required.'
    if (!phone.trim()) {
      e.phone = 'Phone Number is required — duplicate detection and the merge tool match on it.'
    } else if (!PHONE_LOCAL_RE.test(phoneLocal)) {
      e.phone = PHONE_REJECTION
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = 'Enter a valid email address.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /** `ActionContext` — the signed-in identity, or null. The dispatcher substitutes no default. */
  const dispatchContext = (): ActionContext | null =>
    user ? { userId: user.id, role: user.role, isOnline: online } : null

  /**
   * Save — awaited, and reported from its own outcome.
   *
   * ⛔ **What this replaced.** The previous version fired the action into a
   * floating promise with no `.catch()`, then set a 700 ms timer that flipped
   * the button to "Client Saved", raised
   * `showSuccessToast('Client created successfully', 'CL-2026-0025 · …')`, and
   * navigated to `/clients` 900 ms later. Every one of those was unconditional:
   * the action rejected (it was a stub, and `core.ts` throws
   * `ActionNotImplementedError` before `execute`), the rejection was never
   * observed, and the client code in the toast was `issue('CL',
   * CLIENTS_DATA.length + 1)` — derived from the length of a seed array, not
   * from any registry. So the operator was shown a reference number for a
   * client that did not exist, on a screen that then navigated away from the
   * form holding the only copy of what they had typed.
   *
   * Success reporting now lives on the resolved path and nowhere else, and the
   * code in the toast is the one the database allocated.
   */
  async function handleSave() {
    if (!validate()) return

    const ctx = dispatchContext()
    if (!ctx) {
      setSaveError(
        'You are not signed in, so this client cannot be saved — a client record has to name who created it. ' +
          'Sign in and try again.',
      )
      return
    }

    setSaveError(null)
    setSaving(true)
    /* Law 8: one key per CLIENT, reused by every retry of the same client.
       The identity is the canonical stored forms — the same strings the
       payload below carries — so a whitespace or formatting edit does not
       read as a different client, and a real identity edit does. */
    const identity = `${name.trim()}|${canonicalPhone(phone)}|${email.trim().toLowerCase()}`
    if (!saveKey.current || saveKey.current.identity !== identity) {
      saveKey.current = { key: newClientUuid(), identity }
    }

    try {
      const { createClient } = await import('../../actions/clients/createClient')
      const created = await createClient(
        {
          name: name.trim(),
          // Saved with the country code the CHECK requires, and only ever the
          // digits the operator actually typed — `validate()` has already run.
          phone: canonicalPhone(phone),
          email: email.trim(),
          /* `ClientType` carries a third member, 'Unassigned', which the two
             cards on this screen cannot produce and which `clients.type_parent`
             has no enum member for. Sent only when it is one of the two real
             ones; omitted otherwise, which lands the client in the Unassigned
             bucket as an absent value rather than a fabricated enum. */
          ...(clientType === 'Organisation' || clientType === 'Individual' ? { clientType } : {}),
          ...(clientType === 'Organisation' ? { orgSubtype: orgType } : {}),
          addressLine: address.trim(),
          city: city.trim(),
          district: district.trim(),
          postalCode: postalCode.trim(),
          country: country.trim(),
          panVat: pan.trim(),
          notes: notes.trim(),
          clientUuid: saveKey.current.key,
        },
        ctx,
      )
      setSaved(true)
      showSuccessToast('Client created', `${created.clientCode} · ${created.name}`)
      navigate('/clients')
    } catch (err) {
      setSaving(false)
      setSaveError(`Not saved — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function handleCancel() {
    if (isDirty) setShowDiscard(true)
    else navigate('/clients')
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    let err: string | null = null
    const next: DocDraft[] = []
    Array.from(fileList).forEach((file, i) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        err = `${file.name}: unsupported file type — use PDF, JPG or PNG.`
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        err = `${file.name} exceeds the 10 MB limit.`
        return
      }
      next.push({ id: `${file.name}-${file.size}-${documents.length + i}`, file })
    })
    setDocError(err)
    if (next.length) setDocuments((prev) => [...prev, ...next])
  }

  const typeMeta = TYPE_OPTIONS.find((t) => t.value === clientType) ?? TYPE_OPTIONS[0]!

  const rightRailContent = (
    <>
      <Card title="Client Summary">
        {!name.trim() ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 8px', textAlign: 'center' }}>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--card2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
              <Icon name={typeMeta.icon} size={24} />
            </span>
            <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>No client added yet</strong>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Fill in the details to see summary</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'var(--nav-active-bg)',
                  color: 'var(--nav-active-accent)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={typeMeta.icon} size={17} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{clientType}</div>
              </div>
            </div>
            <SummaryRows rows={summaryRows} />
          </div>
        )}
      </Card>

      <Card title="Ready to Book?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', alignItems: 'flex-start' }}>
            <Icon name={name.trim() && phone.trim() ? 'check' : 'close'} size={14} style={{ color: name.trim() && phone.trim() ? 'var(--success-text)' : 'var(--danger-text)', flexShrink: 0, marginTop: 2 }} />
            <span>Name and phone</span>
          </div>
          {clientType === 'Organisation' && (
            <div style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', alignItems: 'flex-start' }}>
              <Icon name={contactName.trim() ? 'check' : 'close'} size={14} style={{ color: contactName.trim() ? 'var(--success-text)' : 'var(--danger-text)', flexShrink: 0, marginTop: 2 }} />
              <span>Contact person</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', alignItems: 'flex-start' }}>
            <Icon name={pan.trim() ? 'check' : 'alert_triangle'} size={14} style={{ color: pan.trim() ? 'var(--success-text)' : 'var(--ready-text)', flexShrink: 0, marginTop: 2 }} />
            <span>VAT / PAN {!pan.trim() && 'missing — required before a booking can be confirmed'}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', alignItems: 'flex-start' }}>
            <Icon name={address.trim() ? 'check' : 'alert_triangle'} size={14} style={{ color: address.trim() ? 'var(--success-text)' : 'var(--ready-text)', flexShrink: 0, marginTop: 2 }} />
            <span>Address {!address.trim() && 'missing — required on the invoice'}</span>
          </div>
        </div>
      </Card>

      <Card title="Help">
        <details>
          <summary style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>Client Type Guide</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', marginTop: 12 }}>
            {TYPE_OPTIONS.map((opt) => {
              const on = clientType === opt.value
              return (
                <div key={opt.value} style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 'var(--r-sm)', border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: on ? 'var(--nav-active-bg)' : 'var(--card2)' }}>
                  <Icon name={opt.icon} size={18} style={{ color: 'var(--nav-active-accent)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{opt.label}</span>
                    <span style={{ display: 'block', color: 'var(--text2)', fontSize: 'var(--t-th)' }}>{opt.blurb}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </details>
      </Card>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingBottom: 32 }}>
      <PageHeader
        title="Add New Client"
        description="Create an accurate client profile with the details needed for bookings, payments and documents."
        actions={
          <>
            <Button variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || saved}>
              {saved ? 'Client Saved' : saving ? 'Saving Client…' : 'Save Client'}
            </Button>
          </>
        }
      />

      {/* Law 12 — inline and persistent, never a toast, and never cleared by a
          timer. It stays until the next Save attempt replaces it. */}
      {saveError && <ErrorBanner title="This client was not saved" message={saveError} />}

      {/* The duplicate lookup failing is stated, not swallowed — otherwise a
          silent failure reads as "no duplicate exists". */}
      {dupCheckError && (
        <p
          role="alert"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--danger-text)',
            lineHeight: 1.45,
          }}
        >
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Duplicate check unavailable — {dupCheckError}. This phone number was not checked against the client
            directory; if it already belongs to a client, Save will be refused by the database&rsquo;s unique phone rule.
          </span>
        </p>
      )}

      {duplicateMatch && !dismissedDuplicate && (
        <ErrorBanner
          title="Possible existing client"
          message={
            <>
              <div>
                {duplicateMatch.name} · <span className="figure">{duplicateMatch.phone}</span> · {duplicateMatch.clientType}
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 8 }}>
                <Button variant="secondary" onClick={() => duplicateMatch && navigate(`/clients/${duplicateMatch.id}`)}>
                  View Existing
                </Button>
                <Button variant="ghost" onClick={() => setDismissedDuplicate(true)}>
                  Continue Anyway
                </Button>
              </div>
            </>
          }
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <SectionCard n={1} title="Basic Information">
            <div style={fieldRow}>
              <Field label="Client Type" required>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {TYPE_OPTIONS.map((opt) => {
                    const on = clientType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setClientType(opt.value)}
                        aria-pressed={on}
                        style={{
                          flex: '1 1 100px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                          height: 38,
                          padding: '0 10px',
                          borderRadius: 'var(--r-btn)',
                          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                          background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text)',
                          fontWeight: on ? 700 : 500,
                          fontSize: 'var(--t-meta)',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Icon name={opt.icon} size={16} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label={clientType === 'Organisation' ? 'Organisation Name' : 'Full Name'} required error={errors.name}>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    clearError('name')
                  }}
                  placeholder={typeMeta.example}
                  style={inputStyle(!!errors.name)}
                />
              </Field>
            </div>

            {clientType === 'Organisation' && (
              <div style={fieldRow}>
                <Field label="Contact Person" error={errors.contactName}>
                  <Input
                    value={contactName}
                    onChange={(e) => {
                      setContactName(e.target.value)
                      clearError('contactName')
                    }}
                    placeholder="Full name of main contact"
                    style={inputStyle(!!errors.contactName)}
                  />
                </Field>
                <Field label="Designation / Role">
                  <Input
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Producer, Director, Manager"
                    style={inputStyle()}
                  />
                </Field>
              </div>
            )}

            <div style={fieldRow}>
              <Field
                label="Phone Number"
                required
                error={errors.phone}
                help={
                  <>
                    Nepali mobile — 10 digits starting <span className="figure">97</span> or{' '}
                    <span className="figure">98</span>.{' '}
                    {phoneWillSave ? (
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
                    style={{
                      ...inputStyle(),
                      width: 92,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text2)',
                    }}
                  >
                    🇳🇵 +977
                  </span>
                  <Input
                    value={phone}
                    inputMode="numeric"
                    autoComplete="tel-national"
                    onChange={(e) => {
                      setPhone(e.target.value)
                      clearError('phone')
                    }}
                    placeholder="9801234567"
                    className="figure"
                    style={{ ...inputStyle(!!errors.phone), flex: 1 }}
                  />
                </div>
              </Field>
              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearError('email')
                  }}
                  placeholder="e.g. info@company.com"
                  style={inputStyle(!!errors.email)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard n={2} title="Contact & Address">
            <div style={fieldRow}>
              <Field label="Address" error={errors.address}>
                <Input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    clearError('address')
                  }}
                  placeholder="Street, Building, Area"
                  style={inputStyle(!!errors.address)}
                />
              </Field>
              <Field label="City" error={errors.city}>
                <Input
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value)
                    clearError('city')
                  }}
                  placeholder="e.g. Kathmandu"
                  style={inputStyle(!!errors.city)}
                />
              </Field>
              <Field label="District">
                <Select value={district} onChange={(e) => setDistrict(e.target.value)} style={inputStyle()}>
                  <option value="">Select district</option>
                  {NEPAL_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Postal Code">
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="e.g. 44600" style={inputStyle()} />
              </Field>
              <Field label="Country" error={errors.country}>
                <Select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value)
                    clearError('country')
                  }}
                  style={inputStyle(!!errors.country)}
                >
                  <option value="Nepal">Nepal</option>
                  <option value="India">India</option>
                  <option value="China">China</option>
                  <option value="Other">Other</option>
                </Select>
              </Field>
            </div>

            <div style={{ ...fieldRow, marginTop: 16 }}>
              {clientType === 'Organisation' && (
                <>
                  <Field label="Business Reg. No.">
                    <Input value={businessRegNo} onChange={(e) => setBusinessRegNo(e.target.value)} placeholder="e.g. 123456/789" style={inputStyle()} />
                  </Field>
                  <Field label="Website">
                    <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. www.company.com" style={inputStyle()} />
                  </Field>
                </>
              )}
              {clientType === 'Individual' && (
                <Field label="Government ID">
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                    <Select value={govIdType} onChange={(e) => setGovIdType(e.target.value)} style={{ ...inputStyle(), width: 120, flexShrink: 0 }}>
                      <option value="Citizenship">Citizenship</option>
                      <option value="Passport">Passport</option>
                    </Select>
                    <Input value={businessRegNo} onChange={(e) => setBusinessRegNo(e.target.value)} placeholder="ID Number" style={{ ...inputStyle(), flex: 1 }} />
                  </div>
                </Field>
              )}
              <Field label="VAT / PAN No.">
                <Input value={pan} onChange={(e) => setPan(e.target.value)} placeholder="e.g. 600123456" style={inputStyle()} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard n={3} title="Additional Information">
            {clientType === 'Organisation' && (
              <div style={{ ...fieldRow, marginBottom: 16 }}>
                <Field label="Organisation Type" required>
                  <Select value={orgType} onChange={(e) => setOrgType(e.target.value as OrganisationType)} style={inputStyle()}>
                    {ORG_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {clientType === 'Individual' && (
              <div style={{ marginBottom: 16 }}>
                <Field label="Profession (Optional)">
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 4 }}>
                    {PROFESSIONS.map((p) => {
                      const on = professions.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => toggleProfession(p)}
                          aria-pressed={on}
                          style={{
                            padding: '6px 12px', borderRadius: 'var(--r-badge)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', cursor: 'pointer',
                            background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                            border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                            color: on ? 'var(--nav-active-accent)' : 'var(--text)'
                          }}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <Field label="Segment (Optional)">
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 4 }}>
                  {SEGMENTS.map((s) => {
                    const on = segments.includes(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSegment(s)}
                        aria-pressed={on}
                        style={{
                          padding: '6px 12px', borderRadius: 'var(--r-badge)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', cursor: 'pointer',
                          background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                          color: on ? 'var(--nav-active-accent)' : 'var(--text)'
                        }}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Client Since">
                <DateField ariaLabel="Client since" value={clientSince} onChange={setClientSince} style={inputStyle()} />
              </Field>
              <Field label="Source">
                <Select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle()}>
                  <option value="">Select source</option>
                  {CLIENT_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Referred By (Optional)">
                <Input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Name or company" style={inputStyle()} />
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Membership Tier">
                <Select value={membership} onChange={(e) => setMembership(e.target.value as MembershipTier)} style={inputStyle()}>
                  {MEMBERSHIP_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              {money && (
                <Field label="Credit Limit (NPR)">
                  <Input
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="e.g. 100,000"
                    style={inputStyle()}
                  />
                </Field>
              )}
              {money && (
                <Field label="Payment Terms">
                  <Select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={inputStyle()}>
                    <option value="">Select terms</option>
                    {PAYMENT_TERMS_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            <div style={fieldRow}>
              <Field label="Preferred Contact Method">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', paddingTop: 4 }}>
                  {/*
                    These three rows were as tall as the text in them — about 19px
                    of target for a control the operator taps on a docked tablet
                    while holding a case in the other hand. The fix is on the
                    LABEL, not the box: a label hands its clicks to the control it
                    wraps, so stretching it to the touch minimum makes the whole
                    "☐ WhatsApp" strip clickable while the checkbox itself stays
                    16px. Resizing the input instead would give us a 44px native
                    checkbox, which is enormous and still leaves the word beside it
                    dead to the touch. The literal 44 rather than `var(--tap)` is
                    deliberate — it matches the three card-row labels in the
                    packing, handover and reset workspaces that set this same
                    pattern.

                    They stack in a flex column with a real gap between them, so
                    each grown row pushes the next one down; nothing overlaps.
                  */}
                  {PREFERRED_CONTACT_METHODS.map((m) => (
                    <label
                      key={m}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-sm)',
                        minHeight: 44,
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={preferredMethods.includes(m)}
                        onChange={() => togglePreferred(m)}
                        style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--nav-active-accent)' }}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: 'span 2', minWidth: 0 }}>
                <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Notes (Optional)</label>
                <textarea
                  value={notes}
                  maxLength={300}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes about this client…"
                  rows={3}
                  style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <span style={{ alignSelf: 'flex-end', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{notes.length} / 300</span>
              </div>
            </div>
          </SectionCard>

          <section style={{ ...cardStyle, padding: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Upload Documents (Optional)</h2>
                <p style={{ margin: '3px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Supported: PDF, JPG, PNG · Max 10 MB each</p>
              </div>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Browse Files
              </Button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                addFiles(e.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              style={{
                border: `1.5px dashed ${dragOver ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '22px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--nav-active-bg)' : 'var(--card2)',
              }}
            >
              <Icon name="upload" size={22} style={{ color: 'var(--muted)' }} />
              <div style={{ marginTop: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Drag and drop files here or <span style={{ color: 'var(--link)', fontWeight: 600 }}>click to browse</span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />

            {docError && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {docError}
              </span>
            )}

            {documents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {documents.map((d) => (
                  <div
                    key={d.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--card2)', border: '1px solid var(--border)' }}
                  >
                    <Icon name="file" size={16} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                      {d.file.name}
                    </span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', flexShrink: 0 }}>{formatBytes(d.file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setDocuments((prev) => prev.filter((x) => x.id !== d.id))}
                      aria-label={`Remove ${d.file.name}`}
                      style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', width: 24, height: 24, borderRadius: 'var(--r-xs)', display: 'grid', placeItems: 'center' }}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {viewport === 'desktop' ? (
          <Rail width={330} label="Client summary">
            {rightRailContent}
          </Rail>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{rightRailContent}</div>
        )}
      </div>

      {/* What Save does NOT keep. On the page, above the fold of the footer, and
          permanent — see NOT_SAVED_YET for why each line is there. */}
      <FooterNote />
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          background: 'var(--card2)',
          padding: 'var(--sp-md)',
          fontSize: 'var(--t-meta)',
          color: 'var(--text2)',
        }}
      >
        <strong style={{ color: 'var(--text)' }}>Not saved with this client yet</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NOT_SAVED_YET.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <Modal
        isOpen={showDiscard}
        onClose={() => setShowDiscard(false)}
        title="Discard changes?"
        subtitle="Your entered client information will be lost."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowDiscard(false)}>
              Keep Editing
            </Button>
            <Button variant="danger" onClick={() => navigate('/clients')}>
              Discard
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Nothing has been saved yet. Leaving now loses everything entered on this page.
        </p>
      </Modal>
    </div>
  )
}
