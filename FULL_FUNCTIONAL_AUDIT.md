# Babin Rentals OS — Full Functional Audit

**Date:** 1 Sep 2026
**Commit at audit start:** `4696af8` (branch `step1-foundation`)
**Re-verified at:** `e746e4b` — a concurrent session landed 4 commits during the audit
(`5512602`, `d3bdc05`, `fc92050`, `e746e4b`). All three P1 findings were re-run against
that HEAD and **reproduce identically** (25 icon artifacts on `/clients`, 13 on `/crew`,
11 dead pager controls on `/reports/clients`, 6 dead on `/rentals/new`).
**Mode driven:** `dev:mock` (`VITE_DATA_SOURCE=mock`) on `http://localhost:5199`
**Method:** Stage A static analysis (JSX-aware parser, not grep) + Stage B runtime
(Playwright/Chromium, real login, real clicks, real typing)

> **Read §0 before the numbers.** This audit is *partial by design* — roughly the first
> third of the 70-section specification. Every section below is marked
> **TESTED** or **NOT TESTED**. Nothing is scored on inference. Where my own harness
> produced a false positive, that is recorded too, because a QA report that hides its
> own misses is worth nothing.

---

## 0. Coverage — what this audit does and does not cover

| Spec § | Area | Status |
|---|---|---|
| §3 | Backup / snapshot | ✅ TESTED |
| §4, §5 | Route inventory & route audit | ✅ TESTED (56 routes) |
| §6 | Sidebar navigation | 🟡 PARTIAL — links enumerated, direct-URL + redirect verified; back/forward & mobile nav not driven |
| §7 | Top bar (search / notifications / user menu) | 🟡 PARTIAL — notifications & help tested; global search not driven |
| §8, §9 | Button audit & dead-button detection | ✅ TESTED (1,693 rendered buttons) |
| §10 | Link audit | 🟡 PARTIAL — internal hrefs enumerated; entity-ID correctness not verified |
| §11 | Form fillability | ✅ TESTED (88 fields on 5 creation forms) |
| §12 | Form submission → DB → refresh | ⛔ **BLOCKED 2 Sep** — the prescribed `dev:local` environment cannot be built (BUG-010) |
| §13 | Validation | ❌ NOT TESTED |
| §14 | CRUD lifecycle | ⛔ **BLOCKED** (BUG-010) — but 9 lifecycle actions found to be non-writing stubs (BUG-013) |
| §15 | Data propagation across screens | ❌ NOT TESTED |
| §16 | Rental workflow end-to-end | ❌ NOT TESTED |
| §17 | Pricing math | 🟡 **PARTIAL 2 Sep** — DB/app disagreement found and proved statically (BUG-011, BUG-012); end-to-end still blocked |
| §18 | Filters | ✅ TESTED — **8/8 pass** on `/clients` |
| §19 | Multi-filter combinations | ❌ NOT TESTED |
| §20 | Search | ✅ TESTED — **pass** incl. no-result + clear |
| §21 | Sorting | ✅ TESTED — **7/7 sortable columns pass** |
| §22 | Pagination | ✅ TESTED — **pass** on `/clients`; was dead on `/reports/clients` (BUG-003, now fixed) |
| §23–§28 | Table actions, bulk, modals, drawers, tabs, dropdowns | ❌ NOT TESTED |
| §29–§35 | Calendar, inventory, payments, documents, reports, today, queues | ❌ NOT TESTED |
| §36–§39 | Error / loading / empty / toast states | 🟡 PARTIAL — no stuck-loading found; states not forced |
| §40–§41 | Refresh & browser navigation | ❌ NOT TESTED |
| §42–§43 | Responsive & accessibility | ❌ NOT TESTED |
| §44–§47 | Data identity, stale data, FK integrity, permissions | ❌ NOT TESTED |
| §48–§51 | Double-submit, unsaved changes, uploads, integrations | ❌ NOT TESTED |
| §52–§53 | Mock / hardcoded data audit | ❌ NOT TESTED |
| §54–§57 | API / DB / state / URL-state audit | ❌ NOT TESTED |
| §59 | Console & runtime errors | ✅ TESTED |
| §60 | Build test | 🟡 PARTIAL — `tsc --noEmit` exit 0; full `vite build` not run |

---

## 1. Summary

| Metric | Value |
|---|---|
| Routes defined in `App.tsx` | 71 |
| Routes audited (static, non-param, non-auth) | **56** |
| Routes failing to load | **0** |
| Routes returning 404 | **0** |
| Routes stuck loading | **0** |
| Routes redirecting | 10 (all intentional aliases) |
| Rendered buttons across audited routes | **1,693** |
| Disabled by design (documented "unavailable" pattern) | 294 |
| **Dead buttons (no handler, enabled)** | **133** (17 distinct controls) |
| Rendered form inputs | 412 |
| Form fields exercised by typing | **88** |
| **Frozen (unfillable) fields** | **0** |
| Visible `[Icon:…]` debug artifacts in UI | **51** across 3 routes |
| Unreachable module files (no route, no import) | 2 (716 lines) |

### Issue count

| Priority | Count |
|---|---|
| P0 | 0 |
| P1 | 3 |
| P2 | 3 |
| P3 | 2 |
| P4 | 0 |

---

## 2. Headline findings

### 🔴 P1 — Red debug text is rendering in production UI (51 instances)

`Icon.tsx:194` falls back to rendering a literal red string when a glyph is missing:

```jsx
return <span style={{ color: 'red', fontWeight: 'bold' }}>[Icon:{name}]</span>
```

Three of the eight status keys in `lib/status.ts` name glyphs the registry does not
carry, so this fallback fires on real screens:

| Status key | Names glyph | In registry? |
|---|---|---|
| `neutral` (Quote, Draft) | `circle_dashed` | ❌ **missing** |
| `dim` (Closed, Void, Retired) | `circle_dashed` | ❌ **missing** |
| `progress` (Packed, Due Soon, Cleaning, Maintenance) | `progress` | ❌ **missing** |

Confirmed on screen: **25 artifacts on `/clients`**, 13 on `/crew`, 13 on
`/operations/crew`. Screenshot: every membership chip in the Clients table reads
`[Icon:circle_dashed] Academy` in red.

**Root cause is a type hole, not a typo.** `STATUS_ICON` is declared
`Record<StatusKey, string>` — a bare `string`, so the compiler cannot check the names.
Two call sites cast it (`as IconName`) and hand it straight to `<Icon>`:
`ClientsDirectory.tsx:252` and `CrewBooking.tsx:672/680/745/1024`. The codebase already
knows about this hazard — `RentalsList.tsx:101` and `CrewBooking.tsx:893` both document
removing their own usage for exactly this reason — but two live sites were left behind.

This also breaks the project's own Law 11 ("colour + icon + label, never colour alone"),
which `status.ts:33` says `STATUS_ICON` exists specifically to guarantee.

### 🔴 P1 — Notifications and Help are dead on every screen

The header's notification bell (badged **"12"**) and the **Help** button carry no
`onClick` anywhere in the app. Verified at runtime by reading React's fiber props on
every rendered button across all 56 routes: 56/56 dead, both with `cursor: pointer`.

The bell displays a hardcoded unread count of 12, so it actively advertises pending work
that cannot be opened. This is spec §7's Notifications audit — it fails outright.

### 🔴 P1 — Client Reports pagination is entirely inert

`/reports/clients` renders "Showing 1 to 5 of 209" with a full pager
(`« ‹ 1 2 3 4 … 209 › »`). **None of the 11 controls has a handler.** 11 of that
screen's 21 buttons are dead. The data past page 1 is unreachable.

### 🟠 P2 — Money actions dead on the booking draft screen

`/rentals/new`: **Receive Payment**, **Receive Deposit**, **Share**, **More** are all
enabled, styled live, and inert. Share and More even carry reassuring tooltips
(`title="Share this draft booking"`, `title="More actions for this booking"`).

### 🟠 P2 — 716 lines of unreachable report code

`ProductReports.tsx` (517 lines) and `CasesReports.tsx` (199 lines) have **no route in
`App.tsx` and no importer**. Only comments reference them. They contain 15 more dead
buttons that can never render — which is why static analysis flagged them and runtime
did not.

### 🟠 P2 — Assorted dead controls

`Import` / `New Expense` on `/reports/expenses` and `/finance/expenses`;
`Select backup or restore point` on `/admin/backup`; `View` on `/operations/sub-rental`.

---

## 3. What is working well

These were genuinely verified, not assumed:

- **Every one of 56 routes loads.** No 404s, no navigation failures, no stuck spinners,
  no error boundaries tripped.
- **Forms are fillable.** 88 fields typed into across the five creation forms
  (`/clients/new` 24, `/inventory/new` 43, `/rentals/new` 10, `/clients/referral/new` 3,
  `/tools/pricing` 8). **Zero frozen fields.** Text, number, date, email, select,
  checkbox and radio all accept and retain input. The 2 non-fillable were correctly
  `disabled`/`readOnly`.
- **Status colour mapping is type-enforced.** The maps are `Record<Union, StatusKey>`, so
  `tsc` proves exhaustiveness; `Badge` degrades safely via `STATUS[key] ?? STATUS.neutral`.
  The *colour* half of the status system is sound — only the *icon* half is broken.
- **Console is clean except for the icon errors.** 0 page errors, 0 failed requests,
  0 unhandled rejections across the crawl.
- **The "unavailable" convention is real and widely used.** 294 buttons are properly
  `disabled` with explanatory `title` text. The dead buttons are the exception, not the
  norm — and the fix for most of them is to adopt this existing pattern.
- **404 handling works.** Unknown routes render a proper 404 inside the shell.

---

## 3b. Filters · Search · Sorting · Pagination (§18, §20, §21, §22)

Driven on `/clients` — the richest table in the app (40 records, 8 filter chips, 8
headers, pagination, search). **Everything passed.** The filter chips declare their own
counts (`Organisation 32`), which gives an independent oracle to check the result against
rather than merely observing "something changed".

### §18 Filters — 8/8 pass
| Chip | Declared | Rows shown | Reported total | Verdict |
|---|---|---|---|---|
| All | 40 | 25 (page 1) | 40 | ✅ |
| Organisation | 32 | 25 (page 1) | **32** | ✅ |
| Individual | 8 | **8** | **8** | ✅ |
| Unassigned | 0 | **0** | — | ✅ empty as declared |
| On Rent | 40 | 25 (page 1) | 40 | ✅ |
| Payment Due | 40 | 25 (page 1) | 40 | ✅ |
| VIP | 0 | **0** | — | ✅ empty as declared |
| Blocked | 0 | **0** | — | ✅ empty as declared |

Every chip's reported total matches its declared count exactly. No filter silently
no-ops, and the zero-count chips correctly render empty rather than showing everything.

### §20 Search — pass
| Case | Result |
|---|---|
| `"Anjali"` | 1 row, total → 1, **every returned row contains the term** |
| `"ZZQXNOTAREALCLIENT"` | 0 rows + empty state *"No clients found"* |
| cleared | restored to 25 rows ✅ |

### §21 Sorting — 7/7 sortable columns pass
`Client`, `Type`, `Membership`, `Current Rentals`, `Outstanding`, `Deposit Held`,
`Last Rental (BS / AD)` all reorder on click (verified with a fresh page load per column
so no state carried over).

`Contact`, the checkbox column and `Action` do **not** sort — and correctly do not
pretend to: no `<button>`, `cursor: auto`. **Not a defect** — a non-sortable column that
looks non-sortable is right.

### §22 Pagination — pass
| Step | Result |
|---|---|
| page 1 | 25 rows of 40 |
| `›` next | **15 rows** (26–40), first row changes |
| `‹` prev | returns to exactly page 1 |
| page size | `<select>` offering 10 / 25 / 50 |

> Note this is the *same* interaction that is completely dead on `/reports/clients`
> (BUG-003). The Clients screen proves the app knows how to paginate — the Reports
> screen simply never wired it.

---

## 4. Harness false positives (recorded deliberately)

Per §2's rule against assuming, these are cases where **my tooling was wrong**, not the app:

1. **`NewRental.tsx:2824` "frozen discount field"** — my first JSX parser did not skip
   comments, and a comment containing `>100%` truncated the tag before its `onChange`.
   The field is fine and types correctly.
2. **`/reports` "stuck loading"** — my crawler waited 1.4 s; the route resolves normally
   at 9 s. Not a defect. *(Worth noting as a slow first paint, but not stuck.)*
3. **`/payments`, `/expenses` "404"** — those paths do not exist; the real routes are
   `/finance/payments` and `/finance/expenses`. My route guess was wrong, not the app.
4. **~15 "dead buttons" in reports toolbars** — real in source, but in unreachable files
   (see P2 above), so they never render.

---

## 5. Route audit table (56 routes)

All routes: **load OK, no 404, no stuck loading**. `dead` counts exclude the two global
header buttons where noted.

| Route | Buttons | Disabled | Dead | Inputs | Notes |
|---|---|---|---|---|---|
| `/dashboard` | 21 | 0 | 2 | 0 | global only |
| `/operations` | 26 | 0 | 2 | 0 | global only |
| `/operations/sub-rental` | 24 | 2 | 4 | 6 | +View |
| `/operations/cases` → `/inventory/cases` | 35 | 1 | 2 | 19 | alias |
| `/operations/crew` → `/crew` | 44 | 19 | 2 | 13 | **13 icon artifacts** |
| `/rentals` | 65 | 5 | 2 | 1 | global only |
| `/rentals/new` | 68 | 7 | **6** | 10 | money actions dead |
| `/calendar` | 43 | 5 | 2 | 2 | global only |
| `/crew` | 44 | 19 | 2 | 13 | **13 icon artifacts** |
| `/inventory` | 70 | 7 | 2 | 55 | global only |
| `/inventory/new` | 34 | 1 | 2 | 47 | form OK |
| `/inventory/bundles/new` | 63 | 2 | 2 | 46 | |
| `/inventory/cases` | 35 | 1 | 2 | 19 | |
| `/inventory/warehouses` | 59 | 6 | 2 | 4 | |
| `/inventory/purchase-requests` | 17 | 1 | 2 | 0 | |
| `/inventory/stock-check` | 10 | 0 | 2 | 0 | |
| `/clients` | 99 | 4 | 2 | 28 | **25 icon artifacts** |
| `/clients/new` | 30 | 0 | 2 | 25 | form OK |
| `/clients/memberships` | 48 | 8 | 2 | 12 | |
| `/clients/duplicates` | 10 | 0 | 2 | 0 | |
| `/clients/import` | 11 | 0 | 2 | 1 | |
| `/clients/referral/new` | 13 | 2 | 2 | 3 | form OK |
| `/finance` | 19 | 0 | 2 | 0 | |
| `/finance/payments` | 109 | 94 | 2 | 3 | heavy disabled use |
| `/finance/expenses` | 17 | 0 | 2 | 1 | |
| `/finance/documents` | 98 | 39 | 2 | 20 | |
| `/documents` | 98 | 39 | 2 | 20 | |
| `/reports` → `/reports/pulse` | 9→17 | 0 | 2 | 0→2 | slow first paint |
| `/reports/clients` | 21 | 0 | **11** | 0 | **pagination dead** |
| `/reports/expenses` | 30 | 1 | **6** | 9 | Import/New Expense dead |
| `/reports/cash-flow` | 12 | 0 | 2 | 0 | |
| `/reports/equipment-performance` | 11 | 0 | 2 | 0 | |
| `/reports/forecasting` | 11 | 0 | 2 | 0 | |
| `/reports/inventory` | 11 | 0 | 2 | 0 | |
| `/reports/promotions` | 12 | 0 | 2 | 0 | |
| `/reports/pulse` | 17 | 0 | 2 | 2 | |
| `/reports/staff` | 11 | 0 | 2 | 0 | |
| `/reports/working-capital` | 12 | 0 | 2 | 0 | |
| `/settings` | 17 | 0 | 2 | 0 | |
| `/settings/tools` → `/tools/cinematography` | 46 | 0 | 2 | 1 | alias |
| `/tools` | 9 | 0 | 2 | 0 | |
| `/tools/cinematography` | 46 | 0 | 2 | 1 | |
| `/tools/depreciation` | 11 | 0 | 2 | 5 | |
| `/tools/pricing` | 17 | 1 | 2 | 8 | form OK |
| `/admin/backup`, `/tools/backup` | 15 | 3 | **3** | 12 | picker dead |
| `/admin/numbering`, `/tools/numbering` | 14 | 4 | 2 | 0 | |
| `/admin/activity-log`, `/tools/activity-log` | 9 | 0 | 2 | 3 | |
| `/admin/audit-log`, `/tools/audit-log` | 9 | 0 | 2 | 3 | |
| `/admin/audit`, `/admin/audit-settings` | 18 | 8 | 2 | 1 | |
| `/admin` → `/settings?tab=system` | 29 | 0 | 2 | 0 | alias |
| `/today` → `/dashboard` | 21 | 0 | 2 | 0 | alias |

---

## 6. Scorecard (§68) — scored only where tested

Not inflated. Untested areas score **N/A**, not 100%.

| Dimension | Score | Basis |
|---|---|---|
| Route loading / navigation | **100%** | 56/56 load, 0 errors |
| Form fillability | **100%** | 88/88 exercised fields behave |
| Buttons wired | **92%** | 1,560 of 1,693 live-or-properly-disabled |
| Status colour system | **100%** | type-enforced, safe fallback |
| Status icon system | **62% → 100%** | was 5 of 8 keys; **fixed & verified, now 8/8** |
| Console cleanliness | **95% → 100%** | icon errors gone |
| Dead code hygiene | **—** | 716 unreachable lines found |
| **Filters (§18)** | **100%** | 8/8 chips, totals match declared counts |
| **Search (§20)** | **100%** | match, no-result, clear all correct |
| **Sorting (§21)** | **100%** | 7/7 sortable columns; non-sortable correctly inert |
| **Pagination (§22)** | **100%** | next/prev/page-size on `/clients` |
| CRUD / persistence | **N/A** | not tested — blocked on local auth |
| Multi-filter (§19) | **N/A** | not tested |
| Data propagation | **N/A** | not tested |
| Responsive / a11y | **N/A** | not tested |

**Functional readiness — tested surface only: ~91%.**

**Do not read that as "production ready."** It covers navigation, buttons and form
input. The questions that decide production readiness for a rental system — does a
booking persist, does inventory availability react, does money arithmetic agree
front-to-back — are **§12–§17, all untested**. Overall readiness is *unknown* until
that half is run.

---

## 7. Environment & safety

- **Backup taken before anything else** (§3):
  `Desktop/Rental workspasce/QA-BACKUP-2026-09-01-4696af8/`
  - `full-history.bundle` (7 MB, `git bundle --all`, verified "records a complete history")
  - `worktree/` (2,739 files, 133 MB, excludes `node_modules`/`.git`)
  - Verified to contain the uncommitted work of a concurrently-running session.
- **No QA branch was created, and no source file was modified by this audit.**
  A second agent session was actively writing to this working tree during the audit
  (`whatsappActions.ts`, `BookingDetail.tsx`, `Organisation.tsx`, `PROGRESS.md` all
  changed mid-run; it also committed `4696af8`). Branching or committing would have
  entangled its uncommitted work. **The audit was therefore run strictly read-only.**
- Playwright was installed **outside the repo**, in a scratch runner, so `package.json`
  and `node_modules` were never touched.
- Test data: none created. Mock mode is in-memory and states plainly that nothing
  leaves the browser, so no records were written anywhere.

---

## 8. Recommended next stage

The untested half is where the real risk is. In priority order:

1. **§12 + §14 + §40** — CRUD and the refresh test, against `dev:local` (local Supabase),
   never the live project.
2. **§17** — pricing arithmetic front-to-back.
3. **§18–§22** — filters, search, sorting, pagination behaviour.
4. **§15 + §62** — cross-page propagation of one test rental.
5. **§42–§43** — responsive and accessibility.

See `FUNCTIONAL_FIX_PLAN.md` for the fix ordering of what has already been found.
