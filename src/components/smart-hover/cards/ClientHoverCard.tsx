/**
 * ClientHoverCard — §13–§24.
 * Tabs: Info | Current | History | Payments | Notes (§107).
 * Restrictions outrank commercial metrics (§91, §104).
 */

import { useState } from 'react'
import { formatMoney } from '../../../lib/money'
import { sortTxNewestFirst } from '../../../lib/smartHover'
import { SmartHoverTabs } from '../SmartHoverShell'
import { accountTone } from '../entityStatusColors'
import { STATUS } from '../../../lib/status'
import Icon from '../../ui/Icon'
import { ClearanceBlock, PaymentTransactionRow } from '../shared'
import type { ClientPreview } from '../previewTypes'

export function ClientHoverCard({
  preview,
  canViewFinance,
  defaultTab,
  onAction,
  onOpenRental,
}: {
  preview: ClientPreview
  canViewFinance: boolean
  defaultTab: string
  onAction?: (id: string) => void
  onOpenRental?: (rentalNo: string) => void
}) {
  const [tab, setTab] = useState(defaultTab)
  const tone = accountTone({ restricted: preview.restricted, overdue: (preview.payments?.summary.overduePaisa ?? 0) > 0 })
  const tokens = STATUS[tone]

  return (
    <div>
      <div id="smart-hover-title">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 14px 8px' }}>
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--w08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {preview.name.slice(0, 2).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{preview.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {preview.company ? `${preview.company} · ` : ''}{preview.clientNo}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ background: tokens.bg, color: tokens.fg, borderRadius: 'var(--r-chip)', padding: '4px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Icon name={preview.restricted ? 'alert_triangle' : 'check'} size={13} />
                {preview.restricted ? 'RESTRICTED' : 'CLEAR'}
              </span>
              {preview.memberTier ? <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{preview.memberTier}</span> : null}
            </div>
          </div>
        </div>
        {preview.restricted && preview.restrictionNote ? (
          <p role="alert" style={{ margin: '0 14px 8px', fontSize: 13, color: 'var(--danger-text)' }}>{preview.restrictionNote}</p>
        ) : null}
      </div>
      <SmartHoverTabs
        tabs={[
          { id: 'info', label: 'Info' },
          { id: 'current', label: 'Current', count: preview.current.length },
          { id: 'history', label: 'History', count: preview.history.length },
          { id: 'payments', label: 'Payments' },
          { id: 'notes', label: 'Notes', count: preview.notes.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div role="tabpanel">
        {tab === 'info' ? <InfoTab preview={preview} canViewFinance={canViewFinance} /> : null}
        {tab === 'current' ? <CurrentTab preview={preview} onOpenRental={onOpenRental} /> : null}
        {tab === 'history' ? (
          <ul style={{ margin: 0, padding: 0 }}>
            {preview.history.map((h) => (
              <li key={h.rentalId} style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                {onOpenRental ? <button type="button" onClick={() => onOpenRental(h.rentalNo)} style={{ minHeight: 'var(--tap)', border: 0, background: 'none', color: 'var(--link)', cursor: 'pointer' }}>#{h.rentalNo}</button> : <strong>#{h.rentalNo}</strong>} · {h.stage} · {h.itemCount} items
                <div style={{ fontSize: 12, color: 'var(--muted)' }}><span style={{ color: 'var(--booking-date-text)' }}>{h.pickupAt} → {h.returnAt}</span></div>
              </li>
            ))}
            {preview.history.length === 0 ? <li style={{ listStyle: 'none', fontSize: 13, color: 'var(--muted)' }}>No past rentals.</li> : null}
          </ul>
        ) : null}
        {tab === 'payments' ? (
          canViewFinance && preview.payments ? (
            <div>
              <p style={{ fontSize: 13, margin: '0 0 8px' }}>Outstanding <strong className="figure">{formatMoney(preview.payments.summary.outstandingPaisa as never)}</strong></p>
              <ul style={{ margin: 0, padding: 0 }}>
                {sortTxNewestFirst(preview.payments.history).slice(0, 5).map((t) => <PaymentTransactionRow key={t.id} t={t} />)}
              </ul>
              {onAction ? <button type="button" style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer' }} onClick={() => onAction('view_ledger')}>View full ledger</button> : null}
            </div>
          ) : (
            <ClearanceBlock paymentClear={preview.clearance?.paymentClear ?? null} depositClear={preview.clearance?.depositClear ?? null} />
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

function InfoTab({ preview, canViewFinance }: { preview: ClientPreview; canViewFinance: boolean }) {
  return (
    <dl style={{ margin: 0, fontSize: 13, display: 'grid', gap: 6 }}>
      {preview.contact?.email ? <div><dt style={{ color: 'var(--muted)', fontSize: 11 }}>EMAIL</dt><dd style={{ margin: 0 }}>{preview.contact.email}</dd></div> : null}
      {preview.contact?.phone ? <div><dt style={{ color: 'var(--muted)', fontSize: 11 }}>PHONE</dt><dd style={{ margin: 0 }}>{preview.contact.phone}</dd></div> : null}
      {preview.since ? <div><dt style={{ color: 'var(--muted)', fontSize: 11 }}>CLIENT SINCE</dt><dd style={{ margin: 0 }}>{preview.since}</dd></div> : null}
      {canViewFinance && preview.finance ? (
        <div>
          <dt style={{ color: 'var(--muted)', fontSize: 11 }}>FINANCE</dt>
          <dd style={{ margin: 0 }}>
            Revenue <span className="figure">{formatMoney(preview.finance.revenuePaisa as never)}</span>
            {' · '}Outstanding <span className="figure">{formatMoney(preview.finance.outstandingPaisa as never)}</span>
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function CurrentTab({ preview, onOpenRental }: { preview: ClientPreview; onOpenRental?: ((rentalNo: string) => void) | undefined }) {
  if (preview.current.length === 0) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>No active or upcoming rentals.</p>
  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {preview.current.map((r) => (
        <li key={r.rentalId} style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
          {onOpenRental ? <button type="button" onClick={() => onOpenRental(r.rentalNo)} style={{ minHeight: 'var(--tap)', border: 0, background: 'none', color: 'var(--link)', cursor: 'pointer' }}>#{r.rentalNo}</button> : <strong>#{r.rentalNo}</strong>} · {r.stage} · {r.itemCount} items
          <div style={{ fontSize: 12, color: 'var(--muted)' }}><span style={{ color: 'var(--booking-date-text)' }}>{r.pickupAt} → {r.returnAt}</span></div>
          {r.packing ? <div style={{ fontSize: 12 }}>Packing {r.packing.packed} / {r.packing.total}</div> : null}
          {r.paymentClear !== undefined ? <div style={{ fontSize: 12 }}>{r.paymentClear ? 'Payment cleared' : 'Payment pending'}</div> : null}
        </li>
      ))}
    </ul>
  )
}
