#!/usr/bin/env node
/* Dump the view definitions for the Law 6 arming review. */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const NAMES = process.argv.slice(2)
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(join(HERE, '..', 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(HERE, '..', 'supabase', 'migrations', f), 'utf8'))
}
const r = await db.query(
  `select viewname, definition from pg_views where schemaname = 'public' and viewname = any($1) order by viewname`,
  [NAMES],
)
for (const v of r.rows) {
  console.log(`=== ${v.viewname} ===`)
  console.log(v.definition)
  console.log()
}
await db.close()
