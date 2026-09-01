# Layer D verification — Calendar
v2.5 section: §11 (lines 552-632)   ·   Our route(s): /calendar
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

Scope note. v2.5's Layers A/B/C for §11 (the gantt shape, the bar-label format, the controls, the
no-hover finding) are trusted and not re-litigated here. Everything below concerns §11.5's
`Backend data link` block, plus the four Layer-D-flavoured assertions that leak into §11.2, §11.4
and §11.6.

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `rows  products_v` — the left axis is served by `products_v` | GAP | Nothing serves it. `/calendar` reads no database at all: `Calendar.tsx` imports no supabase client, no `lib/queries/*`, no `src/actions/*`. Rows are 10 hardcoded seed resources. | `src/modules/calendar/Calendar.tsx:1-40` (full import block); `grep -c "supabase\|/queries/\|actions/" src/modules/calendar/Calendar.tsx` → **0**; rows are `ROWS` at `src/data/calendar.ts:280`. `products_v` does exist in the DB (brief; `products` base = 204) — it is simply not reached from this screen. |
| 2 | rows expand `→ product_units_v` for the `⌄` rows | GAP | Two ways. (a) The screen has no `⌄` product-expansion at all — the axis is a flat 10-row seed list with a group/A–Z/Z–A sort, no child rows. (b) `product_units` holds **0 rows** live, so even a wired version renders no children today. | `src/data/calendar.ts:280` (`ROWS`, flat); sort modes `Calendar.tsx:128-133`; SQL `select count(*) from product_units` → **0** |
| 3 | `bars  bookings ⨝ booking_lines filtered to the row's product` | GAP (and unbuildable against live data today) | No join is issued anywhere on this route. And the join itself yields nothing: `booking_lines` has **0 rows** against 200 bookings, so **all 200 bookings have zero lines**. A product-axis gantt built exactly as specified would render an empty grid. | `Calendar.tsx:1-40`; SQL `select count(*) from booking_lines` → **0**; `select count(*) from bookings b where not exists (select 1 from booking_lines l where l.booking_id=b.id)` → **200** |
| 4 | bars span `starts_at → ends_at` | WRONG-NAME | Neither column exists. The rental window lives on **`bookings.pickup_at` / `bookings.return_at`** (both `timestamptz`). `booking_lines` carries no date column at all — it has `days:int` and nothing else temporal. | SQL: `select count(*) from information_schema.columns where table_name='booking_lines' and column_name in ('starts_at','ends_at')` → **0**; schema brief, `bookings` and `booking_lines` column lists; CHECK `bookings_return_after_pickup` |
| 5 | `scale  Day/Week/Month → the same periodRange engine already reused by /operations and the Dashboard panels. One date engine, three screens.` | MISLEADING | `periodRange` is real and is genuinely shared by two of the three named screens — but **not by the Calendar**. Calendar never imports it; its scale/zoom is its own `ZOOM_STEPS` + `eachDay()` window. So it is one date engine, **two** screens, and the calendar is the one that does not use it. | `periodRange` defined `src/data/today.ts:835`; callers `src/data/today.ts:927,932`, `src/data/rentals.ts:672`, `src/modules/operations/OperationsQueues.tsx:26,218`. `grep -n periodRange src/modules/calendar/Calendar.tsx` → no match; calendar window from `eachDay`/`ZOOM_STEPS`, `Calendar.tsx:9,32-33` |
| 6 | `today  lib/bs — marker position is AD/UTC derived, rendered BS` | CONFIRMED | Exactly right. `TODAY = getBusinessToday()` resolves the operating day from the real Kathmandu clock; every BS label is produced at render time by `toBs`/`formatBs`; no BS string is stored. | `Calendar.tsx:9` (imports `getBusinessToday, toBs, formatBs, formatAd, eachDay, isWeekend`), `Calendar.tsx:47` (`const TODAY = getBusinessToday()`); `src/data/calendar.ts:16-19` states the no-stored-BS rule |
| 6a | …"(Law 9)" attached to that line | **KNOWN-BAD — do not propagate** | Dates/UTC is **Law 7**. Law 9 is "days ≥ 1, six priced-line tables". | `src/lib/bs.ts:157` ("Law 7: the instant is stored in UTC and rendered here"), `src/lib/bs.ts:251`; `PLAN.md:113` and `PLAN.md:827` bind Law 9 to `days >= 1` |
| 7 | `crew axis  crew assignments + the GiST exclusion constraints` — the constraint sits on crew assignments | WRONG-NAME | The guard is on **`crew_bookings`**, not `crew_assignments`. `crew_assignments` (which also exists, 0 rows) carries **no** exclusion constraint. | SQL `select conname, conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint where contype='x'` → exactly three: `crew_bookings_no_double_booking`, `crew_leaves_no_overlapping_leave`, `inventory_reservations_no_double_booking` |
| 8 | §11.2: "GiST exclusion constraints on crew double-booking and overlapping leave" exist, and this is ours-only (R4) | CONFIRMED | Both exist, verbatim: `crew_bookings_no_double_booking EXCLUDE USING gist (crew_member_id WITH =, daterange(start_date,end_date,'[]') WITH &&) WHERE (state='Confirmed' AND conflict_override_by IS NULL)` and `crew_leaves_no_overlapping_leave EXCLUDE USING gist (crew_member_id WITH =, daterange(start_date,end_date,'[]') WITH &&) WHERE (cancelled_at IS NULL)`. | same SQL as #7 |
| 9 | §11.2: both constraints are "releasable only by a logged conflict override" | MISLEADING | True for **crew_bookings only** — its predicate drops out when `conflict_override_by IS NOT NULL` (and it is armed only while `state='Confirmed'`). **`crew_leaves` has no override escape whatsoever**: its only release is `cancelled_at IS NOT NULL`, i.e. cancelling the leave. A UI that offers "override" on a leave clash will hit `23P01` with nothing to write. | constraint definitions above; `crew_bookings` columns `conflict_override_by/_reason/_at`, `crew_leaves` columns `start_date,end_date,reason,cancelled_at` (no override columns) — schema brief |
| 10 | `[ruled]` crew axis as a second view on the same shell, sharing scale controls and today marker | GAP (partially, and cosmetically, present) | There is no crew *view*. There are two **seed** rows of `type:'Crew'` mixed into the single resource axis, filterable by the `Row Type` select. Nothing reads `crew_members` (0 rows), `crew_bookings` (0), `crew_assignments` (0) or `crew_leaves` (0). The four views are Month / Week / Timeline / Availability — no crew tab. | `src/data/calendar.ts:117` (`ROW_TYPES = ['Equipment','Vehicles','Crew','Warehouse Bays']`), `:68` (`VIEWS`), crew rows at `src/data/calendar.ts:371,384`; SQL row counts all 0 |
| 11 | `avail  "Check availability" hits the same availability source as the line's "0 left" — Booqable-mastered today. GAP` | MISLEADING | The screen-level GAP is real — there is no `Check availability` control on `/calendar`, and the Availability tab renders an `EmptyState`. But the reason v2.5 gives is now out of date: **an availability engine exists in this repo** (`lib/availability.ts` pure rule + `lib/queries/availability.ts` IO). It is unwired to the calendar, not absent. The screen's own code comment ("Nothing in `src/lib/` computes availability") is stale for the same reason. | No `Check availability` string in `Calendar.tsx`; `AvailabilityPanel` `Calendar.tsx:1106-1116`; stale comment `Calendar.tsx:1099-1100`; engine `src/lib/availability.ts:1-6` and `src/lib/queries/availability.ts:1-16` (`selectUnitsForLine`, `explainShortfall`, `planAssignment`, `reserveAssignedUnits`) |
| 12 | `iCal  Subscribe needs a token-authed READ-ONLY feed endpoint` | GAP — not built | No feed, no token, no route. Repo-wide search finds `.ics` only in `src/archive/BusinessHours.tsx:1590` (an archived holiday-export button, not a subscription feed). The project has exactly **one** edge function, `booqable-proxy` (verify_jwt=true) — no calendar feed. No feed-token table exists in the 122-table schema. | `grep -rni "ical\|\.ics" src/` → only `src/archive/BusinessHours.tsx:1590,1615`; `list_edge_functions` → `[booqable-proxy]`; schema brief table list |
| 13 | The feed "carries no money and no client email — booking ref, product, and times only" | UNVERIFIABLE | It is a design constraint on a thing that does not exist. Nothing to check. Would be settled by: an implemented feed handler to read. Note it is a sound constraint — a feed URL is an unexpiring credential (v2.5's own §11.7.2), and there is no revocation table today. | as #12 |
| 14 | §11.6: bars read `0x - Meera Gurung 06:00 – 06:00 • #898`; zero-quantity — "display convention, or real zero-quantity rows?" | MISLEADING as posed — **neither**, on our side | Our schema **cannot** hold a zero-quantity line: `booking_lines_qty_positive CHECK (qty > 0)`. So "real zero-quantity rows" is impossible here. And **B-898 exists in our live bookings**, client `Meera Gurung ` (note the trailing space), stage `Quote`, `pickup_at 2026-08-30 06:00+00` → `return_at 2026-08-31 06:00+00` — which reproduces the spec's `06:00 – 06:00` exactly — and it has **0 booking_lines**. On our data the `0x` is a **line count of zero**, not a quantity of zero: a booking with no lines. Caveat against over-reading: the spec's other sample, `#824 = Ronin Rana`, does **not** match — our B-824 is `Sunil Maharjan`, and no client named `Ronin` exists at all; and `external_refs` holds **zero** Booqable order/booking rows (only 100 clients + 71 products). So our bookings are seeded, not mirrored, and the #898 correspondence is strong but not proof of identity. | SQL: `select booking_no, stage, pickup_at, return_at, c.name, (select count(*) from booking_lines l where l.booking_id=b.id) from bookings b left join clients c on c.id=b.client_id where booking_no in ('B-898','B-824','B-715')`; `select count(*) from clients where name ilike '%Ronin%'` → **0**; `select count(*) from external_refs where entity in ('orders','bookings')` → **0**; CHECK `booking_lines_qty_positive` (schema brief) |
| 15 | §11.4 `[ruled]`: "Bind it to tap as well (Law 16)" | **KNOWN-BAD — do not propagate** | The 44×44 touch-target law is **Law 15**, not Law 16. The calendar's own code says so. | `Calendar.tsx:105` (`/** Law 15 — 44×44 at every width, desktop included. */`); `PLAN.md:525` ("under Law 15's 44px floor") |
| 16 | §11.1: `/calendar/products` is a **read-only** screen | CONFIRMED for ours too | `/calendar` dispatches nothing: no `src/actions/` import, no capability string, no write. Its only outbound effects are `navigate()` calls. | `Calendar.tsx:1-40`; `grep -c "actions/"` → 0 |

### Test coverage — the context question, answered

`/calendar` has **zero test coverage**, confirmed.

- `src/modules/calendar/` contains exactly one file, `Calendar.tsx`. There is no `__tests__` directory.
- No test anywhere in `src/` imports the screen or its seed: `grep -rn "modules/calendar\|data/calendar" --include="*.test.ts*" src/` → **no matches**, across all 92 test files.
- The only test that names "Calendar" is `src/data/nav.test.ts:32,183`, which asserts the string as a **nav label**. That proves the nav entry exists; it touches no calendar code.
- The retired guard test `calendar.kpiBand.test.tsx` survives only in `.claude/worktrees/*` and in the stale `graft/` index. It is **not** in `src/`. Its retirement is documented in-code at `Calendar.tsx:88-101` as deliberate and owner-instructed, alongside the KPI band it guarded.

**What that means for Layer D here:** nothing, and that is the point. Every Layer D claim in §11.5 is a claim about a **data path**, and this screen has no data path — it is seed-only. A test suite cannot fail on a wiring that was never written, so the absence of tests is not what makes these claims unverified; the absence of any query is. When the calendar is wired, note that the eight most load-bearing facts below (the `pickup_at/return_at` naming, the crew-leaves override gap, the 0-lines corpus) are all **executable** assertions — they belong in tests written *with* the wiring, not after it.

## Corrected Layer D

```
rows      GAP — not built. 10 hardcoded seed resources (src/data/calendar.ts:280),
          typed Equipment | Vehicles | Crew | Warehouse Bays. No ⌄ expansion exists.
          When wired: products_v for the SKU row; product_units_v for the child rows
          (both are real views, both WHERE auth_is_staff(), both money-masked).
          Live corpus caveat: product_units = 0 rows, so children render empty today.

bars      GAP — not built. No join is issued. The correct join when it is:
            bookings ⨝ booking_lines on booking_id, filtered to the row's product_id
          spanning bookings.pickup_at → bookings.return_at   (NOT starts_at/ends_at,
          which do not exist; booking_lines has no date column, only days:int).
          Live corpus caveat: booking_lines = 0 rows and all 200 bookings have zero
          lines, so a correctly-built product gantt is empty against live data today.
          That is corpus, not defect.

scale     GAP — not shared. Day/Week/Month/zoom is the calendar's own ZOOM_STEPS +
          lib/bs.ts eachDay() window (Calendar.tsx:32-33, :9). data/today.ts:835's
          periodRange is real and is shared by /operations and the Dashboard — the
          calendar is the screen that does NOT use it. Adopting it is the fix, not
          a description of today.

today     BUILT. lib/bs.ts. TODAY = getBusinessToday() (Calendar.tsx:47); marker
          position AD/UTC-derived, rendered BS at render time; no BS string stored.
          This is **Law 7**, not Law 9.

crew axis GAP as a view — two seed rows of type 'Crew' sit in the single resource
          axis; no crew table is read. The DB half is real and is OURS ONLY (R4):
            crew_bookings_no_double_booking  EXCLUDE USING gist
              (crew_member_id =, daterange(start_date,end_date,'[]') &&)
              WHERE state='Confirmed' AND conflict_override_by IS NULL
            crew_leaves_no_overlapping_leave EXCLUDE USING gist
              (crew_member_id =, daterange(start_date,end_date,'[]') &&)
              WHERE cancelled_at IS NULL
          Note the asymmetry: only the BOOKING constraint has an override escape.
          A leave clash is released only by cancelling the leave.
          crew_assignments carries NO exclusion constraint — do not cite it as the guard.

avail     GAP on this screen; the ENGINE EXISTS. The Availability tab renders an
          EmptyState (Calendar.tsx:1106-1116) and there is no "Check availability"
          control. But src/lib/availability.ts (selectUnitsForLine, explainShortfall,
          rankLeastUsed, RENTAL_WINDOW_BOUNDS='half-open') and
          src/lib/queries/availability.ts (planAssignment, reserveAssignedUnits,
          releaseReservations → inventory_reservations) are built and rule-complete.
          Wiring the tab is a call-site job, not an engine job.
          Calendar.tsx:1099-1100's "nothing computes availability" comment is STALE.

iCal      GAP — not built. No route, no handler, no token store. The project's only
          edge function is booqable-proxy. src/archive/BusinessHours.tsx:1590 exports
          a holiday .ics file — that is a download, not a subscription feed.

Writes:   NONE. /calendar dispatches no action and writes no table. Its only outbound
          effects are navigate() calls (/rentals/new, /today, /rentals/{no}, /inventory).
Reads:    NO table and NO view. Seed only: src/data/calendar.ts + src/lib/bs.ts.
          Session role via useCanViewMoney() → users.primary_role.
```

## Money and Law 6

There is **one** money-flavoured figure on this screen, and it is structurally absent rather than
masked — which is the correct reading of "hidden".

- The money surface is `Payment Due` (`src/data/calendar.ts`, flagged `money: true`), which appears
  in the Upcoming (Next 7 Days) card and in the event-marker legend. Both render through a filter
  that **drops the row from the DOM** for a money-blind role. Nothing is greyed, nothing is
  `••••`; the `<li>` does not exist.
- The gate is `useCanViewMoney()` at `Calendar.tsx:1412`. **This corrects the page doc**, which
  states (§5) that this screen bypasses the shared hook and calls `canViewMoney(role)` directly.
  The code now uses the shared hook; the doc is stale. Code wins.
- Money-blind roles here are the app-wide four: Warehouse, Technician, Driver, Client —
  `auth_can_view_money()` = `auth_user_role() NOT IN ('Warehouse','Technician','Driver','Client')`.
- **RLS and the masked views are not in play on this route**, because the route touches no table.
  The DB-side Law 6 (the `*_money_blind` policies and the `CASE WHEN auth_can_view_money()` view
  columns) is a second layer that this screen never reaches. When bars are wired to
  `bookings ⨝ booking_lines`, note that `booking_lines_v` money-masks `rate`, `discount_amount`,
  `supplier_cost` and `markup_amount` — so a wired bar label must be built from qty/name/times only,
  exactly as the v2.5 bar format already is. The reference bar carries no money, and that is lucky
  rather than designed: keep it that way.
- `/calendar` is **not** in `MONEY_ROUTES`, so `Shell`'s money-surface redirect never fires for it,
  and there is no `isStaff` test on the route — the external `Client` role reaches this staff screen.
  That is a real gate gap, and it is unchanged by anything in §11.

## What this changes for the build

1. **Rename before you wire.** The bar window is `bookings.pickup_at` → `bookings.return_at`.
   `starts_at`/`ends_at` do not exist on any table. Anyone who codes §11.5 verbatim gets a
   column-does-not-exist error on the first query.
2. **Expect an empty gantt, and say so in the UI.** `booking_lines` is 0 rows against 200 bookings.
   A correctly-wired product gantt renders nothing today. Build the empty state as a first-class
   result ("no equipment lines on any booking yet"), not as a loading failure — otherwise the wiring
   will read as broken when it is right.
3. **Do not put the crew override on leave.** `crew_bookings` accepts a logged override
   (`conflict_override_by`); `crew_leaves` does not — its only release is `cancelled_at`. A single
   shared "Override conflict" affordance across both axes will throw `23P01` with nowhere to write.
   Two different affordances, or one that knows which constraint it is arguing with.
4. **Cite `crew_bookings`, never `crew_assignments`.** Both tables exist and both are empty; only the
   first carries the GiST guard. This is a naming trap the spec walks straight into.
5. **The availability tab is a wiring job, not a build job.** `selectUnitsForLine` + `explainShortfall`
   already answer "what is free between these two dates" and already carry the `RENTAL_WINDOW_BOUNDS`
   half-open ruling. Delete the stale "nothing computes availability" comment at `Calendar.tsx:1099`
   when you wire it, or the next reader re-derives the engine.
6. **Adopt `periodRange` when you add the scale controls**, or accept that the calendar's date window
   is a fourth independent implementation. Right now it is: `/operations`, Dashboard and
   `data/rentals.ts` share one; the calendar has its own.
7. **iCal is a green-field feature with a security design attached to it.** There is no endpoint, no
   token table, and no revocation path. Before it is built, §11.7.2's open question must be answered —
   a feed URL is an unexpiring credential, and the schema has nowhere to record or revoke one.
8. **Fix the two law numbers wherever §11 is quoted.** Dates/UTC/BS-rendering is **Law 7**
   (`lib/bs.ts:157`), not Law 9. The 44×44 touch floor is **Law 15** (`Calendar.tsx:105`), not Law 16.
9. **Write the tests with the wiring.** The screen has zero coverage today, which is honest for a
   seed-only page. The moment it reads a table, the assertions in this document — the column names,
   the crew-leave asymmetry, the money-row absence — become executable, and should be.
10. **Re-issue `docs/pages/23_calendar.md`.** It is stale in at least three places (below); it is the
    document a builder is most likely to trust for this screen.

## Open questions

1. **Is our B-898 the same booking as the reference's `#898`?** Our row matches on number, client
   name (`Meera Gurung `, trailing space) and times (`06:00 – 06:00`); it mismatches on the spec's
   other sample (`#824` is `Sunil Maharjan` here, and no `Ronin` client exists), and `external_refs`
   holds no Booqable order rows at all. *Settled by:* one `GET /orders/{id}` through `booqable-proxy`
   for the Booqable order numbered 898, comparing customer id and dates — or by finding the seed
   script that generated our 200 bookings and confirming whether it was transcribed from the capture.
2. **Does `0x` on the reference mean "no lines" or "a line of quantity 0"?** Our side cannot answer it
   — `booking_lines_qty_positive` forbids the second. *Settled by:* one Booqable API read of order
   898's line items; if the array is empty it is a line count, if it contains an item with
   `quantity: 0` it is a real zero-quantity row and the bridge needs a rejection rule, because our
   CHECK will refuse it on import.
3. **Which role may mint an iCal subscribe URL, and what revokes it?** Unanswered and unanswerable
   from the repo — there is no feed, no token column, no expiry field. *Settled by:* a product ruling
   in `PLAN.md §4`, then a table. Do not build the feed first.
4. **Crew axis: second view, or a `Row Type` filter on the one axis?** The code has quietly answered
   "filter" (crew rows are already in `ROWS`, selectable via `Row Type`), while §11.7.1 still poses it
   as open. *Settled by:* an owner ruling — but note the cheap answer is already half-built.
5. **Does the wired product axis read `products_v` or `products`?** `products_v` money-masks all eight
   price columns and carries `WHERE auth_is_staff()`, which would blank the axis entirely for a
   `Client` session — and `/calendar` currently admits `Client`. *Settled by:* deciding the route's
   staff gate first (see Money §), then choosing the view accordingly.

## Contradictions recorded (code wins)

`docs/pages/23_calendar.md` was written against an earlier revision and is stale in three
load-bearing ways. The code is the authority.

| Page doc says | Code says | Evidence |
|---|---|---|
| §2 item 3: a four-card KPI band renders at `:2252-2292` (Active Bookings, Today's Operations, Equipment Utilization, Schedule Conflicts) | The band was **removed 30 Aug 2026** at the owner's instruction; a JSX comment stands in its place. Active Bookings and Today's Operations are gone entirely; Conflicts survives only on the Full View strip. | `Calendar.tsx:2342-2354` (the removal note), `:88-101` (the rationale, incl. the retirement of `calendar.kpiBand.test.tsx`); Conflicts on the Full View strip `:2274-2280` |
| §5: "This page does *not* use the shared `useCanViewMoney()` hook… it calls `canViewMoney(role)` directly" | It imports and uses the shared hook. | `Calendar.tsx:10`, `Calendar.tsx:1412` (`const money = useCanViewMoney()`) |
| Header: "2399 lines"; `TODAY = 31 Jul 2026` fixed | 2494 lines; `TODAY = getBusinessToday()` — the real Kathmandu clock, which replaced the frozen constant. | `wc -l` → 2494; `Calendar.tsx:42-47` |

Line-number drift of ~95 lines means **every** `Calendar.tsx:NNNN` citation in the page doc is
suspect. Re-anchor before quoting any of them.
