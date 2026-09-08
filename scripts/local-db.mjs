#!/usr/bin/env node
/**
 * `npm run db:local` — a real Postgres on this laptop, with no Docker, no
 * Supabase project and no network.
 *
 * ## Why this exists
 *
 * The project already had two local options and neither covers the middle:
 *
 *   `npm run db:start`  the Supabase stack — Postgres + PostgREST + GoTrue.
 *                       The right answer, and it needs Docker. On this machine
 *                       `com.docker.service` is Stopped with StartType Manual,
 *                       and an unelevated shell gets "Cannot open
 *                       com.docker.service service on computer '.'". Launching
 *                       Docker Desktop starts its UI and `com.docker.backend`
 *                       but not the privileged service, so the engine never
 *                       arrives.
 *   `npm run dev:mock`  the fixture corpus in `src/lib/mock/`. No network and
 *                       no credentials, but also no Postgres: no RLS, no
 *                       triggers, no constraints, no enums. It cannot answer a
 *                       question about the schema, which is where most of this
 *                       project's defects have lived.
 *
 * `check:pglite` already proved the third way: PGlite is Postgres 18 compiled
 * to WASM, with a real planner, real plpgsql, real constraints and real
 * triggers. It just threw the database away at the end of every run. This keeps
 * it — on disk, in `.localdb/`, incrementally migrated — so schema work,
 * queries and probes all happen locally instead of against production.
 *
 * ## What it is not
 *
 * ❌ **The app cannot talk to it.** `supabase-js` speaks PostgREST over HTTP,
 *    and PostgREST is a separate service that only the Docker stack provides.
 *    For a browser, `npm run dev:mock` remains the no-Docker option.
 * ❌ **Not a Supabase environment.** `supabase/pglite-prelude.sql` stands up the
 *    API roles, `auth`, `storage` and an `auth.users` stub so the DDL applies;
 *    it does not reproduce Supabase's privilege model or JWT claims. RLS
 *    behaviour proven here is not proven for production — same caveat
 *    `check:pglite` and `check:lifecycle` carry.
 * ❌ **Not production's data.** The rows are whatever the seed migrations
 *    insert. A failure that depends on production's 246 bookings will not
 *    reproduce here.
 *
 *     node scripts/local-db.mjs                    # bring .localdb up to date
 *     node scripts/local-db.mjs --reset            # throw it away and rebuild
 *     node scripts/local-db.mjs --sql "select 1"   # run a query against it
 *     node scripts/local-db.mjs --status           # what is applied, what is not
 *
 * Exit 0 only when every pending migration applied.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const PRELUDE = join(ROOT, 'supabase', 'pglite-prelude.sql')
const DATA_DIR = join(ROOT, '.localdb')

const firstLine = (e) => String(e?.message ?? e).split('\n')[0]
process.on('uncaughtException', (e) => { console.error(`\nFATAL: ${firstLine(e)}`); process.exit(2) })
process.on('unhandledRejection', (e) => { console.error(`\nFATAL: ${firstLine(e)}`); process.exit(2) })

const args = process.argv.slice(2)
const reset = args.includes('--reset')
const statusOnly = args.includes('--status')
const sqlIdx = args.indexOf('--sql')
const sql = sqlIdx === -1 ? null : args[sqlIdx + 1]

if (reset) {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true })
    console.log('removed .localdb/')
  }
}

const fresh = !existsSync(DATA_DIR)
const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pgcrypto, btree_gist } })
const version = (await db.query('select version()')).rows[0].version.split(',')[0]
console.log(`${version}\n.localdb/  ${fresh ? '(created)' : '(reused)'}`)

/*
 * The prelude is idempotent (`create ... if not exists`, guarded `create role`),
 * but running it on every open is still wasted work and one more thing that can
 * fail. It runs once, on a fresh directory.
 */
if (fresh) {
  try {
    await db.exec(readFileSync(PRELUDE, 'utf8'))
  } catch (e) {
    console.error(`\nPRELUDE FAILED — ${firstLine(e)}`)
    console.error('supabase/pglite-prelude.sql is what stands in for the Supabase environment.')
    process.exit(2)
  }
}

/*
 * The same ledger table Supabase uses, filled the same way, so `--status` answers
 * the question in the same shape as `supabase_migrations.schema_migrations` on a
 * real project — and so a second run applies only what is new instead of
 * rebuilding from scratch.
 */
await db.exec(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    name    text
  );
`)

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
const applied = new Set(
  (await db.query('select name from supabase_migrations.schema_migrations')).rows.map((r) => r.name),
)
const pending = files.filter((f) => !applied.has(f))

if (statusOnly) {
  console.log(`\n${applied.size} applied, ${pending.length} pending, ${files.length} in the repo`)
  if (pending.length) {
    console.log('\nPending:')
    for (const f of pending) console.log(`  ${f}`)
  }
  await db.close()
  process.exit(0)
}

if (sql !== null && sql !== undefined && pending.length === 0) {
  await runQuery()
  await db.close()
  process.exit(0)
}

console.log(`${applied.size} already applied, ${pending.length} pending\n`)

const failures = []
let n = 0
for (const f of pending) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
    await db.query(
      'insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict do nothing',
      [f.slice(0, 4) + String(Date.now()).slice(-9), f],
    )
    n++
    console.log(`  ok   ${f}`)
  } catch (e) {
    failures.push({ f, msg: firstLine(e) })
    console.log(`  FAIL ${f}\n         ${failures.at(-1).msg}`)
    /*
     * Each migration carries its own begin/commit, so a failure leaves the
     * session in an aborted transaction and every later file reports the same
     * cascade rather than its own result.
     */
    try { await db.exec('rollback') } catch { /* not in a transaction */ }
  }
}

console.log(`\n${n}/${pending.length} applied, ${failures.length} failed`)

if (failures.length === 0 && pending.length > 0) {
  const t = await db.query(
    `select count(*)::int as n from information_schema.tables where table_schema='public'`)
  const p = await db.query(`select count(*)::int as n from pg_policies where schemaname='public'`)
  console.log(`public schema: ${t.rows[0].n} tables, ${p.rows[0].n} policies`)
}

if (sql !== null && sql !== undefined) await runQuery()

await db.close()

if (failures.length) {
  console.log('\nFailures:')
  for (const x of failures) console.log(`  ${x.f}\n     ${x.msg}`)
  process.exit(1)
}
console.log('\n.localdb/ is up to date. Not a Supabase environment — see this file’s header.')

async function runQuery() {
  console.log(`\n> ${sql}`)
  try {
    const r = await db.query(sql)
    if (r.rows.length === 0) {
      console.log(`(no rows${r.affectedRows ? `, ${r.affectedRows} affected` : ''})`)
      return
    }
    const cols = Object.keys(r.rows[0])
    console.log(cols.join(' | '))
    for (const row of r.rows.slice(0, 50)) {
      console.log(cols.map((c) => (row[c] === null ? 'NULL' : String(row[c]))).join(' | '))
    }
    if (r.rows.length > 50) console.log(`… ${r.rows.length - 50} more`)
  } catch (e) {
    console.error(`query failed: ${firstLine(e)}`)
    process.exitCode = 1
  }
}
