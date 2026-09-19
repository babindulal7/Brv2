#!/usr/bin/env node
/**
 * Law 6 inventory probe — which base tables still leak money columns?
 *
 * Builds the full schema in PGlite (prelude + every migration, in order,
 * exactly like check-pglite.mjs) and then asks the catalogue, per table:
 *
 *   1. Does `authenticated` hold TABLE-level SELECT? (the blanket grant that
 *      makes 0019-style column revokes inert — 0062/0077 territory)
 *   2. Which columns look like money (name pattern)?
 *   3. Is each of those columns individually readable by `authenticated`?
 *      (armed tables: money cols false, operational cols true)
 *   4. Which row policies gate the table (so a wide-open money-blind policy on
 *      a money table gets flagged first)?
 *   5. Which masking views exist and which base table do they read?
 *
 * READ-ONLY. Touches nothing but a throwaway in-process PGlite.
 *
 *   node scripts/check-law6-unarmed.mjs          # full report
 *   node scripts/check-law6-unarmed.mjs --json   # machine-readable
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')
const PRELUDE = join(HERE, '..', 'supabase', 'pglite-prelude.sql')
const JSON_OUT = process.argv.includes('--json')

// Column names that carry a figure. Deliberately generous — false positives are
// reviewed by eye in the report; a false negative is a leak we never see.
const MONEY_RE =
  /(^|_)(rate|price|cost|amount|total|charge|fee|deposit|vat|tax|tds|discount|balance|payout|salary|wage|revenue|margin|profit|value|fine|penalty|subtotal|outstanding|credit|advance|rent|invoice|payment|paid|refund|earning|budget|estimate|quoted|billed|bill|emi|interest|principal|allowance|commission|royalty|surcharge|duty|premium|stipend|remuneration|compensation|recovery|claim|arrears|due)($|_)/i

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(PRELUDE, 'utf8'))

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  } catch (e) {
    console.error(`MIGRATION FAILED at ${f}: ${String(e.message).split('\n')[0]}`)
    process.exit(2)
  }
}

// Masking views: name -> base table (first FROM), masked columns (from CASE arms)
const views = await db.query(`
  select viewname, definition from pg_views
  where schemaname = 'public' and definition ilike '%auth_can_view_money()%'
  order by viewname`)

const viewByBase = new Map()
for (const v of views.rows) {
  const m = v.definition.match(/from\s+(?:public\.)?([a-z_][a-z0-9_]*)/i)
  const masked = [...v.definition.matchAll(
    /case when auth_can_view_money\(\) then ([a-z_][a-z0-9_]*)/gi,
  )].map((x) => x[1])
  if (m) {
    if (!viewByBase.has(m[1])) viewByBase.set(m[1], { views: [], masked: new Set() })
    viewByBase.get(m[1]).views.push(v.viewname)
    for (const c of masked) viewByBase.get(m[1]).masked.add(c)
  }
}

// Tables, their columns, blanket-grant state, money columns, policy roles
const tables = await db.query(`
  select c.relname as table_name,
         c.relacl::text as relacl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`)

const cols = await db.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position`)

const colsByTable = new Map()
for (const r of cols.rows) {
  if (!colsByTable.has(r.table_name)) colsByTable.set(r.table_name, [])
  colsByTable.get(r.table_name).push(r.column_name)
}

const policies = await db.query(`
  select tablename, policyname, cmd, coalesce(qual,'') as qual, coalesce(with_check,'') as with_check
  from pg_policies where schemaname = 'public' order by tablename, policyname`)

const polByTable = new Map()
for (const p of policies.rows) {
  if (!polByTable.has(p.tablename)) polByTable.set(p.tablename, [])
  polByTable.get(p.tablename).push(p)
}

const MONEY_BLIND = "'warehouse'|'technician'|'driver'|'client'"

const report = []
for (const t of tables.rows) {
  const table = t.table_name
  const allCols = colsByTable.get(table) ?? []
  const moneyCols = allCols.filter((c) => MONEY_RE.test(c))

  // Blanket table-level SELECT for authenticated? Ask the catalogue properly —
  // has_table_privilege, not regex over relacl text (an 'r' inside the grantor
  // name 'postgres' fools string matching on column-granted tables).
  const blanket = (
    await db.query(
      `select has_table_privilege('authenticated', $1, 'SELECT') as ok`,
      [`public.${table}`],
    )
  ).rows[0].ok

  // Column-level read state for money columns
  const moneyState = []
  for (const c of moneyCols) {
    const can = await db.query(
      `select has_column_privilege('authenticated', $1, $2, 'SELECT') as ok`,
      [`public.${table}`, c],
    )
    moneyState.push({ column: c, readable: can.rows[0].ok })
  }

  const pols = polByTable.get(table) ?? []
  const polSummary = pols.map((p) => `${p.policyname} [${p.cmd}]`)
  const admitsMoneyBlind = pols.some((p) => {
    const txt = `${p.qual} ${p.with_check}`
    return (
      /auth_is_staff\s*\(/.test(txt) || new RegExp(MONEY_BLIND, 'i').test(txt)
    )
  })

  const mask = viewByBase.get(table)
  const armed = !blanket && moneyCols.length > 0

  report.push({
    table,
    blanket,
    nCols: allCols.length,
    moneyCols,
    moneyReadable: moneyState.filter((m) => m.readable).map((m) => m.column),
    armed,
    maskingViews: mask?.views ?? [],
    maskedCols: mask ? [...mask.masked] : [],
    policies: polSummary,
    admitsMoneyBlind,
  })
}

const leaking = report.filter((r) => r.moneyCols.length > 0 && r.moneyReadable.length > 0)
const armedTables = report.filter((r) => r.armed)
const noMoney = report.filter((r) => r.moneyCols.length === 0)

if (JSON_OUT) {
  console.log(JSON.stringify({ leaking, armedTables, noMoneyCount: noMoney.length }, null, 2))
  await db.close()
  process.exit(0)
}

console.log(`\n=== Law 6 inventory — ${report.length} public tables ===\n`)

console.log(`ARMED (blanket revoked, money readable only via _v): ${armedTables.length}`)
for (const r of armedTables)
  console.log(`  ✓ ${r.table.padEnd(28)} masked: ${r.maskedCols.join(', ') || '(view does not mask col names?)'}`)

console.log(`\nLEAKING (money columns readable through a live grant): ${leaking.length}`)
for (const r of leaking) {
  const blind = r.admitsMoneyBlind ? ' ⚠ money-blind policy admitted' : ''
  const view = r.maskingViews.length > 0 ? ` [has ${r.maskingViews.join(',')}]` : ' [NO masking view]'
  console.log(
    `  ✗ ${r.table.padEnd(28)} ${r.nCols} cols | money: ${r.moneyReadable.join(', ')}${view}${blind}`,
  )
  if (r.moneyCols.length > r.moneyReadable.length)
    console.log(`      (already refused: ${r.moneyCols.filter((c) => !r.moneyReadable.includes(c)).join(', ')})`)
}

console.log(`\nNo money columns: ${noMoney.length} tables (not listed)`)
await db.close()
