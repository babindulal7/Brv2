// @vitest-environment jsdom
/**
 * # Audit Log is view-only, and Owner is not an exception
 *
 * `10_TOOLS.md` §10.4's entire behavioural specification is two sentences about
 * things that must **not** exist:
 *
 * > *Append-only. View-only for every role including Owner.*
 * > *No edit, no delete, no bulk action anywhere on this page.*
 *
 * An absence cannot be verified by looking at the screen — a missing delete
 * button and a delete button nobody happened to draw look identical. Only a
 * test holds it down, and only a test notices when a later session adds a row
 * menu "for convenience". So this file mounts the page as **Owner**, the role
 * most likely to be given an exception, and asserts the shape of what is there.
 *
 * The third test is the one with teeth: the page's *only* form controls are the
 * three filters §10.4 draws. Anything else — a checkbox, a text input, a
 * submit — fails here before it reaches a reviewer.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Viewport } from '../../../lib/device'
import { AUDIT_ROWS, entityLabel } from '../../../data/auditLog'
import * as auditData from '../../../data/auditLog'

let viewport: Viewport = 'desktop'
const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: AuditLog } = await import('../AuditLog')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<AuditLog />)
  })
}

const buttonLabels = (): string[] =>
  [...container.querySelectorAll('button')].map((b) => `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`.toLowerCase())

beforeEach(() => {
  viewport = 'desktop'
  auth.role = 'Owner'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Audit Log — §10.4, view-only for every role including Owner', () => {
  it('offers no edit, delete, void, archive or bulk control to an Owner', async () => {
    await mount()
    const forbidden = ['edit', 'delete', 'remove', 'void', 'archive this', 'bulk', 'select all', 'purge', 'clear log']
    for (const word of forbidden) {
      expect(buttonLabels().some((l) => l.includes(word)), `a button mentioning "${word}"`).toBe(false)
    }
  })

  it('has no checkbox anywhere — a selection column is the start of a bulk action', async () => {
    await mount()
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(0)
  })

  it('carries exactly the three filters §10.4 draws, and no other form control', async () => {
    await mount()
    /* Three `[entity ▾][user ▾][date ▾]` selects… */
    expect(container.querySelectorAll('select').length).toBe(3)
    /* …and nothing typed, submitted or toggled. */
    expect(container.querySelectorAll('input').length).toBe(0)
    expect(container.querySelectorAll('textarea').length).toBe(0)
    expect(container.querySelectorAll('form').length).toBe(0)
  })

  it('every button is a disclosure, never a write', async () => {
    await mount()
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) {
      /* The `▸` diff disclosures each declare aria-expanded; the EmptyState's
         "Clear filters" is the only other button and does not render while
         rows are present. */
      expect(b.getAttribute('aria-expanded'), b.outerHTML.slice(0, 120)).not.toBeNull()
      expect(b.getAttribute('type')).toBe('button')
    }
  })

  it('renders before → after for each row, with identifiers issued through the registry', async () => {
    await mount()
    const text = container.textContent ?? ''
    const first = AUDIT_ROWS[0]!
    expect(text).toContain(entityLabel(first.entity, first.timestamp))
    expect(text).toContain(first.changes[0]!.before)
    expect(text).toContain(first.changes[0]!.after)
    /* The ruled prefixes, issued not typed. */
    expect(text).toContain('INV-45')
    expect(text).toContain('B-702')
    expect(text).toContain('C-34')
  })

  it('phone still shows card rows and still offers no write', async () => {
    viewport = 'phone'
    await mount()
    expect(container.textContent).toContain('Void')
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    expect(buttonLabels().some((l) => l.includes('delete'))).toBe(false)
  })
})

describe('the audit data layer offers no mutation either', () => {
  it('exports no update, delete or write helper', async () => {
    const exported = Object.keys(auditData)
    const suspicious = exported.filter((k) => /^(update|delete|remove|write|void|archive|purge|append)/i.test(k))
    expect(suspicious).toEqual([])
  })

  it('derives its headline counts from the rows rather than typing them beside them', async () => {
    expect(auditData.AUDIT_METRICS.totalMutations).toBe(AUDIT_ROWS.length)
    expect(auditData.AUDIT_METRICS.voids).toBe(AUDIT_ROWS.filter((r) => r.action === 'Void').length)
  })
})
