#!/usr/bin/env node
/**
 * `npm run lint:progress` — the newest PROGRESS.md entry must end with counted
 * numbers and a statement of what is left.
 *
 * ## Why (R-29 / STAGE_0.md S0-8)
 *
 * PROGRESS.md is the file every session reads to find out what state the build
 * is in, and for months it carried typed estimates — "roughly 80% complete" —
 * beside a database that could not create a discounted booking. The rule this
 * enforces is small: an entry may claim whatever it likes in prose, but it must
 * also carry the block `npm run completion` printed, and a list of what remains.
 *
 * This is a lint, not a judgement. It does not check the numbers are right —
 * `scripts/completion.mjs` is what makes them right, by counting rather than
 * asking. It checks that they are present, so a session cannot quietly skip the
 * counting step and leave prose in its place.
 *
 *   node scripts/lint-progress.mjs
 *
 * Exit 0 when the newest entry has both blocks; 1 otherwise, naming the entry.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'PROGRESS.md')

if (!existsSync(FILE)) {
  console.error('PROGRESS.md not found.')
  process.exit(1)
}

const md = readFileSync(FILE, 'utf8')
const lines = md.split('\n')

/*
 * Entries are `## <date> — <title>`, newest first. The newest entry runs from
 * the first such heading to the next one. Sub-headings inside it are `###`
 * (Did / Ruled / Verified / Blocked), so Completion and Remaining are `###`
 * too — a `##` there would read as a new entry and split the log.
 */
const headings = lines
  .map((l, i) => [l, i])
  .filter(([l]) => /^##\s+\d{4}-\d{2}-\d{2}\b/.test(l))
  .map(([l, i]) => ({ title: l.replace(/^##\s+/, ''), line: i }))

if (headings.length === 0) {
  console.error('PROGRESS.md has no `## <date> — <title>` entry to check.')
  process.exit(1)
}

const newest = headings[0]
const end = headings[1]?.line ?? lines.length
const body = lines.slice(newest.line, end).join('\n')

const missing = []
if (!/^#{2,3}\s+Completion\b/m.test(body)) missing.push('Completion')
if (!/^#{2,3}\s+Remaining\b/m.test(body)) missing.push('Remaining')

if (missing.length) {
  console.error(`The newest PROGRESS.md entry is missing: ${missing.join(' and ')}\n`)
  console.error(`  entry: ${newest.title}`)
  console.error(`  line:  PROGRESS.md:${newest.line + 1}\n`)
  console.error('Run `npm run completion` and paste its block in as `### Completion`,')
  console.error('then add `### Remaining` saying what is left and what the next session starts with.')
  console.error('An estimate typed by hand is exactly what this check exists to stop.')
  process.exit(1)
}

console.log(`PROGRESS.md newest entry carries Completion and Remaining — ${newest.title}`)
