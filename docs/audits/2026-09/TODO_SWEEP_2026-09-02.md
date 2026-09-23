> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement from September 2026. Its findings, blockers, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../../CLAUDE.md)

---

# TODO Sweep — 2 Sep 2026 (whole app, driven on the mock build)

Tick items here as they land. Companion to `FUNCTIONAL_BUGS.md` (bugs) and `PLAN.md §4`
(rulings). This file lists **work**, not rulings — anything that needs Babin's word is
pointed at its §4 entry rather than restated.

## Gates as found → as left

| Gate | Found | Left |
|---|---|---|
| `npx tsc --noEmit` | ❌ 1 error — `NewRental.tsx:28` imports `PARENTS`, unused since the catalogue moved to `booking/itemCatalogue.ts` (uncommitted work from another session) | ✅ exit 0 — import trimmed to `INV_STYLE` |
| `npx vitest run` | ✅ 101 files / **2341 tests** pass (387 s) | ✅ re-run after A2–A10: 101 / 2341 (698 s — three gates sharing one CPU) |
| `npm run check:contrast` | ✅ 40/40 | unchanged |
| `vite build --mode mock` | ✅ exit 0 · 203 assets · JS 3,082 KB total (largest chunks: `vendor-scanner` 443 KB, `main` 309 KB, `vendor-react` 175 KB, `NewRental` 156 KB) · fonts 741 KB · CSS 86 KB | unchanged |
| ESLint | ❌ **cannot run** — see A2 | ✅ `npm run lint` (`--max-warnings 0`) exit 0 · **0 errors / 0 warnings** after A13 (was 0 / 55) |
| Runtime sweep, 63 routes on `:5174` (mock, Owner) | 0 console errors · 0 uncaught throws · 0 `[Icon:` artifacts · 0 error-boundary text · `/no-such-route` → "Page not found" | — |

Sweep method: `history.pushState` + `popstate`, then wait until `main.innerText` is stable
for two ticks. React keeps the *previous* screen visible during a lazy-chunk transition, so
a fixed 450 ms wait reports the Dashboard for every route — the first pass did exactly that
and was discarded. Detail routes were also cold-loaded: an unauthenticated deep link goes
to `/login`, and `Login.tsx:80` carries `state.from`, so the path is kept.

## Working tree at sweep time

Uncommitted, **not mine** (another session, last write 22:15):
`src/modules/rentals/NewRental.tsx` (+31/−84), `booking/AddItemPanel.tsx` (+12),
`booking/itemCatalogue.ts` (+95). The only line I changed is the import at `NewRental.tsx:28`.

**Later the same night (23:04–23:10)** that session wrote a second, wider pass — ~30 files
adding `captureError(...)` calls (`Icon.tsx`, `auth.tsx`, `eventBus.ts`, `offlineQueue.ts`,
`data/cases.ts`, …). It shares the working tree with the A2–A10 fixes below; `git status`
lists both. The gates in the table were run over the combined tree.

## TODO inventory (`src/`, excluding tests and `archive/`)

| Marker | Count | Notes |
|---|---|---|
| `TODO(decision)` | **263** in 103 files | top: `lib/bookingQuery.ts` 13 · `booqable/map/products.ts` 11 · `map/stock.ts` 9 · `map/orders.ts` 9 · `Finance.tsx` 8 · `data/settings.ts` 8 · `actions/rentals/floorVerb.ts` 8 |
| `TODO(persistence)` | 11 (2 marked CLOSED in place → **9 live**) | listed under B2 |
| `TODO(refactor)` | 5 | A11 |
| `TODO(migration)` | 1 | A12 |
| bare `TODO` | 9 | all prose references to a tagged TODO elsewhere, except `AddClientModal.tsx:671` (B3) |
| `FIXME` / `HACK` | 0 | — |
| `supabase/` + edge functions | ~50 `TODO(decision)` | schema rulings; none are code work |

---

## A. Mechanical — no ruling needed

- [x] **A1** `tsc` red: unused `PARENTS` import — fixed this session (`NewRental.tsx:28`).
- [x] **A2** ESLint is dead. `eslint.config.js` is a stringified object with every quote lost
      (`require(@eslint/js)`, `no-undef: error`) → `SyntaxError` on load; it is also CJS
      (`module.exports`) in a `"type": "module"` package; `@eslint/js` is not installed; there
      is no `"lint"` script.
      → **Done 2 Sep (late):** real ESM flat config (`@eslint/js` recommended +
      `typescript-eslint` recommended, `globals`; `no-undef`/unused-vars left to `tsc`;
      `dist`, `coverage`, `src/archive`, `supabase`, `scripts` ignored), the four packages
      installed as devDependencies, `npm run lint` = `eslint src`. Baseline in the Gates table.
- [x] **A3** **22** action files (BUG-013 counted 9) have no `implemented` flag, **0**
      `supabase`/`.from(`/`.rpc(` references, one `console.log`, and return `success: true`.
      `core.ts` refuses a missing flag at dispatch, so nothing writes — but each still emits
      real domain events, and they autocomplete like the real ones. Four are already imported
      by a screen (`createSubRental`, `extendRental`, `refundPayment`, `bookCrew`).
      → **Done:** all **21** `createAction` stubs now carry an explicit `implemented: false`
      with a NOT BUILT block naming why (`cases/resolveCase` · `clients/mergeClients` ·
      `crew/bookCrew` · `documents/createDocument` · `inspections/{start,pass,fail}Inspection` ·
      `inventory/{packEquipment,readyForPickup,reconcileStockCheck,reserveEquipment}` ·
      `maintenance/{createMaintenanceJob,completeMaintenance}` · `payments/refundPayment` ·
      `rentals/{cancelRental,completePickup,extendRental,reviewEvidence,saveDraft,startReturn}` ·
      `subrentals/createSubRental`). The 22nd, `rentals/floorVerb.ts`, is not a `createAction`
      at all — it exports `runFloorVerb()` with 13 real writes — so the flag does not apply;
      the earlier note was wrong.
- [x] **A4** 33 `console.log` calls in non-test `src/`: 31 are the stubs above; the other two
      are in `events/auditLogger.ts`.
      → **Done:** `startAuditLogging()` is a console mirror of the event bus, not the audit
      trail (that is `lib/queries/audit.ts` → `audit_events`); `main.tsx` now calls it only
      under `import.meta.env.DEV`. The stub logs stay in bodies that A3 makes unreachable.
- [x] **A5** `/inventory/cases/:id` ignores `:id`. `App.tsx:396` routes it to `<CasesWorkspace/>`,
      which has no `useParams`; driven `/inventory/cases/CASE-2026-0041` renders the list
      (3,584 chars, identical to `/inventory/cases`).
      → **Done (interim):** the route now reads `:id`, narrows the queue to that one case,
      says so in a card with **Show all cases**, and a chip/search interaction leaves the
      single-case view for the queue. Unknown id → "No case matches …". Driven: 1 row, notice
      present. The per-case *workspace* is still unbuilt — that is **B5**, not this item. Also
      fixed in passing: `filteredCases` omitted `casesList` from its deps, so a case logged via
      the domain event did not appear until a chip was flicked.
- [x] **A6** Top bar breaks in the tablet band (768–1279 per `lib/device.ts`, v4.1 §7.7).
      At 831 px the `Header.tsx` search box wraps its placeholder onto four lines and the
      `Kathmandu HQ` chip is overlapped by the bell.
      → **Done:** search button `minWidth: 0` + ellipsised placeholder span; on `tablet` the
      `⌘K` kbd chip, the clock, and the name/role text (avatar stays) fold away. Measured after:
      831 px → strip 344/344, 768 px → 236/236, no overflow, search one line, header 65 px.
- [x] **A7** Screens with no `<h1>`: `/inventory/cases` (`CasesWorkspace.tsx`),
      `/operations/sub-rental` (`SubRental.tsx`), `/rentals/:no/evidence` gate card.
      → **Done:** `PageHeader` ("Cases", "Sub Rental") on the first two; `BookingNotLoaded`'s
      title is an `<h1>` because the card *is* the page when it renders.
- [x] **A8** A fresh `/rentals/new` draft — no client, 0 items — already reads
      **Rental Total Rs 1,54,482 · Outstanding Rs 1,39,482** from fixture constants in
      `NewRental.tsx` (three roster crew, advance 15,000, deposits 50,000/25,000, discount 7%).
      → **Done:** crew `[]`, advance 0, both deposit figures 0 (their derivation is the open
      `deposit_required` TODO(decision) in `0002_bookings.sql`), discount 0. Driven: "3 rental
      days · 0 items · 0 crew", every money row Rs 0, Discount (0%).
- [x] **A9** Stray zero-byte files from PowerShell redirect accidents.
      → **Done:** all eleven deleted (repo root `(w[0]`, `isoDay(new`, `new`; workspace root
      `10%`, `ListFilters`, `[e.unitId`, `first`, `n`, `new`, `project(c`, `r.status`).
- [x] **A10** `babin-rentals-os/.claude/launch.json` declared `babin-mock` on 5199 while the
      harness reads the workspace-root file.
      → **Done:** inner file now declares the same two names as the root
      (`babin-rentals-os` 5173, `babin-rentals-os-mock` 5174), without `--prefix`.
- [ ] **A11** `TODO(refactor)` ×5: hoist `liveBlockFlagId()` (`blockClient.ts:155`) and
      `invoiceTargetByNo()` (`recordPayment.ts:188`) into `queries/`; add `client_flags` to
      `types/database.ts` (`blockClient.ts:274`); correct the `clients` entry there
      (`createClient.ts:400`); shared `queries/dayBounds.ts` (`queries/finance.ts:1469`).
- [ ] **A12** `TODO(migration)` — `data/clients.ts:85`: retire the `CLIENTS_DATA` export once
      its five readers point at `queries/clients.ts`.
- [x] **A13** Lint burn-down — the 55 warnings `npm run lint` reported (0 errors). Three
      buckets; the middle one is the interesting one, because the repo had never run
      `react-hooks/exhaustive-deps` before and it found real gaps.
      → **Done 3 Sep (morning): 0 errors / 0 warnings.** `npm run lint` is now
      `eslint src --max-warnings 0` and `no-explicit-any` is back to an error.
      - **The 15 hooks sites, judged one by one.** Seven (`Finance`, `Inventory`, `StockCheck`,
        `RentalsList`, `Today`, `Expenses` ×2) were lint-correctness, not stale closures:
        `useList` memoises `refetch`, so `[list.refetch]` was the right dependency and the
        rule only objected to method-call syntax — each now destructures the function. The
        other eight were real: `ScannerFab`'s decode callback closed over a stale `context`
        (now a latest-ref); `FilterDrawer` ignored `reducedMotion` changes; `Calendar` missed
        `setViewChoice`; `Maintenance`'s filter, like Cases before it, omitted its own list;
        `NewRental`'s load effect missed `canBookingMoney`; `CreateInvoiceModal` used a memo
        as a cache key (now state + effect); `ClientsDirectory` rebuilt `overlays` every
        render and so re-sorted the directory on every keystroke; `AddEquipmentContext` fed
        a per-render `errors` object to a memo (now six primitives).
      - **36 `any`s → real types.** Event payloads are typed at the subscriber
        (`useDomainEvent<T>`), the bus default is `unknown`, action events carry `unknown`;
        `catch (err: any)` ×3 narrow with `instanceof Error`; four `<select>` casts name
        their union; `Table<T extends Record<string, unknown>>`; the untyped-table casts in
        `dataAccess`/`offlineQueue`/`syncEngine` were unnecessary (the client carries no
        `Database` generic) and `syncEngine`'s rows are declared as `RemoteProduct`/
        `RemoteClient` with a `withoutUndefined` helper so optional Dexie fields are absent,
        never `undefined`; `lib/audioContext.ts` names the `webkitAudioContext` shape once.
        **One of the casts hid a bug:** `(codeReader.current as any)?.reset()` in
        `ScannerFab` — `@zxing/browser` 0.2 has no `reset()`, so it was a silent no-op and
        the camera stream never stopped when the panel closed. It now keeps the
        `IScannerControls` from `decodeFromVideoDevice`, calls `stop()`, and releases streams.
      - **4 stale `eslint-disable` directives removed** (`no-console` is not enabled; if it
        should be, that is a one-line config change and ~12 `console.log`s to face).
      Pre-fix detail, kept for the record:
      - **15 × `exhaustive-deps`** — `useCallback`/`useMemo` missing a dependency they read:
        `Finance.tsx:653` (`list`, `outstanding`, `overdue`, `received`), `Inventory.tsx:1346`,
        `StockCheck.tsx:240`, `RentalsList.tsx:987`, `Today.tsx:630`, `Expenses.tsx:821,844`,
        `Maintenance.tsx:622`, `NewRental.tsx:1159` (`canBookingMoney`), `Calendar.tsx:1539`,
        `ScannerFab.tsx:128`, `FilterDrawer.tsx:160`, `CreateInvoiceModal.tsx:194`
        (unnecessary dep), `ClientsDirectory.tsx:492` and `AddEquipmentContext.tsx:288` (an
        object/conditional recreated every render feeds a memo). Each needs a look, not a
        blanket `// eslint-disable` — a stale closure over `list` is a wrong KPI.
      - **36 × `no-explicit-any`** (set to `warn` so the gate is enforceable today).
      - **4 unused `eslint-disable` directives** — `Unavailable.tsx:102`, `mock/client.ts:103,561`,
        `mock/engine.ts:92` — delete them, or turn `no-console` on if that was the intent.
      Suggested gate once the 15 are handled: `eslint src --max-warnings 40`.

## B. Blocked on a ruling or on schema — do not start without one

- [ ] **B1** `PLAN.md §4` still carries **17 OPEN** entries: §4.42 ×3 (money: DB rounds to
      paisa and hardcodes 13 % VAT vs app rounds to rupees and reads a setting — BUG-011/012),
      §4.40 ×2, §4.38(b), §4.37 ×5, §4.36, §4.35, §4.35a ×2, §4.33 ×3, §4.32 ×3, §4.29 ×2 —
      plus §4.41(a) (BUG-005, the two report files).
- [ ] **B2** `TODO(persistence)` ×9 live, all needing a view/RPC/policy on the database side:
      `product_unit_counts` view (`data/inventory.ts:424,1132`, `queries/inventory.ts:135,1107`) ·
      `payments_with_reversal_v` (`queries/finance.ts:681`) · staff-directory read policy
      (`queries/finance.ts:723`) · server-side aggregate for Finance (`Finance.tsx:350`) ·
      single-invoice read by `invoice_no` (`Payments.tsx:78,419`).
- [ ] **B3** `AddClientModal.tsx:671` — a landed create sets `record.id` from the uuid while
      every other `ClientRecord.id` is the client **code**; unreachable today (`client.create`
      is denied at dispatch) and will mis-key the booking the day it is wired. Needs the
      §4.20 `client_code` ruling first.
- [ ] **B4** Six unchecked boxes in `PLAN.md`: canonical six statuses (305), biometric unlock
      (508), conflict UI (558), install flows (583), Capacitor (584), Tauri (595).
- [ ] **B5** The per-case workspace. `CASE_WORKSPACE_ROUTE` (`data/cases.ts`, §10) says the
      route "has no field list yet" and the §12 checklist item stays open until it does. A5
      made the URL honest (queue narrowed to the case); building the case screen needs the
      field list from the Cases spec first.

## Not findings — recorded so they are not re-reported

- `/rentals/B-902/{packing,handover,reset,return}` render a one-button gate card ("B-902 is
  Closed. Closed is final") — correct stage gating, not a dead screen.
- `/rentals/B-902/evidence` says "no per-booking query behind it yet" — honest, and already
  filed.
- `/clients/C-1`, `/inventory/FX6-0125` → "not found" cards: the seed ids are not in the
  mock corpus; the routes and their empty states work.
- 294+ `disabled` + `title` controls — the documented unavailable-with-reason pattern.
