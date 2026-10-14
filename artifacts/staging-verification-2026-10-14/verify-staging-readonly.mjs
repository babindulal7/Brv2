#!/usr/bin/env node
// Deliberately independent of .env.local: that file currently targets production.
// No log contains credentials, payloads, response bodies, URLs or user identifiers.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROLES = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
const MONEY = new Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'])
const PRODUCTION = new Set(['sxguwvgoserhdolewibb'])
const HERE = fileURLToPath(new URL('.', import.meta.url))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = (role) => `BABIN_STAGING_${role.toUpperCase()}_JWT`

function validateTarget(manifest, env) {
  const url = new URL(env.BABIN_STAGING_SUPABASE_URL || 'https://missing.invalid')
  assert(manifest.approvedStaging === true, 'Owner-confirmed staging manifest is required')
  assert(/^[a-z]{20}$/.test(manifest.projectRef), 'A real staging project reference is required')
  assert(!PRODUCTION.has(manifest.projectRef), 'Known production project is prohibited')
  assert(env.BABIN_STAGING_PROJECT_REF === manifest.projectRef, 'Explicit staging identity does not match manifest')
  assert(url.protocol === 'https:' && url.hostname === `${manifest.projectRef}.supabase.co` && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password, 'Only the confirmed standard staging HTTPS origin is accepted')
  assert(env.BABIN_STAGING_ANON_KEY, 'Separate staging public key is required')
  const key = env.BABIN_STAGING_ANON_KEY
  if (!key.startsWith('sb_publishable_')) {
    let claims
    try { claims = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8')) } catch { throw new Error('Staging public key is neither publishable nor an anon JWT') }
    assert(claims.role === 'anon', 'Only anon or publishable keys are accepted')
    assert(!claims.ref || claims.ref === manifest.projectRef, 'Anon key belongs to a different project')
  }
  for (const role of ROLES) {
    assert(env[TOKEN(role)], `A real ${role} session JWT is required`)
    let claims
    try { claims = JSON.parse(Buffer.from(env[TOKEN(role)].split('.')[1] || '', 'base64url').toString('utf8')) } catch { throw new Error(`The ${role} session is not a JWT`) }
    assert(claims.role === 'authenticated' && UUID.test(claims.sub), `${role} requires an authenticated user session`)
    assert(claims.iss === `${url.origin}/auth/v1`, `${role} session issuer does not match staging`)
    assert(typeof claims.exp === 'number' && claims.exp > Date.now() / 1000 + 120, `${role} session needs at least two minutes remaining`)
  }
  assert(UUID.test(manifest.fixtures.productId), 'Nonempty known-priced product fixture required')
  assert(UUID.test(manifest.fixtures.bookingLineId), 'Nonempty known-priced booking-line fixture required')
  for (const field of ['clientId', 'clientBookingId', 'otherClientId', 'otherClientBookingId']) assert(UUID.test(manifest.fixtures[field]), `Client isolation fixture ${field} is required`)
  assert(manifest.fixtures.clientId !== manifest.fixtures.otherClientId, 'Client fixtures must belong to different clients')
  assert(manifest.fixtures.clientBookingId !== manifest.fixtures.otherClientBookingId, 'Booking fixtures must be distinct')
  return url.origin
}

function rows(value) { return value.ok && Array.isArray(value.body) ? value.body : null }
function permissionDenied(value) { return [401, 403].includes(value.status) && ['42501', 'PGRST301', 'PGRST302'].includes(value.body?.code) }
function hidden(value) { return permissionDenied(value) || (rows(value)?.length === 0) }
function masked(value, fields) { return rows(value)?.length === 1 && fields.every((field) => value.body[0][field] === null) }

async function run() {
  const path = process.argv[2]
  assert(path, 'Pass an Owner-confirmed nonsecret staging manifest path')
  const manifest = JSON.parse(readFileSync(resolve(path), 'utf8'))
  const origin = validateTarget(manifest, process.env)
  const results = []
  const check = (name, good, status) => {
    results.push({ name, result: good ? 'PASS' : 'FAIL', ...(status === undefined ? {} : { httpStatus: status }) })
    console.log(`${good ? 'PASS' : 'FAIL'} ${name}`)
  }
  const request = async (route, jwt) => {
    try {
      const headers = { apikey: process.env.BABIN_STAGING_ANON_KEY, Accept: 'application/json' }
      if (jwt) headers.Authorization = `Bearer ${jwt}`
      const response = await fetch(`${origin}${route}`, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000) })
      let body
      try { body = await response.json() } catch { body = null }
      return { ok: response.ok, status: response.status, body }
    } catch { return { ok: false, status: 0, body: null } }
  }
  const f = manifest.fixtures
  const product = `/rest/v1/products_v?select=id,daily_rate,purchase_price&id=eq.${f.productId}`
  const line = `/rest/v1/booking_lines_v?select=id,rate,discount_amount&id=eq.${f.bookingLineId}`
  // Each role comes from a real Auth session, then Postgres confirms its role.
  for (const role of ROLES) {
    const jwt = process.env[TOKEN(role)]
    const auth = await request('/auth/v1/user', jwt)
    check(`${role}: real Auth identity`, auth.ok && typeof auth.body?.id === 'string', auth.status)
    const dbRole = await request('/rest/v1/rpc/auth_user_role', jwt)
    check(`${role}: database role matches`, dbRole.ok && dbRole.body === role, dbRole.status)
    const money = await request('/rest/v1/rpc/auth_can_view_money', jwt)
    check(`${role}: Law 6 role property`, money.ok && money.body === MONEY.has(role), money.status)
    const p = await request(product, jwt)
    const l = await request(line, jwt)
    if (MONEY.has(role)) {
      check(`${role}: known-priced product positive control`, rows(p)?.length === 1 && typeof p.body[0].daily_rate === 'number', p.status)
      check(`${role}: known-priced line positive control`, rows(l)?.length === 1 && typeof l.body[0].rate === 'number', l.status)
    } else if (role === 'Client') {
      check(`${role}: staff product view hidden`, hidden(p), p.status)
      check(`${role}: staff booking-line view hidden`, hidden(l), l.status)
    } else {
      check(`${role}: product money masked on a real visible row`, masked(p, ['daily_rate', 'purchase_price']), p.status)
      check(`${role}: booking-line money masked on a real visible row`, masked(l, ['rate', 'discount_amount']), l.status)
    }
    if (!MONEY.has(role)) for (const table of ['invoices', 'payments', 'security_deposits']) {
      const response = await request(`/rest/v1/${table}?select=id&limit=1`, jwt)
      check(`${role}: ${table} inaccessible`, hidden(response), response.status)
    }
  }
  // anon cannot use owner-rights views or read staff/business records.
  for (const table of ['audit_logs', 'staff_directory_v', 'product_units_service_v', 'bookings', 'payments']) {
    const response = await request(`/rest/v1/${table}?select=id&limit=1`)
    check(`anon: ${table} inaccessible`, hidden(response), response.status)
  }
  const clientJwt = process.env[TOKEN('Client')]
  for (const [table, own, other] of [['clients', f.clientId, f.otherClientId], ['bookings', f.clientBookingId, f.otherClientBookingId]]) {
    for (const id of [own, other]) {
      const control = await request(`/rest/v1/${table}?select=id&id=eq.${id}`, process.env[TOKEN('Owner')])
      check(`Owner: ${table} isolation fixture exists (${id === own ? 'own' : 'other'})`, rows(control)?.length === 1, control.status)
    }
    const mine = await request(`/rest/v1/${table}?select=id&id=eq.${own}`, clientJwt)
    const theirs = await request(`/rest/v1/${table}?select=id&id=eq.${other}`, clientJwt)
    check(`Client: own ${table} positive control`, rows(mine)?.length === 1, mine.status)
    check(`Client: other ${table} denied`, hidden(theirs), theirs.status)
  }
  const failed = results.filter((result) => result.result === 'FAIL').length
  const summary = { evidenceDate: '2026-10-14', environment: 'Owner-confirmed staging', readOnly: true, requests: 'GET only, redirects refused', results, failed, scope: 'Auth identity, role resolution, view masking, anon access, client read isolation', unverified: ['password login/refresh/signout', 'mutating RPC authorization and audit', 'storage upload/download policy paths', 'production drift and cutover'] }
  writeFileSync(resolve(HERE, 'staging-readonly-result.json'), `${JSON.stringify(summary, null, 2)}\n`)
  process.exitCode = failed ? 1 : 0
}

if (process.argv.includes('--self-test')) {
  const ref = 'abcdefghijklmnopqrst'
  const fixtures = Object.fromEntries(['productId', 'bookingLineId', 'clientId', 'clientBookingId', 'otherClientId', 'otherClientBookingId'].map((name, i) => [name, `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`]))
  const manifest = { approvedStaging: true, projectRef: ref, fixtures }
  const testJwt = `selftest.${Buffer.from(JSON.stringify({ role: 'authenticated', sub: fixtures.clientId, iss: `https://${ref}.supabase.co/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.selftest`
  const env = { BABIN_STAGING_PROJECT_REF: ref, BABIN_STAGING_SUPABASE_URL: `https://${ref}.supabase.co`, BABIN_STAGING_ANON_KEY: 'sb_publishable_self_test', ...Object.fromEntries(ROLES.map((role) => [TOKEN(role), testJwt])) }
  assert.equal(validateTarget(manifest, env), `https://${ref}.supabase.co`)
  assert.throws(() => validateTarget({ ...manifest, projectRef: 'sxguwvgoserhdolewibb' }, env))
  assert.throws(() => validateTarget({ ...manifest, approvedStaging: false }, env))
  assert.throws(() => validateTarget(manifest, { ...env, BABIN_STAGING_SUPABASE_URL: 'https://unconfirmed.invalid' }))
  assert.throws(() => validateTarget(manifest, { ...env, BABIN_STAGING_ANON_KEY: 'sb_secret_prohibited' }))
  assert.throws(() => validateTarget(manifest, { ...env, BABIN_STAGING_OWNER_JWT: '' }))
  assert(!hidden({ ok: false, status: 500, body: null }))
  assert(!hidden({ ok: false, status: 404, body: { code: '42P01' } }))
  assert(hidden({ ok: false, status: 403, body: { code: '42501' } }))
  assert(!masked({ ok: true, body: [] }, ['rate']))
  assert(masked({ ok: true, body: [{ rate: null }] }, ['rate']))
  assert(!masked({ ok: true, body: [{ rate: 123 }] }, ['rate']))
  console.log('PASS 12 local verifier safety assertions; zero network requests')
} else {
  run().catch((error) => { console.error(`BLOCKED: ${error instanceof assert.AssertionError ? error.message : 'Manifest, target configuration, or required inputs are unavailable'}`); process.exitCode = 2 })
}
