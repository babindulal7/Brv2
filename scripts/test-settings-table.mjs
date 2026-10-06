#!/usr/bin/env node
// Booqable adoption spec G1 (0158): settings live in the database. Proves Owner-only write through
// set_setting(), money keys hidden from Warehouse (Law 6), per-location override limited to
// operationalDayStart, history append-only, nothing deleted, retries idempotent.
// EXCLUDE_MIGRATION=0158 proves the checks fail without the migration.
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
const ids = { Owner: '00000000-0000-0000-0000-000000000201', Manager: '00000000-0000-0000-0000-000000000202', Warehouse: '00000000-0000-0000-0000-000000000203' }
for (const [role, id] of Object.entries(ids)) {
  await db.query(`insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
    values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1) on conflict (id) do update set primary_role = $5`,
    [id, `EMP-S-${role}`, `${role.toLowerCase()}-s@babinrentals.com`, role, role, branchId])
}
const as = async (role) => { await db.exec(`reset role; select set_config('app.current_user_id', '${ids[role]}', false); set role authenticated;`) }
const uuid = () => crypto.randomUUID()
const fails = async (fn, frag) => { try { await fn() } catch (e) { return frag ? e.message.includes(frag) : true } return false }
const set = (k, v, scope = 'org', loc = null, cu = uuid()) => db.query(`select * from set_setting($1, $2, $3::jsonb, $4, $5)`, [cu, k, JSON.stringify(v), scope, loc])

await as('Owner')
await set('operationalDayStart', '06:00')
await set('vatRatePercent', 13)
const cu = uuid()
await set('operationalDayStart', '05:30', 'org', null, cu)
await set('operationalDayStart', '05:30', 'org', null, cu)
check((await db.query(`select count(*)::int n from settings_history where key = 'operationalDayStart'`)).rows[0].n === 2, 'history: first set + one change; a retried client_uuid adds no row')
const h = (await db.query(`select old_value, new_value, changed_by from settings_history where key='operationalDayStart' order by changed_at, id desc`)).rows
check(h.some((r) => r.old_value === '06:00' && r.new_value === '05:30' && r.changed_by === ids.Owner), 'history keeps old value, new value and actor')
check(await fails(() => set('vatRatePercent', 14, 'org', null, cu), 'idempotency_conflict'), 'a reused client_uuid on a different change is refused')
await set('operationalDayStart', '07:00', 'location', branchId)
check((await db.query(`select count(*)::int n from settings where key='operationalDayStart'`)).rows[0].n === 2, 'a location override is its own row beside the org value')
check(await fails(() => set('vatRatePercent', 15, 'location', branchId), 'not_overridable'), 'only operationalDayStart may be overridden per location')
check(await fails(() => set('x', { a: 1 }), 'gate.settings.value'), 'object values are refused')
check(await fails(() => db.query(`delete from settings`), 'permission denied'), 'authenticated has no DELETE on settings')
check(await fails(() => db.query(`update settings set value = '"x"'::jsonb`), 'permission denied'), 'no direct UPDATE for authenticated — set_setting is the only write path')

await as('Manager')
check(await fails(() => set('operationalDayStart', '04:00'), 'gate.settings.role'), 'Manager write refused')
check((await db.query(`select count(*)::int n from settings where key='vatRatePercent'`)).rows[0].n === 1, 'Manager can read money settings')

await as('Warehouse')
check(await fails(() => set('operationalDayStart', '04:00'), 'gate.settings.role'), 'Warehouse write refused')
const wh = (await db.query(`select key from settings`)).rows.map((r) => r.key)
check(wh.includes('operationalDayStart') && !wh.includes('vatRatePercent'), 'Warehouse reads operational settings but never a money setting (Law 6)')
check((await db.query(`select count(*)::int n from settings_history`)).rows[0].n === 0, 'Warehouse reads no history')

await db.exec('reset role')
check(await fails(() => db.query(`update settings_history set new_value = '"x"'::jsonb`), 'Law 3'), 'settings_history cannot be updated, even by the owner role')
check(await fails(() => db.query(`delete from settings`), 'Law 3'), 'nothing is deleted from settings, even by the owner role')
check(await fails(() => db.query(`delete from settings_history`), 'Law 3'), 'settings_history cannot be deleted')

console.log(failed ? `\n❌ ${failed} settings check(s) FAILED` : '\n🎉 SETTINGS TABLE VERIFIED')
process.exit(failed ? 1 : 0)
