#!/usr/bin/env node
/**
 * check-dump.mjs — is that file actually a backup, or just a file?
 *
 * Run:  npm run check:dump -- babin-prod-20260826.sql
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Why this exists
 *
 * The production push is gated on a dump because this is Supabase **Free** —
 * no PITR, no automated daily backup — and migration 0062 changes permissions
 * on money tables. A dump taken and never checked is not a backup; it is a
 * file that everyone believes is a backup, which is worse, because it stops
 * anyone taking a real one.
 *
 * That failure has already happened once on this project in a different shape.
 * `check-db.mjs` printed **PASS** for a session with no `users` row: it
 * resolved to Client, read zero from everything, and the zero was
 * indistinguishable from a working policy (fixed in 39bd850). A dump that is
 * 4KB of error text ends the same way — green-looking evidence that proves the
 * opposite of what it claims.
 *
 * ## What this can and cannot prove
 *
 * It CAN prove the file is a plausible, complete PostgreSQL dump containing the
 * tables the business cannot lose. That kills the common failure modes: an
 * empty file, a truncated transfer, a dump of the wrong (local, seeded)
 * database, or a file that is really an authentication error.
 *
 * It CANNOT prove the dump RESTORES. Only a restore proves that. The script
 * says so at the end rather than letting a row of green ticks imply it — the
 * whole point of the exercise is not to manufacture the reassurance we are
 * trying to earn.
 *
 * ## Thresholds, and why they are what they are
 *
 * `MIN_BYTES` is deliberately crude. The real signal is order of magnitude: a
 * genuine dump of this schema is tens of MB; an auth failure or an empty
 * database is single-digit KB. Anything between is reported as SUSPECT rather
 * than judged, because a small-but-real dump of an early-stage database is
 * possible and the script must not tell you it is broken when it is not.
 */

import { readFileSync, statSync } from 'node:fs'

const MIN_BYTES = 10 * 1024 * 1024 // 10 MB — "tens of MB, not a few KB"
const SUSPECT_BYTES = 256 * 1024 // under this is almost certainly not a real dump

/**
 * The tables whose loss would end the business, not merely inconvenience it.
 * `security_deposits` is here specifically because 0062 is the migration that
 * changes its permissions — it is the table the push is most likely to harm.
 */
const REQUIRED_TABLES = ['bookings', 'clients', 'products', 'security_deposits']

const file = process.argv[2]
if (!file) {
  console.error('usage: npm run check:dump -- <path-to-dump.sql>')
  process.exit(2)
}

const results = []
const record = (ok, label, detail) => {
  results.push({ ok, label, detail })
  console.log(`${ok === true ? 'PASS' : ok === null ? 'SUSPECT' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
}

// ── 1. It exists and has mass ───────────────────────────────────────────────
let bytes = 0
try {
  bytes = statSync(file).size
} catch {
  record(false, 'file exists', `cannot stat ${file}`)
  console.log('\nNo file, nothing else to check.')
  process.exit(1)
}
const mb = (bytes / 1024 / 1024).toFixed(1)
if (bytes >= MIN_BYTES) record(true, 'size is non-trivial', `${mb} MB`)
else if (bytes >= SUSPECT_BYTES) record(null, 'size is smaller than expected', `${mb} MB — real, but check it is the LIVE database and not a local/seeded one`)
else record(false, 'size', `${mb} MB — far too small for this schema; likely an auth failure or an empty database`)

// ── 2. It is a PostgreSQL dump, and it FINISHED ─────────────────────────────
// A transfer cut short leaves a file that looks fine until you restore it. The
// completion marker is the only cheap proof that pg_dump reached the end.
const text = readFileSync(file, 'utf8')
record(/^--\s*PostgreSQL database dump\b/m.test(text), 'is a PostgreSQL dump', 'header marker')
record(
  /--\s*PostgreSQL database dump complete/i.test(text),
  'ends cleanly',
  'completion marker present (a truncated transfer fails here)',
)

// ── 3. The tables that matter are actually in it ────────────────────────────
// Matching COPY/INSERT/CREATE TABLE rather than a bare name, so the word
// appearing inside a comment or a policy body cannot pass for the table.
for (const t of REQUIRED_TABLES) {
  const re = new RegExp(`(COPY|INSERT INTO|CREATE TABLE)\\s+(public\\.)?"?${t}"?\\b`, 'i')
  record(re.test(text), `contains ${t}`)
}

// ── 4. Did it capture DATA, or only the shape? ──────────────────────────────
// `--schema-only` produces a perfectly valid dump with none of the business in
// it. That file passes every check above.
const hasData = /^COPY\s+.+FROM stdin;/m.test(text) || /^INSERT INTO /m.test(text)
record(hasData, 'contains row data', hasData ? 'COPY/INSERT blocks present' : 'schema only — no rows; was --schema-only used?')

// ── verdict ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.ok === false).length
const suspect = results.filter((r) => r.ok === null).length
console.log('')
if (failed) {
  console.log(`${failed} check(s) FAILED. This is not a backup yet — do not start the push.`)
  process.exit(1)
}
console.log(suspect ? `Plausible, with ${suspect} thing(s) worth a look above.` : 'All checks passed.')
console.log('')
console.log('⚠ This proves the FILE is complete. It does NOT prove the dump restores.')
console.log('  The only thing that proves that is a restore:')
console.log('    1. restore this file into the local stack')
console.log('    2. npm run check:db -- --local')
console.log('  Until that has been done once, treat the backup as unverified.')
process.exit(0)
