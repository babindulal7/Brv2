import { describe, it, expect } from 'vitest'
// Vite `?raw` imports, NOT node:fs. This project ships no `@types/node`, so
// `readFileSync`/`__dirname` typecheck as errors even though vitest would run
// them fine — and `npm run typecheck` is a gate here. `?raw` is typed by
// `vite/client` (see src/vite-env.d.ts) and works identically under vitest.
import responsiveCss from '../../styles/responsive.css?inline'
import indexHtml from '../../../index.html?raw'
import { BP, MQ, TEST_WIDTHS, viewportFor } from '../breakpoints'

/**
 * The breakpoints exist in three places that cannot import each other:
 *
 *   lib/breakpoints.ts     TypeScript, for the hooks
 *   styles/responsive.css  CSS, for the layout rules
 *   index.html             a pre-paint script, for the first frame
 *
 * CSS cannot import TS and the inline script cannot import either, so the
 * duplication is unavoidable. These tests make it *guarded* instead of
 * *hoped*: change 1280 in one place and the suite says which others moved.
 *
 * This is the exact failure mode the file is aimed at — `device.ts` carried
 * 1180 while the spec said 1280, and ~95 comments across the app went on
 * describing 1180 for weeks, because nothing compared them.
 */
describe('breakpoints — one pair of numbers, three files', () => {
  it('is 768 / 1280 per DESIGN_DIRECTION_SPEC_v4.1 §7.7', () => {
    expect(BP.phone).toBe(768)
    expect(BP.desktop).toBe(1280)
  })

  it('classifies each spec test width into the band the spec intends', () => {
    // 1194 is the case that forced 1280: an iPad Pro 11" in landscape is a
    // TABLET. Under the superseded 1180 threshold it resolved to desktop and
    // was served hover affordances and mouse-sized targets, on a held device.
    expect(viewportFor(390)).toBe('phone')
    expect(viewportFor(800)).toBe('tablet')
    expect(viewportFor(1194)).toBe('tablet')
    expect(viewportFor(1280)).toBe('desktop') // tested ON the boundary
    expect(viewportFor(1920)).toBe('desktop')
  })

  it('is exclusive and exhaustive at the boundaries', () => {
    expect(viewportFor(BP.phone - 1)).toBe('phone')
    expect(viewportFor(BP.phone)).toBe('tablet')
    expect(viewportFor(BP.desktop - 1)).toBe('tablet')
    expect(viewportFor(BP.desktop)).toBe('desktop')
  })

  it('ships every width the spec says to test at', () => {
    expect([...TEST_WIDTHS]).toEqual([390, 800, 1194, 1280, 1920])
  })

  it('responsive.css uses the SAME numbers as breakpoints.ts', () => {
    const widths = [...responsiveCss.matchAll(/\((?:max|min)-width:\s*(\d+)px\)/g)].map((m) =>
      Number(m[1]),
    )
    expect(widths.length).toBeGreaterThan(0)

    const allowed = new Set([BP.phone, BP.phone - 1, BP.desktop, BP.desktop - 1])
    const strays = [...new Set(widths)].filter((w) => !allowed.has(w))
    expect(
      strays,
      `responsive.css uses breakpoint value(s) not derived from BP: ${strays.join(', ')}. ` +
        `Allowed: ${[...allowed].sort((a, b) => a - b).join(', ')}.`,
    ).toEqual([])
  })

  it('the index.html pre-paint script uses the SAME numbers', () => {
    // The pre-paint band must agree with the hooks, or the first painted frame
    // disagrees with the frame React renders and the whole page re-lays-out.
    expect(indexHtml).toContain(`w < ${BP.phone}`)
    expect(indexHtml).toContain(`w < ${BP.desktop}`)
    expect(indexHtml).toContain(`(min-width: ${BP.desktop}px)`)
    expect(indexHtml).toContain(`(max-width: ${BP.phone - 1}px)`)
  })

  it('MQ strings are derived, never retyped', () => {
    expect(MQ.phone).toBe(`(max-width: ${BP.phone - 1}px)`)
    expect(MQ.desktop).toBe(`(min-width: ${BP.desktop}px)`)
    expect(MQ.tablet).toBe(`(min-width: ${BP.phone}px) and (max-width: ${BP.desktop - 1}px)`)
  })
})
