/**
 * # Pure-TypeScript PDF 1.4 Binary Generator
 *
 * Synthesizes standard, valid PDF 1.4 binary documents (A4 commercial invoices,
 * rental agreements, handover slips) with zero runtime dependencies.
 *
 * Complies with the PDF 1.4 specification:
 *  - Header with binary marker (%PDF-1.4)
 *  - Standard object catalog, pages, font dictionaries (Helvetica, Helvetica-Bold, Courier)
 *  - Content stream with text positioning, line drawing, and table styling
 *  - Exact 20-byte fixed-width cross-reference (xref) table
 *  - Trailer dictionary with Root, Info, and startxref pointer
 */

import { formatMoney, type Paisa } from '../money.ts'

export interface InvoicePdfLine {
  description: string
  serialNo?: string
  quantity: number
  rentalDays?: number
  ratePaisa?: Paisa | number
  totalPaisa: Paisa | number
}

export interface InvoicePdfData {
  invoiceNo?: string | null
  documentTitle?: string
  status?: string
  issueDateAd?: string | null
  dueDateAd?: string | null
  bookingNo?: string | null
  client: {
    name: string
    phone?: string | null
    email?: string | null
    address?: string | null
    panVat?: string | null
  }
  company?: {
    name?: string
    panVat?: string
    address?: string
    phone?: string
    email?: string
  }
  lines: InvoicePdfLine[]
  subtotalPaisa: Paisa | number
  discountPercent?: number | null
  discountPaisa?: Paisa | number | null
  taxablePaisa: Paisa | number
  vatPercent?: number | null
  vatPaisa: Paisa | number
  totalPaisa: Paisa | number
  paidPaisa?: Paisa | number | null
  outstandingPaisa?: Paisa | number | null
  notes?: string | null
}

export interface DocumentPdfData {
  documentNo: string
  title: string
  docType: string
  clientName?: string | null
  bookingNo?: string | null
  dateAd?: string | null
  contentParagraphs?: string[]
  notes?: string | null
}

/**
 * Escapes characters for PDF literal string syntax: ( ... ).
 * Escapes `\`, `(`, `)` and maps non-ASCII characters to safe ASCII.
 */
function escapePdfText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\u2010-\u2015]/g, '-') // Normalize dashes
    .replace(/[\u2018\u2019]/g, "'") // Normalize smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Normalize smart double quotes
    .replace(/[^\x20-\x7E]/g, ' ') // Strip non-printable / non-ASCII for Type1 font safety
}

function formatPaisaOrZero(amount?: Paisa | number | null): string {
  if (amount === undefined || amount === null) return '—'
  return formatMoney(amount as Paisa)
}

/**
 * Low-level PDF builder that manages objects and generates compliant PDF bytes.
 */
class PdfDocumentBuilder {
  private objects: string[] = []
  private offsets: number[] = []

  addObject(content: string): number {
    this.objects.push(content.trim())
    return this.objects.length // 1-based object number
  }

  build(): Uint8Array {
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    this.offsets = []

    for (let i = 0; i < this.objects.length; i++) {
      const objNum = i + 1
      this.offsets.push(pdf.length)
      pdf += `${objNum} 0 obj\n${this.objects[i]}\nendobj\n`
    }

    const startxref = pdf.length
    const size = this.objects.length + 1

    pdf += 'xref\n'
    pdf += `0 ${size}\n`
    pdf += '0000000000 65535 f \n'

    for (let i = 0; i < this.offsets.length; i++) {
      const offsetStr = String(this.offsets[i]).padStart(10, '0')
      pdf += `${offsetStr} 00000 n \n`
    }

    pdf += 'trailer\n'
    pdf += `<<\n  /Size ${size}\n  /Root 1 0 R\n  /Info ${this.objects.length} 0 R\n>>\n`
    pdf += 'startxref\n'
    pdf += `${startxref}\n`
    pdf += '%%EOF\n'

    return new TextEncoder().encode(pdf)
  }
}

/**
 * Generates an A4 commercial invoice PDF as standard binary bytes.
 */
export function generateInvoicePdf(data: InvoicePdfData): Uint8Array {
  const builder = new PdfDocumentBuilder()

  // Colors
  const darkSlate = '0.09 0.13 0.24' // #17213c
  const mutedText = '0.38 0.44 0.52' // #617084
  const borderGray = '0.80 0.84 0.88' // #ccd6e0
  const bgLight = '0.96 0.97 0.98' // #f5f7fa

  const docTitle = data.documentTitle || (data.status === 'Draft' ? 'DRAFT INVOICE' : 'TAX INVOICE')
  const invNo = data.invoiceNo || 'DRAFT (NO NUMBER)'
  const bookingNo = data.bookingNo || '—'
  const issueDate = data.issueDateAd || new Date().toISOString().slice(0, 10)
  const dueDate = data.dueDateAd || 'Due on Receipt'

  const companyName = data.company?.name || 'BABIN RENTALS KATHMANDU'
  const companyVat = data.company?.panVat || 'VAT: 601234567'
  const companyAddr = data.company?.address || 'Kathmandu, Nepal'
  const companyPhone = data.company?.phone || '+977-1-4400000'

  const streamOps: string[] = []

  // Top header accent band
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 802 515 6 re f`)

  // Company Name & Info
  streamOps.push(`BT /F2 16 Tf 40 776 Td (${escapePdfText(companyName)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 40 762 Td (${escapePdfText(`${companyVat} · ${companyAddr} · ${companyPhone}`)}) Tj ET`)
  streamOps.push(`BT /F1 9 Tf 40 750 Td (Professional Camera, Lighting & Audio Systems) Tj ET`)

  // Document Title (Top Right)
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 18 Tf 380 776 Td (${escapePdfText(docTitle)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F3 11 Tf 380 760 Td (${escapePdfText(invNo)}) Tj ET`)
  if (data.status) {
    const statusText = `STATUS: ${data.status.toUpperCase()}`
    streamOps.push(`BT /F2 9 Tf 380 746 Td (${escapePdfText(statusText)}) Tj ET`)
  }

  // Header Divider
  streamOps.push(`${borderGray} RG 0.75 w`)
  streamOps.push(`40 735 m 555 735 l S`)

  // Bill To & Invoice Info Blocks (y: 720 to 650)
  streamOps.push(`${bgLight} rg`)
  streamOps.push(`40 655 245 70 re f`)
  streamOps.push(`310 655 245 70 re f`)
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 655 245 70 re S`)
  streamOps.push(`310 655 245 70 re S`)

  // Bill To content
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 9 Tf 50 710 Td (BILLED TO:) Tj ET`)
  streamOps.push(`BT /F2 10 Tf 50 696 Td (${escapePdfText(data.client.name)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  if (data.client.phone) {
    streamOps.push(`BT /F1 8.5 Tf 50 684 Td (Phone: ${escapePdfText(data.client.phone)}) Tj ET`)
  }
  if (data.client.email) {
    streamOps.push(`BT /F1 8.5 Tf 50 673 Td (Email: ${escapePdfText(data.client.email)}) Tj ET`)
  }
  if (data.client.panVat) {
    streamOps.push(`BT /F1 8.5 Tf 50 662 Td (PAN/VAT: ${escapePdfText(data.client.panVat)}) Tj ET`)
  }

  // Invoice Details content
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 9 Tf 320 710 Td (RENTAL REFERENCE:) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 320 696 Td (Booking Reference: ) Tj /F3 9 Tf (${escapePdfText(bookingNo)}) Tj ET`)
  streamOps.push(`BT /F1 9 Tf 320 682 Td (Issue Date: ${escapePdfText(issueDate)}) Tj ET`)
  streamOps.push(`BT /F1 9 Tf 320 668 Td (Due Date: ${escapePdfText(dueDate)}) Tj ET`)

  // Items Table Header
  const tableTopY = 635
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 ${tableTopY - 18} 515 20 re f`)
  streamOps.push(`1 1 1 rg`) // White text
  streamOps.push(`BT /F2 8.5 Tf 48 ${tableTopY - 13} Td (#) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 75 ${tableTopY - 13} Td (DESCRIPTION / ASSET) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 290 ${tableTopY - 13} Td (QTY) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 340 ${tableTopY - 13} Td (DAYS) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 395 ${tableTopY - 13} Td (RATE) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 475 ${tableTopY - 13} Td (TOTAL (NPR)) Tj ET`)

  // Line items
  let curY = tableTopY - 20
  const maxRows = Math.min(data.lines.length, 12)

  for (let i = 0; i < maxRows; i++) {
    const line = data.lines[i]
    if (!line) continue
    curY -= 22
    const rowBg = i % 2 === 1 ? bgLight : '1 1 1'
    streamOps.push(`${rowBg} rg`)
    streamOps.push(`40 ${curY} 515 22 re f`)
    streamOps.push(`${borderGray} RG 0.5 w`)
    streamOps.push(`40 ${curY} 515 22 re S`)

    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F1 8.5 Tf 48 ${curY + 7} Td (${i + 1}) Tj ET`)

    const itemDesc = line.description.length > 35 ? line.description.slice(0, 32) + '…' : line.description
    streamOps.push(`BT /F2 8.5 Tf 75 ${curY + 11} Td (${escapePdfText(itemDesc)}) Tj ET`)
    if (line.serialNo) {
      streamOps.push(`${mutedText} rg`)
      streamOps.push(`BT /F3 7 Tf 75 ${curY + 2} Td (S/N: ${escapePdfText(line.serialNo)}) Tj ET`)
      streamOps.push(`${darkSlate} rg`)
    }

    streamOps.push(`BT /F1 8.5 Tf 295 ${curY + 7} Td (${line.quantity}) Tj ET`)
    streamOps.push(`BT /F1 8.5 Tf 345 ${curY + 7} Td (${line.rentalDays ?? 1}) Tj ET`)
    streamOps.push(`BT /F1 8.5 Tf 395 ${curY + 7} Td (${escapePdfText(formatPaisaOrZero(line.ratePaisa))}) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 475 ${curY + 7} Td (${escapePdfText(formatPaisaOrZero(line.totalPaisa))}) Tj ET`)
  }

  // Financial summary block
  const summaryBoxY = curY - 10
  const sumLeft = 320
  const sumWidth = 235

  streamOps.push(`${bgLight} rg`)
  streamOps.push(`${sumLeft} ${summaryBoxY - 110} ${sumWidth} 110 re f`)
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`${sumLeft} ${summaryBoxY - 110} ${sumWidth} 110 re S`)

  const addSummaryRow = (label: string, value: string, yOffset: number, bold = false) => {
    streamOps.push(bold ? `${darkSlate} rg` : `${mutedText} rg`)
    streamOps.push(`BT /${bold ? 'F2' : 'F1'} 8.5 Tf ${sumLeft + 12} ${summaryBoxY - yOffset} Td (${escapePdfText(label)}) Tj ET`)
    streamOps.push(bold ? `${darkSlate} rg` : `${mutedText} rg`)
    streamOps.push(`BT /${bold ? 'F2' : 'F1'} 8.5 Tf ${sumLeft + 140} ${summaryBoxY - yOffset} Td (${escapePdfText(value)}) Tj ET`)
  }

  addSummaryRow('Subtotal:', formatPaisaOrZero(data.subtotalPaisa), 18)
  if (data.discountPaisa && Number(data.discountPaisa) > 0) {
    const discLabel = data.discountPercent ? `Discount (${data.discountPercent}%):` : 'Discount:'
    addSummaryRow(discLabel, `-${formatPaisaOrZero(data.discountPaisa)}`, 32)
  }
  addSummaryRow('Taxable Amount:', formatPaisaOrZero(data.taxablePaisa), 46)
  addSummaryRow('VAT (13%):', formatPaisaOrZero(data.vatPaisa), 60)

  // Grand Total highlight bar
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`${sumLeft} ${summaryBoxY - 88} ${sumWidth} 24 re f`)
  streamOps.push(`1 1 1 rg`)
  streamOps.push(`BT /F2 10 Tf ${sumLeft + 12} ${summaryBoxY - 76} Td (TOTAL AMOUNT:) Tj ET`)
  streamOps.push(`BT /F2 10 Tf ${sumLeft + 135} ${summaryBoxY - 76} Td (${escapePdfText(formatPaisaOrZero(data.totalPaisa))}) Tj ET`)

  // Outstanding / Paid balance
  addSummaryRow('Paid Amount:', formatPaisaOrZero(data.paidPaisa || 0), 98)
  addSummaryRow('Outstanding Balance:', formatPaisaOrZero(data.outstandingPaisa ?? data.totalPaisa), 108, true)

  // Notes and payment details (left of summary box)
  if (data.notes) {
    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F2 8.5 Tf 40 ${summaryBoxY - 18} Td (NOTES & REMARKS:) Tj ET`)
    streamOps.push(`${mutedText} rg`)
    const cleanNotes = escapePdfText(data.notes).slice(0, 120)
    streamOps.push(`BT /F1 8 Tf 40 ${summaryBoxY - 32} Td (${cleanNotes}) Tj ET`)
  }

  // Legal and banking footer
  const footerY = 90
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 ${footerY} 515 0.5 re S`)

  // Signature lines
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`40 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 40 ${footerY - 45} Td (Prepared By / Warehouse Staff) Tj ET`)

  streamOps.push(`405 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 405 ${footerY - 45} Td (Client / Authorized Signatory) Tj ET`)

  streamOps.push(`BT /F1 7.5 Tf 175 25 Td (Thank you for choosing Babin Rentals. Generated by Babin Rentals OS.) Tj ET`)

  const contentStream = streamOps.join('\n')

  // Construct PDF Objects
  // 1. Catalog
  builder.addObject(`<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>`)

  // 2. Pages
  builder.addObject(`<<\n  /Type /Pages\n  /Kids [3 0 R]\n  /Count 1\n>>`)

  // 3. Page
  builder.addObject(
    `<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 595.28 841.89]\n  /Contents 4 0 R\n  /Resources <<\n    /Font <<\n      /F1 5 0 R\n      /F2 6 0 R\n      /F3 7 0 R\n    >>\n  >>\n>>`
  )

  // 4. Content Stream
  builder.addObject(`<<\n  /Length ${contentStream.length}\n>>\nstream\n${contentStream}\nendstream`)

  // 5. Helvetica
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>`)

  // 6. Helvetica-Bold
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>`)

  // 7. Courier
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Courier\n  /Encoding /WinAnsiEncoding\n>>`)

  // 8. Info
  builder.addObject(
    `<<\n  /Title (${escapePdfText(docTitle)} - ${escapePdfText(invNo)})\n  /Author (${escapePdfText(companyName)})\n  /Creator (Babin Rentals OS PDF Engine)\n  /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)\n>>`
  )

  return builder.build()
}

/**
 * Generates an A4 operational or commercial document PDF.
 */
export function generateDocumentPdf(data: DocumentPdfData): Uint8Array {
  const builder = new PdfDocumentBuilder()

  const darkSlate = '0.09 0.13 0.24'
  const mutedText = '0.38 0.44 0.52'
  const borderGray = '0.80 0.84 0.88'

  const streamOps: string[] = []

  // Top header accent
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 802 515 6 re f`)

  // Header Title & Doc No
  streamOps.push(`BT /F2 16 Tf 40 776 Td (BABIN RENTALS KATHMANDU) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 40 762 Td (Document Registry · Commercial & Operations) Tj ET`)

  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 16 Tf 380 776 Td (${escapePdfText(data.docType.toUpperCase())}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F3 11 Tf 380 760 Td (${escapePdfText(data.documentNo)}) Tj ET`)

  // Divider
  streamOps.push(`${borderGray} RG 0.75 w`)
  streamOps.push(`40 740 m 555 740 l S`)

  // Title
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 14 Tf 40 710 Td (${escapePdfText(data.title)}) Tj ET`)

  // Metadata line
  streamOps.push(`${mutedText} rg`)
  const metaLine = `Client: ${data.clientName || 'General'} | Booking: ${data.bookingNo || '—'} | Date: ${data.dateAd || new Date().toISOString().slice(0, 10)}`
  streamOps.push(`BT /F1 9 Tf 40 690 Td (${escapePdfText(metaLine)}) Tj ET`)

  // Content Paragraphs
  let curY = 660
  const paragraphs = data.contentParagraphs || [
    'This document certifies the registration and execution of the specified commercial and operational terms.',
    'Equipment listed under this agreement remains the sole property of Babin Rentals Kathmandu.',
    'All parties agree to the standard terms of rental, maintenance, and insurance.',
  ]

  for (const para of paragraphs) {
    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F1 9.5 Tf 40 ${curY} Td (${escapePdfText(para)}) Tj ET`)
    curY -= 28
  }

  // Footer & Signatures
  const footerY = 120
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 ${footerY} 515 0.5 re S`)

  streamOps.push(`40 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 40 ${footerY - 45} Td (Authorized Signatory) Tj ET`)

  streamOps.push(`405 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 405 ${footerY - 45} Td (Client Representative) Tj ET`)

  streamOps.push(`BT /F1 7.5 Tf 175 25 Td (Official record produced by Babin Rentals OS.) Tj ET`)

  const contentStream = streamOps.join('\n')

  builder.addObject(`<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>`)
  builder.addObject(`<<\n  /Type /Pages\n  /Kids [3 0 R]\n  /Count 1\n>>`)
  builder.addObject(
    `<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 595.28 841.89]\n  /Contents 4 0 R\n  /Resources <<\n    /Font <<\n      /F1 5 0 R\n      /F2 6 0 R\n      /F3 7 0 R\n    >>\n  >>\n>>`
  )
  builder.addObject(`<<\n  /Length ${contentStream.length}\n>>\nstream\n${contentStream}\nendstream`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Courier\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(
    `<<\n  /Title (${escapePdfText(data.title)})\n  /Creator (Babin Rentals OS PDF Engine)\n  /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)\n>>`
  )

  return builder.build()
}
