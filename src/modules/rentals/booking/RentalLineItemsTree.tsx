import { Fragment, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import type { IconName } from '../../../components/ui/Icon'
import { DataTableShell } from '../../../components/ui/DataTable'
import { NumberStepper, RowMenu, TouchInset, srOnly } from './BookingFormWidgets'
import { formatMoney, roundHalfUp, type Paisa } from '../../../lib/money'
import { INV_STYLE, type InvStatus } from '../../../lib/queries/inventory'
import { STATUS } from '../../../lib/status'
import { IntelCard } from '../../../components/ui/IntelCard'
import { newRentalEquipmentGlance, newRentalEquipmentDetail } from '../../../data/newRentalEquipmentIntel'
import type { AvailabilityVerdict, EquipmentConflictSummary, EquipmentResult } from './itemCatalogue'
import type { GateContext } from '../../../lib/fieldGating'
import type { SystemRole } from '../../../types/database'
import type { PricingPipelineResult } from '../../../lib/pricingPipeline'

export interface Line {
  lineNote?: string | undefined
  serviceBasis?: 'Flat' | 'Per day' | undefined
  supplierCost?: number | undefined
  bookingLineId?: string | undefined
  id: string
  clientUuid?: string | undefined
  parentClientUuid?: string | null | undefined
  lineType?: 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item' | undefined
  isIncluded?: boolean | undefined
  productId?: string | null | undefined
  bundleId?: string | null | undefined
  bundleCode?: string | undefined
  bundleName?: string | undefined
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  days: number
  daysOverridden?: boolean | undefined
  qty: number
  discountPct: number
  location: string
  status?: InvStatus | undefined
  committedTo: string
}

export function lineAmountPaisa(l: Line): Paisa {
  return roundHalfUp(l.qty * l.days * l.ratePaisa * (1 - l.discountPct / 100)) as Paisa
}

export interface LineGroup {
  key: string
  kind: 'bundle' | 'model'
  label: string
  lines: Line[]
}

export function groupLines(lines: readonly Line[]): LineGroup[] {
  const order: string[] = []
  const byKey = new Map<string, LineGroup>()
  for (const l of lines) {
    const key = l.bundleCode ? `bundle:${l.bundleCode}` : `model:${l.name}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        key,
        kind: l.bundleCode ? 'bundle' : 'model',
        label: l.bundleCode ? (l.bundleName ?? l.bundleCode) : l.name,
        lines: [],
      }
      byKey.set(key, g)
      order.push(key)
    }
    g.lines.push(l)
  }
  return order.map((k) => byKey.get(k)).filter((g): g is LineGroup => g !== undefined)
}

export function isNested(g: LineGroup): boolean {
  return g.kind === 'bundle' || g.lines.length > 1
}

const th = {
  textAlign: 'left' as const,
  padding: '7px 9px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  height: 'var(--row-min-h)',
  padding: '7px 9px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap' as const,
}

export interface RentalLineItemsTreeProps {
  lines: Line[]
  setLines: React.Dispatch<React.SetStateAction<Line[]>>
  collapsedBundles: Record<string, boolean>
  setCollapsedBundles: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  canBookingMoney: boolean
  conflictSummary: EquipmentConflictSummary | { conflicts?: readonly unknown[]; state?: string; text?: string; verdictByLineId: Map<string, AvailabilityVerdict> | ReadonlyMap<string, AvailabilityVerdict> }
  liveEquipment?: readonly EquipmentResult[] | null | undefined
  gateContext: GateContext
  user?: { id: string; role: SystemRole } | null
  navigate: (path: string) => void
  totalUnits: number
  bundleCount: number
  days: number
  pricing: PricingPipelineResult
  readOnly?: boolean
}

export function RentalLineItemsTree({
  lines,
  setLines,
  collapsedBundles,
  setCollapsedBundles,
  canBookingMoney,
  conflictSummary,
  liveEquipment,
  gateContext: gctx,
  user,
  navigate,
  totalUnits,
  bundleCount,
  days,
  pricing,
  readOnly = false,
}: RentalLineItemsTreeProps) {
  const lineGroups = useMemo(() => groupLines(lines), [lines])

  const equipmentColumns: Array<{ key: string; align: 'left' | 'right' }> = useMemo(
    () =>
      canBookingMoney
        ? [
            { key: 'Item', align: 'left' },
            { key: 'Category', align: 'left' },
            { key: 'Qty', align: 'right' },
            { key: 'Days', align: 'right' },
            { key: 'Rate / day', align: 'right' },
            { key: 'Disc.', align: 'right' },
            { key: 'Amount', align: 'right' },
            { key: 'Availability', align: 'left' },
            { key: '', align: 'right' },
          ]
        : [
            { key: 'Item', align: 'left' },
            { key: 'Category', align: 'left' },
            { key: 'Qty', align: 'right' },
            { key: 'Days', align: 'right' },
            { key: 'Availability', align: 'left' },
            { key: '', align: 'right' },
          ],
    [canBookingMoney],
  )

  const linePill = (
    l: Line,
  ): { label: string; title: string; bg: string; fg: string; icon: IconName; rank: number } => {
    if (l.lineType === 'Service' || l.lineType === 'Manual item') {
      return {
        label: 'Not inventory-tracked',
        title: `${l.lineType} — no serial assignment or availability check applies.`,
        bg: 'var(--st-neutral-bg)',
        fg: 'var(--st-neutral-fg)',
        icon: 'info',
        rank: 0,
      }
    }
    if (l.status) {
      const inv = INV_STYLE[l.status]
      return {
        label: l.status,
        title: l.committedTo !== '—' ? `${l.status} — committed to ${l.committedTo}` : l.status,
        bg: inv.bg === 'transparent' ? 'var(--st-in-bg)' : inv.bg,
        fg: inv.bg === 'transparent' ? 'var(--st-in-fg)' : inv.fg,
        icon: inv.icon,
        rank: l.status === 'In Stock' ? 0 : 3,
      }
    }
    const v: AvailabilityVerdict | undefined = conflictSummary.verdictByLineId.get(l.id)
    if (v === undefined) {
      return {
        label: 'Not checked',
        title: 'No availability answer for this line',
        bg: 'var(--st-neutral-bg)',
        fg: 'var(--st-neutral-fg)',
        icon: 'info',
        rank: 1,
      }
    }
    const t = STATUS[v.tone]
    return {
      label: v.label,
      title: v.detail,
      bg: t.bg,
      fg: t.fg,
      icon: v.icon,
      rank: v.level === 'available' ? 0 : v.level === 'unknown' ? 1 : v.level === 'partial' ? 2 : 3,
    }
  }

  const renderEquipmentRow = (
    l: Line,
    child: boolean,
    groupLabel: string,
    menuItems?: Array<{ label: string; icon: IconName; onClick: () => void }>,
  ) => {
    const pill = linePill(l)
    const intelRow = l.productId ? liveEquipment?.find((candidate) => candidate.productKey === l.productId) : undefined
    return (
      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 260, paddingLeft: child ? 26 : 9 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            {child && (
              <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)', flexShrink: 0 }}>
                └
              </span>
            )}
            {intelRow && l.productId ? (
              <IntelCard
                glance={newRentalEquipmentGlance(intelRow)}
                detail={newRentalEquipmentDetail(intelRow)}
                detailTitle={l.name}
                entityType="equipment"
                entityId={l.productId}
                context="new-rental"
                gateContext={gctx}
                actionContext={user ? { userId: user.id, role: user.role } : null}
              >
                <span
                  data-intel-identifier
                  className="identifier"
                  style={{
                    fontSize: child ? 'var(--t-meta)' : 'var(--t-ui)',
                    fontWeight: 600,
                    color: 'var(--link)',
                    lineHeight: 1.25,
                  }}
                >
                  {child && <span style={srOnly}>Part of {groupLabel}: </span>}
                  {l.name}
                </span>
              </IntelCard>
            ) : (
              <span
                style={{
                  fontSize: child ? 'var(--t-meta)' : 'var(--t-ui)',
                  fontWeight: 600,
                  color: 'var(--text)',
                  lineHeight: 1.25,
                }}
              >
                {child && <span style={srOnly}>Part of {groupLabel}: </span>}
                {l.name}
              </span>
            )}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 1,
              fontSize: 'var(--t-th)',
              color: 'var(--text2)',
              flexWrap: 'wrap',
            }}
          >
            {l.lineType === 'Sub-rental' ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '1px 6px',
                  borderRadius: 'var(--r-badge)',
                  background: 'var(--gold-soft, rgba(217, 119, 6, 0.15))',
                  color: 'var(--gold, #d97706)',
                  fontWeight: 700,
                  fontSize: 'var(--t-th)',
                }}
              >
                <Icon name="box" size={10} />
                Sub-rental
              </span>
            ) : l.lineType === 'Service' || l.lineType === 'Manual item' ? (
              <span>{l.lineType}</span>
            ) : l.serial !== '—' ? (
              <Link
                className="identifier"
                to={`/inventory/${l.serial}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
                title={`Open unit ${l.serial} in Inventory`}
              >
                {l.serial}
              </Link>
            ) : (
              <span>Bulk stock — no serial</span>
            )}
            <span aria-hidden style={{ opacity: 0.5 }}>
              ·
            </span>
            <span>{l.location}</span>
            {l.bundleName && !child && (
              <span
                title={`Added as part of the ${l.bundleName} bundle`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '0 5px',
                  borderRadius: 'var(--r-badge)',
                  background: 'var(--st-primary-bg)',
                  color: 'var(--st-primary-fg)',
                  fontWeight: 700,
                }}
              >
                <Icon name="package" size={10} />
                {l.bundleName}
              </span>
            )}
          </span>
        </td>
        <td style={{ ...td, color: 'var(--text2)' }}>{l.category}</td>
        <td style={{ ...td, textAlign: 'right' }} title={l.serial !== '—' ? 'One serialized unit per row' : undefined}>
          <NumberStepper
            value={l.qty}
            disabled={readOnly || l.serial !== '—'}
            label={`quantity for ${l.name}`}
            onChange={(n) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, qty: n } : x)))}
          />
        </td>
        <td style={{ ...td, textAlign: 'right' }}>
          <NumberStepper
            value={l.days}
            disabled={readOnly}
            label={`days for ${l.name}`}
            onChange={(n) =>
              setLines((p) => p.map((x) => (x.id === l.id ? { ...x, days: n, daysOverridden: true } : x)))
            }
          />
        </td>
        {canBookingMoney && (
          <>
            <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>
              {formatMoney(l.ratePaisa)}
            </td>
            <td style={{ ...td, textAlign: 'right' }}>
              {l.discountPct > 0 ? (
                <span
                  className="figure"
                  title={`${l.discountPct}% line discount`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 18,
                    padding: '0 6px',
                    borderRadius: 'var(--r-badge)',
                    background: 'var(--st-neutral-bg)',
                    color: 'var(--st-neutral-fg)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 700,
                  }}
                >
                  −{l.discountPct}%
                </span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>—</span>
              )}
            </td>
            <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
              {formatMoney(lineAmountPaisa(l))}
            </td>
          </>
        )}
        <td style={td}>
          <span
            title={pill.title}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--r-badge)',
              fontSize: 'var(--t-th)',
              fontWeight: 700,
              background: pill.bg,
              color: pill.fg,
            }}
          >
            <Icon name={pill.icon} size={11} />
            {pill.label}
          </span>
        </td>
        <td style={{ ...td, width: 34, textAlign: 'right' }}>
          {!readOnly && (
            menuItems ? (
              <RowMenu label={`Actions for ${l.name}`} items={menuItems} />
            ) : (
              <button
                type="button"
                className="press"
                aria-label={`Remove ${l.name} from this booking`}
                title={`Remove ${l.name}`}
                onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                style={{
                  position: 'relative',
                  width: 26,
                  height: 26,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 'var(--r-xs)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <TouchInset />
                <Icon name="close" size={13} />
              </button>
            )
          )}
        </td>
      </tr>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="new-rental-empty-products">
        <Icon name="box" size={22} />
        <p>Search above to add equipment or a bundle.</p>
      </div>
    )
  }

  return (
    <>
      <DataTableShell ariaLabel="Booking equipment and bundles">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ background: 'var(--th-bg)' }}>
              {equipmentColumns.map((c, i) => (
                <th key={c.key || `col-${i}`} scope="col" style={{ ...th, textAlign: c.align }}>
                  {c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineGroups.map((g) => {
              const nested = isNested(g)
              const isCollapsed = Boolean(collapsedBundles[g.key])
              const groupUnits = g.lines.reduce((s, l) => s + l.qty, 0)
              const dayValues = Array.from(new Set(g.lines.map((l) => l.days)))
              const minDays = Math.min(...dayValues)
              const maxDays = Math.max(...dayValues)
              const groupAmountPaisa = g.lines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa
              const parentPill = g.lines
                .map(linePill)
                .reduce((worst, x) => (x.rank > worst.rank ? x : worst))
              const menuItems = [
                {
                  label: nested ? `Remove all ${g.lines.length} lines` : 'Remove from this booking',
                  icon: 'close' as IconName,
                  onClick: () => setLines((p) => p.filter((x) => !g.lines.some((y) => y.id === x.id))),
                },
                ...(!nested && g.lines[0] && g.lines[0].serial !== '—'
                  ? [
                      {
                        label: 'Open in Inventory',
                        icon: 'external_link' as IconName,
                        onClick: () => navigate(`/inventory/${g.lines[0]?.serial ?? ''}`),
                      },
                    ]
                  : []),
              ]

              return (
                <Fragment key={g.key}>
                  {nested ? (
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                      <td style={{ ...td, whiteSpace: 'normal', maxWidth: 260 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="new-rental-bundle-toggle press"
                            onClick={() => setCollapsedBundles((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                            aria-label={isCollapsed ? `Expand ${g.label}` : `Collapse ${g.label}`}
                            aria-expanded={!isCollapsed}
                            title={isCollapsed ? 'Expand components' : 'Collapse components'}
                            style={{ position: 'relative' }}
                          >
                            <TouchInset />
                            <Icon name={isCollapsed ? 'chevron_right' : 'chevron_down'} size={12} />
                          </button>
                          <Icon
                            name={g.kind === 'bundle' ? 'package' : 'box'}
                            size={13}
                            style={{ color: 'var(--text2)', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25 }}>
                            {g.label}
                          </span>
                        </span>
                        <span style={{ display: 'block', marginTop: 1, marginLeft: 28, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                          {g.kind === 'bundle'
                            ? `Bundle · ${g.lines.length} component${g.lines.length === 1 ? '' : 's'}${isCollapsed ? ' (collapsed)' : ''}`
                            : `${g.lines.length} units${isCollapsed ? ' (collapsed)' : ''}`}
                        </span>
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{g.lines[0]?.category ?? '—'}</td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {groupUnits}
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {minDays === maxDays ? minDays : `${minDays}–${maxDays}`}
                      </td>
                      {canBookingMoney && (
                        <>
                          <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>—</td>
                          <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>—</td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(groupAmountPaisa)}
                          </td>
                        </>
                      )}
                      <td style={td}>
                        <span
                          title={parentPill.title}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--sp-xs)',
                            height: 20,
                            padding: '0 7px',
                            borderRadius: 'var(--r-badge)',
                            fontSize: 'var(--t-th)',
                            fontWeight: 700,
                            background: parentPill.bg,
                            color: parentPill.fg,
                          }}
                        >
                          <Icon name={parentPill.icon} size={11} />
                          {parentPill.label}
                        </span>
                      </td>
                      <td style={{ ...td, width: 34, textAlign: 'right' }}>
                        {!readOnly && <RowMenu label={`Actions for ${g.label}`} items={menuItems} />}
                      </td>
                    </tr>
                  ) : null}
                  {(!nested || !isCollapsed) &&
                    g.lines.map((l) => renderEquipmentRow(l, nested, g.label, nested ? undefined : menuItems))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </DataTableShell>

      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-lg)',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          marginTop: 10,
          paddingTop: 9,
          borderTop: '1px solid var(--border)',
          fontSize: 'var(--t-meta)',
        }}
      >
        {[
          { l: 'Items', v: lines.length === 0 ? '—' : `${totalUnits}` },
          { l: 'Bundles', v: bundleCount === 0 ? '—' : String(bundleCount) },
          { l: 'Rental Days', v: days === 0 ? '—' : String(days) },
        ].map((x) => (
          <span key={x.l} style={{ display: 'inline-flex', gap: 5 }}>
            <span style={{ color: 'var(--text2)' }}>{x.l}</span>
            <span className="figure" style={{ fontWeight: 700, color: x.v === '—' ? 'var(--muted)' : 'var(--text)' }}>
              {x.v}
            </span>
          </span>
        ))}
        {canBookingMoney && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 7, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text2)' }}>Line Subtotal</span>
            <span className="figure" style={{ fontWeight: 700, fontSize: 'var(--t-ui)' }}>
              {formatMoney(
                (pricing.equipmentSubtotalPaisa + pricing.bundleSubtotalPaisa + pricing.servicesSubtotalPaisa) as Paisa,
              )}
            </span>
          </span>
        )}
      </div>
    </>
  )
}
