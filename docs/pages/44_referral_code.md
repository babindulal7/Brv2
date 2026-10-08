# Generate Referral Code
Route `/clients/referral/new` · `src/modules/clients/GenerateReferralCode.tsx` · 328 lines

Status: **Stub**

---

## 1. What it is

A two-card form mounted at `/clients/referral/new` (`src/App.tsx:564-571`, lazily imported at `src/App.tsx:80`), reached from the Clients page's Referral tab via its **Generate Referral Code** button (`src/modules/clients/Clients.tsx:321-323`).

It runs no query on mount — the import list (`GenerateReferralCode.tsx:1-10`) contains no query hook, no `supabase`, and no action. Everything it draws is local state, two seed arrays, and a random suffix.

It cannot issue a code. The one primary button is rendered permanently `disabled` and carries **no `onClick` at all** (`:145-149`); the page states the reason twice, in a persistent inline notice (`:164-183`) and through `Unavailable`'s reason string (`:45-46`, `:128-131`). The file's own header records what was removed: a `setTimeout` → success toast → `navigate('/clients?tab=referral')` sequence that called no action and stored nothing (`:22-41`).

---

## 2. What renders

### Desktop, top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` "Generate Referral Code" + description "…Issuing it is not connected yet — nothing here is stored." | `:137-152`; component `src/components/ui/Page.tsx:66-108` |
| 2 | Header actions: **Cancel** (ghost) and **Create Referral Code** (primary, `disabled`) wrapped in `Unavailable` | `:141-150` |
| 3 | Two-column grid, `minmax(0,1fr) minmax(0,320px)`, `alignItems: 'start'` | `:154` |
| 4 | **Card "Code details"** | `:155-257`; `Card` at `src/components/ui/Page.tsx:28-62` |
| 4a | Persistent danger paragraph with `error` icon: "Issuing is not connected — nothing under `src/actions/` creates or stores a referral code… **Do not read a code from here out to a client.**" No `role="alert"`, deliberately (`:161-163`) | `:164-183` |
| 4b | Field **Referrer** — `Select`, placeholder option "Select a client…" plus 26 client options, hint "Only existing clients can issue a referral code." | `:184-193` |
| 4c | Field **Referral Code** — `Input` (uppercases on change, `disabled` until a referrer is picked) beside a 36×36 icon button "Regenerate suggested code"; inline error line under it when the code is malformed or duplicate | `:195-237`; error line `:231-236` |
| 4d | Field **Credit Reward** — `Input`, `inputMode="decimal"`, hint "Paid once the referral converts and completes its first return." **Money-gated**, absent for money-blind roles | `:239-255` |
| 5 | **Card "Preview"** — when a referrer and a code exist: Referrer name, Code chip (red text while invalid/duplicate), Reward *(money only)*, and a neutral status chip reading **"Not issued"** with the line "This code exists only on this screen." | `:259-320`; status chip `:295-319` |
| 5b | Otherwise: "Select a referrer to preview the code." | `:321-323` |

No `KpiStrip`, no `Rail`, no `FooterNote`, no table.

### Responsive bands

**The file reads neither 768 nor 1180 — it imports nothing from `src/lib/device.ts`** (imports `:1-10`), and calls no `useViewport()` / `useTabularLayout()` / `useBandColumns()`. The grid at `:154` is the same two tracks at every width, so below 768 the 320px Preview column stays beside the form rather than stacking under it.

The only device question asked anywhere on this page is asked indirectly, and it is a *capability* question, not a width one: `Unavailable` calls `useCapability()` (`src/components/ui/Unavailable.tsx:44`, hook at `src/lib/device.ts:111-130`) and, when `hasHover` is false, replaces the `title` reason with a 500 ms long-press popover (`Unavailable.tsx:70-77`, `:111-123`). That is why the same reason is also written into the card as plain text (`:44`, `:164-183`) — the popover is capped at 220px (`Unavailable.tsx:142`).

CSS-only reflow: `PageHeader`'s `flexWrap: 'wrap'` on the header row and on its actions group (`src/components/ui/Page.tsx:78`, `:105`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Referrer `Select` — 26 client names | **SEED** | `CLIENTS_DATA`, the 26-record array at `src/data/clients.ts:171-973` (`C-1` … `C-26`); imported `:8`, copied and name-sorted at `:83`, rendered `:186-191` |
| Code uniqueness check | **SEED** | `REFERRALS` — four records at `src/modules/clients/Clients.tsx:248-281` (`KCW-PRO-26`, `BIKRAM-DOP`, `HIMALAYA-VIP`, `AMN-CREW-83`); imported `:9`, turned into an uppercase `Set` at `:84`, tested at `:109` |
| Suggested code (`HIMALAYAN-482`-shaped) | *computed* | `suggestCode()` `:62-67` — first word of the referrer's name, uppercased, capped at 10 chars, plus `Math.floor(100 + Math.random() * 900)` |
| Reward amount and its preview figure | *operator input* | `parseMoney` (`src/lib/money.ts:76-81`) at `:112`, `formatMoney` (`src/lib/money.ts:62-69`) at `:288` |
| Preview status chip | *literal* | The string "Not issued" is hardcoded at `:313`; the previous `[timer] Awaiting first return` was removed and why is recorded at `:292-294` |
| Anything at all from the database | **none** | No `supabase`, no `lib/queries/*`, no `useList` in the imports (`:1-10`) |
| Referrals in the local store | **LOCAL — UNSERVED** | `buildStore()` registers 17 tables (`src/lib/mock/corpus.ts:405-423`) and none is referral-shaped; referrals are not even in `UNSERVED` (`corpus.ts:33-44`), because nothing queries them. The Clients Referral tab states the same about the schema (`Clients.tsx:296-304`) |

**Invented on this page:** every name in the referrer dropdown (the 26 `CLIENTS_DATA` records, `src/data/clients.ts:171-973`) and the four existing referral codes that uniqueness is checked against (`Clients.tsx:248-281`). The reward figure is typed by the operator and is never stored; the code itself is generated locally from an invented name plus a random three-digit suffix (`:62-67`).

---

## 4. Actions and writes

**There is no dispatch on this page.** The file imports no action, no `createAction` product, and no `dispatchContext` (`:1-10`). Nothing is written anywhere — not to Supabase, not to the mock store, not to `localStorage`.

| Control | Where | What it actually does |
|---|---|---|
| **Create Referral Code** (primary) | `:145-149` | Renders, is hardcoded `disabled`, and **has no `onClick` prop**. Not wired to any action — there is no referral action to wire it to: `src/actions/clients/` contains `blockClient.ts`, `createClient.ts`, `mergeClients.ts`, `updateClient.ts` only, and a case-insensitive search for "referral" across all of `src/actions/` returns no file. `Unavailable` supplies the refusal text (`:145`, reason chosen at `:128-131`) |
| **Cancel** (ghost) | `:142-144` | `handleCancel` → `navigate('/clients?tab=referral')` (`:133`). No write |
| Regenerate icon button | `:208-229` | `regenerate()` (`:101-105`) — re-runs `suggestCode` into local state and clears `codeTouched`. `disabled` until a referrer is selected |
| Referrer `Select` | `:185` | `onReferrerChange` (`:93-99`) — local state; auto-fills the code only while `codeTouched` is false |
| Referral Code `Input` | `:197-207` | Local state, uppercased on every keystroke (`:200`) |
| Credit Reward `Input` | `:241-247` | Local state |

`canSubmit` (`:121-126`) is still computed and still gates — but only over *which* refusal sentence the disabled button carries (`:128-131`), as its own comment states (`:115-120`). It reaches no dispatcher.

**Capability mapping, for the action that does not exist yet.** `checkCapability` (`src/actions/core.ts:124-218`) maps 32 strings; no `referral.*` string appears anywhere in the switch. Its `default: return undefined` (`:215-216`) is read by the dispatcher as a denial for every role including Owner (`core.ts:236-241`), and `implemented` defaults to `false` (`core.ts:88-89`, refused at `:223-225`). So a referral action added later and dispatched from here would fail closed twice over until both a body and a switch case exist.

---

## 5. Gates

**Route.** No role gate on `/clients/referral/new` (`src/App.tsx:564-571`). `Shell` holds during session restore (`src/App.tsx:964-970`), redirects to `/login` when there is no user (`:973-975`), and refuses only money surfaces (`:993`) — that test is `isMoneySurface(pathname)` over `MONEY_ROUTES = ['/finance','/reports','/admin','/tools/pricing','/tools/depreciation']` (`src/data/nav.ts:147-159`), which does not include `/clients`. **All nine roles** (`src/lib/rbac.ts:4-14`) reach this page, external `Client` included; nothing on it checks `isStaff` (`src/lib/rbac.ts:53-55`).

**Money.** `useCanViewMoney()` at `:81` → `src/lib/moneyVisibility.ts:24-27` → `rbac.canViewMoney` (`src/lib/rbac.ts:36-38`), whose `MONEY_BLIND` set is Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`).

**Hidden under Law 6 (absent, not masked):**

- the whole **Credit Reward** `Field`, behind `money &&` (`:239-255`)
- the Preview's **Reward** row, behind `money &&` (`:284-291`)
- the reward limb of `canSubmit`, so a money-blind session is not held back by a field it cannot see (`:126`)
- the words "and a reward amount" in the incomplete-form refusal text (`:130`)

`rewardPaisa` itself is `null` rather than a parsed figure for a money-blind session (`:112`), so no rupee value is computed at all.

---

## 6. States drawn

`PageBody` is **not imported** (`:1-10`), so none of the four shared states come from it. `StateViews` is not imported either.

| State | Present? | Where |
|---|---|---|
| **Loading** | None on the page | No fetch and no in-flight action exists. The only loading here is the route-level `Suspense` fallback for the lazy chunk, `LoadingSkeleton type="card"` in the Shell (`src/App.tsx:1026`) |
| **Error** | Hand-rolled, three of them | The permanent build-gap notice (`:164-183`), the code error line — bad format or "This code is already in use" (`:110`, rendered `:231-236`) — and the reward error line "Enter a reward amount greater than 0" (`:113`, rendered `:248-253`). No `ErrorBanner`; the app-level `ErrorBoundary` (`src/App.tsx:1025`) is the only catch |
| **Empty** | Hand-rolled | "Select a referrer to preview the code." in the Preview card (`:322`). Not the shared `EmptyState` (`src/components/ui/StateViews.tsx:34`) |
| **Restricted** | **None** | The file never renders or imports `RestrictedState` (`:1-10`). The Shell's cannot fire here — `/clients/referral/new` is not a money route (`src/data/nav.ts:147-153`) |

---

## 7. Known gaps

1. **No `TODO(decision)` marker exists in this file** (searched for TODO/FIXME/HACK/XXX — no matches). The build gap is stated in prose instead, at `:12-41` and `:44-46`.

2. **The screen's whole purpose is unbuilt, and it says so.** The primary button renders `disabled` with no handler (`:145-149`). This is verified, not assumed: `src/actions/clients/` holds `blockClient.ts`, `createClient.ts`, `mergeClients.ts`, `updateClient.ts`, and no file under `src/actions/` mentions "referral". Nothing stores a referral in the local corpus either (`src/lib/mock/corpus.ts:405-423`), and the Clients Referral tab states the same about the schema (`Clients.tsx:296-304`).

3. **The suggested-code placeholder is recomputed on every render, with a fresh random number.** `:203` calls `suggestCode(referrer.name)` inline in the `placeholder` prop, and `suggestCode` ends in `Math.random()` (`:65`). Every keystroke in the code or reward field re-renders the component and changes the suffix the placeholder advertises — the operator watches "e.g. HIMALAYAN-482" become "e.g. HIMALAYAN-731" while typing. (The placeholder is only visible while the field is empty, which is the narrow case where it is also least stable.)

4. **Uniqueness is checked against four invented codes.** `:84` builds the duplicate set from `REFERRALS` (`Clients.tsx:248-281`) — the same four rows the Clients Referral tab deleted from its own panel as fabricated, keeping the export solely because this file reads it (`Clients.tsx:294-313`, explicitly at `:310-312`). "This code is already in use" (`:110`) is therefore an assertion about seed data, and it can neither find a real collision nor be trusted when it fires.

5. **The referrer list is unfiltered, so blocked clients can issue codes.** `:83` copies all of `CLIENTS_DATA` with no predicate. Three seeded records carry `isBlocked: true` and a block reason — `C-5` Shine Pictures Nepal (`src/data/clients.ts:328-329`), `C-12` Vortex Visuals Group (`:554-555`), `C-23` Trishuli Adventure Media (`:872-873`) — and all three appear in the dropdown. `mergedIntoId` (Law 3's closed-record marker, `src/data/clients.ts:125-133`) is likewise never checked, so a merged-away record would appear too.

6. **Contradiction with the Clients directory over where clients come from.** That screen reads `client_directory_v` through `useClients` (`Clients.tsx:56-62`; queries at `src/lib/queries/clients.ts:347`, `:376`) and its own header records that "The `CLIENTS_DATA` seed array this file used to import is gone from it entirely" (`Clients.tsx:56-61`). This page still reads that array (`:8`, `:83`). So a client created through `/clients/new` — a real insert (`src/actions/clients/createClient.ts`) — never appears as a possible referrer, and every name that does appear may not exist in the database.

7. **The regenerate button is 36×36, under the 44×44 floor.** `:214-226` hardcodes `width: 36, height: 36`. The shared `Button` sets `minHeight: 44` precisely because that floor applies "on every device, desktop included" (`src/components/ui/Page.tsx:112-119`, `:154`). The two text inputs beside it land at 44 regardless of this page's `inputStyle`, so the row is also visually uneven — see the next item.

8. **`inputStyle`'s `height: 36` is dead on both controls it is passed to.** `:48-58` sets `height: 36`; `Input` and `Select` both set `minHeight: 44` before spreading `...style` (`src/components/ui/Input.tsx:71`, `:81`; `src/components/ui/Select.tsx:71`, `:84`), and `min-height` wins over a smaller `height`. The value is inert on the Referrer select, the Code input and the Reward input.

9. **A hand-typed code sticks to the previous referrer.** `onReferrerChange` re-suggests only while `codeTouched` is false (`:95-98`), and nothing else resets that flag except `regenerate` (`:104`). Type a code by hand, then change the referrer, and the Preview renders the new referrer's name (`:264`) above the old referrer's code (`:281`) with no warning — the same pairing the operator would read out if issuing worked.

10. **`Select` had no live call site before this page.** Its own header states "this component has zero live JSX call sites today" (`src/components/ui/Select.tsx:4-11`). This page uses it (`:185-192`) via the barrel export (`src/components/ui/index.ts:3`), so that comment is now stale — noted because the component's untested paths (the `options` prop, `error`, `helperText`) are all bypassed here in favour of `children` and a raw style override.
