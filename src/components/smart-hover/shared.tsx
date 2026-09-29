/**
 * Shared preview primitives — one payment row, one summary, one clearance
 * block used by client, rental and invoice cards alike (§43).
 *
 * Money renders via `lib/money.ts` (integer paisa, lakh grouping).
 * Money-blind callers never reach these components: the card switches to
 * `ClearanceBlock` before amounts are read (§68).
 */

import type { ReactNode } from 'react'
import { formatMoney } from '../../lib/money'
import type { PaymentTransaction, RentalPaymentSummary } from '../../lib/smartHover'
import Icon from '../ui/Icon'

export function PaymentSummary({ summary }: { summary: RentalPaymentSummary }) {
  const row = (label: string, paisa: number): ReactNode => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="figure" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(paisa as never)}</span>
    </div>
  )
  return (
    <section aria-label="Payment summary">
      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', margin: '0 0 4px' }}>PAYMENT</h4>
      {row('Total', summary.totalPaisa)}
      {row('Paid', summary.paidPaisa)}
      {row('Due', summary.duePaisa)}
      {row('Deposit held', summary.depositHeldPaisa)}
      <p style={{ margin: '6px 0 0', fontSize: 13 }}>
        <StatusWord tone={summary.state === 'PAID' ? 'var(--success-text)' : summary.state === 'UNPAID' || summary.state === 'PAYMENT_OVERDUE' ? 'var(--danger-text)' : 'var(--progress-text)'} label={summary.state.replace(/_/g, ' ')} icon={summary.state === 'PAID' ? 'check' : 'timer'} />
        {' · '}
        {summary.handoverClear ? 'Handover payment requirement clear' : 'Handover payment requirement pending'}
      </p>
    </section>
  )
}

export function StatusWord({ tone, label, icon }: { tone: string; label: string; icon: 'check' | 'timer' | 'alert_triangle' | 'dot' | 'lock' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: tone, fontWeight: 700 }}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </span>
  )
}

export function ClearanceBlock({ paymentClear, depositClear }: { paymentClear: boolean; depositClear: boolean }) {
  return (
    <section aria-label="Payment clearance">
      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', margin: '0 0 4px' }}>PAYMENT</h4>
      {paymentClear ? (
        <p style={{ margin: '4px 0', fontSize: 13 }}><StatusWord tone="var(--success-text)" label="Payment cleared" icon="check" /></p>
      ) : (
        <p style={{ margin: '4px 0', fontSize: 13 }}><StatusWord tone="var(--danger-text)" label="Payment required" icon="alert_triangle" /></p>
      )}
      {depositClear ? (
        <p style={{ margin: '4px 0', fontSize: 13 }}><StatusWord tone="var(--success-text)" label="Deposit received" icon="check" /></p>
      ) : (
        <p style={{ margin: '4px 0', fontSize: 13 }}><StatusWord tone="var(--danger-text)" label="Security deposit required" icon="lock" /></p>
      )}
      {!paymentClear || !depositClear ? <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--muted)' }}>Handover blocked</p> : null}
    </section>
  )
}

export function PaymentTransactionRow({ t }: { t: PaymentTransaction }) {
  return (
    <li style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span className="figure" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(t.amountPaisa as never)}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.status.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        {t.type.replace(/_/g, ' ')} · {t.method.replace(/_/g, ' ')} · {t.paidAt ?? t.createdAt}
        {t.rentalId ? ` · #${t.rentalId}` : ''}
        {t.reference ? ` · ${t.reference}` : ''} · by {t.createdBy}
      </div>
    </li>
  )
}

export function PackingBar({ packed, total }: { packed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((packed / total) * 100)
  return (
    <div aria-label={`Packing ${packed} of ${total}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <strong>Packing {packed} / {total}</strong>
        <span className="figure" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </div>
      <div role="progressbar" aria-valuenow={packed} aria-valuemin={0} aria-valuemax={total} style={{ height: 8, borderRadius: 999, background: 'var(--w08)', marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', transition: 'width 150ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
      </div>
    </div>
  )
}
