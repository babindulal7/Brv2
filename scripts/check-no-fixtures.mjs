#!/usr/bin/env node
/**
 * scripts/check-no-fixtures.mjs — Babin Rentals OS
 *
 * RULING 2026-10-06: production code must never import fixture/mock/demo/sample
 * modules (spec INV-012, NO-FAKE-DATA-MIGRATION "CI guard"). Fixtures live under
 * `__tests__/`, `__mocks__/`, `archive/` or `scripts/` only.
 *
 * Fails (exit 1) when a non-test file under src/ has an import / dynamic import /
 * require whose specifier path contains a segment named mock(s), fake(s), demo,
 * sample(s), fixture(s) (also `sampleData`, `mockData`, etc.).
 * Revert = delete this script and its package.json entry.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.FIXTURE_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'archive', 'node_modules'])
const SPEC = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
const BAD_TOKEN = /^(_*mocks?_*|fakes?|demo|samples?|fixtures?|(mock|fake|demo|sample|fixture)s?data)$/i
const isBad = (spec) => spec.split(/[\/._-]+/).some((t) => BAD_TOKEN.test(t))

// RULING 2026-10-06: the dev:mock switch is the one sanctioned fixture import. Both sit behind
// IS_MOCK (inlined false in production builds); the --dist check proves the mock client and seed corpus are tree-shaken.
const ALLOW = new Set(['src/lib/supabase.ts'])
const violations = []
let checked = 0

function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) scan(full)
      continue
    }
    if (!/\.(tsx?|jsx?|mjs)$/.test(entry) || /\.(test|spec)\./.test(entry) || entry.endsWith('.d.ts')) continue
    checked++
    const rel = full.slice(ROOT.length + 1).split(String.fromCharCode(92)).join('/')
    const text = readFileSync(full, 'utf8')
    for (const m of text.matchAll(SPEC)) {
      if (isBad(m[1]) && !ALLOW.has(rel)) {
        const line = text.slice(0, m.index).split('\n').length
        violations.push(`${rel}:${line}  imports '${m[1]}'`)
      }
    }
  }
}

scan(SRC)
if (violations.length) {
  console.error(`check-no-fixtures: ${violations.length} fixture import(s) in production code\n` + violations.map((v) => '  ' + v).join('\n'))
  process.exit(1)
}
console.log(`check-no-fixtures: PASS (${checked} production files scanned, 0 fixture imports)`)

// Optional proof: with --dist, fail if the built bundle still carries fixture markers. The marker is a STRING LITERAL
// ('No mock user'): identifiers like MOCK_LOGINS are renamed by the minifier, so matching them alone passes vacuously.
if (process.argv.includes('--dist')) {
  const dist = resolve(ROOT, process.env.FIXTURE_GUARD_DIST ?? 'dist')
  const hits = []
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e)
      if (statSync(f).isDirectory()) walk(f)
      else if (/\.(js|mjs)$/.test(e)) {
        const t = readFileSync(f, 'utf8')
        if (/No mock user|multi-week booking negotiated|MOCK_LOGINS|mockSupabase|mockStorage/.test(t)) hits.push(f.slice(ROOT.length + 1))
      }
    }
  }
  walk(dist)
  if (hits.length) {
    console.error('check-no-fixtures: fixture code in production bundle: ' + hits.join(', '))
    process.exit(1)
  }
  console.log('check-no-fixtures: dist PASS (no mock client in bundle)')
}
