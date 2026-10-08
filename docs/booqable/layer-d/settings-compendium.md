# Layer D verification — The Settings compendium — all 17 pages
v2.5 section: §21 (lines 1330-1391)   ·   Our route(s): /settings, /settings/tools, /tools/*, /admin/*
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only, Supabase MCP, project `sxguwvgoserhdolewibb`)

**Scope note.** §21 is almost entirely Layer A/B/C observation of *Booqable's* settings tree, and
those observations are trusted per the standing rule. What is verified below is every point where
§21 asserts something about **our** side — a table, a route, an engine, a setting, or a "ours
already models this" claim — plus the structural question the section forces: what our Settings
tree actually is, and which of Booqable's 17 pages land anywhere in it.

---

## The real structure (resolved from App.tsx, not from the page doc)

`/settings` is **one route with four tabs in a query param**, not a tree of sub-routes.

| Ours | Where |
|---|---|
| `/settings` → `Settings.tsx` inside `Shell` | `src/App.tsx:604-606` |
| Tabs: **Business · People · Branches · System** (`?tab=`) | `src/data/settings.ts:131-135`; default `business` at `:160` |
| Retired `?tab=` keys translated, not dropped | `LEGACY_TAB` `src/data/settings.ts:146`; applied `Settings.tsx:197` |
| `/settings/tools` → **redirect** to `/tools/cinematography` | `src/App.tsx:713` |
| `/tools/cinematography` → `modules/settings/Tools.tsx` (imported as `CineTools`) | `src/App.tsx:73`, `:706` |
| `/tools` landing → `modules/tools/ToolsLanding.tsx` | `src/App.tsx:637` |
| `/tools/pricing`, `/tools/depreciation` | `src/App.tsx:646`, `:655` |
| `/admin` → **redirect** to `/settings?tab=system` | `src/App.tsx:131` |
| `/admin/audit`, `/admin/audit-settings`, `/admin/audit-log`, `/admin/activity-log`, `/admin/numbering`, `/admin/backup` | `src/App.tsx:615`, `:624`, `:664`, `:673`, `:682`, `:691` |
| `/tools/audit-log`, `/tools/activity-log`, `/tools/numbering`, `/tools/backup` → **redirects into `/admin/*`** | `src/App.tsx:132-135` |

So the direction is **`/tools/* → /admin/*`**, and `/admin` (bare) → `/settings?tab=system`.
`src/data/nav.ts:145`'s comment — *"`/admin/*` now redirects into `/tools/*`"* — is **backwards**
and contradicts `App.tsx:132-135`. Code wins; the comment is stale.

**The 15 Aug four-tab reshape** is real and is recorded in `PROGRESS.md:1688` (heading
*"2026-08-15 (night) — mock data source added; administrative cut applied"*) at `PROGRESS.md:1722`:
*"Routes 73 → 68; Settings tabs 8 → 4 (Business · People · Branches · System) with `LEGACY_TAB`
preserving `?tab=` bookmarks. `/admin/*` is canonical; the four `/tools/*` admin paths are now
redirects."* Archived: `sections/Overview.tsx`, `BusinessHours.tsx`, `CommunicationSettings.tsx`,
`ai`/`automation`/`notifications`/`system`/`wall`; **deleted**: `sections/AppsApi.tsx`,
`sections/Security.tsx` (`PROGRESS.md:1723-1726`). The reshape is confirmed in code:
`src/data/settings.ts:131-135` is exactly four entries.

**Booqable's 17 settings pages mapped onto ours** — General → Business ▸ General/Localization;
Pricing → Business ▸ Financial (partial) ; Taxes → Business ▸ Financial ▸ Tax & fiscal year
(partial); Payment providers → **GAP**; Custom fields → **GAP**; Locations → Branches (seed, not
live table); Emails → **GAP** (archived 12 Aug); Documents → split across `/admin/numbering` +
`/documents`, no template/CSS/date-format settings → partial; Translations → **GAP** (our i18n is
back-office, the opposite scope); Account & billing → People ▸ Staff directory (seats/plan/API
meter all **GAP**); Online bookings ×9 (Overview, Booking page, Website builder, Website
integration, Cross-sell, Preferences, Pickup & delivery, Checkout, SEO) → **GAP, all nine**.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | §21.1 — the `Customer` → `Client` relabel makes Booqable "speak **Law 17**" | CONFIRMED | Law 17 is *"The word 'customer' appears nowhere in the UI. They are clients."* §21 uses the law number correctly — it repeats none of the known-bad law renumbering. | `PLAN.md:34` (law table row 17) |
| 2 | §21.1 — `Order` remapped to "Booking" "explains the UI-vs-route drift (§3.1) at its source" | CONFIRMED (ours) | Our own drift is real and independent: the route family is `/rentals*` while every label says booking/rental. | `src/App.tsx` `/rentals`, `/rentals/:bookingNo` (routes list); `src/data/settings.ts:131-135` tab labels |
| 3 | §21.1 — Company info / address / "additional details" / regional settings are configuration we hold | MISLEADING | Ours holds **only** `organisationName`, `businessDescription`, `vatNumber` plus localization keys. No company email, phone, website, logo, address, or "additional details" setting exists anywhere. | `src/lib/settingsStore.ts:31-58` (the complete `SettingKey` union — 20 keys); `Organisation.tsx:26-90` |
| 4 | Settings values are persisted configuration | MISLEADING (critical) | **Every** setting on `/settings` persists to `localStorage` under prefix `br.settings.`. No Supabase table, no query file, no `src/actions/*` dispatch is reached by `Settings.tsx` or any of its six section files. The screen says so itself. | `src/lib/settingsStore.ts:359` (`PREFIX = 'br.settings.'`), `:379`, `:421`, `:439`; `Settings.tsx:646` ("No `settings` table is connected yet") |
| 5 | A `system_settings` table backs any of this | GAP | `system_settings` exists in the live DB with **0 rows** and has **no reader in `src/`** — it appears only in the generated types file. | `select count(*) from system_settings` → 0; `grep -rn system_settings src` → only `src/types/supabase.ts:9440`, `:9476` |
| 6 | §21.2 — 9 pricing-structure templates + 4 seasonal rulesets; §21.8.3 "our pricing engine needs tiered + seasonal shapes on day one" | GAP | Nothing in the DB stores a pricing template or a seasonal ruleset. `information_schema` has no `pric*`/`season*`/`rule*` table other than `automation_rules`. Our pricing engine is flat: `price()` takes rate × qty × days with one discount percent. `coupons` (0 rows) is the only date-windowed price object. | SQL over `information_schema.tables` (pattern `pric\|season\|rule\|tax\|template\|label\|locale\|translat\|deposit\|document\|setting\|portal\|checkout\|seo\|location`) — returned no pricing table; `src/lib/money.ts` `PriceInput`/`price()`; `select count(*) from coupons` → 0 |
| 7 | §21.2 / §21.8.4 — the deposit chain's **global root** is a setting; "D1's backfill starts by setting one default here" | GAP (ours) | Ours has **no global deposit default** at any layer. Per-product `products.deposit_percent` / `deposit_fixed` and per-booking `bookings.deposit_required` exist; the Settings surface that would hold the global default renders `NotTrackedYet` on purpose (Rulings §8 — never a plausible default). | live schema brief (`products`, `bookings` columns); `src/modules/settings/sections/Financial.tsx:29-34` and its `Deposit by category → NotTrackedYet` section |
| 8 | §21.3 — the three tax layers (product profile + client profile + include/exclude mode) | MISLEADING | Only **one** of the three exists on our side. `client_tax_profiles` is a real table (**0 rows**) with `customer_tax_profile` enum {VAT Registered, Non-VAT Customer, Tax Exempt, Government Organization, NGO, Corporate}. `products` has **no** tax-profile column. There is **no** include-vs-exclude tax mode anywhere — VAT is one flat number, `vatRatePercent`. | `select count(*) from client_tax_profiles` → 0; enum dump via `pg_enum`; `products` column list (live brief) has no tax column; `src/lib/settingsStore.ts:34` |
| 9 | §21.3's VAT rate is a real, read setting on our side | CONFIRMED | `vatRatePercent` is read live through `getSetting` by the invoice modal and the pricing calculator. | `src/modules/finance/modals/CreateInvoiceModal.tsx:194`, `:219`, `:594`; `src/modules/tools/PricingCalculator.tsx:10` (`getSetting` import) |
| 10 | §21.4 — payments configuration = provider connection (Stripe) | GAP (ours) | We have no payment-provider concept at all. The nearest thing is `bank_accounts` (**2 rows**, `channel_group`, `qr_code_url`) read by `listBankAccounts()`. No Settings page reaches it. | `select count(*) from bank_accounts` → 2; `src/lib/queries/bankAccounts.ts`; no provider route in `src/App.tsx` |
| 11 | §21.5 — "Locations: single-branch today; **our branches model is a superset**" | MISLEADING | The *schema* is a superset (`branches` 2 rows, `warehouses` 2, `storage_zones` 3). The *screen* is not connected to it: Settings ▸ Branches renders a hardcoded seed array of 3 branches with invented managers, staff counts, revenue and utilisation. | `select count(*) from branches/warehouses` → 2/2; `src/data/settings.ts:283-337` (`BRANCHES` literal, e.g. `:295` `revenue: rupees(1245300)`); consumed at `Settings.tsx:343`, `:391`, `BranchesWarehouses.tsx:360`, `UsersRoles.tsx:15` |
| 12 | §21.5 — Document **numbering: Global level vs Prefix level** (F5) is a setting ours models | WRONG-NAME | Ours has no global/prefix *mode*. It has a **per-sequence shape**: `number_sequences` (**10 rows**) carries `prefix`, `padding`, `include_year` per key, rendered by `formatConvention()` on `/admin/numbering` — i.e. Booqable's "Prefix level", permanently, with no global alternative. | `select count(*) from number_sequences` → 10; `src/lib/queries/numbering.ts:161`, `:236-250`; `src/modules/admin/NumberingSequences.tsx:17-25` |
| 13 | The number generator is reachable and correctly named | CONFIRMED | `next_document_number(p_sequence_key text)`; our repo cites the correct arg name. §21 never names the RPC, so it does **not** repeat the known-bad `kind` error. | `src/modules/finance/modals/CreateInvoiceModal.tsx:21`, `:326`; live `pg_proc` (schema brief) |
| 14 | §21.5 — **Invoice due dates auto-set when finalized**; §21.8.5 "our Settings ▸ Financial already models [this] or can adopt one-to-one" | GAP | No writer derives `due_date` from `paymentTermsDays`. `due_date` is a **manually typed, required** field on the create-invoice modal, and the modal refuses an empty one. `paymentTermsDays` has exactly one consumer: the Financial settings row that displays it. | `src/modules/finance/modals/CreateInvoiceModal.tsx:108`, `:232-240`, `:449`; `grep -rn paymentTermsDays src` → `settingsStore.ts:37/117`, `Financial.tsx:118` only |
| 15 | §21.5 — document templates, **Custom CSS**, per-type date display, page size | GAP | No table, no column, no setting. `document_registry` (0 rows) stores `file_url` and lifecycle only; there is no template or stylesheet object anywhere. | `select count(*) from document_registry` → 0; `information_schema` scan (claim 6) returned no template table |
| 16 | §21.5 — Translations = **customer-facing** wording overrides, back office explicitly excluded | MISLEADING (as a Layer D map) | Ours is the exact inverse: `lib/i18n.ts` is a **back-office** EN/NE string catalogue with a 100 %-coverage gate, and there is no customer-facing override store at all. Mapping Booqable's `/settings/locale` onto our Language setting would be wrong. | `src/lib/i18n.ts` (`EN`, `NE`, `coverage()`, `COVERAGE_THRESHOLD = 100`, `canEnable()`); `PLAN.md:2298` |
| 17 | §21.6 — team of 5 active staff | CONFIRMED (matches ours) | `users` = **5 rows**. Our staff surface reads `staff_directory_v`, which is gated `auth_user_role() = 'Owner'` only. | `select count(*) from users` → 5; `src/lib/queries/staff.ts:119` (`.from('staff_directory_v')`), `:22`; view gate in the live brief |
| 18 | §21.6 — "there is no user query in this build" (as our page doc states for the People tab) | MISLEADING — **doc/code contradiction** | There **is** one. `UsersRoles.tsx:49` mounts `StaffDirectoryCard`, which calls `fetchStaffDirectory()` against `staff_directory_v`. The page doc's People-tab paragraph is stale. Code wins. | `src/modules/settings/sections/UsersRoles.tsx:17`, `:49`; `src/lib/queries/staff.ts:119`; contradicted doc: `docs/pages/46_settings.md` §2, People tab |
| 19 | §21.6 — seats, plan, billing cycle, coupon, **API usage meter 535/150,000** | GAP | No seat count, no plan, no billing, no API quota meter exists. `sync_log` (0 rows) records calls but nothing reads it as a budget; `booqable/client.ts` carries retry limits, not a ceiling. | `select count(*)` on the corpus (live brief: `sync_log` 0); `src/lib/booqable/client.ts` `MAX_RETRY_ATTEMPTS` |
| 20 | §21.6 — staff-as-client needs "a flag on the client, and whether staff discounts route through the same D3 mechanism" | GAP | `client_flag_type` is exactly {VIP, Blocked, Upgrade Candidate} — no Staff label, so this needs a new enum value, not a settings toggle. `discount_source` has {Manual, Membership, Coupon, Women-DoP 5%, Student, College, Named-client rates} — a staff discount would land in `Manual` or `Named-client rates` today. | `pg_enum` dump of `client_flag_type`, `discount_source` |
| 21 | §21.7 / §21.8.1 — D2 customer accounts (self-registration, email verification, CAPTCHA, invite) confirmed against Booqable's model | GAP (ours) | Nothing is built. `portal_users`, `portal_sessions`, `portal_auth_challenges` all exist with **0 rows** and **RLS enabled with zero policies** — deny-all to every non-bypassrls role. No portal module, no portal route in `src/App.tsx`. A screen written against them gets nothing and no error. | `select count(*) from portal_users` → 0; live brief RLS note; `src/App.tsx` route list has no portal path |
| 22 | §21.7 — Checkout composed **from custom fields**; cross-sell; pickup/delivery; SEO; booking page | GAP, all of it | No custom-fields table, no storefront, no SEO settings, no cross-sell object. `booking_transport` covers delivery *on a booking*, not a delivery-settings page. | `information_schema` scan (claim 6); live brief `booking_transport` columns |
| 23 | §21.8.5 — "Numbering, invoice due dates, custom CSS on documents — all real settings our Settings ▸ Financial already models or can adopt one-to-one" | MISLEADING | One of the three is partly true and none is in Financial. Numbering lives on `/admin/numbering` (a different tab and a different route), invoice due dates are manual (claim 14), custom CSS does not exist (claim 15). Financial models tax & fiscal year, currency & terms, booking rules, membership matrix — and marks deposit-by-category and cancellation tiers as not tracked. | `src/modules/settings/sections/Financial.tsx:29-34`, `:118`; `src/modules/settings/sections/System.tsx:41-48` (numbering is an Administration link under **System**) |
| 24 | Settings screens are backed by live data generally | MISLEADING (mixed) | Split down the middle. **Live:** `/admin/audit-log` (`audit_events`, 5 378 rows), `/admin/numbering` (`number_sequences`, 10), `/admin/backup` (`backup_logs`, **0**), People ▸ Staff directory (`staff_directory_v`). **Fixture:** `/settings` all four tabs, `/admin/audit` (AuditSettings reads `data/audit.ts`; the `audit_settings` table has 0 rows and no reader), `/admin/activity-log` (reads `data/activityLog.ts`). | `src/modules/admin/AuditLog.tsx:13-23`; `NumberingSequences.tsx:17-25`; `BackupRestore.tsx:14`; `AuditSettings.tsx:8-27` (imports `../../data/audit`); `ActivityLog.tsx:9-18` (imports `../../data/activityLog`); counts by SQL |

### Known-bad facts — §21 status

§21 repeats **none** of the six known-bad facts. It names no component (`Card`, `ClickableRow`),
no `BrandKey`, no RPC signature, no engine count, and no facet counter; its one law citation
(Law 17, §21.1 and §21.8.2) is **correct** against `PLAN.md:34`. The section's Layer D exposure is
of a different kind: it assumes our Settings screens are configuration stores, and they are a
localStorage registry plus seed arrays.

---

## Corrected Layer D

**Settings — `/settings` (one route, four tabs)**

```
source   localStorage registry `br.settings.*` — 20 keys, lib/settingsStore.ts:31-58
         + hardcoded seed array BRANCHES (data/settings.ts:283-337)
filter   ?tab= business | people | branches | system; unknown keys via LEGACY_TAB (:146)
order    fixed section order per tab (FIELD_SECTIONS, sections/index.ts:22-25)
window   n/a
money    useCanViewMoney() → FinancialPane rendered only when true (Settings.tsx:381);
         FINANCIAL_SECTIONS deliberately excluded from FIELD_SECTIONS so the CSV export
         cannot leak VAT/terms to a money-blind session (sections/index.ts doc; Settings.tsx:238)
engine   lib/settingsStore.ts (validate/read/write/reset) · lib/rbac.canManageSettings (Owner)
         · lib/i18n.applyLanguage · lib/edit/useEditMode
action   GAP — no src/actions/* dispatch; writeSettings() writes localStorage
Writes:  GAP — not built → localStorage only (no `system_settings` row is ever written)
Reads:   GAP — not built (no table). People tab is the one exception: staff_directory_v
```

**Settings ▸ People ▸ Staff directory** (the only live read on `/settings`)

```
source   view staff_directory_v (joins users + branches + staff_auth_pins + auth.users)
filter   view-level: auth_user_role() = 'Owner' — no other role gets a row
order    as returned by the view
money    no money columns on this view
engine   lib/queries/staff.ts (fetchStaffDirectory, revokeStaffPinFor, recordPasswordResetRequest)
action   RPCs revoke_staff_pin_for(p_user_id), record_password_reset_request(p_user_id)
Writes:  lib/queries/staff.ts → RPC revoke_staff_pin_for / record_password_reset_request
Reads:   staff_directory_v  (base `users` = 5 rows)
```

**Settings ▸ System ▸ Device PIN**

```
source   n/a (write-only ceremony)
engine   lib/auth.tsx
action   RPCs set_staff_pin(p_pin) · verify_staff_pin(p_pin) · staff_pin_status() ·
         revoke_own_staff_pin()   — auth.tsx:426, :459, :505, :525
Writes:  lib/auth.tsx → staff_auth_pins (via SECURITY DEFINER RPCs only; the table is
         RLS-on with ZERO policies — never queryable directly)
Reads:   staff_pin_status() RPC
```

**/admin/numbering — Numbering Sequences**

```
source   table number_sequences (10 rows)
filter   listNumberSequences() + useList/ListFilters; role gate numberingRestriction()
order    sequence_key
window   n/a
money    none
engine   lib/queries/numbering.ts — formatConvention(), previewNextNumber(s)
action   GAP — the screen previews; the generator is the DB RPC
Writes:  GAP — not built (no sequence-shape mutation ships)
Reads:   number_sequences  ·  generator: RPC next_document_number(p_sequence_key text)
```

**/admin/audit-log — Audit Log**

```
source   table audit_events (5 378 rows)
filter   listAuditEvents(): module / action / actor_role / period; AUDIT_READ_ROLES
         ['Owner','Admin','Manager'] via auditRestriction()
order    created_at desc (there is NO occurred_at on audit_events)
money    none
engine   lib/queries/audit.ts
Writes:  GAP — append-only; rows come from the DB trigger log_audit_event()
Reads:   audit_events
```

**/admin/backup — Backup & Restore**

```
source   table backup_logs (0 rows — empty corpus, not a defect)
filter   listBackupLogs(); BACKUP_READ_ROLES ['Owner','Admin'] via backupRestriction()
engine   lib/queries/backup.ts
Writes:  GAP — not built (no backup is actually initiated)
Reads:   backup_logs
```

**/admin/audit (Audit Settings) and /admin/activity-log**

```
source   FIXTURE — src/data/audit.ts and src/data/activityLog.ts
         (the live `audit_settings` table exists, has 0 rows, and has no reader in src/)
Writes:  GAP — not built
Reads:   GAP — not built (fixture arrays)
```

**/tools, /tools/pricing, /tools/depreciation, /tools/cinematography**

```
source   pure calculators — no table, no query
money    /tools/pricing and /tools/depreciation are MONEY_SURFACES (data/nav.ts:158-160),
         so ToolsLanding drops those cards and the nav hides the URLs for money-blind roles
engine   lib/money.price/discountGate (PricingCalculator) · data/tools.ts (CineTools,
         DepreciationCalculator) · getSetting('vatRatePercent')
Writes:  GAP — not built (nothing is persisted by any calculator)
Reads:   localStorage favourites only (data/tools.ts readFavourites/writeFavourites)
```

**Booqable pages with no home on our side** — Payment providers · Custom fields · Emails ·
Document templates/Custom CSS · Translations · Account & billing (plan, seats, API meter) ·
all nine Online-bookings pages (Overview, Booking page, Website builder, Website integration,
Cross-sell, Preferences, Pickup & delivery, Checkout, SEO): **GAP — not built.**

---

## Money and Law 6

Money on these screens: the Financial cards (VAT rate, payment terms, late-payment %, crew
coordination fee, membership matrix), the branch KPI tiles and Branch Performance panel on the
Branches tab, and the two money calculators under `/tools`.

- **Gate mechanism: `useCanViewMoney()` — a client-side render gate, not RLS and not a masked
  view.** `Settings.tsx:136` computes it; `:381` renders `FinancialPane` only when true; `:238`
  appends `FINANCIAL_SECTIONS` to the CSV export only when true; `:242`/`:343`/`:391` pass `money`
  into the branches pane, rail and CSV. `useCanViewMoney` = `canViewMoney(user.role)`
  (`src/lib/moneyVisibility.ts:24-26`), which mirrors the DB's `auth_can_view_money()`
  (blind: Warehouse, Technician, Driver, Client).
- **It qualifies as "hidden" in the correct sense** — the pane is not rendered, so the labels are
  not in the DOM and not in the export. The section barrel makes this explicit
  (`sections/index.ts` doc: keeping `FINANCIAL_SECTIONS` out of `FIELD_SECTIONS` is what stops the
  export leaking VAT rates to a Warehouse operator), and `PROGRESS.md:1728-1730` records it as
  browser-verified and as the one thing the applied package must not change.
- **A stale comment to correct:** `Settings.tsx:107-112` still says *"the Financial tab is removed
  from the strip for a money-blind session"*. There is no Financial tab any more — all four TABS
  carry `money: false` (`data/settings.ts:132-135`), so the `TABS.filter` at `Settings.tsx:186` is
  a no-op and the real gate is the pane render at `:381`. Behaviour is right; the comment describes
  the pre-15-Aug shape.
- **RLS does not participate here at all**, because `/settings` reads no table. The two Settings
  surfaces that do touch the DB are gated server-side and carry no money: `staff_directory_v` is
  `Owner`-only inside the view, and `audit_events` / `backup_logs` / `number_sequences` have no
  money columns.
- **Nav-level gating** is separate and real: `/admin`, `/tools/pricing`, `/tools/depreciation` are
  `MONEY_SURFACES` (`src/data/nav.ts:158-160`), filtered out of the nav at `:114` and dropped as
  cards by `ToolsLanding.tsx` through the same predicate.

---

## What this changes for the build

1. **Stop treating `/settings` as a configuration store.** Every value on it is a browser-local
   value. Any plan that says "set the default in Settings" — including §21.8.4's deposit backfill
   and §21.8.5's numbering/due-date/CSS adoption — is currently a plan to write to one operator's
   `localStorage`. If Settings is to be authoritative, the first piece of work is `system_settings`
   (table exists, 0 rows, zero readers) plus a query module; nothing else on this list can be
   honestly built first.
2. **Do not cite "our branches model is a superset" as evidence that Locations is covered.** The
   schema is a superset; the screen is a seed array with invented revenue and utilisation figures
   (`data/settings.ts:283-337`). Wiring Settings ▸ Branches to `branches`/`warehouses` (2 rows
   each, live) is a self-contained job and should precede any Booqable Locations mapping.
3. **Numbering is already "Prefix level" and cannot express "Global level".** `number_sequences`
   holds prefix/padding/include_year per key with no global mode. If F5 needs the global option,
   that is a schema change (a mode column or a settings row), not a UI toggle. Generation stays
   `next_document_number(p_sequence_key text)` — named arg, ten valid keys.
4. **Invoice due dates are manual.** Booqable's "auto-set when finalized" is not modelled: the
   operator types the date and the modal refuses an empty one
   (`CreateInvoiceModal.tsx:108`, `:232-240`). Deriving it from `paymentTermsDays` would give that
   setting its first real consumer beyond its own display row.
5. **The whole Online-bookings family is a green field, and its tables are deny-all.**
   `portal_users` / `portal_sessions` / `portal_auth_challenges` have RLS on with **zero policies**.
   Any D2 screen written before policies exist will render empty **with no error** — the most
   expensive failure mode in this schema. Write the policies in the same change as the first screen.
6. **Fix two stale statements found in passing.** `data/nav.ts:145` states the redirect direction
   backwards (`App.tsx:132-135` is `/tools/* → /admin/*`), and `Settings.tsx:107-112` describes a
   Financial tab that the 15 Aug cut removed.
7. **Correct the page doc.** `docs/pages/46_settings.md` says the People tab closes with *"there is
   no user query in this build"*; `UsersRoles.tsx:49` mounts `StaffDirectoryCard` →
   `fetchStaffDirectory()` → `staff_directory_v`. The doc also cites
   `BREAKPOINT = { phone: 768, desktop: 1180 }`; the live value is `BP = { phone: 768, desktop: 1280 }`
   (`src/lib/breakpoints.ts:45`, re-exported `device.ts:61`). Both are doc-behind-code.
8. **Seasonal/tiered pricing has no landing zone.** Before the bridge can "import pricing
   structures", a pricing-template and a seasonal-ruleset object must exist; today the only
   date-windowed price object in the schema is `coupons` (0 rows), and `price()` is flat.

---

## Open questions

1. **Is `system_settings` intended to back Settings, or is localStorage the ruled answer?**
   Settled by: a ruling in `PLAN.md §4` naming the owner of settings persistence, plus the shape of
   a `system_settings` row (one row per key, or one JSON blob per client_uuid).
2. **Does the "Global level vs Prefix level" numbering mode need to exist for us at all?**
   Settled by: Babin confirming whether any document family should share one counter — if not,
   F5 closes as "prefix level, permanently" and no schema change is needed.
3. **Where does a global default security deposit live?** Settled by: a decision between a
   `system_settings` key, a `deposit_percent` default on `inventory_categories`, or nothing at all
   (leaving `products.deposit_percent` as the only layer). The Settings panel deliberately shows
   `NotTrackedYet` until this is answered.
4. **Staff-as-client (Suren Dhital):** does this become a fourth `client_flag_type` label, a
   `client_segment`, or a named-client discount policy? Settled by: an enum decision — the current
   labels are {VIP, Blocked, Upgrade Candidate} and none fits.
5. **Are the money-blind RLS policies actually correct per role?** Still UNVERIFIABLE repo-side:
   this pass confirmed the client-side gate and read the policy text, but nobody has run a session
   as Warehouse/Technician/Driver/Client and confirmed money columns return NULL. Settled by: an
   authenticated session per role (or `set app.current_user_id` to a real `users` row) followed by
   a select on `products_v` / `client_directory_v`.
6. **Does AuditSettings ever get its table?** `audit_settings` exists (0 rows) while
   `/admin/audit` renders `data/audit.ts`. Settled by: deciding whether audit granularity/retention
   is operator-configurable at all; if not, the fixture should be replaced by a stated constant
   rather than a screen that looks configurable.
