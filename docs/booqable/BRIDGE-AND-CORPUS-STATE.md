# The Booqable bridge and the corpus — measured state, 1 Sep 2026

**Why this file exists.** [`GAP-CHECK_2026-08-31.md`](GAP-CHECK_2026-08-31.md) makes the corpus
gap its P0 and proposes an acceptance test: *"our Dashboard is correct on the day it shows #898
and #903 due back, and Rentals says 653."* Filing that test raised an obvious question — what
would it actually take? — and the answer turned out to be nothing like "wire the screens".

Everything below was measured on 1 Sep 2026: live database over MCP (read-only, as `postgres`),
and the tree at `step1-foundation`. **No sync was run. No migration was applied. No Booqable API
call was made.**

---

## 1. The headline

**The bridge is built. The corpus is half-imported. And the import can no longer complete,
because an applied migration permanently occupies the booking numbers the remaining Booqable
orders need.**

That last clause is a new finding and it is not recoverable by editing code.

---

## 2. What is built (much more than the gap check assumes)

| Piece | State |
|---|---|
| `src/lib/booqable/sync.ts` | **Exists**, 109 KB. Dependency-ordered pull phases (catalogue → stock → clients → orders+lines → payments → …), `external_refs` bookkeeping, `sync_conflicts` rows, and a six-function write-back allowlist. |
| `src/lib/booqable/map/*.ts` | **Exists** — seven mappers (orders, payments, clients, products, stock, documents, availability), 270 KB total. |
| `supabase/functions/booqable-proxy/index.ts` | **Exists.** `client.ts`'s header says the proxy was "not written in this pass" — that comment is **stale**; it is in the tree, alongside `booqable-webhook`. |
| `scripts/run-full-sync.ts` | **Exists** — imports `runFullPull` and calls it. This is the entry point. |
| `scripts/full_sync.sql`, `generated_import.sql` | **Exist** — 223 KB / 81 KB of generated idempotent INSERTs (100 and 25 of each of products/clients/bookings). |

**Nothing under `src/` imports any of it.** Every mention of `lib/booqable/` outside that
directory is prose in a module header (`dataAccess.ts`, `bookingTransition.ts`, `phone.ts`,
`createBundle.ts`, `data/inventory.ts`) or an error string. The single real caller is
`scripts/run-full-sync.ts`. So the bridge is **not dead — it is off-line**: reachable by running
a script, not by anything the app does.

⚠ Do not confuse `src/lib/booqable/sync.ts` (Booqable bridge) with `src/lib/syncEngine.ts` (the
offline mutation-queue drainer over IndexedDB — `offlineQueue`/`localStore`). Different concerns,
similar names.

## 3. What actually landed in the database

| Table | Rows | Traced to Booqable (`external_refs`) |
|---|---|---|
| `clients` | 366 | 100 |
| `products` | 204 | 71 |
| `bookings` | 246 | **0** |
| `booking_lines` | 92 | — (all from the 0076 seed) |
| `payments` · `invoices` · `product_units` · `security_deposits` · `booking_stage_transitions` | **0** | — |
| `sync_outbox` · `sync_conflicts` | 0 | — |

`external_refs` holds **only** `clients` (100) and `products` (71). There is **not one `orders`
ref**, so no booking in this database can be traced back to a Booqable order.

**The 246 bookings break down as:**
- **B-700 … B-899** — 200 rows, the import. 86 distinct clients, 72 distinct pickup times,
  spread 22 Jul → 25 Nov 2026. Real-looking data.
- **B-900 … B-945** — 46 rows, the synthetic corpus from the applied
  `0076_seed_operational_stage_corpus`.

*(A hypothesis worth recording as refuted: `full_sync.sql` inserts every booking with
`client_id = (SELECT id FROM public.clients LIMIT 1)` and `pickup_at = return_at = NOW()`, which
would make one arbitrary client own all 100 with zero-length rentals. The live rows show 86
clients, real spreads and zero zero-length rentals — **so the live 200 did not come from that
file.** It came from a better path. The file's defect is still live as a hazard; see §5.)*

## 4. ⛔ The blocking finding — the seed corpus squats on real booking numbers

`bookings.booking_no` carries **`bookings_booking_no_key UNIQUE`** (plus a `^B-[0-9]+$` format
check). Booking numbers map one-to-one onto Booqable order numbers — B-898 in this database
carries `return_at = 2026-08-31 06:00`, which is exactly the due-back the gap check reports for
Booqable's **#898**.

The import covered Booqable orders **700–899**. The capture records Booqable orders running past
that: `DATE_TIME_PICKER_SPEC` §2 probed **#906** live on 31 Aug.

**`0076_seed_operational_stage_corpus` — applied 31 Aug — inserted 46 synthetic bookings numbered
`B-900 … B-945`: precisely the range the next real Booqable orders occupy.**

Consequences, in order of how much they hurt:

1. **Importing Booqable orders #900–#945 will fail** on the unique index, one row at a time.
2. **The blocking rows cannot be removed.** Law 3 / `trg_bookings_reject_delete` refuses DELETE on
   `bookings` for every role including `service_role`. Cancellation is the named terminal action,
   and **cancelling does not free the number** — the row and its unique key survive.
3. **The gap check's own acceptance test cannot pass as written.** It names #898 and #903.
   **B-898 is the real imported order.** **B-903 is a synthetic seed row wearing that number** —
   its dates (pickup 31-08 03:30, return 06-09) do not match Booqable's #903 at all. Anyone
   testing "#903 due back today" against this database is reading a fake.

**This needs a ruling before any further import.** The realistic options — none of them free —
are (a) renumber the seed corpus out of the live range via a new migration, since 0076's rows
can be updated even though they cannot be deleted; (b) import future orders under an offset or
prefixed numbering scheme, which breaks the #N ↔ B-N convention the imported 200 already
establish; or (c) accept a permanent hole at 900–945 and cancel those seed rows, losing the
operational-stage corpus that made the Today panels non-empty in the first place.

Option (a) looks cheapest and preserves both properties, but it is a live-data write on an
applied migration's rows and is **not an agent's call**.

## 5. Hazards found in the import scripts — do not run these as they stand

- **`full_sync.sql` / `generated_import.sql` would corrupt bookings if run today.** Every booking
  INSERT sets `client_id = (SELECT id FROM public.clients LIMIT 1)` — an arbitrary row, no
  `ORDER BY` — and `pickup_at = return_at = NOW()`. The Booqable order's real client and rental
  period are discarded, even though the client was just imported with a traceable ref.
- **Their idempotency guard is armed but never fired.** Each booking is guarded on an
  `external_refs` row with `entity = 'orders'`; **zero such rows exist**. So the guard cannot
  suppress anything, and running either file inserts 100 (or 25) fresh bookings — **permanently**,
  per Law 3.
- **The real sync has the same duplication exposure for a different reason.** The 200 imported
  bookings carry no `external_refs`, so `runFullPull` cannot match them either; it would re-insert
  rather than update. Any re-sync plan needs a back-fill of `orders` refs first, keyed on the
  Booqable order UUID.

## 6. 🔑 Credential exposure — needs Babin, not an agent

**A live Booqable API token and a Supabase key are hard-coded in plaintext** in four
git-tracked scripts: `import-booqable-direct.mjs`, `import-via-mcp-sql.mjs`,
`sync-all-booqable-data.mjs`, `sync-booqable-data.mjs`. They entered history in commit
`201f772` on **13 Aug 2026** and have been in the repo ~19 days.

This directly contradicts the architecture `src/lib/booqable/client.ts`'s own header documents —
that no Booqable token is ever held outside the Edge Function's `Deno.env`, "never a
`VITE_`-prefixed variable, never anything under `src/`". The scripts bypass the proxy entirely
and call `https://<slug>.booqable.com/api/4/` with a bearer token.

**Mitigating:** the repo has **no git remote** — `git remote -v` is empty and there are no
remote-tracking refs. It has never been pushed. Exposure is confined to this machine.

**Not mitigating:** this workspace's working habit is shipping `.zip`/`.rar` handoffs
(`babin-rentals-os.rar`, 147 MB, sits at the workspace root), and history travels inside those.
Two `claude/*` branches exist, suggesting cloud sessions have touched the repo.

**Recommended, in this order — all of it Babin's to do:** rotate the Booqable token in the
Booqable account; move it to the `booqable-proxy` function's environment, where the architecture
already expects it; then scrub the four scripts. Scrubbing first would give false comfort — the
old token stays in history and stays valid. **No agent should rotate a credential, and this one
did not.**

---

## 7. What this means for the gap check's build order

Its item 1 reads "Wave 1 wiring + `operationalDayStart` → clears every P0 line". That is not
right, and the correction is not a small one:

- `operationalDayStart` (D4) was **already built** on 31 Aug.
- Wave 1 wiring makes the screens read this database honestly. Worth doing, and it is the
  unblocked half.
- But **"Rentals says 653" needs the remaining ~450 Booqable orders**, which needs the numbering
  ruling in §4, an `external_refs` back-fill (§5), and a token that is safe to use (§6).
- And **"#903 due back"** is not a wiring outcome at all — it is currently a synthetic row.

The honest sequencing is: Wave 1 wiring proceeds now on its own merits; the corpus is a separate
track that opens with a ruling, not with code.
