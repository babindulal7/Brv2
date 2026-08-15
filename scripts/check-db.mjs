#!/usr/bin/env node
/**
 * check-db.mjs — what can the app's own Supabase client actually see?
 *
 * Run:  node scripts/check-db.mjs
 *       node scripts/check-db.mjs --email you@babinrentals.com --password '…'
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## v2, 15 Aug 2026 — v1 was wrong, and wrong in a way that mattered
 *
 * v1 emitted `DENIED` only on error code `42501` and called every other
 * zero-row result `EMPTY`. **A SELECT refused by RLS raises no error.** Row
 * level security FILTERS ROWS; it does not refuse the statement. So `42501`
 * never arrives on a read, the `DENIED` branch was unreachable, and every
 * policy refusal printed as `EMPTY`.
 *
 * v1 then asserted through that: *"Everything reachable is empty. That is
 * 0047_seed_reference_corpus.sql not being applied."* Run by an
 * unauthenticated session against a populated database, every word of that is
 * false — and the action it implies, applying a seed migration to a live
 * database, is destructive.
 *
 * v1's own header said EMPTY and DENIED look identical from a screen and that
 * removing the ambiguity was the whole reason it existed. It reproduced the
 * ambiguity and then concluded through it, confidently. That is worse than
 * never running it.
 *
 * Three rules follow, and they are why this file looks the way it does:
 *
 *   1. **A zero count is reported as a zero count.** `ZERO`, never `EMPTY` —
 *      "no rows came back" is the honest claim, and the reason it might be
 *      zero is printed beside it.
 *   2. **This script draws no conclusion about migrations.** It cannot read
 *      `supabase_migrations.schema_migrations` through PostgREST, so it must
 *      not guess. `check-db.sql` query 1 answers that directly and is the only
 *      thing that should.
 *   3. **Identity is checked FIRST.** An unidentified session explains a whole
 *      screen of zeros at once, and nothing below it means anything until that
 *      is resolved.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ## What it still cannot tell you
 *
 * Even with a staff session, a zero count is only *probably* an empty table —
 * RLS is per-table and per-row, so a policy may still be filtering that one.
 * Counts are unconditional only in the SQL editor. This answers "what does the
 * APP see", which is a different and also useful question. It is not a
 * substitute for `check-db.sql`.
 *
 * ## RPCs are not called
 *
 * `next_document_number()` advances a counter; `create_booking()` writes a
 * booking. Their existence is checked by `check-db.sql` query 5 instead. A
 * diagnostic that mutates what it measures is worse than no diagnostic.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/* ── env ─────────────────────────────────────────────────────────────── */

function readEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    const out = {}
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    if (out.VITE_SUPABASE_URL) return out
  }
  return {}
}

const env = readEnv()
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local or the environment.')
  process.exit(1)
}

const args = process.argv.slice(2)
const argOf = (n) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : null
}

/* ── the surface, extracted from src/ by grep, not from memory ───────── */

const TARGETS = [
  ['users', 'lib/auth.tsx — the session identity every policy depends on'],
  ['bookings', 'Today · Rentals · Booking Detail · Operations · the floor verbs'],
  ['booking_lines', 'Booking Detail · Packing · Handover · confirmRental'],
  ['clients', 'Clients · Add Client'],
  ['clients_v', 'Clients (view)'],
  ['client_directory_v', 'Clients directory list'],
  ['client_flags', 'blockClient'],
  ['membership_plans_v', 'Clients ▸ Memberships'],
  ['products_v', 'Inventory list'],
  ['product_units_v', 'Inventory unit rows'],
  ['invoices', 'Finance · recordPayment'],
  ['payments', 'Finance ▸ Payments'],
  ['payment_reversals', 'Finance ▸ Payments (reversals)'],
  ['security_deposits', 'Finance — a liability, never a cash line'],
  ['expenses', 'Finance ▸ Expenses · Reports ▸ Expenses'],
  ['expense_categories', 'Finance ▸ Expenses (chip filters)'],
  ['branches', 'Finance filters · Settings ▸ Branches'],
  ['operation_sessions', 'Packing · Handover · Return · Reset'],
  ['cleaning_queue_entries', 'Reset workspace'],
  ['external_refs', 'lib/booqable/sync.ts (no screen imports it yet)'],
  ['external_invoices', 'lib/booqable/sync.ts'],
  ['sync_outbox', 'lib/booqable/sync.ts'],
  ['sync_conflicts', 'lib/booqable/sync.ts'],
]

/** Law 6 — a money-blind session SHOULD read zero from every one of these. */
const MONEY_TABLES = new Set(['invoices', 'payments', 'payment_reversals', 'security_deposits', 'expenses'])
const MONEY_BLIND = new Set(['Warehouse', 'Technician', 'Driver', 'Client'])

const supabase = createClient(url, key, { auth: { persistSession: false } })

const pad = (s, n) => String(s).padEnd(n)
const C = { ok: '\x1b[32m', warn: '\x1b[33m', bad: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m' }

async function main() {
  console.log(`\n  ${url}`)

  /* ── 1 · identity, first, because it explains everything below ────── */

  const email = argOf('email')
  const password = argOf('password')
  let signedIn = false
  let uid = null

  if (email && password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.log(`  ${C.bad}sign-in failed: ${error.message}${C.off}`)
    } else {
      signedIn = true
      uid = data.user?.id ?? null
      console.log(`  signed in: ${data.user?.email}`)
    }
  }

  /*
   * A session with no row in `users` resolves through auth_user_role() to
   * 'Client', whose policies are all scoped by a client_id linkage it cannot
   * satisfy — so it reads zero from nearly everything, silently. That one fact
   * explains a whole screen of zeros, which is why it is checked before
   * anything else instead of being left for the reader to infer from a pattern.
   */
  /* The column is `primary_role`, not `role` — verified 16 Aug against
     information_schema: `users` has primary_role and no role. Selecting a
     column PostgREST cannot resolve returns 42703 and `data` comes back null,
     which this script would then have reported as "NO ROW IN users for this
     auth.uid()" — sending the reader to fix an identity that was never broken.
     Same failure class v2 exists to remove, so the error is surfaced instead
     of being folded into the missing-row branch. */
  let staffRow = null
  let staffErr = null
  if (uid) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, primary_role')
      .eq('id', uid)
      .maybeSingle()
    staffRow = data ?? null
    staffErr = error ?? null
  }

  if (!signedIn) {
    console.log(`  ${C.warn}session: anon — no identity.${C.off}`)
    console.log(`  ${C.warn}RLS will filter nearly every table to zero rows WITHOUT raising an error,${C.off}`)
    console.log(`  ${C.warn}so the zero counts below mean almost nothing. Pass --email/--password.${C.off}`)
  } else if (staffErr) {
    console.log(`  ${C.bad}session: signed in, but the identity probe itself failed:${C.off}`)
    console.log(`  ${C.bad}  ${staffErr.code ?? '?'} ${staffErr.message}${C.off}`)
    console.log(`  ${C.dim}That is a fault in THIS SCRIPT's query, not evidence about your session.${C.off}`)
  } else if (!staffRow) {
    console.log(`  ${C.bad}session: signed in, but there is NO ROW IN users for this auth.uid().${C.off}`)
    console.log(`  ${C.bad}auth_user_role() resolves to 'Client', which reads zero from nearly${C.off}`)
    console.log(`  ${C.bad}everything. This is the cause of what you see below — fix it first.${C.off}`)
  } else {
    console.log(`  role: ${C.ok}${staffRow.primary_role}${C.off}  (${staffRow.full_name ?? staffRow.id})`)
  }
  console.log()

  /* ── 2 · the probe ───────────────────────────────────────────────── */

  const rows = []
  for (const [table, used] of TARGETS) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })

    let status, detail
    if (!error) {
      if (count > 0) {
        status = 'OK'
        detail = `${count} row${count === 1 ? '' : 's'}`
      } else {
        /*
         * THE FIX. A read refused by RLS returns zero rows and no error, so
         * this branch cannot tell "empty" from "filtered" on its own. It says
         * so, rather than picking one — v1 picked EMPTY and then built a
         * migration diagnosis on top of the guess.
         */
        status = 'ZERO'
        detail = !signedIn
          ? '0 rows — or RLS filtered them; a read raises no error'
          : !staffRow
            ? '0 rows — expected, this session has no staff row'
            : MONEY_TABLES.has(table)
              ? '0 rows — or Law 6 filtered them for this role'
              : '0 rows — confirm in the SQL editor before believing it'
      }
    } else if (error.code === '42P01') {
      status = 'MISSING'
      detail = 'relation does not exist'
    } else if (error.code === '42501') {
      /* Reachable on a WRITE, and on a read only for a table-level GRANT
         refusal — which is a different thing from an RLS policy and worth
         seeing separately if it ever appears. */
      status = 'DENIED'
      detail = error.message
    } else {
      status = 'ERROR'
      detail = `${error.code ?? '?'} ${error.message}`
    }
    rows.push({ table, status, detail, used })
  }

  const colour = { OK: C.ok, ZERO: C.warn, MISSING: C.bad, DENIED: C.warn, ERROR: C.bad }
  for (const r of rows) {
    console.log(
      `  ${colour[r.status]}${pad(r.status, 8)}${C.off}${pad(r.table, 24)} ${pad(r.detail, 52)} ${C.dim}${r.used}${C.off}`,
    )
  }

  /* ── 3 · the summary, counting every bucket ──────────────────────── */

  const n = (s) => rows.filter((r) => r.status === s).length
  console.log(
    `\n  ${n('OK')} with rows · ${n('ZERO')} zero-count · ${n('MISSING')} missing · ${n('DENIED')} denied · ${n('ERROR')} errored\n`,
  )

  if (n('MISSING') > 0) {
    console.log(`  ${C.bad}A missing relation is a real finding — check-db.sql query 1 shows what is applied.${C.off}`)
  }
  if (n('ZERO') > 0) {
    console.log(
      `  ${C.warn}A zero count is NOT evidence that a table is empty, and NOT evidence that any${C.off}\n` +
        `  ${C.warn}migration is unapplied. RLS filters rows without raising an error, so a refusal${C.off}\n` +
        `  ${C.warn}and an empty table are indistinguishable from here. Query 2 of check-db.sql${C.off}\n` +
        `  ${C.warn}counts them unconditionally — read that before concluding anything at all.${C.off}`,
    )
  }

  /*
   * Law 6, driven rather than assumed. This is the one thing this script can
   * establish that the SQL editor cannot, because it goes through the same
   * path the app does: client → PostgREST → RLS.
   */
  if (signedIn && staffRow) {
    const moneyZero = rows.filter((r) => MONEY_TABLES.has(r.table) && r.status === 'ZERO').length
    /* `primary_role`, not `role` — see the identity probe above. Reading the
       wrong key here made `blind` always false, so the Law 6 verdict — the most
       valuable line this script prints — could only ever report a pass. */
    const blind = MONEY_BLIND.has(staffRow.primary_role)
    const pass = blind ? moneyZero === MONEY_TABLES.size : true
    console.log(
      `\n  Law 6 — role ${staffRow.primary_role} reads zero from ${moneyZero}/${MONEY_TABLES.size} money tables.` +
        (blind
          ? pass
            ? `  ${C.ok}PASS${C.off} — money-blind, and it is.`
            : `  ${C.bad}FAIL — a money-blind role can read money. This is a real hole.${C.off}`
          : `  ${C.dim}(not a money-blind role; run again as Warehouse for the real test)${C.off}`),
    )
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
