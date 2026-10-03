#!/usr/bin/env node
/**
 * plan-migrations.mjs — the ordered, authoritative list of migrations the LIVE
 * project still needs, and an honest refusal to produce one when the answer
 * would be destructive.
 *
 *   node scripts/plan-migrations.mjs                     # diff against the newest snapshot
 *   node scripts/plan-migrations.mjs docs/live/other.txt
 *   node scripts/plan-migrations.mjs --sql               # print the refresh query, exit
 *
 * ## Why this exists
 *
 * Three facts, together, mean nobody can currently answer "what do we apply to
 * production, in what order" without hand-editing a list and getting it wrong:
 *
 *   1. `apply-migrations-local.mjs` is deliberately local-only — hardcoded to
 *      the docker container, refuses anything that is not localhost. Correct for
 *      what it does, and no help here.
 *   2. `check-db.mjs` cannot read `supabase_migrations.schema_migrations` at all:
 *      Supabase excludes that schema from the REST API. Its own header says so,
 *      and says `check-db.sql` is the only thing that should answer it.
 *   3. The last export is `docs/live/schema_migrations_2026-09-08.txt`, which is
 *      a snapshot of a moment, and every plan built on it since is stale by
 *      construction.
 *
 * So the live name list is pasted in by hand, and the comparison — which is the
 * part with teeth — was being done by eye. This does it in code.
 *
 * ## The comparison is by NAME, and that is the whole danger
 *
 * `supabase_migrations.schema_migrations` keys on `name` (the filename without
 * `.sql`). The numeric prefix is NOT the identity; `version` is a separate
 * timestamp column that the CLI generates. Two consequences, both live in this
 * repo right now:
 *
 *   * A **renamed** file is invisible to `db push`: the old name is applied, the
 *     new one is not, so it is re-applied from scratch. `check-db.sql` already
 *     warns about this ("renaming an APPLIED migration makes Supabase treat it
 *     as new"). The 8 Sep export shows at least four such renames — the repo's
 *     files are `0059_users_self_read_accepts_auth_uid`, `0060_staff_row_for_the
 *     _current_owner_identity`, `0069_purchase_approval_owner_manager_only` and
 *     `0056_0_auth_role_falls_back_to_auth_uid`, while live carries
 *     `0057_users_self_read_accepts_auth_uid`, `0058_staff_row_for_babindulal7`,
 *     `purchase_approval_owner_manager_only` and
 *     `0056_auth_role_falls_back_to_auth_uid`.
 *   * `0059`/`0060` were **renumbered**, not just renamed — `0060`'s live row is
 *     numbered `0058`, a lower number than files that already ran. Filename
 *     order is therefore not the order live was built in, and the `0057`/`0058`
 *     duplicates on live make numeric order ambiguous on its own.
 *
 * This script therefore REFUSES to emit an apply list while any local file looks
 * like a rename of something live already has. A plan that quietly re-runs
 * `0059` and `0060` would re-create policies and staff rows against production;
 * an error message costs one minute.
 *
 * ## What it will not do
 *
 * It does not connect to anything. No network, no service key, no write of any
 * kind — it reads two files on disk. Deciding that a rename is "fine, treat it
 * as applied" is a human act; the `--accept-rename` flag records that a human
 * did, in a log, and is refused while any *unexplained* mismatch remains.
 *
 * Exit 0 = a plan you can act on. Exit 2 = blockers; read them.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')
const LIVE_DIR = join(HERE, '..', 'docs', 'live')

const REFRESH_SQL = `-- Run this in the Supabase SQL editor, then paste the result into
-- docs/live/schema_migrations_<YYYY-MM-DD>.txt. Read-only; advances nothing.
--
-- PostgREST cannot answer this: Supabase keeps supabase_migrations out of the
-- REST API, which is why scripts/check-db.mjs cannot do it and this script
-- cannot either.

select version, name
from supabase_migrations.schema_migrations
order by version;
`

const args = process.argv.slice(2)
if (args.includes('--sql')) {
  console.log(REFRESH_SQL)
  process.exit(0)
}
const acceptRename = args.includes('--accept-rename')
const livePath = args.find((a) => !a.startsWith('--')) ?? newestSnapshot()

function newestSnapshot() {
  if (!existsSync(LIVE_DIR)) return null
  const snaps = readdirSync(LIVE_DIR)
    .filter((f) => /^schema_migrations.*\.txt$/.test(f))
    .sort()
  const last = snaps[snaps.length - 1]
  return last ? join(LIVE_DIR, last) : null
}

// ── local side ────────────────────────────────────────────────────────────────
const localFiles = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
const local = localFiles.map((f) => ({
  file: f,
  name: f.replace(/\.sql$/, ''),
  prefix: (f.match(/^(\d+)/) ?? [])[1] ?? null,
}))

// ── live side ─────────────────────────────────────────────────────────────────
if (!livePath || !existsSync(livePath)) {
  console.error('No live snapshot found. Export one first — run with --sql.\n')
  process.exit(1)
}
const liveRaw = readFileSync(livePath, 'utf8')
const live = []
for (const line of liveRaw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const m = t.match(/^(\d+)\s+(\S+)$/)
  if (m) live.push({ version: m[1], name: m[2] })
}
if (live.length === 0) {
  console.error(`${livePath} yielded no rows. Expected "<14-digit version> <name>" per line.\n`)
  process.exit(1)
}

const liveNames = new Set(live.map((r) => r.name))
const localNames = new Set(local.map((f) => f.name))

/** Everything after the leading numbering, lowercased: the part that carries meaning. */
const slug = (n) => n.replace(/^[0-9_]+/, '').toLowerCase()

/**
 * Token overlap, for the cases where a rename also reworded the tail.
 */
function similarity(a, b) {
  const A = new Set(slug(a).split('_').filter(Boolean))
  const B = new Set(slug(b).split('_').filter(Boolean))
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return (2 * shared) / (A.size + B.size)
}

/**
 * Is local file `a` a rename of live row `b`?
 *
 * ## Why this is NOT a bag-of-words score
 *
 * The first version of this script ranked candidates by token overlap (Dice) and
 * used it as the test. Lowering the threshold to catch `0060` then produced SEVEN
 * false renames, because this domain's vocabulary is made of shared words:
 *
 *     0047_seed_reference_corpus        -> 0076_seed_operational_stage_corpus   0.57
 *     0132_create_booking_crew_transport-> 0063_create_booking_function          0.57
 *     0122_inspection_operation_session -> 0026_operation_session_line_policies  0.57
 *     0123_categorize_equipment_inventory -> 0004_inventory                      0.50
 *     0130_law6_arm_money_grants_remaining_tables -> 0062_law6_column_grants...  0.50
 *
 * `booking`, `session`, `inventory` and `law6` are exactly the words every
 * migration in this repo contains. Overlap between them means nothing, and the
 * worst consequence is not a noisy report: absorbing `0047` into the rename bucket
 * deleted its one-shot-seed hazard, so the file that most must not be batch-applied
 * came back looking fine.
 *
 * ## What actually distinguishes a rename
 *
 * Order. `0060_staff_row_for_the_current_owner_identity` is live as
 * `0058_staff_row_for_babindulal7` — a genuine rename in which a person's identity
 * was substituted for the descriptive tail. What survives is `staff_row_for_`, three
 * consecutive leading tokens. The false matches above share zero, one or two.
 *
 * So the test is the longest common prefix of the ORDERED token lists, with token
 * overlap admitted only as corroboration at a prefix of two. `0099` and `0132` both
 * share `create_booking_` with `0063` and are correctly refused, because a shared
 * prefix of two plus mediocre overlap is what every pair of unrelated migrations in
 * one domain looks like.
 *
 * This is still a heuristic, and the report says so. Renames are blockers rather
 * than actions, so being wrong here costs a human glance, not a re-applied
 * migration — which is why this is tuned to recall rather than precision.
 */
function asRenameCandidate(localName, liveName) {
  const A = slug(localName).split('_').filter(Boolean)
  const B = slug(liveName).split('_').filter(Boolean)
  let run = 0
  while (run < A.length && run < B.length && A[run] === B[run]) run++
  const sim = similarity(localName, liveName)
  const qualifies = run >= 3 || (run >= 2 && sim >= 0.6)
  return { run, sim, qualifies, rank: run * 10 + sim }
}

/**
 * How low a similarity still counts as "probably a rename".
 *
 * The threshold is deliberately low, and the reason is an asymmetry in what being
 * wrong costs. A rename report is a BLOCKER: it stops the plan and asks a human to
 * confirm. If it is wrong, the cost is one glance and a re-run. A missed rename is
 * the opposite: the file lands in the PENDING list, the plan says apply it, and
 * Babin re-runs a migration production already ran.
 *
 * Note what that number means: no threshold here can be trusted, because renaming a
 * migration can reword it arbitrarily. The floor exists to catch the obvious cases
 * and to force a human to read the rest.
 */
const RENAME_FLOOR = 0.45

// ── classify every local file ─────────────────────────────────────────────────
const applied = []
const pending = []
const renamed = []

for (const f of local) {
  if (liveNames.has(f.name)) {
    applied.push(f)
    continue
  }
  // Not an exact hit. Is it a rename of something live already ran?
  const exactSlug = live.find((r) => slug(r.name) === slug(f.name) && slug(f.name) !== '')

  // Only rows that PASS the rename test are candidates. Ranking by score first and
  // testing afterwards picked the nearest neighbour whether or not it was a rename,
  // which is how `0047_seed_reference_corpus` ended up filed under
  // `0076_seed_operational_stage_corpus`.
  const candidates = live
    .map((r) => ({ r, ...asRenameCandidate(f.name, r.name) }))
    .filter((x) => x.qualifies)
    .sort((a, b) => b.rank - a.rank)

  if (exactSlug) {
    renamed.push({ file: f.file, liveName: exactSlug.name, liveVersion: exactSlug.version, confidence: 'exact slug', score: 1 })
  } else if (candidates.length === 1) {
    const c = candidates[0]
    renamed.push({
      file: f.file,
      liveName: c.r.name,
      liveVersion: c.r.version,
      confidence: `ordered prefix run ${c.run}, overlap ${c.sim.toFixed(2)}`,
      score: c.rank,
    })
  } else if (candidates.length > 1) {
    // Two live rows look equally like the original. Guessing between them is how
    // the wrong one gets skipped.
    renamed.push({
      file: f.file,
      liveName: candidates.map((c) => c.r.name).join('  |  '),
      liveVersion: candidates[0].r.version,
      confidence: `AMBIGUOUS — ${candidates.length} live rows match; decide which, if either`,
      score: candidates[0].rank,
    })
  } else {
    pending.push(f)
  }
}

// ── duplicate numeric prefixes ────────────────────────────────────────────────
const byPrefix = new Map()
for (const f of local) {
  if (!f.prefix) continue
  if (!byPrefix.has(f.prefix)) byPrefix.set(f.prefix, [])
  byPrefix.get(f.prefix).push(f.name)
}
const dupPrefixes = [...byPrefix.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([k, v]) => ({ prefix: k, names: v }))

// ── hazards: things that are pending but must NOT be swept into a batch ───────
//
// A migration being "unapplied" is not the same as it being safe to run against a
// database that already holds real data. Two classes here are not safe, and both
// announce themselves in their own headers — which is why they are read from the
// file rather than from a hand-kept list that would rot.
const readHeader = (file) => {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
  const head = sql.slice(0, 6000)
  return head.replace(/^-- ?/gm, ' ').replace(/\s+/g, ' ')
}

const hazards = []

/**
 * The full sentence around a match, so a quote starts and ends where a human
 * would put the quotes. Slicing by raw character offset produced fragments like
 * `ed - no local Postgres instance exists`, which read as damage to the file
 * rather than as a quotation of it.
 */
function sentenceAround(text, index) {
  const start = Math.max(text.lastIndexOf('. ', index) + 2, index - 200)
  const end = text.indexOf('. ', index)
  return text.slice(start, end === -1 ? index + 260 : end + 1).trim()
}

for (const f of pending) {
  const header = readHeader(f.file)

  // One-shot seeds. 0047's own header: "Apply it ONCE, into a database that has
  // never held it", and re-applying "FAILS CLOSED" — the whole file rolls back.
  // Worse than a failure is success: it is ~125 rows of reference/demo data, and
  // live already has real rows.
  if (/seed/i.test(f.file)) {
    const once = /apply it once|never held it|one-shot/i.exec(header)
    hazards.push({
      file: f.file,
      kind: 'ONE-SHOT SEED',
      detail: once
        ? `Its own header says: "${sentenceAround(header, once.index)}"`
        : 'A seed migration inserts rows rather than changing shape. Live already holds real rows.',
    })
  }

  // A number reused for different content is worse than a rename: the number is
  // what humans cite. 0047 is live as `0047_seed_tail_b917_equipment_line` and is
  // local as `0047_seed_reference_corpus` — different files, same number.
  if (f.prefix) {
    const clash = live.find((r) => {
      const p = (r.name.match(/^(\d+)/) ?? [])[1]
      return p === f.prefix && r.name !== f.name && !localNames.has(r.name)
    })
    if (clash) {
      hazards.push({
        file: f.file,
        kind: 'NUMBER COLLISION',
        detail: `live already spent ${f.prefix} on "${clash.name}" (version ${clash.version}). Different file, same number.`,
      })
    }
  }

}

// ── orphans: live rows the repo cannot account for ─────────────────────────────
//
// Every live row should be explained by a local file, either matching by name or
// consumed by one of the renames below. A row explained by neither means
// production carries applied migrations this repository no longer contains. That
// is not an apply-order problem, but it does mean the repo is not a faithful
// record of production — a Law 3 question, and it belongs in the report rather
// than in someone's head.
const explained = new Set(renamed.map((r) => r.liveName))
const orphans = live.filter((r) => !localNames.has(r.name) && !explained.has(r.name))

// ── selftest ──────────────────────────────────────────────────────────────────
//
// This classifier was wrong twice before it was right, and both mistakes were the
// dangerous kind, so the cases are pinned here rather than left to be rediscovered.
// Run with `--selftest`; exit 1 on any drift.
//
// The expectations are properties of the REPO, not of a moment: these files are
// either genuinely new migrations or renames of known live rows, and neither fact
// changes because someone applied something. Re-pinning is only correct if one of
// these classifications was genuinely wrong — not merely because the live export
// moved on.
const SELFTEST = [
  // Renames, by slug: live already ran these under a different name.
  ['0056_0_auth_role_falls_back_to_auth_uid.sql', 'renamed'],
  ['0081_ruled_sequences_completion.sql', 'renamed'],
  ['0059_users_self_read_accepts_auth_uid.sql', 'renamed'],
  ['0069_purchase_approval_owner_manager_only.sql', 'renamed'],
  // The only rename found by ordered prefix rather than slug. Live substituted a
  // person's identity for the descriptive tail; `staff_row_for_` survives.
  ['0060_staff_row_for_the_current_owner_identity.sql', 'renamed'],

  // These were all false renames under token overlap alone, and every one of them
  // is a genuinely new migration. Re-asserted because swallowing them would tell
  // Babin to skip real work — and because `0047` losing its seed hazard is how the
  // bug hid itself.
  ['0047_seed_reference_corpus.sql', 'pending'],
  ['0099_create_booking_discount_audit_class.sql', 'pending'],
  ['0122_inspection_operation_session.sql', 'pending'],
  ['0123_categorize_equipment_inventory.sql', 'pending'],
  ['0130_law6_arm_money_grants_remaining_tables.sql', 'pending'],
  ['0132_create_booking_crew_transport.sql', 'pending'],
]

if (args.includes('--selftest')) {
  const classOf = (file) =>
    renamed.some((r) => r.file === file)
      ? 'renamed'
      : pending.some((f) => f.file === file)
        ? 'pending'
        : applied.some((f) => f.file === file)
          ? 'applied'
          : 'unknown'

  console.log('CLASSIFIER SELFTEST')
  console.log('='.repeat(72))
  let failed = 0
  for (const [file, expect] of SELFTEST) {
    const got = classOf(file)
    const ok = got === expect
    if (!ok) failed++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${file.padEnd(52)} ${got}${ok ? '' : `  (expected ${expect})`}`)
  }

  // The seed hazard is derived from `pending`, so it is the check most likely to
  // vanish silently when classification changes. Assert it directly.
  const seedOk = hazards.some((h) => h.file === '0047_seed_reference_corpus.sql' && h.kind === 'ONE-SHOT SEED')
  if (!seedOk) failed++
  console.log(`  ${seedOk ? 'ok  ' : 'FAIL'}  ${'0047 carries its ONE-SHOT SEED hazard'.padEnd(52)}${seedOk ? '' : '  (missing)'}`)

  console.log('='.repeat(72))
  console.log(failed ? `FAIL — ${failed} classification(s) drifted.` : `PASS — ${SELFTEST.length + 1} checks.`)
  process.exit(failed ? 1 : 0)
}

// ── report ────────────────────────────────────────────────────────────────────
const rel = livePath.replace(/\\/g, '/').split('/').slice(-2).join('/')
console.log('MIGRATION APPLY PLAN')
console.log('='.repeat(72))
console.log(`local files   ${local.length}`)
console.log(`live rows     ${live.length}   (from ${rel})`)
console.log(`applied       ${applied.length}   matched by exact name`)
console.log(`pending       ${pending.length}`)
console.log(`renamed       ${renamed.length}   ⚠ local name not on live`)
console.log(`hazards       ${hazards.length}   ⚠ pending but not safe to batch-apply`)
console.log(`unexplained   ${orphans.length}   live rows with no local file`)
console.log(`dup prefixes  ${dupPrefixes.length}`)

// staleness: the newest live version vs today
const newest = live.reduce((a, b) => (a.version > b.version ? a : b))
console.log(`live newest   ${newest.name}  (version ${newest.version})`)

let blockers = 0

if (dupPrefixes.length) {
  console.log(`\n${'-'.repeat(72)}\nDUPLICATE NUMERIC PREFIXES`)
  for (const d of dupPrefixes) {
    console.log(`  ${d.prefix}`)
    for (const n of d.names) console.log(`      ${n}`)
  }
  console.log(
    '\n  Supabase orders by its own generated `version`, not by this prefix, so these do\n' +
      '  not break `db push` — but they make the numeric prefix useless as an ordering\n' +
      '  key, and the 8 Sep export shows live carrying BOTH 0057 rows and BOTH 0058\n' +
      '  rows. Filename order in this repo is the intended apply order; do not read it\n' +
      '  back out of the live numbers.',
  )
}

if (renamed.length) {
  blockers += 1
  console.log(`\n${'-'.repeat(72)}\n⛔ BLOCKER — ${renamed.length} file(s) whose name does not match live`)
  console.log(
    '  `schema_migrations` keys on NAME. A renamed file looks unapplied to the CLI and\n' +
      '  will be re-run. For a policy or staff-row migration that means re-creating\n' +
      '  live objects, not skipping work.\n',
  )
  for (const r of renamed) {
    console.log(`  ${r.file}`)
    console.log(`      live has: ${r.liveName}   (version ${r.liveVersion})`)
    console.log(`      match:    ${r.confidence}${r.score < 1 ? ` ${r.score.toFixed(2)}` : ''}`)
    console.log(`      → local is applied ONLY IF this rename is confirmed and intentional`)
  }
  console.log('\n  For each row above, decide one of:')
  console.log('    (a) it is a rename — live already has it; skip the file, and record why')
  console.log('    (b) it is genuinely new — the live row is a different migration')
  console.log('  Then re-run with --accept-rename, which logs the decision to stderr.')
  console.log('  Do not resolve this by renaming local files to match: the repo cites these')
  console.log('  numbers in code comments, PLAN.md and check-db.sql.')
}

if (hazards.length) {
  blockers += 1
  console.log(`\n${'-'.repeat(72)}\n⛔ BLOCKER — ${hazards.length} pending file(s) that must not be batch-applied`)
  console.log(
    '  "Unapplied" and "safe to run against a database holding real data" are different\n' +
      '  questions. Each of these answers the second one NO, in its own header:\n',
  )
  for (const h of hazards) {
    console.log(`  [${h.kind}]  ${h.file}`)
    console.log(`      ${h.detail}`)
    console.log()
  }
  console.log('  These are decisions, not steps. Resolve each on its own merits, in a window')
  console.log('  where you can undo it, before treating the rest of the list as mechanical.')
}

if (orphans.length) {
  console.log(`\n${'-'.repeat(72)}\nUNEXPLAINED LIVE ROWS — ${orphans.length}`)
  for (const o of orphans) console.log(`  ${o.name}   (version ${o.version})`)
  console.log(
    '\n  Production has applied migrations this repo does not contain, under names that\n' +
      '  match no local file and no rename above. Nothing here is safe to reason about\n' +
      '  from the repo alone: read each one out of the SQL editor and decide whether the\n' +
      '  live row is a rename of something local, a file that was deleted (Law 3 forbids\n' +
      '  that, so establish which), or an unrelated migration applied out of band.',
  )
}

if (pending.length) {
  console.log(`\n${'-'.repeat(72)}\nPENDING — ${pending.length}, in apply order`)
  const widths = Math.max(...pending.map((f) => f.file.length))
  pending.forEach((f, i) => {
    const appliedAt = live.find((r) => slug(r.name) === slug(f.name))
    const suffix = appliedAt ? '' : ''
    console.log(`  ${String(i + 1).padStart(3)}. ${f.file.padEnd(widths)}${suffix}`)
  })
  console.log(
    '\n  Apply in this order, one file per transaction, each with its own begin/commit.\n' +
      '  Take the backup first (scripts/backup-db.ps1 / BACKUP_PROTOCOL.md). Stop at the\n' +
      '  first failure and re-run from that file — the chain is not resumable on its own.',
  )
}

console.log(`\n${'='.repeat(72)}`)
console.log(
  'WHAT THIS DID NOT CHECK. Being explicit, because the failure mode of a tool like\n' +
    'this is confidence it has not earned. It did not read any migration body for\n' +
    'safety, and it cannot: whether a file is safe against a database holding real\n' +
    'data depends on what the file does and what is already there. It matched names,\n' +
    'prefixes and two structural patterns. An earlier version of this script also\n' +
    'tried to spot "fails on live" in header prose, and flagged 0099 — a migration\n' +
    'that REPAIRS a live defect, flagged only because its header describes the\n' +
    'predecessors failing. Regex over prose cannot tell a repair from a breakage, so\n' +
    'that check was deleted rather than tuned. Treat every pending file as unread\n' +
    'until you have read it, and treat this output as arithmetic, not as judgement.',
)
if (blockers) {
  console.log('NO PLAN ISSUED — resolve the blockers above first.')
  process.exit(2)
}
if (acceptRename) {
  console.log('Renames above were accepted as already-applied (--accept-rename).')
  console.log(`Snapshot ${rel} may be stale; re-export before the maintenance window.`)
}
console.log(`Plan complete: ${pending.length} file(s) to apply.`)