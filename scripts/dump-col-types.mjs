#!/usr/bin/env node
/* Print exact types of the columns 0130 masks — the CASE arms need them. */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(join(HERE, '..', 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(HERE, '..', 'supabase', 'migrations', f), 'utf8'))
}
const r = await db.query(
  `select table_name, column_name, data_type, udt_name
     from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (values
        ('fulfillment_outcomes', 'estimated_revenue_lost'),
        ('membership_limit_breaches', 'limit_value'),
        ('membership_limit_breaches', 'actual_value'),
        ('cases', 'assessed_amount'),
        ('clients', 'payment_terms'))
    order by 1, 2`,
)
for (const row of r.rows) console.log(`${row.table_name}.${row.column_name} → ${row.data_type} (${row.udt_name})`)
await db.close()
