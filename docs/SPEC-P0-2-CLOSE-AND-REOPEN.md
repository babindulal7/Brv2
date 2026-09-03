# SPEC — P0-2 · Close and reopen

**Ruling basis:** R-07, R-08, R-09, R-16, and the Foundation close gates carried by R-00
**Blocks:** no rental ever completes; no report on closed rentals is possible.
**Verified against live** 4 Sep.

---

## 1. This is smaller than the audit says

The audit records "schema ready, no verb." The database is further along than that.

| Already live | Evidence |
|---|---|
| `Closed` exists in `booking_stage` | enum position 6, after `Returned` |
| The Close gate is written and armed | `validate_booking_gates` has a `Closed` branch |
| It enforces outstanding = 0 | `sum(outstanding_amount) where status <> 'Void'` |
| It enforces deposit resolved | `security_deposits.pending_amount` |
| Reversals are supported | `apply_booking_stage_transition` handles `NEW.is_reversal` |
| Close is a normal next step | `next_booking_stage('Returned') = 'Closed'` |

So **two of the four Foundation close gates are already enforced server-side**. What is missing is the app verb, the other two gates, and one obstacle to reopen.

---

## 2. The obstacle

`apply_booking_stage_transition` opens with:

```sql
if v_closed_at is not null then
  raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.';
end if;
```

and the closing update sets `closed_at` when `to_stage = 'Closed'` and **never clears it**:

```sql
closed_at = case when NEW.to_stage = 'Closed' then NEW.occurred_at else closed_at end
```

Closed is therefore terminal at the database level. R-09 (stage-only reopen) is impossible today — and the reversal machinery that would carry it already exists and is unreachable, because the `closed_at` check runs before it.

**Migration `0083_reopen_clears_closed_at`:**

1. Allow the transition when the incoming row is a reversal out of `Closed`:

```sql
if v_closed_at is not null
   and not (NEW.is_reversal and NEW.from_stage = 'Closed') then
  raise exception 'Gate Check Failure: booking % is Closed; ...';
end if;
```

2. Clear the flag in the same update:

```sql
closed_at = case
  when NEW.to_stage = 'Closed' then NEW.occurred_at
  when NEW.is_reversal and NEW.from_stage = 'Closed' then null
  else closed_at
end
```

The existing reversal check (`to_stage` must precede `from_stage`) already stops a reversal from skipping backwards past `Returned` in one hop.

---

## 3. The missing gates

Foundation rules four close gates. Two are live. Add:

- **No open case** — `cases` for the booking, none in an open state.
- **No pending damage charge** — no `damage_findings` awaiting approval. Depends on SPEC-P1-3; until findings are written, this gate is vacuously true, which is honest but weak. Note it in the UI.

Add both to the `Closed` branch of `validate_booking_gates` in **migration `0084_close_gates_complete`**, with messages naming which gate failed. Do not fold these into `0083`.

---

## 4. `closeRental`

**Rights:** Owner · Admin · Manager · Accounts (R-08).
**Precondition:** stage is `Returned`.

Writes one `booking_stage_transitions` row: `from_stage = 'Returned'`, `to_stage = 'Closed'`, `is_reversal = false`, `occurred_at = now()`, `actor_id`, Law 8 `client_uuid`. The trigger does the rest, including firing the gate.

`occurred_at` must not precede the booking's last transition — the trigger enforces causal order and will reject a stale clock.

Add `Close` to `lib/workflow.ts` JOBS as the fifth verb, entered from `Returned`.

### Auto-suggest (R-07)

The verb is manual; the *prompt* is automatic. On Booking Detail, when stage is `Returned` and all four gates pass, surface "Ready to close" with the Close action beside it. When a gate fails, name the failing gate and the amount — the same honest-refusal pattern the workspaces already use (Law 12).

Put the suggestion on the booking, not in a separate queue. A new queue is a new screen to keep honest.

### Do not auto-fire

The 28 Jul note ("auto-closes when the invoice is marked Paid") is superseded by R-07. Auto-firing would close rentals with an open case or an unapproved damage charge, since those gates sit outside the invoice.

---

## 5. `reopenRental`

**Rights:** Owner · Admin only (R-09).
**Requires a reason.** Free text, minimum 10 characters, into `audit_events`.

Writes one `booking_stage_transitions` row: `from_stage = 'Closed'`, `to_stage = 'Returned'`, `is_reversal = true`.

**The invoice is untouched** (R-09). It stays issued, its figures stay immutable. Any further charge takes Void + Credit Note (R-04). Say this in the confirm dialog — an operator reopening a rental to add a forgotten damage charge needs to know before they start, not after the append raises.

---

## 6. Order of work

1. `0083_reopen_clears_closed_at`
2. `0084_close_gates_complete` — after `damage_findings` exists, or ship with the case gate alone and note the omission
3. `closeRental` + workflow entry
4. Auto-suggest on Booking Detail
5. `reopenRental`

---

## 7. Acceptance

- A Returned booking with a settled invoice and a resolved deposit shows "Ready to close".
- With Rs 1 outstanding it does not, and it names the amount.
- Close writes the transition, sets `stage = 'Closed'` and stamps `closed_at`.
- A second transition on the closed booking is refused.
- Reopen by Owner returns it to `Returned`, clears `closed_at`, and leaves `invoice_no`, `issue_date` and every figure unchanged.
- Reopen by a Manager is refused.
- Close, reopen, close again — each leg lands its own `booking_stage_transitions` row and its own `audit_events` row.
