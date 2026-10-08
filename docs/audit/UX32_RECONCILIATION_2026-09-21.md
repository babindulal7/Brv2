> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY (20-21 Sep 2026)
>
> This document is a point-in-time audit snapshot. Its findings, blockers, test failure counts, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)

---

# UX-32 Reconciliation — Mapping the 32-Point "Lifecycle-First" Restructure onto the Real Codebase

**Date:** 2026-09-21 · **Session type:** read-only audit, no code changed
**Input:** a 32-section external UI/UX proposal ("arrange everything around `Create → Prepare → Handover → Out → Return → Inspect → Reset → Close`"). The author stated they could **not** unpack the OS build and wrote from prior design decisions, so every claim was re-verified against the code here.
**Method:** direct reads of `src/` (shell, ui primitives, today, operations, rentals, inventory, clients, finance, calendar) + one delegated deep-read of `src/modules/rentals/*`. Every verdict cites a file.

**Two conditions on this repo that gate everything below:**

1. There is a **large uncommitted in-flight batch** (~40 modified files + 2 migrations + new tests) covering header/palette/rentals/today/operations/finance/inventory surfaces — exactly the surfaces this proposal touches. Any implementation phase starts only after that batch is committed by its owning session.
2. Existing **roadmap gates** (PROGRESS 2026-09-21): migrations 0131/0132 are written+verified, not yet applied; FORMS-05 (damage review workflow) was implemented in today's session (c) and its verification + the pre-application backup run are the stated next steps. A UI session must not smuggle in workflow behavior.

---

## 1. Verdict table — all 32 sections

| # | Proposal | Verdict | Evidence / gap |
|---|---|---|---|
| 1 | One global PageShell layout (sidebar + header + work area + optional right rail) | **LANDED** | `components/ui/PageShell.tsx`, `components/shell/{Sidebar,Header}.tsx`; rail pattern via `Rail`/`CollapsibleAside`; three widths by §14 |
| 2 | Nav = Today / Rentals / Calendar / Inventory / Clients / Operations / Payments / More | **PARTIAL — different vocabulary, same idea** | `data/nav.ts`: Dashboard · Rentals · Calendar · Operations · Inventory · Clients · Finance + More(Crew Assist · Tools · Settings). Gap: "Dashboard→Today" rename, Payments top-level, Documents/Reports/Expenses into More |
| 3 | `+ New Rental` globally reachable | **LANDED (and more)** | Header `QuickCreateMenu` (New rental first), `src/data/nav.ts` comment ("New Rental is an action, not a module"), 12 entry points incl. Rentals header, ClientDetail "Start Rental", Calendar, AssetDetail. **Divergence:** header menu also offers New client / Add equipment / Purchase request — proposal wants only rental global |
| 4 | One primary action per page, changing with state | **PARTIAL** | BookingDetail does stage-contextual primary + ⋮ (BookingDetail.tsx:1984–2197). Movement rows: one primary each (`MovementList.tsx:67`). **Gap: RentalsList header carries 6 competing actions** (New Rental, Fast Return, Record Payment, Scan, Refresh, Export) |
| 5 | Today = task screen (pickups/returns, per-row action, no revenue charts) | **LANDED** | `modules/today/Today.tsx` = two movement panels, quick date filters; `MovementList.primaryFor` → Pack / Handover / Return navigating to the right workspace. No charts. Per-row actions navigate (never write) per rulings §8 |
| 6 | Owner/Admin Today gets a second finance layer | **NEW (role-gated)** | No role branch in Today.tsx today. Constrained by Law 6 (Warehouse never sees money) — Owner/Manager/Desk variants must use `rbac`/`moneyVisibility` predicates |
| 7 | New Rental = one scrolling form, 5 sections, sticky summary | **PARTIAL** | Five sections exist (Client&Schedule / Equipment & Bundles / Crew & Delivery / Pricing & Payment / Review) but render as a **5-step wizard by default** (`viewMode='steps'`, "Continue to…" buttons); sticky right "Booking Summary" rail EXISTS on ≥1280 (NewRental.tsx ~5726); "Show all sections" toggle exists but isn't default |
| 8 | Equipment search dominates | **LANDED** | `booking/AddItemPanel.tsx` — search-first combobox, type tabs All/Bundles/Equipment/Services, category select, availability, sort. Minor gap: categories are a `<select>`, not chips |
| 9 | Selected equipment separate from search results | **LANDED** | Grouped selected table with qty/days steppers, discounts, availability pill, footer totals strip (NewRental ~4484–4603) |
| 10 | Bundles as quick-add chips above results | **MISSING (small)** | Bundles exist as a results tab with `[View]` preview; no quick-add chip row above search |
| 11 | Crew + Delivery in one section | **LANDED** | Step 3 = Crew + Delivery together (NewRental ~4636–5052) |
| 12 | Pricing hierarchy: TOTAL and DUE dominate | **LANDED** | MoneyRow with `big` total; deposit OUTSIDE totals with liability note (Law 5); VAT from Settings |
| 13 | Rental Detail = lifecycle centre (lifecycle bar + tabs) | **PARTIAL** | Lifecycle exists (twice — see §14 risk); stage-contextual primary action exists. **Gap: no tab strip** — desktop stacks sections 1–5; phone uses Segmented Items/Money/Docs. Proposed tab set (Overview/Equipment/Preparation/Crew/Payments/Documents/Activity) not present |
| 14 | Show info once; details on demand | **GAPS CONFIRMED** | BookingDetail repeats client ×3, status ×3, money ×3 (header / Facts / rail / blocks). Two independent steppers (`components/ui/Stepper` + local `STAGE_ICON` stepper in BookingDetail) |
| 15 | Right rails only where they help decisions | **LANDED as convention** | `Rail` + `CollapsibleAside`; ruled: "right rails collapse below 1280 = reflow, not hide" (OperationsQueues comment). Verification sweep per-page not done |
| 16 | Operations = queues with counts, one list | **LANDED** | `OperationsQueues.tsx`: chips (Pack/Handover/Return/Reset + counts) over one time-ordered list, day scope Today/Tomorrow/Custom, rail on desktop |
| 17 | Handover as operational workspace | **LANDED** | Route `/rentals/:no/handover` → operations shell `steps/HandoverStep.tsx`; checklist: equipment, documents, payment gate; completes via `floorVerb('Handover')` (fail-closed per R-40) |
| 18 | Return mirrors Handover | **LANDED** | `modules/rentals/ReturnWorkspace.tsx` (expected vs received, condition capture). **Resolved 2026-09-23:** the duplicate `operations/shell/OperationsShell.tsx` + `steps/ReturnStep.tsx` variant had zero importers — archived to `src/archive/operations/orphaned-shell-2026-09-23/` (see its WHY.md). Canonical is `ReturnWorkspace`, routed at `/rentals/:bookingNo/return` |
| 19 | Inspection separate from Return | **LANDED same-day (verify)** | Damage gate at DB level (0131); the FORMS-05 review/approval/resolution flow was implemented by session 2026-09-21 (c) (`actions/inventory/resolveDamage.ts`, `queries/damage.ts`, `DamageTab.tsx`). Remaining: verification against representative data + production application of 0131/0132 (backup protocol authored in session c) |
| 20 | Inventory master-detail | **PARTIAL** | List → `IntelCard` glance/detail + `ContextDrawer` quick view; full detail navigates to `AssetDetail`. No persistent side-by-side split pane |
| 21 | Client page answers 4 questions at top | **LANDED** | `ClientDetail.tsx`: facts (outstanding = derived, deposit = liability, credit stop), tabs overview/rentals/payments/documents/notes/activity, primary "Start Rental" (gated when blocked) |
| 22 | Payments page = money actions only | **LANDED** | `finance/Payments.tsx`: chips incl. Paid/Due/Partial/Refunded? (payment vocabulary), server-side filters only, `[+ Record Payment]`; no operational buttons |
| 23 | Calendar = availability-first, click → side preview | **PARTIAL** | `Calendar.tsx` has view switching (VIEWS/VIEWS_BY_WIDTH), Full View mode, saved views, `CheckAvailabilityModal`. An equipment-row availability grid (Gantt) and click→drawer preview need verification — not confirmed from reads |
| 24 | Global record search, Ctrl/Cmd+K | **LANDED** | `CommandPalette.tsx` (Ctrl/Cmd+K) searches records via `lib/queries/globalSearch.ts#searchRecords` — bookings/clients/equipment/invoices, role-filtered (`canViewMoney`, `isStaff`). **Stale docs alert:** UI_UX_REMAINING_WORK P2 says palette is navigation-only — code shows records landed; re-verify & retire that line |
| 25 | Filters directly above the data | **LANDED as pattern** | Chips + `FilterDrawer` + server-side `ListFilters` (RentalsList, Payments, Operations). **Gap: RentalsList has no text-search input on the page** (only URL param + drawer facets) |
| 26 | Right components: page / drawer / modal discipline | **LANDED** | `Modal`/`ConfirmDialog` (small confirmations), `ContextDrawer`/`FilterDrawer` (preview/filters), pages for full work. Modals noted fragile under glass ancestors — Header already handles via sibling render |
| 27 | Ops-console density tokens | **LANDED (different numbers)** | Tokens in theme CSS: `--t-*` type scale, `--row-min-h` = **56px rows** (spec §7.3), 44px targets (Law 15). **Proposal's 48–52px rows conflict — existing 56px floor stays** |
| 28 | Colour = status semantics | **LANDED + LAW** | `lib/status.ts`: seven hues, one meaning each (blue committed, orange out, green settled, red alarm, grey start, dim finished, gold outline=sub-rental). **Law 11 additionally requires icon+label, not colour alone** — proposal must not regress that |
| 29 | Desktop & iPad same app | **LANDED, better than proposed** | Law 14: width decides — phone <768 bottom bar / tablet 768–1279 72px rail / desktop ≥1280 219px sidebar; no orientation branching anywhere (`breakpoints.ts`). "iPad portrait vs landscape" framing from the proposal is superseded |
| 30 | Sticky bottom action bar on long forms | **MISSING (small)** | NewRental has Save Draft in header + step-5 footer + autosave (2.5s) + `role=status` line; no sticky bottom bar. Phone bottom-bar space already reserved (`App.tsx hasElevatedStickyBar`) |
| 31 | One canonical version of every primitive | **PARTIAL** | Primitives exist broadly (index.ts exports 30+). **Known duplicates to converge:** BookingDetail local Stepper vs `ui/Stepper`; `EnterpriseGearMark`/`SubRentedMark` defined twice (RentalsList + BookingDetail); NewRental header chip hand-rolled instead of `<Badge>`; local `MoneyRow` copies |
| 32 | The 10-priority order | → Section 3 below, re-based on reality |

## 2. Law conflicts found in the proposal (must not be applied verbatim)

1. **§29 device model** — proposal frames breakpoints as "iPad portrait/landscape". **Law 14** says width decides (768/1280), never orientation; code already implements it and a test pins it. Take the proposal's *intent* (same app on desktop+iPad) — already satisfied.
2. **§28 colour** — proposal risks colour-only status. **Law 11** requires icon + label + colour together. Existing `Badge`/`status.ts` already comply.
3. **§27 density** — proposal's 40–44px buttons/inputs and 48–52px rows collide with **Law 15 (44px minimum — met)** and the ruled **56px table row floor**. Keep existing numbers.
4. **§6 finance-on-Today** — must pass through `rbac`/`moneyVisibility` and never render money to money-blind roles (**Law 6**), including inside any merged panel.
5. **§24/§22 etc.** — anything cross-entity joins **Law 2 (Single Query Rule)**; new aggregates must land in `lib/queries/` with the permission contract, not per-page fetches.
6. **§16 "Do everything from Today" temptation** — ruled pattern: dashboard row actions **navigate to workspaces**, they never write (rulings §8, SUCCESS_FABRICATION_REGISTER). Keep it.

## 3. Re-based priority list (what is genuinely left)

Ordered by value ÷ risk. Items marked 🔒 wait on the in-flight batch / FORMS-05 sequencing.

| Pri | Item (from the 32) | Scope sketch | Gate |
|---|---|---|---|
| 1 | **§13/§14 BookingDetail de-duplication + tab structure** — collapse the repeated client/status/money triplicates into one header summary; adopt the section-tab set (or ruled equivalent); delete the second Stepper | Rental Detail only, no behavior change | After batch commit |
| 2 | **§7 NewRental default = all-sections + sticky rail** on ≥1280 (wizard stays as opt-in); categories as chips (§8 tail); **bundle quick-add chips** (§10) | NewRental + AddItemPanel | After batch commit (⚠ concurrent WIP was observed in this file today) |
| 3 | **§4 RentalsList header slim-down** — one primary (New Rental), rest into ⋮/page area; **add the missing text search box** (§25) | RentalsList header + `ListFilters.search` already exists | After batch commit |
| 4 | **§2 nav vocabulary pass** — rename Dashboard→Today (verify against spec docs), surface Payments entry, tuck Documents/Reports/Expenses into More grouping or document why not | `data/nav.ts` + spec-note | Needs ruling (spec says "the fixed 11") |
| 5 | **§30 sticky bottom action bar for NewRental** (Save Draft state + Confirm) reusing `hasElevatedStickyBar` plumbing | NewRental + CSS | After batch commit |
| 6 | **§6 Owner/Admin Today layer** — operational blocks stay on top; append a role-gated snapshot row (today's revenue, dues, utilization) via a new `lib/queries/todaySummary.ts` obeying Laws 2/6 | Today.tsx | Needs ruling + money-visibility review |
| 7 | **§23 Calendar availability grid** — verify what Calendar's Full View already draws; add equipment-row availability/click→preview drawer if absent | Calendar.tsx | Verify first |
| 8 | **§31 primitive convergence sweep** — replace local Stepper/gear-mark/MoneyRow/chip duplicates with the canonical components; add contract tests | Cross-module, mechanical | Any time, per-file |
| 9 | **§20 inventory split view** — optional enhancement; current IntelCard + ContextDrawer may already satisfy "see detail fast" | Inventory.tsx | Defer unless staff complain |
| 10 | **§19 Inspection queue/surface** — covered by **FORMS-05**, which was implemented same-day in session 2026-09-21 (c); follow its verification rather than forking | Operations + damage | **Sequential** — verify FORMS-05, then apply 0131/0132 after backup |

## 4. Concrete warnings recorded

- ⚠ **NewRental.tsx and ~40 other files carry uncommitted work from concurrent sessions** (line numbers drifted during this audit). No structural edits there until that batch lands.
- ~~⚠ **Possible duplicate Return implementations**~~ — **resolved 2026-09-23:** `ReturnWorkspace.tsx` is canonical (routed; rendered by the live `operations/OperationsShell.tsx`); the `operations/shell/` variant had zero importers and is archived under `src/archive/operations/orphaned-shell-2026-09-23/`.
- ~~⚠ **Stale doc line**~~ — **closed 2026-09-23, no edit needed:** re-read of `UI_UX_REMAINING_WORK.md` P2 shows it already records the current truth ("capped permission-aware cross-entity search contract for rentals, clients, equipment and invoices"); the warned-about "navigation-only" line no longer exists there.
- ~~⚠ NewRental return-pickup sub-fields may be unreachable (option value mismatch, ~line 4970)~~ — **fixed 2026-09-23 (session B).** The `<option>`s carried display sentences and no `value`, so a native select wrote the label into the typed state and the `'Babin Pickup'` branch (address/time/fee) never engaged; the review summary then printed the wrong answer. Fixed with explicit option values; pinned by `newRentalGuards.test.ts` NR-rpo tests. **New TODO(decision) recorded at the site:** the return-pickup fields still have no persistence path (no `booking_transport` columns, not in `createRental`'s contract, not in drafts) — the fee shows in the on-page Transport Total but is not sent. Needs a ruling on adding columns or scoping the block out.
- The proposal's headline lifecycle (`Create → Prepare → Handover → Out → Return → Inspect → Reset → Close`) is already the system's actual grammar: stages `Quote → Booked → Packed → On Rent → Returned → Closed`, jobs `Pack / Handover / Return / Reset`, inspection & close gates DB-enforced. **This restructure is therefore refinement, not rebuild.**

## 5. Sources read

`src/App.tsx` (routes, partially) · `components/shell/{Sidebar,Header,QuickCreateMenu,CommandPalette}.tsx` · `components/ui/{PageShell,Page,index.ts,…}` · `lib/breakpoints.ts` · `lib/status.ts` · `lib/workflow.ts` · `lib/queries/globalSearch.ts` · `modules/today/{Today,MovementList}.tsx` · `modules/operations/OperationsQueues.tsx` (+ file map incl. steps) · `modules/rentals/{RentalsList,NewRental,BookingDetail}.tsx` (via deep audit agent) · `modules/finance/Payments.tsx` (structure) · `modules/calendar/Calendar.tsx` (structure) · `modules/clients/ClientDetail.tsx` (structure) · `modules/inventory/Inventory.tsx` (structure)
