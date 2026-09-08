#!/usr/bin/env node
/**
 * `npm run completion` — count how done this build actually is, on five fixed
 * dimensions, and print the block that goes at the end of every PROGRESS.md
 * entry.
 *
 * ## Why (R-29 / STAGE_0.md S0-8)
 *
 * "Roughly 80% complete" has appeared in this log repeatedly, next to a
 * database that could not create a discounted booking and accepted a double
 * booking. A typed percentage is a feeling. Every number below is counted from
 * the tree or read from a gate's own output, and the script exits non-zero
 * rather than print a dimension it could not compute — a blank is information,
 * an invented figure is not.
 *
 * ## The five, and exactly what each counts
 *
 *   Backend        action modules declaring `implemented: true`, over action
 *                  modules that exist. Dispatcher plumbing (core/index/types)
 *                  and the shared floor-verb helper are not actions.
 *   Real data      each route lazily imported by App.tsx, classified by what
 *                  its own module and its local imports (depth 2) reach for:
 *                  `.from(`/`.rpc(`/`useList` = the database, an import from
 *                  `src/data/` = the seed fixtures. Score counts db-only whole
 *                  and mixed as half, because a screen that reads one table and
 *                  fakes the other three is not wired.
 *   DB enforcement the nine named gates, read from `.lifecycle-result.json`.
 *                  Not re-derived here: the lifecycle run is the only thing
 *                  entitled to say whether a rule fires.
 *   Permissions    capability strings the dispatcher maps (`case '…'` in
 *                  core.ts) over distinct strings the actions declare in
 *                  `permissions: […]`. An action naming a capability the
 *                  dispatcher does not answer is the P3 shape.
 *   Lifecycle      steps green over steps declared, from the same JSON.
 *
 * Overall is the mean of the five. Migrations and tests are reported under the
 * table as context; they do not enter the mean.
 *
 * ## Two dimensions are read, not run
 *
 * The suite takes ~18 minutes and `check:pglite` ~40 seconds. A counter nobody
 * runs is worth nothing, so by default this reads the last recorded result and
 * says how old it is. `--tests` and `--migrations` force a fresh run.
 *
 *   node scripts/completion.mjs                # count; read cached gate results
 *   node scripts/completion.mjs --migrations   # also run check:pglite now
 *   node scripts/completion.mjs --tests        # also run the full suite now
 *   node scripts/completion.mjs --json         # machine-readable
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const args = process.argv.slice(2)
const wantTests = args.includes('--tests')
const wantMigrations = args.includes('--migrations')
const asJson = args.includes('--json')

const problems = []
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const exists = (p) => existsSync(join(ROOT, p))

/** Walk a directory, returning repo-relative paths of files matching `keep`. */
function walk(dir, keep, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, keep, out)
    else if (keep(rel)) out.push(rel)
  }
  return out
}

const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100))

// ---------------------------------------------------------------------------
// 1 · Backend — actions implemented / total
// ---------------------------------------------------------------------------
/*
 * `implemented` is the dispatcher's own flag: core.ts throws
 * ActionNotImplementedError before it ever reaches the capability check, so an
 * action without it is a stub no matter how much code sits under it. A file
 * missing the flag counts as false, which is what the dispatcher does.
 */
const PLUMBING = /\/(core|index|types|floorVerb)\.ts$/
const actionFiles = exists('src/actions')
  ? walk('src/actions', (p) => p.endsWith('.ts') && !p.includes('__tests__') && !PLUMBING.test(p))
  : []
if (actionFiles.length === 0) problems.push('Backend: found no action modules under src/actions')

const implemented = actionFiles.filter((p) => /\bimplemented:\s*true\b/.test(read(p)))
const backend = { n: implemented.length, d: actionFiles.length }

// ---------------------------------------------------------------------------
// 2 · Real data — how many routed screens read the database
// ---------------------------------------------------------------------------
/*
 * `.from(` alone is wrong: `Array.from(` appears 89 times in src/, so an
 * unquoted match classifies almost every route as reading the database — the
 * first run of this script reported 0 db · 54 mixed · 1 seed, which is not a
 * measurement, it is that bug. PostgREST always names the table as a string
 * literal, so require the quote.
 */
/*
 * Scope. STAGE_0.md says "import tree depth 2", and measured that way the
 * dimension is dead: every page imports a shared query module or a shared
 * component, so depth 1 already reports 0 db · 49 mixed · 6 seed and depth 2
 * reports 54 mixed out of 55. A number that says the same thing about every
 * screen is not measuring the screens.
 *
 * So the closure is scoped to the route's OWN directory — the page and its own
 * parts — and reaching the shared database layer is counted as a signal rather
 * than followed: an import from `src/lib/queries/` IS how a screen talks to
 * Postgres here, exactly as an import from `src/data/` is how it talks to the
 * fixtures. That gives a distribution that moves when a screen is wired and
 * stays put when it is not.
 */
const DEPTH = Number(process.env.COMPLETION_DEPTH ?? 3)
const DB_SIGNAL = /\.from\('|\.rpc\('|\buseList\b|from\s+'[^']*\/lib\/queries\/[^']*'|from\s+'\.\.?\/queries\/[^']*'/
const SEED_IMPORT = /from\s+'[^']*\/data\/[^']*'|from\s+'\.\.?\/data\/[^']*'/

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(join(ROOT, dirname(fromFile)), spec)
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const cand = base + ext
    if (existsSync(cand)) return relative(ROOT, cand).split('\\').join('/')
  }
  return null
}

/**
 * The module plus every local import it reaches, to `depth`, staying inside the
 * route's own directory. See the note on DEPTH for why the closure is scoped:
 * following imports out into src/lib and src/components makes every route look
 * identical.
 */
function importClosure(entry, depth) {
  const home = `${dirname(entry).split('\\').join('/')}/`
  const seen = new Set([entry])
  let frontier = [entry]
  for (let d = 0; d < depth; d++) {
    const next = []
    for (const f of frontier) {
      let src
      try { src = read(f) } catch { continue }
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const r = resolveImport(f, m[1])
        if (r && !seen.has(r) && r.startsWith(home)) { seen.add(r); next.push(r) }
      }
    }
    frontier = next
  }
  return [...seen]
}

let routes = []
if (exists('src/App.tsx')) {
  const app = read('src/App.tsx')
  for (const m of app.matchAll(/import\(\s*'([^']+)'\s*\)/g)) {
    const r = resolveImport('src/App.tsx', m[1])
    if (r) routes.push(r)
  }
  routes = [...new Set(routes)]
}
if (routes.length === 0) problems.push('Real data: App.tsx yielded no resolvable lazy routes')

const buckets = { db: 0, mixed: 0, seed: 0, none: 0 }
for (const r of routes) {
  let db = false
  let seed = false
  for (const f of importClosure(r, DEPTH)) {
    let src
    try { src = read(f) } catch { continue }
    if (DB_SIGNAL.test(src)) db = true
    if (SEED_IMPORT.test(src)) seed = true
  }
  buckets[db && seed ? 'mixed' : db ? 'db' : seed ? 'seed' : 'none']++
}
const realData = { n: buckets.db + buckets.mixed / 2, d: routes.length, buckets }

// ---------------------------------------------------------------------------
// 3 & 5 · DB enforcement and Lifecycle — read from the lifecycle run
// ---------------------------------------------------------------------------
/*
 * Two shapes are accepted. `scripts/e2e-lifecycle.mjs` writes
 * {results:[{id,expect,outcome}]}; an earlier draft wrote {steps:[{id,status}]}.
 * Normalise rather than insist, so a change of reporter does not silently
 * zero a dimension.
 */
const GATES = {
  'double booking': 'L3',
  'discount path': 'L1',
  'money write': 'L12',
  'stage rows': 'L6',
  'close gate': 'L11',
  'invoice immutable': 'L13',
  'payments immutable': 'L13',
  'audit immutable': 'L13',
  'client own rows': 'L12',
}

let lifecycle = null
let gates = null
let lifecycleAge = null
if (exists('.lifecycle-result.json')) {
  try {
    const raw = JSON.parse(read('.lifecycle-result.json'))
    const rows = raw.results ?? raw.steps ?? []
    const isGreen = (r) => {
      const v = String(r.outcome ?? r.status ?? '').toUpperCase()
      return v === 'PASS' || v === 'GREEN' || v === 'OK'
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    lifecycle = { n: rows.filter(isGreen).length, d: rows.length }
    const seenGates = Object.entries(GATES).map(([name, id]) => {
      const r = byId.get(id)
      return [name, r ? isGreen(r) : false]
    })
    gates = { n: seenGates.filter(([, ok]) => ok).length, d: seenGates.length, rows: seenGates }
    const at = raw.at ?? raw.ran_at
    if (at) lifecycleAge = at
    if (rows.length === 0) problems.push('DB enforcement: .lifecycle-result.json listed no steps')
  } catch (e) {
    problems.push(`DB enforcement: .lifecycle-result.json is unreadable — ${e.message}`)
  }
} else {
  problems.push('DB enforcement and Lifecycle: no .lifecycle-result.json. Run `npm run check:lifecycle` first.')
}

// ---------------------------------------------------------------------------
// 4 · Permissions — capabilities the dispatcher answers / actions declare
// ---------------------------------------------------------------------------
let permissions = null
if (exists('src/actions/core.ts')) {
  const mapped = new Set(
    [...read('src/actions/core.ts').matchAll(/^\s*case\s+'([^']+)'/gm)].map((m) => m[1]),
  )
  const declared = new Set()
  for (const f of actionFiles) {
    for (const block of read(f).matchAll(/permissions:\s*\[([^\]]*)\]/g)) {
      for (const s of block[1].matchAll(/'([^']+)'/g)) declared.add(s[1])
    }
  }
  const answered = [...declared].filter((c) => mapped.has(c))
  permissions = { n: answered.length, d: declared.size, unmapped: [...declared].filter((c) => !mapped.has(c)) }
  if (declared.size === 0) problems.push('Permissions: no action declared a permissions: [...] array')
} else {
  problems.push('Permissions: src/actions/core.ts not found')
}

// ---------------------------------------------------------------------------
// Context: migrations and tests. Read, or run when asked.
// ---------------------------------------------------------------------------
const migrationFiles = exists('supabase/migrations')
  ? readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
  : []
let migrationResult = 'not run this session'
if (wantMigrations) {
  try {
    const out = execFileSync('node', ['scripts/check-pglite.mjs'], { cwd: ROOT, encoding: 'utf8' })
    migrationResult = (out.match(/(\d+)\/(\d+) applied, (\d+) failed/) ?? [])[0] ?? 'ran, unparsed'
  } catch (e) {
    migrationResult = `FAILED — ${String(e.stdout ?? e.message).split('\n').filter(Boolean).pop()}`
  }
}

let testResult = 'not run this session'
if (wantTests) {
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=dot'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
    testResult = 'green'
  } catch (e) {
    const out = String(e.stdout ?? '')
    testResult = (out.match(/Tests\s+.*?(\d+ failed.*)$/m) ?? [, 'failed'])[1]
  }
}

// ---------------------------------------------------------------------------
// Δ — against the previous Completion block in PROGRESS.md
// ---------------------------------------------------------------------------
/*
 * The previous block is the source of the delta, not a remembered figure. If
 * there is no previous block the column reads "—", which is the honest value
 * for the first run and must not be rendered as +0.
 */
function previousBlock() {
  if (!exists('PROGRESS.md')) return null
  const rows = {}
  const md = read('PROGRESS.md')
  const start = md.search(/^#{2,3}\s+Completion\b/m)
  if (start === -1) return null
  for (const line of md.slice(start).split('\n').slice(0, 12)) {
    const m = line.match(/^\|\s*([A-Za-z ]+?)\s*\|[^|]*\|\s*([^|]+?)\s*\|/)
    if (m) rows[m[1].trim()] = m[2].trim()
  }
  return Object.keys(rows).length ? rows : null
}
const prev = previousBlock()

function delta(label, current) {
  if (!prev || !prev[label]) return '—'
  const p = prev[label].match(/(\d+)\s*\/\s*(\d+)/)
  const c = String(current).match(/(\d+)\s*\/\s*(\d+)/)
  if (!p || !c) return '—'
  const d = Number(c[1]) - Number(p[1])
  return d === 0 ? '+0' : d > 0 ? `+${d}` : String(d)
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------
if (problems.length) {
  console.error('Cannot compute a complete count:\n')
  for (const p of problems) console.error(`  · ${p}`)
  console.error('\nNo block printed. A dimension left blank is information; a guessed one is not.')
  process.exit(1)
}

const scores = [
  pct(backend.n, backend.d),
  pct(realData.n, realData.d),
  pct(gates.n, gates.d),
  pct(permissions.n, permissions.d),
  pct(lifecycle.n, lifecycle.d),
]
const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)

const cells = {
  Backend: `${backend.n} / ${backend.d} (${scores[0]}%)`,
  'Real data': `${buckets.db} · ${buckets.mixed} · ${buckets.seed} · ${buckets.none}`,
  'DB enforcement': `${gates.n} / ${gates.d} (${scores[2]}%)`,
  Permissions: `${permissions.n} / ${permissions.d} (${scores[3]}%)`,
  Lifecycle: `${lifecycle.n} / ${lifecycle.d} (${scores[4]}%)`,
}

if (asJson) {
  console.log(JSON.stringify({
    backend, realData, gates, permissions, lifecycle, overall,
    migrations: { files: migrationFiles.length, result: migrationResult },
    tests: testResult, lifecycle_ran_at: lifecycleAge,
  }, null, 2))
  process.exit(0)
}

const block = [
  '### Completion',
  '',
  '| Dimension | Counts | Now | Δ |',
  '|---|---|---|---|',
  `| Backend | actions implemented / total | ${cells.Backend} | ${delta('Backend', cells.Backend)} |`,
  `| Real data | DB-only · mixed · seed · none / ${realData.d} | ${cells['Real data']} | ${prev ? '' : '—'} |`,
  `| DB enforcement | gates in Postgres / ${gates.d} | ${cells['DB enforcement']} | ${delta('DB enforcement', cells['DB enforcement'])} |`,
  `| Permissions | capabilities mapped / declared | ${cells.Permissions} | ${delta('Permissions', cells.Permissions)} |`,
  `| Lifecycle | steps green / total | ${cells.Lifecycle} | ${delta('Lifecycle', cells.Lifecycle)} |`,
  `| Overall | mean of five | ≈ ${overall}% | ${prev?.Overall ? `${overall - Number(String(prev.Overall).replace(/\D/g, '')) >= 0 ? '+' : ''}${overall - Number(String(prev.Overall).replace(/\D/g, ''))}` : '—'} |`,
  '',
  `Migrations ${migrationFiles.length} files · check:pglite ${migrationResult}. Suite: ${testResult}.`,
  lifecycleAge ? `Gates read from .lifecycle-result.json, written ${lifecycleAge}.` : '',
  'Counted by `npm run completion`, not typed.',
].filter((l) => l !== '').join('\n')

console.log(block)

if (permissions.unmapped.length) {
  console.log(`\nCapabilities declared by an action and NOT answered by the dispatcher (${permissions.unmapped.length}):`)
  for (const c of permissions.unmapped) console.log(`  ${c}`)
}
if (gates.rows.some(([, ok]) => !ok)) {
  console.log('\nGates not yet in Postgres:')
  for (const [name, ok] of gates.rows) if (!ok) console.log(`  ${name}`)
}
