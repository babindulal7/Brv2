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
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')
const PRELUDE_PATH = join(HERE, '..', 'supabase', 'pglite-prelude.sql')

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

const viewAudit = await auditAnonViewReads(db)

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

await db.close()

if (failures.length) {
  console.log('\nFailures:')
  for (const x of failures) console.log(`  ${x.f}\n     ${x.msg}`)
  process.exit(1)
}
if (viewAudit.leaked.length) {
  console.log('\nThe chain builds, and it still leaks to anon. Both are reported; neither cancels the other.')
  process.exit(1)
}
if (viewAudit.checked === 0) {
  // A gate that passes because it examined nothing is not a gate. If the chain
  // ever produced zero views this would be a broken prelude, not a clean bill.
  console.log('\nNo public views exist, so the leak gate proved nothing. Treat this as a failure.')
  process.exit(1)
}
console.log('The chain builds from scratch, and no view is readable by anon. (Not a Supabase environment — see this file’s header.)')
