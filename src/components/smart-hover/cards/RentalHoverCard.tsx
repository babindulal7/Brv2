/**
 * RentalHoverCard — §31–§50.
 * Tabs: Overview | Equipment | Packing | Payments | Notes (§107).
 * Readiness and packing stay separate (§34); blockers lead (§39).
 */

import { useState } from 'react'
import { handoverBlockedReason, packingProgress, sortTxNewestFirst } from '../../../lib/smartHover'
import { PACKING_TONE } from '../entityStatusColors'
import { STATUS } from '../../../lib/status'
import { SmartHoverTabs } from '../SmartHoverShell'
import Icon from '../../ui/Icon'
import { ClearanceBlock, PackingBar, PaymentSummary, PaymentTransactionRow } from '../shared'
import type { RentalPreview } from '../previewTypes'

export function RentalHoverCard({
  preview,
  canViewFinance,
  defaultTab,
  onAction,
  onOpenClient,
}: {
  preview: RentalPreview
  canViewFinance: boolean
  defaultTab: string
  onAction?: (id: string) => void
  onOpenClient?: () => void
}) {
  const [tab, setTab] = useState(defaultTab)
  const progress = packingProgress(preview.packing.lines)
  const blocked = handoverBlockedReason(preview.readiness)
  const beforeHandover = preview.stage === 'Quote' || preview.stage === 'Booked' || preview.stage === 'Packed'
  const tone = STATUS[PACKING_TONE[preview.packing.status] ?? 'neutral']
  const safeTone = tone ?? STATUS.neutral

  return (
    <div>
      <div id="smart-hover-title" style={{ padding: '14px 14px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="identifier" style={{ fontWeight: 800, fontSize: 15 }}>#{preview.rentalNo}</span>
          <span style={{ background: safeTone.bg, color: safeTone.fg, borderRadius: 'var(--r-chip)', padding: '4px 8px', fontSize: 11, fontWeight: 800, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Icon name={preview.packing.status === 'blocked' ? 'alert_triangle' : 'check'} size={13} />
            {preview.stage.toUpperCase()}
          </span>
        </div>
        {onOpenClient ? <button type="button" onClick={onOpenClient} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--link)', fontSize: 13, cursor: 'pointer', textAlign: 'left', minHeight: 'var(--tap)' }}>
          {preview.clientName} ›
        </button> : <div>{preview.clientName}</div>}
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{preview.pickupAt} → {preview.returnAt}{preview.rentalDays === null ? '' : ` · ${preview.rentalDays} rental day${preview.rentalDays === 1 ? '' : 's'}`}</div>
        {beforeHandover && blocked ? (
          <p role={blocked === 'Readiness verification unavailable' ? 'status' : 'alert'} style={{ margin: '6px 0 0', fontSize: 13, color: blocked === 'Readiness verification unavailable' ? 'var(--muted)' : 'var(--danger-text)' }}>{blocked === 'Readiness verification unavailable' ? 'Handover readiness not verified' : `🔴 Handover blocked — ${blocked}`}</p>
        ) : (
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>Packing {progress.packed} / {progress.total}</p>
        )}
      </div>
      <SmartHoverTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'equipment', label: 'Equipment', count: preview.equipment.length },
          { id: 'packing', label: 'Packing', count: progress.total },
          { id: 'payments', label: 'Payments' },
          { id: 'notes', label: 'Notes', count: preview.notes.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div role="tabpanel">
        {tab === 'overview' ? (
          <div style={{ fontSize: 13, display: 'grid', gap: 8 }}>
            {beforeHandover ? <section aria-label="Readiness">
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', margin: '0 0 4px' }}>READINESS</h4>
              <ReadinessRow ok={preview.readiness.equipmentReady} label="Equipment reserved" />
              <ReadinessRow ok={preview.readiness.packingReady} label={`Packing ${progress.packed} / ${progress.total}`} />
              <ReadinessRow ok={preview.readiness.paymentReady} label="Payment cleared" />
              <ReadinessRow ok={preview.readiness.depositReady} label="Deposit satisfied" />
              <ReadinessRow ok={preview.readiness.contractReady} label="Contract signed" />
              <ReadinessRow ok={preview.readiness.clientAllowed} label="Client allowed" />
            </section> : <p style={{ margin: 0 }}>Stage: {preview.stage}. Handover readiness applies before pickup.</p>}
          </div>
        ) : null}
        {tab === 'equipment' ? (
          <ul style={{ margin: 0, padding: 0 }}>
            {preview.equipment.map((e, i) => (
              <li key={`${e.label}-${i}`} style={{ listStyle: 'none', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                {e.packed === true ? '✓ ' : e.packed === false ? '○ ' : ''}{e.qty}× {e.label}
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'packing' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <PackingBar packed={progress.packed} total={progress.total} />
            {progress.blocked > 0 ? (
              <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger-text)' }}>🔴 {progress.blocked} blocked line{progress.blocked === 1 ? '' : 's'} need action</p>
            ) : null}
            <ul style={{ margin: 0, padding: 0 }}>
              {preview.packing.lines.map((l) => (
                <li key={l.id} style={{ listStyle: 'none', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  {l.status === 'packed' ? '✓ ' : l.status === 'blocked' || l.status === 'missing' || l.status === 'damaged' ? '🔴 ' : '○ '}
                  {l.label}{l.serial ? ` · ${l.serial}` : ''} — {l.status.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
            {preview.packing.updatedAt ? <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Last update {preview.packing.updatedAt}{preview.packing.updatedBy ? ` · ${preview.packing.updatedBy}` : ''}</p> : null}
          </div>
        ) : null}
        {tab === 'payments' ? (
          canViewFinance && preview.payments ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <PaymentSummary summary={preview.payments.summary} showDepositHeld={preview.payments.depositHeldVerified !== false} />
              <ul style={{ margin: 0, padding: 0 }}>
                {sortTxNewestFirst(preview.payments.history).slice(0, 4).map((t) => <PaymentTransactionRow key={t.id} t={t} />)}
              </ul>
              {onAction ? <button type="button" style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer', textAlign: 'left' }} onClick={() => onAction('view_ledger')}>View full ledger</button> : null}
            </div>
          ) : (
            <ClearanceBlock paymentClear={preview.clearance?.paymentClear ?? preview.readiness.paymentReady} depositClear={preview.clearance?.depositClear ?? preview.readiness.depositReady} />
          )
        ) : null}
        {tab === 'notes' ? (
          <div>
            <ul style={{ margin: 0, padding: 0 }}>
              {preview.notes.map((n) => (
                <li key={n.id} style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{n.at} · {n.by}</div>
                  <div>{n.text}</div>
                </li>
              ))}
            </ul>
            {onAction ? <button type="button" style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer' }} onClick={() => onAction('add_note')}>+ Add note</button> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ReadinessRow({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
      <Icon name={ok === true ? 'check' : ok === false ? 'alert_triangle' : 'dot'} size={15} color={ok === true ? 'var(--success-text)' : ok === false ? 'var(--danger-text)' : 'var(--muted)'} />
      <span style={{ color: ok === true ? 'var(--text)' : ok === false ? 'var(--danger-text)' : 'var(--muted)' }}>{ok === true ? '✓' : ok === false ? '🔴' : '○'} {label}{ok === null ? ' — not verified' : ''}</span>
    </div>
  )
}
