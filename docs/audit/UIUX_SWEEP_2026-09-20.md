> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY (20-21 Sep 2026)
>
> This document is a point-in-time audit snapshot. Its findings, blockers, test failure counts, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)

---

# UI/UX Sweep — 20 Sep 2026 (Orchestrator artifact store)

Full audit findings, stored by reference. Line numbers pinned to the working tree
as of 2026-09-20 (mid-session; Mason must re-locate by snippet, not line alone).

Laws: 11 (never colour alone — icon+label+colour, via ui/Badge.tsx only) · 12
(errors inline+persistent, toasts success only) · 15 (44×44 touch targets, `--tap`)
· 16 (no AI panel without validated computation) · 17 ("customer" nowhere — clients).

---

## AUDIT A — today / calendar / crew (COMPLETE)

### A-BIG
- **A1** CrewBooking.tsx:212-229 — both reads `.catch(() => {})`; query layer falls back to seed on error/empty (lib/queries/crew.ts:93-103,162,196). No loading/error state; seed shown as live. FIX: error state + label seed fallback.
- **A2** CrewBooking.tsx:627-661 — checkboxes ~13px (Law 15); select-all unnamed. FIX: ≥44px hit area + `aria-label="Select all assignments"` / per-row labels.
- **A3** Calendar.tsx:1779-1781 — SelectedEventPanel close ~20px, title only, no aria-label. FIX: copy DaySheet close (44×44 + aria-label="Close") at 1352-1360.
- **A4** Calendar.tsx:2581-2602 — view tabs height:28 (Law 15); role="tab" with no aria-controls/id. FIX: minHeight 44 + ids.
- **A5** Calendar.tsx:2783-2785 — "Clear All" padding:0 (~16px). FIX: minHeight 44.
- **A6** Calendar.tsx:655-666 — bar buttons 26px compact / 42px normal (Law 15). FIX: ≥44px hit band.
- **A7** Today.tsx + dashboard.css — date-filter popover controls 32-40px (`__quick` 2.5rem, `__month-row` 2.5rem, `__footer` 2rem, `__days` ~42.7px). FIX: raise to var(--tap)/44, day cells min 44.
- **A8** components/ui/SegmentedControl.tsx:44,100 — minHeight md=42/sm=36 AND `outline:'none'` inline kills global :focus-visible ring. FIX: minHeight 44 both; remove outline:'none'.
- **A9** DashboardMovementPanel.tsx:141-160 + ui-v2.css:452-457 — hand-rolled status pills, no icons (only raw ⚠ on one), hardcoded hex. Law 11. FIX: render via Badge/tokens.
- **A10** Calendar.tsx:1592-1594 — MiniMonth busy dot colour-only + aria-hidden; day title lacks busy state. FIX: append busy fact to title/aria-label (MonthGrid:1029 pattern).
- **A11** CrewBooking.tsx:432-457 — 6 KPI cards (money roles) vs ≤4 rule; code cites spec 06 §10 "exactly six" — CONFLICT, Foundation ≤4 wins, log ruling. FIX: cut to 4 tiles (Booked Today/Available/Conflicts/Fill Rate); move Timesheets note to rail.
- **A12** Calendar.tsx:78,424-426,1940,2005-2010 — module-scope TODAY frozen at import; highlight/Today button/`t` go stale after midnight. FIX: resolve per render (dayAd pattern at 2286).

### A-SMALL
- **A13** Calendar.tsx:1959-1970 — listInventory error swallowed → Check availability modal shows no picker, no reason. FIX: error state in modal.
- **A14** CrewBooking.tsx:448 — KPI note "see Timesheets tab" — tab removed. FIX: reword.
- **A15** CrewBooking.tsx:332 — rail badge "invariant failed" jargon. FIX: operator words.
- **A16** CrewBooking.tsx:726-728 vs 863-865 — "View" vs "View booking" drift. FIX: unify "View booking".
- **A17** CrewBooking.tsx:1040-1042 — aria-label on role-less div ignored. FIX: role="img" or text.
- **A18** CrewBooking.tsx:210,309-319 — checkboxes drive no outcome. FIX: hide until bulk flow exists, or surface "N selected".
- **A19** CrewBooking KpiTile (881,884), AlertsPanel (194-205,227-238), TimelinePanel (167-178) — truncation without title. FIX: add title.
- **A20** DashboardMovementPanel.tsx:118-134 — clickable card no role; nested link+button. FIX: role="link" or de-nest.
- **A21** Today.tsx:181-214 — dialog opens without focus move. FIX: autoFocus first control.
- **A22** Calendar.tsx:2880-2894 — saved-view buttons ~32px (latent, SAVED_VIEWS empty). FIX: minHeight 44.
- **A23** MovementList.tsx + TimelinePanel.tsx — orphans (no importers), carry drifted pills. FIX: do not touch without ruling (possible concurrent-session context); note only.

---

## AUDIT B — clients / finance / documents (COMPLETE)

### B-BIG (Law 15 cluster)
- **B1** Finance.tsx:2060,2069-2076 — invoice row actions Pay/Refund/Void/PDF ~22px desktop / 40px phone. FIX: minHeight 44 both.
- **B2** Expenses.tsx:381-382 — row menu trigger 26×26 guarding Approve/Reject. FIX: 44×44 (ClientsDirectory.tsx:2003 pattern).
- **B3** Documents.tsx:206-207,249-250 — ActionIcon 24px, menu trigger 24×26. FIX: 44×44 (row floor exists at :84).
- **B4** Documents.tsx:371-372 + Membership.tsx:294-295 — pagination 26×26 (ClientsDirectory PageBtn fixed). FIX: copy 44px values.
- **B5** Membership.tsx — tabs h34 (:449), chips h32 (:580), rows-per-page h26 (:734), Clear selection (:712), Clear level filter (:660), View members (:237), row icon 26×26 (:942). FIX: 44 everywhere.
- **B6** RecordPaymentModal (:470,515,544,617), RefundPaymentModal (:267,303), CreateInvoiceModal (:110), VerifyKycModal (:85,110,137), UpgradeTierModal (:108), AdjustCreditLimitModal (:111,133) — fields h36/38. FIX: minHeight var(--tap).
- **B7** AddClient.tsx — type cards h38 (:793), profession/segment chips ~29px (:1039,1066), file-remove 24×24 (:1267). FIX: 44.
- **B8** CreateDocumentModal.tsx:96-107 — inputs ~35px, no height floor. FIX: minHeight var(--tap).
- **B9** chips/links cluster — Finance.tsx:1295,1627 (minHeight 28), :1212 (h34); ClientsDirectory.tsx:1349-1361,1525-1536 (padding:0); ImportCenter.tsx:321-341; Documents.tsx:818 (h32),1578 (h34),867,1429 (padding:0). FIX: minHeight 44.

### B-BIG (Law 11 cluster)
- **B10** ClientDetail.tsx:110-161 + call sites 1167,1204,1273,1336,1168,1209 — local Tone chip has no icon default; booking + invoice statuses colour+word. FIX: port directory Tone (STATUS_ICON default).
- **B11** Clients.tsx:483-499,566-581 — tier chips hand-rolled, no icon. FIX: via Tone/Badge + STATUS_ICON.
- **B12** Documents.tsx:153-174 — StatusPill colour+label no icon; --r-badge reserved for count badges; record-state line :1306-1317 same. FIX: Badge with per-status icon.
- **B13** Finance.tsx:2009 — Badge without icon prop (Draft/Sent/Paid/Overdue...); ClientDetail.tsx:1398 — documents Badge all-neutral + no icon. FIX: per-status icons (Expenses.tsx:272-278 pattern).

### B-BIG (other)
- **B14** Finance.tsx:1004-1006 — invoice PDF export failure → console.error only, operator sees nothing. FIX: inline error banner (setNotPersisted idiom :1441).
- **B15** Membership.tsx:345-355 — fetch error swallowed; failure shows "No members match this filter". FIX: loading/error ladder (DuplicateCenter.tsx:405-418 pattern).
- **B16** Documents.tsx:473,482 — both reads `.catch(() => {})`; failure shows "No documents match this view". FIX: same ladder + retry.
- **B17** CreateDocumentModal.tsx:75 — clientUuid minted per submit (Law 8: retry duplicates the write). FIX: mint once per open, re-mint on success (RecordPaymentModal.tsx:154-169 pattern).
- **B18** ClientDetail.tsx:818-819 — banner claims edits "not persisted yet" but onSave dispatches implemented updateClient. FIX: delete banner (or local-draft branch only).

### B-SMALL
- **B19** Payments.tsx:269-291 — status chip hand-rolled, generic dot glyph, wrong radius. FIX: Badge + per-status icons.
- **B20** internal-vocabulary leaks in user copy (strip file names/migration numbers/ruling IDs, keep honesty): ClientDetail.tsx:753,1453-1455,257,960,975; Clients.tsx:445,466; Finance.tsx:1152-1155,1193,1622,1624; ImportCenter.tsx:553; GenerateReferralCode.tsx:199; AdjustCreditLimitModal.tsx:34; Payments.tsx:727,736-737,813-814,827-828; Expenses.tsx:103-105,128-130,143-145,497-499,592-594; DailyClosing.tsx:208,285; VoidInvoiceModal.tsx:71; DuplicateCenter.tsx:432; Documents.tsx:1126; CreateInvoiceModal.tsx:446-447,558-560,570-572.
- **B21** AddClient.tsx:1214-1216 + ImportCenter.tsx:284-286 — dropzone tabIndex but no onKeyDown. FIX: Enter/Space handler.
- **B22** AddClient.tsx:381-398 — isDirty omits website/source/professions/segments/govIdType → Cancel discards silently. FIX: add fields.
- **B23** AddClient.tsx:412 — summary says "Group", field says "Membership Tier". FIX: unify label.
- **B24** GenerateReferralCode.tsx:245 — placeholder re-randomises per render (Math.random inline). FIX: useMemo per referrer.
- **B25** RefundPaymentModal.tsx:298-315 — Reversal Method select collected then dropped, no disclosure. FIX: wrap in Unavailable.
- **B26** Expenses.tsx:581,599,604,610,632 — five required fields unmarked. FIX: red asterisk (RecordPaymentModal pattern).
- **B27** Documents.tsx:676-697 — sort headers no aria-sort, no direction toggle. FIX: port ClientsDirectory SortHeader (BUG-009 fix).
- **B28** Finance.tsx:1688 — invoices ledger headers plain th, not sortable. FIX: sortable Due/Outstanding at minimum.
- **B29** ClientDetail.tsx:1355-1362 — Add Document disabled on blocked client, no reason. FIX: wrap in Unavailable.
- **B30** ClientsDirectory.tsx:1867-1873 — verified mark icon+colour, hover-title only. FIX: Badge "Verified".
- **B31** ClientDetail.tsx:711-713,941-948 — launchers open modals whose Save is permanently disabled; reason only inside. FIX: Unavailable/hint on launcher.
- **B32** Membership.tsx:112-116 — usage bar caption colour+label, bar aria-hidden, no icon. FIX: add alert icon.

---

## AUDIT C — reports / settings / tools / admin / auth (COMPLETE)

### Pulse tile verification
- Null tiles render as honest dashed aria-disabled spans with caption (Pulse.tsx:876-905) — not dead buttons. BUT caption "nothing behind them exists" is false for 4 of 6:
  - Revenue → `/finance?tab=reports` (ReportCatalog index) — frees `/reports/cash-flow` triple-link
  - Rentals → `/rentals`
  - Operations → `/operations`
  - Maintenance → `/inventory?tab=maintenance` (slug valid: data/inventory.ts:300)
  - Cases → `/inventory/cases`
  - Custom → keep null (genuinely unbuilt)
- Four live report screens linked nowhere on Pulse: /reports/promotions, /reports/products, /reports/equipment-performance, /reports/forecasting → add to rail "Other reports".
- Stale comment Pulse.tsx:144-149 says "eight" nulls; actual 6 (7 money-blind).

### C-BIG
- **C1** ForecastingReports.tsx:96-128 — Law 16: fabricated "Forecast Accuracy 92.4% — Based on historical variance"; live summary fetched and discarded (`const [, setSummary]`). FIX: wire summary or gate panel "not tracked yet" (EquipmentPerformance ROI pattern).
- **C2** CashFlowReport.tsx:187,213 + WorkingCapitalReport.tsx:231,284 — hardcoded "vs last month" deltas; ledger has one closed month. FIX: remove deltas (null-branch already renders).
- **C3** Fixture figures with fabricated provenance: InventoryReports.tsx:121-126 ("Based on last audit"), StaffReports.tsx:113-117, EquipmentPerformance.tsx:124 ("Generated by fleet"), PromotionsReports.tsx:90,119 (1520 "from spec"; gained "example number" → KPI), ClientReports.tsx:419 ("Active" literal; KPI cards above seeded-sample footnote). FIX: provenance notes only where true; header-level seeded-sample note; wire discarded summaries.
- **C4** ClientReports.tsx:546-552 + ProductReports.tsx:474-480 — "Data last updated: Today, 10:30 AM" hardcoded + dead refresh icon. FIX: delete.
- **C5** AuditSettings.tsx:301,668-676,729-739,637-644 + BackupRestore.tsx:328,873 — fabricated health claims ("Log Integrity 100%", "Latest Backup: Today", red alert "API logging disabled 2h", "AI Audit Insights: no unusual behavior", footer "Backups are encrypted at rest and in transit" on a service that doesn't exist). FIX: strip to schema-answerable (AuditLog.tsx:77-81 pattern); delete encryption footer.
- **C6** ReportTemplate.tsx:273 — `alert()` for success (Law 12); writes localStorage['babin_saved_report_views'] which nothing reads. FIX: remove Save view (unbuilt) or wire reader + showSuccessToast.
- **C7** ClientReports.tsx:422-431 — eye "button" is role="button" span, no tabIndex/keyboard; more_vert icon fully inert. ProductReports.tsx:343-348 — whole Actions column inert icons. FIX: real Link + remove dead glyphs.
- **C8** ExpenseReports.tsx:392-424 — four KPI cards link to the page they're on with distinct labels. FIX: drop links.
- **C9** Pulse null tiles + caption + missing rail links — see verification above. FIX: set 4 destinations, keep Custom null, fix caption text, add 4 rail links.
- **C10** ActivityLog.tsx:56-68,138-153 — fetch swallowed; failure shows "No activity matches this filter". FIX: useList/PageBody ladder (AuditLog.tsx:213-233 pattern).

### C-SMALL
- **C11** link-styled aria-disabled spans with hover-title-only reason — ClientReports.tsx:529, ProductReports.tsx:468, AuditSettings.tsx:398,432,485,538,633,663,723, BackupRestore.tsx:334,536,681,709,766,833. FIX: Unavailable or dashed/muted treatment.
- **C12** spec/code citation leaks — Pulse.tsx:900,1143,1240,1267,1276; ReportCatalog.tsx:316-321,342,357; settings/Tools.tsx:611,663,746,1089,1433,1562; Financial.tsx:67,79; Organisation.tsx:84; BranchesWarehouses.tsx:542,1030; Login.tsx:254; ForgotPassword.tsx:94; StaffDirectory.tsx:471. FIX: strip citation format, keep honesty.
- **C13** settings/sections/System.tsx:81-84,171,173 — toggles (incl. 2FA, screen lock) flip locally, persist nothing; disclosure only in rail note (Settings.tsx:394-397). FIX: render via GatedToggle/Unavailable.
- **C14** HandoverSheet.tsx:39-40 — reason now false ("no staff list... nothing reads users table"); staff_directory_v live since 0067. FIX: reword or offer roster.
- **C15** System.tsx:172 password policy row shown but enforced/read nowhere; ResetPassword.tsx:87-94 shows no rules. FIX: mark NotTrackedYet or show as helper text.
- **C16** dead-fetch pattern (fetch + discard): Pulse.tsx:374, ForecastingReports.tsx:43, InventoryReports.tsx:54, StaffReports.tsx:50, ClientReports.tsx:201, ProductReports.tsx:215, EquipmentPerformance.tsx:55, PromotionsReports.tsx:62, CashFlowReport.tsx:136, WorkingCapitalReport.tsx:176; ToolsLanding.tsx:91-93; settings/Tools.tsx:1125-1127; AuditSettings.tsx:263-265. FIX: render from summary or delete fetch.
- **C17** Law 15 — settings/Tools.tsx:1273 (h30), :1303-1324 (30×30 toggles); BranchesWarehouses.tsx:1247-1254 (modal close). FIX: minHeight var(--tap).
- **C18** fill hues as bare text — StaffReports.tsx:174; PromotionsReports.tsx:160,164,168,195,223; ForecastingReports.tsx:153,181,206. FIX: -text token pairs.
- **C19** ExpenseReports.tsx:857-872 — status chip label+colour, no icon. FIX: per-status icons.
- **C20** PromotionsReports.tsx:90 — totalIssued duplicated literal (donut sums same). FIX: derive from COUPON_DONUT.
- **C21** ToolsLanding.tsx:95-98,261-262 — money tab via URL for money-blind role renders blank body. FIX: RestrictedState.
- **C22** BranchesWarehouses.tsx:1226-1316 — hand-rolled dialog, no focus trap/Escape/restore. FIX: shared Modal.
- **C23** Login.tsx:204 — mock quick sign-in uses raw emojis 👑📦💰 outside Icon registry. FIX: registry icons.
- **C24** Pulse.tsx:144-149 — stale "eight" in comment. FIX: correct when touching block.

---

## AUDIT D — rentals (COMPLETE)

Answers: RentalsList HAS pagination (PageBtn 26×26 short on width; rows-per-page select 28px; Timeline view has NO pager/states). BookingDetail has NO Back button (compliant) — but `chevron_left` on first crumb reads as back. BookingDetail has up to 5 primary buttons visible at once.

### D-BIG
- **D1** BookingDetail.tsx:2015-2095,1805,1923,2217,2952,900 + LifecycleProgress.tsx:240 — up to 5 primary-styled buttons visible at once (header verb, banner CTA, rail Receive Payment ×2 (duplicated in Booking Summary AND Quick Actions), Block 4 Record Payment, Notes Add Note). FIX: one primary per page (header verb); demote the rest to secondary; render Receive/Record Payment in one place only.
- **D2** LifecycleProgress.tsx:231 + ui-v2.css:442-457 — Next-Action banner hand-rolled `.status-pill` with literal hexes (#2456d6, #d96518, #1e864a), no icon. FIX: Badge from lib/status.
- **D3** RentalsList.tsx:254,1669,1524-1536,1582-1591 — stage/quick-filter chips height:32, rows carry no vertical padding (comment claiming row padding satisfies Law 15 is false). FIX: minHeight var(--tap).
- **D4** RentalsList.tsx:2413 — rows-per-page select height:28. FIX: 44. (dateInput on same page already does it.)
- **D5** RentalsList.tsx:2582-2595 — PageBtn 26×26 + TouchTarget axis="y" only → 26 wide. FIX: widen to 44 or chevrons + "Page N of M" label.
- **D6** RentalsList.tsx:1808-1811 + 2378-2431 — Timeline view bypasses PageBody (no loading/error/empty; "0 bookings on this page" while loading) and pager unreachable in timeline mode. FIX: wrap timeline in same PageBody; lift pager out of Card branch.
- **D7** rental-timeline.css:28 — `.rental-timeline__bar` 32px, bars are Links. FIX: min-block-size 44px.
- **D8** BookingDetail.tsx:2576-2577 — unit-release × 20×20 no TouchTarget. FIX: add TouchTarget.
- **D9** RentalsList.tsx:2014 — card-view Open Booking/Edit Draft link height:40. FIX: 44.
- **D10** RentalsList.tsx:1921-1922 — card-view checkbox bare 18×18 (table rows wrap in 44 label at :2119). FIX: same label wrap.
- **D11** RentalsList.tsx:2071 vs 2119 — header select-all label 32×36. FIX: 44×44.
- **D12** RentalsList.tsx:1620-1637 — sub-rental retry icon-only ~20px. FIX: TouchTarget or text Retry.
- **D13** BookingDetail.tsx:2964-2971 — Add Document disabled on cancelled booking with no visible reason (cancelledReason const exists above). FIX: wrap in Unavailable.
- **D14** RentalsList.tsx:2249-2271 — overdue date pill hand-rolled vs Badge (has icon so Law 11 substance OK; one-renderer rule breach). FIX: Badge.
- **D15** rental-timeline.css:31-35 — per-status bar colours restated in CSS, colour+label no icon. FIX: icon in bar label; source palette from lib/status tokens.
- **D16** BookingDetail.tsx:1970,2735,2842,2975 — user copy names tables (`booking_stage_transitions`, `booking_transport`, `security_deposits / deposit_movements`, `document_registry`). FIX: "not available yet / not wired yet" phrasing.
- **D17** RentalsList.tsx:1863 — "derived from `booking_lines.line_type`" leak. FIX: "from the booking's line items".

### D-SMALL
- **D18** RentalsList.tsx:1459 — '⚡ Fast Return' emoji + icon dup. FIX: drop emoji.
- **D19** BookingDetail.tsx:2147 — 'Message client' carries dead onClick:()=>undefined, masked by spread. FIX: omit.
- **D20** RentalTimeline.tsx:58 — aria-label on plain div (phone). FIX: role="region".
- **D21** BookingOperationsMenu.tsx:99-166 — role=menu/menuitem without ArrowUp/Down/Home/End. FIX: arrow-key handling.
- **D22** WhatsAppShareButton.tsx:33 — businessPhone hardcoded '9800000000' (BookingDetail's own path reads readSettings()). FIX: read from settings here too.
- **D23** Stale comments (doc rot): RentalsList.tsx:118-123 (STATUS_ICON type wrong), :2619-2629 (RowOperations "no inflated target" stale). FIX: correct/delete.
- **D24** NewRental.jsx header comment says "not a wizard" but ships 5-step Stepper + Back/Continue (doc rot). FIX: rewrite header/FooterNote. (D-BIG equivalent, documentation-only.)
- Clean: BookingCrewList, LateFeePanel, BookingOperationsMenu (except D21). No toast-for-error, no alert(), no customer, no unlabelled icon buttons.

## AUDIT D2 — NewRental + floor workspaces (COMPLETE)

- **D25** ReturnWorkspace.tsx:1763-1765,780-797 — scanner fabricated-success: onItemScanned doesn't return outcome → DEFAULT_MATCH_LABEL + success beep when receive failed/wrote "already received"; scannableUnits doesn't exclude alreadyReturned. FIX: receive returns ScanOutcome; exclude alreadyReturned (Handover:905 does it right).
- **D26** Row-state chips colour+label no icon (PackingWorkspace:1407,1495; HandoverWorkspace:1349,1437; ResetWorkspace:1140,1268; Return condition chips :1261; Evidence match chips :816). FIX: icon per state (Return:1254 pattern) or Badge.
- **D27** ReturnWorkspace.tsx:1822-1823 — ConditionPicker 24/30px (primary per-item control). FIX: TouchTarget wrap.
- **D28** Packing:1850-1862 + Return:1735-1753 — "Cancel … discards this session" copy FALSE (floorScanStorage persists); no confirmation. Handover:1826-1919 is the model. FIX: confirm dialog + clearFloorScan on discard, or fix copy.
- **D29** Handover + Reset persist nothing (no floorScanStorage) — standalone routes refresh loses marks/notes/signatures. FIX: extend floorScanStorage to handover/reset (pack/return pattern).
- **D30** BarcodeScannerModal.tsx:163-174 — 2s same-code cooldown gated on fromCamera; keyboard-wedge path refires instantly. FIX: cooldown regardless of source.
- **D31** Packing:1341-1342 — twin buttons "Scan Barcode" + "Scan QR" → one. FIX: collapse (Return:1167-1186 pattern).
- **D32** Handover:1403-1408 — disabled checkbox reason tooltip-only on desktop (phone shows inline). FIX: inline reason on desktop row.
- **Law15 cluster D33**: Packing "Start Fresh" h28 + no confirm (:1062-1069); Evidence Categories rail h30 (:672-689), gallery filter chips h26 (:732-737), header links h34 (:471-484), hide-note input h28 (:1049); Return "Use client" chip minHeight 28 (:1633-1654); Reset self-QC reason input h26 (:1797) + preset chips ~22 (:1801-1818), batch-QC input h32 (:1567); NewRental blocking-notice actions (~1px padding, :3714-3732), rail Confirm minHeight 40 (:3749), crew Browse h38 (:1375). FIX all: var(--tap)/CompactButton/confirm on destructive.
- **D34** NewRental: fontSize literals + #eff6ff/#1e40af literals (:5212,5220,5314,5553,5567,5587,5630); minHeight numbers vs var(--tap) (:5613,5621,5630); 'Promo Code *' required-mark on optional field (:5228); console.warn/error stubs (:2852,2862,3231). FIX: tokens/labels/captureError.
- **D35** BarcodeScannerModal has mode:'reset' but ResetWorkspace never imports the scanner. TODO(decision) — wire scanner in or drop mode (don't decide; log TODO).
- NewRental R-39 defaults PASS (dates today/tomorrow, times 09:00/18:00, qty 1, client prefill from query, delivery default).
- All workspaces: states/errors inline-verified good otherwise; no alert()/toast-error.

## AUDIT E — inventory (COMPLETE)

### E-BIG
- **E1** modals/CreatePurchaseRequestModal.tsx:24-25,191,235-236 — Law 6 leak: Unit Est. Cost (Rs) + Total Estimated Outlay rendered ungated. FIX: useCanViewMoney gate; omit cost field + outlay + null payload money fields when blind.
- **E2** modals/CreatePurchaseRequestModal.tsx:49-72 — fabricated success: mints PR-2026-<random>, EQ-<random>, priorityScore, 'Warehouse Lead', hardcoded BS date '2083-05-13' (Law 7: BS is rendered, never stored/invented); no action dispatched. FIX: no createPurchaseRequest action exists → wrap submit/Unavailbable; never mint identifiers.
- **E3** modals/LogMaintenanceModal.tsx:74-118 — fabricated success on real refusal: createMaintenanceJob throw → console.warn → still emits MAINTENANCE_STARTED with fabricated MJ-2026-<random>. FIX: set inline error + return; no event/atom on failure.
- **E4** DamageTab.tsx:123-133 — fetch error swallowed; failure shows honest "No damage findings" (indistinguishable from clean). FIX: loading/error state + ErrorBanner retry.
- **E5** AssetDetail.tsx:574-583 — availability dot colour-only 10px. FIX: delete dot (figure beside it carries fact) or pair with word.
- **E6** AssetDetail.tsx:519-532 — recordState chip hand-rolled, no icon. FIX: Badge tone=neutral + icon.
- **E7** Warehouses.tsx:1603,1628,1643 — 3 charts (Donut+HBars+GroupedBars) on one screen + per-card glyphs. FIX: keep Donut, convert other two to tables/figures. (Rule: ≤1 chart per screen.)
- **E8** AddBundle.tsx:422-433 — create form boots pre-filled with fabricated "Sony FX3 Documentary Kit" + overrideRate '18,000'. FIX: start empty; placeholders not values.
- **E9** AddBundle.tsx:1446-1452 — Expand/Collapse all acts on catalogue children that never exist. FIX: remove control or Unavailable.
- **E10** Bundles.tsx:690-697 — menu "Duplicate" only opens blank form (nothing copied). FIX: carry source (?source=<id> → applyDuplicate) or drop the item.
- **E11** PurchaseRequests.tsx:432-441 — clickable tr without keyboard path. FIX: real button opener (PR number link) or tabIndex+Enter.

### E Law 15 cluster
- **E12** Maintenance.tsx:884-905 — flag/condition chips h26 (sibling chips grew to --tap).
- **E13** Inventory.tsx:2087-2134 sort header buttons padding:0; :1863-1890 sort select h32; :1893-1911 density toggle 32²; :2199-2214 rows-per-page h28; :2223-2300 pager 26².
- **E14** Inventory.tsx:598-616 expand chevron 20²; :692-701 quick-view 30²; :862-886 Show units h30.
- **E15** Warehouses.tsx:1528-1588 pager 26²; :1460-1480 row glyphs 28²; :1722-1743 profile tabs h36.
- **E16** DueForService.tsx:123-139 Create job minHeight 32.
- **E17** LogMaintenanceModal + CreatePurchaseRequestModal: all inputs h36 hand-rolled. FIX: swap to ui Input/Select (44 floor).
- **E18** AddBundle.tsx:91 controlBase h34 (name/notes/overrideRate/selects); in-row qty/discount h30 (:1812,1832,1895,2654,2689,2698); discount-kind select h30 :2675; tag chips h24 + remove 17² (:1253-1287); remove-line 28² (:2776-2794).
- **E19** components/EquipmentShared.tsx:186 Chip remove × 12px.
- **E20** ServicePlanCard Row input minHeight 36 (~:267); DamageTab.tsx:250 charge input h32.

### E states/modals/semantics
- **E21** both modals' error divs lack role=alert/icon. FIX: ErrorBanner pattern.
- **E22** AssetDetail.tsx:1007-1055 — label-preview overlay no role=dialog/Escape/focus. FIX: Modal/Prompt pattern.
- **E23** Warehouses.tsx:2261-2402 — Create Transfer modal no Escape/focus trap. FIX: ui/Modal.
- **E24** StockCheck.tsx:265-315 — no same-code cooldown (pressing Scan repeats identical lookup). FIX: same-code guard.
- **E25** EditBundle.tsx:668-682 — Drop pending-row padding:0; :714 new row says literal "Mandatory" where others get select. FIX: 44 + hint text.
- **E26** PurchaseRequests.tsx:464-469 — "Not scored" reason title-only (invisible on touch). FIX: inline.
- **E27** BundleDetail.tsx:387-398 — "Only N owned"/"Short" reasons title-only. FIX: inline.
- **E28** Inventory.tsx:2087-2134 — sort headers: aria-sort on th + symmetric arrows (Bundles.tsx:596-631 model); Category has no Z–A.
- **E29** Warehouses.tsx:1376-1402 — aria-sort missing on th.
- **E30** Copy leaks: AddBundle.tsx:1466,1671,1874,1919,2013,2066 (§ refs + on-screen TODO(decision) :2020-2021); Bundles.tsx:1581-1582 (TODO); Warehouses.tsx:1781-1784,1927-1932 (spec refs, TODO); EditBundle.tsx:581,728-733,372 (Law 3/table names/PLAN.md/§ refs + capability string); Maintenance.tsx:1163 (storage vocabulary). FIX: operator words, keep honesty.
- **E31** PurchaseRequests.tsx:371-389 — tab strip ~31px, not roll=tablist/tab, no aria-selected (Maintenance:809-836 is model). AssetDetail.tsx:631-657 same semantics issue (44px done).
- **E32** PurchaseRequests.tsx:700-715 — Reject/Approve/Mark-as-Ordered no confirm; no undo. FIX: confirm dialog on Reject at minimum.
- **E33** AddBundle.tsx:1949 — Cancel on dirty form, no discard guard (AddEquipment:266 has it). FIX: guard.
- **E34** Warehouses.tsx:1657-1693 — seeded KPI strip implies live telemetry; add "seeded facility set" line (transfers pane :1939-1956 pattern).
- **E35** DamageTab.tsx:357 — Charge input editable for money-visible non-approver who cannot submit. FIX: disabled + reason when !mayApprove.
- **E36** AssetDetail.tsx:473-475 — Book Asset /rentals?action=new without asset context. FIX: pass ?product=<assetCode> if NewRental supports it (check first; if not supported, note and skip — no invented plumbing).
- **E37** Inventory.tsx:1946-1961 + Bundles.tsx:1140-1161 + EditBundle.tsx:670-682 — text buttons padding:0. FIX: minHeight 44.
- **E38** StockCheck.tsx:874-875 — Exit session no confirm + same row as primary. FIX: confirm.
- **Clean:** StockCheck otherwise exemplary; Inventory money clean; AddEquipment clean; EditBundle strong; BundleDetail clean; PurchaseRequests body clean; modals' E17 noted.

## AUDIT F — operations (COMPLETE)

### F-BIG
- **F1** OperationsQueues.tsx:740-742,757 — Cases chip is a preventDefault'd fake Link swapping embedded CasesWorkspace; count badge reads frozen CASES seed while workspace lists live rows (two disagreeing numbers). FIX: plain Link to /inventory/cases, drop embedded branch. (ALSO: Pulse Exceptions KPI links /operations?queue=cases — Mason-C to repoint to /inventory/cases.)
- **F2** CasesWorkspace.tsx:177-187 — fetch swallowed; loading/failure shows fake "No cases found". FIX: loading/error ladder with retry.
- **F3** SubRental.tsx:387-397 — same swallowed fetch → false "No records found". FIX: same ladder.
- **F4** SubRental.tsx:592-610 — filter chips ~29-30px. FIX: var(--tap).
- **F5** operations.css:13,24 — `!important` min-height:38px overrides shared Button's 44 floor. FIX: delete the overrides.
- **F6** operations.css:37 — pagination select 36px. FIX: var(--tap).
- **F7** OperationsQueues.tsx:761 — row overflow chevron ~18px link. FIX: 44 hit area.
- **F8** row checkboxes 18px/native (operations.css:33; CasesWorkspace:536-541,560-565; SubRental:663-669,687-693). FIX: 44px label wrap (ResetStep.tsx:53-71 pattern) + aria-labels on select-all/rows.
- **F9** OperationsQueues.tsx:750 — "Staff filter" select with one option, no onChange. FIX: remove or Unavailable.
- **F10** OperationsQueues.tsx:436,626-641,761,763 — row checkboxes feed only a "· N selected" count, no action. FIX: surface honest note (like Crew solution) or remove selection column.
- **F11** SubRental.tsx:421,477-487,625 — Export ignores selectedRowIds (CasesWorkspace:493-496 honours it). FIX: export selected rows when selection non-empty, or drop checkboxes.
- **F12** OperationsShell.tsx:324-326 — locked-stage reason on disabled button's title only (never fires). FIX: visible inline sub-label with reason.
- **F13** SubRental.tsx:757-761,297-301,744,350-351 — OVERDUE pills literal rgba, no icon; margin chips literal rgba. FIX: Badge tone=danger + tokens.
- **F14** spec leaks: shell/steps/ResetStep.tsx:104, HandoverStep.tsx:163, PackingStep.tsx:211, BookingNotLoaded.tsx:71-74. FIX: strip §/spec/file refs.
- **F15** DEAD subtree: shell/OperationsShell.tsx + shell/steps/* + shell/EvidencePanel.tsx — zero external importers; mock writes hardcode actors. FIX: DO NOT TOUCH (needs ruling — two same-named OperationsShell exports). Logged as decision for Babin.
- **F16** BookingNotLoaded.tsx — zero importers, dead. FIX: DO NOT TOUCH without ruling.
- **F17** LogCaseModal.tsx:65,77,94,98-99 — fabricates CASE-<random> id, 'Walk-in Client', 'B-715', ownerRole 'Warehouse'; emits event on no write. Currently unreachable (opener Unavailable) — FIX: keep opener Unavailable; don't wire.
- **F18** LogCaseModal inputs 36px + labels unassociated (no htmlFor); ResolveCaseModal.tsx:211-249 same (this one IS reachable). FIX: 44 + htmlFor/id pairs.
- **F19** SubRental.tsx:534 — KPI strip no phone collapse (4 crushed tiles). FIX: phone → 2 cols.

### F-SMALL
- **F20** OperationsQueues.tsx:364 — queue chip error in title only. FIX: inline note.
- **F21** CasesWorkspace.tsx:536-541 etc. — checkbox aria-labels missing. FIX: add (queue table :761 pattern).
- **F22** CasesWorkspace.tsx:543 — th cursor:pointer no onClick. FIX: drop cursor or wire.
- **F23** OperationsShell.tsx:277 — footer primary disabled without reason when workspace blocks completion. FIX: inline reason beside footer button.
- **F24** CasesWorkspace.tsx:518-530 — phone stays sideways table (queues use cards). NOTE/inconsistency, acceptable; skip unless trivial.
- **F25** CasesWorkspace.tsx:353 — "field list" vocabulary. FIX: "the per-case workspace isn't built yet".
- SegmentedControl 42px default (F21 in E-doc): FIXED by Mason-A (44px both sizes).
- Clean: OperationsWorkspaceContext, StickyFloorBar, FloorAside.

## Pending decisions surfaced to Babin (not fixed, not invented)
1. F15/F16: dead `shell/` subtree + BookingNotLoaded — delete or wire? (Law 3 → move to src/archive.)
2. D35: BarcodeScannerModal mode:'reset' unused — wire scanner into Reset, or drop mode.
3. E10 moment: Bundles "Duplicate" menu item — carry source vs drop.
