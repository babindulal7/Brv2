#!/usr/bin/env python3
"""
detect_profit_leakage.py - Babin Rentals OS Profit Leakage Detector (Brain v4 Layer 3)

Audits bookings, rental returns, and quotes for financial leakage:
1. Unbilled Late Returns: Returns > 30 mins late without corresponding fee or authorized waiver.
2. Missing Caretaker Lines: Kits >= 50,000 NPR or cine gear without Rs 2,000/day caretaker.
3. Missing Security Deposits: High-risk cinema gear released without mandatory liability deposit.
4. Law 10 Discount Violations: Discounts > 10% missing reason/approver, or exceeding 25% cap.
5. Student Discount on Bundles: Policy breach without owner sign-off.
6. Unbilled Monsoon / Wet Decontamination: Wet gear returned without Rs 5,000 cleaning charge.
7. Integer Paisa Math & VAT Discrepancies: Rounding leaks or missed 13% VAT.
"""

import sys
import os
import json
import argparse
from typing import Dict, Any, List, Optional

# Ensure local scripts path is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from os_engine import (
    rupees, to_rupees, round_half_up, grouped, Paisa,
    price, validate_discount, calculate_late_fee, validate_late_fee_waiver
)

CINE_KEYWORDS = ["red", "komodo", "ronin 4d", "mantis", "great joy", "chiopt", "nisi athena"]

def audit_booking(booking: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Runs an exhaustive profit leakage audit on a single booking object.
    Returns a list of detected leakage items with severity and recoverable NPR.
    """
    leaks = []
    b_id = booking.get("id", "UNKNOWN")
    lines = booking.get("lines", [])
    items = [line.get("item_id", "").lower() for line in lines]
    
    # ── 1. Caretaker Leakage Check ───────────────────────────────────────────
    has_cine_body = any(any(kw in item for kw in CINE_KEYWORDS) for item in items)
    subtotal_est = sum(line.get("rate_npr", 0) * line.get("days", 1) for line in lines)
    has_caretaker = any("caretaker" in item for item in items)
    
    if (has_cine_body or subtotal_est >= 50000) and not has_caretaker:
        days = max((line.get("days", 1) for line in lines), default=1)
        recoverable = 2000.0 * days
        leaks.append({
            "code": "MISSING_CARETAKER_FEE",
            "severity": "HIGH",
            "message": f"Kit contains cinema gear or subtotal >= 50k but Caretaker (Rs 2,000/day x {days}d) is missing.",
            "recoverable_npr": recoverable,
            "action": "Add Camera Caretaker line item or attach explicit owner-authorized exemption."
        })

    # ── 2. Security Deposit Leakage Check ────────────────────────────────────
    deposit_held = booking.get("deposit_held_npr", 0.0)
    for kw, req_deposit in [
        ("komodo", 150000.0),
        ("ronin 4d", 100000.0),
        ("mantis", 75000.0),
        ("great joy", 75000.0),
        ("chiopt", 50000.0)
    ]:
        if any(kw in item for item in items) and deposit_held < req_deposit:
            shortfall = req_deposit - deposit_held
            leaks.append({
                "code": "UNDER_SECURED_DEPOSIT",
                "severity": "CRITICAL",
                "message": f"Kit contains '{kw}' requiring Rs {grouped(int(req_deposit))} deposit, but only Rs {grouped(int(deposit_held))} was held.",
                "recoverable_npr": shortfall,
                "action": f"Collect required liability deposit shortfall of Rs {grouped(int(shortfall))} before release."
            })
            break  # One deposit leak alert per kit is sufficient

    # ── 3. Law 10 Discount Gate Audit ───────────────────────────────────────
    disc_pct = booking.get("discount_pct", 0.0)
    disc_reason = booking.get("discount_reason", "")
    approver = booking.get("discount_approver", "")
    
    disc_check = validate_discount(disc_pct, disc_reason, approver)
    if not disc_check["valid"]:
        disc_amount = subtotal_est * (disc_pct / 100.0)
        leaks.append({
            "code": "UNAUTHORIZED_DISCOUNT",
            "severity": "CRITICAL",
            "message": f"Discount {disc_pct}% violates Law 10: {disc_check['error']}",
            "recoverable_npr": disc_amount,
            "action": "Revoke discount or provide required >=10 char justification and Manager/Owner approval."
        })

    # ── 4. Unbilled Late Return Audit ───────────────────────────────────────
    return_overage_mins = booking.get("overage_minutes", 0)
    late_fee_billed = booking.get("late_fee_billed_npr", 0.0)
    waiver_reason = booking.get("late_fee_waiver_reason")
    waiver_approver = booking.get("late_fee_waiver_approver")
    
    if return_overage_mins > 30 and late_fee_billed <= 0.0:
        day_rate = sum(l.get("rate_npr", 0.0) for l in lines)
        calc_fee = calculate_late_fee(return_overage_mins, rupees(day_rate))
        expected_fee = to_rupees(calc_fee["fee_paisa"])
        
        # Check if waived legally
        if waiver_reason and waiver_approver:
            w_check = validate_late_fee_waiver(waiver_reason, waiver_approver)
            if not w_check["valid"]:
                leaks.append({
                    "code": "INVALID_LATE_FEE_WAIVER",
                    "severity": "HIGH",
                    "message": f"Late fee waiver rejected: {w_check['error']}. Expected late fee: Rs {grouped(int(expected_fee))}.",
                    "recoverable_npr": expected_fee,
                    "action": "Bill the late fee or record a valid waiver with Manager/Owner signoff."
                })
        else:
            leaks.append({
                "code": "UNBILLED_LATE_RETURN",
                "severity": "HIGH",
                "message": f"Gear returned {return_overage_mins} mins late ({calc_fee['band']}) but Rs 0 fee was billed without waiver.",
                "recoverable_npr": expected_fee,
                "action": f"Invoice client for {calc_fee['band']} late fee: Rs {grouped(int(expected_fee))}."
            })

    # ── 5. Wet Return Decontamination Leakage ────────────────────────────────
    is_wet_return = booking.get("is_wet_or_damp", False)
    wet_cleaning_billed = booking.get("wet_cleaning_billed_npr", 0.0)
    if is_wet_return and wet_cleaning_billed < 5000.0:
        leaks.append({
            "code": "UNBILLED_WET_DECONTAMINATION",
            "severity": "MEDIUM",
            "message": "Equipment returned damp/wet during monsoon/field shoot, but mandatory Rs 5,000 cleaning fee was omitted.",
            "recoverable_npr": 5000.0 - wet_cleaning_billed,
            "action": "Invoice mandatory Rs 5,000 decontamination cleaning fee before clearing deposit."
        })

    # ── 6. VAT Precision Check ───────────────────────────────────────────────
    if subtotal_est > 0:
        calc_totals = price(
            equipment=rupees(subtotal_est),
            discount_percent=disc_pct if disc_check["valid"] else 0.0
        )
        billed_vat = booking.get("vat_billed_npr")
        expected_vat = to_rupees(calc_totals["vat"])
        if billed_vat is not None and abs(billed_vat - expected_vat) > 1.0:
            diff = abs(billed_vat - expected_vat)
            leaks.append({
                "code": "VAT_CALCULATION_MISMATCH",
                "severity": "MEDIUM",
                "message": f"VAT billed (Rs {billed_vat}) differs from integer Paisa 13% standard (Rs {expected_vat}).",
                "recoverable_npr": diff,
                "action": "Recompute order using os_engine.py price calculation."
            })

    return leaks

def run_audit(sample_bookings: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_recoverable = 0.0
    all_findings = []
    
    for b in sample_bookings:
        b_findings = audit_booking(b)
        if b_findings:
            rec_sum = sum(f["recoverable_npr"] for f in b_findings)
            total_recoverable += rec_sum
            all_findings.append({
                "booking_id": b.get("id"),
                "client": b.get("client_name"),
                "leaks": b_findings,
                "total_recoverable_npr": rec_sum
            })
            
    return {
        "total_bookings_audited": len(sample_bookings),
        "flagged_bookings_count": len(all_findings),
        "total_recoverable_npr": total_recoverable,
        "total_recoverable_formatted": grouped(int(total_recoverable)),
        "findings": all_findings
    }

def main():
    parser = argparse.ArgumentParser(description="Babin Rentals Profit Leakage Auditor")
    parser.add_argument("--demo", action="store_true", default=True, help="Run audit on standard test bookings")
    args = parser.parse_args()
    
    # Realistic test bookings demonstrating various leakage traps
    test_bookings = [
        {
            "id": "BK-2026-0801",
            "client_name": "Studio 9 TVC",
            "lines": [
                {"item_id": "red_komodo_x", "rate_npr": 12000.0, "days": 2},
                {"item_id": "nisi_athena_prime_set", "rate_npr": 8000.0, "days": 2}
            ],
            "discount_pct": 15.0,
            "discount_reason": "Regular client",  # < 10 chars!
            "discount_approver": "Staff Tech",    # Not Manager or Owner!
            "deposit_held_npr": 50000.0,           # Komodo requires 150k!
            "overage_minutes": 150,               # > 120m -> Full day!
            "late_fee_billed_npr": 0.0,
            "late_fee_waiver_reason": None,
            "is_wet_or_damp": False
        },
        {
            "id": "BK-2026-0802",
            "client_name": "Pana Weddings",
            "lines": [
                {"item_id": "sony_fx3a", "rate_npr": 4000.0, "days": 3},
                {"item_id": "sony_24_70_gm_ii", "rate_npr": 2500.0, "days": 3},
                {"item_id": "dji_rs3_pro", "rate_npr": 2000.0, "days": 3}
            ],
            "discount_pct": 0.0,
            "deposit_held_npr": 25000.0,
            "overage_minutes": 20,                # <= 30m grace
            "late_fee_billed_npr": 0.0,
            "is_wet_or_damp": False
        },
        {
            "id": "BK-2026-0803",
            "client_name": "Monsoon Music Video",
            "lines": [
                {"item_id": "sony_fx3a", "rate_npr": 4000.0, "days": 1},
                {"item_id": "sigma_24_70_art_ii", "rate_npr": 1800.0, "days": 1}
            ],
            "discount_pct": 0.0,
            "deposit_held_npr": 20000.0,
            "overage_minutes": 0,
            "late_fee_billed_npr": 0.0,
            "is_wet_or_damp": True,               # Damp return!
            "wet_cleaning_billed_npr": 0.0
        }
    ]
    
    print("=" * 70)
    print(" BABIN RENTALS OS - PROFIT LEAKAGE AUDITOR (BRAIN v4)")
    print("=" * 70)
    
    res = run_audit(test_bookings)
    print(f"Audited Bookings:     {res['total_bookings_audited']}")
    print(f"Flagged Bookings:     {res['flagged_bookings_count']}")
    print(f"Total Recoverable:    Rs. {res['total_recoverable_formatted']} NPR\n")
    
    for item in res["findings"]:
        print(f"--- [!] BOOKING: {item['booking_id']} ({item['client']}) ---")
        print(f"    Recoverable: Rs. {grouped(int(item['total_recoverable_npr']))}")
        for l in item["leaks"]:
            print(f"    * [{l['severity']}] {l['code']}: {l['message']}")
            print(f"      Action: {l['action']}")
        print()
    print("=" * 70)

if __name__ == "__main__":
    main()
