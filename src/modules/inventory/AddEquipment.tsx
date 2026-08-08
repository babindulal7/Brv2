import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, SideRail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { formatMoney, parseMoney, rupees, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd, TODAY } from '../../lib/bs'
import { STATUS } from '../../lib/status'
import { CONDITION_TONE } from '../../data/inventory'
import { WAREHOUSES } from '../../data/warehouse'
import {
  EQUIPMENT_CATEGORIES,
  TRACKING_MODES,
  QUANTITY_UNITS,
  INTAKE_CONDITIONS,
  NEXT_ASSET_CODE,
  assetTagFor,
  EXISTING_SERIALS,
  existingModelMatch,
  CONTAINER_MODELS,
  ATTACHABLE_MODELS,
  modelName,
  bundlesUsing,
  suggestedChildrenFor,
  locationsIn,
  locationLabel,
  SEED_ERRORS,
  SAVE_UNAVAILABLE_REASON,
  PREVIEW_UNAVAILABLE_REASON,
  LABEL_PRINT_UNAVAILABLE_REASON,
  PACKING_PREVIEW_UNAVAILABLE_REASON,
  DEPRECIATION_UNAVAILABLE_REASON,
  CONTAINER_CAPACITY_REASON,
} from '../../data/addEquipment'
import type { TrackingMode, IntakeCondition, LocationChoice } from '../../data/addEquipment'

/**
 * **Inventory ▸ Add Equipment** — built against `06 Inventory/Add Equipment.PNG`
 * and its spec `Add Equipment.md` v3.0 (Build Locked).
 *
 * The render's card set, column set, ordering and density are followed. Its
 * *rulings* are not, because §0 of the spec supersedes fifteen of them and
 * Foundation supersedes the rest. Every deviation below is one of those, and
 * none of them may be copied back:
 *
 *  · **Not a wizard.** The render's five-step numbered stepper sits on top of a
 *    page that scrolls freely. §2 replaces it with a sticky section nav over one
 *    scrolling form: an equipment record is edited far more often than created,
 *    and an edit touches one section. Seven sections, any order.
 *  · **One Asset Code.** The render shows `SKU EQ-CAM-000234` *and* `Unique Code
 *    EQ000234`. §4 collapses them: one code, which is also the SKU and drives
 *    the barcode and QR.
 *  · **Serials are never generated.** `Auto Generate Serial` becomes `Generate
 *    Asset Tags` (§4) — a minted serial cannot match what a warehouse hand reads
 *    off the body, which defeats scanning. The serial is typed or scanned.
 *  · **Status is read-only and engine-owned** (§5.3). The render makes it an
 *    editable dropdown and creates a brand-new unit already `On Rent` against
 *    BK-2026-0718 — a booking that cannot reference an asset that does not exist
 *    yet. Here units carry no status at all while the record is a Draft, and
 *    §5.3's `In Stock` is stated as what creation will set.
 *  · **One Tracking field** (§5.1) in place of the render's `Equipment Type` +
 *    `Has Serial Number?` + `Tracking Type`, which ask one question three ways.
 *  · **Manufacturer only when it differs from Brand** (§3) — the render prints
 *    `Sony` in both.
 *  · **Three relationship classes** (§6), not one: containment is one-parent,
 *    kit membership is many and read-only, compatibility is many-to-many and
 *    never affects availability or price.
 *  · **The preview reconciles** (§8.2). The render's tree claims `3 Items · 2
 *    Available · 1 Reserved · 0 On Rent` above three units reading Available,
 *    Reserved and On Rent, and `Child Items 6` against four types. Every count
 *    here is computed from the same array it sits above, so it cannot disagree.
 *  · **No rich-text toolbar.** The render draws twelve formatting buttons. No
 *    rich-text engine exists, and twelve controls that do nothing are twelve
 *    dead controls; the field is a plain 1000-character box with a live counter.
 *  · **No barcode or QR glyph is drawn.** §8.1 asks for both. A picture of a
 *    barcode that no scanner can read is fabricated data on a screen whose whole
 *    job is identifiers, so the Codes panel shows the encoded values and states
 *    that rendering is not built.
 *  · **Purchase and Pricing are absent for money-blind roles** (§12 / Foundation
 *    §8.3) — the sections are omitted from the array before render, the section
 *    nav renumbers, and Ready to Rent reads `Pricing pending` with no figures.
 *  · Sidebar, hues and the word "client" are Foundation's, not the render's.
 *
 * Nothing here persists: there is no data layer behind equipment yet. Both save
 * buttons say so on their face rather than faking a success and navigating away.
 */

/* ── shared field furniture ────────────────────────────────────────────── */

const inputStyle = (hasError?: boolean): CSSProperties => ({
  width: '100%',
  height: 36,
  padding: '0 10px',
  borderRadius: 'var(--r-input)',
  border: `1px solid ${hasError ? 'var(--danger-text)' : 'var(--input-border)'}`,
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
})

const fieldRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 14,
}

function Field({
  label,
  required,
  error,
  hint,
  children,
  span,
}: {
  label: string
  required?: boolean
  error?: string | null | undefined
  hint?: string | undefined
  children: ReactNode
  span?: number | undefined
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        minWidth: 0,
        ...(span ? { gridColumn: `span ${span}` } : {}),
      }}
    >
      <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
        {label} {required && <span style={{ color: 'var(--danger-text)' }}>*</span>}
      </label>
      {children}
      {error ? (
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
          <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </span>
      ) : hint ? (
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{hint}</span>
      ) : null}
    </div>
  )
}

function SectionCard({
  id,
  n,
  title,
  note,
  action,
  children,
}: {
  id: string
  n: number
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, scrollMarginTop: 84 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
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
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          {note && <p style={{ margin: '2px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{note}</p>}
        </div>
        {action && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{action}</div>}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}

/** §5.4 — the intake condition, badged with the tone Inventory already uses. */
function ConditionBadge({ condition }: { condition: IntakeCondition }) {
  const c = STATUS[CONDITION_TONE[condition]]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 19,
        padding: '0 7px',
        borderRadius: 'var(--r-badge)',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border ?? 'transparent'}`,
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {condition}
    </span>
  )
}

/**
 * §5.3 — status renders as a badge, never a control, and while the record is a
 * Draft the units have no status at all. So the cell states that instead of
 * inventing `Available` the way the render does.
 */
function DraftStatusBadge() {
  const s = STATUS.neutral
  return (
    <span
      title="Status is engine-owned. Units take In Stock at creation; a Draft's units have no status."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 19,
        padding: '0 7px',
        borderRadius: 'var(--r-badge)',
        background: s.bg,
        color: s.fg,
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="dot" size={9} />
      No status · Draft
    </span>
  )
}

function Chip({ children, onRemove, icon }: { children: ReactNode; onRemove?: () => void; icon?: IconName }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 'var(--r-badge)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        fontSize: 'var(--t-meta)',
        color: 'var(--text)',
      }}
    >
      {icon && <Icon name={icon} size={12} style={{ color: 'var(--link)' }} />}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  )
}

/** Foundation v1.3 date form — BS above AD, both rendered from one AD instant. */
function BsAbove({ iso }: { iso: string }) {
  if (!iso) return <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>No date set</span>
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>Not a date</span>
  const bs = toBs(d)
  return (
    <span style={{ fontSize: 'var(--t-th)', color: bs ? 'var(--text2)' : 'var(--muted)' }}>
      {bs ? `${formatBs(bs)} · ${formatAd(d)}` : `${formatAd(d)} — BS unavailable outside Shrawan 2083`}
    </span>
  )
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '7px 8px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const td: CSSProperties = { padding: '7px 8px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' }

/* ── drafts ────────────────────────────────────────────────────────────── */

interface UnitDraft {
  id: string
  serial: string
  assetTag: string
  condition: IntakeCondition
  purchaseIso: string
}

interface ContainedDraft {
  id: string
  modelId: string
  quantity: number
}

interface FileDraft {
  id: string
  file: File
  url: string
}

const THUMB_MAX_BYTES = 5 * 1024 * 1024
const GALLERY_MAX_BYTES = 50 * 1024 * 1024
const DOC_MAX_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

const todayIso = TODAY.toISOString().slice(0, 10)

/**
 * What the unit's printed label carries. The render's Barcode column reads
 * `EQ000234-SN102`, so the payload is the Asset Code joined to the serial — and
 * where no serial exists yet (§4's whole reason for asset tags: cables, cases,
 * worn plates) it falls back to the asset tag. The QR carries the same string.
 */
function barcodePayload(u: { serial: string; assetTag: string }): string {
  const s = u.serial.trim()
  return s ? `${NEXT_ASSET_CODE}-${s}` : u.assetTag
}

/** `3 pieces`, `1 unit` — the count and its noun, agreeing. */
function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

/* ── screen ────────────────────────────────────────────────────────────── */

export default function AddEquipment() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const money = useCanViewMoney()
  const viewport = useViewport()
  const { showSuccessToast } = useToast()

  const assetCode = NEXT_ASSET_CODE

  /* §3 — Identity */
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [modelNo, setModelNo] = useState('')
  const [manufacturerDiffers, setManufacturerDiffers] = useState(false)
  const [manufacturer, setManufacturer] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState<FileDraft | null>(null)
  const [gallery, setGallery] = useState<FileDraft[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const thumbInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  /* §5 — Stock & Units */
  const [tracking, setTracking] = useState<TrackingMode>('Serialised')
  const [units, setUnits] = useState<UnitDraft[]>([
    { id: 'u-1', serial: '', assetTag: assetTagFor(NEXT_ASSET_CODE, 0), condition: 'Excellent', purchaseIso: todayIso },
  ])
  const [touchedSerials, setTouchedSerials] = useState<Set<string>>(new Set())
  const [quantity, setQuantity] = useState(1)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [quantityUnit, setQuantityUnit] = useState<string>('piece')
  const [csvNote, setCsvNote] = useState<string | null>(null)
  const csvInput = useRef<HTMLInputElement>(null)

  /* §6 — Relationships */
  const [storedIn, setStoredIn] = useState('')
  const [contains, setContains] = useState<ContainedDraft[]>([])
  const [containPick, setContainPick] = useState('')
  const [compatible, setCompatible] = useState<string[]>([])
  const [compatiblePick, setCompatiblePick] = useState('')
  const [requires, setRequires] = useState<string[]>([])
  const [requiresPick, setRequiresPick] = useState('')

  /* §11 — Location */
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')

  /* §10.1 — Purchase (money-visible only) */
  const [purchaseIso, setPurchaseIso] = useState(todayIso)
  const [supplier, setSupplier] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [replacementValue, setReplacementValue] = useState('')
  const [warrantyMonths, setWarrantyMonths] = useState('')
  const [insurancePolicy, setInsurancePolicy] = useState('')
  const [insuranceExpiryIso, setInsuranceExpiryIso] = useState('')
  const [assetOwner, setAssetOwner] = useState('Babin Rentals Pvt. Ltd.')

  /* §10.2 / §10.4 — Pricing & Rental (money-visible only) */
  const [dailyRate, setDailyRate] = useState('')
  const [weeklyRate, setWeeklyRate] = useState('')
  const [monthlyRate, setMonthlyRate] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [weekendRate, setWeekendRate] = useState('')
  const [depositKind, setDepositKind] = useState<'percent' | 'fixed'>('percent')
  const [depositPercent, setDepositPercent] = useState('')
  const [depositFixed, setDepositFixed] = useState('')
  const [minRentalDays, setMinRentalDays] = useState('1')
  const [rentalEnabled, setRentalEnabled] = useState(true)
  const [prepMinutes, setPrepMinutes] = useState('')
  const [cleaningMinutes, setCleaningMinutes] = useState('')
  const [inspectionRequired, setInspectionRequired] = useState(true)
  const [packingRequired, setPackingRequired] = useState(true)

  /* §11 — Maintenance, Documents, Notes */
  const [inspectionIntervalDays, setInspectionIntervalDays] = useState('')
  const [maintenanceCycleRentals, setMaintenanceCycleRentals] = useState('')
  const [serviceVendor, setServiceVendor] = useState('')
  const [documents, setDocuments] = useState<FileDraft[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const docInput = useRef<HTMLInputElement>(null)
  const [internalNotes, setInternalNotes] = useState('')
  const [warehouseNotes, setWarehouseNotes] = useState('')

  /* page state */
  /** Which submit was last attempted, or null before the first one. */
  const [submitted, setSubmitted] = useState<'draft' | 'create' | null>(null)
  const [outcome, setOutcome] = useState<{ kind: 'validated' | 'draft'; lines: string[] } | null>(null)
  const [activeSection, setActiveSection] = useState('sec-identity')
  const [showDiscard, setShowDiscard] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [duplicateReport, setDuplicateReport] = useState<string[] | null>(null)
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false)
  const [clipboardError, setClipboardError] = useState<string | null>(null)

  /* ── derived ─────────────────────────────────────────────────────────── */

  const serialised = tracking === 'Serialised'
  const stockCount = serialised ? units.length : quantity

  const replacementPaisa: Paisa | null = money ? parseMoney(replacementValue) : null
  const dailyPaisa: Paisa | null = money ? parseMoney(dailyRate) : null

  const depositPaisa: Paisa | null = useMemo(() => {
    if (!money) return null
    if (depositKind === 'fixed') return parseMoney(depositFixed)
    const pct = Number(depositPercent)
    if (!depositPercent.trim() || !Number.isFinite(pct) || !replacementPaisa) return null
    return rupees(toRupees(replacementPaisa) * (pct / 100))
  }, [money, depositKind, depositFixed, depositPercent, replacementPaisa])

  /** §5.2 — uniqueness within the record and across the whole system. */
  const serialIssues = useMemo(() => {
    const issues = new Map<string, string>()
    const counts = new Map<string, number>()
    for (const u of units) {
      const k = u.serial.trim().toUpperCase()
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    for (const u of units) {
      const raw = u.serial.trim()
      const k = raw.toUpperCase()
      if (!k) {
        issues.set(u.id, 'Serial is required — it is the manufacturer’s, printed on the body.')
        continue
      }
      if ((counts.get(k) ?? 0) > 1) {
        issues.set(u.id, 'This serial is entered twice on this record.')
        continue
      }
      const owner = EXISTING_SERIALS.get(k)
      if (owner) issues.set(u.id, `${raw} already belongs to ${owner}.`)
    }
    return issues
  }, [units])

  const visibleSerialIssue = (u: UnitDraft) =>
    submitted || touchedSerials.has(u.id) ? serialIssues.get(u.id) : undefined

  const duplicateModel = useMemo(
    () => (dismissedDuplicate ? null : existingModelMatch(name, modelNo)),
    [name, modelNo, dismissedDuplicate],
  )

  const suggestions = useMemo(() => {
    const already = new Set(contains.map((c) => c.modelId))
    return suggestedChildrenFor(brand, category).filter((m) => !already.has(m.id))
  }, [brand, category, contains])

  const usedInBundles = useMemo(() => bundlesUsing(name), [name])

  const warehouseLocations: LocationChoice[] = useMemo(
    () => (warehouseId ? locationsIn(warehouseId) : []),
    [warehouseId],
  )
  const chosenLocation = useMemo(
    () => warehouseLocations.find((l) => l.id === locationId) ?? null,
    [warehouseLocations, locationId],
  )
  const freeSlots = chosenLocation ? chosenLocation.capacity - chosenLocation.used : null
  const overCapacity = freeSlots !== null && stockCount > freeSlots

  /* §2 — completeness per section. */
  const identityComplete = Boolean(name.trim() && category && brand.trim())
  const stockComplete = serialised
    ? units.length > 0 && units.every((u) => u.serial.trim() && !serialIssues.has(u.id))
    : quantity > 0
  const relationshipsComplete = Boolean(storedIn || contains.length > 0 || compatible.length > 0)
  const locationComplete = Boolean(warehouseId && locationId)
  const purchaseComplete = Boolean(replacementPaisa && replacementPaisa > 0)
  const pricingComplete = Boolean(dailyPaisa && dailyPaisa > 0)
  const maintenanceComplete = Boolean(inspectionIntervalDays.trim() || maintenanceCycleRentals.trim())

  /**
   * Errors are **derived**, not stored. Held in state they go stale the moment a
   * field changes — the summary would keep saying "every unit needs a serial"
   * after the serial had been typed. Recomputing on every render means the
   * banner, the field and the section dot can never disagree with each other or
   * with what the user is looking at. Nothing renders until a submit is tried,
   * so the form does not shout at a half-filled row.
   */
  const errors: Record<string, string> = submitted ? validate(submitted) : {}

  const sectionDefs = useMemo(() => {
    const base: Array<{ id: string; label: string; complete: boolean; blocked: boolean }> = [
      { id: 'sec-identity', label: 'Identity', complete: identityComplete, blocked: Boolean(errors.name || errors.category || errors.brand) },
      { id: 'sec-stock', label: 'Stock & Units', complete: stockComplete, blocked: Boolean(errors.stock) },
      { id: 'sec-relationships', label: 'Relationships', complete: relationshipsComplete, blocked: Boolean(errors.relationships) },
      { id: 'sec-location', label: 'Location', complete: locationComplete, blocked: Boolean(errors.location) },
    ]
    if (money) {
      base.push({ id: 'sec-purchase', label: 'Purchase', complete: purchaseComplete, blocked: Boolean(errors.replacementValue || errors.purchasePrice) })
      base.push({ id: 'sec-pricing', label: 'Pricing & Rental', complete: pricingComplete, blocked: Boolean(errors.dailyRate || errors.deposit) })
    }
    base.push({ id: 'sec-maintenance', label: 'Maintenance & Documents', complete: maintenanceComplete, blocked: false })
    return base
  }, [
    identityComplete,
    stockComplete,
    relationshipsComplete,
    locationComplete,
    purchaseComplete,
    pricingComplete,
    maintenanceComplete,
    money,
    errors,
  ])

  const sectionNumber = (id: string) => sectionDefs.findIndex((s) => s.id === id) + 1

  /** §2 — clicking jumps, but scrolling must move the marker too. */
  const sectionKey = sectionDefs.map((s) => s.id).join('|')
  useEffect(() => {
    const els = sectionKey
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (els.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (hit) setActiveSection(hit.target.id)
      },
      { rootMargin: '-90px 0px -55% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sectionKey])

  /* Object URLs are revoked when the component unmounts so previews do not leak. */
  useEffect(() => {
    return () => {
      if (thumbnail) URL.revokeObjectURL(thumbnail.url)
      gallery.forEach((g) => URL.revokeObjectURL(g.url))
      documents.forEach((d) => URL.revokeObjectURL(d.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDirty = Boolean(
    name.trim() ||
      shortName.trim() ||
      brand.trim() ||
      modelNo.trim() ||
      category ||
      description.trim() ||
      thumbnail ||
      gallery.length ||
      documents.length ||
      units.some((u) => u.serial.trim()) ||
      storedIn ||
      contains.length ||
      compatible.length ||
      requires.length ||
      warehouseId ||
      internalNotes.trim() ||
      warehouseNotes.trim() ||
      (money && (purchasePrice.trim() || replacementValue.trim() || dailyRate.trim())),
  )

  /* ── §9 · Ready to Rent ──────────────────────────────────────────────── */

  const readyChecks = useMemo(() => {
    const rows: Array<{ label: string; ok: boolean }> = [
      { label: 'Name, category and tracking', ok: identityComplete },
      {
        label: serialised
          ? `${countOf(units.length, 'unit')} with unique serials`
          : `Quantity set — ${countOf(quantity, quantityUnit)}`,
        ok: stockComplete,
      },
    ]
    if (money) {
      rows.push({ label: 'Daily rate set', ok: pricingComplete })
      rows.push({ label: 'Replacement value set — needed for damage charges', ok: purchaseComplete })
    }
    rows.push({ label: 'Location set', ok: locationComplete })
    return rows
  }, [identityComplete, serialised, units.length, quantity, quantityUnit, stockComplete, money, pricingComplete, purchaseComplete, locationComplete])

  /**
   * §9 — rentability is only *knowable* from a money-visible session: two of the
   * five gates are a rate and a replacement value. A Warehouse session that
   * cleared its three would otherwise be told "all gates clear" about a record
   * that cannot be rented, which is worse than being told nothing.
   */
  const rentable = money && readyChecks.every((r) => r.ok)

  /* ── handlers ────────────────────────────────────────────────────────── */

  const addUnit = () => {
    setUnits((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}-${prev.length}`,
        serial: '',
        assetTag: assetTagFor(assetCode, prev.length),
        condition: 'Excellent',
        purchaseIso: money ? purchaseIso : todayIso,
      },
    ])
  }

  const removeUnit = (id: string) => {
    setUnits((prev) => (prev.length <= 1 ? prev : prev.filter((u) => u.id !== id)))
    setTouchedSerials((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const patchUnit = (id: string, patch: Partial<UnitDraft>) =>
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  /** §4 — asset tags are ours and may be generated. Serials never are. */
  const generateAssetTags = () => {
    setUnits((prev) => prev.map((u, i) => ({ ...u, assetTag: assetTagFor(assetCode, i) })))
    showSuccessToast('Asset tags generated', `${units.length} tag${units.length === 1 ? '' : 's'} numbered from ${assetTagFor(assetCode, 0)}`)
  }

  /** §5.2 — Import CSV. One serial per line; blanks and a header row ignored. */
  const importCsv = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onerror = () => setCsvNote('Could not read that file.')
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const rows = text
        .split(/\r?\n/)
        .map((line) => (line.split(',')[0] ?? '').trim())
        .filter((s) => s.length > 0)
        .filter((s) => s.toLowerCase() !== 'serial' && s.toLowerCase() !== 'serial number')
      if (rows.length === 0) {
        setCsvNote('No serials found — the file’s first column was empty.')
        return
      }
      setUnits((prev) => {
        const existing = prev.filter((u) => u.serial.trim())
        const merged = [...existing]
        rows.forEach((serial) => {
          merged.push({
            id: `u-csv-${merged.length}-${Date.now()}`,
            serial,
            assetTag: assetTagFor(assetCode, merged.length),
            condition: 'Excellent',
            purchaseIso: money ? purchaseIso : todayIso,
          })
        })
        return merged.length > 0
          ? merged.map((u, i) => ({ ...u, assetTag: assetTagFor(assetCode, i) }))
          : prev
      })
      setCsvNote(`${rows.length} serial${rows.length === 1 ? '' : 's'} imported. Duplicates are flagged on the rows below.`)
      showSuccessToast('Serials imported', `${rows.length} row${rows.length === 1 ? '' : 's'} read from ${file.name}`)
    }
    reader.readAsText(file)
  }

  const addImages = (list: FileList | null, target: 'thumb' | 'gallery') => {
    if (!list || list.length === 0) return
    const limit = target === 'thumb' ? THUMB_MAX_BYTES : GALLERY_MAX_BYTES
    let err: string | null = null
    const accepted: FileDraft[] = []
    Array.from(list).forEach((file, i) => {
      if (!IMAGE_TYPES.includes(file.type)) {
        err = `${file.name}: images must be JPG, PNG or WebP.`
        return
      }
      if (file.size > limit) {
        err = `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(limit)}.`
        return
      }
      accepted.push({ id: `${file.name}-${file.size}-${i}-${Date.now()}`, file, url: URL.createObjectURL(file) })
    })
    setImageError(err)
    if (accepted.length === 0) return
    if (target === 'thumb') {
      const first = accepted[0]
      if (!first) return
      if (thumbnail) URL.revokeObjectURL(thumbnail.url)
      accepted.slice(1).forEach((a) => URL.revokeObjectURL(a.url))
      setThumbnail(first)
    } else {
      setGallery((prev) => [...prev, ...accepted])
    }
  }

  const addDocuments = (list: FileList | null) => {
    if (!list || list.length === 0) return
    let err: string | null = null
    const accepted: FileDraft[] = []
    Array.from(list).forEach((file, i) => {
      if (!DOC_TYPES.includes(file.type)) {
        err = `${file.name}: documents must be PDF, JPG or PNG.`
        return
      }
      if (file.size > DOC_MAX_BYTES) {
        err = `${file.name} is ${formatBytes(file.size)} — the limit is 50 MB.`
        return
      }
      accepted.push({ id: `${file.name}-${file.size}-${i}-${Date.now()}`, file, url: URL.createObjectURL(file) })
    })
    setDocError(err)
    if (accepted.length) setDocuments((prev) => [...prev, ...accepted])
  }

  const addContained = (modelId: string) => {
    if (!modelId) return
    setContains((prev) =>
      prev.some((c) => c.modelId === modelId)
        ? prev.map((c) => (c.modelId === modelId ? { ...c, quantity: c.quantity + 1 } : c))
        : [...prev, { id: `c-${modelId}-${Date.now()}`, modelId, quantity: 1 }],
    )
  }

  /** §7 — the duplicate scan, run on demand from the rail as well as on blur. */
  const runDuplicateCheck = () => {
    const found: string[] = []
    units.forEach((u, i) => {
      const issue = serialIssues.get(u.id)
      if (issue && u.serial.trim()) found.push(`Unit ${i + 1}: ${issue}`)
    })
    const model = existingModelMatch(name, modelNo)
    if (model) found.push(`A record already reads “${model.name}” (${model.sku}).`)
    setDuplicateReport(found)
    setTouchedSerials(new Set(units.map((u) => u.id)))
    if (found.length === 0) showSuccessToast('No duplicates found', `${units.length} serial${units.length === 1 ? '' : 's'} and the name checked against the whole system`)
  }

  const copyAssetCode = () => {
    void navigator.clipboard
      ?.writeText(assetCode)
      .then(() => showSuccessToast('Asset code copied', assetCode))
      .catch(() => setClipboardError(`The browser refused clipboard access — the code is ${assetCode}.`))
  }

  /* ── validation ──────────────────────────────────────────────────────── */

  function validate(mode: 'draft' | 'create'): Record<string, string> {
    const e: Record<string, string> = {}

    /* §13 — a Draft keeps an incomplete record, so only structural faults are
       checked for it. Create publishes, so the required set applies. */
    if (mode === 'create') {
      if (!name.trim()) e.name = 'Equipment Name is required.'
      if (!category) e.category = 'Category is required.'
      if (!brand.trim()) e.brand = 'Brand is required.'
    }

    /*
     * §3 — quantity never appears in the name: `NP-FZ100 Battery (x4)` is wrong.
     *
     * The multiplier has to be **delimited**. An undelimited `[×x]\d+` matches
     * the `X3` in `Sony FX3`, the `X4` in `Komodo X4` and the `x1` in any model
     * number, and would block half the catalogue from being named at all.
     */
    if (/(^|[\s(])[×x]\s*\d+\b/i.test(name) || /\(\s*\d{1,3}\s*(pcs?|pieces|units|nos)\s*\)/i.test(name)) {
      e.name = 'Quantity never appears in the name — the name is the model, the count is Section 2.'
    }

    if (manufacturerDiffers && !manufacturer.trim()) {
      e.manufacturer = 'Manufacturer is shown because it differs from Brand — give it a value or untick the box.'
    }
    if (manufacturerDiffers && manufacturer.trim().toLowerCase() === brand.trim().toLowerCase() && brand.trim()) {
      e.manufacturer = 'Manufacturer matches Brand — untick the box instead of repeating it.'
    }

    if (serialised) {
      if (units.length === 0) {
        e.stock = 'A serialised record needs at least one unit.'
      } else if (mode === 'create' && units.some((u) => !u.serial.trim())) {
        e.stock = 'Every unit needs the manufacturer serial before the record can be created.'
      } else if (units.some((u) => u.serial.trim() && serialIssues.has(u.id))) {
        e.stock = 'One or more serials clash — every serial is unique across the whole system.'
      }
    } else {
      if (!Number.isFinite(quantity) || quantity < 1) e.stock = 'Quantity must be at least 1.'
      else if (reorderLevel > quantity) e.reorder = 'Reorder level cannot exceed the total quantity.'
    }

    /* §6.4 — an item cannot be its own container, and one container per item.
       Nested containment beyond one level is Roadmap (§14), so a deeper cycle
       cannot exist to check for yet. */
    if (storedIn && contains.some((c) => c.modelId === storedIn)) {
      e.relationships = `${modelName(storedIn)} cannot both contain this item and be contained by it.`
    }

    if (mode === 'create' && !locationComplete) {
      e.location = 'Warehouse and storage bin are required — the floor has to be able to find it.'
    }

    if (money) {
      const price = parseMoney(purchasePrice)
      if (purchasePrice.trim() && (price === null || price < 0)) e.purchasePrice = 'Enter an amount, e.g. 4,65,000.'
      if (replacementValue.trim() && (replacementPaisa === null || replacementPaisa <= 0)) {
        e.replacementValue = 'Replacement value must be a positive amount — damage charges are computed from it.'
      }
      if (dailyRate.trim() && (dailyPaisa === null || dailyPaisa < 0)) e.dailyRate = 'Enter an amount, e.g. 4,500.'
      if (depositKind === 'percent' && depositPercent.trim()) {
        const pct = Number(depositPercent)
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) e.deposit = 'A deposit percentage runs from 0 to 100.'
        else if (!replacementPaisa) e.deposit = 'A percentage deposit needs a replacement value to compute against.'
      }
      if (depositKind === 'fixed' && depositFixed.trim() && parseMoney(depositFixed) === null) {
        e.deposit = 'Enter an amount, e.g. 25,000.'
      }
    }

    return e
  }

  function handleSubmit(mode: 'draft' | 'create') {
    setSubmitted(mode)
    const e = validate(mode)
    setOutcome(null)
    if (Object.keys(e).length > 0) {
      const firstSection = sectionDefs.find((s) =>
        s.id === 'sec-identity'
          ? Boolean(e.name || e.category || e.brand || e.manufacturer)
          : s.id === 'sec-stock'
            ? Boolean(e.stock || e.reorder)
            : s.id === 'sec-relationships'
              ? Boolean(e.relationships)
              : s.id === 'sec-location'
                ? Boolean(e.location)
                : s.id === 'sec-purchase'
                  ? Boolean(e.purchasePrice || e.replacementValue)
                  : s.id === 'sec-pricing'
                    ? Boolean(e.dailyRate || e.deposit)
                    : false,
      )
      if (firstSection) document.getElementById(firstSection.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const lines = [
      `Asset Code ${assetCode} · ${name.trim() || 'unnamed'}`,
      serialised
        ? units.length === 1
          ? `1 serialised unit, asset tag ${assetTagFor(assetCode, 0)}`
          : `${units.length} serialised units, asset tags ${assetTagFor(assetCode, 0)}–${assetTagFor(assetCode, units.length - 1)}`
        : `${countOf(quantity, quantityUnit)} tracked by quantity`,
      storedIn ? `Stored in ${modelName(storedIn)}` : 'No container — direct shelf',
      chosenLocation ? locationLabel(chosenLocation) : 'No location set',
      mode === 'create'
        ? !money
          ? 'Would publish as Draft — pricing is set by Owner or Admin'
          : rentable
            ? 'Ready to Rent — all gates clear'
            : 'Would publish as Draft — Ready to Rent is not satisfied'
        : 'Draft — excluded from booking search, availability and Inventory totals',
    ]
    setOutcome({ kind: mode === 'create' ? 'validated' : 'draft', lines })
  }

  /* ── rail ────────────────────────────────────────────────────────────── */

  const createdBs = toBs(TODAY)

  const relationshipRows = [
    { label: 'Stored in', value: storedIn ? modelName(storedIn) : 'None — direct shelf' },
    {
      label: 'Contains',
      value: contains.length
        ? `${countOf(contains.reduce((n, c) => n + c.quantity, 0), 'item')} · ${countOf(contains.length, 'type')}`
        : 'None',
    },
    { label: 'Total stock (this item)', value: serialised ? countOf(units.length, 'unit') : countOf(quantity, quantityUnit) },
    { label: 'Tracking', value: tracking },
    { label: 'Used in bundles', value: usedInBundles.length ? String(usedInBundles.length) : 'None' },
    { label: 'Compatible with', value: compatible.length ? String(compatible.length) : 'None' },
  ]

  const quickActionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '10px 6px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    color: 'var(--text)',
    fontSize: 'var(--t-th)',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'center',
  }

  const railContent = (
    <>
      <Card title="Quick Info">
        <SummaryRows
          rows={[
            { label: 'Created by', value: user?.name ?? '—' },
            { label: 'Created date', value: createdBs ? `${formatBs(createdBs)} · ${formatAd(TODAY)}` : formatAd(TODAY) },
            { label: 'Last updated', value: 'Never saved' },
            { label: 'Record status', value: 'Draft', tone: 'neutral' },
          ]}
        />
      </Card>

      <Card title="Codes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Asset Code (Auto)', value: assetCode },
            { label: 'Barcode payload (Auto)', value: assetCode },
            { label: 'QR payload (Auto)', value: assetCode },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{row.label}</span>
              <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--link)' }}>
                {row.value}
              </span>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
            §4 — one code drives both. The barcode and QR <strong>images</strong> are not drawn: a glyph no scanner can
            read would be fabricated data on the one panel whose job is identifiers. Rendering arrives with label printing.
          </p>
        </div>
      </Card>

      {/* §8.2 — every count below is computed from the array it sits above. */}
      <Card title="Equipment Preview">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
          {storedIn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
              <Icon name="package" size={13} style={{ color: 'var(--link)' }} />
              <span style={{ fontWeight: 600 }}>{modelName(storedIn)}</span>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>container</span>
            </div>
          )}
          <div style={{ paddingLeft: storedIn ? 14 : 0, borderLeft: storedIn ? '1px solid var(--border)' : 'none', marginLeft: storedIn ? 6 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)', fontWeight: 700 }}>
              <Icon name="box" size={13} style={{ color: 'var(--link)' }} />
              {name.trim() || 'Untitled equipment'}
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginLeft: 19 }}>
              {countOf(stockCount, serialised ? 'unit' : quantityUnit)} · {tracking}
              {category ? ` · ${category}` : ''}
            </div>

            {serialised && (
              <div style={{ marginTop: 6, marginLeft: 8, paddingLeft: 10, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {units.map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="identifier" style={{ color: u.serial.trim() ? 'var(--text)' : 'var(--muted)', fontSize: 'var(--t-th)' }}>
                      {u.serial.trim() || 'no serial yet'}
                    </span>
                    <span className="identifier" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>{u.assetTag}</span>
                    <DraftStatusBadge />
                  </div>
                ))}
              </div>
            )}

            {contains.length > 0 && (
              <div style={{ marginTop: 6, marginLeft: 8, paddingLeft: 10, borderLeft: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {contains.map((c) => (
                  <div key={c.id} style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    {modelName(c.modelId)} <span style={{ color: 'var(--muted)' }}>× {c.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* §8.2 — the four invariants, asserted where the reader can see them. */}
          <div
            style={{
              marginTop: 6,
              padding: '7px 9px',
              borderRadius: 8,
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              fontSize: 'var(--t-th)',
              color: 'var(--text2)',
            }}
          >
            <Icon name="check" size={12} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 2 }} />
            <span>
              Preview reconciles — {serialised ? units.length : quantity} listed ={' '}
              {stockCount} stock, {contains.reduce((n, c) => n + c.quantity, 0)} contained ={' '}
              {contains.reduce((n, c) => n + c.quantity, 0)} in the summary. No unit carries a booking: the record does
              not exist yet.
            </span>
          </div>
        </div>
      </Card>

      <Card title="Relationship Summary">
        <SummaryRows rows={relationshipRows} />
        {usedInBundles.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {usedInBundles.map((b) => (
              <Chip key={b} icon="queues">{b}</Chip>
            ))}
          </div>
        )}
      </Card>

      <Card title="Ready to Rent">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {readyChecks.map((r) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--t-meta)' }}>
              <Icon
                name={r.ok ? 'check' : 'alert_triangle'}
                size={14}
                style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0, marginTop: 2 }}
              />
              <span style={{ color: r.ok ? 'var(--text)' : 'var(--text2)' }}>{r.label}</span>
            </div>
          ))}

          {/* §12 — the money-blind checklist states who owns the gap, with no figures. */}
          {!money && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--t-meta)' }}>
              <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: 'var(--text2)' }}>Pricing pending — Owner or Admin. Purchase and pricing are not part of this role’s form.</span>
            </div>
          )}

          <p style={{ margin: 0, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
            {!money
              ? 'Pricing is owned by Owner or Admin, so whether this is rentable cannot be told from here. Until it is set the record stays a Draft — excluded from booking search, availability and Inventory KPI totals. Saving is never blocked by any of it.'
              : rentable
                ? 'All gates clear. Creating this record would publish it into booking search and availability.'
                : 'Until these clear the record stays a Draft: excluded from booking search, availability and Inventory KPI totals. Saving is never blocked by them.'}
          </p>
        </div>
      </Card>

      {/* §8.1 — three quick actions plus More. */}
      <Card title="Quick Actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          <button type="button" className="lift" style={quickActionStyle} onClick={generateAssetTags} disabled={!serialised}>
            <Icon name="checklist" size={17} />
            Generate Asset Tags
          </button>
          <button type="button" className="lift" style={quickActionStyle} onClick={runDuplicateCheck}>
            <Icon name="search" size={17} />
            Check Duplicates
          </button>
          <button type="button" className="lift" style={quickActionStyle} onClick={copyAssetCode}>
            <Icon name="file" size={17} />
            Copy Asset Code
          </button>
        </div>

        {clipboardError && (
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 8, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
            <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            {clipboardError}
          </span>
        )}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          style={{
            marginTop: 10,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 30,
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--link)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          More
          <Icon name={moreOpen ? 'chevron_up' : 'chevron_down'} size={14} />
        </button>

        {moreOpen && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Unavailable reason={LABEL_PRINT_UNAVAILABLE_REASON} style={{ width: '100%' }}>
              <span style={{ ...quickActionStyle, width: '100%', flexDirection: 'row', justifyContent: 'flex-start', opacity: 0.55 }}>
                <Icon name="download" size={15} />
                Print Labels — not built
              </span>
            </Unavailable>
            <Unavailable reason={PACKING_PREVIEW_UNAVAILABLE_REASON} style={{ width: '100%' }}>
              <span style={{ ...quickActionStyle, width: '100%', flexDirection: 'row', justifyContent: 'flex-start', opacity: 0.55 }}>
                <Icon name="file" size={15} />
                Packing List Preview — needs a saved record
              </span>
            </Unavailable>
          </div>
        )}

        {duplicateReport && (
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${duplicateReport.length ? 'var(--danger)' : 'var(--border)'}`,
              background: 'var(--card2)',
              fontSize: 'var(--t-th)',
              color: 'var(--text2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <strong style={{ color: duplicateReport.length ? 'var(--danger-text)' : 'var(--success-text)' }}>
              {duplicateReport.length ? `${duplicateReport.length} clash${duplicateReport.length === 1 ? '' : 'es'} found` : 'No duplicates found'}
            </strong>
            {duplicateReport.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        )}
      </Card>
    </>
  )

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingBottom: 40 }}>
      {/* §2 — breadcrumb, and deliberately no Back button. */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        <Link to="/inventory" style={{ color: 'var(--text2)', textDecoration: 'none' }}>
          Inventory
        </Link>
        <span aria-hidden>›</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>Add Equipment</span>
        <span
          className="identifier"
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-th)',
            color: 'var(--nav-active-accent)',
          }}
        >
          {assetCode}
        </span>
      </nav>

      <PageHeader
        icon="box"
        title="Add Equipment"
        description="Create an equipment record: its identity, its serialised units, where it lives, what it belongs to and what it works with."
        actions={
          <>
            <Button variant="ghost" onClick={() => (isDirty ? setShowDiscard(true) : navigate('/inventory'))}>
              Cancel
            </Button>
            <Unavailable reason={PREVIEW_UNAVAILABLE_REASON}>
              <Button variant="secondary" icon="eye" disabled>
                Preview
              </Button>
            </Unavailable>
            <Button variant="secondary" onClick={() => handleSubmit('draft')}>
              Save Draft (not stored)
            </Button>
            <Button variant="primary" icon="check" onClick={() => handleSubmit('create')}>
              Create Equipment (not stored)
            </Button>
          </>
        }
      />

      {/* The submit buttons say what they do; this says why. */}
      <div
        role="note"
        style={{
          ...cardStyle,
          padding: '10px 12px',
          display: 'flex',
          gap: 9,
          alignItems: 'flex-start',
          borderColor: 'var(--border)',
        }}
      >
        <Icon name="info" size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>{SAVE_UNAVAILABLE_REASON}</span>
      </div>

      {SEED_ERRORS.length > 0 && (
        <div role="alert" style={{ ...cardStyle, padding: 12, borderColor: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--danger-text)' }}>Seed data does not reconcile</strong>
          {SEED_ERRORS.map((e) => (
            <span key={e} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {e}
            </span>
          ))}
        </div>
      )}

      {/* §7 — duplicate detection on name + model, warned and linked. */}
      {duplicateModel && (
        <div role="alert" style={{ ...cardStyle, padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Icon name="alert_triangle" size={17} style={{ color: 'var(--progress-text)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>This equipment may already exist</div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>
              {duplicateModel.name} · <span className="identifier">{duplicateModel.sku}</span> · {duplicateModel.stock} in stock
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="secondary" onClick={() => navigate('/inventory')}>
              Open Inventory
            </Button>
            <Button variant="ghost" onClick={() => setDismissedDuplicate(true)}>
              Continue Anyway
            </Button>
          </div>
        </div>
      )}

      {/* Errors are inline and persistent; a toast never carries one. */}
      {submitted && Object.keys(errors).length > 0 && (
        <div role="alert" style={{ ...cardStyle, padding: 12, borderColor: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--danger-text)' }}>
            {Object.keys(errors).length} thing{Object.keys(errors).length === 1 ? '' : 's'} to fix before this record can be created
          </strong>
          {Object.entries(errors).map(([k, v]) => (
            <span key={k} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              · {v}
            </span>
          ))}
        </div>
      )}

      {/* A report of what was validated is only true while it still validates. */}
      {outcome && Object.keys(errors).length === 0 && (
        <div role="status" style={{ ...cardStyle, padding: 12, borderColor: 'var(--success)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--success-text)' }}>
            {outcome.kind === 'validated' ? 'Record validated' : 'Draft validated'} — nothing was stored
          </strong>
          {outcome.lines.map((l) => (
            <span key={l} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              · {l}
            </span>
          ))}
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 3 }}>
            This is what would be written once equipment gains a data layer. Your entries are still on the page.
          </span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'desktop' ? 'auto minmax(0, 1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* §2 — a sticky section nav, not a stepper. Any section, any order. */}
        {viewport === 'desktop' && (
          <aside style={{ position: 'sticky', top: 16 }}>
            <SideRail width={196} label="Sections">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--t-th)', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '0 8px 4px' }}>
                  Sections
                </span>
                {sectionDefs.map((sec, i) => {
                  const on = activeSection === sec.id
                  const dot = sec.blocked ? 'var(--danger-text)' : sec.complete ? 'var(--success-text)' : 'var(--border2)'
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      onClick={() => setActiveSection(sec.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '7px 9px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 700 : 500,
                        color: on ? 'var(--text)' : 'var(--text2)',
                        background: on ? 'var(--nav-active-bg)' : 'transparent',
                        border: `1px solid ${on ? 'var(--border)' : 'transparent'}`,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: 'var(--muted)', marginRight: 5 }}>{i + 1}</span>
                        {sec.label}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 999,
                          flexShrink: 0,
                          background: sec.complete && !sec.blocked ? dot : 'transparent',
                          border: `1.5px solid ${dot}`,
                        }}
                      />
                    </a>
                  )
                })}

                <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Any order</div>
                  Every section can be filled in any order — this is a record, not a wizard.
                </div>
              </div>
            </SideRail>
          </aside>
        )}

        {/* ── the form ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {/* 1 · Identity — §3 */}
          <SectionCard id="sec-identity" n={sectionNumber('sec-identity')} title="Identity">
            <div style={fieldRow}>
              <Field label="Equipment Name" required error={errors.name} span={2}>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                  }}
                  placeholder="e.g. Sony FX3 Camera Body"
                  style={inputStyle(Boolean(errors.name))}
                />
              </Field>
              <Field label="Short Name" hint="Used on labels and packing lists.">
                <input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="e.g. FX3 Body"
                  style={inputStyle()}
                />
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Asset Code" hint="Auto, read-only. This is also the SKU — §4.">
                <input value={assetCode} readOnly className="identifier" style={{ ...inputStyle(), background: 'var(--card)', color: 'var(--nav-active-accent)' }} />
              </Field>
              <Field label="Category" required error={errors.category}>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value)
                  }}
                  style={inputStyle(Boolean(errors.category))}
                >
                  <option value="">Select a category</option>
                  {EQUIPMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brand" required error={errors.brand}>
                <input
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value)
                  }}
                  placeholder="e.g. Sony"
                  style={inputStyle(Boolean(errors.brand))}
                />
              </Field>
              <Field label="Model">
                <input value={modelNo} onChange={(e) => setModelNo(e.target.value)} placeholder="e.g. ILME-FX3" style={inputStyle()} />
              </Field>
            </div>

            {/* §3 — Manufacturer appears only when it differs from Brand. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={manufacturerDiffers}
                  onChange={(e) => {
                    setManufacturerDiffers(e.target.checked)
                    if (!e.target.checked) {
                      setManufacturer('')
                    }
                  }}
                  style={{ width: 15, height: 15, accentColor: 'var(--nav-active-accent)' }}
                />
                Manufacturer differs from Brand
                <span style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                  — a Zeiss lens made by Cosina, a rebadged light. Rare, so the field is hidden until it is true.
                </span>
              </label>
              {manufacturerDiffers && (
                <div style={fieldRow}>
                  <Field label="Manufacturer" required error={errors.manufacturer}>
                    <input
                      value={manufacturer}
                      onChange={(e) => {
                        setManufacturer(e.target.value)
                      }}
                      placeholder="e.g. Cosina"
                      style={inputStyle(Boolean(errors.manufacturer))}
                    />
                  </Field>
                </div>
              )}
            </div>

            <Field label="Description">
              <textarea
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Full-frame Cinema Line camera, S-Cinetone, 4K 120p, 10-bit 4:2:2 internal…"
                style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical' }}
              />
            </Field>
            <div style={{ marginTop: -8, display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              <span>Plain text. No rich-text engine exists, so no formatting toolbar is drawn.</span>
              <span className="figure">{description.length} / 1000</span>
            </div>

            {/* Thumbnail + gallery — §3. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Thumbnail</span>
                <button
                  type="button"
                  onClick={() => thumbInput.current?.click()}
                  style={{
                    width: 132,
                    height: 100,
                    borderRadius: 8,
                    border: `1.5px dashed ${thumbnail ? 'var(--border)' : 'var(--border2)'}`,
                    background: 'var(--card2)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    padding: 0,
                  }}
                >
                  {thumbnail ? (
                    <img src={thumbnail.url} alt={thumbnail.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                      <Icon name="photo" size={20} />
                      Add thumbnail
                    </span>
                  )}
                </button>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>JPG, PNG or WebP · 5 MB</span>
                <input
                  ref={thumbInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    addImages(e.target.files, 'thumb')
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Images</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {gallery.map((g) => (
                    <span key={g.id} style={{ position: 'relative', width: 74, height: 60, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={g.url} alt={g.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(g.url)
                          setGallery((prev) => prev.filter((x) => x.id !== g.id))
                        }}
                        aria-label={`Remove ${g.file.name}`}
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: 'none',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                          padding: 0,
                        }}
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => galleryInput.current?.click()}
                    style={{
                      width: 74,
                      height: 60,
                      borderRadius: 6,
                      border: '1.5px dashed var(--border2)',
                      background: 'transparent',
                      color: 'var(--link)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      fontSize: 'var(--t-th)',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="plus" size={14} />
                    Add More
                  </button>
                </div>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>50 MB per file (Evidence v1.1).</span>
                <input
                  ref={galleryInput}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    addImages(e.target.files, 'gallery')
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {imageError && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {imageError}
              </span>
            )}
          </SectionCard>

          {/* 2 · Stock & Units — §5 */}
          <SectionCard
            id="sec-stock"
            n={sectionNumber('sec-stock')}
            title="Stock & Units"
            note="One Tracking field — it replaces Equipment Type, Has Serial Number and Tracking Type (§5.1)."
            action={
              serialised ? (
                <>
                  <Button variant="ghost" onClick={() => csvInput.current?.click()} icon="upload">
                    Import CSV
                  </Button>
                  <Button variant="ghost" onClick={generateAssetTags}>
                    Generate Asset Tags
                  </Button>
                  <Button variant="secondary" icon="plus" onClick={addUnit}>
                    Add Unit
                  </Button>
                </>
              ) : undefined
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
              {TRACKING_MODES.map((t) => {
                const on = tracking === t.mode
                return (
                  <button
                    key={t.mode}
                    type="button"
                    onClick={() => {
                      setTracking(t.mode)
                    }}
                    aria-pressed={on}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: on ? 'var(--nav-active-accent)' : 'var(--text)' }}>{t.label}</span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.4 }}>{t.blurb}</span>
                  </button>
                )
              })}
            </div>

            {errors.stock && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {errors.stock}
              </span>
            )}

            {serialised ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: 34 }}>#</th>
                        <th style={th}>
                          Serial <span style={{ color: 'var(--danger-text)' }}>*</span>
                        </th>
                        <th style={{ ...th, width: 128 }}>Asset Tag</th>
                        <th style={{ ...th, width: 128 }}>Barcode</th>
                        <th style={{ ...th, width: 92 }}>QR</th>
                        <th style={{ ...th, width: 132 }}>Status</th>
                        <th style={{ ...th, width: 128 }}>Condition</th>
                        <th style={{ ...th, width: 152 }}>Purchase Date</th>
                        <th style={{ ...th, width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u, i) => {
                        const issue = visibleSerialIssue(u)
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...td, color: 'var(--muted)' }}>{i + 1}</td>
                            <td style={td}>
                              <input
                                value={u.serial}
                                className="identifier"
                                placeholder="Typed or scanned off the body"
                                onChange={(e) => patchUnit(u.id, { serial: e.target.value })}
                                onBlur={() =>
                                  setTouchedSerials((prev) => {
                                    const next = new Set(prev)
                                    next.add(u.id)
                                    return next
                                  })
                                }
                                style={{ ...inputStyle(Boolean(issue)), height: 31 }}
                              />
                              {issue && (
                                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                                  <Icon name="error" size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                                  {issue}
                                </span>
                              )}
                            </td>
                            <td style={{ ...td }}>
                              <span className="identifier" style={{ color: 'var(--text2)', fontSize: 'var(--t-th)' }}>{u.assetTag}</span>
                            </td>
                            <td style={td}>
                              <span className="identifier" style={{ color: 'var(--text2)', fontSize: 'var(--t-th)' }}>
                                {barcodePayload(u)}
                              </span>
                            </td>
                            <td style={td}>
                              <span
                                title={`QR encodes the same payload as the barcode: ${barcodePayload(u)}`}
                                style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}
                              >
                                Same payload
                              </span>
                            </td>
                            <td style={td}>
                              <DraftStatusBadge />
                            </td>
                            <td style={td}>
                              <select
                                value={u.condition}
                                onChange={(e) => patchUnit(u.id, { condition: e.target.value as IntakeCondition })}
                                style={{ ...inputStyle(), height: 31 }}
                              >
                                {INTAKE_CONDITIONS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <div style={{ marginTop: 4 }}>
                                <ConditionBadge condition={u.condition} />
                              </div>
                            </td>
                            <td style={td}>
                              <BsAbove iso={u.purchaseIso} />
                              <input
                                type="date"
                                value={u.purchaseIso}
                                onChange={(e) => patchUnit(u.id, { purchaseIso: e.target.value })}
                                style={{ ...inputStyle(), height: 31, marginTop: 3 }}
                              />
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              {units.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeUnit(u.id)}
                                  aria-label={`Remove unit ${i + 1}`}
                                  style={{ border: 'none', background: 'transparent', color: 'var(--danger-text)', cursor: 'pointer' }}
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Button variant="secondary" icon="plus" onClick={addUnit}>
                    Add Unit
                  </Button>
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45, flex: 1, minWidth: 240 }}>
                    <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                    Serials are the manufacturer’s and are typed or scanned — never generated (§4). Every serial is unique
                    across the whole system; a clash is named on the row. The asset tag is ours and may be generated; the
                    barcode and QR carry the same payload, drawn on the printed label. Status is engine-owned: a Draft’s
                    units carry no status, and creation sets every one to In Stock (§5.3).
                  </span>
                </div>

                <input
                  ref={csvInput}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={(e) => {
                    importCsv(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
                {csvNote && (
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{csvNote}</span>
                )}
              </>
            ) : (
              <div style={fieldRow}>
                <Field label={tracking === 'Consumable' ? 'Total Quantity' : 'Total Quantity'} required error={errors.stock}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      style={{ width: 34, height: 36, borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(Math.max(0, Number(e.target.value)))
                      }}
                      style={{ ...inputStyle(Boolean(errors.stock)), textAlign: 'center' }}
                      className="figure"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      aria-label="Increase quantity"
                      style={{ width: 34, height: 36, borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <Field label="Reorder Level" error={errors.reorder} hint="Below this, the item is flagged for restock.">
                  <input
                    type="number"
                    min={0}
                    value={reorderLevel}
                    onChange={(e) => {
                      setReorderLevel(Math.max(0, Number(e.target.value)))
                    }}
                    style={inputStyle(Boolean(errors.reorder))}
                    className="figure"
                  />
                </Field>
                <Field label="Unit">
                  <select value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)} style={inputStyle()}>
                    {QUANTITY_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                {tracking === 'Consumable' && (
                  <Field label="Behaviour" span={3}>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      Consumed on return — this stock never comes back (§5.1). No units, no serials.
                    </span>
                  </Field>
                )}
              </div>
            )}
          </SectionCard>

          {/* 3 · Relationships — §6 */}
          <SectionCard
            id="sec-relationships"
            n={sectionNumber('sec-relationships')}
            title="Relationships"
            note="Three classes, three cardinalities — containment is one, membership is many, compatibility is many-to-many."
          >
            {errors.relationships && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {errors.relationships}
              </span>
            )}

            {/* §6.1 — containment, physical, one parent. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Containment — one container at a time</strong>
              <div style={fieldRow}>
                <Field label="Stored In" hint="Moving the container moves everything inside it.">
                  <select
                    value={storedIn}
                    onChange={(e) => {
                      setStoredIn(e.target.value)
                    }}
                    style={inputStyle(Boolean(errors.relationships))}
                  >
                    <option value="">None — direct shelf</option>
                    {CONTAINER_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.sku})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Contains" hint="Existing inventory is attached, never duplicated.">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={containPick} onChange={(e) => setContainPick(e.target.value)} style={inputStyle()}>
                      <option value="">Select an item to attach</option>
                      {ATTACHABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        addContained(containPick)
                        setContainPick('')
                      }}
                    >
                      Attach
                    </Button>
                  </div>
                </Field>
              </div>

              {contains.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contains.map((c) => (
                    <div
                      key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 7, background: 'var(--card2)', border: '1px solid var(--border)' }}
                    >
                      <Icon name="package" size={14} style={{ color: 'var(--link)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{modelName(c.modelId)}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={c.quantity}
                          onChange={(e) =>
                            setContains((prev) => prev.map((x) => (x.id === c.id ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))
                          }
                          className="figure"
                          style={{ ...inputStyle(), width: 62, height: 28 }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setContains((prev) => prev.filter((x) => x.id !== c.id))}
                        aria-label={`Detach ${modelName(c.modelId)}`}
                        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  ))}
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    Detaching removes only the relationship — the child stays an independent asset (§6.1).
                  </span>
                </div>
              )}

              {/* §7 — auto-suggested children from what comparable units contain. */}
              {suggestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    Suggested from what other {category || brand} units contain — click to attach:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addContained(s.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 9px',
                          borderRadius: 'var(--r-badge)',
                          border: '1px dashed var(--border2)',
                          background: 'transparent',
                          color: 'var(--link)',
                          fontSize: 'var(--t-meta)',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="plus" size={11} />
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
                <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                {CONTAINER_CAPACITY_REASON}
              </span>
            </div>

            {/* §6.2 — kit membership, read-only. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Kit membership — read-only here</strong>
              {usedInBundles.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {usedInBundles.map((b) => (
                    <Chip key={b} icon="queues">
                      {b}
                    </Chip>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Not used in any bundle. Bundles are built in Inventory ▸ Bundles; this panel only shows where the item is
                  already used, so a retirement’s blast radius is visible.
                </span>
              )}
            </div>

            {/* §6.3 — compatibility, informational, many-to-many. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Compatibility — never affects availability or price</strong>
              <div style={fieldRow}>
                <Field label="Compatible with">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={compatiblePick} onChange={(e) => setCompatiblePick(e.target.value)} style={inputStyle()}>
                      <option value="">Select an item</option>
                      {ATTACHABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (compatiblePick && !compatible.includes(compatiblePick)) setCompatible((prev) => [...prev, compatiblePick])
                        setCompatiblePick('')
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </Field>
                <Field label="Requires" hint="Powers the missing-accessory warning at packing.">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={requiresPick} onChange={(e) => setRequiresPick(e.target.value)} style={inputStyle()}>
                      <option value="">Select an item</option>
                      {ATTACHABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (requiresPick && !requires.includes(requiresPick)) setRequires((prev) => [...prev, requiresPick])
                        setRequiresPick('')
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </Field>
              </div>

              {(compatible.length > 0 || requires.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {compatible.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', width: 74 }}>Compatible</span>
                      {compatible.map((id) => (
                        <Chip key={id} icon="external_link" onRemove={() => setCompatible((prev) => prev.filter((x) => x !== id))}>
                          {modelName(id)}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {requires.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', width: 74 }}>Requires</span>
                      {requires.map((id) => (
                        <Chip key={id} icon="plug" onRemove={() => setRequires((prev) => prev.filter((x) => x !== id))}>
                          {modelName(id)}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* 4 · Location — §11 */}
          <SectionCard
            id="sec-location"
            n={sectionNumber('sec-location')}
            title="Location"
            note="Warehouse › Zone › Rack › Shelf › Bin. The container comes from Section 3, never typed here."
          >
            <div style={fieldRow}>
              <Field label="Warehouse" required error={errors.location}>
                <select
                  value={warehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value)
                    setLocationId('')
                  }}
                  style={inputStyle(Boolean(errors.location))}
                >
                  <option value="">Select a warehouse</option>
                  {WAREHOUSES.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Storage bin"
                required
                span={2}
                hint={warehouseId ? undefined : 'Choose a warehouse first — bins belong to one.'}
              >
                <select
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value)
                  }}
                  disabled={!warehouseId}
                  style={{ ...inputStyle(Boolean(errors.location)), opacity: warehouseId ? 1 : 0.6 }}
                >
                  <option value="">{warehouseId ? 'Select a bin' : 'No warehouse selected'}</option>
                  {warehouseLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {locationLabel(l)} — {l.capacity - l.used} of {l.capacity} free
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {chosenLocation && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '9px 11px',
                  borderRadius: 8,
                  border: `1px solid ${overCapacity ? 'var(--danger)' : 'var(--border)'}`,
                  background: 'var(--card2)',
                }}
              >
                <Icon
                  name={overCapacity ? 'alert_triangle' : 'check'}
                  size={14}
                  style={{ color: overCapacity ? 'var(--danger-text)' : 'var(--success-text)', flexShrink: 0, marginTop: 2 }}
                />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                  {locationLabel(chosenLocation)} holds <span className="figure">{chosenLocation.used}</span> of{' '}
                  <span className="figure">{chosenLocation.capacity}</span> slots.{' '}
                  {overCapacity
                    ? `${stockCount} units will not fit in the ${freeSlots} free slots — split the stock or pick another bin.`
                    : `${freeSlots} free, enough for the ${stockCount} being added.`}
                </span>
              </div>
            )}
          </SectionCard>

          {/* 5 · Purchase — §10.1. Omitted entirely for money-blind roles (§12). */}
          {money && (
            <SectionCard
              id="sec-purchase"
              n={sectionNumber('sec-purchase')}
              title="Purchase"
              note="Replacement value is what damage charges and insurance claims are computed from."
            >
              <div style={fieldRow}>
                <Field label="Purchase date">
                  <BsAbove iso={purchaseIso} />
                  <input type="date" value={purchaseIso} onChange={(e) => setPurchaseIso(e.target.value)} style={inputStyle()} />
                </Field>
                <Field label="Supplier">
                  <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Camera Zone Nepal" style={inputStyle()} />
                </Field>
                <Field label="Asset owner">
                  <input value={assetOwner} onChange={(e) => setAssetOwner(e.target.value)} style={inputStyle()} />
                </Field>
              </div>

              <div style={fieldRow}>
                <Field
                  label="Purchase price (NPR)"
                  error={errors.purchasePrice}
                  hint={parseMoney(purchasePrice) ? formatMoney(parseMoney(purchasePrice) as Paisa) : undefined}
                >
                  <input
                    value={purchasePrice}
                    onChange={(e) => {
                      setPurchasePrice(e.target.value)
                    }}
                    placeholder="e.g. 4,65,000"
                    className="figure"
                    style={inputStyle(Boolean(errors.purchasePrice))}
                  />
                </Field>
                <Field
                  label="Replacement value (NPR)"
                  error={errors.replacementValue}
                  hint={replacementPaisa ? formatMoney(replacementPaisa) : 'Needed before the item can be rented.'}
                >
                  <input
                    value={replacementValue}
                    onChange={(e) => {
                      setReplacementValue(e.target.value)
                    }}
                    placeholder="e.g. 4,65,000"
                    className="figure"
                    style={inputStyle(Boolean(errors.replacementValue))}
                  />
                </Field>
                <Field label="Warranty (months)">
                  <input
                    type="number"
                    min={0}
                    value={warrantyMonths}
                    onChange={(e) => setWarrantyMonths(e.target.value)}
                    placeholder="e.g. 24"
                    className="figure"
                    style={inputStyle()}
                  />
                </Field>
              </div>

              <div style={fieldRow}>
                <Field label="Insurance policy">
                  <input value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)} placeholder="Policy number" style={inputStyle()} />
                </Field>
                <Field label="Insurance expiry">
                  <BsAbove iso={insuranceExpiryIso} />
                  <input type="date" value={insuranceExpiryIso} onChange={(e) => setInsuranceExpiryIso(e.target.value)} style={inputStyle()} />
                </Field>
                <Field label="Depreciation group">
                  <Unavailable reason={DEPRECIATION_UNAVAILABLE_REASON} style={{ width: '100%' }}>
                    <select disabled style={{ ...inputStyle(), opacity: 0.55, width: '100%' }}>
                      <option>Not defined yet — §16</option>
                    </select>
                  </Unavailable>
                </Field>
              </div>
            </SectionCard>
          )}

          {/* 6 · Pricing & Rental — §10.2 / §10.4. Omitted for money-blind roles. */}
          {money && (
            <SectionCard
              id="sec-pricing"
              n={sectionNumber('sec-pricing')}
              title="Pricing & Rental"
              note="Base rates only. Membership, student, bundle and custom discounts and the late fee are owned elsewhere (§10.3)."
            >
              <div style={fieldRow}>
                <Field label="Daily rate (NPR)" error={errors.dailyRate} hint={dailyPaisa ? formatMoney(dailyPaisa) : undefined}>
                  <input
                    value={dailyRate}
                    onChange={(e) => {
                      setDailyRate(e.target.value)
                    }}
                    placeholder="e.g. 4,500"
                    className="figure"
                    style={inputStyle(Boolean(errors.dailyRate))}
                  />
                </Field>
                <Field label="Weekly rate (NPR)">
                  <input value={weeklyRate} onChange={(e) => setWeeklyRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Monthly rate (NPR)">
                  <input value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Hourly rate (NPR)">
                  <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Weekend rate (NPR)">
                  <input value={weekendRate} onChange={(e) => setWeekendRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Minimum rental days">
                  <input
                    type="number"
                    min={1}
                    value={minRentalDays}
                    onChange={(e) => setMinRentalDays(e.target.value)}
                    className="figure"
                    style={inputStyle()}
                  />
                </Field>
              </div>

              {/* §10.2 — a percentage of replacement value, or a fixed amount. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Security deposit</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['percent', 'fixed'] as const).map((k) => {
                    const on = depositKind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setDepositKind(k)
                        }}
                        aria-pressed={on}
                        style={{
                          height: 32,
                          padding: '0 12px',
                          borderRadius: 'var(--r-btn)',
                          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                          background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 700 : 500,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {k === 'percent' ? '% of replacement value' : 'Fixed amount'}
                      </button>
                    )
                  })}
                </div>
                <div style={fieldRow}>
                  {depositKind === 'percent' ? (
                    <Field
                      label="Deposit (%)"
                      error={errors.deposit}
                      hint={depositPaisa ? `${formatMoney(depositPaisa)} of the replacement value` : 'Needs a replacement value above.'}
                    >
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={depositPercent}
                        onChange={(e) => {
                          setDepositPercent(e.target.value)
                        }}
                        placeholder="e.g. 20"
                        className="figure"
                        style={inputStyle(Boolean(errors.deposit))}
                      />
                    </Field>
                  ) : (
                    <Field label="Deposit (NPR)" error={errors.deposit} hint={depositPaisa ? formatMoney(depositPaisa) : undefined}>
                      <input
                        value={depositFixed}
                        onChange={(e) => {
                          setDepositFixed(e.target.value)
                        }}
                        placeholder="e.g. 25,000"
                        className="figure"
                        style={inputStyle(Boolean(errors.deposit))}
                      />
                    </Field>
                  )}
                </div>
              </div>

              {/* §10.4 — rental settings feed Cleaning and Return. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Rental settings</strong>
                <div style={fieldRow}>
                  <Field label="Preparation time (minutes)">
                    <input type="number" min={0} value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} className="figure" style={inputStyle()} />
                  </Field>
                  <Field label="Cleaning time (minutes)">
                    <input type="number" min={0} value={cleaningMinutes} onChange={(e) => setCleaningMinutes(e.target.value)} className="figure" style={inputStyle()} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Rental enabled', on: rentalEnabled, set: setRentalEnabled },
                    { label: 'Inspection required on return', on: inspectionRequired, set: setInspectionRequired },
                    { label: 'Packing required', on: packingRequired, set: setPackingRequired },
                  ].map((t) => (
                    <label key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={t.on}
                        onChange={(e) => t.set(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--nav-active-accent)' }}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {/* 7 · Maintenance & Documents — §11 */}
          <SectionCard
            id="sec-maintenance"
            n={sectionNumber('sec-maintenance')}
            title="Maintenance & Documents"
            note="Due dates feed the Maintenance queue. Internal notes never print."
          >
            <div style={fieldRow}>
              <Field label="Inspection interval (days)">
                <input
                  type="number"
                  min={0}
                  value={inspectionIntervalDays}
                  onChange={(e) => setInspectionIntervalDays(e.target.value)}
                  placeholder="e.g. 30"
                  className="figure"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Maintenance cycle (rentals)">
                <input
                  type="number"
                  min={0}
                  value={maintenanceCycleRentals}
                  onChange={(e) => setMaintenanceCycleRentals(e.target.value)}
                  placeholder="e.g. 20"
                  className="figure"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Service vendor">
                <input value={serviceVendor} onChange={(e) => setServiceVendor(e.target.value)} placeholder="Who services this" style={inputStyle()} />
              </Field>
            </div>

            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
              <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
              Running hours and expected life are not offered: no meter reading exists for a record being created, and
              seeding one would be inventing a figure nobody supplied.
            </span>

            {/* §11 — documents are restricted. `lib/rbac` has no document capability
                yet, so the money-visible set stands in; see the report for the gap. */}
            {money ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Documents — invoice, warranty, insurance, manual, certificates</strong>
                  <Button variant="secondary" icon="upload" onClick={() => docInput.current?.click()}>
                    Attach
                  </Button>
                </div>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>PDF, JPG or PNG · 50 MB each.</span>
                <input
                  ref={docInput}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    addDocuments(e.target.files)
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
                {docError && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                    <Icon name="error" size={12} />
                    {docError}
                  </span>
                )}
                {documents.map((d) => (
                  <div
                    key={d.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, background: 'var(--card2)', border: '1px solid var(--border)' }}
                  >
                    <Icon name="file" size={15} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--t-meta)' }}>
                      {d.file.name}
                    </span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{formatBytes(d.file.size)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(d.url)
                        setDocuments((prev) => prev.filter((x) => x.id !== d.id))
                      }}
                      aria-label={`Remove ${d.file.name}`}
                      style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                  Documents — invoice, warranty and insurance — are not part of this role’s form. Attach them from an
                  Owner, Admin or Accounts session.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <Field label="Warehouse notes" hint="Printed on packing lists.">
                <textarea
                  value={warehouseNotes}
                  onChange={(e) => setWarehouseNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Check the sensor glass under the inspection light before packing."
                  style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical' }}
                />
              </Field>
              <Field label="Internal notes" hint="Never printed, never shown to a client.">
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything the floor should know that a client should not read."
                  style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical' }}
                />
              </Field>
            </div>
          </SectionCard>
        </div>

        {viewport === 'desktop' ? (
          <Rail width={324} label="Record summary">
            {railContent}
          </Rail>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{railContent}</div>
        )}
      </div>

      <FooterNote extra={['Assets are retired with a reason, never deleted']} />

      <Modal
        isOpen={showDiscard}
        onClose={() => setShowDiscard(false)}
        title="Discard this equipment record?"
        subtitle="Nothing has been saved."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowDiscard(false)}>
              Keep Editing
            </Button>
            <Button variant="danger" onClick={() => navigate('/inventory')}>
              Discard
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Leaving now loses everything entered on this page — including any attached images and documents.
        </p>
      </Modal>
    </div>
  )
}
