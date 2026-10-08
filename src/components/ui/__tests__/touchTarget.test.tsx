// @vitest-environment jsdom
/**
 * Law 15 — minimum 44px interactive target, never relaxed — and the sharper
 * form `theme.css` states beside the token: *"the law is the HIT AREA, not the
 * paint."*
 *
 * ## Why this file exists
 *
 * `--tap: 44px` was defined in `theme.css` and referenced by **nothing** in
 * `src/`. A stated law with no enforcement anywhere drifted exactly as you would
 * expect: a UI/UX audit on 25 Aug 2026 found the four floor workspaces —
 * Return, Packing, Handover, Reset — each carrying a byte-identical private
 * `RowAction` at `height: 22`, half the floor, with no hit-area expansion. In
 * Return, "Mark Returned" sat 4px from "Not Returned": two opposite outcomes
 * sharing an edge, tapped with gloves on.
 *
 * A comment cannot stop that recurring. These tests can.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TouchTarget, CompactButton } from '../TouchTarget'

// Same flag the auth, settings and shell suites set. Without it React logs
// "the current testing environment is not configured to support act(...)"
// against every render, which buries a real failure in noise.
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<StrictMode>{node}</StrictMode>)
  })
}

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('TouchTarget — the hit area', () => {
  it('reads the --tap token rather than hard-coding 44', async () => {
    // The point of the extraction: one number, one place. A literal 44 here
    // would let the token and the code drift apart again.
    await mount(<TouchTarget />)
    const span = container.querySelector('span')!
    expect(span.style.height).toBe('var(--tap)')
    expect(span.style.width).toBe('max(100%, var(--tap))')
  })

  it('keeps a wider control at its own width and only inflates the short axis', async () => {
    // `max(100%, …)` not a flat 44 — a 120px-wide button must not be shrunk.
    await mount(<TouchTarget />)
    expect(container.querySelector('span')!.style.width).toContain('100%')
  })

  it('is hidden from assistive tech — it is a hit area, not content', async () => {
    await mount(<TouchTarget />)
    expect(container.querySelector('span')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('is centred on its parent, so the target grows in both directions', async () => {
    await mount(<TouchTarget />)
    const s = container.querySelector('span')!.style
    expect(s.position).toBe('absolute')
    expect(s.left).toBe('50%')
    expect(s.top).toBe('50%')
    expect(s.transform).toBe('translate(-50%, -50%)')
  })
})

describe('CompactButton — visually 22px, tappable at 44', () => {
  it('paints at 22px but carries the hit area', async () => {
    await mount(<CompactButton label="Mark Returned" onClick={() => {}} />)
    const btn = container.querySelector('button')!

    // The density the floor tables need...
    expect(btn.style.height).toBe('22px')
    // ...without giving up the law.
    const inset = btn.querySelector('span[aria-hidden="true"]')
    expect(inset).toBeTruthy()
    expect((inset as HTMLElement).style.height).toBe('var(--tap)')
  })

  it('is position:relative, or the absolute hit area would escape it', async () => {
    // The single easiest way to break this component while it still looks right.
    await mount(<CompactButton label="Undo" onClick={() => {}} />)
    expect(container.querySelector('button')!.style.position).toBe('relative')
  })

  it('is a real <button>, not a div with a handler', async () => {
    await mount(<CompactButton label="Start" onClick={() => {}} />)
    const btn = container.querySelector('button')!
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('type')).toBe('button')
  })

  it('fires onClick', async () => {
    let hits = 0
    await mount(<CompactButton label="Missing" onClick={() => { hits += 1 }} />)
    await act(async () => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(hits).toBe(1)
  })

  it('does not fire when disabled', async () => {
    let hits = 0
    await mount(<CompactButton label="Pass" disabled onClick={() => { hits += 1 }} />)
    const btn = container.querySelector('button')!
    expect(btn.disabled).toBe(true)
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(hits).toBe(0)
  })
})

describe('CompactButton — tone uses fills, not on-fill ink', () => {
  /*
   * `--st-in-fg` and `--st-danger-fg` are `--on-success` / `--on-danger`, and
   * BOTH resolve to #ffffff in either theme. They are the ink you put ON a solid
   * status block. Used as a border against `--card2` they render identically
   * white, which makes two opposite actions indistinguishable by colour.
   *
   * This component sits on `--card2`, so it must reach for the fills.
   */
  it('borders danger with --danger, never the white on-danger ink', async () => {
    await mount(<CompactButton label="Not Returned" tone="danger" onClick={() => {}} />)
    const border = container.querySelector('button')!.style.border
    expect(border).toContain('var(--danger)')
    expect(border).not.toContain('--st-danger-fg')
    expect(border).not.toContain('--on-danger')
  })

  it('borders success with --success, never the white on-success ink', async () => {
    await mount(<CompactButton label="Mark Returned" tone="success" onClick={() => {}} />)
    const border = container.querySelector('button')!.style.border
    expect(border).toContain('var(--success)')
    expect(border).not.toContain('--st-in-fg')
    expect(border).not.toContain('--on-success')
  })

  it('defaults to the neutral border', async () => {
    await mount(<CompactButton label="Undo" onClick={() => {}} />)
    expect(container.querySelector('button')!.style.border).toContain('var(--border)')
  })

  it('still carries the word, so colour is never the only signal (Law 11)', async () => {
    await mount(<CompactButton label="Not Returned" tone="danger" onClick={() => {}} />)
    expect(container.textContent).toContain('Not Returned')
  })
})
