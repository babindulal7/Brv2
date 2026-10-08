# Layer D verification — Pro forma, Rental period settings, Custom fields, Security
v2.5 section: §20 (lines 1292-1329)   ·   Our route(s): /settings, /admin/*
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

§20 is almost entirely Layer A/B/C — a live read-only capture of Booqable's own screens, and as
capture it is trusted. Its **Layer D** content is the set of sentences that begin "ours", "adopt it
verbatim", "D4's anchor", "the E6 page shape" — i.e. the claims about what in **this** repo or **this**
database serves each observed surface. Those are what is checked below. Where §20 makes no claim
about our side at all (the Booqable field lists, the observed radio states) there is nothing to verify
and the line is not listed.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | §20.1 — the invoice number "is minted by `Finalize`, which is a distinct action from `Send`"; ours should carry the same two-step | **GAP** | Nothing in this repo mints an invoice number, and there is no Finalize/Issue action. `src/actions/` has 13 sub-directories and **no `finance/createInvoice`, no `issueInvoice`, no `finalizeInvoice`**. The only finance action is `recordPayment.ts`. A repo-wide search for `finali[sz]e` returns three unrelated hits (a seed-hash comment, and two generated enum strings in `types/supabase.ts`). The DB is ready for it — `number_sequences` holds `invoice / INV- / 120 / pad 1 / include_year=false`, and `invoice_status` starts `Draft → Sent` — but no code path advances it. | `ls src/actions/*/`; `grep -rni "finali[sz]e" src/` → `src/lib/seed.ts:804`, `src/types/supabase.ts:13219`, `:14711` only; `src/lib/queries/finance.ts:304-310` (`STORED_INVOICE_STATUSES`); SQL: `select sequence_key,prefix,current_value,padding,include_year from number_sequences` → `invoice, INV-, 120, 1, false` |
| 2 | §20.1 — the numbering model itself (a document number comes from the allocator, at the finalize moment, never from the clock) | **CONFIRMED for the two paths that exist** | `next_document_number` is called correctly, with the **named** arg `p_sequence_key`, in the only two actions that mint a number. This repo does **not** carry the known-bad `kind:` form. | `src/actions/clients/createClient.ts:338-340` — `supabase.rpc('next_document_number', { p_sequence_key: 'client' })`; `src/actions/finance/recordPayment.ts:330`; test pins the arg name at `src/actions/clients/__tests__/createClient.test.ts:159` |
| 3 | §20.1 — a document-number path exists for documents generally (implied by "the numbering model") | **MISLEADING** | `src/actions/documents/createDocument.ts` does **not** use the DB allocator. It calls `issue('DOC', Date.now().slice(-4))` from `src/data/numbering.ts:417` — a client-side seed formatter — and `'DOC'` is **not one of the ten `number_sequences` keys** (booking, bundle, client, deposit, equipment, expense, invoice, membership, payment, quote), so `next_document_number('DOC')` would raise `Number sequence % does not exist`. The action also lacks `implemented: true`, so `createAction` throws `ActionNotImplementedError` before `execute`. It is a stub that mints a number from the clock — precisely what §20.1's model forbids. | `src/actions/documents/createDocument.ts:3`, `:21-22`; `src/data/numbering.ts:417-431`; SQL above (10 keys, no `document`/`doc`) |
| 4 | §20.1 — "**No Signature rail** — signatures belong to quotes and contracts, never invoices. L8 stands exactly as written." | **MISLEADING** (as a statement about our schema) | Our `signatures` table is not document-scoped at all: it hangs off `operation_sessions` (`session_id`, `signature_role`, `sealed_at`) — it is the handover/return signature, not a document signature. The document-level signature fields live on `document_registry` (`signed_at`, `signed_by_name`, `signature_url`) and **nothing constrains them by `document_type`** — `document_type` includes `Tax Invoice`, and there is no CHECK, trigger or policy stopping a signed invoice row. So the rule is real as a *policy* but is **not built as a constraint**; a builder reading "L8 stands" as "the schema enforces it" would be wrong. | Live schema brief, `signatures` and `document_registry` column lists; SQL: `document_type` enum = `{Quotation, Rental Agreement, …, Tax Invoice, Receipt, Credit Note, …}`; `document_lifecycle_status` = `{Draft, Pending Approval, Pending Signature, Signed, Issued, Void, Expired}` |
| 5 | §20.1 — the pro forma body carries a **Replacement Cost** total line | **GAP** | `invoices` has no replacement-cost column (subtotal, discount_amount, taxable_amount, vat_amount, total_amount, paid_amount, outstanding_amount). Replacement value exists only per-asset (`products.replacement_value`, `product_units.replacement_value`, `accessories.replacement_cost`); nothing aggregates it onto a document. | Live schema brief, `invoices` / `products` / `product_units` / `accessories` column lists |
| 6 | §20.2 — Default booking times 06:00/06:00 is "precisely the `operationalDayStart` shape D4 ruled"; DECISION-SHEET B1 records this CLOSED and BUILT | **CONFIRMED — it is genuinely built, end to end** | Pure engine + stored setting + reader + rendered control + tests, all present. Engine: `OPERATIONAL_DAY_START_DEFAULT = '06:00'`, `dayStartMinutesFrom`, `operationalDayBounds`, `operationalDayOf`. Setting: `SettingKey` includes `operationalDayStart`, spec default `'06:00'`, `HH:mm` validator. Reader: `queries/bookings.ts` calls `dayStartMinutesFrom(getSetting('operationalDayStart'))` and every "today" boundary is built from it. Control: rendered as the "Operational day starts" row on Settings ▸ Business. Test: the D4 acceptance case (05:30 belongs to yesterday at 06:00, to today at 00:00) is pinned. | `src/lib/operationalDay.ts:41`, `:44`, `:67-70`, `:124-136`, `:151-158`; `src/lib/settingsStore.ts:47`, `:227-236`; `src/lib/queries/bookings.ts:3`, `:751-752`, `:812-818`, `:837`; `src/modules/settings/sections/Organisation.tsx:76-85`; `src/lib/__tests__/operationalDay.test.ts:87-107` |
| 7 | §20.2 — "ours can stay **one** value unless Babin wants asymmetric defaults" (vs Booqable's pick-up/return pair) | **CONFIRMED** | Exactly one key, `operationalDayStart`, a single `HH:mm` string. There is no return-side twin anywhere in `SettingKey`. | `src/lib/settingsStore.ts:32-58` (full key union); `:227` |
| 8 | §20.2 — the setting is stored where a setting belongs | **MISLEADING** | It persists to **browser `localStorage`** (prefix `br.settings.`), not to a table. A `system_settings` table (`key text`, `value jsonb`, RLS on, 2 policies, **0 rows**) exists in the live DB and is generated into `src/types/supabase.ts:9440`, but **no application code references it** — the only two hits in `src/` are the generated type and its FK name. So the 06:00 ruling is per-browser: two operators on two machines can hold two different operational days, silently. | `src/lib/settingsStore.ts:314` (key prefix), `:371-378` (write); `grep -rn "system_settings" src/` → `src/types/supabase.ts:9440`, `:9476` only; live schema brief `system_settings \| table \| 0 \| on/2` |
| 9 | §20.2 — **Away mode** ("block all pickups and returns between selected date ranges") is the sixth unused Booqable feature and the F1 Dashain/Tihar shape | **GAP** | Nothing in the repo and nothing in the DB. `grep -rni "away mode\|blackout\|block all pickups" src/` → zero hits. No table matches `%away%`, `%blackout%`, `%holiday%`. `lib/bs.ts` has `isWeekend()` and nothing else calendar-blocking. | `grep` (0 hits); SQL: `select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%away%' or ilike '%blackout%' or ilike '%holiday%')` → 0 rows |
| 10 | §20.2 — "ours should express the same three-layer scoping (channel default · org opt-in · per-role override)" for rental-period rules | **GAP** | No channel dimension exists. There is no storefront in this build, no `apply_to_manual_bookings` flag, and no per-role override on any period rule. The nearest built thing is the pair of operations rules `unitAvailabilityRule` / `rentalTurnaround`, which are single global values with **no** role or channel scoping, and `bookingRules.ts`'s `allowOverbooking`, whose own header records the unresolved `TODO(decision)` "global or Owner/Admin-only". | `src/lib/settingsStore.ts:54-58`; `src/modules/settings/sections/System.tsx:125-137`; `src/lib/bookingRules.ts:17-21` |
| 11 | §20.2 — period **modes** (Dates and times / Fixed durations / Fixed time slots) and `Enable time selection` | **GAP** | No period-mode setting exists. Every booking in this system is a `tstzrange`-shaped window: `bookings.pickup_at` / `return_at` (timestamptz, CHECK `return_at > pickup_at`), `inventory_reservations.period tstzrange`, `RENTAL_WINDOW_BOUNDS = 'half-open'`. "Dates and times" is hard-wired; the other two modes have no representation. | Live schema brief (`bookings`, `inventory_reservations`, `bookings_return_after_pickup`); repo export map, `src/lib/availability.ts` `RENTAL_WINDOW_BOUNDS` (:104) |
| 12 | §20.2 — the `New period picker` opt-in ("Booqable ships UI rewrites behind per-account toggles") | **GAP** | No feature-flag registry exists. `settingsStore.ts` has 21 keys and none is a UI-rollout flag; there is no flag table in the DB. | `src/lib/settingsStore.ts:32-58` |
| 13 | §20.3 — the custom-field model `{scope, name, order, show_on_documents, collect_at_checkout}`, "adopt it verbatim" | **GAP — nothing is built, in the repo or the DB** | `grep -rni "custom_field\|customField\|custom fields" src/` → **zero hits**. No table matches `%custom%` or `%field%` in the live schema (the only near-misses are `accessories`, `return_accessory_checks`, `security_deposits`). All three entity scopes the spec names (Customer/Booking/Product) are fixed-column tables today: `clients` (44 cols), `bookings` (30), `products` (49). Adding a custom field to any of them is a migration, not data. | `grep` (0 hits); SQL: `select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%custom%' or table_name ilike '%field%')` → `accessories, accessories_v, return_accessory_checks, return_accessory_checks_v, security_deposits` — none of them a custom-field store |
| 14 | §20.3 — "Ours: creating a field warns on near-duplicate names" (the `Phone` / `Phone Number` lesson) | **GAP** | Consequent of 13 — there is no field-creation surface to warn on. Note the repo *does* have near-duplicate detection for a different entity (`findClientMatches` in `queries/clients.ts`, the DuplicateCenter screen); nothing of the kind exists for schema/field names. | `src/lib/queries/clients.ts` (`ClientMatchKeys`, `findClientMatches`); no field-creation module under `src/modules/settings/` |
| 15 | §20.4 — "Ours already specs session timeout, password policy, 2FA and screen lock **under People & Access**" | **MISLEADING — wrong tab, and two of the four persist nothing** | All four rows are on the **System** tab's **Access** card, not the People tab (People is the permissions matrix + roles + branch managers + Staff Directory). And they are not four settings of one kind: `passwordPolicy` (select, Strict/Standard) and `sessionTimeoutMinutes` **do** persist through `settingsStore`; "Two-factor authentication" and "Shared-device screen lock" are `on: true` literals rendered by `Switch`, which holds `useState(on)` and propagates nothing — toggling either and reloading loses it silently. | `src/modules/settings/sections/System.tsx:155-183` (card `key: 'access'`, the four rows); `src/modules/settings/sections/shared.tsx:508-526` (`Switch` is local state only); `src/lib/settingsStore.ts:40-41`, `:177`, `:189` |
| 16 | §20.4 — "session timeout" is the row name/shape ours carries | **WRONG-NAME** | The row is **"Idle screen lock"**, ruled and renamed 25 Aug 2026, and its semantics differ from Booqable's: **0 is the default and means off**, it **locks and never signs out**, and it stands down entirely when no PIN is set. The stored key kept the old name (`sessionTimeoutMinutes`), which is the trap — the key says timeout, the behaviour is a lock. | `src/modules/settings/sections/System.tsx:163-182` (the row, and the comment recording the 25 Aug ruling); `src/lib/auth.tsx:631-650` — `if (!Number.isFinite(minutes) \|\| minutes < 1) return` … `if (hasPin) setLocked(true)`, no `logout()` branch |
| 17 | §20.4 — the security surface as a whole is only "specced" on our side | **MISLEADING — one control is fully built against the live DB** | The **Device PIN** row is live: enrolment is a two-step wizard calling `set_staff_pin`, status reads `staff_pin_status`, self-revoke calls `revoke_own_staff_pin`, verification at the lock screen calls `verify_staff_pin`, and an Owner can revoke another operator's PIN or trigger a reset email from the Staff Directory (`revoke_staff_pin_for`, `record_password_reset_request`). All six are SECURITY DEFINER RPCs confirmed present in the live DB, over `staff_auth_pins`, which has **RLS on with zero policies** — deny-all, reachable only through those RPCs. Weak-PIN rules are enforced in Postgres, deliberately not restated in the browser. | `src/modules/settings/sections/DevicePin.tsx:11-46`; `src/lib/auth.tsx:426`, `:459`, `:505`, `:525`; `src/lib/queries/staff.ts:174`, `:209`; live schema brief FUNCTIONS list + `staff_auth_pins \| on/0 POLICIES — deny-all` |
| 18 | §20.4 — the other three org controls (`Require 2FA for all users`, `Email confirmation for new devices`, `IP Restrictions`, `Single sign-on`) are "new" and ours adds the require-for-all framing | **GAP** | None of the four exists. The only 2FA in the repo is the **step-3 code field of the restore wizard** (`SystemRestoreModal.tsx:156`), which is part of a flow that then reports "This build has no restore service". `grep -rni "\bsso\b\|single sign\|ip restriction"` → zero hits outside that modal's prose. No `require_2fa`, no device-confirmation table, no allowlist table. | `grep -rni "two-factor\|sso\|ip restriction" src/` → `BackupRestore.tsx:148/220/229/647`, `SystemRestoreModal.tsx:17/156/275`, `System.tsx:160` only |
| 19 | §20.4 — the Booqable owner-bypass on IP Restrictions "is an owner-exemption ours will NOT copy, per Law 10" | **CONFIRMED** | No policy in the live schema grants Owner an exemption *from* a restriction. Owner appears in 120 policies, always as a member of an allowed-role list (a grant), never as an `OR role = 'Owner'` escape hatch bolted onto a narrower predicate. Every `*_money_blind` policy is exactly `auth_can_view_money()` with nothing OR'd onto it, and `auth_can_view_money()` admits Owner by role membership, not by bypass. | SQL: `select tablename,policyname,cmd,qual from pg_policies where schemaname='public' and policyname ilike '%money_blind%'` → all 8 quals are the bare string `auth_can_view_money()`; `select tablename,policyname,cmd from pg_policies where qual ilike '%''Owner''%'` → 120 rows, all role-list grants |
| 20 | §20.5 — the six unused features are deposits · purchase costs · buffers · portal accounts · contract signatures · away mode, and the OS onboarding checklist should walk Babin through "exactly these six" | **MISLEADING** | Five of the six have a built home in our schema and are unused only for lack of data; the sixth has no home at all, and that distinction is the whole build consequence. Deposits: `security_deposits` + `deposit_movements` + `deposit` sequence at 89. Purchase costs: `products.purchase_price`, `product_units.purchase_price`. Buffers: `products.prep_time_minutes` / `cleaning_time_minutes`, plus the `rentalTurnaround` setting. Portal accounts: `portal_users` / `portal_sessions` / `portal_auth_challenges` — all three RLS-on-zero-policies, i.e. deny-all. Contract signatures: `signatures` + `document_registry.signed_at`. **Away mode: nothing** (row 9). So the checklist is five "seed it" items and one "build it" item. | Live schema brief, the named tables/columns; SQL: `number_sequences` → `deposit, DEP-, 89`; row 9 above |
| 21 | §20.5 — "the bridge imports *operations*; every piece of *configuration* starts from us" | **CONFIRMED** | The Booqable sync map covers six entity families — clients, products/bundles, orders/lines, payments/deposits, availability/plannings, documents, plus `stock.ts`. There is **no settings, custom-field, security or rental-period mapper**, and `WRITEBACK_ALLOWLIST` carries no configuration path. `external_refs` holds 171 rows, all `booqable/clients` (100) and `booqable/products` (71) — no configuration entity has ever been pulled. | Repo export map, `src/lib/booqable/map/` = availability · clients · documents · orders · payments · products · stock; `src/lib/booqable/sync.ts` (`WRITEBACK_ALLOWLIST`, `FULFILLMENT_ACTION_PATHS`); live schema brief `external_refs \| 171 (booqable/clients=100, booqable/products=71)` |

---

## Corrected Layer D

### 20.1 Pro forma → the document number

```
source   GAP — not built. No invoice is created by this application.
         The DB is provisioned: invoices (0 rows), invoice_lines (0 rows),
         number_sequences['invoice'] = INV- / 120 / pad 1 / no year.
filter   n/a
order    n/a
window   n/a
money    invoices carries 7 money columns; RLS invoices_money_blind (SELECT,
         qual = auth_can_view_money()) + CASE-masking in no view (invoices has
         no _v twin — it is read direct, RLS-gated).
engine   src/lib/money.ts (price/VAT/discount), src/lib/queries/finance.ts
         (listInvoices and its eight named filter sets) — both built and tested,
         both currently reading an empty table.
action   GAP — not built. There is no createInvoice, issueInvoice or
         finalizeInvoice under src/actions/. When it is written, "Finalize" is
         the moment that calls
         rpc('next_document_number', { p_sequence_key: 'invoice' })
         and moves invoice_status Draft → Sent; "Send" is a separate,
         later action that writes document_deliveries.
Writes:  GAP — not built  →  invoices, invoice_lines, document_registry
Reads:   invoices (base table, RLS-gated; no invoices_v exists)
```

Two DB facts constrain the future Finalize:
* `reject_invoice_edit_after_issue` is already wired BEFORE UPDATE on `invoices`, so Finalize is a
  one-way door enforced in Postgres, not in the page.
* `recalculate_invoice_totals` fires AFTER INSERT/DELETE/UPDATE on `invoice_lines` — totals are the
  database's job; do not compute them in the action.

### 20.1b Document numbers generally

```
source   number_sequences (10 rows, keys: booking bundle client deposit equipment
         expense invoice membership payment quote)
engine   rpc next_document_number(p_sequence_key text) -> text
         format = prefix || lpad(n, padding, '0'), or prefix || year || '-' || lpad(...)
         when include_year (only 'payment' has include_year = true)
action   src/actions/clients/createClient.ts:338  ✅ correct arg name
         src/actions/finance/recordPayment.ts:330  ✅ correct arg name
         src/actions/documents/createDocument.ts:21 ❌ does NOT use the allocator —
           it calls issue('DOC', clock) from src/data/numbering.ts, and 'DOC' is
           not a sequence key. Rewrite before this action is implemented.
Writes:  next_document_number → number_sequences.current_value (via the RPC only)
Reads:   src/lib/queries/numbering.ts:207 → number_sequences (read-only preview;
         previewNextNumbers re-states the format in TS without minting)
```

Caution for the builder: `createClient.ts:270` documents a live driven test producing
`CL-2026-0001`. The live row today is `client / C- / 750 / padding 1 / include_year false`, which
yields `C-751`. The comment describes a sequence configuration that no longer exists.

### 20.2 Rental period settings → the operational day

```
source   localStorage, key br.settings.operationalDayStart  (NOT a table)
         default '06:00'; '00:00' restores plain calendar days
filter   src/lib/queries/bookings.ts — todaysOutgoing, todaysIncoming, overdue,
         operationQueue and every other "today" set build their from/to from
         operationalDayBounds(nepalDay(day), dayStartMinutesFrom(getSetting(...)))
order    n/a (a boundary, not a sort)
window   [06:00 today, 05:59:59.999 tomorrow] +05:45 — inclusive at both ends,
         because applyListFilters compares with lte
money    none — this setting carries no money
engine   src/lib/operationalDay.ts  (pure, Law 1: parseDayStart,
         dayStartMinutesFrom, operationalDayBounds, operationalDayOf)
action   per-field Save in Settings edit mode → writeSettings() → localStorage.
         Owner only (canManageSettings). No server-side enforcement, because
         there is no server side.
Writes:  src/modules/settings/Settings.tsx:161-163 (writeSettings) → localStorage
Reads:   src/lib/queries/bookings.ts:751-752 → getSetting('operationalDayStart')
```

DELIBERATELY EXCLUDED, and this is load-bearing: the operational day governs the **floor's** day
only. Finance day boundaries (`queries/finance.ts`), audit/activity day scopes (`queries/audit.ts`)
and BS rendering (`lib/bs.ts`) stay on calendar midnight. Moving a VAT period with a floor setting
would be a books-of-account change nobody ruled.

Everything else in §20.2 — **Away mode**, **Apply to manual bookings** / channel scoping, period
**modes**, `Enable time selection`, the pick-up/return **pair**, the New-period-picker flag:
**GAP — not built**, in the repo and in the database.

### 20.3 Custom fields

```
GAP — not built. Nothing in src/ and no table in the live schema.
The three scopes v2.5 names are fixed-column tables: clients, bookings, products.
A "custom field" today is a migration.
Writes:  GAP — not built
Reads:   GAP — not built
```

### 20.4 Security

```
BUILT AND LIVE — the staff PIN:
  source   staff_auth_pins (RLS ON with ZERO policies = deny-all; reachable
           only through SECURITY DEFINER RPCs) and staff_directory_v
           (WHERE auth_user_role() = 'Owner', joins auth.users)
  engine   Postgres. Weak-PIN rules (six identical, six sequential, last four of
           the staff row's mobile) live in set_staff_pin and are deliberately
           NOT restated in the browser.
  action   set_staff_pin(p_pin), verify_staff_pin(p_pin) -> jsonb,
           staff_pin_status() -> jsonb, revoke_own_staff_pin(),
           revoke_staff_pin_for(p_user_id), record_password_reset_request(p_user_id)
  Writes:  src/lib/auth.tsx:426 / :525 and src/lib/queries/staff.ts:174 / :209
           → staff_auth_pins (via RPC only — never a direct insert)
  Reads:   src/lib/auth.tsx:505 (staff_pin_status);
           src/lib/queries/staff.ts:119 → staff_directory_v

BUILT, localStorage only:
  passwordPolicy         (select Strict|Standard) — decorative: nothing reads it
  sessionTimeoutMinutes  ("Idle screen lock") — READ, by src/lib/auth.tsx:631.
                         0 = off = the default. Locks; never signs out. Stands
                         down entirely when hasPin is false.

RENDERED BUT INERT (Switch holds useState and propagates nothing):
  Two-factor authentication · Shared-device screen lock

GAP — not built:
  Require 2FA for all users · Email confirmation for new devices ·
  IP Restrictions (+ its owner exemption, refused by ruling) · Single sign-on
```

### 20.5 The unused-features ledger, corrected for our side

| Feature | Our side |
|---|---|
| Deposits | BUILT, unseeded — `security_deposits`, `deposit_movements`, `sync_deposit_balances` trigger, `deposit` sequence at 89 |
| Purchase costs | BUILT, unseeded — `products.purchase_price`, `product_units.purchase_price` (both money-masked in the `_v` views) |
| Buffers | BUILT, unseeded — `products.prep_time_minutes` / `cleaning_time_minutes`, plus the `rentalTurnaround` setting |
| Portal accounts | BUILT, deny-all — `portal_users` / `portal_sessions` / `portal_auth_challenges`, RLS ON with zero policies |
| Contract signatures | PARTIAL — `signatures` is session-scoped, `document_registry.signed_at` is document-scoped; nothing enforces which document types may carry one |
| **Away mode** | **GAP — not built.** The only one of the six with no table, no column and no code |

---

## Money and Law 6

**Money on this screen.** `/settings` itself shows money in exactly one place: the Business tab's
`FinancialPane` (VAT rate, crew coordination fee, payment terms, on-stop days, late-payment %,
the membership matrix) and the Branches tab's invented branch figures (Equipment Value, Monthly
Revenue/Profit, Branch Performance). **None of §20's own subjects carry money:** the operational-day
setting, custom fields, the PIN, the password policy and the idle-lock minutes are all money-free.
The pro forma (§20.1) is entirely money — and it is not built.

**Which roles are money-blind here.** `useCanViewMoney()` at `Settings.tsx:136` →
`rbac.canViewMoney`, blinding **Warehouse, Technician, Driver, Client** — the same four the database's
`auth_can_view_money()` blinds. An unidentified session is money-blind too.

**How it is gated, precisely.**
1. **UI removal, not disablement** — `Settings.tsx` drops the whole `FinancialPane` from the tree for
   a money-blind session, and the same rows never enter the Export-config CSV. "Hidden" here does
   mean *absent from the DOM*, which is the correct reading of Law 6.
2. **RLS + view masking** for anything that reaches Postgres. Verified this pass: all eight
   `*_money_blind` policies have the bare qual `auth_can_view_money()` with nothing OR'd onto them,
   and 20 of the 23 `_v` views additionally `CASE WHEN auth_can_view_money() THEN col ELSE NULL`.
   Two independent layers, as PLAN.md claims.
3. **Nothing server-side gates the settings themselves.** The Owner-only Edit button
   (`canManageSettings`, `Settings.tsx:151`) is a UI gate over `localStorage`. There is no row to
   protect, so there is no policy to protect it — including for `operationalDayStart`, which changes
   what every "today" list means.
4. **No Owner bypass anywhere.** Confirmed against `pg_policies`: Owner is granted, never exempted.
   §20.4's refusal to copy Booqable's owner exemption is honoured in the schema as it stands.

---

## What this changes for the build

1. **Stop treating §20.1 as documentation of something we have.** There is no invoice-creation path
   at all. When it is built, Finalize is the RPC moment (`p_sequence_key: 'invoice'`) and Send is a
   separate action writing `document_deliveries`; `reject_invoice_edit_after_issue` already makes
   Finalize one-way in Postgres, and `recalculate_invoice_totals` already owns the totals.
2. **Fix `createDocument.ts` before anyone sets `implemented: true` on it.** It mints a number from
   the clock via `issue('DOC', …)`, and `'DOC'` is not a `number_sequences` key — the correct call
   raises rather than falls back. This is the same class of defect as the `kind:` vs `p_sequence_key`
   bug, in a file that has not been caught yet.
3. **D4 is genuinely closed — cite it and move on.** `operationalDayStart` is built, read, rendered
   and tested. Do not re-open the 06:00 question; do re-read `operationalDay.ts`'s header before
   applying the day boundary anywhere new, because finance, audit and BS rendering are excluded on
   purpose.
4. **Promote the operational day out of `localStorage` before multi-operator use.** Every "today"
   panel in the product depends on a value stored per browser. `system_settings` (key/value/jsonb,
   RLS on, 2 policies) already exists and is completely unreferenced by application code — it is the
   obvious destination, and moving `operationalDayStart` first is the highest-value single migration
   on this screen.
5. **Custom fields is a from-zero build, not an adoption.** `{scope, name, order,
   show_on_documents, collect_at_checkout}` needs a table, a values table, a rendering pass on three
   fixed-column entities, and a document-rendering hook. Budget it as a feature, not a setting.
6. **Away mode is the only genuinely absent item on the six-feature onboarding checklist.** The
   other five are seed-the-data tasks against tables that exist. Split the checklist accordingly, or
   Babin will be walked through five configuration screens and one that does not exist.
7. **Label the two inert security switches on the page.** 2FA and Shared-device screen lock render as
   `role="switch"` with `aria-checked`, flip under the thumb, and forget on reload. The rail says the
   page has presentational controls; these two specifically claim a security posture the build does
   not have, which is worse than an admitted gap. Either wire them or badge them `NotBuilt`.
8. **Do not describe the security rows as "People & Access".** They are System ▸ Access. And the row
   named "session timeout" in v2.5 is "Idle screen lock" here, with inverted defaults (0 = off) and
   different semantics (locks, never signs out, no-ops without a PIN).
9. **`signatures` will not carry a document signature.** It is keyed to `operation_sessions`. If the
   contract-signature feature is picked up, it belongs on `document_registry` — and if L8 is to be
   more than prose, it needs a CHECK or trigger forbidding `signed_at` on `document_type = 'Tax
   Invoice'`, because today nothing does.
10. **Refresh `docs/pages/46_settings.md`.** It is materially stale against the code (see below);
    a builder trusting its line numbers will read the wrong file.

**Contradictions between the page doc and the current code — the code wins:**

| `docs/pages/46_settings.md` says | The code says |
|---|---|
| `Settings.tsx` is 630 lines; money gate at `:127`, `mayEdit` at `:142` | 682 lines; `useCanViewMoney()` at `:136`, `canManageSettings` at `:151` |
| Six section files (`shared`, `BranchesWarehouses`, `Financial`, `System`, `UsersRoles`, `Organisation`, `index`) | **Eight** — `DevicePin.tsx` and `StaffDirectory.tsx` are not in the doc at all, and they are the only live-DB surfaces on the page |
| System tab: "System preferences (Date format, Decimal places, **Session timeout**)" and "Access (2FA toggle, Password policy, Screen-lock toggle)" | Session timeout moved into **Access** as "Idle screen lock" on 25 Aug 2026, and Access now has a fifth row, the live **Device PIN** control (`System.tsx:163-203`) |
| Organisation card = General + Languages & Localization only | Organisation also carries the **"Operational day starts"** row, `settingKey: 'operationalDayStart'` (`Organisation.tsx:76-85`) — the D4 control the doc predates |
| §4: `createStockTransfer` — "`implemented` is not set, so it defaults to false and `createAction` throws" | `src/actions/inventory/createStockTransfer.ts:163` — `implemented: true` |
| §5: "nothing server-side enforces it, because nothing server-side is involved" | True of the 21 `localStorage` settings; **false of the page as a whole** — Device PIN and Staff Directory hit six SECURITY DEFINER RPCs and an Owner-only view |

**Known-bad facts from the v2.5 carry-list:** §20's lines 1292-1329 repeat **none** of them. No law
number is misquoted in this range (it cites D4, L8 and Law 10, all consistent with the corrections),
no `BrandKey`, no `Card`, no `ClickableRow`, no facet counts, no `kind:` RPC arg. Positively:
`Organisation.tsx:71` cites **"Law 7 — storage is UTC and rendering is Kathmandu"**, which
corroborates the correction that dates are Law 7, not Law 9.

---

## Open questions

1. **Does the operational day move to `system_settings`, and if so does the browser value become a
   cache or disappear?** — Settled by a ruling from Babin plus one migration seeding
   `system_settings('operationalDayStart', '"06:00"')` and one change to
   `queries/bookings.ts:751-752`. Until then, two operators can hold two different days.
2. **Who mints the invoice number — the action, or a DB trigger on `invoices`?** — Settled by reading
   the future `issueInvoice` spec against `reject_invoice_edit_after_issue`. The `charges` table shows
   the hazard: `charges_no_format` demands `CHG-YYYY-NNNN` and **no `charge` key exists in
   `number_sequences`**, so that table cannot mint its own number today. Do not repeat that shape for
   invoices.
3. **Is `passwordPolicy` (Strict/Standard) enforced anywhere, or purely a label?** — Settled by
   inspecting the Supabase Auth project settings (GoTrue password requirements), which this pass could
   not read: MCP exposes Postgres, not the auth configuration. Nothing in `src/` reads the key.
4. **Do the RLS policies actually behave per role?** — Still unverified project-wide, and it bears
   directly on §20.4. The MCP session runs as `postgres` with `rolbypassrls`, resolving
   `auth_user_role()` to `'Client'`. Settled only by an authenticated session per role (or by setting
   `app.current_user_id` to a real `users` row) and confirming money columns come back NULL for
   Warehouse, Technician, Driver and Client.
5. **Does §20.3's `show_on_documents` mean "on every document type" or "on a chosen set"?** — The
   capture shows the single value `All documents`, which cannot distinguish a fixed label from a
   one-option picker. Settled by one more read-only look at that column's control in Booqable, before
   the table is designed.
6. **Should Away mode block at reservation time or at booking time?** — Settled by a Babin ruling.
   The schema hint is `inventory_reservations.period tstzrange` with the exclusion constraint
   `inventory_reservations_no_double_booking`: a blackout expressed as a reservation would reuse that
   machinery, whereas a booking-time rule would be a new gate in `validate_booking_gates`.
