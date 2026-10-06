#!/usr/bin/env node
// Spec gate INV-010 "consequential writes are audited" + PLAN.md §4.36 / R3-5.
// A Warehouse return is an operation_sessions row. The ONLY audit record used to be an
// app-written audit_events row that could fail silently; this proves the DATABASE now records
// session creation and completion by itself, whoever the caller is.
// EXCLUDE_MIGRATION=0154 applies everything except that file (proves the test fails without it).
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIG = join(HERE, '..', 'supabase', 'migrations')
const skip = process.env.EXCLUDE_MIGRATION
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  if (skip && f.startsWith(skip)) continue
  await db.exec(readFileSync(join(MIG, f), 'utf8'))
}

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }

const branchId = (await db.query(`select id from branches order by created_at limit 1`)).rows[0].id
const clientId = (await db.query(`select id from clients order by created_at limit 1`)).rows[0].id
const staff = (await db.query(`select id from users where primary_role = 'Warehouse' limit 1`)).rows[0]
const actor = staff?.id ?? (await db.query(`select id from users limit 1`)).rows[0].id

const b = (await db.query(`
  insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '985001', $1, $2, '2027-04-01 06:00:00+00', '2027-04-03 06:00:00+00', 'Quote', 'Client Pickup', $3, $3) returning id`,
  [clientId, branchId, actor])).rows[0].id

const count = async (id) => (await db.query(`select count(*)::int n from audit_events where table_name = 'operation_sessions' and record_id = $1`, [id])).rows[0].n

const s = (await db.query(`
  insert into operation_sessions (client_uuid, booking_id, operation, warehouse_staff_id, created_by)
  values (gen_random_uuid(), $1, 'Return', $2, $2) returning id`, [b, actor])).rows[0].id
check((await count(s)) === 1, 'creating a Return session writes one audit row by itself')

await db.query(`update operation_sessions set state = 'Completed', completed_at = now(), completed_by = $2 where id = $1`, [s, actor])
check((await count(s)) === 2, 'completing the session writes a second audit row')

const last = (await db.query(`select old_values->>'state' as o, new_values->>'state' as n from audit_events where table_name='operation_sessions' and record_id=$1 order by created_at desc, id desc limit 1`, [s])).rows[0]
check(last?.o === 'Not Started' && last?.n === 'Completed', `the row records the before/after state (${last?.o} → ${last?.n})`)

// audit_events is still append-only (Law 4): the audit row cannot be removed or edited.
let rejected = 0
for (const q of [`delete from audit_events where record_id = '${s}'`, `update audit_events set status = 'x' where record_id = '${s}'`]) {
  try { await db.query(q) } catch { rejected++ }
}
check(rejected === 2, 'the audit rows cannot be deleted or updated')

console.log(failed ? `\n❌ ${failed} audit invariant(s) FAILED` : '\n🎉 OPERATION-SESSION AUDIT INVARIANTS VERIFIED')
process.exit(failed ? 1 : 0)
