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

function readEnv(files) {
  for (const f of files) {
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

const args = process.argv.slice(2)

/**
 * `--local` — read `.env.localdb.local` instead of `.env.local`.
 *
 * Without it this script reads `.env.local`, and in this repo that is the LIVE
 * project. The default is right for the script's main job — proving on
 * production that `0062` closed the Law 6 hole — but it means an idle
 * `npm run check:db --email … --password …` signs a real staff account into
 * production to satisfy curiosity. The flag makes the rehearsal case one word
 * instead of two exported variables somebody can forget.
 */
const wantsLocal = args.includes('--local')
const env = readEnv(wantsLocal ? ['.env.localdb.local', '.env.local'] : ['.env.local', '.env'])
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error(
    wantsLocal
      ? 'No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.localdb.local — is the local stack configured?'
      : 'No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local or the environment.',
  )
  process.exit(1)
}

/* Loud about which database this is. The two look identical in a terminal and
   only one of them is production; a verification tool that does not say what
   it verified is a rumour. */
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.log('\n  \x1b[33m⚠ TARGET IS LIVE PRODUCTION\x1b[0m — pass --local to check the local stack instead.')
}
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
  /* R-36 (9 Sep 2026): the Booqable bridge is gone and these four tables have no
     writer at all now. They are kept because Law 3 keeps rows — `external_refs`
     still records which Booqable order each of the 200 imported bookings came
     from, which is the only provenance that import left behind. Nothing reads
     or writes them at runtime; do not re-point them at a screen. */
  ['external_refs', 'historical only — Booqable import provenance (R-36, no writer)'],
  ['external_invoices', 'historical only — no writer since R-36'],
  ['sync_outbox', 'the offline queue, not a Booqable table — still unused'],
  ['sync_conflicts', 'the offline queue, not a Booqable table — still unused'],
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
    /*
     * Counted on `id`, NOT on `*` — and this is load-bearing from 0062 onward.
     *
     * `0062_law6_column_grants_arm_the_mask` revokes table-level SELECT on
     * `bookings`, `booking_lines`, `products` and `product_units` and grants
     * back only the non-money columns. A `select('*')` expands to every column
     * including the ungranted ones, so on those four tables it is refused
     * outright — for every role, Owner included.
     *
     * Verified against a local stack with 0062 applied on 25 Aug 2026: counting
     * with `*` reported ERROR on `bookings` and `booking_lines` while every
     * other table answered normally. That is this script reporting its own
     * query shape as a database fault — in the one tool whose job is to prove
     * 0062 landed cleanly. An operator reading that would reasonably conclude
     * 0062 had broken bookings, and roll back a migration that was working.
     *
     * `id` is granted on every table in TARGETS and is all `head: true` needs.
     */
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })

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
  /*
   * ⛔ `Client` CANNOT prove Law 6, and the check below refuses to let it try.
   *
   * A signed-in session with no row in `users` resolves through
   * `auth_user_role()` to 'Client', and a Client reads zero from nearly every
   * table because its policies are scoped by a client_id linkage it cannot
   * satisfy. `MONEY_BLIND` contains 'Client', so before this guard the verdict
   * ran: blind = true, moneyZero = 5, and it printed
   *
   *     Law 6 — role Client reads zero from 5/5 money tables.  PASS
   *
   * That is a PASS FOR THE WRONG REASON — zero rows because the session is
   * nobody, not because the mask works. Run straight after applying 0062 it
   * would read as proof that the migration closed the hole, while the hole had
   * never been tested. The most dangerous output this script can produce is a
   * green line nobody has cause to doubt.
   *
   * So the proof requires a STAFF money-blind role — Warehouse, Technician or
   * Driver. Client is money-blind and still cannot be the witness.
   */
  const PROOF_ROLES = new Set(['Warehouse', 'Technician', 'Driver'])

  if (signedIn && !staffRow && !staffErr) {
    console.log(
      `\n  ${C.bad}Law 6 — NOT PROVEN.${C.off} Signed in, but this auth.uid() has no row in \`users\`,` +
        `\n  so the database resolves it to Client and it reads zero from almost everything.` +
        `\n  ${C.warn}The zero counts above are meaningless as a Law 6 result.${C.off}` +
        `\n  Insert a \`users\` row for this uid with primary_role 'Warehouse', then run again.`,
    )
  } else if (signedIn && staffRow) {
    const moneyZero = rows.filter((r) => MONEY_TABLES.has(r.table) && r.status === 'ZERO').length
    /* `primary_role`, not `role` — see the identity probe above. Reading the
       wrong key here made `blind` always false, so the Law 6 verdict — the most
       valuable line this script prints — could only ever report a pass. */
    const role = staffRow.primary_role
    const canProve = PROOF_ROLES.has(role)
    const pass = moneyZero === MONEY_TABLES.size
    console.log(`\n  Law 6 — role ${role} reads zero from ${moneyZero}/${MONEY_TABLES.size} money tables.`)
    if (canProve) {
      console.log(
        pass
          ? `  ${C.ok}PASS${C.off} — a money-blind STAFF role, and it reads no money.`
          : `  ${C.bad}FAIL — a money-blind role can read money. This is a real hole.${C.off}`,
      )
    } else if (role === 'Client') {
      console.log(
        `  ${C.bad}NOT PROVEN — Client cannot witness Law 6.${C.off} It reads zero from nearly every` +
          `\n  table by construction, so 5/5 here says nothing about the mask. Use a Warehouse account.`,
      )
    } else {
      console.log(`  ${C.dim}(not a money-blind role; run again as Warehouse for the real test)${C.off}`)
    }
  }

  /* ── 4 · write probes (Stage 1 Law enforcement) ───────────────────────── */
  if (args.includes('--write-probes')) {
    console.log(`\n  ${C.warn}── Stage 1 Database Enforcement Write Probes ──${C.off}`)
    if (!signedIn) {
      console.log(`  ${C.bad}Write probes require a signed-in session. Pass --email and --password.${C.off}`)
    } else {
      const role = staffRow?.primary_role || 'Unknown'
      console.log(`  Running write probes as: ${staffRow?.full_name || email} (${role})\n`)

      const runProbe = async (id, name, fn) => {
        try {
          const err = await fn()
          if (err) {
            const errMsg = String(err.message || err).split('\n')[0]
            if (errMsg.includes(id) || errMsg.includes('GATE:')) {
              console.log(`  ${C.ok}gate.${id}${C.off} → refused (${errMsg})`)
              return true
            } else {
              console.log(`  ${C.warn}gate.${id}${C.off} → refused by policy/error (${errMsg})`)
              return true
            }
          } else {
            console.log(`  ${C.bad}ALLOWED (P0)${C.off} — ${name}`)
            return false
          }
        } catch (ex) {
          const exMsg = String(ex.message || ex).split('\n')[0]
          if (exMsg.includes(id) || exMsg.includes('GATE:')) {
            console.log(`  ${C.ok}gate.${id}${C.off} → refused (${exMsg})`)
            return true
          } else {
            console.log(`  ${C.warn}gate.${id}${C.off} → refused by policy/error (${exMsg})`)
            return true
          }
        }
      }

      // 1. Direct update to product_units.status
      await runProbe('unit_status.direct_write', 'Direct update to product_units.status', async () => {
        const { error } = await supabase.from('product_units').update({ status: 'On Rent' }).eq('id', '00000000-0000-0000-0000-000000000000')
        return error
      })

      // 2. Void invoice without reason
      await runProbe('invoice.void_reason', 'Void invoice without reason', async () => {
        const { error } = await supabase.from('invoices').update({ status: 'Void' }).eq('id', '00000000-0000-0000-0000-000000000000')
        return error
      })

      // 3. User immutability (delete from users)
      await runProbe('users.immutable', 'Delete from users table', async () => {
        const { error } = await supabase.from('users').delete().eq('id', uid)
        return error
      })

      // 4. Role ceiling (elevate role to Owner)
      await runProbe('users.role_ceiling', 'Assign Owner role beyond ceiling', async () => {
        const { error } = await supabase.from('users').update({ primary_role: 'Owner' }).eq('id', uid)
        return error
      })

      // 5. Stage transition: Booked -> Packed without pack session
      await runProbe('stage.no_pack_session', 'Booked -> Packed with no packing session', async () => {
        const { error } = await supabase.from('booking_stage_transitions').insert({
          booking_id: '00000000-0000-0000-0000-000000000000',
          from_stage: 'Booked',
          to_stage: 'Packed',
        })
        return error
      })

      // 6. Close gate: Returned -> Closed with no invoice
      await runProbe('close.no_invoice', 'Returned -> Closed with no invoice', async () => {
        const { error } = await supabase.from('booking_stage_transitions').insert({
          booking_id: '00000000-0000-0000-0000-000000000000',
          from_stage: 'Returned',
          to_stage: 'Closed',
        })
        return error
      })

      // 7. Money-blind line insert with rate
      if (MONEY_BLIND.has(role)) {
        await runProbe('booking_lines.money_blind_insert', 'Direct line insert with money by money-blind caller', async () => {
          const { error } = await supabase.from('booking_lines').insert({
            booking_id: '00000000-0000-0000-0000-000000000000',
            rate: 1000,
          })
          return error
        })
      }
    }
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
