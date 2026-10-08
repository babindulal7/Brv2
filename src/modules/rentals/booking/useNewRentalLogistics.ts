import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { rupees, type Paisa } from '../../../lib/money'
import { CREW_ROSTER, type CrewMember } from '../../../lib/queries/crew'
import type { QuoteSnapshot } from '../../../lib/queries/quoteEditor'
import type { CrewLine } from './CrewSection'
import type { TransportDetails } from './CrewAndTransportSection'

export interface UseNewRentalLogisticsOptions {
  liveCrew?: readonly CrewMember[] | null
  quoteSnapshot?: QuoteSnapshot | null
}

export interface UseNewRentalLogisticsResult {
  // Delivery & Return
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  setDeliveryType: Dispatch<SetStateAction<'Client Pickup' | 'Babin Delivery'>>
  deliveryChargePaisa: Paisa
  setDeliveryChargePaisa: Dispatch<SetStateAction<Paisa>>
  fuelChargePaisa: Paisa
  setFuelChargePaisa: Dispatch<SetStateAction<Paisa>>
  vehicle: string
  setVehicle: Dispatch<SetStateAction<string>>
  numberPlate: string
  setNumberPlate: Dispatch<SetStateAction<string>>
  driverContact: string
  setDriverContact: Dispatch<SetStateAction<string>>
  pickupLocation: string
  setPickupLocation: Dispatch<SetStateAction<string>>
  returnLocation: string
  setReturnLocation: Dispatch<SetStateAction<string>>
  specialInstructions: string
  setSpecialInstructions: Dispatch<SetStateAction<string>>
  returnPickupType: 'Client Return' | 'Babin Pickup'
  setReturnPickupType: Dispatch<SetStateAction<'Client Return' | 'Babin Pickup'>>
  returnPickupAddress: string
  setReturnPickupAddress: Dispatch<SetStateAction<string>>
  returnPickupTime: string
  setReturnPickupTime: Dispatch<SetStateAction<string>>
  returnPickupChargePaisa: number
  setReturnPickupChargePaisa: Dispatch<SetStateAction<number>>

  // Crew state & handlers
  crew: CrewLine[]
  setCrew: Dispatch<SetStateAction<CrewLine[]>>
  seedCrewLine: (m: CrewMember) => CrewLine
  addCrew: (crewId: string) => void
  removeCrew: (crewId: string) => void
  handleUpdateCrew: (crewId: string, updates: Partial<CrewLine>) => void

  // Transport calculations & consolidated updater
  clientPickup: boolean
  quoteFuelPaisa: Paisa
  outgoingTransportPaisa: number
  returnTransportPaisa: number
  transportPaisa: Paisa
  transportDetails: TransportDetails
  handleUpdateTransport: (updates: Partial<TransportDetails>) => void
}

/**
 * Encapsulates logistics state: crew roster assignments, delivery transport details,
 * return-pickup coordination, and vehicle/driver recording.
 */
export function useNewRentalLogistics({
  liveCrew,
  quoteSnapshot,
}: UseNewRentalLogisticsOptions): UseNewRentalLogisticsResult {
  // Delivery & Outgoing Transport
  const [deliveryType, setDeliveryType] = useState<'Client Pickup' | 'Babin Delivery'>('Client Pickup')
  const [deliveryChargePaisa, setDeliveryChargePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [fuelChargePaisa, setFuelChargePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [vehicle, setVehicle] = useState('')
  const [numberPlate, setNumberPlate] = useState('')
  const [driverContact, setDriverContact] = useState('')
  const [pickupLocation, setPickupLocation] = useState('')
  const [returnLocation, setReturnLocation] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')

  // Return Pickup Logistics (§3.3)
  const [returnPickupType, setReturnPickupType] = useState<'Client Return' | 'Babin Pickup'>('Client Return')
  const [returnPickupAddress, setReturnPickupAddress] = useState('')
  const [returnPickupTime, setReturnPickupTime] = useState('18:00')
  const [returnPickupChargePaisa, setReturnPickupChargePaisa] = useState<number>(0)

  // Crew state
  const [crew, setCrew] = useState<CrewLine[]>(() => [])

  const seedCrewLine = useCallback(
    (m: CrewMember): CrewLine => ({
      crewId: m.id,
      name: m.name,
      role: m.role,
      phone: m.phone,
      dayRatePaisa: m.dayRatePaisa,
      overtimePaisa: rupees(0) as Paisa,
      accommodationPaisa: rupees(0) as Paisa,
      mealsPaisa: rupees(0) as Paisa,
    }),
    [],
  )

  const addCrew = useCallback(
    (crewId: string) => {
      const rosterPool = liveCrew && liveCrew.length > 0 ? liveCrew : CREW_ROSTER
      const m = rosterPool.find((x) => x.id === crewId)
      if (!m || crew.some((c) => c.crewId === crewId)) return
      setCrew((p) => [...p, seedCrewLine(m)])
    },
    [liveCrew, crew, seedCrewLine],
  )

  const removeCrew = useCallback((crewId: string) => {
    setCrew((p) => p.filter((c) => c.crewId !== crewId))
  }, [])

  const handleUpdateCrew = useCallback((crewId: string, updates: Partial<CrewLine>) => {
    setCrew((p) => p.map((c) => (c.crewId === crewId ? { ...c, ...updates } : c)))
  }, [])

  // §9.2 — Client Pickup forces both transport charges to zero.
  const clientPickup = deliveryType === 'Client Pickup'
  const quoteFuelPaisa =
    clientPickup && quoteSnapshot?.values.delivery_type !== 'Client Pickup'
      ? (0 as Paisa)
      : fuelChargePaisa
  const outgoingTransportPaisa = (clientPickup ? 0 : deliveryChargePaisa) + quoteFuelPaisa
  const returnTransportPaisa = returnPickupType === 'Client Return' ? 0 : returnPickupChargePaisa
  const transportPaisa = (outgoingTransportPaisa + returnTransportPaisa) as Paisa

  const transportDetails = useMemo<TransportDetails>(
    () => ({
      clientPickup,
      deliveryType,
      vehicle,
      numberPlate,
      driverContact,
      pickupLocation,
      returnLocation,
      specialInstructions,
      returnPickupType,
      returnPickupAddress,
      returnPickupTime,
      returnPickupChargePaisa,
      deliveryChargePaisa,
      fuelChargePaisa,
      transportPaisa,
    }),
    [
      clientPickup,
      deliveryType,
      vehicle,
      numberPlate,
      driverContact,
      pickupLocation,
      returnLocation,
      specialInstructions,
      returnPickupType,
      returnPickupAddress,
      returnPickupTime,
      returnPickupChargePaisa,
      deliveryChargePaisa,
      fuelChargePaisa,
      transportPaisa,
    ],
  )

  const handleUpdateTransport = useCallback((updates: Partial<TransportDetails>) => {
    if (updates.deliveryType !== undefined) {
      setDeliveryType(updates.deliveryType)
    } else if (updates.clientPickup !== undefined) {
      setDeliveryType(updates.clientPickup ? 'Client Pickup' : 'Babin Delivery')
    }
    if (updates.vehicle !== undefined) setVehicle(updates.vehicle)
    if (updates.numberPlate !== undefined) setNumberPlate(updates.numberPlate)
    if (updates.driverContact !== undefined) setDriverContact(updates.driverContact)
    if (updates.pickupLocation !== undefined) setPickupLocation(updates.pickupLocation)
    if (updates.returnLocation !== undefined) setReturnLocation(updates.returnLocation)
    if (updates.specialInstructions !== undefined) setSpecialInstructions(updates.specialInstructions)
    if (updates.returnPickupType !== undefined) setReturnPickupType(updates.returnPickupType)
    if (updates.returnPickupAddress !== undefined) setReturnPickupAddress(updates.returnPickupAddress)
    if (updates.returnPickupTime !== undefined) setReturnPickupTime(updates.returnPickupTime)
    if (updates.returnPickupChargePaisa !== undefined) setReturnPickupChargePaisa(updates.returnPickupChargePaisa)
    if (updates.deliveryChargePaisa !== undefined) setDeliveryChargePaisa(updates.deliveryChargePaisa)
    if (updates.fuelChargePaisa !== undefined) setFuelChargePaisa(updates.fuelChargePaisa)
  }, [])

  return {
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
    seedCrewLine,
    addCrew,
    removeCrew,
    handleUpdateCrew,
    clientPickup,
    quoteFuelPaisa,
    outgoingTransportPaisa,
    returnTransportPaisa,
    transportPaisa,
    transportDetails,
    handleUpdateTransport,
  }
}
