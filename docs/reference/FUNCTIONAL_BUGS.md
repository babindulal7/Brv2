> [!NOTE] REFERENCE DOCUMENT — NOT A BUILD TARGET
> **Status:** REFERENCE ONLY
>
> This document is maintained for historical inventory, screen mapping, or issue tracking reference. Active rules and current implementation state live in [`docs/PRODUCT_RULES.md`](../PRODUCT_RULES.md) and [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md).

---

# Babin Rentals OS — Functional Bug List

Audit of 1 Sep 2026 at `4696af8`, **re-verified at `e746e4b`**. Every entry below was
**reproduced at runtime** in a real browser unless explicitly marked *(static)*.
Classification per spec §65.

> BUG-001, BUG-002 and BUG-003 were re-run after a concurrent session landed 4 commits
> mid-audit, and reproduced unchanged at `e746e4b`. These were live defects, not stale ones.

---

## ✅ Verification log — re-tested at `9b360ef`

A concurrent session fixed BUG-001/002/003 from this report (its commit `e1f5d98` names
"BUG-002" directly). **I re-drove the app to verify rather than trusting the commit
messages.** Runtime results:

| Bug | Before | After | Status |
|---|---|---|---|
| BUG-001 icon artifacts | 51 across 3 routes | **0** | ✅ **FIXED — verified** |
| BUG-002 Help / notifications | dead on 56 routes | **0 dead** (now `disabled` + reason) | ✅ **FIXED — verified** |
| BUG-003 Client Reports pager | 11 dead controls | **0 dead** | ✅ **FIXED — verified** |
| BUG-004 `/rentals/new` money actions | 4 dead | **4 dead** | ❌ **STILL OPEN** |

Fix quality checked at source, not just at runtime:

- `STATUS_ICON` is now `Record<StatusKey, IconName>` — the type hole is closed, so a
  bad glyph name is now a compile error. This was fix-plan item #2, and it is the part
  that stops the bug recurring.
- All eight glyphs (`dot`, `check`, `timer`, `truck`, `return_arrow`, `alert_triangle`,
  `dot`, `external_link`) are confirmed present in the 70-entry registry.
- **Zero remaining `as IconName` casts** on `STATUS_ICON` — the casts that hid the
  problem are gone, not just the bad values.
- The fake "12 unread" badge is gone, and the header controls now use the project's
  existing `Unavailable` + `disabled` pattern with a stated reason.

**Remaining open: BUG-004 (P2), BUG-005 (P2), BUG-006 (P2), BUG-007 (P3), BUG-008 (P3).**

---

## ✅ Second verification log — 2 Sep 2026, the remaining six

Every P2/P3 above was taken to a conclusion. **Five are fixed and driven; one is filed
as a decision** because the project rule (`CLAUDE.md`) forbids inventing the answer.

| Bug | Before | After | Status |
|---|---|---|---|
| BUG-004 `/rentals/new` money actions | 4 dead | **0 dead** | ✅ **FIXED — driven** |
| BUG-005 unreachable report files | unresolved | route history recovered | ⬅ **FILED — PLAN.md §4.41(a)** |
| BUG-006 assorted dead controls | 4 dead | **0 dead** | ✅ **FIXED — driven** |
| BUG-007 sub-flow dead controls | 4 filed | **0 dead on the live one**; 3 unreachable | ✅ / ⬅ **split — see below** |
| BUG-008 `/reports` slow first paint | "1.4–9 s" | **measured: dev artifact** | ✅ **CLOSED — not a defect** |
| BUG-009 missing `aria-sort` | 0 of 8 set | **8 of 8 set** | ✅ **FIXED — driven** |

### The audit under-counted — 7 more dead controls found while fixing these

Fixing by *probing the rendered page* rather than reading the file found dead controls
the static pass had missed on screens it had already visited:

| Screen | Missed control | Why the file pass missed it |
|---|---|---|
| `/reports/expenses` | `New Expense`, `Import` (Quick Actions rail) | a **second copy** of the header pair, rendered from `QUICK_ACTIONS` |
| `/rentals/:no/evidence` | `Take Photo`, `Record Video`, `Upload Files`, `Upload Folder` | rendered from a `UPLOAD_SOURCES.map`, no literal in the JSX |
| `/rentals/:no/evidence` | `Change Product` | full-size twin of the `Change` MiniBtn already filed |

The four upload buttons are the notable ones: **the whole subject of the Evidence
Workspace is getting photos in, and the four controls that do it were the four most
dead.** They share a cause the repo had already written down for another screen —
`Expenses.tsx`'s `ATTACHMENT_UNAVAILABLE`: no storage bucket is configured and there is
**no `storage.from(...)` call anywhere in `src/`**, so a picker would have taken a
warehouse operator's photo and stored nothing. The drop zone did the same, silently.

**Method note for the next pass:** the dead-button probe reads React fiber props for
`onClick` on every rendered `<button>` and walks 8 ancestors for a delegated handler.
Grepping the source cannot see a control that is generated from a data array — which is
where 6 of these 7 were hiding.

### Verification gate — run after the changes

```
npx tsc --noEmit          → exit 0
npm run check:contrast    → 40/40 pass, 0 FAIL
npx vitest run            → exit 0
```

Each fixed route was then driven in `dev:mock`, logged in as Owner at 1600×960, and
probed: **`/reports/expenses`, `/admin/backup`, `/operations/sub-rental`, `/rentals/new`
and `/rentals/B-715/evidence` each report 0 dead enabled buttons.**

---

## P1 — Critical

### BUG-001 · P1 · Red `[Icon:…]` debug text renders in production UI
**Where:** `/clients` (25×), `/crew` (13×), `/operations/crew` (13×) — **51 total**
**Files:** `src/lib/status.ts:87`, `src/components/ui/Icon.tsx:194`,
`src/modules/clients/ClientsDirectory.tsx:252`,
`src/modules/crew/CrewBooking.tsx:672,680,745,1024`

`STATUS_ICON` names three glyphs the `Icon` REGISTRY does not carry:

| Key | Glyph named | Present? |
|---|---|---|
| `neutral` | `circle_dashed` | ❌ |
| `dim` | `circle_dashed` | ❌ |
| `progress` | `progress` | ❌ |

`Icon.tsx:194` handles a miss by rendering
`<span style={{color:'red',fontWeight:'bold'}}>[Icon:{name}]</span>` — so the failure is
not a blank space, it is **visible red developer text inside status chips** on the
Clients directory and Crew screens.

**Root cause:** `STATUS_ICON` is typed `Record<StatusKey, string>` — a bare `string`, so
TypeScript cannot validate the names, and both call sites cast with `as IconName`.
`RentalsList.tsx:101` and `CrewBooking.tsx:893` already document this exact hazard and
removed their own usages; two live sites were missed.

**Repro:** log in → `/clients` → every "Academy" membership chip reads
`[Icon:circle_dashed] Academy` in red.

**Also breaks:** the project's Law 11 (colour + icon + label). `status.ts:33` states
`STATUS_ICON` exists precisely so a bare colour chip "cannot be built by accident."

---

### BUG-002 · P1 · Notifications and Help buttons are dead on all 56 routes
**Where:** global header — `src/components/shell/Header.tsx:353` (Help) and the
notification bell
**Verified:** React fiber props read on every rendered button across 56 routes — no
`onClick`, no delegated ancestor handler, `cursor: pointer` on both.

The bell shows a hardcoded unread badge of **12**, advertising pending work that cannot
be opened. Spec §7's Notifications audit fails: opens ✗, data loads ✗, unread state is
fake, click-through ✗, mark-as-read ✗.

---

### BUG-003 · P1 · Client Reports pagination is completely inert
**Where:** `/reports/clients` — `src/modules/reports/ClientReports.tsx:429`

Screen renders "Showing 1 to 5 of 209" with pager `« ‹ 1 2 3 4 … 209 › »`. **All 11
pager controls lack handlers** (11 of the screen's 21 buttons are dead). Records beyond
page 1 are unreachable. The page-number buttons even set `aria-current="page"`, so
assistive tech is told this is a working pager.

---

## P2 — Major

### BUG-004 · P2 · Money actions dead on booking draft
**Where:** `/rentals/new` — `src/modules/rentals/NewRental.tsx:1944-1945`
**Dead:** `Receive Payment`, `Receive Deposit`, `Share`, `More`

All enabled, styled as live primary/secondary actions. `Share` and `More` carry
tooltips (`"Share this draft booking"`, `"More actions for this booking"`) that promise
behaviour they do not have. Money-taking affordances that silently do nothing are worse
than absent ones.

> ### ✅ FIXED 2 Sep 2026 — and it was **not** blocked on the policy question
>
> The fix plan held this behind a ruling: *"can money be taken against a booking that is
> not yet confirmed?"* That question is real, but it is not the blocker. **This screen
> never persists a booking.** `Confirm Booking` does not dispatch `createRental` yet
> either (the ⛔ block at `NewRental.tsx:1485`), so there is no `bookings.id`, no
> invoice, and nothing for `RecordPaymentModal` — which resolves an `invoiceId` out of an
> `invoices` list — to attach a payment to. **That holds whichever way the policy is
> ruled**, so the honest state is reachable now and the ruling is not needed for it.
>
> All four are `disabled` + `Unavailable` with the reason. `Print` was real
> (`window.print()`) and is untouched. The `Share`/`More` tooltips were the specific harm
> and are gone: a dead button is a puzzle, a dead button that *describes what it does* is
> a lie, and on a screen reader the promise was the only thing announced.
>
> **Consequence recorded, not patched:** two alert notices on this screen are labelled
> `Receive Payment` / `Receive Deposit` and scroll to the Summary card (redesign v1 §1 —
> "a notice never repeats the money buttons"). They now land on a disabled button. That
> widens the existing `TODO(decision)` at `NewRental.tsx:1333` from a money-permission
> edge case to the ordinary path — annotated in place. Left as-is deliberately: the
> destination now *explains itself*, and relabelling the notice would be invented copy.
>
> **Driven:** `/rentals/new`, Owner, 1600×960 — 0 dead enabled buttons; all four report
> `disabled: true` with their reason; `Print` still live.

---

### BUG-005 · P2 · 716 lines of unreachable report code *(static)*
**Files:** `src/modules/reports/ProductReports.tsx` (517 lines),
`src/modules/reports/CasesReports.tsx` (199 lines)

Neither has a route in `App.tsx` nor any importer — only comment references from
`data/expenseReports.ts`, `data/inventory.ts`, `data/pulse.ts`,
`modules/inventory/Inventory.tsx`. They contain **15 further dead buttons** that can
never render.

Either the routes were dropped and these files are orphans, or the routes were never
added and two report screens are silently missing from the product. **Which of those it
is, is a product question, not an engineering one.**

> ### ⬅ FILED 2 Sep 2026 as **PLAN.md §4.41(a)** — git answered half of it
>
> The audit called this unknowable from the code. It is half-knowable:
>
> - **`ProductReports` was routed, and was replaced in place.** Until `6fb1c62` (12 Aug),
>   `/reports/inventory` rendered it under the crumb *"Asset Utilization"*; the
>   11-section wireframe restructure pointed that route at `InventoryReports` under
>   *"Inventory Reports"*. So it was not lost by accident.
> - **But it was not superseded.** The two are different reports. `InventoryReports`
>   covers asset stock and health; `ProductReports` covers sales trend, profit, turnover,
>   fast/slow movers, dead stock, returns and suppliers. **Nothing live covers turnover,
>   dead stock or slow movers.**
> - **`CasesReports` was never routed at all** — `git log -S` on `App.tsx` returns
>   nothing. It is not junk either: its docstring records a deliberate rebuild replacing
>   every invented figure with one counted off `data/cases.ts` or an explicit
>   *"Not tracked yet"*.
>
> That leaves a genuine product question — *is either report wanted?* — which
> `CLAUDE.md` forbids answering here. Both files now carry a `TODO(decision) §4.41`
> header so neither is mistaken for live code again, and §4.41(a) states the options and
> what each costs. Archiving is cheap and reversible once ruled: `tsconfig.json:30`
> excludes `src/archive` from the program, and *"restoring one is a move back into
> `src/modules` plus its route."*

---

### BUG-006 · P2 · Assorted dead controls
| Screen | Dead control | File |
|---|---|---|
| `/reports/expenses`, `/finance/expenses` | `Import`, `New Expense` | `ExpenseReports.tsx:322-323` |
| `/admin/backup`, `/tools/backup` | `Select backup or restore point` | `BackupRestore.tsx:557` |
| `/operations/sub-rental` | `View` | `SubRental.tsx` |

`ExpenseReports.tsx:318` carries a comment recording that a dead `Export` button was
previously removed for having no handler — while `Import` and `New Expense` remain dead
immediately beneath it.

> ### ✅ FIXED 2 Sep 2026 — and the count was 4, not 3
>
> | Control | Resolution |
> |---|---|
> | `Import`, `New Expense` (page header) | `disabled` + reason — **nothing in the app writes an expense row.** `src/actions/finance/` holds two actions (`recordPayment`, `approveDailyClosing`); `lib/queries/finance.ts` reads `expenses` four times and never inserts |
> | `Import`, `New Expense` (**Quick Actions rail — missed by the audit**) | same reason, same constant |
> | `Select backup or restore point` | `disabled` + the Restore Center's **own** `RESTORE_UNAVAILABLE`, so the picker and the trigger it feeds can never disagree about why |
> | `View` (`/operations/sub-rental`) | it was dead **only** when `linkedBooking` is absent — a real state, not a data fault. The live and dead copies were pixel-identical, which is why the deadness was invisible. Now disabled with a reason on those rows only; the linked rows still navigate |
>
> The rail copies were the interesting find: `QUICK_ACTIONS.map` generates them, so no
> literal appears in the JSX and a file-level pass cannot see them. Fixing only the header
> would have left the screen contradicting itself — one `New Expense` greyed with a
> reason, an identical one two rails over still inviting a press. Both sites now read the
> **same** reason out of one `EXPENSE_UNAVAILABLE` record keyed by label, so adding a
> third quick action without a reason is a compile error rather than a third dead button.
>
> **Driven:** `/reports/expenses`, `/admin/backup`, `/operations/sub-rental` —
> **0 dead enabled buttons on each.**

---

## P3 — Minor

### BUG-007 · P3 · Dead controls inside sub-flows *(static, not runtime-reachable in this pass)*
| Control | File |
|---|---|
| `Collapse All` (sibling `Select All` works) | `InventoryTree.tsx:19` |
| Quick Actions `Preview` / `Duplicate` / `More` | `BundleSummaryRail.tsx:139-147` |
| `View all blocked items` | `BundleSummaryRail.tsx:130` |
| `Accept` / `Change` / `Assign Product` | `EvidenceWorkspace.tsx:718` — `MiniBtn` has **no `onClick` in its prop type at all** |

> ### ✅/⬅ RESOLVED 2 Sep 2026 — the four entries split two ways
>
> **Three of the four are in files nothing renders.** `InventoryTree.tsx` and
> `BundleSummaryRail.tsx` have **zero importers**: they came out of a 600-line
> `AddBundle` split (`PROGRESS.md:10209`) that was never adopted, and the live routed
> `AddBundle` (`App.tsx:348`) carries its own inline versions.
>
> ⚠ **`FUNCTIONAL_FIX_PLAN.md` item #4 is therefore void.** It scoped `Collapse All` as
> an XS mechanical fix because *"its sibling `Select All` already has `onClick`"*. Both
> live in a component that never renders, so wiring it would have changed nothing a user
> can reach. And the live screen is already fine: `AddBundle:1950` has a **working**
> `View all blocked items` toggle and a working `Duplicate`. Filed as **PLAN.md §4.41(b)**
> with `TODO(decision)` headers on all three files.
>
> **The fourth — `MiniBtn` — is live, and is fixed.** It is dead for exactly the reason
> `Unmatch` is, one card over (`UNMATCH_UNAVAILABLE_REASON`): all three are *match-editing*
> verbs, and `ReviewEvidenceInput.action` is `'review' | 'remove'` — neither edits a match.
> Widening that input belongs to whoever owns `src/actions/`.
>
> Rather than add `onClick` to the prop type with no verb to call — which moves the lie
> instead of removing it — **`reason` is now a required prop**: a `MiniBtn` cannot be
> built without stating why it cannot act. Same guarantee the `STATUS_ICON` retype bought
> for BUG-001: the compiler enforces the honesty, not a reviewer.
>
> **Five more dead controls were found on that same screen while fixing it** — see the
> second verification log above. `Take Photo`, `Record Video`, `Upload Files`,
> `Upload Folder` and the drag-and-drop zone all now state the cause `Expenses.tsx`
> already had written down: no storage bucket, no `storage.from(...)` anywhere in `src/`.
>
> **Driven:** `/rentals/B-715/evidence` — **0 dead enabled buttons.**

---

### BUG-009 · P3 · Sortable table headers never set `aria-sort`
**Where:** `/clients` table (and any screen sharing `TableHeaderCell`)

Seven of the eight `<th>`s are genuinely sortable — real `<button>`, `cursor: pointer`,
and clicking reorders the rows. But **`aria-sort` is empty on every header, including
the column currently sorted.**

A sighted operator sees the direction glyph; a screen-reader user is told only "button,
Client" with no indication that the table is sorted by it, or which way. Cheap to fix:
set `aria-sort="ascending" | "descending" | "none"` on the `<th>` from the state that
already drives the glyph.

Spec §43 (accessibility interaction). Filed P3 because the sorting itself works and the
visual affordance is correct — only the announced state is missing.

> ### ✅ FIXED 2 Sep 2026
>
> `aria-sort` is set on the `<th>` — not on the button, because `aria-sort` is defined on
> the column header cell and a button is not a `columnheader`. Its value derives from the
> same `sort` state that paints the direction glyph, so the announced state and the drawn
> state cannot drift.
>
> Every sortable column that is **not** active reads `none`, which is the ARIA way of
> saying *"sortable, not currently sorted"*; omitting it would have said *"not sortable"*.
> The three genuinely non-sortable headers (select-all, Contact, Action) stay bare.
>
> **Driven** at `/clients`, 1600×960, by **clicking the real header button** rather than
> setting state — this repo has a logged incident where `history.pushState` verification
> hid a broken nav, and the same lesson applies to controls:
>
> ```
> initial   Client=ascending  Type=none        (7 sortable, 3 bare)
> click Type →  Client=none   Type=ascending
> click Type →  Client=none   Type=descending
> ```

---

### BUG-008 · P3 · `/reports` first paint is slow
`/reports` → `/reports/pulse` had not finished rendering at 1.4 s; resolves normally by
9 s. Not stuck (my initial "STUCK" flag was a harness artifact), but slow enough that a
1.4 s observer would call it broken. Worth a loading state or a look at the redirect.

> ### ✅ CLOSED 2 Sep 2026 — measured, and **both** proposed causes are wrong
>
> Timed in the browser rather than estimated:
>
> | Measurement | Result |
> |---|---|
> | Cold `/reports` → Pulse painted (**dev server**) | **1116 ms** — reproduced |
> | Suspense skeleton visible | **70 ms** — a loading state already exists |
> | Same navigation, chunk warm | **1.9 ms** |
> | `/reports/pulse` direct, chunk warm | **1.3 ms** — so the redirect costs **0.6 ms** |
> | Pulse chunk graph, **production build** (`vite build` + `preview`) | **179 ms** cold; 8.7 / 9.1 / 9.0 ms per chunk |
> | Built chunk sizes | `Pulse` 25 KB + `pulse` data 12 KB + `ReportToolbar` 6.5 KB |
>
> **The redirect is not the cause** (0.6 ms) and **a loading state is not missing** (it
> paints at 70 ms). The 1.1 s is Vite compiling `Pulse.tsx` (1,363 lines) and its data
> module **on demand, once**, which is what a dev server does and is not what a user gets.
> In the production build the same work is 179 ms.
>
> **Not a defect.** Nothing changed in `src/`. Recorded here so the next audit does not
> re-file a dev-server characteristic as a product bug — and as a reminder that a
> first-paint timing taken against `npm run dev` measures the compiler, not the app.

---

---

# Stage 2 — §12–§17 (persistence, CRUD, pricing), 2 Sep 2026

The first pass tested what a user can *press*. This stage went after what the audit called
"where the real risk is": does a write reach the database, and does the money agree?

**It did not get that far, and the reason is the headline finding.** The environment the
audit prescribes — *"against `dev:local` (local Supabase), never the live project"* —
**cannot be built**, because the repo's own migrations do not apply to an empty database.
Everything below was found while trying to stand it up.

> ⚠ **Cost, stated plainly.** Getting here destroyed the existing local dev database.
> `npm run db:rebuild` was run against it; `supabase db reset` dropped the schema and then
> failed its own "Initialising schema" step, and the migration apply that follows could not
> restore it. No dump existed. The database that was there (145 tables, seeded, but already
> missing 0076 and 0078) is gone. **The live project was never touched.** The current local
> DB is a *current but empty* schema — see BUG-010's closing note.

---

## BUG-010 · P1 · ✅ FIXED 2 Sep 2026 · The migration set cannot build a database from scratch

> **Fixed and gated.** 79 migrations now apply into a fresh database with **0
> failures**, proved by `npm run check:rebuild` (`scripts/check-rebuild.mjs`),
> which builds a scratch database, applies everything in order, and drops it —
> never touching the dev database and unable to reach a remote project.
>
> Four repo blockers, four fixes: `0047` now seeds the **retired** identifier
> shapes that were legal at its position and lets `0055` migrate them forward
> (generator change in `src/lib/seed.ts` — `0047` is generated); `0010`'s
> `log_audit_event()` gets `0051`'s `to_jsonb(NEW)` fix backported so the seed
> can insert at all; the seed brackets itself with
> `disable/enable trigger trg_booking_gate_check` (ruled 2 Sep — a bulk load of
> historical state is not a user transition, and the gate stays armed for the
> app); and `0053` drops-and-recreates `client_directory_v` because
> `create or replace view` cannot reorder columns. `0054` needed nothing once
> `0053` worked.
>
> **Blocker 5 was never a repo defect.** `auth.users.email_confirmed_at` exists
> on the live project; it had vanished locally because `supabase db reset`
> dropped the `auth` schema while GoTrue was running, so it never re-ran its own
> migrations. `docker restart supabase_auth_<project>` restored it (21 columns →
> 35) and `0067` passed untouched. The gate now says this in its own output.
>
> Rebuilt schema diffed against the dev database: **124 tables, 34 functions
> identical**; the rebuild additionally has `staff_directory_v`, which the dev
> database lacks because `0067` failed there. Full record in PLAN.md §4.42(a).
>
> Still open, and deliberately not answered by the fix: **may gear go out
> against an unsettled rental invoice?** See PLAN.md §4.42(a)'s closing note.

**Where:** `supabase/migrations/` · **Reproduced:** applying all 79 files in filename order
into an empty `public` schema, via the repo's own `scripts/apply-migrations-local.mjs`.

`npm run db:rebuild` is the documented way to build a local database
(`supabase db reset --no-seed && node scripts/apply-migrations-local.mjs`). It does not
work. **Five distinct blockers**, four of them repo-side:

| # | Migration | Error | Cause |
|---|---|---|---|
| 1 | `0047_seed_reference_corpus` | `violates check constraint "clients_client_code_format"` | seeds `C-34`-style codes; the constraint admitting them is installed at **0055** |
| 2 | `0047` *(latent, behind #1)* | `record "new" has no field "created_by"` | `log_audit_event()` from 0010; the fix is **0051**`_audit_trigger_column_safety` |
| 3 | `0047` *(latent, behind #2)* | `Gate Check Failure: Handover blocked due to outstanding rental payment (Rs. 28476.00)` | `validate_booking_gates()` rejects the repo's **own** seed corpus |
| 4 | `0053_client_directory_view_contacts_membership_kyc` | `cannot change name of view column "approved_credit_limit" to "created_at"` | `create or replace view` over 0052's view, reordering columns — Postgres only permits *appending*. **0054 fails identically, cascading from it** |
| 5 | `0067_staff_directory_view` | `column au.email_confirmed_at does not exist` | **environment-dependent, not necessarily a repo bug** — that column is absent from this local GoTrue `auth.users`; it may exist on the live project |

**The pattern in 1–3 is one pattern:** `0047` is a *seed* that was written or revised against
a **later** schema than its filename position — it needs 0051's trigger fix and 0055's
identifier formats to exist first. Proof: re-running `0047` **after** 0051 and 0055 had
applied cleared blockers 1 and 2 and advanced it to blocker 3.

**Why this matters more than it looks.** The apply script's own header states the numbering
is load-bearing because *"filename order equals the order that built production"*. For a
fresh apply, **that is not true**. Consequences:

- **A new machine cannot get a working database.** The stale local DB found at the start of
  this session (145 tables, no 0076, no 0078) is the symptom — it had been built at some
  earlier point and patched forward, never rebuilt.
- **The live schema is not reproducible from this repo.** For a Supabase **Free** project
  with no PITR and no automated backup — which `scripts/check-dump.mjs` says this is — the
  migration set *is* the disaster-recovery plan. It does not currently work.
- It is invisible day to day, because nobody rebuilds a database that already exists.

**Not fixed here.** Reordering or renumbering migrations is exactly the load-bearing change
the script's header warns against, and #3 needs a ruling on whether a seed may bypass a
business gate. Filed as **PLAN.md §4.42**.

> **State of the local DB now:** schema **current** — 124 tables, 25 views, `daily_closings`
> (0078) and `booking_line_units.released_at` (0076) both present, which the destroyed one
> lacked — but **no data**, because `0047` (the seed corpus) still fails at blocker 3.
> Migrations 0053, 0054 and 0067 are unapplied. It is good enough to inspect structure and
> not good enough to test behaviour.

---

## BUG-011 · P1 · The database and the application disagree about money

**Where:** `recalculate_invoice_totals()` (`0010_triggers_functions.sql:170`, still current
after `0050_function_hardening`) vs `price()` (`src/lib/money.ts:125`).

They round at different granularities:

| | Database trigger | Application engine |
|---|---|---|
| Discount | `round(subtotal * pct/100, 2)` — **2 dp (paisa)** | `toWholeRupee(...)` — **whole rupee** |
| VAT | `round(taxable * 0.13, 2)` — **2 dp** | `toWholeRupee(...)` — **whole rupee** |

**The repo already knows, and papers over it.** `0047` prints a NOTICE per invoice and
overwrites the trigger's answer:

```
NOTICE:  Seed INV-1: recalculate_invoice_totals() produced a total of 139506.98,
         the Financial Engine produces 139506.00. Engine figure restated.
NOTICE:  Seed INV-2: ... 17096.90 vs 17097.00 ...
NOTICE:  Seed INV-3: ... 25933.50 vs 25934.00 ...
NOTICE:  Seed INV-4: ... 46951.50 vs 46952.00 ...
NOTICE:  Seed INV-6: ... 71119.38 vs 71119.00 ...
… 41 such NOTICEs in total before the run aborted.
```

**41 invoices disagreed** in the partial run before the seed aborted at BUG-010 blocker 3
(the seed defines **120**, `INV-1`…`INV-120`, so the run did not reach them all — 41 is a
floor, not a total). The restatement fixes the *seeded* rows and
nothing else: the trigger is still attached, so **any invoice line written through the
running app re-fires it and the database's figure wins again.** The same invoice therefore
totals differently depending on whether it was seeded or created — and `money.ts:118`
documents half-up-at-each-step as precisely the drift §2.3 exists to prevent.

Individually sub-rupee. It is filed P1 because it is a **silent, systematic disagreement
about money between the two systems of record**, on the one number a client is billed.

---

## BUG-012 · P1 · `invoices.vat_rate` is a dead column — the trigger hardcodes 13%

**Where:** `0006_finance.sql:92` declares `vat_rate numeric(5,4) not null default 0.1300`.
`recalculate_invoice_totals()` computes `v_vat := round(v_taxable * 0.13, 2)`.

Proved against the live function body in the local database:

```sql
select position('vat_rate' in prosrc), position('0.13' in prosrc)
  from pg_proc where proname='recalculate_invoice_totals';
-- →  0  |  875
```

`vat_rate` **does not appear in the function at all.** It reads only `discount_percent` and
`paid_amount`. So setting an invoice's `vat_rate` to anything other than `0.1300` changes
nothing — the trigger recomputes at 13% and overwrites the total.

This is worse than BUG-011's rounding, because the error is not sub-rupee: a VAT change (or
any zero-rated or differently-rated invoice) would be **silently ignored by the database**
while the column continues to display the intended rate. The application, by contrast,
takes `vatPercent` as an argument and `bookingQuery.ts:891` is explicit that *"13 is NOT
hardcoded"* there — so the two are wired to different sources of truth for the same number.

`invoice_lines.tax_rate` (`0006_finance.sql:450`) carries the same default and wants the
same check.

---

## BUG-013 · P2 · Nine actions are stubs that report success and write nothing

**Where:** `src/actions/` — `startReturn`, `startInspection`, `resolveCase`,
`reserveEquipment`, `readyForPickup`, `passInspection`, `failInspection`,
`createMaintenanceJob`, `completeMaintenance`.

All nine are 36–37 lines and identical in shape:

```ts
execute: async (input, ctx) => {
  console.log(`[DB TX] Executing PASS_INSPECTION for ${input.id}`)
  const events = [{ type: EVENT_TYPES.INSPECTION_PASSED, payload: {...} }]
  return { result: { success: true }, events }     // ← nothing was written
}
```

Measured across all nine: **0 references to `supabase` or `.from(`**, 9/9 return
`success: true`, 8/9 declare `{ id: string; // Placeholder for actual input schema }`.
They emit real domain events on the bus, so a subscriber would react as though the thing
had happened.

**No user can reach them today** — which is the only reason this is P2. Verified across all
of `src/`: eight have no reference outside their own file; `startReturn` is only
`export * from './startReturn'` in `actions/rentals/index.ts`; `resolveCase` is referenced
only from `src/archive/`, which `tsconfig.json` excludes from the program.

The risk is forward-looking and specific: they are indistinguishable from the real actions
at the call site — same `createAction` wrapper, same permissions array, same success shape.
**Wiring a button to one would produce a green toast and no row**, which is the exact
failure mode `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` exists to catch. Either finish
them or move them out of `src/actions/` so they cannot be picked up by autocomplete.

---

## Not bugs — recorded so they are not re-reported

| Item | Verdict |
|---|---|
| `NewRental.tsx:2824` discount field "frozen" | **False positive** — my parser broke on a comment containing `>100%`. Field works. |
| `/payments`, `/expenses` 404 | **Not routes.** Real paths are `/finance/payments`, `/finance/expenses`. |
| 294 disabled buttons | **Correct by design** — the documented `disabled` + `title` unavailable pattern. |
| `ItemQuantityState` 5-member vs `ItemState` 4-member contradiction | **Known & deliberately blocked** — `types/database.ts:28`, PLAN.md §4.16. Needs an enum rebuild, not a UI fix. |
| `ResetWorkspace.tsx:1410/1419` white border | **Documented in place** as cosmetic and deliberately unfixed. |

---

## Counts

**Updated 2 Sep 2026.** The seven extra dead controls found while fixing (see the second
verification log) are counted into BUG-006 and BUG-007 rather than filed as new bugs —
they are the same defects on the same screens, missed by a file-level pass.

| Priority | Found | Fixed & verified | Closed as not-a-defect | Open (needs a ruling) |
|---|---|---|---|---|
| P0 | 0 | — | — | 0 |
| P1 | 3 | **3** | — | 0 |
| P2 | 3 | **2** | — | **1** (BUG-005) |
| P3 | 3 | **2** | **1** (BUG-008) | 0 |
| P4 | 0 | — | — | 0 |
| **Total** | **9** | **7** | **1** | **1** |

**Every route named in this register now reports 0 dead enabled buttons when probed:**
`/clients`, `/crew`, `/operations/crew`, `/reports/clients`, `/reports/expenses`,
`/admin/backup`, `/operations/sub-rental`, `/rentals/new`, `/rentals/:no/evidence`, and
the global header on every route.

The one open item is BUG-005, and it is open because `CLAUDE.md` forbids inventing the
product decision — not because the engineering is unclear. **PLAN.md §4.41** states the
options and what each costs; BUG-007's unreachable half is filed in the same entry.

⚠ **What that does *not* say.** "0 dead" is measured per route on the surfaces this
register covers — it is not a claim about the whole app, and a dead control on an
unvisited route or behind an unopened modal would not have been seen. It also says nothing
about whether a control that *does* fire writes the right thing; that is §12–§17, still
untested (see below).

**No P0 was found in the tested surface.** P0-class risks (booking does not persist,
pricing wrong, availability broken) live in §12–§17, which this pass did not test.
