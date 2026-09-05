# Lifecycle Bug Register — 2026-09-02

Page-by-page audit in lifecycle order, inquiry → cleaning. Seven read-only code passes (one per stage) plus a driven pass in `dev:mock` as Owner at 1600×960, probing React fiber props for dead controls on every route walked. Commit `adc1dbc + uncommitted NewRental WIP`.
> ⚠ **Concurrent session.** While this audit ran, another session started `TODO_SWEEP_2026-09-02.md` and touched ~45 files in the working tree (stub actions now carry `implemented: false`, `auditLogger.ts` is DEV-gated, the unused `PARENTS` import is trimmed). Line numbers here are from commit `adc1dbc` plus the tree as read; re-check a line before fixing it, and expect X-07 (console logging) and NR-07 (tsc) to be already done in that tree.


**Gate at audit time:** tsc: 1 error (NewRental.tsx:28 unused PARENTS, other session's WIP) · vitest: 101 files / 2341 tests green · driven in dev:mock as Owner at 1600×960.

**Not re-reported (already closed or filed):** FUNCTIONAL_BUGS.md BUG-001…013, PLAN §4.29/§4.30/§4.31/§4.35a/§4.36/§4.40/§4.41/§4.42, the discount-gate removal (D3), the Unavailable disabled+reason pattern, the ResetWorkspace border note, the ItemQuantityState 5-vs-4 mismatch (§4.16).

**BUG** = the code contradicts its own stated intent, a spec comment or a project law. **TODO** = explicitly deferred (stub, seed instead of live read, Unavailable placeholder, open ruling). **✔ driven** = reproduced in the browser this session, not only read.

> **3 Sep 2026 — P1 wave.** 32 of the 38 P1 items are ticked below with what changed and how it was driven. **Open at P1: 1.** X-01 alone, and it is not a code fix — the BS converter needs the neighbouring month lengths, which are calendar data the specs say are never inferred (PLAN §4.34). Everything else was fixed and driven across 3–4 Sep. Session log: PROGRESS.md 3 Sep entry.

| | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|
| BUG | 34 | 51 | 25 | 110 |
| TODO | 4 | 30 | 8 | 42 |
| **All** | **38** | **81** | **33** | **152** |

30 of 152 were reproduced at runtime. Tick a box when the item is fixed **and driven**, and write the commit next to it.

## 0 · Cross-cutting

_Dates, the mock harness, the shell — things that break every stage at once_ — 10 items (4 P1)

- [ ] **X-01 · P1 · BUG** ✔ driven — The BS date table ends 16 Aug 2026, so today has no Nepali date anywhere: Dashboard/Finance header reads “Nepali date unavailable”, Booking Detail prints “—” in the BS slot, Calendar renders an empty month grid (“0 days the Date Engine can name”) with both month steppers disabled, and Clients prints the AD date with a BS suffix (“17 Aug 2026 BS”). The dated blocker in PLAN §4.34 is now live on every screen.  
  `src/lib/bs.ts:107-112 · PLAN §4.34`
- [x] **X-02 · P1 · BUG** ✔ driven — In dev:mock a booking's stage never advances. bookings.stage is written only by the trigger on booking_stage_transitions, and the mock engine emulates no trigger: Complete Packing on B-716 wrote the session, 2 packing_lines, 2 movements, 2 audit rows and a Booked→Packed transition row into the overlay, yet the booking reloads as BOOKED. Every floor verb and Confirm Booking looks like a no-op in the only environment the app is driven in — verification by driving is blind to the whole lifecycle.  
  `src/lib/mock/client.ts · supabase/migrations/0021:79`
  ↳ FIXED 3 Sep 2026 — mock/client.ts applyTriggers emulates the 0021 read-model write; driven: B-716 Booked→Packed, B-715 Packed→On Rent, B-864 On Rent→Returned all advanced.
- [x] **X-03 · P1 · BUG** ✔ driven — booking_line_units.unit_state / packed / packed_at have no writer at all — no action, no trigger, only the 0047 seed. Booking Detail's Packed / Missing / Returned counters and per-line status therefore never change after real floor work (B-716 shows “Packed 0” after a completed pack), and HandoverWorkspace reads the same column for “recorded by an earlier session”.  
  `supabase/migrations/0002_bookings.sql:235-239 · src/actions/rentals/floorVerb.ts`
  ↳ FIXED 3 Sep 2026 — floorVerb.writeUnitStates writes packed/packed_at/packed_by/packing_session_id, unit_state 'Picked Up' + handover_session_id, and the Return states, through safeUpdate by id; booking_line_units added to types/database.ts; driven: 18 unit rows flipped to Picked Up on B-715.
- [x] **X-04 · P1 · BUG** ✔ driven — The On Rent stage chip can never filter: selected stages are joined with a space and split on a space, so “On Rent” becomes “On” + “Rent” and both are dropped by the STATUS_ORDER filter. The chip writes ?stage=On+Rent, reads back unpressed, and rentalsQuery gets no constraint — 120 rows for the 24 bookings that are actually out. ?stage=On%20Rent links behave the same.  
  `src/modules/rentals/RentalsList.tsx:832-836`
  ↳ FIXED 3 Sep 2026 — RentalsList keys the stage set on '|'; driven: On Rent chip → 24 rows, pressed, ?stage=On+Rent.
- [x] **X-05 · P2 · BUG** — “Today” is resolved once at module load on at least six pages (NOW_AD, TODAY, RENTAL_KPI_FILTERS, PERIOD_*, OVERDUE_INVOICES). A tablet left open across midnight keeps yesterday's KPIs, chips, overdue sets and period until a full reload.  
  `src/data/today.ts:756 · src/data/rentals.ts:885-889 · src/modules/finance/Finance.tsx:53,161-176 · src/modules/calendar/Calendar.tsx:47 · src/modules/inventory/Maintenance.tsx:39`
  ↳ FIXED 4 Sep 2026 — every user-visible module-scope “today” now resolves per render: today.ts (todayDate, pickupsQuery/returnsQuery take a dayAd), rentals.ts (rentalKpiFilters(nowAd)), Finance.tsx (reportingPeriod(dayAd) + the two live sets), OperationsQueues, CrewBooking, Maintenance, AddClient, Today.tsx's date pill, WallDisplay's header. RentalsList's own `const TODAY = getBusinessToday()` and Expenses' frozen `useState(TODAY_DAY_AD)` were missed by the first pass and fixed after review. Driven: Rentals footer reads “Quick filters are relative to 4 Sept 2026”; Add Expense defaults to 4 Sept 2026.
- [x] **X-06 · P2 · BUG** — NOW_AD is Kathmandu civil midnight (05:45 NPT as an instant), not now. overdue()'s own contract says a bare date misses everything due earlier today; the Overdue KPI, chip and row tags on Rentals, Dashboard and Operations therefore miss any booking due back today after 05:45, and “Late today” is unreachable. Operations' row-level isPastDue uses Date.now() and disagrees with the panel beside it.  
  `src/data/today.ts:756 · src/lib/queries/bookings.ts overdue()`
  ↳ FIXED 4 Sep 2026 — NOW_AD deleted; businessNowAd(now = new Date()) resolved at each call site (Rentals list + 4 KPIs, Today's Overdue KPI and both movement mappers, Operations' Critical/High alerts, Finance's Overdue chip + KPI). Day-bounded sets keep a DAY. ⚠ The first pass then re-froze it on Rentals as useMemo(() => businessNowAd(), [dayAd]), pinning the anchor to the day's first render — caught in review, now read per render (safe: useList keys on filterKey, and every consumer floors the anchor). ⚠ This entry's claim that “Late today is unreachable” was WRONG: a booking due at 02:00 NPT is both before the old 05:45 anchor and 0 civil days late, so it rendered. Corrected in rentals.ts.
- [x] **X-07 · P2 · BUG** ✔ driven — The mock corpus writes invoices with status 'Issued', which is not in invoice_status (Draft, Sent, Partially Paid, Paid, Overdue, Void). Finance's unsettled filter (Sent/Partially Paid) therefore sees nothing: Finance dashboard and Daily Closing say “Outstanding Rs 0 · every issued invoice has been settled” while Booking Detail shows Rs 25,934 outstanding on INV-3. Mock-only, but it makes the two screens contradict each other on the one number a client is billed.  
  `src/lib/mock/corpus.ts:341`
  ↳ FIXED 4 Sep 2026 — corpus.ts derives the status from the figures beside it, mirroring sync_payment_to_invoice() (0010): INVOICE_ISSUED_STATUS ('Sent') when nothing is paid, 'Partially Paid' when part is, 'Paid' when settled. Pinning test corpusInvoiceStatus.test.ts; its precedence was rewritten in review to match the implementation (paid === 0 first) rather than a rule the code does not follow.
- [ ] **X-08 · P3 · BUG** ✔ driven — Every page load prints “[AuditLogger] Starting centralized activity logging…” and every floor write prints a styled “[AUDIT LOG]” line with the full payload to the console. Not gated on import.meta.env.DEV — ships to production.  
  `src/events/auditLogger.ts:4,16`

- [ ] **X-09 · P2 · BUG + TODO(decision)** — The floor screens call the Kathmandu CIVIL day “today” where the query layer wants the OPERATIONAL day. `businessDayAd()` is `kathmanduCivil` with no 06:00 shift, so between midnight and 06:00 NPT Today's Pickups/Returns, the Rentals Today KPIs and the Operations day scope all name an operational day that has not begun: the shift's own pending returns disappear and the panels fill with a day nobody has started. Narrow (a 6-hour window) but it lands exactly on the night crew. Pre-existing — not introduced by the X-05/X-06 batch, which kept the existing civil-day semantics.  
  `src/data/today.ts:809 businessDayAd · src/modules/today/Today.tsx:548 · src/data/rentals.ts:731,914 · src/modules/operations/OperationsQueues.tsx:174-175`
  ↳ The mechanism is already built: `queries/bookings.ts` exports `operationalToday()` (see FI-16), and swapping these four call sites onto it is mechanical. **Blocked on a decision, not on code:** at 02:00 on 5 Sep the floor is still working the 4th, so the sets should be the 4th's — but what should the DATE PILL beside them say, “4 Sept” (the day the figures are for) or “5 Sept” (the calendar day)? Inventing either is inventing the product. Ask Babin, then flip the four sites and update rentalsList.test.ts / todayQuery.test.ts, which currently pin the civil day via TODAY_DAY_AD and would go red in that window.  
  ⚠ Daily Closing is deliberately already on the operational day (FI-16 was a whole-screen day error, not a 6-hour one), so until this is ruled the two disagree between 00:00 and 06:00 NPT. Recorded knowingly.

- [ ] **X-10 · P2 · BUG** — ⚠ **Another session's file — do not fix without coordinating.** `0092_law6_warehouse_cannot_rewrite_prices.sql` is a Law 6 write guard (“a role that may not READ a price may not WRITE one”) with two holes. (a) `0019` revokes SELECT on NINE product money columns; the trigger checks SEVEN — `deposit_percent` and `deposit_fixed` are omitted, so a Warehouse user who cannot read the deposit fields can still rewrite them. (b) Both triggers are `before update` ONLY, so INSERT is unguarded on both tables while both INSERT policies admit Warehouse. Found by two reviewers during the BD batch and verified by hand against `0019:147-149` and `0092:79-90,111-118`.  
  `supabase/migrations/0092_law6_warehouse_cannot_rewrite_prices.sql:79-90,111-118` vs `supabase/migrations/0019_column_level_money_masking.sql:147-149`
  ↳ **NOT live.** Verified against production on 5 Sep: `pg_trigger` has no `%money_column_guard%` row, so `0092` is unapplied and this is a latent gap in an unshipped migration, not an open hole. It should be closed BEFORE the migration is applied. Committed by the concurrent session in `a25d5d5`.
- [ ] **X-09 · P3 · TODO** ✔ driven — Direct URL loads in dev:mock take 25–60 s (“Restoring session…”, then the route's “Loading…”); Documents and Inventory did not finish inside 40 s. Same class as the closed BUG-008 (Vite cold transform), recorded so the next driver does not file it again.  
  `dev:mock harness`
- [ ] **X-10 · P3 · BUG** ✔ driven — Mock-only display artifacts on Payments: every row reads “(booking not joined)” because the mock declares no invoices→bookings relationship, and every payment is dated “24 Aug 2026 · 05:45” because the corpus stores a date-only payment_date.  
  `src/lib/mock/corpus.ts:367 · src/lib/mock/engine.ts relationships`

## 1 · Clients

_A client must exist before an inquiry_ — 15 items (3 P1)

- [x] **CL-01 · P1 · BUG** ✔ driven — AD dates rendered in the BS slot with a “ BS” suffix (“24 Aug 2026 BS”), and the CSV column “Last Rental (BS)” holds AD dates — PLAN E-P0-1's exact failure.  
  `src/modules/clients/ClientsDirectory.tsx:1683 · ClientDetail.tsx:763,1204 · Clients.tsx:111,125`
  ↳ FIXED 3 Sep 2026 — queries/clients.ts bsLabel carries its own suffix; the hardcoded " BS" is gone from ClientsDirectory/ClientDetail/CSV; lastRental sorts on the AD label; driven: 0 AD dates with a BS suffix on /clients.
- [x] **CL-02 · P1 · BUG** — Save Credit Limit, Upgrade Tier and Verify KYC emit a DomainEvent, patch a local draft and close as if saved — no action, no write, no “not persisted” line; authorizedBy falls back to 'Admin'. Fabricated success on money and compliance state.  
  `src/modules/clients/modals/AdjustCreditLimitModal.tsx:47-59 · UpgradeTierModal.tsx:44-56 · VerifyKycModal.tsx:35-47`
  ↳ FIXED 3 Sep 2026 (made honest) — the three modals' primary buttons are Unavailable with the missing action named; event emission and the 'Admin' fallbacks removed. The credit/tier/KYC writes remain TODO(decision).
- [x] **CL-03 · P1 · BUG** — TIER_BENEFITS hardcodes discount % and deposit-waiver policy per tier and renders “{n}% OFF RENTALS”; migration 0005 and Clients.tsx:372 say no plan value may be hardcoded. Law 1.  
  `src/modules/clients/modals/UpgradeTierModal.tsx:16-22`
  ↳ FIXED 3 Sep 2026 — hardcoded discount %/waiver copy removed from UpgradeTierModal; entitlements pointed at membership_plans_v.
- [ ] **CL-04 · P2 · BUG** ✔ driven — The “On Rent — clients with active rentals” KPI and chip count active_bookings_count, which is every booking not Closed and not cancelled (Quote, Booked, Returned included). All 40 clients read as On Rent while 24 bookings are out.  
  `src/modules/clients/ClientsDirectory.tsx:518,853-857 · supabase/migrations/0054:321`
- [ ] **CL-05 · P2 · BUG** — lastRental sort claims “BS renders as YYYY/MM/DD so lexical order is chronological”; the value is “16 Shrawan 2083 BS” / “2 Sep 2026”, so the sort and the “Recently Added” saved view are wrong.  
  `src/modules/clients/ClientsDirectory.tsx:540-542`
- [ ] **CL-06 · P2 · BUG** — Block/Unblock is disabled with the reason “client.block is unruled” — stale; core.ts maps it and the directory dispatches it live. Dead control with a wrong reason.  
  `src/modules/clients/ClientDetail.tsx:575-583 · src/actions/core.ts:164`
- [ ] **CL-07 · P2 · BUG** — UI copy says “Discount stacking is capped at 25%”. D3 (31 Aug) removed every discount gate and cap; this is a re-added ceiling in prose.  
  `src/modules/clients/Clients.tsx:520 · Membership.tsx:989 · src/data/membership.ts:398`
- [ ] **CL-08 · P2 · BUG** — Contact Person, Designation, Business Reg. No. / Government ID, Website and Client Since are collected and silently dropped — they are absent from the NOT_SAVED_YET notice the form promises lists everything it cannot store.  
  `src/modules/clients/AddClient.tsx:210-216,481-502`
- [ ] **CL-09 · P2 · BUG** — “VAT / PAN missing — required before a booking can be confirmed” vs “Optional — a client without a PAN can still rent.” One of the two rules is invented.  
  `src/modules/clients/AddClient.tsx:594 vs ClientDetail.tsx:694`
- [ ] **CL-10 · P2 · BUG** — UI validates name/phone/email only; the action rejects a non-9-digit PAN and any orgSubtype outside the enum, so the refusal arrives as a post-submit banner with no inline error on the field.  
  `src/modules/clients/AddClient.tsx:417-430 vs src/actions/clients/createClient.ts:306-309`
- [ ] **CL-11 · P2 · BUG** — ErrorBanner message={selectedClient.blockReason} is always undefined (the mapper never sets it), and :2127 invents “account under review” as the reason.  
  `src/modules/clients/ClientsDirectory.tsx:1890,2127`
- [ ] **CL-12 · P3 · BUG** — client.company is never set by the mapper: the search placeholder promises “company” and Export Selected emits an always-empty Company column.  
  `src/modules/clients/ClientsDirectory.tsx:503,675-688,1056`
- [ ] **CL-13 · P3 · BUG** — role="button" on <tr> makes every cell presentational to assistive tech; the table loses its structure for screen readers.  
  `src/modules/clients/ClientsDirectory.tsx:1515`
- [ ] **CL-14 · P3 · TODO** — mergeInto sums outstanding/deposit/spend on the page (Law 1) — inert only because mergeClients and updateClient are console.log stubs. ClientDetail edits are session-only.  
  `src/modules/clients/DuplicateCenter.tsx:92-107 · src/actions/clients/mergeClients.ts:18 · updateClient.ts:36`
- [ ] **CL-15 · P3 · TODO** — Referral codes are minted with Math.random() against 4 seeded referrals; Import rows read “Ready” while dupChecking; Membership tab reads MEMBERS/PLANS seed beside a live Credit tab and routes to /clients?q= instead of the profile. Client import commit, referral issue, “Not a Duplicate” and membership enrolment have no write.  
  `src/modules/clients/GenerateReferralCode.tsx:78-83,104 · ImportCenter.tsx:189,517-520 · Membership.tsx:908-918`

## 2 · Inquiry / Quote

_New Rental workspace — /rentals/new_ — 26 items (6 P1)

- [x] **NR-01 · P1 · BUG** — Double-click Confirm creates two bookings: clientUuid is minted inside the async closure on every press and the button is never disabled while saveState === 'saving'. The Law 8 comment above it is false.  
  `src/modules/rentals/NewRental.tsx:1614,2177,3276`
  ↳ FIXED 3 Sep 2026 — one action key per press (useRef), handler guarded and both Confirm buttons disabled while saving. Tests 149/149.
- [x] **NR-02 · P1 · BUG** — The write does not carry what the screen prices. Only equipment lines with a rate are sent; discountPct, the VAT switch, crew lines, transport, depositRequired and the advance are all dropped, so the rail's TOTAL/Outstanding cannot reconcile with the booking that lands.  
  `src/modules/rentals/NewRental.tsx:1611-1637`
  ↳ FIXED 3 Sep 2026 — createRental takes `crew` and `transport` and writes booking_crew_lines / booking_transport after the header (own Law 8 keys; a failure raises CreateRentalPartialError naming the Quote); New Rental sends discountPct as a Manual booking_discounts row, depositRequired, crew and transport, and the confirm callback now lists them as deps (the stale closure was sending zeros). Still NOT sent, stated in code as TODO(decision): the VAT switch (vat_rate lives on the invoice) and the typed advance (a payment needs an invoice). Driven: B-3 Booked with a 5% discount row, a Gaffer crew line and a transport row; tests createRentalCrewTransport 5/5.
- [x] **NR-03 · P1 · BUG** — A Warehouse actor (in BOOKING_DESK and MONEY_BLIND) gets dailyRate: null from listInventory, which becomes ratePaisa 0, which is written as rate 0 on every line. The money-blind display value is what gets persisted. Also page-local Math.round(paisa/100) instead of toRupees.  
  `src/modules/rentals/NewRental.tsx:1135,1632 · src/lib/rbac.ts:71-77`
  ↳ FIXED 3 Sep 2026 — money-blind roles are refused inline before any write; rate now toRupees(paisa) (booking_lines.rate is numeric(14,2)).
- [x] **NR-04 · P1 · BUG** — After createRental commits a Quote and confirmRental then throws (AssignmentIncompleteError, replayed create, offline, permission), the catch says “Nothing was written” — false — and a retry mints a new key, leaving orphan Quotes behind.  
  `src/modules/rentals/NewRental.tsx:1641-1653`
  ↳ FIXED 3 Sep 2026 — the step that failed is tracked; a half-success says the Quote was saved (with its number) and a retry confirms that same Quote. TODO(decision): edits between half-success and retry.
- [x] **NR-05 · P1 · BUG** ✔ driven — A brand-new booking opens pre-filled with demo money: dates 16→19 Jul 2026 (past), 7% discount, TOTAL Rs 1,54,482, “Rental paid Rs 15,000” subtracted from Outstanding with no payment, deposit 50,000/25,000 raising a pending-deposit alert, three crew pre-assigned, project “Echoes of Mustang”. Contradicts :1216 “A new booking starts EMPTY”.  
  `src/modules/rentals/NewRental.tsx:1179-1183,1239-1266`
  ↳ FIXED 3 Sep 2026 — project/kind blank, dates default to today→tomorrow (Kathmandu); driven: blank draft reads TOTAL Rs 0 · Rental paid Rs 0 · Discount 0%.
- [x] **NR-06 · P1 · BUG** — A client created from the booking cannot be booked: the record is built without dbId (comment claims client.create is unmapped — stale, core.ts:162 maps it), so it is auto-selected and Confirm refuses it as “sample data”.  
  `src/modules/rentals/booking/AddClientModal.tsx:628-629,671-694`
  ↳ FIXED 3 Sep 2026 — record built with id = clientCode and dbId = clientId; stale comment corrected.
- [x] **NR-07 · P2 · BUG** ✔ driven — WIP: PARENTS is imported and unused → tsc TS6133 under noUnusedLocals. The repo typecheck is red on this one line (other session's uncommitted diff).  
  `src/modules/rentals/NewRental.tsx:28`
  ↳ ALREADY FIXED — stale entry, closed by the other session's own commit of that WIP diff. Verified 5 Sep: `PARENTS` survives in `NewRental.tsx` only inside a doc comment, there is no import of it, and `tsc --noEmit` is clean at HEAD. Ticked as closed, not as fixed by this batch.
- [ ] **NR-08 · P2 · BUG** — WIP: Bundles are always seed — bundleResults reads ACTIVE_BUNDLES regardless of the live pool and gives ids like BND-x::model that createRental.validate rejects; the “sample equipment” notice now hides once the live pool lands, so the Bundles tab silently offers unsaveable rows.  
  `src/modules/rentals/booking/itemCatalogue.ts:660,801 · NewRental.tsx:2633`
- [ ] **NR-09 · P2 · BUG** — Live rows get a fabricated status (free>0 ? 'In Stock' : 'On Rent'); the page then raises Critical “Equipment conflict — X is On Rent” and blocks Confirm on today's stock for a future window, while the panel claims “Availability shown for this booking's dates”. Real window availability (queries/availability.ts) is not consulted.  
  `src/modules/rentals/booking/itemCatalogue.ts:388 · NewRental.tsx:1317`
- [ ] **NR-10 · P2 · BUG** — confirmBlocked ignores !client?.dbId, zero lines and non-uuid line ids: the Blocking-notices card says “Nothing is blocking this booking” while the next press of Confirm is refused inline.  
  `src/modules/rentals/NewRental.tsx:1383,2136-2137,1574-1592`
- [ ] **NR-11 · P2 · BUG** — “Book it anyway” is a dead end: the unit is added with its non-In-Stock status, the page raises a Critical conflict and blocks Confirm; the reason and approver collected are dropped. Header still cites the removed discount gate as precedent.  
  `src/modules/rentals/booking/OverbookingOverrideModal.tsx:70-73 → AddItemPanel.tsx:787`
- [ ] **NR-12 · P2 · BUG** — Invented status vocabulary in the documents block (“At Confirmed / Preparing / Dispatched”) and { n: 'Quote', ready: true } — no document exists, and ✉ drafts an email saying it is attached.  
  `src/modules/rentals/NewRental.tsx:1827-1833,3331`
- [ ] **NR-13 · P2 · BUG** ✔ driven — Footer reads “All changes saved” by default and “Offline · Changes saved locally” — nothing is persisted and there is no local store. Success claim for a write that never happened.  
  `src/modules/rentals/NewRental.tsx:1462,3157-3181`
- [ ] **NR-14 · P2 · BUG** — if (c.pan) setGovId(c.pan) leaves the previous client's PAN in the field for a client without one, satisfying the page-only “Missing client ID or PAN” gate; govId is never written.  
  `src/modules/rentals/NewRental.tsx:1336,1727-1730`
- [ ] **NR-15 · P2 · TODO** — There is no persisted Quote / inquiry stage: SAVE_DRAFT and CANCEL_RENTAL are console.log stubs (Save Draft always fails), Confirm goes Quote→Booked in one press, quoteExpiresAt is never set. No inquiry concept exists anywhere.  
  `src/actions/rentals/saveDraft.ts:18 · cancelRental.ts:18 · NewRental.tsx:1476-1513`
- [ ] **NR-16 · P2 · BUG** — Duplicate-phone detection runs against seed CLIENTS_DATA (the live clientPool is not passed) and CLIENTS_DATA.push(record) mutates the seed module.  
  `src/modules/rentals/booking/AddClientModal.tsx:336,691 · NewRental.tsx:3308`
- [ ] **NR-17 · P2 · BUG** — clientType, contactPerson, pan, creditLimit, paymentTerms, notes are collected but not sent, yet the confirmation shows “Credit limit Rs X” and “Payment terms” as if saved.  
  `src/modules/rentals/booking/AddClientModal.tsx:617-625,845-856`
- [ ] **NR-18 · P2 · BUG** — Page-local money: lineAmountPaisa rounds to paisa where price() rounds to whole rupees, crew-charge arithmetic and invoiceState derivation live on the page. Law 1.  
  `src/modules/rentals/NewRental.tsx:143-145,1287-1290,1311 · itemCatalogue.ts:48`
- [ ] **NR-19 · P2 · BUG** — days is a calendar diff ignoring the times collected: a same-day 09:00→18:00 booking is blocked (days === 0) although createRental.validate would accept it; line days are stamped at add time and never resync when dates change.  
  `src/modules/rentals/NewRental.tsx:1268-1273,1934-1939`
- [ ] **NR-20 · P2 · BUG** — Activity Timeline hard-codes “Draft created · by Ramesh Dulal” — a fabricated actor.  
  `src/modules/rentals/NewRental.tsx:2366-2368`
- [ ] **NR-21 · P2 · BUG** — WIP: live pool grouped by name — two products with the same name merge into one model row with “—” chips, autoPick takes whichever sorts first, key={group.name} duplicates.  
  `src/modules/rentals/booking/AddItemPanel.tsx:683-698 · itemCatalogue.ts:901-931`
- [ ] **NR-22 · P2 · BUG** — Promise.all — one failed read discards both pools and the message blames both; size: 500 silently caps the catalogue.  
  `src/modules/rentals/NewRental.tsx:1129-1136`
- [ ] **NR-23 · P3 · BUG** — “Overriding writes to audit.” with no override and no audit write; dead inv.bg === 'transparent' branches; notice lists keyed by text → duplicate keys.  
  `src/modules/rentals/NewRental.tsx:2987,1974-1975,2141,2318`
- [ ] **NR-24 · P3 · BUG** — CalendarPopover is role=dialog with no focus move/trap; TimeListPopover is a listbox of buttons with no arrow keys; toLocaleDateString('en-GB') is the ICU-dependent call money.ts bans.  
  `src/modules/rentals/booking/DateTimeField.tsx:151-162,204-257`
- [ ] **NR-25 · P3 · BUG** — Money-blind roles see “Pricing/Payments · Pending” rows that jump to an unrendered section; two success toasts per client create; ⌘K opens the item panel behind an open modal; lines.map() per render defeats the existing memo.  
  `src/modules/rentals/NewRental.tsx:1812-1819,1738,2650 · AddClientModal.tsx:695 · AddItemPanel.tsx:253-264`
- [ ] **NR-26 · P3 · TODO** — readVatRatePercent() returns 0 when unset (“VAT at 0%”) instead of “Not configured”; Field mints an error id no input receives via aria-describedby.  
  `src/modules/rentals/NewRental.tsx:95-98,384-390`

## 3 · Booked

_Rentals list and Booking Detail — /rentals, /rentals/:no_ — 20 items (1 P1)

- [x] **BD-01 · P1 · BUG** — Detail computes its own Overdue with a different rule than the list (no stage === 'On Rent' clause, wall clock instead of the day anchor): a Booked booking whose return date passed is “overdue” here (offers Send overdue notice) but not on the list. Law 1.  
  `src/modules/rentals/BookingDetail.tsx:1322-1327`
  ↳ FIXED 3 Sep 2026 — isOverdue requires stage === 'On Rent', the list's definition.
- [x] **BD-02 · P2 · BUG** ✔ driven — hasInvoice = liveInvoices.length > 0 ignores invoicesList.loading, so while the invoice read is in flight the header states “Outstanding — · No invoice raised yet” and the summary “No invoice has been raised… no Rental Total to state” as settled facts; B-716 flipped to INV-2 / Rs 17,097 seconds later. The section body (:2031) does gate on loading; the header and rail do not.  
  `src/modules/rentals/BookingDetail.tsx:1144,1430,1669`
  ↳ FIXED 5 Sep 2026 — `hasInvoice` now requires the read to have HAPPENED: `bookingId !== null && !invoicesList.loading && invoicesList.error === null`. Three clauses, each load-bearing — `useList` raises `loading` on every filter change, KEEPS its rows on failure (so `error` must be read too), and both money fetchers no-op until the booking uuid lands. Four surfaces rewired (Facts-strip caption, Booking Summary paragraph, the record-payment Unavailable reason, Review Summary cells). ⚠ ONE RESIDUAL FRAME: the single render on which the booking head first arrives still shows the settled empty result of the pre-uuid fetch — see BD-21.
- [x] **BD-03 · P2 · BUG** — A cancelled booking's detail shows no Cancelled mark and every verb stays live (Confirm at a cancelled Quote, Extend, Assign, Sub-rental); the list refuses operations on the same row. Law 3 says the terminal action must be visible.  
  `src/modules/rentals/BookingDetail.tsx:367,1325,1534`
  ↳ FIXED 5 Sep 2026 — `cancelledReason` mirrors `RentalsList.tsx`'s row menu VERBATIM rather than inventing a second rule (Law 1), gating Confirm, Close, both operations launchers and the overflow's Extend / Assign crew / Create sub-rental — all still VISIBLE and greyed with the reason. Law 3's mark is `<Badge flag="Cancelled" />` on the header AND the Rental Days fact. Driven: seeded `cancelled_at` on B-903 through the mock overlay — CANCELLED renders twice, Operations is disabled reading “B-903 is cancelled — no operation runs on it”, and all five overflow verbs are disabled. (The corpus contains no cancelled booking, which is why this needed seeding.)
- [x] **BD-04 · P2 · BUG** ✔ driven — Quick Actions “Open Operations” is enabled at Quote while the header launcher is disabled with “Operations open once this booking is Booked.” Two answers on one screen (probed on B-800).  
  `src/modules/rentals/BookingDetail.tsx:367-375 vs 1462-1464`
  ↳ FIXED 5 Sep 2026 — `OperationsLauncher` no longer computes `status === 'Quote'` itself; it takes `unavailable`/`label`/`icon`. The rail's Quick Actions entry was a bare live `<Button>` and is now the same component fed by the same `operationsUnavailable` predicate. One question, one answer.
- [x] **BD-05 · P2 · BUG** — Each line row ends in a bare more_vert glyph styled as a ⋮ menu — no button, no handler, no reason.  
  `src/modules/rentals/BookingDetail.tsx:1906-1908`
  ↳ FIXED 5 Sep 2026 — the sixth `<td>` held a bare `more_vert` Icon with no button and no handler, under an unlabelled sixth `<th>`. Searched for a menu it might open: none exists (the only row-level verb is the unit-release × in the Serial/ID cell, and line writes have no path — `ITEM_EDIT_UNAVAILABLE`). Cell and header removed; removing dead UI is not a Law 3 deletion, which governs entities and data. Driven: the lines table renders 5 columns.
- [x] **BD-06 · P2 · BUG** — “Customer Pickup” rendered verbatim in the Rentals list intel card while Booking Detail maps the same enum to “Client Pickup”. The word customer must not appear in the UI.  
  `src/data/rentals.ts:1156 vs src/lib/format.ts:79`
  ↳ FIXED 5 Sep 2026 — the intel card printed `row.deliveryType` RAW, so a `'Customer Pickup'` booking put the forbidden word on screen. Routed through `lib/format.ts`'s `deliveryTypeLabel`, the one sanctioned enum→copy crossing. The STORED enum is untouched (it genuinely spells that member, `0001_enums.sql:34`) and comparisons against the stored value were deliberately left alone. App-wide sweep run for the same class; tests extended.
- [x] **BD-07 · P2 · BUG** — rentalDays = Math.round(ms/86 400 000) on-page; civilDaysBetween and lateFee.ts use different rules, so a 09:00→06:00 span counts differently on three screens. Law 1.  
  `src/modules/rentals/BookingDetail.tsx:954-958`
  ↳ FIXED 5 Sep 2026 — the page's private `Math.round(ms / 86_400_000)` moved to a new engine, `src/lib/rentalDays.ts` (Law 1). The rule implemented is the elapsed-ms rounding the page already used, because that is the rule that decides what was BILLED — `NewRental.tsx` computes the same span and it reaches `booking_lines.days`. Edge behaviour changed deliberately: an unparseable instant answered `1` (a fabricated “1 Day”) and now answers `null` → “Not recorded”. 12 engine tests, one pinning the disagreement with `civilDaysBetween`. ⚠ TODO(decision) stands: three day-counts exist (elapsed hours here, calendar days in `civilDaysBetween`, overage bands in `lateFee()`) and no spec chooses between them.
- [x] **BD-08 · P2 · BUG** — getClient failure is swallowed to null, so a network/RLS error renders WhatsApp entries as “no phone on file” — a fabricated fact. Law 12.  
  `src/modules/rentals/BookingDetail.tsx:1287-1289`
  ↳ FIXED 5 Sep 2026 — the `string | null` became a four-state `ClientContact` (`absent` | `loading` | `ready` | `failed`), so a FAILED read can no longer be read as an absent phone (Law 12). The failure is surfaced inline and persistently as a `role="alert"` in the block it is about. ⚠ The alert's first wording promised “unavailable until it loads” — false, nothing re-runs that effect; corrected to name the remount, with the reason written down. A retry control is the better fix and is a build task, not a ruling — see BD-22.
- [ ] **BD-09 · P2 · TODO** — Extend writes nothing: input is { id } (“Placeholder”), implemented unset so createAction refuses; days/rate/reason/new date go nowhere; no availability re-check.  
  `src/modules/rentals/modals/ExtendRentalModal.tsx:143 · src/actions/rentals/extendRental.ts:4-17`
- [ ] **BD-10 · P2 · TODO** — Sub-rental modal writes nothing; vendor and client charge are dropped from the input; no booking_lines row of line_type 'Sub-rental' is ever created.  
  `src/modules/rentals/modals/CreateSubRentalModal.tsx:105-108 · src/actions/subrentals/createSubRental.ts`
- [ ] **BD-11 · P2 · TODO** — Assign Crew reads the seed CREW_ROSTER with invented rates; bookCrew is a stub; rate/days never reach the input.  
  `src/modules/rentals/modals/AssignCrewModal.tsx:6,39,199 · src/actions/crew/bookCrew.ts`
- [ ] **BD-12 · P2 · TODO** — LateFeePanel has zero importers; onSettle persists nothing; the late-return panel “returns when a per-booking day rate has a sanctioned read”. Late fees never reach the ledger.  
  `src/modules/rentals/LateFeePanel.tsx · BookingDetail.tsx:2131-2133`
- [ ] **BD-13 · P2 · TODO** — Seven blocks state “no query module yet”: Alerts, Activity Timeline, Crew, Transport detail, Documents, Deposit received/pending, per-line rate. Honest, but the detail page renders nothing for them.  
  `src/modules/rentals/BookingDetail.tsx:1493-1510,1962-1969,2218-2223`
- [ ] **BD-14 · P2 · TODO** — The list has no search input (the header search is a ⌘K placeholder), ten of eleven Filters-rail groups are inert, Save View / Export / Timeline view are Unavailable.  
  `src/modules/rentals/RentalsList.tsx:1148-1178 · src/components/shell/Header.tsx:177`
- [ ] **BD-15 · P2 · TODO** — “Save draft” overflow entry is Unavailable (“no write path”) while saveDraft.ts exists as a console.log stub.  
  `src/modules/rentals/BookingDetail.tsx:1590-1596 · src/actions/rentals/saveDraft.ts:17`
- [x] **BD-16 · P3 · BUG** — Status hues on non-status things: delivery-type pill uses STATUS.in, the payment status pill is always STATUS.in regardless of p.status (a reversed payment renders green), note-type chips use progress/primary backgrounds.  
  `src/modules/rentals/BookingDetail.tsx:1991,2187-2188,845-846`
  ↳ FIXED 5 Sep 2026 — and the first pass fixed only half of it. The payment-status pill was `STATUS.in` for every row, so a Failed or Cancelled payment rendered as money that arrived. But the SAME row's hover Intel card (`data/bookingIntel.ts`'s `paymentGlance`) kept a TWO-way ternary over a FOUR-member enum — caught by two reviewers independently. There were THREE copies of this map (Finance's ledger, the booking history, the intel card) and they disagreed; there is now ONE, `PAYMENT_STATUS_TONE` in `lib/status.ts`, keyed on `PaymentStatus` so a new member is a compile error, plus `paymentStatusTone()` for the loosely-typed seed shape which refuses to answer `in` for an unrecognised value. The glance's dot was also colour-ALONE; the status word is now a badge beside it. Delivery-type and note-type chips lost their borrowed status hues. 8 pinning tests.
- [ ] **BD-17 · P3 · BUG** — a11y: OverflowMenu role=menu with no focus move, arrow keys or focus return; Segmented tablist with no aria-controls; ColumnMenu checkboxes inside role=menu; a focusable-but-inert disabled menuitem span.  
  `src/modules/rentals/BookingDetail.tsx:454-560,601-640,1566 · RentalsList.tsx:456,508-524`
- [ ] **BD-18 · P3 · BUG** — Projected return date built with local setDate + toLocaleDateString('en-GB') instead of the Kathmandu renderer (Law 7); unreachable past the stub today.  
  `src/modules/rentals/modals/ExtendRentalModal.tsx:69-75 · BookingDetail.tsx:2449-2451`
- [x] **BD-19 · P3 · BUG** — “Recorded by” renders a raw users.id uuid; clientPhone is not reset when clientId becomes undefined, so detail→detail can carry the previous client's phone for a render.  
  `src/modules/rentals/BookingDetail.tsx:1194,1273-1289 · src/data/bookingIntel.ts:134`
  ↳ FIXED 5 Sep 2026 — the stale-phone half is the real defect and is fixed: the effect returned early on a missing `clientId` and, on a CHANGED one, started the fetch without clearing state, so detail→detail carried the previous client's number (a fabricated fact and a cross-client leak). Proved non-vacuously — removing the one new line makes the navigation test fail. The raw `users.id` is fixed as far as it honestly can be: no name is substituted because none can be READ (`users`' only SELECT policy is `users_select_own`, which is why `queries/finance.ts` refuses to join it), so it states that the screen cannot resolve it. TODO(decision) filed.
- [x] **BD-20 · P3 · BUG** — console.log('[DB TX] …') in action bodies.  
  `src/actions/rentals/extendRental.ts:17 · cancelRental.ts:17 · saveDraft.ts:17`
  ↳ ALREADY FIXED — this entry was STALE, and the batch that claimed it did not change a line. Verified 5 Sep: `extendRental.ts`, `cancelRental.ts` and `saveDraft.ts` contain no `console.` call at all; the surviving `[DB TX]` strings in `src/actions/` are inside doc comments describing what the stubs used to do. The real calls went in the 3 Sep console sweep (`7cf67d2`). The only ungated `console.*` left in action bodies are the deliberate §4.36 audit-failure captures. Ticked as closed, not as fixed by this batch.

- [ ] **BD-21 · P3 · BUG** — One frame of the BD-02 fix is still open. `useList` raises `loading` inside its fetch EFFECT, so on the single render where the booking head first arrives the hook still holds the settled empty result of the pre-uuid fetch: `bookingId` is already non-null and `loading` is not yet true, so all three guards pass and “No invoice raised yet” paints for one frame before the real read starts. Far narrower than the original defect (one frame, not the whole fetch) but it is the same false statement about money.  
  `src/modules/rentals/BookingDetail.tsx` (the `invoicesKnown` predicate) · `src/lib/queries/useList.ts:162,178`
  ↳ The fix is in `useList`, not on this page — the hook should report `loading` from the render in which its filter key changes rather than from inside the effect. That touches every list screen in the app, which is why it was not done inside a Booking Detail batch.

- [ ] **BD-22 · P3 · TODO** — A failed client read on Booking Detail cannot be retried without leaving the page. The contact effect has one dependency, `booking?.clientId`; the two retry controls on the screen call `invoicesList.refetch()` and `paymentsList.refetch()` and neither re-reads the client. The BD-08 alert now says so honestly (“until the booking is reopened”) instead of promising a load that never comes, but the right answer is a retry control beside the alert. Build task, not a ruling.  
  `src/modules/rentals/BookingDetail.tsx` (the `getClient` effect and the BD-08 alert)

## 4 · Packing

_Packing Workspace and the Operations floor — /rentals/:no/packing, /operations_ — 19 items (4 P1)

- [x] **PK-01 · P1 · BUG** ✔ driven — Complete Packing navigates to the booking on any resolved promise and never reads result.stage / stageHeldBy. The engine reports a held stage truthfully; the operator leaves believing the booking is Packed while it is still Booked. (Driven on B-716: no message, lands on a Booked booking.)  
  `src/modules/rentals/PackingWorkspace.tsx:517 · src/actions/rentals/floorVerb.ts:774-786`
  ↳ FIXED 3 Sep 2026 — dispatch reads the result; a held stage renders an inline notice with stageHeldBy and a Back-to-booking button instead of navigating.
- [x] **PK-02 · P1 · BUG** — Service, Sub-rental, Manual item and Bundle parent lines are rendered as required rows and counted by the close gate (buildRows has no line_type filter). Either Packed is unreachable or a fabricated pack row is written for a service.  
  `src/modules/rentals/PackingWorkspace.tsx:141-183 · floorVerb.ts:380-389,1249-1256`
  ↳ FIXED 3 Sep 2026 — Service / Sub-rental / Manual item and Bundle parents with children are no longer packable rows or dispatched lines.
- [x] **PK-03 · P1 · BUG** — UI gate passes with a non-required unit Pending, but the engine sends qty 3 against required 4 → 'Partial' → stage held. 'Not Required' is in TERMINAL_LINE_STATES but nothing emits it; packing_lines.is_required is never written.  
  `src/modules/rentals/PackingWorkspace.tsx:385-403 vs floorVerb.ts:804,1253-1255`
  ↳ FIXED 3 Sep 2026 — the UI gate counts every unit of a line, matching the engine's qty-vs-required rule.
- [x] **PK-04 · P1 · BUG** — Resuming an In Progress session re-inserts session_line_movements with fresh client_uuids: a retry after a mid-verb failure or a second Complete on a held session doubles the packed count summed from movements. Law 8.  
  `src/actions/rentals/floorVerb.ts:646-647,681-708,946-984`
  ↳ FIXED 3 Sep 2026 — writeMovements reads the session's prior movements and skips units already moved; a qty row is not appended twice (append-only table, so a changed count is a TODO(decision)). floorVerb tests 44/44.
- [ ] **PK-05 · P2 · BUG** — Session is marked Completed before the stage transition is attempted; if the transition is refused the packing session is sealed at Booked, the next attempt inserts session_no 2, and operation_sessions_one_packing_per_booking rejects it forever.  
  `src/actions/rentals/floorVerb.ts:731-739,774`
- [ ] **PK-06 · P2 · BUG** — A mixed line (some Packed, some Missing) is sent as outcome 'done'; the missing units' reasons ride notes only, packing_lines.missing_reason is never written for them, no unit is recorded Missing.  
  `src/modules/rentals/PackingWorkspace.tsx:206-258`
- [ ] **PK-07 · P2 · BUG** ✔ driven — “Bulk Scan” is packAll — one click marks every row Packed with no scan or serial check (driven: 0/3 → 3/3 in one click); the scanner modal's “Available Items for Test Scanning” chips let any unit be “scanned” by tapping it on a production floor screen.  
  `src/modules/rentals/PackingWorkspace.tsx:466-475,830 · src/components/ui/BarcodeScannerModal.tsx:327-358`
- [ ] **PK-08 · P2 · BUG** ✔ driven — Print Packing List has no onClick — a live-looking dead control (probe: the only dead enabled button on the page).  
  `src/modules/rentals/PackingWorkspace.tsx:673`
- [ ] **PK-09 · P2 · BUG** — Duplicate scan: the modal beeps success and logs “marked”, while pack() writes “already packed” to a log hidden behind the modal. Two verdicts for one scan.  
  `src/modules/rentals/PackingWorkspace.tsx:1228-1230 · BarcodeScannerModal.tsx:151-165`
- [ ] **PK-10 · P2 · TODO** — Save Draft always fails (stub, ActionNotImplementedError) and the failure lands under the title “Packing was not recorded”. Should be Unavailable, not a primary control.  
  `src/modules/rentals/PackingWorkspace.tsx:682-698 · src/actions/rentals/saveDraft.ts`
- [ ] **PK-11 · P2 · TODO** ✔ driven — The §4.31 mandatory-evidence gate is satisfied by setPhotoCount(n => n + 1); no evidence_files write exists (driven: Take Photo → gate green, nothing uploaded).  
  `src/modules/rentals/PackingWorkspace.tsx:388,412-416,1165`
- [ ] **PK-12 · P2 · BUG** — Launcher dot state is stepDotState(job, status, { done: 0, total: 1 }) — the entry step always reads “Not started”, even with an In Progress session.  
  `src/modules/operations/OperationsShell.tsx:187`
- [ ] **PK-13 · P2 · TODO** — Zero importers anywhere — a dead 1,400-line seed-driven modal with hardcoded actors 'Ramesh'/'Hari', fake offline flush and fake photo entries. Archive per §4.41.  
  `src/modules/operations/shell/OperationsShell.tsx · shell/steps/* · shell/EvidencePanel.tsx`
- [ ] **PK-14 · P2 · TODO** — Seed packing file (asserting the overturned one-photo-per-case rule) feeds the Evidence page's 18 units; BookingNotLoaded copy claims a floor-lines read is missing (false since fetchFloorBooking); the Operations Cases chip is a seed count beside four server counts.  
  `src/data/packing.ts:160-233 · src/modules/operations/BookingNotLoaded.tsx:435-439 · OperationsQueues.tsx:147,688-713`
- [ ] **PK-15 · P3 · BUG** ✔ driven — Units and rows are mixed in the same panel: the tree shows “0/1” for a qty-2 line, the header “3 units · 2 lines”, Bundle Summary “Total Rows 2 … always sum to 2” beside Progress “0/3”. Same pattern on Reset (“0/3 Ready · 2 items in the queue”).  
  `src/modules/rentals/PackingWorkspace.tsx tree/summary`
- [ ] **PK-16 · P3 · BUG** — deviceType is never passed, so every tablet floor write is audited as 'Desktop'.  
  `src/actions/rentals/floorVerb.ts:752-765 · src/lib/audit.ts:331`
- [ ] **PK-17 · P3 · BUG** — serial '' written for serial-less units; location read but never sent as warehouseLocation; job chip reads In Progress when everything is resolved; banner says “All items packed successfully” before any dispatch.  
  `src/modules/rentals/PackingWorkspace.tsx:242,159-165,380,1021-1025`
- [ ] **PK-18 · P3 · BUG** — Scan input has no aria-label and the result banner no aria-live; 26px chips and ~30px tree rows on the gloved-tablet screen; “Scan Barcode” and “Scan QR” are identical; blocked rows render the reason twice; dialog has no initial focus.  
  `src/components/ui/BarcodeScannerModal.tsx:261-325 · PackingWorkspace.tsx:768-868,831-832 · OperationsShell.tsx:220-235`
- [ ] **PK-19 · P3 · TODO** — Comment claims an offline path but readBooking throws offline before any write; §4.36 audit-failure policy still open; /operations search placeholder names the removed Job.kit.  
  `src/actions/rentals/floorVerb.ts:366-377,650,741-771 · src/App.tsx:375`

## 5 · Handover

_Handover Workspace and Evidence — /rentals/:no/handover, /evidence_ — 16 items (5 P1)

- [x] **HO-01 · P1 · BUG** — Multi-session handover is broken: “recorded by an earlier session” is read from booking_line_units.unit_state, which nothing writes (see X). Session 2 renders every handed-over unit as Ready; re-marking re-dispatches duplicate movements and overwrites handover_lines.completed_session_id.  
  `src/modules/rentals/HandoverWorkspace.tsx:228,439 · floorVerb.ts:844-880`
  ↳ FIXED 3 Sep 2026 via X-03 — unit_state and handover_session_id are now written, so the "earlier session" read is real.
- [x] **HO-02 · P1 · BUG** — Gate 1 facts are collected and dropped: operation_sessions.government_id_verified / booking_authorization_verified exist, HandoverRentalInput has no field for them, so every session records both false while the copy says “these two facts ride the session as gate 1”.  
  `src/modules/rentals/HandoverWorkspace.tsx:849-855 · floorVerb.ts:650-664`
  ↳ FIXED 3 Sep 2026 — governmentIdVerified / bookingAuthorizationVerified ride HandoverRentalInput → operation_sessions; driven: session row shows both true.
- [x] **HO-03 · P1 · BUG** — Signature “Capture” stamps {name, role, at} into local state only; the signatures table has zero writers. Gate 5 turns green on a button press and “Signed · name · at” asserts something never stored.  
  `src/modules/rentals/HandoverWorkspace.tsx:613-618,1158-1183,1385`
  ↳ FIXED 3 Sep 2026 (made honest) — the captured line states it is session-only and not stored; TODO(decision) names the signatures writer.
- [x] **HO-04 · P1 · BUG** ✔ driven — “Mark Cleared →” on Payment Verified / Deposit Received is a one-click self-certification for any role including Warehouse (the “no role switch exists” justification is stale — useAuth supplies the role); with the engine gate dead (§4.35a), a Warehouse actor can put a booking On Rent with payment and deposit outstanding.  
  `src/modules/rentals/HandoverWorkspace.tsx:502-505,1065-1069,1100-1101`
  ↳ FIXED 3 Sep 2026 — Mark Cleared is live only for canViewMoney roles; others see Unavailable with the Law 6 reason.
- [x] **HO-05 · P1 · BUG** — Mixed line (some Picked Up, some Missing): the button reads “Complete Handover” and promises On Rent, but the engine gets qty < required → handover_lines 'Remaining', stage stays Packed, and Missing survives only as free text in notes.  
  `src/modules/rentals/HandoverWorkspace.tsx:302-320,464,523-526`
  ↳ FIXED 3 Sep 2026 — caption promises On Rent only with no Missing rows; a held stage is reported inline, not navigated away from.
- [ ] **HO-06 · P2 · TODO** — No storage bucket, no storage.from(), no evidence_files writer anywhere; gate 6 passes on a counter click; packingPhotosRequired is read by no workspace and evidenceRetentionDays by nobody.  
  `src/modules/rentals/HandoverWorkspace.tsx:481,1145 · EvidenceWorkspace.tsx:60-62 · src/lib/settingsStore.ts:321,344`
- [ ] **HO-07 · P2 · TODO** — The six §11.1 session gates are UI-only by the engine's own statement; the Partial Pickup flag is never written (booking_flags CHECK lacks it) and disappears on reload.  
  `src/actions/rentals/floorVerb.ts:90-95,101-105`
- [ ] **HO-08 · P2 · TODO** ✔ driven — Evidence Workspace is seed end to end: PHOTOS from data/evidence.ts, BOOKING.no = B-715 only; every other booking gets BookingNotLoaded, so Handover's “View All” is a dead end for real bookings.  
  `src/modules/rentals/EvidenceWorkspace.tsx:14-17,122,148,185-187`
- [ ] **HO-09 · P2 · BUG** ✔ driven — Stage badge and Status cell are the literal 'Booked' and dates the literal 16/19 Jul 2026 regardless of the booking (driven: B-715 is Packed, page says Booked).  
  `src/modules/rentals/EvidenceWorkspace.tsx:169-170,213,285-287,584`
- [ ] **HO-10 · P2 · BUG** — Seven BULK_ACTIONS buttons render enabled from an array with no handler; Remove/Confirm removal writes local state only while the copy promises “Retained and audited… Archived filter” (no dispatch, no such filter); “Clear all filters” leaves category set.  
  `src/modules/rentals/EvidenceWorkspace.tsx:471-473,675-743,564`
- [ ] **HO-11 · P2 · TODO** — REVIEW_EVIDENCE is a console.log stub (every Mark as Review fails); “Thresholds live in Settings ▸ Evidence” names a setting that does not exist; processing steps are literal Complete/In Progress/Pending.  
  `src/actions/rentals/reviewEvidence.ts:20 · EvidenceWorkspace.tsx:647-668,617-618,303-304 · src/data/evidence.ts:37-40`
- [ ] **HO-12 · P2 · BUG** — “Bulk Scan” scans nothing; Cancel Handover discards marks, reasons and signatures with no confirm; the override reason textarea is “consumed by nothing” under a permanently disabled Apply.  
  `src/modules/rentals/HandoverWorkspace.tsx:585-595,864,1286-1295,407,1104-1111`
- [ ] **HO-13 · P2 · TODO** — Driver signature is “Optional — no driver recorded” for Babin Delivery / Third Party, so a delivery handover closes with no driver signature; Courier is admitted by 0003 but excluded here. Driver identity source unruled.  
  `src/modules/rentals/HandoverWorkspace.tsx:99-100,195-197,1180 · floorVerb.ts:101-105`
- [ ] **HO-14 · P3 · BUG** — A third copy of the rental-day rule on the page; Sig.at stores display text not an instant; in-flight dispatch can write dispatchError onto the next booking's screen; chip counts are rows while the progress bar is unit-weighted; a dead '✕' log branch.  
  `src/modules/rentals/HandoverWorkspace.tsx:327-331,618,419-434,621-659,879,1273`
- [ ] **HO-15 · P3 · BUG** — useMemo keyed on a value rebuilt every render; 28–34px controls under the 44px floor; raw font-size literals.  
  `src/modules/rentals/EvidenceWorkspace.tsx:148-154,223-230,458,697 · HandoverWorkspace.tsx:888,1445`
- [ ] **HO-16 · P3 · TODO** — data/handover.ts has zero importers and carries invented PII plus a module-scope console.error (archive it); HandoverSheet is the shift-handover modal (every control Unavailable, “Skip” logs out) and collides in name with the equipment verb.  
  `src/data/handover.ts · src/modules/auth/HandoverSheet.tsx:43-44,136-139 · src/components/shell/Header.tsx:428-435`

## 6 · On Rent → Return

_Return & Inspection Workspace — /rentals/:no/return_ — 8 items (2 P1)

- [x] **RT-01 · P1 · TODO** — Nothing writes bookings.actual_return_at; stage still advances to Returned. The overrun band is computed against new Date() at render, so it drifts with the clock and a late fee can never be computed from persisted data.  
  `src/actions/rentals/floorVerb.ts:96 · src/lib/money.ts:278 · ReturnWorkspace.tsx:726`
  ↳ FIXED 3 Sep 2026 — floorVerb stamps bookings.actual_return_at (once, at the session that moves the booking to Returned, with the action key). The earlier refusal read the table-level Booqable switch as ownership; the spec masters at field level, booqable/map has no actual-return field, and 0002:86 names the Return workspace as the writer. Driven: B-715 Complete Return → stage Returned, actual_return_at stamped, 18 unit rows Returned. floorVerbs tests 45/45. Still open here: the late fee that reads it (BD-11, P2).
- [x] **RT-02 · P1 · TODO** — Damage at Return produces no damage_findings / cases row — description and photo tally ride operation_sessions.notes. DamageTab reads seed DAMAGE_FINDINGS. There is no path from a real return to a deposit deduction.  
  `src/modules/rentals/ReturnWorkspace.tsx:273-275,347-355 · src/data/damage.ts:4-6`
  ↳ FIXED 3 Sep 2026 — damage on a serialised unit is now a `damage_findings` row: `FloorLineInput.damage` carries per-unit findings (the line's own `condition` is the worst of the line and cannot say which unit), and the Return verb writes one row per unit with source 'Return inspection', parented on the `return_lines` row it just wrote. `estimated_cost` is never written (0003:488 reserves it for the approver, 0034 revokes SELECT from authenticated) and `approval_state` takes the column default 'Pending Approval'. `severity` states that no scale is ruled (0003:486) and `damage_type` takes the floor's own word — both TODO(decision). A quantity line names no unit, so it still rides the notes and the note says so. Driven: B-715 handed over then returned with one unit Damaged → one finding, right parent, no cost. floorVerbs 50/50. STILL OPEN: nothing reads these rows — DamageTab is seed (RS-05) and no approve/charge action exists, so the deposit deduction path is still not built.
- [ ] **RT-03 · P2 · BUG** — A line declared Not Returned with decision 'Still expected' is terminal → the booking advances to Returned, after which Return refuses (“already returned”), so the expected item can never be received.  
  `src/actions/rentals/floorVerb.ts:286 · ReturnWorkspace.tsx:714-717`
- [ ] **RT-04 · P2 · TODO** — Mixed line: missing units' reason+decision ride notes only; return_lines.not_returned_decision is never set; the next session renders those units Outstanding again.  
  `src/modules/rentals/ReturnWorkspace.tsx:220,266-271,337-343`
- [ ] **RT-05 · P2 · TODO** — “Damaged or Lost items carry a description and a photo” passes on a local counter (“Count a Photo”) with no file.  
  `src/modules/rentals/ReturnWorkspace.tsx:504-506,537-543,1539 · ResetWorkspace.tsx:1152`
- [ ] **RT-06 · P2 · BUG** ✔ driven — Print Return Report has no onClick and is not wrapped in Unavailable — dead primary-looking control (probe: the only dead enabled button on the page).  
  `src/modules/rentals/ReturnWorkspace.tsx:850`
- [ ] **RT-07 · P2 · TODO** — INSPECTION_REQUIRED events are emitted per uninspected line with no subscriber; startInspection stays unreachable. Event to nowhere.  
  `src/actions/rentals/returnRental.ts:94-97 · src/events/eventBus.ts`
- [ ] **RT-08 · P3 · BUG** — “Scan Barcode” and “Scan QR” both call setShowScanner(true).  
  `src/modules/rentals/ReturnWorkspace.tsx:907-912`

## 7 · Cleaning / Reset

_Reset Workspace, Cases, Damage, Maintenance — /rentals/:no/reset, /inventory/cases_ — 15 items (8 P1)

- [x] **RS-01 · P1 · BUG** — The page dispatches only unitIds; CompleteResetInput has no resetEntries, so cleanedBy / qcBy / qcSkipReason / qcFailReason / problemState are unreachable from the UI. The §10 self-QC gate the page enforces persists nothing.  
  `src/modules/rentals/ResetWorkspace.tsx:561-569,596-605 · src/actions/rentals/completeReset.ts:19-35 · floorVerb.ts:160-183`
  ↳ FIXED 3 Sep 2026 — completeReset accepts resetEntries; the page sends cleanedBy/qcBy (as user.id when it is the signed-in operator), qcSkipped/qcSkipReason, qcFailReason, problemState. TODO(decision): staff picker for a second person.
- [x] **RS-02 · P1 · TODO** — Reset completion flips no unit state and nothing in availability reads reset_completed_at: the “READY · Ready to rent” tile is UI-only. Units never return to the available pool through this flow.  
  `src/actions/rentals/floorVerb.ts completeResetQueue · src/lib/availability.ts · ResetWorkspace.tsx:98,772`
  ↳ FIXED 4 Sep 2026 — availability now reads the reset queue, which is what finally gives `reset_completed_at` a consequence. `UnitCandidate.openCleaning` carries the unit's OPEN entry (`requires_reset`, no `reset_completed_at`), `selectUnitsForLine` rejects it with a new `{kind:'cleaning'}` reason, and `explainShortfall` says which booking the gear is still on the bench from. Deliberately NOT `product_units.status`: that column is Booqable-mastered and the OS may not write it, so an OS-owned fact comes from an OS-owned table. TODO(decision) in place: an open entry is a fact about today and no reset has an expected completion date, so there is no honest horizon for a future window — it excludes outright for now, the direction that can only refuse a legal booking. availability 48/48. Driven: after Complete Reset, 17 of 18 entries carry `reset_completed_at` and the routed one does not, which is exactly the in-pool/out-of-pool split. The picker itself is not reachable from the UI yet (`planAssignment` runs at Confirm, and New Rental's panel reads `itemCatalogue`).
- [x] **RS-03 · P1 · TODO** — A unit marked Damaged / Missing / Needs Repair at Reset is excluded from the dispatch and no repair or case record is written — exceptions do not block completion, so the item leaves no record anywhere.  
  `src/modules/rentals/ResetWorkspace.tsx:385-387,1163`
  ↳ FIXED 4 Sep 2026 — the exception rows are dispatched. `problem_state` always had a writer in `completeResetQueue`; the screen simply never named the entry, so it was never reached. `dispatchRows` now carries Ready rows AND recorded exceptions, a Damaged row also sends its type, severity and description, and the engine writes a `damage_findings` row with `source = 'Cleaning'` parented on the queue entry (0003:474). The cleaning screen collects real vocabularies (Cosmetic/Functional/Structural, Low/Medium/High) so those columns take the floor's own words, not the Return path's placeholder. The completion gate now admits an exception-only session and refuses a Damaged row with no description. TODO(decision): the Manager case 0003:484 calls for is NOT raised — `cases` has no writer and no number sequence, so `case_id` stays null and the finding is the record. floorVerbs 53/53. Driven: B-715 reset with one unit Damaged → `problem_state` 'Damaged', no reset stamp on it, and a Cleaning finding with type Structural, severity High, no `estimated_cost`, no `case_id`.
- [x] **RS-04 · P1 · BUG** — Settled list computes the refund from the charge even on Rejected findings — a rejected Rs 8,000 charge still prints “refund Rs 42,000 · uncovered…”. Wrong money on screen.  
  `src/modules/inventory/DamageTab.tsx:345`
  ↳ FIXED 3 Sep 2026 — Rejected findings settle with a zero charge and read "No charge — rejected".
- [x] **RS-05 · P1 · BUG** — Approve mutates local findings only, then prints “Approved — X moved to Maintenance and is no longer available for booking” — no damage_findings write, no maintenance job, no product_units change.  
  `src/modules/inventory/DamageTab.tsx:161,283-293`
  ↳ FIXED 3 Sep 2026 (made honest) — the approval notice says it is recorded on this screen only and nothing was written; test updated.
- [x] **RS-06 · P1 · BUG** — Log Incident Case writes nothing yet closes as success: id CASE-2026-${random}, owner 'Warehouse Staff', linkedRecordId defaults to 'B-715'. data/cases.ts itself says “Case creation is not built yet”.  
  `src/modules/operations/modals/LogCaseModal.tsx:60,82-109 · src/data/cases.ts:991`
  ↳ FIXED 3 Sep 2026 — Log Incident is Unavailable with NEW_CASE_UNAVAILABLE_REASON.
- [x] **RS-07 · P1 · BUG** — “Estimated Cost (Rs)” and “Deposit Hold Amount (Rs)” render for every role with no useCanViewMoney gate; Warehouse types deposit holds. holdPaisa = rupees(depositHoldRupees || estimatedCostRupees) is deposit logic on a page.  
  `src/modules/operations/modals/LogCaseModal.tsx:268-318 · CasesWorkspace.tsx:282 · src/modules/inventory/modals/LogMaintenanceModal.tsx:273-293 · Maintenance.tsx:796`
  ↳ FIXED 3 Sep 2026 — cost and deposit-hold fields render only for useCanViewMoney roles in both modals.
- [x] **RS-08 · P1 · BUG** — Schedule Job mints MJ-2026-${random} (the ruled sequence is MT-), emits MAINTENANCE_STARTED directly, bypasses createMaintenanceJob/createAction (no permission, no idempotency key, no write) and reports success.  
  `src/modules/inventory/modals/LogMaintenanceModal.tsx:68-90 · Maintenance.tsx:98-106`
  ↳ FIXED 3 Sep 2026 — Log Maintenance is Unavailable with a stated reason.
- [ ] **RS-09 · P2 · BUG** — Logging a case/job inserts the row twice (event handler + onSuccess), the filtered list omits the new row until a filter changes (useMemo deps), and KPIs/chips read module constants while the table reads state — counts contradict the list.  
  `src/modules/operations/CasesWorkspace.tsx:126-130,165,188-243,413-415 · Maintenance.tsx:515-586,622,1000-1042`
- [ ] **RS-10 · P2 · BUG** ✔ driven — “Open Case” navigates to /inventory/cases/:id, which mounts the same CasesWorkspace that never reads useParams — a live control to nowhere.  
  `src/modules/operations/CasesWorkspace.tsx:398 · src/App.tsx:396-402 · src/data/cases.ts:994`
- [ ] **RS-11 · P2 · TODO** — No disposition / resolve / close control exists on Cases (resolveCase still referenced only from src/archive); Maintenance jobs have no complete/cancel. Neither has a reachable terminal action.  
  `src/modules/operations/CasesWorkspace.tsx · src/actions/cases/resolveCase.ts · Maintenance.tsx:984`
- [ ] **RS-12 · P2 · BUG** — QC-by is free text defaulting to the actor's name — the fabricated-identity pattern removed elsewhere — and qc_by is a users.id, so a typed name could never be written anyway.  
  `src/modules/rentals/ResetWorkspace.tsx:563,1371-1377 · floorVerb.ts:156`
- [ ] **RS-13 · P2 · TODO** — Reject records only state 'Rejected' — no reason, no rejector; the Settled list shows “by …” only for approvals.  
  `src/modules/inventory/DamageTab.tsx:298-305`
- [ ] **RS-14 · P3 · BUG** — Row/select-all checkboxes feed a selectedRowIds nothing consumes; “Case ID” header has cursor:pointer and no sort; inline any-typed handlers resubscribe every render; CASES_SEED_ERROR is computed and never rendered.  
  `src/modules/operations/CasesWorkspace.tsx:302-332,310,126 · Maintenance.tsx:833-867,515 · src/data/cases.ts:940-983`
- [ ] **RS-15 · P3 · BUG** — Every <label> lacks htmlFor/id association; TODAY resolved once at module load.  
  `src/modules/operations/modals/LogCaseModal.tsx:153-330 · LogMaintenanceModal.tsx:134-343`

## 8 · Close the money

_Finance, Payments, Invoices, Expenses, Daily Closing — /finance/*_ — 15 items (3 P1)

- [x] **FI-01 · P1 · BUG** ✔ driven — “Deposits held” on Daily Closing (signed into daily_closings.deposits_held and the WhatsApp digest) sums only the first 100 newest active clients — listClients() caps at 100 and excludes deactivated clients still holding a deposit. Law 5 liability understated, then frozen by 0078.  
  `src/lib/queries/closing.ts:97,149 · src/lib/queries/clients.ts:359`
  ↳ FIXED 3 Sep 2026 — sumDepositsHeld() pages client_directory_v for every client (active and deactivated) with a count check.
- [x] **FI-02 · P1 · BUG** — collected.* and receivablesTotal sum unpaged lists with no total === rows.length proof, so a >1000-row day is silently short — the exact trap Finance.tsx's sumOf guards against — and the short figure is then signed.  
  `src/lib/queries/closing.ts:95-96,106,148`
  ↳ FIXED 3 Sep 2026 — readEvery() pages payments/invoices to completion and throws a stated error if the count disagrees; the screen shows the error instead of signing. Tests 492/492.
- [x] **FI-03 · P1 · BUG** — paymentsInPeriod filters status Received only, so a payment_type 'Refund' row (amount > 0 by CHECK) is added to the Received KPI, the method donut, the collections chart and the closing totals. Latent until a refund writer exists, but the named set is wrong money.  
  `src/lib/queries/finance.ts:879-885 · Finance.tsx receivedTotal/methodSlices`
  ↳ FIXED 3 Sep 2026 — paymentsInPeriod pins payment_type = 'Advance Payment', so a Refund row is never added to takings.
- [x] **FI-04 · P2 · BUG** — CSV export writes formatMoney(i.totalAmount) (“Rs 1,39,506”) unquoted into a comma-joined row — every money cell splits the columns.  
  `src/modules/finance/Finance.tsx:1013-1020`
  ↳ FIXED 4 Sep 2026 — the export is a pure exported invoicesCsv(rows) with every field through lib/csv.ts's csvCell, rows joined with CRLF. csvCell's quoting test was widened to include a bare CR in review — it did not quote one, which CRLF joining had just made reachable. Round-trip test through parseCsv.
- [ ] **FI-05 · P2 · BUG** — Finance feeds the payment modal the current chip's rows (Draft, Paid, Void included) and pre-selects the first; the action refuses only voided, so a payment can be posted against a Draft invoice and the trigger flips it to Partially Paid without it ever being Sent. Payments.tsx feeds the same modal outstandingInvoices().  
  `src/modules/finance/Finance.tsx:824-833 · RecordPaymentModal.tsx:60 · src/actions/finance/recordPayment.ts:231`
- [x] **FI-06 · P2 · BUG** — bookingsCreatedOn bounds created_at at UTC midnight (05:45→05:45 NPT) while the header says movement counts use the operational day — the New-bookings count sits on a third, unstated day.  
  `src/lib/queries/closing.ts:79,163-174`
  ↳ FIXED 4 Sep 2026 — bookingsCreatedOn bounds created_at with the operational day via a new exported operationalDayRange(dayAd). ⚠ The justification comment first written here invented a failure it cannot produce: old and new bounds differ ONLY in the 15-minute band 05:45–06:00 NPT, so a booking at 05:30 or 23:30 lands on the same day either way. Rewritten honestly — the defect is the unstated third boundary on a signed screen, not a figure hours out.
- [ ] **FI-07 · P2 · TODO** ✔ driven — No reader for daily_closings, so after reload the Approve button returns and the DB refuses (“already closed”); no void path, no past-day picker (getBusinessToday only), no Refresh; variance_reason is accepted by the action and stored by 0078 but the screen has no field, so every variance is signed unexplained. §4.40 open.  
  `src/modules/finance/DailyClosing.tsx:61-62,152-177,353-362 · src/actions/finance/approveDailyClosing.ts:52`
- [ ] **FI-08 · P2 · TODO** — payment_date is always now() (no date field — a receipt entered next morning lands in the wrong day's Collections, Closing and VAT period); every receipt is typed 'Advance Payment' including settlements; no bound on amount vs Outstanding (§4.17).  
  `src/actions/finance/recordPayment.ts:352-358 · RecordPaymentModal.tsx`
- [ ] **FI-09 · P2 · TODO** ✔ driven — Refund dispatches { id: invoiceId } only (amount, method, reason dropped) to a placeholder action; no voidInvoice or createInvoice action exists, so Void and Issue Invoice always refuse (93 Reverse buttons on Payments are Unavailable). dueDate is a free-text dd Mmm yyyy box.  
  `src/modules/finance/modals/RefundPaymentModal.tsx:157 · src/actions/payments/refundPayment.ts:4-6 · VoidInvoiceModal.tsx:424-436 · CreateInvoiceModal.tsx:334-339,446-449`
- [ ] **FI-10 · P2 · TODO** — (Refunded) chip filters a payment_type nothing writes — always empty; Reverse on a payment against a fully Paid invoice always refuses (cap read from the outstanding list only); canIssueInvoice = canVoidInvoice so a Coordinator can record a payment but not raise the invoice it settles.  
  `src/modules/finance/Payments.tsx:172-176,~560 · Finance.tsx:601-618`
- [ ] **FI-11 · P2 · TODO** — security_deposits / deposit_movements have no query (Held/Applied/Refunded render “—”); Attach receipt Unavailable (no bucket); expense Approve goes straight through supabase.update() with no action, no client_uuid, no audit, and the enterer can approve their own row; Paid/Cancelled unreachable; VAT column always “—”.  
  `src/modules/finance/Payments.tsx DEPOSITS rail · Expenses.tsx:92-108,~830,~915 · src/lib/queries/finance.ts:1400-1437`
- [ ] **FI-12 · P2 · TODO** — KPI totals, method buckets and the daily series are aggregated on-page from unpaged rows (honestly empty past 1000); the invoice table is unpaged; the P&L card renders five “Not tracked yet” rows.  
  `src/modules/finance/Finance.tsx:378-381,~640, rail`
- [ ] **FI-13 · P3 · BUG** — variance = counted − cash is arithmetic on the page (Law 1, re-checked downstream); approvedAt falls back to the client clock for a server-stamped column (dead fallback); console.log in an action body.  
  `src/modules/finance/DailyClosing.tsx:164 · src/actions/finance/approveDailyClosing.ts:178 · src/actions/payments/refundPayment.ts:17`
- [ ] **FI-14 · P3 · BUG** — Money/reason inputs have sibling <label>s with no htmlFor/id and no inputMode="decimal"; 36px fields under the 44px floor.  
  `src/modules/finance/modals/RecordPaymentModal.tsx:412-467 · RefundPaymentModal.tsx:249-273 · CreateInvoiceModal.tsx:394-460 · VoidInvoiceModal.tsx:472-489`
- [ ] **FI-15 · P3 · TODO** — formatPaymentAt is a second Kathmandu-day resolver beside kathmanduCivil; a duplicated day-bounds TODO in finance.ts.  
  `src/modules/finance/Payments.tsx:~215-235 · src/lib/queries/finance.ts:1469`

- [x] **FI-16 · P1 · BUG** ✔ driven — **Every figure on Daily Closing was answered for the PREVIOUS operational day.** The screen built its day as `getBusinessToday().toISOString()` — a DAY MARKER dressed as an INSTANT: `getBusinessToday()` returns UTC midnight of the Kathmandu civil day, so the string is `…T00:00:00.000Z` = 05:45 NPT, which `queries/bookings.ts`'s `nepalDay` correctly resolves to the day BEFORE (the day starts at 06:00). All four sets — `todaysOutgoing`, `todaysIncoming`, `bookingsCreatedOn`, `paymentsInPeriod` — took it, under a header pill naming today, on a screen the operator signs. Pre-existing at HEAD on the two movement counts; FI-06 moved the third figure onto the same wrong day, which is how three reviews caught it.  
  `src/modules/finance/DailyClosing.tsx:61-62 · src/lib/queries/bookings.ts nepalDay()`
  ↳ FIXED 4 Sep 2026 — new exported `operationalToday(now = new Date())` names the day ONCE, date-only, against the D4 setting, so `nepalDay` passes it through instead of re-resolving it. `getBusinessToday()` is kept for the date pill: a pill is a label, and a label is civil. Pinning tests in bookings.test.ts (5) including the regression itself. Driven at 23:56 NPT on 4 Sep: the old call site resolved to 2026-09-03 and the new one to 2026-09-04, with the pill reading “4 Sept 2026”.

## 9 · Around the lifecycle

_Dashboard, Calendar, Documents, Crew, Sub-rental_ — 8 items (2 P1)

- [x] **AR-01 · P1 · BUG** ✔ driven — Calendar past 16 Aug: bsMonthDays yields [] (empty Month and MiniMonth grids, footer “0 days the Date Engine can name”), the range pill and Month header read “—” as the bold date, and requestedDay rejects every AD after 16 Aug so Dashboard's /calendar?d=2026-09-02 lands with no selected day. bs.ts:179-186 says a month grid is never empty (adMonthDays) and never an em dash.  
  `src/modules/calendar/Calendar.tsx:158-167,222-240,643,853,1009,1234`
  ↳ FIXED 3 Sep 2026 — Calendar falls back to the AD month past the BS table; driven: September 2026, 30 day cells, 0 em dashes.
- [x] **AR-02 · P1 · BUG** — KPIs and chip counts are string literals (“30”, “Rs 1,20,000”, “33.3%”, All 48 / Overdue 4…) over a 4-row seed; money bypasses formatMoney; counts disagree with the table they head. Rulings §8: a number with no source renders “not tracked yet”.  
  `src/modules/operations/SubRental.tsx:542-597`
  ↳ FIXED 3 Sep 2026 — Sub-rental KPIs read "Not tracked yet"; chip counts derive from the rows the table renders.
- [x] **AR-03 · P2 · BUG** — NOW is always 05:45 (kathmanduMinutes of the civil-midnight anchor) though the comment says “the clock position the page is rendered at”; the Timeline windows and rings on 05:45; 'Late today' is unreachable.  
  `src/data/today.ts:756,781-782,1094-1109 · TimelinePanel.tsx:72,127`
  ↳ FIXED 4 Sep 2026 — NOW was kathmanduMinutes(NOW_AD), i.e. always 05:45, under a comment claiming it was the render-time clock. Now clockNowMinutes(now = new Date()), read once per render by TimelinePanel for both the 8-row window and the “now” ring. (The “Late today is unreachable” half of this entry was wrong — see X-06.)
- [ ] **AR-04 · P2 · TODO** — Calendar is 100% seed beside a live Dashboard (Today's Summary says 3 pickups / 5 returns; bar click → /rentals/B-715), the subtitle promises availability the panel says it cannot compute, and seeded festival dates (Dashain 28–30 Jul, Buddha Jayanti 8 Aug, Tihar 11–12 Aug 2026) render as real holidays.  
  `src/modules/calendar/Calendar.tsx:1398,2125,2175,2328 · src/data/calendar.ts:458-460`
- [ ] **AR-05 · P2 · TODO** — Documents KPI values '132', '↑18%', '18', '24', '16' are typed literals rendered as figures; related links point at seed bookings absent from the live corpus; the registry is never queried.  
  `src/data/documents.ts:211,326-335 · Documents.tsx:686,1195,1400`
- [ ] **AR-06 · P3 · BUG** — Row-menu “Invoice” navigates to /documents (seed registry), not this booking's invoice; 404 CTA still says “Return to Today”; CAL_MONTH is hardcoded to July 2026 with TODAY_INDEX −1; the header comment cites a bs.ts TODAY export that no longer exists.  
  `src/modules/today/MovementList.tsx:318 · src/App.tsx:785 · Today.tsx:862 · src/data/today.ts:459-497,740-756`
- [ ] **AR-07 · P3 · TODO** — KPI note points at a removed Timesheets tab; crew and sub-rental seeds store BS strings (Law 7); 24px action icons and 26px pagers under the 44px floor. Book Crew and New Sub-Rental have no write.  
  `src/modules/crew/CrewBooking.tsx:425 · src/data/crew.ts · SubRental.tsx:54-55,86-87 · Documents.tsx:191-213,364 · Membership.tsx:290,716`
- [ ] **AR-08 · P3 · BUG** ✔ driven — a11y to verify: the Sign In submit button exposes no accessible name in the a11y tree (read as “button type=submit”), and Calendar renders one disabled control with an empty label.  
  `src/modules/auth/Login.tsx · src/modules/calendar/Calendar.tsx`

---

## What is still TODO, one paragraph per stage

- **Inquiry / Quote** — No persisted quote or inquiry stage: Save Draft and Cancel are stubs, Confirm goes Quote→Booked in one press, quote expiry is never set. The write carries equipment lines only; discount, crew, transport, deposit, PAN and the advance need a home. Live bundles, window-aware availability and a services catalogue are still seed.
- **Booked** — List search, ten inert filter groups, Export, Save View and Timeline view; Extend, Assign Crew and Sub-rental sit on placeholder actions; seven detail blocks have no query module; the late-fee panel has no caller.
- **Packing** — Evidence is a counter with no file write; Save Draft and Print are stubs; the Not Required path, warehouse location and the serialised-vs-count rule await rulings; the dead shell modal tree and packing seed still ship.
- **Handover** — Receiver verification, signatures and evidence are screen-only state although the tables exist; a writer for unit state and handover session is what makes a second session real; Evidence is the B-715 seed with a stub review action.
- **Return** — Nothing stamps the actual return time, no late fee is ever applied or waived, and no damage finding or case is created from a real return.
- **Cleaning / Reset** — Reset writes only a completion time: no cleaner or QC attribution, no problem routing, no unit state change back to available. Cases, Damage and Maintenance are seed-backed screens whose Log modals fake success. Nothing ever moves a booking to Closed.
- **Close the money** — Money in works end to end. Everything that corrects or closes money does not: no invoice create, void, payment reversal, expense reversal, deposit reads, receipt upload, or a reader for signed closings. Closing figures need a server-side aggregate before they are frozen.
- **Around** — Everything downstream of the BS month-length table (PLAN §4.34) is dead or dashed since 17 Aug. Calendar, Documents, Membership, Crew and Sub-rental read no database at all.
