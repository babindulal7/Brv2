# Screen Catalogue — reference renders

**Screenshots are the primary design reference; module specs are secondary.**
Source: `../mds and photos/Babin Rentals OS/Appendix/Screenshots/` (113 PNGs, UUID names).

Tick a row when that screen is built **and driven in the browser in both themes**.

---

## The canonical shell

Three sidebar generations appear across the renders. **Generation C wins** — it is the most
complete, matches the documentation tree, and appears in the newest renders (footer stamps
`Babin Rentals OS v3.0.0`).

| Gen | Look | Seen in | Verdict |
|---|---|---|---|
| A | 15 flat items, no numbers, `Scanner (⌘+B)` button, user card | `01F8C018` Add Equipment | superseded |
| B | numbered 01–07, expandable, big orange **Scan Item** FAB | `05AFD275` Booking Detail | superseded |
| **C** | **numbered sections, expandable children, branch card + Dark/Light toggle** | `13590713`, `F134F2C8`, `12402A27`, `09168AC3` | **canonical** |

### Generation C sidebar — the build target

```
01 Today Operations
02 Rentals List
03 Operations Queues
04 Calendar
05 Inventory        ›
06 Clients          ›
07 Finance          ›   (Dashboard · Payments · Expenses · Documents · Reports ›)
08 Reports          ›   (Client · Financial · Payment · Expense · Promotions · Staff ·
                         Inventory · Activity Log · Audit · Comparison · Forecasting & AI)
09 Documents        ›
10 Administration   ›   (Users & Roles · Permission Matrix · Teams & Departments ·
                         Approval Workflows · Numbering Sequences · Business Hours &
                         Holidays · Fiscal Year · Taxes (VAT) · Currencies ·
                         Communication Settings · Payment Gateway Settings ·
                         Integrations · Security · Backup & Restore · Audit Settings ·
                         AI & Automation)
11 Automation Center ›
12 Notification Center ›
13 AI Assistant     ›
14 System Monitor   ›
15 Settings         ›
```

**Fifteen, not sixteen.** `12402A27` carries Integrations twice — top-level *and* as an
Administration child. `13590713` and `F134F2C8` both drop the top-level copy and renumber;
two renders against one, and one destination should not appear in the nav twice.

Footer: branch card (`Babin Rentals Pvt. Ltd.` · `Boudha, Kathmandu` · `VAT: 609876543`) —
the PAN is wrong on the render; the correct value is `623587106` (Decisions — 8 Aug 2026 §1A) —
then a **Dark / Light** segmented toggle. Not a single icon button — two labelled halves.

**This settles the 13-vs-7 sidebar conflict left open in `data/today.ts`:** neither. It is
15 numbered sections with expandable children.

### Sub-app shells

Some sections replace the main sidebar with their own nav rather than nesting:

- **Automation Center** (`0E1E82D7`, `0E44371B`) — own rail: Dashboard, Workflow Builder,
  Automation Library, Scheduled Jobs, Event Triggers, Execution Queue, Automation Logs,
  AI Automation, Business Rules, Automation Templates, API Automations, Analytics,
  Version History, Testing Sandbox. Plus a `SHORTCUTS` group: My Workflows, Favorite
  Workflows, Recent Executions, AI Suggestions, Templates.

---

## Recurring page furniture

Every deep screen in Generation C shares this skeleton — build it once, reuse it:

- **Breadcrumb** above the title (`Administration › Communication Settings`), section name in
  the theme accent, current page in plain text.
- **Page title + one-line description**, with the page's action cluster on the right.
- **KPI strip** — 5–6 cards, each with an icon tile, big number, and a delta or sparkline.
- **Right rail**, ~280px: Summary card → Alerts → Quick Actions → Recent Activity →
  an **AI assistant card** with a prompt input at the bottom.
- **Footer note bar**: `All dates are shown in BS above AD · Timezone: Asia/Kathmandu (NPT)`
  plus a page-specific immutability note, and `Babin Rentals OS v3.0.0` right-aligned.
- Date columns show **BS above AD**, both in Latin digits.

---

## ⛔ `B0C41191` — Foundation Specification v1.1 (Build Locked)

Not a screen. It is **the spec sheet itself, rendered as an image**, and it
outranks every module doc (CLAUDE.md: "Where anything disagrees with Foundation,
Foundation wins"). Read it before building anything that touches status, money,
dates or navigation.

What it settled, and what it broke in code already written:

| § | Rule | Consequence |
|---|---|---|
| 01 | **12 canonical stages** — Quote · Draft · Confirmed · Preparing · Ready · Dispatched · On Rent · Return Due · Inspection · Cleaning · Completed · Closed (+ Cancelled, any stage). "These are the only valid workflow status names." | Dashboard.md §9's list was **wrong**. "Booked" and "Packed" are not stages; "Returned" is an **item flag**, not a status. Now enforced by the `Stage` union in `lib/workflow.ts` |
| 01 | Item quantity states — Ready · On Rent · Returned · Missing · Damaged — are **not statuses**. "Partial Pickup" likewise | Several can be true at once on one booking, which is why they cannot be a stage |
| 02 | `Outstanding = Rental Total − Rental Payments`. **Deposits never reduce it.** "All totals displayed must reconcile exactly" | Render `05AFD275`'s own numbers don't reconcile; Foundation's worked example replaces them, guarded by an assertion |
| 03 | BS always leads with **Latin digits**; store AD in UTC; Nepali FY is Shrawan–Ashadh | Already obeyed |
| 06 | Contrast **4.5:1 minimum**; "Don't rely on color alone" | This is the bar the browser sweep enforces |
| 07 | Breakpoints — mobile 0–767, tablet 768–1179, desktop 1180+ | Not yet implemented; the app is desktop-only so far |

⚠ **Open conflict.** Foundation §5.1 draws the shell with **8 nav items** (Today,
Rentals, Operations Queues, Inventory, Clients, Calendar, Finance, Settings) and
a scanner FAB. The Generation C renders show 15 numbered sections. Foundation is
build-locked but older (19 Jul) than those renders (v3.0.0). **Not resolved —
needs a ruling.** The build currently follows Generation C.

---

## Catalogue

| File | Screen | Theme | Gen | Built |
|---|---|---|---|---|
| `01F8C018` | Inventory → **Add Equipment** (5-step wizard: Basic Info, Inventory Structure, Pricing & Rental, Relationships, Review & Save) with serial table, equipment-tree preview | dark | A | ☐ |
| `05AFD275` | Rentals → **Booking Detail** `BR-2613` (5 blocks: Client & Schedule, Equipment, Crew & Transport, Pricing & Payments, Documents & Review) | light | B | ☐ |
| `09168AC3` | Finance → Reports → **Expense Reports** (6 KPI + trend, category/method donuts, budget-vs-actual, ageing, branch bars, approval, txn table) | dark | C | ☐ |
| `0E1E82D7` | Automation Center → **Business Rules** (rule list, IF/THEN rule builder, dependency graph, simulation centre) | dark | C-auto | ☐ |
| `0E44371B` | Automation Center → **Testing Sandbox** (scenario builder, execution console, API mock centre, AI prompt tester) | dark | C-auto | ☐ |
| `12402A27` | Administration → **Communication Settings** (channels, notification templates, delivery queue, comms timeline) | dark | C | ☐ |
| `12E6320D` | duplicate of `0E44371B` | — | — | n/a |
| `13590713` | Administration → **Audit Settings** (audit config, categories, retention policies, audit rules, compliance, legal hold, analytics) | dark | C | ☑ |
| `1542A77D` | Automation Center → **Event Triggers** (trigger categories, activity timeline, trigger list, trigger detail panel, execution queue) | dark | C-auto | ☑ |
| `77B52333` | **Rentals List** (6 KPI, quick-filter chips, view switch, filter rail, booking table) | light | B | ☑ |
| `6989CD12` | **Booking Detail, richer** — Operations menu (Packing · Pickup/Delivery · Return · Reset · Cleaning) with five annotated full-screen workspaces, nested bundle→category→item equipment tree | light | B | ◐ page built, workspaces not |
| `A048278E` | Settings → **Client Portal Settings** (category list + accordion sections, toggles/selects) — shell is v1.0.0, superseded; the *settings page pattern* is still the reference | dark | older | ☐ |
| `F134F2C8` | Administration → **Backup & Restore** (6 KPI, type tiles, schedule, history, restore centre, destinations, integrity donut, analytics row) | dark | C | ☑ |
| `4505348F` | Clients → **Membership** (6 KPI, 5 plan cards, status chips, member table with usage meters) | dark | older | ☑ |
| `3B62B8D9` | Communication Center → **Broadcast Center** (6 KPI, audience segments, campaign table, campaign builder + message preview, delivery funnel, performance lines, upcoming) | dark | C-comms | ☑ |
| `2562E6AA` | Communication Center → **SMS Center** (6 KPI, gateway manager, SMS queue, message list + viewer, volume trend, gateway performance, campaign donut) | dark | C-comms | ☑ |
| `34BC280B` | Finance → Reports → **Product Reports** (6 KPI, sales trend, category donut, top revenue, profit bars, turnover, fast/slow/dead movers, return donut, product table) | dark | C | ☑ |
| `D1353039` | Finance → Reports → **Client Reports** (6 KPI, growth trend, revenue-by-client bars, retention donut, booking frequency, ageing, membership split, cases, client table) | dark | C | ☑ |
| `CD132C04` | Administration → **Numbering Sequences** (6 KPI, category rail, sequence table, segment preview generator, config tabs, analytics row) — also the authority on ID formats | dark | C | ☑ |
| `B0C41191` | **Foundation Specification v1.1** — the build-locked spec sheet as an image. See the section above | light | spec | n/a |
| `8760FD3C` | **Tools Center** (15 tool-category cards, favourites, recent, quick actions, shortcuts) — its nav is the 13-item generation, and the settled nav has no Tools section | dark | mixed | ✗ out of nav |

**`F134F2C8` independently confirms the 15-section nav** — same numbering, Integrations
only under Administration. Two renders now agree against `12402A27`'s 16.

*(catalogue continues as renders are read — each render is read immediately
before its screen is built, not all up front)*

---

## Built

| Screen | Route | Render | Verified |
|---|---|---|---|
| Today Operations | `/today` | `C2584232` + Dashboard.md | both themes, contrast swept |
| Rentals List | `/rentals` | `77B52333` | both themes, contrast swept |
| Booking Detail | `/rentals/:bookingNo` | `05AFD275` + `6989CD12` | both themes, contrast swept |
| **New Rental** | `/rentals/new` | `6989CD12` + `Booking Workflow.md` v2.3 | both themes, contrast swept |
| **Packing Workspace** | `/rentals/:bookingNo/packing` | `Packing Workflow.md` v2.1 (render defects corrected) | both themes, contrast swept; **gate driven end to end** |
| **Evidence Workspace** | `/rentals/:bookingNo/evidence` | `Evidence Workspace.md` v1.1 (render defects corrected) | both themes, contrast swept; soft-remove driven |
| Expense Reports | `/reports/expenses` | `09168AC3` | both themes, contrast swept |
| Membership | `/clients/memberships` | `4505348F` | both themes, contrast swept |
| Broadcast Center | `/notifications` | `3B62B8D9` | both themes, contrast swept |
| Client Reports | `/reports/clients` | `D1353039` | both themes, contrast swept |
| Product Reports | `/reports/inventory` | `34BC280B` | both themes, contrast swept |
| SMS Center | `/notifications/sms` | `2562E6AA` | both themes, contrast swept |
| Event Triggers | `/automation` | `1542A77D` | both themes, contrast swept |
| Numbering Sequences | `/admin/numbering` | `CD132C04` | both themes, contrast swept |
| Audit Settings | `/admin/audit` | `13590713` | both themes, contrast swept |
| Backup & Restore | `/admin/backup` | `F134F2C8` | both themes, contrast swept |

### Spec-derived (no render exists)

Screenshots govern where they exist. For these, **none does** — every render sampled
so far sits in Reports, Finance, Administration, Automation or Communication. These
are built from the build-locked module specs instead, which is the "md second" half
of the rule, and are listed separately so the distinction stays visible.

| Screen | Route | Source | Verified |
|---|---|---|---|
| Inventory | `/inventory` | `Inventory.md` v3.0 (Build Locked) | both themes, contrast swept |
| Calendar | `/calendar` | `Calendar.md` v3.2 (Build Locked) | both themes, contrast swept |
| Documents | `/documents` | `Documents.md` v2.1 (Build Locked) | both themes, contrast swept |
| Operations Queues | `/operations` | `04 Operations/README.md` (12-stage workflow) | both themes, contrast swept |
| Finance | `/finance` | `Payments.md` v2.1 (Build Locked) | both themes, contrast swept |
| System Monitor | `/system` | spec-derived | both themes, contrast swept |
| AI Assistant | `/ai` | spec-derived | both themes, contrast swept |
| Settings | `/settings` | spec-derived + `A048278E` page shape | both themes, contrast swept |

**All 15 sections land on a real screen — verified in the browser, zero placeholders.**
`/clients`, `/reports` and `/admin` are group headers, not screens, so each redirects to
its first built child.

### The 25 child routes still on `Placeholder`

Swept in the browser — every one renders the placeholder with the correct title and
breadcrumb, passes contrast, and is reachable from the nav. None is a dead link or a
broken screen.

| Group | Routes |
|---|---|
| Clients | Crew |
| Finance | Payments · Expenses · Reports |
| Reports | Financial · Payment · Promotions · Staff · Activity Log · Audit · Comparison · Forecasting & AI |
| Administration | Users & Roles · Permission Matrix · Teams & Departments · Approval Workflows · Business Hours & Holidays · Fiscal Year · Taxes (VAT) · Currencies · Communication Settings · Payment Gateway Settings · Integrations · Security · AI & Automation |

`Communication Settings` has a render (`12402A27`) and is the best next candidate;
`Expenses`, `Reports` and `Fiscal Year` have build-locked specs
(`Expenses.md` v2.2, `Reports.md` v2.1, `05 Finance/Fiscal Year.md`).

An unknown URL lands on a **Not found** screen, also verified.

### Corrections the specs forced

- ⛔ **`Dashboard.md` §4 Single Source Rule — the reference render broke it in the open.**
  §4 is a *hard acceptance gate*: Pickups, Returns, Timeline and Calendar "are different views
  of one dataset, never separate fetches", and "a booking appearing in two panels must show
  the same time, the same package and the same status in both". Render `C2584232` shows ABC
  Films' pickup of BK-2026-0715 at **09:00 AM / Ready** in the Pickups column and at
  **06:00 AM / Completed** on the Timeline. The old build copied both. There is now one
  `MOVEMENTS` array; every panel, every KPI count and the throughput strip are *derived* from
  it, and a loop throws if one booking ever describes itself two ways.
- ⛔ **`Dashboard.md` §5.8 — card counts must equal the panel counts.** The render violated
  this three times: Pickups Today read **14** over a column of 3 rows plus "+ 5 more"; Returns
  read **11** over 3 rows plus "+ 4 more"; Critical Alerts read **5** beside a column of 5
  alerts plus "+ 2 more". Every figure is now derived — 14 pickups → 6 shown + "8 more",
  11 returns → 6 shown + "5 more" — and §6's *"minimum 6 rows visible per column"* is a
  named constant rather than however many rows the seed happened to have.
- **`Dashboard.md` §5.6 — "Must equal the Alerts column count."** The Alerts column therefore
  renders `CRITICAL_ALERTS`, not every alert. Alerts carry a `priority`; a non-Critical one
  exists in the seed precisely to prove the column filters.
- ⛔ **`Dashboard.md` §14 — "Purple is reserved for Utilization and appears nowhere else on
  this page."** It was leaking twice: the global Inspection status token *is* purple, so an
  inspection return wore a purple pill and the Inspection Pending alert wore a purple icon.
  Purple is now scoped away on this page only (`[data-page='today']` in `theme.css`), which
  leaves the token correct everywhere else. Verified in the browser: exactly **one** purple
  element on Today, the Utilization icon.
- ⛔ **`Dashboard.md` §12 — "Hover-only intel does not ship", and it very nearly did.** The
  long-press timer existed and a synthetic `touchstart` proved it opened the card. A real
  touch also emits a click on lift, so the row navigated to the booking the instant the card
  appeared — the touch equivalent was unreachable on the only devices it exists for. Now a
  `suppress` ref swallows that one click, a drag cancels the press, and an outside tap or
  Escape dismisses. **Verify gestures with the whole sequence, never one event.**
- ⛔ **`Dashboard.md` §14 — purple survived as a raw hex.** Four rows carried
  `avatarBg: '#4c1d95'`. A check that compares against the `--purple` token misses it, because
  it is a different violet. Avatar fills are now named constants and the check is a
  violet-family test, not a token match.
- **`Dashboard.md` §11 — filters that look live and move nothing** are the same defect as a
  nav link that does not navigate. The chips now scope both columns; options the movements
  query cannot answer are inert with a stated reason; a period with no seeded data says so.
  The **Status** group is back — only its *values* were superseded (three of §11's six are
  not Foundation stages), so it is populated from the twelve.
- **`Dashboard.md` §5.8 / §12 — the intel that was missing entirely.** Every KPI card and
  every risk line now lands on a pre-filtered view (§5.2's risk goes to the *item* list, not
  the booking list, as the spec specifies), hovering or focusing a card shows its **formula,
  period and source**, and the 520px hover card exists with a long-press equivalent — §12:
  *"Hover-only intel does not ship."*
- **⚠ `Dashboard.md` §5.7 does not reconcile with its own §5.2/§5.3.** The strip reads "12 of
  25 movements completed today". The 25 is exactly 14 + 11 and is reproduced. The 12 is not
  derivable: §5.2 gives 6 completed pickups and §5.3's 11 returns are all open (4 overdue +
  7 expected), so the completed count can only be **6**. §5.8's "one query" wins over the
  literal, so the figure is derived and the conflict is logged as `TODO(decision)`.
- **`Dashboard.md` §2 asks for two things that cannot both hold.** "Minimum 6 rows visible per
  column" and "No scrolling on desktop" are incompatible at 1920×1080 once the KPI band, the
  throughput strip and the timeline row are placed. The 6-row minimum wins because it is the
  checkable one; rows were compacted so the page runs ~1471px rather than three screens.
  "Three columns fill equal height" *is* met — measured 686 / 686 / 686.
- ⭐ **RULED — evidence is mandatory before Complete Packing.** `Evidence Workspace.md`
  §20 left it open; the ruling is **yes**, at §14's granularity: *one photo per packed
  case, not per item*. A per-item rule would demand 18 photos for one booking. Cases are
  therefore modelled on `Unit` (`Pelican 1610` · `Lens Case` · `Accessories Case`), the
  gate is per-case, and **only cases holding a packed item need a photo** — an empty case
  cannot block completion. Driven end to end in the browser:
  Bulk Scan → `1 required item not yet packed` → mark the Cleaning-blocked lens Missing →
  `1 missing item needs a reason of at least 10 characters` → reason typed →
  **`3 packed cases need a photo — Pelican 1610, Lens Case, Accessories Case`** →
  one photo → `2 packed cases…` → three photos → **Complete Packing enables**.
- **`Evidence Workspace.md` §7.3 — an Unmatched card must show no product and no serial.**
  The render badged `Portkeys Monitor · PKM-001` **Unmatched**. Rather than hide the
  fields, `Photo.product` is *absent* when unresolved, so the contradiction is
  unrepresentable; `matchState()` derives the badge from the evidence. §7.2's real reason
  is stated instead ("not on this booking", "below the 70% review threshold").
- **`Evidence Workspace.md` §10 — evidence is never hard-deleted.** The render offered
  `Delete Photo`. It is now **Remove**: a reason of at least 5 characters, then the file
  moves to an `Archived` card and stays retained and audited. Counts and the donut
  recompute from the live set. Verified: a 3-character reason is refused, a valid one
  archives and Total falls 10 → 9 with the §6 invariant still holding.
- **`Evidence Workspace.md` §0/§4** — the render carried a four-step header progress *and*
  a five-card explainer strip saying the same thing. One indicator, four steps. Also: the
  stage badge read "Packing", which is not a Foundation stage (now `Preparing`), the
  breadcrumb skipped "Bookings" (restored), and two photos were selected with no bulk bar
  (the bar now appears on selection and states the count).
- **`Inventory.md` §2** — Bundles, Sub Rental, Maintenance and Cases were sidebar
  children in `nav.ts`. The spec corrects exactly this ("tabs **and** sidebar items →
  Tabs only"). They are now tabs on the Inventory page and the nav entry has no
  children.
- **`Inventory.md` §4.3** — the chip counts must reconcile to the total excluding
  Retired. Asserted in `data/inventory.ts` rather than trusted; the spec cites a build
  where they were 186 over.
- **`Inventory.md` §4.1** — there is no manual status control anywhere in Inventory.
  The screen deliberately offers no way to set a status.
- ⭐ **`Calendar.md` §4.2 — the date engine.** The spec calls a three-way BS offset
  disagreement "the highest-priority correctness bug in the product", and the Today page
  had it: `TODAY_DATE` read *17 Shrawan* for 31 Jul 2026 where the correct offset
  (16 Jul = 1 Shrawan) makes it the **16th**. `lib/bs.ts` is now the single engine; the
  date pill, the mini-calendar and the Calendar page all read it, and nothing
  hand-writes a BS date. Verified in the browser: pill and calendar agree.
- **`Calendar.md` §4.1** — columns are generated from a range, never hand-listed. Checked
  in the browser: seven days, seven unique column headers.
- **`Calendar.md` §4.3** — one `today` per render, so the marker and the summary cannot
  disagree.
- **`Documents.md` §5** — document lifecycle is not record state. `Paid` is a *record*
  state and never a document status; they are separate columns.
- **`Documents.md` §6** — no recycle bin. The row menu ends in Archive; there is no Delete.
- **`Payments.md` §2/§4/§5** — one P&L chain (Net Profit is derived once, not stated
  twice), payment methods **assert** that they reconcile to Received, and `Partial` is an
  invoice status only. All three are runtime assertions, not typed-in numbers.
- **Nav: `Documents` appeared twice.** `Documents.md` v2.1 is titled **"Finance →
  Documents"**, so top-level section 09 and the `Finance › Documents` child were the same
  screen reached two ways — the same shape as the Integrations duplication. `/finance/documents`
  now redirects to `/documents`; `TODO(decision)` on whether to keep the top-level entry.
- ⛔ **The Packing render had eight defects its own spec lists.** `Packing Workflow.md`
  §0 "Found in the screen" catalogues them, so the screen was built from the corrections,
  not copied:
  · bundle tree summed to **25** on an 18-item booking → groups are now **derived** from
    the unit list and asserted, so the invariant cannot be violated by editing data
  · Booking Status read `Confirmed` at 100% packed → first pack sets `Preparing`,
    completion sets `Ready` (§12)
  · Outstanding read Rs 58,548 → the reference case is **Rs 1,24,506**
  · header carried `←`, Save Draft, Complete Packing **and** `✕` → one exit and one
    primary, both in the footer (§3, §11)
  · no Evidence panel and no Evidence column → both present (§9, §6)
  · footer had Previous / Next → neither exists; Packing is the first operation (§11)
  · dark-mode primary rendered green → **blue in both themes**, verified
    `rgb(59,130,246)` in dark against the app's gold `#d8a93a` (§13)
- **Operations menu is stage-gated (§4.2).** Packing is a live link at Confirmed;
  the other four are visible, greyed, and name the reason on hover. §4.1 also makes the
  primary stage-driven — at stages 2–9 Operations *is* the primary and Confirm disappears.
- ⛔ **New Rental was built as a wizard.** `Booking Workflow.md` v2.3 §2/§3/§19 states
  **"the five sections are not a wizard"**, and §0 lists *"'Previous' implying a wizard"* as
  a defect it corrected. Rebuilt as the Booking Workspace: five collapsible sections
  workable in any order, no Back/Next, exactly one Confirm. Verified in the browser —
  5 sections, 1 Confirm button, no Previous/Back/Next anywhere.
- ⛔ **The booking's money was wrong in three different ways.** `§10.2` is the reference
  case for BK-2026-0715 and says *"any screen showing different figures for this booking is
  wrong"*. Three sources disagreed; the arithmetic settled it:
  · render `05AFD275` — Total 1,39,505 · Paid 15,000 · Outstanding 93,548 (impossible)
  · Foundation §02 — discount 9,558 on a 1,32,750 subtotal **labelled 7%**, but 9,558 is 7.2%
  · **§10.2 (used)** — 9,293 · 1,23,457 · 16,049 · 1,39,506 · 1,24,506, exactly 7% rounded
    half up at each step per §10.1
  `data/booking.ts` now recomputes the chain and asserts against §10.2, so it cannot drift.
- ⛔ **The sidebar did not navigate at all.** Every nav link was an `<a href>` with
  `onClick={e => e.preventDefault()}`, so clicking a section or child did nothing. It went
  unnoticed because the browser checks drove routes with `history.pushState`, which
  bypasses click handlers entirely. Now real router `<Link>`s — **re-verified by clicking
  all 15 sections and all 21 child links**, not by pushState.
- **`All Clients` and `Memberships` pointed at the same screen** — `All Clients` used
  `/clients`, which redirects to the first built child. It now has its own `/clients/all`.
- **Sidebar bug:** the open section was set once on mount, so navigating to a child of a
  *collapsed* section landed on the right screen with nothing highlighted — the nav
  silently lost your place. Now re-opens the owning section on route change, while a
  manual collapse still sticks. Verified both ways in the browser.
- **`04 Operations/README.md`** — every queue *is* a Foundation stage, typed to the `Stage`
  union, so the queue list cannot drift from the workflow. The screen is warehouse-facing
  and therefore shows no money at all.

---

## Shared kit — build on this, don't re-invent

| Module | Gives you |
|---|---|
| `data/nav.ts` | the 15-section tree, branch card, footer note text |
| `components/shell/Sidebar.tsx` | Generation C sidebar, auto-expands the owning section |
| `components/shell/Header.tsx` | breadcrumb + centred search + chrome; takes `actions` |
| `components/ui/Page.tsx` | `Card` · `PageHeader` · `Button` · `KpiStrip` · `Rail` · `SummaryRows` · `FooterNote` |
| `components/ui/Charts.tsx` | `Donut` · `Legend` · `LineChart` · `GroupedBars` · `HBars` |
| `lib/status.ts` | `STATUS` (lifecycle → bg/fg), `BRAND` (fills), `BRAND_TEXT` (coloured text) |

### Chart colour is settled — do not pick hues per screen

`--cat-1…8` in `theme.css` are a **validated categorical ramp**, light and dark
each checked against their own card surface (lightness band, chroma floor,
adjacent CVD separation, normal-vision floor, 3:1 contrast — all pass; worst
adjacent pair ΔE 10.1 deutan). They are assigned **in fixed order and never
cycled**; a 9th series folds into "Others" at the data layer. Reordering them
silently breaks the CVD result.
