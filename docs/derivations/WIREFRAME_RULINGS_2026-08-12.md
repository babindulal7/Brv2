> [!NOTE] HISTORICAL DERIVATION & REFERENCE ONLY
> **Status:** ARCHIVAL REFERENCE
>
> This document records background design reasoning, wireframe rulings, or interaction mappings. Where any statement here conflicts with canonical truth documents ([`docs/PRODUCT_RULES.md`](../PRODUCT_RULES.md), [`docs/UI_UX_RULES.md`](../UI_UX_RULES.md), or [`docs/WORKFLOWS.md`](../WORKFLOWS.md)), the canonical truth documents prevail.

---

# Wireframe Rebuild — Rulings Register

**12 Aug 2026.** Every implementer working from `../updated mds/01..11_*.md` reads this
file first. It records the decisions taken so that eleven agents resolve the same
conflict the same way — and so that a later session does not silently reverse one.

A read-only audit (11 agents, one per spec) found **235 gaps and 79 conflicts** between
the updated wireframes and the code. This file rules the ones that needed ruling. The
rest resolve by the standing rule in §1.

---

## 0. The one thing to understand first

The updated wireframes are **abbreviated ASCII boxes**. They draw less than the code
contains — no KPI strips, no filter rails, no Pricing section on New Rental, no right
rail on Calendar or Settings. The code defends most of those extras with cited section
numbers from the *older* specs.

Reading an omission as a deletion order would have destroyed roughly 1,500 lines of
working, spec-cited UI. It is the single most likely way this rebuild goes wrong.

---

## 1. RULED — the wireframes are a **layout** spec, not a content inventory

> **A panel survives unless a spec removes it in prose.**

The ASCII boxes specify *arrangement* and the *three responsive layouts*. They are not a
list of everything the page may contain.

**Removed, because a spec says so in words — these genuinely go:**

| Removed | Authority |
|---|---|
| Productions tab + `ProductionsTab` + `data/productions.ts` + `data/productionIntel.ts` | 04 line 3 "Productions removed" |
| Inventory's Sub Rental and Cases tabs | 07 line 4 "dropped as duplicates" |
| Warehouses out of Inventory → Settings ▸ Branches & Warehouses | 07 line 4, 11 §11.3 |
| Purchase Requests screen (table + auto-draft rule stay in the schema) | 07 line 5 "archived" |
| Settings' Automation · Channels/Communication · AI sections | 11 §11.2 "Removed and parked" |
| Finance's 5th "Audit" tab (audit log is a Tools card) | 10 §10.4, `data/nav.ts` |
| Crew Assist's Booking/Directory/Timesheets/Payouts tab strip | 06 §6.1 draws none |
| The four Sales & Marketing reports | 09 "Cut" — no backing tables exist |

**Kept, because no prose removes them** — Calendar's KPI band, rail and Full View mode;
New Rental's Pricing & Payments and Documents & Review sections; Rentals' KPI strip and
pagination; Settings' `OverviewRail`/`BranchesRail`; Today's KPI strip. Build the
wireframe's arrangement *around* them.

Two judgement calls inside this ruling, both flagged rather than silent:
- **Rentals' filter rail** (ten of eleven groups inert) and its disabled Timeline toggle
  are the strongest deletion candidates now that Status moves into the chip row. Leave
  them; raise separately.
- **Today's `TimelinePanel`** duplicates the calendar card's day list and is drawn in no
  wireframe. Leave it; raise separately. `Dashboard.md` §9 still asks for it.

---

## 2. RULED — identifiers: one ID per entity, configured from Settings

Supersedes spec 10 §10.6's own wireframe (which shows `BR-2026-0715`, padding 4/5) and
closes `PLAN.md` §4.4, open since 4 Aug.

| Entity | Prefix | Example |
|---|---|---|
| Booking | `B-` | `B-1` |
| Client | `C-` | `C-1` |
| Membership | `M-` | `M-1` |
| Invoice | `INV-` | `INV-1` |
| Quote | `Q-` | `Q-1` |
| Bundle | `BND-` | `BND-1` |

**No year segment. No zero padding.** `B-1`, not `B-0001` and not `B-2026-0715`.

Three consequences that are not optional:

1. **One ID per booking, everywhere.** No separate job ID, operation ID or session ID
   shadowing a booking. If a workspace needs to name a booking it uses the booking's own
   number. This was an explicit ruling.
2. **The prefixes are configuration, not constants.** `Settings ▸ Numbering`
   (Tools §10.6) is the source of truth and the sequences are editable there. No module
   may hardcode a prefix — same rule `PLAN.md` §5 already applies to the VAT rate.
3. `BR` stays reserved as the **BRANCH** token in `numbering.ts:210`, used by the invoice
   format. The new scheme does not collide with it.

⚠ **This rename is a single coordinated pass, not eleven piecemeal edits.** It touches
seed data, routes, breadcrumbs, deep links and the PWA precache list (`App.tsx:807-811`).
No page agent renames identifiers. See task #8.

---

## 3. RULED — Operations are routes; the shell becomes a launcher

Spec 03's parameterised routes (`/rentals/:br/packing`, …) are canonical — which is also
what `App.tsx:163` already says: *"§4.3 — operations are full-screen routes, never
modals."*

`OperationsShell` is reduced to a **launcher** whose tabs navigate to those routes,
keeping the step-gating logic ported into it on 11 Aug. The `embedded` prop on all four
workspaces exists only to serve the modal and goes with it.

Routes must work for **any** booking number, not one seeded booking (spec 03 Notes).

---

## 4. RULED — breadcrumbs everywhere, no `←` back arrow

The `←` drawn in all eleven specs is shorthand for "this is a sub-page". `PLAN.md`
Phase 5 — *"Breadcrumbs, no Back buttons"* — stands, and four screens defend it in
comments. Adding `←` to the workspaces would also recreate the two-exits problem a
previous correction was written to fix (`Cancel Packing` is already the exit).

---

## 5. RULED — Clients keeps its Memberships tab

`TABS['/clients'] = ['Clients', 'Memberships']`, deliberately overriding spec 08's
"Directory only — no tabs". Crew leaves that tab set: Crew Assist is nav item 6 with its
own page, and a destination reachable two ways is the duplication the nav rules prevent.

`/clients/memberships` and `src/modules/clients/Membership.tsx` stay as they are. The
membership **plan matrix** additionally appears in Settings ▸ Financial per spec 11 §11.2;
the per-client resolved level appears on the client record per spec 08 §8.2.

---

## 6. RULED — Tools keeps the cinematography suite

Spec 10's "Six cards… Nothing else" does not license deleting the 1,616-line suite at
`src/modules/settings/Tools.tsx` — Law 3 says nothing is deleted. It gets its own group
on the Tools landing, a seventh card.

Open: whether it lives at `/settings/tools` or `/tools/cinematography`. Spec 11's eight
Settings sections include no Tools, so `/settings/tools` currently has no home in either
spec. Pick `/tools/cinematography`, redirect the old path, and note it.

---

## 7. Resolved by standing rule — laws outrank wireframes

`PLAN.md` §0 wins wherever it conflicts with a drawing. No agent needs to ask again:

| Wireframe says | Law | Do this |
|---|---|---|
| "gold outline row = external gear"; green/red availability; `▓▓░░` day strip | 11 — never colour alone | Colour **plus** icon **plus** accessible label. `lib/status.ts:49,64` already pairs `ext` with a border and an `external_link` icon |
| §9.1's four money KPIs | 6 — money-blind roles | Keep the count KPI; a money-blind role must not get an empty strip |
| §3.3 "⚠ advance short" in a gate checklist | 6 — *including inside gate checklists* | Warning carries **no amount and no derived amount** |
| §11.1 draws Financial for everyone | 6 | Build the phone section list from the **filtered** tab set — Warehouse gets six, not seven |
| Settings' "AI Branch Insights" card | 16 — no AI panel until backed by real computation | Delete it, with the AI tab |
| §1.1 discount as chips only | 10 — >10% needs reason ≥10 chars **and** approver, 25% cap | Chips open a popover carrying both fields; `validateDiscount()` gates Confirm; no chip above 25% |
| `VAT 13%` drawn as a literal | §5 Conventions — never a hardcoded VAT rate | Read the rate from settings, render `VAT {rate}%`. Delete `NewRental.tsx:72 VAT_PCT = 13` |
| §10.7 Restore with only a typed confirmation | 3 + Administration §25.2 | **Do not build as drawn.** Keep Owner-only + 2FA, sandbox as default target, mandatory pre-restore checkpoint. Gate Download the same way — a full backup walks around Law 6's RLS |
| §7.1 `(Damaged)` as a status chip | `workflow.ts:141` — a condition, never a status | Filter facet on Condition. Do **not** add a `Damaged` status enum member |
| §9.3 `(Reversed)` as a payment status | `0001_enums.sql:288` — four statuses | Predicate over a linked `payment_reversals` row, not a fifth enum member. Keep Failed and Cancelled reachable |
| §3.2 badge "Preparing" | The canonical six stages | Badge the canonical status; show job progress as a separate chip |
| §1.1 `[Cancel]` | 3 — nothing is deleted | Before Save Draft: discard local state. After: a named terminal transition with a `ConfirmDialog` |

**"Right rails collapse below 1180" means *reflow*, not *hide*.** That is the only reading
under which specs 03, 06 and 09's tablet drawings are satisfiable — they all describe rail
content moving *below* the list, still visible. Do not wrap those in `CollapsibleAside`,
and do not change its default: other pages depend on it.

> *31 Aug 2026:* the number is now **1280** — Law 14 was amended (`PLAN.md` §4.38a) to match
> `DESIGN_DIRECTION_SPEC_v4.1` §7.7 and the rails built since 30 Aug. The ruling itself — reflow,
> not hide — is unchanged; only the width at which it fires moved.

---

## 8. Never fabricate a figure or a success

Two separate rules, both already violated somewhere in this repo.

**Figures.** Spec 09 is explicit: Payables *"renders the honest 'not tracked yet' empty
state, never a fabricated figure"*, and §9.7 — *"A report with no data source shows 'not
tracked yet', never zeros."*

⚠ `src/data/liquidityReports.ts:113` hand-types `Trade payables: rupees(42_200)` and feeds
it into `currentLiabilities()`, `workingCapital()`, `currentRatio()` and `freeCash()` —
all rendered by `WorkingCapitalReport.tsx`. There is no supplier-invoice table. **Fix this
before the Payables report is built**, or the app says "not tracked yet" on one screen and
Rs 42,200 of the same liability on another, with three derived ratios silently wrong.

Same class, to check rather than assume: Today's "Cash due" KPI has no derivation in the
repo; Crew's payout net/TDS has no ruled rate (`PLAN.md` §4.12); Depreciation has no asset
lives (`data/addEquipment.ts:207`); the IRD pool view has no statutory rates anywhere.
Each renders "not tracked yet" until a real source exists. **Never seed a plausible
default.**

**Successes.** See `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` — ~40 sites where a screen
tells the operator a write succeeded when nothing was written. `src/actions/core.ts` now
refuses any action not marked `implemented: true`, so those writes do not happen.

> **No page agent may mark an action `implemented`.** Doing so without first fixing its
> callers turns a lie into a wrong write.

---

## 9. Still open — do not resolve these while building

Raise them; do not invent an answer (`CLAUDE.md` hard rule).

> **Items 1–3 were RULED on 13 Aug 2026 and are recorded in §11 below.** They are kept
> here, struck, so a reader who arrives via an old reference finds the answer rather than
> an open question.

1. ~~**Sub-Rental is specified three ways.**~~ **RULED → §11.1: line-level, booking flag
   derived.**
2. ~~**"On Stop" does not exist in the schema.**~~ **RULED → §11.2: derived from credit
   state, threshold read from Settings ▸ Financial.**
3. ~~**Spec 09's three self-declared duplications.**~~ **RULED → §11.3: deduplicate.**

3a. **NEW, 13 Aug 2026 — the `payment` sequence diverges from every other document.**
   `payments` mints `PAY-2026-0094`; everything else mints `INV-121`, `B-918`, `DEP-90`.
   This is not an oversight. `trg_payments_reject_update` (`0046`) refuses UPDATE on
   `payments` for **every role including `service_role`**, so the 93 existing
   `PAY-2026-xxxx` numbers are permanent — an attempt to renumber them was refused by the
   database and rolled back in full. The sequence was therefore left in the retired shape
   so the table stays internally consistent rather than splitting at row 94.
   **The decision:** accept the divergence, or move the sequence and accept that payments
   1–93 read one way and 94-on read another. A one-line UPDATE either way; the historical
   rows cannot move regardless. See `0056`'s header.
4. **`0054` is unapplied**, so the Clients directory cannot expose the blocked flag that
   spec 08's closing note requires. Needs migration approval, not a code change.
5. **Handover "No re-scan"** vs the built multi-session Partial Pickup model. If partial
   pickup survives, the drawing is incomplete; if not, deleting the scan path deletes a
   model other screens reference.
6. **Reset's fixed `clean`/`charge` pair** contradicts the category-checklist rule
   (*"a lens here is never asked to Charge Batteries"*). That is a different product, not a
   layout simplification.
7. **Evidence "is a viewer, not a verb"** vs a workspace shipping upload, bulk actions and
   match approval — on which the Packing completion gate depends.
8. **Quick Add's two fields** vs the required set the form defends (*"the floor has to be
   able to find it"*).
9. **Bundle "Final price (one field)"** vs the per-line model carrying the Law 10 gate.
   Reading it as the *override* `AddBundle` already implements preserves the law.
10. **Maintenance's four chips** vs six live states — `At Vendor` and `Cancelled` have no
    chip, and Law 3 keeps Cancelled reachable.
11. **`FEE_PER_CREW_DAY_PAISA` is declared twice** — `data/crew.ts:374` at Rs 1,000 (which
    `PLAN.md:839` records) and `data/settings.ts:8` at Rs 500, dead but exported under the
    same name. Delete the Rs 500 one before splitting Settings, or someone halves a billed
    rate by importing the wrong file.
12. **Branch/warehouse seeds do not reconcile** — `data/settings.ts` claims 2/1/1
    warehouses; `data/warehouse.ts` keys four warehouses by free-text branch name, giving
    HQ one and inventing a Bhaktapur branch. The guard only asserts the total, which passes
    by coincidence. Fix before drawing §11.3's nested row.
13. **`Available` vs `In Stock`** — Bundles says one, Equipment says the other, inside one
    page.

---

## 10. Concurrency

Another session is writing to this repo **right now** (`src/lib/queries/*`,
`NewRental.tsx`, `AddItemPanel.tsx`, `CalendarPanel.tsx` at 02:12). Restore point:
`6fb1c62`. Re-read a file immediately before editing it; do not trust a line number
you read minutes ago.

---

## 11. Rulings of 13 Aug 2026

### 11.1 Sub-Rental is a **line-level** property; the booking flag is **derived**

A line is sub-rented. A booking counts as sub-rental **if any of its lines is**. This is
the only reading that satisfies both of spec 04's drawings at once — §4.1's gold-outline
*row* and §4.2 Notes' gold-outline *line* — without storing the same fact twice and
letting the two disagree.

- `LineItem` gains the field. `RentalRow` does **not**: the booking-level answer is
  computed from its lines, never written.
- The `(Sub-Rental)` chip on `/rentals` filters on that derived predicate, replacing the
  disabled-with-a-reason chip that ships today.
- Law 11 still applies: the gold outline is never alone. It carries `STATUS.ext`'s icon
  and an accessible label ("Sub-rented"), as §7 already requires.
- `/operations/sub-rental` **survives** as the register behind it (Law 3).

### 11.2 "On Stop" is **derived from credit state**, with the threshold in Settings

Not a fourth `client_flag_type`. A client is On Stop when **either**:
- their outstanding balance exceeds their credit limit, **or**
- they hold an invoice more than *N* days past its due date.

*N* is **read from Settings ▸ Financial**, beside the payment terms, defaulting to **30** —
per spec 11 §11.4's own rule, *"Every value here is read by a screen. None is hardcoded."*
No migration, no flag to go stale when a client pays, and the chip stops being a filter
that always returns nothing.

Blocked and On Stop remain **intersecting overlays**, not siblings of Active (§7): a client
is routinely Active *and* On Stop, and `0005_clients.sql` is explicit that a block is a flag
which "coexists with the client's state", never a status.

### 11.3 The report catalog is **deduplicated**

Spec 09 §9.6 declares three duplications and leaves them open. Resolved:

| Duplication | Resolution |
|---|---|
| Profit & Loss in groups 01 **and** 06 | Lives in **01** only |
| Payments and Expenses are each both a tab and a report | The group-06 entries **deep-link into the Finance tab**, they do not duplicate it |
| `05 Outstanding` = `06 Receivables` | Collapses into **06 Receivables** |

The register drops from 45 to ~42 reports, each with exactly one home. `catalog.ts`'s
`CATALOG_ERRORS` module-load assertion must be updated to the new per-group counts in the
same change, or it will report a failure on screen.

Two screens showing the same figure under different names is how reconciliation arguments
start; the spec was right to flag it and wrong to leave it.

### 11.4 The identifier ruling reaches nine of ten sequences

Added: `M-` membership, `Q-` quote, `BND-` bundle (none existed). Converted: `DEP-`
deposit, `EXP-` expense. Untouched by design: `EQ` equipment (out of scope, CHECK-enforced)
and `PAY-` payment (immutable — see §9.3a). Applied and verified live as `0056`.
