# Pricing Calculator

Route `/tools/pricing` (`src/App.tsx:642-649`) · component `src/modules/tools/PricingCalculator.tsx` · 502 lines

## 1. What it is

A quote sandbox. Operator-typed item lines (qty · days · rate) are summed in `src/modules/tools/PricingCalculator.tsx:108-118` and pushed through the shared financial engine `price()` (`src/lib/money.ts:125-140`) — the same call `NewRental.tsx:1310-1322` makes — to draw a subtotal → discount → taxable → VAT → total ladder (`src/modules/tools/PricingCalculator.tsx:363-373`).

It reads no table and writes nothing: the component's only imports are `Icon`, `Page`, `Unavailable`, `device`, `money`, `discount` and `settingsStore` (`src/modules/tools/PricingCalculator.tsx:3-10`) — no query file, no `src/actions/*`, no `dataAccess`. The page header says so itself (`src/modules/tools/PricingCalculator.tsx:145`) and the footer repeats it (`src/modules/tools/PricingCalculator.tsx:431`).

## 2. What renders

Desktop, top to bottom:

1. **`PageHeader`** — dollar icon, title "Pricing", description "A quote sandbox on the same engine as New Rental. It books nothing and saves nothing." (`src/modules/tools/PricingCalculator.tsx:142-146`; component at `src/components/ui/Page.tsx:66-108`).
2. **Two-column grid** (`src/modules/tools/PricingCalculator.tsx:148-157`), left column `minmax(0,1fr)`, right rail `minmax(300px, 340px)`.
   - **Card "Items"** (`:159-234`) with an **Add item** button in the card action slot (`:162-186`). One row per line, each row a 5-track grid of `Item` / `Qty` / `Days` / `Rate / day` / remove-button (`:190-230`); the remove button is `disabled` while `lines.length === 1` (`:211`). A trailing note paragraph restating Law 9 (`:231-233`).
   - **Card "Discount"** (`:236-312`): chip row `0 · 5 · 10 · 15 · 20 · 25 %` from `DISCOUNT_CHIPS` (`:82`, `:238-265`), a free-text **Custom %** input (`:266-273`), and — only when `discountPercent > 10` (`:106`, `:278`) — **Reason** and **Approver** inputs (`:280-287`). An inline `role="alert"` danger block renders whenever `validateDiscount` fails (`:291-311`).
   - **Card "Tax, advance and deposit"** (`:314-342`): a VAT checkbox labelled `VAT {vatRatePercent}%` (`:316-323`), an **Advance due** input with the hint "Entered, not derived — no advance percentage is configured anywhere in this build." (`:325-332`), and a **Security deposit** input hinted as a Law 5 liability (`:333-340`).
   - **The ladder** (right rail, `:346-428`): heading "Quote" (`:361`); rows Subtotal, Discount, Taxable, VAT (`:363-369`); a rule; **Total** (`:373`); a rule; **Advance due**, rendering the literal string `Not entered` when `parseMoney` returns null (`:377-381`); a dashed-border block holding **Security deposit** plus the sentence "Refundable. Not part of the total, not a payment, and it never reduces what is outstanding." (`:385-402`); and a `[🔒 Use in a booking]` affordance wrapped in `Unavailable` (`:404-427`).
3. **`FooterNote`** with the extra note "Quote sandbox — nothing here is booked, invoiced or stored" (`:431`; component at `src/components/ui/Page.tsx:443-469`).

**Responsive bands.** The file reads **both** 768 and 1180, through `useViewport()` (`src/modules/tools/PricingCalculator.tsx:85`), whose bands are `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`):

- **Below 1180** (`stacked = viewport !== 'desktop'`, `:138`): the grid collapses to one column and the ladder reflows underneath the sheet rather than sitting beside it (`:153`).
- **Below 768** (`viewport === 'phone'`): each line row's 5-track grid collapses to a single column (`:197`); the remove button gets `justifySelf: 'start'` (`:224`); and the ladder becomes `position: sticky; bottom: 0; zIndex: 5` (`:356-358`).

Separately, `Unavailable` branches on **capability**, not width — `useCapability().hasHover` decides `title` vs. long-press popover (`src/components/ui/Unavailable.tsx:44`, `:70-77`, `:111`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Item lines (label, qty, days, rate) | INPUT | Component state `lines`, seeded with one blank line by `NEW_LINE` (`src/modules/tools/PricingCalculator.tsx:79`, `:87`). Nothing prefills from inventory. |
| Discount % (chips + custom) | INPUT | `discountChip` / `customDiscount` state (`:90-91`); chip values are the literal array `DISCOUNT_CHIPS = [0,5,10,15,20,DISCOUNT_CAP]` (`:82`), `DISCOUNT_CAP = 25` from `src/lib/money.ts:146`. |
| Reason / Approver | INPUT | `reason` / `approver` state (`:92-93`), free text. |
| Advance due, Security deposit | INPUT | `advance` / `deposit` state (`:96-97`), parsed by `parseMoney` (`:131-132`, `src/lib/money.ts:76-81`). |
| VAT rate | LOCAL — **`localStorage`, not `corpus.ts`** | `getSetting('vatRatePercent')` (`:100`) → `readSettings()` → `window.localStorage.getItem('br.settings.vatRatePercent')` (`src/lib/settingsStore.ts:314`, `:330-368`, `:381-383`). Default `13` when unset (`src/lib/settingsStore.ts:103`). |
| Ladder figures (subtotal / discount / taxable / VAT / total) | — computed | `price()` in `src/lib/money.ts:125-140`, called at `src/modules/tools/PricingCalculator.tsx:124-129` with `payments: rupees(0)`. Whole-rupee half-up at each step (`src/lib/money.ts:110-113`). |
| Discount gate verdict | — computed | `validateDiscount()` in `src/lib/discount.ts:17-61`, called at `:105`. |
| Footer bar text ("All dates are shown in BS above AD", "Timezone: Asia/Kathmandu (NPT)", "Babin Rentals OS v3.0.0") | SEED | `FOOTER_NOTE` constant in `src/data/nav.ts:428-432`, read by `src/components/ui/Page.tsx:444`. |

Only three kinds are sanctioned (DB / LOCAL / SEED). This page reaches **none** of them for any figure: there is no DB query file in its import list (`:1-10`), and `src/lib/mock/corpus.ts` serves no settings table at all — `buildStore()` covers 13 tables (`src/lib/mock/corpus.ts:22-24`, `:124`) and `UNSERVED` lists ten more (`:33-44`), settings in neither. So the operator-typed rows above are marked INPUT rather than misfiled under a kind they do not belong to.

Invented on this page: nothing monetary — every rupee on the ladder is computed by `src/lib/money.ts:125` from figures the operator typed this session. The two non-computed values are the VAT rate's fallback of `13` when localStorage is empty (`src/lib/settingsStore.ts:103`) and the footer's version/timezone strings (`src/data/nav.ts:428-432`).

## 4. Actions and writes

**No dispatches.** The file imports nothing from `src/actions/` (`src/modules/tools/PricingCalculator.tsx:1-10`), so `createAction` / `checkCapability` (`src/actions/core.ts:124-218`, `:220-254`) are never reached from this route. There is no capability string to map, and nothing on this page persists.

Every interactive control and its handler:

| Control | Line | Handler |
|---|---|---|
| **Add item** button | `:162-186` | `onClick` appends `NEW_LINE(nextId)` to state (`:164-167`). |
| Remove-line button (per row) | `:208-228` | `onClick` filters the line out of state (`:212`); `disabled` when one line remains (`:211`). |
| 6 discount chips | `:241-263` | `onClick` sets `discountChip`, clears `customDiscount` (`:245-248`). |
| Custom % input | `:266-273` | `onChange` → `setCustomDiscount` (`:271`). |
| VAT checkbox | `:317` | `onChange` → `setVatOn((v) => !v)`. |
| Reason / Approver / Advance / Deposit inputs | `:280-287`, `:325-340` | `onChange` → state, via `LabelledInput` (`:479-485`). |

**Buttons with no handler:** none. The one non-functional affordance, `[Use in a booking]`, is not a button at all — it is a `<span>` (`:408-426`) inside `Unavailable` (`:404-427`), which renders `aria-disabled` with the stated reason "A quote sandbox books nothing. Carrying these figures into a booking needs the draft hand-off New Rental owns; nothing on this page may write one." (`:405`; `src/components/ui/Unavailable.tsx:105-133`).

## 5. Gates

**Route reach.** Every `/tools/pricing` visit goes through `Shell` (`src/App.tsx:645`, `:943-1040`), which redirects to `/login` without a session (`src/App.tsx:973-975`) and then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `/tools/pricing` is explicitly listed in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), and `MONEY_BLIND` is `{Warehouse, Technician, Driver, Client}` (`src/lib/rbac.ts:45-50`, `:36-38`).

- **Reaches the page:** Owner, Admin, Manager, Coordinator, Accounts.
- **Refused with `RestrictedState`:** Warehouse, Technician, Driver, Client (`src/App.tsx:1020-1023`).

The entry point matches the guard: `ToolsLanding` filters the Pricing card out for money-blind roles through the same predicate (`src/modules/tools/ToolsLanding.tsx:130-140`, card defined at `:78-83`).

**In-page money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not imported or called** anywhere in `PricingCalculator.tsx` (`:1-10`). Nothing is hidden under Law 6 inside the page: once a role passes the route guard, every figure in the ladder renders unconditionally. The whole route is the gate.

**Law 10 (discount).** Enforced in-page, not by role: `validateDiscount(discountPercent, reason, approver.trim() || null)` (`:105`) refuses negatives, refuses >25%, and above 10% requires a reason ≥10 characters plus a non-empty approver (`src/lib/discount.ts:22-57`). Until it passes, `appliedDiscount = 0` and the ladder shows undiscounted figures (`:122`), with the reason inline (`:291-311`).

## 6. States drawn

**Page level: none of the four.** `PageBody` (`src/components/ui/PageBody.tsx:119`) and `StateViews` are never imported by this file (`:1-10`). There is no loading state (nothing is fetched), no error state, no empty state — the page always renders with at least one blank line row (`:87`) — and no restricted state of its own.

Three shell-level states do wrap it, drawn by `App.tsx` rather than by the page:

- **Loading** — `<Suspense fallback={<LoadingSkeleton type="card" label="Loading…" />}>` while the lazy chunk arrives (`src/App.tsx:70`, `:1026`).
- **Error** — `<ErrorBoundary>` around the route body (`src/App.tsx:1025`).
- **Restricted** — `RestrictedState` for money-blind roles (`src/App.tsx:1020-1023`).

The discount failure banner (`:291-311`) is a hand-rolled inline `role="alert"`, not `ErrorBanner`.

## 7. Known gaps

- **No `TODO(decision)` markers in this file.** `grep TODO src/modules/tools/PricingCalculator.tsx` returns nothing.
- **Fractional paisa render malformed money.** `equipment` multiplies parsed paisa by `Number(l.qty)` and `Number(l.days)` with no integer constraint (`:110-116`), and both fields are `inputMode="decimal"` (`:205-206`, `:483`). A fractional result flows into `price()` unrounded (`src/lib/money.ts:126-128`: `subtotal` and `taxable` are not passed through `toWholeRupee`), and `formatMoney` then does `Math.abs(p) % 100` and `String(paise).padStart(2,'0')` (`src/lib/money.ts:62-69`) — for `p = 100.5` that produces `Rs 1.0.5`. Reachable from the Qty or Days field.
- **Negative rates are accepted and reduce the subtotal.** `qty` and `days` are clamped with `Math.max(0, …)` (`:115`) but `rate` is not, and `parseMoney` returns a negative Paisa for `-500` (`src/lib/money.ts:76-81`, regex `/^-?\d*\.?\d*$/`). A negative rate line therefore subtracts from `equipment`, lowering the total by a path the 25% discount cap does not see.
- **An unparseable custom % is silently read as 0 with no message.** `Number('10abc')` is `NaN`, so `discountPercent` falls to `0` (`:102-103`), `validateDiscount(0, …)` returns valid (`src/lib/discount.ts:26-28`), and no banner renders — the operator sees a chipless discount row at Rs 0 with nothing saying why. Contrast the negative case, which does produce a banner.
- **The approver field is a name, not an authority.** `validateDiscount` only checks the string is non-empty (`src/lib/discount.ts:48-50`), and `canApproveDiscount(role, percent)` (`src/lib/rbac.ts:274-282`) is never called on this page. So a Coordinator session can produce a quoted total at 25% that `canApproveDiscount` would refuse for that role, and an Admin/Manager can exceed their own 15% ceiling (`src/lib/rbac.ts:280`). Same shape as the open `TODO(decision)` recorded at `src/lib/rbac.ts:350-353` for late-fee waivers.
- **The header comment contradicts `NewRental.tsx` as it stands today.** `src/modules/tools/PricingCalculator.tsx:54` says "`NewRental.tsx`'s `VAT_PCT = 13` is the violation this screen must not repeat." That literal no longer exists: `src/modules/rentals/NewRental.tsx:82-90` records it as deleted and reads `getSetting('vatRatePercent')` instead. The live `13` literal is now `src/lib/seed.ts:83` (`VAT_PERCENT = 13`).
- **The two pages read the same setting on different cadences.** This page calls `getSetting('vatRatePercent')` on every render (`:100`), which re-reads `localStorage` each time (`src/lib/settingsStore.ts:330-368`); `NewRental` snapshots it once per mount (`src/modules/rentals/NewRental.tsx:1276`). Neither subscribes to changes, so this page picks up a Settings edit on its next render while New Rental does not until remount.
- **`system_settings` exists in the schema and nothing reads it.** The table is created at `supabase/migrations/0007_admin_security.sql:320-335` and typed at `src/types/supabase.ts:9440`, but no file under `src/` queries it — the VAT rate this page renders comes from `localStorage` (`src/lib/settingsStore.ts:314`, `:376`), which `settingsStore`'s own header states is deliberate ("no invented database column and no migration", `src/lib/settingsStore.ts:20-22`).
- **`[Use in a booking]` is drawn and unbuilt** (`:404-427`) — stated `Unavailable` with a reason rather than a dead button. Recorded because the ladder has no other exit: nothing carries these figures anywhere.
- **Advance due is entered, never derived** (`:331`) — no settings key holds an advance percentage (`SettingKey` union, `src/lib/settingsStore.ts:31-57`), and the control says so rather than defaulting.
