# Babin Rentals — Profit Leakage Audit Playbook (Brain v4)

> *"Profit is not lost in catastrophic accidents; it bleeds out in unbilled hours, waived deposits, unrecorded accessories, and unapproved price trims."*

---

## 1. THE SIX PRIMARY REVENUE LEAKS

In a professional camera rental house, revenue leakage typically accounts for 8% to 15% of annual gross billings. Babin Rentals OS enforces deterministic gates to eliminate these leaks entirely.

```
       [ 1. Unbilled Late Returns ] ──┐
       [ 2. Missing Caretaker Fee ] ──┼──>  ANNUAL PROFIT DRAIN
       [ 3. Under-Secured Deposit ] ──┤     (Recoverable via Brain v4)
       [ 4. Unauthorized Discount ] ──┤
       [ 5. Wet/Damp Decontam Fee ] ──┤
       [ 6. Accessory / Cable Bleed ] ┘
```

---

## 2. AUDIT PROTOCOLS BY OPERATIONAL STAGE

### Stage 1: `Quote` (Order 0)
* **Leak Trap 1: Discount Stacking & Verbal Trims**
  - *Risk:* Staff verbally offering "round figure" cuts (e.g. Rs 11,500 $\rightarrow$ Rs 10,000 = 13% discount).
  - *Audit Gate:* Law 10 triggers on any discount $> 10\%$. Requires a reason $\ge 10$ characters AND named Manager/Owner approver. Hard cap at 25%.
* **Leak Trap 2: Missing Camera Caretaker**
  - *Risk:* Quoting high-risk cinema packages (RED, Ronin 4D, Anamorphic, NiSi Athena) or orders $\ge \text{NPR } 50,000$ without the Rs 2,000/day Caretaker fee.
  - *Audit Gate:* System automatically injects the Caretaker line. Removing it requires an explicit written owner exemption.
* **Leak Trap 3: Unapplied VAT (13%)**
  - *Risk:* Quoting tax-exclusive figures to appear cheaper, causing dispute at final invoice.
  - *Audit Gate:* Integer Paisa financial engine computes VAT automatically. Quotes always display Subtotal, Discount, Taxable, 13% VAT, and Rental Total.

---

### Stage 2: `Booked` (Order 1)
* **Leak Trap 4: Advance Evasion**
  - *Risk:* Marking an order "Confirmed" or reserving equipment without collecting the required advance.
  - *Audit Gate (§R1):*
    - Total $< \text{NPR } 5,000$: Full 100% payment required.
    - Total $\ge \text{NPR } 5,000$ and $< \text{NPR } 10,000$: Minimum NPR 5,000 advance.
    - Total $\ge \text{NPR } 10,000$: Minimum 50% advance.
    - Status CANNOT transition from `Quote` to `Booked` until advance transaction reference is logged.
* **Leak Trap 5: Under-Secured Deposits on Cinema Fleet**
  - *Risk:* Releasing a Rs 15 Lakh cinema package with a token Rs 10,000 deposit.
  - *Audit Gate (Flat-Rate Deposit Policy):*
    - RED Komodo / Komodo-X: **NPR 150,000 flat**
    - DJI Ronin 4D 6K Cinema Package: **NPR 100,000 flat**
    - Blazar Mantis 1.33x Anamorphic Set: **NPR 75,000 flat**
    - Great Joy 1.8x Anamorphic Set: **NPR 75,000 flat**
    - CHIOPT 28–85 / 75–250 Cine Zoom Set: **NPR 50,000 flat**

---

### Stage 3 & 4: `Packed` & `On Rent` (Orders 2 & 3)
* **Leak Trap 6: Phantom Accessory Dispatch**
  - *Risk:* Tossing in extra D-Tap cables, NP-F batteries, or HDMI splitters into the Pelican case without recording them on the packing sheet.
  - *Audit Gate:* Barcode scan / itemized verification on `Job: Pack`. Every dispatched serialized item must exist on the booking line items.

---

### Stage 5: `Returned` (Order 4)
* **Leak Trap 7: Unbilled Late Return Overage**
  - *Risk:* Gear returns 3 hours late; staff accepts with a handshake and charges Rs 0.
  - *Audit Gate (`lateFee.ts`):*
    - $\le 30\text{ minutes}$: Band `None` (Rs 0 grace).
    - $31\text{ to } 120\text{ minutes}$: Band `Half Day` (Charge 50% daily rate).
    - $> 120\text{ minutes}$: Band `Full Day` (Charge 100% full extra day rate per 24h block).
    - **Waiver Gate:** Late fee waiver requires reason $\ge 10$ characters AND Manager/Owner signoff. Staff cannot waive late fees unilaterally.
* **Leak Trap 8: Monsoon / Wet Gear Decontamination**
  - *Risk:* Equipment used in rain returns damp; gear is dried with a towel and shelved, causing fungus growth on lens coatings and sensor filters.
  - *Audit Gate (Monsoon Protocol):*
    - Mandatory moisture inspection on return.
    - Damp or rain-exposed returns automatically incur **NPR 5,000 Wet Decontamination Fee** and move to dry cabinet hold in `Job: Reset`.

---

### Stage 6: `Closed` (Order 5)
* **Leak Trap 9: Law 5 Deposit Commingling**
  - *Risk:* Applying customer deposit to rental fee without issuing invoice, causing VAT and accounting discrepancies.
  - *Audit Gate:* Law 5 strictly isolates deposits as liabilities. Rental fee must be fully settled against invoice; deposit is refunded or debited for verified damage findings with photo evidence.
* **Leak Trap 10: Damage Under-Billing**
  - *Risk:* Charging client Rs 2,000 for a broken monitor arm that costs Rs 6,500 to replace.
  - *Audit Gate:* Prep tech must record photo + replacement/repair quote; charges $\ge \text{NPR } 25,000$ require Owner sign-off; shortfalls become separate accounts receivable.

---

## 3. AUTOMATED LEAK AUDIT TOOL

Run the automated leakage scanner on any active booking or historical batch:

```powershell
# Run audit on demo/active bookings
python scripts/detect_profit_leakage.py

# Audit specific booking
python scripts/detect_profit_leakage.py --booking-id BK-2026-0801
```

---

## 4. PROFIT LEAKAGE RECOVERY TARGETS

| Leak Category | Avg Leaked / Order | Annual Fleet Impact | OS Prevention Gate |
|---|---|---|---|
| Unbilled Late Returns | NPR 3,500 | ~NPR 2,80,000 | `lateFee.ts` Bander + Waiver Gate |
| Missing Caretaker Fees | NPR 4,000 | ~NPR 3,20,000 | Auto-inclusion on Kits $\ge$ 50k / Cine |
| Unauthorized Discounts | NPR 1,800 | ~NPR 2,50,000 | Law 10 Trigger + 25% Hard Cap |
| Unbilled Wet Decontamination | NPR 5,000 | ~NPR 90,000 | Monsoon Mode Return Inspection |
| Lost Accsoon / Mic Accessories | NPR 1,200 | ~NPR 1,10,000 | Handover $\leftrightarrow$ Return Mirror Checklist |
| **Total Recaptured Profit** | — | **~NPR 10.5 Lakh / yr** | **Brain v4 Automated Audit** |
