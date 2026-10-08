import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionContext } from '../../../actions/core'
import { updateClient } from '../../../actions/clients/updateClient'
import {
  cancelDraft,
  fetchRentalDraft,
  saveDraft as persistRentalDraft,
  type RentalDraftData,
} from '../../../actions/rentals/saveDraft'
import {
  prepareQuoteSave,
  updateRentalQuote,
  type QuoteSaveAttempt,
} from '../../../actions/rentals/updateRentalQuote'
import { useUnsavedRecord } from '../../../components/ui/RecordWorkspace'
import { rupees, type Paisa } from '../../../lib/money'
import type { ClientRecord } from '../../../lib/queries/clients'
import { quoteToDraft, readQuoteEditor, type QuoteSnapshot } from '../../../lib/queries/quoteEditor'
import { newClientUuid } from '../../../lib/supabase'
import type { CrewLine } from './CrewSection'
import { clearLocalDraft, readLocalDraft, writeLocalDraft, type LocalDraft } from './localDraft'
import { stableJson } from './newRentalUtils'
import type { Line } from './RentalLineItemsTree'

export interface UseNewRentalDraftOptions {
  searchParams: URLSearchParams
  setSearchParams: (next: URLSearchParams, options?: { replace?: boolean }) => void
  editBookingId?: string | undefined
  user: { id: string; isSharedDevice?: boolean } | null
  client: ClientRecord | null | undefined
  clientPool: ClientRecord[]
  setSelectedClientId: (id: string | null) => void
  requiredDepositPaisa: Paisa
  dispatchContext: () => ActionContext | null
  showSuccessToast: (title: string, message: string) => void
  setActionError: (msg: string | null) => void
  doExit: () => void
  setExitPrompt: (prompt: 'unsaved-new' | 'unsaved-edits' | null) => void
  confirmedSuccess: { bookingId: string; bookingNo: string } | null

  // Quote snapshot state (lifted so pricing pipeline can read delivery_type)
  quoteSnapshot: QuoteSnapshot | null
  setQuoteSnapshot: React.Dispatch<React.SetStateAction<QuoteSnapshot | null>>

  // Form state needed to build durable and local draft data
  selectedClientId: string | null
  project: string
  kind: string
  kindOther: string
  govId: string
  pickup: string
  pickupTime: string
  returnDate: string
  returnTime: string
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  pickupLocation: string
  returnLocation: string
  specialInstructions: string
  lines: Line[]
  crew: CrewLine[]
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  vehicle: string
  numberPlate: string
  driverContact: string
  returnPickupType: 'Client Return' | 'Babin Pickup'
  returnPickupAddress: string
  returnPickupTime: string
  returnPickupChargePaisa: number
  discountPct: number
  vatOn: boolean
  vatRatePercent: number
  advancePaisa: Paisa

  // Form field setters needed for restoring draft / quote
  applyDraftFields: (data: RentalDraftData) => void
  setSavedDepositPaisa: (paisa: Paisa | null) => void
  setManualDepositOverride: (override: boolean) => void
  setManualDepositAmount: (amt: string) => void
  setDepositOverrideReason: (reason: string) => void
  setDepositAuthorizedBy: (auth: string) => void
}

export function useNewRentalDraft({
  searchParams,
  setSearchParams,
  editBookingId,
  user,
  client,
  clientPool,
  setSelectedClientId,
  requiredDepositPaisa,
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
  returnDate,
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
}: UseNewRentalDraftOptions) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [draftPersisted, setDraftPersisted] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(() => searchParams.get('draft'))
  const [draftBookingNo, setDraftBookingNo] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState<boolean>(() => Boolean(searchParams.get('draft')))
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [draftClientDbId, setDraftClientDbId] = useState<string | null>(null)
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(null)
  const [cancelIntent, setCancelIntent] = useState<'discard' | 'cancel' | null>(null)

  const [quoteLoading, setQuoteLoading] = useState(Boolean(editBookingId))
  const [quoteReload, setQuoteReload] = useState(0)

  const quoteInitial = useRef<string | null>(null)
  const quoteSaving = useRef(false)
  const quoteAttempt = useRef<QuoteSaveAttempt | null>(null)

  const confirmKey = useRef<string | null>(null)
  const draftCreateKey = useRef<string | null>(null)
  const draftBookingKey = useRef<string | null>(null)
  const loadedDraftId = useRef<string | null>(null)

  const draftData = useMemo<RentalDraftData>(
    () => ({
      version: 1,
      selectedClientId,
      clientDbId: client?.dbId ?? draftClientDbId,
      clientName: client?.name,
      project,
      kind,
      kindOther,
      govId,
      pickup,
      pickupTime,
      returnDate,
      returnTime,
      deliveryType,
      pickupLocation,
      returnLocation,
      specialInstructions,
      lines: lines.map((line) => ({
        id: line.id,
        bookingLineId: line.bookingLineId,
        clientUuid: line.clientUuid,
        parentClientUuid: line.parentClientUuid,
        productId: line.productId,
        bundleId: line.bundleId,
        isIncluded: line.isIncluded,
        ...(line.lineType !== undefined ? { lineType: line.lineType } : {}),
        name: line.name,
        lineNote: line.lineNote,
        serviceBasis: line.serviceBasis,
        supplierCost: line.supplierCost,
        serial: line.serial,
        category: line.category,
        ratePaisa: Number(line.ratePaisa),
        days: line.days,
        ...(line.daysOverridden !== undefined ? { daysOverridden: line.daysOverridden } : {}),
        qty: line.qty,
        discountPct: line.discountPct,
        location: line.location,
        ...(line.status !== undefined ? { status: line.status } : {}),
        committedTo: line.committedTo,
        ...(line.bundleCode !== undefined ? { bundleCode: line.bundleCode } : {}),
        ...(line.bundleName !== undefined ? { bundleName: line.bundleName } : {}),
      })),
      crew: crew.map((member) => ({
        ...member,
        dayRatePaisa: Number(member.dayRatePaisa),
        overtimePaisa: Number(member.overtimePaisa),
        accommodationPaisa: Number(member.accommodationPaisa),
        mealsPaisa: Number(member.mealsPaisa),
      })),
      deliveryChargePaisa: Number(deliveryChargePaisa),
      fuelChargePaisa: Number(fuelChargePaisa),
      vehicle,
      numberPlate,
      driverContact,
      returnPickupType,
      returnPickupAddress,
      returnPickupTime,
      returnPickupChargePaisa: Number(returnPickupChargePaisa),
      discountPct,
      vatOn,
      vatRatePercent,
      advancePaisa: Number(advancePaisa),
      ...(draftBookingNo ? { bookingNo: draftBookingNo } : {}),
    }),
    [
      selectedClientId,
      client,
      draftClientDbId,
      project,
      kind,
      kindOther,
      govId,
      pickup,
      pickupTime,
      returnDate,
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
      draftBookingNo,
    ],
  )

  const draftFingerprint = useMemo(() => stableJson(draftData), [draftData])
  const initialDraftFingerprint = useRef(draftFingerprint)
  const draftHasUnsavedChanges = (savedDraftFingerprint ?? initialDraftFingerprint.current) !== draftFingerprint

  const handleExit = useCallback(() => {
    if (draftId && draftHasUnsavedChanges) {
      setExitPrompt('unsaved-edits')
      return
    }
    const isDirtyNew = !draftId && draftHasUnsavedChanges
    if (isDirtyNew) {
      setExitPrompt('unsaved-new')
      return
    }
    doExit()
  }, [draftId, draftHasUnsavedChanges, doExit, setExitPrompt])

  useEffect(() => {
    if (client?.dbId) setDraftClientDbId(client.dbId)
  }, [client])

  // Device-local draft (offline & tab crash protection)
  const requestedDraftId = searchParams.get('draft')
  const localDraftUserId = user && !user.isSharedDevice ? user.id : ''
  const [localDraftOffer, setLocalDraftOffer] = useState<LocalDraft | null>(null)

  useEffect(() => {
    if (editBookingId || requestedDraftId || !localDraftUserId) return
    setLocalDraftOffer(readLocalDraft(localDraftUserId))
  }, [editBookingId, requestedDraftId, localDraftUserId])

  useEffect(() => {
    if (editBookingId || draftId || !localDraftUserId || !draftHasUnsavedChanges || localDraftOffer) return
    const timer = setTimeout(() => {
      writeLocalDraft(localDraftUserId, draftData)
    }, 1000)
    return () => clearTimeout(timer)
  }, [editBookingId, draftId, localDraftUserId, draftHasUnsavedChanges, localDraftOffer, draftData])

  useEffect(() => {
    if (confirmedSuccess) clearLocalDraft(localDraftUserId)
  }, [confirmedSuccess, localDraftUserId])

  const restoreLocalDraft = useCallback(() => {
    if (!localDraftOffer) return
    applyDraftFields(localDraftOffer.data)
    setDraftBookingNo(null)
    setLocalDraftOffer(null)
    clearLocalDraft(localDraftUserId)
  }, [localDraftOffer, localDraftUserId, applyDraftFields])

  const discardLocalDraft = useCallback(() => {
    setLocalDraftOffer(null)
    clearLocalDraft(localDraftUserId)
  }, [localDraftUserId])

  const exitAndForget = useCallback(() => {
    clearLocalDraft(localDraftUserId)
    doExit()
  }, [localDraftUserId, doExit])

  // Load server-persisted draft
  useEffect(() => {
    const requestedId = searchParams.get('draft')
    if (!requestedId) {
      setDraftLoading(false)
      return
    }
    if (loadedDraftId.current === requestedId) return
    loadedDraftId.current = requestedId
    setDraftLoading(true)
    setDraftLoadError(null)
    setSaveState('saving')
    setActionError(null)
    void fetchRentalDraft(requestedId)
      .then((draft) => {
        if (draft.status !== 'Active') {
          throw new Error(
            draft.status === 'Converted'
              ? 'This draft has already been converted into a booking.'
              : 'This draft was cancelled and is read-only.',
          )
        }
        const data = draft.data
        setDraftId(draft.id)
        draftCreateKey.current = draft.clientUuid
        draftBookingKey.current = draft.bookingClientUuid
        confirmKey.current = draft.bookingClientUuid
        setDraftBookingNo(data.bookingNo ?? null)
        applyDraftFields(data)
        setSavedDraftFingerprint(stableJson(data))
        setDraftPersisted(true)
        setSaveState('saved')
        setDraftLoading(false)
      })
      .catch((err: unknown) => {
        setSaveState('error')
        const msg = err instanceof Error ? err.message : String(err)
        setDraftLoading(false)
        setDraftLoadError(msg)
        setActionError(`Draft not loaded — ${msg}`)
      })
  }, [searchParams, applyDraftFields, setActionError])

  // Load quote when in edit mode
  useEffect(() => {
    if (!editBookingId) return
    let active = true
    setQuoteLoading(true)
    setActionError(null)
    void readQuoteEditor(editBookingId)
      .then((snapshot) => {
        if (!active) return
        const data = quoteToDraft(snapshot)
        setQuoteSnapshot(snapshot)
        setDraftBookingNo(snapshot.code)
        quoteInitial.current = null
        setSavedDepositPaisa(rupees(Number(snapshot.values.deposit_required)))
        setManualDepositOverride(false)
        setManualDepositAmount('')
        setDepositOverrideReason('')
        setDepositAuthorizedBy('')
        quoteAttempt.current = null
        applyDraftFields(data)
        setQuoteLoading(false)
      })
      .catch((error: unknown) => {
        if (active) {
          setQuoteLoading(false)
          setActionError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      active = false
    }
  }, [
    editBookingId,
    quoteReload,
    applyDraftFields,
    setActionError,
    setQuoteSnapshot,
    setSavedDepositPaisa,
    setManualDepositOverride,
    setManualDepositAmount,
    setDepositOverrideReason,
    setDepositAuthorizedBy,
  ])

  const quoteFingerprint = JSON.stringify([draftFingerprint, requiredDepositPaisa])
  if (editBookingId && quoteSnapshot && !quoteLoading && quoteInitial.current === null && client) {
    quoteInitial.current = quoteFingerprint
  }
  const quoteDirty = quoteInitial.current !== null && quoteInitial.current !== quoteFingerprint
  useUnsavedRecord(editBookingId ? quoteDirty : draftHasUnsavedChanges)

  const saveQuote = useCallback(async () => {
    if (!quoteSnapshot || quoteSaving.current) return
    const ctx = dispatchContext()
    if (!ctx) return
    quoteSaving.current = true
    setSaveState('saving')
    setActionError(null)
    try {
      quoteAttempt.current = prepareQuoteSave(
        {
          bookingId: quoteSnapshot.id,
          expectedRevision: quoteSnapshot.revision,
          draft: draftData,
          snapshot: quoteSnapshot,
          depositPaisa: requiredDepositPaisa,
        },
        quoteAttempt.current,
      )
      await updateRentalQuote(quoteAttempt.current.input, ctx)
      quoteInitial.current = quoteFingerprint
      showSuccessToast('Booking saved', quoteSnapshot.code)
      doExit()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      setSaveState('error')
    } finally {
      quoteSaving.current = false
    }
  }, [
    quoteSnapshot,
    dispatchContext,
    quoteFingerprint,
    draftData,
    requiredDepositPaisa,
    showSuccessToast,
    doExit,
    setActionError,
  ])

  const retryLoadDraft = useCallback(() => {
    const requestedId = searchParams.get('draft')
    if (!requestedId) return
    loadedDraftId.current = null
    setDraftLoadError(null)
    setDraftLoading(true)
    setSearchParams(new URLSearchParams(searchParams))
  }, [searchParams, setSearchParams])

  // Sync client code with live pool on reload
  useEffect(() => {
    if (!draftPersisted || client || !draftClientDbId) return
    const match = clientPool.find((candidate) => candidate.dbId === draftClientDbId)
    if (match) setSelectedClientId(match.id)
  }, [draftPersisted, client, clientPool, draftClientDbId, setSelectedClientId])

  const saveDraft = useCallback(
    (options?: { silent?: boolean }) => {
      if (editBookingId || saveState === 'saving') return
      const ctx = dispatchContext()
      if (!ctx) {
        setActionError('Not saved — you are not signed in, so this draft cannot be attributed to anyone. Sign in and save again.')
        setSaveState('error')
        return
      }
      if (!draftCreateKey.current) draftCreateKey.current = newClientUuid()
      if (!draftBookingKey.current) draftBookingKey.current = newClientUuid()
      setActionError(null)
      setSaveState('saving')
      void persistRentalDraft(
        {
          ...(draftId ? { id: draftId } : {}),
          clientUuid: draftCreateKey.current,
          bookingClientUuid: draftBookingKey.current,
          data: draftData,
        },
        ctx,
      )
        .then((saved) => {
          if (!('data' in saved)) throw new Error('the database did not return a durable New Rental draft')
          setDraftId(saved.id)
          loadedDraftId.current = saved.id
          draftCreateKey.current = saved.clientUuid
          draftBookingKey.current = saved.bookingClientUuid
          confirmKey.current = saved.bookingClientUuid
          setDraftBookingNo(saved.data.bookingNo ?? null)
          const next = new URLSearchParams(searchParams)
          next.set('draft', saved.id)
          setSearchParams(next, { replace: true })
          setSavedDraftFingerprint(draftFingerprint)
          setSaveState('saved')
          setDraftPersisted(true)
          clearLocalDraft(localDraftUserId)

          if (client?.dbId && govId.trim().length === 9 && /^[0-9]{9}$/.test(govId.trim()) && client.pan !== govId.trim()) {
            void updateClient({ clientId: client.dbId, patch: { pan: govId.trim() } }, ctx).catch((err) => {
              console.warn('Could not sync PAN to client record:', err)
            })
          }

          if (!options?.silent) {
            const noDisplay = saved.data.bookingNo ? ` #${saved.data.bookingNo}` : ''
            showSuccessToast(`Draft${noDisplay} saved`, 'This booking is saved as a draft. Nothing has been confirmed.')
          }
        })
        .catch((err: unknown) => {
          console.error('save draft failed:', err)
          setSaveState('error')
          setActionError(`Not saved — ${err instanceof Error ? err.message : String(err)}`)
        })
    },
    [
      saveState,
      dispatchContext,
      draftId,
      draftData,
      draftFingerprint,
      searchParams,
      setSearchParams,
      showSuccessToast,
      client,
      govId,
      editBookingId,
      localDraftUserId,
      setActionError,
    ],
  )

  // Auto-save debounced effect
  useEffect(() => {
    if (editBookingId || !draftId || !draftHasUnsavedChanges || saveState === 'saving') return
    const timer = setTimeout(() => {
      saveDraft({ silent: true })
    }, 2500)
    return () => clearTimeout(timer)
  }, [draftId, draftHasUnsavedChanges, saveState, saveDraft, editBookingId])

  const discardDraft = useCallback(() => {
    setCancelIntent(null)
    handleExit()
  }, [handleExit])

  const cancelDraftBooking = useCallback(
    (reason?: string) => {
      setCancelIntent(null)
      const ctx = dispatchContext()
      if (!ctx) {
        setActionError('Not cancelled — you are not signed in, so this cancellation cannot be attributed to anyone. Sign in and try again.')
        return
      }
      setActionError(null)
      if (!draftId) {
        setActionError('Not cancelled — this saved draft has no database id. Reload it from the saved draft URL and try again.')
        return
      }
      void cancelDraft({ id: draftId, reason: reason ?? '' }, ctx)
        .then(() => handleExit())
        .catch((err: unknown) => {
          console.error('cancel booking failed:', err)
          setActionError(`Not cancelled — ${err instanceof Error ? err.message : String(err)}`)
        })
    },
    [dispatchContext, draftId, handleExit, setActionError],
  )

  return {
    saveState,
    setSaveState,
    draftPersisted,
    setDraftPersisted,
    draftId,
    setDraftId,
    draftBookingNo,
    setDraftBookingNo,
    draftLoading,
    setDraftLoading,
    draftLoadError,
    setDraftLoadError,
    draftClientDbId,
    setDraftClientDbId,
    savedDraftFingerprint,
    setSavedDraftFingerprint,
    cancelIntent,
    setCancelIntent,
    quoteLoading,
    setQuoteLoading,
    quoteReload,
    setQuoteReload,
    quoteDirty,
    confirmKey,
    draftCreateKey,
    draftBookingKey,
    loadedDraftId,
    draftData,
    draftFingerprint,
    draftHasUnsavedChanges,
    handleExit,
    localDraftOffer,
    localDraftUserId,
    restoreLocalDraft,
    discardLocalDraft,
    exitAndForget,
    retryLoadDraft,
    saveQuote,
    saveDraft,
    discardDraft,
    cancelDraftBooking,
  }
}
