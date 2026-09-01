# Layer D verification — Collections, Settings ▸ Emails, Contract document
v2.5 section: §19 (lines 1248-1291)   ·   Our route(s): /settings
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

> **Structural note before anything else.** §19 carries **no `### Layer D` heading**. Only §4.5 has
> one; §19 is a Layer A/B/C observation sweep with backend-facing assertions embedded in prose
> ("maps 1:1 onto our audit-event types", "our Overdue Receivables report should pair with",
> "wire the T&C template to the same `operationalDayStart` setting"). Those embedded assertions are
> what is verified below. The Booqable-side observations (12 collections, 14 templates, the
> bilingual T&C) are Layer A and are **trusted, not re-checked**.
>
> **Headline: the comms half of this section is a clean GAP.** Migration `0008_automation_comms.sql`
> IS applied — all eleven comms tables exist live — and **not one line of `src/` reads any of them.**

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | §19.1 "our categories are collection-shaped (a curated tree with counts)" | **MISLEADING** | The table has the shape; the data and the UI do not. `inventory_categories` has `parent_id` and `sort_order` columns, but **all 6 live rows have `parent_id IS NULL`** — a flat list, not a tree. Nothing anywhere renders a per-category product count. | `select code,name,parent_id,sort_order from inventory_categories order by sort_order` → 6 rows (camera, lens, lighting, audio, grip, support), every `parent_id` null. Column list in the live schema brief. |
| 2 | §19.1 A "Collections" screen exists as a taxonomy surface | **GAP — not built** | There is no Collections route and no category-management screen. Categories are read-only join targets on the Inventory list. | ROUTES map — no `/inventory/collections` or `/settings/collections`. `src/lib/queries/inventory.ts:488` `CATEGORY_ALIAS = 'category'`; `:512` `category:inventory_categories!inner ( code, name )` — an embed for the facet, no write path. |
| 3 | §19.1 "tags simply do not exist" (on our side) | **MISLEADING** | True for products, false for clients. `products` has **no** `tags` column. `clients.tags` is `text[]` and exists live. | Live schema brief, `products` column list (no `tags`) vs `clients` column list (`tags:text[]`). |
| 4 | §19.2 BCC audit trail — "send a copy of all outgoing emails to" as an adopted setting | **GAP — not built** | No such setting key. `SettingKey` is a closed union of 21 keys; none is email- or BCC-related. Settings are per-browser `localStorage`, not a table (see #14). | `src/lib/settingsStore.ts:31-58` — the full `SettingKey` union. |
| 5 | §19.2 Shared `Header` / `Footer`, edited once, used in every template | **GAP — not built** | No template store of any kind is read. `notification_templates` exists live with `body_template`, `subject`, `variables:jsonb` — and **0 rows, 0 readers**. | `select count(*) from notification_templates` → **0**. Repo-wide search for `.from('notification_templates')` across `src/` → **zero hits**. |
| 6 | §19.2 14 system email templates with per-trigger toggles | **GAP — not built** | The four "Notifications" toggles on `/settings?tab=system` are **hardcoded literals with no persistence and no trigger** — `on: true/false` in a static array, not bound to a `settingKey`. The row that used to point at a template centre was deliberately deleted. | `src/modules/settings/sections/System.tsx:66-80` — `key: 'notifications'`, four `{ label, note, on }` fields, none carrying `settingKey`; the comment at `:70-73` records the removal of the "Notification templates" row. |
| 7 | §19.2 "event-per-template architecture … maps 1:1 onto our audit-event types" | **MISLEADING** | It cannot map 1:1: **`audit_action` has no send/email/notify label at all.** Its 22 labels are Login, Logout, Create, Update, Delete, Restore, Archive, Approve, Reject, Export, Import, Print, Download, Upload, Payment, Refund, Booking Created, Booking Cancelled, Maintenance Created, Case Created, Permission Changed, Password Changed. An email dispatch has no audit vocabulary to be recorded in. | `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='audit_action'` — 22 labels, listed. Live corpus holds only 3 `(module,action)` pairs, all `Rentals`. |
| 8 | §19.2 "…and the L9 sentence registry" | **UNVERIFIABLE** | No artefact named "sentence registry" exists in `src/` or `PLAN.md`. Its only other appearance is as an *open question* in a sibling verification doc. It cannot be confirmed or refuted because it is not a built thing. | `grep -rni "sentence registry" src/ docs/ PLAN.md` → one hit, `docs/booqable/layer-d/coupons-activity.md:201`, itself phrased as a question. Settled by: a PLAN.md ruling naming L9's registry and its key. |
| 9 | §19.2 "automated dunning exists … our Overdue Receivables report should pair with" | **MISLEADING** | The *filter* exists; the *report* does not, and no automation of any kind runs. `overdueInvoices(todayAd)` is a `ListFilters` builder feeding a chip on `/finance` — there is no `/reports/receivables` route and the word "dunning" appears nowhere in `src/`. `automation_rules`/`automation_logs` exist live, 0 rows, 0 readers. | `src/lib/queries/finance.ts:561` `export function overdueInvoices(todayAd: string): ListFilters`; consumed at `src/modules/finance/Finance.tsx:175` as `OVERDUE_INVOICES`. ROUTES map — the eleven `/reports/*` routes contain no receivables page. `grep -rni "dunning" src/` → zero. |
| 10 | §19.2 "the Settings rail matches the archive's 20 sub-pages" | **CONFIRMED (Booqable-side, Layer A — not a claim about us)** | This describes Booqable's own rail. Ours is **four tabs**, not twenty sub-pages: `business · people · branches · system`. Anyone reading this line as a target for `/settings` will build the wrong thing. | `src/data/settings.ts:79-83` — `export type TabKey = 'business' \| 'people' \| 'branches' \| 'system'`. `LEGACY_TAB` (`:146-158`) redirects the retired `communication`, `automation` and `ai` tabs into `system`. |
| 11 | §19.3 Contract document renders from a document store, with a Signature rail | **GAP — not built** | `document_registry` has **no query module and no write path**; the app says so in its own UI copy. `signatures` is 0 rows. `/documents` renders entirely from static seed data. | `src/modules/rentals/BookingDetail.tsx:653` — `ADD_DOCUMENT_UNAVAILABLE = 'Document uploads are not wired — document_registry has no write path from this screen.'`; `:1675-1678` repeats it for reads. `src/modules/documents/Documents.tsx:1-20` imports no supabase client and no `lib/queries/*`; its data comes from `src/data/documents.ts` (a seed module — see its header at `:6-18`). `select count(*) from signatures` → 0. |
| 12 | §19.3 The contract is a named document type | **WRONG-NAME** | Our enum label is **`Rental Agreement`**, not "Contract". The 16 `document_type` labels are Quotation · Rental Agreement · Packing List · Delivery Note · Return Report · Inspection Report · Damage Report · Tax Invoice · Receipt · Credit Note · Debit Note · Job Card · Service Report · Incident Report · Insurance Claim · Call Sheet. `DraftEmailModal` already uses the correct string. | `select enumlabel … typname='document_type'`. `src/modules/rentals/booking/DraftEmailModal.tsx:29` — `/** What is being drafted — "Quote", "Rental Agreement", etc. */`. |
| 13 | §19.3 "Wire the T&C template to the same `operationalDayStart` setting" | **MISLEADING** (half real) | The setting is real and load-bearing; **the T&C template does not exist**, so there is nothing to wire. `operationalDayStart` is a genuine `SettingKey`, editable on `/settings?tab=business`, and already drives the booking day-boundary engine. | Setting: `src/lib/settingsStore.ts:47` (key), `:227` (spec); surfaced at `src/modules/settings/sections/Organisation.tsx:83` `settingKey: 'operationalDayStart'`. Engine: `src/lib/queries/bookings.ts:751-752` `dayStartMinutesFrom(getSetting('operationalDayStart'))`, `:814/:818/:837`; `src/lib/operationalDay.ts:41` `OPERATIONAL_DAY_START_DEFAULT = '06:00'`. No T&C/terms template file exists in `src/`. |
| 14 | §19.3 (implied) the day-boundary setting is server-side, so a contract template could bind to it | **MISLEADING** | **Settings live in `localStorage`, one namespaced key per setting — not in a table.** `system_settings` exists live with **0 rows** and **0 readers in `src/`**. A per-browser value cannot render into a document a client signs. This is the sharpest build consequence in the section. | `src/lib/settingsStore.ts:12` (design note), `:379` `window.localStorage.getItem(PREFIX + key)`, `:421` `setItem`, `:439` `removeItem`. `select count(*) from system_settings` → **0**. Repo search for `.from('system_settings')` → zero hits. |
| 15 | §19.3 "the T&C template is per-language, versioned, and bound to the day-boundary setting" | **GAP — not built** | None of the three. No template store, no version column for one, no binding. The *language* axis half-exists as UI-string infrastructure (`Language = 'en'\|'ne'`, and `portal_language` enum is `NE`/`EN` live) but carries no document content. | `src/lib/i18n.ts` — `Language ('en'\|'ne')`, `EN`, `NE`, `t()`, `coverage()` — a UI string table, not a document template. `select enumlabel … typname='portal_language'` → `["NE","EN"]`. |
| 16 | §19.3 Biometric (fingerprint) consent implies stored biometric data | **GAP — not built** (and correctly so) | Nothing biometric exists in the schema. `client_documents.kind` is `client_document_kind`; `evidence_files` carries `media_type`/`category`, no biometric member. No repo code touches fingerprints. | Live schema brief — no biometric column or table across all 122 tables. `grep -rni "biometric\|fingerprint" src/` → zero. |
| 17 | §19.4 "Email compose modal — unopened … architecture captured via §19.2 instead" | **MISLEADING** (about our side) | We already have a compose modal, and it is deliberately send-less. `DraftEmailModal` prefills and edits a draft, then states a named reason instead of sending — because no comms backend exists. The spec treats email compose as uncaptured; ours is built and its refusal is documented. | `src/modules/rentals/booking/DraftEmailModal.tsx:23-24` — `EMAIL_SEND_UNAVAILABLE_REASON = 'No email backend exists in this build — there is no comms action to dispatch, so this draft cannot be sent or queued from here.'`; header comment `:6-20` records the removal of the fake "Email queued" toast under Law 12. |
| 18 | (Context question) Do comms/email tables exist live, and does anything in `src/` read them? | **CONFIRMED they exist · GAP on readers** | **All eleven exist and every one holds 0 rows.** `notification_templates`, `message_logs`, `notifications`, `broadcast_batches`, `sms_gateways`, `document_deliveries`, `automation_rules`, `automation_logs`, `webhooks`, `client_marketing_consents`, `client_channel_identities`. **Zero `.from('<table>')` calls in `src/` for any of them.** The only non-generated mentions are `src/archive/CommunicationSettings.tsx` (unrouted, imported by nothing) and `src/data/communicationSettings.ts` (imported only by that archive file). | `information_schema.tables` → all 11 present; `select count(*)` on each → 0. `grep -rn "from('notification_templates')\|from('message_logs')\|…" src/` → zero hits. `grep -rln "CommunicationSettings" src/` → only the archive file itself. `App.tsx` imports nothing from `src/archive/`. |

## Corrected Layer D

### 19.1 Collections → our Categories

    source   inventory_categories (BASE TABLE, 6 rows, RLS on/2). NOT a view; there is no
             inventory_categories_v.
    filter   none of our own. Reached only as a PostgREST to-one embed off the products list:
             category:inventory_categories!inner ( code, name )   (queries/inventory.ts:512)
    order    the table has sort_order 1..6, but the Inventory list orders by the embed:
             order=category(name).asc  (queries/inventory.ts:44) — alphabetical, NOT hand-ordered.
    window   n/a
    money    none. No money column on this table.
    engine   src/lib/queries/inventory.ts — CATEGORY_COLUMN / CATEGORY_ALIAS facet only.
    action   GAP — not built. No create/rename/reorder/reparent path exists.
    counts   GAP — not built. facetCounts.ts exists and is tested but is entirely unwired
             (countFacet imported only by its own test; useFacetCounts has no caller in src/;
             FilterOptionList mounted only in its own test). NO SCREEN SHOWS AN OPTION COUNT.
    tree     GAP in data. parent_id exists on the table; all 6 live rows are NULL.

    Writes: GAP — not built  |  Reads: inventory_categories (embed only, no dedicated query module)

### 19.2 Settings ▸ Emails

    source   GAP — not built. notification_templates / message_logs / document_deliveries /
             sms_gateways / broadcast_batches / automation_rules / automation_logs / webhooks /
             notifications / client_channel_identities / client_marketing_consents ALL EXIST LIVE
             (migration 0008_automation_comms is applied) and ALL hold 0 rows.
             NOT ONE IS READ ANYWHERE IN src/.
    filter   GAP — not built
    order    GAP — not built
    window   n/a
    money    none — no money on this surface
    engine   GAP — not built. There is no comms engine in src/lib and no comms module in
             src/lib/queries. The four "Notifications" toggles at /settings?tab=system are
             hardcoded literals (System.tsx:66-80) with no settingKey, no persistence, no trigger.
    action   GAP — not built. src/actions/ has no comms action module. The compose surface that
             does exist (DraftEmailModal) states a named reason instead of sending.

    Writes: GAP — not built  |  Reads: GAP — not built

    Settings persistence, correcting the section's implicit assumption:
    Every /settings value is stored in the VIEWER'S localStorage, one namespaced key per setting
    (settingsStore.ts:379/421/439). system_settings is 0 rows and has no reader in src/.

### 19.3 Contract document (our "Rental Agreement")

    source   GAP — not built for reads. document_registry exists (0 rows) with document_type,
             lifecycle_status, file_url, signed_at, signature_url; booking_documents links it to a
             booking; document_deliveries records Sent/Viewed/Downloaded. NONE has a query module.
             /documents and /finance/documents both render src/data/documents.ts — SEED DATA.
    filter   GAP — not built
    order    GAP — not built
    window   n/a
    money    per-line prices are shown on Booqable's contract. On ours this surface does not exist,
             so there is nothing to gate. When built, gate with useCanViewMoney (Law 6) — see below.
    engine   GAP — not built. No document-render engine, no T&C template store, no versioning.
    action   GAP — not built for document creation and for sending.
             The one built control is DraftEmailModal, which refuses with
             EMAIL_SEND_UNAVAILABLE_REASON (DraftEmailModal.tsx:23).

    Naming: our enum label is `Rental Agreement`, not "Contract".
    Signature rail: signatures table exists (0 rows), holding signature_role, signer_name,
    signed_at, signature_evidence_file_id, sealed_at. No screen reads it.

    Writes: GAP — not built → (would be) document_registry + booking_documents + signatures
    Reads:  src/data/documents.ts (static seed) — NOT document_registry

### The day-boundary binding the section asks for

    setting  operationalDayStart — REAL. settingsStore.ts:47 (key), :227 (spec),
             Organisation.tsx:83 (surfaced on /settings?tab=business).
    engine   operationalDay.ts (OPERATIONAL_DAY_START_DEFAULT '06:00', operationalDayBounds) and
             queries/bookings.ts:751-752/:814/:818/:837, which already read it.
    template GAP — not built. There is no T&C template to bind, per-language or otherwise.
    BLOCKER  the setting is per-browser localStorage. Before any document can render "06:00", the
             setting must move to system_settings (0 rows today) or the printed contract will say
             whatever the machine that generated it happened to have set.

## Money and Law 6

- **Nothing on `/settings` ▸ Emails is money**, because the surface is not built. When it is, a
  dunning template that interpolates an invoice total becomes a money surface and must be gated.
- **The money gating that already exists on `/settings` is real and is tab-shaped**: `FINANCIAL_SECTIONS`
  is deliberately kept out of the `FIELD_SECTIONS` map and reaches the page only through
  `FinancialPane`, which `Settings.tsx` renders only for a money-capable session — and the CSV export
  applies the same test, so a Warehouse operator's export never carries the financial labels
  (`src/modules/settings/sections/index.ts:9-20`). That is genuine "not built into the DOM", not CSS.
- **Money-blind roles** are fixed by `auth_can_view_money()`: **Warehouse · Technician · Driver · Client**
  (live function body). The same predicate runs in two layers — `*_money_blind` RLS policies and
  `CASE WHEN auth_can_view_money() … ELSE NULL` inside 20 of the 23 `_v` views.
- **For the contract document, when built**: per-line prices are money. Gate them with
  `useCanViewMoney` in the component *and* read through a masked view — never render the number and
  hide it. Note `document_registry` has **no** money column and **no** `_v` view, so a priced contract
  must join `invoice_lines` / `booking_lines_v`, both of which are already RLS- and view-gated.
- **Not money, but equally gated**: BCC/audit-trail email addresses and message bodies are PII, not
  money. `canViewPII` / `canViewNotes` in `src/lib/fieldGating.ts` are the right gate, not `moneyScope`.

## What this changes for the build

1. **Do not treat §19.2 as a spec for a built screen.** The entire Settings ▸ Emails surface is
   `GAP — not built` on our side: no template store read, no BCC setting, no header/footer, no
   toggles that persist. The four toggles that look like it are literals.
2. **Do not read "0 rows" as "no schema".** Migration `0008_automation_comms.sql` is applied and
   eleven comms tables are waiting, fully columned, with RLS on. Building comms is a wiring job
   (queries + actions + a screen), not a migration job. Do **not** write a new migration for it.
3. **`system_settings` must gain rows before any document template can exist.** Today `/settings`
   writes to `localStorage`. A contract that must print the contractual 06:00 boundary cannot read a
   per-browser value. Move `operationalDayStart` server-side first; the template work depends on it.
4. **Correct the document-type name everywhere.** The label is **`Rental Agreement`**, one of 16
   `document_type` members. "Contract" is Booqable's word and will not match the enum.
5. **`audit_action` cannot record an email send.** If the "event-per-template" architecture is
   adopted, the enum needs new labels (Send / Deliver / Bounce or similar) — that is a schema
   decision, and it is not made. Do not log an email dispatch as `Update`.
6. **The "Overdue Receivables report" the section pairs dunning with does not exist.** What exists is
   `overdueInvoices(todayAd)`, a filter feeding a `/finance` chip. Building dunning does not get a
   report for free.
7. **Category counts stay absent until `facetCounts.ts` is wired.** The module is written and tested;
   `countFacet` is imported only by its own test. A "collection-shaped, counted" taxonomy needs that
   wiring plus a category-management screen, neither of which exists.
8. **The category tree is flat in the data.** `parent_id` is on the table but NULL on all 6 rows.
   A hierarchy UI built now would render six roots and no children.
9. **`src/archive/CommunicationSettings.tsx` is not a head start.** It is unrouted, imported by
   nothing, and reads `src/data/communicationSettings.ts` — static seed data with `TO('/notifications')`
   destinations that resolve to no route. Do not resurrect it as the Emails screen.
10. **Keep the honest-refusal pattern.** `DraftEmailModal` is the model: draft, then a named reason
    (`EMAIL_SEND_UNAVAILABLE_REASON`) instead of a fake success toast. Any comms control shipped
    before the backend must follow it.

## Known-bad facts from v2.5 relevant here

- **§2.4 names `next_document_number(kind)`.** The live signature is
  `next_document_number(p_sequence_key text)`. supabase-js RPC args are named, so the spec's form
  fails at **runtime**, not compile time. Any document-numbering work implied by §19.3 must use
  `p_sequence_key`. Note also there is **no `document` or `contract` key** in `number_sequences` —
  its 10 keys are booking, bundle, client, deposit, equipment, expense, invoice, membership, payment,
  quote. A contract number cannot be minted today.
- **§2.4's `BrandKey` invents `purple` and drops `warn`.** The real union is
  `neutral | primary | progress | warn | success | danger`.
- **§2.4's `Card {…} (no subtitle)` describes `Page.tsx`'s Card.** The barrel exports `Card.tsx`,
  which **does** have `subtitle` (Card.tsx:19), plus `footer` and `padding`.
- **§2.4's engine list names 19 modules**; `src/lib` has 37 plus four subdirectories.
- §19 does **not** repeat the law-number errors (Law 7 dates / Law 14 768px / Law 15 44×44) or the
  `ClickableRow` invention — neither appears in lines 1248-1291.

## Open questions

1. **Should comms be built on the 0008 tables, or is 0008 abandoned?** Eleven tables, 0 rows, 0
   readers, and an archived screen that never used them. *Settled by:* a PLAN.md ruling on whether
   the comms module is in scope, and if so which of the eleven tables it uses.
2. **Where do email templates actually live — `notification_templates` or `document_registry`?**
   The spec's 14 templates mix transactional emails (password reset) with document sends (send quote,
   send contract). Ours has separate tables for each. *Settled by:* a decision that maps each of the
   14 named triggers onto one of our two tables.
3. **Does `audit_action` gain send/deliver labels?** Required before any email dispatch can be
   audited. *Settled by:* an enum decision in PLAN.md, then a migration.
4. **Does `operationalDayStart` move to `system_settings`?** Everything about a versioned, printed
   T&C depends on it. *Settled by:* a ruling on settings persistence — localStorage is a per-viewer
   store and cannot back a signed document.
5. **Is `Rental Agreement` versioned, and where does the Nepali text live?** `document_type` has one
   label with no version column and no language column; `portal_language` (`NE`/`EN`) is on
   `clients`/`portal_users`, not on documents. *Settled by:* a schema decision on template versioning
   and per-language bodies.
6. **Does the OS ever store biometric data?** The observed contract clause implies fingerprints are
   collected at handover. Nothing in the schema supports it and nothing here rules on it. *Settled by:*
   a legal/product ruling, which has weight far beyond this spec — flagged, not answered.
7. **Does `inventory_categories.parent_id` get used?** The column exists, the data is flat, the
   17-member `product_category` enum constrains `name`. *Settled by:* a ruling on whether categories
   are a tree (and if so, whether children must also be enum members).
