#!/usr/bin/env node
/**
 * Law 6 exposure probe — which money columns can money-blind roles actually
 * read TODAY, through the RLS policies as they stand?
 *
 * Builds the full schema in PGlite (prelude + every migration, in order), seeds
 * the nine lifecycle test users exactly like e2e-lifecycle.mjs, then runs every
 * probe as `set role authenticated` + `app.current_user_id` — the same shape
 * auth_user_role() reads on production.
 *
 * For each public table with money-pattern columns, as Warehouse / Technician /
 * Driver:
 *   · rows visible     — does any policy admit this role's rows at all?
 *   · per money column — SELECT limited: the value (LEAK), 42501 (armed), etc.
 *
 * READ-ONLY: every probe runs inside a transaction that is rolled back.
 *
 *   node scripts/check-law6-exposure.mjs          # report
 *   node scripts/check-law6-exposure.mjs --cols    # also dump full column lists
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
const SHOW_COLS = process.argv.includes('--cols')

const U = {
  Owner: '00000000-0000-4000-8000-00000000e001',
  Admin: '00000000-0000-4000-8000-00000000e002',
  Manager: '00000000-0000-4000-8000-00000000e003',
  Coordinator: '00000000-0000-4000-8000-00000000e004',
  Warehouse: '00000000-0000-4000-8000-00000000e005',
  Accounts: '00000000-0000-4000-8000-00000000e006',
  Technician: '00000000-0000-4000-8000-00000000e007',
  Driver: '00000000-0000-4000-8000-00000000e008',
  Client: '00000000-0000-4000-8000-00000000e009',
}
const BLIND = ['Warehouse', 'Technician', 'Driver']

const MONEY_RE =
  /(^|_)(rate|price|cost|amount|total|charge|fee|vat|tax|tds|discount|balance|payout|salary|wage|revenue|margin|profit|value|fine|penalty|subtotal|outstanding|advance|paid|refund|earning|budget|billed|bill|emi|interest|principal|allowance|commission|surcharge|duty|premium|stipend|remuneration|compensation|recovery|claim|arrears|due)($|_)/i
// Not figures: identifiers and non-money columns that match the regex above.
const NOT_MONEY_RE =
  /(_id|_no|_number|_by|_type|_kind|_state|_status|_reason|_date|_at|_days|_source|_overridden|_terms|_direction|_pan|_quantity|_liters|_odometer|_hours|_percentage_type)$/i

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(PRELUDE, 'utf8'))
for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  } catch (e) {
    console.error(`MIGRATION FAILED at ${f}: ${String(e.message).split('\n')[0]}`)
    process.exit(2)
  }
}

/* Seed the nine users — lifted from e2e-lifecycle.mjs seed(), same uuids. */
const BRANCH = (await db.query('select id from branches order by created_at limit 1')).rows[0]?.id
if (!BRANCH) {
  console.error('no branch — does the corpus seed one?')
  process.exit(2)
}
for (const [n, role] of Object.keys(U).entries()) {
  await db.query(
    `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
     values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true, $1)
     on conflict (id) do nothing`,
    [
      Object.values(U)[n],
      `LE-${String(n + 1).padStart(3, '0')}`,
      `law6-${role.toLowerCase()}@babinrentals.test`,
      `Law6 ${role}`,
      `98000000${String(n + 1).padStart(2, '0')}`,
      role,
      BRANCH,
    ],
  )
}

/* Run fn as a role inside a rolled-back transaction. */
async function asRolledBack(role, fn) {
  await db.exec('begin;')
  await db.exec(
    `set local role authenticated; select set_config('app.current_user_id', '${U[role]}', true);`,
  )
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e }
  } finally {
    try {
      await db.exec('rollback;')
    } catch {
      /* aborted already */
    }
    await db.exec('reset role;')
  }
}

/* Candidate tables: money-pattern columns + still holding the blanket grant. */
const tables = await db.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)

const candidates = []
for (const { table_name } of tables.rows) {
  const blanket = (
    await db.query(`select has_table_privilege('authenticated', $1, 'SELECT') ok`, [
      `public.${table_name}`,
    ])
  ).rows[0].ok
  if (!blanket) continue

  const cols = (
    await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table_name],
    )
  ).rows.map((r) => r.column_name)
  const moneyCols = cols.filter((c) => MONEY_RE.test(c) && !NOT_MONEY_RE.test(c))
  if (moneyCols.length === 0) continue
  candidates.push({ table: table_name, cols, moneyCols })
}

if (process.argv.includes('--policies')) {
  const names = candidates.map((c) => c.table)
  const r = await db.query(
    `select tablename, policyname, cmd, coalesce(qual,'') q
       from pg_policies
      where schemaname = 'public' and tablename = any($1) and cmd in ('SELECT','ALL')
      order by tablename, policyname`,
    [names],
  )
  for (const p of r.rows)
    console.log(`${p.tablename}::${p.policyname}\n    [${p.cmd}] ${p.q.replace(/\s+/g, ' ')}`)
  await db.close()
  process.exit(0)
}

console.log(
  `\n=== Law 6 exposure probe — ${candidates.length} candidate tables (blanket grant + money-pattern columns) ===\n`,
)

const findings = []
for (const { table, cols, moneyCols } of candidates) {
  const entry = { table, cols, moneyCols, roles: {} }
  for (const role of BLIND) {
    const rows = await asRolledBack(
      role,
      async () => (await db.query(`select count(*)::int n from "${table}"`)).rows[0].n,
    )
    const colResults = {}
    for (const col of moneyCols) {
      const r = await asRolledBack(
        role,
        async () => (await db.query(`select "${col}" from "${table}" limit 1`)).rows,
      )
      colResults[col] = r.ok ? (r.value.length ? `VALUE ${JSON.stringify(r.value[0][col])}` : '0 rows') : r.error.code ?? String(r.error.message).slice(0, 40)
    }
    entry.roles[role] = {
      rows: rows.ok ? rows.value : `ERR ${rows.error.code ?? rows.error.message.slice(0, 40)}`,
      cols: colResults,
    }
  }
  findings.push(entry)
}

for (const f of findings) {
  const w = f.roles.Warehouse
  const leaks = Object.entries(w.cols).filter(([, v]) => v.startsWith('VALUE'))
  const latent = Object.entries(w.cols).filter(([, v]) => v === '0 rows')
  const armed = Object.entries(w.cols).filter(([, v]) => v === '42501')
  const mark = leaks.length > 0 ? '✗ LEAK' : latent.length > 0 ? '· latent' : '✓ safe'
  console.log(
    `${mark}  ${f.table.padEnd(30)} rows visible: W=${f.roles.Warehouse.rows} T=${f.roles.Technician.rows} D=${f.roles.Driver.rows}`,
  )
  for (const [col, v] of Object.entries(w.cols)) {
    const t = f.roles.Technician.cols[col]
    const d = f.roles.Driver.cols[col]
    console.log(`      ${col.padEnd(28)} W:${v}  T:${t}  D:${d}`)
  }
  if (SHOW_COLS) console.log(`      cols: ${f.cols.join(', ')}`)
}

const leaks = findings.filter((f) =>
  Object.values(f.roles.Warehouse.cols).some((v) => v.startsWith('VALUE')),
)
console.log(`\n=== ${leaks.length} tables expose money values to Warehouse today ===`)
for (const f of leaks) console.log(`  ${f.table}: ${Object.entries(f.roles.Warehouse.cols).filter(([, v]) => v.startsWith('VALUE')).map(([c]) => c).join(', ')}`)

await db.close()
