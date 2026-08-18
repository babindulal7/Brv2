# Booking Detail
Route `/rentals/:bookingNo` · `src/modules/rentals/BookingDetail.tsx` · 2197 lines

Status: **Seed-only**

---

## 1. What it is

The single-booking workspace. Lazily imported at `src/App.tsx:26` and mounted at `/rentals/:bookingNo` inside `BookingShell` (`src/App.tsx:246-253`), which builds the crumb trail from the route param (`src/App.tsx:929-935`). One default export, `BookingDetail()` (`BookingDetail.tsx:679`), plus nine file-local helpers: `SubRentedMark` (`:90`), `subRentedRowStyle` (`:118`), `actionCtx` (`:135`), `ItemBadge` (`:153`), `Stepper` (`:225`), `dotTone` (`:345`), `OperationsLauncher` (`:382`), `OverflowMenu` (`:419`), `Segmented` (`:548`), `Block` (`:602`), `transportValue` (`:652`) and `Fact` (`:2169`).

The screen queries no table. Every figure, line, date, document, alert and timeline entry is a module constant imported from `src/data/booking.ts` (`:34-62`). The URL param is read (`:688`) and used for the page title (`:1087`) and as the id passed to the modals and the operations shell — but the body of the page renders the one seeded booking `B-715` regardless, and says so in a banner when the two disagree (`:1068-1084`).

Five dispatches leave this screen, all through `src/actions/`; two more are inert alert buttons. Nothing on the page reads or writes through `src/lib/queries/`.

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | Amber `role="status"` notice — "Showing the seeded record for B-715…". Renders only when `bookingNo !== BOOKING.no` | `:1068-1084`; `isSeeded` `:691` |
| 2 | `PageHeader` — title is the **route param** (`id`), description is `${BOOKING.client} · ${BOOKING.kind} · ${BOOKING.place}` | `:1086-1088`; `PageHeader` in `src/components/ui/Page.tsx` |
| 2a | Header action — status pill coloured by `statusToken(BOOKING.status)` | `:1096-1110` |
| 2b | Header action — `SubRentedMark label="Sub-rental"`, rendered when `isSubRentalBooking(ITEMS)` is true | `:1119`; predicate `src/data/booking.ts:248-250` |
| 2c | Header action — **Send Quote** primary `Button`, **no `onClick`**; renders only at `BOOKING.status === 'Quote'` | `:1120` |
| 2d | Header action — **Confirm Booking** primary `Button` → `confirmBooking`; renders only when `BOOKING.flags.includes('Draft')` | `:1122-1126` |
| 2e | Header action — `OperationsLauncher` → `setShellOpen(true)`; `primary` unless status is Quote/Closed; disabled at Quote, wrapped in `Unavailable` | `:1135-1138`; component `:382-392` |
| 2f | Header action — `OverflowMenu` `⋮` (44×44, `aria-haspopup="menu"`), items: Extend rental · Assign crew · Create sub-rental · Save draft | `:1175-1211`; component `:419-536` |
| 3 | Six-step stepper card — Quote → Booked → Packed → On Rent → Returned → Closed, read from `STATUS_ORDER` / `BOOKING_STATUS` | `:1221-1223`; `Stepper` `:225-338`; order `src/lib/workflow.ts:43-53` |
| 4 | Facts strip — Client (+VIP chip), Pickup, Return, Rental Days, and a right-hand Outstanding / Deposit Pending column | `:1228-1317`; `Fact` `:2169-2190` |
| 5 | `role="alert"` box for a refused Confirm dispatch, persistent until the next attempt | `:1324-1342` |
| 6 | `role="alert"` box naming fields left unsaved when edit mode is exited | `:1346-1364` |
| 7 | Info strip "Editing this session only — bookings are not persisted yet", while `edit.editing` | `:1366-1383` |
| 8 | Two-track grid `minmax(0,1fr) auto` — blocks left, `Rail` right | `:1389-1396` |
| 8a | **Block 1 — Client & Schedule**: `EditableRows` over Client, Project Type, Location, Rental Days | `:1399-1411` |
| 8b | **Block 2 — Equipment, Bundles & Services**: header buttons Search / Filters / Add Item (**none carry `onClick`**), a `minWidth: 820` tree table of `ITEMS`, then the `ITEM_TALLY` roll-up and Equipment Subtotal | `:1415-1610`; buttons `:1420-1424`; table `:1429-1574`; tally `:1578-1609` |
| 8c | **Block 3 — Crew & Transport** (left) with an **Add Member** button carrying **no `onClick`**, and a **Transport & Delivery** `Card` (right) whose action toggles Edit / Done | `:1613-1734`; Add Member `:1621`; Edit/Done `:1666-1683` |
| 8d | **Block 4 — Pricing & Payments**, three columns: Rental Charges + Totals + Rental Total · Deposit ledger + Payments + **Late return** panel + immutability note · Payment History (Rental) table + Record Payment | `:1741-1928`; late fee `:1819-1835`; history `:1852-1902` |
| 8e | **Block 5 — Documents & Review**: five document tiles + an **Add Document** button with **no `onClick`**, Review Summary, Notes | `:1930-2015`; tiles `:1940-1962`; Add Document `:1963-1980` |
| 9 | `Rail` — Booking Summary (money) · Quick Actions · Alerts · Activity Timeline | `:2026-2027`; `railBody` `:912-1064` |
| 10 | `FooterNote extra={['Deposits are liabilities and never offset Rental Outstanding']}` | `:2092` |
| 11 | `OperationsShell` (always mounted, `isOpen` controlled) | `:2094`; `src/modules/operations/OperationsShell.tsx` |
| 12 | Four modals — `RecordPaymentModal` (mounted only while open **and** `canTakePayment`), `ExtendRentalModal`, `AssignCrewModal`, `CreateSubRentalModal` (always mounted, `isOpen` controlled) | `:2128-2164` |

**Equipment table columns** (`:1450-1464`): Item / Accessory · Serial / ID · Qty · Status · Availability · Location · Days · *Rate / Day* · *Total* · (spacer). The two italicised columns are spliced in only behind `canBookingMoney`, from both the header array (`:1458`) and every row (`:1555-1567`). Depth-2 serials are `<Link>`s to `/inventory/:serial` (`:1496-1498`). The trailing cell holds an `Icon name="more_vert"` — a glyph, **not a button** (`:1568-1570`).

**Payment History rows** wrap the date cell in `IntelCard` (`:1870-1877`), which opens on hover where hover exists and on long-press where it does not (`src/components/ui/IntelCard.tsx:97`).

### Responsive bands the file actually reads

`BookingDetail.tsx:698` calls `useViewport()` (`src/lib/device.ts:57`), whose thresholds are `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`). **Both 768 and 1180 are read.** What changes:

- **phone (<768)** — `onPhone` is true (`:893`). The stepper switches to the dot row plus "Step N of 6 — Booked" (`:1222`, `:228-252`). A `[Items][Money][Docs]` segmented control renders (`:1225`, `:548-599`) and `showSegment` (`:902`) makes each block belong to exactly one segment: Blocks 1–3 to Items (`:1398`, `:1414`, `:1613`), Block 4 to Money (`:1741`), Block 5 to Docs (`:1930`); in the rail, the Booking Summary card is Money (`:917`) and Quick Actions / Alerts / Timeline are Docs (`:966`). Facts strip becomes one column (`:862`). The sticky bar sits at `bottom: BAR_BOX` to clear the phone nav (`:2054`, `src/components/shell/BottomBar.tsx`).
- **tablet (768–1179)** — facts strip goes to two columns (`:861`), the money column spans `1 / -1` (`:1301`), the Rail leaves the aside and becomes a stacked column below the content (`:1392`, `:2028-2029`), Blocks 3/4/5 collapse their internal grids to `1fr` (`:1617`, `:1746`, `:1935`), and the sticky Rental Total bar appears at `bottom: 0` (`:2050-2054`). `showSegment` is always true here, so nothing is hidden (`:902`).
- **desktop (≥1180)** — five-column facts strip (`:856-859`), `Rail` in the aside, no sticky bar.

The equipment table keeps `minWidth: 820` inside an `overflowX: 'auto'` wrapper at every width (`:1428-1429`) — it is never converted to card rows, unlike `RentalsList`.

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Page title | — | The route param itself, `useParams().bookingNo` (`:688-690`) |
| Header description, status pill, VIP chip, days | SEED | `BOOKING` — `src/data/booking.ts:114-135` |
| Stepper position | SEED | `BOOKING.status` (`data/booking.ts:124`) against `BOOKING_STATUS` / `STATUS_ORDER` (`src/lib/workflow.ts:43-53`) |
| Pickup / Return dates (BS + AD) | SEED | `PICKUP_AD` / `RETURN_AD` literals converted by `lib/bs` — `data/booking.ts:72-73`, `:130-131` |
| Outstanding · Deposit Pending (facts strip) | SEED | `MONEY` from `price({equipment: 60750, crew: 72000, transport: 0, discount 7%, VAT 13%, payments: 15000})` — `data/booking.ts:43-56`, `:133-134` |
| Equipment tree, rates, totals | SEED | `ITEMS` — 11 hand-written rows, `data/booking.ts:252-277` |
| Item tally (18 / 17 / 1 / 0 / 0 / 0) | SEED | `ITEM_TALLY` — `data/booking.ts:280-287` |
| Equipment Subtotal | SEED | `EQUIPMENT_SUBTOTAL` — `data/booking.ts:288` |
| Crew names, day rates, subtotal | SEED | `CREW`, `CREW_SUBTOTAL` — `data/booking.ts:324-329` |
| Transport & Delivery rows | SEED | `TRANSPORT` — `data/booking.ts:331-337`, lifted into component state at `:708-715` via `transportValue` (`:652`) |
| Rental Charges / Totals / Rental Total | SEED | `CHARGES`, `TOTALS`, `RENTAL_TOTAL` — `data/booking.ts:347-359` |
| Deposit ledger, Payments (Rental Only) | SEED | `DEPOSIT_LEDGER`, `RENTAL_PAYMENTS` — `data/booking.ts:361-375` |
| Late return panel (overage, band, fee) | SEED | `lateFee({RETURN_AT, ACTUAL_RETURN_AT, DAY_RATE_PAISA})` computed at `:721-724` over three seeded constants — `data/booking.ts:86-88`, `:104-112`. The panel's outcome is component state (`:725`, `:1833`), persisted nowhere |
| Payment History rows + their Glance/Detail intel cards | SEED | `PAYMENT_HISTORY` (two rows) — `data/booking.ts:407-425`, through `paymentGlance` / `paymentDetailGroups` (`src/data/bookingIntel.ts:94`, `:109`), memoised at `:840-848` |
| Document tiles | SEED | `DOCUMENTS` — `data/booking.ts:427-433` |
| Review Summary | SEED | `REVIEW` — `data/booking.ts:435-442` |
| Notes / author / timestamp | SEED | `NOTES`, `NOTES_BY`, `NOTES_AT` — `data/booking.ts:444-447` |
| Booking Summary rail card | SEED | `SUMMARY` — `data/booking.ts:139-146` |
| Alerts card | SEED | `ALERTS` — `data/booking.ts:456-465`, filtered at `:889` |
| Activity Timeline | SEED | `TIMELINE` — `data/booking.ts:467-471` |
| Crew picker inside Assign Crew | SEED | `CREW_ROSTER` — `src/data/crew.ts:102-110` |
| Confirm Booking dispatch | DB | Reads `bookings` (`confirmRental.ts:241-252`) and `booking_lines` (`:255-263`); writes `inventory_reservations` via `reserveAssignedUnits` (`src/lib/queries/availability.ts:456`) then `booking_stage_transitions` via `applyBookingTransition` (`src/lib/bookingTransition.ts`), re-reading `bookings.stage` to verify (`confirmRental.ts:267-272`) |
| Record Payment dispatch | DB | Reads `invoices` by `invoice_no` (`recordPayment.ts:181-199`), then inserts `payments` |
| — | LOCAL | **The page itself reads nothing from `src/lib/mock/corpus.ts`.** The corpus store serves `bookings`, `booking_lines`, `payments`, `invoices`, `booking_stage_transitions` and eight others (`corpus.ts:405-423`), so in mock mode the two dispatches above land there. `inventory_reservations` appears **nowhere** in `src/lib/mock/corpus.ts` and is not in its `UNSERVED` list (`corpus.ts:33-44`) — it is unserved by the mimic |

Invented on this page: every rupee figure and count shown — Rental Total Rs 1,39,506, Paid Rs 15,000, Outstanding Rs 1,24,506, Subtotal / Discount 7% / VAT 13%, Equipment Subtotal Rs 60,750, Crew Subtotal Rs 72,000 and the three crew day rates, Transport Charge Rs 0, Deposit Required Rs 50,000 / Received Rs 25,000 / Pending Rs 25,000, both Payment History rows and the Rs 500 reversal adjustment, every per-line Rate/Day and Total, the 18/17/1/0/0/0 tally, the late-fee overage of 4h 15m and the day rate derived from it, the client name, the two dates, the five document tiles, the three alerts and the three timeline entries.

---

## 4. Actions and writes

### Dispatches

| # | Trigger | Action file | Capability | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|---|
| 1 | **Confirm Booking** header button (`:1123`) → `confirmBooking` (`:804-831`), dynamic import at `:822-823` | `src/actions/rentals/confirmRental.ts` (`name` `:275`) | `rental.confirm` (`:277`) | **true** (`:302`) | **Yes** — `core.ts:160-161` → `rbac.canConfirmRental` (`rbac.ts:133-135`) = Owner/Admin/Manager/Coordinator/Warehouse (`rbac.ts:71-77`) |
| 2 | **Receive Payment** (`:951-957`), **Record Payment** (`:1916-1922`), **sticky-bar Record Payment** (`:2085-2087`) → all three set `showPaymentModal`, which mounts `RecordPaymentModal` (`:2128-2136`); the modal dispatches at `RecordPaymentModal.tsx:274-283` | `src/actions/finance/recordPayment.ts` (`:244`) | `payment.create` (`:245`) | **true** (`:252`) | **Yes** — `core.ts:129-131` → `rbac.canRecordPayment` (`rbac.ts:296-299`) = Owner/Coordinator/Accounts, false offline |
| 3 | Overflow **Extend rental** (`:1180`) → `ExtendRentalModal` (`:2138-2146`), dispatch at `ExtendRentalModal.tsx:143` | `src/actions/rentals/extendRental.ts` (`:9`) | `rental.extend` (`:10`) | **false** — the file sets no `implemented` key, so `core.ts:223-225` throws `ActionNotImplementedError` before validate/execute/events | **Yes** — `core.ts:187-195` → `rbac.canWriteBookingDesk` (`rbac.ts:215-217`) |
| 4 | Overflow **Assign crew** (`:1187`) → `AssignCrewModal` (`:2148-2155`), dispatch at `AssignCrewModal.tsx:109-112` | `src/actions/crew/bookCrew.ts` (`:11`) | `crew.assign` (`:12`) | **false** — no `implemented` key; fails closed at `core.ts:223-225` | **Yes** — `core.ts:211-214` → `rbac.canWriteSharedTriage` (`rbac.ts:255-257`) = every staff role |
| 5 | Overflow **Create sub-rental** (`:1193`) → `CreateSubRentalModal` (`:2157-2164`), dispatch at `CreateSubRentalModal.tsx:105-108` | `src/actions/subrentals/createSubRental.ts` (`:12`) | `subrental.create` (`:13`) | **false** — no `implemented` key; fails closed at `core.ts:223-225` | **Yes** — `core.ts:187-195` → `rbac.canWriteBookingDesk` |

Written exactly: rows 3–5 **render, dispatch `EXTEND_RENTAL` / `BOOK_CREW` / `CREATE_SUBRENTAL`, and the actions are stubs (`core.ts:223-225` fails them closed)**. Each modal surfaces the refusal inline (`ExtendRentalModal.tsx:159-161`, `AssignCrewModal.tsx:122-124`, `CreateSubRentalModal.tsx:118-120`) and its `onSuccess` — and therefore this page's toast — is unreachable on that path.

Rows 1 and 2 carry real bodies but neither can complete from this screen today; see §7 items 1 and 2.

All five pass a real session context or refuse: `actionCtx` (`:135-137`) returns `undefined` with no `user`, and `confirmBooking` states that inline (`:806-812`); the three modals each guard on `!user` before dispatching. Confirm mints its idempotency key at the press (`:821`, `newClientUuid` `src/lib/supabase.ts:80-82`); `RecordPaymentModal` holds its own key in state and re-mints only after a completed write (`RecordPaymentModal.tsx:286`).

### Local-only writes (nothing leaves the browser)

- Inline edit — `onSaveBooking` (`:727-731`) is `setEditable(…)` and nothing else; `useEditMode` (`src/lib/edit/useEditMode.ts:93`) calls it per field or per group (`BOOKING_FIELDS` groups Vehicle/Driver/Delivery Type as `transport`, `:669-675`). The screen says so in-band at `:1381` and in the Save-draft reason at `:1207-1208`.
- Late fee — `onSettle` (`:1833`) stores `settleLateFee(…)` (a pure function, `src/lib/lateFee.ts:200`) in `lateFeeOutcome` state (`:725`). No dispatch, no persistence.

### Navigation

- Alerts **Check Inventory** → `navigate('/inventory')` (`:1032`).
- `OperationsLauncher` opens `OperationsShell` (`:1135-1138`), which navigates to `/rentals/:bookingNo/{packing|handover|return|reset}` (`OperationsShell.tsx:117`) and `/rentals/:bookingNo/evidence` (`:252`).
- Depth-2 serial cells `<Link>` to `/inventory/:serial` (`:1496-1498`).

### Buttons with no handler

| Control | Line | Note |
|---|---|---|
| **Send Quote** | `:1120` | No `onClick`. Also unreachable — it renders only at `status === 'Quote'` and the seed is `Booked` (`data/booking.ts:124`) |
| **Search**, **Filters**, **Add Item** (Block 2 header) | `:1420-1424` | No `onClick` on any of the three |
| **Add Member** (Block 3 header) | `:1621` | No `onClick` |
| **Print**, **Share**, **More** (Quick Actions) | `:970-993` | Hand-rolled `<button>`s, no `onClick` |
| **Receive Deposit**, **Receive Payment** (Alerts) | `:1032` | `onClick` is spread only for `a.action === 'Check Inventory'`; the other two `Button`s get none. The file states this at `:1025-1028` |
| **Add Document** | `:1963-1980` | `<button type="button">` with no `onClick` |
| **Save draft** (overflow) | `:1203-1209` | `onClick: () => undefined`, rendered `disabled` inside `Unavailable` with the reason "Bookings are not persisted yet…" |
| Block 1 header `chevron_down` | `:1399` | An `Icon`, not a control — no disclosure behaviour behind it |
| Row `more_vert` cell | `:1568-1570` | An `Icon` in a `<td>`, not a menu |

---

## 5. Gates

**Route.** `Shell` (`src/App.tsx:943`) holds until `authLoading` resolves (`:964-970`) and redirects to `/login` with no session (`:973-975`). `/rentals/:bookingNo` is **not** in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), so the `isForbidden` backstop (`App.tsx:993`) never fires here, and there is no `isStaff` check on any route. **Every signed-in role reaches this page, including `Client`.**

**Money.** This page does **not** call `useCanViewMoney` (`src/lib/moneyVisibility.ts:24`). It builds a `GateContext` from the session role — defaulting to `'Client'` when there is no session (`:752`) — and asks `canViewMoneyField` twice (`src/lib/fieldGating.ts:67-72`):

- `canBookingMoney` = `'booking'` (`:753`) → Owner, Admin, Manager, Accounts (`MONEY_FULL`, `fieldGating.ts:53`) **and** Coordinator (`fieldGating.ts:60`, `:71`).
- `canCrewMoney` = `'asset-finance'` (`:754`) → Owner, Admin, Manager, Accounts only; Coordinator is excluded (`fieldGating.ts:71`).
- Warehouse, Technician, Driver, Client and no-session get `'none'` for both (`fieldGating.ts:61`).

**Hidden under Law 6 when `canBookingMoney` is false** — omitted, never masked: the facts-strip money column (`:1297`, and the grid template drops the fifth track at `:857-859`); the `Rate / Day` and `Total` header cells (`:1458`) and their row cells (`:1555-1567`); Equipment Subtotal (`:1601-1608`); the Transport Charge row in both read and edit mode (`:1692`, `:1704`); **the whole of Block 4** (`:1741`); the Review Summary `Pricing` row (`:1991`); the Booking Summary rail card (`:917`); the `Money` phone segment, so the control is two-up not three-up (`:891`); the sticky Rental Total bar (`:2050`); and the two `Receive…` alerts (`:889`, a predicate over the alert's button label, flagged in-file as a stopgap at `:882-887`).

**Hidden when `canCrewMoney` is false** (i.e. also for Coordinator): the crew `Day Rate` / `Days` / `Amount (Rs)` columns (`:1625`, `:1638-1644`) and the Crew Subtotal row (`:1647-1656`); the **Assign crew** and **Create sub-rental** overflow entries (`:1186-1193`).

**Capability gates, separate from visibility:**

- `canTakePayment = canRecordPayment(user.role)` (`:785`; `rbac.ts:296-299` → Owner, Coordinator, Accounts) gates all three payment buttons (`:949`, `:1914`, `:2084`) **and** the modal mount itself (`:2128`), so a mid-session role change cannot leave an orphaned payment form.
- `canOperate = canPerformOperations(user.role)` (`:790`; `rbac.ts:291-293` → Owner, Admin, Manager, Warehouse, Technician) is intersected with the money gates for the three overflow entries, resolving all three to **Owner / Admin / Manager**.
- The `Operations` launcher itself carries **no role gate** — `OperationsLauncher` (`:382-392`) branches only on `BOOKING.status === 'Quote'`.

Forbidden entries are absent rather than greyed throughout (`:1179-1193`); `unavailable` is reserved for the control nobody may use (Save draft, `:1207`).

---

## 6. States drawn

| State | Present? | Where |
|---|---|---|
| Loading | **None of its own.** The page fetches nothing, so there is nothing to wait for. `Shell`'s `Suspense` shows `LoadingSkeleton` while the lazy chunk loads (`src/App.tsx:1026`), and `Shell` shows "Restoring session…" while auth resolves (`App.tsx:964-969`) — both outside this file |
| Error | **Hand-rolled, two of them.** `role="alert"` box for a refused Confirm, persistent (`:1324-1342`); `role="alert"` box for fields left unsaved on leaving edit mode (`:1346-1364`). Modal-level failures render inside their own modals, not here |
| Empty | **None.** Every list renders a module constant that is never empty; there is no zero-row branch on `ITEMS`, `CREW`, `PAYMENT_HISTORY`, `DOCUMENTS`, `ALERTS` or `TIMELINE` |
| Restricted | **None as a page state.** Money-blind roles get the money blocks omitted (§5) and the rest of the page as normal. `RestrictedState` is unreachable for this route (`App.tsx:993` + `nav.ts:147-153`) |

`PageBody` and `StateViews` are **not imported** by this file; there is no reference to either anywhere in its 2197 lines. The one status-shaped notice it does draw is the seeded-record banner (`role="status"`, `:1069`).

---

## 7. Known gaps

1. **The one implemented write on this page cannot be reached.** Confirm Booking renders only when `BOOKING.flags.includes('Draft')` (`:1122`), and the seed sets `flags: [] as Flag[]` with `status: 'Booked'` (`src/data/booking.ts:124-125`). `BOOKING` is a module constant, so no interaction changes it. `confirmRental` is `implemented: true` (`confirmRental.ts:302`) and its capability resolves (`core.ts:160`) — the button is simply never rendered. Send Quote (`:1120`) is unreachable for the mirror-image reason.

2. **Record Payment always fails, and the file's comment says otherwise.** `BookingDetail` hands the modal a synthetic invoice whose `id` is the **booking** number (`:2132-2133`). `recordPayment` resolves its target by `invoices.invoice_no` (`recordPayment.ts:182-186`) and throws `No invoice numbered B-715 exists…` when nothing matches (`:196-198`) — `recordPayment.ts:192-195` names this screen as the caller that does it. The comment at `:2118-2120` explains the failure as "`recordPayment` is still a stub, so today it rejects"; the action is `implemented: true` (`recordPayment.ts:252`), so the refusal comes from the invoice lookup, not the stub gate. The ruling asserted at `:2104-2110` ("a payment posts against the BOOKING… handing the booking to the modal is the correct row") is contradicted by the action, which has no booking-number path.

3. **A stale comment about the capability matrix.** `:1155-1160` states that `rental.extend`, `crew.assign` and `subrental.create` "have no case in `actions/core.ts`'s `checkCapability`, so the dispatcher denies all three by default". All three are mapped as of the 16 Aug ruling — `core.ts:187-195` and `:211-214`. The gates built on that premise (`canOperate` as a stand-in) still stand, but the reason given for them no longer holds.

4. **`TODO(decision)` markers in this file.** Two: `:885-887` — `ALERTS` rows need a typed `money: boolean` so the Law 6 filter at `:889` stops keying off the button's wording; `:1155-1168` — the real capability rules for Extend / Assign crew / Create sub-rental, `canPerformOperations` being borrowed as the closest existing neighbour.

5. **Three modals collect figures that reach nothing.** `ExtendRentalInput` is `{ id }` only, so the days, rate, charge and reason typed into `ExtendRentalModal` are dropped at the dispatch (`ExtendRentalModal.tsx:143`, noted `:135-141`). `BookCrewInput` carries no rate or day count (`AssignCrewModal.tsx:109-112`, noted `:103-107`). `CreateSubRentalInput` has no client-charge field (`CreateSubRentalModal.tsx:105-108`, noted `:98-103`). Harmless while all three actions fail closed; each modal's own comment states that whoever sets `implemented: true` must widen the input first.

6. **`ExtendRentalModal` is structurally un-submittable from this page.** It refuses without a `currentReturnDate` (`ExtendRentalModal.tsx:103-109`) and renders a permanent "not given the booking's current return date" notice (`:223-238`); `BookingDetail` does not pass that prop (`:2138-2146`).

7. **The Operations launcher has no role gate.** `OperationsLauncher` (`:382-392`) branches only on booking status, and `OperationsShell` reads no role at all — its only gate is `stepWriteGate`, which compares the job's `runsAt` against the booking stage (`src/data/operationsShell.ts:115-129`). So Coordinator, Accounts, Driver and the external `Client` role all get the launcher and can navigate into the four workspace routes from here, while the same roles are excluded from `canPerformOperations` (`rbac.ts:291-293`) that the overflow entries on this very header respect. (Whether the destination workspaces gate themselves was not read for this page.)

8. **Everything the header decides is read from the seed, not from the route.** `OperationsLauncher`'s disabled test (`:383`), the primary-action choice (`:1136`), the status pill (`:1103`), the stepper (`:1222`) and the sub-rental chip (`:1119`) all read `BOOKING`, while the title reads `id` from the URL (`:1087`). Visiting `/rentals/B-999` renders B-715's status, money and items under a B-999 title, with only the amber banner (`:1068-1084`) marking the mismatch.

9. **Late-fee settlement is not persisted.** `onSettle` writes component state (`:725`, `:1833`); nothing dispatches. The panel's own approver field is free-typed text validated only for non-emptiness — stated at `rbac.ts:349-353` alongside its own `TODO(decision)`.

10. **A cross-file contradiction this file documents but does not fix.** `:202-214` claims `src/lib/status.ts`'s `STATUS_ICON` names two icons the registry does not have. Verified: `STATUS_ICON.neutral = 'circle_dashed'` and `STATUS_ICON.progress = 'progress'` (`src/lib/status.ts:57-65`), and neither key exists in `REGISTRY` (`src/components/ui/Icon.tsx:79-173`) — `Icon` logs and returns on the miss (`Icon.tsx:188-190`). This page sidesteps it with its own `STAGE_ICON` typed against `IconName` (`:216-223`), so nothing here breaks; any caller that does pass `STATUS_ICON` into `Icon` gets the miss.

11. **`inventory_reservations` is unserved by the mock corpus.** `confirmRental` writes it before the stage move (`confirmRental.ts:435-438`, `src/lib/queries/availability.ts:456`), but the table appears nowhere in `src/lib/mock/corpus.ts` and is absent from its `UNSERVED` disclosure list (`corpus.ts:33-44`), so mock mode neither serves it nor announces that it does not.

12. **A documented dark-mode collision.** `:82-86` records that `styles/theme.css:223-227` paints the primary button gold in dark mode, so a gold Save/Confirm sits beside the gold sub-rental outline (`STATUS.ext`, `:102-104`) that is supposed to be the page's only gold. Reported in-file, not fixed.
