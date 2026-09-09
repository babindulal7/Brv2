# PHASE 0 — sequenced plan

**Goal:** the system can bill, collect, close a rental, and take the real corpus.
**Not the goal:** launch. Phase 0 clears the blockers; Phase 1 finishes the engine.

Everything below runs against a live database with **366 clients, 246 bookings and no backup**. That fact sets the order.

---

## Step 0 — Before any migration · half a day

**Nothing else starts until this is done.**

1. `pg_dump` the live project, now.
2. Run `check:dump` against the result.
3. Restore it once into the local stack. A dump nobody has restored is a hope, not a backup.
4. Schedule a weekly dump off this machine.
5. Rotate the Booqable token in Booqable. Keep it only as the `booqable-proxy` function secret. Then delete or re-scrub the six archives and the two plaintext working-tree copies. Every document since 1 Sep says "rotate first" and none records a rotation.

**Why this outranks the P0s.** The audit credits "rebuild proven 79/0" as a strength while `check-rebuild.mjs` itself says the migration set does not reproduce production — and a `bakery_archive` schema exists live that no migration creates. The recovery plan reproduces a *different database*. Steps 1–3 below apply eight migrations to money and lifecycle triggers. Doing that without a restorable dump is the only genuinely irreversible risk in this plan.

---

## Step 1 — Make the ruled behaviour possible · 1 day

Three migrations that change existing triggers. None adds a feature; each removes a contradiction.

| | Migration | Fixes |
|---|---|---|
| 1.1 | `0080_draft_is_sticky` | R-02 and R-03 are mutually impossible without it |
| 1.2 | `0098_invoice_totals_match_engine` (written as `0081`, renumbered 8 Sep per R-26 step 1) | P1-4; absorbs the drafted `0079` |
| 1.3 | `0083_reopen_clears_closed_at` | R-09 is impossible without it |

Ship 1.2 with the §2.8 reference case as a pgTAP test. It is the first test in the project's history to reach a database, and PLAN §4.42 has been asking for exactly it.

---

## Step 2 — Numbering and the corpus · 1 day

| | Work | Note |
|---|---|---|
| 2.1 | Confirm the seed count is 46 | stop if it is not |
| 2.2 | `0085_booking_numbers_bare` | mapping table, single-pass renumber, constraint, index, sequence re-point |
| 2.3 | `formatBookingNo` helper + search accepting all three forms | one helper, not scattered |
| 2.4 | Quarantine `scripts/full_sync.sql` | P1-7 — it corrupts 100+ bookings if run |
| 2.5 | Back-fill `external_refs` orders for the 200 imported bookings | the real import blocker |
| 2.6 | Revoke `authenticated` DELETE on `external_refs` | P2-5 |

2.2 also fixes the sequence sitting at 917 behind data that reaches 945 — today the next OS-created booking fails outright.

---

## Step 3 — Invoicing · 3 to 4 days

| | Work |
|---|---|
| 3.1 | `0082_handover_gate_advisory` — warn instead of block, `Closed` branch untouched |
| 3.2 | `createInvoice` + wire `CreateInvoiceModal` |
| 3.3 | Booking Detail: create-invoice entry point and the un-invoiced prompt |
| 3.4 | `issueInvoice` — mints `invoice_no` at issue |
| 3.5 | Override capture in `handoverRental` → `audit_events` |
| 3.6 | `voidInvoice` — build to the trigger's Void + Credit Note contract |

At the end of Step 3, `recordPayment` becomes reachable for the first time. It needed no changes — only an invoice to point at.

---

## Step 4 — Close · 1 to 2 days

| | Work |
|---|---|
| 4.1 | `closeRental` + fifth verb in `lib/workflow.ts` |
| 4.2 | Auto-suggest on Booking Detail when the gates pass; name the failing gate when they do not |
| 4.3 | `reopenRental`, Owner and Admin only, reason required |
| 4.4 | `0084_close_gates_complete` — case gate now, damage gate when `damage_findings` exists |

---

## Step 5 — Prove it · 1 day

Drive the §44 journey **against `dev:local`, not the mock**. The 3 Sep run proved the UI and action layer; it could not touch a gate, an RLS policy or a trigger, because the mock emulates one trigger out of 43.

Twelve steps, Owner and Warehouse identities: create client → quote → confirm → pack → hand over with a warning and an override → record an advance → return with damage → append the damage line → issue → pay → close → reopen → close again.

Any step that behaves differently from the mock run is a finding. Expect several.

---

## Sequence, and why

```
Step 0  backup + token          ── nothing is safe until this lands
   │
Step 1  three trigger fixes     ── makes the rulings possible
   │
   ├── Step 2  numbering        ── independent; can run in parallel
   │
Step 3  invoicing               ── needs 1.1 and 1.2
   │
Step 4  close                   ── needs Step 3 (gates read invoices) and 1.3
   │
Step 5  prove on a real database
```

Step 2 shares no code with Steps 3 and 4 and can run alongside them if two people are working. Everything else is a hard chain.

**Roughly 8 to 10 working days** to the end of Step 5, one person, assuming no surprises in Step 5 — which is not a safe assumption, since nothing in this system has ever been exercised against a real database.

---

## What Phase 0 deliberately leaves undone

Named so they are not mistaken for oversights:

- **P1-2 evidence and signatures.** Blocked by DEL-22 — no storage bucket exists in any migration and no `storage.from()` call exists in `src`. That is a P2 gating a P1 and should be re-ranked. Evidence v1.1 already specifies derivatives, content-hash de-duplication and retention, so it is spec-following, not design.
- **P1-3 `damage_findings`.** Phase 1. Until it lands, the fourth close gate is vacuously true — honest, but weak.
- **RES-01 / RES-02 / RES-06.** The refutation downgraded these on the premise that floor-verb offline policy is unruled. Foundation v2.0 already rules floor work offline **yes**, money and approvals **never**. By the addendum's own words they re-raise to **P1**. Silent loss of every unit after the first on a multi-unit return is precisely the failure a warehouse tablet exists to prevent.
- **FORMS-09.** The VAT rate lives in `localStorage`, so two devices can price the same booking differently. Filed P3; it is a money-correctness defect against a Foundation lock. `0098` reads `system_settings` — which holds zero rows, so it will fall through to the default until the store is backed properly.
- **P1-1 `NOW_AD`.** Real, unbounded on a long-lived tab, worth a hook. But the "every return invisible" figure is an artefact of the seed stamping every `return_at` at 06:00 NPT. Do not let a fixture outrank things that are broken unconditionally.
- **P1-6, P1-10, CI, hosting.** Phases 3 and 4, unchanged.
