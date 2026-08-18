# Packing Workspace
Route `/rentals/:bookingNo/packing` · `src/modules/rentals/PackingWorkspace.tsx` · 1052 lines

Status: **Seed-only**

---

## 1. What it is

A full-screen floor workspace for ticking off an 18-item bundle before pickup. Lazily imported at `src/App.tsx:28` and mounted at `/rentals/:bookingNo/packing` inside `BookingShell` with `tail="Packing"` (`src/App.tsx:186-196`); `BookingShell` builds the crumb trail from `useParams` (`src/App.tsx:919-941`).

Every item, count, evidence figure and note on the screen is a constant in `src/data/packing.ts` and `src/data/booking.ts`. The file imports no query module — there is no `lib/queries/*` import in its import block (`PackingWorkspace.tsx:1-17`) — so nothing on this page is read from Postgres or from the local mock store.

`bookingNo` is read off the route (`:77`) but is used only for the title, the links and the dispatch payload; if it is anything other than `BOOKING.no` (`'B-715'`, `src/data/booking.ts:115`) the component returns `BookingNotLoaded` instead of rendering (`:215-217`).

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | Header row — `<h1>` "Packing Workspace" | `:230-234` |
| 1a | Booking-status badge, coloured via `STATUS[statusToken(status)]` | `:246-261`; `STATUS` `src/lib/status.ts:42` |
| 1b | Second chip "Pack job: {jobState}" — a separate axis from the status badge | `:262-279` |
| 1c | Sub-line: `<Link to={/rentals/${id}}>` + `PACKAGE.name` + `BOOKING.client` | `:281-287` |
| 2 | Progress strip — "Packing Progress", `{packed} / {TOTAL_ITEMS} ({pct}%)`, a scaleX bar, and a pending/all-packed line | `:292-306` |
| 3 | Header buttons — **Print Packing List** (no handler) and **Save Draft** | `:308-342` |
| 4 | Booking summary card: Client · Pickup · Return · Days · Status · Pack job · Payment · Items · Crew · Delivery, one flex row | `:346-372` |
| 5 | Three-column grid `auto minmax(0,1fr) auto` | `:385-392` |
| 5a | Left: `FloorAside collapsible side="left" width={260}` → Card "1 · Bundle / Item Tree" | `:394-464` |
| 5a-i | Package header (`PACKAGE.name`, `{TOTAL_ITEMS} Items · {PACKAGE.note}`) | `:396-404` |
| 5a-ii | One button per `GROUPS` entry, `done/count`, click toggles the `highlight` dim | `:406-442` |
| 5a-iii | "Bundle Summary" — Total / Packed / Pending / Missing / Not Required, plus the reconciliation sentence | `:444-462` |
| 5b | Centre: Card "2 · Packing Checklist", `bodyStyle={{padding:0}}` | `:467-711` |
| 5b-i | Card actions — **Bulk Scan** (`onClick={packAll}`), **Scan Barcode** and **Scan QR** (both open the same modal) | `:471-477` |
| 5b-ii | Filter bar — search `<input>` + one chip per `FILTERS` entry with `aria-pressed` | `:479-512` |
| 5b-iii | Table, `minWidth: 820` inside `overflowX:auto`; headers `['', 'Item / Accessory', 'Serial / ID', 'Qty', 'Status', 'Condition', 'Location', 'Packed At', 'Evidence', '']` | `:591-701`; headers `:595` |
| 5b-iv | Per row: checkbox (`disabled` when `u.blocker`), name + Required tag + blocker note, serial `<Link to={/inventory/:serial}>`, hardcoded Qty `1`, state pill, condition pill, location, packed-at, evidence count, row actions | `:608-685`; Qty literal `:639` |
| 5b-v | Empty state — `EmptyState` "No items match these filters" with a Clear-all-filters action | `:688-698` |
| 5b-vi | Green "All items packed successfully. Ready for Pickup / Delivery." banner when `pending === 0 && missing.length === 0` | `:704-709` |
| 5c | Right: `FloorAside collapsible side="right" width={300}` | `:715-967` |
| 5c-i | Card "Progress" — `Ring` + "{TOTAL_ITEMS} items · {packed} packed" | `:728-740` |
| 5c-ii | Card "Blockers" — `gateReason` or "Nothing is blocking completion.", `role="status"` | `:742-754` |
| 5c-iii | **Complete Packing** — the only filled button on the page, `disabled={!canComplete}` | `:756-809` |
| 5c-iv | `ErrorBanner title="Packing was not recorded"` when `dispatchError` is set | `:814` |
| 5c-v | Card "3 · Packing Summary" — `Ring`, packed/total, missing count, five-row tally | `:816-845` |
| 5c-vi | Card "Missing Items" — per missing line: name, reason `<input>` (red border under 10 chars), a **Swap Unit** button with no handler | `:847-874` |
| 5c-vii | Card "Evidence" — `EVIDENCE` totals, per-case photo checklist with **Take Photo**, three upload buttons with no handler, an **Open Evidence** `<Link>` | `:877-927` |
| 5c-viii | Card "Packing Notes" — `NOTES.body` / `NOTES.by` / `NOTES.at` | `:929-936` |
| 5c-ix | Card "Quick Actions" — three buttons (Scan Barcode · View Packing List · More), none with a handler | `:939-952` |
| 5c-x | Scan log panel, `role="status" aria-live="polite"`, last 5 entries | `:954-966` |
| 6 | Footer card — **Cancel Packing** → `navigate('/rentals/:id')` and a status sentence. No Previous/Next, no second primary | `:979-990` |
| 7 | `BarcodeScannerModal` (`mode="pack"`), rendered always, opened by `showScanner` | `:992-1001` |

Two file-local helpers: `RowAction` (`:1006-1028`) and `Ring`, an SVG donut with `role="img"` (`:1030-1052`).

### Responsive bands the file actually reads

The file calls `useViewport()` (`:86`), which is `src/lib/device.ts:57` and reads **both** locked breakpoints — `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43`), evaluated at `src/lib/device.ts:45-51`. The page derives `desktop` and `phone` at `:87-88` and uses them in three places:

- **Grid template** (`:388`): `desktop` → `auto minmax(0,1fr) auto`; `phone` → `1fr`; tablet (768–1179) → `minmax(0,1fr) 320px`.
- **Grid placement** via `floorPlacements(desktop, phone)` (`:88`, `src/modules/operations/FloorAside.tsx:82-90`): desktop leaves natural flow; phone puts list row 1, right rail row 2, tree row 3; tablet puts list top-left, tree beneath it, right rail spanning both rows in column 2.
- **Table vs cards** (`:514`): below 768 the checklist renders one `<article>` card per unit with a 22px checkbox, state pill, serial link, blocker line, and the same row actions (`:524-589`); at ≥768 it is the 820px-wide table.

`FloorAside` is passed `collapsible={desktop}` at `:394` and `:715`, so at ≥1180 both columns are `CollapsibleAside`-backed rails (`src/components/ui/Page.tsx:315-331`, `:400-416`) and below 1180 the same children render as a plain flex column (`FloorAside.tsx:50-52`).

`src/App.tsx:902` also stamps `data-floor="true"` on `<main>` for any path ending `/packing`, applying the floor UI scale outside this file (`src/App.tsx:959`, `:1010`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Item checklist rows (18 units: id, group, case, name, serial, required, location, evidence, blocker) | SEED | `UNITS` — `src/data/packing.ts:43-73`, imported at `:15` |
| Bundle name and "10% bundle discount" note | SEED | `PACKAGE` — `src/data/packing.ts:75` |
| Bundle-tree group names and counts | SEED | `GROUPS`, derived by reduce over `UNITS` — `src/data/packing.ts:78-80` |
| `TOTAL_ITEMS` (18) — progress bar, ring, tallies, gate arithmetic | SEED | `UNITS.length` — `src/data/packing.ts:83` |
| Case list for the photo gate (Pelican 1610 · Lens Case · Accessories Case) | SEED | `CASES`, a `Set` over `UNITS[].case` — `src/data/packing.ts:90` |
| Evidence panel figures — 34 photos · 28 matched · 4 review · 2 unknown | SEED | `EVIDENCE` — `src/data/packing.ts:93` |
| Packing Notes body / author / timestamp | SEED | `NOTES` — `src/data/packing.ts:95-99` |
| Filter chip labels | SEED | `FILTERS` — `src/data/packing.ts:102` |
| Booking number fallback, client name, booking status | SEED | `BOOKING` — `src/data/booking.ts:114-135`, imported at `:14` |
| Pickup / Return dates in the summary row | SEED | Two hardcoded `new Date('2026-07-16')` / `new Date('2026-07-19')` literals in the component itself (`:205-206`, `:349-350`), formatted by `toBs`/`formatBs`/`formatAd` (`src/lib/bs.ts:93`, `:102`, `:114`) |
| Summary row: Days "3", Payment "Due", Crew "3", Delivery "Pickup" | SEED | String literals in the component — `:351`, `:357`, `:359`, `:360` |
| Qty column, always "1" | SEED | Literal `:639` |
| `packedAt` stamp, always "10:24 AM" | SEED | Literal in `pack` (`:191`) and `packAll` (`:200`) |
| Line states, case photo counts, scan log, filters, highlight | — | Component `useState` only (`:90-121`); nothing is persisted anywhere |
| Complete Packing write target (`operation_sessions`, `packing_lines`, `session_line_movements`) | DB (unreachable) | `packRental` → `runFloorVerb` (`src/actions/rentals/packRental.ts:41`, `src/actions/rentals/floorVerb.ts:541`, `:699-702`, `:815`, `:828`). The page always calls it with `lines: []` (`:784`), which `validateFloorVerb` refuses (`floorVerb.ts:390-394`), so no row is ever written. In the mock store `operation_sessions` is listed in `UNSERVED` (`src/lib/mock/corpus.ts:36`) and `packing_lines` / `session_line_movements` are absent from the store entirely (`src/lib/mock/corpus.ts:405-423`) — all three are LOCAL-UNSERVED |

Invented on this page: all 18 item names, serials and bin locations; the 18-item total and every group count derived from it; the three case names; the per-line evidence counts; the 34/28/4/2 evidence tallies; the "In Cleaning until 16:00" blocker; the packing note and its author and timestamp; the "10:24 AM" packed-at stamp on every line; the Qty of 1 on every row; and the summary row's Days 3, Crew 3, Delivery Pickup and Payment "Due".

---

## 4. Actions and writes

The file imports nothing from `src/actions/` statically; both dispatches are dynamic `import('../../actions/rentals/index')` (`:332`, `:783`), resolving through the barrel `src/actions/rentals/index.ts:8-9`.

| Trigger | Action | Capability | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| **Save Draft** (`:325-341`) | `saveDraft` — `src/actions/rentals/saveDraft.ts:8` | `rental.draft` (`saveDraft.ts:10`) | **false** — no `implemented` key on the config, and `core.ts:89` defaults it to `false` | Yes — `core.ts:188` → `rbac.canWriteBookingDesk` (`core.ts:195`). Never reached: `core.ts:223` throws `ActionNotImplementedError` before the permission loop |
| **Complete Packing** (`:756-809`) | `packRental` — `src/actions/rentals/packRental.ts:41` | `operations.perform` (`packRental.ts:47`) | **true** (`packRental.ts:48`) | Yes — `core.ts:138` → `rbac.canPerformOperations` (`src/lib/rbac.ts:291-293`: Owner, Admin, Manager, Warehouse, Technician) |

Written as required: **Save Draft renders, dispatches `saveDraft`, action is a stub (core.ts fails it closed).** The failure is caught and surfaced in `dispatchError` (`:334-337`) rather than swallowed.

**Complete Packing** is implemented and capability-mapped but still cannot write. The page hardcodes `lines: []` at `:784`; `validateFloorVerb` throws `"Pack needs the booking lines it resolved — an empty list would open a session claiming work on nothing."` (`src/actions/rentals/floorVerb.ts:390-394`) at step 4 of the dispatcher (`core.ts:244`), before `execute`. The `.then(() => navigate(...))` at `:785` therefore never fires; the `.catch` at `:786-789` always does. The component's own comment at `:771-776` states this.

Both handlers refuse to dispatch when `useAuth()` returns no user, setting an inline message instead (`:327-330`, `:766-769`).

**Buttons and controls with no handler at all:**

| Control | Line |
|---|---|
| Print Packing List | `:309` |
| Swap Unit (per missing line) | `:867` |
| Upload Photos · Upload Folder · Record Video | `:911-914` |
| Quick Actions: Scan Barcode · View Packing List · More | `:941-950` |
| `more_vert` glyph in every table row's action cell (an `Icon`, not a button) | `:682` |

**Local-only controls** (mutate `useState`, persist nothing): row checkboxes (`:610-616`, `:535-542`), Missing / Not Req. / Undo row actions (`:670-681`, `:572-577`), Bulk Scan → `packAll` (`:473`, `:195-203`), Take Photo → increments `casePhotos[c]` (`:902`), missing-reason inputs (`:857-865`), search and filter chips, group-tree highlight toggle.

`BarcodeScannerModal` (`:992-1001`) calls `onItemScanned` → `pack(item.id)` (`:998-1000`) and separately emits `EVENT_TYPES.INVENTORY_PACKED` on the in-memory bus (`src/components/ui/BarcodeScannerModal.tsx:146-158`); `DomainEvents.emit` only invokes registered listeners (`src/events/eventBus.ts:29-57`) — it is not a write.

---

## 5. Gates

**Route access.** No role gate on this route. `Shell` redirects to `/login` when `useAuth()` has no user (`src/App.tsx:973-975`) and renders `RestrictedState` only when `!canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`, `:1020-1023`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`), so `/rentals/…/packing` is not a money surface — **every signed-in role, including Client, reaches this page**.

**Money visibility.** The file does **not** import `useCanViewMoney` (`src/lib/moneyVisibility.ts:24`) and does not call `canViewMoney`. Nothing is gated because nothing monetary is rendered: the summary row's Payment cell is the hardcoded non-monetary word `'Due'` (`:357`), and no `Rs` figure appears anywhere in the file. Law 6 is satisfied by omission at authoring time, not by a runtime check — a money-capable role sees exactly the same page as Warehouse.

**Write gate.** `operations.perform` → `rbac.canPerformOperations` allows Owner, Admin, Manager, Warehouse, Technician (`src/lib/rbac.ts:291-293`); Coordinator, Accounts, Driver and Client would get `ActionPermissionError` from `core.ts:239`. In practice validate fails first for everyone (see §4).

**Completion gate** (`:146-164`), all three conditions local:
1. every `required` unit must be Packed, Missing or Replaced (`:147-151`);
2. every Missing line needs a reason of ≥10 characters (`:152`) — mirroring `MIN_REASON` in `floorVerb.ts:258`;
3. every case holding at least one packed unit needs ≥1 photo (`:154-155`).

---

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119`) is **not** imported by this file.

| State | Present? | How |
|---|---|---|
| Loading | **None in this file.** The only loading UI is `Shell`'s `Suspense` fallback `<LoadingSkeleton type="card" label="Loading…" />` around the lazy chunk (`src/App.tsx:1026`) and the "Restoring session…" hold (`src/App.tsx:964-970`) — both outside the component |
| Error | Yes — `ErrorBanner` from `StateViews` for dispatch failures (`:814`; component `src/components/ui/StateViews.tsx:171`, `role="alert"`, inline and persistent) |
| Empty | Yes — `EmptyState` from `StateViews`, twice: table body (`:691-695`) and phone card list (`:583-587`); component `src/components/ui/StateViews.tsx:34` |
| Restricted | **None in this file.** `RestrictedState` (`StateViews.tsx:213`) is never rendered here; the only restricted path is `Shell`'s money-surface guard, which this route never trips |
| (extra) Not-loaded | Hand-rolled `BookingNotLoaded` for any `bookingNo !== 'B-715'` (`:215-217`; component `src/modules/operations/BookingNotLoaded.tsx:27`) — deliberately not an error state |

---

## 7. Known gaps

1. **`TODO(decision)` markers in the page file: none.** `grep TODO` over `PackingWorkspace.tsx` returns nothing. The write path it calls does carry them — `src/actions/rentals/floorVerb.ts:80`, `:86`, `:91`, `:195`, `:609`, `:680`, `:906`.

2. **Complete Packing can never write.** `lines: []` is hardcoded at `PackingWorkspace.tsx:784` and refused by `src/actions/rentals/floorVerb.ts:390-394`. Renders, dispatches `packRental`, action is implemented but the payload always fails `validate`; the operator always gets the `ErrorBanner`.

3. **Save Draft is a stub.** `src/actions/rentals/saveDraft.ts:8-36` has no `implemented: true`, so `src/actions/core.ts:223` throws `ActionNotImplementedError` before `validate`, `execute`, events or audit. Its `execute` body is a `console.log('[DB TX] …')` (`saveDraft.ts:17`).

4. **100% packed is unreachable, so three UI states are dead code.** `u10` (NISI 85mm) carries `blocker: 'In Cleaning until 16:00'` (`src/data/packing.ts:63`); its checkbox is `disabled` (`:613`, `:538`), `pack()` refuses it (`:183-186`) and `packAll` skips it (`:200`). It is `required: true`, so the "Not Req." row action is not offered (`:673`) and its only exit from Pending is Missing (`:671`). Therefore `packed === TOTAL_ITEMS` never holds, and these never render: the `'Packed'` booking-status badge (`:143`, `:246-261`), `jobState === 'Complete'` (`:144`), and the green "All items packed successfully" banner, whose condition `pending === 0 && missing.length === 0` (`:704`) cannot be satisfied. Max attainable is 17/18 = 94%.

5. **The required BNC cable can never be scanned.** `scannableUnits` marks anything whose name contains `cable` or `cap` as `isAccessory` (`:127`), which includes `u17` "BNC Cable 3m" — a `required: true` line (`src/data/packing.ts:71`). `BarcodeScannerModal` rejects accessories outright (`src/components/ui/BarcodeScannerModal.tsx:108-117`). It can still be ticked by checkbox, so the gate is not deadlocked, but the scan-first workflow the page is built around cannot resolve it.

6. **Scanner matching is a substring match, not an identity match.** `items.find(… || i.name.toLowerCase().includes(code.toLowerCase()))` (`src/components/ui/BarcodeScannerModal.tsx:87-93`) — typing `battery` packs whichever of the four NP-FZ100 batteries is first in the array.

7. **`Partial` and `Replaced` states are unreachable from the UI.** Both are members of `LineState` (`src/data/packing.ts:13`), both have tone entries (`:51`, `:54`), `Partial` has a filter chip (`src/data/packing.ts:102`) and a row in the Packing Summary tally (`:834`) — but no control on the page ever calls `set(uid, { state: 'Partial' })` or `'Replaced'`. The `partial` counter at `:134` is permanently 0, and the gate's "Packed, Missing or Replaced" test (`:150`) can only ever be met by the first two.

8. **`saveDraft`'s only parameter is the booking number.** `SaveDraftInput` is `{ id: string }` and the call passes `{ id: id! }` (`:333`) — none of the 18 line states, reasons or case photos are included, so even a built `saveDraft` would save nothing about the packing session.

9. **The page contradicts Booking Detail's seed on the same booking.** Packing initialises all 18 lines to `Pending` (`:90-92`), while `src/data/booking.ts:280-287` (`ITEM_TALLY`) states Packed 17 / Partial 1 / Missing 0 for B-715, and `src/data/booking.ts:255-276` marks nine of eleven `ITEMS` rows `packed: 'Packed'`. The two screens describe the same booking in incompatible states, and neither is derived from the other.

10. **Nothing survives a refresh, including the mandatory evidence.** `casePhotos` (`:119-121`) is a plain counter incremented by the **Take Photo** button (`:902`) — no camera, no upload, no `evidence_files` row. `EVIDENCE`'s "34 photos · 28 matched" (`src/data/packing.ts:93`) is unrelated to it. So the ruled-mandatory evidence gate at `:154-163` is satisfied by pressing a button three times.

11. **Pickup/Return dates are local literals parsed differently from the rest of the app.** `new Date('2026-07-16')` at `:205`/`:349` vs `new Date(Date.UTC(2026, 6, 16))` at `src/data/booking.ts:72`. Same intended day, two construction paths, and this page does not read `BOOKING.pickup` / `BOOKING.ret` which already exist (`src/data/booking.ts:130-131`).

12. **A doc comment in the file asserts a spec disagreement that the code resolves the other way.** `:20-34` says the render's stage badge reading "Preparing" and the "Confirmed at 100% packed" behaviour were corrected; the code at `:143` in fact never sets any status but `BOOKING.status` or `'Packed'`, and per gap 4 the `'Packed'` branch is unreachable. Separately `src/lib/workflow.ts:102` declares `Pack: { sessions: false }` while `packRental.ts:17-19` and `floorVerb.ts:207` write Pack through the `operation_sessions` + `packing_lines` session path; `floorVerb.ts:190-191` acknowledges the disagreement and keys on the database.

13. **`Print Packing List`, `Swap Unit`, `Upload Photos`, `Upload Folder`, `Record Video`, and all three Quick Actions are dead buttons** — see the table in §4 for lines. Quick Actions' "Scan Barcode" is inert even though the identically-labelled card action at `:474` works.
