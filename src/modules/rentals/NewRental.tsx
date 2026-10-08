import { RecordActions } from '../../components/ui/RecordWorkspace'
import type { QuoteSnapshot } from '../../lib/queries/quoteEditor'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Rail } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { PageShell } from '../../components/ui/PageShell'
import './rentals.css'
import './new-rental-flow.css'
import { EmptyState, LoadingSkeleton } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { useViewport } from '../../lib/device'
import { useNetwork } from '../../lib/network'
import { formatAd } from '../../lib/bs'
import { isProjectType } from '../../lib/projectTypes'
import { fetchLastProjectType } from '../../lib/queries/bookings'
import { formatMoney, rupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import type { RentalDraftData } from '../../actions/rentals/saveDraft'
import type { InvStatus } from '../../lib/queries/inventory'
import { equipmentConflicts, type ConflictCheckLine } from './booking/itemCatalogue'
import type { CrewRole } from '../../lib/queries/crew'
import { useAuth } from '../../lib/auth'
import type { ActionContext } from '../../actions/core'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import {
  BookingClientSection,
  BookingDatesSection,
  BookingEquipmentSection,
  BookingModals,
  BookingSummaryCard,
  CrewAndTransportSection,
  RentalPricingSection,
  confirmWriteRefusals,
  deriveRentalAlertsAndNotices,
  lineAmountPaisa,
  useNewRentalCatalogue,
  useNewRentalDraft,
  useNewRentalSubmit,
  useNewRentalTiming,
  useNewRentalLogistics,
  useNewRentalPricing,
  useNewRentalClient,
  useNewRentalNavigation,
  type BlockingNotice,
  type ConfirmWriteState,
  type Line,
  type CrewLine,
} from './booking'
import type { PromoCodeDefinition } from '../../lib/pricingPipeline'
import { useNewRentalProductDeposits } from './booking/useNewRentalProductDeposits'
export type { Line, CrewLine, BlockingNotice, ConfirmWriteState }
export { lineAmountPaisa, confirmWriteRefusals }

import {
  readVatRatePercent,
  bookingInstant,
  bookingDays,
} from './booking/newRentalUtils'

export const SECTIONS = [
  'Client',
  'Rental period',
  'Equipment, Bundles & Services',
  'Crew',
  'Delivery',
  'Pricing & Terms',
] as const

/**
 * Law 12 — **the** inline error line for this page, lifted out of the block-reason
 * paragraph below so a failed dispatch can reuse the affordance that already
 * exists instead of a second one being invented for it. Toasts on this codebase
 * are success-only (`useToast()` exposes `showSuccessToast` and nothing else),
 * so an error has exactly one place to go and it is here.
 */
const inlineErrorStyle = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--danger-text)',
  lineHeight: 1.4,
} as const

export interface NewRentalProps {
  editBookingId?: string

  embedded?: boolean
  onDone?: () => void
}

export default function NewRental({ embedded = false, onDone, editBookingId }: NewRentalProps = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const doExit = useCallback(() => {
    if (onDone) {
      onDone()
    } else {
      if (editBookingId) {
        const params = new URLSearchParams(location.search)
        params.delete('action')
        navigate(`${location.pathname}${params.size ? `?${params}` : ''}`)
      } else navigate('/rentals')
    }
  }, [onDone, navigate, editBookingId, location.pathname, location.search])
  const viewport = useViewport()
  const isDesktop = viewport === 'desktop'
  const isPhone = viewport === 'phone'
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  // Law 6 / P0-3, BUG_SWEEP_REGISTER_v1.0; mirrors BookingDetail — gated money is
  // never built into the DOM: 'booking' covers booking/payment money (Coordinator
  // included), 'asset-finance' covers crew pay (Coordinator excluded, HIS v2.1 §4.1
  // "no crew pay"), 'client-balance' covers the client's credit/outstanding figures.
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  const canBookingMoney = canViewMoneyField(gctx, 'booking')
  const canCrewMoney = canViewMoneyField(gctx, 'asset-finance')
  const canClientBalance = canViewMoneyField(gctx, 'client-balance')
  // Essential sections stay open; optional logistics can collapse without remounting fields.
  // RULINGS-2026-10-07: essentials and pricing open, optional logistics collapsed.
  const [open, setOpen] = useState<boolean[]>([true, true, true, false, false, true])
  const toggle = (i: number) =>
    setOpen((p) => p.map((v, j) => (j === i ? !v : v)))

  const workflowRef = useRef<HTMLDivElement>(null)


  const quoteBridge = (location.state as { quote?: { lines?: Array<{ label: string; qty: number; days: number; ratePaisa: number }>; discountPct?: number } } | null)?.quote
  const [searchParams, setSearchParams] = useSearchParams()

  /* ── Timing & Rental Period (Kathmandu business day defaults) ───────────── */
  const {
    pickup,
    setPickup,
    ret,
    setRet,
    pickupTime,
    setPickupTime,
    returnTime,
    setReturnTime,
    pickupAt,
    returnAt,
    days,
    dayWord,
    bookingWindow,
    pickupBs,
    applyShootPreset,
  } = useNewRentalTiming({ searchParams })

  /* ── Live Catalogue & Pool Loader (useNewRentalCatalogue) ──────────────── */
  const {
    clientPool,
    setClientPool,
    clientsAreLive,
    liveCrew,
    poolError,
    availabilitySource,
    liveEquipment,
    liveBundleResults,
  } = useNewRentalCatalogue({
    canBookingMoney,
    pickupAt,
    returnAt,
    bookingWindow,
  })

  const [quoteSnapshot, setQuoteSnapshot] = useState<QuoteSnapshot | null>(null)

  /* ── Logistics (Transport & Crew assignments) ─────────────────────────── */
  const {
    deliveryType,
    setDeliveryType,
    deliveryChargePaisa,
    setDeliveryChargePaisa,
    fuelChargePaisa,
    setFuelChargePaisa,
    vehicle,
    setVehicle,
    numberPlate,
    setNumberPlate,
    driverContact,
    setDriverContact,
    pickupLocation,
    setPickupLocation,
    returnLocation,
    setReturnLocation,
    specialInstructions,
    setSpecialInstructions,
    returnPickupType,
    setReturnPickupType,
    returnPickupAddress,
    setReturnPickupAddress,
    returnPickupTime,
    setReturnPickupTime,
    returnPickupChargePaisa,
    setReturnPickupChargePaisa,
    crew,
    setCrew,
    addCrew,
    removeCrew,
    handleUpdateCrew,
    clientPickup,
    quoteFuelPaisa,
    returnTransportPaisa,
    transportDetails,
    handleUpdateTransport,
  } = useNewRentalLogistics({ liveCrew, quoteSnapshot })

  /**
   * The Government ID / PAN box, seeded from the selected client's `pan`
   * (`clients.pan_vat`, read by `queries/clients.ts`).
   */
  const [govId, setGovId] = useState('')

  const {
    selectedClientId,
    setSelectedClientId,
    client,
    quickViewOpen,
    setQuickViewOpen,
    historyOpen,
    setHistoryOpen,
    addClientOpen,
    clientFieldRef,
    clientFieldTouched,
    setClientFieldTouched,
    suppressClientListOnFocus,
    openAddClient,
    closeAddClient,
    selectClient,
    onClientCreated,
    health,
  } = useNewRentalClient({
    searchParams,
    clientPool,
    setClientPool,
    setGovId,
    showSuccessToast,
  })

  /* §5 draft-email — the "Send Quote" split button was removed (NR-12).
     The modal is kept for future wiring when an email backend exists.
     Currently disabled; leaving the state avoids a breaking refactor of the
     DraftEmailModal call site below. */
  const [emailDraftDoc, setEmailDraftDoc] = useState<string | null>(null)

  /* A new booking starts EMPTY (see the note further down). These used to be
     demo literals — a named project, a kind, and a July 2026 window — which
     made every fresh draft look priced and dated before anyone touched it. */
  const [project, setProject] = useState('')
  const [kind, setKind] = useState('')
  /** Custom description, only meaningful while `kind` is 'Other' (spec §7). */
  const [kindOther, setKindOther] = useState('')

  /**
   * Project Type defaults to the client's most recent typed booking (ruled
   * 8 Oct 2026, RULINGS-2026-10-08.md). It only fills an empty field, or one
   * still holding the previous client's default — never a type staff chose,
   * and never on an edit or restored draft, which arrive with their own type.
   */
  const prefilledKind = useRef<string | null>(null)
  const kindNow = useRef(kind)
  kindNow.current = kind
  const clientDbId = client?.dbId ?? null
  useEffect(() => {
    if (editBookingId) return
    const replaceable = () => kindNow.current === '' || kindNow.current === prefilledKind.current
    if (!clientDbId) {
      if (prefilledKind.current !== null && kindNow.current === prefilledKind.current) setKind('')
      prefilledKind.current = null
      return
    }
    let cancelled = false
    void fetchLastProjectType(clientDbId).then((last) => {
      if (cancelled || !replaceable()) return
      const next = last && isProjectType(last.projectType) ? last.projectType : ''
      setKind(next)
      if (next === 'Other') setKindOther(last?.projectTypeOther ?? '')
      prefilledKind.current = next || null
    })
    return () => {
      cancelled = true
    }
  }, [clientDbId, editBookingId])

  /* `seedLine` lived here and built the three pre-picked demo rows. Both are
     gone: it had no other caller, and a helper whose only job was to
     manufacture unsaveable lines is not worth keeping for a future that would
     not want it. `AddItemPanel`'s `onAdd` is the only way a line arrives now. */
  /*
   * A new booking starts EMPTY.
   *
   * It used to open with three items pre-picked from `EQUIPMENT_CATALOGUE`.
   * That was demo scaffolding, and once this screen started writing for real it
   * became actively wrong: those rows carry product NAMES for ids, so every
   * booking would have opened pre-loaded with three lines that can never be
   * saved, and an operator who did not notice would meet the refusal at the
   * end instead of the start. Nothing is lost — the operator adds what the job
   * actually needs, which is what the panel below is for.
   */
  const [lines, setLines] = useState<Line[]>(() => {
    if (quoteBridge?.lines && quoteBridge.lines.length > 0) {
      return quoteBridge.lines.map((ql, idx) => ({
        id: `quote-${idx + 1}-${Date.now()}`,
        name: ql.label || 'Quoted Item',
        serial: '',
        category: 'Equipment',
        lineType: 'Manual item',
        qty: Math.max(1, ql.qty || 1),
        days: Math.max(1, ql.days || 1),
        daysOverridden: true,
        ratePaisa: (ql.ratePaisa || 0) as Paisa,
        discountPct: 0,
        location: 'Main Warehouse',
        committedTo: '—',
      }))
    }
    return []
  })
  /* 0, not the worked example's 7 — a discount is something someone grants. */
  const [discountPct, setDiscountPct] = useState(() => quoteBridge?.discountPct ?? 0)
  /* `discountReason` / `approver` / `discountPopoverOpen` left with the
     discount gate (31 Aug 2026 — D3, Babin: "don't put any gate on discount"). */
  /**
   * The VAT rate, read from Settings ▸ Financial once per mount. The literal
   * `VAT_PCT = 13` this page used to carry is deleted — see `readVatRatePercent`.
   */
  const [vatRatePercent, setVatRatePercent] = useState<number>(readVatRatePercent)
  /** 01_NEW_RENTAL §1.1 rail — `VAT {rate}%  [on ▢]`. On is the default. */
  const [vatOn, setVatOn] = useState(true)
  const [advancePaisa, setAdvancePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [womenDopEligible, setWomenDopEligible] = useState(false)
  const [manualDiscountReason, setManualDiscountReason] = useState('')
  const [manualDiscountAuthorizedBy, setManualDiscountAuthorizedBy] = useState('')
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [promoCodeApplied, setPromoCodeApplied] = useState<PromoCodeDefinition | null>(null)
  const [promoNotice, setPromoNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const [manualDepositOverride, setManualDepositOverride] = useState(false)
  const [savedDepositPaisa, setSavedDepositPaisa] = useState<Paisa | null>(null)
  const [manualDepositAmount, setManualDepositAmount] = useState<string>('')
  const [depositOverrideReason, setDepositOverrideReason] = useState('')
  const [depositAuthorizedBy, setDepositAuthorizedBy] = useState('')

  const [confirmedSuccess, setConfirmedSuccess] = useState<{ bookingId: string; bookingNo: string } | null>(null)
  const [validationAttempted, setValidationAttempted] = useState(false)

  /**
   * NR-19, second half — the booking's length reaches the lines it already has.
   *
   * A line's Days is stamped once, by `AddItemPanel`, from the `days` prop this
   * page passes it. Change the window afterwards and every line already on the
   * booking kept the old number: the Days column, the line amounts, the
   * Equipment Subtotal and — the part that matters — `booking_lines.days` in
   * `confirmBooking`'s payload were all measured over a window that is no
   * longer the booking's. Nothing on screen said so, because the header's Days
   * figure updated and the lines' did not.
   *
   * Only lines nobody has edited move: `daysOverridden` (set by the Days
   * stepper) marks a per-line decision, and re-stamping over it would be the
   * same defect pointing the other way. `days === 0` is the invalid-window
   * gate, not a length — nothing is re-stamped from it.
   */
  useEffect(() => {
    if (days === 0) return
    setLines((prev) => {
      let changed = false
      const next = prev.map((l) => {
        if (l.daysOverridden === true || l.days === days) return l
        changed = true
        return { ...l, days }
      })
      return changed ? next : prev
    })
  }, [days])

  /* C6 — what the products on this booking ask as a deposit. Read once per set of products. */
  const { terms: productDepositTerms, error: productDepositError } = useNewRentalProductDeposits(lines)

  /* ── §10.1 canonical calculation order — via calculatePricingPipeline (Task 6) ── */
  const {
    equipmentLines,
    pricing,
    breakdown,
    depositRequiredPaisa,
    depositReceivedPaisa,
    depositPendingPaisa,
    pricingHints,
    isStudentBundle,
  } = useNewRentalPricing({
    lines,
    crew,
    days,
    pickup,
    ret,
    pickupAt,
    clientPickup,
    deliveryChargePaisa,
    quoteFuelPaisa,
    returnTransportPaisa,
    discountPct,
    manualDiscountReason,
    manualDiscountAuthorizedBy,
    womenDopEligible,
    promoCodeApplied,
    vatOn,
    vatRatePercent,
    savedDepositPaisa,
    productDepositTerms,
    manualDepositOverride,
    manualDepositAmount,
    depositOverrideReason,
    depositAuthorizedBy,
  })

  /* ── §12 alerts. Critical blocks Confirm; Warning blocks Handover. ─────── */
  /**
   * §03 / §8.5 — a real conflict, for the booking's own dates.
   *
   * ⛔ This was `lines.filter((l) => l.status !== 'In Stock')`. The comment
   * above it claimed it read "the unit's own status/booking, not a fabricated
   * one", and for a live line that was exactly backwards: `status` was
   * synthesised by `equipmentResultsFrom` from a count of where the product's
   * units sit **at this instant**, so a Critical fired — blocking Confirm — for
   * a booking three weeks out whose gear happens to be on a shoot today.
   *
   * `equipmentConflicts` asks the engine instead: fewer units free across the
   * booking's window than the booking wants. That is not a new rule. It is the
   * refusal `confirmRental` already makes downstream — `planAssignment` then
   * `AssignmentIncompleteError` unless every line is covered
   * (`confirmRental.ts:435-436`) — surfaced here instead of after two round
   * trips.
   */
  const conflictSummary = useMemo(
    () => equipmentConflicts(equipmentLines as readonly ConflictCheckLine[], availabilitySource),
    [equipmentLines, availabilitySource],
  )
  const conflictLines = conflictSummary.conflicts
  /**
   * Law 10 as amended 31 Aug 2026, through the engine rather than a
   * re-derivation on the page. The gate is GONE (D3, Babin: "don't put any
   * gate on discount") — `validateDiscount` now refuses only a negative
   * percent (a price rise) and >100% (a negative price), and no chip or
   * clamp on this page can produce either. The verdict still gates Confirm
   * so the arithmetic refusals surface if state is ever set another way.
   */
  const { blockingNotices, advisories, confirmBlocked } = useMemo(
    () =>
      deriveRentalAlertsAndNotices({
        conflictLines,
        availabilitySource,
        client,
        govId: client?.pan ?? '',
        kind,
        discountPct,
        crew,
        canBookingMoney,
        depositRequiredPaisa,
        depositReceivedPaisa,
        depositPendingPaisa,
        outstandingPaisa: breakdown.outstanding as Paisa,
        days,
        clientsAreLive,
        lines,
        equipmentLines,
        pricing,
      }),
    [
      conflictLines,
      availabilitySource,
      client,
      kind,
      discountPct,
      crew,
      canBookingMoney,
      depositRequiredPaisa,
      depositReceivedPaisa,
      depositPendingPaisa,
      breakdown.outstanding,
      days,
      clientsAreLive,
      lines,
      equipmentLines,
      pricing,
    ],
  )

  /**
   * The last dispatch failure, shown in the page's own inline error line.
   * Law 12 — errors are inline and persistent; there is no error toast to reach
   * for, and one is not invented here. Cleared when a dispatch is re-attempted.
   */
  const [actionError, setActionError] = useState<string | null>(null)

  /**
   * Both writes on this page refuse to run without a signed-in session.
   *
   * They previously dispatched `{ userId: 'USR-001', role: 'Manager' }` — a
   * staff id that exists nowhere in this repo, and a role asserted about
   * whoever happened to be at the keyboard. `RecordPaymentModal.tsx` records the
   * same pair being removed from the payment path. (Its comment adds that
   * business-9 retired `Manager`; per `types/database.ts:80` migration 0017
   * restored it, so the string is a valid `SystemRole` today — but a *fabricated*
   * one is the defect either way, valid or not.)
   *
   * Same refusal shape as `today/MovementList.tsx`'s `runMovementAction`: no
   * session, no dispatch, and no substitute identity.
   */
  const dispatchContext = useCallback((): ActionContext | null => {
    if (!user) return null
    // `isOnline` is passed because this screen already knows it and `lib/rbac`'s
    // offline degradation refuses several approvals offline. Omitting it lets
    // `ActionContext` default to online — the fail-open direction.
    return { userId: user.id, role: user.role, isOnline: online }
  }, [user, online])

  /* Every field a saved or locally-kept draft carries, in one place. The server
     loader and the local restore both call it, so they cannot drift apart. */
  const applyDraftFields = useCallback((data: RentalDraftData) => {
    setSelectedClientId(data.selectedClientId)
    setProject(data.project)
    /* Legacy drafts stored free-text `kind`; only allow-listed values
       survive the restore — anything else would fail validation on save. */
    setKind(isProjectType(data.kind) ? data.kind : '')
    setKindOther(data.kindOther ?? '')
    setGovId(data.govId)
    setPickup(data.pickup)
    setPickupTime(data.pickupTime)
    setRet(data.returnDate)
    setReturnTime(data.returnTime)
    setDeliveryType(data.deliveryType)
    setPickupLocation(data.pickupLocation)
    setReturnLocation(data.returnLocation)
    setSpecialInstructions(data.specialInstructions)
    setLines(
      data.lines.map((line) => ({
        ...line,
        ratePaisa: line.ratePaisa as Paisa,
        status: line.status as InvStatus | undefined,
      })),
    )
    setCrew(
      data.crew.map((member) => ({
        ...member,
        role: member.role as CrewRole,
        dayRatePaisa: member.dayRatePaisa as Paisa,
        overtimePaisa: member.overtimePaisa as Paisa,
        accommodationPaisa: member.accommodationPaisa as Paisa,
        mealsPaisa: member.mealsPaisa as Paisa,
      })),
    )
    setDeliveryChargePaisa(data.deliveryChargePaisa as Paisa)
    setFuelChargePaisa(data.fuelChargePaisa as Paisa)
    setVehicle(data.vehicle)
    setNumberPlate(data.numberPlate)
    setDriverContact(data.driverContact)
    setReturnPickupType(data.returnPickupType ?? 'Client Return')
    setReturnPickupAddress(data.returnPickupAddress ?? '')
    setReturnPickupTime(data.returnPickupTime ?? '18:00')
    if (typeof data.returnPickupChargePaisa === 'number') {
      setReturnPickupChargePaisa(data.returnPickupChargePaisa)
    }
    setDiscountPct(data.discountPct)
    setVatOn(data.vatOn)
    setVatRatePercent(data.vatRatePercent)
    setAdvancePaisa(data.advancePaisa as Paisa)
  }, [
    setCrew, setDeliveryChargePaisa, setDeliveryType, setDriverContact, setFuelChargePaisa, setNumberPlate, setPickup, setPickupLocation, setPickupTime, setRet, setReturnLocation, setReturnPickupAddress, setReturnPickupChargePaisa, setReturnPickupTime, setReturnPickupType, setReturnTime, setSelectedClientId, setSpecialInstructions, setVehicle,
  ])

  const [exitPrompt, setExitPrompt] = useState<'unsaved-new' | 'unsaved-edits' | null>(null)
  const [reloadPrompt, setReloadPrompt] = useState(false)

  const {
    saveState,
    setSaveState,
    draftId,
    draftBookingNo,
    draftLoading,
    draftLoadError,
    setSavedDraftFingerprint,
    cancelIntent,
    setCancelIntent,
    quoteLoading,
    setQuoteReload,
    quoteDirty,
    confirmKey,
    draftBookingKey,
    draftData,
    draftHasUnsavedChanges,
    handleExit,
    localDraftOffer,
    restoreLocalDraft,
    discardLocalDraft,
    exitAndForget,
    retryLoadDraft,
    saveQuote,
    saveDraft,
    discardDraft,
    cancelDraftBooking,
  } = useNewRentalDraft({
    searchParams,
    setSearchParams,
    editBookingId,
    user,
    client,
    clientPool,
    setSelectedClientId,
    requiredDepositPaisa: pricing.securityDeposit.requiredPaisa,
    dispatchContext,
    showSuccessToast,
    setActionError,
    doExit,
    setExitPrompt,
    confirmedSuccess,
    quoteSnapshot,
    setQuoteSnapshot,
    selectedClientId,
    project,
    kind,
    kindOther,
    govId,
    pickup,
    pickupTime,
    returnDate: ret,
    returnTime,
    deliveryType,
    pickupLocation,
    returnLocation,
    specialInstructions,
    lines,
    crew,
    deliveryChargePaisa,
    fuelChargePaisa,
    vehicle,
    numberPlate,
    driverContact,
    returnPickupType,
    returnPickupAddress,
    returnPickupTime,
    returnPickupChargePaisa,
    discountPct,
    vatOn,
    vatRatePercent,
    advancePaisa,
    applyDraftFields,
    setSavedDepositPaisa,
    setManualDepositOverride,
    setManualDepositAmount,
    setDepositOverrideReason,
    setDepositAuthorizedBy,
  })

  const { confirmBooking } = useNewRentalSubmit({
    editBookingId,
    confirmBlocked,
    saveState,
    setSaveState,
    dispatchContext,
    setActionError,
    setConfirmedSuccess,
    client,
    lines,
    equipmentLines,
    project,
    pickupAt,
    returnAt,
    deliveryType,
    pricing,
    manualDiscountReason,
    manualDiscountAuthorizedBy,
    womenDopEligible,
    crew,
    clientPickup,
    deliveryChargePaisa,
    fuelChargePaisa,
    returnPickupType,
    returnPickupAddress,
    returnPickupTime,
    returnPickupChargePaisa,
    returnTransportPaisa,
    vehicle,
    numberPlate,
    driverContact,
    pickupLocation,
    returnLocation,
    specialInstructions,
    days,
    draftId,
    draftBookingNo,
    draftHasUnsavedChanges,
    draftData,
    setSavedDraftFingerprint,
    kind,
    kindOther,
    confirmKey,
    draftBookingKey,
  })

  const { jumpToSection, runNoticeAction } = useNewRentalNavigation({
    client,
    navigate,
    setQuickViewOpen,
    setOpen,
    sections: SECTIONS,
    editBookingId,
    saveDraft,
    saveQuote,
    confirmBooking,
    confirmBlocked,
    saveState,
    onValidationAttempt: () => setValidationAttempted(true),
    firstBlockingAction: blockingNotices[0]?.action,
  })

  const bundleCount = useMemo(() => new Set(lines.map((l) => l.bundleCode).filter(Boolean)).size, [lines])
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0)
  /* NR-12: documentTiles was removed — document storage/generation is unwired
   * and documents are intentionally outside the creation checklist until a booking persists. */

  /**
   * 01_NEW_RENTAL §1.1 — Right Rail Booking Summary (Bento 2.0 Consolidated Card).
   * Equipment / Services / Crew / Delivery / Discounts / VAT / Total / Law 5 Deposits.
   */
  const bookingSummaryCard = (
    <BookingSummaryCard
      client={client}
      pickupAt={pickupAt}
      pickupTime={pickupTime}
      returnAt={returnAt}
      returnTime={returnTime}
      totalUnits={totalUnits}
      days={days}
      dayWord={dayWord}
      canBookingMoney={canBookingMoney}
      pricing={pricing}
      blockingNotices={blockingNotices}
      advisories={advisories}
      validationAttempted={validationAttempted}
      runNoticeAction={runNoticeAction}
    />
  )


  if (draftLoading || quoteLoading) {
    return (
      <div style={{ padding: 'var(--sp-xl)', maxWidth: 1000, margin: '40px auto' }}>
        <LoadingSkeleton type="card" label="Loading draft booking…" />
      </div>
    )
  }

  if(editBookingId && !quoteSnapshot && !quoteLoading) return <Card title="Booking not loaded"><p role="alert">{actionError}</p><Button onClick={()=>setQuoteReload(v=>v+1)}>Retry</Button><Button onClick={doExit}>Back to booking</Button></Card>

  if (draftLoadError) {
    return (
      <div style={{ padding: 'var(--sp-xl)', maxWidth: 600, margin: '40px auto' }}>
        <Card style={{ padding: 'var(--sp-lg)', textAlign: 'center' }}>
          <EmptyState
            kind="no-results"
            title="Couldn't load this draft"
            description={draftLoadError}
            actionLabel="Back to Rentals"
            onAction={doExit}
          />
          <div style={{ marginTop: 'var(--sp-md)', display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="secondary" onClick={retryLoadDraft}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <PageShell
      width="full"
      className="new-rental-shell"
      header={
        <PageHeader
          breadcrumb={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Link
                to="/rentals"
                onClick={(e) => {
                  if (embedded) {
                    e.preventDefault()
                    handleExit()
                  }
                }}
                style={{ color: 'var(--link)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Icon name="chevron_left" size={14} />
                Rentals
              </Link>
            </div>
          }
          title={editBookingId ? `Edit ${draftBookingNo ?? 'booking'}` : draftBookingNo ? `Draft #${draftBookingNo}` : 'New Rental'}

        />
      }
    >
      {/* RULING 2026-10-08: direct section access on one continuous form. */}
      <nav className="new-rental-jumpbar" aria-label="Rental sections">
        <button type="button" onClick={() => jumpToSection('section-0')}><Icon name="user" size={17} />Client &amp; dates</button>
        <button type="button" onClick={() => jumpToSection('section-2')}><Icon name="box" size={17} />Equipment</button>
        <button type="button" onClick={() => { setOpen((prev) => prev.map((v, i) => i === 3 || i === 4 || v)); jumpToSection('section-3') }}><Icon name="truck" size={17} />Crew &amp; delivery</button>
        {canBookingMoney && <button type="button" onClick={() => jumpToSection('section-5')}><Icon name="receipt" size={17} />Pricing</button>}
        <button type="button" onClick={() => jumpToSection('rail-booking-summary')}><Icon name="check" size={17} />Review</button>
        <span>* Required to confirm</span>
      </nav>
      {localDraftOffer && !editBookingId && (
        <div
          role="region"
          aria-label="Unsaved booking found on this device"
          className="new-rental-draft-notice"
        >
          <span>
            An unsaved booking from {formatAd(new Date(localDraftOffer.savedAt))} was kept on this device
            {localDraftOffer.data.clientName ? ` for ${localDraftOffer.data.clientName}` : ''}.
          </span>
          <div className="new-rental-draft-notice__actions">
            <Button variant="primary" size="sm" onClick={restoreLocalDraft}>
              Restore it
            </Button>
            <Button variant="secondary" size="sm" onClick={discardLocalDraft}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {productDepositError && canBookingMoney && (
        <p role="status" style={inlineErrorStyle}>
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          The deposit set on each product could not be read, so the recommended security deposit is the standard rule
          only. Check it before confirming.
        </p>
      )}
      {/* Errors are inline and persistent, never a toast and never an alert(). */}
      {actionError && (
        <p role="status" style={inlineErrorStyle}>
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {actionError}
          {editBookingId && (
            <Button
              onClick={() => {
                if (!quoteDirty) setQuoteReload((v) => v + 1)
                else setReloadPrompt(true)
              }}
            >
              Reload latest booking
            </Button>
          )}
        </p>
      )}

      {/* Global Inventory Stock Contention Banner */}
      {conflictLines.length > 0 && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '8px 14px',
            borderRadius: 'var(--r-card)',
            background: 'var(--st-danger-bg)',
            color: 'var(--st-danger-fg)',
            border: '1px solid var(--st-danger-fg)',
            marginBottom: 'var(--sp-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)' }}>
            <Icon name="alert_triangle" size={16} style={{ flexShrink: 0 }} />
            <span>{conflictLines.length} equipment conflict{conflictLines.length > 1 ? 's' : ''}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => jumpToSection('section-2')}
            style={{
              whiteSpace: 'nowrap',
              borderColor: 'currentColor',
              color: 'inherit',
              padding: '0 10px',
              fontSize: 'var(--t-meta)',
            }}
          >
            Review
          </Button>
        </div>
      )}

      <div className="new-rental-canvas new-rental-setup-canvas">
          <div className="new-rental-stage new-rental-stage--setup">
            <BookingClientSection
              open={open[0] ?? true}
              onToggle={() => toggle(0)}
              client={client}
              clientPool={clientPool}
              selectedClientId={selectedClientId}
              clientFieldTouched={clientFieldTouched}
              setClientFieldTouched={setClientFieldTouched}
              addClientOpen={addClientOpen}
              selectClient={selectClient}
              openAddClient={openAddClient}
              quickViewOpen={quickViewOpen}
              setQuickViewOpen={setQuickViewOpen}
              health={health}
              days={days}
              dayWord={dayWord}
              canClientBalance={canClientBalance}
              canBookingMoney={canBookingMoney}
              gctx={gctx}
              user={user}
              onOpenHistory={() => setHistoryOpen(true)}
              suppressClientListOnFocus={suppressClientListOnFocus}
              clientFieldRef={clientFieldRef}
              navigate={navigate}
              isPhone={isPhone}
              project={project}
              setProject={setProject}
              kind={kind}
              setKind={setKind}
              kindOther={kindOther}
              setKindOther={setKindOther}
              govId={govId}
              setGovId={setGovId}
              title={SECTIONS[0]}
            />

          {/* 01_NEW_RENTAL §1.1 DATES box — `Out ▾  Return ▾   Days: 2`, with
              BS above AD on both. Split out of Client & Schedule because the
              wireframe draws it as its own box at all three widths, and on a
              phone as its own accordion. */}
          <BookingDatesSection
            open={open[1] ?? true}
            onToggle={() => toggle(1)}
            days={days}
            dayWord={dayWord}
            pickup={pickup}
            pickupBs={pickupBs}
            pickupTime={pickupTime}
            ret={ret}
            returnTime={returnTime}
            pricingHints={pricingHints}
            onPickupChange={setPickup}
            onPickupTimeChange={setPickupTime}
            onReturnChange={setRet}
            onReturnTimeChange={setReturnTime}
            onPresetDatesPick={(out, retDate) => {
              setPickup(out)
              setRet(retDate)
            }}
            onApplyShootPreset={applyShootPreset}
          />



        </div>
      </div>

      <div
        className="new-rental-workspace"
        ref={workflowRef}
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div className="new-rental-canvas" style={{ minWidth: 0 }}>
        <div className="new-rental-stage new-rental-stage--equipment">
          <BookingEquipmentSection
            open={open[2] ?? true}
            onToggle={() => toggle(2)}
            title={SECTIONS[2]}
            lines={lines}
            setLines={setLines}
            totalUnits={totalUnits}
            bundleCount={bundleCount}
            days={days}
            liveEquipment={liveEquipment}
            availabilitySource={availabilitySource}
            liveBundleResults={liveBundleResults}
            liveCrew={liveCrew}
            existingCrewIds={crew.map((c) => c.crewId)}
            bookingWindow={bookingWindow}
            poolError={poolError}
            conflictSummary={conflictSummary}
            deliveryType={deliveryType}
            onSelectTransport={(type) => {
              setDeliveryType(type)
              setOpen((prev) => prev.map((v, j) => (j === 4 ? true : v)))
            }}
            onAddCrew={(crewId) => {
              addCrew(crewId)
              setOpen((prev) => prev.map((v, j) => (j === 3 ? true : v)))
            }}
            canBookingMoney={canBookingMoney}
            gateContext={gctx}
            user={user}
            navigate={navigate}
            pricing={pricing}
            isPhone={isPhone}
          />
        </div>

        <div className="new-rental-stage new-rental-stage--logistics">
          <CrewAndTransportSection
            crew={crew}
            transport={transportDetails}
            onUpdateCrew={handleUpdateCrew}
            onRemoveCrew={removeCrew}
            onClearCrew={() => setCrew([])}
            onAddCrew={addCrew}
            onUpdateTransport={handleUpdateTransport}
            canCrewMoney={canCrewMoney}
            canBookingMoney={canBookingMoney}
            days={days}
            liveCrew={liveCrew}
            isPhone={isPhone}
            openCrew={open[3] ?? false}
            onToggleCrew={() => toggle(3)}
            openDelivery={open[4] ?? false}
            onToggleDelivery={() => toggle(4)}
            crewTitle={SECTIONS[3]}
          />
        </div>


        <div className="new-rental-stage new-rental-stage--pricing">
          {/* Kept deliberately. `WIREFRAME_RULINGS_2026-08-12.md` §1 names
              "New Rental's Pricing & Payments" among the sections that survive
              because no spec removes them in prose — the rail summarises this
              section, it does not replace it. */}
          {/* Part C — Pricing & Terms Simplification */}
          {canBookingMoney && (
            <RentalPricingSection
              open={open[5] ?? true}
              onToggle={() => toggle(5)}
              isDesktop={isDesktop}
              pricing={pricing}
              canCrewMoney={canCrewMoney}
              vatOn={vatOn}
              setVatOn={setVatOn}
              vatRatePercent={vatRatePercent}
              discountPct={discountPct}
              setDiscountPct={setDiscountPct}
              manualDiscountReason={manualDiscountReason}
              setManualDiscountReason={setManualDiscountReason}
              manualDiscountAuthorizedBy={manualDiscountAuthorizedBy}
              setManualDiscountAuthorizedBy={setManualDiscountAuthorizedBy}
              womenDopEligible={womenDopEligible}
              setWomenDopEligible={setWomenDopEligible}
              isStudentBundle={isStudentBundle}
              promoCodeInput={promoCodeInput}
              setPromoCodeInput={setPromoCodeInput}
              promoCodeApplied={promoCodeApplied}
              setPromoCodeApplied={setPromoCodeApplied}
              promoNotice={promoNotice}
              setPromoNotice={setPromoNotice}
              pickupAt={pickupAt}
              manualDepositOverride={manualDepositOverride}
              setManualDepositOverride={setManualDepositOverride}
              manualDepositAmount={manualDepositAmount}
              setManualDepositAmount={setManualDepositAmount}
              depositOverrideReason={depositOverrideReason}
              setDepositOverrideReason={setDepositOverrideReason}
              depositAuthorizedBy={depositAuthorizedBy}
              setDepositAuthorizedBy={setDepositAuthorizedBy}
              title={SECTIONS[5]}
            />
          )}

        </div>

        </div>

        {/* Desktop summary scrolls above the action footer. Below 1280 it
            reflows after pricing, with all notices still reachable. */}
        {isDesktop && (
          <div className="new-rental-summary-rail">
            <Rail width={300}>
              {bookingSummaryCard}
            </Rail>
          </div>
        )}
      </div>

      {!isDesktop && (
        <div className="new-rental-inline-summary" style={{ marginTop: 'var(--sp-md)' }}>
          {bookingSummaryCard}
        </div>
      )}

      <RecordActions
        busy={saveState === 'saving'}
        dirty={editBookingId ? quoteDirty : true}
        statusText={saveState === 'error' ? 'Not saved' : editBookingId ? undefined : draftHasUnsavedChanges ? 'Unsaved changes' : draftId ? 'Draft saved' : 'New booking'}
        label={editBookingId ? 'Save changes' : 'Confirm Booking'}
        onSave={() => {
          if (editBookingId) { void saveQuote(); return }
          setValidationAttempted(true)
          if (!confirmBlocked) { void confirmBooking(); return }
          const firstAction = blockingNotices[0]?.action
          if (firstAction) runNoticeAction(firstAction)
          else jumpToSection('rail-booking-summary')
        }}
        onCancel={() => {
          if (editBookingId) {
            if (!quoteDirty) doExit()
            else setExitPrompt('unsaved-edits')
          } else handleExit()
        }}
        extra={<>
          {canBookingMoney && <div className="new-rental-footer-total"><span>Rental total</span><strong>{formatMoney(pricing.rentalTotalPaisa)}</strong></div>}
          {isPhone && <Button variant="ghost" aria-label="Review rental summary" onClick={() => document.getElementById('rail-booking-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Summary</Button>}
          {!editBookingId && <Button variant="outline" onClick={() => void saveDraft()} disabled={saveState === 'saving'}>Save draft</Button>}
        </>}
      />
      {/* ── Disclosures & Workflow Modals ── */}
      <BookingModals
        client={client}
        quickViewOpen={quickViewOpen}
        setQuickViewOpen={setQuickViewOpen}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        canClientBalance={canClientBalance}
        navigate={navigate}
        addClientOpen={addClientOpen}
        closeAddClient={closeAddClient}
        onClientCreated={onClientCreated}
        clientPool={clientPool}
        onUseExistingClient={selectClient}
        emailDraftDoc={emailDraftDoc}
        setEmailDraftDoc={setEmailDraftDoc}
        cancelIntent={cancelIntent}
        setCancelIntent={setCancelIntent}
        discardDraft={discardDraft}
        cancelDraftBooking={cancelDraftBooking}
        exitPrompt={exitPrompt}
        setExitPrompt={setExitPrompt}
        doExit={exitAndForget}
        reloadPrompt={reloadPrompt}
        setReloadPrompt={setReloadPrompt}
        onReloadQuote={() => setQuoteReload((v) => v + 1)}
        confirmedSuccess={confirmedSuccess}
        setConfirmedSuccess={setConfirmedSuccess}
      />
    </PageShell>
  )
}

export { NewRental, bookingDays, bookingInstant }
