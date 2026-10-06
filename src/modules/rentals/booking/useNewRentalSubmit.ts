import { useCallback, useRef } from 'react'
import type { ActionContext } from '../../../actions/core'
import { createRental, deliveryTypeFromLabel, type BookingLineType } from '../../../actions/rentals/createRental'
import { convertDraft, saveDraft as persistRentalDraft, type RentalDraftData } from '../../../actions/rentals/saveDraft'
import { transportInstructions } from '../../../lib/bookingTransportForm'
import { toRupees, type Paisa } from '../../../lib/money'
import type { PricingPipelineResult } from '../../../lib/pricingPipeline'
import { planCreationUnits, type CreationUnitPlan } from '../../../lib/queries/availability'
import type { ClientRecord } from '../../../lib/queries/clients'
import { newClientUuid, supabase } from '../../../lib/supabase'
import type { CrewRoleDb } from '../../../types/database'
import type { CrewLine } from './CrewSection'
import { stableJson } from './newRentalUtils'
import type { Line } from './RentalLineItemsTree'

export interface UseNewRentalSubmitOptions {
  editBookingId?: string | undefined
  confirmBlocked: boolean
  saveState: 'saved' | 'saving' | 'error'
  setSaveState: (state: 'saved' | 'saving' | 'error') => void
  dispatchContext: () => ActionContext | null
  setActionError: (msg: string | null) => void
  setConfirmedSuccess: (success: { bookingId: string; bookingNo: string } | null) => void

  client: ClientRecord | null | undefined
  lines: Line[]
  equipmentLines: Line[]
  project: string
  pickupAt: Date | null
  returnAt: Date | null
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  pricing: PricingPipelineResult
  manualDiscountReason: string
  manualDiscountAuthorizedBy: string
  womenDopEligible: boolean
  crew: CrewLine[]
  clientPickup: boolean
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  returnPickupType: 'Client Return' | 'Babin Pickup'
  returnPickupAddress: string
  returnPickupTime: string
  returnPickupChargePaisa: number
  returnTransportPaisa: number
  vehicle: string
  numberPlate: string
  driverContact: string
  pickupLocation: string
  returnLocation: string
  specialInstructions: string
  days: number
  draftId: string | null
  draftBookingNo: string | null
  draftHasUnsavedChanges: boolean
  draftData: RentalDraftData
  setSavedDraftFingerprint: (fp: string | null) => void
  kind: string
  kindOther: string

  confirmKey: React.MutableRefObject<string | null>
  draftBookingKey: React.MutableRefObject<string | null>
}

export function useNewRentalSubmit({
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
}: UseNewRentalSubmitOptions) {
  const createdQuote = useRef<{ id: string; no: string; stage?: string } | null>(null)
  const discountKey = useRef<string | null>(null)
  const crewKeys = useRef<string[]>([])
  const transportKey = useRef<string | null>(null)

  const confirmBooking = useCallback(() => {
    if (editBookingId || confirmBlocked || saveState === 'saving') return
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError('Not confirmed — you are not signed in, so this booking cannot be attributed to anyone. Sign in and confirm again.')
      return
    }

    const clientDbId = client?.dbId
    if (!clientDbId || !pickupAt || !returnAt) {
      setActionError('Not confirmed — this booking has no client record or no usable dates. Nothing was written.')
      return
    }

    setActionError(null)
    setSaveState('saving')
    if (!confirmKey.current) confirmKey.current = draftBookingKey.current ?? newClientUuid()
    const pressKey: string = confirmKey.current
    let step: 'save-draft' | 'create' | 'confirm' | 'convert' = 'create'

    void (async () => {
      try {
        if (draftId && draftHasUnsavedChanges) {
          step = 'save-draft'
          const saved = await persistRentalDraft({ id: draftId, data: draftData }, ctx)
          if (!('data' in saved)) throw new Error('the database did not return the updated rental draft')
          setSavedDraftFingerprint(stableJson(saved.data))
        }
        step = 'create'
        if (!createdQuote.current) {
          const { data: userRow, error: userErr } = await supabase
            .from('users')
            .select('branch_id')
            .eq('id', ctx.userId)
            .maybeSingle()
          if (userErr) throw new Error(`the operating branch could not be read (${userErr.message})`)
          const branchId = (userRow as { branch_id?: string | null } | null)?.branch_id
          if (!branchId) {
            throw new Error(
              'your staff record carries no branch, and a booking is filed per branch. Ask an Owner to set your branch first',
            )
          }

          let creationUnitPlan: CreationUnitPlan | null = null
          try {
            creationUnitPlan = await planCreationUnits(
              { fromAd: pickupAt.toISOString(), toAd: returnAt.toISOString() },
              equipmentLines.map((l, i) => ({
                key: l.id ?? `line-${i}`,
                productId: l.productId ?? l.id ?? null,
                qty: l.qty,
                label: l.name ?? `Line ${i + 1}`,
              })),
            )
          } catch {
            creationUnitPlan = null
          }

          const created = await createRental(
            {
              clientUuid: pressKey,
              clientId: clientDbId,
              branchId,
              project: project.trim() ? project.replace(/^'|'$/g, '') : null,
              projectType: kind.trim() !== '' ? kind : null,
              projectTypeOther: kind === 'Other' && kindOther.trim() !== '' ? kindOther.trim() : null,
              ...(draftBookingNo ? { bookingNo: draftBookingNo } : {}),
              pickupAt: pickupAt.toISOString(),
              returnAt: returnAt.toISOString(),
              deliveryType: deliveryTypeFromLabel(deliveryType),
              depositRequired: toRupees(pricing.securityDeposit.requiredPaisa),
              ...(pricing.discounts.discountPaisa > 0
                ? {
                    discounts: [
                      {
                        clientUuid: discountKey.current ?? (discountKey.current = newClientUuid()),
                        discountSource: 'Manual',
                        percent: pricing.discounts.appliedPercent,
                        reason: manualDiscountReason.trim() || (womenDopEligible ? 'Women DoP/Director Discount' : 'Quotation Discount'),
                        approverId: manualDiscountAuthorizedBy.trim() || null,
                      },
                    ],
                  }
                : {}),
              ...(crew.length > 0
                ? {
                    crew: crew.map((c, i) => ({
                      clientUuid: crewKeys.current[i] ?? (crewKeys.current[i] = newClientUuid()),
                      name: c.name,
                      role: c.role as CrewRoleDb,
                      phone: c.phone,
                      dayRate: toRupees(c.dayRatePaisa),
                      days: days || 1,
                      overtime: toRupees(c.overtimePaisa),
                      accommodation: toRupees(c.accommodationPaisa),
                      meals: toRupees(c.mealsPaisa),
                    })),
                  }
                : {}),
              ...(clientPickup && returnPickupType === 'Client Return'
                ? {}
                : {
                    pickupLocation: pickupLocation.trim() || null,
                    returnLocation: returnLocation.trim() || (returnPickupAddress.trim() || null),
                    transport: {
                      clientUuid: transportKey.current ?? (transportKey.current = newClientUuid()),
                      deliveryCharge: toRupees(((clientPickup ? 0 : deliveryChargePaisa) + returnTransportPaisa) as Paisa),
                      fuelCharge: toRupees((clientPickup ? 0 : fuelChargePaisa) as Paisa),
                      vehicle: vehicle.trim() === '' ? null : vehicle.trim(),
                      numberPlate: numberPlate.trim() === '' ? null : numberPlate.trim(),
                      driverContact: driverContact.trim() === '' ? null : driverContact.trim(),
                      specialInstructions: transportInstructions({
                        specialInstructions,
                        returnPickupType,
                        returnPickupAddress,
                        returnPickupTime,
                        returnPickupChargePaisa,
                      }),
                    },
                  }),
              lines: lines.map((l, i) => {
                const isBundle = l.lineType === 'Bundle'
                const isIncluded = l.isIncluded ?? false
                const inventoryLine = !isBundle && (l.lineType === undefined || l.lineType === 'Equipment')
                const lineKey = l.id ?? `line-${i}`
                const assigned = inventoryLine && !isIncluded ? creationUnitPlan?.unitsByKey.get(lineKey) : undefined
                return {
                  clientUuid: l.clientUuid ?? newClientUuid(),
                  parentClientUuid: l.parentClientUuid ?? null,
                  lineType: (l.lineType ?? 'Equipment') as BookingLineType,
                  isIncluded,
                  ...(isBundle
                    ? { bundleId: l.bundleId ?? null, description: l.name }
                    : inventoryLine
                      ? { productId: l.productId ?? l.id }
                      : { description: l.name }),
                  qty: l.qty,
                  days: l.days,
                  rate: toRupees(l.ratePaisa),
                  sortOrder: i,
                  ...(assigned && assigned.length > 0 ? { units: assigned } : {}),
                }
              }),
            },
            ctx,
          )
          createdQuote.current = { id: created.bookingId, no: created.bookingNo, stage: created.stage }
        }

        if (createdQuote.current.stage !== 'Booked') {
          step = 'confirm'
          const mod = await import('../../../actions/rentals/confirmRental')
          await mod.confirmRental({ id: createdQuote.current.id }, ctx)
          createdQuote.current.stage = 'Booked'
        }

        if (draftId) {
          step = 'convert'
          await convertDraft({ id: draftId, bookingId: createdQuote.current.id }, ctx)
        }

        const bookedId = createdQuote.current.id
        const bookedNo = createdQuote.current.no

        confirmKey.current = null
        createdQuote.current = null
        discountKey.current = null
        crewKeys.current = []
        transportKey.current = null
        setSaveState('saved')
        setConfirmedSuccess({ bookingId: bookedId, bookingNo: bookedNo })
      } catch (err) {
        setSaveState('error')
        const reason = err instanceof Error ? err.message : String(err)
        if (step === 'convert' && createdQuote.current) {
          setActionError(
            `Booking ${createdQuote.current.no} is confirmed, but the draft link did not update: ${reason}. ` +
              'Press Confirm Booking again to finish linking this same draft; no second booking will be created.',
          )
        } else if (step === 'confirm' && createdQuote.current) {
          setActionError(
            `Booking saved as a Quote (${createdQuote.current.no}); Confirm did not land: ${reason}. Press Confirm Booking again to confirm that same Quote — no second booking will be created.`,
          )
        } else {
          setActionError(
            `Not confirmed — ${reason}. Nothing was written, and nothing entered here has been lost.`,
          )
        }
      }
    })()
  }, [
    confirmBlocked,
    saveState,
    dispatchContext,
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
    kind,
    kindOther,
    editBookingId,
    confirmKey,
    draftBookingKey,
    setActionError,
    setSaveState,
    setSavedDraftFingerprint,
    setConfirmedSuccess,
  ])

  return {
    confirmBooking,
  }
}
