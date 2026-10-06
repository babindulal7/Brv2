import { useMemo } from 'react'
import type { Paisa } from '../../../lib/money'
import type { CrewMember } from '../../../lib/queries/crew'
import { CrewSection, type CrewLine } from './CrewSection'
import { DeliverySection } from './DeliverySection'

export interface TransportDetails {
  clientPickup: boolean
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  vehicle: string
  numberPlate: string
  driverContact: string
  pickupLocation: string
  returnLocation: string
  specialInstructions: string
  returnPickupType: 'Client Return' | 'Babin Pickup'
  returnPickupAddress: string
  returnPickupTime: string
  returnPickupChargePaisa: number
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  transportPaisa: Paisa
}

export interface CrewAndTransportSectionProps {
  crew: CrewLine[]
  transport: TransportDetails
  onUpdateCrew: (crewId: string, updates: Partial<CrewLine>) => void
  onRemoveCrew: (crewId: string) => void
  onClearCrew: () => void
  onAddCrew?: ((crewId: string) => void) | undefined
  onUpdateTransport: (updates: Partial<TransportDetails>) => void
  canCrewMoney: boolean
  canBookingMoney?: boolean | undefined
  days?: number | undefined
  readOnly?: boolean | undefined
  liveCrew?: readonly CrewMember[] | null | undefined
  isPhone?: boolean | undefined
  openCrew?: boolean | undefined
  onToggleCrew?: (() => void) | undefined
  openDelivery?: boolean | undefined
  onToggleDelivery?: (() => void) | undefined
  crewTitle?: string | undefined
  deliveryTitle?: string | undefined
}

/**
 * Consolidated Crew & Transport Logistics section (Contract FR-007 / Item 13).
 *
 * Encapsulates assigned crew members, role tags, overtime/per-diem extras,
 * and delivery/pickup logistics. Holds zero business logic or pricing arithmetic;
 * delegates edits through declared callbacks `onUpdateCrew` and `onUpdateTransport`.
 *
 * Law 6: strictly omits all money amounts and inputs when `canCrewMoney` or
 * `canBookingMoney` are false.
 */
export function CrewAndTransportSection({
  crew,
  transport,
  onUpdateCrew,
  onRemoveCrew,
  onClearCrew,
  onAddCrew = () => {},
  onUpdateTransport,
  canCrewMoney,
  canBookingMoney = true,
  days = 1,
  liveCrew,
  isPhone = false,
  openCrew = false,
  onToggleCrew = () => {},
  openDelivery = false,
  onToggleDelivery = () => {},
  crewTitle,
  deliveryTitle,
}: CrewAndTransportSectionProps) {
  const crewChargesPaisa = useMemo(
    () =>
      crew.reduce(
        (acc, member) =>
          acc +
          member.dayRatePaisa * (member.days ?? (days || 1)) +
          member.overtimePaisa +
          member.accommodationPaisa +
          member.mealsPaisa,
        0,
      ) as Paisa,
    [crew, days],
  )

  const handleUpdateCrewExtras = (
    crewId: string,
    field: 'overtimePaisa' | 'accommodationPaisa' | 'mealsPaisa',
    paisa: Paisa,
  ) => {
    onUpdateCrew(crewId, { [field]: paisa })
  }

  return (
    <>
      <CrewSection
        open={openCrew}
        onToggle={onToggleCrew}
        crew={crew}
        days={days}
        canCrewMoney={canCrewMoney}
        liveCrew={liveCrew}
        onAddCrew={onAddCrew}
        onRemoveCrew={onRemoveCrew}
        onClearCrew={onClearCrew}
        onUpdateCrewExtras={handleUpdateCrewExtras}
        crewChargesPaisa={crewChargesPaisa}
        isPhone={isPhone}
        {...(crewTitle ? { title: crewTitle } : {})}
      />

      <DeliverySection
        open={openDelivery}
        onToggle={onToggleDelivery}
        isPhone={isPhone}
        clientPickup={transport.clientPickup}
        deliveryType={transport.deliveryType}
        setDeliveryType={(val) =>
          onUpdateTransport({
            deliveryType: val,
            clientPickup: val === 'Client Pickup',
          })
        }
        vehicle={transport.vehicle}
        setVehicle={(val) => onUpdateTransport({ vehicle: val })}
        numberPlate={transport.numberPlate}
        setNumberPlate={(val) => onUpdateTransport({ numberPlate: val })}
        driverContact={transport.driverContact}
        setDriverContact={(val) => onUpdateTransport({ driverContact: val })}
        pickupLocation={transport.pickupLocation}
        setPickupLocation={(val) => onUpdateTransport({ pickupLocation: val })}
        returnLocation={transport.returnLocation}
        setReturnLocation={(val) => onUpdateTransport({ returnLocation: val })}
        specialInstructions={transport.specialInstructions}
        setSpecialInstructions={(val) =>
          onUpdateTransport({ specialInstructions: val })
        }
        returnPickupType={transport.returnPickupType}
        setReturnPickupType={(val) => onUpdateTransport({ returnPickupType: val })}
        returnPickupAddress={transport.returnPickupAddress}
        setReturnPickupAddress={(val) =>
          onUpdateTransport({ returnPickupAddress: val })
        }
        returnPickupTime={transport.returnPickupTime}
        setReturnPickupTime={(val) =>
          onUpdateTransport({ returnPickupTime: val })
        }
        returnPickupChargePaisa={transport.returnPickupChargePaisa}
        setReturnPickupChargePaisa={(val) =>
          onUpdateTransport({ returnPickupChargePaisa: val })
        }
        deliveryChargePaisa={transport.deliveryChargePaisa}
        setDeliveryChargePaisa={(val) =>
          onUpdateTransport({ deliveryChargePaisa: val })
        }
        fuelChargePaisa={transport.fuelChargePaisa}
        setFuelChargePaisa={(val) => onUpdateTransport({ fuelChargePaisa: val })}
        transportPaisa={transport.transportPaisa}
        canBookingMoney={canBookingMoney}
        {...(deliveryTitle ? { title: deliveryTitle } : {})}
      />
    </>
  )
}
