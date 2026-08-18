# Finance

Route `/finance` · `src/modules/finance/Finance.tsx` · 1676 lines

Mounted at `src/App.tsx:400-407` inside `Shell` with `crumbs=[{label:'Finance'}]` and header search placeholder `"Search invoice, payment, client…"`; lazy-loaded at `src/App.tsx:59`. `Shell` (`src/App.tsx:943-1039`) supplies the session redirect (`:973-975`), sidebar / bottom bar (`:1004`, `:1033`), `MockBanner` (`:1006`), `OfflineBanner` (`:1007`), `ErrorBoundary` + `Suspense` (`:1025-1029`) and — decisive for this page — the money-surface route guard (`:993`): `!canViewMoney(user.role) && isMoneySurface(pathname)` renders `RestrictedState` instead of the page. `/finance` is the first entry of `MONEY_ROUTES` (`src/data/nav.ts:147-153`, predicate `:156-159`). The `Shell` header's search control is not a page filter — it dispatches a synthetic `⌘K` to open the command palette (`src/components/shell/Header.tsx:109-147`); this page renders no search input of its own and never sets `ListFilters.search`, so `INVOICE_SEARCH_COLUMNS` (`src/lib/queries/finance.ts:439`) is never exercised from here.

Status: **Partial.**

---

## 1. What it is

A six-tab Finance screen that hosts four other screens and owns two of its own. Its own two tabs — Dashboard (`src/modules/finance/Finance.tsx:1077`) and Invoices (`:1196`) — read `invoices` and `payments` from Postgres through five named filter sets in `src/lib/queries/finance.ts` (`:164-168`), and render three KPI tiles, a collections bar chart, an outstanding-invoice table, the full invoice list with seven status chips, and a right rail of summary cards.

Of the four write launchers it draws, exactly one reaches a real database write (`recordPayment`, `src/actions/finance/recordPayment.ts:252`). Refund dispatches a stub; Create Invoice and Void Invoice dispatch nothing at all and refuse inside their own modals.

## 2. What renders

Desktop (≥1180), `tab === 'Dashboard'` (initial value, `src/modules/finance/Finance.tsx:461`), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — icon `card`, title "Finance", description "Finance consumes operational data and never creates it." | `:966-971` |
| 1a | Header actions, rendered only when `money && (tab === 'Dashboard' \|\| tab === 'Invoices')` | `:970` |
| 1b | "As of" chip — BS date above AD date, both from the frozen `TODAY` | `:916-926`; values `:171-172`; `TODAY` `src/lib/bs.ts:153` |
| 1c | `[+ Create Invoice]` `variant="secondary"` — rendered only when `canIssueInvoice` | `:931-935` |
| 1d | `[Record Payment]` `variant="primary"` — rendered only when `canTakePayment` | `:938-949` |
| 1e | `[Export]` — no permission gate, calls `exportCsv` | `:950-952`, handler `:795-815` |
| 2 | Tab strip, `role="tablist" aria-label="Finance"`, six buttons read from `SPEC_TABS['/finance']`, `minHeight: 44`, `overflowX: 'auto'`, active tab carries a 2px `--nav-active-accent` bottom border | `:982-1025`; labels `:214` ← `src/data/nav.ts:337` |
| 3 | `PageBody` with `{...restriction}` — the page-level money gate, wrapping everything below (Dashboard and Invoices tabs only) | `:1057-1058`; `restriction` `:377`; `financeRestriction` `src/lib/queries/finance.ts:207-213` |
| 4 | `KpiStrip`, `columns={3}` — Outstanding Invoices (count + "Rs … receivable"), Overdue (count + "Rs … past due"), Received (money + period label) | `:1060`, tiles `:570-592`; `KpiStrip` `src/components/ui/Page.tsx:203` |
| 5 | `ErrorBanner` for `notPersisted` — no `onRetry`; currently unreachable (see §7) | `:1066` |
| 6 | Two-column grid — `gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : '1fr'` | `:1068-1075`, band test `:1071` |
| 7 | Card "Collections by day · {period}" — one flex bar per Nepal calendar day with a `title` tooltip, height scaled to `dailyPeak`, plus a sentence naming the total, the day count and the busiest day (Law 11) | `:1096-1135`; bars `:1111-1125`; caption `:1128-1132`; series `:635-644`; peak/busiest `:646-650` |
| 7a | Three non-chart branches: "Loading payments…", a read-failure sentence, or a truncation sentence when `receivedTotal === null`; "No payment was received in this period." when the series is empty | `:1097-1108` |
| 8 | Card "Outstanding invoices (N)" — inner `PageBody` (skeleton `table`, 4 rows) over a 4-column table `Invoice \| Client \| Due \| Outstanding`, capped at the first 8 rows, with a footer line "The eight due soonest, of N." when `total > 8` | `:1145-1193`; `PageBody` `:1149-1161`; `slice(0, 8)` `:1174`; footer `:1187-1191` |
| 9 | Card "Status vocabularies" — two chip groups (payment statuses, stored invoice statuses) in a `1fr 1fr` grid and a paragraph on why the two sets differ | `:1410-1451`; vocabularies `:187` and `src/lib/queries/finance.ts:304-310` |
| 10 | `Rail` holding four cards (desktop only) | `:1470-1471`, content `:825-912`; `Rail` `src/components/ui/Page.tsx:315` |
| 10a | Card "Summary" — `SummaryRows` with Received / Receivable (outstanding) / Of which past due | `:827-838` |
| 10b | Card "P&L summary" — five rows, every value the literal string "Not tracked yet", plus a paragraph naming the three missing inputs | `:855-872` |
| 10c | Card "By method · {period}" — `Donut` + `Legend` over `payments` bucketed by `bank_accounts.channel_group`, with the same three non-chart branches as item 7 | `:878-904`; slices `:604-619`; `Donut`/`Legend` `src/components/ui/Charts.tsx:81`, `:154` |
| 10d | A bare `cardStyle` note on deposits being liabilities and payments immutable | `:906-910` |
| 11 | Four modal mounts, each doubly gated on `money` plus its own capability | `:1488-1535` |
| 12 | `FooterNote` with the extra line "Finance consumes operational data and never creates it" | `:1537`; component `src/components/ui/Page.tsx:443`; base strings `src/data/nav.ts:428-432` |

`tab === 'Invoices'` replaces items 7–8 with one card and keeps 9–10:

| # | Element | Evidence |
|---|---|---|
| I1 | Card titled `Invoices (N)`, or `Invoices · showing R of N` when the unpaged response is short of `count: 'exact'` | `:1196-1197`, title `:788-793` |
| I2 | Chip row in the card's `action` slot — `All · Draft · Sent · Partially Paid · Paid · Overdue · Void`, `role="group"`, `aria-pressed` on the active chip, `title` tooltips on Overdue and Void | `:1204-1236`; chip set `:240`; chip → filter set `:244-249` |
| I3 | `PageBody` (skeleton `table`, 6 rows) with per-chip empty titles and messages, `emptyIsFiltered={list.isFiltered}`, and `{...restriction}` spread a second time | `:1249-1262`; copy `:259-278` |
| I4 | Desktop table, `minWidth: 900` in an `overflowX:auto` div — `Invoice \| Client \| Booking \| Total \| Outstanding \| Due \| Status \| Actions`; invoice no. wrapped in `IntelCard`; booking is a `<Link to={/rentals/{bookingNo}}>`; Outstanding turns `--danger-text` above zero | `:1263-1330`; headers `:1275`; link `:1297-1299`; colour `:1304` |
| I5 | `StatusBadge` — reads `voided_at` (`row.isVoid`), not the `status` label | `:1310`, component `:1552-1573` |
| I6 | `RowActions` — `+ Pay`, `Refund`, `Void`, each rendered only when the session rule **and** a real column condition both hold; absent, never disabled | `:1313-1324`, component `:1586-1676`, conditions `:1659`, `:1664`, `:1669` |

**Responsive bands: this file reads both, from `src/lib/device.ts`.** `useViewport()` at `:470` and `useTabularLayout()` at `:471`; `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43`), `readViewport` `:45-51`, `useTabularLayout` `:139-141`.

- **≥1180 (`desktop`)** — two-column grid with the rail beside the content (`:1071`, `:1470-1471`).
- **768–1179 (`tablet`)** — single column; the same four rail cards render inline beneath the list rather than collapsing behind `CollapsibleAside`'s handle (`:1071`, `:1472-1473`, reasoning `:1454-1469`). The invoice table stays a table.
- **<768 (`phone`)** — `tabular` is false, so the 900px invoice table is replaced by stacked cards carrying every column and all three actions (`:1263`, `:1331-1405`, phone `RowActions` `:1388-1400`). The tab strip scrolls horizontally rather than wrapping (`:989`). The Dashboard's outstanding-invoices table is **not** switched to cards at any width — it stays a table inside `overflowX: 'auto'` (`:1162-1186`).

## 3. Data sources

The configured backend is live Supabase: `IS_MOCK` is `import.meta.env['VITE_DATA_SOURCE'] === 'mock'` (`src/lib/supabase.ts:42`) and `.env.local` sets only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The LOCAL rows below are what the same code reads when that flag is set (`src/lib/supabase.ts:66-68`).

| Screen area | Source kind | Detail |
|---|---|---|
| Invoice list (all columns, both tabs) | DB | `invoices`, `supabase.from('invoices').select(INVOICE_COLUMNS)` — `src/lib/queries/finance.ts:452-478`; columns `:343-348`; mapper `:395-426`. Called through `invoiceFetcher` (`src/modules/finance/Finance.tsx:511-517`) → `useList` (`:538`) |
| Client name / booking no. on each invoice row | DB | `clients ( name )`, `bookings ( booking_no )` embeds in that same select — `src/lib/queries/finance.ts:348`; fallbacks `'(client not joined)'` / `'(booking not joined)'` `:403-405` |
| KPI "Outstanding Invoices" count | DB | `count: 'exact'` over `outstandingInvoices()` — status ∈ {Sent, Partially Paid}, `voided_at IS NULL` — `src/lib/queries/finance.ts:526-532`, `:457`; tile `src/modules/finance/Finance.tsx:571-577`; `countOf` `:300-304` |
| KPI "Overdue" count | DB | `overdueInvoices(NOW_AD)` — `due_date <= previousDay(today)`, same status set, `voided_at IS NULL` — `src/lib/queries/finance.ts:561-568`; tile `src/modules/finance/Finance.tsx:578-584` |
| KPI "Received" money | DB | `payments` via `paymentsInPeriod(from, to)` — `payment_date` between +05:45 day bounds, `status = 'Received'` — `src/lib/queries/finance.ts:879-885`, bounds `:1525-1538`; `listPayments` `:793-816`; tile `src/modules/finance/Finance.tsx:585-591` |
| The two "Rs … receivable / past due" notes and the Summary rail rows | DB (client-side sum, refused when truncated) | `sumOf` adds `outstandingAmount` / `amount` over the fetched rows and returns `null` unless `total === rows.length` — `src/modules/finance/Finance.tsx:321-325`, `:553-555`, rendered `:327-329`, `:831-837` |
| "By method" donut slices | DB | `bank_accounts ( channel_group, bank_name )` embed on `payments` — `src/lib/queries/finance.ts:730`, `:771-772`; bucketed `src/modules/finance/Finance.tsx:604-619`; a null account becomes the literal `'No account recorded'`, never `'Cash'` (`:281`, `:608`) |
| "Collections by day" bars | DB | The same `paymentsInPeriod` rows, bucketed by `paymentDateAd` (already the Kathmandu civil day) — `src/modules/finance/Finance.tsx:635-644`; conversion `src/lib/queries/finance.ts:770`, `:1499-1507` |
| Outstanding-invoices table (Dashboard) | DB | The same `outstandingInvoices()` result set as the KPI, sorted `due_date` ascending — `src/lib/queries/finance.ts:530`; table `src/modules/finance/Finance.tsx:1174-1183` |
| Chip predicates | DB | `All` → `liveInvoices()` (`presence: { voided_at: false }`); `Void` → `voidedInvoices()`; `Overdue` → `overdueInvoices(NOW_AD)`; the other four → `chips: { status: [chip] }` — `src/modules/finance/Finance.tsx:244-249`; sets `src/lib/queries/finance.ts:492-505`, `:561-568`; `STORED_INVOICE_STATUSES` `:304-310` |
| Status badge label | DB | `voided_at` (`isVoid`) outranks the `status` column — `src/lib/queries/finance.ts:274`, `:419`; badge `src/modules/finance/Finance.tsx:1552-1573` |
| Hover-intel card content (glance + detail) | DB, re-derived | `toIntelRow` formats the DB row into `InvoiceRow` (`src/modules/finance/Finance.tsx:350-361`); `invoiceGlance` / `invoiceDetailGroups` then recover paisa from the formatted string with `parseMoney` (`src/data/invoiceIntel.ts:66-68`, `:70-92`, `:94-161`). `lines` and `payments` are deliberately left undefined — `invoice_lines` and per-invoice payments are not fetched (`src/modules/finance/Finance.tsx:341-349`) |
| Money visibility flag | DB | `users.primary_role` at sign-in → `canViewMoney` (`src/lib/rbac.ts:36-50`) → `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`), read at `src/modules/finance/Finance.tsx:376` |
| Reporting period (`PERIOD_FROM_AD` / `PERIOD_TO_AD` / `PERIOD_LABEL`), the "as of" chip, and the overdue cutoff `NOW_AD` | SEED | All derive from `TODAY = new Date(Date.UTC(2026, 6, 31))`, a frozen constant — `src/lib/bs.ts:153` ("Fixed to the seeded operating day", `:146-152`); `NOW_AD` / `TODAY_DAY_AD` `src/data/today.ts:727`, `:730`; used `src/modules/finance/Finance.tsx:151-155`, `:167-168`, `:171-172` |
| P&L summary card values | *(no source)* | Five literal `'Not tracked yet'` strings — `src/modules/finance/Finance.tsx:855-872`. No revenue or cost-of-rental column is read anywhere in `src/lib/queries/finance.ts` |
| Invoice-line breakdown, per-invoice payment history, part-invoice history in the intel card | *(no source)* | Not fetched; the groups are omitted rather than faked — `src/modules/finance/Finance.tsx:341-349`; `src/data/invoiceIntel.ts:128-152` |
| Payment-status vocabulary chips | SEED (copy) | `PAYMENT_STATUSES` hand-typed in the page — `src/modules/finance/Finance.tsx:187`. Matches `payment_status` in `src/types/supabase.ts:13209`, but is not read from it |
| **Payments tab** (hosted) | DB | `modules/finance/Payments.tsx`, mounted `src/modules/finance/Finance.tsx:1039`; reads `payments` + `invoices` through the same query module (`src/modules/finance/Payments.tsx:16-24`) |
| **Expenses tab** (hosted) | DB | `modules/finance/Expenses.tsx`, mounted `:1040`; reads/writes `expenses` through `listExpenses` / `createExpense` / `setExpenseStatus` (`src/modules/finance/Expenses.tsx:19-32`, `:736`) |
| **Documents tab** (hosted) | SEED | `modules/documents/Documents.tsx`, mounted `:1041`; every row, KPI and slice comes from the constant module `src/data/documents.ts` (`src/modules/documents/Documents.tsx:23-48`, `:425-427`) |
| **Reports tab** (hosted) | SEED | `modules/reports/ReportCatalog.tsx`, mounted `:1042`; every figure comes from `figuresFor()` over the seed ledger `src/data/pulse.ts` (`src/modules/reports/ReportCatalog.tsx:14-24`, `:134`); the register itself holds no figures (`src/modules/reports/catalog.ts:14-16`) |
| Invoices / payments in mock mode | LOCAL | Both tables are served — `src/lib/mock/corpus.ts:335-372`, wired `:419-420`. `expenses` and `payment_reversals` are in `UNSERVED` (`:33-44`), so the hosted Expenses tab is empty by construction there |
| Row embeds in mock mode | LOCAL | `REL` declares `invoices.clients` and `payments.clients` only (`src/lib/mock/engine.ts:82-83`). `invoices → bookings`, `payments → bookings`, `payments → invoices` and `payments → bank_accounts` are undeclared, so each resolves to `[]` with a one-time console warning (`src/lib/mock/engine.ts:541-546`) — the Booking column then reads `(booking not joined)` and every donut slice collapses into "No account recorded" |

**Invented on this page:** the P&L summary's five rows are not figures at all but the literal string "Not tracked yet" (`src/modules/finance/Finance.tsx:858-862`); the reporting period, the "as of" chip and the overdue cutoff are computed from the frozen seed date 31 Jul 2026 rather than the clock (`src/lib/bs.ts:153`); the payment-status chip row is a hand-typed vocabulary (`:187`); and the hosted **Documents** and **Reports** tabs render entirely invented figures from `src/data/documents.ts` and `src/data/pulse.ts`. Every rupee figure the page computes itself — the three KPI tiles, the Summary rail, the donut, the bars, both tables — is read from `invoices` / `payments`, or printed as `—` when the query could not prove the fetched rows were the whole set (`:321-325`).

## 4. Actions and writes

| Control | Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|---|
| `[Record Payment]` (header `:938-949`), row `+ Pay` (`:1659-1663`), phone card `+ Pay` (`:1388-1400`) → `RecordPaymentModal` `[Record Payment]` | `recordPayment({ invoiceNo, amountPaisa, paymentMethod, reference, notes, clientUuid }, { userId, role, isOnline })` — `src/modules/finance/modals/RecordPaymentModal.tsx:274-284` | `payment.create` (`src/actions/finance/recordPayment.ts:245`) | `src/actions/finance/recordPayment.ts` | **true** (`:252`) | **Yes** — `src/actions/core.ts:129-131` → `rbac.canRecordPayment` |
| Row `Refund` (`:1664-1668`) → `RefundPaymentModal` `[Confirm Reversal]` | `refundPayment({ id: invoiceId }, { userId, role })` — `src/modules/finance/modals/RefundPaymentModal.tsx:157` | `payment.refund` (`src/actions/payments/refundPayment.ts:10`) | `src/actions/payments/refundPayment.ts` | **absent → false** (default `src/actions/core.ts:89`, enforced `:222-224`) | **Yes** — `src/actions/core.ts:130-131` → `rbac.canRecordPayment` |
| Row `Void` (`:1669-1673`) → `VoidInvoiceModal` `[Void Invoice]` | **none** — no action is imported or dispatched | — (`invoice.void` exists in the switch but nothing calls it) | no `voidInvoice` file exists under `src/actions/` | n/a | `invoice.void` **is** mapped (`src/actions/core.ts:132-133` → `rbac.canVoidInvoice`), and nothing consults it |
| `[+ Create Invoice]` (`:931-935`) → `CreateInvoiceModal` `[Issue Invoice]` | **none** — no action is imported or dispatched | no `invoice.create` capability exists | no `createInvoice` file exists under `src/actions/` | n/a | **No** — `checkCapability` has no `invoice.create` case, so it would return `undefined` and be denied for every role (`src/actions/core.ts:215-217`, `:236-241`) |
| `[Export]` (`:950-952`) | none — builds a CSV Blob in the browser | none | `exportCsv` `:795-815` | n/a | n/a |

**Record Payment is a real write.** `execute` refuses offline (`src/actions/finance/recordPayment.ts:289-294`), resolves the invoice's `booking_id`/`client_id`/`branch_id` from `invoice_no` (`:296`), allocates `payment_no` from the `next_document_number` RPC (`:308-317`), calls `idempotentInsert('payments', …)` with `payment_type: 'Advance Payment'` and `status: 'Received'` (`:319-341`), and refuses to report success unless Postgres returned an `id` (`:343-373`). The screen's success handler only refetches — it must not dispatch a second time (`src/modules/finance/Finance.tsx:703-705`, `:689-702`).

**Refund is not.** Written exactly: **renders, dispatches `refundPayment`, action is a stub (`core.ts` fails it closed)** — `src/actions/core.ts:222-224` throws `ActionNotImplementedError` before validate, execute, events or audit, and the modal's `catch` puts that sentence on screen (`src/modules/finance/modals/RefundPaymentModal.tsx:177-181`). Its input type is `{ id: string } // Placeholder for actual input schema` (`src/actions/payments/refundPayment.ts:4-6`), so the amount, method and reason the operator typed are validated (`RefundPaymentModal.tsx:61-105`) and then dropped.

**Create Invoice and Void write nothing and say so.** `CreateInvoiceModal` validates the form, then unconditionally calls `setError('Invoice creation is not connected to the database, so nothing was saved…')` and leaves the modal open (`src/modules/finance/modals/CreateInvoiceModal.tsx:296-339`); `onSuccess` is not even destructured (`:89`, reasoning `:81-88`). `VoidInvoiceModal` does the same — `setError('{invoiceId} was NOT voided, and nothing was saved…')` (`src/modules/finance/modals/VoidInvoiceModal.tsx:82-95`), `onSuccess` not destructured (`:60-65`).

Controls whose handler exists but changes nothing outside local state or the URL-free component: the six tab buttons → `setTab` (`:1001`); the seven chips → `setChip` (`:1211`); `Refund` / `Void` row buttons → `setSelectedInvoiceForRefund` / `setSelectedInvoiceForVoid` (`:1322-1323`); `onRetry` on both inner `PageBody`s → `refreshAll` (`:1152`, `:1252`, handler `:546-551`).

No button on this page is rendered without an `onClick`. Two controls inside the modals this page mounts collect a value that reaches nothing: `RefundPaymentModal`'s Reversal Method `<select>` (`RefundPaymentModal.tsx:273-296`) and its Reason textarea (`:300-319`), both dropped by the placeholder input schema.

## 5. Gates

**Route.** Money-blind roles never reach the component: `Shell` renders `RestrictedState` for `!canViewMoney(role) && isMoneySurface('/finance')` (`src/App.tsx:993`, `:1020-1023`; `MONEY_ROUTES` `src/data/nav.ts:147-153`). `MONEY_BLIND` is Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`), so the five roles that reach the page are Owner, Admin, Manager, Coordinator, Accounts — the same five `FINANCE_MONEY_ROLES` names (`src/lib/queries/finance.ts:159`).

**Page.** `useCanViewMoney()` (`src/modules/finance/Finance.tsx:376`) feeds `financeRestriction()` (`:377`), spread into the outer `PageBody` (`:1058`) and into both inner ones (`:1160`, `:1261`). `restricted` outranks error, loading and empty in `PageBody`'s fixed ladder (`src/components/ui/PageBody.tsx:143-150`), so a money-blind session can never be told "No invoices yet" for rows RLS withheld. Both fetchers also short-circuit to `{ rows: [], total: 0 }` without touching the network when `!money` (`:513`, `:520`).

**Law 6, what is hidden.** Nothing is hidden *per figure* on this page — the whole surface is withheld or fully shown. There is no per-column money gate in the invoice table, and the file says why (`:1268-1274`): the money-blind reader was already refused above. The one field-level gate that survives is `gctx = gateContext(role)` (`:375`), used only by the hover-intel builders, where `canViewMoneyField(gctx, 'booking')` decides whether the Amount group renders (`src/data/invoiceIntel.ts:73`, `:109`; rule `src/lib/fieldGating.ts:55-72`) — Coordinator passes it, so in practice it never subtracts anything for a session that cleared the page gate.

**Write capabilities**, all resolved against `src/lib/rbac.ts` and all *absent, not disabled* (`:1656-1658`):

| Flag | Rule | Roles | Applied to |
|---|---|---|---|
| `canTakePayment` (`:398`) | `canRecordPayment` (`src/lib/rbac.ts:296-299`) | Owner, Coordinator, Accounts (false offline) | header `[Record Payment]` `:938`, row `+ Pay` `:1659`, modal mount `:1488` |
| `canRefund` (`:429`) | same predicate, aliased | Owner, Coordinator, Accounts | row `Refund` `:1664`, modal mount `:1516` |
| `canVoid` (`:430`) | `canVoidInvoice` (`src/lib/rbac.ts:285-288`) | Owner, Accounts (false offline) | row `Void` `:1669`, modal mount `:1527` |
| `canIssueInvoice` (`:459`) | `canVoidInvoice`, **borrowed** | Owner, Accounts | header `[+ Create Invoice]` `:931`, modal mount `:1504` |

`isOnline` is deliberately not passed to any of the four (`:424-427`), so the launchers evaluate the online default `true` while `RecordPaymentModal` passes the real flag to the dispatcher (`RecordPaymentModal.tsx:283`) — an offline Owner is offered the button and refused inside the modal with a network-specific message (`:237-243`).

`[Export]` carries no capability gate at all — stated as deliberate at `:936-937`.

## 6. States drawn

All four exist, all via `PageBody` (`src/components/ui/PageBody.tsx`), used at three levels.

| State | Where | Evidence |
|---|---|---|
| Restricted | Page level, plus both inner bodies | `:1058`, `:1160`, `:1261` → `RestrictedState` "Access restricted" + reason + "Requires Accounts" chip (`src/components/ui/StateViews.tsx:213-279`; reason and role `src/lib/queries/finance.ts:167-180`) |
| Error | Both inner bodies, with `onRetry={refreshAll}` and `hasRows` so a failed refresh keeps the rows and puts the banner above them | `:1150-1153`, `:1250-1253`; shape choice `src/components/ui/PageBody.tsx:152-180` |
| Loading | Both inner bodies — `skeleton="table"`, 4 rows (outstanding) and 6 rows (invoices) | `:1157-1158`, `:1257-1258` |
| Empty | Both inner bodies — one hand-written title/message pair per chip, and `emptyIsFiltered` so a narrowed chip offers a way back | `:1158-1160`, `:1254-1260`; copy `:259-278` |

The outer page-level `PageBody` is passed **only** `noun` and the restriction — no loading, error or empty — deliberately, so a failing KPI count cannot blank the page (`:1044-1056`, `:1058`). Three further hand-rolled states sit outside `PageBody`: the two chart cards' loading / error / truncation branches (`:1097-1108`, `:879-891`) and the persistent `ErrorBanner` for `notPersisted` (`:1066`).

## 7. Known gaps

**TODO(decision) markers in this file** — five, all in comments:

1. `:412-416` — no refund-specific rbac rule exists, so a reversal inherits `canRecordPayment` (Coordinator included). Narrowing it here would desync the UI from `actions/core.ts:130-131`.
2. `:441-457` — no invoice-creation capability exists anywhere; `canVoidInvoice` is borrowed for the launcher. Consequence stated on the spot: a Coordinator may record a payment but not raise the invoice it settles.
3. `:666-676` — `modalInvoices` passes `bookingNo` where the modal's prop is named `booking`; the value is a booking number, not a uuid. (`RecordPaymentModal` no longer forwards it — `RecordPaymentModal.tsx:36-44` — so the mismatch is currently inert.)
4. `:776-786` — the invoice list is **unpaged**; PostgREST caps an unpaged response, so `rows` can be a prefix. The card title discloses the shortfall (`:788-793`) but there is no pager, and Export's meaning (page or set) is unruled.
5. `:317-319` — `sumOf` pulls every outstanding invoice down the wire to add one column, and returns `null` (rendered `—`) whenever `total !== rows.length`. The named fix is a server-side aggregate in `queries/finance.ts`.

**Stubs and dead paths:**

- `refundPayment` is a stub with a placeholder input type — `src/actions/payments/refundPayment.ts:4-6`, no `implemented` key, so `src/actions/core.ts:222-224` fails it closed.
- No `createInvoice` and no `voidInvoice` action exists under `src/actions/` (searched; `src/actions/finance/` contains only `recordPayment.ts`). Both modals refuse inline — `CreateInvoiceModal.tsx:334-338`, `VoidInvoiceModal.tsx:89-94`.
- `handleCreateInvoiceSuccess` (`:733-744`) and `handleVoidSuccess` (`:763-774`) are **unreachable** — neither modal calls `onSuccess` (`CreateInvoiceModal.tsx:89`, `VoidInvoiceModal.tsx:60-65`). `handleRefundSuccess` (`:707-709`) is unreachable for the same reason: the dispatch throws first. Therefore the `notPersisted` `ErrorBanner` at `:1066` can never render today; the file says so at `:492-496`.
- `RefundPaymentModal`'s method and reason inputs collect values that reach nothing (`RefundPaymentModal.tsx:273-296`, `:300-319`).

**Findings recorded, not fixed:**

- **The whole screen's clock is frozen.** `TODAY` is the hard-coded `2026-07-31` (`src/lib/bs.ts:153`), so `PERIOD_FROM_AD`/`PERIOD_TO_AD` are 1–31 July 2026 (`:151-152`), the Received KPI, the donut and the bar chart all describe July 2026 regardless of the real date, and `overdueInvoices(NOW_AD)` measures overdue against 31 July 2026 (`:167`, `src/data/today.ts:727`). The CSV filename, by contrast, uses the **real** clock — `new Date().toISOString()` at `:812` — so an export can be stamped with a date months after the figures inside it.
- **Mock mode crashes the Invoices tab.** `src/lib/mock/corpus.ts:341` writes `status: 'Issued'`, which is not a member of `invoice_status` (`src/types/supabase.ts:13051-13057`) and therefore not a key of `INVOICE_TOKEN` (`src/data/invoiceIntel.ts:28-35`). `StatusBadge` then evaluates `STATUS[undefined].bg` (`:1563`; `STATUS` is a `Record<StatusKey, …>`, `src/lib/status.ts:42-50`) and throws. The same corpus status also means every status chip and `outstandingInvoices()` match zero rows in mock mode, so the KPIs read 0 while rows exist.
- **Mock mode drops three embeds this page renders.** `REL` has no `invoices.bookings` entry (`src/lib/mock/engine.ts:82-86`), so the Booking column renders the literal `(booking not joined)` (`src/lib/queries/finance.ts:403`) and links to `/rentals/(booking not joined)` (`:1297`); no `payments.bank_accounts` entry, so every donut slice becomes "No account recorded" (`:608`).
- **Client-name search does not work on any finance list.** `INVOICE_SEARCH_COLUMNS` is `invoice_no, credit_note_no` only, because `applyListFilters` builds one unscoped `or` (`src/lib/queries/finance.ts:428-439`). This page renders no search box at all, so the limitation is invisible here and visible on `/finance/payments`.
- **`outstandingInvoices()` is a status set, not `outstanding_amount > 0`** (`src/lib/queries/finance.ts:507-532`), so a `Sent` invoice with nothing owed still counts in the Outstanding KPI and table.
- **An invoice due today is not overdue** — the bound is `due_date <= previousDay(today)`, flagged as unruled at `src/lib/queries/finance.ts:553-559`.

**Contradictions with other files:**

- `src/data/nav.ts:371` states "**no page reads this yet**" of `SPEC_TABS`/`FINANCE_TAB_ROUTES`, and `:361-363` states that `Finance.tsx`'s strip "links Expenses to `/reports/expenses`". Both are stale: `Finance.tsx:214` reads `SPEC_TABS['/finance']`, and `:1040` mounts `modules/finance/Expenses.tsx`. Nothing reads `FINANCE_TAB_ROUTES` (`src/data/nav.ts:376-392`) — the routes it names (`/finance/payments`, `/finance/expenses`) exist separately at `src/App.tsx:414-433`, so each of those three screens is reachable two ways with different chrome.
- `src/data/invoiceIntel.ts:13-15` describes `InvoiceRow` as the shape for "`Finance.tsx`'s inline `INVOICES` array" and `:53-54` as "seeded on 2 of the 5 rows in `Finance.tsx`". No such array exists any more — rows come from `listInvoices` (`:538`) and are adapted by `toIntelRow` (`:350-361`), which never populates `lines` or `payments`.
- `src/lib/queries/finance.ts:226-229` cites "`Finance.tsx:260`" for a `parseInt`-based money parse that no longer exists in this file; the string-to-paisa round trip survives only inside `invoiceIntel`'s `amountPaisaOf` (`src/data/invoiceIntel.ts:66-68`), which uses `parseMoney` instead.
- `Payments` is reachable both as a tab here (`:1039`) and as its own route (`src/App.tsx:414-421`); the same is true of Expenses and Documents. The tab copy is demoted by `ScreenHeader`'s `embedded` prop (`src/modules/finance/TabHeader.tsx:40-53`), but each hosted screen keeps its own money gate and its own restricted state, mounted deliberately **outside** this page's `PageBody` (`:1027-1042`).
