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

---

## P3 — Minor

### BUG-007 · P3 · Dead controls inside sub-flows *(static, not runtime-reachable in this pass)*
| Control | File |
|---|---|
| `Collapse All` (sibling `Select All` works) | `InventoryTree.tsx:19` |
| Quick Actions `Preview` / `Duplicate` / `More` | `BundleSummaryRail.tsx:139-147` |
| `View all blocked items` | `BundleSummaryRail.tsx:130` |
| `Accept` / `Change` / `Assign Product` | `EvidenceWorkspace.tsx:718` — `MiniBtn` has **no `onClick` in its prop type at all** |

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

---

### BUG-008 · P3 · `/reports` first paint is slow
`/reports` → `/reports/pulse` had not finished rendering at 1.4 s; resolves normally by
9 s. Not stuck (my initial "STUCK" flag was a harness artifact), but slow enough that a
1.4 s observer would call it broken. Worth a loading state or a look at the redirect.

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

| Priority | Found | Fixed & verified | Open |
|---|---|---|---|
| P0 | 0 | — | 0 |
| P1 | 3 | **3** | **0** |
| P2 | 3 | 0 | 3 |
| P3 | 3 | 0 | 3 |
| P4 | 0 | — | 0 |
| **Total** | **9** | **3** | **6** |

**No P0 was found in the tested surface.** P0-class risks (booking does not persist,
pricing wrong, availability broken) live in §12–§17, which this pass did not test.
