// @vitest-environment jsdom
/**
 * # The preview column must be the generator, not a picture of it
 *
 * `10_TOOLS.md` §10.6 draws `sequence │ prefix │ padding │ current │ preview`
 * and warns that *"editing a live sequence is gated and written to audit."*
 * That warning only means something if the column an operator reads before
 * editing agrees with `issue()` — the function every other module actually
 * mints identifiers through. A preview that disagrees with the generator is
 * worse than no preview: it invites an edit made against a string nothing will
 * ever produce.
 *
 * The wireframe's own row is `Booking │ BR │ 4 │ 0715 │ BR-2026-0715`.
 * `WIREFRAME_RULINGS_2026-08-12.md` §2 supersedes it — prefix plus raw counter,
 * **no year segment and no zero padding** — and additionally records that `BR`
 * was never a booking prefix at all (`numbering.ts:210` reserves it as the
 * BRANCH token). So the last test here asserts the *absence* of the form the
 * spec still draws, because that is the one a future session is most likely to
 * "restore" from the wireframe.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'
import {
  SEQUENCES,
  issue,
  paddingOf,
  UNCONFIGURED_CODES,
  PREVIEW_YEAR,
  PREVIEW_MONTH,
  PREVIEW_DAY,
} from '../../../data/numbering'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: NumberingSequences } = await import('../NumberingSequences')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    /* `Rail`/`SideRail` wrap `CollapsibleAside`, which keys its collapse state
       on `useLocation().pathname` — so the page needs a router even though it
       navigates nowhere. */
    root.render(
      <MemoryRouter>
        <NumberingSequences />
      </MemoryRouter>,
    )
  })
}

/** The identifier this row's stored counter denotes, straight from the engine. */
function expectedPreview(code: string): string | null {
  const row = SEQUENCES.find((s) => s.code === code)
  if (!row || !row.format || row.counter === null) return null
  return issue(code, Number(row.counter), {
    year: PREVIEW_YEAR,
    month: PREVIEW_MONTH,
    day: PREVIEW_DAY,
    branchCode: 'KTM',
    warehouseCode: 'MAIN',
  })
}

beforeEach(() => {
  viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Numbering — the preview column is issue()', () => {
  it('renders, for every configured sequence on the first page, exactly what issue() produces', async () => {
    await mount()
    const text = container.textContent ?? ''

    /* The table pages at 10; assert against the rows that are actually on
       screen rather than against all nineteen. */
    const onScreen = SEQUENCES.slice(0, 10).filter((s) => s.format !== null && s.counter !== null)
    expect(onScreen.length).toBeGreaterThan(0)

    for (const s of onScreen) {
      const preview = expectedPreview(s.code)
      expect(preview, `${s.code} has a format and a counter`).not.toBeNull()
      expect(text, `${s.code} preview column`).toContain(preview as string)
    }
  })

  it('shows the ruled six as prefix + raw counter, with no year and no padding', async () => {
    await mount()
    const text = container.textContent ?? ''

    /* The four of the ruled six that sit on the first page of the table. */
    expect(text).toContain('B-4861')
    expect(text).toContain('INV-492')
    expect(text).toContain('C-2481')

    /* Padding 1 IS "no padding" — `padTo(715, 1)` is `'715'`, because padStart
       never truncates. Assert the column reports it. */
    expect(paddingOf('B-N')).toBe(1)
    expect(paddingOf('INV-N')).toBe(1)
  })

  it('never renders the superseded BR-YYYY-NNNN booking form the wireframe still draws', async () => {
    await mount()
    const text = container.textContent ?? ''
    expect(text).not.toContain('BR-2026-0715')
    /* `BR-` may still appear as the BRANCH token's documentation; what must not
       appear is a BR-prefixed *identifier* with a year and a padded counter. */
    expect(text).not.toMatch(/BR-\d{4}-\d{4}/)
    expect(text).not.toContain('B-0001')
    expect(text).not.toContain('B-004861')
  })

  it('names the unconfigured sequences instead of inventing a format for them', async () => {
    await mount()
    const text = container.textContent ?? ''
    /* They sit on page 2 of the table, so the assertion is on the derived
       footnote that explains them — which is where the reasoning belongs
       anyway, once rather than as a tooltip on every cell. */
    expect(UNCONFIGURED_CODES.length).toBeGreaterThan(0)
    expect(text).toContain(UNCONFIGURED_CODES.join(' · '))
    expect(text).toContain('Nothing is invented in their place')
  })

  it('renders no AI panel — Law 16', async () => {
    await mount()
    const text = container.textContent ?? ''
    expect(text).not.toContain('AI Numbering Insights')
    expect(text).not.toContain('Run AI Analysis')
  })

  it('phone renders one card per sequence with the preview under the fields', async () => {
    viewport = 'phone'
    await mount()
    const text = container.textContent ?? ''
    expect(text).toContain('Preview')
    expect(text).toContain('Padding')
    expect(text).toContain('B-4861')
  })
})
