# Reset Workspace
Route `/rentals/:bookingNo/reset` · `src/modules/rentals/ResetWorkspace.tsx` · 1268 lines

Status: **Seed-only**

---

## 1. What it is

A full-screen floor workspace for cleaning, resetting and QC-ing the 18 items of one booking. Lazily imported at `src/App.tsx:31` and mounted at `/rentals/:bookingNo/reset` inside `BookingShell` with `tail="Reset"` (`src/App.tsx:219-229`); `BookingShell` builds its crumb trail from `useParams` (`src/App.tsx:919-941`).

Every unit, checklist task, staff name, queue state and wait time on the screen is a constant in `src/data/reset.ts`; the client, booking number and package name come from `src/data/booking.ts` and `src/data/packing.ts`. The import block (`ResetWorkspace.tsx:1-35`) contains no `lib/queries/*` module, so nothing rendered is read from Postgres or from the local mock store.

`bookingNo` is read off the route (`:198-199`) and, if it is anything other than `BOOKING.no` (`'B-715'`, `src/data/booking.ts:115`), the component returns `BookingNotLoaded` instead of rendering (`:474-476`). The one write the page attempts — `Complete Reset` — dispatches a real, `implemented: true` action, but always with an empty `unitIds` list, which the action's own validator refuses (`:1141-1152`; `src/actions/rentals/floorVerb.ts:380-385`).

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 0 | Read-only banner (lock icon + `resetGate.reason`), rendered only when `readOnly` | `:485-490` |
| 1 | Header — `<h1>` "Reset Workspace" + a fixed status chip reading `JOBS.Reset.runsAt` ("Returned") | `:493-508`; `JOBS` `src/lib/workflow.ts:105` |
| 1a | Sub-line: `<Link to={/rentals/${id}}>` + `PACKAGE.name` + `BOOKING.client` | `:509-515` |
| 1b | Right half of the header: "Reset Progress", `{counts.Ready} / {TOTAL_ITEMS} Ready`, a `scaleX` bar, and a "N items still in the queue" / "All items Ready" line | `:518-532` |
| 2 | Booking summary strip — Client · Booking Status · Reset job · Items in queue · Exceptions · Longest wait · Mode | `:536-553` |
| 3 | Four chip tiles — WAITING · CLEANING · QC · READY, each with count and sub-label | `:557-573` |
| 4 | Filter row — a search/scan input plus the five `QUEUE_FILTERS` toggles | `:581-607` |
| 5 | Three-column grid: categories rail · queue · batch panel | `:613-620` |
| 5a | **Left rail** — "Categories" card, `ready/count` per category, plus a "counts always sum to 18" note | `:622-639` |
| 5b | **Centre** — "Reset Queue" card with a `Select All Visible` action and an 8-column table (checkbox · Equipment · Serial · Category · Status · Assigned To · Queue Time · Actions), `minWidth: 860` | `:643-647`, `:736-831` |
| 5c | Row action cell: `Undo` on an exception, `Start` when Waiting, `QcRowControls` when QC, otherwise a plain "QC by …" / "n/m ticked" label | `:791-813` |
| 5d | **Right rail** — "Reset Selected Items (n)" card: overall progress bar, per-category tiles, Clean/Reset mode toggle, shared-clean checkbox block, one block per selected unit (its own checklist + "Any Problems?" quad + damage sub-form), a notes textarea, and the `Mark Clean & Move to QC` secondary button with its inline disabled reason | `:836-1074` |
| 6 | Selection bar — count badge + `Clear Selection`, only when something is selected | `:1078-1088` |
| 7 | "Today's Reset Summary" card — Completed today · Remaining · Pending QC · Exceptions, plus a reconciliation sentence | `:1092-1112` |
| 8 | Footer bar — `Back to Booking`, a job-state sentence, and the blue primary `Complete Reset` | `:1115-1169` |
| 9 | `completeReason` line under the footer, and an `ErrorBanner` when a dispatch failed | `:1170-1175` |

### Responsive bands the file actually reads

The file calls `useViewport()` (`:212`), which is the hook in `src/lib/device.ts:57-79` reading **both** locked breakpoints, `BREAKPOINT.phone = 768` and `BREAKPOINT.desktop = 1180` (`src/lib/device.ts:43-51`). The component derives `desktop` and `phone` at `:213-214` and uses them at:

- `:557` — chip tiles go from 4 columns to 2 below 768.
- `:613-620` — main grid: `auto minmax(0,1fr) auto` at ≥1180, `minmax(0,1fr) 320px` between 768 and 1179, a single `1fr` column below 768.
- `:214` + `:622`, `:642`, `:836` — `floorPlacements(desktop, phone)` (`src/modules/operations/FloorAside.tsx:82-90`) re-places the three boxes: at tablet the list is top-left, the categories rail beneath it and the batch rail spans both rows; at phone the order becomes list → batch rail → categories rail. DOM order never changes.
- `:622`, `:836` — `FloorAside collapsible={desktop}`: the rails are collapsible `Rail`/`SideRail` only at ≥1180; below that they reflow as plain columns (`FloorAside.tsx:40-53`).
- `:648` — below 768 the queue table is replaced by one `<article>` card per unit carrying the same checkbox and the same single row action (`:656-735`).
- `:1094` — the summary card's four figures go from 4 columns to 2 below 768.

Separately, `src/App.tsx:902` lists `/reset` in `FLOOR_ROUTE_SUFFIXES` and `src/App.tsx:1010` stamps `data-floor="true"` on `<main>` for this route; the component does not apply the floor scale itself (`:478`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Booking number in header/links | SEED | `useParams().bookingNo` falling back to `BOOKING.no` = `'B-715'` (`:199`; `src/data/booking.ts:115`) |
| Client name (header + summary strip) | SEED | `BOOKING.client` = `'Himalayan Films Pvt. Ltd.'` (`:514`, `:538`; `src/data/booking.ts:126`) |
| Package name | SEED | `PACKAGE.name` = `'FX3 Documentary Package'` (`:514`; `src/data/packing.ts:75`) |
| Header status chip + "Booking Status" cell | SEED | `JOBS.Reset.runsAt` — an engine constant, not a query (`:506`, `:539`; `src/lib/workflow.ts:105`) |
| `readOnly` / read-only banner reason | SEED | `stepWriteGate('Reset', BOOKING.status)` and `BOOKING_STATUS[...]` order compare (`:227-228`; `src/data/operationsShell.ts:115-129`; `src/data/booking.ts:124`) |
| The 18 queue rows — name, serial, category, Required flag, assignee, queue time | SEED | `UNITS` (`src/data/reset.ts:184-204`), read at `:259-262`, `:284`, `:657`, `:749` |
| `Items in queue` / progress denominator | SEED | `TOTAL_ITEMS` = `UNITS.length` = 18 (`src/data/reset.ts:206`), used at `:522`, `:541`, `:636`, `:1108` |
| Opening queue states (which units start Cleaning / QC / Ready) | SEED | `SEED_CLEANING`, `SEED_QC`, `SEED_READY` (`src/data/reset.ts:268-270`) via `seedStateFor`/`buildInitialLines` (`:148-171`, `:230`) |
| Opening timestamps `09:40 AM` / `09:55 AM` | SEED | Literals inside `buildInitialLines` (`:165-166`) |
| Chip counts, Exceptions, Today's Reset Summary, category `ready/count` | SEED | All derived from the component's `lines` state, itself seeded from `UNITS` (`:259-262`, `:279-280`, `:626`, `:1095-1099`) |
| `Longest wait` and each row's Queue Time colour | SEED | `Unit.waitingMinutes` (`src/data/reset.ts:84`, values `:185-203`) via `:273-276` and `queueTimeTone` (`src/data/reset.ts:169-173`) |
| Category rail rows | SEED | `CATEGORIES`, derived from `UNITS` at module scope (`src/data/reset.ts:209-211`), read at `:624` |
| Queue filter buttons | SEED | `QUEUE_FILTERS` (`src/data/reset.ts:272`), read at `:589` |
| Shared clean checkboxes | SEED | `SHARED_CLEAN_TASKS` (`src/data/reset.ts:92`), read at `:889` |
| Per-unit checklist tasks (both modes) | SEED | `CATEGORY_CLEAN_EXTRA` / `CATEGORY_RESET_EXTRA` via `tasksFor` and `allTasksFor` (`src/data/reset.ts:94-139`), read at `:295`, `:906-907` |
| "QC performed by" dropdown | SEED | `STAFF` = three hardcoded names (`src/data/reset.ts:253`), read at `:1235`; default via `defaultQcBy` (`src/data/reset.ts:256-258`) |
| Damage type / severity dropdowns | SEED | `DAMAGE_TYPES`, `SEVERITIES` (`src/data/reset.ts:274-275`), read at `:977`, `:993` |
| "Routed to …" text under an exception | SEED | `PROBLEM_ROUTE` (`src/data/reset.ts:51-55`), read at `:693`, `:776`, `:1003` |
| Actor name stamped on cleaning/QC records | — | `useAuth().user.name` via `actorName` (`:120-123`, `:201-206`); `null` with no session, and the four handlers refuse (`:334-337`, `:347-350`, `:387-390`, `:1136-1139`) |
| `Complete Reset` write target | DB | `cleaning_queue_entries` — `select` then `safeUpdate` of `reset_completed_at` in `completeResetQueue` (`src/actions/rentals/floorVerb.ts:856-933`, table named at `:864`, `:904`); the booking is resolved first from `bookings` (`floorVerb.ts:290-301`) |
| `Complete Reset` in mock mode | LOCAL | `cleaning_queue_entries` is listed **UNSERVED** in `src/lib/mock/corpus.ts:33-44`, so the local store always returns an empty array for it (`corpus.ts:424`) |

**Invented on this page:** every unit name, serial, category, `Required` flag, storage location, assignee and `waitingMinutes` in `src/data/reset.ts:184-204`; the three staff names in `src/data/reset.ts:253`; every checklist task string in `src/data/reset.ts:92-119`; which units start Cleaning/QC/Ready (`src/data/reset.ts:268-270`); the `09:40 AM` and `09:55 AM` timestamps (`ResetWorkspace.tsx:165-166`); and the client, booking number and package name from `src/data/booking.ts:115,126` and `src/data/packing.ts:75`. The item count 18, the task total 97, every chip count, the category `ready/count` figures, `Longest wait` and all four "Today's Reset Summary" figures are arithmetic over those invented rows.

---

## 4. Actions and writes

### The one dispatch

| | |
|---|---|
| Control | `Complete Reset`, the page's single blue primary (`:1127-1167`) |
| Dispatches | `completeReset({ id, unitIds: [] }, { userId: user.id, role: user.role })` via a dynamic `import('../../actions/rentals/index')` (`:1151-1152`) |
| Action file | `src/actions/rentals/completeReset.ts:37-80` (action name `COMPLETE_RESET`, `:38`) |
| Capability string | `'operations.perform'` (`src/actions/rentals/completeReset.ts:41`) |
| `implemented` | **true** (`src/actions/rentals/completeReset.ts:42`) |
| Mapped in `checkCapability`? | **Yes** — `src/actions/core.ts:138-139` routes it to `rbac.canPerformOperations`, which admits Owner, Admin, Manager, Warehouse, Technician (`src/lib/rbac.ts:291-293`). Coordinator, Accounts, Driver and Client are denied by `ActionPermissionError` (`core.ts:236-241`) |
| What actually happens | The dispatcher order is implemented → context → permission → validate (`core.ts:222-244`). For an allowed role the call reaches `validate`, which is `validateFloorVerb('Reset', …)`; with an empty `unitIds` it throws *"Reset is recorded per item, not per booking (0003:899) … None were supplied, so nothing was written."* (`src/actions/rentals/floorVerb.ts:379-386`). The empty list is deliberate and the component says so at `:1141-1147` |
| Failure handling | `.catch` sets `dispatchError`, rendered by `ErrorBanner` at `:1175`; `setJobCompletedAt('—')` runs only inside `.then` (`:1153-1157`) |
| Net effect today | **No row is ever written from this page.** Even with a correct `unitIds` list, `runFloorVerb` refuses unless `bookings.stage === 'Returned'` (`floorVerb.ts:489-494`), and in mock mode `cleaning_queue_entries` is unserved (`corpus.ts:33-44`) |

### Every other control — React state only, no dispatch

| Control | Handler | What it writes |
|---|---|---|
| Row checkbox / `Select All Visible` / `Clear` / `Clear Selection` | `toggleSelect` `:313-321`, `selectAllVisible` `:322-325`, `clearSelection` `:326` | `selected` Set |
| `Start` (row action, Waiting) | `start` `:328-341` | `lines[uid].queueState = 'Cleaning'`, `actedAt: '—'` |
| Shared clean checkbox (applies to all selected) | `toggleShared` `:344-369` | `lines[*].ticks` |
| Per-unit checklist checkbox | `toggleUnitTask` `:370-383` | `lines[uid].ticks` |
| `Mark Clean & Move to QC` | `markCleanMoveToQc` `:385-403` | `lines[*].queueState = 'QC'` |
| "Any Problems?" quad | `pickProblem` `:406-412` | `problemDraft[uid]` |
| Damage type / description / severity fields | `changeProblemField` `:413-420` | `problemDraft[uid]` |
| `Add Evidence Photo (n)` | `:995-997` → `changeProblemField(..., { evidence: draft.evidence + 1 })` | An integer counter. No file input, no upload, no `evidence_files` write |
| `Record & Remove from Batch` | `confirmProblem` `:421-436` | `lines[uid].problem` + drops the unit from `selected` |
| `Cancel` (problem sub-form) | `cancelProblem` `:437-442` | clears the draft |
| `Undo` (row action on an exception) | `undoProblem` `:443-446` | `lines[uid].problem = 'No Problems'` |
| QC `Pass` | `passQc` `:449-457` | `lines[uid].queueState = 'Ready'`, `qcAt: '—'` |
| QC `Fail` | `failQc` `:458-463` | `lines[uid].queueState = 'Waiting'` + reason |
| `Clean Mode` / `Reset Mode` toggle | `:862-879` | `mode`; display filter only, deliberately left enabled read-only (`:878`) |
| Filter chips / search box | `:582-606` | `filter`, `query` |
| `Back to Booking` | `:1116-1122` | `navigate` only |

**Buttons with no handler:** none — every button on the page has an `onClick`. Two controls are wired but inert as records: the batch **notes textarea** (`:1029-1036`) sets `note`, which is never read again anywhere in the file; and **Add Evidence Photo** (`:995-997`) increments a number that `problemReady` then accepts as satisfied evidence (`:182` in `ResetWorkspace.tsx` calls `draft.evidence > 0`).

---

## 5. Gates

**Which roles reach the route.** Every authenticated role, including `Client`. `Shell` performs exactly two checks before rendering children: it redirects to `/login` when there is no user (`src/App.tsx:973-975`), and it renders `RestrictedState` when the role is money-blind **and** the path is a money surface (`src/App.tsx:993`). `isMoneySurface` matches only `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:148-159`), none of which is `/rentals/…/reset`. There is no role check inside `ResetWorkspace.tsx` — `rbac` is not imported (`:1-35`).

**Money visibility.** `useCanViewMoney` is **not called** on this page and `src/lib/moneyVisibility.ts` is not imported. Neither is `lib/money.ts`. The file's own header states the intent at `:84-87`. So Law 6 hides nothing here — there is no money figure to hide. The Damaged sub-form collects a type, a description, a severity and a photo count and no cost (`:968-1002`), and the note at `:998-1000` says so.

**The write gate that does exist.** `readOnly` is `BOOKING_STATUS[BOOKING.status].order > BOOKING_STATUS[JOBS.Reset.runsAt].order` (`:228`) — the *backward* half of `stepWriteGate` only. With the seeded `BOOKING.status = 'Booked'` (`src/data/booking.ts:124`, order 1) against `Returned` (order 4), `readOnly` evaluates **false**, so every checkbox, row action and save control on the page is enabled even though `resetGate.allowed` is `false` and its reason reads *"Reset opens once this booking reaches Returned — it is currently Booked."* (`src/data/operationsShell.ts:122-124`). That forward half is an explicit `TODO(decision)` at `:221-226`.

**Permission on the one dispatch.** `operations.perform` → Owner, Admin, Manager, Warehouse, Technician (`src/lib/rbac.ts:291-293`). A Coordinator, Accounts user, Driver or Client can open the page, tick every box, and will get an `ActionPermissionError` at `Complete Reset` (`src/actions/core.ts:236-241`) — after the permission-allowed roles get a validation error at the same button.

---

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **None of its own.** The only spinner in the path is the `Suspense` fallback `<LoadingSkeleton type="card" label="Loading…" />` in `Shell` for the lazy chunk (`src/App.tsx:1026`) and the "Restoring session…" hold at `src/App.tsx:964-970`. Data is synchronous constants, so the page never loads anything. | — |
| Error | **Yes, hand-rolled.** `ErrorBanner` from `StateViews` for dispatch failures and missing-session refusals (`:1175`; `src/components/ui/StateViews.tsx:171-210`). Not wrapped in `PageBody`. | `:1175`, `:254`, `:207-209` |
| Empty | **Yes**, via `StateViews.EmptyState` twice — inside the phone card list (`:728-734`) and in a full-width `<td colSpan={8}>` in the table (`:817-827`), both with a "Clear filters" action. The batch panel's own empty case is a plain paragraph, "Select items from the queue to work a batch." (`:839`). | `:728`, `:817`, `:839` |
| Restricted | **None.** `RestrictedState` is not imported by this file. The nearest thing is the hand-rolled read-only banner at `:485-490`, which is not a permission state and — see §5 — never renders with the seeded booking status. | — |

`src/components/ui/PageBody.tsx` is not used by this page. A fifth, non-standard state exists: `BookingNotLoaded` (`:474-476`; `src/modules/operations/BookingNotLoaded.tsx:27-118`) replaces the whole page for any booking number other than `B-715`.

---

## 7. Known gaps

1. **`TODO(decision)` — the forward half of the write gate is not enforced.** `ResetWorkspace.tsx:221-226`. A booking that has not reached `Returned` is left fully writable; whether the floor may pre-stage a reset is unruled.
2. **`Complete Reset` can never succeed.** `ResetWorkspace.tsx:1141-1152` sends `unitIds: []` on purpose, and `validateFloorVerb` throws on an empty list (`src/actions/rentals/floorVerb.ts:379-386`). The action is `implemented: true` and its capability *is* mapped, so this is not a stub or a permission gap — the call site has no true unit ids to send, because the queue on screen comes from `src/data/reset.ts:184-204` and not from `cleaning_queue_entries.unit_id`. The file admits it at `:243-252` ("today none ever is").
3. **The screen claims a booking status the seed contradicts.** The header chip (`:499-507`) and the summary strip's "Booking Status" cell (`:539`) both print `JOBS.Reset.runsAt` = `Returned`, while the booking this page is rendering is `BOOKING.status = 'Booked'` (`src/data/booking.ts:124`) — which is what `BookingDetail` reads from the same constant. Two pages about `B-715`, two different statuses.
4. **`resetGate` is computed and effectively dead.** `:227` computes it; its only consumer is inside `readOnly && …` at `:488`. With the seed, `readOnly` is always `false` (see §5), so the gate's reason string — the one honest sentence about why Reset should not be running — is never shown.
5. **`cleaning_queue_entries` is UNSERVED in mock mode.** `src/lib/mock/corpus.ts:33-44` lists it, and `corpus.ts:424` seeds it as `[]`. Even a corrected `unitIds` list would hit "N unit(s) are not in B-715's reset queue" (`floorVerb.ts:878-885`) under `VITE_DATA_SOURCE=mock` (`src/lib/supabase.ts:42`).
6. **The seed's own self-check is exported for the screen and never rendered.** `src/data/reset.ts:235-248` builds `RESET_SEED_ERROR` and its comment says "the value is exported so the screen can state it"; `ResetWorkspace.tsx:16-33` does not import it. It is `console.error`-only. (It currently reconciles: 97 tasks, 18 units.)
7. **Nothing on this page persists.** Every tick, QC pass, QC fail and problem record writes only `useState` (`:230-238`); a refresh re-runs `buildInitialLines()` (`:155-171`) and discards all of it. The one dispatch that could persist is item 2 above.
8. **The QC self-check rule cannot fire for newly-attributed work.** `passQc` compares `by === rec.actor` (`:454`), where `by` defaults to `defaultQcBy(rec.actor)` picking from the three literals in `src/data/reset.ts:253`, while `rec.actor` for any unit started in-session is the signed-in user's `full_name` (`:206`, `:333`; `src/lib/auth.tsx:162-167`). A real session name is never in `STAFF`, so `defaultQcBy` returns `STAFF[0]`, the `selfCheck` branch is unreachable, and the audited self-QC reason field (`:1237-1246`) never appears for that unit.
9. **Timestamps are placeholders.** `actedAt`/`qcAt` are set to the literal `'—'` at `:339`, `:399` and `:456`, and `jobCompletedAt` is set to `'—'` at `:1153`, which makes the footer read "Reset job completed at —" (`:1124`).
10. **Evidence is a counter, not evidence.** `:995-997` increments an integer; `problemReady` treats `evidence > 0` as the §7.2 requirement satisfied (`:182`). No file is selected, uploaded or linked, and `Unit.evidence` from the seed (`src/data/reset.ts:86`) is never read by the component.
11. **The batch notes textarea is write-only.** `:1029-1036` sets `note` (`:235`); no other line in the file reads it. `floorVerb` has a `notes` field (`floorVerb.ts:145`) but the dispatch at `:1152` does not pass one — and Reset would ignore it anyway, having no session.
12. **The file breaks its own tooltip rule.** `:1064-1065` states the disabled reason must never be a `title` tooltip ("inert on touch and for keyboard users"); `:1126` puts `completeReason` in exactly such a `title` on the `Complete Reset` wrapper. The reason is also rendered inline at `:1170-1172`, so the information is not lost — the tooltip is redundant, not the sole carrier.
13. **Seeded fields that never reach the screen.** `Unit.location` (`src/data/reset.ts:65`, values `A2-01`…`G1-05`) and `Unit.evidence` (`:86`) are carried on all 18 units and rendered nowhere in `ResetWorkspace.tsx`.
14. **Inherited `TODO(decision)`s on the one dispatch path.** `src/actions/rentals/floorVerb.ts:906-910` — the per-entry audit row, and specifically what should happen when `logAuditEvent` fails part-way through a loop whose earlier `safeUpdate`s have already committed — is unruled (§4.36). `floorVerb.ts:78-91` additionally records that the six session gates, `bookings.actual_return_at` and the `Partial Pickup` flag are all unbuilt.
15. **`operationsShell.ts` disagrees with this page about Closed.** `entryStepFor` routes a `Closed` booking to `Reset` "read-only" (`src/data/operationsShell.ts:101`), and `runFloorVerb` refuses any write on a closed booking by name (`floorVerb.ts:486-488`) — but this page's `readOnly` derives from a stage-order compare (`:228`), not from `closed_at`, and its own header comment at `:186-195` describes the Closed case as the behaviour being preserved.
