# Layer D verification — Product Settings tab, Variations, Customers→Clients
v2.5 section: §13 (lines 761-845)   ·   Our route(s): /clients
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only, Supabase MCP, project `sxguwvgoserhdolewibb`)

Layers A/B/C of §13 (what Booqable renders) are trusted and not re-checked. Everything below is
§13.6's `Backend data link` block plus the behavioural Layer D assertions §13.1/13.3/13.5 make
about our side.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `list  clients_v / client_directory_v` — the clients list reads one or the other | **MISLEADING** | The list reads **`client_directory_v` only**, and never `clients_v` directly. `clients_v` is touched at exactly one site in the whole clients query module: the 23505 duplicate-recovery branch of `createClient`. The two are not alternatives — `client_directory_v` is a view **over** `clients_v` (`FROM clients_v c`), so naming both as if either could serve the list invites a builder to pick the wrong one and lose 15 derived columns. | `src/lib/queries/clients.ts:347` (`listClients`), `:376` (`listClientRecords`), `:394` (`getClient`), `:441` (`getClientRecordByCode`), `:493`, `:555`, `:588` — all `.from('client_directory_v')`. `clients_v` only at `:711`. Base table `clients` only at `:697` (the INSERT). View chain: `select pg_get_viewdef('public.client_directory_v'::regclass, true)` → last line of the SELECT list is `FROM clients_v c`. |
| 2 | `— facets: type` | **MISLEADING** | A **type facet with live counts does render** (`Organisation` / `Individual` / `Unassigned`, each with a count) — so it is not a GAP. But it is **not a server-side facet count**: `clientMetrics(clients)` counts the rows **already in the browser**, over a fetch capped at `limit: 500`. Above 500 clients every chip count and the "Total Clients" KPI silently under-report. `countFacet`/`useFacetCounts` (`src/lib/queries/facetCounts.ts`) are **not wired to this screen or any other** — the only importer is their own test. There is no `booking_facets`-style RPC and nothing named `*facet*` exists in the DB. | Chips: `src/modules/clients/ClientsDirectory.tsx:865-867`; counts from `:404` `clientMetrics(clients)`; the counter is `src/data/clients.ts:1022-1035` (`typeOrg`/`typeInd`/`typeUnassigned` are `rows.filter(...).length`). Fetch cap: `src/lib/queries/useClients.ts:45` `listClientRecords({ limit: 500 })`. Unwired: `grep -rn "useFacetCounts\|countFacet" src/` returns only `facetCounts.ts` itself and `src/lib/queries/__tests__/facetCounts.test.ts`. |
| 3 | `(marketing n/a)` — no marketing-consent facet is possible for us | **MISLEADING** | The **`client_marketing_consents` table exists** (RLS on, 2 policies) with a `marketing_consent_state` enum of six labels, so the facet is modellable, not "n/a". What is true is that it holds **0 rows** and **nothing in `src/` reads it** — the only `marketing`-shaped code is the archived `src/archive/notifications/UnifiedInbox.tsx` over the `src/data/inbox.ts` seed. "Not built and unseeded" is the honest phrasing; "n/a" reads as "no such concept," which is wrong. | `select count(*) from client_marketing_consents` → 0. Enum: `select enumlabel from pg_enum … 'marketing_consent_state'` → `Not asked, Opted in, Opted out, Opt-In, Opt-Out, Do Not Disturb`. Table present in the live schema brief. `grep -rn "client_marketing_consents" src/` → no hits outside `src/types/supabase.ts`. |
| 4 | `detail  fetch by client id` | **WRONG-NAME** | The detail fetch is **by `client_code`, not by id**. `getClientRecordByCode(clientCode)` filters `.eq('client_code', clientCode)`; the route param `/clients/:id` carries the **code**, and `ClientRecord.id` is itself the client code, not the uuid. There *is* an id-keyed read (`getClient(id)`), but the screen does not use it — `useClientProfile` calls the code path. This matters: a builder wiring "fetch by client id" gets zero rows. | `src/lib/queries/clients.ts:436-456` (`getClientRecordByCode`, `.eq('client_code', …)` at `:443`); `src/lib/queries/clients.ts:199` `id: row.client_code` inside `toClientRecord`; `src/lib/queries/useClients.ts:93-108` (`fetchClientProfile` reads `filters.chips['client_code']`, calls `getClientRecordByCode`); `src/modules/clients/ClientDetail.tsx:13` imports `useClientProfile`. |
| 5 | `detail  … custom fields join` | **GAP — not built** | There is **no custom-fields table, view or column anywhere in the database**, and no custom-fields code in `src/`. Nothing to join. | `select count(*) from information_schema.tables where table_schema='public' and table_name ilike '%custom_field%'` → **0**. `grep -rn -i "custom.field" src/modules/clients/` → no hits. |
| 6 | `discount  NEW CLIENT FIELD: standing_discount_pct` | **GAP — not built (in the DB); half-built in the UI, which is worse** | **No such column exists** on `clients` — nor `discount_percent`. But the UI already renders and *edits* a `standingDiscountPercent`: it is an optional field on the `ClientRecord` seed type, populated only by the hard-coded `src/data/clients.ts` array. `toClientRecord` never sets it and `DIRECTORY_COLUMNS` never selects it, so on live data the field renders `—` while remaining an editable input. And `onSave` writes to component state only — `actions/clients/updateClient.ts` is a stub that `ClientDetail` deliberately does not call. So today an operator can type a standing discount, see it accepted, and have nothing persist. | `select count(*) … column_name in ('standing_discount_pct','discount_percent','barcode')` on `clients` → **0**. Type: `src/data/clients.ts:173` `standingDiscountPercent?: number`; seed values `:230`, `:334`. Rendered `src/modules/clients/ClientDetail.tsx:775-777`; editable `:206-215`. Absent from `src/lib/queries/clients.ts:161-167` (`DIRECTORY_COLUMNS`) and from `toClientRecord` (`:192-…`). Non-write: `ClientDetail.tsx:358-365` (`onSave` = `setDraft`), `:339` ("`updateClient` is still a stub"), `:621-622` ("Nothing in this app persists yet"). |
| 7 | `discount  … feeds lib/discount, which already owns Law 10. The gate lives in the engine, never the screen.` | **CONFIRMED (as an engine fact) / GAP (as a wiring fact)** | `src/lib/discount.ts` does own Law 10 and, as of the 31 Aug D3 amendment, does own exactly the standing-policy model §13.5 proposes: `validateDiscount` is the **policy-authorisation** check, `applyPolicy` is the zero-friction reference path, and the 25% cap and no-role-bypass survive. So the engine is right and the "gate lives in the engine" principle holds. What does **not** exist is any feed from a client into it — no column, no call site. `ClientDetail.tsx:206-215` even carries an explicit `TODO(decision) — PLAN.md §4.27` saying `ClientRecord` carries neither a reason nor an approver and the screen therefore refuses. | `src/lib/discount.ts:1-21` (the D3 header), `:32` `validateDiscount`, `:86` `DiscountPolicy`, `:122` `applyPolicy`. DB cap still binds independently: `booking_discounts_hard_cap` CHECK `percent <= 25` and `booking_discounts_over_ten_needs_reason_and_approver`. No caller: `grep -rn "applyPolicy" src/modules/clients/` → no hits. |
| 8 | `tax  per-client tax profile — GAP, single-rate today` | **MISLEADING** | Calling it a GAP is wrong at the schema layer and right at the app layer, and the spec states only the wrong half. **`client_tax_profiles` exists** (RLS on, 2 policies) with `profile_type customer_tax_profile` — a six-label enum (`VAT Registered`, `Non-VAT Customer`, `Tax Exempt`, `Government Organization`, `NGO`, `Corporate`) — plus `exemption_document_id`, `effective_from` and `superseded_at`. The mechanism was **already modelled**. It holds 0 rows, no screen reads it, and the Booqable importer explicitly declines to write it pending a ruling. So: **schema built, unpopulated, unwired** — not "GAP". | `select count(*) from information_schema.tables … 'client_tax_profiles'` → **1**; `select count(*) from client_tax_profiles` → **0**; RLS/policies: `pg_class`/`pg_policy` → `relrowsecurity=true, policies=2`. Enum labels from `pg_enum` on `customer_tax_profile`. Declines to write: `src/lib/booqable/map/clients.ts:177`, `:212`, `:220` ("this file does NOT write `client_tax_profiles` at all"). |
| 9 | `barcode  client barcode → @zxing scanner already in the stack` | **Split: @zxing CONFIRMED · client barcode GAP** | `@zxing/browser ^0.2.1` and `@zxing/library ^0.23.0` are real dependencies, so "the scanner exists" is true. **There is no barcode on a client**: no `barcode` column on `clients`, none on `client_directory_v`, and zero barcode/scanner references anywhere in `src/modules/clients/`. Barcodes in this system live on `product_units` (`barcode`, `qr_code`) and `containers`. | `package.json:37-38`. `select count(*) … table_name='clients' and column_name … 'barcode'` → 0; `… table_name='client_directory_v' and column_name ilike '%barcode%'` → **0**. `grep -rn -i "barcode\|scanner" src/modules/clients/` → no hits. |
| 10 | `custom  ONE custom-fields system serves per-booking "Add field" (§10.1) and per-client fields, with ONE admin surface` | **GAP — not built** | Aspiration, not a data link. No custom-fields table, no admin surface, no code. See row 5. | Same SQL as row 5. `grep -rn -i "custom.field" src/` → no implementation hits. |
| 11 | `accounts  … The deny-all on the 3 portal_* tables can end.` | **CONFIRMED (the premise) — but it is a proposal, not a data link** | The premise is exactly right: `portal_users`, `portal_sessions` and `portal_auth_challenges` all have **RLS enabled with ZERO policies**, which is deny-all to every non-`bypassrls` role. All three hold 0 rows. Whether that "can end" is a decision, not a verified fact, and no code reads any of the three. | `select c.relname, c.relrowsecurity, count(p.polname) from pg_class c … left join pg_policy p … where relname in ('portal_users','portal_sessions','portal_auth_challenges')` → all three `relrowsecurity=true, policies=0`. |
| 12 | §13.3's Booqable rail counts (Individual 338 / Company 30) and volume 368 are a shape we can mirror | **MISLEADING as a target for our screen** | Our corpus is not shaped like theirs. `clients` = **366 rows, ALL of them `type_parent='Individual'`, ZERO `Organisation`**, and 0 deactivated. Our `client_type_parent` enum is `{Organisation, Individual}` — there is no "Company" label and no third member, so the screen's `Unassigned` chip counts rows whose `type_parent` came back null. A builder testing the type facet against live data today sees `Organisation 0 · Individual 366 · Unassigned 0` and may wrongly conclude the filter is broken. | `select count(*) from clients where type_parent='Individual'` → 366; `… 'Organisation'` → 0; `select count(*) from clients` → 366; `… where deactivated_at is null` → 366. Enum: `pg_enum` on `client_type_parent` → `{Organisation, Individual}`. |
| 13 | §13 context claim: **Law 17 is breached in shipped code** (`VERIFICATION_2026-08-31.md:174-186`, six sites) | **CONFIRMED — all six, verbatim at the cited lines** | The breach is real and every line number holds. `delivery_type`'s enum member is spelled `'Customer Pickup'` in Postgres; the **write** path is clean (`NewRental` offers `Client Pickup`, `createRental.ts:100` maps it), but **no inverse map was ever written**, so the raw enum renders into the DOM at six sites. `grep -rn "deliveryTypeLabel" src/` returns **nothing** — the inverse function does not exist. | `src/modules/rentals/BookingDetail.tsx:1453` `{booking.deliveryType}`; `src/modules/today/MovementList.tsx:218` `['Delivery mode', m.deliveryType]`; `src/modules/rentals/PackingWorkspace.tsx:711`; `src/modules/rentals/HandoverWorkspace.tsx:813` and `:845` (`<InfoRow label="Delivery" value={floor.deliveryType ?? '—'} />`); `src/modules/rentals/ReturnWorkspace.tsx:872`. Write path: `src/actions/rentals/createRental.ts:100`. |
| 14 | Corollary for **this** route: does `/clients` breach Law 17? | **REFUTED — `/clients` is clean** | Not one rendered "customer" string exists in `src/modules/clients/`. Every hit in that directory is a **comment** explaining the rename, and `MovementList.tsx:218` even carries a Law-17 note beside the leak. The six breaches are all on the **rentals/dashboard** surfaces, none of which is this screen. Correcting them does not touch `/clients`. | `grep -rn -i "customer" src/modules/clients/` → only `Clients.tsx:24`, `ClientsDirectory.tsx:288`, `AddClient.tsx:50,54-56` — all prose in block comments. Tab labels are `Clients · Membership · Referral · Credit` (`Clients.tsx:37-42`). |
| 15 | Three tests already assert Law 17, so the law is covered | **MISLEADING** | The three tests assert over **static label constants only** (`GROUP_LABEL`, the reports catalog's words, the rentals-list labels). None renders a component holding a `deliveryType` value, so none can catch this class of leak — which is why six sites shipped. | `src/modules/reports/__tests__/catalog.test.ts:76-84`; `src/modules/operations/__tests__/operationsQueues.test.ts:174-175` (`Object.values(GROUP_LABEL).join(' ')`); `rentalsList.test.ts:667`. |

### Known-bad facts from the task brief that §13 repeats

- **`facetCounts` unwired** — §13.6's `facets: type` implies a facet-count mechanism. It is served by
  in-browser `clientMetrics`, not by `countFacet`/`useFacetCounts`, which have no caller in `src/`
  (row 2). Nothing named `*facet*` exists in the DB either.
- §13 does **not** repeat the Law-number errors, the `BrandKey purple` invention, the `Card`
  mis-description, the `next_document_number(kind)` signature, `ClickableRow`, or the 19-engine
  list. Those six known-bad facts are absent from lines 761-845.

---

## Corrected Layer D

```
list       source   client_directory_v   ← a VIEW OVER clients_v, which is a view over clients.
                    Never read clients_v or clients directly for the list; you lose 15 derived
                    columns (counts, contact, membership, kyc, is_blocked) and both money gates.
           filter   .is('deactivated_at', null)      (Law 3 — closed accounts retained, not shown)
                    optional .or(name.ilike / client_code.ilike / phone.ilike)  — server-side
           order    .order('created_at', { ascending: false })
           window   .limit(500) via useClients → listClientRecords
                    ⚠ THE FACET COUNTS AND THE "Total Clients" KPI ARE COMPUTED OVER THIS SLICE.
                      366 rows live today, so it is currently exact; it breaks silently at 501.
           money    outstanding_amount / deposit_held_amount / total_paid_amount → NULL unless
                    auth_can_view_money(); approved_credit_limit + payment_terms → NULL by
                    inheritance from clients_v; whole view → 0 rows unless auth_is_staff()
           engine   src/data/clients.ts → clientMetrics() (chips + KPIs, IN-BROWSER)
                    src/data/clients.ts → creditStopVerdict() (On Stop, derived; overdue limb
                    reports "unavailable" here because the view publishes no invoice due dates)
           action   —
           Reads: client_directory_v   |   Writes: none

detail     source   client_directory_v, addressed BY CLIENT CODE — not by id
           filter   .eq('client_code', <route :id, which carries the CODE>)  .maybeSingle()
                    deliberately NOT filtered on deactivated_at (a link to a closed account opens)
           order    —      window  1 row
           money    same three masked columns; screen also gates on useCanViewMoney()
           engine   toClientRecord() + ClientProfile { deactivatedAtAd, membershipKnown }
           action   GAP — actions/clients/updateClient.ts is a STUB. ClientDetail.onSave writes
                    component state and says so on screen. Do not wire a success toast to it.
           Reads: client_directory_v   |   Writes: GAP — not built

create     source   —
           action   src/actions/clients/createClient.ts → INSERT INTO clients (base table)
                    Law 8: 23505 on client_uuid is a replay, recovered via clients_v → getClient
           Writes: actions/clients/createClient.ts → clients   |   Reads back: client_directory_v

block      action   src/actions/clients/blockClient.ts → INSERT INTO client_flags (flag_type
                    'Blocked'); unblock sets removal fields. Never a DELETE (Law 3).
                    Surfaces as client_directory_v.is_blocked, an EXISTS() in the view — so the
                    only way to see a block land is a re-read (useClients().refresh).
           Writes: actions/clients/blockClient.ts → client_flags   |   Reads: client_directory_v

facets     GAP as a server-side mechanism. The type chips are real and counted, but counted in
           the browser by clientMetrics over the fetched slice. countFacet / useFacetCounts exist,
           are tested, and have NO caller in src/. No facet RPC, view or table exists in the DB.

discount   standing_discount_pct   GAP — not built. No such column on clients; none proposed in a
           migration. The UI field standingDiscountPercent is a seed-only property of the
           ClientRecord type: never selected by DIRECTORY_COLUMNS, never set by toClientRecord,
           editable but non-persisting. Either wire it or remove the input; leaving an accepted
           edit that vanishes is the worse of the three states.
           The ENGINE is ready: src/lib/discount.ts already implements the §13.5 proposal as of
           the 31 Aug D3 amendment (validateDiscount = policy authorisation once; applyPolicy =
           zero-friction reference; 25% cap and no-role-bypass intact, and the DB CHECKs
           booking_discounts_hard_cap / _over_ten_needs_reason_and_approver enforce it anyway).
           Writes: GAP   |   Reads: GAP

tax        NOT a GAP at the schema layer. client_tax_profiles EXISTS (RLS on, 2 policies, 0 rows):
           client_id, profile_type customer_tax_profile {VAT Registered | Non-VAT Customer |
           Tax Exempt | Government Organization | NGO | Corporate}, exemption_document_id,
           effective_from, superseded_at — i.e. an effective-dated, evidence-backed profile.
           Unwired: no screen reads it, and lib/booqable/map/clients.ts declines to write it
           pending a ruling. Decision needed is "adopt the model we already have", not "build one".
           Reads: GAP (table exists)   |   Writes: GAP (deliberate — map/clients.ts:220)

barcode    client barcode   GAP — no barcode column on clients or client_directory_v, and no
           scanner reference in src/modules/clients/. @zxing/browser + @zxing/library ARE in the
           stack (package.json:37-38) and BarcodeScannerModal.tsx exists on disk (not barrelled).
           Barcodes today live on product_units.barcode / .qr_code and containers.

custom     custom fields   GAP — not built. Zero custom-field tables in the database, zero code.
           There is nothing to "join" and no admin surface to unify.

accounts   portal_users / portal_sessions / portal_auth_challenges: RLS ENABLED, ZERO POLICIES =
           deny-all to every non-bypassrls role; 0 rows; no reader in src/. §13.6's premise is
           confirmed; whether the deny-all "can end" is an open decision, not a data link.
           Any screen written against these three gets nothing AND NO ERROR.
```

---

## Money and Law 6

**The money figures on `/clients`:** the `Outstanding` KPI and its "N clients" note; the
`Outstanding`, `Deposit Held` and `Credit Limit` columns/cards in the directory; the `Payment Due`
filter chip and the `Payment Due` saved view; the whole **Credit** tab; and the Membership tab's
plan fees and discount percentages (from `membership_plans_v`).

**Who is blind here:** `auth_can_view_money()` = `auth_user_role() NOT IN ('Warehouse',
'Technician','Driver','Client')`. Those four roles are money-blind on this screen.

**How the gating is actually achieved — three layers, and all three are real:**

1. **Masked view, inherited through a view chain.** `client_directory_v` selects
   `FROM clients_v c`. Its own three CASE expressions NULL `outstanding_amount`,
   `deposit_held_amount` and `total_paid_amount` unless `auth_can_view_money()`; `approved_credit_limit`
   and `payment_terms` are passed straight through from `clients_v` — **which masks them itself**,
   so they are NULL for money-blind roles too. The chain also carries `clients_v`'s
   `WHERE auth_is_staff()`, so a `Client` session gets **zero rows**, not masked rows.
   (Verified: `pg_get_viewdef('public.client_directory_v')`.)
2. **RLS on the base tables** — the `*_money_blind` policies on `invoices`, `payments`,
   `security_deposits`, `deposit_movements` etc., all `USING auth_can_view_money()`. The directory's
   lateral joins read those tables, so a blind role's sums have nothing to sum even before the mask.
3. **`useCanViewMoney()` in the UI** — `Clients.tsx:51` and `ClientsDirectory.tsx`. This is what
   makes "hidden" mean **not built into the DOM**: the `Credit` tab is *filtered out of `TAB_DEFS`*
   (`Clients.tsx:80`), the `Payment Due` chip is spread in conditionally
   (`ClientsDirectory.tsx:869`), and the Outstanding KPI is conditionally constructed. These are
   absences, not `display:none` — nothing to inspect, nothing to un-hide.

**The one lossy seam, and it is documented in the code.** `toClientRecord` maps a masked `null`
into `0 as Paisa` because the legacy `ClientRecord` type has no way to spell "withheld"
(`src/lib/queries/clients.ts:218-224`). Every consumer must gate on the role *before* reading
those fields; the honest shape is `ClientListItem`, whose money stays `Paisa | null`. Any new
surface should take `ClientListItem`, not `ClientRecord`. Similarly `creditUsedPaisa` is a
hard-coded `0` type obligation, explicitly not a measurement (`:225-237`).

**Not verified:** policy correctness *per role*. Reading the view definition and the policy text is
not the same as signing in as Warehouse and confirming the columns come back NULL. That needs an
authenticated session per role (or `set_config('app.current_user_id', …)` against a real `users`
row, since `auth_user_role()` reads `users.primary_role`). No pass has done it.

---

## What this changes for the build

1. **Stop writing "`clients_v` / `client_directory_v`" as if they were interchangeable.** Every
   clients read is `client_directory_v`. `clients_v` appears once, in `createClient`'s replay
   recovery. The base table `clients` is written by exactly one INSERT. Anything that says
   otherwise in a downstream doc is wrong.
2. **Fix the detail-fetch key in the spec: it is `client_code`, not id.** `/clients/:id` carries
   the code, and `ClientRecord.id` *is* the code. A builder who codes §13.6's "fetch by client id"
   literally gets zero rows and will blame the view.
3. **Resolve `standingDiscountPercent` before anything else on the client record.** It is currently
   the worst of the three possible states: an editable input, over a property no query selects,
   saved by a stub. Either (a) add the column + wire `updateClient` + route it through
   `applyPolicy`, or (b) remove the input. Do not leave it. Note the engine side is already done —
   `src/lib/discount.ts`'s D3 amendment implements §13.5's proposal, so §13.7's open decision 1 is
   **closed in the engine** and only the column and the wiring are missing.
4. **Re-file the tax profile from "GAP" to "built, unpopulated, unwired."** `client_tax_profiles`
   already models effective-dated, evidence-backed, six-label profiles. §13.7's decision 2 is not
   "support it or not" but "adopt the model already in the schema, or retire it." That is a much
   cheaper question and it should be re-asked in those terms.
5. **Do not plan a facet-count feature around `facetCounts.ts`.** It is dead code with no caller and
   no server-side counterpart. The type chips on `/clients` work by counting in the browser. Either
   wire `useFacetCounts` (and give it a DB counterpart) or accept the in-browser count — but then
   **raise or paginate the 500-row cap**, because the counts and the Total-Clients KPI go silently
   wrong at 501 clients. 366 today; +10 in 11 days by §13.3's own observation.
6. ✅ **DONE 1 Sep** — `deliveryTypeLabel` in `lib/format.ts`, applied at all six sites, with a
   DOM-level test in `BookingDetail.layout.test.tsx` and 15 unit/guard tests. Live incidence was
   **246 of 246 bookings**. Original prescription kept below for the record.
   **Fix Law 17 with one function, not six edits, and test it by rendering.** Add
   `deliveryTypeLabel(enum): string` as the inverse of `createRental.ts:100`'s map, apply it at the
   six sites, and add a test that renders a component with `deliveryType: 'Customer Pickup'` and
   asserts the DOM text. The three existing Law-17 tests assert over static constants and
   structurally cannot catch this class. **None of this touches `/clients`, which is clean.**
7. **Never write a screen against `portal_users` / `portal_sessions` / `portal_auth_challenges`
   without adding policies first.** RLS on + zero policies is deny-all and returns an empty result
   with **no error** — the most expensive failure mode to debug.
8. **Expect an all-Individual corpus when testing the type facet.** 366/366 are `Individual`, 0
   `Organisation`, 0 deactivated. `Organisation 0` is corpus, not a broken filter. Also: our enum
   is `{Organisation, Individual}` — "Company" is Booqable's word and must not enter our code.

---

## Open questions

1. **Does the standing client discount get its own column on `clients`, or a `discount_policies`
   row it references?** §13.5's ruled proposal and `lib/discount.ts`'s `DiscountPolicy` shape both
   point at a policy *row* (it needs a reason, an approver and a raise-retriggers rule — a scalar
   column cannot carry those). *Settles it:* Babin ruling on PLAN.md §4.27, then one migration.
2. **Is `client_tax_profiles` adopted or retired?** *Settles it:* a finance ruling on whether any
   Nepali client of this business is ever non-13%. If yes, wire the existing table; if no, mark it
   retired so no one re-opens it a fourth time.
3. **Does the directory move to server-side counts, or does the 500 cap rise?** *Settles it:* a
   decision on expected client volume over 24 months. Below ~2000, raising the cap is cheaper than
   wiring `countFacet` plus a DB counterpart.
4. **Do money-blind roles actually receive NULLs here?** Read-only inspection cannot answer it.
   *Settles it:* a test that opens a session as each of Warehouse / Technician / Driver / Client
   (real `users` rows, `primary_role` set) and asserts `outstanding_amount IS NULL` and
   `approved_credit_limit IS NULL` from `client_directory_v`, plus zero rows for `Client`.
5. **Client barcode: adopt?** *Settles it:* a product answer on whether check-in-by-scan of a
   *person* is wanted at all. If yes it is a column + a reuse of the existing `@zxing` scanner; if
   no, close §13.7 decision 3 permanently.
6. **Which `type_parent` does an imported/unspecified client get?** The screen has an `Unassigned`
   chip but the enum has only two members, so `Unassigned` means "null in the column." *Settles
   it:* confirming whether `clients.type_parent` is nullable and whether null is intended as a real
   third state or an import defect. (Not queried this pass — I captured the enum, not the column's
   NOT NULL flag.)
