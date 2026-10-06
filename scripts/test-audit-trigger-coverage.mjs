#!/usr/bin/env node
// PLAN.md §4.36 follow-up (ruled 06 Oct 2026): the app-side audit row is supplementary, so every table
// whose ONLY audit record was the app row needs a database trigger. This proves each of the four now
// audits itself, names the actor, and uses the right module. EXCLUDE_MIGRATION=0157 proves it fails without.
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
  if (skip && skip.split(',').some((x) => f.startsWith(x))) continue
  await db.exec(readFileSync(join(MIG, f), 'utf8'))
}
let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const actor = (await one(`select id from users where primary_role in ('Owner','Admin','Manager') limit 1`)).id
const prod = (await one(`select id from products order by created_at limit 1`)).id
const unit = (await one(`select id from product_units order by created_at limit 1`)).id
const wh = await one(`select w.id wid, w.branch_id bid from warehouses w limit 1`)
const wh2 = await one(`select w.id wid, w.branch_id bid from warehouses w where w.id <> $1 limit 1`, [wh.wid]) ?? wh

const rows = async (table, id) => (await db.query(`select actor_id, module, category, action, old_values is not null as had_old from audit_events where table_name = $1 and record_id = $2 order by created_at, id`, [table, id])).rows

// products — existing row, then an update
const pid = (await one(`select id from products order by created_at limit 1`)).id
const before = (await rows('products', pid)).length
await db.query(`update products set brand = brand || '' , updated_by = $2 where id = $1`, [pid, actor])
let r = await rows('products', pid)
check(r.length === before + 1, 'products: an update writes an audit row by itself')
check(r.at(-1)?.actor_id === actor && r.at(-1)?.module === 'Inventory', 'products: the row names the actor and is module Inventory')

// stock_transfers
const st = (await one(`insert into stock_transfers (client_uuid, transfer_no, source_branch_id, source_warehouse_id, destination_branch_id, destination_warehouse_id, requested_by, created_by)
  values (gen_random_uuid(), 'T-AUD-1', $1, $2, $3, $4, $5, $5) returning id`, [wh.bid, wh.wid, wh2.bid, wh2.wid, actor])).id
await db.query(`update stock_transfers set updated_by = $2, updated_at = now() where id = $1`, [st, actor])
r = await rows('stock_transfers', st)
check(r.length === 2, 'stock_transfers: insert and update each write an audit row')
check(r.length === 2 && r.every((x) => x.actor_id === actor && x.module === 'Inventory'), 'stock_transfers: both rows name the actor, module Inventory')

// purchase_requests
const pr = (await one(`insert into purchase_requests (client_uuid, pr_no, product_id, requested_by, created_by)
  values (gen_random_uuid(), 'PR-AUD-1', $1, $2, $2) returning id`, [prod, actor])).id
await db.query(`update purchase_requests set updated_by = $2, updated_at = now() where id = $1`, [pr, actor])
r = await rows('purchase_requests', pr)
check(r.length === 2 && r.every((x) => x.actor_id === actor && x.module === 'Inventory'), 'purchase_requests: insert and update audited, actor named, module Inventory')

// cleaning_queue_entries — the Warehouse reset path
const cq = (await one(`insert into cleaning_queue_entries (client_uuid, unit_id, created_by) values (gen_random_uuid(), $1, $2) returning id`, [unit, actor])).id
await db.query(`update cleaning_queue_entries set updated_at = now() where id = $1`, [cq])
r = await rows('cleaning_queue_entries', cq)
check(r.length === 2, 'cleaning_queue_entries: insert and update each write an audit row')
check(r.length === 2 && r.every((x) => x.actor_id === actor && x.module === 'Operations'), 'cleaning_queue_entries: both rows name the actor (update falls back to created_by), module Operations')

// append-only is still true
let rejected = 0
for (const q of [`delete from audit_events where record_id = '${st}'`, `update audit_events set status = 'x' where record_id = '${st}'`]) {
  try { await db.query(q) } catch { rejected++ }
}
check((await rows('stock_transfers', st)).length === 2 && rejected === 2, 'the audit rows exist and still cannot be deleted or updated')

console.log(failed ? `\n❌ ${failed} audit coverage check(s) FAILED` : '\n🎉 AUDIT TRIGGER COVERAGE VERIFIED (4 tables)')
process.exit(failed ? 1 : 0)
