# SPEC — P0-1 · Invoicing and payments

**Ruling basis:** R-01 … R-06, R-14, R-15, R-17
**Blocks:** every rupee in the business. Payments, receipts, VAT, deposits, damage charges, Close.
**Verified against live** (`sxguwvgoserhdolewibb`) 4 Sep. App-side line references are from the 3 Sep audit at `6c978a5` and should be re-confirmed before editing.

---

## 1. What already exists

Do not rebuild these. They are live and armed.

| Object | State |
|---|---|
| `invoices`, `invoice_lines`, `payments`, `payment_reversals` | tables exist, RLS on |
| `invoice_status` enum | Draft · Sent · Partially Paid · Paid · Overdue · Void |
| `invoices.vat_rate numeric(5,4)` | column exists — and is ignored by the trigger |
| `recalculate_invoice_totals()` | fires on `invoice_lines` change; recomputes all summary fields |
| `sync_payment_to_invoice()` | fires on payment; recomputes paid/outstanding/status |
| `reject_invoice_edit_after_issue()` | immutability, with an explicit Draft exemption |
| `trg_payments_reject_update/delete` | payments immutable |
| `recordPayment` action | implemented; requires an `invoiceId` |
| `number_sequences.invoice` | prefix `INV-`, pad 1, no year, current value 120 |

**Missing:** any code path that creates an invoice. `Finance.tsx:539` states it outright. There is no `actions/finance/*Invoice*`.

---

## 2. The three defects that must be fixed first

These are not optional. Two of them make the ruled behaviour impossible, not merely awkward.

### 2.1 Draft is not sticky — R-14

`sync_payment_to_invoice` sets `status = 'Partially Paid'` on the first payment. The invoice leaves Draft mid-rental. `reject_invoice_edit_after_issue` then guards the figures, so appending a damage line at return raises:

> Law 4/finance: invoice % is issued (status %) — its figures are immutable.

**R-02 (Draft until return) and R-03 (append damage) cannot both hold until this is fixed.**

**Migration `0080_draft_is_sticky`** — in `sync_payment_to_invoice`, change the status expression to leave Draft alone:

```sql
status = case
  when status = 'Draft' then status
  when v_outstanding = 0 then 'Paid'::invoice_status
  when v_total_paid > 0 then 'Partially Paid'::invoice_status
  else status
end
```

`paid_amount` and `outstanding_amount` continue to update on a Draft. The Draft therefore carries a true running balance all the way through the rental — which is what the handover warning (R-06) reads.

### 2.2 The money trigger disagrees with the money engine — P1-4

Live `recalculate_invoice_totals` rounds to 2 dp, hardcodes `0.13`, ignores the `vat_rate` column, and does not round `taxable` or `total` at all. `lib/money.ts` rounds to whole rupee at every step. Divergence measured by the audit: Rs 0.98 per invoice.

Foundation already rules the app's arithmetic canonical, so **the trigger changes, not the engine**. No further decision is needed.

**Migration `0098_invoice_totals_match_engine`:**

```sql
v_rate := coalesce(
  (select vat_rate from invoices where id = v_target_invoice_id),
  (select (value)::numeric from system_settings where key = 'vat_rate'),
  0.13
);

v_discount := round(v_subtotal * (v_discount_pct / 100.0), 0);
v_taxable  := round(v_subtotal - v_discount, 0);
v_vat      := round(v_taxable * v_rate, 0);
v_total    := round(v_taxable + v_vat, 0);
v_outstanding := v_total - v_paid;
```

This absorbs the drafted-but-unapplied `0079`. Pin it with the §2.8 reference case (Rs 1,39,506 / 1,24,506) as a pgTAP test in the same migration — PLAN §4.42 asks for exactly this test and it has never existed.

**Note on storage.** Money columns are `numeric(14,2)`, not integer paisa as the Foundation specifies. Converting 124 tables now is not proportionate. Rounding every step to 0 dp makes the scale-2 columns hold whole rupees in practice, which closes the observable gap. Record the divergence rather than pretending it isn't there.

### 2.3 The handover gate cannot tell "paid" from "never billed"

`validate_booking_gates` sums outstanding across invoices and wraps it in `coalesce(...,0)`. With no invoice rows the sum is NULL, so the gate reads zero and passes. The same holds for `security_deposits`. **Today, gear leaves because nothing was ever recorded.**

Per R-06 the gate warns instead of blocking, but the warning has to exist somewhere real.

**Migration `0082_handover_gate_advisory`** — remove the two `raise exception` calls from the `On Rent` branch of `validate_booking_gates`. Leave the `Closed` branch exactly as it is (R-07).

Enforcement moves into `handoverRental`, which must:

1. Read `security_deposits.pending_amount` and `sum(invoices.outstanding_amount) where status <> 'Void'` for the booking.
2. If either is above zero, refuse to proceed without `override_reason` (minimum 10 characters, matching the `blockClient` precedent).
3. Write an `audit_events` row carrying both amounts as they stood, the reason, and the actor.

Put this in the **action, not the screen**. A UI-only check is bypassed by offline replay, the bridge, and any script.

Distinguish the two in the UI copy: an unpaid invoice is a receivable; a missing deposit is uncovered risk. The deposit warning is the prominent one.

---

## 3. New actions

Follow the existing `actions/` pattern: dispatcher entry, `implemented: true`, Law 8 `client_uuid` on every write, inline refusal on failure (Law 12).

### 3.1 `createInvoice`

**Entry points:** Finance ▸ Create Invoice modal; Booking Detail ▸ Create Invoice (R-01).
**Rights:** Owner · Admin · Manager · Accounts.
**Precondition:** the booking has no non-Void invoice. One invoice per rental.

Writes one `invoices` row:

- `invoice_no` — **null** (R-15; minted at issue)
- `status` — `Draft`
- `booking_id`, `client_id`, `branch_id` from the booking
- `vat_rate` — from Settings at creation time, pinned to the invoice
- `issue_date` — null until issued
- `due_date` — per payment terms
- `discount_percent` — from the booking; `discount_amount` is derived, never written (R-17)

Then one `invoice_lines` row per `booking_lines` row. `recalculate_invoice_totals` fires and fills the summary fields.

**Lines are a snapshot, not a join.** The rate card is pinned per booking; the invoice must not silently re-price when a product's rate changes.

### 3.2 `addInvoiceLine` — damage and late fees

Called from the return session for every line marked Damaged or Lost, and by the late-fee engine (R-13: ≤30 min free, under 2 h half day, 2 h+ full day).

Damage lines require the approval chain that is already ruled and already has a trigger armed on an empty table: Manager below Rs 25,000, Owner at and above, evidence mandatory before the charge is raised. A damage charge sits **Pending Approval** and is excluded from deductions until approved. See SPEC-P1-3 for `damage_findings`, which this depends on.

Refuse if `status <> 'Draft'` with the reason naming Void + Credit Note (R-04).

### 3.3 `issueInvoice`

**Rights:** Owner · Admin · Manager · Accounts (R-05).
**When:** at return, once the final figure is known (R-02).

In one transaction: mint `invoice_no` via `next_document_number('invoice')`, set `issue_date`, set `status` to `Sent` — or straight to `Paid` / `Partially Paid` if `paid_amount` already covers it.

After this the figures are immutable. `reject_invoice_edit_after_issue` enforces it.

### 3.4 `voidInvoice`

The live trigger already defines the lawful shape: `voided_at`, `voided_by`, `void_reason` and `credit_note_no` move together, and **the figures must travel unchanged**. Attempting to zero the totals while voiding raises. Build to that contract rather than around it.

### 3.5 Wiring

- `CreateInvoiceModal` — connect to `createInvoice`; remove the "writes NOTHING" comment at `Finance.tsx:539`.
- `RecordPaymentModal` — reachable once a Draft exists. No change needed to `recordPayment`.
- **Booking Detail prompt.** Because invoicing is manual (R-01) and payment needs an invoice, an un-invoiced booking should show a persistent prompt from Confirm onward. Otherwise the first anyone notices is a handover warning.

---

## 4. Order of work

1. `0080_draft_is_sticky`
2. `0098_invoice_totals_match_engine` + the reference-case pgTAP test
3. `0082_handover_gate_advisory`
4. `createInvoice` + modal wiring
5. `issueInvoice`
6. Handover override capture in `handoverRental`
7. `voidInvoice`
8. `addInvoiceLine` — after SPEC-P1-3 lands `damage_findings`

Steps 1–3 are migrations against a database with **no backup**. Do PHASE-0 item 0 first.

---

## 5. Acceptance

- Create a Draft on a Confirmed booking; it has no `invoice_no` and a correct total.
- Record a 50% advance; the invoice **stays Draft**; `outstanding_amount` halves.
- Hand over; the warning fires, names both amounts, refuses without a reason, and writes `audit_events`.
- Return with one line Damaged; the damage line appends to the Draft **without raising**.
- Issue; `invoice_no` is minted as `INV-121`; a further line edit now raises and names the credit-note path.
- Pay the balance; status reaches Paid; the Close gate opens.
- The reference case totals match `lib/money.ts` **to the rupee**, asserted through the trigger.
