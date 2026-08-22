// @vitest-environment jsdom
/**
 * # The preview column must be the generator, not a picture of it
 *
 * `10_TOOLS.md` §10.6 draws `sequence │ prefix │ padding │ current │ preview`
 * and warns that *"editing a live sequence is gated and written to audit."*
 * That warning only means something if the column an operator reads before
 * editing agrees with what `next_document_number()` will actually mint. A
 * preview that disagrees with the generator is worse than no preview: it
 * invites an edit made against a string nothing will ever produce.
 *
 * Since the 21 Aug live conversion the page reads the REAL `number_sequences`
 * registry (`lib/queries/numbering.ts`) and its Next Number column is
 * `previewNextNumber()` — a pure restatement of the RPC's formatting rules
 * over the fetched row (the RPC has no dry-run; calling it consumes a
 * number). So the property pinned here is: **every rendered next-number is
 * exactly `previewNextNumber(row)`** for the rows the query returned.
 *
 * The wireframe's own row is `Booking │ BR │ 4 │ 0715 │ BR-2026-0715`.
 * `WIREFRAME_RULINGS_2026-08-12.md` §2 supersedes it — prefix plus raw counter,
 * **no year segment and no zero padding** — and additionally records that `BR`
 * was never a booking prefix at all. So one test asserts the *absence* of the
 * form the spec still draws, because that is the one a future session is most
 * likely to "restore" from the wireframe.
 *
 * The query seam is mocked (`useList`), same boundary the other converted
 * screens' suites mock; the preview/format helpers stay REAL so the page and
 * the generator cannot be satisfied by the same wrong string.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'
import { previewNextNumber, formatConvention, type NumberSequenceRow } from '../../../lib/queries/numbering'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))

/* The registry read is staff-gated (`numberingRestriction`), so the page needs
   a signed-in role; Owner is the least interesting one to refuse. */
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

/**
 * The live registry's ruled shapes (0055/0056): the year-less six at padding 1
 * ("no padding" — `lpad` never truncates), payment still year-scoped at 4,
 * equipment separator-less at 6. Counters chosen so the ruled previews are
 * B-4861 / C-2481 / INV-492 — `current_value` is the LAST issued value and the
 * next mint returns `current_value + 1`.
 */
const ROWS: NumberSequenceRow[] = [
  { sequenceKey: 'booking', prefix: 'B-', currentYear: 2026, currentValue: 4860, padding: 1, includeYear: false, updatedAtAd: '2026-08-20T10:15:00.000Z' },
  { sequenceKey: 'client', prefix: 'C-', currentYear: 2026, currentValue: 2480, padding: 1, includeYear: false, updatedAtAd: '2026-08-19T08:00:00.000Z' },
  { sequenceKey: 'equipment', prefix: 'EQ', currentYear: 2026, currentValue: 823, padding: 6, includeYear: false, updatedAtAd: '2026-08-18T06:30:00.000Z' },
  { sequenceKey: 'invoice', prefix: 'INV-', currentYear: 2026, currentValue: 491, padding: 1, includeYear: false, updatedAtAd: '2026-08-21T04:45:00.000Z' },
  { sequenceKey: 'payment', prefix: 'PAY-', currentYear: 2026, currentValue: 122, padding: 4, includeYear: true, updatedAtAd: '2026-08-17T12:00:00.000Z' },
]

vi.mock('../../../lib/queries/useList', () => ({
  useList: () => ({
    rows: ROWS,
    loading: false,
    error: null,
    isEmpty: false,
    isFiltered: false,
    total: ROWS.length,
    refetch: () => {},
  }),
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

beforeEach(() => {
  viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Numbering — the Next Number column is previewNextNumber()', () => {
  it('renders, for every sequence the query returned, exactly what the generator restatement produces', async () => {
    await mount()
    const text = container.textContent ?? ''

    for (const row of ROWS) {
      const preview = previewNextNumber(row)
      expect(text, `${row.sequenceKey} next-number column`).toContain(preview)
      /* And the Format column is the same shape the RPC formats with. */
      expect(text, `${row.sequenceKey} format column`).toContain(formatConvention(row))
    }
  })

  it('shows the ruled sequences as prefix + raw counter, with no year and no padding', async () => {
    await mount()
    const text = container.textContent ?? ''

    expect(text).toContain('B-4861')
    expect(text).toContain('INV-492')
    expect(text).toContain('C-2481')

    /* Padding 1 IS "no padding" — `padTo(4861, 1)` is `'4861'`, because
       lpad never truncates. The generator agrees. */
    expect(previewNextNumber(ROWS[0]!)).toBe('B-4861')
    expect(formatConvention(ROWS[0]!)).toBe('B-N')
  })

  it('never renders the superseded BR-YYYY-NNNN booking form the wireframe still draws', async () => {
    await mount()
    const text = container.textContent ?? ''
    expect(text).not.toContain('BR-2026-0715')
    expect(text).not.toMatch(/BR-\d{4}-\d{4}/)
    /* A padded booking counter is the other half of the superseded form. */
    expect(text).not.toContain('B-0001')
    expect(text).not.toContain('B-004861')
  })

  it('renders no AI panel — Law 16', async () => {
    await mount()
    const text = container.textContent ?? ''
    expect(text).not.toContain('AI Numbering Insights')
    expect(text).not.toContain('Run AI Analysis')
  })

  it('states that only next_document_number() mints — the preview is read-only', async () => {
    await mount()
    expect(container.textContent).toContain('only next_document_number() mints')
  })

  it('phone renders one card per sequence with the next number under the fields', async () => {
    viewport = 'phone'
    await mount()
    const text = container.textContent ?? ''
    expect(text).toContain('Next number')
    expect(text).toContain('Padding')
    expect(text).toContain('B-4861')
  })
})
