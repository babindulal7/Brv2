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
import * as auditQueries from '../../../lib/queries/audit'
import type { AuditEventListRow } from '../../../lib/queries/audit'

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

/**
 * Two rows in the live query's own vocabulary (`audit_events` columns, enum
 * values from 0001). The before → after cells are derived from the
 * `old_values` / `new_values` snapshots — so the fixtures carry registry-issued
 * identifiers inside the snapshots, which is where the real trail carries
 * them.
 */
const AUDIT_FIXTURES: AuditEventListRow[] = [
  {
    id: 'ae-1',
    createdAtAd: '2026-08-20T09:12:00.000Z',
    actorId: '22222222-2222-4222-8222-222222222222',
    actorRole: 'Accounts',
    action: 'Update',
    module: 'Finance',
    category: 'Finance',
    eventClass: 'status change',
    severity: 'Informational',
    status: 'Success',
    tableName: 'invoices',
    recordId: '33333333-3333-4333-8333-333333333333',
    branchId: null,
    ipAddress: '10.0.4.21',
    userAgent: null,
    deviceType: 'Desktop',
    oldValues: { status: 'Draft', invoice_no: 'INV-4501' },
    newValues: { status: 'Sent', invoice_no: 'INV-4501' },
    diff: null,
    reason: null,
  },
  {
    id: 'ae-2',
    createdAtAd: '2026-08-20T07:03:00.000Z',
    actorId: null,
    actorRole: 'Coordinator',
    action: 'Booking Cancelled',
    module: 'Rentals',
    category: 'Rentals',
    eventClass: 'cancellation',
    severity: 'Medium',
    status: 'Success',
    tableName: 'bookings',
    recordId: '44444444-4444-4444-8444-444444444444',
    branchId: null,
    ipAddress: null,
    userAgent: null,
    deviceType: 'Mobile',
    oldValues: { stage: 'Booked', booking_no: 'B-702' },
    newValues: { stage: 'Cancelled', booking_no: 'B-702' },
    diff: null,
    reason: 'Client requested cancellation',
  },
]

/* The query seam, mocked at the same boundary the other converted screens'
   suites mock it. The pure exports (restriction, filter constants) stay real. */
vi.mock('../../../lib/queries/audit', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/audit')>()),
  listAuditEvents: async () => ({ rows: AUDIT_FIXTURES, total: AUDIT_FIXTURES.length }),
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
  /* The trail resolves `listAuditEvents` in an effect — the same flush the
     BookingDetail suites use to let the mocked read land. */
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
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

  it('every button is a disclosure or the pager, never a write', async () => {
    await mount()
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) {
      /* The `▸` diff disclosures each declare aria-expanded; the only other
         buttons are the pager's Previous/Next — reads, not writes. The
         EmptyState's "Clear filters" does not render while rows are present. */
      const isDisclosure = b.getAttribute('aria-expanded') !== null
      const isPager = /^(Previous|Next) page$/.test(b.getAttribute('aria-label') ?? '')
      expect(isDisclosure || isPager, b.outerHTML.slice(0, 120)).toBe(true)
      expect(b.getAttribute('type')).toBe('button')
    }
  })

  it('renders before → after for each row, from the snapshots the writer recorded', async () => {
    await mount()
    const text = container.textContent ?? ''
    /* The first row's derived change: status Draft → Sent on `invoices`. */
    expect(text).toContain('invoices')
    expect(text).toContain('Draft')
    expect(text).toContain('Sent')
    /* Registry-issued identifiers ride the snapshots, not typed labels. */
    expect(text).toContain('bookings')
  })

  it('phone still shows card rows and still offers no write', async () => {
    viewport = 'phone'
    await mount()
    expect(container.textContent).toContain('Booking Cancelled')
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    expect(buttonLabels().some((l) => l.includes('delete'))).toBe(false)
  })
})

describe('the audit query layer offers no mutation either', () => {
  it('exports no update, delete or write helper', async () => {
    const exported = Object.keys(auditQueries)
    const suspicious = exported.filter((k) => /^(update|delete|remove|write|void|archive|purge|append|insert|create)/i.test(k))
    expect(suspicious).toEqual([])
  })
})
