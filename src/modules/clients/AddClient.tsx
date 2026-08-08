import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney, parseMoney } from '../../lib/money'
import { toBs, formatBs, formatAd, TODAY } from '../../lib/bs'
import { useViewport } from '../../lib/device'
import {
  CLIENTS_DATA,
  CLIENT_SOURCES,
  PAYMENT_TERMS_OPTIONS,
  PREFERRED_CONTACT_METHODS,
  NEPAL_DISTRICTS,
  MEMBERSHIP_TIERS,
  type ClientType,
  type ClientRecord,
  type MembershipTier,
} from '../../data/clients'

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
 * No data layer exists yet (Phase 1), so Save simulates and navigates back to
 * /clients without persisting — the same contract AddEquipment already uses.
 */

const TYPE_OPTIONS: Array<{ value: ClientType; label: string; icon: IconName; blurb: string; example: string }> = [
  { value: 'Company', label: 'Company', icon: 'company', blurb: 'Production houses, companies, organizations.', example: 'e.g. Himalayan Films Pvt. Ltd.' },
  { value: 'Individual', label: 'Individual', icon: 'person', blurb: 'Freelancers, directors, DOPs, photographers.', example: 'e.g. Suman Karki' },
  { value: 'Student', label: 'Student', icon: 'student', blurb: 'Students with a valid college / institute ID.', example: 'e.g. Aarav Shrestha' },
]

const WHY_ITEMS = [
  'Accurate records help us serve you better.',
  'Government ID may be required for verification.',
  'Credit limit and payment terms are optional.',
  'You can update this information anytime.',
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

const inputStyle = (hasError?: boolean): CSSProperties => ({
  width: '100%',
  height: 38,
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
  children,
}: {
  label: string
  required?: boolean
  /* `| undefined` is explicit because tsconfig sets exactOptionalPropertyTypes:
     callers read `errors[field]`, which is `string | undefined` on a miss, and
     without it every call site would need a `?? null`. */
  error?: string | null | undefined
  children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
        {label} {required && <span style={{ color: 'var(--danger-text)' }}>*</span>}
      </label>
      {children}
      {error && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
          <Icon name="error" size={12} />
          {error}
        </span>
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
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </section>
  )
}

const fieldRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }

/** The client code the record would get. Derived from the seed count, same
 *  reasoning `clientMetrics` uses elsewhere — a number this screen can defend. */
const NEXT_CLIENT_CODE = `CL-2026-${String(CLIENTS_DATA.length + 1).padStart(4, '0')}`

export default function AddClient() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()
  const money = useCanViewMoney()
  const viewport = useViewport()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [clientType, setClientType] = useState<ClientType>('Company')
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
  const [showDiscard, setShowDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const clearError = (key: string) => setErrors((prev) => (prev[key] ? { ...prev, [key]: null } : prev))

  const togglePreferred = (m: string) =>
    setPreferredMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  const duplicateMatch = useMemo<ClientRecord | null>(() => {
    if (dismissedDuplicate) return null
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) return null
    return CLIENTS_DATA.find((c) => c.phone.replace(/\D/g, '').endsWith(digits.slice(-9))) ?? null
  }, [phone, dismissedDuplicate])

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
    if (phone.trim()) rows.push({ label: 'Phone', value: `+977 ${phone.trim()}` })
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

  function validate(): boolean {
    const e: Record<string, string | null> = {}
    if (!name.trim()) e.name = 'Client / Company Name is required.'
    if (clientType === 'Company' && !contactName.trim()) {
      e.contactName = 'Contact Person is required for a company account.'
    }
    if (!phone.trim()) {
      e.phone = 'Phone Number is required.'
    } else if (country === 'Nepal' && !/^9\d{9}$/.test(phone.replace(/\D/g, ''))) {
      e.phone = 'Enter a valid Nepal mobile number, e.g. 98XXXXXXXX.'
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = 'Enter a valid email address.'
    }
    if (!address.trim()) e.address = 'Address is required.'
    if (!city.trim()) e.city = 'City is required.'
    if (!country.trim()) e.country = 'Country is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave() {
    if (!validate()) return
    setSaving(true)
    window.setTimeout(() => {
      setSaving(false)
      setSaved(true)
      showSuccessToast('Client created successfully', `${NEXT_CLIENT_CODE} · ${name.trim()}`)
      window.setTimeout(() => navigate('/clients'), 900)
    }, 700)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

      <Card title="Why We Collect This Information">
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WHY_ITEMS.map((text) => (
            <li key={text} style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name="check" size={14} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 2 }} />
              {text}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Client Type Guide">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TYPE_OPTIONS.map((opt) => {
            const on = clientType === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setClientType(opt.value)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  gap: 10,
                  textAlign: 'left',
                  border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: 10,
                  background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name={opt.icon} size={18} style={{ color: 'var(--nav-active-accent)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{opt.label}</span>
                  <span style={{ display: 'block', color: 'var(--text2)', fontSize: 'var(--t-th)' }}>{opt.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card title="Next Steps">
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <li>Add client details</li>
          <li>Upload documents (if any)</li>
          <li>Save client profile</li>
          <li>Create booking or quote</li>
        </ol>
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

      {duplicateMatch && (
        <div role="alert" style={{ ...cardStyle, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Icon name="alert_triangle" size={18} style={{ color: 'var(--progress-text)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>Possible existing client</div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>
              {duplicateMatch.name} · <span className="figure">{duplicateMatch.phone}</span> · {duplicateMatch.clientType}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="secondary" onClick={() => navigate(`/clients?q=${encodeURIComponent(duplicateMatch.phone)}`)}>
              View Existing
            </Button>
            <Button variant="ghost" onClick={() => setDismissedDuplicate(true)}>
              Continue Anyway
            </Button>
          </div>
        </div>
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              <Field label="Client / Company Name" required error={errors.name}>
                <input
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

            <div style={fieldRow}>
              <Field label="Contact Person" required={clientType === 'Company'} error={errors.contactName}>
                <input
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
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Producer, Director, Manager"
                  style={inputStyle()}
                />
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Phone Number" required error={errors.phone}>
                <div style={{ display: 'flex', gap: 8 }}>
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
                  <input
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      clearError('phone')
                    }}
                    placeholder="98XXXXXXXX"
                    style={{ ...inputStyle(!!errors.phone), flex: 1 }}
                  />
                </div>
              </Field>
              <Field label="Email" error={errors.email}>
                <input
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
              <Field label="Address" required error={errors.address}>
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    clearError('address')
                  }}
                  placeholder="Street, Building, Area"
                  style={inputStyle(!!errors.address)}
                />
              </Field>
              <Field label="City" required error={errors.city}>
                <input
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
                <select value={district} onChange={(e) => setDistrict(e.target.value)} style={inputStyle()}>
                  <option value="">Select district</option>
                  {NEPAL_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Postal Code">
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="e.g. 44600" style={inputStyle()} />
              </Field>
              <Field label="Country" required error={errors.country}>
                <select
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
                </select>
              </Field>
              <Field label="Business Reg. No.">
                <input value={businessRegNo} onChange={(e) => setBusinessRegNo(e.target.value)} placeholder="e.g. 123456/789" style={inputStyle()} />
              </Field>
              <Field label="VAT / PAN No.">
                <input value={pan} onChange={(e) => setPan(e.target.value)} placeholder="e.g. 600123456" style={inputStyle()} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard n={3} title="Additional Information">
            <div style={fieldRow}>
              <Field label="Client Since">
                <input type="date" value={clientSince} onChange={(e) => setClientSince(e.target.value)} style={inputStyle()} />
              </Field>
              <Field label="Source">
                <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle()}>
                  <option value="">Select source</option>
                  {CLIENT_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Referred By (Optional)">
                <input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Name or company" style={inputStyle()} />
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Membership Tier">
                <select value={membership} onChange={(e) => setMembership(e.target.value as MembershipTier)} style={inputStyle()}>
                  {MEMBERSHIP_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              {money && (
                <Field label="Credit Limit (NPR)">
                  <input
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="e.g. 100,000"
                    style={inputStyle()}
                  />
                </Field>
              )}
              {money && (
                <Field label="Payment Terms">
                  <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={inputStyle()}>
                    <option value="">Select terms</option>
                    {PAYMENT_TERMS_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <div style={fieldRow}>
              <Field label="Preferred Contact Method">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  {PREFERRED_CONTACT_METHODS.map((m) => (
                    <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={preferredMethods.includes(m)}
                        onChange={() => togglePreferred(m)}
                        style={{ width: 16, height: 16, accentColor: 'var(--nav-active-accent)' }}
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

          <section style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {docError}
              </span>
            )}

            {documents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {documents.map((d) => (
                  <div
                    key={d.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)' }}
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
                      style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center' }}
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

      <FooterNote />

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
