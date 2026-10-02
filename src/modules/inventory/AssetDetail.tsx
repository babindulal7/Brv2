import { RecordForm } from '../../components/records/RecordForm'
import { useSearchParams } from 'react-router-dom'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, PageHeader, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { EditableRows } from '../../components/ui/EditableRows'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { canAdjustStock } from '../../lib/rbac'
import { gateContext, canViewUtilization } from '../../lib/fieldGating'
import { useEditMode } from '../../lib/edit/useEditMode'
import type { FieldSpec } from '../../lib/edit/useEditMode'
import { formatMoney } from '../../lib/money'
import { formatAd } from '../../lib/bs'
import { useList } from '../../lib/queries/useList'
import type { ListQueryResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  getAssetDetail,
  INVENTORY_STATES,
  UNIT_CONDITIONS,
  stockLabel,
  unitLocationOf,
  INV_STYLE,
  INV_TONE,
  INV_LABEL,
  CONDITION_TONE,
  type AssetDetailRecord,
  type InventoryUnitRow,
  type InvStatus,
  type Condition,
} from '../../lib/queries/inventory'
import { Badge } from '../../components/ui/Badge'
import { ServiceDueBadge } from '../../components/ui/ServiceDueBadge'
import { ServicePlanCard } from './components/ServicePlanCard'
import { AdjustStockModal } from './AdjustStockModal'
import { readServiceDue } from '../../lib/queries/serviceDue'
import type { ServiceRow } from '../../lib/serviceDue'
import './inventory.css'

/**
 * # Asset Detail — `/inventory/:assetId`
 *
 * Resolved through `queries/inventory.getAssetDetail`, the same
 * `products_v` / `product_units_v` path the Inventory list reads (Law 2). The
 * ref in the URL is tried as an asset code, then a manufacturer serial, then an
 * asset tag — because the links that land here carry all three vocabularies
 * (StockCheck's `assetCode || serial`, the floor workspaces' serials, the
 * list's own codes).
 *
 * Before this conversion the page scanned the eight-row `PARENTS` seed and
 * printed the literal `EQ000234` on every asset because no seed row carried a
 * `code` — so the route's own primary key could never match, and every link
 * built from a database row landed on "Equipment not found".
 *
 * What the query does not provide is said out loud rather than invented: no
 * per-unit booking timeline (needs the booking-line join), no utilization or
 * revenue figures (no engine), no document links, no activity feed. Each tile
 * renders the honest "Not tracked yet" line in place of the previous
 * hardcoded literals ("Tomorrow 14:00", "78%", five invented PDFs).
 */

/* ── The fetcher `useList` runs ──────────────────────────────────────────────
 *
 * The ref travels in `chips` so `useList` re-queries when the route param
 * changes — the fetcher is held in a ref and only the filter VALUE retriggers.
 * Same shape as `useClientProfile`. The money flag travels beside it for the
 * same reason: a session whose money visibility changes must not keep showing
 * figures fetched under the other gate. At the call site the flag is
 * `useCanViewMoney()`'s value verbatim — never a literal (Law 6).
 */
async function fetchAssetDetail(filters: ListFilters): Promise<ListQueryResult<AssetDetailRecord>> {
  const ref = filters.chips?.['asset_ref']?.[0]
  if (!ref) return { rows: [], total: 0 }
  const withMoney = (filters.chips?.['with_money']?.length ?? 0) > 0
  const record = await getAssetDetail(ref, withMoney ? { withMoney: true } : {})
  return { rows: record ? [record] : [], total: record ? 1 : 0 }
}

/* ── Unit editor field rules ───────────────────────────────────────────────── */

const UNIT_FIELDS: FieldSpec[] = [
  /* `asset_tag` is the unit's NOT NULL unique key (0004:195, :233) — the one
     field the floor loop cannot work without: it is what the QR label encodes
     and what Packing scans. This only refuses emptying it, the failure this
     screen can cause. */
  { key: 'assetTag', validate: (v) => (String(v ?? '').trim() ? null : 'The asset tag is the unit’s unique key — a unit without one cannot be scanned at Packing.') },
  /* `serial_no` is NULLABLE in the schema (0004:194): a unit can be tagged
     without a manufacturer serial, so emptying it is legal. */
  { key: 'serialNo' },
  /* Status and location move together. A unit marked On Rent that still claims
     a shelf, or moved to a bay while still Packed, is exactly the halfway
     state per-field saving would otherwise persist. */
  {
    key: 'state',
    group: 'placement',
    validate: (v) =>
      INVENTORY_STATES.includes(String(v) as (typeof INVENTORY_STATES)[number])
        ? null
        : `Status must be one of: ${INVENTORY_STATES.join(', ')}.`,
  },
  { key: 'rack', group: 'placement' },
  { key: 'shelf', group: 'placement' },
  { key: 'bin', group: 'placement' },
  {
    key: 'condition',
    validate: (v) =>
      UNIT_CONDITIONS.includes(String(v) as (typeof UNIT_CONDITIONS)[number])
        ? null
        : `Condition must be one of: ${UNIT_CONDITIONS.join(', ')}.`,
  },
  /* Money column on the unit record — set at intake, never corrected inline. */
  { key: 'replacementValue', immutable: 'Replacement value is recorded at intake and corrected there, not on the shelf.' },
]

/** The editable slice of a unit, as strings — what the inputs hold. */
interface UnitDraft {
  assetTag: string
  serialNo: string
  state: string
  rack: string
  shelf: string
  bin: string
  condition: string
}

/**
 * Inline edit for one unit.
 *
 * A component per row rather than one hook for the table: `useEditMode` holds a
 * draft for **one** record, and a table-wide instance would make the drafts of
 * two half-edited units share a namespace. One row, one hook, one draft.
 */
function UnitEditor({ unit, money, onDone }: { unit: InventoryUnitRow; money: boolean; onDone: () => void }) {
  const [draft, setDraft] = useState<UnitDraft>(() => ({
    assetTag: unit.assetTag,
    serialNo: unit.serialNo ?? '',
    state: unit.state,
    rack: unit.rack ?? '',
    shelf: unit.shelf ?? '',
    bin: unit.bin ?? '',
    condition: unit.condition,
  }))
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const record = useMemo(() => ({ ...draft }) as Record<string, unknown>, [draft])
  const onSave = useCallback(async (patch: Record<string, unknown>) => {
    /* There is no `updateUnit` action under `src/actions/` yet, so the edit
       lands in this component and the panel says so below — never a success
       toast for a write that did not happen. */
    setDraft((d) => ({ ...d, ...patch }) as UnitDraft)
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
        <strong style={{ fontSize: 'var(--t-ui)' }}>Editing unit {unit.assetTag}</strong>
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
          { key: 'assetTag', label: 'Asset tag', value: draft.assetTag, hint: 'The unique unit key — what the QR label encodes.' },
          { key: 'serialNo', label: 'Manufacturer serial', value: draft.serialNo || '—', hint: 'Optional: a unit can be tagged without one.' },
          { key: 'state', label: 'Status', value: draft.state, hint: 'Saves together with the location fields.' },
          { key: 'rack', label: 'Rack', value: draft.rack || '—', hint: 'Saves together with Status.' },
          { key: 'shelf', label: 'Shelf', value: draft.shelf || '—' },
          { key: 'bin', label: 'Bin', value: draft.bin || '—' },
          { key: 'condition', label: 'Condition', value: draft.condition, hint: UNIT_CONDITIONS.join(' · ') },
          /* Law 6 — the replacement row is OMITTED for money-blind roles, not
             disabled or masked. It used to render `formatMoney` unconditionally,
             which was the one ungated rupee figure on this page. */
          ...(money
            ? [{
                key: 'replacementValue',
                label: 'Replacement value',
                value: unit.replacementValue !== null ? formatMoney(unit.replacementValue) : 'Not on record',
              }]
            : []),
        ]}
      />

      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        <Icon name="info" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
        Editing this session only — there is no unit-update action yet, so nothing is persisted.
      </span>
    </div>
  )
}

/* ── Small shared pieces ───────────────────────────────────────────────────── */

/**
 * A stored AD/UTC instant → "31 Jul 2026", via the Date Engine's `formatAd`
 * (Law 7 — rendered in Kathmandu, never computed here). `—` for a null column
 * and for an unparseable value, which is a data defect to see, not to crash on.
 */
function adDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : formatAd(d)
}

/** The honest gap line — used wherever the schema has no column yet. */
function NotTracked({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
      {children}
    </div>
  )
}

/**
 * A unit's status, as a §4 block — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one
 * component rendering the §4 map from lib/status; every screen inherits. No
 * screen colours a status itself."
 *
 * It used to paint **every one of the ten statuses the same gray** — `--card2`
 * fill, `--border` outline, `--text2` ink — so this page's unit table was the
 * one place in Inventory where you could not tell a Missing unit from an
 * Available one without reading. That is not a shade off the spec; it is the
 * absence of the signal §4 exists to carry, and it is why the parameter is now
 * the enum rather than `string`: a chip that takes any string cannot know
 * which hue it owes.
 *
 * The call sites do not change — they already pass `u.state`, which is
 * `inventory_state`, which is `InvStatus` member for member (pinned by
 * `__tests__/inventoryList.test.ts` against `INVENTORY_STATES`).
 *
 * `INV_LABEL` supplies the word for the same reason `Inventory.tsx` uses it:
 * the chip says `Available` where the enum says `In Stock`.
 */
function statusChip(state: InvStatus) {
  return <Badge tone={INV_TONE[state]} label={INV_LABEL[state]} icon={<Icon name={INV_STYLE[state].icon} size={11} />} size="sm" />
}

/**
 * A unit's condition, as a §4 block. Same delegation as `statusChip`.
 *
 * This one had a different failure: `const good = condition === 'Excellent'`,
 * a hardcoded one-of-five test that painted Excellent green and folded the
 * other four — including **Damaged and Lost** — into the same gray as each
 * other. `CONDITION_TONE` is the table that already answers this question for
 * the rest of Inventory, and it separates all five.
 *
 * It also put `--success-text` on `--st-in-bg`: green ink on the solid green
 * fill. That pairing was survivable while `--st-in-bg` was a soft wash; v4.1
 * §3.2 makes it the solid `--success`, and the on-colour that goes with it is
 * `--on-success` (white). Reading a `-text` token onto a `-bg` token is the
 * mistake the on-colour being "part of the token, not a screen choice" (§3.2)
 * is meant to prevent, and delegating removes the opportunity entirely.
 */
function conditionChip(condition: Condition) {
  return <Badge tone={CONDITION_TONE[condition]} label={condition} size="sm" />
}

/** One fact in the expanded unit record. `value` is already formatted or an honest '—'. */
function UnitFact({ label, value }: { label: string; value: string }) {
  return (
    <span className="asset-fact-pill">
      <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600 }}>{value}</span>
    </span>
  )
}

type AssetTab = 'Units' | 'Timeline' | 'Maintenance' | 'Money' | 'Documents' | 'Activity'

function AssetDetailView() {
  const { assetId } = useParams<{ assetId?: string }>()
  const navigate = useNavigate()
  /* `useCanViewMoney()` is the one gate every other money check in the app
     uses; this page must not have its own. */
  const money = useCanViewMoney()
  const { user } = useAuth()
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  // HIS v2.1 §2 — "Utilization... visible to Manager+; hidden from floor".
  const utilization = canViewUtilization(gctx)

  const [activeTab, setActiveTab] = useState<AssetTab>('Units')
  const [adjustingStock, setAdjustingStock] = useState(false)
  /* Spec 7.5 — TABLET: bands clamp to 3; PHONE: 2, tables become card rows.
     Same clamp `KpiStrip` applies (Page.tsx). */
  const viewport = useViewport()
  const cols = (n: number) => (viewport === 'phone' ? Math.min(n, 2) : viewport === 'tablet' ? Math.min(n, 3) : n)

  /** Unit ids (never serials — `serial_no` is nullable) whose row is expanded. */
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [labelUnit, setLabelUnit] = useState<InventoryUnitRow | null>(null)
  /** Id of the unit whose inline editor is open, or null. One at a time. */
  const [editingUnit, setEditingUnit] = useState<string | null>(null)

  /* The record, from `products_v`/`product_units_v` keyed on the ref in the
     URL. `rows[0]` rather than a bespoke one-record hook: `useList` underneath
     means "no such asset" arrives as `isEmpty` — a successful query that
     matched nothing — a different fact from `error` (the read failed), which
     the old `PARENTS.find(...)` could not distinguish. */
  const detail = useList<AssetDetailRecord>(
    fetchAssetDetail,
    {
      chips: {
        asset_ref: assetId ? [assetId] : [],
        with_money: money ? ['yes'] : [],
      },
    },
    // A detail page is addressed, not filtered — without this the empty state
    // would offer "Clear filters" for an asset that does not exist.
    { isFilteredOverride: false },
  )
  const record = detail.rows[0] ?? null
  const product = record?.product ?? null
  const units = useMemo(() => record?.units ?? [], [record])

  /* When the link carried a serial or tag, open on the unit it meant. */
  const matchedUnitId = record?.matchedUnitId ?? null
  useEffect(() => {
    if (!matchedUnitId) return
    setExpandedUnits((prev) => {
      if (prev.has(matchedUnitId)) return prev
      const next = new Set(prev)
      next.add(matchedUnitId)
      return next
    })
  }, [matchedUnitId])

  /* RULING 2026-09-08 (R-28): preventive service, warns only.
   *
   * A separate read rather than a column on the unit row, because due-ness is
   * DERIVED — there is no `is_due` column anywhere and there must not be. One
   * round trip for the whole table, keyed by unit id.
   *
   * `readServiceDue` never throws and returns an empty Map on failure, which is
   * what keeps a badge from taking an asset page down with it — including on a
   * project where `0103` is not applied, which is production today. */
  const [serviceByUnit, setServiceByUnit] = useState<Map<string, ServiceRow>>(new Map())
  useEffect(() => {
    let cancelled = false
    const ids = units.map((u) => u.id)
    if (ids.length === 0) {
      setServiceByUnit(new Map())
      return
    }
    void readServiceDue(ids).then((byUnit) => {
      if (!cancelled) setServiceByUnit(byUnit)
    })
    return () => {
      cancelled = true
    }
  }, [units])

  const toggleUnit = (unitId: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  /* §6 — a blank page is never acceptable, and a screen showing the wrong
     record is a defect the same way. The ladder keeps "could not load" and
     "not found" two different facts. */
  if (!product) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
        <PageBody
          loading={detail.loading}
          error={detail.error}
          onRetry={detail.refetch}
          empty={detail.isEmpty}
          noun="equipment record"
          skeleton="card"
          emptyTitle="Equipment not found"
          emptyMessage={`No asset matches "${assetId ?? ''}" by asset code, manufacturer serial or asset tag. It may have been retired, or the reference may be out of date.`}
          emptyActionLabel="Browse Inventory"
          onEmptyAction={() => navigate('/inventory')}
        >
          {null}
        </PageBody>
      </div>
    )
  }

  const serialised = product.trackingMode === 'Serialised'
  const inStockCount = product.unitsByState['In Stock']
  const liveUnitCount = product.unitCountExcludingRetired
  const retiredCount = product.unitsByState.Retired

  /* Derived from rows already fetched — a merge, never a second query. */
  const nextServiceAd = units.reduce<string | null>((min, u) => {
    if (!u.nextMaintenanceAtAd) return min
    return min === null || u.nextMaintenanceAtAd < min ? u.nextMaintenanceAtAd : min
  }, null)
  const lastServiceAd = units.reduce<string | null>((max, u) => {
    if (!u.lastMaintenanceAtAd) return max
    return max === null || u.lastMaintenanceAtAd > max ? u.lastMaintenanceAtAd : max
  }, null)

  const tabs: AssetTab[] = [
    'Units',
    'Timeline',
    'Maintenance',
    ...(money ? ['Money' as const] : []),
    'Documents',
    'Activity',
  ]

  return (
    <PageShell
      width="full"
      className="asset-detail-shell"
      header={
        <PageHeader
          title={product.name}
          breadcrumb={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Link to="/inventory" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Inventory</Link>
              <span>›</span>
              <span style={{ color: 'var(--text2)' }}>{product.category ?? '—'}</span>
              <span>›</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{product.name}</span>
              <span className="inventory-asset-code">
                {product.assetCode}
              </span>
            </div>
          }
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {user && ['Owner','Admin','Manager'].includes(user.role) && <Button onClick={() => navigate(`${location.pathname}?action=edit`)}>Edit Equipment</Button>}
              {units[0] && (
                <Button variant="secondary" icon="download" onClick={() => setLabelUnit(units[0] ?? null)}>
                  Print Labels
                </Button>
              )}
              <Button variant="primary" icon="checklist" onClick={() => navigate('/rentals?action=new')}>
                Book Asset
              </Button>
            </div>
          }
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>

      {/* Hero Header Block */}
      <div className="asset-hero-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)' }}>
          {/* No image column is selected by the query, so the glyph always
              renders — a real gap, not a missing join. */}
          <div className="asset-hero-thumb">
            <Icon name="box" size={36} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)' }}>
                {product.name}
              </h1>
              {product.recordState !== 'Active' && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text2)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 700,
                  }}
                >
                  {product.recordState}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)', flexWrap: 'wrap' }}>
              <span>Brand: <strong style={{ color: 'var(--text)' }}>{product.brand}</strong></span>
              {product.model && (
                <>
                  <span>·</span>
                  <span>Model: <strong style={{ color: 'var(--text)' }}>{product.model}</strong></span>
                </>
              )}
              <span>·</span>
              <span>Category: <strong style={{ color: 'var(--text)' }}>{product.category ?? '—'}</strong></span>
              <span>·</span>
              <span className="inventory-asset-code">{product.assetCode}</span>
            </div>
          </div>
        </div>

        {/* Derived Availability Ratio — real unit rows, retired excluded (§4.3) */}
        <div className="asset-availability-pill">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
              Live Availability
            </span>
            {serialised ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                <span className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success-text)' }}>
                  {inStockCount}
                </span>
                <span style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>/</span>
                <span className="figure" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
                  {liveUnitCount} Units
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="figure" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>{stockLabel(product)}</span>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>On-hand for quantity SKUs is not tracked yet</span>
              </div>
            )}
          </div>
          {serialised && (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 'var(--r-badge)',
                background: inStockCount > 0 ? 'var(--success-text)' : 'var(--danger-text)',
                boxShadow: inStockCount > 0 ? '0 0 6px rgba(16, 185, 129, 0.4)' : '0 0 6px rgba(239, 68, 68, 0.4)',
              }}
            />
          )}
        </div>
      </div>

      {/* Answer Strip: real figures where a column exists, honest gaps where not */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols(2 + (utilization ? 1 : 0) + (money ? 1 : 0))}, minmax(0,1fr))`, gap: 14 }}>
        <div style={{ ...cardStyle, padding: '14px 18px' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AVAILABLE NOW</div>
          {serialised ? (
            <>
              <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: 'var(--sp-xs)' }}>
                {inStockCount} of {liveUnitCount}
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>
                {retiredCount > 0 ? `${retiredCount} retired unit${retiredCount === 1 ? '' : 's'} excluded` : 'Live unit records'}
              </div>
            </>
          ) : (
            <>
              <div className="figure" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>
                {stockLabel(product)}
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>On-hand is not tracked for quantity SKUs</div>
            </>
          )}
        </div>

        <div style={{ ...cardStyle, padding: '14px 18px' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>NEXT FREE</div>
          <NotTracked>Not tracked yet — needs the per-unit booking timeline.</NotTracked>
        </div>

        {utilization && (
          <div style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>UTILISATION (90D)</div>
            <NotTracked>Not tracked yet — needs the utilization engine.</NotTracked>
          </div>
        )}

        {money && (
          <div style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>RECOVERY %</div>
            <NotTracked>Not tracked yet — needs the revenue engine.</NotTracked>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="asset-tab-strip">
        {tabs.map(t => {
          const active = activeTab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={['asset-tab-btn', active ? 'is-active' : ''].filter(Boolean).join(' ')}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* Tab 1: Units */}
      {activeTab === 'Units' && (
        <Card title="Fleet Units & Serial Records">
          {!serialised && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <span>Recorded bulk quantity: <strong className="figure">{product.totalQuantity}</strong></span>
              {user && canAdjustStock(user.role) && (
                <Button variant="secondary" onClick={() => setAdjustingStock(true)}>Adjust Stock</Button>
              )}
            </div>
          )}
          {units.length === 0 ? (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {serialised
                ? 'No unit rows exist for this product yet.'
                : `A ${product.trackingMode.toLowerCase()}-tracked SKU has no per-serial unit rows — its stock is the quantity above.`}
            </div>
          ) : viewport === 'phone' ? (
            /* Shell rule: "Tables become card rows below 768." Each unit becomes
               one card carrying the same facts and the same two actions. */
            <div className="inventory-card-grid">
              {units.map((u) => (
                <article key={u.id} className="inventory-model-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span className="inventory-asset-code" style={{ fontSize: 'var(--t-meta)' }}>{u.assetTag}</span>
                    {statusChip(u.state)}
                    {conditionChip(u.condition)}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{unitLocationOf(u) ?? 'No shelf location recorded'}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {u.serialNo ? <span className="identifier">{u.serialNo}</span> : 'No manufacturer serial'}
                    {' · '}
                    <span className="figure">{u.runningHours}h</span> run
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="ghost" size="sm" onClick={() => setLabelUnit(u)}>Label</Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`${location.pathname}?action=edit`)}>
                      {editingUnit === u.id ? 'Close' : 'Edit'}
                    </Button>
                  </div>
                  {editingUnit === u.id && <UnitEditor unit={u} money={money} onDone={() => setEditingUnit(null)} />}
                </article>
              ))}
            </div>
          ) : (
            <div className="inventory-table-shell" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
              <DataTableShell ariaLabel="Asset units">
                <table className="inventory-table operations-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)', minWidth: viewport === 'tablet' ? 720 : 900 }}>
                  <thead>
                    <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '8px', width: 44 }} />
                      <th style={{ padding: '8px' }}>Asset Tag</th>
                      <th style={{ padding: '8px' }}>Serial Number</th>
                      <th style={{ padding: '8px' }}>Condition</th>
                      <th style={{ padding: '8px' }}>Status</th>
                      <th style={{ padding: '8px' }}>Location</th>
                      <th style={{ padding: '8px' }}>Running Hours</th>
                      <th style={{ padding: '8px' }}>Next Service</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(u => {
                      const expanded = expandedUnits.has(u.id)
                      return (
                        <Fragment key={u.id}>
                          <tr className={expanded ? 'inventory-parent-row is-open' : 'inventory-parent-row'} style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
                            <td style={{ padding: '0 6px' }}>
                              <button
                                type="button"
                                onClick={() => toggleUnit(u.id)}
                                aria-label={expanded ? `Collapse ${u.assetTag}` : `Expand ${u.assetTag}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: expanded ? 'var(--nav-active-bg)' : 'var(--card2)',
                                  color: expanded ? 'var(--nav-active-accent)' : 'var(--text2)',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                  transition: 'all var(--dur-fast) var(--ease)',
                                }}
                              >
                                <Icon name={expanded ? 'chevron_down' : 'chevron_right'} size={14} />
                              </button>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              {/* `asset_tag` is the NOT NULL unique key (0004:195);
                                  `serial_no` is nullable, so the tag leads. */}
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                                <span className="inventory-asset-code">
                                  {u.assetTag}
                                </span>
                                {/* R-28: warns only. It sits beside the identifier and
                                    changes nothing about what the unit may do. */}
                                <ServiceDueBadge row={serviceByUnit.get(u.id)} />
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              {u.serialNo ? (
                                <span className="identifier" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>{u.serialNo}</span>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 8px' }}>{conditionChip(u.condition)}</td>
                            <td style={{ padding: '10px 8px' }}>{statusChip(u.state)}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>
                              {unitLocationOf(u) ?? '—'}
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <span className="figure">{u.runningHours}h</span>
                            </td>
                            <td style={{ padding: '10px 8px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                              {adDate(u.nextMaintenanceAtAd)}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <Button variant="ghost" onClick={() => setLabelUnit(u)}>Label</Button>
                                <Button variant="ghost" onClick={() => navigate(`${location.pathname}?action=edit`)}>
                                  {editingUnit === u.id ? 'Close' : 'Edit'}
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {editingUnit === u.id && (
                            <tr key={`${u.id}-edit`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                              <td />
                              <td colSpan={8} style={{ padding: '8px 12px 14px' }}>
                                <UnitEditor unit={u} money={money} onDone={() => setEditingUnit(null)} />
                              </td>
                            </tr>
                          )}

                          {/* Expanded unit record — the real per-unit columns. The
                              previous build rendered four Sony FX3 accessories here
                              under every unit of every asset; accessory checklists
                              have no table yet, and that is said instead. */}
                          {expanded && (
                            <tr key={`${u.id}-detail`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                              <td />
                              <td colSpan={8} style={{ padding: '8px 12px 14px' }}>
                                <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                                  Unit Record
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  <UnitFact label="Barcode" value={u.barcode ?? '—'} />
                                  <UnitFact label="QR code" value={u.qrCode ?? '—'} />
                                  <UnitFact label="Last maintenance" value={adDate(u.lastMaintenanceAtAd)} />
                                  <UnitFact label="Warranty expires" value={adDate(u.warrantyExpiresAd)} />
                                  <UnitFact label="Insurance expires" value={adDate(u.insuranceExpiresAd)} />
                                  {u.retiredAtAd && (
                                    <UnitFact label="Retired" value={`${adDate(u.retiredAtAd)}${u.retirementReason ? ` — ${u.retirementReason}` : ''}`} />
                                  )}
                                  {/* Law 6 — money facts are omitted entirely for
                                      money-blind roles; null means not on record. */}
                                  {money && (
                                    <UnitFact label="Purchase price" value={u.purchasePrice !== null ? formatMoney(u.purchasePrice) : 'Not on record'} />
                                  )}
                                  {money && (
                                    <UnitFact label="Replacement value" value={u.replacementValue !== null ? formatMoney(u.replacementValue) : 'Not on record'} />
                                  )}
                                </div>
                                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 8 }}>
                                  Accessory checklists per unit are not tracked yet.
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          )}
        </Card>
      )}

      {/* Tab 2: Timeline */}
      {activeTab === 'Timeline' && (
        <Card title="Availability & Bookings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Per-unit booking bars are not tracked yet — they need the booking-line join
              (product_units → booking_line_units → bookings). Each unit&rsquo;s current state below is live.
            </p>
            {units.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span className="identifier" style={{ width: 140, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  {u.assetTag}
                </span>
                {statusChip(u.state)}
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{unitLocationOf(u) ?? ''}</span>
              </div>
            ))}
            {units.length === 0 && (
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No unit rows to draw lanes for.</div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 3: Maintenance */}
      {activeTab === 'Maintenance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
        {/* RULING 2026-09-08 (R-28): the interval lives on the MODEL, so the card
            that sets it lives on the model's page. Without it nothing on this
            model ever badges — every interval defaults to off. */}
        <ServicePlanCard productId={product.id} />
        <Card title="Service & Maintenance Record">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            {/* Bento summary strip — derived from the fetched unit rows. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                paddingBottom: 14,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ padding: '10px 14px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>LAST SERVICE</div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, marginTop: 4 }}>
                  {lastServiceAd ? adDate(lastServiceAd) : 'Not recorded'}
                </div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>NEXT DUE</div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, marginTop: 4 }}>
                  {nextServiceAd ? adDate(nextServiceAd) : 'Not scheduled'}
                </div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>UNITS IN MAINTENANCE</div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: product.unitsByState.Maintenance > 0 ? 'var(--danger-text)' : 'var(--text)', fontWeight: 700, marginTop: 4 }}>
                  {product.unitsByState.Maintenance}
                </div>
              </div>
            </div>

            {units.length > 0 && viewport === 'phone' ? (
              /* Shell rule — the columns become one card per unit. */
              <div className="inventory-card-grid">
                {units.map((u) => (
                  <article key={u.id} className="inventory-model-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span className="inventory-asset-code">{u.assetTag}</span>
                      {conditionChip(u.condition)}
                    </div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      <span className="figure">{u.runningHours}h</span> run
                      {' · Last '}{adDate(u.lastMaintenanceAtAd)}
                      {' · Next '}{adDate(u.nextMaintenanceAtAd)}
                    </div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      Warranty {adDate(u.warrantyExpiresAd)}
                      {' · Insurance '}{adDate(u.insuranceExpiresAd)}
                    </div>
                  </article>
                ))}
              </div>
            ) : units.length > 0 ? (
              <div className="inventory-table-shell" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
                <DataTableShell ariaLabel="Unit maintenance records">
                  <table className="inventory-table operations-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)', minWidth: viewport === 'tablet' ? 640 : 760 }}>
                    <thead>
                      <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                        <th style={{ padding: '8px' }}>Unit</th>
                        <th style={{ padding: '8px' }}>Condition</th>
                        <th style={{ padding: '8px' }}>Running Hours</th>
                        <th style={{ padding: '8px' }}>Last Maintenance</th>
                        <th style={{ padding: '8px' }}>Next Due</th>
                        <th style={{ padding: '8px' }}>Warranty</th>
                        <th style={{ padding: '8px' }}>Insurance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 8px' }}><span className="inventory-asset-code">{u.assetTag}</span></td>
                          <td style={{ padding: '10px 8px' }}>{conditionChip(u.condition)}</td>
                          <td style={{ padding: '10px 8px' }}><span className="figure">{u.runningHours}h</span></td>
                          <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{adDate(u.lastMaintenanceAtAd)}</td>
                          <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{adDate(u.nextMaintenanceAtAd)}</td>
                          <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{adDate(u.warrantyExpiresAd)}</td>
                          <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{adDate(u.insuranceExpiresAd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableShell>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No unit rows carry maintenance dates for this product.</div>
            )}

            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Per-event service history is not tracked yet — there is no service-ticket table wired to units.
            </div>
          </div>
        </Card>
        </div>
      )}

      {/* Tab 4: Money (Omitted for Floor Roles — Law 6) */}
      {activeTab === 'Money' && money && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols(4)}, minmax(0,1fr))`, gap: 14 }}>
            <div style={{ ...cardStyle, padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DAILY RATE</div>
              {product.dailyRate !== null ? (
                <>
                  <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 'var(--sp-xs)', color: 'var(--text)' }}>{formatMoney(product.dailyRate)}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>Standard list rate</div>
                </>
              ) : (
                <NotTracked>Not on record for this asset.</NotTracked>
              )}
            </div>
            <div style={{ ...cardStyle, padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>REPLACEMENT VALUE</div>
              {product.replacementValue !== null ? (
                <>
                  <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 'var(--sp-xs)', color: 'var(--text)' }}>{formatMoney(product.replacementValue)}</div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 2 }}>As recorded on the SKU</div>
                </>
              ) : (
                <NotTracked>Not on record for this asset.</NotTracked>
              )}
            </div>
            <div style={{ ...cardStyle, padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>LIFETIME EARNINGS</div>
              <NotTracked>Not tracked yet — needs the revenue engine.</NotTracked>
            </div>
            <div style={{ ...cardStyle, padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>REPAIRS TO DATE</div>
              <NotTracked>Not tracked yet — needs a maintenance-cost ledger.</NotTracked>
            </div>
          </div>

          <Card title="Monthly Fleet Revenue Progression">
            <div style={{ padding: '12px 4px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Not tracked yet — needs the revenue engine.
            </div>
          </Card>
        </div>
      )}

      {/* Tab 5: Documents */}
      {activeTab === 'Documents' && (
        <Card title="Asset Documents & Certificates">
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            No documents are linked to this equipment record yet — the document registry is not wired to assets.
          </div>
        </Card>
      )}

      {/* Tab 6: Activity */}
      {activeTab === 'Activity' && (
        <Card title="Asset Activity Log">
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            No activity feed for this asset yet — the audit trail is not wired to equipment records.
          </div>
        </Card>
      )}

      {/* Label Modal */}
      {labelUnit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              ...cardStyle,
              width: 'min(420px, calc(100vw - 32px))',
              padding: '24px',
              borderRadius: 'var(--r-card, 16px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-lg)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700 }}>Asset QR Label</h2>
              <button
                type="button"
                onClick={() => setLabelUnit(null)}
                aria-label="Close"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--card2)',
                  cursor: 'pointer',
                  color: 'var(--text2)',
                  display: 'grid',
                  placeItems: 'center',
                  transition: 'all var(--dur-fast) var(--ease)',
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div style={{ padding: 20, borderRadius: 'var(--r-btn)', background: '#fff', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: 0.5 }}>BABIN RENTALS</div>
              <div style={{ width: 120, height: 120, border: '2px solid #000', display: 'grid', placeItems: 'center', padding: 'var(--sp-sm)', borderRadius: 8 }}>
                <Icon name="queues" size={80} style={{ color: '#000' }} />
              </div>
              <div className="inventory-asset-code" style={{ fontSize: '1rem', fontWeight: 800, color: '#000', background: 'rgba(0,0,0,0.06)' }}>
                {labelUnit.assetTag}
              </div>
              {labelUnit.serialNo && (
                <div className="identifier" style={{ fontSize: '0.8rem', color: '#444' }}>{labelUnit.serialNo}</div>
              )}
              <div style={{ fontSize: '0.8rem', color: '#444', textAlign: 'center' }}>
                {product.name} · {product.assetCode}
              </div>
            </div>

            {/* No fabricated success: label printing has no wiring yet, so there
                is no primary "Print" button pretending otherwise. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Label printing is not wired yet — this is a preview.</span>
              <Button variant="secondary" onClick={() => setLabelUnit(null)} style={{ minHeight: 44, padding: '0 16px' }}>Close</Button>
            </div>
          </div>
        </div>
      )}
      {adjustingStock && !serialised && (
        <AdjustStockModal
          productId={product.id}
          productName={product.name}
          currentQuantity={product.totalQuantity}
          onClose={() => setAdjustingStock(false)}
          onAdjusted={detail.refetch}
        />
      )}
      </div>
    </PageShell>
  )
}

export default function AssetDetail() { const [params]=useSearchParams(); const route=useParams<{assetId:string}>(); return params.get("action")==="edit" && route.assetId ? <RecordForm kind="equipment" recordId={route.assetId}/> : <AssetDetailView/> }
