// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Link, useLocation } from 'react-router-dom'
import { RecordWorkspace, RecordSection, RecordErrorSummary, RecordActions, useUnsavedRecord } from '../RecordWorkspace'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
Element.prototype.scrollIntoView = () => {}

let container: HTMLDivElement
let root: Root

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>)
  })
}
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  })
}
const frame = () => act(async () => { await new Promise((r) => setTimeout(r, 40)) })
const byText = (text: string, tag = 'button') => [...document.querySelectorAll(tag)].find((e) => e.textContent?.trim() === text)

describe('RecordSection + RecordErrorSummary', () => {
  beforeEach(async () => {
    await mount(
      <RecordWorkspace>
        <RecordErrorSummary errors={[{ id: 'record-notes', message: 'Notes are too long.' }]} />
        <RecordSection title="Identity">
          <input id="record-name" />
        </RecordSection>
        <RecordSection title="Notes" collapsible defaultOpen={false} collapsedHint="Empty">
          <textarea id="record-notes" defaultValue="kept" />
        </RecordSection>
      </RecordWorkspace>,
    )
  })

  it('essential sections are always open; optional empty ones start collapsed with a hint', () => {
    const sections = [...container.querySelectorAll<HTMLElement>('[data-record-section]')]
    expect(sections.map((s) => s.dataset.open)).toEqual(['true', 'false'])
    expect(byText('Expand · Empty')).toBeDefined()
    expect(byText('Expand · Empty')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('a collapsed section keeps its entered values mounted', () => {
    expect((container.querySelector('#record-notes') as HTMLTextAreaElement).value).toBe('kept')
  })

  it('clicking an error opens the collapsed section that holds the field and focuses it', async () => {
    await click(byText('Notes are too long.'))
    await frame()
    const sections = [...container.querySelectorAll<HTMLElement>('[data-record-section]')]
    expect(sections[1]!.dataset.open).toBe('true')
    expect(document.activeElement?.id).toBe('record-notes')
  })

  it('the toggle collapses and re-expands by keyboard-reachable button', async () => {
    const toggle = byText('Expand · Empty')
    await click(toggle)
    expect(byText('Collapse')!.getAttribute('aria-expanded')).toBe('true')
    await click(byText('Collapse'))
    expect(container.querySelectorAll<HTMLElement>('[data-record-section]')[1]!.dataset.open).toBe('false')
  })

  it('announces the error list as an alert with a count', () => {
    const alert = container.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('Check these fields (1)')
  })
})

describe('RecordActions + unsaved-change guard', () => {
  function Screen({ dirty }: { dirty: boolean }) {
    const [saved, setSaved] = useState(0)
    useUnsavedRecord(dirty)
    const location = useLocation()
    return (
      <>
        <Link to="/elsewhere">Go elsewhere</Link>
        <span data-testid="where">{location.pathname}</span>
        <span data-testid="saves">{saved}</span>
        <RecordActions busy={false} dirty={dirty} label="Save changes" onSave={() => setSaved((n) => n + 1)} onCancel={() => {}} />
      </>
    )
  }

  it('does not interrupt navigation when nothing has changed', async () => {
    await mount(<Screen dirty={false} />)
    await click(container.querySelector('a'))
    expect(container.querySelector('[data-testid="where"]')!.textContent).toBe('/elsewhere')
    expect(document.body.textContent).not.toContain('Leave without saving?')
  })

  it('asks before leaving with unsaved changes, and Keep editing stays on the page', async () => {
    await mount(<Screen dirty />)
    await click(container.querySelector('a'))
    expect(document.body.textContent).toContain('Leave without saving?')
    expect(container.querySelector('[data-testid="where"]')!.textContent).toBe('/')
    await click(byText('Keep editing'))
    expect(container.querySelector('[data-testid="where"]')!.textContent).toBe('/')
  })

  it('Leave page continues to the link the user chose', async () => {
    await mount(<Screen dirty />)
    await click(container.querySelector('a'))
    await click(byText('Leave page'))
    expect(container.querySelector('[data-testid="where"]')!.textContent).toBe('/elsewhere')
  })

  it('shows Save changes disabled with no edits and locks both actions while saving', async () => {
    await mount(<RecordActions busy={false} dirty={false} label="Save changes" onSave={() => {}} onCancel={() => {}} />)
    expect((byText('Save changes') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => root.unmount())
    container.remove()
    await mount(<RecordActions busy dirty label="Save changes" onSave={() => {}} onCancel={() => {}} />)
    expect((byText('Cancel') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.textContent).toContain('Saving…')
  })
})
