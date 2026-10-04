// check-anon-exposure.mjs — what can the PUBLIC anon key do? (audit D1-D7, 3 Oct 2026)
//
// Builds the schema in PGlite (same chain as check:pglite), then:
//   1. fails if anon can EXECUTE any non-trigger function that is not on ALLOWED_FUNCTIONS;
//   2. fails if anon holds SELECT on any view/table that is not on ALLOWED_RELATIONS;
//   3. drives the write RPCs and audit_logs as anon / Client / Warehouse / Owner and checks the outcome.
// PGlite is not Supabase: grants and SQL logic are real, JWT/PostgREST are simulated with
// `set local role` + request.jwt.claim.sub. Run on a staging copy of live as well (see header of 0148).
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Why each is public: RLS policies call them in the invoking role's name, so anon needs EXECUTE.
const ALLOWED_FUNCTIONS = new Set([
  'auth_can_approve_damage', 'auth_can_approve_late_fee_waiver', 'auth_can_approve_purchase', 'auth_can_view_money',
  'auth_client_id', 'auth_is_finance_or_admin', 'auth_is_manager_or_above', 'auth_is_owner', 'auth_is_staff',
  'auth_user_branch_id', 'auth_user_id', 'auth_user_role', 'intel_field_allowed',
  'invoice_credit', 'invoice_discount_amount', 'invoice_outstanding', 'invoice_paid_net', 'invoice_vat_amount',
  'next_booking_stage', 'retired_stage_to_canonical', 'set_request_context',
])
const ALLOWED_RELATIONS = new Set([]) // anon reads no table or view

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))

let fail = 0
const ok = (m) => console.log('  PASS', m)
const bad = (m) => { fail++; console.log('  FAIL', m) }
const check = (c, m) => (c ? ok(m) : bad(m))
const q = async (s) => (await db.query(s)).rows

console.log('1. Functions anon can execute')
const fns = await q(`select p.proname, p.oid::regprocedure::text sig from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f' and p.prorettype<>'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute') order by 1`)
const extra = fns.filter((f) => !ALLOWED_FUNCTIONS.has(f.proname))
check(extra.length === 0, `anon executes only allow-listed functions (${fns.length} callable)`)
for (const f of extra) console.log('       not allow-listed:', f.sig)

console.log('2. Relations anon can read')
// Supabase grants SELECT on public tables to anon and relies on RLS, so a table is fine if RLS is on.
// A view that runs with owner rights skips that RLS, so anon must not read it at all.
const rels = await q(`select c.relname, c.relkind, c.relrowsecurity rls,
    coalesce(c.reloptions::text[] @> array['security_invoker=true'], false) invoker
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m','p')
    and has_table_privilege('anon', c.oid, 'select') order by 1`)
const noRls = rels.filter((r) => r.relkind === 'r' && !r.rls && !ALLOWED_RELATIONS.has(r.relname))
check(noRls.length === 0, `every table anon can read has RLS on (${rels.filter((r) => r.relkind === 'r').length} tables)`)
for (const r of noRls) console.log('       RLS off:', r.relname)
const defView = rels.filter((r) => r.relkind !== 'r' && !r.invoker && !ALLOWED_RELATIONS.has(r.relname))
check(defView.length === 0, `anon reads no view that runs with owner rights (${rels.filter((r) => r.relkind !== 'r').length} views readable by anon)`)
for (const r of defView) console.log('       owner-rights view readable by anon:', r.relname)

console.log('3. Behaviour')
const one = async (s) => (await q(s))[0]
const owner = (await one(`select id from users where primary_role='Owner' and is_active limit 1`)).id
const wh = (await one(`select id from users where primary_role='Warehouse' and is_active limit 1`))?.id
const other = (await one(`select id from users where primary_role='Admin' and is_active and id<>'${owner}' limit 1`))?.id ?? owner
const quote = async () => (await one(`select id from bookings where stage::text in ('Quote','Booked') and cancelled_at is null order by created_at limit 1`)).id
const as = async (role, uid, sql) => {
  try {
    await db.exec('begin')
    await db.exec(`set local role ${role}`)
    if (uid) await db.query(`select set_config('request.jwt.claim.sub','${uid}',true), set_config('request.jwt.claim.role','${role}',true)`)
    const r = await db.query(sql)
    await db.exec('reset role')
    const extra = await q(`select cancelled_by, cancellation_reason from bookings where cancelled_at is not null order by cancelled_at desc limit 1`)
    return { ok: true, rows: r.rows, after: extra[0] }
  } catch (e) { return { ok: false, err: String(e.message).split('\n')[0] } }
  finally { try { await db.exec('rollback') } catch {} }
}
const bk = await quote()
const REASON = 'check-anon-exposure probe reason'

let r = await as('anon', null, `select cancel_booking('${bk}'::uuid,'${REASON}','${owner}'::uuid)`)
check(!r.ok, `anon cannot cancel a booking, even with a real actor id (${r.ok ? 'SUCCEEDED' : r.err.slice(0, 70)})`)
r = await as('authenticated', null, `select cancel_booking(jsonb_build_object('booking_id','${bk}','reason','${REASON}'))`)
check(!r.ok, 'a signed-in session with no staff row (Client) cannot cancel')
if (wh) { r = await as('authenticated', wh, `select cancel_booking(jsonb_build_object('booking_id','${bk}','reason','${REASON}'))`); check(!r.ok, 'Warehouse cannot cancel') }
r = await as('authenticated', owner, `select cancel_booking(jsonb_build_object('booking_id','${bk}','reason','${REASON}','actor_id','${other}'))`)
check(r.ok && r.after?.cancelled_by === owner, `Owner can cancel, and the actor recorded is the caller, not the payload id (${r.ok ? 'recorded ' + String(r.after?.cancelled_by).slice(0, 8) : r.err})`)

r = await as('anon', null, `select extend_booking('${bk}'::uuid,1,'${REASON}','${owner}'::uuid)`)
check(!r.ok, 'anon cannot extend a booking')
const onrent = (await q(`select id from bookings where stage::text in ('On Rent') and cancelled_at is null limit 1`))[0]
if (onrent) { r = await as('authenticated', owner, `select extend_booking(jsonb_build_object('booking_id','${onrent.id}','days',1,'reason','${REASON}'))`); check(r.ok, `Owner can extend an On Rent booking (${r.ok ? 'ok' : r.err})`) }
else console.log('  SKIP  no On Rent booking in seed for the extend success path')

const inv = (await one(`select id from invoices where status::text<>'Void' limit 1`)).id
r = await as('anon', null, `select void_invoice(jsonb_build_object('invoice_id','${inv}','reason','${REASON}'))`)
check(!r.ok, 'anon cannot void an invoice')
r = await as('authenticated', owner, `select void_invoice(jsonb_build_object('invoice_id','${inv}','reason','${REASON}'))`)
check(r.ok, `Owner can void an invoice (${r.ok ? 'ok' : r.err})`)

const n = async (role, uid) => { const x = await as(role, uid, 'select count(*)::int c from audit_logs'); return x.ok ? x.rows[0].c : x.err }
const base = (await one('select count(*)::int c from audit_events')).c
const a = await n('anon', null)
check(typeof a === 'string', `anon cannot read audit_logs (${a})`)
const o = await n('authenticated', owner); check(o === base, `Owner reads all ${base} audit rows through audit_logs (saw ${o})`)
if (wh) { const w = await n('authenticated', wh); check(w === 0, `Warehouse reads 0 audit rows (saw ${w})`) }

r = await as('anon', null, 'select count(*)::int c from staff_directory_v'); check(!r.ok, 'anon cannot read staff_directory_v')
r = await as('anon', null, 'select count(*)::int c from product_units_service_v'); check(!r.ok, 'anon cannot read product_units_service_v')

console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll checks passed')
await db.close()
process.exit(fail ? 1 : 0)
