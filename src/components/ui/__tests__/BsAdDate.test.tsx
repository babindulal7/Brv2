// @vitest-environment jsdom
/**
 * `BsAdDate` must never present a Gregorian date as the BS answer.
 *
 * This is `E-P0-1`'s render half (`PLAN.md` §4.34/§4.35). `lib/bs.ts` can only
 * convert inside Shrawan 2083 — 16 Jul 2026 through **16 Aug 2026** — and
 * returns null outside it, deliberately, because the NCDC month-length table is
 * published data that is not in this workspace. The component used to render
 * `bsFormatted || adFormatted`, so from 17 Aug 2026 onward every BS-primary
 * slot in the app silently filled with an **untagged AD date**.
 *
 * These tests are written around the cliff on purpose: one date on each side of
 * it, so the day the month-length table lands, the second group starts failing
 * and tells whoever seeded it that conversion now reaches further. That is the
 * intended signal, not a flake — update the dates, do not delete the assertion.
 *
 * Environment pragma per `vitest.config.ts`. Real `lib/bs.ts` is used, not
 * mocked: mocking the converter would test the mock's fallback, not the app's.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BsAdDate, type BsAdDateProps } from '../BsAdDate'
import { BS_MONTHS } from '../../../lib/bs'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

/** Last day `lib/bs.ts` can vouch for: day 32 of Shrawan 2083. */
const INSIDE = new Date('2026-08-16T04:00:00Z')
/** First day it cannot — 1 Bhadra 2083, the month no data here describes. */
const OUTSIDE = new Date('2026-08-17T04:00:00Z')

const LAYOUTS: NonNullable<BsAdDateProps['layout']>[] = ['stacked', 'inline', 'bs-only']

async function mount(props: BsAdDateProps) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<BsAdDate {...props} />)
  })
  return container.textContent ?? ''
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('BsAdDate inside the convertible month', () => {
  it.each(LAYOUTS)('%s renders real Bikram Sambat and no AD tag', async (layout) => {
    const text = await mount({ date: INSIDE, layout })
    expect(text).toContain('Shrawan 2083 BS')
    // The tag is for the failure case only — its presence here would mean the
    // component had stopped trusting a conversion that actually succeeded.
    // Substring, not `\bAD\b`: `textContent` concatenates the tag straight onto
    // the year ("…2026AD"), so there is no word boundary to anchor to. No AD/BS
    // month abbreviation contains the pair, so the substring is unambiguous.
    expect(text).not.toContain('AD')
    expect(container.querySelector('[title]')).toBeNull()
  })
})

describe('BsAdDate past the cliff — the defect this file exists to pin', () => {
  it.each(LAYOUTS)('%s never shows a bare Gregorian date in the BS slot', async (layout) => {
    const text = await mount({ date: OUTSIDE, layout })

    // The conversion genuinely failed, so no BS date may be invented. Asserted
    // as "no fabricated BS date", NOT as "the letters BS are absent": a layout
    // is free to say *"BS unavailable"*, which is the honest statement this fix
    // exists to make. Checking for the bare substring would forbid the cure
    // along with the disease — it did, on the first run of this file.
    expect(text).not.toMatch(/\d+\s+\w+\s+20\d\d\s*BS/)
    for (const month of BS_MONTHS) expect(text).not.toContain(month)

    // The date is still shown — blanking it would lose information the operator
    // needs — but it is tagged, so it cannot read as the BS answer.
    expect(text).toContain('17 Aug 2026')
    expect(text).toContain('AD')
  })

  it.each(LAYOUTS)('%s explains itself on hover rather than failing silently', async (layout) => {
    await mount({ date: OUTSIDE, layout })
    const titled = container.querySelector('[title]')
    expect(titled).not.toBeNull()
    // Matched loosely on purpose — the wording of the reason is a copy decision
    // and may be revised; that it names the calendar and reaches the DOM is not.
    expect(titled?.getAttribute('title')).toContain('Bikram Sambat')
    expect(titled?.getAttribute('title')).toContain('AD')
  })

  it('suppresses the AD parenthetical rather than printing the date twice', async () => {
    const text = await mount({ date: OUTSIDE, layout: 'inline' })
    expect(text.match(/17 Aug 2026/g)).toHaveLength(1)
  })
})

describe('BsAdDate ad-only is untouched', () => {
  it('carries no tag on either side of the cliff — the caller asked for AD', async () => {
    const inside = await mount({ date: INSIDE, layout: 'ad-only' })
    expect(inside).toContain('16 Aug 2026')
    expect(inside).not.toContain('AD')
    act(() => root.unmount())
    container.remove()

    const outside = await mount({ date: OUTSIDE, layout: 'ad-only' })
    expect(outside).toContain('17 Aug 2026')
    expect(outside).not.toContain('AD')
  })
})

describe('BsAdDate absent and invalid input', () => {
  it.each([null, undefined, 'not-a-date'])('renders an em dash for %s', async (date) => {
    const text = await mount({ date: date as BsAdDateProps['date'] })
    expect(text.trim()).toBe('—')
  })
})
