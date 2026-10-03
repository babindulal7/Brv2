import type { PaymentListRow } from '../queries/finance'
import type { GateContext } from '../fieldGating'
import { canViewMoneyField } from '../fieldGating'
import { formatMoney } from '../money'
import { formatAdDateTime } from '../bs'
import type { IntelGlance, IntelGroup } from '../../components/ui/IntelCard'

export function paymentGlance(row: PaymentListRow, ctx: GateContext): IntelGlance {
  return {
    avatarLabel: 'PAY',
    avatarIcon: 'card',
    title: row.paymentNo,
    subtitle: `${row.bookingNo} · ${row.status}`,
    lines: canViewMoneyField(ctx, 'booking') ? [formatMoney(row.amount), formatAdDateTime(row.paymentDateAd)] : [row.status],
    primaryAction: { label: 'Open rental', to: `/rentals/${encodeURIComponent(row.bookingNo)}` },
  }
}

export function paymentDetailGroups(row: PaymentListRow, ctx: GateContext): IntelGroup[] {
  const fields: IntelGroup['fields'] = [
    { label: 'Payment', value: row.paymentNo },
    { label: 'Rental', value: row.bookingNo, trigger: { label: 'Open', to: `/rentals/${encodeURIComponent(row.bookingNo)}` } },
    { label: 'Client', value: row.clientName, trigger: { label: 'Open', to: `/clients/${encodeURIComponent(row.clientId)}` } },
    { label: 'Type', value: row.paymentType },
    { label: 'Status', value: row.status },
    { label: 'Received', value: formatAdDateTime(row.paymentDateAd) },
  ]
  if (canViewMoneyField(ctx, 'booking')) fields.push({ label: 'Amount', value: formatMoney(row.amount) })
  if (row.channelGroup) fields.push({ label: 'Channel', value: row.channelGroup })
  if (row.transactionRef) fields.push({ label: 'Reference', value: row.transactionRef })
  return [{ title: 'Payment', fields }]
}
