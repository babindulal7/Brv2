import Icon from '../../../components/ui/Icon'
import { formatBs, formatAd, type BsDate } from '../../../lib/bs'
import type { Paisa } from '../../../lib/money'
import { Section } from './BookingFormWidgets'
import { DateTimeField } from './DateTimeField'
import { DatePresets } from './DatePresets'
import { SHOOT_PRESETS } from './newRentalUtils'

export interface BookingDatesSectionProps {
  title?: string
  open: boolean
  onToggle: () => void
  days: number
  dayWord: string
  pickup: string
  pickupBs?: BsDate | null | undefined
  pickupTime: string
  ret: string
  returnTime: string
  pricingHints?: Record<number, Paisa> | undefined
  onPickupChange: (date: string) => void
  onPickupTimeChange: (time: string) => void
  onReturnChange: (date: string) => void
  onReturnTimeChange: (time: string) => void
  onPresetDatesPick: (pickup: string, ret: string) => void
  onApplyShootPreset: (presetId: (typeof SHOOT_PRESETS)[number]['id']) => void
}

export function BookingDatesSection({
  title = 'Rental period',
  open,
  onToggle,
  days,
  dayWord,
  pickup,
  pickupBs,
  pickupTime,
  ret,
  returnTime,
  pricingHints,
  onPickupChange,
  onPickupTimeChange,
  onReturnChange,
  onReturnTimeChange,
  onPresetDatesPick,
  onApplyShootPreset,
}: BookingDatesSectionProps) {
  return (
    <Section
      id="section-1"
      title={title}
      badge={
        days > 0 ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Icon name="calendar" size={11} /> {days} {dayWord}
          </span>
        ) : null
      }
      open={open}
      onToggle={onToggle}
      summary={
        days === 0
          ? 'Return must be later than pickup'
          : `${pickupBs ? formatBs(pickupBs) : formatAd(new Date(pickup))} → ${days} ${dayWord}`
      }
    >
      <details className="new-rental-preset-disclosure">
        <summary>Use a shoot preset</summary>
        <div className="new-rental-shoot-presets" role="group" aria-label="Production shoot presets">
          {SHOOT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="new-rental-preset-chip"
              onClick={() => onApplyShootPreset(p.id)}
              title={p.description}
            >
              <Icon name={p.icon} size={12} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </details>

      {/* Quick date presets — one-tap common rental durations */}
      <DatePresets
        outDate={pickup}
        onPick={onPresetDatesPick}
        minReturnDate={pickup}
        {...(pricingHints ? { priceHints: pricingHints } : {})}
      />

      <div
        className="new-rental-period-fields"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 11, alignItems: 'start' }}
      >
        <DateTimeField
          label="Out"
          dateValue={pickup}
          timeValue={pickupTime}
          onDateChange={onPickupChange}
          onTimeChange={onPickupTimeChange}
        />
        <DateTimeField
          label="Return"
          dateValue={ret}
          timeValue={returnTime}
          onDateChange={onReturnChange}
          onTimeChange={onReturnTimeChange}
          error={days === 0 ? 'Return must be later than pickup. Change the return date or its time.' : undefined}
        />
      </div>
    </Section>
  )
}
