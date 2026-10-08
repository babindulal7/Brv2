/**
 * **Asset Tag & Thermal Label Printing Engine**
 *
 * Generates pixel-perfect thermal barcode labels for equipment, serialized units,
 * flightcases, and cables. Includes an embedded, lightweight Code 128 barcode
 * generator that outputs clean SVG vectors with zero external runtime dependencies.
 */

export type LabelPreset = 'standard' | 'case' | 'cable'

export interface LabelDimensions {
  widthMm: number
  heightMm: number
  name: string
  description: string
}

export const LABEL_PRESETS: Record<LabelPreset, LabelDimensions> = {
  standard: {
    widthMm: 50,
    heightMm: 25,
    name: '50mm × 25mm (2" × 1")',
    description: 'Standard equipment & camera bodies',
  },
  case: {
    widthMm: 70,
    heightMm: 35,
    name: '70mm × 35mm (Case Tag)',
    description: 'Flightcases, pelicans & kit bags',
  },
  cable: {
    widthMm: 30,
    heightMm: 15,
    name: '30mm × 15mm (Accessory Tag)',
    description: 'Cables, batteries & small accessories',
  },
}

export interface LabelData {
  assetCode: string
  title: string
  subtitle?: string | undefined
  serialNo?: string | undefined
  barcodeValue: string
  orgName?: string | undefined
}

// Code 128B pattern table (values 0..106)
// Each pattern is an array of 6 bar/space widths that sum to 11 modules
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0..9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10..19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20..29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30..39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40..49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50..59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60..69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70..79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80..89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90..99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100..106 (106 is STOP)
]

const START_B = 104
const STOP = 106

/**
 * Generates an SVG barcode string for Code 128 (Subset B)
 */
export function generateCode128Svg(text: string, height = 40): string {
  const clean = text.replace(/[^\x20-\x7E]/g, '')
  if (!clean) return '<svg></svg>'

  const values: number[] = [START_B]
  let checkSum = START_B

  for (let i = 0; i < clean.length; i++) {
    const codeVal = clean.charCodeAt(i) - 32
    values.push(codeVal)
    checkSum += codeVal * (i + 1)
  }

  const checkDigit = checkSum % 103
  values.push(checkDigit)
  values.push(STOP)

  let patternStr = ''
  for (const val of values) {
    patternStr += CODE128_PATTERNS[val] || '212222'
  }

  // Draw bars
  let x = 0
  let isBar = true
  const rects: string[] = []

  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i] || '1', 10)
    if (isBar) {
      rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000" />`)
    }
    x += width
    isBar = !isBar
  }

  const totalWidth = x
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" preserveAspectRatio="none">${rects.join('')}</svg>`
}

/**
 * Generates complete printable HTML document for thermal label printing.
 */
export function generateLabelHtml(data: LabelData, preset: LabelPreset = 'standard'): string {
  const dim = LABEL_PRESETS[preset]
  const barcodeSvg = generateCode128Svg(data.barcodeValue, preset === 'cable' ? 24 : 36)
  const org = data.orgName || 'BABIN RENTALS OS · KATHMANDU'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Label — ${data.assetCode}</title>
<style>
  @page {
    size: ${dim.widthMm}mm ${dim.heightMm}mm;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: ${dim.widthMm}mm;
    height: ${dim.heightMm}mm;
    background: #ffffff;
    color: #000000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
    padding: ${preset === 'cable' ? '1.5mm 2mm' : '2.5mm 3mm'};
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 1.5px;
    margin-bottom: 2px;
  }
  .org-name {
    font-size: ${preset === 'cable' ? '6px' : '7.5px'};
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .asset-code {
    font-family: "Courier New", Courier, monospace;
    font-size: ${preset === 'cable' ? '8px' : '10px'};
    font-weight: 900;
  }
  .title-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }
  .title {
    font-size: ${preset === 'cable' ? '8px' : preset === 'case' ? '12px' : '10px'};
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    font-size: ${preset === 'cable' ? '6.5px' : '8px'};
    color: #333;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barcode-wrap {
    width: 100%;
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .barcode-text {
    font-family: "Courier New", Courier, monospace;
    font-size: ${preset === 'cable' ? '6.5px' : '8px'};
    font-weight: 700;
    letter-spacing: 1px;
    margin-top: 1px;
  }
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <div class="header">
    <span class="org-name">${org}</span>
    <span class="asset-code">${data.assetCode}</span>
  </div>
  <div class="title-block">
    <div class="title">${data.title}</div>
    ${data.subtitle || data.serialNo ? `<div class="subtitle">${data.subtitle || ''}${data.serialNo ? ` · SN: ${data.serialNo}` : ''}</div>` : ''}
  </div>
  <div class="barcode-wrap">
    ${barcodeSvg}
    <div class="barcode-text">${data.barcodeValue}</div>
  </div>
</body>
</html>`
}

/**
 * Triggers direct browser printing for the label.
 */
export function printLabel(data: LabelData, preset: LabelPreset = 'standard'): void {
  const html = generateLabelHtml(data, preset)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(html)
  doc.close()

  iframe.contentWindow?.focus()
  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 250)
}
