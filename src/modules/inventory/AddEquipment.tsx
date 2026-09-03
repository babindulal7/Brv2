import { useRef, useState } from 'react'
import { EquipmentProvider, useEquipmentContext } from './components/AddEquipmentContext'
import { SectionIdentity } from './components/SectionIdentity'
import { SectionStockUnits } from './components/SectionStockUnits'
import { SectionRelationships } from './components/SectionRelationships'
import { SectionLocation } from './components/SectionLocation'
import { SectionPurchase } from './components/SectionPurchase'
import { SectionPricing } from './components/SectionPricing'
import { SectionMaintenance } from './components/SectionMaintenance'
import { EquipmentRightRail } from './components/EquipmentRightRail'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { Modal } from '../../components/ui/Modal'
import { PageHeader, Button, FooterNote, Rail, cardStyle } from '../../components/ui/Page'
import { Link, useNavigate } from 'react-router-dom'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { captureError } from '../../lib/monitoring'
import { useToast } from '../../components/ui/Toast'
import { newClientUuid } from '../../lib/supabase'
import { parseMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { SEED_ERRORS, PREVIEW_UNAVAILABLE_REASON } from '../../data/addEquipment'
import { WAREHOUSES } from '../../data/warehouse'
import type { CreateEquipmentInput } from '../../actions/inventory/createEquipment'


/** Blank → absent; otherwise a finite number or absent. */
function num(s: string): number | undefined {
  const t = s.trim()
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** Blank/unparseable → absent; otherwise Paisa. Money crosses to rupees inside the action (Law 6). */
function paisa(s: string): Paisa | undefined {
  const p = parseMoney(s)
  return p == null ? undefined : p
}

function AddEquipmentLayout() {
  const ctx = useEquipmentContext()
  const {
    assetCode,
    name,
    submitted,
    outcome,
    showDiscard,
    setShowDiscard,
    setDismissedDuplicate,
    duplicateModel,
    errors,
    isDirty,
    handleSubmit,
    railContent,
    serialised,
    units,
    rentable,
    chosenLocation,
  } = ctx
  const navigate = useNavigate()
  const viewport = useViewport()
  const money = useCanViewMoney()
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  /** The one identity a dispatch on this screen may act as. No fallback. */
  const { user } = useAuth()
  /**
   * The last CREATE_EQUIPMENT rejection. Law 12 — inline and persistent; it
   * renders through the `ErrorBanner` this page already uses for its validation
   * and seed failures, and `useToast()` carries successes only.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  /** A write is in flight — both submit buttons hold until it reports. */
  const [saving, setSaving] = useState(false)

  /**
   * Law 8 — the idempotency keys for THIS record, minted on the first submit
   * and reused across every retry of it (`blockKeys` ref pattern,
   * `clients/ClientsDirectory.tsx:325`). One key for the `products` row, one
   * per unit row keyed on the draft row's stable id — so a resubmit after a
   * partial failure conflicts on `client_uuid` and resolves to the rows that
   * already landed instead of writing seconds.
   */
  const writeKeys = useRef<{ product: string | null; units: Map<string, string> }>({ product: null, units: new Map() })

  /** Everything the form collected that has a column behind it, in one payload. */
  const buildInput = (mode: 'draft' | 'create'): CreateEquipmentInput => {
    const keys = writeKeys.current
    if (!keys.product) keys.product = newClientUuid()
    const unitInputs = serialised
      ? units.map((u) => {
          let key = keys.units.get(u.id)
          if (!key) {
            key = newClientUuid()
            keys.units.set(u.id, key)
          }
          return {
            serial: u.serial.trim(),
            condition: u.condition,
            purchaseDateIso: u.purchaseIso || undefined,
            clientUuid: key,
          }
        })
      : undefined
    return {
      clientUuid: keys.product,
      name: name.trim(),
      shortName: ctx.shortName || undefined,
      category: ctx.category,
      brand: ctx.brand,
      model: ctx.modelNo || undefined,
      // The form's own rule: Manufacturer exists only when it differs from Brand.
      manufacturer: ctx.manufacturerDiffers ? ctx.manufacturer || undefined : undefined,
      description: ctx.description || undefined,
      tracking: ctx.tracking,
      units: unitInputs,
      quantity: serialised ? undefined : ctx.quantity,
      reorderLevel: serialised ? undefined : ctx.reorderLevel,
      quantityUnit: serialised ? undefined : (ctx.quantityUnit as 'piece' | 'metre' | 'roll' | 'pack'),
      warehouseName: WAREHOUSES.find((w) => w.id === ctx.warehouseId)?.name,
      location: chosenLocation
        ? { rack: chosenLocation.rack, shelf: chosenLocation.shelf, bin: chosenLocation.bin }
        : undefined,
      /*
       * `products.status` — Draft on Save Draft; Create publishes Active only
       * when this page's own Ready-to-Rent gate cleared (`rentable`), which is
       * exactly what the validation report has always told the operator.
       */
      status: mode === 'create' && rentable ? 'Active' : 'Draft',
      /* Money — Paisa here, rupees only inside the action (Law 6). A
         money-blind session never rendered these sections, so the fields are
         absent from its payload entirely, never zeroed. */
      ...(money
        ? {
            purchaseDateIso: ctx.purchaseIso || undefined,
            purchasePricePaisa: paisa(ctx.purchasePrice),
            replacementValuePaisa: paisa(ctx.replacementValue),
            dailyRatePaisa: paisa(ctx.dailyRate),
            weeklyRatePaisa: paisa(ctx.weeklyRate),
            monthlyRatePaisa: paisa(ctx.monthlyRate),
            hourlyRatePaisa: paisa(ctx.hourlyRate),
            weekendRatePaisa: paisa(ctx.weekendRate),
            ...(ctx.depositKind === 'percent'
              ? { depositPercent: num(ctx.depositPercent) }
              : { depositFixedPaisa: paisa(ctx.depositFixed) }),
            warrantyMonths: num(ctx.warrantyMonths),
            insuranceExpiryIso: ctx.insuranceExpiryIso || undefined,
          }
        : {}),
      minRentalDays: num(ctx.minRentalDays),
      rentalEnabled: ctx.rentalEnabled,
      prepMinutes: num(ctx.prepMinutes),
      cleaningMinutes: num(ctx.cleaningMinutes),
      inspectionRequired: ctx.inspectionRequired,
      packingRequired: ctx.packingRequired,
      internalNotes: ctx.internalNotes || undefined,
      warehouseNotes: ctx.warehouseNotes || undefined,
    }
  }

  /**
   * ⭐ 12 Aug 2026 — both submit buttons dispatched `{ name, isDraft }` with no
   * `ActionContext` and no `.catch()`; the other ~40 collected fields had no
   * path into the action at all (audit gaps 2 and 3). Now: `handleSubmit` is
   * still this screen's validation pass, and its boolean gates the dispatch —
   * an invalid record scrolls to its first problem and sends NOTHING. On the
   * resolved path the app's "the write landed" signal is the navigation to
   * `/inventory`; the toast carries the asset code the database issued.
   */
  const submit = (mode: 'draft' | 'create') => {
    if (!handleSubmit(mode)) {
      setDispatchError(null)
      return
    }
    if (!user) {
      setDispatchError(
        'You are not signed in, so this equipment cannot be created against anyone. Nothing was written; your entries are still on the page.',
      )
      return
    }
    setDispatchError(null)
    setSaving(true)
    void import('../../actions/inventory/createEquipment')
      .then((m) => m.createEquipment(buildInput(mode), { userId: user.id, role: user.role, isOnline: online }))
      .then((res) => {
        showSuccessToast(
          mode === 'draft' ? 'Draft saved' : 'Equipment created',
          `${res.assetCode} · ${res.status}${res.unitCount ? ` · ${res.unitCount} unit${res.unitCount === 1 ? '' : 's'}` : ''}`,
        )
        navigate('/inventory')
      })
      .catch((err: unknown) => {
        captureError(err, { where: 'AddEquipment.create' })
        setSaving(false)
        setDispatchError(err instanceof Error ? err.message : String(err))
      })
  }

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingBottom: 'var(--sp-3xl)' }}>
      {/* §2 — breadcrumb, and deliberately no Back button. */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        <Link to="/inventory" style={{ color: 'var(--text2)', textDecoration: 'none' }}>
          Inventory
        </Link>
        <span aria-hidden>›</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>Add Equipment</span>
        {/* Not an identifier and no longer styled as one: the Asset Code is
            assigned on save by the database, so the crumb carries the state of
            the code rather than a code (see `data/addEquipment.ts`'s note). */}
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-th)',
            color: 'var(--muted)',
          }}
        >
          Asset code · {assetCode}
        </span>
      </nav>

      <PageHeader
        icon="box"
        title="Add Equipment"
        description="Create an equipment record: its identity, its serialised units, where it lives, what it belongs to and what it works with."
        actions={
          <>
            <Button variant="ghost" onClick={() => (isDirty ? setShowDiscard(true) : navigate('/inventory'))}>
              Cancel
            </Button>
            <Unavailable reason={PREVIEW_UNAVAILABLE_REASON}>
              <Button variant="secondary" icon="eye" disabled>
                Preview
              </Button>
            </Unavailable>
            <Button variant="secondary" onClick={() => submit('draft')} disabled={saving}>
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button variant="primary" icon="check" onClick={() => submit('create')} disabled={saving}>
              {saving ? 'Saving…' : 'Create Equipment'}
            </Button>
          </>
        }
      />

      {/* The "(not stored)" face labels and the SAVE_UNAVAILABLE_REASON note
          card are gone WITH the gap they described: CREATE_EQUIPMENT now
          writes `products` + `product_units` through lib/dataAccess, and a
          label claiming otherwise would be the inverse fabrication. */}

      {/* Law 12 — the dispatch rejection, inline and persistent, above the
          validation report so the two are never mistaken for each other. */}
      {dispatchError && <ErrorBanner title="Nothing was created" message={dispatchError} />}

      {SEED_ERRORS.length > 0 && (
        <ErrorBanner
          title="Seed data does not reconcile"
          message={
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
              {SEED_ERRORS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          }
        />
      )}

      {/* §7 — duplicate detection on name + model, warned and linked. */}
      {duplicateModel && (
        <ErrorBanner
          title="This equipment may already exist"
          message={
            <>
              <div>
                {duplicateModel.name} · <span className="identifier">{duplicateModel.sku}</span> · {duplicateModel.stock} in stock
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}>
                <Button variant="secondary" onClick={() => navigate('/inventory')}>
                  Open Inventory
                </Button>
                <Button variant="ghost" onClick={() => setDismissedDuplicate(true)}>
                  Continue Anyway
                </Button>
              </div>
            </>
          }
        />
      )}

      {/* Errors are inline and persistent; a toast never carries one. */}
      {submitted && Object.keys(errors).length > 0 && (
        <ErrorBanner
          title={`${Object.keys(errors).length} thing${Object.keys(errors).length === 1 ? '' : 's'} to fix before this record can be created`}
          message={
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
              {Object.entries(errors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          }
        />
      )}

      {/* The validation report, shown while the write it describes is in
          flight. On success the page navigates to /inventory (the app's "the
          write landed" signal); on failure this hides and the banner above
          carries the reason, so the two can never both claim the record. */}
      {outcome && !dispatchError && Object.keys(errors).length === 0 && (
        <div role="status" style={{ ...cardStyle, padding: 'var(--sp-md)', borderColor: 'var(--success)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--success-text)' }}>
            {outcome.kind === 'validated' ? 'Record validated' : 'Draft validated'}
          </strong>
          {outcome.lines.map((l) => (
            <span key={l} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              · {l}
            </span>
          ))}
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 3 }}>
            {saving
              ? 'Saving to the database — you will land on Inventory once the write is confirmed.'
              : 'Validated, not yet saved. Your entries are still on the page.'}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'desktop' ? 'auto minmax(0, 1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* §2 — a sticky section nav, not a stepper. Any section, any order. */}
        {viewport === 'desktop' && (
          <aside style={{ position: 'sticky', top: 16 }}>
            <EquipmentRightRail />
          </aside>
        )}

        {/* ── the form ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {/* 1 · Identity — §3 */}
          <SectionIdentity />

          {/* 2 · Stock & Units — §5 */}
          <SectionStockUnits />

          {/* 3 · Relationships — §6 */}
          <SectionRelationships />

          {/* 4 · Location — §11 */}
          <SectionLocation />

          {/* 5 · Purchase — §10.1. Omitted entirely for money-blind roles (§12). */}
          {money && (
            <SectionPurchase />
          )}

          {/* 6 · Pricing & Rental — §10.2 / §10.4. Omitted for money-blind roles. */}
          {money && (
            <SectionPricing />
          )}

          {/* 7 · Maintenance & Documents — §11 */}
          <SectionMaintenance />
        </div>

        {viewport === 'desktop' ? (
          <Rail width={324} label="Record summary">
            {railContent}
          </Rail>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{railContent}</div>
        )}
      </div>

      <FooterNote extra={['Assets are retired with a reason, never deleted']} />

      <Modal
        isOpen={showDiscard}
        onClose={() => setShowDiscard(false)}
        title="Discard this equipment record?"
        subtitle="Nothing has been saved."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowDiscard(false)}>
              Keep Editing
            </Button>
            <Button variant="danger" onClick={() => navigate('/inventory')}>
              Discard
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Leaving now loses everything entered on this page — including any attached images and documents.
        </p>
      </Modal>
    </div>
  )
}

export default function AddEquipment() {
  return (
    <EquipmentProvider>
      <AddEquipmentLayout />
    </EquipmentProvider>
  )
}
