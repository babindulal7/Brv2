# Handover Workspace
Route `/rentals/:bookingNo/handover` · `src/modules/rentals/HandoverWorkspace.tsx` · 1238 lines

Status: **Seed-only**

## 1. What it is

A floor screen for taking equipment out of the warehouse on booking `B-715`, one session at a time — `data/handover.ts:206` fixes the active session at `S2`, opened against a roster of 18 seeded units (`src/data/handover.ts:106-125`). It draws six session gates, per-case evidence counters and a signature block, and its primary button dispatches `handoverRental`; the dispatch is built with `lines: []` (`HandoverWorkspace.tsx:286`), which `validateFloorVerb` refuses unconditionally (`src/actions/rentals/floorVerb.ts:389-394`). Any booking number other than `B-715` short-circuits to a not-loaded card (`HandoverWorkspace.tsx:478-480`).

## 2. What renders

Top to bottom at desktop:

1. **Header** (`:486-538`) — `Handover Workspace` H1, a static `Equipment Out` chip (`:492-495`), a booking-stage chip computed from local unit state (`:496-498`), a conditional `Partial Pickup` chip carrying `FLAGS['Partial Pickup'].effect` as its `title` (`:499-503`), a breadcrumb line (`:505-512`), a progress bar with `picked / TOTAL (pct)` (`:515-530`), and a `View Booking` link (`:532-537`).
2. **Booking strip** (`:541-562`) — nine cells: Client, Payment (`Cleared`/`Due`, never an amount, `:545`), Pickup, Return, Stage, Project, Days, Items, Delivery.
3. **Client & Receiver card** (`:566-579`) — five `InfoRow`s plus two verification checkboxes (`:576-577`).
4. **Delivery / Pickup Details card** (`:581-596`) — method chip, then only the fields `DELIVERY_FIELDS['Customer Pickup']` marks true (`:587-589`), then a note box (`:592-595`).
5. **Two-column split** (`:602-609`), main column first:
   - **Equipment card** (`:613-818`) — header actions `Hand Over Selected (n)` / `Select All Remaining` / `Bulk Scan` / `Scan Barcode` (`:618-621`); a search input and four filter chips with counts (`:625-659`); a 9-column table (`:724-816`).
   - **Session Gates card** (`:821-940`) — the six gates (`:823-841`), a **Booking Condition** information block (`:844-853`), a **Manager Override** block that renders only while a gate 1/3/4 is failing (`:857-905`), an **Evidence** list per case (`:907-929`), and a **Signatures** block of Receiver / Warehouse Staff / (Driver, conditional) / Witness (`:931-939`).
6. **Right rail** via `FloorAside` (`:944-1082`) — Handover Summary with an SVG ring (`:946-977`), Sessions (`:979-1000`), Missing Items (`:1002-1026`), Documents (`:1029-1037`), Timeline newest-first (`:1039-1050`), Quick Actions (`:1052-1066`), an `ErrorBanner` when a dispatch failed (`:1070`), and a scan log capped at 5 lines (`:1072-1081`).
7. **Footer bar** (`:1086-1118`) — `Cancel Handover`, the text `Saving is automatic` (`:1094`), and the single filled primary button (`:1096-1116`).
8. **Below the footer** (`:1120-1123`) — the blocking-gate line and the caption; **`BarcodeScannerModal`** (`:1125-1139`).

**Responsive bands actually read.** The file reads **both** locked breakpoints, through `useViewport()` (`:137`), which is defined over `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`). It derives `desktop` (≥1180) at `:138` and `phone` (<768) at `:139`.

- **≥1180** — grid is `minmax(0,1fr) auto` (`:605`); `FloorAside collapsible={desktop}` renders the rail as a collapsible `Rail` (`src/modules/operations/FloorAside.tsx:40-49`).
- **768–1179** — grid collapses to `'1fr'` (`:605`) and `FloorAside` renders its children as a plain column beneath the main column (`FloorAside.tsx:50-52`). The equipment table stays a table with `minWidth: 860` inside an `overflowX: 'auto'` wrapper (`:724-725`), so it scrolls sideways in this band.
- **<768** — the table is replaced by one `<article>` card per unit with 22px checkboxes and a 44px-min row (`:662-722`); Quick Actions becomes 2 columns instead of 3 (`:1054`).

Not decided by this file: the floor type scale. `App.tsx:902` lists `/handover` in `FLOOR_ROUTE_SUFFIXES` and `App.tsx:1010` stamps `data-floor` on `<main>`.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Equipment rows (18 units, name / group / case / serial / required / state / session / handoverAt) | SEED | `src/data/handover.ts:106-125` `UNITS`, copied into `useState` at `HandoverWorkspace.tsx:141-143` |
| Total items, filter-chip counts, case list | SEED | `handover.ts:127` `TOTAL_ITEMS`, `:144` `CASES`, `:155` `FILTERS` |
| Sessions S1/S2 — state, receiver, warehouse staff, started/closed, existing signatures, evidence count | SEED | `handover.ts:177-203` `SESSIONS`; active session pinned to `S2` by `handover.ts:206` |
| Client & Receiver card (Authorized By, Receiver, Phone, Email, Government ID) | SEED | `handover.ts:247-253` `RECEIVER` |
| Delivery card (method, pickup person, phone, warehouse staff, note) and which fields render | SEED | `handover.ts:226-231` `DELIVERY_FIELDS`, `:238-245` `DELIVERY`; driver-signature rule `:234-236` |
| Documents (Rental Agreement / Packing List / Delivery Note) | SEED | `handover.ts:266-270` `DOCUMENTS` |
| Timeline (5 events) | SEED | `handover.ts:292-298` `TIMELINE`, rendered reversed at `HandoverWorkspace.tsx:1040` |
| Evidence threshold (1 photo per case) | SEED | `handover.ts:338` `EVIDENCE_MIN_PHOTOS_PER_CASE` |
| `Partial Pickup` chip tooltip text | SEED | `handover.ts:275` reading `FLAGS` in `src/lib/workflow.ts:213` |
| Booking strip — Client, Project, Days | SEED | `src/data/booking.ts:114-135` `BOOKING` |
| Booking strip — Pickup / Return dates | SEED | hardcoded `new Date('2026-07-16')` / `('2026-07-19')` in the component, `HandoverWorkspace.tsx:461-462` and `:546-547` |
| Breadcrumb package name | SEED | `src/data/packing.ts:75` `PACKAGE.name` |
| Booking stage chip, Partial Pickup flag, progress %, gate 2, gate 6, summary counts | — | derived in-component from the seeded units (`:186-230`), not from any source |
| Payment / Deposit gate state and the strip's `Payment` cell | — | local `useState` booleans set by checkbox and by `Mark Cleared →` (`:153-154`, `:197`, `:405-406`) |
| Evidence photo counts | — | local `useState`, every case initialised to `0` (`:149`), incremented by a button (`:921`) |
| Captured signatures | — | local `useState`, name read off `RECEIVER` / `active.warehouseStaff` / `DELIVERY.pickupPerson` (`:339-349`) |
| Quick Actions labels | SEED | literal `['Print', 'Share', 'More']` in the component (`:1055`) |
| Handover write target (`operation_sessions`, `handover_lines`, `session_line_movements`) | DB (unreached) | `src/actions/rentals/floorVerb.ts:540-586`; never executed from this page — `validate` throws first (see §4). In mock mode `operation_sessions` is listed UNSERVED (`src/lib/mock/corpus.ts:36`) and `handover_lines` / `session_line_movements` are not keys of the mock store at all (`corpus.ts:405-423`) |

No LOCAL (corpus-served) row reaches this page. Nothing on it comes from a query file.

**Invented on this page:** every figure and name shown — the 18 unit rows and their serials, the 10/8 session split and their `06:0x AM` handover times, the two session records with their staff names and closed-at times, the receiver's name, phone, email and government-ID number `27-01-74-12345`, the delivery pickup person, the three-row document list, the five timeline events, the 16/19 Jul 2026 pickup and return dates, the client name, project kind and day count, and the `1` photo-per-case evidence threshold.

## 4. Actions and writes

**The one dispatch on this page**, `dispatchHandover` (`HandoverWorkspace.tsx:275-290`):

| Field | Value |
|---|---|
| Action | `handoverRental`, `src/actions/rentals/handoverRental.ts:42` |
| Capability string | `operations.perform` (`handoverRental.ts:46`) |
| `implemented` | `true` (`handoverRental.ts:47`) |
| Mapped in `checkCapability`? | **Yes** — `src/actions/core.ts:138-139`, resolving to `rbac.canPerformOperations` (`src/lib/rbac.ts:291-293`) |
| Input sent | `{ bookingId: id, lines: [], occurredAt? }` (`HandoverWorkspace.tsx:286`) |
| Outcome | **Always rejects.** `validateFloorVerb` throws on an empty `lines` list — `src/actions/rentals/floorVerb.ts:389-394`. `createAction` runs `validate` at step 4, before `execute` (`core.ts:244-247`), so no Supabase call is made. |

Guard before the dispatch: if `useAuth()` has no `user`, `dispatchHandover` returns a rejected promise instead of calling the action (`:276-282`).

Controls that reach that dispatch:

| Control | Path | Notes |
|---|---|---|
| `Hand Over` row button (table `:773`, phone card `:710`) | `handOver` `:234-254` | one dispatch per unit; the unit flip and the `✓` log line are inside `.then` (`:244-247`), the `✕` line and `ErrorBanner` inside `.catch` (`:248-253`) |
| `Hand Over Selected (n)` `:618` | `handOverMany` `:292-295` → `handOver` per id | **one dispatch per selected unit**, not one for the batch |
| `Bulk Scan` `:620` | `handOverMany(remaining)` | fires a dispatch for every remaining unit |
| `BarcodeScannerModal` `onItemScanned` `:1136-1138` | `handOverMany([item.id])` | |
| `Complete Session` / `Complete Handover` `:1096-1116` | `completeSession` `:444-459` | dispatches with `occurredAt = new Date().toISOString()`; the session flip and `navigate` are inside `.then` (`:448-454`) |

Controls that dispatch **nothing** and mutate local React state only:

| Control | Line | Effect |
|---|---|---|
| `Missing` row button | `:711`, `:799` → `markMissing` `:297-301` | sets `state: 'Missing'` in component state |
| `Undo` row button / Missing-Items `Undo` | `:712`, `:800`, `:1019` → `undo` `:303-310` | resets to `Ready` in component state |
| Missing-reason text input | `:1010-1016` → `setReason` `:312` | |
| `Government ID Verified` / `Booking Authorization Verified` | `:576-577` | flips gate 1 |
| `Mark Cleared →` on gates 3 and 4 | `:405-406`, rendered `:830-834` | flips `paymentVerified` / `depositReceived`; nothing records who cleared them |
| `Take Photo` | `:921` | increments an integer; no file, no upload, no `evidence_files` write |
| `Capture` on Receiver / Warehouse / Driver | `:934-936` → `captureSignature` `:339-349` | writes a `{name, role, at}` object into component state with the hardcoded timestamp `'16 Jul 2026, 02:20 PM'` (`:346`) |
| `Select All Remaining` | `:619` | selection only |
| Filter chips, search box | `:626-658` | filtering only |
| `Cancel Handover` | `:1087-1093` | `navigate` away; records nothing |

Disabled controls with no handler at all:

- `Apply Override` — `disabled`, no `onClick`, wrapped in `Unavailable` with `OVERRIDE_UNAVAILABLE` (`:882-902`; reason string at `:391-392`). The reason field above it (`:870-877`) is typed into state (`:162`) and read by nothing.
- Witness `Capture` — `disabled`, no handler, wrapped in `Unavailable` with `WITNESS_UNAVAILABLE` (`:938` → `SigRow` `:1184-1189`; reason at `:99-100`).

Buttons / affordances with **no handler**:

- `Print`, `Share`, `More` in Quick Actions — `<button type="button">` with no `onClick` (`:1055-1064`).
- The download icon beside a `Generated` document — a bare `<Icon>`, not a button (`:1034`).
- The `more_vert` icon in each table row's action cell — a bare `<Icon>` (`:801`).

Side effect not routed through the dispatcher: `BarcodeScannerModal` emits `EVENT_TYPES.INVENTORY_CHECKED_OUT` on the event bus on every successful scan match (`src/components/ui/BarcodeScannerModal.tsx:146-158`), before calling `onItemScanned` — so the event is emitted even though the handover dispatch it triggers then fails.

## 5. Gates

**Route reachability.** `/rentals/:bookingNo/handover` is mounted at `src/App.tsx:197-207` inside `BookingShell`. The Shell requires a resolved session and redirects to `/login` when `user` is null (`App.tsx:964-975`). Its only role gate is `!canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`), and `MONEY_ROUTES` is `['/finance','/reports','/admin','/tools/pricing','/tools/depreciation']` (`src/data/nav.ts:147-153`) — `/rentals/...` is not among them. **Every signed-in role reaches this route,** Client included.

**Action-level role gate.** The dispatch requires `operations.perform` → `canPerformOperations` → Owner, Admin, Manager, Warehouse, Technician (`src/lib/rbac.ts:291-293`). Coordinator, Accounts, Driver and Client fail at `core.ts:236-241` with `ActionPermissionError`; the five permitted roles get past that and then fail at `validate` (see §4). The outcome is a failure either way, with different text.

**Money visibility.** `useCanViewMoney` is **not imported** by this file, and neither is `lib/money`. Nothing on the page is gated on it because nothing on the page is a money value. The `Payment` cell in the booking strip renders the string `Cleared` / `Due` (`:545`, computed at `:197`); gates 3 and 4 read `Payment required` / `Deposit required` with no amount (`:405-406`).

**What is absent under Law 6.** `src/data/handover.ts` models no Paisa value anywhere, and `DOCUMENTS` (`handover.ts:266-270`) contains no Invoice and no Receipt — three rows only. `BOOKING` is imported whole (`:16`) and carries `outstanding` and `depositPending` (`src/data/booking.ts:133-134`), but this page reads only `.no`, `.client`, `.kind` and `.days`. So the money is not masked here; it is never rendered.

## 6. States drawn

`PageBody` is not imported. All four are hand-rolled or absent:

- **Loading — none in this file.** No fetch happens on this page, so there is nothing to wait on. The only loading UI in the path is the Shell's Suspense fallback for the lazy chunk (`App.tsx:1026`) and its `Restoring session…` hold (`App.tsx:964-970`).
- **Error — hand-rolled, using the shared `ErrorBanner`** from `src/components/ui/StateViews.tsx:171` at `HandoverWorkspace.tsx:1070`, rendered inline in the rail and persistent, driven by `dispatchError` state (`:181`). A second inline `role="alert"` paragraph carries the override refusal (`:862-864`).
- **Empty — hand-rolled, three of them,** none using `EmptyState`: `No items match these filters.` in the phone list (`:717-721`) and in the table (`:807-813`), `No missing items.` (`:1004`), `Nothing left to load in this session.` (`:911`).
- **Restricted — none in this file.** The only `RestrictedState` in the path is App-level and applies to money surfaces only (`App.tsx:1020-1022`).

A fifth state exists that is none of the four: `BookingNotLoaded` (`:478-480`, component at `src/modules/operations/BookingNotLoaded.tsx:27`), shown for any booking number other than `B-715`.

## 7. Known gaps

1. **Every write from this page fails.** `dispatchHandover` sends `lines: []` (`HandoverWorkspace.tsx:286`) and `validateFloorVerb` refuses an empty list (`src/actions/rentals/floorVerb.ts:389-394`). The component's own comment states the reason: this workspace's unit ids come from `data/handover`'s hardcoded `UNITS`, not from `booking_lines` / `product_units` (`:266-274`). So `Hand Over`, `Bulk Scan`, the scanner, and `Complete Session` all end in the `ErrorBanner`.
2. **`Saving is automatic` is false** (`:1094`). No autosave exists; every checkbox, photo counter, signature and missing-reason lives in `useState` only (`:141-181`) and is lost on reload.
3. **The completion gates can be satisfied entirely with local state.** Gate 1 by two checkboxes (`:576-577`), gates 3 and 4 by `Mark Cleared →` (`:405-406`), gate 5 by `Capture` (`:339-349`), gate 6 by an integer counter (`:921`). Nothing records who cleared, signed, or photographed — the same class of defect the file's own header refuses the Manager override for (`:351-392`).
4. **`TODO(decision)` — who may override a session gate.** In the file header (`:88-90`) and again above `OVERRIDE_UNAVAILABLE` (`:369-385`): no rbac predicate, no `session.override` capability in `core.ts`, no action to persist it. `checkCapability` has no such case (`core.ts:128-217`), so it would deny every role today.
5. **`TODO(decision)` — evidence granularity.** `src/data/handover.ts:324-338`: "one photo of loaded cases proposed", implemented as `EVIDENCE_MIN_PHOTOS_PER_CASE = 1` and labelled on screen as "Proposed, not yet ruled" (`:927`).
6. **`HANDOVER_SEED_ERROR` is exported so a screen can state it and no screen does.** `src/data/handover.ts:311-322` says "The failure is exported so the screen can state it"; the only consumer anywhere in `src/` is the `console.error` on the line below it. `HandoverWorkspace.tsx` does not import it (`:18-35`).
7. **Signature timestamp is a literal.** `captureSignature` stamps `'16 Jul 2026, 02:20 PM'` on every capture (`:346`) — the same defect the file corrected for `closedAt` (`:440-442`, now `formatAdDateTime(occurredAt)` at `:451`). `handOver` likewise stamps `handoverAt: '02:15 PM'` (`:245`).
8. **Bulk paths fan out into N dispatches.** `handOverMany` calls `handOver` per id (`:292-295`); `Bulk Scan` on 8 remaining units issues 8 separate `handoverRental` calls. The comment at `:256-264` records that this replaced a worse 5-for-4 pattern, but one-per-unit is still not one session write.
9. **Three dead buttons and two dead icons.** `Print` / `Share` / `More` have no `onClick` (`:1055-1064`); the document download icon (`:1034`) and the row `more_vert` icon (`:801`) are non-interactive `<Icon>`s presented as affordances.
10. **The override reason field is write-only.** `overrideReason` is set (`:872`) and read nowhere — its own comment says so (`:155-161`).
11. **Scanner emits a domain event for a handover that did not happen.** `BarcodeScannerModal.tsx:153-158` emits `INVENTORY_CHECKED_OUT` and shows `Successfully handed over: …` (`:130-138` of that file) before `onItemScanned` triggers the dispatch that fails — so the modal asserts success while the page's scan log records `✕ … NOT handed over`.
12. **Undo does not reverse a write.** `undo` (`:303-310`) clears `state`/`sessionId`/`handoverAt` locally; if the dispatch had succeeded there is no compensating action anywhere under `src/actions/rentals/`.
13. **Only one booking has data.** `:478-480` renders `BookingNotLoaded` for anything but `BOOKING.no`; `BookingNotLoaded.tsx:8-21` records that the Floor queue on `/operations` navigates here with real booking numbers, all of which land on this state.
14. **`Delivery Note` never generates.** `handover.ts:259-270` says it "generates only on the final session close"; nothing in `completeSession` (`:444-459`) or `floorVerb.ts` writes a document row, so the row stays `Not Generated` permanently.
15. **Contradiction with `floorVerb.ts` on the Partial Pickup flag.** This page renders a `Partial Pickup` chip whenever items remain (`:196`, `:499-503`), while the write path records that flag storage does not exist — `booking_flags`' CHECK admits four values and that is not one of them (`floorVerb.ts:88-91`, `TODO(decision)`). The chip is a screen-local computation, not a stored flag.
16. **Contradiction with `workflow.ts` on sessions.** `floorVerb.ts:185-197` marks `workflow.ts:90`'s "Pack and Reset are not session-based" as wrong against the schema and carries a `TODO(decision)` to narrow the wording. This page's `Sessions created: 2` line (`:998-999`) is a hardcoded string, not derived from the two seeded sessions.
17. **`Equipment Out` chip is unconditional** (`:492-495`) — it renders identically whether nothing, some, or all of the booking has left.
18. **`FloorAside`'s own placement helper is unused here.** `floorPlacements` (`src/modules/operations/FloorAside.tsx:82-90`) encodes the tablet/phone grid rows for these workspaces; this file lays out its grid inline instead (`:602-609`), so the rail-before-tree ordering that helper documents is not applied on this page.
