import { useState } from 'react'
import { Modal } from './Modal'
import { CalendarPopover } from './DateField'
import { formatAd } from '../../lib/bs'

export interface CheckAvailabilityModalProps {
  open: boolean
  onClose: () => void
  productTitle?: string
  productRate?: string
  productDescription?: string
  stockOnHand?: number
  initialQuantity?: number
  initialRange?: { from: string; to: string }
  availability?: Record<string, number>
  onApplyRange?: (range: { from: string; to: string }, quantity: number) => void
  products?: Array<{ id: string; name: string; totalQuantity?: number | undefined; dailyRate?: number | undefined; description?: string | undefined }>
  selectedProductId?: string
  onProductChange?: (productId: string) => void
}

/**
 * Check Availability Modal — reproduces the Booqable product availability
 * inspection popover with quantity selection, color-coded per-day stock badges,
 * and continuous range selection.
 */
export function CheckAvailabilityModal({
  open,
  onClose,
  productTitle,
  productRate,
  productDescription,
  stockOnHand,
  initialQuantity = 1,
  initialRange,
  availability,
  onApplyRange,
  products,
  selectedProductId,
  onProductChange,
}: CheckAvailabilityModalProps) {
  const [range, setRange] = useState<{ from: string; to: string }>(initialRange ?? { from: '', to: '' })
  const [qty, setQty] = useState<number>(initialQuantity)
  const [selectedId, setSelectedId] = useState<string>(selectedProductId ?? (products?.[0]?.id ?? ''))

  if (!open) return null

  const activeProduct = products?.find((p) => p.id === (selectedId || selectedProductId))
  const resolvedTitle = productTitle || activeProduct?.name || 'Check availability'
  const resolvedRate = productRate || (activeProduct?.dailyRate ? `NPR ${activeProduct.dailyRate.toLocaleString()} / day` : undefined)
  const resolvedDesc = productDescription || activeProduct?.description
  const resolvedStock = stockOnHand !== undefined ? stockOnHand : activeProduct?.totalQuantity

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={resolvedTitle}
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Product selector dropdown if products list provided */}
        {products && products.length > 0 && (
          <div>
            <label
              htmlFor="check-avail-product-select"
              style={{ display: 'block', fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}
            >
              Select product
            </label>
            <select
              id="check-avail-product-select"
              value={selectedId}
              onChange={(e) => {
                const val = e.target.value
                setSelectedId(val)
                onProductChange?.(val)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta, 13px)',
                fontFamily: 'inherit',
                minHeight: 44,
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.totalQuantity !== undefined ? `(${p.totalQuantity} total)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Product meta header */}
        <div>
          {resolvedRate && (
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              {resolvedRate}
            </div>
          )}
          {resolvedDesc && (
            <p style={{ margin: '0 0 10px', fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', lineHeight: 1.5 }}>
              {resolvedDesc}
            </p>
          )}
          {resolvedStock !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  borderRadius: 'var(--r-full, 9999px)',
                  background: 'var(--badge-success-bg, rgba(72, 187, 120, 0.15))',
                  color: 'var(--success-text, #22543d)',
                  fontSize: 'var(--t-meta, 12px)',
                  fontWeight: 700,
                }}
              >
                {resolvedStock} available
              </span>
            </div>
          )}
        </div>

        {/* Embedded Calendar Popover with relative positioning */}
        <div style={{ position: 'relative', width: '100%' }}>
          <CalendarPopover
            title="Check availability"
            range={range}
            onSelectRange={setRange}
            quantity={qty}
            onQuantityChange={setQty}
            showQuantity={true}
            availability={availability}
            onDismiss={onClose}
            clearable={true}
          />
        </div>

        {/* Selected range feedback */}
        {range.from && range.to && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            <div>
              <span style={{ color: 'var(--muted)', marginRight: 6 }}>Selected:</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                {range.from === range.to
                  ? formatAd(new Date(range.from))
                  : `${formatAd(new Date(range.from))} → ${formatAd(new Date(range.to))}`}
              </span>
            </div>
            {onApplyRange && (
              <button
                type="button"
                className="press"
                onClick={() => {
                  onApplyRange(range, qty)
                  onClose()
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: 'var(--btn-primary-bg, #3182ce)',
                  color: 'var(--btn-primary-fg, #ffffff)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                Apply Range
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
