# §44 Critical journey — evidence log (mock mode, 3 Sep 2026)

Mode: `dev:mock` (in-memory + localStorage overlay `babin.mock.overlay.v1` = the "database" for this run).
Mock emulates ONLY the 0021 stage trigger; recalc_invoice_totals / gates / RLS do NOT fire in mock.
Live Postgres was NOT written (forbidden without approval). Live reality separately measured: 124 tables,
all RLS on, 43 triggers enabled, 3 exclusion constraints incl. inventory_reservations_no_double_booking;
audit_events 5,424 rows; ALL transactional tables (invoices, payments, reservations, packing/handover/
return lines, deposits, damage, cases, stage_transitions) = 0 rows.

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Create client "Test Production" | PASS | count 40→41; search → 1 row; overlay insert clients C-1 (phone normalised +9779801234567) |
| 2 | New rental for client | PASS | client preselected; dates 3→4 Sept; Blocking notices: none |
| 3 | Add equipment (BMPCC 6K Pro + Canon CN-E 24mm) | PASS | inline picker; both lines on form |
| 4 | Calculate price | PASS | Subtotal 3,600 · Discount 0 · Taxable 3,600 · VAT(13%) 468 · TOTAL 4,068 — whole-rupee, exact |
| 5 | Apply discount | NOT EXERCISED | chips 0–25% present; left at 0 (Law 10: no gate) |
| 6 | Reserve equipment + Confirm | PASS | overlay: bookings B-1 stage Booked; booking_lines ×2; inventory_reservations ×2; stage_transitions Quote→Booked; audit_events ×1 |
| 6b | Booking Detail | PASS | /rentals/B-1 h1 B-1, "Booked — current stage", both lines, Outstanding "—" (no invoice: honest) |
| 7 | Prepare packing list | PASS | /rentals/B-1/packing: Bundle/Item tree, checklist with per-row `Pack <name>` checkboxes, Bulk Scan / Scan Barcode / Scan QR, Print Packing List |
| 7a | Empty-session guard | PASS (good) | Complete Packing refused with "Nothing has been ticked or scanned yet — a session claiming work on nothing is refused" |
| 7b | Mark both packed | PASS | 2 units · 2 packed · 100%; scan log "✓ … packed" ×2 |
| 7c | Evidence gate (§4.31 ruled mandatory) | ⚠ P1 — ENFORCED IN NAME ONLY | "Take Photo" = `setPhotoCount(n=>n+1)` (PackingWorkspace.tsx:1241): local counter, no capture, no `evidence_files` write (header :50-53 admits it; panel says "count is local to this session"). One click satisfied the gate with no photo. Status: PARTIAL/DISCONNECTED. |
| 8 | Complete Packing → Packed | PASS | stage Packed; transitions Quote→Booked, Booked→Packed; overlay +packing_lines ×2, operation_sessions ×1, session_line_movements ×2; audit_events 3; back to /rentals/B-1 "Packed — current stage" |
| 9 | Handover workspace | PASS (loads) | /rentals/B-1/handover: per-line "Mark … picked up" ticks (2/2 ticked → "Picked Up 2"), Bulk/Barcode scan, filters All/Ready/Picked Up/Missing, Undo per line |
| 9b | Handover gate anatomy (HandoverWorkspace.tsx:500-530) | NOTE | 6 gates: (1) Receiver Verified = two checkboxes (Govt ID, Booking Authorization) — attestation, "no receiver identity is stored"; (2) Items Scanned; (3) Payment Verified = `setPaymentVerified(true)` — LOCAL FLAG, no payment checked; (4) Deposit Received = `setDepositReceived(true)` — LOCAL FLAG; (5) Signatures = name+timestamp, not persisted; (6) Evidence = local tally. Manager Override honestly Unavailable (no ruling on who may override). Real money enforcement is only the DB gate 0010 (pending deposit / invoice outstanding), which mock does not fire. |
| 9a | Handover gates (Blockers) | GATED | Deposit Received ("Deposit required · Mark Cleared →"), Signatures Complete ("Receiver and warehouse signatures not yet captured", Capture ×3), Evidence Captured (Take Photo local tally), Manager Override = honest Unavailable ("no rule defines who may override a session gate"). Complete Handover disabled until all pass. |
| 9c/10 | Complete Handover → On Rent | PASS | after ticking Govt ID + Booking Authorization, Capture ×2 (receiver "Test Production", warehouse "Babin Dulal" — "not stored"), Mark Cleared ×2 (payment/deposit local flags), photo tally: Complete Handover enabled → stage **On Rent**; transitions Quote→Booked→Packed→On Rent; overlay +handover_lines ×2, operation_sessions 2, session_line_movements 4, audit_events 5 |
| 12 | Return & Inspection workspace | PASS (loads) | /rentals/B-1/return: per-line Mark Returned / Not Returned, "Condition of <item>" radiogroup per received line, Returning person's name, Capture ×3, Print Return Report; 6 gates incl. "Damaged or Lost items carry a description and a photo", "Not Returned items carry a reason ≥10 chars", signatures; empty session refused; partial return allowed ("booking stays On Rent for a later session") |
| 14 | Record damage → persisted? | ⚠ P1 — NO WRITE PATH | grep: no `damage_findings` / `late_fee_findings` / `return_accessory_checks` write in floorVerb.ts, returnRental.ts or ReturnWorkspace.tsx. Damage is captured in UI state and (at most) a return_lines condition; the `damage_findings` table (live: 0 rows, trigger `trg_damage_approver_is_actor` armed) is never written → no damage charge can ever reach an invoice. |
| 12b/13 | Complete Return → Returned + inspection persisted | PASS | Mark Returned ×2, conditions Good / Damaged, damage description typed, "Count a Photo" (local tally), returning person "Test Contact", Capture ×2 → Complete Return → stage **Returned**; transitions …On Rent→Returned; overlay +return_lines ×2 {state Returned, inspection_state Inspected, condition Good/Damaged}, operation_sessions 3, session_line_movements 6, audit_events 7 |
| 13b | Damage description persisted? | P2 — WRONG PLACE (corrected from P1) | Typed "Scratched front element, needs service…". `return_lines.inspector_note` is EMPTY on both lines — but the text IS persisted in `operation_sessions.notes` as a prose block ("Scratched front element…\nReturning person signature: Test Contact at …\nWarehouse staff signature: Babin Dulal at …\nCanon CN-E…"). Same for signatures: never in the `signatures` table, but recorded as text lines in the session note. Consequence: not queryable per line, cannot feed `damage_findings`/charges, UI copy "not stored" is itself inaccurate (it is stored, as prose). |
| 18a | Reset workspace (post-Returned job) | GATED / RULED NO-OP ON STAGE | /rentals/B-1/reset: Blockers "Every item Ready or recorded as an exception — 2 items still in the queue", "At least one serialised unit Ready to record — Nothing has reached Ready yet"; per-unit Cleaning/Ready + checklist. Panel states: "Completing writes reset_completed_at on 0 units and, per §1.5, changes no booking status." Screenshot: queue Waiting 2 / Cleaning 0 / QC 0 / Ready 0, per-unit checklist 0/8 (Clean exterior body, Check accessories, Put in case and close, Reset configuration) — my "Ready" click hit the FILTER chip (same trap as Packing's "Packed" chip: filter chips and state verbs share labels — P3 UX). Not exercised to completion; since §1.5 rules Reset changes no booking status, completing it would not alter the lifecycle verdict. |
| 18 | Close rental | ⛔ P1 — MISSING VERB | No Close verb exists anywhere (workflow.ts JOBS has four verbs; Reset.sets = null; closeGates called only from workflow.ts:364 + seed.ts). Booking Detail at Returned shows no Close action. **Returned is terminal in practice; the canonical six stages cannot complete.** Live DB: bookings.stage='Closed' reachable only by seed. |
| 11/15/16/17 | Partial payment · Final amount · Final payment · Invoice | ⛔ P0 — MISSING | **No invoice can be created anywhere.** Finance.tsx:539 "Create Invoice and Void Invoice write NOTHING: neither CreateInvoiceModal … dispatches an action". No action in src/actions creates invoices. recordPayment refuses without an invoice. Live DB: 0 invoices, 0 payments. → The business cannot bill or take money. |

BUG-013 measured precisely (3 Sep): **16 of 40 action files set `implemented: true`** (createClient, blockClient,
createRental, confirmRental, packRental, handoverRental, returnRental, completeReset, releaseBookingLineUnit,
recordPayment, approveDailyClosing, createEquipment, createStockTransfer, createBundle, approvePurchaseRequest,
addBookingNote). The other 24 are refused by core.ts's dispatcher guard. The lifecycle path IS implemented; invoice
creation has NO action at all. Finance.tsx:539's "nothing outside a test sets implemented" is stale for the 16.
Signatures: HandoverWorkspace `captureSignature` = local {name, role, at}; NO `signatures` table write in
floorVerb/handoverRental → gate satisfied by attestation, never persisted (P1, same class as photo tally).

Corrections to my own brief discovered en route:
- The "10 stub actions" list is STALE. `[DB TX]` matches were doc comments; all 10 write (6 direct supabase, 4 via lib/dataAccess idempotentInsert/safeUpdate). core.ts is a dispatcher that refuses non-writing actions. BUG-013 → re-verify as FIXED.
- createClient is real (rpc next_document_number + insert). createRental real (rpc create_booking). confirmRental real (booking_stage_transitions insert).

Minor observations:
- Mock numbering starts at C-1 / B-1 (ignores seed corpus B-700…B-945) — mock-only.
- booking_lines.description = null on created lines.
- "BS not available for this date" shown under date fields (bs.ts table gap surfacing honestly).
- Lint FAILS zero-warning gate: NewRental.tsx:1803 useCallback missing 7 deps incl. depositRequiredPaisa, discountPct (stale closure on money — P2).
- Build passes (4m06s). PWA present: vite-plugin-pwa 1.3.0, dist/sw.js, 143 precache entries 3.39MB. vendor-scanner chunk 453KB largest.
- npm audit: 3 high (fast-uri, nanoid — fix available; vite — major bump), 1 moderate. Dev-side. P3.
