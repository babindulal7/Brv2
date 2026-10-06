#!/usr/bin/env node
// Booqable adoption spec G3 (0160): pricing structures and rulesets. Proves Law 6 (money-blind roles read
// nothing), Owner/Admin/Manager write, Law 3 (nothing deleted), a database audit row per change, shape
// checks, and that changing a product's pricing link is a money-visible-role action.
// EXCLUDE_MIGRATION=0160 proves the checks fail without the migration.
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
const branchId = (await db.query(`select id from branches order by created_at limit 1`)).rows[0].id
const ids = {
  Owner: '00000000-0000-0000-0000-000000000401', Manager: '00000000-0000-0000-0000-000000000402',
  Warehouse: '00000000-0000-0000-0000-000000000403', Coordinator: '00000000-0000-0000-0000-000000000404',
}
for (const [role, id] of Object.entries(ids)) {
  await db.query(`insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
    values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1) on conflict (id) do update set primary_role = $5`,
    [id, `EMP-P-${role}`, `${role.toLowerCase()}-p@babinrentals.com`, role, role, branchId])
}
const as = (role) => db.exec(`reset role; select set_config('app.current_user_id', '${ids[role]}', false); set role authenticated;`)
const fails = async (fn, frag) => { try { await fn() } catch (e) { return frag ? e.message.includes(frag) : true } return false }
const q = (sql, p = []) => db.query(sql, p)

await as('Manager')
const s = (await q(`insert into pricing_structures (client_uuid, name, extra_day_amount, created_by) values (gen_random_uuid(), 'Babin Daily', 2000, $1) returning id`, [ids.Manager])).rows[0].id
await q(`insert into pricing_structure_tiles (client_uuid, structure_id, duration_days, amount) values (gen_random_uuid(), $1, 1, 5000), (gen_random_uuid(), $1, 2, 7500)`, [s])
const rs = (await q(`insert into pricing_rulesets (client_uuid, name) values (gen_random_uuid(), 'SUMMER25') returning id`)).rows[0].id
await q(`insert into pricing_rules (client_uuid, ruleset_id, sort_order, kind, name, percent, valid_from, valid_to, stack) values (gen_random_uuid(), $1, 1, 'price', 'Summer', 10, '2026-06-01', '2026-08-31', true)`, [rs])
await q(`insert into pricing_rules (client_uuid, ruleset_id, sort_order, kind, name, charge_action) values (gen_random_uuid(), $1, 0, 'charge', 'Free pickup day', 'skip_pickup_day')`, [rs])
check(true, 'Manager can create a structure with tiles and a ruleset with a charge rule and a price rule')

check(await fails(() => q(`insert into pricing_structure_tiles (client_uuid, structure_id, duration_days, amount) values (gen_random_uuid(), $1, 2, 1)`, [s]), 'duplicate'), 'two live tiles cannot share a duration')
check(await fails(() => q(`insert into pricing_rules (client_uuid, ruleset_id, kind, name, percent) values (gen_random_uuid(), $1, 'charge', 'bad', 5)`, [rs]), 'pricing_rules_shape'), 'a charge rule cannot carry a percent; shape is enforced')
check(await fails(() => q(`insert into pricing_rules (client_uuid, ruleset_id, kind, name, percent, weekdays) values (gen_random_uuid(), $1, 'price', 'bad', 5, '{7}')`, [rs]), 'weekdays_valid'), 'weekday 7 is refused (0 = Sunday … 6 = Saturday)')
check(await fails(() => q(`insert into pricing_rules (client_uuid, ruleset_id, kind, name, percent) values (gen_random_uuid(), $1, 'price', 'bad', 5000)`, [rs]), 'pricing_rules_shape'), 'an absurd percent is refused')

const prod = (await q(`select id from products order by created_at limit 1`)).rows[0].id
await q(`update products set pricing_structure_id = $1, pricing_ruleset_id = $2 where id = $3`, [s, rs, prod])
check((await q(`select pricing_structure_id from products where id = $1`, [prod])).rows[0].pricing_structure_id === s, 'Manager can link a product to a structure and a ruleset')
check(((await q(`select count(*)::int n from audit_events where table_name in ('pricing_structures','pricing_structure_tiles','pricing_rulesets','pricing_rules')`)).rows[0].n) >= 5, 'the database audited the changes')

await as('Warehouse')
check((await q(`select count(*)::int n from pricing_structures`)).rows[0].n === 0, 'Warehouse reads no structures (Law 6)')
check((await q(`select count(*)::int n from pricing_rules`)).rows[0].n === 0, 'Warehouse reads no rules (Law 6)')
check((await q(`select pricing_structure_id from products where id = $1`, [prod])).rows.length === 1, 'Warehouse can still read the link ids, and products still select')
check(await fails(() => q(`insert into pricing_structures (client_uuid, name) values (gen_random_uuid(), 'x')`)), 'Warehouse cannot create a structure')
check(await fails(() => q(`update products set pricing_structure_id = null where id = $1`, [prod]), 'money_blind_link'), 'Warehouse cannot unlink or relink a product (a price change)')

await as('Coordinator')
check(await fails(() => q(`insert into pricing_rulesets (client_uuid, name) values (gen_random_uuid(), 'x')`)), 'Coordinator cannot write a ruleset')
check((await q(`select count(*)::int n from pricing_structures`)).rows[0].n === 1, 'Coordinator (money-visible) can read structures')

await as('Manager')
await q(`update pricing_rules set retired_at = now() where kind = 'charge'`)
check(await fails(() => q(`delete from pricing_rules`), 'permission denied'), 'authenticated cannot delete a rule')
await db.exec('reset role')
check(await fails(() => q(`delete from pricing_structures`), 'Law 3'), 'not even the owner role can delete a structure — retire it')

console.log(failed ? `\n❌ ${failed} pricing-structure check(s) FAILED` : '\n🎉 PRICING STRUCTURES VERIFIED')
process.exit(failed ? 1 : 0)
