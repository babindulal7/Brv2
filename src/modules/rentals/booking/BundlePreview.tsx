/**
 * **Bundle Preview — "New Booking" spec §33.**
 *
 * What [View] opens on a bundle row. §33 asks for the item count, the price
 * per day, the bundle discount, the components grouped by category with a tick
 * per component, an overall availability verdict, and [Cancel] / [Add Bundle].
 *
 * Why it exists at all: §34 makes [Add Bundle] append every component to the
 * booking in one action. Sixteen lines arriving at once is the right behaviour
 * and the wrong thing to do blind — this is the look before the leap, and it
 * is the only place that answers "*which* component is short?" before the
 * booking already has it.
 *
 * It renders through the app's own `Modal`, like `AssignCrewModal` and
 * `ExtendRentalModal` in `../modals/`, rather than inventing a fourth dialog
 * shell.
 *
 * **Nothing here computes a price.** Every figure comes from
 * `bundles.factsOf` (sum of parts, saving, item counts) or from
 * `addBundleToBooking` (the drafts, the notes). This file formats.
 */

import { useMemo } from 'react'
import Icon from '../../../components/ui/Icon'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { formatAd } from '../../../lib/bs'
import { formatMoney } from '../../../lib/money'
import { STATUS } from '../../../lib/status'
import { factsOf, isPriced } from '../../../lib/queries/bundles'
import type { BundleLine, BundleRecord } from '../../../lib/queries/bundles'
import { addBundleToBooking, bundleAvailability } from './itemCatalogue'
import type { AddBundleResult, AvailabilityVerdict, BookingWindow } from './itemCatalogue'
import { TOUCH } from './ClientHealthChip'
import { formatKitCapacity, type BundleKitCapacity } from '../../../lib/bundleCapacityView'

/* ── The availability pill, shared with the panel ──────────────────────── */

/**
 * Icon + label + colour, in that order of importance. There is no size or
 * mode that drops the word — a bare coloured dot is a defect, so this
 * component cannot produce one.
 */
/**
 * G4 — "N kits available for these dates" and the component that limits it. Renders nothing when the
 * bundle has no capacity answer: an absent source is not a zero.
 */
export function KitCapacityLine({ capacity }: { capacity: BundleKitCapacity | null | undefined }) {
  if (!capacity) return null
  const { headline, limitedBy } = formatKitCapacity(capacity)
  return (
    <span data-testid="kit-capacity">
      <strong>{headline}</strong> · {limitedBy}
    </span>
  )
}

export function AvailabilityChip({
  verdict,
  size = 'sm',
  showDetail = false,
}: {
  verdict: AvailabilityVerdict
  size?: 'sm' | 'md'
  /** Appends the *why* inside the chip. Off in dense rows, on in the preview. */
  showDetail?: boolean
}) {
  const t = STATUS[verdict.tone]
  const dense = size === 'sm'
  return (
    <span
      title={verdict.detail}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dense ? 4 : 6,
        height: dense ? 20 : 26,
        padding: dense ? '0 7px' : '0 10px',
        borderRadius: 'var(--r-badge)',
        background: t.bg,
        color: t.fg,
        ...(t.border ? { border: `1px solid ${t.border}` } : {}),
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={verdict.icon} size={dense ? 12 : 14} />
      {verdict.label}
      {showDetail && (
        <span style={{ fontWeight: 500, opacity: 0.9 }}>· {verdict.detail}</span>
      )}
    </span>
  )
}

/* ── Per-component state ───────────────────────────────────────────────── */

/**
 * §33's per-component tick. A component is ready when the units it needs are
 * free, and short otherwise — the same `unitsAvailable < quantity` test
 * `bundles.factsOf` uses for the bundle as a whole, so a preview can never
 * disagree with the row that opened it.
 */
function lineVerdict(l: BundleLine, w: BookingWindow): { ok: boolean; freed: boolean; text: string } {
  const short = Math.max(0, l.quantity - l.unitsAvailable)
  if (short === 0) return { ok: true, freed: false, text: `${l.unitsAvailable} of ${l.unitsStock} free` }

  const pickup = w.pickupAd?.getTime()
  const frees = l.freesAd?.getTime()
  const freed =
    pickup !== undefined &&
    frees !== undefined &&
    !Number.isNaN(pickup) &&
    !Number.isNaN(frees) &&
    frees <= pickup

  const held = l.blockedBy ? `${l.blockedBy}` : 'Held'
  const back = l.freesAd ? ` · frees ${formatAd(l.freesAd)}` : ' · no return date recorded'
  return {
    ok: freed,
    freed,
    text: freed
      ? `${short} short today, back ${l.freesAd ? formatAd(l.freesAd) : 'before pickup'} — before your pickup`
      : `${short} short · ${held}${back}`,
  }
}

/* ── Props ─────────────────────────────────────────────────────────────── */

export interface BundlePreviewProps {
  bundle: BundleRecord | null
  open: boolean
  onClose: () => void
  /** The booking's dates, so availability is the booking's, not today's (§32). */
  window: BookingWindow
  /** The booking's length — seeds every component draft's Days. */
  days: number
  /** Ids already on the booking, so a re-add skips rather than duplicates. */
  existingLineIds?: ReadonlySet<string>
  /** Receives the ready-to-append drafts. This component never writes. */
  onAdd: (result: AddBundleResult) => void
  /** Money gating — pass the page's `canViewMoneyField(gctx, …)` result. */
  showPrices?: boolean
  /** Crew/vehicle lines ride along. Off by default; both are priced in Section 3. */
  includeCrewAndVehicle?: boolean
  /** Stamp the bundle's saving on each line. Off by default — pricing is the page's (§67). */
  applyBundleSaving?: boolean
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function BundlePreview({
  bundle,
  open,
  onClose,
  window: bookingWindow,
  days,
  existingLineIds,
  onAdd,
  showPrices = true,
  includeCrewAndVehicle = false,
  applyBundleSaving = false,
}: BundlePreviewProps) {
  const facts = useMemo(() => (bundle ? factsOf(bundle) : null), [bundle])
  const verdict = useMemo(
    () => (bundle && facts ? bundleAvailability(bundle, facts, bookingWindow) : null),
    [bundle, facts, bookingWindow],
  )

  /**
   * Built here so the footer's [Add Bundle] hands over exactly what the
   * preview showed — the preview and the append cannot describe two different
   * sets of lines.
   */
  const draft = useMemo(() => {
    if (!bundle) return null
    return addBundleToBooking(bundle, bookingWindow, {
      days,
      ...(existingLineIds ? { existingLineIds } : {}),
      includeCrewAndVehicle,
      applyBundleSaving,
    })
  }, [bundle, bookingWindow, days, existingLineIds, includeCrewAndVehicle, applyBundleSaving])

  if (!bundle || !facts || !verdict || !draft) return null

  /** §33 groups the components by category — `BundleLine.group` is that category. */
  const groups = new Map<string, BundleLine[]>()
  for (const l of bundle.lines) {
    const bucket = groups.get(l.group)
    if (bucket) bucket.push(l)
    else groups.set(l.group, [l])
  }
  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b))

  const addable = draft.lines.length
  const alreadyOn = draft.skipped.filter((s) => s.reason === 'Already on this booking').length

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={bundle.name}
      subtitle={`${bundle.id} · ${bundle.category} · ${facts.totalItems} items`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="plus"
            disabled={addable === 0}
            onClick={() => {
              onAdd(draft)
              onClose()
            }}
          >
            {addable === 0 ? 'Nothing to add' : `Add Bundle · ${addable} lines`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {/* ── Verdict, stated in words before anything else ───────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '10px 12px',
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
          }}
        >
          <AvailabilityChip verdict={verdict} size="md" />
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', minWidth: 0 }}>
            {verdict.detail}
          </span>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', minWidth: 0 }}>
            <KitCapacityLine capacity={bundle?.kitCapacity} />
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {bookingWindow.pickupAd && bookingWindow.returnAd ? (
              <>
                Checked for{' '}
                <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>
                  {formatAd(bookingWindow.pickupAd)} – {formatAd(bookingWindow.returnAd)}
                </span>
              </>
            ) : (
              'Checked for today — set pickup and return to check the booking window'
            )}
          </span>
        </div>

        {/* ── Facts strip ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 1,
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            overflow: 'hidden',
          }}
        >
          <Stat label="Items" value={String(facts.totalItems)} note={`${facts.readyItems} ready`} />
          <Stat
            label="Components"
            value={String(bundle.lines.length)}
            note={`${facts.equipment} equipment · ${facts.boxes} cases`}
          />
          {showPrices && <Stat label="Bundle price / day" value={formatMoney(bundle.bundleRatePaisa)} />}
          {showPrices && (
            <Stat
              label="Sum of parts / day"
              value={formatMoney(facts.sumOfPartsPaisa)}
              note="Equipment and cases only"
            />
          )}
          {showPrices && (
            <Stat
              label="Bundle discount"
              value={facts.savingPaisa > 0 ? `${formatMoney(facts.savingPaisa)} · ${facts.savingPct}%` : '—'}
              note={facts.savingPaisa > 0 ? 'Off the sum of parts' : 'No saving against the sum of parts'}
              tone={facts.savingPaisa > 0 ? 'success' : 'muted'}
            />
          )}
        </div>

        {/* ── Components, grouped by category (§33) ───────────────────── */}
        <section>
          <h3
            style={{
              margin: '0 0 7px',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text2)',
            }}
          >
            Components
          </h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {groupNames.map((g) => {
              const lines = groups.get(g) ?? []
              return (
                <div
                  key={g}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-card)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      padding: '7px 11px',
                      background: 'var(--th-bg)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                      color: 'var(--text2)',
                    }}
                  >
                    <span>{g}</span>
                    <span className="figure" style={{ marginLeft: 'auto', fontWeight: 600 }}>
                      {lines.length} line{lines.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {lines.map((l) => {
                      const lv = lineVerdict(l, bookingWindow)
                      const unpriced = !isPriced(l)
                      return (
                        <li
                          key={`${g}-${l.model}`}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 9,
                            padding: '8px 11px',
                            borderTop: '1px solid var(--divider)',
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              display: 'inline-flex',
                              paddingTop: 1,
                              flexShrink: 0,
                              color: lv.ok ? 'var(--success-text)' : 'var(--danger-text)',
                            }}
                          >
                            <Icon name={lv.ok ? 'check' : 'error'} size={14} />
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                display: 'block',
                                fontSize: 'var(--t-ui)',
                                fontWeight: 600,
                                color: 'var(--text)',
                              }}
                            >
                              <span className="figure">{l.quantity}×</span> {l.model}
                              {l.mandatory === true && (
                                <span style={{ marginLeft: 7, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
                                  Required
                                </span>
                              )}
                            </span>
                            {/* The tick's meaning in words — never the glyph alone. */}
                            <span
                              style={{
                                display: 'block',
                                marginTop: 2,
                                fontSize: 'var(--t-meta)',
                                color: lv.ok ? 'var(--text2)' : 'var(--danger-text)',
                              }}
                            >
                              {lv.ok ? 'Ready' : 'Short'} — {lv.text}
                            </span>
                            {!lv.ok && l.substitutes && l.substitutes.length > 0 && (
                              <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                                Substitutes: {l.substitutes.join(', ')}
                              </span>
                            )}
                          </span>
                          {showPrices && (
                            <span
                              className="figure"
                              style={{
                                flexShrink: 0,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                                color: unpriced ? 'var(--muted)' : 'var(--text)',
                                whiteSpace: 'nowrap',
                              }}
                              title={unpriced ? 'Crew and vehicles are priced in Section 3, not in the bundle rate' : undefined}
                            >
                              {unpriced ? 'Priced in Section 3' : `${formatMoney(l.unitRatePaisa)} / day`}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── What Add Bundle will actually do ────────────────────────── */}
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            background: 'var(--card2)',
            padding: 'var(--sp-md)',
            display: 'grid',
            gap: 7,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text2)',
            }}
          >
            Adding this bundle
          </h3>
          {draft.notes.map((n) => (
            <p
              key={n}
              style={{
                margin: 0,
                display: 'flex',
                gap: 7,
                alignItems: 'flex-start',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0, color: 'var(--muted)' }}>
                <Icon name="info" size={13} />
              </span>
              <span style={{ minWidth: 0 }}>{n}</span>
            </p>
          ))}
          {alreadyOn > 0 && (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span className="figure" style={{ fontWeight: 600 }}>{alreadyOn}</span> component
              {alreadyOn === 1 ? ' is' : 's are'} already on this booking and will not be duplicated.
            </p>
          )}
        </section>

        {bundle.booking && (
          <p
            style={{
              margin: 0,
              display: 'flex',
              gap: 7,
              alignItems: 'flex-start',
              minHeight: TOUCH,
              fontSize: 'var(--t-meta)',
              color: 'var(--danger-text)',
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0 }}>
              <Icon name="alert_triangle" size={13} />
            </span>
            <span>
              This bundle is committed to {bundle.booking.id} ({bundle.booking.client}),{' '}
              <span className="figure">
                {formatAd(bundle.booking.startAd)} – {formatAd(bundle.booking.endAd)}
              </span>
              .
            </span>
          </p>
        )}
      </div>
    </Modal>
  )
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'success' | 'muted'
}) {
  return (
    <div style={{ background: 'var(--card)', padding: '9px 11px', display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{label}</span>
      <span
        className="figure"
        style={{
          fontSize: 'var(--t-ui)',
          fontWeight: 700,
          color: tone === 'success' ? 'var(--success-text)' : tone === 'muted' ? 'var(--muted)' : 'var(--text)',
        }}
      >
        {value}
      </span>
      {note && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{note}</span>}
    </div>
  )
}
