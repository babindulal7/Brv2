# BUG_SWEEP_ENGINES_v1.2 — second engine pass

**Date:** 2026-08-11 · **Scope:** the `lib/` files not covered by `v1.1`, plus
`lib/booqable/**` and the shared context providers in `components/ui/`.

Companion to `BUG_SWEEP_ENGINES_v1.1.md` (14 findings) and `WIRING_AUDIT_2026-08-11.md`.
Same verification caveat: **read, not run.** The sandbox failed to start again this session,
so no typecheck, no tests, no browser. Every finding names file:line to check.

## What came back clean

Worth recording, because "swept and clean" is information too:

- **`lib/booqable/map/payments.ts`** — the file its own header calls the highest-risk in the
  integration. Currency asserted against NPR per batch; `amount + deposit === total`
  arithmetic verified before routing; negative portions held rather than split; mixed
  charges given an honest fourth classifier state instead of a guess; Law 4 corrections
  emitted as a reversal + new row, never an update. I went looking for a cents/paisa scaling
  error and there isn't one — the 1:1 mapping is stated and justified. No findings.
- **`lib/phone.ts`** — one rule, one place, mirrors the DB CHECK character for character.
  One edge case only (R3-7 below).
- **`lib/discount.ts` `validateDiscount`** — the *correct* implementation of Law 10. Its
  problem is that it is not the only one.
- **`lib/workflow.ts`** — the status/job/flag engine, backed by `workflow.test.ts`. Clean.

---

## Findings

### [R3-1] P0 — Four implementations of the discount law, and `money.ts` accepts a negative discount

**Files:** `lib/discount.ts:17-61`, `lib/money.ts:149-155`, `lib/rbac.ts:58-65`,
`supabase/migrations/0002_bookings.sql:596`

Law 10 is implemented **four times**. `v1.1` E-P0-2 reported three; `lib/discount.ts` is the
fourth, and it is the one that gets the law right.

The new defect is a direct behavioural split on the same input:

```ts
validateDiscount(-5, '', null)   // → { valid: false, error: 'Discount percent cannot be negative' }
discountGate(-5, '', null)       // → { ok: true }
```

`discountGate` has no negative branch. `-5 > 25` is false, `-5 <= 10` is true, so it returns
`{ok: true}` and a negative discount — a silent surcharge, or an upstream sign error — passes
the gate. `validateDiscount` rejects it explicitly. `rbac.canApproveDiscount` *also* returns
`true` for it (v1.1 E-P2-4). Two of the three TS engines wave it through.

Note the knock-on for the existing register: `P1-11`'s prescribed fix is to *"feed the
implied total discount through `validateDiscount`/`canApproveDiscount`"* — naming two of the
four as though they agree. They do not, and a third (`discountGate`) is what `money.ts`
callers actually reach.

**Fix:** keep `validateDiscount` as the single implementation, have `discountGate` and
`canApproveDiscount` delegate to it, and add the negative check to whichever survives.

---

### [R3-2] P0 — A credit-limit override waives the security deposit, contradicting the status engine

**Files:** `lib/validation.ts:60-65`, `lib/workflow.ts` (`planTransition`),
`lib/__tests__/workflow.test.ts:189-190, 261`

`validateHandoverReadiness` treats one override as authority over two unrelated gates:

```ts
if (params.depositPendingPaisa > 0 && !params.hasCreditOverride) {
  blockingReasons.push('Security deposit is pending and no credit limit override exists.')
}
```

So with `hasCreditOverride: true`, handover proceeds with the deposit unpaid.

The status engine says the opposite, and has a test asserting it:

```ts
expect(planTransition({ from: 'Packed', to: 'On Rent', flags: ['Deposit Pending'] }).allowed).toBe(false)
```

No override parameter exists in `planTransition` at all — a `Deposit Pending` flag blocks
Handover unconditionally.

Beyond the disagreement, the conflation is itself wrong under Law 5. A **credit limit** is
exposure against revenue the client owes; a **security deposit** is trust money held as a
liability. `PLAN.md §0` keeps them structurally apart ("Deposits are liabilities — never
touch Rental Total or Outstanding"). `rbac.canOverrideCreditLimit` grants authority over the
former and says nothing about the latter, so this reads a credit permission as a deposit
waiver.

Two engines currently answer "may this booking hand over with an unpaid deposit?" with
opposite answers, and the one with a passing test is not the one a caller would naturally
reach from a Handover screen.

**Fix:** remove `hasCreditOverride` from the deposit branch. If waiving a deposit is a real
business capability it needs its own named authority and a `TODO(decision)` in `PLAN.md §4` —
it is not a credit-limit decision.

---

### [R3-3] P1 — `useCanViewMoney()` gives Coordinator *all* money; `moneyScope()` gives them a slice

**Files:** `lib/rbac.ts:45-50`, `lib/fieldGating.ts:53-72`, `lib/moneyVisibility.ts:24-27`

Two engines answer "what money may this role see" at different granularities, and the
coarser one is the one wired into the hook screens call.

- `rbac.MONEY_BLIND` = `{Warehouse, Technician, Driver, Client}`. Coordinator is absent, so
  `canViewMoney('Coordinator')` is **`true`** — and `useCanViewMoney()` returns that binary
  straight to any screen.
- `fieldGating.moneyScope` gives Coordinator `'booking-and-client-balance'`, and
  `canViewMoneyField` then **denies** `'asset-finance'` — per HIS v2.1 §4.1, quoted in the
  file: *"Coordinator = booking-level money + client balance/deposit only (no asset ROI, no
  crew pay, no supplier margin)."*

Any screen gated with `useCanViewMoney()` therefore shows a Coordinator asset ROI, crew pay
and supplier margin that `fieldGating` exists specifically to withhold.

Register `P2-13` records one instance (`CashFlowReport.tsx:78`) as a screen-level P2. It is
not screen-level — it is every consumer of the hook, and the cause is in `rbac.ts`.

**Fix:** either add Coordinator handling to `canViewMoney`, or retire the binary hook in
favour of `canViewMoneyField(gctx, field)` everywhere. The two vocabularies need to collapse
the way the session-role and system-role vocabularies already did on 8 Aug.

---

### [R3-4] P1 — `moneyScope` fails **open** when `surface` is omitted

**File:** `lib/fieldGating.ts:41-62`

`gateContext()` defaults `surface: 'default'`, but `GateContext.surface` is optional and
`moneyScope` only strips money on an exact `=== 'floor'` match. A caller who builds the
context inline —

```ts
moneyScope({ role: 'Owner' })   // → 'full', even on Pack/Handover/Return/Reset/Scanner
```

— gets full money on a floor surface. The default for a missing gate is "show it".

The file's own header sets the opposite standard: §4.3 *"Context gate stacks and the stricter
wins."* A missing surface should resolve to the stricter side, not the permissive one.

**Fix:** make `surface` required in `GateContext`, or default to `'floor'` when absent so an
omission fails closed.

---

### [R3-5] P1 — Every audit-write failure is swallowed

**File:** `lib/audit.ts:46-71`

```ts
} catch (err) {
  console.error('[AuditEngine] Failed to write audit event:', err)
}
```

`logAuditEvent` returns `Promise<void>` and cannot fail. An RLS denial, a network drop, an
enum mismatch or a constraint violation all leave the calling business action completed and
**unaudited**, with the only trace in a browser console nobody is reading.

The file knows this failure mode intimately — the comment at `:63-65` explains that a wrong
`device_type` value meant *"every audit write Postgres ever saw would have been rejected with
an invalid-enum error and swallowed by the catch below."* The enum was fixed; the swallow
that hid it for that entire period was kept.

Second-order: it writes through `idempotentInsert`, which when offline returns optimistic
success and queues (v1.1 E-P2-2). So audit events can also sit unsent in IndexedDB while the
caller believes they landed — and per v1.1 E-P1-2/E-P1-3 some of those never drain.

This compounds `WIRING_AUDIT` W-B1: the live database has no audit-immutability trigger
either, so the audit trail currently has neither a reliable writer nor a DB-level guarantee.

**Fix:** let it throw, or return a result the caller must handle. An audit trail that fails
silently is worse than one that fails loudly, because it looks complete.

---

### [R3-6] P1 — `parseCsv` reports success on a malformed file

**File:** `lib/csv.ts:9-71`

If the input ends while `inQuotes === true` — an unterminated quote, the single most common
CSV corruption — the loop exits, line 64 pushes the partial field, and the function returns
normally. There is no error channel: the signature is `string[][]`, so a truncated or
malformed file is indistinguishable from a clean one.

Everything after the stray quote is absorbed into one field, so the row count and column
alignment are silently wrong. This feeds `lib/clientImport.ts`, i.e. bulk client creation
from an operator-supplied sheet.

Related, lower impact: `"abc"def` (content after a closing quote) is silently concatenated to
`abcdef` rather than rejected.

**Fix:** return `{ rows, error }` or throw on EOF-inside-quotes. The import screen already
has a per-row error surface to render it in.

---

### [R3-7] P2 — Phone numbers beginning `977` are rejected despite being legal

**File:** `lib/phone.ts:54-61`

`phoneLocalDigits` strips a leading country code unconditionally:

```ts
.replace(/^(?:\+977|977)/, '')
```

`PHONE_LOCAL_RE` is `/^(97|98)\d{8}$/`, so `9771234567` is a legal 10-digit local number by
the app's own rule, and `+9779771234567` satisfies the DB CHECK. But the strip fires first,
leaving `1234567`, which fails validation.

The strip is length-blind: it cannot tell a country-code prefix from the first three digits
of a number that happens to start `977`. `phone.test.ts` exists — worth checking whether this
case is covered before treating it as confirmed.

**Fix:** only strip when what remains still satisfies `PHONE_LOCAL_RE`, or when the input
length indicates a country code is present.

---

### [R3-8] P2 — Every toast re-renders every `useToast()` consumer

**File:** `components/ui/Toast.tsx:117-131`

```tsx
<ToastContext.Provider value={{ showSuccessToast }}>
```

A fresh object literal each render. `ToastProvider` holds `toasts` state and re-renders on
every show **and** every 4-second auto-dismiss, so the context identity changes and every
component calling `useToast()` re-renders with it. `ToastProvider` is mounted once globally
in `App.tsx`.

Two smaller issues in the same file:

- `window.setTimeout` at `:123` is never cleared. On unmount it still fires `setToasts`.
- Toast ids come from `Math.random().toString(36).slice(2, 9)` (`:120`) and are used as React
  `key`s. Collisions are unlikely but not impossible, and register `P2-01` already flags
  `Math.random()` id minting elsewhere as a Law 8 concern.

**Fix:** `useMemo` the context value, clear the timer in an effect cleanup, use
`crypto.randomUUID()` (already available via `dataAccess.generateClientUuid`).

---

### [R3-9] P2 — Billing days are computed outside the money engine, in UTC

**File:** `lib/validation.ts:32-35`

```ts
const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
```

`days` is a **pricing input** — `booking_lines.days` multiplies rate × qty × days — but it is
derived here, in the validation engine, with no reference to `lib/money.ts`. Law 1 puts
pricing in the money engine.

Two consequences: a 25-hour rental bills 2 full days with no rule stated anywhere that says
it should; and the arithmetic is raw UTC milliseconds, so the day boundary is UTC rather than
Kathmandu civil — the same defect class as v1.1 E-P1-5, and one `lib/bs.ts` already has the
`kathmanduCivil` helper for.

**Fix:** move day-count derivation into `money.ts` beside `price()`, and take the boundary
from `bs.ts`. Whether a part-day rounds up is a real pricing rule — if it is not written
down, it is a `TODO(decision)`.

---

### [R3-10] P3 — `useNetwork` reads `navigator.onLine` during render and never re-syncs

**File:** `lib/network.ts:4-15`

`useState(navigator.onLine)` evaluates during render, and the effect only attaches listeners
— it never re-reads the current value. A connectivity change between initial state
computation and effect attachment is missed for the lifetime of the component. Reading
`navigator` during render also assumes a browser global at module scope.

**Fix:** re-read `navigator.onLine` inside the effect on mount.

---

## Pattern worth naming

Five of this round's findings (R3-1, R3-2, R3-3, plus v1.1's E-P0-2 and E-P1-5) are the same
shape: **one law, implemented in two or more engines, which disagree.** Discount is
implemented four times. Money visibility twice, at different granularities. Handover-vs-deposit
twice, with opposite answers. Kathmandu civil dates twice, one converted and one not.

`CLAUDE.md`'s first law is *"Pages never implement business logic — the engines own it."* That
has been followed well: I found very little logic leaking into pages this round. The failure
mode that replaced it is duplication *between* engines, which is harder to see because every
copy is in the right architectural layer and each one looks correct in isolation.

Since `WIRING_AUDIT` W-F1 established that no screen calls these engines yet, this is a
genuinely good moment to collapse the duplicates — there are no call sites to migrate.

## Suggested order

1. **R3-2** and **R3-1** — both are Law-level contradictions where the wrong engine wins, and
   both are small edits.
2. **R3-5** — one `throw`, and it stops the audit trail lying about its own completeness.
3. **R3-3 / R3-4** — collapse money visibility onto one engine and make the gate fail closed.
4. **R3-6** — before anyone imports a real client sheet.
5. R3-7, R3-8, R3-9, R3-10 as convenient.
