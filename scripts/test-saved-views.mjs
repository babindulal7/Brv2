#!/usr/bin/env node
// Booqable adoption spec G2 (0159): shared saved views. Proves system views are seeded and fixed, private
// vs team visibility, Manager+ publishes, Warehouse never sees a money-filtered view (Law 6), retire never
// deletes, retries are idempotent. EXCLUDE_MIGRATION=0159 proves the checks fail without the migration.
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
  Owner: '00000000-0000-0000-0000-000000000301', Manager: '00000000-0000-0000-0000-000000000302',
  Warehouse: '00000000-0000-0000-0000-000000000303', Coordinator: '00000000-0000-0000-0000-000000000304',
}
for (const [role, id] of Object.entries(ids)) {
  await db.query(`insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
    values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1) on conflict (id) do update set primary_role = $5`,
    [id, `EMP-V-${role}`, `${role.toLowerCase()}-v@babinrentals.com`, role, role, branchId])
}
const as = (role) => db.exec(`reset role; select set_config('app.current_user_id', '${ids[role]}', false); set role authenticated;`)
const uuid = () => crypto.randomUUID()
const fails = async (fn, frag) => { try { await fn() } catch (e) { return frag ? e.message.includes(frag) : true } return false }
const save = (name, query, vis = 'private', id = null, cu = uuid()) =>
  db.query(`select save_view($1, 'rentals', $2, $3, '{}'::text[], $4, $5) as id`, [cu, name, query, vis, id]).then((r) => r.rows[0].id)
const names = async () => (await db.query(`select name from saved_views order by name`)).rows.map((r) => r.name)

await as('Warehouse')
const sys = await names()
check(['Pickups today', 'Returns today', 'Overdue', 'Awaiting inspection', 'Drafts'].every((n) => sys.includes(n)), 'the five system views are visible to the floor')
check(!(await db.query(`select 1 from saved_views where query like '%Pickups Today%'`)).rows.length, 'system views hold a relative chip, never a date literal')

await as('Coordinator')
const mine = await save('My overdue', 'quick=Overdue&stage=On+Rent')
check((await names()).includes('My overdue'), 'staff can save a private view')
check(await fails(() => save('For everyone', 'quick=Overdue', 'team'), 'gate.saved_view.publish'), 'a Coordinator cannot publish a team view (D-3)')
const cu = uuid()
const a = await save('Retry', 'stage=Draft', 'private', null, cu)
const b = await save('Retry', 'stage=Draft', 'private', null, cu)
check(a === b, 'a retried client_uuid returns the same view')
const money = await save('Unpaid', 'quick=Payment+Due')
check((await db.query(`select touches_money from saved_views where id = $1`, [money])).rows[0].touches_money, 'a Payment Due view is flagged touches_money by the database')

await as('Warehouse')
check(!(await names()).includes('My overdue'), "Warehouse does not see someone else's private view")
check(await fails(() => save('Money', 'quick=Payment+Due'), 'gate.saved_view.money'), 'Warehouse cannot save a money-filtered view')

await as('Manager')
const team = await save('Team handover list', 'quick=Returning', 'team')
check(await fails(() => save('Team handover list', 'quick=Returning', 'team'), 'unique'), 'a team view name is unique per list')
await save('Team unpaid', 'quick=Payment+Due', 'team')
check((await names()).includes('Team unpaid') && !(await names()).includes('Unpaid'), 'Manager sees a team money view but not a private view of someone else')

await as('Warehouse')
check((await names()).includes('Team handover list'), 'a team view appears for the floor (the desktop-to-phone case)')
check(!(await names()).includes('Team unpaid'), 'Warehouse never sees even a TEAM view that filters on money (Law 6)')
check(await fails(() => db.query(`select retire_view($1)`, [team]), 'gate.saved_view.not_yours'), 'Warehouse cannot retire a team view')

await as('Coordinator')
check(await fails(() => db.query(`select retire_view((select id from saved_views where system_key = 'rentals.overdue'))`), 'system_fixed'), 'a system view cannot be retired')
const draftsId = (await db.query(`select id from saved_views where system_key='rentals.drafts'`)).rows[0].id
check(await fails(() => save('Hacked', 'x=1', 'private', draftsId), 'system_fixed'), 'a system view cannot be edited')
await db.query(`select retire_view($1)`, [mine])
check(!(await names()).includes('My overdue'), 'a retired view disappears from the menu')
check(await fails(() => db.query(`delete from saved_views`), 'permission denied'), 'authenticated has no DELETE')

await db.exec('reset role')
check((await db.query(`select count(*)::int n from saved_views where id = $1 and retired_at is not null`, [mine])).rows[0].n === 1, 'the retired row is still in the table (Law 3)')
check(await fails(() => db.query(`delete from saved_views`), 'Law 3'), 'not even the owner role can delete')
check(await fails(() => db.query(`update saved_views set name = 'x' where is_system`), 'system_fixed'), 'not even the owner role can edit a system view')

console.log(failed ? `\n❌ ${failed} saved-view check(s) FAILED` : '\n🎉 SAVED VIEWS VERIFIED')
process.exit(failed ? 1 : 0)
