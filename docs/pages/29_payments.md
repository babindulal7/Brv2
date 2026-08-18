# Payments

Route `/finance/payments` · `src/modules/finance/Payments.tsx` · 1089 lines

Mounted at `src/App.tsx:414-421` as `<Route path="/finance/payments" element={<Shell …><Payments /></Shell>} />`, lazily imported at `src/App.tsx:62`. The same component is also mounted as a tab by `src/modules/finance/Finance.tsx:1039` (`<Payments embedded />`); the `embedded` prop only demotes the title block (`src/modules/finance/Payments.tsx:680`, `src/modules/finance/TabHeader.tsx:53-91`). This pack documents the standalone route, where `embedded` defaults to `false` (`src/modules/finance/Payments.tsx:477`).

**Status: Partial.**

---

## 1. What it is

The receipt ledger. It reads `payments` from Postgres through `listPayments` (`src/lib/queries/finance.ts:793-816`) and renders one row per payment, newest `payment_date` first (`src/modules/finance/Payments.tsx:135, 150`).

It offers exactly two writes: Record Payment, which reaches a real `INSERT` into `payments` (`src/actions/finance/recordPayment.ts:252, 319-341`), and a per-row Reverse, which dispatches an action whose body persists nothing (`src/actions/payments/refundPayment.ts:8-36`).

Four of the controls the file draws are inert by construction and each says so on itself: the `Reversed` chip (`src/modules/finance/Payments.tsx:726-735`), the `Method` filter (`:739-749`), the three Deposits figures (`:647-660`), and the missing `↳ reversal` sub-rows (`:954-969`).

## 2. What renders

Desktop (`viewport === 'desktop'`, ≥1180), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | `ScreenHeader` → `PageHeader` (icon `card`, title "Payments", description "The receipt ledger. Payments are immutable — a correction is a reversal row, never an edit.") | `src/modules/finance/Payments.tsx:680-702`; `src/modules/finance/TabHeader.tsx:53-64` |
| 2 | Header actions: `[+ Record Payment]` (primary) rendered only when `money && canTakePayment`; `[Refresh]` always | `src/modules/finance/Payments.tsx:692-699` |
| 3 | Filter row, `role="group" aria-label="Payment filters"`: chips `All` · `Received` · `Refunded`, each writing the `status` search param | `src/modules/finance/Payments.tsx:705-723`, param map `:341` |
| 4 | Fourth chip `Reversed` — `disabled`, no `onClick`, carries its reason in `aria-label` + `title` | `src/modules/finance/Payments.tsx:726-735` |
| 5 | `Method` `<select>` — `disabled`, no `onChange`, single option "Not filterable yet" | `src/modules/finance/Payments.tsx:739-749` |
| 6 | `From` / `To` `<input type="date">`, both writing search params | `src/modules/finance/Payments.tsx:752-771` |
| 7 | `[Clear filters]` button, rendered only when `isFiltered` | `src/modules/finance/Payments.tsx:546, 773` |
| 8 | Two-column grid: list `minmax(0,1fr)` + rail `auto` | `src/modules/finance/Payments.tsx:776-783` |
| 9 | `Card` titled `Payments — N payments` (suffix suppressed until a count arrives and for a money-blind session) | `src/modules/finance/Payments.tsx:635-636, 784` |
| 10 | `PageBody` wrapping the table; ladder props spread from `financeRestriction(money)` | `src/modules/finance/Payments.tsx:791-807` |
| 11 | Table, `minWidth: 980` inside `overflowX: auto`, columns Payment · Booking · Client · Method · Type · Amount · Status · Date · (⋮) | `src/modules/finance/Payments.tsx:880-946`, header list `:884` |
| 12 | Per row: `paymentNo`; `Link` to `/rentals/{bookingNo}`; `Link` to `/clients/{clientId}`; `methodLabel`; `paymentType`; `formatMoney(amount)`; `StatusBadge`; `formatPaymentAt` with a BS `title` when `toBs` can vouch for the date; `ReverseAction` | `src/modules/finance/Payments.tsx:892-941`, helpers `:207-210, :219-235, :246-251, :266-288` |
| 13 | Footer paragraph inside the Card but **outside** `PageBody`: `NO_REVERSAL_ROWS_NOTE` | `src/modules/finance/Payments.tsx:416-418, 954-969` |
| 14 | Right rail `Rail label="Deposits"` → Held / Applied / Refunded, each a literal `—` with a `title` naming the unread table, plus two explanatory paragraphs | `src/modules/finance/Payments.tsx:433-437, 638-673, 974` |
| 15 | `FooterNote` with two extra strings ("Payments are immutable…", "Deposits are a separate liability…") | `src/modules/finance/Payments.tsx:977-982` |
| 16 | `RecordPaymentModal`, mounted only while `money && canTakePayment && recordOpen` | `src/modules/finance/Payments.tsx:993-1000` |
| 17 | `RefundPaymentModal`, mounted only while `money && canReverse && reversing && reversing.invoiceNo !== null` | `src/modules/finance/Payments.tsx:1007-1016` |

### Responsive bands

The file reads **both** locked breakpoints, through one call to `useViewport()` (`src/modules/finance/Payments.tsx:480`), which is defined over `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43, 45-51`). Two booleans are derived from it (`src/modules/finance/Payments.tsx:481-482`):

- **`tabular = viewport !== 'phone'` — the 768 band.** Below 768 the table is not rendered at all; rows become `<article>` cards, each with paymentNo + amount on one line, booking/client links, a status/type/method row, the date, and a full-width `ReverseAction` (`src/modules/finance/Payments.tsx:810-876`, `full` prop `:872`, consumed `:1041, 1070`). At ≥768 the `<table>` renders instead (`:879-946`). `tabular` also switches the Card body padding from `10` to `0` (`:784`) and the footer note's padding/`borderTop` (`:957-958`).
- **`railBesideList = viewport === 'desktop'` — the 1180 band.** At ≥1180 the grid is two columns and the deposits card is wrapped in `Rail` (`src/modules/finance/Payments.tsx:779, 974`), which is `CollapsibleAside` (`src/components/ui/Page.tsx:315-331`). Below 1180 the grid collapses to `1fr` and `railContent` is rendered bare — a reflow beneath the list rather than a collapsed handle (`src/modules/finance/Payments.tsx:974`).

No `@media` rule, no `matchMedia` call and no width literal appears in the file itself; 768/1180 are reached only through `useViewport`.

## 3. Data sources

The configured backend is live Supabase: `IS_MOCK` is `import.meta.env['VITE_DATA_SOURCE'] === 'mock'` (`src/lib/supabase.ts:42`) and `.env.local` sets only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, not `VITE_DATA_SOURCE`. The LOCAL rows below are what the same code reads when that flag is set (`src/lib/supabase.ts:66-68`).

| Screen area | Source kind | Detail |
|---|---|---|
| Ledger rows (all columns) | DB | `payments`, `supabase.from('payments').select(PAYMENT_COLUMNS)` — `src/lib/queries/finance.ts:793-816`; column list `:726-730`; row mapper `:753-778`. Called via `fetchPayments` (`src/modules/finance/Payments.tsx:527-533`) through `useList` (`:570-572`) |
| Booking no. / client name on each row | DB | `bookings ( booking_no )` and `clients ( name )` embeds in the same select — `src/lib/queries/finance.ts:729`; `'(booking not joined)'` / `'(client not joined)'` when the embed is missing (`:758, 766`) |
| Method column | DB | `bank_accounts ( channel_group, bank_name )` embed — `src/lib/queries/finance.ts:730, 771-772`; rendered by `methodLabel` (`src/modules/finance/Payments.tsx:207-210`) |
| Invoice number behind the Reverse control | DB | `invoices ( invoice_no )` embed — `src/lib/queries/finance.ts:729, 764` (null for an advance) |
| "— N payments" in the Card title | DB | `count: 'exact'` requested by `withCount: true` — `src/modules/finance/Payments.tsx:530`; `src/lib/queries/finance.ts:798, 815` |
| Date filter bounds | DB | `payment_date` `gte`/`lte` built from `paymentsInPeriod`'s +05:45 day boundaries — `src/modules/finance/Payments.tsx:178-188`; `src/lib/queries/finance.ts:879-885`; applied `src/lib/queries/listQuery.ts:156-160` |
| Chip predicates | DB | `Received` → `chips: { status: ['Received'] }` (`src/lib/queries/finance.ts:827-832`); `Refunded` → `chips: { payment_type: ['Refund'] }` (`src/modules/finance/Payments.tsx:148`); `All` → no constraint (`:150`) |
| Record Payment modal's invoice list | DB | `invoices` via `listInvoices` with `outstandingInvoices()` (status ∈ {Sent, Partially Paid}, `voided_at IS NULL`) — `src/modules/finance/Payments.tsx:534-540, 581-582, 592-602`; `src/lib/queries/finance.ts:452-478, 526-532` |
| Reversal cap `currentPaidPaisa` | DB | `invoices.paid_amount` from that same invoice list, matched on `invoiceNo` — `src/modules/finance/Payments.tsx:615-618`; column `src/lib/queries/finance.ts:262, 417` |
| Money visibility flag | DB | `users.primary_role` read at sign-in (`src/lib/auth.tsx:76-80`) → `canViewMoney` (`src/lib/rbac.ts:36-50`) → `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) |
| Deposits rail — Held / Applied / Refunded | *(no source)* | Literal `—` strings from a local label array; `security_deposits` and `deposit_movements` have **no query** in the finance module — `src/modules/finance/Payments.tsx:433-437, 651-657`; `src/lib/queries/finance.ts:118-127` |
| Reversal sub-rows (`↳`) | *(no source)* | Not drawn. `payment_reversals` has no reader in `src/lib/queries/finance.ts` (stated `:681-684`), and the screen says so (`src/modules/finance/Payments.tsx:416-418`) |
| Footer note strings | SEED | `FOOTER_NOTE` constant — `src/data/nav.ts:428-432`, rendered `src/components/ui/Page.tsx:443-446`. Copy only; carries no figure |
| Ledger rows in mock mode | LOCAL | `payments` **is** served — `src/lib/mock/corpus.ts:355-372`, wired in at `:420`. `payment_reversals` is listed UNSERVED (`:39`), and there is no `bank_accounts` table in the store at all (`:405-423`) |
| Row embeds in mock mode | LOCAL | `REL` declares only `payments.clients` (`src/lib/mock/engine.ts:83`). `payments → bookings`, `payments → invoices` and `payments → bank_accounts` are undeclared, so each embed resolves to `[]` with a one-time console warning (`src/lib/mock/engine.ts:541-545`) |

**Invented on this page:** no rupee figure on this screen comes from a `src/data/*.ts` constant — the amounts, the count and the invoice list are all read from Postgres. In mock mode every figure is invented by the corpus generator (`src/lib/mock/corpus.ts:363` sets `amount` from the seeded booking breakdown), and the Deposits rail's three values are not figures at all but literal dashes (`src/modules/finance/Payments.tsx:651-657`).

## 4. Actions and writes

| Control | Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|---|
| `[+ Record Payment]` → modal `[Record Payment]` | `recordPayment({ invoiceNo, amountPaisa, paymentMethod, reference, notes, clientUuid }, { userId, role, isOnline })` — `src/modules/finance/modals/RecordPaymentModal.tsx:274-284` | `payment.create` (`src/actions/finance/recordPayment.ts:245`) | `src/actions/finance/recordPayment.ts` | **true** (`:252`) | **Yes** — `src/actions/core.ts:129-131` → `rbac.canRecordPayment` |
| Row `⋮` Reverse → modal `[Confirm Reversal]` | `refundPayment({ id: invoiceId }, { userId, role })` — `src/modules/finance/modals/RefundPaymentModal.tsx:157` | `payment.refund` (`src/actions/payments/refundPayment.ts:10`) | `src/actions/payments/refundPayment.ts` | **absent → false** (default at `src/actions/core.ts:89`, enforced `:222-224`) | **Yes** — `src/actions/core.ts:130-131` → `rbac.canRecordPayment` |

**Record Payment is a real write.** `execute` allocates `payment_no` from the `next_document_number` RPC (`src/actions/finance/recordPayment.ts:308-317`), resolves the invoice's `booking_id`/`client_id`/`branch_id` by a `invoices` lookup on `invoice_no` (`:181-231`), then `idempotentInsert('payments', …)` and refuses to report success unless Postgres returned an `id` (`:319-373`). It always writes `payment_type: 'Advance Payment'` and `status: 'Received'` (`:330, 333`), and omits `bank_account_id`, folding the operator's chosen method into `notes` as a `Method:` line instead (`:130-154, 233-241, 337-339`).

**Reverse is not.** `refundPayment` sets no `implemented` key, so the dispatcher throws `ActionNotImplementedError` before validate, execute, events or audit (`src/actions/core.ts:222-224, 95-105`); the modal's `catch` renders that sentence inline and `onSuccess` never fires (`src/modules/finance/modals/RefundPaymentModal.tsx:177-181`). Written exactly: **renders, dispatches `refundPayment`, action is a stub (core.ts fails it closed)**. Its input type is `{ id: string }` with the comment "Placeholder for actual input schema" (`src/actions/payments/refundPayment.ts:4-6`), so the amount, method and reason the operator typed are validated (`src/modules/finance/modals/RefundPaymentModal.tsx:61-105`) and then dropped.

Controls with no handler at all:

- `Reversed` chip — `disabled`, no `onClick` (`src/modules/finance/Payments.tsx:726-735`).
- `Method` `<select>` — `disabled`, no `onChange` (`src/modules/finance/Payments.tsx:741-748`).
- Deposits rail `<dd>` elements — static `—`, no interaction (`src/modules/finance/Payments.tsx:651-657`).
- `Reversal Method` `<select>` inside the refund modal — has an `onChange` that only sets local state; the value is never sent anywhere (`src/modules/finance/modals/RefundPaymentModal.tsx:273-296`).

Handlers that do work without dispatching an action: `[Refresh]` → `refreshAll` → `list.refetch()` + `invoiceList.refetch()` (`src/modules/finance/Payments.tsx:620-623, 697`); the three chips and both date inputs → `patch()` on the URL search params (`:551-558, 711, 758, 767`); `[Clear filters]` → `setParams(new URLSearchParams())` (`:559, 773`); `ReverseAction` → `setReversing(row)` (`:1064, 549`).

## 5. Gates

**Route reachability.** `Shell` redirects an unauthenticated visitor to `/login` (`src/App.tsx:973-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` and renders `RestrictedState` instead of the children (`src/App.tsx:993, 1020-1023`). `/finance` is in `MONEY_ROUTES` and `isMoneySurface` prefix-matches, so `/finance/payments` is caught (`src/data/nav.ts:147-159`). `MONEY_BLIND` is Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`), so the four money-blind roles never mount this component; **Owner, Admin, Manager, Coordinator and Accounts reach the route** (the same five `src/lib/queries/finance.ts:159` names as the DB's readers).

**Money visibility inside the screen.** `const money = useCanViewMoney()` (`src/modules/finance/Payments.tsx:485`), which returns `false` for an absent user (`src/lib/moneyVisibility.ts:24-27`). It is used four ways:

1. Both fetchers short-circuit to `{ rows: [], total: 0 }` before touching the network (`src/modules/finance/Payments.tsx:529, 536`).
2. `financeRestriction(money)` is spread onto `PageBody`, whose ladder puts `restricted` above everything (`src/modules/finance/Payments.tsx:792`; `src/lib/queries/finance.ts:207-213`; `src/components/ui/PageBody.tsx:143-150`). This exists because `payments` is gated whole-row by RLS, so a money-blind session would otherwise be told the ledger is empty (`src/lib/queries/finance.ts:16-46`).
3. `countSuffix` is suppressed when `!money`, because the Card title sits outside `PageBody` (`src/modules/finance/Payments.tsx:635-636`).
4. Both modals are gated on `money` in their mount condition (`src/modules/finance/Payments.tsx:993, 1007`).

**Write capability, separate from visibility.** `canTakePayment = canRecordPayment(user.role)` — Owner, Coordinator, Accounts only, and `false` offline (`src/modules/finance/Payments.tsx:500-501`; `src/lib/rbac.ts:296-299`). `canReverse = canTakePayment` (`src/modules/finance/Payments.tsx:524`). So an Admin or Manager sees every figure and gets **neither** the header's Record Payment button (`:692`) nor any row's Reverse control — the latter returns `null` rather than rendering disabled (`src/modules/finance/Payments.tsx:1051`).

**Hidden under Law 6, precisely:** for a Warehouse/Technician/Driver/Client session the whole route is replaced by the Shell's `RestrictedState` (`src/App.tsx:1020-1023`); if that guard were bypassed, the body would render `RestrictedState` with `FINANCE_RESTRICTED_REASON` and a "Requires Accounts" chip (`src/lib/queries/finance.ts:167-180`), the title would carry no count, and neither modal could mount.

## 6. States drawn

All four, via `PageBody` (`src/modules/finance/Payments.tsx:791-807`), which selects between the four `StateViews` components in a fixed order (`src/components/ui/PageBody.tsx:143-206`; components at `src/components/ui/StateViews.tsx:34, 87, 171, 213`).

| State | Drawn how |
|---|---|
| Loading | `LoadingSkeleton type="table" rows={5} label="Loading payments…"` — `src/modules/finance/Payments.tsx:793, 800-802`; `src/components/ui/PageBody.tsx:182-184` |
| Error | `ErrorBanner` titled `Could not load payments` when `hasRows` is false, `Could not refresh payments` **above** the surviving rows when true; `onRetry={refreshAll}` — `src/modules/finance/Payments.tsx:794-796`; `src/components/ui/PageBody.tsx:152-180` |
| Empty | Two messages, chosen by `isFiltered`: "No payment matches this filter…" with a Clear filters action, or "No payment has been recorded yet…" — `src/modules/finance/Payments.tsx:797-799, 803-807`; `src/components/ui/PageBody.tsx:186-204` |
| Restricted | `RestrictedState` with `FINANCE_RESTRICTED_REASON` + `requiredRole="Accounts"`, outranking all three above — `src/modules/finance/Payments.tsx:792`; `src/lib/queries/finance.ts:207-213`; `src/components/ui/PageBody.tsx:143-150` |

Two things sit deliberately outside the ladder and therefore survive every state: the Card title with its count (`src/modules/finance/Payments.tsx:784`) and the "reversal rows are not shown" note (`:954-969`).

## 7. Known gaps

1. **`TODO(decision)` — reversal authority is borrowed from `canRecordPayment`.** `src/modules/finance/Payments.tsx:517-522`. Taking money in and paying it back out are gated by the same predicate, so Coordinator can reverse; the file states that narrowing it here would desync the UI from `src/actions/core.ts:130-131`.
2. **Reverse dispatches a stub.** `src/actions/payments/refundPayment.ts:8-36` has no `implemented`, so `src/actions/core.ts:222-224` fails it closed. Every reversal attempted from this screen ends in `ActionNotImplementedError` (`src/modules/finance/modals/RefundPaymentModal.tsx:177-178`).
3. **The refund modal collects three fields the action cannot receive.** Amount, method and reason are validated and dropped — the input type is a one-field placeholder (`src/actions/payments/refundPayment.ts:4-6`; the modal states it at `src/modules/finance/modals/RefundPaymentModal.tsx:125-155, 273-278`).
4. **A reversal is scoped to the invoice, not to the payment.** `payment_reversals.original_payment_id` is unreachable from the current action, so the button's own accessible name says so (`src/modules/finance/Payments.tsx:404-406, 1054-1056`), and an advance with `invoiceNo === null` gets a disabled control (`:1053, 1061`).
5. **The reversal cap is only partially readable.** `reversalPaidPaisa` is looked up in the `outstandingInvoices()` result set (Sent / Partially Paid only), so a reversal against a fully settled invoice hands the modal `undefined` (`src/modules/finance/Payments.tsx:615-618`; `src/lib/queries/finance.ts:526-532`), which the modal now refuses rather than treating as unbounded (`src/modules/finance/modals/RefundPaymentModal.tsx:88-95`). A `TODO(persistence)` for a single-invoice reader sits at `src/modules/finance/Payments.tsx:400-402`.
6. **`Reversed` chip is drawn and dead.** `payment_reversals` has no reader in the finance module and carries a narrower role list than `payments` (`src/lib/queries/finance.ts:79, 673-684`); the chip is `disabled` with that reason (`src/modules/finance/Payments.tsx:726-735`).
7. **`Method` filter is drawn and dead.** `payments` has no method column; the channel comes through a non-`!inner` embed that PostgREST cannot filter the parent by (`src/lib/queries/finance.ts:726-730`; reason on the control at `src/modules/finance/Payments.tsx:741-748`).
8. **Every payment this app writes will show `—` in the Method column.** `recordPayment` deliberately leaves `bank_account_id` NULL and writes the method into `notes` (`src/actions/finance/recordPayment.ts:130-154, 337-339`), while the column reads `bank_accounts.channel_group` (`src/lib/queries/finance.ts:771-772`) and renders an explicit non-value when it is null (`src/modules/finance/Payments.tsx:207-210, 212-213`). A `TODO(decision)` for a `bank_accounts` picker is at `src/actions/finance/recordPayment.ts:151-153`.
9. **The `(Refunded)` chip can only ever match rows this app did not write.** It filters `payment_type = 'Refund'` (`src/modules/finance/Payments.tsx:148`), and the only implemented writer hardcodes `payment_type: 'Advance Payment'` (`src/actions/finance/recordPayment.ts:330`).
10. **Deposits rail carries no figures.** Three dashes with `title` attributes naming `security_deposits` / `deposit_movements`, which the finance module excludes on purpose (`src/modules/finance/Payments.tsx:433-437, 651-657`; `src/lib/queries/finance.ts:118-127`).
11. **No pagination, but an exact total.** No `page` is ever passed into `ListFilters` (`src/modules/finance/Payments.tsx:145-195, 570`), so `applyListFilters` adds no `.range()` (`src/lib/queries/listQuery.ts:186-189`) while the Card title states the exact `count` (`src/modules/finance/Payments.tsx:635-636`). On a ledger larger than one PostgREST response the title and the visible rows disagree, and the file offers no paging control.
12. **BS dates are omitted for most of the year.** `toBs` vouches for Shrawan 2083 only and returns `null` outside it (`src/lib/bs.ts:41-50, 92-99`), so the BS `title` on the date cell is simply absent for any payment outside that month (`src/modules/finance/Payments.tsx:246-251, 867, 934`).
13. **`received_by` is never shown.** The query returns a raw `users.id` and refuses to join a name, because `users` is self-scoped by RLS (`src/lib/queries/finance.ts:717-724`); the screen renders no "received by" column at all (`src/modules/finance/Payments.tsx:884`).
14. **A `PageBody`-wide limitation this screen inherits:** a refetch in progress replaces surviving rows with a skeleton, logged as `TODO(decision)` at `src/components/ui/PageBody.tsx:48-57`. Pressing `[Refresh]` here blanks the ledger for the duration of the query.
15. **Mock mode contradicts the live row shape.** With `VITE_DATA_SOURCE=mock` the corpus writes `payment_type: 'Rental'` and `method` / `reference` / `reversed_at` columns that do not exist on `payments`, and omits `transaction_ref`, `notes` and `received_by` (`src/lib/mock/corpus.ts:355-372` vs `src/lib/queries/finance.ts:726-751`); `payment_date` is a bare day string rather than an instant (`src/lib/mock/corpus.ts:367` vs `:638` of the query module). Because no `payments → bookings` / `→ invoices` / `→ bank_accounts` relationship is declared (`src/lib/mock/engine.ts:68-86, 541-545`), every row renders `(booking not joined)`, a `—` method, and a **disabled Reverse control**. And corpus invoices carry `status: 'Issued'` (`src/lib/mock/corpus.ts:341`), which is not one of the statuses `outstandingInvoices()` asks for (`src/lib/queries/finance.ts:320, 528`), so the Record Payment modal's invoice `<select>` is empty in mock mode.
