import { describe, expect, it } from 'vitest'
import type { Paisa } from '../money'
import {
  productDepositPaisa,
  recommendedDepositWithProducts,
  unitDepositPaisa,
  type ProductDepositTerms,
} from '../productDeposit'

/* C6 — what a product itself asks as a security deposit. Figures are paisa. */

const T = (over: Partial<ProductDepositTerms>): ProductDepositTerms => ({
  fixedPaisa: null,
  percent: null,
  replacementPaisa: null,
  ...over,
})

describe('unitDepositPaisa — fixed wins, else percent of replacement, else nothing', () => {
  it('asks for nothing when the product has no terms or is unknown', () => {
    expect(unitDepositPaisa(undefined)).toBeNull()
    expect(unitDepositPaisa(T({}))).toBeNull()
  })

  it('uses the fixed deposit when set', () => {
    expect(unitDepositPaisa(T({ fixedPaisa: 1_000_000 }))).toBe(1_000_000)
  })

  it('prefers fixed over percent when both are set', () => {
    expect(unitDepositPaisa(T({ fixedPaisa: 1_000_000, percent: 50, replacementPaisa: 9_000_000 }))).toBe(1_000_000)
  })

  it('takes percent of the replacement value when there is no fixed deposit', () => {
    expect(unitDepositPaisa(T({ percent: 20, replacementPaisa: 5_000_000 }))).toBe(1_000_000)
  })

  it('asks for nothing from a percent with no replacement value, rather than guessing one', () => {
    expect(unitDepositPaisa(T({ percent: 20 }))).toBeNull()
    expect(unitDepositPaisa(T({ percent: 20, replacementPaisa: 0 }))).toBeNull()
  })

  it('treats zero and non-finite figures as unset', () => {
    expect(unitDepositPaisa(T({ fixedPaisa: 0 }))).toBeNull()
    expect(unitDepositPaisa(T({ fixedPaisa: Number.NaN }))).toBeNull()
    expect(unitDepositPaisa(T({ percent: 0, replacementPaisa: 5_000_000 }))).toBeNull()
  })
})

describe('productDepositPaisa — unit deposit × quantity over the physical lines', () => {
  const terms = new Map<string, ProductDepositTerms>([
    ['cam', T({ fixedPaisa: 2_000_000 })],
    ['lens', T({ percent: 10, replacementPaisa: 3_000_000 })],
    ['bare', T({})],
  ])

  it('multiplies by quantity and sums the lines', () => {
    const total = productDepositPaisa(
      [
        { productId: 'cam', qty: 2, lineType: 'Equipment' },
        { productId: 'lens', qty: 1, lineType: 'Equipment' },
      ],
      terms,
    )
    expect(total).toBe(4_300_000) // 2 × Rs 20,000 + Rs 3,000
  })

  it('is not multiplied by days: a deposit is held once', () => {
    expect(productDepositPaisa([{ productId: 'cam', qty: 1, lineType: 'Equipment' }], terms)).toBe(2_000_000)
  })

  it('counts a bundle’s included child lines (they are physical gear)', () => {
    expect(productDepositPaisa([{ productId: 'cam', qty: 1, lineType: 'Accessory' }], terms)).toBe(2_000_000)
  })

  it('ignores services, sub-rentals, manual items, bundle parents and lines with no product', () => {
    const total = productDepositPaisa(
      [
        { productId: 'cam', qty: 1, lineType: 'Service' },
        { productId: 'cam', qty: 1, lineType: 'Sub-rental' },
        { productId: 'cam', qty: 1, lineType: 'Manual item' },
        { productId: 'cam', qty: 1, lineType: 'Bundle' },
        { productId: null, qty: 3, lineType: 'Equipment' },
        { qty: 3 },
      ],
      terms,
    )
    expect(total).toBe(0)
  })

  it('skips an unknown product and a non-positive quantity', () => {
    expect(
      productDepositPaisa(
        [
          { productId: 'missing', qty: 1 },
          { productId: 'cam', qty: 0 },
          { productId: 'cam', qty: -1 },
          { productId: 'bare', qty: 5 },
        ],
        terms,
      ),
    ).toBe(0)
  })

  it('rounds to a whole rupee', () => {
    const odd = new Map([['x', T({ percent: 10, replacementPaisa: 123_456 })]]) // 12,345.6 paisa
    expect(productDepositPaisa([{ productId: 'x', qty: 1 }], odd)).toBe(12_300)
  })

  it('contributes nothing for a money-blind session, whose every term is null', () => {
    const masked = new Map([['cam', T({})]])
    expect(productDepositPaisa([{ productId: 'cam', qty: 4 }], masked)).toBe(0)
  })
})

describe('recommendedDepositWithProducts — raised, never lowered', () => {
  const flat = 500_000 as Paisa

  it('keeps the flat rule when the products ask for less or nothing', () => {
    expect(recommendedDepositWithProducts(flat, 0 as Paisa)).toBe(500_000)
    expect(recommendedDepositWithProducts(flat, 200_000 as Paisa)).toBe(500_000)
  })

  it('is raised to what the products ask when that is more', () => {
    expect(recommendedDepositWithProducts(flat, 4_300_000 as Paisa)).toBe(4_300_000)
  })
})
