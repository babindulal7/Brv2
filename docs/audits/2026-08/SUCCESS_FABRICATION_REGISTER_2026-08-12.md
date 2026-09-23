> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement from August 2026. Its findings, blockers, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../../CLAUDE.md)

---

> ⚠ **REOPENED 16 Aug 2026 — two live sites found, on a screen this register never covered.**
>
> This banner said "CLOSED … the site list is spent" earlier on 16 Aug. That was wrong, and the
> page-documentation pass found it within hours. `src/modules/operations/CasesWorkspace.tsx`:
>
> - `:211` — **Export** calls `showSuccessToast('Exporting', 'Generating cases report...')`.
>   Nothing is generated; there is no export path on this screen.
> - `:217` — **Log Incident** calls `showSuccessToast('New Case', 'Opening case logging
>   workspace')`. Nothing opens; case creation is not built.
>
> `src/data/cases.ts:983` already holds the honest sentence for exactly this
> (`NEW_CASE_UNAVAILABLE_REASON`) and the page does not use it. `src/actions/core.ts:9-18` names
> the failure in the words this register was opened with: *"A UI that reports success for work it
> did not do is worse than one that is visibly unbuilt."*
>
> **The lesson is about the register, not the two buttons.** The original sweep enumerated sites
> and was declared closed when that list was cleared — but the list was never the population. A
> screen nobody swept can hold the defect indefinitely, and "the site list is spent" says nothing
> about screens the sweep did not reach. Evidence: `docs/pages/26_cases.md` §7.
>
> The three sites below ARE fixed and re-verified: `RefundPaymentModal` caps at
> `currentPaidPaisa`, `CreateInvoiceModal` holds Paisa rather than a formatted string, and
> `ImportCenter` no longer reports imports it did not perform.

# Success-Fabrication Register — 12 Aug 2026

**The defect class:** a screen tells the operator a write succeeded when nothing was
written. It is silent by construction — there is no error anywhere to find later, and
the operator's picture of what the system knows stops matching reality.

This register was produced by adversarial review during the 11–12 Aug audit-fix wave
(three independent lenses, then a re-check of the fixes themselves). The external audit
that started that wave fixed **6** sites. Review found the same class at **~40** sites.
This file lists the ones still open.

**How to read it.** Every entry was verified against the file on disk at the time of
writing, with a concrete operator-facing failure. Line numbers drift — this repo has
concurrent sessions writing to it — so treat them as a starting point, not a citation.

**The structural fix already landed:** `src/actions/core.ts` now refuses any action
that has not set `implemented: true`, before validate/execute/events. So none of the
writes below actually happen today. The defect is not that they fail — it is that the
screen says they succeeded. Marking an action `implemented` without first fixing its
callers turns each entry here from a lie into a wrong write.

---

## A. Fixed in this wave (for reference — do not re-open)

| Site | Was |
|---|---|
| `actions/core.ts` | Dispatcher waved every stub through, defaulted identity to `{ userId: 'system', role: 'admin' }`, never checked permissions |
| `BookingDetail.tsx` | Two payment buttons, two divergent implementations, one sending a hardcoded `amountPaisa: 500000` (Rs 5,000) |
| `RecordPaymentModal.tsx` | Collected an amount and discarded it (`recordPayment({ id: invoiceId })`); identity hardcoded to `USR-001`/`Manager`; invented Rs 50,000 default |
| `Finance.tsx` | `onSuccess` dispatched `recordPayment` a **second** time for the same payment, with no context |
| `UnifiedInbox.tsx` | Quick action dispatched a hardcoded Rs 1,000 payment, toast fired synchronously |
| `MovementList.tsx` | Four sites with `USR-001`/`Manager` fallbacks and a fabricated `equipmentIds: ['EQP-101']` |
| `NewRental.tsx` | "Draft saved" toast on `.finally()` (fired on rejection); `USR-001`/`Manager` ×2; unconditional `navigate('/rentals')` after a fire-and-forget confirm |
| `bookingQuery.ts` | A Law 17 rename leaked a can-never-be-true branch into the pricing path |

---

## B. Open — money screens (highest severity)

### B1. `RefundPaymentModal.tsx` — invented refund amount, no cap, fabricated identity
Three defects in one modal, newly wired into Finance in the same commit:
- `useState<number>(50000)` — an invented Rs 50,000 refund pre-filled on every open.
- `currentPaidPaisa` is declared in props but never destructured, so it is dead — **nothing
  caps the refund at the amount actually received.** Only `refundAmount <= 0` is checked.
- `{ userId: 'USR-001', role: 'Manager' }` — the exact literal removed from
  `RecordPaymentModal` this wave.
- `refundPayment({ id: invoiceId })` carries no amount, method or reason — the same
  discard-the-figure defect that was just fixed in the record path.

**Failure:** an invoice with Rs 12,000 paid opens pre-filled at Rs 50,000. An operator
clicking straight through issues a reversal 4× the receipt, and `Finance.tsx` clamps the
display with `Math.max(0, …)` so the screen shows a clean zero balance and hides it.

### B2. `CreateInvoiceModal.tsx` — client-side invoice numbers, and VAT on the page
- Mints `INV-2026-${Math.floor(1000 + Math.random() * 9000)}` client-side. Two invoices
  can collide. The operator sends that number to a client for payment reference; nothing
  in the system will ever match it.
- Dispatches **no action at all** — no `implemented` gate, no permission check, no identity.
- Re-implements VAT on the page: `Math.round(taxableSubtotal * 0.13)`. Against
  CLAUDE.md's "pages never implement business logic" and `lib/money.ts:94` ("from
  Settings ▸ Finance, never hardcoded").
- Writes `amount` as a **string** (`Rs ${grandTotal}`), which `Finance.tsx` later parses
  with `parseInt(inv.amount.replace(/[^0-9]/g, ''))`. A fractional total like
  `Rs 1,39,506.5` parses as **Rs 13,95,065** — a 10× money error.

### B3. `VoidInvoiceModal.tsx` — void that never voids, permission never consulted
Void is performed entirely by an in-memory event emit plus local state. `invoice.void` —
the capability `core.ts` and `rbac.canVoidInvoice` exist to enforce — is never consulted.
The invoice stays live in the database and still counts toward Outstanding everywhere else.

### B4. `ExtendRentalModal.tsx` — invented daily rate, fabricated identity
`useState<number>(15000)` invents a daily rate, so `extraAmount` defaults to Rs 30,000
and is emitted as `extraAmountPaisa`, attributed to `USR-001`/`Manager`. Mounted
permanently at `BookingDetail.tsx` (the codebase's own comments say these modals must be
conditionally mounted — a permanent mount posts against the first booking it ever saw).

### B5. Duplicate domain events from six modals
`RecordPaymentModal` documents removing its screen-level `DomainEvents.emit` because the
dispatcher already emits after `execute`. Six siblings still do it: `RefundPaymentModal`,
`ExtendRentalModal`, `CreateInvoiceModal`, `VoidInvoiceModal`, `AssignCrewModal`,
`CreateSubRentalModal`. Once those actions are implemented, one click produces two audit
entries with incompatible payloads — one keyed `id`, one keyed `invoiceId`, only one
carrying the amount.

---

## C. Open — permission gating disagrees with itself

The same "Receive Payment" button now has **three different gates**:

| Screen | Gate | Effect |
|---|---|---|
| `UnifiedInbox.tsx` | `canRecordPayment` (Owner / Coordinator / Accounts) | correct |
| `BookingDetail.tsx` | `canBookingMoney` — money *visibility*, which includes Admin and Manager | button renders for roles that cannot use it |
| `Finance.tsx` | nothing | button renders for everyone |

**Failure:** an Admin opens a booking, types Rs 45,000, clicks Record Payment, and gets an
inline `ActionPermissionError`. This is an improvement on the old silent fake success —
but the button should not have rendered. `rbac.canRecordPayment` already rules who may
do this; the UI should gate on the same function everywhere.

---

## D. Open — writes that never happen, reported as done

Grouped by area. Each is: local state and/or a success toast committed **before or
regardless of** a dispatch that is fire-and-forget with no `.catch()`.

**Clients**
- `AddClient.tsx` — `createClient` fired without `await`/ctx/`.catch()`; toast on an
  unconditional `setTimeout(…, 700)` quoting `NEXT_CLIENT_CODE`, a client-side guess
  (`CL-2026-${CLIENTS_DATA.length + 1}`) presented as the assigned code.
- `ImportCenter.tsx` — **no action is called at all.** A bare `setTimeout` reports
  "312 clients imported · 19 skipped · 9 flagged" from real parsed counts, then navigates.
  Credible precisely because the numbers are real; the operator archives the source CSV.
- `DuplicateCenter.tsx` — merge rewrites local state first, dispatches per-record after,
  toasts synchronously. No rollback. On reload all duplicates return.
- `ClientDetail.tsx` — block/unblock sets local state, then fires `blockClient` with no
  ctx. A client barred for non-payment stays bookable; another operator hands over gear.
- `Clients.tsx` — `bulkBlock`'s own comment says "deliberately not faked as saved", and
  the next line fires a success toast.
- `GenerateReferralCode.tsx` — no action called. Code read out to the client over the
  phone exists nowhere.

**Rentals / operations**
- `PackingWorkspace.tsx` — `packRental` with `USR-001`/`Manager`, then unconditional
  `navigate`. Same at the Save Draft site.
- `ResetWorkspace.tsx` — `completeReset` with `USR-001`/`Manager`, then an optimistic
  footer flip that is never rolled back.
- `HandoverWorkspace.tsx` — units flip to 'Picked Up' with a **hardcoded `'02:15 PM'`**
  before dispatch; `handOverMany` double-dispatches (per-unit *and* batch). Units read as
  in-stock and can be double-booked the same day.
- `ReturnWorkspace.tsx` — Complete Return calls **no action**; hardcoded
  `closedAt: '19 Jul 2026, 10:20 AM'`. Gear reads as on rent, deposit never released.
- `EvidenceWorkspace.tsx` — Unmatch hardcodes `reason: 'Unmatched by user'` for what the
  file's own comment calls a soft delete requiring a reason.
- `CasesQueue.tsx` — `onConfirm()` (the UI commit) runs *before* `resolveCase` dispatches.
- `SubRental.tsx` — `createSubRental({ itemDescription: 'Sub-Rental Item', costPaisa: 500000 })`
  — Rs 5,000 and a placeholder description; toast says a wizard is opening. None opens.
- `AssignCrewModal.tsx` / `CreateSubRentalModal.tsx` — call no action at all, only an
  in-memory `DomainEvents.emit` whose sole subscriber is a console logger.

**Inventory**
- `PurchaseRequests.tsx` — a Rs 1.2M approval turns green and never persists.
- `Warehouses.tsx` — transfer status and timestamps written locally before a
  fire-and-forget `createStockTransfer`. Two warehouses disagree about where gear is.
- `StockCheck.tsx` — Finish Audit marks the session Completed; every logged discrepancy
  is lost.
- `AddBundle.tsx` — both buttons toast `BUNDLE_ID`, the hardcoded literal `'BND-00024'`,
  reported for every bundle anyone ever creates.

**Notifications / documents**
- `UnifiedInbox.tsx:handleSend` — appends the message with hardcoded `status: 'Delivered'`
  and toasts "Message delivered via WhatsApp". **No send path exists.**
- `UnifiedInbox.tsx` — `user?.name ?? 'Staff Officer'` / `user?.role ?? 'Admin'` stamps a
  fabricated author *and an elevated role* on outbound client messages.
- `UnifiedInbox.tsx` — client-facing text fabricates figures and ids:
  `'{{outstanding_amount}}' → '45,000'` and `linkedBookingId ?? 'BK-2026-0715'`, sent to
  clients who may have neither.
- `Documents.tsx` — Create Document dispatches hardcoded placeholder content with **no
  feedback at all**; repeated clicks would create N identical documents.

---

## E. Open — smaller, but worth closing with the above

- `RecordPaymentModal.tsx` — the Notes textarea is collected and silently discarded;
  `RecordPaymentInput` has no `notes` field (`TODO(decision)` marked in place).
- `MovementList.tsx` / `BookingDetail.tsx` — both failure paths are silent to the operator
  (console only). Not a false success, but indistinguishable from a missed click. Needs
  the inline-error treatment `NewRental.tsx` now has.
- `phone.ts:21` and `AddClient.phone.test.tsx:5,12` — all three still assert that
  `AddClient.tsx` is `@ts-nocheck`. It is not; the directive was removed and the file
  typechecks. The test's own comment says "delete when AddClient.tsx loses its
  @ts-nocheck" — it has.

---

## Recommended order

1. **C (permission gating)** — smallest, and it stops a button rendering for roles the
   rules already deny.
2. **B1–B2** — the two live money bugs: an uncapped refund default and a 10× parse.
3. **B5** — delete six screen-level `DomainEvents.emit` calls; mechanical, prevents
   double audit entries the moment any action is implemented.
4. **D** — one screen at a time, following the shape `NewRental.tsx` now demonstrates:
   real session or refuse · dispatch · success only in `.then()` · failure inline.
5. **A vertical slice** — pick one action, wire it through `lib/dataAccess`, set
   `implemented: true`, and drive it. That proves the seam; the other 35 actions follow it
   rather than each inventing a path.

**Do not** mark an action `implemented` before its callers are fixed. Today these sites
lie. Afterwards they would write wrong data.
