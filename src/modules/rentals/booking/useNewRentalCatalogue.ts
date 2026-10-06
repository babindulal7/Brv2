import { useEffect, useMemo, useState } from 'react'
import { listClientRecords, type ClientRecord } from '../../../lib/queries/clients'
import { listInventory } from '../../../lib/queries/inventory'
import { readProductAvailability } from '../../../lib/queries/productAvailability'
import { listBundleRecords } from '../../../lib/queries/bundleRecords'
import type { BundleRecord } from '../../../data/bundles'
import type { RentalWindow } from '../../../lib/availability'
import { listCrewMembers, type CrewMember } from '../../../lib/queries/crew'
import {
  bundleResults,
  equipmentResultsFrom,
  type BookingWindow,
  type BundleResult,
  type EquipmentAvailabilitySource,
  type EquipmentResult,
  type LiveEquipmentRow,
} from './itemCatalogue'

export interface UseNewRentalCatalogueOptions {
  canBookingMoney: boolean
  pickupAt: Date | null
  returnAt: Date | null
  bookingWindow: BookingWindow
}

export interface UseNewRentalCatalogueResult {
  clientPool: ClientRecord[]
  setClientPool: React.Dispatch<React.SetStateAction<ClientRecord[]>>
  clientsAreLive: boolean
  liveRows: readonly LiveEquipmentRow[] | null
  liveCrew: readonly CrewMember[] | null
  liveBundles: readonly BundleRecord[] | null
  poolSettled: boolean
  poolError: string | null
  availabilitySource: EquipmentAvailabilitySource
  liveEquipment: readonly EquipmentResult[] | null
  liveBundleResults: readonly BundleResult[]
}

/**
 * Encapsulates the live database reads and windowed availability queries
 * for New Rental's clients, equipment inventory, crew roster, and bundles.
 */
export function useNewRentalCatalogue({
  canBookingMoney,
  pickupAt,
  returnAt,
  bookingWindow,
}: UseNewRentalCatalogueOptions): UseNewRentalCatalogueResult {
  const [clientPool, setClientPool] = useState<ClientRecord[]>([])
  const [clientsAreLive, setClientsAreLive] = useState(false)
  const [liveRows, setLiveRows] = useState<readonly LiveEquipmentRow[] | null>(null)
  const [liveCrew, setLiveCrew] = useState<readonly CrewMember[] | null>(null)
  const [liveBundles, setLiveBundles] = useState<readonly BundleRecord[] | null>(null)
  const [poolSettled, setPoolSettled] = useState(false)
  const [poolError, setPoolError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [clients, inventory, crewResult] = await Promise.all([
          listClientRecords(),
          listInventory({ page: { index: 0, size: 500 }, withMoney: canBookingMoney }),
          listCrewMembers(),
        ])
        if (cancelled) return
        const bookableClients = clients.filter((c) => !!c.dbId)
        setClientPool(bookableClients)
        setClientsAreLive(true)
        const rows = inventory.rows.filter((r) => r.isActive)
        if (rows.length > 0) setLiveRows(rows)

        if (crewResult && crewResult.rows && crewResult.rows.length > 0) {
          setLiveCrew(crewResult.rows)
        }
      } catch (e: unknown) {
        if (!cancelled) setPoolError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setPoolSettled(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canBookingMoney])

  const [availabilitySource, setAvailabilitySource] = useState<EquipmentAvailabilitySource>({
    state: 'checking',
  })

  useEffect(() => {
    if (!pickupAt || !returnAt || returnAt.getTime() <= pickupAt.getTime()) {
      setAvailabilitySource({ state: 'no-window' })
      return
    }
    if (poolError !== null) {
      setAvailabilitySource({ state: 'failed', reason: poolError })
      return
    }
    if (liveRows === null) {
      setAvailabilitySource(poolSettled ? { state: 'ready', byProduct: new Map() } : { state: 'checking' })
      return
    }

    let cancelled = false
    setAvailabilitySource({ state: 'checking' })
    const window: RentalWindow = { fromAd: pickupAt.toISOString(), toAd: returnAt.toISOString() }
    void (async () => {
      try {
        const [byProduct, bundles] = await Promise.all([
          readProductAvailability(window, liveRows.map((r) => r.id)),
          listBundleRecords(window, { withMoney: canBookingMoney }),
        ])
        if (!cancelled) {
          setAvailabilitySource({ state: 'ready', byProduct })
          if (bundles && bundles.length > 0) setLiveBundles(bundles)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setAvailabilitySource({ state: 'failed', reason: e instanceof Error ? e.message : String(e) })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [liveRows, pickupAt, returnAt, poolError, poolSettled, canBookingMoney])

  const liveEquipment = useMemo(
    () => (liveRows === null ? null : equipmentResultsFrom(liveRows, availabilitySource)),
    [liveRows, availabilitySource],
  )

  const liveBundleResults = useMemo(
    () => bundleResults(bookingWindow, liveBundles ?? undefined),
    [bookingWindow, liveBundles],
  )

  return {
    clientPool,
    setClientPool,
    clientsAreLive,
    liveRows,
    liveCrew,
    liveBundles,
    poolSettled,
    poolError,
    availabilitySource,
    liveEquipment,
    liveBundleResults,
  }
}
