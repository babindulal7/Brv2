> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement from August 2026. Its findings, blockers, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../../CLAUDE.md)

---

> 📌 **Two of this file's open questions were answered on 16 Aug 2026.**
>
> - *"Something else populated this database, and no session here knows what."* — Answered.
>   The seed corpus went in **outside the migration table**, and the recorded `0047` is a
>   different 811-character tail patch. Related and worse:
>   `0056_auth_role_falls_back_to_auth_uid` is applied **with no source file**, its SQL
>   existing only in `schema_migrations`. **A fresh environment built from this directory does
>   not reproduce production.** A live blocker, not a footnote — `PLAN.md` §4.33(3).
> - *"26 unmapped capabilities."* — Closed 16 Aug. Only the three `inspection.*` remain, and
>   deliberately: no table exists to mirror.
>
> The per-page walkthrough is still the right shape, but the count moved: the 16 Aug sweep
> drove **52 of 52** routes. Booking Detail still renders the seeded `B-715` record for every
> booking number — though it now *discloses* that, which is materially better than passing
> seed off as real.
>
> This file's correction block is sound and stays. Its central lesson — that a dated
> measurement repeated as present tense produces destructive advice — is now `PLAN.md` §4.33's
> reason for existing.

# Checking the app against the database, one page at a time

There are **54 routed screens**. Fourteen of them touch the database; the other
forty do not, so browsing those tells you nothing about the connection. This is
the fourteen, in the order that makes each one's result mean something.

---

## First: read this before you open a page

### ⚠ Correction — this document's original premise was wrong

The first version of this file opened by asserting *"Every reachable table is
empty… bookings 0, clients 1"*, sourced from `PROGRESS.md:1150`, a count dated
**12 August**. A direct query on 15 August found the opposite: **121 bookings ·
419 booking lines · 76 clients · 126 products · 120 invoices · 93 payments ·
89 security deposits.** Only `expenses` is genuinely empty.

Two mistakes, worth separating because they have different fixes.

**1. A three-day-old measurement was repeated as present tense.** `PROGRESS.md`
recorded a real count that was true when taken. Whatever loaded the database
since is not `0047_seed_reference_corpus.sql` — that migration seeds two
bookings, one client and six products, and there are 121, 76 and 126. **So
something else populated this database, and no session here knows what.** That
is worth finding out before anything is applied to it.

**2. `check-db.mjs` v1 could not have caught the error, and would have
confirmed it.** It classified a refusal only on error code `42501`. A SELECT
refused by RLS *raises no error* — Postgres filters rows rather than refusing
the statement — so every policy refusal printed as `EMPTY`, and the script
concluded a seed migration was unapplied. The script is now v2 and reports
`ZERO` with the ambiguity named, and draws no migration conclusions at all.

### ⛔ Do not apply 0047 to this database

The advice given three times in this conversation was *"apply 0055 → 0047 →
0058 → 0059"*. Against a database holding 121 bookings that is wrong, and at
least one part of it is unsafe:

| | Status now |
|---|---|
| **0055** ruled identifiers | **Already applied.** `^B-[0-9]+$` is live, all 121 rows conform, zero legacy `BK-`. The createRental "B1 blocker" was closed before it was written up. |
| **0047** seed corpus | **Do not apply.** Its header claims re-application is a no-op via `client_uuid` conflicts; that is a claim about *its own* rows, not about a database populated by another route. Verify before trusting it. |
| **0058** late-fee rank | Check query 1 first. |
| **0059** create_booking | **Genuinely needed** — the function is absent from the database. This is the one piece of that advice that still stands. |

Run `check-db.sql` query 1 and settle what is actually applied before touching
anything.

### `npm run check:db`

Probes all 24 tables and views the source actually references and sorts the
answers into five buckets:

| | Means |
|---|---|
| **OK** | Reachable, and here is the row count |
| **ZERO** | No rows came back — which may be an empty table OR RLS filtering, and from here those are indistinguishable |
| **MISSING** | `42P01` — the relation does not exist, a migration is unapplied |
| **DENIED** | A table-level GRANT refusal (`42501`). RLS policy refusals never appear here — they arrive as ZERO |
| **ERROR** | Anything else, printed verbatim |

Sign in for a real answer:

```
node scripts/check-db.mjs --email you@babinrentals.com --password '…'
```

Without credentials it runs as `anon` and RLS will refuse nearly everything —
correct behaviour, but it tells you little.

**Run it once per role.** A Warehouse session *should* come back DENIED on
`payments`, `invoices` and `security_deposits`. If it does, Law 6 is real and not
just a UI rule. That is the single most valuable thing this script can tell you.

It does **not** call `create_booking()` or `next_document_number()`. One writes a
booking, the other advances a counter. A diagnostic that changes what it is
measuring is worse than none.

---

## The fourteen pages, in order

Each depends on the ones above it, so a failure high up explains the failures
below and you can stop there.

### 1 · Identity — before any page

`lib/auth.tsx` reads `users`. `auth_user_role()` resolves from it, and every
policy in the app depends on that. An unidentified session resolves to `Client`,
which denies nearly everything by design.

Query 3 in `check-db.sql` answers this. If `resolved_role` comes back `Client`
when you signed in as the owner, stop — nothing below will work and no page is at
fault. That is what `0058_staff_row_for_the_current_owner_identity.sql` fixes.

### 2 · `/today` — `bookings`

**Reads:** `listBookings`, `overdue`, `quotesExpiring` from `lib/queries/bookings.ts`.
**Pass:** the page renders, KPI strip present, no error banner.
**Empty is expected** until 0047 is applied.
**Watch for:** an error banner rather than an empty state. Empty means the query
returned nothing; an error means it failed. `PageBody` shows them differently and
that difference is the whole point of it.

### 3 · `/rentals` — `bookings`

Same query module as Today, deliberately, so the two cannot disagree about what a
booking is. If Today works and this does not, the problem is in the screen, not
the data.

**Then test the filters.** Type in the search box, click a stage chip, change the
sort. Every one of those goes to PostgREST through `listQuery.ts` — it is not a
`.filter()` over a local array. If a chip returns nothing where it should return
rows, that is a real filter bug and worth reporting.

### 4 · `/rentals/:bookingNo` — Booking Detail ⚠

**This one is the known trap.** It reads the booking number from the URL and then
renders `BOOKING` from `data/booking.ts`, a single constant whose number is
`B-715`. **Every booking number opens the same booking.** Confirmed by reading
the file, not inferred.

Try two different booking numbers. If both show the same thing, that is not your
database — it is the screen, and it is the largest single conversion job left.

### 5 · `/operations` — `bookings`

Third consumer of `bookings.ts`, using the `operationQueue` filter set.
**Pass:** queue counts render and match what `/rentals` shows for those stages.

### 6 · `/inventory` — `products_v`, `product_units_v`

**Views, not base tables.** Query 4 in `check-db.sql` tells you whether they
exist. A missing view errors; an empty one just empties.

### 7 · `/clients` — `client_directory_v`, `clients`, `clients_v`

Historically the first screen wired to the database, and `clients` has one row —
so this is the **one page that can show you a real row today**. If anything
proves the connection end to end before 0047 lands, it is this.

### 8 · `/clients/:id` and `/clients/new`

Detail and create. `createClient` is one of the nine implemented actions, so
**Add Client can genuinely write**. Creating one client is the cheapest possible
proof that a write reaches Postgres.

### 9 · `/finance` — `invoices`, `payments`

Money-gated. Sign in as Warehouse and this should refuse you. Sign in as Owner
and it should render.

### 10 · `/finance/payments` — the only pure-DB screen

No seed arrays at all. If this page shows a loading state and then an empty
state, the whole chain is working: client → PostgREST → RLS → render.

### 11 · `/finance/expenses` and `/reports/expenses` — `expenses`, `expense_categories`

`expenses` was one of the deny-all tables that `0054` fixed. If it comes back
DENIED, 0054 is unapplied.

### 12 · `/rentals/:bookingNo/packing` and `/handover` — `operation_sessions`

These write. `packRental` and `handoverRental` are implemented, so the buttons
here do reach the database — but they need a booking to act on, which brings you
back to 0047.

---

## The other forty pages

Not connection tests. They read `src/data/*.ts` arrays and will look perfect
whether or not your database is running — which is exactly why they are
misleading to browse for this purpose. Calendar, all nine report pages, New
Rental, every Tools page, all of Settings, the Return/Reset/Evidence workspaces,
the four admin screens.

**`/rentals/new` is worth naming specifically.** It looks like the most important
screen in the app and it writes nothing. `createRental` now exists (migration
0059 plus the action), but the screen has not been pointed at it yet.

---

## What "working" would actually mean

Revised, now that the database is known to be populated.

Reads are in better shape than this document originally claimed. A separate
schema diff checked all 24 tables and views the app references and **74 columns
across 28 `select()` sites — every one exists.** The enums line up too:
`booking_stage` is the canonical six, `system_role` the nine, `invoice_status`
and `payment_status` exact matches. Nothing in the read path would break.

So the remaining gap is narrower and clearer than "does the app talk to the
database":

1. **A staff identity.** `check-db.sql` query 3. Without a `users` row matching
   your `auth.uid()`, `auth_user_role()` returns `Client` and every screen reads
   zero — which is exactly what the empty-database story looked like from the
   outside.
2. **26 unmapped capabilities.** `checkCapability` in `actions/core.ts` handles
   nine strings; the actions declare 31. The 26 unmapped ones —
   `client.create`, `rental.cancel`, `inventory.pack`, `evidence.review` and
   the rest — resolve to `undefined`, which denies **every role including
   Owner**. They are harmless while those actions are stubs and become a wall
   the moment any one of them gets a body.
3. **`create_booking()` is absent.** Apply 0059 and `createRental` can write.

Do those three and the end-to-end path is: create a booking → Pack → Handover
→ Return → Reset, against 121 real bookings rather than a seeded pair.

## Reporting back

For each page, three things are enough:

- **the page** — `/today`
- **what it showed** — loading spinner, then empty state, no error
- **what the console said** — any red line, verbatim

The console matters most. A PostgREST error carries a code (`42P01`, `42501`,
`PGRST116`) that names the cause exactly, and the screen deliberately does not
show it to the operator.
