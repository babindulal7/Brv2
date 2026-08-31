# Archive Audit — 15 August 2026

An exhaustive read of `COMPLETE/` (the 8 Aug 2026 delivery archive) verified against this
repo and against the **live Supabase database**.

**Method.** Two multi-agent passes (33 agents, ~6M tokens, ~1,900 tool calls): 10 readers
over the 574-file spec tree + design pack, each feeding a verifier that checked its claims
against live code; then an adversarial critic; then a second pass closing the gaps the
critic named (design renders, 8 Aug source diff), then a second adversarial challenge.
Counts in this document were re-verified by hand where the passes disagreed.

**Standing rules applied.** Code wins over docs. `PLAN.md`/`PROGRESS.md` are authoritative.
`TODO(decision)` and `*_UNAVAILABLE` are deliberate refusals to invent, not defects.

---

## 0 · Live database verification

This is the part no previous audit did. Every earlier schema figure counted *statements in
migration files*, not objects in a database — and `0042`'s header records that the chain
once failed to apply at all. Queried directly on 15 Aug:

| Object | Live DB | Migration statements |
|---|---|---|
| Tables | **121** | 121 ✅ |
| RLS policies | **231** | 261 (30 replaced/dropped downstream) |
| Triggers (non-internal) | **36** | 37 |
| Enums | **282** | 277 |
| Views | **21** | — |
| Tables with RLS enabled | **121 / 121** | ✅ |

**The schema is real and applied.** Read every "TRIGGER REQUIRED" finding below against
that fact: the tables exist, so the missing enforcement is genuinely missing.

Live row counts that settle two headline findings:

- `bookings` = **121**, `inventory_reservations` = **0**
- `sync_outbox` = **0**  ·  `clients` = **76**  ·  `audit_events` = **2,102**

---

## 1 · Go-live blockers, in dependency order

Ordering note: this is a *dependency* order, not a cost order. Item 1 is a ruling, item 2
is a prerequisite for every action body, and item 9 can be dispatched in parallel on day
one at zero engineering cost.

- [ ] **B0 · Rule the deployment model: is Booqable the booking front door, or is the OS?**
      Gates B2, B4 and B6 — each has a remedy that is void or actively harmful depending on
      the answer. Today `bookings` has 121 rows and the only writer that has ever run is the
      inbound Booqable order mapper (`src/lib/booqable/map/orders.ts:295`).
      *Not in `OPEN-DECISIONS.md`. Never ruled anywhere.*

- [x] **B1 — ✅ CLOSED 16 Aug 2026.** Applied from `CAPABILITY_MAPPING_2026-08-16.md`;
      `checkCapability` went from 11 cases to 32. A regression guard now exists in
      `core.test.ts` ("every declared capability resolves to a rule"), and it was
      mutation-tested — the first version could not see a commented-out `case`. Only the three
      `inspection.*` remain unmapped, deliberately: no table exists to mirror.
      *Original finding below, kept as the derivation record.*

- [ ] **B1 · Close the capability switch before writing any action body.**
      32 capability strings are declared across actions; `checkCapability`
      ([core.ts:116-161](src/actions/core.ts:116)) handles 11, of which 3 (`invoice.void`,
      `credit.override`, `settings.manage`) are declared by no action — so **8 declared-and-handled,
      24 unmapped**. Unmapped falls to `default: return undefined`, which the dispatcher reads
      as a denial **for every role including Owner**. `core.ts:134-151` records this exact
      failure shipping for three days. Derive each case from the RLS policy on the table the
      action writes.

- [ ] **B2 · Wire the booking writer that already exists.**
      `pushOrderCreate` ([sync.ts:1805-1827](src/lib/booqable/sync.ts:1805)) is a complete,
      guarded booking writer — Law 10 discount gate, availability assertion, ~~Law 15~~ **Law 9** days≥1 *(corrected 31 Aug 2026; Law 15 is 44×44 targets)* —
      that inserts `bookings` + `booking_lines` via `idempotentInsert` and enqueues to the
      outbox. It has **zero callers**. So does every one of the six push functions.
      `createRental.ts` is a 36-line `console.log` stub and `NewRental.tsx:1515-1549`
      deliberately dispatches nothing, setting an inline error instead.
      **This is a wiring task, not construction.** Do not write a fresh `bookings` insert —
      `dataAccess.ts:227` requires `bookings` writes to route through `pushOrderCreate`.

- [ ] **B3 · Stand up the `sync_outbox` drain.**
      `booqable-proxy/index.ts:901-909`: "this function does NOT currently poll or drain
      sync_outbox itself, and nothing invokes it." Live table has 0 rows. Every OS→Booqable
      push queues into a consumer that does not exist — including `pushOrderCreate`'s last
      act, so B2 silently depends on this.

- [x] **B4 — ⚠ SUPERSEDED 16 Aug 2026 by `PLAN.md` §4.30.** Confirm-time assignment now writes
      `inventory_reservations` from the OS directly, deliberately overriding bridge spec §5.1.
      No migration was needed. ⚠ **The table still holds 0 rows**, so the first confirm through
      that path is also its first real test — treat it as unproven, not as done.
      *Original finding below.*

- [ ] **B4 · Nothing reserves inventory.** 121 bookings, 0 reservations, live.
      `inventory_reservations` is Booqable-mastered and in `BOOQABLE_READ_ONLY_TABLES`
      ([dataAccess.ts:201](src/lib/dataAccess.ts:201)) — a direct insert is refused by the
      app's own ownership map. Path is `pushOrderReserve` ([sync.ts:1838](src/lib/booqable/sync.ts:1838)),
      zero callers. The GiST exclusion constraint and the `0045` capacity ceiling are correct
      and guard an empty table. Also rule who owns availability: `pushOrderCreate` takes
      `availabilityConfirmed` as a caller-supplied boolean and says the engine is out of scope.

- [ ] **B5 · Migrate settings off `localStorage` into a `settings` table.**
      All 19 keys — VAT rate, org PAN, payment terms, session timeout — are **per-device**
      browser storage ([settingsStore.ts:11-16](src/lib/settingsStore.ts:11)). Two machines
      can price the same booking at different VAT rates with no reconciliation and no audit
      row; clearing browser data resets everything to defaults. This also *blocks* the VAT
      fix, because a Postgres trigger cannot read a browser.

- [ ] **B6 · The commercial gates do not exist.** A Blocked client is not blocked; no credit
      limit is checked. `blockClient` is fully implemented (386 lines) so flags can be *set* —
      and nothing consumes them. `0005_clients.sql:264-267` marks the INSERT refusal
      `TRIGGER REQUIRED`; no trigger references `client_flags`. Write it in SQL so the
      inbound Booqable path cannot bypass it. **Depends on B0** — under a Booqable-front-door
      model a raising trigger would reject inbound orders wholesale.

- [ ] **B7 · VAT: six hardcode sites, one unit mismatch.**
      `0010_triggers_functions.sql:170` computes `round(v_taxable * 0.13, 2)`. Also
      `0006_finance.sql:92` and `:450` (`0.1300` — a **fraction**, against the store's
      **percentage** 13), `src/lib/seed.ts:83`, `src/data/booking.ts:47`, `src/lib/money.ts:315`.
      The rate already has a named app home (`settingsStore.ts:91`) wired into three pricing
      surfaces, so `bookingQuery.ts` passing `vatPercent: null` at **:475 and :2149** is a
      bug, not a principled refusal. Fix after B5.

- [~] **B8 — ⚠ HALF CLOSED 16 Aug 2026.** `0061_bookings_deposit_masking_view.sql` is applied
      and verified live (Owner 121 rows / Rs 13,65,000; Warehouse 121 rows / `null`). Both call
      sites moved — `lib/queries/bookings.ts` and `lib/bookingQuery.ts` no longer name the
      column on the base table. `0062_law6_column_grants_arm_the_mask.sql` is written and
      correctly held back until this ships. **Until 0062 applies, Law 6 on these columns is a
      UI convention:** no module names the column, and a crafted request still reaches it.
      `PLAN.md` §4.28 carries the full status. *Original finding below.*

- [ ] **B8 · Close the Law 6 hole — `bookings.deposit_required`.**
      **⚠ PROVEN AGAINST PRODUCTION, 16 Aug.** Impersonating the live Warehouse user
      (`…0103`) via `request.jwt.claims` with `set local role authenticated`, so RLS is
      enforced: the session resolves `auth_user_role() = 'Warehouse'` and
      `auth_can_view_money() = false` — and still reads **89 deposit figures totalling
      Rs 13,65,000**, largest single Rs 50,000 (B-715). The system's own function says this
      session cannot see money and then hands it the money.
      *Law 6 is otherwise sound:* the same session reads **0 of 93** payments, **0 of 120**
      invoices, **0 of 89** `security_deposits`, while correctly retaining 121 bookings and
      126 products. So this is one unmasked column in an otherwise working control.
      No `bookings_v` view exists in the database; `bookings_select` is `auth_is_staff()`,
      which admits Warehouse, Technician and Driver; `deposit_required` is numeric on the
      base table. It is the only money column on a core table with no masking view, against
      20+ built elsewhere. Add the view mirroring `0019`'s pattern for `booking_lines.rate`.
      **Must agree with the other three Law 6 sites**, which are more extensive than
      previously credited: `useCanViewMoney()`, `src/lib/fieldGating.ts` (a per-field engine
      with 29 non-test importers), and `stripMoneyForRole` in the Booqable proxy.

- [ ] **B9 · The three owner numbers.** Zero engineering — dispatch in parallel now.
      Refusal surfaces are already built and correctly render "not tracked yet":
      cancellation fee tiers ([settings.ts:640](src/data/settings.ts:640)), deposit percentage
      per gear category ([settings.ts:630](src/data/settings.ts:630)), and data import
      (opening balances, existing clients, live bookings, pre-OS earnings). The delivery pack
      calls these "the last things standing between the build and real use."

- [ ] **B10 — ⏰ NOW DATED. It breaks TOMORROW.** Re-checked 16 Aug 2026: `bs.ts` anchors
      1 Shrawan 2083 = 16 Jul 2026 and knows 32 days, so the last convertible date is
      **16 Aug 2026 — today**. From **17 Aug 2026** `toBs()` returns `null` for every date and
      every BS rendering in the app goes with it. This is no longer "eleven months of the year
      are unreachable"; it is a same-week outage of a Law 7 surface. `PLAN.md` §4.34.

- [ ] **B10 · BS calendar — one month of data.** `src/lib/bs.ts:50` `SHRAWAN_2083_DAYS = 32`
      is the only month-length datum, so Nepali fiscal years, quarters and **VAT filing
      periods** are unreachable for eleven months of the year. The only blocker with a hard
      statutory deadline. Everything downstream already refuses correctly, so the fix is one
      data table (12 lengths/year, 2078–2095) plus a `fiscalYear()` helper — no screen changes.

- [ ] **B11 · Two accessibility fixes `PLAN.md` §0 classes as release blockers.**
      Inline `outline:none` defeating the focus ring on ~20 controls, and 15px mobile inputs
      under the iOS 16px auto-zoom floor. Both are small and mechanical. **Unbundled from the
      design-authority ruling deliberately — they do not depend on it.**

- [ ] **B12 · Law 2 (Single Query Rule) unmet on six screens.**
      PackingWorkspace, HandoverWorkspace, ReturnWorkspace, ResetWorkspace, EvidenceWorkspace
      and Calendar read per-screen seed data instead of `bookingQuery`. Two screens can render
      the same booking differently. Today and RentalsList do it correctly. Degrades gracefully
      (seed data is internally consistent), so it gates trust rather than operation.

---

## 2 · Decisions that need a person, not an engineer

None of these can be inferred from code, and `CLAUDE.md` forbids inventing them.

- [ ] Is Booqable the booking front door, or is the OS? *(= B0)*
- [ ] Cancellation fee tiers — notice periods and fee % at each
- [ ] Deposit percentage per gear category (five categories)
- [ ] Data import — opening balances, existing clients, live bookings, pre-OS earnings
- [ ] **Design authority** — photos vs Foundation. Ruled twice on 8 Aug in opposite
      directions and never closed. *The delivery pack's own proposal (photos govern
      layout/density/composition; Foundation governs colour/status/roles) describes what the
      code already does — adopting it verbatim closes this at zero cost.*
- [ ] Cleaning fee — flat per booking, per item, or only when condition is Fair or worse?
      **No representation anywhere**: zero hits for `cleaning.fee|cleaningFee` in `src/` or
      migrations — not even a refusal surface.
- [ ] Missing-accessory charges — replacement cost from the item master, or per case?
- [ ] Write-off approval — who, and above what value does it need Owner rather than Manager?
- [ ] Late-fee day-rate scope — equipment only, or plus crew and transport?
      (`lateFee()` cannot be driven end-to-end: nothing produces `dayRatePaisa`, nothing
      writes `actual_return_at`.)
- [ ] Does `sync_outbox` drain on pg_cron, an external scheduler, or not at all in v1?
- [ ] Is `'Damaged'` a fifth item state, or a condition alongside `'Returned'`?
      (The count invariant fails today on real data containing a Damaged row.)
- [ ] Which of the 121 tables should the audit trigger cover? *(currently 6)*
- [ ] Is branch a first-class RLS dimension? `branch_id` is on 20 tables and **no policy
      carries a branch predicate**, so nothing isolates branches.
- [ ] Does `webhooks.secret_token` move to Vault? It is currently plaintext and exposed in
      the generated client types (`src/types/supabase.ts:10145`).

---

## 3 · Documentation debt — archive files that will mislead

28 files identified. The worst, in order of how badly they mislead:

- [ ] **`13 Database/schema.sql`, `Tables.md`, `Relationships.md`** — the most misleading
      files in the archive. Name a `v_booking` view, `reverses_id`/`reversal_reason` columns,
      a `deposits` table, `block_payment_mutation`, `enforce_status_progression`, a
      `payment_method` enum, a generated margin column. **None exists.** Reality: corrections
      are a separate `payment_reversals` table; the table is `security_deposits`; the trigger
      is `apply_booking_stage_transition`; the exclusion uses `asset_id`.
- [ ] **`00 Getting Started/Foundation Specification.md`** — five load-bearing sections false:
      integer-paisa money columns, a `deleted_at` column everywhere (**exists nowhere** in 60
      migrations), `BK-YYYY-NNNN` identifiers, the 8-module nav ceiling, and `PermissionGate`
      (never built).
- [ ] **`09 Automation/` (whole tree)** — reads as a build record; it is a vocabulary spec.
      152 of 277 declared enums are used by zero columns and the orphan list *is* this doc set.
      No automation, template, workflow-version or WhatsApp table exists. Add a status banner.
- [ ] **`Decisions — 8 Aug 2026.md`** — lists the business 8. Manager was reopened 9 Aug by
      `0017`; there are **nine** roles. *Ruling closed — do not re-litigate.*
- [ ] **`15 Testing/UAT.md`, `QA Checklist.md`, `Regression.md`** — acceptance gates test
      retired identifier formats. The named booking `BK-2026-0715` cannot exist (121 rows
      match `^B-[0-9]+$`, 0 match the old format).
- [ ] **`02 User Roles/` (README, Permissions Matrix, Users & Roles)** — three different role
      vocabularies across three files (6, 12, and 7+portal).
- [ ] **`Customer Portal.md` (×2)** — present tense for unbuilt scope. Tables and RLS exist;
      `src/modules/` has no portal directory. Mark as spec-for-a-future-phase.
- [ ] **`01 Design System/Design Tokens.md`** — a six-hex palette that exists nowhere; wrong
      motion tokens; wrong radius scale; "JetBrains for every number" (identifiers-only since v2.2).
- [ ] **`04 Operations/Return Workflow.md:250-253`** — still prints the *superseded* late-fee
      proposal, and `:440` still lists the rule as open three months after Q2 closed it.
- [ ] Remaining 19 files: `Tables.md`, `Forms.md`, `Charts.md`, `Accessibility.md`,
      `System States & Patterns.md`, `Navigation & Platform Shells.md`, `Rentals.md`,
      `Dashboard.md`, `Booking Workflow.md`, `Missing Items.md`, `Handover Workflow.md`,
      `Booking Hover Card.md`, the four `05 Finance/` docs, `Credit Limits.md`,
      `Membership.md`, `QR & Barcode.md`, `Bundles.md`, the `10 API/` set,
      `Equipment Utilization.md`, `Mobile Dashboard.md`, `Offline Mode.md`,
      `Platform Build Instructions.md`, `Settings.md`.

---

## 4 · Regressions found by diffing the 8 Aug source against live

The live tree is overwhelmingly stronger (`src/modules` 60→159 `.tsx`, `useAuth` 14→133,
`useCanViewMoney` 28→115, ErrorBanner 0→79, `src/lib/__tests__/` 0→11 files). These are the
places something got *weaker*:

- [ ] **Offline guard lost on two new money approvals.** Four approval capabilities take an
      `isOnline` parameter and return false when offline ([rbac.ts:169,179,190,196](src/lib/rbac.ts:169)).
      The two added since — `canApproveDamage` ([:224](src/lib/rbac.ts:224)) and
      `canApproveLateFeeWaiver` ([:249](src/lib/rbac.ts:249)) — have no such parameter, and
      neither `DamageTab.tsx` nor `LateFeePanel.tsx` compensates (`useNetwork()` exists and is
      imported by neither). **An offline device can sign off a damage charge.**
      *Correction to an earlier reading in this audit: `rbac.test.ts:245-247` does NOT pin this
      in place. It asserts `canApproveLateFeeWaiver.length === 1`, but `Function.length` stops
      counting at the first defaulted parameter — so adding `isOnline: boolean = true` keeps
      length at 1 and the test still passes. The test's actual intent, stated in its own
      comment, is to prevent an invented **amount** threshold. The fix is unblocked.*
- [ ] **`src/lib/status.ts` now contradicts itself on purple.** `:10-13` says purple is not
      banned (reserved for Sub-Rental); `:70-72` in the same file says fills drop purple
      "because §4.2 bans the hue"; and `:74-83` still exports `BrandKey`/`BRAND` including
      `purple`, which the adjacent comment declares gone. `Spec Conflicts.md` §C36 logs this
      as unresolved — a product decision was made to unblock it with no `TODO(decision)` left.
- [ ] **An entire second operations shell is dead.** `src/modules/operations/shell/`
      (OperationsShell, EvidencePanel, four step components) has **zero import sites**. The
      live shell is `src/modules/operations/OperationsShell.tsx`. Two of the repo's real
      `.delete()` calls live in the dead copy. *Diff it before deleting — if the orphan is
      newer, this is an unfinished merge, not dead code.*
- [ ] **`Table.tsx` silently dropped from the `components/ui` barrel** while left
      byte-identical, so the one shared table primitive is unreachable and still carries the
      Tailwind classes its eight siblings were rewritten to remove (no CSS file imports
      Tailwind). `MoneyCell` — the only shared primitive that rendered money with a Law 6
      check built in — was removed from `MoneyField.tsx` the same way. **Both without the
      ⛔-obituary comment this repo uses everywhere else.**
- [ ] **Three screens missed the Law 1 honesty pass** and received only a design-token
      find-and-replace: `admin/AuditSettings.tsx`, `automation/EventTriggers.tsx`,
      `notifications/BroadcastCenter.tsx` still render whole fabricated constant sets.
- [ ] **11 of the 14 8-Aug migrations were edited in place** rather than superseded
      forward-only, against the project's own stated default. *Mitigating: the chain had never
      successfully applied at that point, so no live database was affected — and `0044` states
      the correct policy explicitly.*

---

## 5 · Corrections to earlier passes in this audit

Recorded so the errors are not re-inherited.

| Claim | Corrected |
|---|---|
| "4 action stubs" (pass 1) / "22 of 31" (critic) / "24 of 33" (pass 2) | **23 unbuilt of 32**; 9 carry `implemented: true` (hand-verified) |
| "13 unmapped capabilities" | **24 unmapped of 32 declared** (8 declared-and-handled) |
| "The OS cannot create a booking" (pass 2 headline) | **False.** `pushOrderCreate` is built and guarded — it is *orphaned*. A wiring task, not construction. The grep that "proved" absence searched for `.from('bookings').insert`, which the code never uses |
| "Build the Confirm transaction that inserts holds" (pass 1) | Refused at runtime by `dataAccess.ts`. Three-part fix: drain, wire, rule ownership |
| "Gate the deposit refund on `rentalOutstanding === 0`" | Contradicts closed ruling Q3 — deposit **auto-applies**, remainder refunded, accountant confirms |
| "~285 RLS policies", "33 test files" | 261 statements / **231 live**; **73** test files |
| "Zero `.delete()` calls" | 54 hits; 53 are Set/Map. One real: `offlineQueue.ts:147` |
| "Design pack = 65 images" | **18 files**, collapsing to **9 distinct screens** by md5 |
| "VAT computes at two sites" | **Six**, plus a fraction/percentage unit mismatch |

**On the renders as design authority:** they cannot settle `OPEN-DECISIONS` §3 — they
contradict each other on exactly that question (one family shows an Operations nav row with
badge 8; another has no such row). All 15 shot renders show a **"Shift Handover"** nav item
that exists nowhere in the codebase, and two renders differing only in one number ("58 items
out" vs "35 items out") prove they are mockups, not captures. Roughly half the render/code
colour divergences are already answered *in the code's favour* by the delivery pack itself,
which says of that very screen: "Its Reset button is violet — old colour law. Do not copy the hue."

---

## 6 · Execution results — 15 Aug

Both were run, not inferred. The tree was being concurrently edited, so treat as a snapshot.

- **`npx tsc --noEmit` → exit 0, zero errors.** The archive's "29 TypeScript errors in 16
  untracked WIP files" is **closed**. `PRODUCT.md` §4 and `HANDOFF.md` §3-4 are stale on this
  point; the 16 files were finished or removed.
- **`npx vitest run` → 73 files, 1,843 tests, all passing** (150s).

**Read the green suite carefully.** 1,843 passing tests coexist with 23 unbuilt actions and
24 unmapped capabilities, because the untested surface is exactly the unbuilt surface. A
green suite here means "what exists is correct", not "the system works".

---

## 7 · Still unexamined

Stated plainly so nobody reads silence as coverage.

- The **inbound Booqable path** — the only way bookings actually exist — was audited from its
  own comments. Nobody traced a real order through pull → map → `bookings` row to see what
  lands null, whether the location→branch `TODO(decision)` fires, or what stage it arrives in.
- **Report computations.** The 45-report catalog *assertion* was verified; not one report's
  arithmetic was read. Reports are where fabricated numbers hide.
- **`money.ts` paisa↔rupee rounding**, the `toPaisa` boundary, lakh/crore formatting.
- **Offline queue replay** — what happens when a queued mutation replays against a row that
  changed underneath it; whether `client_uuid` actually dedupes. Load-bearing on B2, since
  `pushOrderCreate` returns "likely offline-queued" as a failure mode on its own insert.
- **How many of the 1,843 tests assert current behaviour rather than intended behaviour.**
  One candidate was checked and cleared; the rest were not surveyed.
