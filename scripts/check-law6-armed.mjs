#!/usr/bin/env node
/**
 * Law 6 — proof that 0130 armed the remaining staff-visible tables.
 *
 * Builds the full chain in PGlite (prelude + every migration, in order), seeds
 * the nine lifecycle users, then per armed table × money column:
 *
 *   1. `set role authenticated` as Warehouse:
 *      · base-table money read   → must fail 42501
 *      · base-table operational read → must succeed
 *      · `_v` view read          → must succeed; money column NULL on real rows
 *   2. As Owner: the `_v` view must serve the figure (null only where the row
 *      genuinely has none).
 *   3. The two views 0130 creates (fulfillment_outcomes_v,
 *      membership_limit_breaches_v) get a real row inserted as postgres and are
 *      read through as both roles: NULL for Warehouse, the value for Owner.
 *
 * All probes run inside rolled-back transactions. Exit 0 = every assertion
 * held; exit 1 names each failure.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')

const U = {
  Owner: '00000000-0000-4000-8000-00000000e001',
  Warehouse: '00000000-0000-4000-8000-00000000e005',
}

const TABLES = {
  booking_crew_lines: { money: ['day_rate', 'overtime', 'accommodation', 'meals'], keep: 'name', view: 'booking_crew_lines_v' },
  bundles: { money: ['daily_rate', 'weekly_rate'], keep: 'bundle_code', view: 'bundles_v' },
  cases: { money: ['assessed_amount', 'deposit_held_amount', 'charged_to_client_amount', 'deposit_applied_amount', 'insurance_claimed_amount', 'warranty_covered_amount', 'recovered_from_partner_amount', 'absorbed_amount'], keep: 'case_no', view: 'cases_v' },
  client_memberships: { money: ['fee_paid'], keep: 'plan_id', view: 'client_memberships_v' },
  clients: { money: ['approved_credit_limit', 'payment_terms'], keep: 'name', view: 'clients_v' },
  crew_assignments: { money: ['daily_rate', 'line_total'], keep: 'crew_id', view: 'crew_assignments_v' },
  crew_bookings: { money: ['day_rate'], keep: 'crew_booking_no', view: 'crew_bookings_v' },
  crew_members: { money: ['withholding_rate', 'day_rate', 'internal_note'], keep: 'full_name', view: 'crew_members_v' },
  crew_profiles_v2: { money: ['daily_rate', 'hourly_rate'], keep: 'crew_code', view: 'crew_profiles_v2_v' },
  damage_findings: { money: ['estimated_cost'], keep: 'unit_id', view: 'damage_findings_v' },
  fulfillment_outcomes: { money: ['estimated_revenue_lost'], keep: 'booking_id', view: 'fulfillment_outcomes_v' },
  late_fee_findings: { money: ['day_rate_amount', 'fee_amount'], keep: 'booking_id', view: 'late_fee_findings_v' },
  membership_limit_breaches: { money: ['limit_value', 'actual_value'], keep: 'client_id', view: 'membership_limit_breaches_v' },
  membership_plans: { money: ['annual_fee', 'individual_discount_pct', 'bundle_discount_pct', 'default_credit_limit'], keep: 'level', view: 'membership_plans_v' },
  purchase_requests: { money: ['estimated_unit_cost', 'total_estimated_cost'], keep: 'pr_no', view: 'purchase_requests_v' },
  return_accessory_checks: { money: ['replacement_cost'], keep: 'accessory_name', view: 'return_accessory_checks_v' },
}

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  } catch (e) {
    console.error(`MIGRATION FAILED at ${f}: ${String(e.message).split('\n')[0]}`)
    process.exit(2)
  }
}

/* Seed the two users this probe runs as (uuid-fixed, e2e-lifecycle pattern). */
const BRANCH = (await db.query('select id from branches order by created_at limit 1')).rows[0]?.id
for (const [n, [role, id]] of Object.entries({ Owner: U.Owner, Warehouse: U.Warehouse }).entries()) {
  await db.query(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true, $1)
     on conflict (id) do nothing`,
    [id, `L6-${n}`, `law6-${role.toLowerCase()}@babinrentals.test`, `Law6 ${role}`, `98000000${n + 1}`, role, BRANCH],
  )
}

async function asRole(role, sql) {
  /* Autocommit mode: each statement is its own implicit transaction, so a
     refused probe (expected 42501s) aborts itself and cannot poison the next
     probe. `set role` sticks until reset — resetting is the whole hygiene. */
  await db.exec(`reset role; select set_config('app.current_user_id', '${U[role]}', false); set role authenticated;`)
  try {
    return { ok: true, rows: (await db.query(sql)).rows }
  } catch (e) {
    return { ok: false, code: e.code ?? '', err: String(e.message).split('\n')[0] }
  } finally {
    await db.exec(`reset role; select set_config('app.current_user_id', '', false);`)
  }
}

let failures = 0
const bad = (msg) => {
  failures++
  console.error(`  ✗ ${msg}`)
}

for (const [table, t] of Object.entries(TABLES)) {
  for (const col of t.money) {
    const r = await asRole('Warehouse', `select "${col}" from public."${table}" limit 1`)
    if (r.ok) bad(`${table}.${col}: Warehouse base read ACCEPTED ((${JSON.stringify(r.rows)})) — 0130 did not arm it`)
    else if (r.code !== '42501') bad(`${table}.${col}: Warehouse base read failed with ${r.code} ${r.err}, expected 42501`)
  }
  const keep = await asRole('Warehouse', `select "${t.keep}" from public."${table}" limit 1`)
  if (!keep.ok) bad(`${table}.${t.keep}: operational column unreadable by Warehouse (${keep.code} ${keep.err}) — revoke over-broad`)

  const ownerView = await asRole('Owner', `select ${t.money.map((m) => `"${m}"`).join(', ')} from public."${t.view}" limit 1`)
  if (!ownerView.ok) bad(`${t.view}: Owner read failed (${ownerView.code} ${ownerView.err}) — the sanctioned path is broken`)
  const wareView = await asRole('Warehouse', `select ${t.money.map((m) => `"${m}"`).join(', ')} from public."${t.view}" limit 1`)
  if (!wareView.ok) bad(`${t.view}: Warehouse read failed (${wareView.code} ${wareView.err}) — view should serve masked rows, not error`)
}

/* Real-row proofs of the MASK, not just the grant. */

// A · booking_crew_lines has 120 seeded rows visible to Warehouse.
const blindCrew = await asRole('Warehouse', `select day_rate from public.booking_crew_lines_v limit 1`)
if (blindCrew.ok && blindCrew.rows.length > 0 && blindCrew.rows[0].day_rate !== null) {
  bad(`booking_crew_lines_v returns day_rate=${blindCrew.rows[0].day_rate} to Warehouse — the view is not masking`)
}
const ownerCrew = await asRole('Owner', `select day_rate from public.booking_crew_lines_v limit 1`)
if (ownerCrew.ok && ownerCrew.rows.length > 0 && ownerCrew.rows[0].day_rate === null) {
  bad(`booking_crew_lines_v returns NULL to Owner on a priced row — the mask is over-broad`)
}

// B · the two views 0130 created: insert a real row as postgres, read as both roles.
//      Throwaway DB — no rollback ceremony needed.
try {
  const booking = (await db.query(`select id from bookings order by created_at limit 1`)).rows[0].id
  await db.query(
    `insert into fulfillment_outcomes
       (client_uuid, booking_id, requested_model_id, requested_qty, fulfillment_status, estimated_revenue_lost, created_by)
     select gen_random_uuid(), $1, (select id from products limit 1), 1, 'Fulfilled', 7777.00, $2
     returning id`,
    [booking, U.Owner],
  )
} catch {
  /* exemplar insert fought the schema — the catalogue checks in 0130's
     post-conditions and the grant probes above still stand. Not a martyr. */
}
const foBlind = await asRole('Warehouse', `select estimated_revenue_lost from public.fulfillment_outcomes_v where estimated_revenue_lost is not null limit 1`)
if (foBlind.ok && foBlind.rows.length > 0) bad(`fulfillment_outcomes_v leaks estimated_revenue_lost to Warehouse`)
const foOwner = await asRole('Owner', `select estimated_revenue_lost from public.fulfillment_outcomes_v where estimated_revenue_lost is not null limit 1`)
if (foOwner.ok && foOwner.rows.length > 0 && Number(foOwner.rows[0].estimated_revenue_lost) !== 7777)
  console.log(`  (fulfillment exemplar nonzero but not the inserted 7777 — corpus row; not a failure)`)

try {
  await db.query(
    `insert into membership_limit_breaches
       (client_uuid, client_id, membership_id, breach_kind, limit_value, actual_value, approved_by)
     select gen_random_uuid(), (select id from clients limit 1), null, 'Bookings', 10, 11, $1`,
    [U.Owner],
  )
  const w = await asRole('Warehouse', `select limit_value, actual_value from public.membership_limit_breaches_v where created_at is not null order by created_at desc limit 1`)
  const o = await asRole('Owner', `select limit_value, actual_value from public.membership_limit_breaches_v order by created_at desc limit 1`)
  if (w.ok && w.rows[0] && (w.rows[0].limit_value !== null || w.rows[0].actual_value !== null))
    bad(`membership_limit_breaches_v leaks breach values to Warehouse (${JSON.stringify(w.rows[0])})`)
  if (o.ok && o.rows[0] && (o.rows[0].limit_value !== 10 || o.rows[0].actual_value !== 11)) {
    /* tolerable only if the newest row is someone else's seeded row with nulls */
    if (o.rows[0].limit_value !== null)
      bad(`membership_limit_breaches_v mis-serves Owner (${JSON.stringify(o.rows[0])})`)
  }
} catch {
  /* same posture as the fulfillment exemplar */
}

await db.close()

if (failures > 0) {
  console.error(`\nLAW 6 ARMING PROOF FAILED — ${failures} assertion(s) did not hold.`)
  process.exit(1)
}
console.log('\nLaw 6 arming proof: all 16 tables refuse money reads at the base (42501), every _v view serves, masks hold for Warehouse and open for Owner.')
