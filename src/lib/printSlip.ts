import { formatMoney } from './money'
import type { Paisa } from './money'

export interface RentalSlipData {
  bookingNo: string
  clientName: string
  clientPhone: string
  stage: string
  pickupDate: string
  returnDate: string
  lines: Array<{
    name: string
    serial?: string
    qty: number
    days: number
    amountPaisa?: Paisa
  }>
  subtotalPaisa?: Paisa
  discountPaisa?: Paisa
  vatPaisa?: Paisa
  totalPaisa?: Paisa
  depositPaisa?: Paisa
  advancePaisa?: Paisa
  outstandingPaisa?: Paisa
  operatorName?: string
  branchName?: string
  branchVat?: string
}

/**
 * Generates an 80mm thermal printer format and triggers native window.print() or returns formatted HTML.
 */
export function printRentalSlip(data: RentalSlipData): void {
  if (typeof window === 'undefined') return

  const branch = data.branchName || 'Babin Rentals Kathmandu'
  const vat = data.branchVat || 'VAT: 601234567'
  const dateStr = new Date().toLocaleString('en-GB')

  const itemsHtml = data.lines
    .map(
      (l) => `
    <tr style="border-bottom: 1px dashed #ccc;">
      <td style="padding: 4px 0; font-size: 11px;">
        <b>${l.name}</b>${l.serial ? `<br/><span style="font-size: 9px; color: #555;">S/N: ${l.serial}</span>` : ''}
      </td>
      <td style="text-align: center; padding: 4px 0; font-size: 11px;">${l.qty}</td>
      <td style="text-align: center; padding: 4px 0; font-size: 11px;">${l.days}d</td>
      <td style="text-align: right; padding: 4px 0; font-size: 11px;">${l.amountPaisa !== undefined ? formatMoney(l.amountPaisa) : '—'}</td>
    </tr>
  `
    )
    .join('')

  const printWindow = window.open('', '_blank', 'width=380,height=600')
  if (!printWindow) {
    alert('Please allow popups to print thermal receipt slips.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Rental Voucher — ${data.bookingNo}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 72mm;
            margin: 0 auto;
            padding: 8px 4px;
            color: #000;
            background: #fff;
            font-size: 12px;
            line-height: 1.3;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; }
          .flex-between { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 15px; letter-spacing: 1px;">${branch}</div>
        <div class="center" style="font-size: 10px;">${vat}</div>
        <div class="center" style="font-size: 10px;">EQUIPMENT RENTAL HANDOVER SLIP</div>
        
        <div class="divider"></div>

        <div class="flex-between">
          <span>Booking: <b>${data.bookingNo}</b></span>
          <span>Stage: ${data.stage}</span>
        </div>
        <div>Date: ${dateStr}</div>
        <div>Client: <b>${data.clientName}</b></div>
        <div>Phone: ${data.clientPhone}</div>
        <div class="divider"></div>
        <div>Period: ${data.pickupDate} &rarr; ${data.returnDate}</div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 10px;">
              <th style="text-align: left;">ITEM</th>
              <th style="text-align: center;">QTY</th>
              <th style="text-align: center;">DUR</th>
              <th style="text-align: right;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        ${
          data.subtotalPaisa !== undefined
            ? `
          <div class="flex-between"><span>Subtotal:</span><span>${formatMoney(data.subtotalPaisa)}</span></div>
          ${data.discountPaisa ? `<div class="flex-between"><span>Discount:</span><span>-${formatMoney(data.discountPaisa)}</span></div>` : ''}
          ${data.vatPaisa ? `<div class="flex-between"><span>VAT (13%):</span><span>${formatMoney(data.vatPaisa)}</span></div>` : ''}
          <div class="flex-between bold" style="font-size: 13px; margin: 4px 0;"><span>RENTAL TOTAL:</span><span>${formatMoney(data.totalPaisa ?? data.subtotalPaisa)}</span></div>
          <div class="divider"></div>
          ${data.depositPaisa ? `<div class="flex-between"><span>Security Bond:</span><span>${formatMoney(data.depositPaisa)}</span></div>` : ''}
          ${data.advancePaisa ? `<div class="flex-between"><span>Advance Paid:</span><span>${formatMoney(data.advancePaisa)}</span></div>` : ''}
          ${data.outstandingPaisa !== undefined ? `<div class="flex-between bold"><span>BALANCE DUE:</span><span>${formatMoney(data.outstandingPaisa)}</span></div>` : ''}
        `
            : ''
        }

        <div class="double-divider"></div>

        <div style="font-size: 9px; line-height: 1.2; margin-top: 6px;">
          * All equipment checked & verified in operational condition upon handover.<br/>
          * Hirer is liable for damages, missing components or overdue daily rates.
        </div>

        <div style="margin-top: 24px;" class="flex-between">
          <div style="border-top: 1px solid #000; width: 45%; text-align: center; font-size: 9px; padding-top: 3px;">
            Client Signature
          </div>
          <div style="border-top: 1px solid #000; width: 45%; text-align: center; font-size: 9px; padding-top: 3px;">
            Staff: ${data.operatorName || 'Babin HQ'}
          </div>
        </div>

        <div class="center" style="margin-top: 14px; font-size: 9px;">
          Thank you for choosing Babin Rentals!
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
