#!/usr/bin/env node
/**
 * check-rebuild.mjs — can this repo build a database FROM SCRATCH?
 *
 *   npm run check:rebuild
 *
 * ## Why this exists
 *
 * `scripts/check-dump.mjs` records that the project is on Supabase **Free**: no
 * PITR, no automated backup. That makes the migration set the disaster-recovery
 * plan — and on 2 Sep 2026 it did not run. Applying all of it into an empty
 * schema hit four blockers (BUG-010, PLAN.md §4.42a), none of which anything
 * would ever have caught, because nobody rebuilds a database that already
 * exists. That is exactly the kind of failure a gate is for.
 *
 * This is the gate. It proves the claim the whole recovery story rests on.
 *
 * ## What it does NOT do
 *
 * It never touches the dev database and it cannot touch anything remote. It
 * builds a scratch database (`rebuild_check`) inside the local stack's own
 * Postgres container, applies every migration into it, and drops it again. The
 * connection is the container, exactly as `apply-migrations-local.mjs` does it —
 * there is no flag, env var or argument that can aim this at a project.
 *
 * ## Fidelity
 *
 * A real Supabase project hands the migrations more than an empty database: the
 * `auth` schema, the `extensions` schema, pgcrypto and btree_gist. Those are
 * copied from the running stack rather than hand-stubbed, so what is tested is
 * the shape migrations actually meet.
 *
 * ⚠ If the local `auth` schema is stale, this reports a failure that is NOT a
 * repo defect — `0067` reads `auth.users.email_confirmed_at`, which exists on
 * the live project but disappears locally if `supabase db reset` drops the schema
 * while GoTrue is already running (it then never re-runs its own migrations).
 * Fix the environment, not the migration:  docker restart supabase_auth_<project>
 */
import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')
const SCRATCH = 'rebuild_check'

/** Held back by PLAN.md §4.28 — same list, and the same reason, as the apply script. */
const HELD_BACK = new Set(['0062_law6_column_grants_arm_the_mask.sql'])

function containerName() {
  const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' })
  const db = out.split('\n').map((s) => s.trim()).filter((s) => s.startsWith('supabase_db_'))
  if (db.length === 0) {
    console.error('No `supabase_db_*` container is running.  Start it first:  npx supabase start')
    process.exit(1)
  }
  if (db.length > 1) {
    console.error(`More than one Supabase DB container is running: ${db.join(', ')}. Stop the others.`)
    process.exit(1)
  }
  return db[0]
}

const container = containerName()

const psql = (db, sql) =>
  execFileSync('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', db], {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  })

/**
 * Same, but WITHOUT `ON_ERROR_STOP`. Used only for the `auth` restore: a
 * schema-only pg_dump carries OWNER/ACL lines for roles this scratch database
 * has no reason to own, and under ON_ERROR_STOP the very first of them aborts
 * the restore and leaves `auth` empty — which then shows up as eight bogus
 * "function auth.uid() does not exist" failures blamed on the migrations. The
 * assertion below is what makes this safe: tolerate the noise, then PROVE the
 * two things the migrations actually need are there.
 */
const psqlLenient = (db, sql) =>
  execFileSync('docker', ['exec', '-i', container, 'psql', '-q', '-U', 'postgres', '-d', db], {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  })

console.log(`Building a scratch database in ${container} …\n`)

/* A scratch database, dropped and remade every run so a previous failure cannot
   leave state that makes the next run look better than it is. */
psql('postgres', `drop database if exists ${SCRATCH} (force); create database ${SCRATCH};`)

psql(
  SCRATCH,
  `create schema if not exists extensions;
   create extension if not exists pgcrypto with schema extensions;
   create extension if not exists btree_gist;
   create extension if not exists "uuid-ossp" with schema extensions;`,
)

/* Copied, not stubbed — see Fidelity above. */
const authSchema = execFileSync(
  'docker',
  ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema=auth', '--schema-only'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
psqlLenient(SCRATCH, authSchema)

/* Assert the bootstrap actually landed. Without this the script cheerfully
   reports the migrations as broken when the real fault is its own setup. */
const authCheck = psql(
  SCRATCH,
  `select
     (select count(*) from information_schema.tables where table_schema='auth' and table_name='users') as users_table,
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='auth' and p.proname='uid') as uid_fn,
     (select count(*) from information_schema.columns
       where table_schema='auth' and table_name='users' and column_name='email_confirmed_at') as email_confirmed_at;`,
)
const [usersTable, uidFn, emailConfirmedAt] = (authCheck.match(/\d+/g) ?? []).map(Number)
if (!usersTable || !uidFn) {
  console.error(
    `
Bootstrap failed: the scratch database has no auth.users / auth.uid().
` +
      `That is this script's setup, not a migration defect. The local auth schema is
` +
      `probably stale — restart GoTrue and re-run:  docker restart ${container.replace('_db_', '_auth_')}`,
  )
  process.exit(1)
}
if (!emailConfirmedAt) {
  console.log(
    `  note: local auth.users has no email_confirmed_at, so 0067 will fail here.
` +
      `        The live project HAS the column — this is a stale local GoTrue, not a
` +
      `        repo defect. Fix it with:  docker restart ${container.replace('_db_', '_auth_')}
`,
  )
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()

const failures = []
let applied = 0
for (const f of files) {
  if (HELD_BACK.has(f)) {
    console.log(`  skip  ${f}  (held back, PLAN.md §4.28)`)
    continue
  }
  process.stdout.write(`  ${f} … `)
  try {
    psql(SCRATCH, readFileSync(join(MIGRATIONS, f), 'utf8'))
    applied += 1
    console.log('ok')
  } catch (err) {
    const text = String(err.stderr || err.message)
    const line = text.split('\n').find((l) => /ERROR/i.test(l)) ?? text.split('\n')[0]
    console.log('FAILED')
    console.log(`        ${line.trim()}`)
    failures.push({ file: f, error: line.trim() })
  }
}

/* Left in place on failure so the half-built database can be inspected; dropped
   on success, because a green run has nothing to look at. */
if (failures.length === 0) psql('postgres', `drop database if exists ${SCRATCH} (force);`)

console.log(`\n${applied} applied, ${failures.length} failed.`)
if (failures.length > 0) {
  console.log(`\nThe scratch database ${SCRATCH} was left in place for inspection.`)
  console.log('If the only failure is 0067 / email_confirmed_at, the local auth schema is stale')
  console.log(`— restart GoTrue and re-run:  docker restart ${container.replace('_db_', '_auth_')}`)
  process.exit(1)
}
console.log('The migration set builds a database from scratch.')
