import { describe, it, expect } from 'vitest'
import {
  generateCode128Svg,
  generateLabelHtml,
  LABEL_PRESETS,
  type LabelData,
} from '../labelPrinter'

describe('Asset Tag & Thermal Label Printer', () => {
  it('defines the three standard label presets', () => {
    expect(LABEL_PRESETS.standard.widthMm).toBe(50)
    expect(LABEL_PRESETS.standard.heightMm).toBe(25)
    expect(LABEL_PRESETS.case.widthMm).toBe(70)
    expect(LABEL_PRESETS.case.heightMm).toBe(35)
    expect(LABEL_PRESETS.cable.widthMm).toBe(30)
    expect(LABEL_PRESETS.cable.heightMm).toBe(15)
  })

  it('generates a valid Code 128 SVG string', () => {
    const svg = generateCode128Svg('CAM-RED-001', 30)
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<rect')
    expect(svg).toContain('</svg>')
  })

  it('handles empty input gracefully', () => {
    const svg = generateCode128Svg('')
    expect(svg).toBe('<svg></svg>')
  })

  it('generates complete HTML document with print styling and metadata', () => {
    const data: LabelData = {
      assetCode: 'CAM-FX6-004',
      title: 'Sony FX6 Cinema Line',
      subtitle: 'Full Frame Cinema Camera',
      serialNo: '4001924',
      barcodeValue: 'CAM-FX6-004',
      orgName: 'BABIN RENTALS OS',
    }

    const html = generateLabelHtml(data, 'standard')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('CAM-FX6-004')
    expect(html).toContain('Sony FX6 Cinema Line')
    expect(html).toContain('4001924')
    expect(html).toContain('@page')
    expect(html).toContain('50mm 25mm')
    expect(html).toContain('<svg')
  })
})
