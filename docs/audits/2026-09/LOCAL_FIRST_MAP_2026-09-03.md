> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement from September 2026. Its findings, blockers, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../../CLAUDE.md)

---

# Local-first map — 3 Sep 2026

Answering: *"for now instead of supabase make local db then sync to supabase, both for
mobile and desktop and tablet."*

Method: 7 parallel investigators over the data layer (localStore · offlineQueue · syncEngine ·
write path · read path · data-source switch · PWA shell), each required to grep callers rather
than trust that a file exists, plus direct probes of Docker, the local Postgres and the LAN.
Static analysis only — nothing was driven in a browser and nothing was written to a database.

---

## The one-line finding

**There is no local-first behaviour in this app today, in any mode.** The local database
exists, is wired to the wrong columns, is filled by a sync pull that has been silently dead
since migration 0062, and — the decisive fact — **has zero readers**. Nothing on any screen
has ever read a row out of it.

| Layer | State | Ready |
|---|---|---|
| Read path | 33 network reads across 21 query modules, **0** local reads. `grep localStore src/lib/queries/` → nothing | **0%** |
| Local store readers | `localStore.ts` has **1 importer** (syncEngine) and **0 readers** anywhere | **0%** |
| Write path | 12 of 16 implemented actions `throw` when `navigator.onLine === false`; the other 4 die on a network read first | **0%** offline |
| Offline outbox | Genuinely good — durable Dexie v3, Law 8 unique index, dead-letter cap — but unreachable behind those 12 refusals | 70% built, **0%** reachable |
| Sync pull | 2 of **124** tables (1.6%); `select('*').limit(300)` every 25s, no cursor, no ordering — not a delta | **5%** |
| Conflict policy | Not absent — *unasked*. `bulkPut` lets remote clobber local; `bookings.version` is never read | **0%** |
| Offline auth | Cold boot offline ends at `/login`: `loadProfile` reads `users` over the network, uncached | **0%** |
| PWA shell | Real SW in built output only; **no font is precached** (Devanagari renders as fallback offline); icons are JPEGs named `.png` | 45% |

### The five worst specifics

1. **The products cache has been dead since 0062.** `pullDeltas` does `select('*')` on
   `products`, but 0062 revoked table-level SELECT and re-granted 35 named columns — so
   PostgREST returns 42501 for *every* role. Line 162 destructures only `data` and discards
   `error`, so it fails silently, forever, while the header chip still says "Synced".
2. **7 of 11 cached product columns don't exist.** `CachedProduct` is a `product_units`
   shape wearing a `products` name (`serial_no`, `asset_tag`, `rack`, `shelf`, `bin`…).
   `withoutUndefined()` then drops each miss, so a wrong mapper yields a plausible empty row
   instead of an error.
3. **`is_blocked` is hardcoded `false` for every cached client** — it is a view-derived
   column on `client_directory_v`, not a column on `clients`. A reader trusting this cache
   would treat every blocked client as in good standing.
4. **Law 8 has a hole on updates.** `safeUpdate` deliberately keeps `client_uuid` out of the
   payload, so a replayed UPDATE has no server-side dedupe — only a client-side Dexie index
   that a cleared browser or a second device defeats.
5. **`replayMutation` bypasses its own guard.** Its docstring says it replays through
   `idempotentInsert`/`safeUpdate`; it posts with the raw client instead, skipping the
   immutable-table guard on `payments` / `deposit_movements` / `audit_events`.

Three more worth knowing: `enqueueMutation`'s boolean return is discarded at all 4 call
sites, so **one action writing N rows of a table queues only the first**; a mutation left in
`'syncing'` when a tab dies is never re-selected by anything; and `Header.tsx:266` tells the
operator *"Offline Mode active (Dexie cache)"*, which has never been true.

---

## The question splits in two, and one half already works

**"Local DB for mobile + desktop + tablet"** has two completely different readings, and they
are not the same size of job.

### Option A — one local Postgres, served over the wifi *(works today)*

The local Supabase stack **is already running**: 6 containers, `db` healthy 33 h, PostgREST
answering `200` on `:54321`. Kong binds `0.0.0.0:54321`, and the host Wi-Fi address is
`192.168.1.67` — so a phone or tablet on the same network reaches it right now. `localdb`
mode already exists (`npm run dev:local`, `.env.localdb.local`).

- **Real** Postgres: all 124 tables, real RLS, real constraints, real triggers, real
  `next_document_number` and `create_booking`. Nothing is emulated.
- Sync to Supabase later is the *existing* migration + dump path, not new machinery.
- Serves all three device classes — because the DB is on the network, not on the device.
- **What is missing:** the local database is **empty** (`clients=0 bookings=0 products=0
  invoices=0 payments=0`; only `users=5`). It needs the corpus applied. And
  `.env.localdb.local` points at `127.0.0.1`, which only the host desktop can reach — phones
  need the LAN address.
- **Effort: hours.** Reversible — an env change and a local seed.
- **Limit: it is not offline.** Lose the wifi and every device loses the database. This is
  "our own database instead of the cloud", not "works in a dead zone".

### Option B — a database on each device *(the real offline-first build)*

What the Dexie skeleton was aiming at, and what a warehouse with no signal actually needs.
Named blockers, all evidenced above:

1. Give the local store readers — today the entire read path bypasses it.
2. Rewrite both mappers against the real schema; pull through the masked `_v` views with
   explicit column lists, not `select('*')`.
3. Cache the operational core at all — `bookings`, `booking_lines`, `product_units`,
   `operation_sessions` are never cached, so field work has nothing to read or write against.
4. Replace the 12 `navigator.onLine === false` refusals with a real local write + queued sync.
5. Make `dataAccess` write the row locally in the same call it queues, or an offline write is
   invisible until a sync completes.
6. Close the three queue bugs the code itself documents as open (multi-row drop, orphaned
   `'syncing'`, occupied dead-letter dedupe key).
7. **Numbering.** `next_document_number` and `create_booking` are server functions. An
   offline device cannot mint a final `B-9xx` — this needs provisional ids or per-device
   number blocks. **This is a product ruling, not an engineering choice.**
8. **Law 6 on-device.** RLS masks money on the server; a local cache bypasses it by
   definition. A shared tablet used by an Owner then a Warehouse user needs per-role
   partitioning and a wipe on sign-out — today nothing clears Dexie *or* the Workbox caches
   on logout, which is already a live cross-user leak on the built bundle.
9. **Offline identity.** `loadProfile` reads `users` over the network on every boot, so a
   cold offline start ends at `/login`. The role must persist on device — and, because role
   gates money, in a form the device holder cannot edit.
10. A conflict policy (`bookings.version` exists and is never used), plus font precaching and
    real PNG icons before any install story.

- **Effort: XL** — weeks, and items 7 and 8 need your ruling before code can start.

---

## Recommendation

**Do A now, plan B deliberately.** "For now" is the phrase in the request, and A delivers
exactly that in hours, on hardware that is already running: your own database, all three
device classes, and a sync-to-Supabase story that is the migration flow you already have.
It is also the correct staging ground for B — B needs a real local Postgres to sync against
anyway.

Then treat B as its own phase with rulings 7 and 8 answered first, because every line of
on-device code depends on them.

**What A does not buy you** — and the reason to be honest about it — is the dead-zone case.
If the actual pain is "the warehouse has no signal", A does not solve it and B is the only
answer. If the pain is "I don't want to depend on the cloud project / the seed corpus is a
mess / I want my own data", A solves it today.

---

## Corrections to earlier statements in this session

- I reported the Docker daemon as not running. **That was wrong** — it is running, with the
  full Supabase stack up. The probe returned nothing because 12 agents had saturated the CPU.
- `FULL_SYSTEM_AUDIT_2026-09-03.md` RES-16 claims `daily_rate_paisa` already lands in
  IndexedDB for every role. It does not: the column does not exist on `products` and the
  select is revoked. It is a **latent** leak, live the moment someone "fixes" the column
  names — not a current one. RES-10 (cache has zero readers) is correct.
- `PLAN.md` Phase 9's claim that the offline queue "has no producer" is stale by 14 files.
