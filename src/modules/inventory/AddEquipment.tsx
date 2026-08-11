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
import Icon from '../../components/ui/Icon'
import { Link, useNavigate } from 'react-router-dom'
import { useViewport } from '../../lib/device'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { SEED_ERRORS, SAVE_UNAVAILABLE_REASON, PREVIEW_UNAVAILABLE_REASON } from '../../data/addEquipment'


function AddEquipmentLayout() {
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
  } = useEquipmentContext()
  const navigate = useNavigate()
  const viewport = useViewport()
  const money = useCanViewMoney()


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
          {assetCode}
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
            <Button
              variant="secondary"
              onClick={() => {
                import('../../actions/inventory/createEquipment').then((m) =>
                  m.createEquipment({ name: name || 'New Equipment', isDraft: true })
                )
                handleSubmit('draft')
              }}
            >
              Save Draft (not stored)
            </Button>
            <Button
              variant="primary"
              icon="check"
              onClick={() => {
                import('../../actions/inventory/createEquipment').then((m) =>
                  m.createEquipment({ name: name || 'New Equipment', isDraft: false })
                )
                handleSubmit('create')
              }}
            >
              Create Equipment (not stored)
            </Button>
          </>
        }
      />

      {/* The submit buttons say what they do; this says why. */}
      <div
        role="note"
        style={{
          ...cardStyle,
          padding: '10px 12px',
          display: 'flex',
          gap: 9,
          alignItems: 'flex-start',
          borderColor: 'var(--border)',
        }}
      >
        <Icon name="info" size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>{SAVE_UNAVAILABLE_REASON}</span>
      </div>

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

      {/* A report of what was validated is only true while it still validates. */}
      {outcome && Object.keys(errors).length === 0 && (
        <div role="status" style={{ ...cardStyle, padding: 'var(--sp-md)', borderColor: 'var(--success)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--success-text)' }}>
            {outcome.kind === 'validated' ? 'Record validated' : 'Draft validated'} — nothing was stored
          </strong>
          {outcome.lines.map((l) => (
            <span key={l} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              · {l}
            </span>
          ))}
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 3 }}>
            This is what would be written once equipment gains a data layer. Your entries are still on the page.
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
