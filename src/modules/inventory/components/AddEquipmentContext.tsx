import { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card, SummaryRows } from '../../../components/ui/Page'
import { Unavailable } from '../../../components/ui/Unavailable'
import { useToast } from '../../../components/ui/Toast'
import { useAuth } from '../../../lib/auth'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import { parseMoney, rupees, toRupees } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { toBs, formatBs, formatAd, TODAY } from '../../../lib/bs'
import {
  NEXT_ASSET_CODE,
  assetTagFor,
  EXISTING_SERIALS,
  existingModelMatch,
  modelName,
  bundlesUsing,
  suggestedChildrenFor,
  locationsIn,
  locationLabel,
  LABEL_PRINT_UNAVAILABLE_REASON,
  PACKING_PREVIEW_UNAVAILABLE_REASON,
} from '../../../data/addEquipment'
import type { TrackingMode, LocationChoice } from '../../../data/addEquipment'
import { Chip, DraftStatusBadge, countOf, formatBytes } from './EquipmentShared'
import type { UnitDraft, ContainedDraft, FileDraft } from './EquipmentShared'

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
 *    B-718 — a booking that cannot reference an asset that does not exist
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


/* ── drafts ────────────────────────────────────────────────────────────── */

/* The field furniture (Field, SectionCard, badges, table styles) and the draft
   interfaces live in EquipmentShared.tsx, shared with the Section components. */

const THUMB_MAX_BYTES = 5 * 1024 * 1024
const GALLERY_MAX_BYTES = 50 * 1024 * 1024
const DOC_MAX_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

const todayIso = TODAY.toISOString().slice(0, 10)

/* ── screen ────────────────────────────────────────────────────────────── */



export function useEquipmentFormState() {
  const { user } = useAuth()
  const money = useCanViewMoney()
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
      // EXISTING_SERIALS maps serial → product NAME (a string) — see its doc
      // comment in data/addEquipment.ts. `.name` on it was a type error.
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
       checked for it. Create publishes, so the required set applies.
     *
     * **The required set is now two things, not five** (ruling, 12 Aug 2026):
     * the **unit serial** and the **warehouse + bin**, both checked further
     * down. Name, category and brand used to gate Create here and no longer do.
     *
     * The two that remain are the two the floor loop actually depends on: a
     * unit without a serial cannot be scanned at Packing, cannot be picked as a
     * chip in New Rental, and cannot be told from its siblings; a unit without a
     * location cannot be found. Everything else — name, category, brand, price,
     * warranty, photos, rates — is information someone will fill in later, and
     * gating on it only meant a correction had to be a re-creation.
     *
     * The seven sections stay. They simply stop blocking. */

    /*
     * §3 — quantity never appears in the name: `NP-FZ100 Battery (x4)` is wrong.
     *
     * The multiplier has to be **delimited AND lower-case**. A delimited-but-
     * case-insensitive `[×x]\d+` still matches the `X4` in `Komodo X4` — a space
     * delimits it from the brand exactly the way one delimits `Battery x4` —
     * so an uppercase model letter and a lower-case multiplier are only
     * distinguishable by case. §3's own example is lower-case (`x4`), so the
     * multiplier is matched case-sensitively and `X<digit>` model designators
     * (`Komodo X4`, `Sony FX3`) are left alone.
     */
    if (/(^|[\s(])[×x]\s*\d+\b/.test(name) || /\(\s*\d{1,3}\s*(pcs?|pieces|units|nos)\s*\)/i.test(name)) {
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
    borderRadius: 'var(--r-sm)',
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
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
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
              <div style={{ marginTop: 6, marginLeft: 'var(--sp-sm)', paddingLeft: 10, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
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
              <div style={{ marginTop: 6, marginLeft: 'var(--sp-sm)', paddingLeft: 10, borderLeft: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
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
              borderRadius: 'var(--r-sm)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {readyChecks.map((r) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
              <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: 'var(--text2)' }}>Pricing pending — Owner or Admin. Purchase and pricing are not part of this role’s form.</span>
            </div>
          )}

          <p style={{ margin: 0, paddingTop: 'var(--sp-sm)', borderTop: '1px solid var(--border)', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
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
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 'var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
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
          <div style={{ marginTop: 'var(--sp-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
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
              borderRadius: 'var(--r-sm)',
              border: `1px solid ${duplicateReport.length ? 'var(--danger)' : 'var(--border)'}`,
              background: 'var(--card2)',
              fontSize: 'var(--t-th)',
              color: 'var(--text2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-xs)',
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


  return {
    assetCode,
    name,
    setName,
    shortName,
    setShortName,
    category,
    setCategory,
    brand,
    setBrand,
    modelNo,
    setModelNo,
    manufacturerDiffers,
    setManufacturerDiffers,
    manufacturer,
    setManufacturer,
    description,
    setDescription,
    thumbnail,
    setThumbnail,
    gallery,
    setGallery,
    imageError,
    setImageError,
    thumbInput,
    galleryInput,
    tracking,
    setTracking,
    units,
    setUnits,
    touchedSerials,
    setTouchedSerials,
    quantity,
    setQuantity,
    reorderLevel,
    setReorderLevel,
    quantityUnit,
    setQuantityUnit,
    csvNote,
    setCsvNote,
    csvInput,
    storedIn,
    setStoredIn,
    contains,
    setContains,
    containPick,
    setContainPick,
    compatible,
    setCompatible,
    compatiblePick,
    setCompatiblePick,
    requires,
    setRequires,
    requiresPick,
    setRequiresPick,
    warehouseId,
    setWarehouseId,
    locationId,
    setLocationId,
    purchaseIso,
    setPurchaseIso,
    supplier,
    setSupplier,
    purchasePrice,
    setPurchasePrice,
    replacementValue,
    setReplacementValue,
    warrantyMonths,
    setWarrantyMonths,
    insurancePolicy,
    setInsurancePolicy,
    insuranceExpiryIso,
    setInsuranceExpiryIso,
    assetOwner,
    setAssetOwner,
    dailyRate,
    setDailyRate,
    weeklyRate,
    setWeeklyRate,
    monthlyRate,
    setMonthlyRate,
    hourlyRate,
    setHourlyRate,
    weekendRate,
    setWeekendRate,
    depositKind,
    setDepositKind,
    depositPercent,
    setDepositPercent,
    depositFixed,
    setDepositFixed,
    minRentalDays,
    setMinRentalDays,
    rentalEnabled,
    setRentalEnabled,
    prepMinutes,
    setPrepMinutes,
    cleaningMinutes,
    setCleaningMinutes,
    inspectionRequired,
    setInspectionRequired,
    packingRequired,
    setPackingRequired,
    inspectionIntervalDays,
    setInspectionIntervalDays,
    maintenanceCycleRentals,
    setMaintenanceCycleRentals,
    serviceVendor,
    setServiceVendor,
    documents,
    setDocuments,
    docError,
    setDocError,
    docInput,
    internalNotes,
    setInternalNotes,
    warehouseNotes,
    setWarehouseNotes,
    submitted,
    setSubmitted,
    outcome,
    setOutcome,
    activeSection,
    setActiveSection,
    showDiscard,
    setShowDiscard,
    moreOpen,
    setMoreOpen,
    duplicateReport,
    setDuplicateReport,
    dismissedDuplicate,
    setDismissedDuplicate,
    clipboardError,
    setClipboardError,
    serialised,
    stockCount,
    replacementPaisa,
    dailyPaisa,
    depositPaisa,
    serialIssues,
    visibleSerialIssue,
    duplicateModel,
    suggestions,
    usedInBundles,
    warehouseLocations,
    chosenLocation,
    freeSlots,
    overCapacity,
    identityComplete,
    stockComplete,
    relationshipsComplete,
    locationComplete,
    purchaseComplete,
    pricingComplete,
    maintenanceComplete,
    errors,
    sectionDefs,
    sectionNumber,
    sectionKey,
    isDirty,
    readyChecks,
    rentable,
    addUnit,
    removeUnit,
    patchUnit,
    generateAssetTags,
    importCsv,
    addImages,
    addDocuments,
    addContained,
    runDuplicateCheck,
    handleSubmit,
    railContent
  }
}

export type EquipmentFormState = ReturnType<typeof useEquipmentFormState>
export const EquipmentContext = createContext<EquipmentFormState | null>(null)

export function EquipmentProvider({ children }: { children: ReactNode }) {
  const state = useEquipmentFormState()
  return <EquipmentContext.Provider value={state}>{children}</EquipmentContext.Provider>
}

export const useEquipmentContext = () => {
  const ctx = useContext(EquipmentContext)
  if (!ctx) throw new Error('Missing EquipmentProvider')
  return ctx
}
