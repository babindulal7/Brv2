// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

const containers: Array<{ node: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
function render(page: number, total = 200, size = 20) {
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  containers.push({ node, root })
  const change = vi.fn()
  const changeSize = vi.fn()
  act(() => root.render(<Pagination page={page} total={total} pageSize={size} onPageChange={change} onPageSizeChange={changeSize} />))
  const button = (label: string) => node.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  return { node, button, change, changeSize }
}
afterEach(() => {
  for (const { node, root } of containers.splice(0)) {
    act(() => root.unmount())
    node.remove()
  }
  vi.unstubAllGlobals()
})
describe('Pagination', () => {
  it('clamps an out-of-range page and disables both forward controls', () => {
    const { node, button } = render(99)
    expect(button('Last page').disabled).toBe(true)
    expect(button('Next page').disabled).toBe(true)
    expect(node.textContent).toContain('Page 10 of 10')
    expect(node.textContent).toContain('Showing 181–200 of 200')
  })
  it.each([0, 3, 20])('hides controls when all %s rows fit on the first page', (total) => {
    const { node } = render(1, total)
    expect(node.textContent).toBe('')
    expect(node.querySelector('button')).toBeNull()
  })
  it('keeps paging controls out of form submission and navigates from the current page', () => {
    const { node, button, change } = render(5)
    expect([...node.querySelectorAll('button')].every(b => b.type === 'button')).toBe(true)
    act(() => button('Next page').click())
    expect(change).toHaveBeenCalledWith(6)
  })
  it('retains the current page size even when it is not in the default options', () => {
    const { node, changeSize } = render(1, 200, 25)
    const select = node.querySelector('select')!
    expect(select.value).toBe('25')
    act(() => { select.value = '50'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(changeSize).toHaveBeenCalledWith(50)
  })
})
