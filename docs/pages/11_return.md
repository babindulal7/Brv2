# Return & Inspection Workspace
Route `/rentals/:bookingNo/return` · `src/modules/rentals/ReturnWorkspace.tsx` · 1323 lines

Status: **Seed-only**

## 1. What it is

A floor screen for receiving equipment back on booking `B-715` and inspecting it in the same view — 18 units come from `src/data/returnInspection.ts:168-222`, cloned into React state at `ReturnWorkspace.tsx:161-163`, and the active session is pinned to the literal `'S2'` at `:184`. It draws six session gates (`:304-341`), a per-unit inspection panel (condition, accessories, damage evidence, note) and a signature block, and its one primary button dispatches `completeReturn` with `lines: []` (`:381`), which `validateFloorVerb` refuses unconditionally (`src/actions/rentals/floorVerb.ts:389-394`). Any booking number other than `B-715` short-circuits to a not-loaded card before the render (`:412-414`).

## 2. What renders

Top to bottom at desktop:

1. **Header** (`:419-468`) — `Return & Inspection Workspace` H1 (`:423-425`); an unconditional `Equipment In` chip (`:426-428`); a booking-status chip computed from local unit state (`:429-431`); breadcrumb `Rentals › Bookings › {id} › Return · {client}` (`:434-441`); a Return Progress column with `returned / TOTAL_ITEMS (pct%)`, a scaleX bar and an outstanding/resolved line (`:444-459`); a `Print Return Report` button and a `View Booking` link (`:462-466`).
2. **Booking strip** (`:471-491`) — nine cells: Client, Total Items, Returned, Outstanding, Not Returned, Expected Return, Actual Return, Return job, Status. No money cell.
3. **Overrun line** (`:502-508`) — renders only when `overrun.band !== 'None'`; `formatOverage(...)` plus `bandConsequence(...)`, both money-free (`src/lib/lateFee.ts:243-286`).
4. **Scan bar card** (`:511-530`) — `Scan Barcode` (accent outline, `:513`), `Scan QR` (secondary, `:516`), a `Search Equipment` input (`:520-526`), and the caption at `:529`. Both scan buttons open the same modal.
5. **Two-column grid** (`:532-539`), centre column first:
   - **`1 · Equipment Table` card** (`:542-713`) — four filter chips (`:543-570`); then either the phone card list (`:576-653`) or the 9-column table (`:655-699`); then the two-counter strip `Items Not Returned` / `Accessories Missing` (`:703-712`).
   - **`2 · Session Gates — S2` card** (`:716-753`) — the six gates each with pass/fail icon, blocking value and an optional `Resolve →` (`:718-731`), then a **Booking Conditions** information block (`:734-752`).
6. **Right rail** via `FloorAside` (`:757-880`) — `Before / After` photo counts with a `Compare in Evidence` link (`:767-791`); `Sessions` S1/S2 (`:793-815`); `Signatures` — Returning person, Warehouse staff, Witness (`:817-823`); `Items Not Returned` with a decision `<select>` per item (`:825-853`); `Quick Actions` (`:855-868`); a scan log capped at 5 lines (`:870-879`).
7. **`ErrorBanner`** when a dispatch failed (`:886`).
8. **Footer bar** (`:889-925`) — `Cancel Return`, the caption `Nothing is saved until you complete this session` (`:901`), and the single filled primary `Complete Session` / `Complete Return` (`:903-923`).
9. **Below the footer** — the blocking-gate line (`:926-928`), the dispatch caption (`:929-933`), and `BarcodeScannerModal` (`:935-944`).

**Responsive bands actually read.** The file reads **both** locked breakpoints, through `useViewport()` at `:154`, defined over `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`). It derives `desktop` (≥1180) at `:155` and `phone` (<768) at `:156`.

- **≥1180** — the grid is `minmax(0,1fr) auto` (`:535`); `FloorAside collapsible={desktop}` (`:757`) renders the rail as the collapsible `Rail` (`src/modules/operations/FloorAside.tsx:40-49`).
- **768–1179** — the grid collapses to `'1fr'` (`:535`) and `FloorAside` renders its children as a plain column beneath the centre column (`FloorAside.tsx:50-52`). The equipment table stays a table with `minWidth: 880` inside an `overflowX: 'auto'` wrapper (`:655-656`), so it scrolls sideways in this band.
- **<768** — the table is replaced by one `<article>` card per unit with 44px-min `Mark Returned` / `Not Returned` buttons and an `Inspect this item` toggle (`:576-653`). The same `UnitDetail` panel serves both layouts (`:1108-1114`).

Not decided by this file: the floor type scale. `App.tsx:902` lists `/return` in `FLOOR_ROUTE_SUFFIXES` and `App.tsx:1009-1010` stamps `data-floor` on `<main>`; the component comment at `:416` says so.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Equipment rows — 18 units, name / category / serial / state / condition / inspection / session / pickup & return timestamps / accessories / damage | SEED | `src/data/returnInspection.ts:168-222` `UNITS`, deep-cloned into `useState` at `ReturnWorkspace.tsx:161-163` via `cloneUnit` (`:123-131`) |
| `TOTAL_ITEMS` (18) — progress denominator, `Total Items` cell | SEED | `returnInspection.ts:224`, computed as `UNITS.length` |
| Sessions S1/S2 — state, returning person, receiving staff, started/closed, S1's two signatures | SEED | `returnInspection.ts:277-301` `SESSIONS`; active session pinned to `'S2'` at `ReturnWorkspace.tsx:184` |
| Filter chips and item-state labels (`Outstanding`, `Not Returned`) | SEED | `returnInspection.ts:247-255` |
| `Missing` / `Damaged` effect strings in Booking Conditions and the scan log | SEED | `returnInspection.ts:241-244`, read off `FLAGS` in `src/lib/workflow.ts:217-218` |
| Not-Returned decision dropdown (4 options) | SEED | `returnInspection.ts:106-111` |
| `Routes to {queue} → {then}` under Condition | SEED | pure function `returnInspection.ts:262-274`, called at `ReturnWorkspace.tsx:1139` |
| Expected / Actual Return cells (BS line, AD line, times) | SEED | times from `returnInspection.ts:304-312` `RETURN_TIMING`; the dates are hardcoded `new Date('2026-07-19')` in the component at `:395-396` and `:478-479` |
| Client name, booking number fallback | SEED | `src/data/booking.ts:114-135` `BOOKING` (`.no`, `.client` only) |
| Overrun minutes and band | SEED inputs, computed | `RETURN_AT` / `ACTUAL_RETURN_AT` at `src/data/booking.ts:86-88`, passed to `lateBand` (`src/lib/lateFee.ts:243-250`) at `ReturnWorkspace.tsx:174` |
| `Before / After` photo counts | SEED | summed from each unit's `pickup.photos` / `ret.photos` at `:770-771`; the underlying numbers are `returnInspection.ts:169-221` |
| Damage photo counters in the inspection panel | — | local `useState`; `Add Photo` increments an integer (`:642`, `:681`), no file and no `evidence_files` row |
| Signatures captured on this screen | — | local `useState`; names read off the active session record, timestamp is the literal `'19 Jul 2026, 10:19 AM'` (`:268-278`) |
| Quick Actions labels | SEED | literal `['Print', 'Share', 'More']` in the component (`:857`) |
| Scan log lines | — | local `useState`; the receipt timestamp is the literal `'19 Jul 2026, 10:16 AM'` (`:214`) |
| Return write target — `operation_sessions`, `return_lines`, `session_line_movements`, `booking_stage_transitions` | DB (unreached) | `src/actions/rentals/floorVerb.ts:540-586`, `:601-607`, `:969-997`. Never executed from this page — `validate` throws first (see §4). In mock mode `operation_sessions` is listed UNSERVED (`src/lib/mock/corpus.ts:36`) and `return_lines` / `session_line_movements` are not keys of the mock store at all (`corpus.ts:405-427`) |

No LOCAL (corpus-served) row reaches this page. Nothing on it comes from a query file — the component imports no `lib/queries/*` module (`:1-42`).

**Invented on this page:** every figure and name shown — the 18 unit rows with their serials (`SN102`, `SN-BAT-001…004`, `SN-CFX-001/002`, `SN-LEN-035/050/085`, `SN-TRP-001`, `SN-MON-001/002`, `SN-RIG-001/002`, `SN-AUD-001/002`, `SN-SSD-001`), the 8/1 session split and their `10:10–10:15 AM` receipt times, the per-unit pickup and return photo counts, the Manfrotto's five-item accessory checklist and its damage description, the Top Handle as the one Missing item, the two session records with `Sagar Maharjan` / `Ramesh Dulal` and their started/closed times, the 06:00 AM expected vs 10:15 AM actual return, the client name, and the `Print` / `Share` / `More` action labels.

## 4. Actions and writes

**The one dispatch on this page**, `completeSession` (`ReturnWorkspace.tsx:372-393`):

| Field | Value |
|---|---|
| Action | `completeReturn`, `src/actions/rentals/returnRental.ts:46` (re-exported by `src/actions/rentals/index.ts:7`) |
| Capability string | `operations.perform` (`returnRental.ts:50`) |
| `implemented` | `true` (`returnRental.ts:51`) |
| Mapped in `checkCapability`? | **Yes** — `src/actions/core.ts:138-139`, resolving to `rbac.canPerformOperations` (`src/lib/rbac.ts:291-293`) |
| Input sent | `{ rentalId: id, lines: [], occurredAt }` (`:381`) |
| Outcome | **Always rejects.** `validateFloorVerb` throws on an empty `lines` list (`src/actions/rentals/floorVerb.ts:389-394`). `createAction` runs `validate` at step 4, after the permission check and before `execute` (`core.ts:244-247`), so no Supabase call is made. |

Guards and error handling around that dispatch:

- No signed-in `user` → inline refusal, no dispatch (`:374-377`).
- The session flip to `Complete` and the `navigate` are both inside `.then()` (`:382-388`), so a rejected write cannot read as a closed return.
- `.catch()` writes the message into `dispatchError` (`:389-392`), rendered by `ErrorBanner` at `:886`.
- The button is `disabled` unless `canCompleteSession` (`:342`, `:905`).

Every other control on this page mutates React state only and dispatches nothing:

| Control | Line | Effect |
|---|---|---|
| `Scan Barcode` / `Scan QR` | `:513`, `:516` | `setShowScanner(true)` |
| `BarcodeScannerModal` `onItemScanned` | `:941-943` → `scan` `:208-217` | sets `state: 'Returned'`, stamps the literal `'19 Jul 2026, 10:16 AM'`, opens the inspection panel |
| `Mark Returned` (table `:1075`, `:1077`; phone card `:610-617`) | → `scan` `:208-217` | same local flip |
| `Not Returned` (table `:1076`; phone card `:618-624`) | → `markMissing` `:219-223` | sets `state: 'Missing'` in component state |
| `Undo` (table `:1078`; phone card `:623`; rail `:847`) | → `undoMissing` `:225-231` | resets to `'Picked Up'` and drops `decision` |
| Condition chips (5) | `:1170-1194` → `setCondition` `:233` | single-select field on the unit |
| Accessory `Present` / `Missing` toggles | `:1206-1207` → `setAccessory` `:235-240` | flips one checklist entry |
| Damage description textarea | `:1220-1226` → `setDamage` `:201-206` | |
| `Add Photo` | `:642`, `:681`, rendered `:1231` | increments an integer; no upload, no `evidence_files` write |
| `Send for Manager Approval` | `:643`, `:682`, rendered `:1238-1246` | sets `routedForApproval: true` locally; nothing is routed anywhere |
| `Save Inspection` | `:644`, `:683` → `saveInspection` `:242-247` | sets `inspection: 'Inspected'` and collapses the panel |
| Inspector Note textarea | `:1258-1264` → `setNote` `:281` | |
| `Capture` on Returning person / Warehouse staff | `:819-820` → `captureSignature` `:268-278` | writes `{name, role, at}` into state with a literal timestamp (`:275`) |
| Not-Returned decision `<select>` | `:835-845` → `setDecision` `:280` | records the decision in state; no gate reads it |
| `Resolve →` on a failing gate | `:726` | expands the offending unit's panel (`:311`, `:318`, `:325`, `:333`) |
| Filter chips, search input | `:548-568`, `:520-526` | filtering only |
| `Cancel Return` | `:890-896` | `navigate` away; records nothing |

Buttons and affordances with **no handler at all**:

- `Print Return Report` — `<Button icon="file">` with no `onClick` (`:462`); `Button`'s `onClick` is optional (`src/components/ui/Page.tsx:120-134`).
- `Print`, `Share`, `More` in Quick Actions — `<button type="button">` with no `onClick` (`:858-866`).
- Witness `Capture` — `disabled`, no handler, wrapped in `Unavailable` with `WITNESS_UNAVAILABLE` (`:822` → `SigRow` `:975-979`; reason string at `:103-104`; component at `src/components/ui/Unavailable.tsx:35`).

Side effect not routed through the dispatcher: `BarcodeScannerModal` emits `EVENT_TYPES.INVENTORY_RETURNED` on the event bus and shows `Successfully returned: …` on every successful scan match (`src/components/ui/BarcodeScannerModal.tsx:130-158`), before calling `onItemScanned` — the event fires for a receipt that was never written.

## 5. Gates

**Route reachability.** `/rentals/:bookingNo/return` is mounted at `src/App.tsx:208-218` inside `BookingShell`. The Shell holds during session restore (`App.tsx:964-970`) and redirects to `/login` when `user` is null (`App.tsx:973-975`). Its only role gate is `!canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`), and `MONEY_ROUTES` is `['/finance','/reports','/admin','/tools/pricing','/tools/depreciation']` (`src/data/nav.ts:147-153`) — `/rentals/...` is not among them. **Every signed-in role reaches this route,** Client included.

**Action-level role gate.** The dispatch requires `operations.perform` → `canPerformOperations` → Owner, Admin, Manager, Warehouse, Technician (`src/lib/rbac.ts:291-293`). Coordinator, Accounts, Driver and Client fail at `core.ts:236-241` with `ActionPermissionError`; the five permitted roles get past that and then fail at `validate` (§4). Either way the outcome is a failure, with different text.

**Money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not imported** by this file, and neither is `lib/money` — verified across `:1-42` and by the absence of any `Rs`/`Paisa` value in the render. Nothing on the page is gated on money visibility because nothing on the page is a money value.

**What is absent under Law 6.** `src/data/returnInspection.ts` models no Paisa value at all (`returnInspection.ts:67-77`). The late-return consequence is rendered as words only — `bandConsequence` returns "A full rental day is chargeable. Finance decides whether to apply it." with no figure (`src/lib/lateFee.ts:253-264`), and `lateBand` delegates to `lateFee` with a zero rate specifically so no amount comes back (`lateFee.ts:243-250`). Gate 5 reads `Damage approval required` with no amount (`:331`). `BOOKING` is imported whole (`:20`) and carries `outstanding` and `depositPending` (`src/data/booking.ts:133-134`), but this page reads only `.no` and `.client`. So the money is never rendered here rather than masked.

## 6. States drawn

`PageBody` is not imported (`:1-42`). Of the four:

- **Loading — none in this file.** No fetch happens on this page, so there is nothing to wait on. The only loading UI in the path is the Shell's Suspense fallback for the lazy chunk (`App.tsx:1026`) and its `Restoring session…` hold (`App.tsx:964-970`).
- **Error — the shared `ErrorBanner`** (`src/components/ui/StateViews.tsx:171`) rendered inline and persistent above the footer at `:886`, driven by `dispatchError` (`:159`). No toast.
- **Empty — hand-rolled, two of them,** neither using `EmptyState` (`StateViews.tsx:34`): `No items match these filters.` in the phone list (`:578-582`) and in the table (`:690-696`). `Items Not Returned` has its own zero-state line, `No items are Not Returned.` (`:827`), as does the accessory panel, `No accessory checklist on this item.` (`:1212`), and the damage panel, `No damage recorded.` (`:1251`).
- **Restricted — none in this file.** The only `RestrictedState` in the path is App-level and applies to money surfaces only (`App.tsx:1020-1023`), which `/rentals/...` is not.

A fifth state exists that is none of the four: `BookingNotLoaded` (`:412-414`, component at `src/modules/operations/BookingNotLoaded.tsx:27`), shown for any booking number other than `B-715`.

## 7. Known gaps

1. **The one write on this page always fails.** `completeSession` sends `lines: []` (`:381`); `validateFloorVerb` refuses an empty list (`src/actions/rentals/floorVerb.ts:389-394`). The component's own comment states the reason and calls it deliberate — the ids come from `data/returnInspection`'s seed rather than `booking_lines` (`:346-371`). So `Complete Session` / `Complete Return` ends in the `ErrorBanner` for every role that clears the permission check.
2. **Nothing on this page records an inspection anywhere.** Condition, accessories, damage evidence, approval routing and the inspector note all live in `useState` (`:161-163`, `:201-247`) and are lost on reload. The write path that would carry them exists — `return_lines.condition` / `inspection_state` / `inspected_by` / `inspected_at` are written by `writeReturnLine` (`floorVerb.ts:773-780`) from `FloorLineInput.condition` — and this page never populates that field, because it never sends a line.
3. **`TODO(decision)` — the inspection capabilities are deliberately unmapped.** `core.ts:66-71` and `:181-185`: `inspection.create`, `inspection.pass`, `inspection.fail` have no case in `checkCapability`, so they fall to `default: return undefined` (`core.ts:215-216`) and are denied for every role including Owner. Their three actions (`src/actions/inspections/startInspection.ts:10`, `passInspection.ts:10`, `failInspection.ts:10`) declare no `implemented`, so they are stubs too — `core.ts:223-224` fails them closed. This page dispatches none of them, so the gap blocks nobody today.
4. **`startReturn` is a stub this page never calls.** `src/actions/rentals/startReturn.ts:9-10` declares `START_RETURN` on `rental.return` with no `implemented` line — a stub (`core.ts:223-224`). Its capability *is* mapped (`core.ts:198` → `canWriteFloor`, `rbac.ts:227-229`), so the only thing stopping it is the missing body. This workspace opens a return with no dispatch at all.
5. **The six session gates can be satisfied entirely from local state.** Gate 2 by `Save Inspection` (`:242-247`), gate 3 by the accessory toggles (`:235-240`), gate 4 by an integer counter (`:642`), gate 5 by a boolean flip (`:643`), gate 6 by `Capture` (`:268-278`). Nothing records who inspected, photographed, routed or signed. `floorVerb.ts:76-82` states the matching truth from the write side: it "does not evaluate the six session gates … they belong in the triggers `0003` marks TRIGGER REQUIRED and has never had", carrying its own `TODO(decision)`.
6. **Signature and receipt timestamps are literals.** `captureSignature` stamps `'19 Jul 2026, 10:19 AM'` on every capture (`:275`) and `scan` stamps `'19 Jul 2026, 10:16 AM'` on every receipt (`:214`) — the same defect the file already corrected for `closedAt`, which now uses `formatAdDateTime(occurredAt)` (`:385`, function at `src/lib/bs.ts:128-134`, whose own header names the literal-stamp defect these two still carry).
7. **Expected and Actual Return show the same BS date.** `:395-396` computes both from `new Date('2026-07-19')`, so the two strip cells differ only in their AD time suffix (`:478-479`), while `Actual Return` carries `tone: 'var(--danger-text)'` unconditionally (`:479`) whether or not the return was late.
8. **The phone layout and the desktop layout disagree about `Not Returned`.** In the table, `Not Returned` renders only while `u.state === 'Picked Up'` (`:1076`); on the phone card the same button renders for every state and calls `markMissing` on an already-Returned unit (`:618-624`), leaving `condition` and `ret` in place on a unit now flagged Missing.
9. **`undoMissing` is a partial reversal.** It drops `decision` and resets `state` to `'Picked Up'` (`:225-231`) but leaves `inspection`, `condition` and `ret` untouched, so an undone unit can still count as inspected. There is no compensating action anywhere under `src/actions/rentals/` if a write had landed.
10. **The Not-Returned decision is recorded and never used.** `setDecision` (`:280`) writes it into unit state and the `<select>` shows it (`:835-845`); no gate reads it, and it is not sent anywhere — while `floorVerb.ts:415-421` refuses a `'missing'` line that carries no `notReturnedDecision`. The one field the write path insists on is the one field this page keeps to itself.
11. **Gate 1 asks a question that cannot fail as written.** `:305` passes when `sessionUnits.length > 0`, i.e. when at least one unit carries `sessionId === 'S2'` — which the seed already satisfies (`returnInspection.ts:179-204`). Its label claims "scanned and serial-verified"; no serial verification happens anywhere in the file.
12. **`Equipment In` chip is unconditional** (`:426-428`) — it renders identically whether nothing, some, or all of the booking is back.
13. **Four dead controls.** `Print Return Report` (`:462`) and `Print` / `Share` / `More` (`:858-866`) are buttons with no `onClick`.
14. **The Witness row cannot be signed at all** (`:822`, `:975-979`). The file argues this deliberately at `:249-267` — no witness identity is captured anywhere on the screen, so the row renders `Optional — no witness recorded` with a disabled `Capture` and the reason attached. Recorded as a gap only because the seeded `ReturnSession.signatures` type still admits a `witness` key (`returnInspection.ts:159`) that nothing can ever populate.
15. **Scanner asserts a receipt that was not recorded.** `BarcodeScannerModal.tsx:130-158` prints `Successfully returned: …` and emits `INVENTORY_RETURNED` on the domain bus before `onItemScanned` runs; `onItemScanned` here only mutates React state (`:941-943`). The event says gear came back; nothing was written.
16. **Only one booking has data.** `:412-414` renders `BookingNotLoaded` for anything but `BOOKING.no`; `BookingNotLoaded.tsx:8-21` records that the Floor queue on `/operations` navigates here with real booking numbers, all of which land on this state.
17. **The write path cannot set `actual_return_at` even if it ran.** `floorVerb.ts:83-86` carries a `TODO(decision)`: `bookings` is Booqable-mastered and the generic write path refuses that column. This page renders an Actual Return cell (`:479`) sourced from a seed constant whose own comment says the same thing (`src/data/booking.ts:87-88`).
18. **`TODO(decision)` §4.36 sits on the audit row for this verb.** `floorVerb.ts:609-639`: `operation_sessions` carries no audit trigger, and a failed `logAuditEvent` is reported to the console while the verb proceeds. Whether that should fail the return is unruled; this page would surface only the console line.
19. **The component header cites specs the code contradicts, and says so.** `:44-81` and `returnInspection.ts:1-87` record that `Return Workflow.md` still uses retired "Stage 6–11" numbering and invents `Partial Return` / `Late Return` flags absent from `FLAGS` (`src/lib/workflow.ts:211-224`). The code follows `workflow.ts`, not the spec: no stage number and no such flag appears, and the overrun renders as plain text (`:502-508`).
