#!/usr/bin/env node
/**
 * Apply every migration to a throwaway Postgres **in this process** — no Docker,
 * no Supabase stack, no network.
 *
 * ## Why this exists
 *
 * `check:rebuild` and `db:apply` both need the local Supabase stack, which needs
 * Docker. When `com.docker.service` is stopped — and an unelevated shell cannot
 * start it — there is no way to execute a migration at all, so a new `.sql` file
 * is unverifiable and every claim about it is a reading. That is how
 * `0092`'s probe shipped: it committed a real UPDATE to a production product row
 * because nothing had ever run it.
 *
 * PGlite is Postgres 18 compiled to WASM, running inside Node. It is a real
 * planner, real plpgsql, real constraints and real triggers.
 *
 * ## What it proves, and what it does not
 *
 * ✅ The chain **builds from scratch in filename order** — every CREATE, every
 *    ALTER, every trigger body compiles, every pre/post-condition block passes,
 *    and constraints hold against whatever rows the seed migrations insert.
 *
 * ❌ It is **not** a Supabase environment. `supabase/pglite-prelude.sql` creates
 *    the API roles, the `auth` and `storage` schemas and an `auth.users` stub so
 *    the DDL is applicable — it does NOT reproduce Supabase's privilege model,
 *    JWT claims or PostgREST. **RLS behaviour proven here is not proven for
 *    production.** For that you still need a real stack and a real seat.
 *
 * ❌ It is not a drift test either. This builds an EMPTY database, so it cannot
 *    reproduce a failure that depends on production's rows — `0088` and `0089`
 *    both fail on live for exactly that reason and pass here.
 *
 * ## It also runs a gate
 *
 * After the chain builds, it asserts the one view invariant that has been broken
 * before: no view in `public` is readable by `anon`. See `auditAnonViewReads` for
 * why that is measured against `pg_class` rather than against a list of the three
 * views the 3 Oct audit happened to name.
 *
 *   node scripts/check-pglite.mjs              # apply all, report failures
 *   node scripts/check-pglite.mjs --stop       # stop at the first failure
 *   node scripts/check-pglite.mjs --from 0090  # skip ahead (chain may not build)
 *
 * Exit 0 only when every file applied.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const PRELUDE_PATH = join(ROOT, 'supabase', 'pglite-prelude.sql')

const args = process.argv.slice(2)
const stopFirst = args.includes('--stop')
const fromIdx = args.indexOf('--from')
const from = fromIdx === -1 ? null : args[fromIdx + 1]

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const version = (await db.query('select version()')).rows[0].version.split(',')[0]
console.log(version)

try {
  await db.exec(readFileSync(PRELUDE_PATH, 'utf8'))
} catch (e) {
  console.error(`\nPRELUDE FAILED — ${String(e.message).split('\n')[0]}`)
  console.error('supabase/pglite-prelude.sql is what stands in for the Supabase environment.')
  process.exit(2)
}

let files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
if (from) files = files.filter((f) => f.slice(0, 4) >= from)

const failures = []
let applied = 0

for (const f of files) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
    applied++
  } catch (e) {
    const msg = String(e.message).split('\n')[0]
    failures.push({ f, msg })
    console.log(`  FAIL  ${f}\n          ${msg}`)
    // Each migration carries its own begin/commit, so a failure leaves the
    // session in an aborted transaction and every later file would report the
    // same cascade rather than its own result.
    try { await db.exec('rollback') } catch { /* not in a transaction */ }
    if (stopFirst) break
  }
}

// ── the view-leak gate ────────────────────────────────────────────────────────
//
// One invariant, no allow-list: no view in `public` may be readable by `anon`.
//
// It is deliberately not "the three views the audit named". An allow-list passes
// the moment someone adds a fourth leaky view, which is the failure this exists to
// catch, and it goes stale silently — nobody edits a list they don't know exists.
// The list is derived from `pg_class` on every run, so a new view is covered the
// day it is created and the check cannot be forgotten on the way in.
//
// ## Why this can be measured here at all
//
// Because `supabase/pglite-prelude.sql:49` runs
// `alter default privileges in schema public grant all on tables to anon, …`
// BEFORE any migration. That is what Supabase does, so every view this chain
// creates is anon-readable unless a migration revokes it — which is exactly the
// condition that produced the 3 Oct audit findings. Without that line the gate
// would pass for the wrong reason and mean nothing.
//
// ## It checks the GRANT, not the rows
//
// A view can return zero rows and still be a hole; a view can return rows and be
// correct for the roles meant to read it. So this asks `has_table_privilege`,
// which is the thing that must be false. Row-level predicates on the three
// offending views are a second line of defence, asserted by 0148's own
// post-conditions — this gate does not attempt to replace them, because "the view
// filters" and "the view is not reachable" are different guarantees and only one
// of them survives a later migration that forgets the predicate.
async function auditAnonViewReads(db) {
  const { rows } = await db.query(`
    select c.relname as view
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and has_table_privilege('anon', c.oid, 'SELECT')
    order by c.relname
  `)
  const total = await db.query(`
    select count(*)::int as n
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  `)
  return { leaked: rows.map((r) => r.view), checked: total.rows[0].n }
}

// ── the function-leak gate ───────────────────────────────────────────────────
//
// Invariant: no mutating, definer, or business RPC in `public` may be executable
// by `anon`.
// anon may only execute:
//   - auth_* session/role inspection helpers used by RLS
//   - portal_claim_by_verified_email
//   - pure mathematical calculators (invoice_vat_amount, etc.)
async function auditAnonFunctionExecution(db) {
  const { rows } = await db.query(`
    select
      p.proname as fn,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as is_definer,
      p.provolatile as volatility
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')
    order by p.proname;
  `)

  const ALLOWED_ANON_NON_TRIGGER = new Set([
    'auth_can_approve_damage',
    'auth_can_approve_late_fee_waiver',
    'auth_can_approve_purchase',
    'auth_can_view_money',
    'auth_client_id',
    'auth_is_finance_or_admin',
    'auth_is_manager_or_above',
    'auth_is_owner',
    'auth_is_staff',
    'auth_user_branch_id',
    'auth_user_id',
    'auth_user_role',
    'intel_field_allowed',
    'invoice_credit',
    'invoice_discount_amount',
    'invoice_outstanding',
    'invoice_vat_amount',
    'next_booking_stage',
    'retired_stage_to_canonical',
    'set_request_context',
  ])

  const leaked = rows.filter((r) => !ALLOWED_ANON_NON_TRIGGER.has(r.fn))
  return { leaked: leaked.map((r) => `${r.fn}(${r.args})`), checked: rows.length }
}

async function auditSecurityDefinerSearchPath(db) {
  const { rows } = await db.query(`
    SELECT p.proname, n.nspname, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true;
  `)
  const unpinned = rows.filter((r) => {
    const config = r.proconfig || []
    return !config.some((c) => c.toLowerCase().startsWith('search_path='))
  })
  return { unpinned: unpinned.map((r) => r.proname), checked: rows.length }
}

const viewAudit = await auditAnonViewReads(db)
const funcAudit = await auditAnonFunctionExecution(db)
const definerAudit = await auditSecurityDefinerSearchPath(db)

console.log(`\n${applied}/${files.length} applied, ${failures.length} failed`)

console.log(
  `\nview-leak gate: ${viewAudit.checked} public view(s) checked, ` +
    `${viewAudit.leaked.length} readable by anon`,
)
if (viewAudit.leaked.length) {
  console.log('\n  anon holds SELECT on views that must not be reachable without a session:')
  for (const v of viewAudit.leaked) console.log(`    ${v}`)
  console.log(
    '\n  Supabase grants every new table and view to anon by default\n' +
      '  (pglite-prelude.sql:49 reproduces it). A view that is meant to be read by a\n' +
      '  signed-in session therefore needs an explicit revoke, not merely a row\n' +
      '  predicate — and 0148 states that revoke for all views in public.',
  )
}

console.log(
  `function-leak gate: ${funcAudit.checked} public function(s) executable by anon, ` +
    `${funcAudit.leaked.length} unauthorized`,
)
if (funcAudit.leaked.length) {
  console.log('\n  anon holds EXECUTE on functions that must not be reachable without a session:')
  for (const fn of funcAudit.leaked) console.log(`    ${fn}`)
  console.log(
    '\n  Mutating and sensitive RPCs must have execute revoked from anon and public.\n' +
      '  Only authenticated users may execute business RPCs.',
  )
}

console.log(
  `definer-hygiene gate: ${definerAudit.checked} definer function(s) checked, ` +
    `${definerAudit.unpinned.length} without pinned search_path`,
)
if (definerAudit.unpinned.length) {
  console.log('\n  SECURITY DEFINER functions must pin search_path to prevent escalation:')
  for (const fn of definerAudit.unpinned) console.log(`    ${fn}`)
}

await db.close()

if (failures.length) {
  console.log('\nFailures:')
  for (const x of failures) console.log(`  ${x.f}\n     ${x.msg}`)
  process.exit(1)
}
if (viewAudit.leaked.length) {
  console.log('\nThe chain builds, and it still leaks views to anon. Both are reported; neither cancels the other.')
  process.exit(1)
}
if (viewAudit.checked === 0) {
  // A gate that passes because it examined nothing is not a gate. If the chain
  // ever produced zero views this would be a broken prelude, not a clean bill.
  console.log('\nNo public views exist, so the view leak gate proved nothing. Treat this as a failure.')
  process.exit(1)
}
if (funcAudit.leaked.length) {
  console.log('\nThe chain builds, and it still leaks RPC functions to anon. Both are reported; neither cancels the other.')
  process.exit(1)
}
if (definerAudit.unpinned.length) {
  console.log('\nThe chain builds, and it still contains unpinned SECURITY DEFINER functions.')
  process.exit(1)
}
const pgliteResult = {
  applied,
  total: files.length,
  failed: failures.length,
  views_checked: viewAudit.checked,
  views_leaked: viewAudit.leaked.length,
  at: new Date().toISOString(),
}
writeFileSync(join(ROOT, '.pglite-result.json'), JSON.stringify(pgliteResult, null, 2))
console.log('The chain builds from scratch, no view is readable by anon, no unauthorized RPC is executable by anon, and all definer search_paths are pinned.')
