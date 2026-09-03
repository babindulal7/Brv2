# On-device database — the plan

**Ruled 3 Sep 2026 by Babin:** a database on each device, syncing up to Supabase, for phone,
tablet and desktop. **Driver: a dead zone — no signal in the warehouse.** The LAN-Postgres
option was offered and declined; it would not have solved the dead zone.

Method: 7 investigators mapped the current state ([`LOCAL_FIRST_MAP_2026-09-03.md`](LOCAL_FIRST_MAP_2026-09-03.md)),
then 3 independent architectures were designed and judged by 2 adversarial reviewers on
opposite lenses. Every load-bearing claim below was re-verified against the repo by hand,
because two design claims turned out to be **wrong** (noted where they occur).

---

## The decision

**Design 3's scope, on Design 1's mechanics.** Two judges scoring on opposite criteria
independently reached the same synthesis:

| Strategy | Floor lens | Correctness lens |
|---|---|---|
| **Scoped working set** — 14 of 124 tables, money-free | **74** | 68 |
| **Dexie under the mock engine** — whole schema, zero query changes | 58 | **70** |
| **PGlite** — real Postgres in WASM | 34 | 50 |

They split for opposite reasons, and that is what makes the synthesis obvious: Design 3 makes
**Law 6 impossible to break** (the money column is not on the device for any role), Design 1
makes **Law 8 impossible to break** (a per-row oplog and one atomic replay RPC, rather than
per-call-site discipline). Take the structural half of each and both a wrong money figure and
a duplicated row become impossible rather than unlikely.

### What we are building

- **Scope:** 14 tables — the `FLOOR_COLUMNS` tree verbatim (`bookings`, `booking_lines`,
  `booking_line_units`, `products`, `product_units`) plus the session tables the floor verbs
  write (`operation_sessions`, `packing_lines`, `handover_lines`, `return_lines`,
  `session_line_movements`, `cleaning_queue_entries`, `booking_stage_transitions`,
  `damage_findings`) and `clients` (id + name only). Scoped to *my branch × the floor date
  window × the four floor stages*.
- **No money columns at all.** Not masked — absent. Guarded by a CI test over the schema.
- **The seam:** `src/lib/mock/engine.ts` is already a PostgREST-shaped adapter that all 30
  `supabase` importers talk to transparently. It is promoted, not replaced, so **no query
  module and no screen changes.**
- **Writes:** local first, then a per-row oplog in its own Dexie database, replayed through
  one invoker-rights `apply_sync_batch` RPC with per-row verdicts.

### Why not the other two

**PGlite** is the highest ceiling and the wrong project. It is the only design that could
enforce Law 6 by the real mechanism, but it delivers nothing to the floor for ~10 weeks,
front-loads 15–25 MB and 20–40 s of setup onto devices defined by having no link, pins every
device's datadir to a PGlite release (a security patch means physically walking every tablet
back to signal), and holds a resident WASM Postgres worker on a 2–4 GB Android tablet.

> Its stated fatal flaw — that a faithful 0062 would 42501 the Floor screen until thirty-plus
> call sites move — **is false, and I checked.** All 41 columns `BASE_COLUMNS` and
> `FLOOR_COLUMNS` name across the four revoked tables are in 0062's grant lists (bookings
> 15/27, booking_lines 7/19, products 2/35, product_units 5/29); money reaches the app only
> via `bookings_deposit_v`. The sole `select('*')` on a revoked table is `syncEngine.ts:162`,
> the pull that has been silently failing since 0062 applied. PGlite is more viable than its
> own author believed — it is still the wrong first move.

**Dexie-under-the-mock-engine at full schema** is the best-argued document, and its
constraint manifest generated from the migrations is the single best idea in the three. But
it promotes to production an engine whose correctness bar was *"the list looks right"*, and
which has already shipped **two silent wrong-answer bugs** — one compared timestamps as
strings and erased the entire Nepal working morning from every date-ranged read; the other
matched embed filters against the projection. Neither threw. Both were caught by a human
noticing a screen looked wrong. **In a dead zone that detection mechanism does not exist.**

Keep from it: the generated constraint manifest, the differential harness against a scratch
Postgres, the per-row oplog, and the refusal to compute money locally.

---

## Phase 0 — prerequisites. None of these is optional, and no design owned them.

Verified against the migrations on 4 Sep. Filed as **PLAN.md §4.43(d)**.

1. **`updated_at` is client-written and nothing overrides it.** Zero trigger functions in 79
   migrations touch it; `floorVerb.ts:771,779,855,901` sets it from the device clock. Every
   cursor in every design reads it. **One skewed tablet silently and permanently skips rows
   for the whole fleet.** → `before update … set new.updated_at = now()` on every sync-set
   table, and add the column to the four booking children that lack it.
2. **`bookings.version` never increments** (`0002:45,68`; 0 migrations, 0 source files). Every
   optimistic-lock CAS matches, so every conflict is silent last-write-wins. → increment it in
   a trigger, or delete the column. Leaving it is worse than either.
3. **`operation_sessions.id` is minted per device**, so two devices working one booking offline
   create two sessions and the loser's whole shift references one that can never exist.
   → derive it deterministically from `(booking_id, operation, operational_day)`.
4. **Evidence blobs are not designed anywhere.** `ReturnWorkspace`'s damage photos are a
   *counter*, not files. Offline returns without a blob outbox make the damage gate a worse
   lie than it is today. → content-hash-keyed blob store, resumable upload, `evidence_files`
   row written only after the object lands, 23505-on-hash treated as success. Budget
   **200–600 MB**, not 3 MB.
5. **The wipe path.** A rejected refresh token fires `SIGNED_OUT` *at the moment the tablet
   reconnects* — so a design that wipes local storage on sign-out destroys the day's only copy
   of the work precisely then. Distinguish user-initiated sign-out from auth-driven, and keep
   the outbox in a database the purge cannot reach.
   ✅ **Already true at HEAD:** [`devicePurge.ts`](src/lib/devicePurge.ts) spares the outbox
   by design and is tested for it (commit `2c3a680`).

---

## What is NOT blocked — measured, not assumed

The two open rulings (§4.43 a and b) **do not gate the dead-zone work**:

| Claim | Evidence |
|---|---|
| The floor verbs allocate no document number | `next_document_number` appears **0 times** in `floorVerb.ts`; all ~20 call sites are creation flows (clients, invoices, payments, bundles, equipment, transfers) plus the Booqable bridge |
| `session_no` needs no server | `floorVerb.ts:504-516` reads the latest and writes `(latest?.session_no ?? 0) + 1` |
| The floor carries no money | `FLOOR_COLUMNS` names **zero** money columns |

So **pack · handover · return · reset can be built now.** Numbering gates booking/client/
invoice *creation*; money masking gates any device that holds money. Neither is on the floor.

---

## Delivery

| Phase | Delivers | Verified by |
|---|---|---|
| **0** | The five prerequisites above | Migrations applied to a scratch DB; a clock-skew test that proves a skewed device no longer skips rows |
| **1** | Read-only floor mirror — the 14 tables hydrate and the four floor screens render from Dexie | Airplane mode on a real tablet against `npm run preview`, not the dev server (which registers no service worker) |
| **2** | Offline auth — a cold offline boot reaches a signed-in session instead of `/login` | Tablet powered off overnight, opened with no signal |
| **3** | Local writes + oplog for the four floor verbs | A full simulated shift offline, then reconnect; every row lands exactly once |
| **4** | Sync-down cursor + scope reconciliation | Two devices, one booking, deliberate conflict |
| **5** | Blob outbox for damage evidence | Photos taken offline, uploaded on reconnect, no orphan rows |

**Do not measure any of this on the dev server** — `devOptions` is unset, so `npm run dev`
registers no service worker at all and airplane-mode behaviour is only observable against a
built bundle.

---

## The one question that could change the shape

Design 3's honest fatal flaw is that it completes the **planned** dead-zone day and fails the
**unplanned** one. Two cases it cannot serve: the **walk-in** (a client arrives at 10:00 for
gear no booking exists for) and the **late booking** (the desk creates a job at 09:40 that
cannot reach a device which will not see signal again that shift).

> **How often does a job get created after the shift begins, for a tablet that will not
> regain signal that day?**

If that is rare, the scoped design is right and this plan stands. If it is several times a
week, the scope rule is the wrong shape, and the answer becomes a **money-blind build** of the
app installed on floor devices — a wider mirror whose binary never fetches money columns at
all — which is a materially different project.
