// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSourceFile, forEachChild, isJsxOpeningElement, isJsxSelfClosingElement, ScriptTarget } from 'typescript'
import { LifecycleProgress } from '../LifecycleProgress'
import { FloatingBulkActionBar } from '../QuickActionPanel'
import { UnsavedChangesIndicator } from '../header/UnsavedChangesIndicator'
import { STATUS } from '../../../lib/status'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Action colors and operational state remain separate', () => {
  it('renders On Rent with the central out pair and an icon, beside a primary action', () => {
    act(() => root.render(<LifecycleProgress status="On Rent" onActionClick={vi.fn()} />))
    const badge = Array.from(host.querySelectorAll('span')).find(el => el.textContent === 'OUT')!
    expect(badge.style.background).toBe(STATUS.out.bg)
    expect(badge.style.color).toBe(STATUS.out.fg)
    expect(badge.querySelector('svg')).not.toBeNull()
    const action = host.querySelector('button')!
    expect(action.classList.contains('ui-button--primary')).toBe(true)
    expect(Number.parseInt(action.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    expect(action.hasAttribute('data-primary-verb')).toBe(true)
  })

  it('bulk actions keep disabled handlers blocked and enabled handlers intact', () => {
    const blocked = vi.fn()
    const allowed = vi.fn()
    act(() => root.render(<FloatingBulkActionBar selectedCount={2} onClearSelection={vi.fn()} actions={[
      { id: 'void', label: 'Void', icon: 'close', variant: 'danger', disabled: true, onClick: blocked },
      { id: 'export', label: 'Export', icon: 'download', onClick: allowed },
    ]} />))
    const buttons = host.querySelectorAll('button')
    expect(buttons[0]!.classList.contains('ui-button--danger')).toBe(true)
    act(() => { buttons[0]!.click(); buttons[1]!.click() })
    expect(blocked).not.toHaveBeenCalled()
    expect(allowed).toHaveBeenCalledOnce()
  })

  it('closed and cancelled banners cannot invoke an operation', () => {
    const click = vi.fn()
    for (const status of ['Closed', 'Cancelled', 'Void']) {
      act(() => root.render(<LifecycleProgress status={status} onActionClick={click} />))
      expect(host.querySelector('button')).toBeNull()
    }
    expect(click).not.toHaveBeenCalled()
  })

  it('both pending-edit indicator layouts retain the explicit label', () => {
    act(() => root.render(<><UnsavedChangesIndicator /><UnsavedChangesIndicator compact /></>))
    expect(host.textContent).toBe('Unsaved changesUnsaved changes')
    expect(host.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('Delivery primary actions cannot override the shared palette', () => {
    const source = readFileSync('src/modules/operations/DeliveryWorkspace.tsx', 'utf8')
    const tree = createSourceFile('DeliveryWorkspace.tsx', source, ScriptTarget.Latest, true)
    let primaryCount = 0
    function visit(node: import('typescript').Node) {
      if ((isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === 'Button') {
        const attrs = node.attributes.properties.map(attr => attr.getText(tree))
        if (attrs.includes('variant="primary"')) {
          primaryCount++
          expect(attrs.find(attr => attr.startsWith('style=')) ?? '').not.toMatch(/\b(background|backgroundColor|borderColor|color)\s*:/)
        }
      }
      forEachChild(node, visit)
    }
    visit(tree)
    expect(primaryCount).toBeGreaterThanOrEqual(4)
    expect(source).not.toContain('var(--green)')
    expect(source).not.toContain('var(--gold)')
  })
})
