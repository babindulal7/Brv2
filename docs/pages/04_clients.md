# Clients
Route `/clients` · `src/modules/clients/Clients.tsx` · 591 lines

Status: **Partial**

---

## 1. What it is

A four-tab page mounted at `/clients` (`src/App.tsx:137-144`, lazily imported at `src/App.tsx:75`). One hook, `useClients()` (`src/modules/clients/Clients.tsx:62`), reads the whole directory from `client_directory_v` and feeds both the Clients tab and the Credit tab.

The file itself renders the header, the tab strip, a CSV export and two of the four tab bodies (`ReferralView` at `Clients.tsx:314-332`, `CreditView` at `Clients.tsx:362-591`); the other two are delegated to `ClientsDirectory` (`src/modules/clients/ClientsDirectory.tsx`, 2105 lines) and `Membership` (`src/modules/clients/Membership.tsx`, 916 lines, rendered `embedded` at `Clients.tsx:226`).

---

## 2. What renders

### Desktop, top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` "Clients" + description, with four buttons: **New Client** → `/clients/new`, **Import** → `/clients/import`, **Export** → `exportCsv`, **Find Duplicates** → `/clients/duplicates` | `Clients.tsx:143-162` |
| 2 | Tab strip: Clients · Membership · Referral · Credit. Credit is filtered out for a money-blind session | `Clients.tsx:37-42`, `:80`, `:164-191` |
| 3 | Active tab body (below) | `Clients.tsx:193-230` |
| 4 | `FooterNote` with the extra line "Clients are never deleted — a closed account is retained and marked" | `Clients.tsx:232`; component `src/components/ui/Page.tsx:443-469` |

The tab lives in the URL as `?tab=` and is written with `replace` (`Clients.tsx:82-90`); an unknown value falls back to `clients` (`Clients.tsx:83`).

### Tab body — Clients (default)

`PageBody` wraps `ClientsDirectory` (`Clients.tsx:214-223`). Inside `ClientsDirectory.tsx`, top to bottom:

1. `KpiStrip` — Total Clients, On Rent, Outstanding (money only), Blocked — `:693-726`, rendered `:769`
2. Exclusive filter chips — All, Organisation, Individual, Unassigned, On Rent, Payment Due (money only), VIP — `:733-741`, rendered `:773-820`
3. A rule, the label "Also show only", and two **intersecting** overlay chips — Blocked, On Stop — `:749-765`, rendered `:829-896`. On Stop goes inert with the text "check unavailable" when no verdict could be computed (`:862-864`, `:889-895`)
4. Search box (`:901-921`), Table/Cards switch (`:924-934`, only when `tabular`), disabled **More Filters** (`:936-940`)
5. Left rail: **Filters** card holding one inert "Advanced filters — coming soon" row (`:966-1013`) and **Saved Views** card holding five presets plus a disabled **Save Current View** (`:1015-1062`)
6. List card: toolbar ("Showing X to Y of N clients", selection count, Clear selection, Export Selected, Block Selected, Unblock Selected, density toggle, rows-per-page select) — `:1077-1194`
7. Body — hand-rolled `EmptyState` (`:1196-1210`), **or** the card grid (`:1211-1308`), **or** the table (`:1318-1653`)
8. Pagination footer with one button per page (`:1656-1678`)
9. Client-profile rail when a row is selected (`:1682-1995`)
10. Block/Unblock `Modal` (`:1999-2072`)

### Tab body — Membership

`<Membership embedded />` (`Clients.tsx:226`). With `embedded` the inner `PageHeader`, tab strip and `FooterNote` are suppressed (`Membership.tsx:322-384`, `:912`), leaving: `KpiStrip` (`:386`), a Membership Plans card in Cards or Comparison-Table view (`:388-477`), quick-filter chips + "Renews within 30 days" + two disabled buttons (`:480-552`), the members table (`:593-896`) and a grace note (`:898-910`).

### Tab body — Referral

One `Card` titled "Referral conversions and affiliate rewards" containing a **Generate Referral Code** button → `/clients/referral/new` and an `EmptyState` reading "No referral is recorded" (`Clients.tsx:314-332`). There is no table.

### Tab body — Credit (money-visible sessions only)

1. `KpiStrip` — Credit Extended, Outstanding, Blocked Balance (`Clients.tsx:388-410`, rendered `:414`)
2. Card "Credit policy by membership tier" with a disabled **Request Override** button behind an `Unavailable` reason (`:416-424`), a preamble paragraph (`:426-429`), a `PageBody`-wrapped grid of plan tiles (`:431-490`) and a "Discount stacking is capped at 25%" note (`:492-504`)
3. Card "Accounts with an approved credit limit" — a `PageBody`-wrapped table of Client / Tier / Approved Limit / Outstanding / Status (`:507-588`)

### Responsive bands

`Clients.tsx` reads **neither** breakpoint — it imports nothing from `src/lib/device.ts` (imports at `Clients.tsx:1-16`). The page's whole responsive behaviour lives in `ClientsDirectory.tsx`, which calls `useViewport()` at `:282`; that hook reads `BREAKPOINT.phone = 768` and `BREAKPOINT.desktop = 1180` (`src/lib/device.ts:43-51`). Three derived flags at `ClientsDirectory.tsx:283-286`: `tabular = viewport !== 'phone'`, `desktop = viewport === 'desktop'`, `narrow = viewport === 'tablet'`.

| Band | What changes |
|---|---|
| < 768 (phone) | Cards only — the Table/Cards switch is not rendered (`:924`) and the card branch is forced (`:1211`). Filters + Saved Views reflow to a single column beneath the list via `order: 2` (`:962`); the profile rail renders inline (`:1994`) |
| 768–1179 (tablet) | Table kept, but `narrow` drops five columns — Contact, Type, Current Rentals, Deposit Held, Last Rental (`:1331-1337`, cells `:1453`, `:1464`, `:1470`, `:1496`, `:1515`) — and the table floor drops to `minWidth: 620` (`:1319`). Filters/Saved Views reflow into a two-column grid beneath the list (`:962`) |
| ≥ 1180 (desktop) | Filters go into `SideRail width={210}` (`:1065`), the profile goes into `Rail width={330}` (`:1994`), the grid becomes `auto minmax(0,1fr)` (`:948`), and the table floor is `minWidth: 1180` with money or `900` without (`:1319`) |

`Membership.tsx` reads no breakpoint at all — its plan grid is a fixed `repeat(5, minmax(0,1fr))` (`Membership.tsx:412`) and its members table a fixed `minWidth: money ? 1240 : 880` (`:666`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Directory rows (all tabs' `clients`) | **DB** | `client_directory_v` — `listClientRecords()` in `src/lib/queries/clients.ts:374-390`, `.is('deactivated_at', null)`, `.order('created_at')`, `.limit(500)`; columns list at `:161-167`; mapped by `toClientRecord` `:192-282`. Called by `fetchClients` (`src/lib/queries/useClients.ts:44-50`) through `useList` (`src/lib/queries/useList.ts:148-269`), surfaced as `useClients()` (`useClients.ts:63-77`) |
| Directory KPIs and every chip count | **DB** (derived) | `clientMetrics(clients)` over the fetched rows — `src/data/clients.ts:1000-1013`, called `ClientsDirectory.tsx:328` |
| On Stop chips / banners | **DB** (derived) | `evaluateCreditStop(creditStopFactsOf(...))` — `src/data/clients.ts:1125-1202`, `:1211-1230`; threshold from `readOverdueStopDays()` → `getSetting('overdueStopDays')` (`src/data/clients.ts:1255-1257`), read once per mount at `ClientsDirectory.tsx:348` |
| Row hover / IntelCard content | **DB** (derived) | `clientGlance` / `clientDetailGroups` over the same `ClientRecord` — `src/data/clientIntel.ts:158`, `:213`, called `ClientsDirectory.tsx:463-471` |
| Credit tab KPIs + "Accounts with an approved credit limit" | **DB** (derived) | Reductions over the same `clients` array — `Clients.tsx:375-386`, table `:530-583` |
| Credit tab plan tiles (tier label, default limit, discount %) | **DB** | `membership_plans_v` — `listMembershipPlans()` in `src/lib/queries/clients.ts:492-518` (`.eq('status','Active')`, `.order('display_order')`), hook `useMembershipPlans()` in `src/lib/queries/useClients.ts:118-125` |
| Membership tab — members table, KPIs, chips | **SEED** | `MEMBERS` in `src/data/membership.ts:76`, consumed `Membership.tsx:273-291`, `:696-858`. No query, no fetch |
| Membership tab — plan cards / comparison table | **SEED** | `PLANS` (`src/data/membership.ts:274`), `COMPARISON_ROWS` (`:383`), `STACK_NOTE` (`:396`), `GRACE_NOTE` (`:399`), `LEGEND` (`:402`) |
| Referral tab | *none* | Only an `EmptyState` (`Clients.tsx:326-329`). The `REFERRALS` array is still declared in this file (`Clients.tsx:248-281`) but no longer rendered here — it is imported by `src/modules/clients/GenerateReferralCode.tsx:9` |
| Tier pill colours | **SEED** (mapping) | `TIER_TONE` — `src/data/clients.ts:70-76`, carries its own `TODO(decision)` at `:66-69` |
| Filter-group labels in the inert Filters card | **SEED** | `CLIENT_FILTER_GROUPS` / `clientFilterGroupsFor` — `src/data/clients.ts:1268-1283`, used `ClientsDirectory.tsx:329`, `:993` |
| Rows-per-page options | **SEED** | `CLIENT_ROWS_PER_PAGE = [10,25,50]` — `src/data/clients.ts:1285` |
| All of the above, when `VITE_DATA_SOURCE=mock` | **LOCAL** | `src/lib/supabase.ts:42`, `:66-67`. `client_directory_v` is synthesised by `clientDirectory(store)` (`src/lib/mock/corpus.ts:443-501`); `membership_plans_v` maps to `membership_plans` (`corpus.ts:440`) which is **UNSERVED** (`corpus.ts:33-44`, entry at `:35`), so the Credit tab's plan tiles show their empty state. `client_flags` is also **UNSERVED** (`corpus.ts:38`) |

`CLIENTS_DATA` (the 26-record seed at `src/data/clients.ts:171-973`) is **not** imported by `Clients.tsx` or `ClientsDirectory.tsx` — neither import list references it (`Clients.tsx:1-16`, `ClientsDirectory.tsx:1-34`).

**Invented on this page:** every figure in the Membership tab — the 20-odd member rows with their fees, savings, lifetime spend, credit limits, usage bars and join/renewal dates (`src/data/membership.ts:76`), and the five plan cards' prices, limits and benefit lists (`src/data/membership.ts:274`, `:383`). Nothing else on the page carries a written-in number; the four referral conversions and Rs 26,000 of rewards still declared at `Clients.tsx:248-281` are no longer drawn here.

---

## 4. Actions and writes

**`Clients.tsx` dispatches nothing.** Every button in its header either navigates (`:148`, `:151`, `:157`) or builds a CSV `Blob` and clicks a synthetic anchor (`exportCsv`, `:97-139`). The CSV is real: `csvCell` quotes properly (`:45-48`) and the money columns are omitted when `money` is false (`:110`, `:124`).

The one dispatch on the page lives one level down.

| Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `blockClient(...)`, one call per selected client, awaited (`ClientsDirectory.tsx:607`, `:613-624`) | `client.block` (`src/actions/clients/blockClient.ts:181`) | `src/actions/clients/blockClient.ts` | **true** (`blockClient.ts:195`) | **Yes** — `src/actions/core.ts:164-165` → `rbac.canBlockClient` (`src/lib/rbac.ts:164-166`) = Owner, Admin, Manager |

What the write does: block = `idempotentInsert` into `client_flags` with `flag_type:'Blocked'`, `source:'Manual'`, `created_by: ctx.userId` (`blockClient.ts:256-319`); unblock = `safeUpdate` setting `removed_at` / `removed_by` / `removal_reason` on the live row, never a delete (`blockClient.ts:325-362`). It refuses offline rather than queueing (`:228-234`), refuses a second block on an already-blocked client (`:250-254`), and refuses a lift when no live flag exists (`:321-323`).

Call-site behaviour: a session context is required or the dialog refuses inline (`ClientsDirectory.tsx:596-602`); one idempotency key per client is minted when the dialog opens, not when the request is sent (`:325`, `:570`); successes toast only on the resolved path and failures render inline and persistent inside the dialog (`:633-650`); the directory is re-read via `onBlockChanged` → `useClients().refresh` (`:636`, wired at `Clients.tsx:222`).

### Controls that render but do not act

| Control | Where | Shape |
|---|---|---|
| **Request Override** | `Clients.tsx:419-424` | `disabled`, wrapped in `Unavailable` with a reason. No handler, no dispatch |
| **More Filters** | `ClientsDirectory.tsx:936-940` | `disabled` + `Unavailable` |
| "Advanced filters — coming soon" | `ClientsDirectory.tsx:988-1012` | A `<span>`, not a button. `cursor: not-allowed`, `Unavailable` reason |
| **Save Current View** | `ClientsDirectory.tsx:1056-1060` | `disabled` + `Unavailable` |
| **Start rental** (blocked client) | `ClientsDirectory.tsx:1946-1950` | `disabled` + `Unavailable`; the un-blocked branch navigates to `/rentals/new` (`:1952-1954`) |
| **Ledger** (money-blind) | `ClientsDirectory.tsx:1961-1965` | `disabled` + `Unavailable`; money branch navigates to `/finance` (`:1957-1959`) |
| **Edit Plans** | `Membership.tsx:397-401` | `disabled` + `Unavailable` |
| **More filters** / **Export** (membership) | `Membership.tsx:541-550` | both `disabled` + `Unavailable` |
| **Send Reminder** / **Change Level** / **More** | `Membership.tsx:614-618` | all three `disabled` + `Unavailable` |
| Membership row action | `Membership.tsx:837-855` | Has a handler — navigates to `/clients?q=<name>`, which the directory reads on mount (`ClientsDirectory.tsx:296`) |

Everything else that looks like an action is local state or navigation: the chips (`:779`), overlays (`:837`), saved views (`:1022-1031`), sort headers (`:140`), density (`:1145`), pagination (`:1672-1676`), row selection (`:1383`), `Export Selected` (a Blob, `:520-557`) and the row menu items (`:1586-1614`).

---

## 5. Gates

**Route.** No role gate. `Shell` redirects to `/login` when there is no user (`src/App.tsx:973-975`) and refuses money surfaces to money-blind roles (`src/App.tsx:993`), but that test is `isMoneySurface(pathname)` over `MONEY_ROUTES = ['/finance','/reports','/admin','/tools/pricing','/tools/depreciation']` (`src/data/nav.ts:147-159`) — `/clients` is not in it. **Every authenticated role reaches this page.**

**Money.** `useCanViewMoney()` (`Clients.tsx:52`, `ClientsDirectory.tsx:260`, `Membership.tsx:263`) → `src/lib/moneyVisibility.ts:24-27` → `rbac.canViewMoney` (`src/lib/rbac.ts:36-38`), whose `MONEY_BLIND` set is Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`). An unauthenticated session is money-blind by default (`moneyVisibility.ts:26`).

**Hidden under Law 6 (absent, not masked):**

- the whole **Credit tab**, from the tab strip down (`Clients.tsx:41`, `:80`, `:228`) — and equally from `Membership`'s own standalone strip (`Membership.tsx:354`)
- the CSV export's `Outstanding (Rs)` and `Deposit Held (Rs)` columns (`Clients.tsx:110`, `:124`)
- directory: the Outstanding KPI (`ClientsDirectory.tsx:708-718`), the Payment Due chip (`:739`), the Outstanding and Deposit Held table columns (`:1335-1336`, `:1484-1513`), the card view's "due" figure (`:1292-1296`), the "Payment Due" saved view (`:1016`), the row menu's "Open payments" item (`:1606-1614`), and "Receive Payment" as a row's primary verb (`:679`)
- profile rail: the approved-limit / outstanding box and the lifetime-spend tile (`:1868-1931`), replaced by a single money-free Total-rentals tile (`:1933-1942`); Ledger is disabled with a reason (`:1961-1965`)
- membership tab: the Paid, Savings, Lifetime Spend and Credit Limit columns (`Membership.tsx:318`, `:783-828`) and the plan card's price (`:118-125`)
- On Stop: `creditStopFactsOf` passes `null` for both money facts on a money-blind session (`src/data/clients.ts:1217`, `:1227`), so every verdict is indeterminate and the chip says "check unavailable" rather than filtering to an empty list (`ClientsDirectory.tsx:375-383`, `:862-864`)

**Permission, separate from visibility.** "Receive Payment" additionally requires `canRecordPayment` — Owner, Coordinator, Accounts (`ClientsDirectory.tsx:673`, `src/lib/rbac.ts:296-299`) — so a money-sighted Manager or Admin falls through to the next verb in the chain (`:682-690`).

**PII.** A separate gate: `canViewPII(gateContext(role))` — Owner, Admin, Manager, Coordinator, Accounts always; Driver only inside a delivery context (`src/lib/fieldGating.ts:90-96`), computed at `ClientsDirectory.tsx:266-270`. It removes the table's Contact column (`:1331`, `:1453-1462`) and the card view's phone/email block (`:1278-1283`).

---

## 6. States drawn

| State | Where |
|---|---|
| **Loading** | Via `PageBody`. Clients tab: `skeleton="table"` (`Clients.tsx:214-221` → `src/components/ui/PageBody.tsx:182-184`). Credit tab: `skeleton="card"` for the plan tiles (`Clients.tsx:431-441`) and the default table skeleton for the accounts table (`Clients.tsx:508-517`). Membership and Referral tabs draw **no** loading state — neither fetches |
| **Error** | Via `PageBody` (`PageBody.tsx:152-180`). The Clients tab passes `hasRows` (`Clients.tsx:218`), so a failed refresh renders the banner *above* the surviving table. Three additional hand-rolled `ErrorBanner`s in `ClientsDirectory`: the block banner in the profile rail (`:1729`), the On Stop banner (`:1752-1778`), and the per-client failure list inside the block dialog (`:2035-2040`) |
| **Empty** | Mixed. The Clients tab deliberately does **not** pass `empty` to `PageBody` (reasoned at `Clients.tsx:195-213`); the empty state is hand-rolled inside `ClientsDirectory` and distinguishes "No clients yet" from "No clients found" (`:1196-1210`). Referral: hand-rolled `EmptyState` (`Clients.tsx:326-329`). Credit: `PageBody` empty for both the plan tiles (`Clients.tsx:437`, `:439-440`) and the accounts table (`:513-516`). Membership: hand-rolled `EmptyState` inside a `<td colSpan>` (`Membership.tsx:679-694`) |
| **Restricted** | **None.** `restricted` is never passed to any `PageBody` on this page — stated as a deliberate choice at `Clients.tsx:210-212`. The Shell's `RestrictedState` (`src/App.tsx:1020-1023`) cannot fire here because `/clients` is not a money route (`src/data/nav.ts:147-153`) |

---

## 7. Known gaps

1. **`blockClient.ts`'s header is stale and says the opposite of the code.** `src/actions/clients/blockClient.ts:59-66` states *"`client.block` is not one of them, so the dispatcher denies this action before `execute` runs"*, and `:176-177` repeats it ("every call through `blockClient` is denied before `execute` runs"). `src/actions/core.ts:164-165` maps `client.block` to `rbac.canBlockClient`. The comment describes a state that ended; the block/unblock path on this page does run for Owner, Admin and Manager.

2. **`TODO(decision)` — `MembershipTier` has no `'None'` member.** `src/lib/queries/clients.ts:208` falls back to `UNJOINED_MEMBERSHIP_PLACEHOLDER = 'Academy'` (`:314`, reasoned `:284-313`), so a client with no membership row is drawn as an Academy member — on the directory's tier pill (`ClientsDirectory.tsx:1467`), in the membership sort (`:424`), and in the Credit table's Tier column (`Clients.tsx:545-551`). In mock mode `membership_level` is unconditionally `null` (`src/lib/mock/corpus.ts:495`), so **every** row reads Academy.

3. **`TODO(decision)` — `creditUsedPaisa` is a hard-coded `0`.** `src/lib/queries/clients.ts:225-246`. Nothing on this page reads it (the Credit tab's Utilised/Used/Headroom columns and the profile rail's meter were removed — `Clients.tsx:336-361`, `ClientsDirectory.tsx:1870-1896`), but the field is still on the type (`src/data/clients.ts:99`) and still zeroed on every DB row.

4. **`TODO(decision)` — no hue is assigned to a membership tier.** `src/data/clients.ts:66-69`; `TIER_TONE` (`:70-76`) is a rendering choice this page paints five times (`Clients.tsx:465-466`, `:545-546`; `ClientsDirectory.tsx:1239-1240`, `:1410-1411`, `:1467`).

5. **`TODO(decision)` — a retry blanks the table.** `src/components/ui/PageBody.tsx:47-57`: `loading` outranks `children`, so pressing Retry on the error banner swaps the surviving rows for a skeleton for the duration of the query.

6. **Six `ClientRecord` fields are never populated from the database, and this page draws all six.** `toClientRecord` (`src/lib/queries/clients.ts:198-281`) sets no `company`, `isVip`, `isVerified`, `blockReason`, `tags` or `onStop`. Consequences on this page:
   - the VIP chip never renders (`ClientsDirectory.tsx:1261`, `:1422`, `:1699`), the VIP filter chip always counts 0 (`src/data/clients.ts:1006`, chip at `ClientsDirectory.tsx:740`), and the "VIP Clients" saved view (`:94`) always yields an empty list;
   - the KYC-verified tick never renders (`ClientsDirectory.tsx:1423-1430`);
   - the company subline never renders (`:1443-1447`) and the search's company limb can never match (`:391`);
   - `blockReason` is absent, so the profile rail's `ErrorBanner title="Account blocked."` renders with an **empty message body** (`:1729`; `ErrorBanner` requires `message` but accepts `undefined` as a `ReactNode`, `src/components/ui/StateViews.tsx:171-201`), and the Start-rental refusal falls back to the literal 'account under review' (`:1946`);
   - the IntelCard's Tags row always shows "—" (`src/data/clientIntel.ts:223`).

7. **Two CSV exports on one page disagree about the same column.** `Clients.tsx:98-100` deliberately drops "Company" because `ClientRecord.company` has no source in the view. `ClientsDirectory.tsx:523` and `:535` still write a `Company` header and an always-empty cell for the "Export Selected" file. Same page, same records, two different files.

8. **`activeBookings` is always `[]` on a DB row** (`src/lib/queries/clients.ts:217`). So the row menu's "Open B-xxx" item is never built (`ClientsDirectory.tsx:1597-1605`), and the "Open Rental" primary action falls back to `/rentals` instead of the booking it names (`:682-688`).

9. **The profile rail leaks PII past the gate the rest of the screen honours.** `ClientsDirectory.tsx:1819-1864` renders Phone, Email, PAN, Address and the authorised contact's name and phone with no `pii` test, while the table column (`:1331`, `:1453`) and the card block (`:1278`) are both gated on `canViewPII`. A Warehouse or Technician session that clicks a row reads all of it.

10. **On the directory, the overdue limb of On Stop can never fire.** `ClientsDirectory.tsx:348-361` calls `creditStopFactsOf` without `daysPastDueOnOldestUnpaidInvoice`, which defaults to `null` (`src/data/clients.ts:1228`); the limb then reports itself unavailable (`:1166-1174`). This is deliberate and documented (`ClientsDirectory.tsx:337-346`), but it means the directory's On Stop count is a credit-limit-only count.

11. **The directory is capped at 500 rows and filters entirely in the browser.** `useClients.ts:45` passes `{ limit: 500 }` and `NO_FILTERS` (`:42`); search, chips, overlays, sort and paging all run over that array (`ClientsDirectory.tsx:385-452`). Stated as a known bound at `useClients.ts:34-40`: client 501 is invisible to the search box, and "Showing X of N" plus every chip count describe only the loaded 500.

12. **The Referral tab says nothing is recorded while the same file still supplies invented referrals to a sibling screen.** The `EmptyState` at `Clients.tsx:326-329` is accurate for this tab, but `REFERRALS` — four conversions totalling Rs 26,000 of rewards — is still exported from `Clients.tsx:248-281` and imported by `src/modules/clients/GenerateReferralCode.tsx:9`, which uses it to decide whether a generated code already exists (`GenerateReferralCode.tsx:84`).

13. **The Membership tab is entirely seed and has no loading, error or restricted state.** `Membership.tsx:273-291` filters `MEMBERS` (`src/data/membership.ts:76`) with no query. Its plan cards quote credit limits from `PLANS` (`src/data/membership.ts:274`) while the Credit tab one click away reads the same figures from `membership_plans_v` (`src/lib/queries/clients.ts:492-518`) — two tabs of one page answering "what is this tier's default credit limit?" from two different sources.

14. **The "Request Override" reason names a missing gate that is not missing.** `Clients.tsx:419` says *"The Manager override gate is not built yet"*, but `credit.override` is mapped in `src/actions/core.ts:134-135` to `rbac.canOverrideCreditLimit` (Owner, Admin, Manager — `src/lib/rbac.ts:302-305`). What is genuinely absent is a handler: the button has no `onClick` and no action file behind it.

15. **In mock mode two of this page's tables have no backing.** `membership_plans` and `client_flags` are both in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`, entries `:35` and `:38`). The Credit tab's plan tiles therefore draw their empty state, and `is_blocked` is hard-coded `false` for every synthesised directory row (`corpus.ts:498`) — so the Blocked KPI, the Blocked overlay chip and the Blocked Balance KPI all read zero, and a block written from the dialog has nowhere to land.

16. **`csvCell` is duplicated verbatim.** `Clients.tsx:45-48` and `ClientsDirectory.tsx:234-237`, with a comment at the second site acknowledging the mirror.
