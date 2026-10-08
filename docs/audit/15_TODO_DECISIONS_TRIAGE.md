# Item 13: TODO(decision) Triage & Resolution Register

**Total Markers Audited:** 232  
**Source Files:** `src/actions/`, `src/lib/`, `src/modules/`, `src/data/`, `src/components/`  
**Status:** Complete Audit & Architectural Categorization (Task 53)  

## 1. Executive Summary & Distribution

| Domain Area | Count | Architectural Impact | Current Safe Default |
|---|---|---|---|
| System, Reports & Tooling | 96 | Low | Preserve read-only queries & static safety |
| Rentals & Floor Operations | 82 | High | Fail-closed online RPCs; service exemptions via 0149 |
| Inventory & Assets | 22 | Medium | Preserve existing check constraints; Law 3 soft deactivations |
| Clients & CRM | 17 | Medium | Scoped to M+ roles; audit logging on status adjustments |
| Finance, Payments & Invoices | 8 | High | Law 4 immutable movements; Law 5 deposit liabilities |
| Operations UI & Components | 7 | Low | Design tokens fallback; touch floor 44px |

---

## 2. Detailed Findings by Domain

### System, Reports & Tooling (96 markers)

- **`src/actions/core.ts`** (1 markers):
  - L134: `* dispatcher treats as a denial -- see the TODO(decision) in the header.`
- **`src/archive/system/SystemMonitor.tsx`** (1 markers):
  - L44: `* `TODO(decision)` — wiring any of this needs a monitoring stack that has not`
- **`src/data/addBundle.ts`** (1 markers):
  - L111: `* TODO(decision) — PLAN.md §4: where do per-model weights come from? Bundles,`
- **`src/data/businessHours.ts`** (2 markers):
  - L294: `* ruled on — TODO(decision) — so the wording is *Overlapping cover*, never`
  - L371: `* `TODO(decision)` naming what a real source would be.`
- **`src/data/calendar.ts`** (2 markers):
  - L171: `* TODO(decision): `Crew Duty` is drawn in both renders (Sunil's "Warehouse Duty`
  - L678: `* `TODO(decision)` — a real source. The three shapes it could take, none of`
- **`src/data/clients.ts`** (1 markers):
  - L1427: `* (TODO(decision), PLAN.md §4), not a threshold invented here.`
- **`src/data/communicationSettings.ts`** (1 markers):
  - L75: `* Business borrows `headset`, the two-way-conversation icon. TODO(decision):`
- **`src/data/crew.ts`** (2 markers):
  - L374: `* TODO(decision) — WIREFRAME_RULINGS_2026-08-12.md §9.11, left open on`
  - L653: `* TODO(decision) — PLAN.md §4.12 / rulings §8: the TDS rate and the`
- **`src/data/documents.ts`** (2 markers):
  - L149: `* TODO(decision): this is free text today, so nothing stops it drifting from`
  - L196: `* TODO(decision) — document numbers still borrow the booking's counter.`
- **`src/data/equipmentIntel.ts`** (4 markers):
  - L8: `* stay unseeded per the TODO(decision) already on `ParentRow` (PLAN.md §4),`
  - L134: `{ label: 'Time utilization', value: row.utilizationPct !== undefined ? `${row.utilizationPct}%` : 'Not availab`
  - L146: `{ label: 'Revenue earned', value: 'Not available — needs the utilization/revenue engine (TODO(decision), PLAN.`
  - L147: `{ label: 'ROI / recovery %', value: row.recoveryPct !== undefined ? `${row.recoveryPct}%` : 'Not available (TO`
- **`src/data/handover.ts`** (1 markers):
  - L329: `* ⭐ TODO(decision) — `Handover Workflow.md` §17 leaves mandatory evidence`
- **`src/data/inventory.ts`** (5 markers):
  - L375: `* TODO(decision) — the spec's six chips silently retire six live statuses:`
  - L446: `* matching note on `ParentRow`; the same TODO(decision) governs them.`
  - L507: `* TODO(decision) — PLAN.md §4: `Asset Detail.md` has no matching render in`
  - L547: `* unseeded rather than invented. TODO(decision) — PLAN.md §4.9.`
  - *(and 1 more markers in file)*
- **`src/data/invoiceIntel.ts`** (1 markers):
  - L151: `against yet (TODO(decision), PLAN.md §4). The group is omitted`
- **`src/data/maintenance.ts`** (1 markers):
  - L37: `* TODO(decision): §1.9 scopes `Overdue` to a *booking* — its effect reads`
- **`src/data/numbering.ts`** (2 markers):
  - L54: `* ── TODO(decision) — counters are still ahead of the modules they number ───`
  - L532: `* TODO(decision) — Butwal and Bharatpur have no code anywhere in the app or the`
- **`src/data/operations.ts`** (1 markers):
  - L31: `*   TODO(decision): what "late" means for the Pack, Handover and Reset queues.`
- **`src/data/pulse.ts`** (6 markers):
  - L152: `* against, which is a data-import gap, not a units question — TODO(decision):`
  - L353: `* TODO(decision) — the numbers themselves (0101, 0118, 0125) resolve to no`
  - L596: `why: `A quarter of the Shrawan–Ashadh fiscal year needs BS month lengths. ${OUT_OF_TABLE} TODO(decision): are `
  - L602: `why: `A quarter of the Shrawan–Ashadh fiscal year needs BS month lengths. ${OUT_OF_TABLE} TODO(decision): are `
  - *(and 2 more markers in file)*
- **`src/data/purchaseRequests.ts`** (1 markers):
  - L202: `* this pass exists to remove. TODO(decision): what avoided cost means and where`
- **`src/data/rentals.ts`** (1 markers):
  - L1253: `0002:37 carries a TODO(decision) recording that whether a quote lapses`
- **`src/data/settings.ts`** (8 markers):
  - L222: `* TODO(decision): they are omitted rather than invented.`
  - L239: `* TODO(decision): the real proprietor is not recorded anywhere in the schema —`
  - L395: `* TODO(decision) — Rulings §9.12: is `wh-04` "Bhaktapur Heavy Grip & Rigging"`
  - L403: `* TODO(decision) — this map lives in `data/settings.ts` because`
  - *(and 4 more markers in file)*
- **`src/data/today.ts`** (6 markers):
  - L119: `* SETTLED — this was a `TODO(decision)`: the five fills below were raw hexes`
  - L217: `* TODO(decision) — PLAN.md §4: confirm 6, or tell me which movements the 12 counts.`
  - L240: `* TODO(decision) — PLAN.md §4 · 12 Aug 2026. **The paragraph above is one of`
  - L342: `* TODO(decision) — PLAN.md §4: what derives "Cash due"?`
  - *(and 2 more markers in file)*
- **`src/data/tools.ts`** (2 markers):
  - L359: `'TODO(decision) — §10.2 says "Defaults come from Settings", but no Settings section carries depreciation defau`
  - L371: `'TODO(decision) — the IRD pool method needs its pool classes and their statutory rates. Nothing in this build `
- **`src/data/warehouse.ts`** (1 markers):
  - L507: `* absent rather than guessed. TODO(decision): whether Warehouse Management reads`
- **`src/lib/__tests__/rentalDays.test.ts`** (1 markers):
  - L7: `* TODO(decision) recorded in the module header, and if somebody later`
- **`src/lib/auth.tsx`** (1 markers):
  - L222: `* RESOLVED 12 Aug 2026 — this was a `TODO(decision)` asking whether a staff`
- **`src/lib/availability.ts`** (2 markers):
  - L27: `* default** on every entry point. Both were `TODO(decision)` when this file was`
  - L498: `* `TODO(decision)`: an open queue entry is a fact about TODAY, and §4.30(c)`
- **`src/lib/bs.ts`** (1 markers):
  - L91: `* not a product decision. `TODO(decision)`: who reloads it, and how often.`
- **`src/lib/devicePurge.ts`** (1 markers):
  - L44: `* > ⚠ TODO(decision) — queued mutations are not scoped to the user who made`
- **`src/lib/mock/client.ts`** (1 markers):
  - L621: `pass has to meet the same refusal production would. TODO(decision): PLAN`
- **`src/lib/money.ts`** (4 markers):
  - L315: `* ⚠ TODO(decision) — that second-and-later-days formula is the *natural`
  - L332: `* ⚠ TODO(decision) / known gap — this function cannot be driven end-to-end`
  - L356: `* `bookings.actual_return_at` — set once, at whichever session completes the booking's Return job. Nothing wri`
  - L358: `* One day's rental rate for whatever scope is eventually ruled on (see the TODO(decision) above) — pre-aggrega`
- **`src/lib/moneyVisibility.ts`** (1 markers):
  - L9: `* the RBAC engine only knew six. Its own TODO(decision) asked for that to be`
- **`src/lib/operationalDay.ts`** (1 markers):
  - L12: `* This closes the `TODO(decision)` that lived in `queries/bookings.ts`'s`
- **`src/lib/queries/calendar.ts`** (2 markers):
  - L78: `*   `TODO(decision)`: should a finished booking stay visible on the calendar —`
  - L86: `*   `TODO(decision)`: whether quotes appear on the calendar at all, and if so`
- **`src/lib/queries/clients.ts`** (3 markers):
  - L195: `* Neither is a value to build on. Both are `TODO(decision)`.`
  - L234: `⚠ TODO(decision): "credit used" has no column and no agreed formula.`
  - L307: `* **TODO(decision) — `MembershipTier` needs a 'None' member.** It is a product`
- **`src/lib/queries/finance.ts`** (2 markers):
  - L595: `* ⚠ TODO(decision): an invoice due TODAY is treated as not yet overdue — the`
  - L1494: `* here. TODO(decision).`
- **`src/lib/queries/inventory.ts`** (2 markers):
  - L354: `* TODO(decision): which of `status`/`is_active` governs catalogue visibility.`
  - L1051: `* TODO(decision): `products.is_active` is a second liveness flag with no stated`
- **`src/lib/queries/invoicePreview.ts`** (1 markers):
  - L106: `* TODO(decision) — `PLAN.md` §4: which of the two is the ruled arithmetic for a`
- **`src/lib/queries/staff.ts`** (1 markers):
  - L79: `* Logged as `TODO(decision)` in `docs/OPEN_DECISIONS.md` §7.`
- **`src/lib/rbac.ts`** (1 markers):
  - L548: `* TODO(decision): whether the typed approver field should be replaced by the`
- **`src/lib/rentalDays.ts`** (1 markers):
  - L51: `* ## TODO(decision) — PLAN.md §4: is the priced span elapsed-hours or calendar days?`
- **`src/lib/seed.ts`** (2 markers):
  - L693: `* TODO(decision): PLAN.md §4 — should the anchor track the clock at GENERATION`
  - L1511: `-- ⬅ TODO(decision) §4.42(a), still open and NOT answered by the above: may gear`
- **`src/lib/validation.ts`** (1 markers):
  - L32: `* ⬅ **TODO(decision) — the two implementations do not agree, and the screen is`
- **`src/modules/calendar/Calendar.tsx`** (1 markers):
  - L463: `* infer — see `ARCHIVED_RENDER_HOLIDAYS` for the `TODO(decision)` naming what a`
- **`src/modules/crew/CrewBooking.tsx`** (1 markers):
  - L124: `* TODO(decision): where the crew-booking flow lives — a `/crew/new` workspace,`
- **`src/modules/documents/Documents.tsx`** (1 markers):
  - L178: `* TODO(decision): the create flow itself — which document types an operator may`
- **`src/modules/reports/ForecastingReports.tsx`** (1 markers):
  - L62: `* TODO(decision): whether Forecasting has a money-free half worth showing.`
- **`src/modules/reports/__tests__/catalog.test.ts`** (1 markers):
  - L38: `* numbers and the *presence* of the three TODO(decision) flags; it now asserts`
- **`src/modules/reports/catalog.ts`** (2 markers):
  - L302: `'Lifecycle needs asset lives and a salvage convention, and `data/addEquipment.ts:207` records that none may be`
  - L365: `'Sales means invoiced, and the ledger’s revenue is recognised across rental days (`PERIOD_BASIS` — itself a TO`
- **`src/modules/settings/Tools.tsx`** (3 markers):
  - L673: `seeded bitrate table would be a figure nobody supplied. <strong style={{ color: 'var(--text)' }}>TODO(decision`
  - L720: `<strong style={{ color: 'var(--text)' }}>TODO(decision)</strong> — measured per body, or manufacturer spec?`
  - L794: `<strong style={{ color: 'var(--text)' }}>TODO(decision)</strong> — what should a quotation handoff carry?`
- **`src/modules/settings/sections/BranchesWarehouses.tsx`** (2 markers):
  - L72: `* asserts it **per branch**; the two TODO(decision)s it raises are rendered at`
  - L961: `<OpenDecision text="TODO(decision) — Rulings §9.12: is “Bhaktapur Heavy Grip & Rigging” a fourth BRANCH or a f`
- **`src/modules/tools/__tests__/calculators.test.tsx`** (1 markers):
  - L206: `expect(reasons.some((r) => r.includes('TODO(decision)'))).toBe(true)`
- **`src/types/database.ts`** (1 markers):
  - L28: `* TODO(decision) — this **contradicts** `ItemState` in `src/lib/workflow.ts:120`,`

### Rentals & Floor Operations (82 markers)

- **`src/actions/rentals/__tests__/confirmRental.test.ts`** (2 markers):
  - L35: `*     `ActionNotImplementedError`. That difference is the whole TODO(decision):`
  - L254: `* Drives the action body directly — see the TODO(decision) on `confirmRentalConfig`.`
- **`src/actions/rentals/__tests__/floorVerbs.test.ts`** (1 markers):
  - L1514: `TODO(decision) in the engine: no case is raised because nothing creates one.`
- **`src/actions/rentals/createRental.ts`** (1 markers):
  - L164: `* enum does not carry is refused by name in `validate`. TODO(decision): the`
- **`src/actions/rentals/floorVerb.ts`** (16 markers):
  - L187: `*   `TRIGGER REQUIRED` and has never had. `TODO(decision)` — until those exist,`
  - L203: `*   stage simply stays at Packed. `TODO(decision)`.`
  - L321: `* than the "no scale is ruled" placeholder. `TODO(decision)`: those two lists`
  - L464: `* the database, so it is keyed on the database. `TODO(decision)`:`
  - *(and 12 more markers in file)*
- **`src/data/booking.ts`** (1 markers):
  - L87: `* 10:15 AM NPT — 4h 15m past. Nothing writes `actual_return_at` yet; see `money.ts`'s TODO(decision).`
- **`src/lib/bookingQuery.ts`** (13 markers):
  - L352: `* `lineNetTotal`'s TODO(decision) 2 before changing that. The previous version`
  - L627: `* would come from is recorded in the TODO(decision) below.`
  - L687: `* TODO(decision) — three handover gates have no source in this schema, so they`
  - L795: `* TODO(decision) — the real fix is upstream and is a migration, deliberately`
  - *(and 9 more markers in file)*
- **`src/lib/bookingRules.ts`** (1 markers):
  - L17: `* TODO(decision) — PLAN.md §4: should this toggle be global, or restricted to`
- **`src/lib/queries/bookings.ts`** (6 markers):
  - L95: `* 0002:37 carries a `TODO(decision)` recording that whether a quote lapses at`
  - L231: `* TODO(decision): a Bundle line and its children are separate rows (0002:130,`
  - L787: `*    `TODO(decision)` recording that whether a quote lapses, and whether`
  - L863: `TODO(decision): 'Returned' is now THREE retired stages in a trench coat.`
  - *(and 2 more markers in file)*
- **`src/modules/rentals/BookingDetail.tsx`** (4 markers):
  - L938: `* comes from `lib/rentalDays.ts`, which also carries the TODO(decision) about`
  - L1319: `* TODO(decision) — PLAN.md §4: should a staff id be resolvable to a name for`
  - L2465: `never arrives. TODO(decision) is NOT needed — this is a build`
  - L3020: `remains the open TODO(decision) recorded in recordPayment.ts; it is`
- **`src/modules/rentals/EvidenceWorkspace.tsx`** (1 markers):
  - L859: `* TODO(decision) — should the Categories rail carry an`
- **`src/modules/rentals/HandoverWorkspace.tsx`** (7 markers):
  - L90: `* approver. TODO(decision), unchanged from the seed build; see`
  - L136: `* TODO(decision): where a driver identity comes from (crew? delivery record?)`
  - L231: `* `TODO(decision)` remains PK-07's, unchanged and not re-opened here.`
  - L435: `* priced span should be is still `TODO(decision)`.`
  - *(and 3 more markers in file)*
- **`src/modules/rentals/NewRental.tsx`** (5 markers):
  - L712: `* TODO(decision) — the Postgres `delivery_type` / `delivery_method` enums`
  - L800: `* vehicle record ruled first — `TODO(decision)`. Typing what is on the van`
  - L1244: `* TODO(decision): for a role that may see booking money but may not record`
  - L2043: `TODO(decision): if the operator EDITS lines/dates after the Quote`
  - *(and 1 more markers in file)*
- **`src/modules/rentals/PackingWorkspace.tsx`** (3 markers):
  - L206: `* session notes at dispatch. `TODO(decision)`, reported with this batch —`
  - L332: `* the rail can state the gap before the operator dispatches. `TODO(decision)`,`
  - L1065: `* `TODO(decision)`: a real column on `packing_lines` or`
- **`src/modules/rentals/RentalsList.tsx`** (1 markers):
  - L95: `*    The `TODO(decision)` it left ("what `productions` should be") is closed in`
- **`src/modules/rentals/ResetWorkspace.tsx`** (2 markers):
  - L794: `* `TODO(decision)`: recording a genuine second pair of eyes needs a staff`
  - L847: `* never guessed at. TODO(decision): a `users.id`-backed staff picker is`
- **`src/modules/rentals/__tests__/rentalsList.render.test.tsx`** (1 markers):
  - L227: `⛔ It used to ship `disabled` with a TODO(decision). §11.1 closed that.`
- **`src/modules/rentals/__tests__/rentalsList.test.ts`** (1 markers):
  - L692: `0002:37 carries a TODO(decision) recording that whether a quote lapses at`
- **`src/modules/rentals/booking/AddClientModal.tsx`** (3 markers):
  - L100: `* see the `TODO(decision)` on `NOT_SAVED_HERE` below. `./newClientDraft` owns`
  - L149: `* ⚠ **TODO(decision) — should this dialog keep collecting the three fields it`
  - L1195: `{ TODO(decision) — this one field is labelled for two different`
- **`src/modules/rentals/booking/ClientCombobox.tsx`** (1 markers):
  - L114: `* ⚠ TODO(decision) — there is no per-operator "recently used" list in the data`
- **`src/modules/rentals/booking/ClientHistoryDrawer.tsx`** (1 markers):
  - L29: `* ⚠ TODO(decision) — the `ROWS` / `CLIENTS_DATA` ownership contradiction above`
- **`src/modules/rentals/booking/ClientQuickView.tsx`** (1 markers):
  - L79: `* ⚠ TODO(decision) — a real payment status needs invoice due dates, and no`
- **`src/modules/rentals/booking/OverbookingOverrideModal.tsx`** (1 markers):
  - L42: `* approver FK — is a schema question. TODO(decision), PLAN.md §4: nothing here`
- **`src/modules/rentals/booking/clientHealth.ts`** (4 markers):
  - L54: `* ⚠ **TODO(decision)** — every number in this block is a *placeholder*, not a`
  - L128: `* ⚠ TODO(decision) — none of these can be derived from the current seed layer:`
  - L159: `* ⚠ TODO(decision) — nothing in the app can produce this today. There is no`
  - L422: `the TODO(decision) on `ClientHealthSignals`: these carry no resolution`
- **`src/modules/rentals/booking/index.ts`** (1 markers):
  - L57: `* RESOLVED (was a TODO(decision) collision): `./AddClientModal` briefly shipped`
- **`src/modules/rentals/booking/itemCatalogue.ts`** (2 markers):
  - L41: `* TODO(decision) — PLAN.md §4: the two catalogues need to become one. Until`
  - L893: `* TODO(decision) — PLAN.md §4: services (operator day, drone pilot, delivery,`
- **`src/modules/rentals/booking/newClientDraft.ts`** (1 markers):
  - L56: `* ⚠ **TODO(decision) — nothing writes a `client_memberships` row.**`
- **`src/modules/rentals/modals/ExtendRentalModal.tsx`** (1 markers):
  - L36: `* TODO(decision): where does an extension's daily rate come from — the`

### Inventory & Assets (22 markers)

- **`src/actions/inventory/__tests__/inventoryWrites.test.ts`** (1 markers):
  - L521: `it('surfaces the missing transfer sequence as a migration, not a retry — the TR-vs-TRF TODO(decision)', async `
- **`src/actions/inventory/approvePurchaseRequest.ts`** (1 markers):
  - L40: `*    reason; the column is left NULL rather than invented. TODO(decision):`
- **`src/actions/inventory/createBundle.ts`** (1 markers):
  - L69: `* `booqable/sync.ts`'s recorded TODO(decision), not this file's to settle.`
- **`src/actions/inventory/createEquipment.ts`** (2 markers):
  - L32: `*    TODO(decision) — `numbering.ts` says `EQ-CAT-NNNNNN`, the CHECK says`
  - L72: `* catalogues are different universes, audit gap 16). TODO(decision) on each.`
- **`src/actions/inventory/createStockTransfer.ts`** (2 markers):
  - L48: `* ## ⚠ TODO(decision) — the transfer number series (unchanged, but now honest)`
  - L307: `header TODO(decision): on a project whose number_sequences has no`
- **`src/data/__tests__/depreciation.test.ts`** (2 markers):
  - L87: `expect(DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON).toContain('TODO(decision)')`
  - L92: `expect(IRD_POOL_BLOCKED_REASON).toContain('TODO(decision)')`
- **`src/data/addEquipment.ts`** (3 markers):
  - L96: `*    `TODO(decision)`: the three authorities that describe an equipment code`
  - L248: `'TODO(decision) — depreciation groups are undefined. Add Equipment §16 asks which asset lives the accountant u`
  - L255: `'TODO(decision) — no container in the item master carries a capacity, so §6.1’s over-capacity warning cannot b`
- **`src/data/bundles.ts`** (2 markers):
  - L97: `* TODO(decision) — PLAN.md §4: where do per-model weights come from? They are`
  - L155: `* TODO(decision) — Bundles.md §14 ⭐: *"Is the bundle rate set manually, or a`
- **`src/modules/inventory/DamageTab.tsx`** (2 markers):
  - L105: `* RESOLVED 12 Aug 2026 — this carried a `TODO(decision)` because no `lib/rbac``
  - L178: `the notice says exactly that. TODO(decision): an `approveDamageFinding``
- **`src/modules/inventory/Maintenance.tsx`** (1 markers):
  - L63: `*     One open question is marked `TODO(decision)` in that file.`
- **`src/modules/inventory/PurchaseRequests.tsx`** (1 markers):
  - L546: `* TODO(decision) — justification notes are free text a person`
- **`src/modules/inventory/Warehouses.tsx`** (4 markers):
  - L103: `*    Used / Available only — see the Capacity tab's TODO(decision).`
  - L831: `* that dropped them (the audit's TODO(decision) on this input) is closed.`
  - L1707: `TODO(decision): whether a warehouse carries a geocode and a floor/building line.`
  - L1853: `so they are absent rather than estimated. TODO(decision): whether reserved slots are tracked per zone or`

### Clients & CRM (17 markers)

- **`src/actions/clients/__tests__/blockClient.test.ts`** (1 markers):
  - L167: `TODO(decision) noted in the action; the validator must not invent the rule.`
- **`src/actions/clients/blockClient.ts`** (4 markers):
  - L59: `* ## ⚠ TODO(decision) — `client.block` resolves to no rule in `lib/rbac``
  - L84: `* ## ⚠ TODO(decision) — is a reason mandatory?`
  - L180: `Left naming the real capability — see the TODO(decision) in the header.`
  - L211: `TODO(decision) in the header for why it is not also a NOT NULL.`
- **`src/actions/clients/createClient.ts`** (4 markers):
  - L59: `* ## ⚠ TODO(decision) — `client.create` resolves to no rule in `lib/rbac``
  - L66: `* `core.ts:45-52` marks TODO(decision) is ruled.`
  - L81: `* ## ⚠ TODO(decision) — the `client_code` format mismatch (PLAN.md §4.20)`
  - L258: `Left naming the real capability. See the TODO(decision) in the header: the`
- **`src/modules/clients/AddClient.tsx`** (1 markers):
  - L677: `**TODO(decision).** 0005's own comment on the column says *"Not`
- **`src/modules/clients/ClientDetail.tsx`** (1 markers):
  - L578: `* **TODO(decision)** — `client_flags.reason` is still physically nullable,`
- **`src/modules/clients/Clients.tsx`** (1 markers):
  - L370: `*    no agreed formula — `toClientRecord` hard-zeroes it with a TODO(decision)`
- **`src/modules/clients/ClientsDirectory.tsx`** (1 markers):
  - L109: `* TODO(decision): the chip strip reads All · Organisation · Individual ·`
- **`src/modules/clients/__tests__/clientsQuery.test.ts`** (1 markers):
  - L217: `⚠ TODO(decision) — `MembershipTier` has no 'None', so a client with no`
- **`src/modules/clients/modals/AdjustCreditLimitModal.tsx`** (1 markers):
  - L23: `* TODO(decision) — no credit-limit action exists. `approved_credit_limit` is`
- **`src/modules/clients/modals/UpgradeTierModal.tsx`** (1 markers):
  - L44: `* TODO(decision) — no tier-change action exists. A tier lives in`
- **`src/modules/clients/modals/VerifyKycModal.tsx`** (1 markers):
  - L19: `* TODO(decision) — no KYC action exists. Nothing in `src/actions/clients``

### Finance, Payments & Invoices (8 markers)

- **`src/actions/finance/recordPayment.ts`** (2 markers):
  - L75: `*    carry a `TODO(decision)` saying so. A display number in a field named`
  - L226: `BOOKING number as the record id (their own TODO(decision): whether a`
- **`src/modules/finance/Finance.tsx`** (4 markers):
  - L544: `* ⚠ **The TODO(decision) that stood here is closed, and the gate has moved.**`
  - L1079: `* the set). TODO(decision).`
  - L1202: ``invoice.create` through; its TODO(decision) is closed. }`
  - L1441: `that question as an open TODO(decision) (`PERIOD_BASIS`), and`
- **`src/modules/finance/__tests__/Finance.restricted.test.tsx`** (1 markers):
  - L377: `* money rule available, under a TODO(decision) recording that `lib/rbac``
- **`src/modules/finance/modals/RecordPaymentModal.tsx`** (1 markers):
  - L299: `* ── TODO(decision) · may a receipt exceed what the invoice asks for? ──────`

### Operations UI & Components (7 markers)

- **`src/components/shell/MoreSheet.tsx`** (1 markers):
  - L33: `* `TODO(decision)` live next to `MORE_ROUTES` in `data/nav.ts` rather than`
- **`src/components/shell/__tests__/shell.test.tsx`** (1 markers):
  - L194: `Clients is in More despite the spec's list omitting it — TODO(decision).`
- **`src/components/ui/ReportToolbar.tsx`** (1 markers):
  - L81: `* TODO(decision): BS month / quarter / fiscal-year presets. They need a BS`
- **`src/modules/operations/OperationsQueues.tsx`** (1 markers):
  - L139: `* TODO(decision): spec 03 §3.1 draws **five** chips — the four verbs plus`
- **`src/modules/operations/SubRental.tsx`** (2 markers):
  - L97: `*  · `TODO(decision)` — its capability is `subrental.create`, and`
  - L162: `* TODO(decision) — "Active Records" has no ruled definition (which statuses`
- **`src/modules/operations/modals/LogCaseModal.tsx`** (1 markers):
  - L67: `TODO(decision): "hold amount defaults to the estimated cost" is deposit`
