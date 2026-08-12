// @vitest-environment jsdom
/**
 * # The filter panel, driven
 *
 * Every claim below was made in prose in the 12 Aug filter reconciliation and
 * asserted nowhere. They are the ones that decide whether the panel is usable
 * rather than merely present:
 *
 *  · **Zero layout cost.** The thing it replaced was a grid column that still
 *    held a 32px track when collapsed.
 *  · **Click-outside does NOT close it on desktop** — with a live list, every
 *    click on a row would dismiss the panel mid-filter. Escape and the close
 *    button do. (Filter System v1.0 §5 says desktop *may* close on outside
 *    click, and in the same breath that the table stays usable for context;
 *    only the non-closing reading satisfies its own sentence.)
 *  · **The scrim and the scroll lock are phone-only**, because a scrim dims
 *    exactly the rows the user is watching change.
 *  · §20's slide, §9's search-within-a-group, §10's option counts, §8's chip
 *    overflow.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ActiveFilterChips, FilterDrawer, FilterOptionList, type ActiveFilter } from '../FilterDrawer'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** `useViewport` reads width; `matchMedia` only has to exist and answer false. */
function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

let container: HTMLDivElement
let root: Root

function mount(node: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(node))
}

function rerender(node: React.ReactElement) {
  act(() => root.render(node))
}

beforeEach(() => setWidth(1280))

afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
  document.body.style.overflow = ''
})

const panel = () => container.querySelector<HTMLElement>('[role="dialog"]')
const scrim = () => container.querySelector<HTMLElement>('[aria-hidden="true"][style*="rgba"]')

describe('FilterDrawer — what it costs the page', () => {
  it('renders nothing at all while closed', () => {
    // The rail it replaced still held a 32px track collapsed, and stayed in the
    // page's grid so content could not reflow into the space.
    mount(<FilterDrawer id="f" open={false} onClose={() => {}}><p>facets</p></FilterDrawer>)
    expect(container.innerHTML).toBe('')
  })

  it('is fixed, so it occupies no layout space when open either', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}}><p>facets</p></FilterDrawer>)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.position).toBe('fixed')
  })
})

describe('FilterDrawer — desktop is non-modal, deliberately', () => {
  it('draws no scrim and does not lock the page scroll', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}}><p>facets</p></FilterDrawer>)
    expect(scrim()).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('does not claim aria-modal, because the page behind really is usable', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}}><p>facets</p></FilterDrawer>)
    expect(panel()?.getAttribute('aria-modal')).toBeNull()
  })

  it('lets clicks reach the list — the wrapper does not swallow them', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}}><p>facets</p></FilterDrawer>)
    const wrapper = container.firstElementChild as HTMLElement
    // Without this, the fixed full-screen wrapper would eat every click on the
    // rows the panel is filtering.
    expect(wrapper.style.pointerEvents).toBe('none')
    expect(panel()?.style.pointerEvents).toBe('auto')
  })

  it('closes on Escape', () => {
    let closed = false
    mount(<FilterDrawer id="f" open onClose={() => (closed = true)}><p>facets</p></FilterDrawer>)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(closed).toBe(true)
  })
})

describe('FilterDrawer — phone gets the modal treatment', () => {
  beforeEach(() => setWidth(420))

  it('draws a scrim that closes it, and locks the page scroll', () => {
    let closed = false
    mount(<FilterDrawer id="f" open onClose={() => (closed = true)}><p>facets</p></FilterDrawer>)
    expect(document.body.style.overflow).toBe('hidden')

    const s = scrim()
    expect(s).not.toBeNull()
    act(() => s!.click())
    // At phone width there is no "beside" — nothing is being covered that the
    // user could still be reading, so tapping away is the expected gesture.
    expect(closed).toBe(true)
  })

  it('claims aria-modal here, where it is true', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}}><p>facets</p></FilterDrawer>)
    expect(panel()?.getAttribute('aria-modal')).toBe('true')
  })
})

describe('FilterDrawer — §20, the slide', () => {
  it('slides in from the side it is anchored to', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}} side="left"><p>facets</p></FilterDrawer>)
    expect(panel()?.style.animation).toContain('drawer-in-left')

    rerender(<FilterDrawer id="f" open onClose={() => {}} side="right"><p>facets</p></FilterDrawer>)
    expect(panel()?.style.animation).toContain('drawer-in-right')
  })

  it('stays mounted long enough to slide back out', () => {
    // Unmounting on `open` alone is why a panel that slides in usually vanishes
    // instantly: there is nothing left on screen to animate.
    mount(<FilterDrawer id="f" open onClose={() => {}}><p>facets</p></FilterDrawer>)
    rerender(<FilterDrawer id="f" open={false} onClose={() => {}}><p>facets</p></FilterDrawer>)
    expect(panel()).not.toBeNull()
    expect(panel()?.style.animation).toContain('drawer-out-left')
  })
})

describe('FilterDrawer — the header count and the footer', () => {
  it('says how many rows match, and says so politely', () => {
    // The panel covers part of the list, so this number is what makes live
    // filtering legible while the rows behind it cannot be seen moving.
    mount(
      <FilterDrawer id="f" open onClose={() => {}} resultCount={45} noun="rentals">
        <p>facets</p>
      </FilterDrawer>,
    )
    const live = container.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toBe('45 rentals')
  })

  it('says Counting… rather than 0 while the count is unknown', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}} resultCount={null}><p>facets</p></FilterDrawer>)
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Counting…')
  })

  it('offers Clear all only once something is actually narrowing', () => {
    mount(<FilterDrawer id="f" open onClose={() => {}} activeCount={0} onClearAll={() => {}}><p>f</p></FilterDrawer>)
    expect(container.querySelector('footer')).toBeNull()

    rerender(<FilterDrawer id="f" open onClose={() => {}} activeCount={3} onClearAll={() => {}}><p>f</p></FilterDrawer>)
    expect(container.querySelector('footer')?.textContent).toBe('Clear all 3 filters')
  })

  it('swaps Clear all for §15 Apply when a page defers', () => {
    mount(
      <FilterDrawer id="f" open onClose={() => {}} activeCount={2} onClearAll={() => {}} apply={{ pendingCount: 3, onApply: () => {} }}>
        <p>f</p>
      </FilterDrawer>,
    )
    expect(container.querySelector('footer')?.textContent).toBe('Apply Filters (3)')
  })
})

const OPTIONS = ['Booked', 'Packed', 'Out', 'Returned', 'Closed', 'Cancelled'].map((value) => ({ value }))

describe('FilterOptionList — §9 search, §10 counts', () => {
  it('does NOT show a search box on a group short enough to read', () => {
    // Furniture on six options: a row of height and a tab stop to filter a list
    // you can already take in at a glance.
    mount(<FilterOptionList label="Stage" options={OPTIONS} selected={[]} onToggle={() => {}} />)
    expect(container.querySelector('input[type="search"]')).toBeNull()
  })

  it('shows it once the group is long enough to need it', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ value: `Category ${i}` }))
    mount(<FilterOptionList label="Category" options={many} selected={[]} onToggle={() => {}} />)
    expect(container.querySelector('input[type="search"]')).not.toBeNull()
  })

  it('narrows the OPTIONS, never the rows', () => {
    const many = [...OPTIONS, { value: 'Booked late' }, { value: 'Quoted' }, { value: 'Draft' }]
    mount(<FilterOptionList label="Stage" options={many} selected={[]} onToggle={() => {}} searchFrom={2} />)
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(search, 'book')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent)
    expect(labels).toEqual(['Booked', 'Booked late'])
  })

  it('renders no count column at all when the page did not ask for counts', () => {
    mount(<FilterOptionList label="Stage" options={OPTIONS} selected={[]} onToggle={() => {}} />)
    expect(container.querySelector('.figure')).toBeNull()
  })

  it('renders a count beside each option when it has one', () => {
    mount(
      <FilterOptionList
        label="Stage"
        options={[{ value: 'Booked', count: 45 }, { value: 'Packed', count: 0 }]}
        selected={[]}
        onToggle={() => {}}
      />,
    )
    expect([...container.querySelectorAll('.figure')].map((n) => n.textContent)).toEqual(['45', '0'])
  })

  it('draws an unknown count as a dash, never as 0', () => {
    // 0 says "clicking this empties the list". A failed count saying 0 is a lie
    // in the one direction that stops the operator looking.
    mount(
      <FilterOptionList label="Stage" options={[{ value: 'Booked', count: null }]} selected={[]} onToggle={() => {}} />,
    )
    expect(container.querySelector('.figure')?.textContent).toBe('—')
  })

  it('reports the toggled value', () => {
    const seen: string[] = []
    mount(<FilterOptionList label="Stage" options={OPTIONS} selected={['Packed']} onToggle={(v) => seen.push(v)} />)
    const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes[1]!.checked).toBe(true)
    act(() => boxes[0]!.click())
    expect(seen).toEqual(['Booked'])
  })
})

describe('ActiveFilterChips — §8', () => {
  const make = (n: number): ActiveFilter[] =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `Stage: S${i}`, onRemove: () => {} }))

  it('costs an unfiltered page no height', () => {
    mount(<ActiveFilterChips filters={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('collapses past four into +N more rather than wrapping to three rows', () => {
    // Wrapping would push the table down as far as the old rail pushed it sideways.
    mount(<ActiveFilterChips filters={make(7)} />)
    const more = [...container.querySelectorAll('button')].find((b) => b.textContent === '+3 more')
    expect(more).toBeDefined()
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(4)

    act(() => more!.click())
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(7)
  })

  it('lets one chip go without reopening the panel', () => {
    let removed = 0
    mount(<ActiveFilterChips filters={[{ key: 'k', label: 'Stage: Booked', onRemove: () => (removed += 1) }]} />)
    const x = container.querySelector<HTMLButtonElement>('button[aria-label="Remove filter Stage: Booked"]')
    expect(x).not.toBeNull()
    act(() => x!.click())
    expect(removed).toBe(1)
  })
})
