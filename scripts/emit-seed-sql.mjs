/**
 * Writes the engine-generated seed migration.
 *
 *   npm run seed:sql
 *
 * All the thinking lives in `src/lib/seed.ts` — this file only decides where
 * the output goes, so the generator itself stays inside `src/` where `tsc`
 * typechecks it. Node runs the TypeScript directly (type stripping, Node 22.18+
 * / 24); nothing is compiled and no dependency is added.
 *
 * Writing the file is deliberately all it does. `CLAUDE.md`: "Never apply a
 * migration to a live Supabase project without explicit approval."
 */

import { writeFileSync } from 'node:fs'
import { seedSql } from '../src/lib/seed.ts'

/** Resolved against this file, so the script works from any working directory. */
const target = new URL('../supabase/migrations/0047_seed_reference_corpus.sql', import.meta.url)

writeFileSync(target, seedSql(), 'utf8')
process.stdout.write(`seed corpus written to ${decodeURIComponent(target.pathname).replace(/^\//, '')}\n`)
