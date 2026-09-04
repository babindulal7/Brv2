# New Rental
Route `/rentals/new` · `src/modules/rentals/NewRental.tsx` · 3177 lines

Status: **Seed-only**

---

## 1. What it is

The booking workspace. Lazily imported at `src/App.tsx:27` and mounted at `/rentals/new` inside `Shell` with the crumbs "Rentals List → New Rental" (`src/App.tsx:176-183`), declared before `/rentals/:bookingNo` so `new` is not read as a booking id (`src/App.tsx:175`).

Six collapsible sections down a main column plus a rail; every figure on it is computed from constant arrays in `src/data/*.ts` and from literals held in component state (`NewRental.tsx:1180-1281`). The page holds the entire booking in React state and has **no persisted row until Confirm**. Confirm Booking is wired: `confirmBooking` dispatches `createRental` (one `create_booking` RPC — header, lines, discounts, crew and transport) and then `confirmRental` on the id that comes back. What used to be true — the long comment saying it dispatched nothing because the client ids are `C-1`-style codes and the equipment ids are not `products.id` uuids — is now a set of *pre-flight refusals* inside `confirmBooking`: it refuses, with a stated reason and before any write, when the selected client carries no `dbId` or when any line's id is not a uuid.

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` — title "New Rental", description `<client name> · <project type>` | `NewRental.tsx:2250-2283`; component `src/components/ui/Page.tsx:66` |
| 1a | Header: status chip reading `Quote · Draft` | `NewRental.tsx:2255-2260` |
| 1b | Header: `Save Draft` ghost button (label becomes "Saving…") | `NewRental.tsx:2261-2263` |
| 1c | Header: `OperationsMenu`, rendered **disabled** with reason "Operations become available once the booking is Confirmed." | `NewRental.tsx:2265-2273`; component `:428-529` |
| 1d | Header: `SendQuoteMenu` split button → Email to client · Download PDF · Copy link · Print | `NewRental.tsx:2274`; component `:543-655` |
| 1e | Header: `Cancel` button, opens one of two dialogs depending on `draftPersisted` | `NewRental.tsx:2278-2280` |
| 2 | Inline error paragraph, only when `actionError` is set | `NewRental.tsx:2290-2295`, style `:250-259` |
| 3 | Status strip card, 4 cells: Client · Dates (BS over AD) · Stage · Rental Outstanding | `NewRental.tsx:2302-2328`, cell component `:658-685` |
| 4 | Two-track grid `minmax(0,1fr) auto` — main column + sticky rail | `NewRental.tsx:2330-3019` |
| 4a | Section 0 **Client** — `ClientCombobox` whose trailing slot carries one control: the add-client button while no client is selected, the health eye once one is. Then `Client History`; then Project · Project Type · Government ID / PAN | `NewRental.tsx:2339-2406` |
| 4b | Section 1 **Dates** — two `DateTimeField`s (Out, Return) and a read-only Days figure | `NewRental.tsx:2412-2446` |
| 4c | Section 2 **Equipment, Bundles & Services** — `AddItemPanel`, a conflict strip, the line table (parent-first, children nested), then Items · Bundles · Rental Days · Equipment Subtotal | `NewRental.tsx:2448-2626` |
| 4d | Section 3 **Crew** — `CrewSearch`, a roster combobox rendered in the section body (the header slot holds no control), crew table with per-row expand for Overtime / Meals / Accommodation, Crew Subtotal, `Clear crew` | `NewRental.tsx:2630-2750` |
| 4e | Section 4 **Delivery** — Delivery Type select, Delivery Charge, Fuel Charge, Transport Total | `NewRental.tsx:2755-2811` |
| 4f | Section 5 **Pricing & Payments** — three blocks: Rental Charges (+ Discount % field and the Law 10 approval pair), Payments — rental only, Payment History | `NewRental.tsx:2817-2959` |
| 4g | Save-state line: "Saving…" / "Not saved" / "Offline · Changes saved locally" / "All changes saved" | `NewRental.tsx:2968-2993` |
| 5 | Sticky rail (`Rail width={300}`), desktop only: Summary card → Blocking notices card → Confirm Booking → Quick Actions → Review · n/8 → Documents → Warnings & information → Activity Timeline | `NewRental.tsx:3009-3018`; cards at `:1914-1997`, `:2009-2042`, `:2053-2064`, `:2066-2231` |
| 6 | `FooterNote` with the extra "Sections are not a wizard — any order, one Confirm" | `NewRental.tsx:3039` |
| 7 | Disclosures (no route change): `ClientQuickView` `:3095-3104`, `ClientHistoryDrawer` `:3105-3115`, `AddClientModal` `:3119-3128`, `DraftEmailModal` `:3132-3140`, two `ConfirmDialog`s `:3148-3174` |

All six sections render through one `Section` component (`NewRental.tsx:373-418`); collapsed sections show a one-line summary in the header instead of the body.

### Responsive bands the file actually reads

The page reads **both** locked breakpoints. `useViewport()` (`NewRental.tsx:1074`, engine `src/lib/device.ts:57`) is driven by `matchMedia` over `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`, `:64-65`). The page additionally reads `BREAKPOINT.phone` (768) directly, once, in the accordion's lazy initializer (`NewRental.tsx:1131`). No other breakpoint appears in the file.

- **≥1180 (desktop)** — main + sticky rail (`:2333`, `:3009-3018`); status strip is `repeat(3,1fr) minmax(0,1.15fr)` with money or `repeat(3,1fr)` without (`:1643-1649`); Client section field grid is 3 columns (`:2384`); Pricing renders 3 blocks side by side (`:2828`); no sticky bottom bar.
- **768–1179 (tablet)** — single column (`:2333`); the rail does not hide, it reflows into a 2-column grid below the workspace (`:3032-3037`); the blocking-notices card detaches and renders immediately above the bar (`:3051`); a sticky bottom bar appears carrying Rental Total + Outstanding + Confirm Booking (`:3055-3092`); status strip drops to 2 columns (`:1647`) with Outstanding spanning full width (`:2323`); Client fields 2 columns (`:2384`); Pricing 2 columns (`:2828`); Delivery 2 columns (`:2762`).
- **<768 (phone)** — everything above, plus the sections become an accordion with **one open at a time** (`phoneAccordion` `:1129`, `toggle` `:1147-1154`); initial open state is `[false,false,true,false,false,false]` — Equipment only (`:1131-1133`); an effect collapses to a single open section when the band is entered (`:1135-1146`); status strip and rail cards go to 1 column (`:1649`, `:3033`); Client fields, Dates, Delivery and Pricing all go to 1 column (`:2384`, `:2423`, `:2762`, `:2828`).

Both tables set a `minWidth` inside an `overflowX: auto` wrapper rather than reflowing — equipment `minWidth: 860` (`:2492-2493`), crew `minWidth: 500` (`:2656-2657`). `useTabularLayout()` (`device.ts:139`) is not called on this page.

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Client combobox, selected client, client name in header/strip | SEED | `CLIENTS_DATA`, an array literal at `src/data/clients.ts:171`, copied into `clientPool` state at `NewRental.tsx:1160`. A fresh draft selects **no** client — `selectedClientId` starts `null`; it used to default to `CLIENTS_DATA[0]`, which both contradicted "a new booking starts empty" and vanished silently once the live pool replaced the seed. `ClientCombobox` imports the same array itself (`booking/ClientCombobox.tsx:44`) |
| Client health eye, quick view, history drawer | SEED | `clientHealth()` (`booking/clientHealth.ts`, called `NewRental.tsx:1637`) computes off the same `ClientRecord`. Its own header says every threshold is a placeholder (`clientHealth.ts:54`) and that none of the signals can be derived from the current seed layer (`clientHealth.ts:128`, `:159`, `:188`) |
| Equipment catalogue and the three default lines | SEED | `EQUIPMENT_CATALOGUE` is flattened at module load from `PARENTS` (`src/data/inventory.ts:475`) at `NewRental.tsx:118-144`; the opening three lines are picked at `:1229-1239` |
| Add Item panel results (bundles, equipment, accessories) | SEED | `booking/itemCatalogue.ts:54-59` reads `INVENTORY_MODELS` (`src/data/addBundle.ts:125`), `BUNDLES`/`ACTIVE_BUNDLES` (`src/data/bundles.ts:173`, `:498`), `bundlesUsing` (`src/data/addEquipment.ts`) and `PARENTS`/`CATEGORY_OPTIONS` (`src/data/inventory.ts:475`, `:693`) |
| Add Item ▸ Services tab | — | No source at all. `SERVICES_UNAVAILABLE_REASON` (`itemCatalogue.ts:466`) states there is no service catalogue in this build |
| Crew roster, roles, day rates | SEED | `CREW_ROSTER` (`src/data/crew.ts:102`); three members (`CR-001`, `CR-005`, `CR-007`) are preselected at `NewRental.tsx:1252-1253` |
| Availability pill / conflict strip | SEED | Each row's `status` and `booking` fields off the `PARENTS` tree (`NewRental.tsx:134-143`), styled through `INV_STYLE` (`src/data/inventory.ts:59`) |
| VAT rate | SEED | `getSetting('vatRatePercent')` (`src/lib/settingsStore.ts:381`) read once per mount at `NewRental.tsx:1276` via `readVatRatePercent` `:89-92`. Not a `src/data/*.ts` array — the figure is the constant default `13` at `settingsStore.ts:103`, overridable only in this browser's `localStorage` |
| Deposit required / received, Advance payment | SEED | Hardcoded in the component, not in any data file: `rupees(50000)`, `rupees(25000)`, `rupees(15000)` at `NewRental.tsx:1279-1281` |
| Project, Project Type, pickup/return dates and times | SEED | Literals at `NewRental.tsx:1180-1184` and `:1191-1192` |
| Booking discount %, per-line discount, per-line days | SEED | `7` at `:1267`, `5` at `:1238`, `3` at `:1223` |
| Stage chip `Quote · Draft` | SEED | Hardcoded `status`/`flag` at `NewRental.tsx:1105-1106` |
| Documents card tiles | SEED | Hardcoded five-tile array at `NewRental.tsx:1719-1725` |
| Activity Timeline | SEED | Hardcoded two-row array including the actor name "Ramesh Dulal" at `NewRental.tsx:2216` |
| Payment History block | — | Nothing rendered; `EmptyState` with an explanation (`NewRental.tsx:2946-2949`). The comment at `:2919-2944` records that a fabricated two-row table was removed |
| All money arithmetic | engine, not data | `price()` (`src/lib/money.ts:125`) called at `NewRental.tsx:1310-1323`; per-line amounts by `lineAmountPaisa` `:169-171` |
| Anything served by the local corpus | LOCAL — **not used** | `src/lib/mock/corpus.ts` serves `clients`, `products`, `product_units`, `bookings`, `booking_lines`, `booking_crew_lines`, `invoices`, `payments`, `security_deposits` (`corpus.ts:405-423`). This page imports no `lib/queries/*` module and no corpus module, so none of those rows reach it |
| Client creation from the add-client control in the field's trailing slot (or the combobox's "Create New Client" row) | DB | The only real write reachable from this route: `idempotentInsert('clients', …)` (`src/actions/clients/createClient.ts:389`) after `supabase.rpc('next_document_number', { p_sequence_key: 'client' })` (`:338`), dispatched from `booking/AddClientModal.tsx:617` |

Invented on this page: the client list and every client balance/credit figure, the whole equipment catalogue and its rates, statuses and locations, the crew roster and day rates, the deposit required (Rs 50,000), the deposit received (Rs 25,000), the advance paid (Rs 15,000), the 7% booking discount, the 5% line discounts, the 3-day line duration, the pickup/return dates and times, the project name and type, the `Quote · Draft` stage, the two Activity Timeline rows and their actor, and the five Documents tiles — every rupee shown on this screen is derived from those.

---

## 4. Actions and writes

| # | Control | Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|---|---|
| 1 | `Save Draft` (header, `:2261`) | `saveDraft({ id: 'draft-new' }, ctx)` at `NewRental.tsx:1486` | `rental.draft` | `src/actions/rentals/saveDraft.ts:8-36` | **false** (never set; default `false` at `core.ts:89`) | **Yes** — `core.ts:188` → `rbac.canWriteBookingDesk` (`rbac.ts:215`) |
| 2 | `Cancel` → "Cancel booking" dialog (`:3164-3174`) | `cancelRental({ id: 'draft-new', reason }, ctx)` at `NewRental.tsx:1608-1610` | `rental.cancel` | `src/actions/rentals/cancelRental.ts:8-36` | **false** (never set) | **Yes** — `core.ts:189` → `rbac.canWriteBookingDesk` |
| 3 | `Confirm Booking` (rail and sticky bar) | `createRental(payload, ctx)`, then `confirmRental({ id }, ctx)` on the returned booking id — both in `confirmBooking` | `rental.create`, then `rental.confirm` | `src/actions/rentals/createRental.ts`, `src/actions/rentals/confirmRental.ts` | **true** for both (`createRental.ts:312`, `confirmRental.ts:302`) | **Yes** — `core.ts:187` → `rbac.canWriteBookingDesk`; `core.ts:160` → `rbac.canConfirmRental` |
| 4 | Add a new client (trailing-slot button, or the combobox's "Create New Client" row) → `AddClientModal` Save | `createClient(payload, ctx)` at `booking/AddClientModal.tsx:617` | `client.create` | `src/actions/clients/createClient.ts:256-461` | **true** (`:274`) | **Yes** — `core.ts:163` → `rbac.canCreateClient` (`rbac.ts:145`) |

Statements of what each one does, in the terms the code supports:

1. **Save Draft** — renders, dispatches `SAVE_DRAFT`, action is a stub (`core.ts:223` throws `ActionNotImplementedError` before the permission check, before `validate` and before `execute`). The page catches it, sets `saveState = 'error'` and writes the message into the inline error line (`NewRental.tsx:1508-1512`). `showSuccessToast('Draft saved', …)` is on the resolved path only (`:1500-1507`), so the toast cannot fire; `draftPersisted` therefore never becomes true, and the second Cancel behaviour is unreachable in this build.
2. **Cancel (post-save)** — renders, dispatches `CANCEL_RENTAL`, action is a stub (`core.ts` fails it closed). Unreachable today because `draftPersisted` (`:1473`) only flips inside the `saveDraft` success path.
3. **Cancel (pre-save)** — `discardDraft` (`:1575-1578`) closes the dialog and calls `navigate('/rentals')`. Dispatches nothing; nothing is persisted, so nothing is lost server-side.
4. **Confirm Booking** — returns early if `confirmBlocked`, refuses without a session, then runs four pre-flight refusals that each set an error string and return without writing: no `client.dbId` (the selected client is sample data), no lines, `!canBookingMoney` (Law 6 hides rates, so every line would persist at Rs 0), and any line whose id is not a uuid. Past those it mints one Law 8 idempotency key for the press, reads the operator's `branch_id` off their `users` row, and awaits `createRental` — which returns a **Quote** — then `confirmRental` on that Quote's id. `CreateRentalPartialError` and a failure between the two writes are both caught and reported by name, and a retry of the same press confirms the same Quote rather than creating a second. `navigate('/rentals')` runs only when both writes land.
5. **Add a new client** — the one dispatch on this route that can complete. `createClient` mints its idempotency key at the press (`AddClientModal.tsx:614`, `newClientUuid` from `lib/supabase`), and `execute` inserts into `clients`. Note the action file's own header (`createClient.ts:59-66`) still says `client.create` resolves to no rule and is denied for every role — that text is stale; `core.ts:163` maps it.

`newClientUuid` is imported by `NewRental.tsx` as well as by `AddClientModal.tsx:13`: `confirmBooking` mints one key per Confirm press and one per discount, crew and transport row, so a double-click replays the same `create_booking` instead of minting a second booking.

Buttons with no handler, or handlers that do nothing:

- **Receive Payment** and **Receive Deposit** (rail Summary, `NewRental.tsx:1992-1993`) — `<Button icon="dollar" variant="secondary">` with no `onClick`. The comment at `:1099-1101` says so outright.
- **Quick Actions ▸ Share** and **▸ More** (`:2071-2087`) — `onClick={a.label === 'Print' ? () => window.print() : undefined}` at `:2082`, so only Print does anything.
- **Operations menu items** — Assign Crew / Extend Rental / Create Sub-Rental (`:2268-2272`); each item's `onClick` only closes the menu (`:502`), and the button is `disabled` at `:2266`, so the menu never opens.
- **Send Quote ▸ Download PDF** and **▸ Copy link** (`:565-566`) — no `onClick`, therefore `disabled={!it.onClick}` (`:622`), each with a stated reason.
- **Draft email ▸ Send** (`:3139`) — calls `showSuccessToast('Email queued', …)`. `DraftEmailModal.tsx:5-12` states there is no email backend in this build, so this is a success message for work that was not done. `useToast()` exposes only `showSuccessToast` (`src/components/ui/Toast.tsx:27`).
- **Notice action buttons** (`:2031`, `:2181`) — `runNoticeAction` (`:1677-1699`) only navigates, opens the quick view, jumps to a section, or scrolls to the rail. No write.

---

## 5. Gates

**Who reaches the route.** `Shell` (`src/App.tsx:943`) requires a session — no user redirects to `/login` (`App.tsx:973-975`) — and refuses money surfaces to money-blind roles (`App.tsx:993`). `isMoneySurface('/rentals/new')` is **false**: `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`). `NewRental.tsx` contains no `isStaff` check and no role guard of its own. So **every signed-in role reaches this page**, including `Warehouse`, `Technician`, `Driver` and the external `Client` role.

**Money visibility.** The page does **not** call `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24`). It uses the field-level gate: `gateContext(role)` + `canViewMoneyField` (`src/lib/fieldGating.ts:41`, `:67`) at `NewRental.tsx:1085-1088`, with `role = user?.role ?? 'Client'` (`:1084`). Three flags result:

| Flag | Field class | True for |
|---|---|---|
| `canBookingMoney` | `'booking'` | Owner, Admin, Manager, Accounts (`MONEY_FULL`, `fieldGating.ts:53`) and Coordinator (`:60`, `:71`) |
| `canCrewMoney` | `'asset-finance'` | Owner, Admin, Manager, Accounts only — Coordinator excluded (`fieldGating.ts:71`) |
| `canClientBalance` | `'client-balance'` | Same set as `canBookingMoney` |

**Hidden under Law 6 when `canBookingMoney` is false** (Warehouse, Technician, Driver, Client) — omitted from the DOM, not masked:

- the Rental Outstanding strip cell (`:2316-2327`);
- the equipment table's Rate / day, Disc. and Amount columns — the column list itself is a different array (`:1732-1751`), the row cells at `:1833-1852` and the group parent's cells at `:2553-2559`;
- Equipment Subtotal (`:2619-2624`);
- Delivery Charge, Fuel Charge and Transport Total (`:2774-2797`, `:2804-2808`);
- the whole Pricing & Payments section (`:2817`);
- the rail's Summary card (`:1914`, ternary returns `null`);
- the sticky bar's Rental Total and Outstanding (`:3072`);
- the outstanding / deposit warning alerts (`:1357`, `:1375`, `:1378`);
- prices inside Add Item (`showPrices={canBookingMoney}`, `:2466`);
- client outstanding in the combobox and drawers (`showOutstanding` `:2360`, `showMoney` `:3102`, `:3113`).

**Hidden when `canCrewMoney` is false** (Coordinator): the crew table's Day Rate / Days / Amount columns and the per-row expand (`:2660`, `:2680-2703`), the expanded Overtime/Meals/Accommodation row (`:2705`), Crew Subtotal (`:2728-2734`), the rail Summary's Crew row (`:1917`), and Pricing's Crew Charges row (`:2840`).

**Recording money.** `canTakePayment = canRecordPayment(user.role)` (`NewRental.tsx:1103`; rule at `src/lib/rbac.ts:296` — Owner, Coordinator, Accounts, and false offline) gates the two rail buttons at `:1990`. Admin and Manager see the figures and not the buttons. Both buttons are inert regardless (§4).

The delivery-notice text is deliberately not gated on `canTakePayment` (`:1360-1374`), so a Manager still reads "Receive Deposit" / "Receive Payment" as the action label on notices whose target card has no such button — logged as a TODO at `:1369`.

---

## 6. States drawn

`src/components/ui/PageBody.tsx` is **not imported** by this page (0 occurrences).

- **Loading — none on the page.** The page performs no async fetch; every source is a module-level constant. The only loading state is route-level: `Suspense fallback={<LoadingSkeleton type="card" label="Loading…" />}` while the lazy chunk resolves (`src/App.tsx:1026`, chunk at `:27`). The in-page "Saving…" indicators (`:2262`, `:2969-2973`) report a dispatch in flight, not a page load.
- **Error — present, hand-rolled.** `ErrorBanner` (`StateViews.tsx:171`) is not used. Instead: the inline `actionError` paragraph (`:2290-2295`) with `inlineErrorStyle` (`:250-259`); the blocking-notices card listing every reason Confirm is refused (`:2009-2042`); the save-state "Not saved" line (`:2974-2981`); and field-level errors through `Field`'s own `error` slot (`:347-350`) at Government ID / PAN (`:2393`), Return date (`:2436`) and the client combobox (`:2361`).
- **Empty — present, shared `EmptyState`** (`src/components/ui/StateViews.tsx:34`), five call sites: no blocking notices (`:2015`), no warnings (`:2159`), no equipment lines (`:2593`), no crew (`:2740`), no payments (`:2946`).
- **Restricted — none.** `RestrictedState` (`StateViews.tsx:213`) is not imported. A money-blind role gets a silently reduced page — no statement that anything was withheld, and no "ask X" pointer.

---

## 7. Known gaps

**`TODO(decision)` markers in the file**

| Line | What is open |
|---|---|
| `NewRental.tsx:1202-1208` | The UI label `Client Pickup` vs the Postgres `delivery_type` / `delivery_method` enums, which spell the member `'Customer Pickup'`. Whoever wires a real write must map label → enum value |
| `NewRental.tsx:1369-1373` | For a role that may see booking money but may not record a payment (Admin, Manager), the two warning notices still read "Receive Payment" / "Receive Deposit" while the card they scroll to has no such button |
| `NewRental.tsx:1495-1498` | `{ id: 'draft-new' }` is a placeholder — the screen has no persisted row to name |
| `NewRental.tsx:1596-1606` | The cancel reason is sent in the payload but `CancelRentalInput` is `{ id: string }` with no `reason` field (`src/actions/rentals/cancelRental.ts:4-6`), so the reason rides along undeclared |
| `NewRental.tsx:1963-1975` | "Advance due" has no source anywhere in the build; the row renders the words "not tracked yet" (`:1982`) |

**Stubs and dead controls**

- `saveDraft` and `cancelRental` are stubs — neither file sets `implemented`, so `core.ts:223` fails them closed (`saveDraft.ts:8`, `cancelRental.ts:8`). Both still carry the `console.log('[DB TX] …')` line (`saveDraft.ts:17`, `cancelRental.ts:17`) that `core.ts:9-18` describes as the removed pattern; it is harmless only because the dispatcher never reaches `execute`.
- Receive Payment / Receive Deposit have no `onClick` (`:1992-1993`).
- Quick Actions ▸ Share and ▸ More have no `onClick` (`:2082`).
- Operations menu items are inert and the menu is permanently disabled on this screen (`:496-524`, `:2266`).
- Send Quote ▸ Download PDF and ▸ Copy link are disabled with a stated reason (`:565-566`).

**Success claimed for work not done**

- `DraftEmailModal`'s Send fires `showSuccessToast('Email queued', '<doc> will be sent to <email>.')` (`NewRental.tsx:3139`) while `DraftEmailModal.tsx:5-12` records that no email backend exists. Nothing is queued anywhere.
- The Activity Timeline hardcodes "Draft created — by Ramesh Dulal" (`:2216`), an actor nobody signed in as, on the same screen whose Payment History block was rewritten specifically to remove a fabricated collector (`:2919-2944`). Same defect class, one card away.
- Documents marks Quote `ready: true` (`:1720`) on a booking that has never been saved, and the ✉ button composes an email about it (`:2137`).

**Contradictions between comments and code**

- `NewRental.tsx:1117-1128` states the accordion reads `viewport` "not `window.innerWidth`", and that the imperative read "gave the right answer only at mount". The lazy initializer at `:1131` still reads `window.innerWidth < BREAKPOINT.phone`; only `toggle` was converted. The effect at `:1135-1146` collapses to one open section on entering the phone band and never re-expands on leaving it.
- `src/actions/clients/createClient.ts:59-66` asserts that `client.create` resolves to no rule and that every dispatch through it is denied before `execute`. `src/actions/core.ts:163` maps it to `rbac.canCreateClient`. The header is stale and understates what the New Client button can do.
- `core.ts:45-51` claims the capability matrix resolves 32 of 35 strings; both capabilities this page dispatches (`rental.draft`, `rental.cancel`) are among the resolved ones, so the refusals on this screen are **build gaps, not permission gaps** — the error text the operator reads (`core.ts:99-101`) says exactly that.

**Behavioural gaps found while reading**

- `reviewItems` sets Documents to `ok: false` unconditionally (`:1712`), so "Review · n/8" can never reach 8/8 (`:2096`).
- The Delivery section declares a two-column grid (`:2762`) with a single child (`:2763-2809`); the right half is always empty at tablet and desktop.
- The default lines are filtered to `status === 'In Stock'` (`:1233`), so `conflictLines` (`:1332`) is empty by construction on first paint and the conflict strip always opens green.
- The crew picker's selectable `<option>Add Member…</option>` placeholder is gone with the `<Select>` — `CrewSearch` replaced it. What survives is worse and real: five of the roster's eight roles (`Director of Photography`, `1st AC`, `2nd AC`, `Drone Operator`, `DIT` — seven of the twelve people) are not `crew_role` enum members, so `createRental` refuses them by name (`CREW_ROLES` in `src/actions/rentals/createRental.ts`, checked in its `validate`). The page imports that same list and derives the warning from it: the picker states the reason on each affected row rather than hiding the person, and an assigned person carrying one of those roles raises a **Critical** blocking notice, so Confirm is refused with the person named instead of throwing. The mismatch itself is a `TODO(decision)` in `NewRental.tsx`.
- `days` (`:1283-1288`) is a whole-day difference and never consumes the pickup/return times captured at `:1191-1192`; the comment at `:1185-1190` states this is deliberate and unfixed.
- A line's `days` seeds to the literal `3` (`:1223`) and never re-syncs with the booking's computed `days`, so a line can price for 3 days on a 10-day booking until its stepper is touched.
- `readVatRatePercent()` runs once per mount (`:1276`), so a VAT rate changed in Settings during a session does not reach an open booking.
- `deliveryType`'s union (`:1210`) depends on the `<option>` elements at `:2770-2771` carrying no explicit `value`, so their text *is* the value; the §9.2 zeroing comparison at `:1307` matches on that string. Renaming the label silently breaks the zeroing.
