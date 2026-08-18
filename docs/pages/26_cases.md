# Cases Workspace

Route `/operations/cases` and `/operations/cases/:id` · `src/modules/operations/CasesWorkspace.tsx` · 353 lines

Both routes are declared in `src/App.tsx:367-374` and `src/App.tsx:378-385`, and **both mount the same
`<CasesWorkspace />`** (`src/App.tsx:371`, `src/App.tsx:382`). Lazy-loaded at `src/App.tsx:81`.

---

## 1. What it is

A four-KPI strip, a status-chip filter row with a search box and two buttons, and one table of 17
incident cases — every figure computed from the constant array `CASES` in `src/data/cases.ts:370-843`
(`src/modules/operations/CasesWorkspace.tsx:12-24` imports it, `:54` filters it). The component
declares no `useEffect`, no query hook, and no action import (`src/modules/operations/CasesWorkspace.tsx:1-25`);
nothing on the page reads or writes a database.

`/operations/cases/:id` renders this same list — the file never calls `useParams`
(`src/modules/operations/CasesWorkspace.tsx:1-2` imports only `Link` and `useNavigate` from
`react-router-dom`), so there is no case-detail surface behind that route.

---

## 2. What renders

Top to bottom at desktop, inside a `flex column` with `gap: 20` (`src/modules/operations/CasesWorkspace.tsx:113`):

1. **KPI grid** — `src/modules/operations/CasesWorkspace.tsx:115-164`. `gridTemplateColumns` is
   `repeat(4, 1fr)` when money is visible, `repeat(2, 1fr)` when it is not (`:115`).
   - *Open Cases* — `openCasesCount()` (`:121`), sub-label "All active & unresolved" (`:124`).
   - *Awaiting Decision* — `awaitingDecisionCount()` (`:132`), coloured `var(--warn)` (`:131`).
   - *Exposure* — `formatMoney(exposurePaisa())` (`:144`), rendered only when `money` (`:138`).
   - *Recovered This Month* — `formatMoney(recoveredThisMonthPaisa())` (`:157`), only when `money` (`:151`).
2. **Toolbar row** — `src/modules/operations/CasesWorkspace.tsx:167-222`, `flexWrap: 'wrap'` (`:167`).
   - Seven status chips: All, Open, In Progress, Under Review, Awaiting Decision, Resolved, Closed
     (`:169-177`), each with a count and an active-state fill (`:187-189`). `setActiveFilter` on click (`:180`).
     **`Cancelled` is a declared `CaseStatus` (`src/data/cases.ts:98`) with no chip here.**
   - Search `<Input>` fixed at `width: 240` (`:199-206`), placeholder "Search ID, title, client…".
   - `Export` button, `variant="secondary"` (`:207-213`).
   - `Log Incident` button, `variant="primary"` (`:214-220`).
3. **Main table** inside `<Card padding="none">` (`:225`), wrapped in `overflowX: 'auto'` (`:237`).
   Header row (`:239-257`): select-all checkbox · Case ID · Incident Detail · Counterparty & Links ·
   Priority · Status & Disposition · **Financial Impact (only when `money`, `:254`)** · Age · Actions.
   Body rows (`:260-345`): row checkbox (`:266-271`); case id + owner (`:273-276`); type badge + title,
   truncated at `maxWidth: 280` (`:277-286`); counterparty name (linked to `/clients/:id` only when a
   client resolves, `:289-298`) plus a `/rentals/{linkedRecordId}` link (`:301-303`) and the first
   serial with a `+N` overflow (`:304-308`); priority dot + label (`:311-316`); status + disposition
   or `—` (`:317-320`); assessed money and outstanding/`Settled` (`:321-330`); age in days, amber over
   14 days, with the BS date beneath (`:331-338`); an `Open Case` button (`:339-343`).

**Responsive bands: none.** `src/modules/operations/CasesWorkspace.tsx` does not import
`src/lib/device.ts` at all (`:1-25`) — it reads neither 768 nor 1180. The only width-reactive things in
the file are `flexWrap: 'wrap'` on the toolbar (`:167`, `:168`) and the table's horizontal scroll
container (`:237`); the KPI grid stays at 4 (or 2) fixed columns at every width (`:115`), and the table
does not become card rows on a phone. The surrounding `Shell` does read `useViewport()`
(`src/App.tsx:957`, `src/lib/device.ts:57`) to swap the sidebar for a bottom bar below 768
(`src/App.tsx:1004`, `:1033`) — that is shell behaviour, not this page's.

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Open Cases / Awaiting Decision KPIs | SEED | `openCasesCount()` `src/data/cases.ts:863-865`, `awaitingDecisionCount()` `:879-881`, both over the constant `CASES` `src/data/cases.ts:370-843` |
| Exposure KPI | SEED | `exposurePaisa()` `src/data/cases.ts:868-870` — sums `assessedPaisa` of open-status rows |
| Recovered This Month KPI | SEED | `recoveredThisMonthPaisa()` `src/data/cases.ts:873-877` — filters on `settledAd` against `TODAY` (`src/lib/bs.ts:153`, fixed to 31 Jul 2026) |
| Status chip counts | SEED | `STATUS_COUNTS` `src/data/cases.ts:859` ← `statusCounts()` `:851-853`; the All chip uses `CASES.length` `src/modules/operations/CasesWorkspace.tsx:170` |
| Table rows (id, type, title, counterparty, equipment, priority, status, disposition, owner, flags, linked ids) | SEED | `CASES` `src/data/cases.ts:370-843` — 17 hand-authored objects |
| Financial Impact column | SEED | `c.assessedPaisa` from the same array; `outstandingOf()` `src/data/cases.ts:284-286` |
| Counterparty → client link | SEED | `findClientIdByBooking()` `src/data/clients.ts:995-998`, resolving against `CLIENTS_DATA` (another `src/data/*.ts` constant) |
| Age (days) | computed | `ageDaysOf()` `src/modules/operations/CasesWorkspace.tsx:28-34`, against a **hardcoded** `Date.UTC(2026, 6, 31)` at `:32` |
| BS created date | computed | `createdBsOf()` `:36-39` → `toBs`/`formatBs` `src/lib/bs.ts:93-99`, `:102-105` (anchor 16 Jul 2026 = 1 Shrawan 2083, `src/lib/bs.ts:41-43`) |
| Money strings | computed | `formatMoney()` `src/lib/money.ts:62-69` over `Paisa` `src/lib/money.ts:20` |

No DB row is read anywhere on this page. A `cases` table **does** exist in the schema
(`supabase/migrations/0023_cases_charges.sql:88`), but no query file targets it: `src/lib/queries/`
contains `availability · bookings · clients · facetCounts · filterParams · finance · inventory ·
listQuery · useClients · useFilters · useList` and nothing for cases, and a repo search for
`from('cases')` across `src/lib`, `src/actions` and `src/services` returns nothing.

LOCAL is also absent: `src/lib/mock/corpus.ts` serves 13 tables (`src/lib/mock/corpus.ts:22-25`) and
lists 10 more as `UNSERVED` (`:33-44`). **`cases` appears in neither list** — it is not served by the
mock store and it is not even registered as unserved, because no code queries it.

**Invented on this page:** every figure. The 17 case records and their ids, titles, counterparties,
serials, owners, priorities, statuses, dispositions and flags (`src/data/cases.ts:370-843`); every
rupee amount — `assessedPaisa`, `depositHeldPaisa` and all six allocation buckets (e.g. `:381-388`),
and therefore the Exposure and Recovered This Month KPIs and the whole Financial Impact column; every
`openedAd`/`settledAd` date and so every Age and BS date; and every chip count, which is a tally of
that invented array.

---

## 4. Actions and writes

**This file dispatches nothing.** It imports no module from `src/actions/` (`src/modules/operations/CasesWorkspace.tsx:1-25`).
Every interactive control is either local `useState` or a toast:

| Control | file:line | What it actually does |
|---|---|---|
| `Export` | `:207-213` | `showSuccessToast('Exporting', 'Generating cases report...')`. No export code exists in the file. It reports success for work that did not happen — the exact pattern `src/actions/core.ts:9-18` was rewritten to remove. |
| `Log Incident` | `:214-220` | `showSuccessToast('New Case', 'Opening case logging workspace')`. Nothing opens and nothing navigates. `src/data/cases.ts:983` states in the same data module that case creation is not built (`NEW_CASE_UNAVAILABLE_REASON`); this page does not read that constant. |
| `Open Case` (per row) | `:339-343` | `navigate(CASE_WORKSPACE_ROUTE(c.id))` → `/operations/cases/{id}` (`src/data/cases.ts:985`), which `src/App.tsx:378-385` maps back to this same component. Navigates to itself. |
| Status chips | `:178-195` | `setActiveFilter` — local state only (`:50`). |
| Search box | `:200-205` | `setSearchQuery` — local state only (`:49`). |
| Select-all checkbox | `:242-247` | `handleSelectAll` (`:73-76`) — writes `selectedRowIds`. |
| Row checkboxes | `:266-271` | `handleToggleRow` (`:78-83`) — writes `selectedRowIds`. |
| Empty-state `Clear Filters` | `:230-234` | Resets both local filters. |
| `Case ID` header cell | `:249` | Carries `cursor: 'pointer'` but **no `onClick`** — a dead sort affordance. |

**Capability strings dispatched by this page: none.** For completeness, the one Cases action that
exists is `src/actions/cases/resolveCase.ts`, permission `['case.resolve']` (`:11`). `checkCapability`
**does** map `case.resolve` → `rbac.canWriteSharedTriage` (`src/actions/core.ts:211-214`), so it is not
an unmapped denial — but `resolveCase.ts` declares no `implemented` key (`:9-16`), so it defaults to
`false` and `src/actions/core.ts:223-225` throws `ActionNotImplementedError` before validate, execute
or events. Nothing on `/operations/cases` reaches it: the only call site is
`src/modules/operations/CasesQueue.tsx:277-278`, in a component no route mounts.

Buttons with no handler: none — but three of the four buttons above (`Export`, `Log Incident`,
`Case ID` header) have handlers that change nothing outside the toast queue.

---

## 5. Gates

**Route reach.** `Shell` (`src/App.tsx:943-1040`) is the only gate. It holds while auth resolves
(`:964-970`), redirects to `/login` when `user` is null (`:973-975`), and otherwise refuses only money
surfaces: `!canViewMoney(user.role) && isMoneySurface(pathname)` (`:993`). `MONEY_ROUTES`
(`src/data/nav.ts:140-153`) lists `/finance`, `/reports`, `/admin`, `/tools/pricing`,
`/tools/depreciation` — **`/operations` is not among them**, so `isMoneySurface('/operations/cases')`
is false (`src/data/nav.ts:156-159`). Every signed-in role reaches this route, including the
money-blind four and including the external `Client` role (`src/lib/rbac.ts:45-50`, `:53-55` — the
`isStaff` guard exists but `Shell` does not call it).

The route is not in the sidebar: `NAV` is 10 items and Cases is not one (`src/data/nav.ts:67-77`). It
is reached from a chip-row link on the Operations page (`src/modules/operations/OperationsQueues.tsx:113`,
`:530-534`).

**Money.** `const money = useCanViewMoney()` (`src/modules/operations/CasesWorkspace.tsx:47`) →
`canViewMoney(user.role)`, `false` for a null user (`src/lib/moneyVisibility.ts:24-27`) →
`!MONEY_BLIND.has(role)` where `MONEY_BLIND` = Warehouse, Technician, Driver, Client
(`src/lib/rbac.ts:36-38`, `:45-50`).

**Hidden under Law 6** — omitted, not masked, which is what the law asks for:
- The *Exposure* KPI card (`:138-150`).
- The *Recovered This Month* KPI card (`:151-163`).
- The KPI grid collapses from 4 to 2 columns (`:115`).
- The *Financial Impact* `<th>` (`:254`) and its `<td>` (`:321-330`) — assessed value and the
  outstanding/`Settled` line both disappear.

Nothing else is role-gated. Priority, status, disposition, counterparty, serials, owner and age are
shown to every role including `Client`.

---

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119-207`) is **not used** on this page.

| State | Present? | How |
|---|---|---|
| Loading | **No** — not in this file. The `Suspense` fallback around lazy routes shows `<LoadingSkeleton type="card" label="Loading…" />` (`src/App.tsx:1026`) while the chunk downloads, but the page itself renders synchronously from a module constant, so there is no data-loading state to draw. |
| Error | **No.** `src/data/cases.ts:932-975` computes `CASES_SEED_ERROR` and `console.error`s it (`:975`); this component never imports or renders it, so a seed that fails its own §2/§3/§7 reconciliation checks shows the operator wrong figures silently. `ErrorBanner` (`src/components/ui/StateViews.tsx:171-210`) is unused here. |
| Empty | **Yes** — `<EmptyState>` from `src/components/ui/StateViews.tsx:34-84`, rendered when `filteredCases.length === 0` (`src/modules/operations/CasesWorkspace.tsx:226-235`), title "No cases found", action "Clear Filters". This is the filtered-empty case only; a genuinely empty `CASES` is impossible (it is a literal with 17 entries). |
| Restricted | **No** — not in this file. `RestrictedState` (`src/components/ui/StateViews.tsx:213-280`) is drawn only by the Shell's money-surface guard (`src/App.tsx:1020-1023`), which never fires for `/operations` (see §5). |

---

## 7. Known gaps

`TODO(decision)` markers in `src/modules/operations/CasesWorkspace.tsx`: **none**. A `grep` for `TODO`
across this file and `src/data/cases.ts` returns nothing.

1. **A second, richer Cases screen exists and no route mounts it.**
   `src/modules/operations/CasesQueue.tsx` is 1104 lines, exports `default function CasesQueue()`
   (`:139`), reads the same `CASES` array with local overrides (`:181`), draws pill-based status/priority/flag
   metadata (`:113-125`), reads the real breakpoints via `useTabularLayout()`/`useViewport()`
   (`:143`, `:149`), keeps a per-case inline error (`:244`), and carries the only `resolveCase`
   dispatch in the app with a proper `ActionContext` and `.catch()` (`:265-292`). Nothing routes to
   it — `src/App.tsx:81` lazy-imports `CasesWorkspace`, and a repo-wide search for `CasesQueue` finds
   only comments (`src/data/operations.ts:78`, `src/modules/operations/OperationsQueues.tsx:88`,
   `src/data/caseIntel.ts:231`) and one test (`src/modules/operations/__tests__/casesQueue.money.test.tsx:66`).
   The screen an operator actually gets is the one with no dispatches.

2. **`/operations/cases/:id` renders the list, not a case.** `src/App.tsx:378-385` mounts
   `<CasesWorkspace />`, which never calls `useParams`. The per-row `Open Case` button
   (`src/modules/operations/CasesWorkspace.tsx:340`) navigates to that URL, so pressing it re-renders
   the same table with the id in the address bar and nothing selected.

3. **Two buttons report success for work that did not happen.** `Export` (`:209`) and `Log Incident`
   (`:216`) both call `showSuccessToast`. `src/actions/core.ts:9-18` names this specific failure —
   "A UI that reports success for work it did not do is worse than one that is visibly unbuilt" — and
   `src/data/cases.ts:983` already holds the honest sentence (`NEW_CASE_UNAVAILABLE_REASON`) that this
   page does not use.

4. **`ageDaysOf` re-implements a function that already exists, and hardcodes the clock.**
   `src/modules/operations/CasesWorkspace.tsx:28-34` duplicates `ageDays()` at
   `src/data/cases.ts:346-349`. Its own comment (`:30-31`) claims it uses `TODAY` "via the
   module-level `CASES` constant which already imports it" — it does not; line `:32` writes
   `Date.UTC(2026, 6, 31)` literally. `src/lib/bs.ts:1-16` calls a second, page-local `today` the
   highest-priority correctness bug in the product. The two implementations also differ:
   `src/data/cases.ts:348` clamps with `Math.max(0, …)` and rounds, this one floors and can go
   negative for a future `openedAd`.

5. **`agingNote()` is never rendered.** `src/data/cases.ts:351-357` computes the "14 days open —
   escalated as a Critical alert" / "escalated to Owner" escalation lines; this page shows only a
   colour change over 14 days (`src/modules/operations/CasesWorkspace.tsx:332`) and never the text.

6. **Row selection is dead.** `selectedRowIds` is written by both checkboxes (`:73-83`, `:245`, `:269`)
   and read only to set the checkboxes' own `checked` (`:244`, `:268`). There is no bulk-action bar
   anywhere in the file, so selecting rows does nothing.

7. **`Case ID` header advertises sorting it does not do.** `cursor: 'pointer'` with no `onClick`
   (`:249`).

8. **Sub-rental cases link into the bookings route.** `:301` builds `/rentals/{linkedRecordId}`
   unconditionally, but five seeded cases carry `Sub-Rental` ids — `SR-2026-0015`
   (`src/data/cases.ts:451`), `SR-2026-0014` (`:505`), `SR-2026-0011` (`:675`), `SR-2026-0009`
   (`:757`), `SR-2026-0007` (`:811`) — which land on `<BookingDetail />` (`src/App.tsx:247-253`) with
   a non-booking identifier. The same rows can never resolve a client link either:
   `findClientIdByBooking` matches against `activeBookings`, which hold `B-` numbers only
   (`src/data/clients.ts:995-998`).

9. **`Cancelled` cases are unreachable by chip.** `CaseStatus` includes `Cancelled`
   (`src/data/cases.ts:98`) and the chip list omits it (`src/modules/operations/CasesWorkspace.tsx:169-177`).
   The seed currently holds zero Cancelled rows, so the gap is latent, not visible.

10. **The rich status/priority/flag vocabularies are ignored.** `CASE_STATUS_META`
    (`src/data/cases.ts:115-123`), `CASE_PRIORITY_META` (`:146-152`) and `CASE_FLAG_META` (`:89-94`)
    encode token, icon and solid/soft weight — explicitly to keep Critical and High distinguishable
    without colour alone. This page instead hand-rolls colour-only helpers
    (`src/modules/operations/CasesWorkspace.tsx:85-92`, `:94-110`) that return `var(--bad)` for **both**
    Critical and High (`:87-88`), reintroducing the ambiguity the metadata was written to fix, and it
    renders no flags at all.

11. **The seed's own self-check is invisible.** See §6 — `CASES_SEED_ERROR`
    (`src/data/cases.ts:932-975`) is computed and logged but never surfaced, and this page has no
    Error state to surface it in.

12. **Money gating relies on a session that may not have loaded.** `useCanViewMoney()` returns `false`
    for a null user (`src/lib/moneyVisibility.ts:26-27`), which fails safe here. Noted only because
    `CasesQueue.tsx:150-157` documents the same hazard and handles it explicitly with a
    `user?.role ?? 'Client'` default; this file does not comment on it.
