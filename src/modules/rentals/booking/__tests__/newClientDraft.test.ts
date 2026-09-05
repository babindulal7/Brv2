import { describe, it, expect } from 'vitest'
// Vite `?raw`, NOT node:fs — this project ships no `@types/node` and
// `npm run typecheck` is a gate. Same technique as `lib/__tests__/breakpoints.test.ts`.
import enumsSql from '../../../../../supabase/migrations/0001_enums.sql?raw'
import type { ClientRecord } from '../../../../data/clients'
import {
  DEFAULT_ORGANISATION_TYPE,
  ORGANISATION_TYPES,
  clientRecordFrom,
  confirmedClients,
  createClientInputFrom,
  findPhoneDuplicate,
  type NewClientDraft,
} from '../newClientDraft'

/**
 * The dialog's claim surface, pinned.
 *
 * `AddClientModal` gathered six fields — client type, contact person, PAN,
 * credit limit, payment terms and notes — sent none of them, and then reported
 * "Credit limit Rs X" and "Payment terms" back as saved. These tests hold the
 * two halves of the correction: what leaves for the database, and what the
 * booking page is told afterwards.
 */

const ORGANISATION: NewClientDraft = {
  clientType: 'Organisation',
  organisationType: 'Broadcaster',
  name: '  Himalayan Films Pvt. Ltd.  ',
  phone: '+9779801234567',
  email: ' bookings@himalayan.com ',
  pan: ' 600123456 ',
  notes: ' Prefers morning pickups. ',
}

const INDIVIDUAL: NewClientDraft = {
  ...ORGANISATION,
  clientType: 'Individual',
  name: 'Suman Karki',
}

const SAVED = {
  clientId: '11111111-2222-3333-4444-555555555555',
  clientCode: 'CL-2026-0102',
  name: 'Himalayan Films Pvt. Ltd.',
  phone: '+9779801234567',
}

describe('ORGANISATION_TYPES matches the database enum', () => {
  /**
   * `data/clients.ts` exports the `OrganisationType` union but no array of its
   * members, so `AddClient.tsx` and `newClientDraft.ts` each keep a list. The
   * union stops a typo; only this stops the two lists — and the enum they both
   * claim to mirror — from silently drifting apart, which is the failure the
   * breakpoints suite was written for.
   */
  it('has exactly the members of client_organisation_subtype, in order', () => {
    const block = /create type client_organisation_subtype as enum \(([^)]*)\)/.exec(enumsSql)
    expect(block, 'client_organisation_subtype not found in 0001_enums.sql').not.toBeNull()
    const members = [...(block?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1])
    expect(members.length).toBeGreaterThan(0)
    expect(ORGANISATION_TYPES).toEqual(members)
  })

  it('defaults to a member of that enum', () => {
    expect(ORGANISATION_TYPES).toContain(DEFAULT_ORGANISATION_TYPE)
  })
})

describe('createClientInputFrom — what reaches the database', () => {
  it('sends the four columns that were being collected and dropped', () => {
    const input = createClientInputFrom(ORGANISATION, 'key-1')
    expect(input.clientType).toBe('Organisation')
    expect(input.orgSubtype).toBe('Broadcaster')
    expect(input.panVat).toBe('600123456')
    expect(input.notes).toBe('Prefers morning pickups.')
  })

  it('carries the Law 8 key and the identity columns, trimmed', () => {
    const input = createClientInputFrom(ORGANISATION, 'key-1')
    expect(input.clientUuid).toBe('key-1')
    expect(input.name).toBe('Himalayan Films Pvt. Ltd.')
    expect(input.email).toBe('bookings@himalayan.com')
    // Already canonical when it arrives; the action re-checks it against the
    // same CHECK rather than reshaping it.
    expect(input.phone).toBe('+9779801234567')
    expect(input.isDraft).toBe(false)
  })

  it('pairs org_subtype with the type, as clients_org_subtype_pairing requires', () => {
    // Organisation ⇒ present. Individual ⇒ the key is ABSENT, not undefined:
    // `exactOptionalPropertyTypes` is on and the CHECK forbids the value.
    expect('orgSubtype' in createClientInputFrom(ORGANISATION, 'k')).toBe(true)
    const individual = createClientInputFrom(INDIVIDUAL, 'k')
    expect(individual.clientType).toBe('Individual')
    expect('orgSubtype' in individual).toBe(false)
  })

  it('has no channel for a contact person, credit limit or payment terms', () => {
    // Not "does not send them today" — there is nowhere to put them. All three
    // are refused by the schema, not by preference: contacts are a separate
    // table, and the money pair is override-only.
    const keys = Object.keys(createClientInputFrom(ORGANISATION, 'k'))
    expect(keys).not.toContain('contactPerson')
    expect(keys).not.toContain('creditLimit')
    expect(keys).not.toContain('approvedCreditLimit')
    expect(keys).not.toContain('paymentTerms')
  })
})

describe('clientRecordFrom — what the booking page is told', () => {
  const record = clientRecordFrom(ORGANISATION, SAVED)

  it('keys on the allocated code and carries the uuid a booking is filed against', () => {
    expect(record.id).toBe('CL-2026-0102')
    expect(record.dbId).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('reports the type and subtype that were actually stored', () => {
    expect(record.clientType).toBe('Organisation')
    expect(record.organisationType).toBe('Broadcaster')
    expect(clientRecordFrom(INDIVIDUAL, SAVED).organisationType).toBeUndefined()
  })

  it('claims no credit limit, payment terms or contact person', () => {
    // approved_credit_limit is left NULL on insert; toClientRecord maps NULL to 0.
    expect(record.creditLimitPaisa).toBe(0)
    expect('paymentTerms' in record).toBe(false)
    expect(record.contactPerson).toEqual({ name: '—', designation: '—', phone: '—' })
  })

  it('stamps no client-since date, because the server sets it and returns nothing', () => {
    expect('clientSinceAd' in record).toBe(false)
  })

  it('omits PAN and notes entirely when they were left blank', () => {
    const bare = clientRecordFrom({ ...ORGANISATION, pan: '  ', notes: '' }, SAVED)
    expect('pan' in bare).toBe(false)
    expect('notes' in bare).toBe(false)
    expect(record.pan).toBe('600123456')
    expect(record.notes).toBe('Prefers morning pickups.')
  })
})

describe('duplicate detection runs against the client table, never the seed', () => {
  const live = clientRecordFrom(ORGANISATION, SAVED)
  const seedRow: ClientRecord = { ...live }
  delete seedRow.dbId

  it('treats a missing pool as nothing to check, not as no duplicates found', () => {
    expect(confirmedClients(undefined)).toEqual([])
  })

  it('drops rows the database never confirmed', () => {
    // A row without `dbId` came from `data/clients.ts`'s demo array. Announcing
    // it as a client already on file states a fact about sample data.
    expect(confirmedClients([seedRow])).toEqual([])
    expect(confirmedClients([seedRow, live])).toEqual([live])
  })

  it('matches on the shared normalizer, so formatting cannot hide a duplicate', () => {
    const pool = confirmedClients([live])
    expect(findPhoneDuplicate(pool, '+977 980-1234567')).toBe(live)
    expect(findPhoneDuplicate(pool, '+9779800000000')).toBeNull()
    expect(findPhoneDuplicate([], '+9779801234567')).toBeNull()
  })

  it('never sends the operator to a record that was merged away', () => {
    const merged: ClientRecord = { ...live, mergedIntoId: 'CL-2026-0001' }
    expect(findPhoneDuplicate([merged], '+9779801234567')).toBeNull()
  })
})

/**
 * # NR-16 — a filter cannot filter a pool it was never handed
 *
 * The first pass removed `AddClientModal`'s `clients = CLIENTS_DATA` default —
 * correct, the seed is not the client list — but did not wire the one call site
 * to pass the live pool. `clients` was then `undefined` on every render, so this
 * function returned `[]` and duplicate-phone detection could not fire at all:
 * no false positives from seed rows, and no true positives either. That is
 * worse than the defect it replaced, which at least answered sometimes.
 */
describe('confirmedClients — the empty answer and the real one', () => {
  const saved = { id: 'c-1', name: 'Sagarmatha Pictures', phone: '+9779800000001', dbId: 'uuid-1' }
  const seedOnly = { id: 'c-2', name: 'Seed Co', phone: '+9779800000002' }

  it('returns nothing when handed nothing — which is what an unwired call site produces', () => {
    expect(confirmedClients(undefined)).toEqual([])
  })

  it('keeps only rows the database confirmed, so a seed row raises no false duplicate', () => {
    const pool = [saved, seedOnly] as never
    expect(confirmedClients(pool).map((c) => c.id)).toEqual(['c-1'])
  })

  it('finds a real duplicate once the live pool is actually passed', () => {
    const pool = [saved, seedOnly] as never
    expect(findPhoneDuplicate(confirmedClients(pool), '+9779800000001')?.id).toBe('c-1')
    // and does not invent one for the seed row it filtered out
    expect(findPhoneDuplicate(confirmedClients(pool), '+9779800000002')).toBeNull()
  })
})
