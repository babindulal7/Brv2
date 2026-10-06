import { useCallback, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input, Select } from '../../../components/ui'
import Icon, { type IconName } from '../../../components/ui/Icon'
import { Section, Field, inputStyle } from './BookingFormWidgets'
import { AddItemPanel, type AddItemSource } from './AddItemPanel'
import { RentalLineItemsTree, type Line } from './RentalLineItemsTree'
import {
  type EquipmentResult,
  type EquipmentAvailabilitySource,
  type EquipmentConflictSummary,
  type BookingWindow,
  type BookingLineDraft,
  type BundleResult,
  equipmentLineDraft,
  defaultTransportOptions,
} from './itemCatalogue'
import { CREW_ROSTER, type CrewMember } from '../../../lib/queries/crew'
import type { PricingPipelineResult } from '../../../lib/pricingPipeline'
import type { GateContext } from '../../../lib/fieldGating'
import type { AuthUser } from '../../../lib/auth'
import { supabase, newClientUuid } from '../../../lib/supabase'
import { rupees, type Paisa } from '../../../lib/money'

const inlineInfoStyle = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  fontSize: 'var(--t-meta)',
  fontWeight: 500,
  color: 'var(--text2)',
  lineHeight: 1.4,
} as const

export interface BookingEquipmentSectionProps {
  open: boolean
  onToggle: () => void
  title?: string
  lines: Line[]
  setLines: React.Dispatch<React.SetStateAction<Line[]>>
  totalUnits: number
  bundleCount: number
  days: number
  liveEquipment: readonly EquipmentResult[] | null
  availabilitySource: EquipmentAvailabilitySource
  liveBundleResults: readonly BundleResult[]
  liveCrew: readonly CrewMember[] | null
  existingCrewIds: readonly string[]
  bookingWindow: BookingWindow
  poolError: string | null
  conflictSummary: EquipmentConflictSummary
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  onSelectTransport: (type: 'Client Pickup' | 'Babin Delivery') => void
  onAddCrew: (crewId: string) => void
  canBookingMoney: boolean
  gateContext: GateContext
  user: AuthUser | null
  navigate: (path: string) => void
  pricing: PricingPipelineResult
  isPhone?: boolean
}

export function BookingEquipmentSection({
  open,
  onToggle,
  title = 'Equipment, Bundles & Services',
  lines,
  setLines,
  totalUnits,
  bundleCount,
  days,
  liveEquipment,
  availabilitySource,
  liveBundleResults,
  liveCrew,
  existingCrewIds,
  bookingWindow,
  poolError,
  conflictSummary,
  deliveryType,
  onSelectTransport,
  onAddCrew,
  canBookingMoney,
  gateContext,
  user,
  navigate,
  pricing,
  isPhone = false,
}: BookingEquipmentSectionProps) {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({})

  const [bundleNotice, setBundleNotice] = useState<{
    name: string
    notes: readonly string[]
    skipped: ReadonlyArray<{ model: string; reason: string }>
  } | null>(null)

  const [customLineOpen, setCustomLineOpen] = useState(false)
  const [customLineType, setCustomLineType] = useState<'Service' | 'Manual item' | 'Sub-rental'>('Service')
  const [customLineName, setCustomLineName] = useState('')
  const [customLineVendor, setCustomLineVendor] = useState('')
  const [customLineRate, setCustomLineRate] = useState('')
  const [customLineQty, setCustomLineQty] = useState(1)
  const [customLineError, setCustomLineError] = useState<string | null>(null)

  const addDrafts = useCallback(
    (drafts: readonly BookingLineDraft[], source: AddItemSource) => {
      setBundleNotice(
        source.kind === 'bundle' && source.bundle
          ? { name: source.name, notes: source.bundle.notes, skipped: source.bundle.skipped }
          : null,
      )
      setLines((prev) => {
        const have = new Set(prev.map((l) => l.id))
        const fresh = drafts
          .filter((d) => !have.has(d.id))
          .map<Line>((d) => ({
            ...d,
            ...(source.kind === 'bundle' ? { bundleCode: source.id, bundleName: source.name } : {}),
          }))
        return fresh.length === 0 ? prev : [...prev, ...fresh]
      })
    },
    [setLines],
  )

  const addCustomLine = useCallback(() => {
    const name = customLineName.trim()
    const rate = Number(customLineRate)
    const vendor = customLineVendor.trim()
    if (!name) {
      setCustomLineError('Enter a description for this line.')
      return
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setCustomLineError('Enter a rate of Rs 0 or more.')
      return
    }
    const isSub = customLineType === 'Sub-rental'
    setLines((prev) => [
      ...prev,
      {
        id: newClientUuid(),
        lineType: customLineType,
        name: isSub && vendor ? `${name} (${vendor})` : name,
        serial: '—',
        category: isSub ? 'Sub-rental' : customLineType === 'Service' ? 'Service' : 'Manual charge',
        ratePaisa: rupees(rate) as Paisa,
        days: Math.max(1, days || 1),
        qty: Math.max(1, Math.round(customLineQty) || 1),
        discountPct: 0,
        location: isSub ? (vendor ? `Vendor: ${vendor}` : 'Sub-rented') : 'Not inventory-tracked',
        committedTo: '—',
      },
    ])
    setCustomLineError(null)
    setCustomLineName('')
    setCustomLineVendor('')
    setCustomLineRate('')
    setCustomLineQty(1)
    setCustomLineOpen(false)
  }, [customLineName, customLineRate, customLineQty, customLineType, customLineVendor, days, setLines])

  const addScannedEquipment = useCallback(
    async (rawCode: string): Promise<string | null> => {
      const code = rawCode.trim()
      if (!code) return null
      if (!liveEquipment) {
        return null
      }
      type ScannedUnit = { product?: { id?: string | null } | null }
      let unit: ScannedUnit | null = null
      try {
        const { data, error } = await supabase
          .from('product_units_v')
          .select('product:products_v (id)')
          .or(`barcode.eq.${code},serial_no.eq.${code},asset_tag.eq.${code}`)
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (data) {
          unit = data as ScannedUnit
        }
      } catch {
        return null
      }

      const productId = unit?.product?.id ?? null
      const match = productId ? liveEquipment.find((item) => item.id === productId) : undefined
      if (!match) {
        return null
      }
      if (lines.some((line) => line.id === match.id)) {
        return null
      }
      if (match.availability.level === 'unavailable') {
        return null
      }
      addDrafts([equipmentLineDraft(match, days || 1)], { kind: match.kind, id: match.id, name: match.name })
      return match.id
    },
    [liveEquipment, lines, addDrafts, days],
  )

  return (
    <Section
      id="section-2"
      title={title}
      badge={
        lines.length > 0 ? (
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
            {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
          </span>
        ) : null
      }
      open={open}
      onToggle={onToggle}
      summary={`${lines.length} lines · ${conflictSummary.conflicts.length} conflicts`}
    >
      <div style={{ marginBottom: 10 }}>
        {!liveEquipment && (
          <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--warn-text)', lineHeight: 1.5 }}>
            This panel is still listing <strong>sample equipment</strong> — the live catalogue has not loaded, so
            items added here cannot be saved and Confirm will say so rather than writing a booking with products
            that do not exist.
          </p>
        )}
        {poolError && (
          <p role="alert" style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)', lineHeight: 1.5 }}>
            The live catalogue and client list could not be read: {poolError}
          </p>
        )}

        <AddItemPanel
          inline
          window={bookingWindow}
          {...(liveEquipment ? { equipment: liveEquipment, availability: availabilitySource } : {})}
          bundles={liveBundleResults}
          crew={liveCrew && liveCrew.length > 0 ? liveCrew : CREW_ROSTER}
          transport={defaultTransportOptions(bookingWindow)}
          existingCrewIds={existingCrewIds}
          selectedTransportType={deliveryType}
          days={days || 1}
          existingLineIds={lines.map((l) => l.id)}
          onAdd={addDrafts}
          onAddCrew={onAddCrew}
          onSelectTransport={onSelectTransport}
          showPrices={canBookingMoney}
          inputStyle={inputStyle}
          onScan={addScannedEquipment}
        />
      </div>

      {canBookingMoney && (
        <div style={{ margin: '0 0 12px', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 'var(--t-ui)' }}>Services, sub-rentals &amp; custom charges</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                icon="box"
                variant="secondary"
                onClick={() => {
                  setCustomLineType('Sub-rental')
                  setCustomLineOpen(true)
                }}
              >
                + Add sub-rental
              </Button>
              <Button icon="plus" variant="secondary" onClick={() => setCustomLineOpen((prev) => !prev)}>
                {customLineOpen ? 'Close line form' : 'Add custom line'}
              </Button>
            </div>
          </div>

          {customLineOpen && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 'var(--r-card)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone
                    ? '1fr'
                    : customLineType === 'Sub-rental'
                      ? 'minmax(0,1.2fr) minmax(130px,1fr) minmax(150px,1.2fr) minmax(70px,0.4fr) minmax(110px,0.7fr)'
                      : 'minmax(0,1.6fr) minmax(150px,0.7fr) minmax(100px,0.45fr) minmax(130px,0.6fr)',
                  gap: 9,
                  alignItems: 'end',
                }}
              >
                <Field label="Line type">
                  <Select value={customLineType} onChange={(e) => setCustomLineType(e.target.value as typeof customLineType)} style={inputStyle}>
                    <option value="Service">Service</option>
                    <option value="Manual item">Manual charge</option>
                    <option value="Sub-rental">Sub-rental (Partner gear)</option>
                  </Select>
                </Field>
                {customLineType === 'Sub-rental' && (
                  <Field label="Partner / Supplier">
                    <Input value={customLineVendor} onChange={(e) => setCustomLineVendor(e.target.value)} placeholder="e.g. GearHouse KTM" style={inputStyle} />
                  </Field>
                )}
                <Field label={customLineType === 'Sub-rental' ? 'Equipment name' : 'Description'}>
                  <Input
                    value={customLineName}
                    onChange={(e) => setCustomLineName(e.target.value)}
                    placeholder={customLineType === 'Sub-rental' ? 'e.g. Master Prime 50mm' : 'e.g. Operator overtime'}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Qty">
                  <Input type="number" min={1} value={customLineQty} onChange={(e) => setCustomLineQty(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
                </Field>
                <Field label="Rate / day (Rs)">
                  <Input type="number" min={0} value={customLineRate} onChange={(e) => setCustomLineRate(e.target.value)} placeholder="0" style={inputStyle} />
                </Field>
              </div>
              {customLineError && (
                <p role="alert" style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)' }}>
                  {customLineError}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCustomLineOpen(false)
                    setCustomLineError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button icon="plus" onClick={addCustomLine}>
                  {customLineType === 'Sub-rental' ? 'Add sub-rental' : 'Add line'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {lines.length > 0 && (() => {
        const conflicted = conflictSummary.conflicts.length > 0
        const answered = conflictSummary.state === 'ready'
        const tone = conflicted
          ? { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'error' as IconName }
          : answered
            ? { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)', icon: 'check' as IconName }
            : { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)', icon: 'timer' as IconName }
        return (
          <div
            style={{
              display: 'flex',
              gap: 7,
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 'var(--r-btn)',
              marginBottom: 10,
              background: tone.bg,
              color: tone.fg,
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
            }}
          >
            <Icon name={tone.icon} size={13} style={{ flexShrink: 0 }} />
            {conflictSummary.text}
          </div>
        )
      })()}

      {bundleNotice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '8px 10px',
            marginBottom: 8,
            borderRadius: 'var(--r-card)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p style={{ ...inlineInfoStyle, fontWeight: 600, color: 'var(--text)' }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{bundleNotice.name}</span>
          </p>
          {bundleNotice.notes.map((n) => (
            <p key={n} style={inlineInfoStyle}>
              <span aria-hidden="true" style={{ flexShrink: 0 }}>
                ·
              </span>
              <span>{n}</span>
            </p>
          ))}
          {Array.from(
            bundleNotice.skipped.reduce((m, x) => {
              m.set(x.reason, [...(m.get(x.reason) ?? []), x.model])
              return m
            }, new Map<string, string[]>()),
          ).map(([reason, models]) => (
            <p key={reason} style={inlineInfoStyle}>
              <span aria-hidden="true" style={{ flexShrink: 0 }}>
                ·
              </span>
              <span>
                Not added — {models.join(', ')}: {reason}
              </span>
            </p>
          ))}
          <div style={{ marginTop: 2 }}>
            <Button variant="ghost" onClick={() => setBundleNotice(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <RentalLineItemsTree
        lines={lines}
        setLines={setLines}
        collapsedBundles={collapsedBundles}
        setCollapsedBundles={setCollapsedBundles}
        canBookingMoney={canBookingMoney}
        conflictSummary={conflictSummary}
        liveEquipment={liveEquipment}
        gateContext={gateContext}
        user={user}
        navigate={navigate}
        totalUnits={totalUnits}
        bundleCount={bundleCount}
        days={days}
        pricing={pricing}
      />
    </Section>
  )
}
