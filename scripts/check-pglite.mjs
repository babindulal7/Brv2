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

await db.close()

console.log(`\n${applied}/${files.length} applied, ${failures.length} failed`)
if (failures.length) {
  console.log('\nFailures:')
  for (const x of failures) console.log(`  ${x.f}\n     ${x.msg}`)
  process.exit(1)
}
console.log('The chain builds from scratch. (Not a Supabase environment — see this file’s header.)')
