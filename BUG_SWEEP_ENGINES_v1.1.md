> 📌 **NOW TRACKED — 16 Aug 2026. `PLAN.md` §4.35.** For five days these 14 findings were
> referenced nowhere in `PLAN.md` or `PROGRESS.md`, which by this repo's own rule means they
> were not tracked at all. They are now.
>
> ⚠ **This sweep was READ, NOT RUN** — the sandbox failed to start that session, and the tree
> has moved a great deal since. **Re-verify every row against the current tree before working
> it.** `E-P0-3` (`createAction` never checking permissions, defaulting the caller to `admin`)
> was already closed incidentally by the 11 Aug wave.
>
> ⏰ `E-P0-1` is no longer a future problem: `toBs()` stops converting on **17 Aug 2026**, and
> the only month-length table in the workspace is marked "DO NOT SEED — arithmetically
> impossible" by its own author. See `PLAN.md` §4.34 — it needs published data from the owner.

# BUG_SWEEP_ENGINES_v1.1 — the `lib/` engine layer

**Date:** 2026-08-11 · **Scope:** `src/lib/**`, `src/actions/core.ts`, `src/actions/payments/**`
**Relationship to `BUG_SWEEP_REGISTER_v1.0.md`:** additive, not a re-run.

## Why this sweep exists

`BUG_SWEEP_REGISTER_v1.0` is indexed **by screen** (§2 "By module": finance, reports,
rentals, clients, inventory, operations, today, calendar, …). No row in that table covers
the engine layer as its own module — `lib/money` appears only as a parenthetical appendage
of `rentals`, and `lib/bs.ts`, `lib/rbac.ts`, `lib/offlineQueue.ts`, `lib/dataAccess.ts`,
`lib/auth.tsx` and `actions/core.ts` appear nowhere.

That matters because `PLAN.md §0` puts the business rules **in the engines** ("pages never
implement business logic"). A screen-indexed sweep finds every page that renders a rule
wrongly, and no bug in the rule itself. All 14 findings below are in the rule itself.

**Verification status — read this before acting.** These are findings from reading code,
not from driving the app. The Linux sandbox failed to start this session, so `npx tsc
--noEmit`, `npm test` and the browser were all unavailable. Nothing here has been executed.
Severities are argued from the code path, and each finding names the file:line to check.
Per `CLAUDE.md`, treat this as "reported", not "verified".

---

## Counts

| Severity | Count |
|---|---|
| P0 | 3 |
| P1 | 6 |
| P2 | 4 |
| P3 | 1 |
| **Total** | **14** |

---

## P0 block

### [E-P0-1] — BS dates stop resolving entirely on 17 Aug 2026, six days from today

**File:** `src/lib/bs.ts:50, 84`

`SHRAWAN_2083_DAYS = 32` is the only month length the file holds, and `toBs` returns `null`
for any day outside it:

```ts
const day = ANCHOR_BS.day + offset
if (day < 1 || day > SHRAWAN_2083_DAYS) return null
```

Anchor is 16 Jul 2026 = 1 Shrawan 2083, so the valid window is **16 Jul – 16 Aug 2026**.
From **17 Aug 2026** every call returns `null`, on every screen, permanently.

This is not a future risk — it is already firing. Any booking with a forward-dated return,
delivery or expiry beyond 16 Aug renders its BS line as `—` **today**. The app's own
`TODAY` is frozen at 31 Jul (`bs.ts:122`), which is exactly why the dashboard still looks
healthy and hides the problem.

`Calendar.md §4.2` calls BS/AD correctness "the highest-priority correctness bug in the
product" and the file's header says "an honest gap beats a wrong date" — that reasoning is
sound for a one-month scaffold, but the scaffold now expires inside the week.

Register `P3-11` (`rentals/NewRental.tsx:398`) records the *symptom* on one screen ("em dash
for any date outside Shrawan 2083") at P3. The systemic cliff — every screen, all at once,
on a known date — is not tracked anywhere.

**Fix:** load a real BS month-length table (2081–2090 at minimum) before 17 Aug. This is
data entry against a published calendar, not a product decision, so it is unblocked.

---

### [E-P0-2] — Three different discount laws in three layers; `rbac.ts` invents a 15% tier

**Files:** `src/lib/rbac.ts:58-65`, `src/lib/money.ts:145-155`,
`supabase/migrations/0002_bookings.sql:9, 596-599`

One rule, three implementations that do not agree:

| Layer | Rule |
|---|---|
| DB (`0002_bookings.sql:596`) | `percent <= 10` **or** (reason ≥10 chars **and** approver not null). Cap 25. Header at `:9`: "**No bypass.**" |
| `money.ts` `discountGate` | Same as DB. Comment: "**No Owner bypass.**" |
| `rbac.ts` `canApproveDiscount` | Owner → **anything ≤25, no reason, no approver**. Admin/Manager → **≤15 only**. |

`rbac.ts` contributes two rules that exist in no spec, no migration, and no other engine:

1. **An Owner bypass** that both other layers explicitly forbid in writing.
2. **A 15% ceiling for Admin/Manager.** There is no 15% threshold anywhere in the schema.
   Its practical effect is that a 20% discount is approvable by nobody except an Owner —
   while `discountGate` will happily accept it from any non-null approver.

The DB constraint is the real backstop, so this cannot corrupt data. It will produce UI
that grants what the database then rejects, and denies what the database would allow —
which is precisely the failure mode `rbac.ts`'s own header promises to prevent: *"Every
rule below mirrors a function in migration 0014/0018, so a capability can never be granted
in the UI and denied by RLS, or the reverse."* `canApproveDiscount` mirrors nothing.

Register `P1-11` covers discount *stacking* evading the gate — a different defect. The
contradiction between the two TS engines is not recorded.

**Fix:** delete the policy from `canApproveDiscount` and have it delegate to
`money.ts`'s `discountGate`, the one that already matches the DB. If the 15% tier is a real
ruling, it belongs in the migration first — mark `TODO(decision)` and put it in `PLAN.md §4`
rather than leaving the third opinion in the tree.

---

### [E-P0-3] — `createAction` never checks permissions, and defaults the caller to `admin`

**File:** `src/actions/core.ts:20, 23-25`

```ts
return async (input, ctx = { userId: 'system', role: 'admin' }) => {
  // 1. Permission check
  // In a real app, you would check ctx.role against config.permissions.
```

The check is a comment. Every `permissions: ['payment.refund']`, `['payment.record']` etc.
on every action is decorative — no action has ever denied anyone.

Worse than the no-op: the **default context is `role: 'admin'`**. Any action invoked without
an explicit ctx runs with full privilege under a fabricated actor id `'system'`, and
`core.ts:39` writes that fabricated id into the audit line.

Register `P1-04` records the *symptom* at two call sites (hardcoded `{USR-001, Manager}` in
the payment modals) and says "rbac gates never consulted". The reason they are never
consulted is this function — the layer that was supposed to consult them. Fixing the two
call sites to pass a real session, as `P1-04` prescribes, changes nothing while the
dispatcher discards the value.

**Fix:** implement the check against `lib/rbac.ts`, and **remove the default parameter** so
that omitting ctx is a compile error rather than a silent privilege escalation.

---

## P1

### [E-P1-1] — Offline: a user action touching 2+ rows of one table silently loses all but the first

**Files:** `src/lib/dataAccess.ts:116, 125`, `src/lib/offlineQueue.ts:93-120`

`enqueueMutation` dedupes on `[table+action+clientUuid]` and **returns `false`** when it
rejects a duplicate. `safeUpdate` never reads the return value:

```ts
await enqueueMutation(String(table), 'update', { ...payload, id }, actionUuid)
return { data: { ...payload, id }, error: null } // Optimistic response
```

Callers pass one stable action key per user action (that is the documented contract). So a
single action updating three `booking_lines` enqueues row 1, has rows 2 and 3 **rejected as
duplicate replays of row 1**, and returns optimistic success for all three. The rows are
gone; the UI says saved.

The v3 comment in `offlineQueue.ts:56-66` anticipates this exactly — *"one user action
writing several ROWS of the same table must derive a distinct key per row, or the second row
is treated as a replay of the first"* — and then leaves it as a caller obligation that
nothing enforces and no caller can even detect, because the boolean is dropped.

**Fix:** make `safeUpdate`/`idempotentInsert` propagate the `false`, and derive the queue key
per row (`${actionUuid}:${id}`) rather than per action.

---

### [E-P1-2] — Mutations stranded in `'syncing'` are never retried by any future drain

**File:** `src/lib/offlineQueue.ts:126, 173-191`

`replayMutation` sets `'syncing'` before the network call. `getPendingMutations()` selects
`status === 'pending'` only. Every terminal path resets to `'pending'` or `'failed'` —
except a tab closed, reloaded, or crashed mid-flight, which leaves the row at `'syncing'`
forever. No drain, no `online` event, and no boot path (`:230`) will ever look at it again.

For a field app on Nepali mobile data — the whole reason this queue exists — closing the tab
during a slow sync is routine, not exotic. The write is silently lost and appears nowhere:
not in `getPendingMutations`, not in `getDeadLetterMutations` (which filters on `'failed'`).

**Fix:** on module load, reset `'syncing'` rows older than a timeout back to `'pending'`.
Replay is already idempotent via `client_uuid` (`:197`), so re-running one is safe by design.

---

### [E-P1-3] — A dead-lettered write can never be re-attempted, by anyone

**File:** `src/lib/offlineQueue.ts:67-69, 100-109, 215-217`

After `MAX_RETRIES`, a row is set to `'failed'` and kept. It still occupies the unique index
`&[table+action+clientUuid]`. When the operator retries the same action, `enqueueMutation`
finds that row and rejects the new attempt as a duplicate — returning `false`, which
`safeUpdate` discards (see E-P1-1), so the UI reports success again.

The dead-letter list is therefore not "needs manual review" but "this operation is
permanently unperformable from this device", and the only signal is a `console.warn`.

**Fix:** exclude `'failed'` rows from the duplicate pre-check, or clear the dead-letter row
as part of an explicit retry.

---

### [E-P1-4] — A rejected `getSession()` hangs the app on the loading state forever

**File:** `src/lib/auth.tsx:132-143`

```ts
supabase.auth.getSession().then(({ data }) => { … })
```

No `.catch`. On a network failure or a Supabase outage the promise rejects, `setLoading(false)`
never runs, and `loading` stays `true` for the lifetime of the page. Per the `loading`
contract at `:22-27`, `Shell` will not route anywhere while it is true — so the operator gets
a permanent spinner and an unhandled rejection in the console.

Foundation §6, quoted in `money.ts:328`: *"A blank page is never acceptable."* This is the
offline-first app's most likely startup condition.

**Fix:** add `.catch` → `setUser(null); setLoading(false)` and surface an inline error, so a
failed session lookup lands on the login screen rather than nowhere. Same treatment for the
`onAuthStateChange` handler at `:145`.

---

### [E-P1-5] — `eachDay` and `isWeekend` still truncate on UTC — the defect the file says it fixed

**Files:** `src/lib/bs.ts:110-113, 125-127`; also `src/data/today.ts:434`

`bs.ts:60-77` documents the Kathmandu-civil-date fix at length: *"This used to truncate on
`getUTCDate()`, which is a different date for 5 hours 45 minutes of every day … It would
have started failing the moment real `timestamptz` values arrived."*

Two exports in the same file were not converted and still do exactly that:

```ts
export function eachDay(startAd: Date, days: number): Date[] {
  const start = Date.UTC(startAd.getUTCFullYear(), startAd.getUTCMonth(), startAd.getUTCDate())
```
```ts
export function isWeekend(ad: Date): boolean {
  return ad.getUTCDay() === 6
}
```

`isWeekend` is the more visible of the two: Nepal's weekend is **Saturday** (`Calendar.md §0`),
and from 18:15 UTC Friday onward it is already Saturday in Kathmandu while `getUTCDay()`
still says 5 — so the calendar shades the wrong column. `eachDay` feeds the month range at
`data/today.ts:456`, and `CAL_TODAY_AD` at `:434` repeats the raw `getUTCDate()` truncation
a third time.

Latent today only because every seeded timestamp is midnight UTC, which is the same
condition the header says made the original bug invisible.

**Fix:** route both through the existing `kathmanduCivil` helper.

---

### [E-P1-6] — Refund reports success without sending the amount, and writes nothing

**Files:** `src/actions/payments/refundPayment.ts:16-35`, `src/modules/finance/modals/RefundPaymentModal.tsx:47-63`

`refundPayment` is a stub: it `console.log`s, emits an event, and returns `{success: true}`.
There is no database write.

The modal then does two things the operator cannot distinguish from a real reversal:

```ts
await refundPayment({ id: invoiceId }, { userId: 'USR-001', role: 'Manager' })
```

1. **The amount, reason and method are never transmitted.** The action's input type is
   `{ id: string }`. Everything the operator typed stays in React state and goes only to the
   event bus and `onSuccess`.
2. **`onSuccess` + `onClose` run unconditionally**, so the modal closes clean and the screen
   updates — against a subtitle that reads *"Enforcing payment immutability. Creating negative
   reversal entry."* Nothing was created.

Register `P1-03` covers the unbounded amount and the missing reversal row in
`Finance.handleRefundSuccess`. The part not recorded is that **the backend action is a stub
that receives no amount** — so `P1-03`'s fix (clamp the amount, append a reversal row) would
still be writing against a no-op. `recordPayment` at `actions/payments/recordPayment.ts` has
the identical shape.

**Fix:** these two `actions/payments/*` stubs should be deleted, per register `P1-14`'s
instruction to consolidate on `actions/finance/recordPayment` — and the refund path needs a
real action with an amount in its input type before any UI fix on top of it means anything.

---

## P2

### [E-P2-1] — `NaN` passes amount validation in both money modals

**Files:** `RefundPaymentModal.tsx:33, 126, 138`; `RecordPaymentModal.tsx:40`

`onChange={(e) => setRefundAmount(Number(e.target.value))}` — clearing a `type="number"`
input gives `''`, and `Number('')` is `NaN`.

`if (refundAmount <= 0)` is **`false`** for `NaN`, so the guard passes and submission
proceeds. `formatMoney(rupees(NaN))` renders **"Rs NaN"** in the live preview at `:138`.

**Fix:** `Number.isFinite(amount) && amount > 0`.

---

### [E-P2-2] — Optimistic offline writes return a record with no `id`

**File:** `src/lib/dataAccess.ts:42, 52, 117, 126`

All four offline/network-failure paths return `{ data: finalPayload, error: null }` — the
payload as submitted, with no database-assigned `id`. Any caller that chains on the result
(creating child rows, navigating to the new record, storing the id for a later update) gets
`undefined` while `error` is `null`, i.e. while it has been told the write succeeded.

**Fix:** either pre-generate the id client-side so the optimistic record is complete, or
return a discriminated result that makes "queued, no id yet" unignorable at the type level.

---

### [E-P2-3] — Unguarded `error.message` inside the error handler

**File:** `src/lib/dataAccess.ts:56`

`error.code === '23505' && error.message.includes('client_uuid')` — dereferences `.message`
directly. Line 49 in the same function and `offlineQueue.ts:197` both defensively wrap it
(`String(error.message)`). A Supabase error object without `message` throws a `TypeError`
from inside the catch path, replacing a handled duplicate with an unhandled crash.

**Fix:** `String(error.message ?? '')`, matching the two neighbours.

---

### [E-P2-4] — `canApproveDiscount` returns `true` for every role when percent ≤ 0

**File:** `src/lib/rbac.ts:60`

```ts
if (percent <= 0) return true
```

This runs before any role check, so `canApproveDiscount('Warehouse', 0)`,
`('Driver', -5)` and `('Client', -5)` all return `true` — including `Client`, which
`isStaff()` twelve lines above exists to keep off every staff surface.

Zero is arguably harmless; a **negative** percent is a surcharge or an upstream sign error,
and it is approved by an external portal user.

**Fix:** `if (percent < 0) return false`, and apply the role check before the zero case.

---

## P3

### [E-P3-1] — `grouped()` renders small negatives as `"-0"`

**File:** `src/lib/money.ts:48-55`

`neg` is taken from the raw input, but the digits come from `roundHalfUp`, which returns
`-0` for inputs in `(-0.5, 0)`. `Math.abs(-0)` → `0`, so `grouped(-0.4)` → `"-0"`.

`formatMoney` is unaffected (it passes an already-absolute whole-rupee figure), but `grouped`
is exported and directly callable. Reachable by any caller formatting a sub-rupee reversal.

**Fix:** derive the sign from the rounded value.

---

## Open question, not a finding

`rbac.ts:79-88` — `canRecordPayment` admits Owner, Coordinator, Accounts; `canOverrideCreditLimit`
admits Owner, Admin, Manager. Admin and Manager can override a credit limit but cannot record
a payment. That may well be deliberate, but unlike the money-visibility rules above it, neither
predicate cites the migration function it mirrors, so it cannot be checked against the DB by
reading. Worth confirming against `0014`/`0018` and adding the citation.

---

## Suggested order

1. **E-P0-1** — hard deadline of 17 Aug, and it is data entry, not a decision.
2. **E-P0-3** then **E-P0-2** — E-P0-3 is the layer that makes register `P1-04`'s fix real;
   E-P0-2 decides which rule that layer should enforce.
3. **E-P1-4** — one `.catch`, removes a total-hang startup path.
4. **E-P1-1 / E-P1-2 / E-P1-3** — one coherent pass over the offline queue; all three are
   silent data loss and they interact.
5. **E-P1-5** — mechanical, before real `timestamptz` values land.
6. **E-P1-6** — fold into register `P1-14`'s action consolidation rather than fixing twice.
