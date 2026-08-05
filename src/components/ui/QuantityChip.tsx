import React from 'react'
import {
  IconCheck,
  IconPackage,
  IconArrowUpRight,
  IconAlertOctagon,
  IconFlame,
} from '@tabler/icons-react'

export interface QuantityBreakdown {
  booked: number
  packed?: number
  pickedUp?: number
  returned?: number
  missing?: number
  damaged?: number
}

export interface QuantityChipProps {
  quantities: QuantityBreakdown
  compact?: boolean
  className?: string
}

export const QuantityChip: React.FC<QuantityChipProps> = ({
  quantities,
  compact = false,
  className = '',
}) => {
  const { booked, packed = 0, pickedUp = 0, returned = 0, missing = 0, damaged = 0 } = quantities

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs font-mono select-none ${className}`}>
        <span className="text-slate-300 font-semibold">{booked} total</span>
        {returned > 0 && <span className="text-emerald-400">({returned} ret)</span>}
        {pickedUp > 0 && <span className="text-blue-400">({pickedUp} out)</span>}
        {missing > 0 && <span className="text-red-400 font-bold">({missing} miss)</span>}
        {damaged > 0 && <span className="text-amber-400 font-bold">({damaged} dmg)</span>}
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center flex-wrap gap-1.5 text-xs select-none ${className}`}>
      {/* Booked Total */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-medium">
        <span>{booked} Booked</span>
      </span>

      {/* Packed */}
      {packed > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800 text-amber-300 font-medium">
          <IconPackage className="w-3 h-3" />
          <span>{packed} Packed</span>
        </span>
      )}

      {/* Picked Up (On Rent) */}
      {pickedUp > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/60 border border-blue-800 text-blue-300 font-medium">
          <IconArrowUpRight className="w-3 h-3" />
          <span>{pickedUp} Out</span>
        </span>
      )}

      {/* Returned */}
      {returned > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-medium">
          <IconCheck className="w-3 h-3" />
          <span>{returned} In</span>
        </span>
      )}

      {/* Missing */}
      {missing > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-950/80 border border-red-800 text-red-300 font-semibold">
          <IconAlertOctagon className="w-3 h-3" />
          <span>{missing} Missing</span>
        </span>
      )}

      {/* Damaged */}
      {damaged > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-700 text-amber-300 font-semibold">
          <IconFlame className="w-3 h-3" />
          <span>{damaged} Damaged</span>
        </span>
      )}
    </div>
  )
}
