# Expenses

Route `/finance/expenses` (`src/App.tsx:426-433`) · also mounted as the Finance **Expenses** tab, `<Expenses embedded />` (`src/modules/finance/Finance.tsx:1040`) · component `src/modules/finance/Expenses.tsx` · 1086 lines.

## 1. What it is

The expense **ledger**: a paged, server-filtered table of `expenses` rows read through `listExpenses` (`src/lib/queries/finance.ts:1057-1080`), with an entry sheet that inserts a row (`createExpense`, `src/lib/queries/finance.ts:1330-1369`) and a row menu that moves the approval status (`setExpenseStatus`, `src/lib/queries/finance.ts:1420-1450`).

It is not `/reports/expenses` — that route renders `modules/reports/ExpenseReports.tsx` off the `src/data/expenseReports.ts` fixture (`src/App.tsx:454-462`, `src/modules/reports/ExpenseReports.tsx:17-34`). Two Expenses screens exist and only this one touches the database.

The screen writes directly through the query module. It imports nothing from `src/actions/` (verified: no `actions/`, `createAction` or `dispatch` occurs anywhere in `src/modules/finance/Expenses.tsx`).

## 2. What renders

Top to bottom at desktop:

1. **`ScreenHeader`** — icon `card`, title "Expenses", description "Operating costs, entered here and approved here. Corrections are reversal rows, never edits." (`Expenses.tsx:811-817`). When `embedded` the `<h1>` is demoted to a subtitle row (`src/modules/finance/TabHeader.tsx:53-91`). Its one action, `[+ Add Expense]` (`Expenses.tsx:801-805`), is **spread in only when `money` is true** (`Expenses.tsx:816`) — omitted, not disabled.
2. **Outer `PageBody`** wrapping everything below, carrying only `noun="expenses"` and the spread `financeRestriction(...)` (`Expenses.tsx:824`). Its sole job is the restricted gate.
3. **Status-move error banner** — `ErrorBanner` rendered when `banner` state is set by a failed `setExpenseStatus` (`Expenses.tsx:826`, set at `758-775`).
4. **Lookups error banner** — `ErrorBanner` "Could not load the category filter" when `listExpenseCategories` / `listExpenseBranches` reject (`Expenses.tsx:828-833`).
5. **Filter row** — `role="group"` of seven chips: `All` plus the six `EXPENSE_STATUSES` members (`Expenses.tsx:836-869`), each with `aria-pressed` and a `STATUS_GLYPH` icon (`Expenses.tsx:158-165`). At the right (`marginLeft:'auto'`), an "All categories" `<select>` built from `expense_categories` rows, `disabled` when the list is empty (`Expenses.tsx:875-891`).
6. **`Card`** titled `{total} expenses` / "Expenses" when the count is null (`Expenses.tsx:894`, `countedTitle` at `:799`), body padding 0, containing:
   - **Inner `PageBody`** with the full ladder — `loading`, `error`, `onRetry`, `hasRows`, `empty`, `emptyIsFiltered`, `skeleton="table"`, `skeletonRows={6}`, custom empty copy, `onClearFilters` when filtered, and `financeRestriction` spread again (`Expenses.tsx:902-920`).
   - **The table** (`tabular === true`): `<div style={{overflowX:'auto'}}>` around a `minWidth: 880` table (`Expenses.tsx:922-923`). Columns: Expense · Date · Category · Vendor · Amount (right) · **VAT** · Status · unlabelled actions column (`Expenses.tsx:927-941`). The VAT header is wrapped in `Unavailable` with an `info` glyph (`Expenses.tsx:932-939`). Each row: `expenseNo` + `branchName`; BS above AD date; `categoryName` + `categoryCode`; `vendorName` + `description`; `formatMoney(amount)`; a `NoValue` dash for VAT; `StatusBadge`; `RowMenu` (`Expenses.tsx:945-983`).
   - **Pager** — rendered only when `total > 25` (`ROWS_PER_PAGE`, `Expenses.tsx:174`): "Showing A to B of N", Previous / `page / pageCount` / Next (`Expenses.tsx:1036-1062`).
7. **`FooterNote`** with extra line "Corrections are reversal rows, never edits" (`Expenses.tsx:1083`).
8. **`AddExpenseSheet`** — mounted only when `money && sheetOpen` (`Expenses.tsx:1071-1081`). It is a `Modal size="lg"` (max-width 720, `src/components/ui/Modal.tsx:29-39`), i.e. the app's centred dialog, **not** a right-hand drawer; the file says so itself (`Expenses.tsx:394-403`). Contents: Date (BS label above a native `<input type="date">`), Category select + a line stating how many categories are configured, Vendor, Description, a two-column Amount/Branch grid with a live `formatMoney(rupees(amount))` echo, and a dashed box "Drawn in the wireframe, not stored by the schema" listing the four `NO_COLUMN_FIELDS` plus a disabled `[Attach receipt]` button (`Expenses.tsx:510-628`). Footer: Cancel · Save Draft · Submit (`Expenses.tsx:496-508`).

**Responsive bands the file actually reads.** One hook: `useTabularLayout()` (`Expenses.tsx:16`, `:648`, branched at `:921`). That is `useViewport() !== 'phone'` (`src/lib/device.ts:139-141`), and `useViewport` reads **both 768 and 1180** (`BREAKPOINT`, `src/lib/device.ts:43`, matchMedia at `:64-65`).

- **< 768** — the table is replaced by stacked card rows: expense no + status badge, `vendorName · categoryName`, amount opposite the BS·AD date, a "VAT —" line, and the `RowMenu` right-aligned (`Expenses.tsx:987-1034`).
- **768–1179 (tablet) and ≥ 1180 (desktop) render identically.** The page consumes only the phone/not-phone answer, so the 1180 boundary is computed inside `useViewport` and never acted on here. Between 768 and 880 the table scrolls horizontally inside its own container because of `minWidth: 880` (`Expenses.tsx:922-923`).
- The only other capability read is hover, and it is not a width: `Unavailable` calls `useCapability()` and swaps a `title` tooltip for a 500 ms long-press popover when `!hasHover` (`src/components/ui/Unavailable.tsx:44`, `:70-77`, `:111`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Expense table / phone card rows | **DB** | `expenses`, via `listExpenses` (`src/lib/queries/finance.ts:1057-1080`); select list `EXPENSE_COLUMNS` with embeds `expense_categories(code,name)`, `branches(name)`, `bookings(booking_no)` (`finance.ts:981-984`). Called at `Expenses.tsx:736`. No view — `finance.ts:34-35` states there is no `expenses_v`. |
| Row count, pager, card title | **DB** | `count: 'exact'` on the same select (`finance.ts:1062`), requested by `withCount: true` (`Expenses.tsx:736`); surfaced as `list.total` (`Expenses.tsx:743`). |
| Amount column | **DB** | `expenses.amount`, `numeric(14,2)` rupees → `Paisa` at the boundary (`finance.ts:1012`, `toPaisa` at `:391-393`, `rupees()` at `src/lib/money.ts:23-25`), rendered by `formatMoney` (`src/lib/money.ts:62-69`). |
| Date column, BS label | **DB** | `expenses.expense_date`, a bare `YYYY-MM-DD` (`finance.ts:1011`). BS is computed from it at render by `bsLabel` → `toBs`/`formatBs` (`Expenses.tsx:206-209`); nothing BS is stored. |
| Category filter dropdown, sheet category picker | **DB** | `expense_categories` where `is_active`, ordered by `code`, via `listExpenseCategories` (`finance.ts:1222-1231`); fetched at `Expenses.tsx:687`. |
| Branch picker in the sheet | **DB** | `branches`, `id, name`, via `listExpenseBranches` (`finance.ts:1249-1257`); fetched at `Expenses.tsx:687`. |
| New expense number | **DB** | `supabase.rpc('next_document_number', { p_sequence_key: 'expense' })` (`finance.ts:1331-1333`). Never minted in the browser. |
| Status chips (`All` + 6) | **DB** (enum vocabulary, not a query) | `EXPENSE_STATUSES` (`finance.ts:958-965`), declared `satisfies readonly ExpenseStatusDb[]` against `Database['public']['Enums']['expense_status']` (`Expenses.tsx:37`). Imported rather than retyped, so a chip cannot ask for a value the enum lacks. |
| Row-menu transitions | **SEED-equivalent** — *not* a `src/data/*.ts` array | `EXPENSE_TRANSITIONS` (`finance.ts:1400-1407`) is a hand-written constant in the query module. Its own comment states no migration defines a transition graph (`finance.ts:1385-1388`), so this graph is authored in code, not read from the database. Same for `EXPENSE_ENTRY_STATUSES` (`finance.ts:1282`). |
| Default date in the entry sheet | **SEED** | `TODAY_DAY_AD` (`Expenses.tsx:18`, `:421`) from `src/data/today.ts:730`, derived from that file's `TODAY` — the seeded operating day, explicitly not the wall clock (`src/data/today.ts:715-726`). |
| VAT column (header + every cell) | **none — no column** | `VAT_UNAVAILABLE` (`Expenses.tsx:103-105`); every cell renders `NoValue` (`Expenses.tsx:974`, `:1025`). `ExpenseListRow` carries no VAT field (`finance.ts:914-950`) and `finance.ts:904-905` states the table has no `vat_amount`/`vat_rate`. |
| Payment method · Paid by · Cost centre (sheet) | **none — no column** | `NO_COLUMN_FIELDS` (`Expenses.tsx:114-119`), rendered as named text in a dashed box (`Expenses.tsx:601-627`), never as inputs. |
| Under `VITE_DATA_SOURCE=mock` | **LOCAL** | `expenses` is listed in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`) and initialised to `[]` (`corpus.ts:424`) — **the ledger is UNSERVED in mock mode**. `expense_categories` (`corpus.ts:112-120`, `:411`) and `branches` (`corpus.ts:68-70`, `:407`) *are* served, and the mock `rpc` implements `next_document_number` with an `EXP` prefix (`src/lib/mock/client.ts:413-417`, `:231-234`). |

Invented on this page: no rendered amount, date, vendor, category or count is invented — every figure in the table comes from an `expenses` row. What is authored rather than sourced is the entry sheet's default date (`TODAY_DAY_AD`, the seeded operating day, `src/data/today.ts:730`) and the approval transition graph plus the two creatable statuses (`EXPENSE_TRANSITIONS` / `EXPENSE_ENTRY_STATUSES`, `src/lib/queries/finance.ts:1400-1407`, `:1282`), which no migration defines.

## 4. Actions and writes

**No `src/actions/` dispatch occurs on this page.** `src/modules/finance/Expenses.tsx` contains no import from `src/actions/`, no `createAction` call and no dispatcher call. Therefore `checkCapability` (`src/actions/core.ts:124-218`) is never reached from this screen, and no capability string on this page needs — or has — a case in that switch. `src/actions/finance/` holds only `recordPayment.ts`; there is no expense action file anywhere under `src/actions/`.

Both writes go straight from the query module to Supabase:

| Write | Where invoked | Implementation | Enforcement |
|---|---|---|---|
| Insert an expense | `Expenses.tsx:463-475` (`submit('Draft')` at `:501`, `submit('Pending Approval')` at `:504`) | `createExpense` (`finance.ts:1330-1369`): `rpc('next_document_number')` then `supabase.from('expenses').insert(payload).select(EXPENSE_COLUMNS).single()`. Real write, not a stub. | Postgres RLS only. `finance.ts:1259-1265` claims migration 0054 added `expenses_insert_finance` / `expenses_update_finance`, both `auth_is_finance_or_admin()`. That is the query module's comment; the SQL was not read for this pack. |
| Move approval status | `Expenses.tsx:763` (from `RowMenu`'s `onMove`, `Expenses.tsx:353-366`) | `setExpenseStatus` (`finance.ts:1420-1450`): guards against `EXPENSE_TRANSITIONS`, then `.update({status}).eq('id', id).eq('status', from)` — a compare-and-set that throws when zero rows match (`finance.ts:1444-1448`). Real write. Sends `status` and nothing else (`finance.ts:1437`). | Same RLS claim as above. Nothing in the UI restricts *which* signed-in role sees Approve/Reject. |

Law 8 idempotency: `clientUuid` is minted once per sheet open (`Expenses.tsx:437-443`) and a 23505 on `client_uuid` returns the row the first submit wrote (`finance.ts:1361-1364`).

Client-side validation before the insert: category, branch, vendor, description and a finite `amount > 0` (`Expenses.tsx:446-458`).

**Buttons and controls with no handler:**

- `[Attach receipt]` — `<Button icon="upload" disabled>` inside `Unavailable`, **no `onClick`** (`Expenses.tsx:621-625`). Reason string at `Expenses.tsx:128-130`: `receipt_url`/`receipt_size` exist but no storage bucket is configured and nothing in `src/` uploads a file.
- `Record a reversal` — a `<span role="menuitem" aria-disabled tabIndex={0}>`, **no `onClick`** (`Expenses.tsx:373-383`). Reason at `Expenses.tsx:143-145`: `expense_reversals.reversal_no` is NOT NULL/unique and `number_sequences` has no `expense_reversal` key.

Every other control is wired: Add Expense → `setSheetOpen(true)` (`:802`); status chips → `setStatus` + `setPage(1)` (`:844-847`); category select → `setCategoryId` + `setPage(1)` (`:878-881`); `⋮` → toggles the menu (`:328`); Cancel → `onClose` (`:498`); Previous/Next → `setPage` (`:1051`, `:1057`); `onRetry` → `list.refetch` (`:905`); `onClearFilters` → `clearFilters` (`:918`, defined `:752-756`).

## 5. Gates

**Reaching the route.** `Shell` refuses it before the component mounts: `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`), rendering `RestrictedState` instead of the children (`src/App.tsx:1020-1023`). `/finance/expenses` matches the `/finance` prefix in `MONEY_ROUTES` (`src/data/nav.ts:147-159`). `canViewMoney` is `!MONEY_BLIND.has(role)` (`src/lib/rbac.ts:36-38`) and `MONEY_BLIND` is `Warehouse · Technician · Driver · Client` (`src/lib/rbac.ts:45-50`). So the roles that reach this screen are **Owner · Admin · Manager · Coordinator · Accounts** — the same five named in `FINANCE_MONEY_ROLES` (`src/lib/queries/finance.ts:159`). An unauthenticated visitor is redirected to `/login` first (`src/App.tsx:973-975`). The sidebar/bottom bar drop the whole Finance section for money-blind roles via `permittedNav` (`src/data/nav.ts:110-116`).

**Money visibility inside the page.** One call: `useCanViewMoney()` (`Expenses.tsx:646`), which is `canViewMoney(user.role)` and `false` for no session (`src/lib/moneyVisibility.ts:24-27`). It is turned into three `PageBody` props by `financeRestriction` (`src/lib/queries/finance.ts:207-213`) and spread at **both** levels — the page wrapper (`Expenses.tsx:824`) and the table card (`Expenses.tsx:919`). `restricted` outranks error, loading, empty and children (`src/components/ui/PageBody.tsx:143-150`).

**What is hidden under Law 6 for a money-blind session** (defence in depth behind the Shell guard, and the state the embedded Finance tab would hit):

- The `[+ Add Expense]` header action is **omitted**, not disabled (`Expenses.tsx:816`).
- `AddExpenseSheet` is not mounted at all (`Expenses.tsx:1071`).
- The category/branch lookups are not fetched — the effect returns early on `!money` (`Expenses.tsx:685`), even though `finance.ts:1187-1192` notes both tables are readable by any staff role.
- `fetchExpenses` short-circuits to `{ rows: [], total: 0 }` **without issuing a request** (`Expenses.tsx:733-739`), so the `200 []` that whole-row RLS would return is never mistaken for "no expenses exist" (`finance.ts:37-43`).
- Chip row, table, pager and card title are all inside the restricted `PageBody`.

**Not gated:** nothing on this page distinguishes among the five money roles. A Coordinator sees the same Approve / Reject menu items as an Owner; only the database policy stands between them.

## 6. States drawn

All four exist.

| State | How |
|---|---|
| Loading | `PageBody` → `LoadingSkeleton type="table" rows={6}` (`Expenses.tsx:910-911`; `src/components/ui/PageBody.tsx:182-184`; `src/components/ui/StateViews.tsx:87`). |
| Error | Via `PageBody` for the list query (`Expenses.tsx:904-906`) — `hasRows` keeps a failed *refresh* above the surviving table instead of replacing it (`PageBody.tsx:161-179`). Plus three hand-rolled `ErrorBanner`s: failed status move (`Expenses.tsx:826`), failed lookups on the page (`:828-833`), and inside the sheet for a failed insert (`:511`) and failed lookups (`:513-518`). |
| Empty | Via `PageBody`, with both shapes supplied: filtered → "No expenses match these filters" + Clear filters; unfiltered → "No expenses yet" (`Expenses.tsx:907-918`; `PageBody.tsx:186-204`). |
| Restricted | Via `PageBody` at both levels from `financeRestriction` (`Expenses.tsx:824`, `:919`), reason and "Requires Accounts" chip from `finance.ts:167-180`. Plus the route-level `RestrictedState` in the Shell (`src/App.tsx:1020-1023`). |

## 7. Known gaps

- **No `TODO(decision)` marker exists in `Expenses.tsx`.** The two it depends on live elsewhere: `src/lib/queries/finance.ts:1398` (who may set `Paid` / `Cancelled` is unruled, so both are unreachable from this screen — `EXPENSE_TRANSITIONS` maps them to `[]`, `finance.ts:1400-1407`, and the row menu renders a terminal-state explanation instead, `Expenses.tsx:346-350`), and `src/components/ui/PageBody.tsx:56` (a refetch-in-progress still blanks a populated table for its duration, which this page hits on every Retry and every filter change).
- **VAT column has no source and always renders `—`** (`Expenses.tsx:103-105`, `:932-939`, `:974`, `:1025`). Kept deliberately visible rather than dropped.
- **Receipt upload is not built** — `[Attach receipt]` is disabled with no handler (`Expenses.tsx:621-625`); reason at `:128-130`.
- **Reversal is not built** — `Record a reversal` is an inert `aria-disabled` menu item (`Expenses.tsx:373-383`); reason at `:143-145`. The page's own footer and header both promise "Corrections are reversal rows, never edits" (`Expenses.tsx:815`, `:1083`), which is currently a statement about what is *not* possible here rather than about a path that exists.
- **Three sheet fields the wireframe draws are absent by design** — Payment method, Paid by, Cost centre (`Expenses.tsx:114-119`, rendered as text at `:601-627`).
- **The dialog is not the right-hand sheet the spec draws.** `Modal size="lg"` is the app's centred dialog (`src/components/ui/Modal.tsx:29-39`); the file flags the difference itself (`Expenses.tsx:394-403`).
- **The Shell's expense search never reaches the query.** `/finance/expenses` passes `search="Search expense no, vendor, description…"` (`src/App.tsx:429`), but `Header` renders that string as the label of a button that fires ⌘K to open the Command Palette (`src/components/shell/Header.tsx:109-113`, `:129-132`). The page's `filters` memo sets only `chips`, `sort`, `tiebreak` and `page` — no `search` key (`Expenses.tsx:714-724`) — while `listExpenses` has `EXPENSE_SEARCH_COLUMNS` ready and unused (`finance.ts:1041`, `:1066`). Searching an expense by number, vendor or description is not wired on this screen.
- **Mock mode contradicts the page's own honesty machinery.** `expenses` is `UNSERVED` and initialised to `[]` (`src/lib/mock/corpus.ts:33-44`, `:424`) while `expense_categories` and `branches` populate normally, and the mock session is Owner (`corpus.ts:430-433`), so `restricted` is false and the table renders "No expenses yet · Nothing has been recorded" (`Expenses.tsx:912-917`) — the exact false claim about the business that `finance.ts:37-43` is written to prevent, arriving by the other door.
- **Two Expenses screens disagree about what an expense is.** `/reports/expenses` (`src/App.tsx:454-462`) renders `modules/reports/ExpenseReports.tsx`, which imports its rows, categories, methods, branches and budgets from `src/data/expenseReports.ts` (`ExpenseReports.tsx:17-34`) — invented figures, including a VAT/reclaimable amount and a budget that this page states have no column (`finance.ts:896-910`). Both routes are reachable by the same roles.
- **A replayed submit burns an `expense_no`.** `createExpense` calls `next_document_number` *before* the insert, so an idempotent retry consumes a sequence number without writing a row; gaps in `expense_no` are expected (`finance.ts:1323-1328`).
- **`expense_no` format is not what the rulings asked for.** The allocator returns `EXP-2026-0001` while the ruling was `EXP-1`, and `expenses` carries no format CHECK (`finance.ts:1310-1316`). The screen renders whatever the database issued.
- **The stated reason for having no success toast is only true off-route.** `Expenses.tsx:788-791` says `useToast()` "throws outside `ToastProvider`, which would make this screen unmountable on its own" — but both mounted paths sit inside `<ToastProvider>` (`src/App.tsx:94`, `:743`), so the constraint holds only for a standalone mount, not for the shipped screen. The behaviour (refetch as the confirmation) is unaffected.
- **`setExpenseStatus` sends `status` alone** (`finance.ts:1437`) — no `updated_by` is written from the app, so who approved an expense is not recorded by this path.
- **Nested `aria-label` on the VAT cell.** `Unavailable` already sets `aria-label={reason}` on its wrapper (`src/components/ui/Unavailable.tsx:109`) and `NoValue` sets a second one on the inner span (`Expenses.tsx:215`).
