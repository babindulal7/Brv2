# Settings

**Status: Partial**

Route `/settings` · `src/modules/settings/Settings.tsx` · 630 lines
(mounted at `src/App.tsx:591-598`, inside `Shell`)

Panes read by this doc, all traced in full:
`src/modules/settings/sections/shared.tsx` (819) ·
`src/modules/settings/sections/BranchesWarehouses.tsx` (1,316) ·
`src/modules/settings/sections/Financial.tsx` (221) ·
`src/modules/settings/sections/System.tsx` (175) ·
`src/modules/settings/sections/UsersRoles.tsx` (152) ·
`src/modules/settings/sections/Organisation.tsx` (90) ·
`src/modules/settings/sections/index.ts` (30) ·
`src/modules/settings/useSettingsLoad.ts` (82) ·
`src/lib/settingsStore.ts` (396) · `src/data/settings.ts` (872)

---

## 1. What it is

A four-tab shell (`src/data/settings.ts:131-136` — Business · People · Branches · System) over
twenty registry-backed settings that persist to **browser localStorage**
(`src/lib/settingsStore.ts:314` prefix `br.settings.`, written at `src/lib/settingsStore.ts:371-378`),
plus a branch/warehouse directory built entirely from a seed array (`src/data/settings.ts:283-337`).
No query file, no Supabase table and no `src/actions/*` dispatch is reached by
`src/modules/settings/Settings.tsx` or any of its six section files — the page's own edit-mode
banner states this: *"No `settings` table is connected yet"* (`src/modules/settings/Settings.tsx:594-596`).

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Element | Where |
|---|---|---|
| 1 | `PageHeader` — icon `settings`, title "Settings", description, `actions` | `Settings.tsx:563-568` |
| 2 | Header actions on the **Branches** tab: inert `Import` span + `NotBuilt` badge · `Export` button · `Add Branch` primary button | `Settings.tsx:239-255` |
| 3 | Header actions on every other tab: `Edit settings` (Owner only) → becomes `Done` / `Discard` / `Reset to defaults` while editing · `Export config` · `View audit log` link to `/admin/audit` | `Settings.tsx:256-313` |
| 4 | `ErrorBanner` "Unsaved changes." — only when leaving edit mode with dirty fields | `Settings.tsx:571` |
| 5 | Edit-mode notice: "Changes save to this browser… No `settings` table is connected yet" | `Settings.tsx:578-598` |
| 6 | `ErrorBanner` "Seed data does not reconcile" — only when `SEED_ERRORS` is non-empty | `Settings.tsx:604-615` |
| 7 | Body: 3-column CSS grid `208px | minmax(0,1fr) | auto` | `Settings.tsx:471-478`, `TAB_COLUMN_WIDTH` at `:108` |
| 7a | Left: vertical tab column, `position: sticky`, icon + label per tab | `Settings.tsx:479-502` |
| 7b | Centre: the panel (below) | `Settings.tsx:320-343`, rendered `:546` |
| 7c | Right: `<Rail label="Settings summary">` | `Settings.tsx:553` |
| 8 | `FooterNote` with `Data as of <BS> · <AD>` | `Settings.tsx:209-210`, `:619` |

### The panel, per tab

**Business** (`Settings.tsx:327-339`)
- `SectionCards(ORGANISATION_SECTIONS)` — card **General** (Organisation name, Branch, VAT number, Business description) and card **Languages & Localization** (Calendar mode, Language, Timezone, Week starts, Number format, Units). `Organisation.tsx:26-90`.
- Then, **only when money is visible**, `FinancialPane` (`Financial.tsx:154-221`): cards **Tax & fiscal year** (5 rows), **Currency & terms** (6 rows), **Booking rules** (1 row), **Deposit by category** → `NotTrackedYet`, **Membership matrix** → 4-column table + Law 10 note, **Cancellation fee tiers** → `NotTrackedYet`.

**People** (`Settings.tsx:326` → `UsersRoles.tsx:40-152`)
- **Permissions Matrix** card: 8 capability rows × 9 role columns, each cell calling `lib/rbac` live (`UsersRoles.tsx:29-38`, `:67`).
- **Roles** card: 9 rows with a "Sees money" / "Money-blind" chip and an "External" chip for non-staff (`:95-120`).
- **Branch managers** card: one row per seeded branch, closing with "How many staff accounts exist is not tracked yet — there is no user query in this build" (`:142-146`).

**Branches** (`Settings.tsx:321-324` → `BranchesWarehouses.tsx:331-1022`)
- A two-button `role="tablist"`: *Branches & warehouses* / *Warehouse management* (`:484-512`).
- *Warehouse management* mounts `src/modules/inventory/Warehouses.tsx` whole, under a paragraph linking `/inventory/warehouses` (`:514-525`).
- *Branches & warehouses*: `KeyFigures` strip (4 tiles, 6 with money) (`:387-461`, `:528`) → branch card grid (`:531-621`) → optional **Branch Profile** card for the focused branch (`:624-670`) → **Branches & warehouses** card with search box, status `<select>`, Export CSV, then the expandable table (`:752-859`) or card rows below 768 (`:735-751`), a pagination footer (`:861-915`) and two `OpenDecision` lines (`:917-920`) → analytics grid: **Equipment Summary** donut (`:925-937`), **Inventory Transfers** (`:939-960`), **Branch Performance** money-only (`:964-1005`).
- `AddBranchModal` when open (`:1019`, component `:1051-1196`).

**System** (`Settings.tsx:341-342` → `System.tsx:50-175`)
- Seven cards: **Appearance** (Theme, Text size, Density), **Notifications** (4 toggles), **System preferences** (Date format, Decimal places, Session timeout), **Operations rules** (5 registry settings), **Administration** (6 route links, `System.tsx:41-48`), **Access** (2FA toggle, Password policy, Screen-lock toggle), **Controls & logs** (Data access levels → People tab, Audit trail → `/admin/audit`).

### The rail

- Branches tab → `BranchesRail` (`BranchesWarehouses.tsx:1200-1316`): **Branch Summary** (`SummaryRows`, money rows first when visible), **Alerts** (5 seeded counts), **Quick Actions** (4 tiles), **Recent Activity** (4 seeded entries).
- Every other tab (`Settings.tsx:349-363`): a plain disclaimer card — *"The theme and text-size selectors are live and persist. The other controls are presentational — they do not save yet"* — then **Org-wide policy** and **System Summary**.

### Responsive bands the file actually reads

`Settings.tsx:130` calls `useViewport()` from `src/lib/device.ts`, which reads **both** locked
breakpoints: `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`, bands at `:45-51`).

| Band | What changes |
|---|---|
| **≥1180** (`desktop`) | 3-column grid; sticky tab column; `<Rail>` as a third column (`Settings.tsx:474`, `:479-502`, `:553`) |
| **768–1179** (`tablet`) | Single column (`:474`); the tab column becomes a horizontal `role="tablist"` strip with `overflowX:auto` using `TAB_SHORT_LABEL` (`:503-537`); an `<h2>` tab title is added (`:541-545`); the rail's children reflow **below** the panel, not into a handle (`:550`) |
| **<768** (`phone`) | With no reachable `?tab=`: a full-screen list of tab rows with icon, label and `TAB_SUMMARY` (`:397-431`). With one: breadcrumb `Settings ›` + the single panel + rail beneath (`:437-465`). The header's Edit / Import / Export / Add Branch controls are suppressed on the list (`:238`, `:262`) |

Inside the Branches pane, `BranchesWarehouses.tsx:347` calls `useTabularLayout()`
(`device.ts:139-141`), which is the **768** band only: at/above it the branch table renders, below it
`BranchCardRow` cards render instead (`BranchesWarehouses.tsx:735-751`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| The 20 editable setting values (org name, VAT no., VAT rate, crew fee, payment terms, on-stop days, late-payment %, session timeout, password policy, density, date format, decimals, week start, language, 5 operations rules, business description) | LOCAL | **Browser `localStorage`, not the corpus.** `src/lib/settingsStore.ts:81-301` declares the specs, `:330-368` reads, `:371-378` writes, key prefix `br.settings.` at `:314`. `src/lib/mock/corpus.ts:405-423` serves 13 tables and **no `settings` table**; it is not in `UNSERVED` either (`corpus.ts:33-44`) — it is simply absent, i.e. UNSERVED and unlisted |
| Loading / error / ready state around those values | LOCAL | `src/modules/settings/useSettingsLoad.ts:43-82` — `readSettings()` in a `useEffect`, `applyLanguage()` awaited before `ready` |
| Theme selector | LOCAL | `useTheme().setMode` via `src/lib/theme.tsx`, wired at `sections/shared.tsx:472`, `:547` |
| Text size selector | LOCAL | `src/lib/textSize.ts:32-45` — `localStorage` key `br-text-size`, applied to `--ui-scale` |
| "Allow overbooking" toggle | LOCAL | `src/lib/bookingRules.ts:24-38` — `localStorage` key `br.bookingRules.allowOverbooking`, wired at `shared.tsx:477`, `:565-590` |
| Branch list, codes, cities, managers, phones, staff, equipment, revenue, utilisation, growth | SEED | `src/data/settings.ts:283-337` (`BRANCHES`), read into page state at `Settings.tsx:139` |
| Group KPIs (branches, active, warehouses, staff, equipment, revenue, mean utilisation, growth) | SEED | Derived by `totalsOf()` at `src/data/settings.ts:363-376` over the same array |
| Equipment Value / Monthly Profit rail + KPI figures | SEED | `src/data/settings.ts:344-347` (`GROUP_FINANCE`) |
| Warehouses nested under each branch (names, codes, zone counts) | SEED | `src/data/warehouse.ts:180+` (`WAREHOUSES`), joined by `WAREHOUSE_BRANCH_ID` at `src/data/settings.ts:409-419` |
| Equipment Summary donut | SEED | `src/data/settings.ts:449-465` (`EQUIPMENT_MIX` → `equipmentSlices()`) |
| Inventory Transfers stage counts | SEED | `src/data/settings.ts:470-476` (`TRANSFER_STAGES`) |
| Rail "Alerts" counts | SEED | `src/data/settings.ts:492-498` (`BRANCH_ALERTS`) |
| Rail "Recent Activity" | SEED | `src/data/settings.ts:585-590` (`BRANCH_ACTIVITY`) |
| System Summary card (version, DB health, storage used, backup status/times, environment, sessions) | SEED | `src/data/settings.ts:688-699` (`SYSTEM_SUMMARY`); the version line alone is derived from `src/data/nav.ts:428-432` |
| "Branch" row on the General card | SEED | `src/data/nav.ts:407-411` (`BRANCH.address`) |
| Membership matrix table | SEED | Projection of `src/data/membership.ts:274+` (`PLANS`) via `src/data/settings.ts:639-650` |
| Crew coordination fee default | SEED | `src/data/crew.ts:382` (`FEE_PER_CREW_DAY_PAISA` = Rs 1,000), fed into the spec default at `src/lib/settingsStore.ts:108` |
| Permissions Matrix cells (8 × 9) | — computed | Not data. Each cell calls a `src/lib/rbac.ts` predicate live at `UsersRoles.tsx:67`; the file's own claim is "Computed live from lib/rbac — not a copy of it" (`UsersRoles.tsx:45`) |
| Nepali coverage % on the Language row | — computed | `src/lib/i18n.ts:226-237` (`coverage('ne')`), read at `Organisation.tsx:24` |
| Warehouse Management view (inside the Branches tab) | SEED | `src/modules/inventory/Warehouses.tsx:21-47` imports `WAREHOUSES`, `STORAGE_LOCATIONS`, `TRANSFERS`, `EQUIPMENT_DISTRIBUTION` from `src/data/warehouse.ts` |

Note on the `LOCAL` rows above: `LOCAL` is defined for this pack as *served by
`src/lib/mock/corpus.ts`*. Nothing on this page is. Every row marked `LOCAL` is browser
`localStorage` instead, which is a real, reload-surviving write on the operator's own machine and
nothing more — `Settings.tsx:594-596` says so on the page.

**Invented on this page:** every branch figure (3 branches, 28 staff, 2,507 items, Rs 24,86,500
monthly revenue, 92/88/78% utilisation, 18.4/14.2/9.6% growth — `src/data/settings.ts:283-337`);
Equipment Value Rs 3,12,45,600 and Monthly Profit Rs 7,56,300 (`:344-347`); the equipment
distribution split (`:449-455`); the five transfer-stage counts (`:470-476`); the five alert counts
(`:492-498`); the four Recent Activity entries with their names and timestamps (`:585-590`); and the
System Summary's "Healthy", "246.8 GB / 1 TB", "Successful", "Today, 02:15 AM", "Tomorrow, 02:00 AM"
and "Production" (`:688-699`). "Active sessions" alone refuses to be invented and reads "Not tracked
yet" (`:698`).

---

## 4. Actions and writes

**`Settings.tsx` and all six section files dispatch nothing from `src/actions/`.** No
`createAction`, no `ActionContext`, no `permissions:` string appears anywhere under
`src/modules/settings/` except an unrelated prose mention in `Timesheet.tsx:15`. `checkCapability`
(`src/actions/core.ts:124-218`) is therefore never consulted by this page's own controls.

### Writes that actually land

| Control | What it writes | Evidence |
|---|---|---|
| Per-field **Save** in edit mode | `writeSettings(patch)` → `localStorage`, then `patch()` into the loaded record | `Settings.tsx:150-163`; `settingsStore.ts:371-378`; control at `shared.tsx:696-705` |
| Language field save | Additionally awaits `applyLanguage()` — sets `<html lang>`, loads Nepali faces, swaps font vars | `Settings.tsx:158-160`; `i18n.ts:330-347` |
| **Reset to defaults** | `resetSettings()` removes all 20 keys, then `reload()` and `cancelAll()` | `Settings.tsx:290-298`; `settingsStore.ts:391-396` |
| **Theme** light/dark buttons | `setMode(m)` from `useTheme()` | `shared.tsx:540-563` |
| **Text size** Compact/Default/Large | `applyTextSize(key)` → `--ui-scale` + `localStorage` | `shared.tsx:514-539`; `textSize.ts:42-45` |
| **Allow overbooking** switch | `setAllowOverbooking(next)` → `localStorage` | `shared.tsx:565-590`; `bookingRules.ts:35-38` |
| **Export config** | Builds CSV rows and triggers a Blob download | `Settings.tsx:212-231`; `shared.tsx:811-819` |
| **Export** / **Export CSV** (branches) | Same helper, `branchCsvRows()` | `Settings.tsx:233`; `BranchesWarehouses.tsx:103-114`, `:464` |
| **Add branch** (modal) | `setRows([...rows, b])` — React state only, held at `Settings.tsx:139`; the modal states "held for this session only; no backend is connected" | `BranchesWarehouses.tsx:466-475`, `:1159-1162` |

Validation runs before every save: `validateSetting` (`settingsStore.ts:322-328`) throws inside
`writeSettings`, `useEditMode.saveField` catches it and pins the message on the field without
dropping the draft (`useEditMode.ts:196-200`).

### Controls with no handler, or an inert one

| Control | Behaviour | Evidence |
|---|---|---|
| **Import** (Branches header) | A `<span aria-disabled="true">` with a `NotBuilt` badge — no `onClick` at all | `Settings.tsx:240-248` |
| 4 Notification switches, 2FA switch, Screen-lock switch | `Switch` holds its own `useState` and propagates nothing | `shared.tsx:432-459`; rows at `System.tsx:74-77`, `:152`, `:154` |
| Quick Action **Print QR Labels** | `Dest{kind:'none'}` → inert span + `NotBuilt` | `data/settings.ts:787-792`; render `BranchesWarehouses.tsx:1299-1306` |
| Any `Field.readOnlyWhy` row (Branch, Calendar mode, Timezone, Number format, Units, Fiscal year, Default currency, Number grouping, Additional currencies) | Renders as a value with a lock glyph and a reason; never gains an input | `shared.tsx:497-502`, `:609-632` |

### The one dispatch reachable from this page (nested screen)

`Warehouses.tsx` is mounted inside the Branches tab (`BranchesWarehouses.tsx:524`). Its
**Create transfer** button dispatches:

- capability **`inventory.transfer`** — `src/actions/inventory/createStockTransfer.ts:13`
- action file `src/actions/inventory/createStockTransfer.ts`
- **`implemented` is not set**, so it defaults to `false` and `createAction` throws
  `ActionNotImplementedError` before validate, execute, events or audit (`core.ts:222-224`,
  default documented at `:86-89`)
- `checkCapability` **does** map it: `core.ts:202` → `rbac.canWriteFloor` → Owner, Admin, Manager,
  Warehouse (`rbac.ts:92`, `:227-229`)

So: renders, dispatches `CREATE_STOCK_TRANSFER`, action is a stub (`core.ts` fails it closed). The
screen itself documents that outcome at `Warehouses.tsx:694-696`. Its transfer *advance* and
*cancel* buttons were deleted rather than re-pointed — there is no transition action
(`Warehouses.tsx:636-663`, reason string at `:485`).

---

## 5. Gates

**Route reachability.** `/settings` is mounted with no role guard of its own
(`App.tsx:591-598`). `Shell` applies two: an unauthenticated session is redirected to `/login`
(`App.tsx:973-975`), and a money-blind role hitting a *money surface* gets `RestrictedState`
(`App.tsx:993`, `:1019-1021`). `/settings` is **not** in `MONEY_ROUTES`
(`src/data/nav.ts:147-153`), so **all nine roles reach the route** — Owner, Admin, Manager,
Coordinator, Warehouse, Technician, Accounts, Driver, Client.

**Money visibility.** `useCanViewMoney()` at `Settings.tsx:127`
(`src/lib/moneyVisibility.ts:24-27` → `rbac.canViewMoney`, `rbac.ts:36-38`). Money-blind set is
Warehouse, Technician, Driver, Client (`rbac.ts:45-50`); an unidentified session is also money-blind
(`moneyVisibility.ts:26`).

**Hidden under Law 6 — removed, never disabled:**

| Removed for a money-blind session | Evidence |
|---|---|
| The whole `FinancialPane` (tax, currency & terms, booking rules, deposit panel, membership matrix, cancellation panel) | `Settings.tsx:337` |
| Those same rows in the **Export config** CSV | `Settings.tsx:229`; kept out of `FIELD_SECTIONS` for this reason at `sections/index.ts:16-19` |
| KPI tiles *Equipment Value* and *Monthly Revenue* | `BranchesWarehouses.tsx:439-461` |
| The **Revenue (This Month)** table column, its header and its sort key | `BranchesWarehouses.tsx:769`, `:812-816` |
| The Revenue stat on each branch card; the branch card grid drops to 3 columns | `BranchesWarehouses.tsx:586`, `:595` |
| Revenue + Growth rows in the Branch Profile | `BranchesWarehouses.tsx:651-660` |
| The whole **Branch Performance** card | `BranchesWarehouses.tsx:964` |
| Rail rows Monthly Revenue / Monthly Profit / Equipment Value | `BranchesWarehouses.tsx:1214-1220` |
| The Revenue column in the branches CSV — the header is never pushed, so no blank column exists | `BranchesWarehouses.tsx:103-113` |
| The money line on the phone `BranchCardRow` | `BranchesWarehouses.tsx:291-295` |

The tab strip itself filters on `t.money` (`Settings.tsx:177`), but all four `TABS` entries carry
`money: false` today (`data/settings.ts:131-136`), so that filter currently removes nothing —
Law 6 moved down to the section level.

**Edit gate.** `mayEdit = canManageSettings(user?.role ?? 'Client')` (`Settings.tsx:142`), which is
**Owner only** (`rbac.ts:360-362`). A non-Owner gets no Edit button at all rather than one that
refuses on press (`Settings.tsx:261`). Note this is a UI gate over `localStorage`; nothing
server-side enforces it, because nothing server-side is involved.

---

## 6. States drawn

`PageBody` is **not used** on this page. All four states are hand-rolled from `StateViews`:

| State | Present | How |
|---|---|---|
| **Loading** | Yes | `<LoadingSkeleton type="card" label="Loading settings — the stored values, not the defaults…">` — `Settings.tsx:369-375`, component `StateViews.tsx:87-165`. Driven by `useSettingsLoad`'s three-state machine (`useSettingsLoad.ts:30-33`), no timer |
| **Error** | Yes, three of them | (a) the load failure, with `onRetry` → `reload` (`Settings.tsx:378-391`); (b) "Unsaved changes." when `stopEditing()` refuses (`Settings.tsx:571`, refusal at `useEditMode.ts:208-213`); (c) "Seed data does not reconcile" from `SEED_ERRORS` (`Settings.tsx:604-615`, computed `data/settings.ts:816-872`). All via `ErrorBanner` (`StateViews.tsx:171-210`) |
| **Empty** | Partly — hand-rolled, not `EmptyState` | Only inside the Branches table: "No branch matches this search." as a centred `<p>` below 768 (`BranchesWarehouses.tsx:746-750`) and as a full-width `<td>` at table width (`:849-855`). Also "No warehouse joins this branch yet." for an expanded branch with no children (`:835-841`) and its card-mode twin (`:298-300`). No `EmptyState` component anywhere on this page |
| **Restricted** | **None** | The page never renders `RestrictedState`. Every role reaches it (§5); the only restriction is the Owner-only Edit button, which is an absence rather than a state |

---

## 7. Known gaps

1. **"View audit log" opens Audit *Settings*, not the Audit Log.** `Settings.tsx:309-312` links to
   `/admin/audit`, which `App.tsx:602-609` mounts as `AuditSettings` under the crumb "Immutable Audit
   Trail". The actual Audit Log is `/admin/audit-log` (`App.tsx:651-658`) and the System tab links to
   it correctly (`System.tsx:42`). Two controls with the same words go to different screens.

2. **Same defect in the rail.** `BranchesWarehouses.tsx:1312` passes `moreDest = /admin/audit` under
   the label "View all activity logs" (`shared.tsx:775`). The Activity Log is `/admin/activity-log`
   (`System.tsx:43`, `App.tsx:660-667`).

3. **Six switches persist nothing.** `Switch` is pure local `useState` (`shared.tsx:432-459`), used
   by Return reminders, Payment reminders, Low stock alerts, Daily digest (`System.tsx:74-77`),
   Two-factor authentication (`System.tsx:152`) and Shared-device screen lock (`System.tsx:154`).
   Toggling one and reloading loses it silently. The page states this in the rail
   (`Settings.tsx:350-353`) but the controls themselves carry no marker.

4. **Import is a dead control with a reason, not a control.** `Settings.tsx:240-248` — no handler;
   `IMPORT_WHY` at `:235`.

5. **Theme and Text size export as `—`.** Both rows carry `value: '—'` (`System.tsx:56`, `:61`)
   because `FieldRow` special-cases them by label (`shared.tsx:513`, `:540`). `fieldValue()` has no
   such special case and returns `f.value` (`shared.tsx:716`), so the Export config CSV reports `—`
   for the two settings on this page that most reliably persist.

6. **On a phone, a legacy `?tab=` key is dropped, not translated.** `Settings.tsx:188` translates
   `financial`/`security`/`users`/… through `LEGACY_TAB` (`data/settings.ts:146-157`), but
   `onPhoneList` at `Settings.tsx:192` tests `raw` against the *live* tab keys only. So
   `/settings?tab=financial` on a phone renders the section list, contradicting the comment two lines
   above it that a retired key "is TRANSLATED … rather than dropped on the default"
   (`Settings.tsx:180-187`).

7. **The branch card grid ignores the filter the KPIs report on.** The KPI strip and the table read
   `filtered` / `shown` (`BranchesWarehouses.tsx:373`, `:377`), and the Total Branches tile even
   captions itself "Matching this filter" (`:393`). The card grid above it maps `rows`
   (`:532`) and the Branch Performance table maps `rows` (`:976`) — both unfiltered. A status filter
   changes the count while the cards below it do not move.

8. **Add Branch is session-only.** `BranchesWarehouses.tsx:466-475` mutates React state held at
   `Settings.tsx:139`; the modal says so at `:1159-1162`. Reload loses the branch, its KPI
   contribution and its CSV row.

9. **`TODO(decision)` markers surfaced on this page.**
   - Storage vocabulary — `data/settings.ts:432-440`, rendered `BranchesWarehouses.tsx:918`.
   - Is `wh-04` "Bhaktapur Heavy Grip & Rigging" a fourth branch or a fourth warehouse —
     `data/settings.ts:395-401`, rendered `BranchesWarehouses.tsx:919`.
   - The join map lives in `data/settings.ts` because `data/warehouse.ts` belongs to another pass;
     "two sources describe one relationship" — `data/settings.ts:402-407`.
   - Deposit % per gear category — `data/settings.ts:659-663`, rendered `Financial.tsx:160`.
   - Cancellation fee tiers — `data/settings.ts:668-673`, rendered `Financial.tsx:217`.
   - Whether "Allow overbooking" should be global or Owner/Admin-only — `bookingRules.ts:17-21`;
     the switch on this page is the global reading.
   - Business registration number / primary warehouse / created date omitted rather than invented —
     `data/settings.ts:219-223` (that card is no longer rendered here, see 11).

10. **A stale cross-file claim.** `data/crew.ts:374-381` still records `FEE_PER_CREW_DAY_PAISA` as
    "declared **twice** — here at Rs 1,000 … and again at `data/settings.ts:8` at Rs 500". The
    duplicate is gone: `data/settings.ts:11-19` records the deletion and the file exports no such
    constant. `settingsStore.ts:108` derives the default from `data/crew.ts` alone. The comment
    describes a hazard that no longer exists.

11. **Dead exports that `data/settings.ts` itself forbids.** `data/settings.ts:719-732` removes
    `QUICK_ACCESS`, `MODULE_GROUPS` and `RAIL_ACTIONS` on the stated rule that "an exported list
    nothing renders is read by the next person as a live surface". Six exports in the same file are
    in exactly that state — `ORG` (`:210`), `ORG_FIELDS` (`:224`), `SYSTEM_ALERTS` (`:549`),
    `ADMIN_ACTIVITY` (`:576`), `SYSTEM_STATS_UNAVAILABLE` (`:713`), `SYSTEM_QUICK_ACTIONS` (`:749`).
    Their only consumer is `src/archive/SettingsOverview.tsx`, which `App.tsx` does not route.

12. **A stale line citation in the page's own comment.** `Settings.tsx:258-259` says
    "`settings.manage` is Owner-only (`rbac.ts:91`)". `rbac.ts:91` is a comment terminator; the rule
    is `canManageSettings` at `rbac.ts:360-362`.

13. **A rejected stored value reverts an operations rule with only a `console.warn`.**
    `settingsStore.ts:356-364` discards a value that fails validation and substitutes the default.
    The file's own note (`:338-355`) states the consequence: availability can loosen and "nothing
    anywhere says so". Nothing on this page surfaces that warning.

14. **`Warehouses.tsx` is mounted whole inside a Settings tab** (`BranchesWarehouses.tsx:524`),
    bringing its own `PageHeader`, rail, footer and 2,210 lines of unrelated surface — including the
    stub dispatch documented in §4 and its own `SEED_ERRORS` banner. Its state, filters and view are
    not shared with the branch list beside it.
