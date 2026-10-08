# Client Detail
Route `/clients/:id` (`src/App.tsx:576-583`) · component `src/modules/clients/ClientDetail.tsx` · 1177 lines

## 1. What it is
A single client's profile, addressed by `client_code` from the URL (`ClientDetail.tsx:247`, `src/lib/queries/clients.ts:443`), rendered as a header + KPI strip + six-tab body (`ClientDetail.tsx:75-82`, `:442-1164`).
It reads three live queries — the client record, that client's bookings, that client's invoices (`ClientDetail.tsx:275`, `:339-351`) — and derives an On-Stop verdict from them (`:399-408`).
Every write on the page lands in component state only: `onSave` calls `setDraft` and nothing else (`ClientDetail.tsx:313-321`), and the page says so on screen in edit mode (`:575-595`).

## 2. What renders

Desktop, top to bottom:

1. **PageHeader** — client name, `id · clientType` subtitle, and an action row (`ClientDetail.tsx:444-552`): VIP chip (`:456`), Blocked chip (`:457`), On Stop chip (`:461-463`), Edit Client / Done+Discard (`:464-500`), Merge Duplicate (`:501-503`), Block/Unblock wrapped in `Unavailable` and **disabled** (`:530-538`), Start Rental (disabled when blocked, `:539-549`).
2. **Blocked ErrorBanner** — only when `client.isBlocked`; the reason text is role-gated by `canViewOnStopReason` (`ClientDetail.tsx:556-569`).
3. **Unsaved-changes ErrorBanner** — set by a refused `stopEditing` (`ClientDetail.tsx:571`, `:464-478`).
4. **"Editing this session only" notice** — rendered whenever `edit.editing` (`ClientDetail.tsx:575-595`).
5. **KpiStrip** — Total Rentals always; Outstanding, Deposit Held, Lifetime Spend only when `money` (`ClientDetail.tsx:431-440`, `:597`).
6. **Tab strip** — Overview · Rentals · Payments · Documents · Notes · Activity; Payments is dropped for a money-blind session (`ClientDetail.tsx:75-82`, `:325`, `:601-630`). The strip is `overflowX: 'auto'` at every width (`:601`).
7. **Tab body**, one of six:
   - **Overview** (`:632-874`) — auto-fit grid, `minmax(280px, 1fr)`: Identity card (`:634-654`), Contact card (only if `canViewPII`, `:659-681`), Authorized Contact Person card (only if `canViewPII`, `:683-697`), Membership & Credit card (`:699-857`) containing the On-Stop alert (`:743-782`), the partial-check notice (`:793-827`) and the legacy manual on-stop rows (`:837-845`), and a Reliability card rendered only when `client.reliability` exists (`:861-872`).
   - **Rentals** (`:876-971`) — a `PageBody`-wrapped list of this client's bookings.
   - **Payments** (`:973-1091`) — Financial summary `SummaryRows` (`:975-987`) plus an invoices list (`:988-1089`). Gated `activeTab === 'payments' && money` (`:973`).
   - **Documents** (`:1093-1110`) — a hard-coded `EmptyState` saying the registry is not queried.
   - **Notes** (`:1112-1130`) — a textarea in edit mode, the note text, or an `EmptyState`.
   - **Activity** (`:1132-1160`) — four derived facts from the record; the footnote states no audit trail is wired (`:1154-1158`).
8. **FooterNote** (`ClientDetail.tsx:1162`).

**Responsive bands.** The file reads the viewport once, via `useViewport()` (`ClientDetail.tsx:262`), and reduces it to a single boolean: `tabular = viewport !== 'phone'` (`:263`). `useViewport` reads **both** locked breakpoints — 768 and 1180 (`src/lib/device.ts:43`, `:45-51`) — but this page branches on the **768** boundary only:

- **< 768 (phone)**: the Rentals table becomes one card per booking with a 44px "Open booking" link (`ClientDetail.tsx:904-926`); the Invoices table becomes one card per invoice with a 44px "Open …" link (`:1011-1038`).
- **≥ 768**: both render as tables with `minWidth: 640` / `minWidth: 680` inside `overflowX: 'auto'` wrappers (`:928-967`, `:1040-1086`).
- **1180** changes nothing this file decides. It reaches the page indirectly through `KpiStrip`, which clamps to 2 columns on phone and 3 on tablet (`src/components/ui/Page.tsx:203-213`).

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| The client record (header, Identity, Contact, Contact Person, Membership & Credit, Activity, Notes, KPI strip) | DB | `client_directory_v`, `.eq('client_code', …).maybeSingle()` — `src/lib/queries/clients.ts:436-456` (`getClientRecordByCode`), mapped by `toClientRecord` (`:192-282`), fetched via `useClientProfile` (`src/lib/queries/useClients.ts:93-108`) |
| Rentals tab rows | DB | `bookings` + embedded `clients(name)`, `booking_lines(id, qty)` — `listBookings`, `src/lib/queries/bookings.ts:410-478`; filtered `chips: { client_id: [uuid] }` (`ClientDetail.tsx:339-346`); short-circuits to `{rows:[],total:0}` with no network call while the uuid is unknown (`ClientDetail.tsx:234-239`) |
| Payments tab · Invoices table | DB | `invoices` + embedded `clients(name)`, `bookings(booking_no)` — `listInvoices`, `src/lib/queries/finance.ts:452-478`; filter set `invoicesForClient(uuid)` = `client_id IN (uuid)` AND `voided_at IS NULL`, sorted `issue_date desc` (`src/lib/queries/finance.ts:581-587`) |
| Payments tab · Financial summary (Outstanding, Deposit Held, Credit Limit, Lifetime Spend) | DB | Same `client_directory_v` row — aggregates `outstanding_amount`, `deposit_held_amount`, `approved_credit_limit`, `total_paid_amount` (`src/lib/queries/clients.ts:193-196`, `:222-224`, `:263`) |
| On Stop verdict — overdue limb | DB | Derived in the page from the invoices rows above: worst `daysPastDue(inv.dueDateAd)` over non-Draft, non-settled invoices (`ClientDetail.tsx:385-397`; `src/data/clients.ts:1241-1245`) |
| On Stop threshold (*N* days) | LOCAL | **Not** `corpus.ts`. `readOverdueStopDays()` → `getSetting('overdueStopDays')` → browser `localStorage` with a registry default of **30** (`src/data/clients.ts:1255-1257`; `src/lib/settingsStore.ts:381-383`, `:146-156`) |
| Membership Tier row | DB (with a fabricated fallback) | `client_directory_v.membership_level`; when the LEFT JOIN yields `null` the mapper substitutes `UNJOINED_MEMBERSHIP_PLACEHOLDER = 'Academy'` (`src/lib/queries/clients.ts:208`, `:284-314`) |
| Tags row | DB (column not published) | `clients.tags` is a real `text[]` but `client_directory_v` does not carry it and `toClientRecord` never sets it, so the row renders `'—'` on every database record (`ClientDetail.tsx:644-648`; mapper `src/lib/queries/clients.ts:192-282` has no `tags` key) |
| Reliability card, `addresses`, `standingDiscountPercent`, `discountSource`, `isVip`, `blockReason`, `notes`, `postalCode`, `businessRegistrationNo`, legacy `onStop` | none (unset) | All are optional on `ClientRecord` (`src/data/clients.ts:78-169`) and none is written by `toClientRecord`, so each card/row is either absent or em-dashed on a database record |
| Documents tab | none | No documents query module exists; the tab renders a fixed `EmptyState` (`ClientDetail.tsx:1093-1110`) |
| Activity tab | DB (re-read of the same record) | KYC status/count, active-rental count, last rental, blocked flag — all fields of the same `client_directory_v` row (`ClientDetail.tsx:1132-1153`) |
| Booking stage colour | — | `statusToken` over the canonical six (`src/lib/workflow.ts:43-59`) |
| Invoice status colour | SEED-adjacent constant | `INVOICE_TOKEN`, a hand-written status→token map in `src/data/invoiceIntel.ts:28-35`. A colour table, not a figure |
| Mock mode (`VITE_DATA_SOURCE=mock`) | LOCAL | `src/lib/mock/corpus.ts` serves `clients`, `bookings`, `booking_lines`, `invoices`, `payments`, `security_deposits` and synthesises `client_directory_v` (`corpus.ts:405-427`, `:443-501`). `client_flags` is **UNSERVED** (`corpus.ts:33-44`), so `is_blocked` is hard-`false` (`corpus.ts:498`), and `membership_level`, `contact_name`, `contact_designation`, `contact_phone` are hard-`null` with KYC counts `0` (`corpus.ts:492-497`) |

No row on this page comes from a `src/data/*.ts` constant array. `CLIENTS_DATA` (`src/data/clients.ts:171`) is **not** imported by this file — the imports from that module are `TIER_TONE`, `creditStopFactsOf`, `daysPastDue`, `evaluateCreditStop`, `readOverdueStopDays` and the `ClientRecord` type only (`ClientDetail.tsx:29-36`).

Invented on this page: the Membership Tier reads **"Academy"** for any client with no membership row (`src/lib/queries/clients.ts:208`, `:314`); Credit limit / Outstanding / Deposit Held / Lifetime Spend print **Rs 0** where the view returned `null` — an absent approved limit or a withheld money column — because `toClientRecord` coalesces the null (`src/lib/queries/clients.ts:222-224`); and the two literal strings **"Not yet defined (Open ⭐ #2)"** (`ClientDetail.tsx:706`) and **"Not set (Open ⭐ #1)"** (`:721`) stand in for a benefits matrix and a deposit-override table that are not modelled.

## 4. Actions and writes

**This file imports nothing from `src/actions/` and dispatches no action.** Grep of the file finds `updateClient` and `blockClient` only inside comments (`ClientDetail.tsx:294-311`, `:504-529`). There is therefore no capability string on the dispatch path from this page.

Every control and where it goes:

| Control | file:line | What it does |
|---|---|---|
| Edit Client | `ClientDetail.tsx:491-499` | `edit.startEditing()` — local state (`src/lib/edit/useEditMode.ts:223`) |
| Done | `:466-478` | `edit.stopEditing()`; refuses while `dirtyKeys` is non-empty and sets an inline banner (`useEditMode.ts:208-213`) |
| Discard | `:479-488` | `edit.cancelAll()` — drops the draft (`useEditMode.ts:215-219`) |
| Per-field **Save** (rendered only on a dirty field) | `src/components/ui/EditableRows.tsx:149-151` | `edit.saveField(key)` → `onSave(patch)` → `setDraft(applyPatch(...))` (`ClientDetail.tsx:313-321`, `:140-152`). **Persists nothing.** Lost on reload; the page states this at `:590-593` |
| Per-field **Cancel** | `EditableRows.tsx:152-154` | `edit.cancelField(key)` — local |
| Merge Duplicate | `ClientDetail.tsx:501-503` | `navigate('/clients/duplicates')` — navigation only |
| Block / Unblock Client | `:530-538` | **`disabled`, no `onClick` at all**, wrapped in `Unavailable` with a reason string (`src/components/ui/Unavailable.tsx:35-164`) |
| Start Rental | `:539-549` | Disabled inside `Unavailable` when `client.isBlocked`; otherwise `navigate('/rentals/new')` |
| Tab buttons ×6 | `:605-627` | `setTab` |
| Back to Clients (empty state) | `:423` | `navigate('/clients')` |
| Retry (error states) | `:415`, `:893`, `:1003` | `profile.refetch` / `rentals.refetch` / `invoices.refetch` (`src/lib/queries/useList.ts:258`) |
| Edit Client (Notes empty state) | `:1122-1126` | `edit.startEditing()` |

Buttons with no handler: **Block / Unblock Client** (`:531-537`) and the disabled **Start Rental** variant (`:541-543`). Both are deliberately `disabled` with a stated reason, not dead.

Capability-map status of the two actions this page *names but does not call*:

- `client.update` — declared by `src/actions/clients/updateClient.ts:26`. **Mapped** in `checkCapability` (`src/actions/core.ts:191` → `rbac.canWriteBookingDesk`). The action itself sets no `implemented` flag (`updateClient.ts:24-33`), so the dispatcher default `implemented !== true` throws `ActionNotImplementedError` before anything else (`core.ts:223-225`). Its `execute` body is a `console.log` (`updateClient.ts:36`). **implemented: false.**
- `client.block` — declared by `src/actions/clients/blockClient.ts:181`, and that action **is** `implemented: true` (`blockClient.ts:195`). It **is** mapped in `checkCapability` (`core.ts:164-165` → `rbac.canBlockClient`, Owner/Admin/Manager, `src/lib/rbac.ts:164-166`). See §7 — the on-screen reason claims the opposite.

## 5. Gates

- **Route reach.** `/clients/:id` is mounted inside `Shell` with no role guard beyond authentication (`src/App.tsx:576-583`, `:964-993`). `isMoneySurface` matches only `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-159`), so the Shell's `isForbidden` check (`App.tsx:993`) never fires here. **Every authenticated role reaches this route, including `Client`** — there is no `isStaff()` guard on it. An unrecognised profile is defaulted to `Client` (`src/lib/auth.tsx:121-127`).
- **Money (Law 6).** `money = useCanViewMoney()` (`ClientDetail.tsx:249`) → `canViewMoney(role)` → false for Warehouse, Technician, Driver, Client (`src/lib/moneyVisibility.ts:24-27`; `src/lib/rbac.ts:36-50`). What that hides:
  - the three money KPIs are **not constructed** (`ClientDetail.tsx:433-439`);
  - the Payments tab is removed from the tab list (`:325`) and its body is additionally guarded (`:973`);
  - the overdue limb of the On-Stop check is forced to `null` rather than `0`, so the verdict reports "could not run" instead of "clear" (`:385-387`; `src/data/clients.ts:1166-1174`);
  - `creditStopFactsOf` passes both money facts as `null` for a money-blind session (`src/data/clients.ts:1215-1227`), and `evaluateCreditStop` populates `details` only when money is visible (`:1158-1160`).
- **Second money tier — `moneyScope`.** Standing discount, Discount source, Deposit override and Credit limit render only when `moneyScope(gctx) === 'full'` (`ClientDetail.tsx:707-724`), i.e. Owner/Admin/Manager/Accounts (`src/lib/fieldGating.ts:53-62`). **Coordinator passes `useCanViewMoney` but not this**, so a Coordinator sees the money KPIs and the Payments tab but no credit limit or standing-discount rows.
- **PII.** The Contact card and the Authorized Contact Person card are not constructed at all for a role outside Owner/Admin/Manager/Coordinator/Accounts (Driver only inside a delivery context, which this page never sets) — `ClientDetail.tsx:253`, `:659`, `:683`; `src/lib/fieldGating.ts:90-96`.
- **Block reason / manual on-stop reason.** Gated by `canViewOnStopReason`, an alias of `canViewPII` (`ClientDetail.tsx:561-566`, `:837`; `src/lib/fieldGating.ts:124`). The block itself is shown to everyone (`:457`, `:556`).
- **Restricted state.** `financeRestriction(money)` is spread onto the invoices `PageBody` (`ClientDetail.tsx:1009`; `src/lib/queries/finance.ts:207-213`). Because the whole Payments tab is already `&& money` (`:973`), `restricted` is always `false` where it is spread — the restricted branch of that `PageBody` is unreachable from this page.

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | Yes, ×3 | `PageBody loading={profile.loading} skeleton="card"` for the whole page (`ClientDetail.tsx:413-419`); `PageBody loading={rentals.loading}` (`:891`); `PageBody loading={invoices.loading}` (`:1001`). All render `LoadingSkeleton` (`src/components/ui/PageBody.tsx:182-184`; `src/components/ui/StateViews.tsx:87-165`) |
| Error | Yes, ×3 via PageBody + ×2 hand-rolled | `PageBody error=… onRetry=…` at `:414-415`, `:892-893`, `:1002-1003` → `ErrorBanner` (`PageBody.tsx:152-180`). Hand-rolled: the blocked-account `ErrorBanner` (`:556-569`) and the unsaved-changes `ErrorBanner` (`:571`) |
| Empty | Yes, ×3 via PageBody + ×2 hand-rolled | "Client not found" (`:420-423`), "No rentals to show" with a divergence message when the directory count disagrees with the query (`:895-902`), "No invoices to show" (`:1005-1008`). Hand-rolled `EmptyState`: Documents (`:1105-1108`) and Notes (`:1119-1127`) |
| Restricted | Present in code, unreachable | `financeRestriction(money)` spread at `:1009`; `restricted` can never be true there because the tab is already money-gated at `:973`. `RestrictedState` is otherwise reachable only from the App shell, which does not treat `/clients` as a money surface (`src/data/nav.ts:147-153`) |

## 7. Known gaps

1. **`TODO(decision)` — `ClientDetail.tsx:189-194`.** Law 10 wants a written reason and a named approver above 10%, and `ClientRecord` carries neither, so the field validator refuses to *set* any standing discount above 10% (`:195-197`). Existing records above 10% still display.
2. **`TODO(decision)` — `ClientDetail.tsx:522-525`.** "Which roles hold `client.block`, `client.create` and `rental.confirm`."
3. **The Block button's stated reason is factually wrong today.** `ClientDetail.tsx:530` tells the operator that "`client.block` is unruled, so actions/core.ts denies it for every role", and the comment above it repeats the claim (`:511-519`). `src/actions/core.ts:164-165` **does** map `client.block` to `rbac.canBlockClient`, and `src/lib/rbac.ts:149-166` records that it was ruled on 15 Aug 2026 (Owner/Admin/Manager, mirroring `client_flags_insert`). The button is disabled for a reason that no longer holds, and the same TODO at `:522-525` is stale for the same reason. Recorded, not fixed.
4. **No write path exists from this page.** `onSave` writes to component state (`ClientDetail.tsx:313-321`); `updateClient` is not imported. `src/actions/clients/updateClient.ts:24-33` sets no `implemented`, so it is a stub the dispatcher fails closed on (`src/actions/core.ts:223-225`), and its `execute` is a `console.log` (`updateClient.ts:36`). Every field edit is lost on reload; the page discloses this at `:590-593`.
5. **Mock-mode crash risk on the Payments tab.** `Tone` does `const c = STATUS[tone]` then reads `c.bg` with no guard (`ClientDetail.tsx:98-110`). Invoice chips pass `INVOICE_TOKEN[inv.status]` (`:1017`, `:1079`), and `INVOICE_TOKEN` is keyed by the six `invoice_status` members (`src/data/invoiceIntel.ts:25-35`; enum confirmed at `src/types/supabase.ts:13051-13057`). The mock corpus writes every invoice with `status: 'Issued'` (`src/lib/mock/corpus.ts:341`) — not a member of that enum — so `INVOICE_TOKEN['Issued']` is `undefined`, `STATUS[undefined]` is `undefined`, and `c.bg` throws. Live Postgres cannot produce this because the column is a real enum; mock mode can.
6. **VIP badge is unreachable on a database record.** `ClientDetail.tsx:450-456` renders `client.isVip`, and `toClientRecord` never sets it — `client_directory_v` publishes only `is_blocked` (`src/lib/queries/clients.ts:265-281`). The file's own comment says so at `:450-455`.
7. **Tags always read `'—'` on a database record.** `ClientDetail.tsx:643-648`; `clients.tags` exists but the view does not carry it and the mapper does not set it (`src/lib/queries/clients.ts:192-282`).
8. **The whole Reliability card never renders on a database record.** Guarded on `client.reliability` (`ClientDetail.tsx:861`), a field only seed `ClientRecord`s carry (`src/data/clients.ts:167-168`) and the mapper never writes.
9. **The legacy manual on-stop block never renders on a database record.** `client.onStop` is documented as seed-only — "`lib/queries/clients.ts` never sets it" (`src/data/clients.ts:153-166`) — so the `:837-845` block is dead against live data.
10. **Documents tab is an admitted gap.** No documents query module exists; the tab states that rather than filtering a seed array (`ClientDetail.tsx:1093-1110`).
11. **Activity tab is not an activity log.** It restates four fields of the same record and says so: "`lib/audit.ts` exists but nothing calls `logAuditEvent` for client records yet" (`ClientDetail.tsx:1154-1158`).
12. **The block reason is never available.** `client_flags.reason` exists but the view publishes only the boolean, so the banner prints a stand-in sentence (`ClientDetail.tsx:561-565`) and the Activity bullet prints "reason not carried by this view" (`:1150`). The mapper documents the deliberate omission (`src/lib/queries/clients.ts:276-280`).
13. **Membership Tier fabricates "Academy".** The page renders `client.membership` unconditionally (`ClientDetail.tsx:703`) and the mapper substitutes a placeholder for a client with no membership row (`src/lib/queries/clients.ts:208`, `:284-314`). `ClientProfile.membershipKnown` is the honest reading (`src/lib/queries/clients.ts:426-433`) and **this page never reads it** — `loaded` is destructured for `.id` and `.record` only (`ClientDetail.tsx:276`, `:338`). In mock mode every client hits this path (`src/lib/mock/corpus.ts:495`).
14. **Rs 0 for an absent credit limit.** `toClientRecord` coalesces a `null` `approved_credit_limit` to `0` (`src/lib/queries/clients.ts:224`), and the Payments tab prints it as "Credit Limit Rs 0" (`ClientDetail.tsx:980`) and the Membership card as an immutable "Credit limit" row (`:722`). `creditStopFactsOf` handles the same zero correctly — it passes it through so the limb can say "no approved credit limit is recorded" (`src/data/clients.ts:1218-1227`) — so the same fact is honest inside the On-Stop box and misleading two rows above it. In mock mode every client has `approved_credit_limit: null` (`src/lib/mock/corpus.ts:149`).
15. **Contact rows read `'—'` in mock mode, not because the client has no contact.** `corpus.ts:492-494` hard-nulls `contact_name`/`contact_designation`/`contact_phone`, and the mapper turns each into `'—'` (`src/lib/queries/clients.ts:255-259`), which the Contact Person card renders as if it were a value (`ClientDetail.tsx:688-690`).
16. **`isFilteredOverride: false` is passed on both lists** (`ClientDetail.tsx:345`, `:350`), so neither empty state offers "Clear filters" — correct here, but it means a genuine filter bug on these two lists would be invisible in the empty copy (`src/lib/queries/useList.ts:256`).
17. **The cancelled-booking predicate is absent from the Rentals query.** `fetchClientBookings` passes only `client_id` and a sort (`ClientDetail.tsx:339-346`); unlike every named set in `src/lib/queries/bookings.ts:523-529`, it does not add `presence: { cancelled_at: false }`. Cancelled bookings therefore appear in the list, marked by a "Cancelled" label beside the stage pill (`ClientDetail.tsx:953-955`) — deliberate per the comment at `:950-952`, but it makes `rentals.rows.length` in the card title (`:878`) a different population from `client.totalRentalsCount`.
18. **`PageBody`'s own limitation applies here**: a refetch-in-progress replaces surviving rows with a skeleton, which is an open `TODO(decision)` in `src/components/ui/PageBody.tsx:46-57`.
