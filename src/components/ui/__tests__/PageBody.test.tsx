// @vitest-environment jsdom
/**
 * `PageBody`'s precedence, driven rather than read.
 *
 * The component has exactly one job — restricted → error → loading → empty →
 * children — and a regression in that order is close to invisible in review:
 * every branch renders *something*, so a wrong order still looks like a working
 * screen. These tests turn all the flags on at once and switch them off one at
 * a time, which is the only way to prove precedence rather than reachability.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`
 * and documents this opt-in. Real `StateViews` are rendered, not mocked — the
 * point is that the props `PageBody` passes actually reach them.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PageBody, type PageBodyProps } from '../PageBody'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

const HAPPY = 'THE-REAL-TABLE'

/** Every state switched on at once. Each test turns one off and re-asserts. */
const ALL_ON: PageBodyProps = {
  restricted: true,
  error: 'the database said no',
  loading: true,
  empty: true,
  noun: 'rentals',
  children: HAPPY,
}

async function mount(props: Partial<PageBodyProps>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<PageBody {...ALL_ON} {...props} />)
  })
}

/** What is on screen, identified by each state's own distinguishing mark. */
function shown() {
  const text = container.textContent ?? ''
  return {
    restricted: text.includes('Access restricted'),
    error: container.querySelector('[role="alert"]') !== null,
    loading: text.includes('Loading rentals…'),
    empty: text.includes('No rentals'),
    children: text.includes(HAPPY),
  }
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('PageBody precedence', () => {
  it('restricted outranks error, loading, empty and children', async () => {
    await mount({})
    expect(shown()).toEqual({
      restricted: true,
      error: false,
      loading: false,
      empty: false,
      children: false,
    })
  })

  it('error outranks loading, empty and children', async () => {
    await mount({ restricted: false })
    expect(shown()).toEqual({
      restricted: false,
      error: true,
      loading: false,
      empty: false,
      children: false,
    })
  })

  it('loading outranks empty and children', async () => {
    await mount({ restricted: false, error: null })
    expect(shown()).toEqual({
      restricted: false,
      error: false,
      loading: true,
      empty: false,
      children: false,
    })
  })

  it('empty outranks children', async () => {
    await mount({ restricted: false, error: null, loading: false })
    expect(shown()).toEqual({
      restricted: false,
      error: false,
      loading: false,
      empty: true,
      children: false,
    })
  })

  it('renders children once no state applies', async () => {
    await mount({ restricted: false, error: null, loading: false, empty: false })
    expect(shown()).toEqual({
      restricted: false,
      error: false,
      loading: false,
      empty: false,
      children: true,
    })
  })

  it('keeps the rows when the error is about a failed REFRESH', async () => {
    // `useList` deliberately preserves rows when a refetch fails; this component
    // used to discard them anyway, so a background failure replaced a working
    // table with a full-page error. `hasRows` is how it now knows better.
    // Note what is asserted alongside: loading and empty are still outranked, so
    // the ladder is unchanged — only the SHAPE of the error state moved.
    await mount({ restricted: false, hasRows: true })
    expect(shown()).toEqual({
      restricted: false,
      error: true,
      loading: false,
      empty: false,
      children: true,
    })
  })

  it('still replaces everything when the FIRST load failed', async () => {
    // The other half of the same claim: with nothing underneath it there is
    // nothing to protect, and the full-page error is correct.
    await mount({ restricted: false, hasRows: false })
    expect(shown().children).toBe(false)
    expect(shown().error).toBe(true)
  })

  it('does not let rows outrank a restricted role', async () => {
    // Law-6-shaped: a role that may not see this data must not be shown rows
    // because an error happened to arrive with them.
    await mount({ hasRows: true })
    expect(shown()).toEqual({
      restricted: true,
      error: false,
      loading: false,
      empty: false,
      children: false,
    })
  })

  it('treats an empty-string error as no error', async () => {
    // `useList` clears to `null`, but a screen mapping its own error state can
    // easily hold ''. Falling into the error branch with an empty message would
    // render a blank red banner over a working table.
    await mount({ restricted: false, error: '', loading: false, empty: false })
    expect(shown().error).toBe(false)
    expect(shown().children).toBe(true)
  })
})

describe('PageBody state content', () => {
  it('names the role to ask for on the restricted state', async () => {
    await mount({ restrictedReason: 'Warehouse cannot see money.', restrictedRequiredRole: 'Owner' })
    expect(container.textContent).toContain('Warehouse cannot see money.')
    expect(container.textContent).toContain('Requires Owner')
  })

  it('falls back to RestrictedState own default when no reason is given', async () => {
    // Proves the conditional spread, not just the prop name: passing
    // `reason={undefined}` explicitly would blank this sentence.
    await mount({})
    expect(container.textContent).toContain('do not have permission')
  })

  it('offers Retry only when a handler exists', async () => {
    await mount({ restricted: false })
    expect(container.textContent).toContain('the database said no')
    expect(container.textContent).not.toContain('Retry')

    await act(async () => {
      root.render(<PageBody {...ALL_ON} restricted={false} onRetry={() => {}} />)
    })
    expect(container.textContent).toContain('Retry')
  })

  it('offers Retry over surviving rows too', async () => {
    // The shape a failed refresh takes is the one most likely to be retried.
    await mount({ restricted: false, hasRows: true, onRetry: () => {} })
    expect(container.textContent).toContain('Retry')
    expect(container.textContent).toContain(HAPPY)
  })

  it('composes the failure sentence itself, from a bare reason', async () => {
    // The contract with `useList`: `error` is the REASON, this component writes
    // the title. Both halves used to write a sentence, so the operator read
    // "Could not load rentals" over "Could not load rentals. <detail>".
    await mount({ restricted: false, error: 'JWT expired' })
    const text = container.textContent ?? ''
    expect(text.match(/Could not load rentals/g)).toHaveLength(1)
    expect(text).toContain('JWT expired')
  })

  it('says refresh rather than load when the rows are already on screen', async () => {
    // "Could not load rentals" above a visible table of rentals is a
    // contradiction; the rows are real, they are just not up to date.
    await mount({ restricted: false, error: 'JWT expired', hasRows: true })
    const text = container.textContent ?? ''
    expect(text).toContain('Could not refresh rentals')
    expect(text).not.toContain('Could not load rentals')
    expect(text).toContain(HAPPY)
  })

  it('asks the filtered and unfiltered empty questions differently', async () => {
    const base = { restricted: false, error: null, loading: false } as const

    await mount({ ...base, emptyIsFiltered: true, onClearFilters: () => {} })
    expect(container.textContent).toContain('No rentals match these filters')
    expect(container.textContent).toContain('Clear filters')

    await act(async () => {
      root.render(
        <PageBody {...ALL_ON} {...base} emptyActionLabel="Add rental" onEmptyAction={() => {}}>
          {HAPPY}
        </PageBody>,
      )
    })
    expect(container.textContent).toContain('No rentals yet')
    expect(container.textContent).toContain('Add rental')
    expect(container.textContent).not.toContain('Clear filters')
  })

  it('withholds the empty-state action unless both label and handler are given', async () => {
    await mount({ restricted: false, error: null, loading: false, emptyActionLabel: 'Add rental' })
    expect(container.textContent).toContain('No rentals yet')
    expect(container.textContent).not.toContain('Add rental')
  })
})
