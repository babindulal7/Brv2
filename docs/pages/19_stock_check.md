# Stock Check

Route `/inventory/stock-check` · `src/modules/inventory/StockCheck.tsx` · 795 lines

Mounted at `src/App.tsx:297-304` inside `Shell`, with `crumbs=[{label:'Inventory'},{label:'Stock Check'}]` and the header search placeholder `"Scan or search equipment, serial…"` (`src/App.tsx:300`). Lazy-loaded at `src/App.tsx:54`. `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), the `authLoading` hold (`:964-970`), sidebar/bottom bar, `MockBanner`, `OfflineBanner`, the money-surface guard (`:993`) and the `ScannerFab` (`:1034`).

The same component is also rendered as the `?tab=stock-check` pane of `/inventory` — `src/modules/inventory/Inventory.tsx:21` imports it and `:1492` renders `<StockCheck embedded />`; the slug is `src/data/inventory.ts:214`. `embedded` only suppresses the `PageHeader` (`src/modules/inventory/StockCheck.tsx:614`) and the input's `autoFocus` (`:259`).

**Status: Seed-only.**

---

## 1. What it is

A single-session physical-count screen whose entire dataset is one hardcoded element of a constant array: `SAMPLE_STOCK_CHECKS[0]!` is copied into `useState` at `src/modules/inventory/StockCheck.tsx:53`, from `src/data/stockCheck.ts:121-152`. There is no session picker, no route param and no query import — the file imports nothing from `src/lib/queries/` and nothing from `src/lib/mock/` (import block `:1-13`).

Scanning, filtering, and `[Confirm missing]` all mutate React state only (`:120-125`, `:190-195`). The one dispatch on the page, `reconcileStockCheck` (`:176-184`), targets an action that never sets `implemented`, so `src/actions/core.ts:223-225` throws before anything runs.

The live schema does carry `stock_audits` and `stock_audit_items` (`src/types/supabase.ts:8710`, `:8633`), but nothing in `src/lib/queries/` or `src/lib/dataAccess.ts` references either name, and neither is in the mock store or its `UNSERVED` list (`src/lib/mock/corpus.ts:33-44`, `:405-426`).

## 2. What renders

Desktop, top to bottom.

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — title `Stock check: {session.sessionNo}`, description `{session.scopeDetail} · auditor {session.startedBy}`. Rendered only when `!embedded` | `:614-648`; component `src/components/ui/Page.tsx:66-108` |
| 1a | Header actions: **Exit session** (ghost, `navigate('/inventory')`) and, while `session.status === 'In Progress'`, **Reconcile & complete audit** (primary). Once status is `Completed` the button is replaced by a static "Audit completed" pill | `:619-645` |
| 2 | `ErrorBanner` titled "The audit was not reconciled" — rendered only when `reconcileError` is set | `:652`; `src/components/ui/StateViews.tsx:171-210` |
| 3 | `KpiStrip columns={4}` — Audit progress (`{pct}%`, note `{verified} of {total} verified`) · Verified · Unverified · Confirmed missing. All four counted from `session.units` in `useMemo` (`:79-90`), not read from the session's stored totals | `:654`, kpis `:216-221`; component `src/components/ui/Page.tsx:203-304` |
| 4 | Session card — `sessionNo`, "started {startedAtBS} · {startedBy}", a right-aligned `{verified} / {total}` figure, a `role="progressbar"` bar scaled by `transform: scaleX()`, and the standing paragraph "An unscanned unit stays **Unverified**…" | `:657-694` |
| 5 | Two-column grid, `minmax(300px, 360px) minmax(0, 1fr)` at desktop | `:701-708` |
| 5a | Left column (desktop only): **Barcode / QR scan input** card, then **Session scope** card | `:709-714` |
| 5b | Scanner card body: `<form>` with a text input (`id="stock-check-scan"`, 44px, 2px accent border), a **Scan** button and a **Camera** button that opens `BarcodeScannerModal` | `:248-283` |
| 5c | Scanner card: "Quick test scanners" — one button per each of the first three unscanned serials, plus an orange **Misplaced item test** button that types `SN-AP6-UNKNOWN-99` into the field | `:285-329` |
| 5d | Scanner card: inline scan feedback block — "Item matched" (green) or "Location alert" (orange), with the message text. Persistent, not a toast | `:332-360` |
| 5e | Session scope card: Facility · Scope · Auditor · Started, four label/value lines | `:365-382` |
| 6 | **Location manifest ({filtered} of {total})** card. Header action slot holds five filter chips: All · Verified · Unverified · Missing · Unexpected, each with its own count and `aria-pressed` | `:414-453` |
| 6a | Filter = `unexpected` → a four-column table (Scanned identifier · State · Location found · Time scanned) with a red "Misplaced" badge per row, or an `EmptyState` when nothing has been scanned off-manifest | `:456-507` |
| 6b | Otherwise (desktop/tablet) → a table: Item & tag · *Serial number (desktop only)* · Rack / shelf / bin · State · Action. Item & tag is a `Link` to `/inventory/{assetCode\|serial}`. The Action cell renders **Manual verify** (ghost — types the serial into the scan box) and **Confirm missing** (outline) only while the row is `Unverified` | `:548-602` |
| 6c | State badge — background/foreground/border and icon from `STOCK_CHECK_STATE_META` | `:223-246`; `src/data/stockCheck.ts:67-91` |
| 6d | Confirm-missing bar under the list: "{n} unverified · {m} confirmed missing" and a **Confirm missing — all {n} unverified** button, disabled when there are none. Hidden while the Unexpected filter is active | `:384-412`, `:604` |
| 7 | `ConfirmDialog`, `variant="danger"` — opens whenever `missingCandidates` is non-empty; lists up to 8 serials plus "and N more" | `:750-777`; `src/components/ui/ConfirmDialog.tsx:32-112` |
| 8 | `BarcodeScannerModal`, `mode="reset"`, `items` built from `session.units` | `:779-792`; `src/components/ui/BarcodeScannerModal.tsx:51-381` |

### Responsive bands

**This file reads both breakpoints, through one hook.** `useViewport()` is called at `:52` (`src/lib/device.ts:57-79`, `BREAKPOINT = {phone: 768, desktop: 1180}` at `:43`) and reduced to two booleans at `:76-77` — `phone = viewport === 'phone'` (< 768) and `desktop = viewport === 'desktop'` (≥ 1180). Tablet is the band where both are false.

| Band | What changes | Evidence |
|---|---|---|
| **< 768 (phone)** | Manifest becomes stacked card rows instead of a table — name, `assetCode · serial`, location, badge, then the two buttons | `:508-547` |
| | A fixed bottom "Scan to verify" bar appears (`position:'fixed'`, `zIndex:5`), opening the same `BarcodeScannerModal` | `:729-748` |
| | Page gains `paddingBottom: 76` to clear that bar | `:609` |
| | Scanner + scope cards render **below** the manifest | `:718-723` |
| | `KpiStrip` clamps itself to 2 columns | `src/components/ui/Page.tsx:210-212` |
| **768–1179 (tablet)** | Table renders, but the **Serial number column is dropped** and the serial is appended to the asset-code line instead | `:555`, `:571`, `:575-581` |
| | Grid collapses to one column; scanner + scope reflow **beneath** the manifest, not behind a handle | `:704`, `:718-723` |
| | `KpiStrip` clamps to 3 columns | `src/components/ui/Page.tsx:212` |
| **≥ 1180 (desktop)** | Two-column grid with the scanner rail on the left; serial column present; `KpiStrip` at the requested 4 | `:704`, `:709-714`, `:654` |

The `ScannerFab` sits above this page at every width (`src/App.tsx:1034`; `src/components/shell/ScannerFab.tsx:55` uses `phone` only to reposition it, `:211`), so the phone bar at `:729-748` is a second entry to a scanner panel, not the only one.

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| The whole session (number, scope, warehouse, auditor, start date BS/AD, status, notes) | SEED | `SAMPLE_STOCK_CHECKS[0]` — `src/data/stockCheck.ts:121-152`, copied into state at `:53` |
| The 12 manifest units (serial, assetCode, name, category, location, condition, scanned flag, scannedAt) | SEED | `src/data/stockCheck.ts:139-150` |
| Four KPI cards (progress %, Verified, Unverified, Confirmed missing) | SEED | counted from those 12 units at `:79-93`, formatted `:216-221` |
| Session card `{verified} / {total}` and progress bar | SEED | same counts, `:666-688` |
| Filter chip counts (All/Verified/Unverified/Missing) | SEED | same counts, `:420-423` |
| State badge per row | SEED | `unitState(u)` — `src/data/stockCheck.ts:53-57` |
| Session scope card (Facility / Scope / Auditor / Started) | SEED | `session.warehouse`, `.scopeDetail`, `.startedBy`, `.startedAtBS` — `src/data/stockCheck.ts:126-135` |
| "Quick test scanners" chips | SEED | first three unscanned serials off the same array, `:288-291` |
| Unexpected / Misplaced table | *(session-local)* | `unexpectedUnits` state, appended by an unmatched scan at `:136-143`. Nothing persists it; it is empty on every mount |
| Scan timestamps (`scannedAt` on a fresh scan, `Time scanned` in the Unexpected table) | *(computed)* | `new Date().toLocaleTimeString(...)` at `:116` and `:140` |
| Reconcile dispatch identity | *(auth)* | `useAuth()` at `:69`; `user.id` / `user.role` passed at `:178`; shape `src/lib/auth.tsx:13-18` |

**Nothing on this page is DB or LOCAL.** `stock_audits` / `stock_audit_items` exist in the generated types (`src/types/supabase.ts:8710`, `:8633`) and are named as floor-write tables in `src/lib/rbac.ts:82`, `:220` — but no query file mentions them, they are absent from the mock store (`src/lib/mock/corpus.ts:405-426`) and they are **not** in `UNSERVED` either (`:33-44`), so in mock mode they are unserved and unannounced.

Invented on this page: every figure — the session `SC-2083-004`, its scope "Zone A (Cinema Bodies) — Kathmandu HQ", the auditor "Ramesh Karki (Warehouse Officer)", the BS start `2083-04-22 09:00`, all 12 serials (`SN-FX3-001`…`SN-BMP-0003`), their asset codes, rack/shelf/bin strings, conditions and `09:12`–`09:42` scan times, and therefore the 9 Verified / 3 Unverified / 0 Missing counts and the 75% progress figure derived from them.

Two seeded totals on the same record disagree with the units beside them and are never rendered: `totalExpected: 14` and `totalScanned: 11` (`src/data/stockCheck.ts:129-130`) against an array of 12 units of which 9 carry `scanned: true`. The page displays only the counted values (`:79-90`), so the mismatch is invisible — but `:122-123` keeps writing to those stale fields.

## 4. Actions and writes

**One dispatch in the file.**

| Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `reconcileStockCheck({scannedCount, totalCount}, {userId, role})` — `:176-179`, via `await import()` | `inventory.audit` (`src/actions/inventory/reconcileStockCheck.ts:12`) | `src/actions/inventory/reconcileStockCheck.ts:10-39` | **false** — the key is never set anywhere in that file, and `ActionConfig.implemented` defaults false (`src/actions/core.ts:89`) | **Yes** — `case 'inventory.audit': return rbac.canWriteFloor(ctx.role)` (`src/actions/core.ts:201,206`), i.e. Owner · Admin · Manager · Warehouse (`src/lib/rbac.ts:92,227-229`) |

Written exactly: **Reconcile & complete audit** renders, dispatches `RECONCILE_STOCK_CHECK`, action is a stub (`src/actions/core.ts:223-225` fails it closed). The dispatcher throws on `implemented` **before** the context check (`:228-233`) and **before** the permission loop (`:236-241`), so the correctly-mapped `inventory.audit` rule is never reached today. `execute` would `console.log('[DB TX] …')` and emit `STOCK_RECONCILED` (`src/actions/inventory/reconcileStockCheck.ts:19-32`); it writes nothing.

The `.catch()` at `:181-184` puts the thrown message into the page-level `ErrorBanner` (`:652`) and — importantly — the status flip to `Completed` sits in `.then()` **after** the resolve (`:180`), so a refused reconcile leaves the session reading In Progress.

`handleFinishAudit` refuses to dispatch with no session at all (`:169-174`) rather than substituting an identity.

**Everything else on this page writes only React state:**

| Control | What it actually does | Evidence |
|---|---|---|
| **Scan** button / form submit | `handleScanSubmit` — sets `scanned: true`, a local `scannedAt`, and `confirmedMissing: false` on the matched unit in state; or pushes a row onto `unexpectedUnits`. **No action, no dispatch, no network** | `:96-154`, `:276-278` |
| **Confirm missing** (per row) and **Confirm missing — all N unverified** | Queue serials into `missingCandidates`, opening the dialog | `:406`, `:538`, `:590` |
| `ConfirmDialog` → **Confirm missing** | `confirmMissing` sets `confirmedMissing: true` in local state. **There is no action file for this at all** — `src/actions/` carries nothing for confirming a missing unit, and nothing is dispatched | `:188-195`, `:753` |
| **Manual verify** (per row) | Types the serial into the scan input. Does not verify anything by itself | `:535-537`, `:587-589` |
| **Camera** / phone **Scan to verify** | Opens `BarcodeScannerModal`. Its `onItemScanned` only sets `scanInput` — the operator must still press Scan | `:279-281`, `:744-746`, `:789-791` |
| Filter chips (5) | `setFilterMode` | `:431` |
| "Quick test scanners" chips and **Misplaced item test** | Type a serial into the input | `:295`, `:313` |
| **Exit session** | `navigate('/inventory')` | `:620` |

**No button on this page is handler-less.** Every control listed above has an `onClick`. What is missing is persistence, not wiring.

## 5. Gates

**Route access.** The only gate `Shell` applies is `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`) and `isMoneySurface` is a path-segment prefix match (`src/data/nav.ts:156-159`) — `/inventory/stock-check` is not among them. So **every signed-in role reaches this route**, including the four money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client` — `src/lib/rbac.ts:45-50`) and including the external `Client` role, which nothing on this route excludes: `src/App.tsx:297-304` carries no role prop and `isStaff` (`src/lib/rbac.ts:53-55`) is never called in `App.tsx`.

The route has no nav entry — `src/data/nav.ts:74` lists only `/inventory`, and the Stock Check pane is reached as a tab (`src/data/nav.ts:332`, `src/data/inventory.ts:214`). Sign-in is the only prerequisite (`src/App.tsx:973-975`).

**Money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not imported by this file** and the string `money` does not appear in it (import block `:1-13`). No rupee figure is rendered anywhere on the page. This is correct rather than a gap: `ExpectedUnit` (`src/data/stockCheck.ts:6-33`) and `StockCheckSession` (`:93-112`) carry no money field — no replacement value, no shrinkage cost, no variance amount.

**Nothing is hidden under Law 6 on this screen** — there is no figure for it to withhold. Note the consequence in the other direction: a `Warehouse` role can confirm units missing here and see the full manifest, which is exactly what the floor is meant to do; and a `Client` role can too, which nothing prevents.

**Role gating inside the page: none.** `user` is read at `:69` for one purpose only — the reconcile context and the not-signed-in refusal (`:169-178`). `user.role` is never compared against anything in this file. Every control renders identically for all nine roles.

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx`) is **not** used — it is not imported (`:1-13`). Two of the four states exist, both hand-rolled from `StateViews` primitives.

| State | Present? | Evidence |
|---|---|---|
| **Loading** | **None.** The data is a synchronous constant, so nothing loads. The only skeleton a user sees is `Shell`'s `Suspense` fallback while the lazy chunk downloads (`src/App.tsx:1026`) and `Shell`'s "Restoring session…" hold (`src/App.tsx:964-970`) — both belong to `App.tsx`, not this page | `:1-13` (no query import) |
| **Error** | Yes, one — the page-level `ErrorBanner` "The audit was not reconciled", fed by the dispatch `.catch()` (`:181-184`). Inline and persistent, per the note at `:70-74`. The scanner's orange "Location alert" block (`:332-360`) is a hand-rolled warning, not an `ErrorBanner` | `:652`; `src/components/ui/StateViews.tsx:171-210` |
| **Empty** | Yes, one — `EmptyState` "No misplaced or unexpected items scanned yet", inside the Unexpected filter only | `:458-463`; `src/components/ui/StateViews.tsx:34-84` |
| **Restricted** | **None in this file.** `RestrictedState` (`src/components/ui/StateViews.tsx:213-280`) is reachable only through `Shell`'s money guard (`src/App.tsx:1020-1023`), which can never fire for this route (see §5) | `src/App.tsx:993,1020-1023` |

There is **no empty state for the manifest itself**. Filtering to Verified/Unverified/Missing when that bucket is zero renders a table head with no rows and no message (`:561-599`), and the phone branch renders an empty flex column (`:510-546`). With the seeded session the Missing chip is 0 on load, so this is the state a first-time visitor hits by pressing the third chip.

## 7. Known gaps

**No `TODO(decision)` markers** in `src/modules/inventory/StockCheck.tsx`, `src/data/stockCheck.ts` or `src/actions/inventory/reconcileStockCheck.ts` (grep for `TODO` across all three returns nothing).

**Stubs and non-persistence**

- **`reconcileStockCheck` is a stub** — `src/actions/inventory/reconcileStockCheck.ts:10-39` never sets `implemented`, so `src/actions/core.ts:223-225` throws `ActionNotImplementedError` first. Its `execute` body is a `console.log('[DB TX] …')` (`:19`) with no `lib/dataAccess` call.
- **`[Confirm missing]` has no action behind it at all.** The file's own header (`:24-28`) calls it "the only path from Unverified to Confirmed missing" and it is the page's whole reason to exist, yet `confirmMissing` (`:188-195`) is a `setSession` and nothing else. There is no file under `src/actions/` for it and no capability string is declared anywhere for confirming a unit missing.
- **A verified scan persists nothing.** `handleScanSubmit` (`:96-154`) mutates state only. Every scan, every confirmed-missing assertion and the `unexpectedUnits` list are lost on navigation or refresh, including a completed audit — `session.status = 'Completed'` (`:180`) is local state over a constant.

**Dead or inconsistent data**

- **The second seeded session is unreachable.** `SAMPLE_STOCK_CHECKS[1]` (`SC-2083-003`, Full Warehouse, `status: 'Completed'`, `units: []` — `src/data/stockCheck.ts:153-172`) can never be selected: `:53` hardcodes index 0 and no picker exists.
- **`STOCK_CHECK_KPIS` is dead.** Exported at `src/data/stockCheck.ts:114-119` with four hand-written figures ("Units Unverified 7", "Confirmed Missing (FY) 1", "Last Full Check 4 Shrawan 2083") and imported by no file in `src/`. The page's own KPIs (`:216-221`) are counted instead, and they disagree with it (3 unverified, 0 missing).
- **The seeded session totals contradict its own unit list.** `totalExpected: 14` and `totalScanned: 11` (`src/data/stockCheck.ts:129-130`) over 12 units, 9 scanned. Not rendered, but `:122-123` keeps updating `totalScanned`/`totalUnverified` on every scan, so they are maintained dead fields.
- **Deprecated flags are still set in the seed.** `SN-FX3-004`, `SN-FX6-003` and `SN-BMP-0003` carry `isUnverified: true` and `SN-BMP-0003` also `flaggedNotHere: true` (`src/data/stockCheck.ts:142,145,150`), both marked `@deprecated` and read by nothing (`src/data/stockCheck.ts:28-31`; `unitState` at `:53-57` reads only `scanned` and `confirmedMissing`).
- **Seeded unit fields never rendered:** `category`, `condition`, `status`, `scannedBy`, `notes` (`src/data/stockCheck.ts:10-32`). `SN-BMP-0003`'s note — "Checked shelf 4 twice, might be in prep room" (`:150`) — is the closest thing to prior evidence for a missing call and never reaches the screen, including inside the confirm dialog. `scannedAt` is stored (`:116`) and shown only for *unexpected* items (`:501`), never for verified ones.

**Defects found in the code**

- **The Unexpected filter mislabels the card.** `filteredUnits` (`:202-208`) has no branch for `'unexpected'` and falls through to `return true`, so with that chip active the card title reads `Location manifest (12 of 12)` (`:416`) while the body shows the misplaced table, which is usually empty.
- **Scanning an asset code always matches the same unit.** `findIndex` at `:101-103` accepts `u.assetCode.toUpperCase() === query`, and four units share `EQ000234` (`src/data/stockCheck.ts:139-142`). Typing `EQ000234` therefore re-verifies the already-scanned `SN-FX3-001` forever and can never reach the unverified `SN-FX3-004`.
- **`BarcodeScannerModal` announces the wrong context on this page.** It is mounted with `mode="reset"` and **no `bookingId`** (`:779-788`), so the component's default `bookingId = 'B-710'` applies (`src/components/ui/BarcodeScannerModal.tsx:55`). The modal subtitle reads "Booking B-710 · …" (`:177`) and an unmatched code produces `Item "X" is not in this booking (B-710).` (`:98`) — on a stock-check screen that has no booking.
- **The same modal emits a wrong domain event.** Its `eventType` ternary (`src/components/ui/BarcodeScannerModal.tsx:146-151`) has no `'reset'` arm, so `mode="reset"` falls through to `EVENT_TYPES.INVENTORY_RETURNED` (`'inventory.returned'`, `src/events/eventBus.ts:82`). Every successful scan through the camera modal on this page emits a *return* event carrying `bookingId: 'B-710'`.
- **That modal also matches on name substring.** `i.name.toLowerCase().includes(code.toLowerCase())` (`src/components/ui/BarcodeScannerModal.tsx:92`) — typing `sony` matches the first Sony body, which the page's own stricter matcher (`:101-103`, exact serial or asset code) would reject.
- **`--orange-text` is not a defined token.** Used with no fallback at `:320`, `:338` and `:352` (the Misplaced-item-test button and both halves of the "Location alert" feedback block), and it appears nowhere in `src/styles/theme.css` as a declaration — only `--danger-text` and `--success-text` do (`src/styles/theme.css:150-151`, `:268-269`). Those three declarations resolve to `unset`, so the alert block loses its border and the warning colour.
- **`unexpectedUnits` never dedupes.** Each scan of the same unknown code pushes another row (`:143`), so the Misplaced table grows one entry per keypress of the test button.
- **Demo affordances ship in the page.** "Quick test scanners" (`:285-310`) and the **Misplaced item test** button that types `SN-AP6-UNKNOWN-99` (`:311-327`) are labelled as tests and render for every role at every width.

**Contradictions with other surfaces**

- **Three files deep-link here expecting a specific session, and always get `SC-2083-004`.** `src/data/caseIntel.ts:198-202` renders a case's `stockCheckSessionNo` and then a trigger to `/inventory/stock-check`; `src/data/rackIntel.ts:190-197` names the rack's last check session and does the same; `src/modules/reports/ProductReports.tsx:449-455` navigates there from Low Stock. `caseIntel.ts:198-200` and `src/data/cases.ts:248-249` both state the reason in comments — there is no per-session route — so the link resolves to a page that may name a different session than the one the operator was reading about.
- **The KPI strip and `STOCK_CHECK_KPIS` state different facts.** See above: 3 vs 7 unverified, 0 vs 1 confirmed missing for the year.
- **`src/modules/reports/catalog.ts:327`** records that the stock-check variance that would explain a Missing status "is not aggregated" — consistent with this page persisting nothing, and worth reading as confirmation rather than contradiction.
- **The component is mounted twice.** As `/inventory/stock-check` (`src/App.tsx:297-304`) and as `<StockCheck embedded />` inside the Inventory tab strip (`src/modules/inventory/Inventory.tsx:1483-1492`). Both instances hold independent `useState`, so a scan recorded in the tab is not present on the route and vice versa.

**Other observations**

- The **Scan** button (`:276`) passes no `type`, so it defaults to `submit` inside the enclosing `<form>` (`:250`); `handleScanSubmit` calls `e.preventDefault()` first (`:97`), which suppresses the form submission, so it fires once. The **Camera** button sets `type="button"` explicitly (`:279`).
- `session.notes` — "Routine weekly verification of main cinema bodies vault." (`src/data/stockCheck.ts:137`) — is not rendered anywhere.
- The `ConfirmDialog` is opened without `requireReason` (`:750-777`), so confirming a unit missing records no reason, in contrast to the block/void flows that component was built for (`src/components/ui/ConfirmDialog.tsx:8-13`).
- A scan clears an earlier `confirmedMissing` (`:117`), matching the documented precedence in `unitState` (`src/data/stockCheck.ts:48-51`) — but `:122-123` adjusts `totalScanned`/`totalUnverified` on the `unit.scanned` flag only, so those stale fields drift further when a confirmed-missing unit is later found.
