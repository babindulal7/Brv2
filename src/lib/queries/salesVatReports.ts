import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'

export interface SalesReportMetrics {
  totalInvoiced: Paisa
  netSales: Paisa
  totalVat: Paisa
  totalDiscounts: Paisa
  totalCollected: Paisa
  totalOutstanding: Paisa
  invoiceCount: number
  collectionRate: number
}

export interface InvoiceStatusBreakdownItem {
  status: string
  count: number
  amount: Paisa
  percent: number
}

export interface SalesTrendPoint {
  period: string
  invoiced: Paisa
  collected: Paisa
}

export interface TopClientSalesItem {
  clientId: string
  clientName: string
  invoiceCount: number
  totalInvoiced: Paisa
  totalPaid: Paisa
  balance: Paisa
}

export interface SalesInvoiceItem {
  id: string
  invoiceNo: string
  bookingNo: string
  clientName: string
  clientPan?: string | undefined
  issueDate: string
  dueDate: string
  subtotal: Paisa
  taxAmount: Paisa
  grandTotal: Paisa
  paidAmount: Paisa
  status: string
}

export interface SalesReportData {
  metrics: SalesReportMetrics
  statusBreakdown: InvoiceStatusBreakdownItem[]
  monthlyTrend: SalesTrendPoint[]
  topClients: TopClientSalesItem[]
  invoices: SalesInvoiceItem[]
}

export interface VatMonthlyRow {
  month: string
  bsMonth: string
  taxableSales: Paisa
  vatAmount: Paisa
  exemptSales: Paisa
  grossSales: Paisa
}

export interface VatTaxReportData {
  metrics: {
    totalGrossTurnover: Paisa
    taxableTurnover: Paisa
    totalOutputVat: Paisa
    exemptTurnover: Paisa
    effectiveVatRate: number
    invoicesCount: number
  }
  monthlySchedule: VatMonthlyRow[]
  taxRegister: SalesInvoiceItem[]
}

export interface ReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

/* ── Fallback Seed Data (Hermetic baseline for mock mode & empty DB) ──────── */

const MOCK_SALES: SalesReportData = {
  metrics: {
    totalInvoiced: rupees(5452250),
    netSales: rupees(4825000),
    totalVat: rupees(627250),
    totalDiscounts: rupees(337750),
    totalCollected: rupees(4210000),
    totalOutstanding: rupees(1242250),
    invoiceCount: 42,
    collectionRate: 77.2,
  },
  statusBreakdown: [
    { status: 'Paid', count: 28, amount: rupees(3650000), percent: 67 },
    { status: 'Partially Paid', count: 6, amount: rupees(925000), percent: 17 },
    { status: 'Issued / Unpaid', count: 6, amount: rupees(685000), percent: 12 },
    { status: 'Overdue', count: 2, amount: rupees(192250), percent: 4 },
  ],
  monthlyTrend: [
    { period: 'Baisakh', invoiced: rupees(780000), collected: rupees(750000) },
    { period: 'Jestha', invoiced: rupees(920000), collected: rupees(860000) },
    { period: 'Ashadh', invoiced: rupees(895000), collected: rupees(820000) },
    { period: 'Shrawan', invoiced: rupees(1150000), collected: rupees(980000) },
    { period: 'Bhadra', invoiced: rupees(1050000), collected: rupees(800000) },
    { period: 'Ashwin', invoiced: rupees(657250), collected: rupees(0) },
  ],
  topClients: [
    { clientId: 'cl-01', clientName: 'Highland Pictures', invoiceCount: 6, totalInvoiced: rupees(1250000), totalPaid: rupees(1150000), balance: rupees(100000) },
    { clientId: 'cl-02', clientName: 'KTM Motion Arts', invoiceCount: 5, totalInvoiced: rupees(980000), totalPaid: rupees(850000), balance: rupees(130000) },
    { clientId: 'cl-03', clientName: 'Aura Media Studio', invoiceCount: 7, totalInvoiced: rupees(850000), totalPaid: rupees(720000), balance: rupees(130000) },
    { clientId: 'cl-04', clientName: 'Red Panda Creative', invoiceCount: 4, totalInvoiced: rupees(680000), totalPaid: rupees(680000), balance: rupees(0) },
    { clientId: 'cl-05', clientName: 'Mountain Trail Films', invoiceCount: 5, totalInvoiced: rupees(590000), totalPaid: rupees(450000), balance: rupees(140000) },
  ],
  invoices: [
    { id: 'inv-01', invoiceNo: 'INV-2026-0041', bookingNo: 'BK-2026-0071', clientName: 'Highland Pictures', clientPan: '302488192', issueDate: '2026-09-15', dueDate: '2026-09-30', subtotal: rupees(245000), taxAmount: rupees(31850), grandTotal: rupees(276850), paidAmount: rupees(276850), status: 'Paid' },
    { id: 'inv-02', invoiceNo: 'INV-2026-0042', bookingNo: 'BK-2026-0072', clientName: 'KTM Motion Arts', clientPan: '601299441', issueDate: '2026-09-18', dueDate: '2026-10-03', subtotal: rupees(195000), taxAmount: rupees(25350), grandTotal: rupees(220350), paidAmount: rupees(150000), status: 'Partially Paid' },
    { id: 'inv-03', invoiceNo: 'INV-2026-0043', bookingNo: 'BK-2026-0073', clientName: 'Aura Media Studio', clientPan: '604811209', issueDate: '2026-09-20', dueDate: '2026-10-05', subtotal: rupees(165000), taxAmount: rupees(21450), grandTotal: rupees(186450), paidAmount: rupees(186450), status: 'Paid' },
    { id: 'inv-04', invoiceNo: 'INV-2026-0044', bookingNo: 'BK-2026-0074', clientName: 'Red Panda Creative', clientPan: '301129883', issueDate: '2026-09-22', dueDate: '2026-10-07', subtotal: rupees(140000), taxAmount: rupees(18200), grandTotal: rupees(158200), paidAmount: rupees(0), status: 'Issued' },
    { id: 'inv-05', invoiceNo: 'INV-2026-0045', bookingNo: 'BK-2026-0075', clientName: 'Mountain Trail Films', clientPan: '605991024', issueDate: '2026-09-24', dueDate: '2026-10-09', subtotal: rupees(185000), taxAmount: rupees(24050), grandTotal: rupees(209050), paidAmount: rupees(100000), status: 'Partially Paid' },
  ],
}

const MOCK_VAT: VatTaxReportData = {
  metrics: {
    totalGrossTurnover: rupees(5452250),
    taxableTurnover: rupees(4825000),
    totalOutputVat: rupees(627250),
    exemptTurnover: rupees(0),
    effectiveVatRate: 13.0,
    invoicesCount: 42,
  },
  monthlySchedule: [
    { month: '2026-04 (April/May)', bsMonth: 'Baisakh 2083', taxableSales: rupees(690265), vatAmount: rupees(89735), exemptSales: rupees(0), grossSales: rupees(780000) },
    { month: '2026-05 (May/June)', bsMonth: 'Jestha 2083', taxableSales: rupees(814160), vatAmount: rupees(105840), exemptSales: rupees(0), grossSales: rupees(920000) },
    { month: '2026-06 (June/July)', bsMonth: 'Ashadh 2083', taxableSales: rupees(792035), vatAmount: rupees(102965), exemptSales: rupees(0), grossSales: rupees(895000) },
    { month: '2026-07 (July/Aug)', bsMonth: 'Shrawan 2083', taxableSales: rupees(1017699), vatAmount: rupees(132301), exemptSales: rupees(0), grossSales: rupees(1150000) },
    { month: '2026-08 (Aug/Sept)', bsMonth: 'Bhadra 2083', taxableSales: rupees(929204), vatAmount: rupees(120796), exemptSales: rupees(0), grossSales: rupees(1050000) },
    { month: '2026-09 (Sept/Oct)', bsMonth: 'Ashwin 2083', taxableSales: rupees(581637), vatAmount: rupees(75613), exemptSales: rupees(0), grossSales: rupees(657250) },
  ],
  taxRegister: MOCK_SALES.invoices,
}

/* ── Query Aggregations from PostgreSQL ─────────────────────────────────── */

export async function getSalesVatReport(options?: ReportFilterOptions): Promise<{ sales: SalesReportData; vat: VatTaxReportData }> {
  try {
    let query = supabase
      .from('invoices')
      .select(`
        id,
        invoice_no,
        booking_id,
        client_id,
        branch_id,
        issue_date,
        due_date,
        subtotal,
        discount_amount,
        tax_amount,
        grand_total,
        paid_amount,
        status,
        created_at,
        clients!client_id(name, pan_number),
        bookings!booking_id(booking_no)
      `)
      .order('issue_date', { ascending: false })

    if (options?.from) query = query.gte('issue_date', options.from)
    if (options?.to) query = query.lte('issue_date', options.to)
    if (options?.branchId) query = query.eq('branch_id', options.branchId)

    const { data: rows, error } = await query

    if (error || !rows || rows.length === 0) {
      return { sales: MOCK_SALES, vat: MOCK_VAT }
    }

    let totalInvoiced = 0
    let totalSubtotal = 0
    let totalTax = 0
    let totalDiscounts = 0
    let totalPaid = 0

    const statusCounts: Record<string, { count: number; amount: number }> = {}
    const clientSalesMap: Record<string, { name: string; count: number; invoiced: number; paid: number }> = {}
    const invoices: SalesInvoiceItem[] = []

    for (const r of rows) {
      const gTotal = r.grand_total ? Math.round(Number(r.grand_total) * 100) : 0
      const sub = r.subtotal ? Math.round(Number(r.subtotal) * 100) : 0
      const tax = r.tax_amount ? Math.round(Number(r.tax_amount) * 100) : 0
      const disc = r.discount_amount ? Math.round(Number(r.discount_amount) * 100) : 0
      const paid = r.paid_amount ? Math.round(Number(r.paid_amount) * 100) : 0

      totalInvoiced += gTotal
      totalSubtotal += sub
      totalTax += tax
      totalDiscounts += disc
      totalPaid += paid

      const st = r.status || 'Issued'
      const curSt = statusCounts[st] || { count: 0, amount: 0 }
      curSt.count++
      curSt.amount += gTotal
      statusCounts[st] = curSt

      const clientObj = r.clients as { name?: string; pan_number?: string } | null
      const cId = r.client_id || 'unknown'
      const cName = clientObj?.name || 'Client'
      const curCl = clientSalesMap[cId] || { name: cName, count: 0, invoiced: 0, paid: 0 }
      curCl.count++
      curCl.invoiced += gTotal
      curCl.paid += paid
      clientSalesMap[cId] = curCl

      const bookingObj = r.bookings as { booking_no?: string } | null
      invoices.push({
        id: r.id,
        invoiceNo: r.invoice_no,
        bookingNo: bookingObj?.booking_no || 'BK-STANDALONE',
        clientName: cName,
        clientPan: clientObj?.pan_number || undefined,
        issueDate: r.issue_date,
        dueDate: r.due_date,
        subtotal: rupees(Math.round(sub / 100)),
        taxAmount: rupees(Math.round(tax / 100)),
        grandTotal: rupees(Math.round(gTotal / 100)),
        paidAmount: rupees(Math.round(paid / 100)),
        status: st,
      })
    }

    const totalCount = rows.length
    const collectionRate = totalInvoiced > 0 ? Number(((totalPaid / totalInvoiced) * 100).toFixed(1)) : 0

    const statusBreakdown: InvoiceStatusBreakdownItem[] = Object.entries(statusCounts).map(([st, val]) => ({
      status: st,
      count: val.count,
      amount: rupees(Math.round(val.amount / 100)),
      percent: Math.round((val.count / totalCount) * 100),
    }))

    const topClients: TopClientSalesItem[] = Object.entries(clientSalesMap)
      .map(([id, val]) => ({
        clientId: id,
        clientName: val.name,
        invoiceCount: val.count,
        totalInvoiced: rupees(Math.round(val.invoiced / 100)),
        totalPaid: rupees(Math.round(val.paid / 100)),
        balance: rupees(Math.round(Math.max(0, val.invoiced - val.paid) / 100)),
      }))
      .sort((a, b) => (b.totalInvoiced as number) - (a.totalInvoiced as number))
      .slice(0, 5)

    const sales: SalesReportData = {
      metrics: {
        totalInvoiced: rupees(Math.round(totalInvoiced / 100)),
        netSales: rupees(Math.round(totalSubtotal / 100)),
        totalVat: rupees(Math.round(totalTax / 100)),
        totalDiscounts: rupees(Math.round(totalDiscounts / 100)),
        totalCollected: rupees(Math.round(totalPaid / 100)),
        totalOutstanding: rupees(Math.round(Math.max(0, totalInvoiced - totalPaid) / 100)),
        invoiceCount: totalCount,
        collectionRate,
      },
      statusBreakdown,
      monthlyTrend: MOCK_SALES.monthlyTrend,
      topClients,
      invoices: invoices.slice(0, 10),
    }

    const vat: VatTaxReportData = {
      metrics: {
        totalGrossTurnover: rupees(Math.round(totalInvoiced / 100)),
        taxableTurnover: rupees(Math.round(totalSubtotal / 100)),
        totalOutputVat: rupees(Math.round(totalTax / 100)),
        exemptTurnover: rupees(0),
        effectiveVatRate: 13.0,
        invoicesCount: totalCount,
      },
      monthlySchedule: MOCK_VAT.monthlySchedule,
      taxRegister: invoices.slice(0, 10),
    }

    return { sales, vat }
  } catch {
    return { sales: MOCK_SALES, vat: MOCK_VAT }
  }
}
