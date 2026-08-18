# Backup & Restore

Route `/admin/backup` · `src/modules/admin/BackupRestore.tsx` · 835 lines

Mounted at `src/App.tsx:678-685` inside `<Shell crumbs={[{ label: 'Settings' }, { label: 'Backup & Restore' }]}>`, lazy-loaded at `src/App.tsx:41`. A second URL resolves here: `/tools/backup` is a `replace` redirect to this path (`src/App.tsx:135`). The route is listed in the `BUILT` set (`src/App.tsx:752`). One child component, `src/modules/admin/SystemRestoreModal.tsx` (386 lines), is imported at `src/modules/admin/BackupRestore.tsx:7`.

**Status: Seed-only.**

---

## 1. What it is

A backup dashboard and a restore console. Every number, row, name, percentage and timestamp it draws is a hand-written constant in `src/data/backup.ts` (imported as 16 named exports at `src/modules/admin/BackupRestore.tsx:12-30`); the file imports no query module, no `supabase` client and nothing from `src/actions/` (its complete import list is `src/modules/admin/BackupRestore.tsx:1-30`).

Two controls are genuinely live for an Owner and neither performs a write: the row Download handler sets an error banner saying nothing was fetched (`src/modules/admin/BackupRestore.tsx:185-194`), and Start Restore / row Restore open a five-step confirmation dialog whose only terminal state is a stated failure (`src/modules/admin/SystemRestoreModal.tsx:243-291`).

The file's own header documents four protections layered on top of the wireframe — Owner-only, 2FA, sandbox-by-default, mandatory checkpoint (`src/modules/admin/BackupRestore.tsx:109-164`). Three of the four are real UI; the 2FA check and the checkpoint are not (§7 items 4 and 5).

## 2. What renders

Top to bottom at desktop:

1. **`PageHeader`** — icon `box`, title "Backup & Restore", description "Protect your data with automated backups and restore with confidence." (`src/modules/admin/BackupRestore.tsx:198-234`; component at `src/components/ui/Page.tsx:66-108`). Four header buttons, all `disabled` and each wrapped in `Unavailable` with its own reason: Back up now, Restore, Export, Refresh (`src/modules/admin/BackupRestore.tsx:206-231`; `Unavailable` at `src/components/ui/Unavailable.tsx:35-164`).
2. **Download error banner** — rendered only when `downloadError` is set (`src/modules/admin/BackupRestore.tsx:238-240`; `ErrorBanner` at `src/components/ui/StateViews.tsx:171-210`).
3. **`KpiStrip`, `columns={6}`** — Total Backups, Latest Backup, Backup Size, Success Rate, Restore Points, Backup Health (`src/modules/admin/BackupRestore.tsx:253`; data `src/data/backup.ts:6-13`; component `src/components/ui/Page.tsx:203-304`).
4. **Two-up row** (`src/modules/admin/BackupRestore.tsx:255`):
   - **Backup Overview** — a fixed `repeat(4, minmax(0,1fr))` tile grid over 8 entries, each an icon in a category colour, a label and a value (`src/modules/admin/BackupRestore.tsx:256-296`; `catColor` at `src/components/ui/Charts.tsx:29-31`).
   - **Backup Schedule** — a 5-column table (Name · Frequency · Time · Next Run · Status), 6 rows, `minWidth: 460` inside an `overflowX: auto` box (`src/modules/admin/BackupRestore.tsx:298-325`).
5. **Two-up row, `minmax(0,1.55fr) minmax(0,1fr)`** (`src/modules/admin/BackupRestore.tsx:328`):
   - **Backup History** — a 10-column table, `minWidth: 880`, 8 rows: Backup ID · Type · Started (BS / AD) · Completed (BS / AD) · Duration · Size · Destination · Status · Created By · actions (`src/modules/admin/BackupRestore.tsx:329-403`). BS renders above AD in the two date cells (`:359-366`). The actions cell holds Download, Restore and an inert `⋮` (`:376-398`). Below the table, a caption "Showing 1 to 8 of 1,248 backups" and a 7-button pager (`:404-432`).
   - **Restore Center** — a two-column body (`:443`): a "Restore What?" radio fieldset over 9 scopes (`:444-455`); a "Restore From" dropdown button (`:459-479`), a restore-point card (`:481-499`) and three "Restore Options" checkboxes (`:501-514`). Then **Start Restore** — a live danger button for an Owner (`:525-545`), an inert lock-icon span inside `Unavailable` for anyone else (`:547-567`) — and the sentence "Sandbox is the default target. A pre-restore checkpoint is taken first, and it is not optional." (`:569-571`).
6. **Two-up row, same 1.55/1 split** (`src/modules/admin/BackupRestore.tsx:575`):
   - **Cloud Storage & Destinations** — 6 tiles in a fixed `repeat(3, …)` grid, each with a name, an optional "Primary" pill, a used-of-total line, a `Meter` bar and a right-aligned percentage (`:576-602`; `Meter` at `:76-87`).
   - **Integrity & Verification** — a `Donut` (Passed / Warning / Failed) with `centreValue` "1,248" beside a `Legend` (`:604-616`; components at `src/components/ui/Charts.tsx:81-151` and `:154-`).
7. **Backup Analytics (This Month)** — a fixed `repeat(6, minmax(0,1fr))` grid: 5 metric cells (label, value, delta with arrow, 12-point `Spark` polyline) plus a sixth cell holding a small Cloud Usage donut and legend (`src/modules/admin/BackupRestore.tsx:619-650`; `Spark` at `:89-107`).
8. **`Rail`** (right column) — four cards: Backup Summary (`SummaryRows` + a `Meter pct={83}`) at `:654-657`; Alerts, 5 rows at `:659-676`; Quick Actions, 4 inert tiles each wrapped in `Unavailable` at `:678-724`; Recent Activity, 5 rows at `:726-746`. A comment at `:748-757` records that the render's "AI Backup Advisor" card was removed under Law 16.
9. **`SystemRestoreModal`** — rendered only when `restoreFor` is non-null (`src/modules/admin/BackupRestore.tsx:767-774`).
10. **`FooterNote`** with the extra "Backups are encrypted at rest and in transit" (`:776`; component `src/components/ui/Page.tsx:443-469`).

### Responsive bands

The file reads viewport through `useViewport()` (`src/modules/admin/BackupRestore.tsx:166`), whose bands are `phone < 768`, `tablet < 1180`, `desktop` (`src/lib/device.ts:43-51`).

**It reads both 1180 and 768, once each.**

- **1180** — the page grid's tracks: `viewport === 'desktop' ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)'` (`src/modules/admin/BackupRestore.tsx:247`). Below 1180 the rail track is dropped, so the rail element becomes a second grid row.
- **768** — the Overview/Schedule row: `viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)'` (`src/modules/admin/BackupRestore.tsx:255`).

Two more responses arrive from imported components, not from this file:

- `KpiStrip` clamps the requested 6 columns to 3 at tablet and 2 at phone (`src/components/ui/Page.tsx:210-212`).
- `Rail` is `CollapsibleAside` (`src/components/ui/Page.tsx:315-331`), which defaults to **collapsed at phone and tablet** (`src/components/ui/CollapsibleAside.tsx:37`), i.e. the four rail cards reduce to a 44px expand handle below 1180 rather than reflowing. The page comment at `src/modules/admin/BackupRestore.tsx:245-247` asserts the opposite. See §7 item 3.

Six other grids carry **no** viewport branch and keep their desktop column count at every width: `:264` (`repeat(4, …)`), `:328` and `:575` (`minmax(0,1.55fr) minmax(0,1fr)`), `:443` (`1fr 1fr`), `:584` (`repeat(3, …)`), `:620` (`repeat(6, …)`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| KPI strip (6 cards) | SEED | `KPIS` — `src/data/backup.ts:6-13`. "1,248", "486 GB", "99.8%", "156" are literals |
| Backup Overview (8 tiles) | SEED | `OVERVIEW` — `src/data/backup.ts:15-24` |
| Backup Schedule (6 rows) | SEED | `SCHEDULE` — `src/data/backup.ts:26-33`. The Status pill is not in the data; every row prints a hard-coded "Enabled" (`src/modules/admin/BackupRestore.tsx:318`) |
| Backup History (8 rows) | SEED | `HISTORY: BackupRow[]` — `src/data/backup.ts:49-58`. Includes the hand-typed BS strings (`startedBs`, `completedBs`) and the operator names "Ramesh Dulal" / "System" |
| History pager caption + buttons | SEED | literals `'Showing 1 to 8 of 1,248 backups'` and `['‹','1','2','3','…','156','›']` written inline (`src/modules/admin/BackupRestore.tsx:405, 407`) |
| Restore What? (9 radios) | SEED | `RESTORE_SCOPES` — `src/data/backup.ts:60-70` |
| Restore From card | SEED | `RESTORE_POINT` — `src/data/backup.ts:78-83`. One object; the dropdown above it cannot change it |
| Restore Options (3 checkboxes) | SEED | `RESTORE_OPTIONS` — `src/data/backup.ts:72-76`; initial checked state seeded from `o.on` (`src/modules/admin/BackupRestore.tsx:169`) |
| Cloud Storage & Destinations (6 tiles) | SEED | `DESTINATIONS` — `src/data/backup.ts:85-92`, including every `pct` the `Meter` colours by |
| Integrity donut + legend | SEED | `INTEGRITY` / `INTEGRITY_TOTAL` — `src/data/backup.ts:94-99` |
| Cloud Usage donut | SEED | `CLOUD_USAGE` — `src/data/backup.ts:101-107` |
| Backup Analytics (5 cells + sparklines) | SEED | `ANALYTICS` — `src/data/backup.ts:109-115`; every `points` array is a hand-written 12-number series |
| Backup Summary rows | SEED | `SUMMARY` — `src/data/backup.ts:117-122` |
| Backup Summary meter | SEED | the literal `83` written at the call site (`src/modules/admin/BackupRestore.tsx:656`) |
| Alerts (5 rows) | SEED | `ALERTS` — `src/data/backup.ts:124-130` |
| Quick Actions (4 tiles) | SEED | `QUICK_ACTIONS` — `src/data/backup.ts:132-137` |
| Recent Activity (5 rows) | SEED | `ACTIVITY` — `src/data/backup.ts:139-145` |
| Footer note bar | SEED | `FOOTER_NOTE` — `src/data/nav.ts:428-432`, via `src/components/ui/Page.tsx:444` |

**No DB row and no LOCAL row on this page** — but the table exists. `backup_logs` is created at `supabase/migrations/0007_admin_security.sql:294-313` (`backup_no`, `backup_type`, `status`, `storage_location`, `file_size_bytes`, `checksum_sha256`, `started_at`, `completed_at`, `initiated_by`, `error_message`), has RLS enabled at `supabase/migrations/0007_admin_security.sql:433`, carries a SELECT policy for Owner and Admin at `supabase/migrations/0031_cleaning_and_comms_policies.sql:164-173`, has update/delete reject triggers at `supabase/migrations/0046_law4_payment_and_audit_immutability_backstops.sql:120-126`, and is present in the generated types at `src/types/supabase.ts:340-355`. Nothing in `src/lib` mentions it (a `backup` search across `src/lib` returns no file). The mock corpus does not serve it either: `buildCorpus()` covers 13 tables and names its gaps in `UNSERVED` (`src/lib/mock/corpus.ts:22-44`), which does not list `backup_logs` — so in mock mode the table is **UNSERVED and unlisted**.

Invented on this page: every figure on the screen. The 1,248 total backups, 486 GB size, 99.8% success rate, 156 restore points and "Healthy" status; all 8 backup history rows with their IDs, BS and AD timestamps, durations, sizes, destinations and operator names; the 6 schedule rows and their next-run times; the 6 storage destinations and their fill percentages; the 1,242/4/2 integrity split; the 5 analytics values, their month-over-month deltas and all 60 sparkline points; the 83% storage figure; the 5 alerts and the 5 recent-activity entries.

## 4. Actions and writes

**No dispatch. No write. No import from `src/actions/`** — the complete import list is `src/modules/admin/BackupRestore.tsx:1-30` and `src/modules/admin/SystemRestoreModal.tsx:1-4`. `checkCapability` (`src/actions/core.ts:124-218`) is therefore never consulted by this page, and no capability string reaches it. A `backup`/`restore` search across `src/actions/` returns no file, so there is no action to map a capability to.

Every interactive control on the page:

| Control | Handler | Effect |
|---|---|---|
| Header: Back up now / Restore / Export / Refresh | none — `disabled` `Button`s inside `Unavailable` (`:206-231`) | nothing; each states a reason on hover, or long-press where `!hasHover` (`src/components/ui/Unavailable.tsx:70-77`) |
| Error banner "Retry" | `onRetry={() => setDownloadError(null)}` (`:239`) | clears the banner. The label is "Retry" (`src/components/ui/StateViews.tsx:203-207`) but nothing is retried |
| Row Download (Owner only) | `requestDownload(b.id)` (`:383`, body `:185-194`) | sets `downloadError` state. No fetch, no file, no network call |
| Row Restore (Owner only) | `setRestoreFor({ id, kind })` (`:390`) | opens `SystemRestoreModal` |
| Row `⋮` | none — inert `<span>` inside `Unavailable` (`:392-396`) | nothing |
| Row Download / Restore for a non-Owner | none — inert `<span>` inside `Unavailable` (`src/modules/admin/BackupRestore.tsx:818-825`) | nothing; states the Owner-only reason |
| Pager `‹ 1 2 3 … 156 ›` (7 buttons) | **none** — `<button type="button">` with no `onClick` (`:407-430`) | nothing |
| "Select backup or restore point" | **none** — `<button type="button">` with no `onClick` (`:459-479`) | nothing |
| "Restore What?" radios | `onChange={() => setScope(s)}` (`:451`) | local `useState` (`:168`); read only at `:452` and `:528` |
| "Restore Options" checkboxes ×3 | `onChange` → `setOpts` (`:510`) | local `useState` (`:169`); read only to render its own checkbox at `:509`. Never passed to the modal |
| **Start Restore** (Owner only) | `setRestoreFor({ id: RESTORE_POINT.id, kind })` (`:528`) | opens `SystemRestoreModal` |
| Start Restore (non-Owner) | none — inert `<span>` inside `Unavailable` (`:547-567`) | nothing |
| Quick Actions ×4 | none — inert `<span>`s inside `Unavailable` (`:688-722`) | nothing |
| Card action links ×7 — "View all types →", "View all backups →", "Learn more →", "Manage →", "View logs →", "View all →" ×2 | none — `<span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">` (`:259-261, 332-334, 438-440, 579-581, 607-609, 662-664, 729-731`) | nothing; styled `var(--link)` so they read as links |

Inside `SystemRestoreModal` (`src/modules/admin/SystemRestoreModal.tsx`):

| Control | Handler | Effect |
|---|---|---|
| Sandbox / Production radios | `setTargetEnv` (`:121, 129`) | local state; sandbox preselected (`:54`) |
| "Proceed to Checkpoint" | `handleNext` (`:137`) | step 1 → 2 |
| step 2 → 3 | `setTimeout(…, 2000)` (`:74-77`) | no write; nothing is snapshotted |
| 2FA input + "Verify Identity" | `setAuthCode` (`:164`), `handleNext` (`:180`) | step 3 → 4. `authCode` is compared to nothing but its own length |
| Typed-name input + "Execute Restore" | `setConfirmText` (`:199`), enabled on `confirmText.trim() === restorePointId` (`:216`) | step 4 → 5 |
| step 5 → 6 | `setTimeout(…, 2500)` (`:78-81`) | no restore call; lands on the failure state (`:243-291`) |
| Cancel / Close / header ✕ | `onClose` (`:215, 288, 342`) | closes the dialog |

Buttons with no handler: the 7 pager buttons (`:407-430`) and the "Select backup or restore point" dropdown (`:459-479`). Inert non-buttons that look pressable: 4 header buttons, 4 Quick Action tiles, the row `⋮`, and 7 card-action links.

## 5. Gates

**Route reach.** `Shell` refuses the route for any role where `!canViewMoney(role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` contains the bare prefix `'/admin'` (`src/data/nav.ts:147-153`) and `isMoneySurface` matches `path === r || path.startsWith(r + '/')` (`src/data/nav.ts:156-159`), so `/admin/backup` **is** a money surface.

- Reach the page: **Owner, Admin, Manager, Coordinator, Accounts** (`canViewMoney`, `src/lib/rbac.ts:36-50`).
- Refused with `RestrictedState`: **Warehouse, Technician, Driver, Client** — the `MONEY_BLIND` set (`src/lib/rbac.ts:45-50`), refused at `src/App.tsx:1020-1023`.

There is no further route-level role guard: `/admin/backup` is mounted with no wrapper other than `Shell` (`src/App.tsx:678-685`).

**Money visibility.** The page does **not** call `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`); it is not imported (`src/modules/admin/BackupRestore.tsx:1-30`). There is no rupee figure anywhere on the screen — every quantity is a count, a byte size or a percentage — so **nothing is hidden under Law 6 within the page**. The Law 6 argument this page does make is different and is about a file, not a column: the header and the `OWNER_ONLY` string argue that a full backup carries every money column RLS withholds, so Download is Owner-gated (`src/modules/admin/BackupRestore.tsx:134-139, 173-174`).

**In-page Owner gate.** `isOwner` is the role literal `user?.role === 'Owner'` (`src/modules/admin/BackupRestore.tsx:172`), not an `rbac` predicate. It controls three things and nothing else:

- Row Download and row Restore are real `<button>`s for an Owner, inert reason-bearing spans otherwise (`:378-391`, `RowAction` at `:805-832`).
- Start Restore is a live danger button for an Owner, a lock-icon span otherwise (`:525-568`).
- The header's Back up now / Restore reasons change wording for an Owner (`:208-211, 217`); the buttons stay disabled for everybody.

`SystemRestoreModal` re-checks the same literal itself and renders an "Access Denied" panel for a non-Owner (`src/modules/admin/SystemRestoreModal.tsx:86, 91-104`) — a second gate, reachable only if a non-Owner path ever sets `restoreFor`.

Combining both gates, the roles that can reach the page but can press nothing on it are **Admin, Manager, Coordinator, Accounts**.

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **No** in this file. The only loading UI is `Shell`'s Suspense fallback for the lazy chunk, `<LoadingSkeleton type="card" label="Loading…" />` (`src/App.tsx:1026`) — chunk-load, not data-load. The data is a module constant, so nothing is awaited. Inside the modal, steps 2 and 5 draw spinner/pulse panels on `setTimeout` timers (`src/modules/admin/SystemRestoreModal.tsx:142-151, 223-232`), which are theatre, not a pending request. |
| Error | **Yes**, hand-rolled — `ErrorBanner` imported directly from `StateViews` (`src/modules/admin/BackupRestore.tsx:6`) and rendered at the top of the page when `downloadError` is set (`:238-240`; component `src/components/ui/StateViews.tsx:171-210`). The modal carries a second, hand-built failure state with the what/why/what-to-do triple (`src/modules/admin/SystemRestoreModal.tsx:243-291`). |
| Empty | **No.** Every list is a non-empty constant, and no `EmptyState` is imported. |
| Restricted | **Not by the page.** The route-level `RestrictedState` at `src/App.tsx:1020-1023` covers the money-blind roles. Within the page, a role that may not act gets `Unavailable` tooltips (`src/components/ui/Unavailable.tsx:35-164`) rather than a restricted state; the modal's "Access Denied" panel (`src/modules/admin/SystemRestoreModal.tsx:91-104`) is hand-built, not `RestrictedState`. |

The page does **not** use `src/components/ui/PageBody.tsx` (compare its four-state ladder at `src/components/ui/PageBody.tsx:143-204`).

## 7. Known gaps

1. **`TODO(decision)` markers: none** in `src/modules/admin/BackupRestore.tsx`, none in `src/modules/admin/SystemRestoreModal.tsx`, none in `src/data/backup.ts`.

2. **`backup_logs` is a real table with real RLS, and this page reads none of it.** The table is created at `supabase/migrations/0007_admin_security.sql:294-313` with exactly the columns this screen displays (`backup_no`, `backup_type`, `status`, `storage_location`, `file_size_bytes`, `started_at`, `completed_at`, `initiated_by`); its SELECT policy admits Owner and Admin (`supabase/migrations/0031_cleaning_and_comms_policies.sql:164-167`); it is typed at `src/types/supabase.ts:340-355`. The screen's 8 history rows come from `src/data/backup.ts:49-58` instead, and no file under `src/lib` references `backup_logs`.

3. **The rail comment contradicts what the rail does.** `src/modules/admin/BackupRestore.tsx:245-247` states "below 1180 the rail reflows underneath, still visible. It is not wrapped in CollapsibleAside and its defaults are untouched." But the page renders `<Rail>` (`:653`), `Rail` **is** `CollapsibleAside` (`src/components/ui/Page.tsx:315-331`), and `CollapsibleAside` defaults to collapsed at phone **and** tablet (`src/components/ui/CollapsibleAside.tsx:37`). `src/components/ui/Page.tsx:333-348` documents `ReflowRail` as the component for exactly this requirement and names the defect: "any screen that renders `<Rail>` unconditionally puts its rail content behind a handle on the warehouse tablet this product targets." On 768–1179 the Summary, Alerts, Quick Actions and Recent Activity cards are behind a 44px handle.

4. **The two-factor step verifies nothing.** `authCode` is written at `src/modules/admin/SystemRestoreModal.tsx:164` and read at exactly one place — `disabled={authCode.length !== 6}` (`:180`). Any six digits pass. The page describes the flow as "Owner-only, and two-factor gated" (`src/modules/admin/BackupRestore.tsx:173-174`) and the modal header lists "3 two-factor · 6-digit code" as a step (`src/modules/admin/SystemRestoreModal.tsx:14-20`); the failure screen also asserts "two-factor … were all checked" (`:275`).

5. **The "mandatory pre-restore checkpoint" is a 2-second timer.** Step 2 advances via `setTimeout(() => setStep(3), 2000)` (`src/modules/admin/SystemRestoreModal.tsx:74-77`) while drawing "Creating Pre-Restore Checkpoint … Mandatory snapshot in progress" (`:146-149`). Nothing is written. The modal's own failure state says so plainly (`:279`), but the page sentence under Start Restore does not — it reads "A pre-restore checkpoint is taken first, and it is not optional." with no caveat (`src/modules/admin/BackupRestore.tsx:569-571`), as does the file header (`:130-132`).

6. **The three Restore Options checkboxes are dead state.** `opts` is initialised at `src/modules/admin/BackupRestore.tsx:169`, toggled at `:510` and read only to render its own `checked` value at `:509`. It is not passed to `setRestoreFor` (`:528`) nor to `SystemRestoreModal` (`:767-774`). "Create recovery checkpoint" also contradicts `:570` and the modal, where the checkpoint step is unconditional.

7. **The error banner's action says "Retry" and dismisses.** `onRetry={() => setDownloadError(null)}` (`src/modules/admin/BackupRestore.tsx:239`); `ErrorBanner` renders that callback behind a `refresh`-icon button labelled "Retry" (`src/components/ui/StateViews.tsx:203-207`). Pressing it clears the message without re-attempting anything.

8. **Seven dead pager buttons over a fixed 8-row array.** `src/modules/admin/BackupRestore.tsx:407-430` maps `['‹','1','2','3','…','156','›']` to `<button type="button">` elements with no `onClick`; `'1'` carries `aria-current="page"`. The caption above claims 1,248 backups across 156 pages (`:405`) while `HISTORY` holds 8 rows (`src/data/backup.ts:49-58`).

9. **The Restore Center can only ever target one backup.** "Select backup or restore point" is a `<button>` with a chevron and no handler (`src/modules/admin/BackupRestore.tsx:459-479`), and the card beneath always renders `RESTORE_POINT` (`:481-499`; `src/data/backup.ts:78-83`). Start Restore therefore always passes `BKP-2025-0519-0215` (`:528`), regardless of the "Restore What?" radio, which is appended to the modal's display string only.

10. **The floor cannot reach this screen, and `nav.ts` argues by name that it should.** `src/data/nav.ts:143-145` says putting `/tools` in the money list "would hide Audit Log, Activity Log, Numbering and **Backup & Restore** from the floor, which no spec asks for" — but the same array lists `'/admin'` (`src/data/nav.ts:150`) and the screen now lives at `/admin/backup` (`src/App.tsx:679`), so `src/App.tsx:993` refuses it to Warehouse, Technician, Driver and Client. The outcome the comment was written to prevent is the current behaviour. (Same contradiction recorded for Activity Log in `docs/pages/52_activity_log.md`.)

11. **Stale comment that hides gap 10.** `src/data/nav.ts:137` reads "`/admin/*` now redirects into `/tools/*`". The router does the opposite: `/tools/backup` redirects to `/admin/backup` (`src/App.tsx:135`), with the four `/tools/*` redirects at `src/App.tsx:132-135`.

12. **The in-page gate is a role literal, and it is narrower than the table's own RLS.** `src/modules/admin/BackupRestore.tsx:172` hard-codes `user?.role === 'Owner'`; `src/modules/admin/SystemRestoreModal.tsx:86` repeats it. `canManageSettings` in `src/lib/rbac.ts:360-362` is already exactly that predicate, and `src/lib/rbac.ts:191-197` states that role sets belong there. Separately, `backup_logs_select` admits **Owner and Admin** (`supabase/migrations/0031_cleaning_and_comms_policies.sql:167`), so an Admin who may read backup rows at the database may not press Download in the UI.

13. **BS dates are hand-typed, in a format the app's own converter does not produce.** `src/data/backup.ts:50-57` carries `startedBs: '2082-02-07'` style strings. `src/lib/bs.ts` exports `toBs` (`:93-99`) and `formatBs` (`:102-105`), which render "7 Jestha 2082 BS"; 20+ modules import that file and this page imports nothing from it (`src/modules/admin/BackupRestore.tsx:1-30`). Four other date surfaces on the same page are AD-or-relative only, under a footer that reads "All dates are shown in BS above AD" (`src/data/nav.ts:429`): schedule Next Run (`:316`), the restore-point time (`:497`), Recent Activity times (`:740`) and the Summary rows (`:655`).

14. **The Backup Schedule Status column is a constant.** Every row renders `<Pill text="Enabled" status="in" />` (`src/modules/admin/BackupRestore.tsx:318`); `SCHEDULE` has no status field (`src/data/backup.ts:26-33`), so a disabled schedule cannot be represented.

15. **The rail meter's 83 is a second copy of a seed figure.** `<Meter pct={83} />` is written at the call site (`src/modules/admin/BackupRestore.tsx:656`) while the row above it prints `'486 GB (83%)'` from `src/data/backup.ts:120`. Two places to change, no link between them.

16. **`ADVISOR` is exported and imported by nothing.** `src/data/backup.ts:147-153`. The page documents the deliberate omission at `src/modules/admin/BackupRestore.tsx:29` and `:748-757`, so this is a stated leftover rather than a surprise — but the constant is still shipped.

17. **`ANALYTICS[].sub` is declared and never rendered.** The type and values are at `src/data/backup.ts:109-115`; the analytics cell draws label, value, delta and sparkline only (`src/modules/admin/BackupRestore.tsx:621-640`). Four of the five `sub` values are the empty string anyway.

18. **Duplicate member in two union types.** `Spark`'s `tone` is `'primary' | 'success' | 'primary' | 'progress' | 'danger'` (`src/modules/admin/BackupRestore.tsx:89`), and `QUICK_ACTIONS`' `tone` is `'success' | 'primary' | 'progress' | 'primary'` (`src/data/backup.ts:132`). Harmless at runtime; both read as an unfinished edit.

19. **Six grids never respond to width.** `src/modules/admin/BackupRestore.tsx:264, 328, 443, 575, 584, 620` carry fixed column counts. At phone width the History card (table `minWidth: 880`, `:339`) sits in a `1.55fr` track beside the Restore Center, and the six analytics cells share the viewport.

20. **The row `⋮` menu is specified and unbuilt.** `src/modules/admin/BackupRestore.tsx:392-396` — an inert span whose reason names verify · duplicate · retention.
