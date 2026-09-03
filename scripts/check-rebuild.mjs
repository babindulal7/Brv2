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
 * It cannot touch anything remote: the only connection is `docker exec` into the
 * running `supabase_db_*` container over its unix socket — no DB URL, no env var,
 * no Supabase CLI call. (The one indirection is Docker's own DOCKER_HOST /
 * DOCKER_CONTEXT, which could point `docker ps` at another daemon's stack; both
 * are unset here.) It builds a per-run scratch database inside that container,
 * applies every migration into it, and drops it again.
 *
 * It SHARES the dev database's cluster, and one migration writes cluster-wide:
 * 0041 runs `alter role authenticator set pgrst.db_pre_request = …` with no
 * `in database` clause, so pg_db_role_setting changes for every database in the
 * container. In this stack that is value-neutral — dev ran 0041 too and holds
 * the identical value — but in a cluster that has NOT run 0041, a scratch build
 * would introduce it. That is the honest scope of "does not touch dev".
 *
 * WHAT A GREEN RUN PROVES, AND WHAT IT DOES NOT. It proves the repo's migration
 * files apply, in filename order, in one transaction each (`-1`, as `db push`
 * did on live). It does not prove production is reproducible byte-for-byte: the
 * live ledger and this directory differ in three known ways — the ledger lacks
 * 0047_seed_reference_corpus (its rows reached live by another route and its own
 * header says leave it unapplied), it carries 0047_seed_tail_b917_equipment_line
 * and one other live-only row that no file here represents, and until 3 Sep this
 * script wrongly skipped 0062, which the ledger has. Query the ledger, never a
 * header, for what live actually ran.
 *
 * ## Fidelity
 *
 * A real Supabase project hands the migrations more than an empty database: the
 * `auth` schema, the `extensions` schema, pgcrypto and btree_gist. Those are
 * copied from the running stack rather than hand-stubbed, so what is tested is
 * the shape migrations actually meet — with one limit: the restore is lenient,
 * and in this container `postgres` is not a superuser and not a member of
 * supabase_auth_admin, so every `OWNER TO supabase_auth_admin` line fails
 * quietly and `postgres` ends up owning auth.users and its siblings. Auth-schema
 * DDL can therefore pass here and fail on live, where those objects are owned
 * by supabase_auth_admin. The assertion below guarantees only that the two
 * things the migrations read — auth.users and auth.uid() — exist.
 *
 * ⚠ Default privileges are NOT reproduced. `create database` clones template1,
 * which locally has no pg_default_acl rows, whereas a real Supabase project
 * grants anon / authenticated / service_role ALL on every new public relation
 * by default. So every relation this gate builds carries only the grants a
 * migration states explicitly (client_directory_v: live = {postgres, anon,
 * authenticated, service_role}; here = {postgres, authenticated}). That cannot
 * turn a red run green, but it means a migration that silently RELIES on the
 * platform default grant would pass here and fail on live. If a privilege
 * assertion ever needs the platform defaults, seed pg_default_acl in the
 * bootstrap rather than weakening the assertion.
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
/* Per-run, not fixed: parallel sessions are routine in this workspace, and a
   shared name plus `drop … (force)` let one run terminate another's backend
   mid-0047 and then report every later file as FAILED. The pid makes the name
   this run's alone; the drop at the end only ever drops its own. */
const SCRATCH = `rebuild_check_${process.pid}`

/**
 * Nothing is held back. This gate proves the set that built PRODUCTION, and the
 * live ledger (supabase_migrations.schema_migrations, read 3 Sep 2026) carries
 * 0062_law6_column_grants_arm_the_mask at 20260828070623 — applied, right after
 * 0065_arm_0062_prerequisites at 20260828070501. PLAN.md §4.28's "WRITTEN, NOT
 * APPLIED" was stale, and copying the apply script's HELD_BACK list here would
 * have made a disaster-recovery rebuild come up with Law 6's column grants
 * UNARMED — quieter than live, on the one law that hides money from the floor.
 *
 * Note the order: live applied 0065 BEFORE 0062, its stated prerequisite, but
 * filename order runs 0062 first. If that pair cannot apply in filename order,
 * this gate will say so — that is a finding, not a reason to skip the file.
 */
const HELD_BACK = new Set()

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
const authCheck = execFileSync(
  'docker',
  ['exec', '-i', container, 'psql', '-tA', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', SCRATCH],
  { input: `select
     (select count(*) from information_schema.tables where table_schema='auth' and table_name='users') as users_table,
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='auth' and p.proname='uid') as uid_fn,
     (select count(*) from information_schema.columns
       where table_schema='auth' and table_name='users' and column_name='email_confirmed_at') as email_confirmed_at;`, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
)
/* -tA prints exactly one line, `1|1|1`; split on the column separator rather
   than sweeping for digits, which would also match a header, a `(1 row)`
   footer, or a NOTICE that happened to contain a number. */
const [usersTable, uidFn, emailConfirmedAt] = authCheck.trim().split('|').map(Number)
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
    /* `-1`: the whole file in one transaction, which is how `supabase db push`
       and the Management-API migration endpoint applied 0001–0078 to live.
       Autocommit-per-statement (the apply script's mode) would let a file
       that cannot run inside a transaction block pass here and fail there.
       0047 carries its own begin/commit; under -1 those only WARN. */
    execFileSync('docker', ['exec', '-i', container, 'psql', '-1', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', SCRATCH], {
      input: readFileSync(join(MIGRATIONS, f), 'utf8'),
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
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
