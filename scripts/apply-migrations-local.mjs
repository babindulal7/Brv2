#!/usr/bin/env node
/**
 * Apply every migration in `supabase/migrations/` to the LOCAL Supabase stack,
 * in filename order, stopping at the first error.
 *
 * ## Why this exists instead of `supabase db reset`
 *
 * The CLI only recognises migrations named `<14-digit-timestamp>_name.sql`.
 * This repo's are `0001_enums.sql` … `0062_law6_column_grants_arm_the_mask.sql`,
 * and that numbering is load-bearing: `0055`'s header states an apply-order
 * dependency, `0057`–`0060` were renumbered on 15 Aug specifically so that
 * filename order equals the order that built production, and half a dozen code
 * comments cite migrations by number. Renaming 63 files to timestamps to satisfy
 * the CLI would throw all of that away to gain nothing.
 *
 * So the files stay as they are and this script applies them directly through
 * `psql` inside the stack's own Postgres container.
 *
 * ## Safety
 *
 * It refuses to run against anything that is not localhost. The connection is
 * hardcoded to the local stack's container; there is no flag, env var or
 * argument that can point it at a remote project. That is deliberate — this
 * script's whole job is to be the one that cannot touch production.
 *
 *   node scripts/apply-migrations-local.mjs            # apply all
 *   node scripts/apply-migrations-local.mjs --list     # show order, apply nothing
 *   node scripts/apply-migrations-local.mjs --from 0047
 */
import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')

const args = process.argv.slice(2)
const listOnly = args.includes('--list')
const fromIdx = args.indexOf('--from')
const from = fromIdx === -1 ? null : args[fromIdx + 1]

/**
 * `0062` is written and deliberately unapplied — see PLAN.md §4.28. It revokes
 * table-level SELECT, which breaks every base-table money read until the call
 * sites have moved. Locally that is usually what you WANT to test, so it is
 * skipped by default and applied only on request.
 */
const HELD_BACK = new Set(['0062_law6_column_grants_arm_the_mask.sql'])
const withHeldBack = args.includes('--include-held-back')

function containerName() {
  // `supabase start` names it supabase_db_<project-id>, project id = the dir name.
  const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' })
  const db = out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('supabase_db_'))
  if (db.length === 0) {
    console.error(
      'No `supabase_db_*` container is running.\n' +
        'Start the local stack first:  npx supabase start\n' +
        '(and make sure Docker Desktop is running).',
    )
    process.exit(1)
  }
  if (db.length > 1) {
    console.error(`More than one Supabase DB container is running: ${db.join(', ')}. Stop the others.`)
    process.exit(1)
  }
  return db[0]
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => (from ? f >= from : true))
  .filter((f) => (withHeldBack ? true : !HELD_BACK.has(f)))

if (files.length === 0) {
  console.error('No migrations matched.')
  process.exit(1)
}

console.log(`${files.length} migration(s), in this order:`)
for (const f of files) console.log(`  ${f}`)
for (const held of HELD_BACK) {
  if (!withHeldBack) console.log(`\n  (skipped, held back by PLAN.md §4.28: ${held} — pass --include-held-back to apply)`)
}

if (listOnly) process.exit(0)

const container = containerName()
console.log(`\nApplying to ${container} …\n`)

let applied = 0
for (const f of files) {
  const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
  process.stdout.write(`  ${f} … `)
  try {
    execFileSync(
      'docker',
      ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'postgres'],
      { input: sql, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
    )
    applied += 1
    console.log('ok')
  } catch (err) {
    console.log('FAILED\n')
    console.error(String(err.stderr || err.message).trim())
    console.error(
      `\nStopped at ${f} after ${applied} successful migration(s). ` +
        `Nothing after it was applied.\nFix the file, then re-run with:  --from ${f}`,
    )
    process.exit(1)
  }
}

console.log(`\n${applied} migration(s) applied to the local stack.`)
console.log('Seed data: 0047_seed_reference_corpus.sql is included above and IS the local corpus.')
