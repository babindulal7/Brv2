import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Page'
import Icon from './Icon'
import {
  type LabelData,
  type LabelPreset,
  LABEL_PRESETS,
  generateCode128Svg,
  printLabel,
} from '../../lib/labelPrinter'

export interface PrintLabelModalProps {
  isOpen: boolean
  onClose: () => void
  labelData: LabelData
}

export function PrintLabelModal({ isOpen, onClose, labelData }: PrintLabelModalProps) {
  const [preset, setPreset] = useState<LabelPreset>('standard')
  const dim = LABEL_PRESETS[preset]

  const barcodeSvg = generateCode128Svg(labelData.barcodeValue, preset === 'cable' ? 24 : 36)

  const handlePrint = () => {
    printLabel(labelData, preset)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Thermal Asset Label"
      subtitle="Zebra / Dymo / Thermal ESC-POS direct printer layout"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Preset Selector */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              color: 'var(--text2)',
              marginBottom: 6,
            }}
          >
            Label Dimension Preset
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(Object.keys(LABEL_PRESETS) as LabelPreset[]).map((key) => {
              const p = LABEL_PRESETS[key]
              const active = preset === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--r-sm)',
                    border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? 'var(--nav-active-bg)' : 'var(--card2)',
                    color: active ? 'var(--primary)' : 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <div>{key.toUpperCase()}</div>
                  <div style={{ fontSize: '10px', opacity: 0.75, marginTop: 2 }}>
                    {p.widthMm}×{p.heightMm}mm
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Live Visual Preview */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              color: 'var(--text2)',
              marginBottom: 6,
            }}
          >
            Thermal Print Preview
          </label>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              background: '#e2e8f0',
              padding: 24,
                    borderRadius: 'var(--r-card)', // RULING 2026-09-23: --r-md never existed; --r-card is the canonical 10px
              minHeight: 180,
            }}
          >
            <div
              style={{
                width: `${dim.widthMm * 5}px`,
                height: `${dim.heightMm * 5}px`,
                background: '#ffffff',
                color: '#000000',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                overflow: 'hidden',
                borderRadius: 2,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  borderBottom: '1px solid #000',
                  paddingBottom: 2,
                }}
              >
                <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px' }}>
                  {labelData.orgName || 'BABIN RENTALS OS'}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 900 }}>
                  {labelData.assetCode}
                </span>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {labelData.title}
                </div>
                {(labelData.subtitle || labelData.serialNo) && (
                  <div style={{ fontSize: '9px', color: '#333', marginTop: 1 }}>
                    {labelData.subtitle || ''}
                    {labelData.serialNo ? ` · SN: ${labelData.serialNo}` : ''}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 2 }}>
                <div
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                  style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                />
                <span style={{ fontFamily: 'monospace', fontSize: '9px', fontWeight: 700, letterSpacing: '1px' }}>
                  {labelData.barcodeValue}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <Icon name="barcode" size={16} /> Print Thermal Tag
          </Button>
        </div>
      </div>
    </Modal>
  )
}
