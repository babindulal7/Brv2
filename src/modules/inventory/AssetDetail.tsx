import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { EditableRows } from '../../components/ui/EditableRows'
import { EmptyState } from '../../components/ui/StateViews'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewUtilization } from '../../lib/fieldGating'
import { useEditMode } from '../../lib/edit/useEditMode'
import type { FieldSpec } from '../../lib/edit/useEditMode'
import { formatMoney } from '../../lib/money'
import { formatAd } from '../../lib/bs'
import { PARENTS, CONDITIONS } from '../../data/inventory'
import type { ChildRow, InvStatus } from '../../data/inventory'

const INV_STATUSES: InvStatus[] = [
  'In Stock', 'Reserved', 'Packed', 'On Rent', 'Returning',
  'Inspection', 'Cleaning', 'Maintenance', 'Missing', 'Retired',
]

const UNIT_FIELDS: FieldSpec[] = [
  /* §3 — the serial is the one field the floor loop cannot work without: a unit
     without it cannot be scanned at Packing and cannot be told from its
     siblings. Uniqueness is checked system-wide at Add Equipment; this only
     refuses emptying it, which is the failure this screen can cause. */
  { key: 'serial', validate: (v) => (String(v ?? '').trim() ? null : 'A unit without a serial cannot be scanned at Packing.') },
  { key: 'assetTag' },
  /* §2.1 — status and location move together. A unit marked On Rent that still
     claims a shelf, or moved to a bay while still Packed, is exactly the
     halfway state per-field saving would otherwise persist. */
  {
    key: 'status',
    group: 'placement',
    validate: (v) => (INV_STATUSES.includes(String(v) as InvStatus) ? null : `Status must be one of: ${INV_STATUSES.join(', ')}.`),
  },
  { key: 'location', group: 'placement', validate: (v) => (String(v ?? '').trim() ? null : 'The floor has to be able to find it.') },
  {
    key: 'condition',
    validate: (v) => (CONDITIONS.includes(String(v) as (typeof CONDITIONS)[number]) ? null : `Condition must be one of: ${CONDITIONS.join(', ')}.`),
  },
  /* §2.2 / §3.3 — Σ child replacement must equal the parent's. Editing one
     child here would silently break that invariant, so the correction lives
     where the sum is recomputed. */
  { key: 'replacement', immutable: 'Replacement value sums to the parent SKU (§3.3). Change it on the parent record, not the unit.' },
]

/**
 * Inline edit for one unit.
 *
 * A component per row rather than one hook for the table: `useEditMode` holds a
 * draft for **one** record, and a table-wide instance would make the drafts of
 * two half-edited units share a namespace. One row, one hook, one draft.
 */
function UnitEditor({ unit, onDone }: { unit: ChildRow; onDone: () => void }) {
  const [draft, setDraft] = useState<ChildRow>(unit)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const record = useMemo(() => ({ ...draft }) as Record<string, unknown>, [draft])
  const onSave = useCallback(async (patch: Record<string, unknown>) => {
    /* Seed data, and every action under `src/actions/` is still a stub — see
       the same note on `ClientDetail`. The edit lands in this component. */
    setDraft((d) => ({ ...d, ...patch }) as ChildRow)
  }, [])

  const edit = useEditMode({ record, fields: UNIT_FIELDS, onSave })

  /* The panel only exists because someone pressed Edit on this row, so it opens
     unlocked. `startEditing` is idempotent; the empty deps keep it to mount. */
  const { startEditing } = edit
  useEffect(() => {
    startEditing()
  }, [startEditing])

  return (
    <div style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
        <strong style={{ fontSize: 'var(--t-ui)' }}>Editing unit {unit.serial}</strong>
        <Button
          variant="ghost"
          icon="close"
          onClick={() => {
            const outcome = edit.stopEditing()
            if (!outcome.ok) {
              setLeaveError(`Unsaved: ${outcome.unsaved.join(', ')}. Save or cancel each before closing.`)
              return
            }
            setLeaveError(null)
            onDone()
          }}
        >
          Close
        </Button>
      </div>

      {leaveError && (
        <span role="alert" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
          <Icon name="alert_triangle" size={12} />
          {leaveError}
        </span>
      )}

      <EditableRows
        edit={edit}
        rows={[
          { key: 'serial', label: 'Manufacturer serial', value: draft.serial },
          { key: 'assetTag', label: 'Asset tag', value: draft.assetTag ?? '—', hint: 'The physical tag, distinct from the manufacturer serial.' },
          { key: 'status', label: 'Status', value: draft.status, hint: 'Saves together with Location.' },
          { key: 'location', label: 'Location', value: draft.location, hint: 'Saves together with Status.' },
          { key: 'condition', label: 'Condition', value: draft.condition, hint: CONDITIONS.join(' · ') },
          { key: 'replacement', label: 'Replacement value', value: formatMoney(draft.replacement) },
        ]}
      />

      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        <Icon name="info" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
        Editing this session only — unit records are not persisted yet.
      </span>
    </div>
  )
}

type AssetTab = 'Units' | 'Timeline' | 'Maintenance' | 'Money' | 'Documents' | 'Activity'

export default function AssetDetail() {
  const { assetId } = useParams<{ assetId?: string }>()
  const navigate = useNavigate()
  /*
   * Was `user?.role === ('technician' as any)` — a lowercase literal forced
   * past the type checker because SystemRole is Title Case, so the real
   * runtime value ('Technician') never matched and this comparison was always
   * false. Beyond the case bug, it also only checked for Technician, not the
   * full money-blind set (Warehouse/Driver/Client also shouldn't see this
   * page's Money tab). useCanViewMoney() is the one gate every other money
   * check in the app uses; this page should not have had its own.
   */
  const money = useCanViewMoney()
  const { user } = useAuth()
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  // HIS v2.1 §2 — "Utilization... visible to Manager+; hidden from floor",
  // the same rule fieldGating.ts's canViewUtilization already applies. This
  // tile rendered unconditionally before, including a fabricated "78%" for
  // every unseeded asset — both the visibility gap and the invented number
  // are fixed together since they're the same line.
  const utilization = canViewUtilization(gctx)

  const [activeTab, setActiveTab] = useState<AssetTab>('Units')
  /*
    Spec 7.5 names two layout changes for this screen — "TABLET: rail drops
    beneath the photos. PHONE: segmented [Units][History][Finance][Service]" —
    and the file had no width read at all, so every `repeat(N, 1fr)` below put
    up to four cards side by side on a 375px phone. `cols()` clamps each band
    the way `KpiStrip` already does (Page.tsx:212): 2 at phone, 3 at tablet.
    The tab strip below IS the segmented control; it only needed to scroll
    rather than squash, and to meet the 44px floor.
  */
  const viewport = useViewport()
  const cols = (n: number) => (viewport === 'phone' ? Math.min(n, 2) : viewport === 'tablet' ? Math.min(n, 3) : n)
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set(['SN-FX3-001', 'SN-FX3-002']))
  const [selectedUnitForQr, setSelectedUnitForQr] = useState<string | null>(null)
  /** Serial of the unit whose inline editor is open, or null. One at a time. */
  const [editingUnit, setEditingUnit] = useState<string | null>(null)

  const asset = PARENTS.find(p => p.code === assetId || p.children?.some(c => c.serial === assetId))

  // §6 — "A blank page is never acceptable... a screen showing the wrong
  // record is a defect the same way." This used to fall back to PARENTS[0]
  // (Sony FX3) for ANY unmatched assetId and render it as if it were the
  // requested asset — every link built from a code/serial this seed data
  // doesn't happen to contain (a booking's own equipment list, a document's
  // relatedTo, a case's linked equipment) landed here silently wrong instead
  // of visibly not-found.
  if (!asset) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px' }}>
        <EmptyState
          title="Equipment not found"
          description={`No asset matches "${assetId}" in the current inventory. It may have been retired, or the reference may be out of date.`}
          actionLabel="Browse Inventory"
          onAction={() => navigate('/inventory')}
        />
      </div>
    )
  }

  const toggleUnit = (serial: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      if (next.has(serial)) next.delete(serial)
      else next.add(serial)
      return next
    })
  }

  const availableCount = asset?.children?.filter(c => c.status === 'In Stock').length ?? 3
  const totalUnits = asset?.children?.length ?? 5
  const isSubRented = asset?.isSubRented ?? false

  const tabs: AssetTab[] = [
    'Units',
    'Timeline',
    'Maintenance',
    ...(money ? ['Money' as const] : []),
    'Documents',
    'Activity',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>
      {/* Breadcrumbs & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Link to="/inventory" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Inventory</Link>
          <span>›</span>
          <span style={{ color: 'var(--text2)' }}>{asset?.category}</span>
          <span>›</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{asset?.name}</span>
          <span
            className="identifier"
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              fontSize: 'var(--t-th)',
              color: 'var(--nav-active-accent)',
            }}
          >
            {asset?.code ?? 'EQ000234'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="secondary" icon="download" onClick={() => setSelectedUnitForQr(asset?.children?.[0]?.serial ?? 'SN-FX3-001')}>
            Print Labels
          </Button>
          <Button variant="primary" icon="checklist" onClick={() => navigate('/rentals/new')}>
            Book Asset
          </Button>
        </div>
      </div>

      {/* Hero Header Block */}
      <div
        style={{
          ...cardStyle,
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
          border: isSubRented ? '2px solid var(--orange-text)' : '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 10,
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            {asset?.image ? (
              <img src={asset?.image} alt={asset?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Icon name="box" size={36} style={{ color: 'var(--muted)' }} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)' }}>
                {asset?.name}
              </h1>
              {isSubRented && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--orange-bg, rgba(234,88,12,0.1))',
                    border: '1px solid var(--orange-text)',
                    color: 'var(--orange-text)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 700,
                  }}
                >
                  External Sub-Rental
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>Brand: <strong style={{ color: 'var(--text)' }}>{asset?.brand ?? 'Sony'}</strong></span>
              <span>·</span>
              <span>Category: <strong style={{ color: 'var(--text)' }}>{asset?.category}</strong></span>
              <span>·</span>
              <span className="identifier" style={{ color: 'var(--nav-active-accent)' }}>{asset?.code ?? 'EQ000234'}</span>
            </div>
          </div>
        </div>

        {/* Derived Availability Ratio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)', background: 'var(--card2)', padding: '10px 18px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Live Availability
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success-text)' }}>
                {availableCount}
              </span>
              <span style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>/</span>
              <span className="figure" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
                {totalUnits} Units
              </span>
            </div>
          </div>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 'var(--r-badge)',
              background: availableCount > 0 ? 'var(--success-text)' : 'var(--danger-text)',
            }}
          />
        </div>
      </div>

      {/* Answer Strip: 4 Figures (No donuts) */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols(2 + (utilization ? 1 : 0) + (money ? 1 : 0))}, minmax(0,1fr))`, gap: 14 }}>
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>AVAILABLE NOW</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 'var(--sp-xs)' }}>
            {availableCount} of {totalUnits}
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>In Kathmandu HQ</div>
        </div>

        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>NEXT FREE</div>
          <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--nav-active-accent)', marginTop: 'var(--sp-xs)' }}>
            Tomorrow 14:00
          </div>
          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>SN-FX3-004 returning</div>
        </div>

        {utilization && (
          <div style={{ ...cardStyle, padding: '14px 16px' }}>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>UTILISATION (90D)</div>
            {asset?.utilizationPct !== undefined ? (
              <>
                <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>
                  {asset.utilizationPct}%
                </div>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>70 shoot days</div>
              </>
            ) : (
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                Not available — needs the utilization engine (TODO(decision), PLAN.md §4)
              </div>
            )}
          </div>
        )}

        {money && (
          <div style={{ ...cardStyle, padding: '14px 16px' }}>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>RECOVERY %</div>
            {asset?.recoveryPct !== undefined ? (
              <>
                <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 'var(--sp-xs)' }}>
                  {asset.recoveryPct}%
                </div>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>Paid for itself 14 Nov 2025</div>
              </>
            ) : (
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                Not available (TODO(decision), PLAN.md §4)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-sm)', overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
        {tabs.map(t => {
          const active = activeTab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              style={{
                // Law 15 — this strip is the record's only section switch, and
                // below 768 it is the segmented control spec 7.5 draws.
                minHeight: 44,
                flexShrink: 0,
                padding: '0 16px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: active ? 'var(--card2)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text2)',
                fontWeight: active ? 700 : 500,
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* Tab 1: Units */}
      {activeTab === 'Units' && (
        <Card title="Fleet Units & Serial Records">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {viewport === 'phone' ? (
              /* Shell rule, repeated at the top of every spec: "Tables become
                 card rows below 768." Nine columns do not survive 375px as a
                 table; each unit becomes one card carrying the same facts and
                 the same two actions, with the editor and the accessory
                 checklist opening in place exactly as they do in the table. */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {asset?.children?.map((u) => (
                  <article key={u.serial} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>{u.serial}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{u.status}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: u.condition === 'Excellent' ? 'var(--st-in-bg)' : 'var(--card2)', color: u.condition === 'Excellent' ? 'var(--success-text)' : 'var(--text2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', fontWeight: 600 }}>{u.condition}</span>
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{u.location}</div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      <span className="identifier">{u.assetTag ?? 'EQ000234-01'}</span>
                      {' · '}
                      {u.lastSeen ? `Last seen ${formatAd(u.lastSeen)}` : 'Last seen —'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button variant="ghost" onClick={() => setSelectedUnitForQr(u.serial)}>Label</Button>
                      <Button variant="ghost" onClick={() => setEditingUnit((v) => (v === u.serial ? null : u.serial))}>
                        {editingUnit === u.serial ? 'Close' : 'Edit'}
                      </Button>
                    </div>
                    {editingUnit === u.serial && <UnitEditor unit={u} onDone={() => setEditingUnit(null)} />}
                  </article>
                ))}
              </div>
            ) : (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)', minWidth: viewport === 'tablet' ? 720 : 900 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px', width: 30 }} />
                  <th style={{ padding: '8px' }}>Serial Number</th>
                  <th style={{ padding: '8px' }}>Asset Tag</th>
                  <th style={{ padding: '8px' }}>Condition</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Location</th>
                  <th style={{ padding: '8px' }}>Usage / Rentals</th>
                  <th style={{ padding: '8px' }}>Last Seen</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {asset?.children?.map(u => {
                  const expanded = expandedUnits.has(u.serial)
                  return (
                    <Fragment key={u.serial}>
                      <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <button
                            type="button"
                            onClick={() => toggleUnit(u.serial)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                          >
                            <Icon name={expanded ? 'arrow_down' : 'arrow_right'} size={12} />
                          </button>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className="identifier" style={{ fontWeight: 600, color: 'var(--text)' }}>
                            {u.serial}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className="identifier" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                            {u.assetTag ?? 'EQ000234-01'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: u.condition === 'Excellent' ? 'var(--st-in-bg)' : 'var(--card2)',
                              color: u.condition === 'Excellent' ? 'var(--success-text)' : 'var(--text2)',
                              border: '1px solid var(--border)',
                              fontSize: 'var(--t-th)',
                              fontWeight: 600,
                            }}
                          >
                            {u.condition}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{u.status}</span>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                          {u.location}
                        </td>
                        {/* No unit carries metered hours, a run count or a last
                            scan yet. These used to fall back to `120h`, `24 runs`
                            and `Today 09:12`, which reads as a measurement and is
                            not one — an em dash says "not recorded" honestly. */}
                        <td style={{ padding: '10px 8px' }}>
                          {u.usageHours === undefined && u.rentalCount === undefined ? (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          ) : (
                            <>
                              <span className="figure">{u.usageHours ?? '—'}h</span>
                              <span style={{ color: 'var(--muted)' }}> · {u.rentalCount ?? '—'} runs</span>
                            </>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          {u.lastSeen ? formatAd(u.lastSeen) : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button variant="ghost" onClick={() => setSelectedUnitForQr(u.serial)}>Label</Button>
                            {/* Was `navigate('/inventory')` — a button labelled
                                Edit that returned to the list and edited
                                nothing. It now opens the unit's fields. */}
                            <Button variant="ghost" onClick={() => setEditingUnit((s) => (s === u.serial ? null : u.serial))}>
                              {editingUnit === u.serial ? 'Close' : 'Edit'}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {editingUnit === u.serial && (
                        <tr key={`${u.serial}-edit`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                          <td />
                          <td colSpan={8} style={{ padding: '8px 12px 14px' }}>
                            <UnitEditor unit={u} onDone={() => setEditingUnit(null)} />
                          </td>
                        </tr>
                      )}

                      {/* Expandable Child Accessories Checklist */}
                      {expanded && (
                        <tr key={`${u.serial}-child`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                          <td />
                          <td colSpan={8} style={{ padding: '8px 12px 14px' }}>
                            <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                              Child Accessories Checklist (Ticked during Packing & Return QC)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                              {(u.childAccessories ?? [
                                { id: 'ca-1', name: 'XLR Top Handle Unit', quantity: 1, required: true },
                                { id: 'ca-2', name: 'NP-FZ100 Battery (x2)', quantity: 2, required: true },
                                { id: 'ca-3', name: 'Body Cap & Sensor Protector', quantity: 1, required: true },
                                { id: 'ca-4', name: 'BC-QZ1 Dual Charger', quantity: 1, required: true },
                              ]).map(ca => (
                                <span
                                  key={ca.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 10px',
                                    borderRadius: 'var(--r-xs)',
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    fontSize: 'var(--t-meta)',
                                  }}
                                >
                                  <Icon name="check" size={12} style={{ color: 'var(--success-text)' }} />
                                  <span>{ca.name}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 2: Timeline */}
      {activeTab === 'Timeline' && (
        <Card title="Gantt Timeline — Availability & Bookings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Horizontal visual timeline per unit. Maintenance blocks render in the same lane to lock availability.
            </p>
            {asset?.children?.map(u => (
              <div key={u.serial} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="identifier" style={{ width: 120, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  {u.serial}
                </span>
                <div style={{ flex: 1, height: 32, borderRadius: 'var(--r-xs)', background: 'var(--card2)', position: 'relative', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                  {u.status === 'On Rent' && (
                    <div style={{ height: 24, width: '40%', borderRadius: 4, background: 'var(--orange-bg, rgba(234,88,12,0.2))', border: '1px solid var(--orange-text)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 'var(--t-th)', color: 'var(--orange-text)', fontWeight: 600 }}>
                      On Rent · B-189 (Vision Prod)
                    </div>
                  )}
                  {u.status === 'Reserved' && (
                    <div style={{ height: 24, width: '35%', marginLeft: '30%', borderRadius: 4, background: 'var(--st-progress-bg)', border: '1px solid var(--nav-active-accent)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 'var(--t-th)', color: 'var(--nav-active-accent)', fontWeight: 600 }}>
                      Reserved · B-195 (10-14 Aug)
                    </div>
                  )}
                  {u.status === 'In Stock' && (
                    <div style={{ height: 24, width: '100%', borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 'var(--t-th)', color: 'var(--success-text)', fontWeight: 600 }}>
                      ✓ Free & Ready in Kathmandu HQ
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 3: Maintenance */}
      {activeTab === 'Maintenance' && (
        <Card title="Service & Maintenance Record">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            {(asset?.lastServiceAd || asset?.nextServiceDueAd || asset?.maintenanceTicketsOpen !== undefined || asset?.damageCasesOpen !== undefined) && (
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                {asset?.lastServiceAd && (
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>LAST SERVICE</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, marginTop: 2 }}>{asset.lastServiceAd}</div>
                  </div>
                )}
                {asset?.nextServiceDueAd && (
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>NEXT DUE</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, marginTop: 2 }}>{asset.nextServiceDueAd}</div>
                  </div>
                )}
                {asset?.maintenanceTicketsOpen !== undefined && (
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>TICKETS OPEN</div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: asset.maintenanceTicketsOpen > 0 ? 'var(--danger-text)' : 'var(--text)', fontWeight: 600, marginTop: 2 }}>{asset.maintenanceTicketsOpen}</div>
                  </div>
                )}
                {asset?.damageCasesOpen !== undefined && (
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>DAMAGE CASES OPEN</div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: asset.damageCasesOpen > 0 ? 'var(--danger-text)' : 'var(--text)', fontWeight: 600, marginTop: 2 }}>{asset.damageCasesOpen}</div>
                  </div>
                )}
              </div>
            )}

            {asset?.serviceHistory?.length && viewport === 'phone' ? (
              /* Shell rule — seven columns become one card per service event. */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {asset.serviceHistory.map((m, i) => (
                  <article key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700 }}>{m.type}</span>
                      <span className="identifier" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>{m.unit}</span>
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{m.details}</div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      {m.dateAd} · {m.downtime} · {m.tech}
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>{formatMoney(m.costPaisa)}</div>
                  </article>
                ))}
              </div>
            ) : asset?.serviceHistory?.length ? (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)', minWidth: viewport === 'tablet' ? 640 : 760 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '8px' }}>Date</th>
                    <th style={{ padding: '8px' }}>Unit</th>
                    <th style={{ padding: '8px' }}>Type</th>
                    <th style={{ padding: '8px' }}>Service Details</th>
                    <th style={{ padding: '8px' }}>Downtime</th>
                    <th style={{ padding: '8px' }}>Cost</th>
                    <th style={{ padding: '8px' }}>Technician</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.serviceHistory.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{m.dateAd}</td>
                      <td style={{ padding: '10px 8px' }}><span className="identifier">{m.unit}</span></td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{m.type}</td>
                      <td style={{ padding: '10px 8px' }}>{m.details}</td>
                      <td style={{ padding: '10px 8px' }}>{m.downtime}</td>
                      <td style={{ padding: '10px 8px' }} className="figure">{formatMoney(m.costPaisa)}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{m.tech}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                No per-event service history recorded for this asset — needs a service-ticket engine (TODO(decision), PLAN.md §4.9).
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 4: Money (Omitted for Floor Roles) */}
      {activeTab === 'Money' && money && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols(4)}, minmax(0,1fr))`, gap: 14 }}>
            <div style={{ ...cardStyle, padding: 'var(--sp-lg)' }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>PURCHASE PRICE</div>
              {asset?.purchasePricePaisa !== undefined ? (
                <>
                  <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 'var(--sp-xs)' }}>{formatMoney(asset.purchasePricePaisa)}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>As recorded at intake</div>
                </>
              ) : (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>Not on record for this asset</div>
              )}
            </div>
            <div style={{ ...cardStyle, padding: 'var(--sp-lg)' }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>LIFETIME EARNINGS</div>
              {asset?.lifetimeEarningsPaisa !== undefined ? (
                <>
                  <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success-text)', marginTop: 'var(--sp-xs)' }}>{formatMoney(asset.lifetimeEarningsPaisa)}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Across {totalUnits} unit{totalUnits === 1 ? '' : 's'}</div>
                </>
              ) : (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                  Not available — needs the revenue engine (TODO(decision), PLAN.md §4.9)
                </div>
              )}
            </div>
            <div style={{ ...cardStyle, padding: 'var(--sp-lg)' }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>RECOVERY %</div>
              {asset?.recoveryPct !== undefined ? (
                <>
                  <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 'var(--sp-xs)' }}>{asset.recoveryPct}%</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Net ROI: {asset.recoveryPct - 100 >= 0 ? '+' : ''}{asset.recoveryPct - 100}%</div>
                </>
              ) : (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>Not available (TODO(decision), PLAN.md §4)</div>
              )}
            </div>
            <div style={{ ...cardStyle, padding: 'var(--sp-lg)' }}>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>REPAIRS TO DATE</div>
              {asset?.repairsToDatePaisa !== undefined ? (
                <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--danger-text)', marginTop: 'var(--sp-xs)' }}>{formatMoney(asset.repairsToDatePaisa)}</div>
              ) : (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                  Not available — needs a maintenance-cost engine (TODO(decision), PLAN.md §4.9)
                </div>
              )}
            </div>
          </div>

          <Card title="Monthly Fleet Revenue Progression">
            <div style={{ padding: '12px 4px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Not available — needs the revenue engine (TODO(decision), PLAN.md §4.9)
            </div>
          </Card>
        </div>
      )}

      {/* Tab 5: Documents */}
      {activeTab === 'Documents' && (
        <Card title="Asset Documents & Certificates">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols(3)}, minmax(0,1fr))`, gap: 14 }}>
            {[
              { name: 'Original Purchase Invoice (Tax VAT)', size: '1.4 MB', date: '15 Jun 2025' },
              { name: 'Sony Alpha Official Warranty Card', size: '820 KB', date: '15 Jun 2025' },
              { name: 'Sagarmatha Insurance Policy Schedule', size: '2.1 MB', date: '01 Jul 2026' },
              { name: 'Sony FX3 User Operating Manual (PDF)', size: '4.8 MB', date: '15 Jun 2025' },
              { name: 'Intake Inspection & QC Photos', size: '12.4 MB', date: '16 Jun 2025' },
            ].map((doc, i) => (
              <div key={i} style={{ padding: 'var(--sp-md)', borderRadius: 'var(--r-sm)', background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
                <Icon name="file" size={24} style={{ color: 'var(--nav-active-accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{doc.size} · {doc.date}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 6: Activity DNA */}
      {activeTab === 'Activity' && (
        <Card title="Immutable Asset DNA (Activity Log)">
          {asset?.activityLog?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              {asset.activityLog.map((log, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-md)', paddingBottom: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 'var(--r-badge)',
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--nav-active-accent)',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <Icon name="error" size={12} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{log.event}</span>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{log.whenAd}</span>
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>{log.note}</div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>Recorded by {log.by}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              No activity recorded for this asset — needs an audit-log engine (TODO(decision), PLAN.md §4.9).
            </div>
          )}
        </Card>
      )}

      {/* Label Modal */}
      {selectedUnitForQr && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{ ...cardStyle, width: 400, padding: 'var(--sp-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700 }}>Print Asset QR Label</h2>
              <button
                type="button"
                onClick={() => setSelectedUnitForQr(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div style={{ padding: 20, borderRadius: 'var(--r-sm)', background: '#fff', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: 0.5 }}>BABIN RENTALS</div>
              <div style={{ width: 120, height: 120, border: '2px solid #000', display: 'grid', placeItems: 'center', padding: 'var(--sp-sm)' }}>
                <Icon name="queues" size={80} style={{ color: '#000' }} />
              </div>
              <div className="identifier" style={{ fontSize: '1rem', fontWeight: 800, color: '#000' }}>
                {selectedUnitForQr}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#444' }}>
                {asset?.name} · {asset?.code ?? 'EQ000234'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setSelectedUnitForQr(null)}>Close</Button>
              <Button variant="primary" icon="download" onClick={() => setSelectedUnitForQr(null)}>Print Label Sheet</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
