/**
 * Writes the compact rendering of the seed corpus, split into apply-sized files.
 *
 *   node scripts/emit-compact-seed.mjs <outDir> [targetKB]
 *
 * Scratch output on purpose: the reviewable migration is the one in
 * `supabase/migrations/`. This exists only to move the same rows across a wire
 * that charges by the byte. See `src/lib/seedCompact.ts` for why both exist.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { buildCorpus } from '../src/lib/seed.ts'
import { compactSeedSql } from '../src/lib/seedCompact.ts'

const outDir = process.argv[2]
if (!outDir) {
  process.stderr.write('usage: node scripts/emit-compact-seed.mjs <outDir> [targetKB]\n')
  process.exit(1)
}
const targetBytes = Number(process.argv[3] ?? '110') * 1024
mkdirSync(outDir, { recursive: true })

const parts = compactSeedSql(buildCorpus())

const files = []
let current = []
let size = 0
for (const part of parts) {
  current.push(part)
  size += part.length
  if (size >= targetBytes) {
    files.push(current.join('\n\n'))
    current = []
    size = 0
  }
}
if (current.length > 0) files.push(current.join('\n\n'))

files.forEach((body, i) => {
  const name = `c${String(i + 1).padStart(2, '0')}.sql`
  writeFileSync(`${outDir}/${name}`, `${body}\n`, 'utf8')
  process.stdout.write(`${name}  ${(body.length / 1024).toFixed(0)} KB\n`)
})
process.stdout.write(`${parts.length} statements · ${(parts.join('').length / 1024).toFixed(0)} KB total\n`)
