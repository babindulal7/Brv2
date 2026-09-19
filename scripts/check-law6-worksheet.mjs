#!/usr/bin/env node
/**
 * Law 6 arming worksheet — for the 16 target tables, dump exactly what the
 * migration author needs:
 *
 *   · full base-table column list (for the named-grant list)
 *   · the masking _v view definition (does it mask? security_invoker?)
 *   · every OTHER view or function in the schema whose body names the table
 *     (a definer-rights view is fine; security_invoker breaks under the revoke)
 *
 * Output is the raw material for the migration — no decisions made here.
 *
 *   node scripts/check-law6-worksheet.mjs
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TARGETS = [
  'booking_crew_lines',
  'bundles',
  'cases',
  'client_memberships',
  'clients',
  'crew_assignments',
  'crew_bookings',
  'crew_members',
  'crew_profiles_v2',
  'damage_findings',
  'fulfillment_outcomes',
  'late_fee_findings',
  'membership_limit_breaches',
  'membership_plans',
  'purchase_requests',
  'return_accessory_checks',
]

const HERE = dirname(fileURLToPath(import.meta.url))
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(join(HERE, '..', 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(HERE, '..', 'supabase', 'migrations', f), 'utf8'))
  } catch (e) {
    console.error(`MIGRATION FAILED at ${f}: ${String(e.message).split('\n')[0]}`)
    process.exit(2)
  }
}

const allViews = await db.query(
  `select viewname, definition from pg_views where schemaname = 'public' order by viewname`,
)
const invokerViews = await db.query(
  `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce(c.reloptions, '{}') && array['security_invoker=on','security_invoker=true']`,
)
const invoker = new Set(invokerViews.rows.map((r) => r.relname))

const functions = await db.query(
  `select p.proname, pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by p.proname`,
)

for (const t of TARGETS) {
  const cols = (
    await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [t],
    )
  ).rows.map((r) => r.column_name)
  console.log(`\n### ${t} (${cols.length} cols)`)
  console.log(`cols: ${cols.join(', ')}`)

  const views = allViews.rows.filter((v) => {
    const body = v.definition.toLowerCase()
    return new RegExp(`\\bfrom\\s+(?:public\\.)?${t}\\b`).test(body) || new RegExp(`\\bjoin\\s+(?:public\\.)?${t}\\b`).test(body)
  })
  if (views.length === 0) console.log(`  views reading it: none`)
  for (const v of views) {
    const masks = [...v.definition.matchAll(/case\s+when\s+auth_can_view_money\(\)\s+then\s+([a-z_][a-z0-9_]*)/gi)].map(
      (m) => m[1],
    )
    console.log(
      `  view ${v.viewname}${invoker.has(v.viewname) ? ' [⚠ SECURITY_INVOKER]' : ''} masks: ${masks.join(', ') || '(none)'}`,
    )
  }
  const fns = functions.rows.filter((f) => new RegExp(`\\b${t}\\b`).test(f.def))
  for (const f of fns) {
    const definer = /security\s+definer/i.test(f.def)
    console.log(`  fn ${f.proname} [${definer ? 'definer' : '⚠ INVOKER — breaks under revoke'}]`)
  }
}
await db.close()
