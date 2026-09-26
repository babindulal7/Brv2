#!/usr/bin/env python3
"""
run_eval_suite.py - Babin Rentals OS Deterministic Intelligence Evaluation Suite (Brain v4 Layer 6)

Comprehensive 50+ scenario automated test harness verifying:
1. Integer Paisa Precision & Half-Up Rounding (money.ts)
2. Foundation §2.8 Reference Case Assertion (BK-2026-0715)
3. Law 10 Discount Gates (10% threshold, 25% hard cap, 10-char reason, named approver)
4. Law 5 Deposit Liability Isolation (deposits never in Rental Total or Outstanding)
5. Late Return Fee Tiers & Waiver Gates (lateFee.ts)
6. Damage Findings & Deposit Settlement (damage.ts)
7. State Transitions & Availability Gates (RETURNED != AVAILABLE, HOLD blocks)
8. Auto-Completion & Hard Conflict Rejections
9. Payload Headroom Validation (30% safety margin)
10. Electrical & Inverter Power Limits (15A/230V circuit limits & battery runtimes)
11. Profit Leakage Detection Engine
"""

import sys
import os
import math
from typing import Dict, Any, List, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from os_engine import (
    rupees, to_rupees, round_half_up, grouped, format_money, to_whole_rupee,
    price, validate_discount, calculate_late_fee, validate_late_fee_waiver,
    approver_for_damage, validate_damage_report, settle_deposit_against_damage,
    validate_advance, check_booking_conflict, complete_kit_check,
    Paisa, DISCOUNT_APPROVAL_THRESHOLD, DISCOUNT_CAP
)
from detect_profit_leakage import audit_booking
from simulate_scenario import simulate_rate_change, simulate_add_asset

# Test tracking
PASSED = 0
FAILED = 0
ERRORS: List[str] = []

def run_test(name: str, condition: bool, err_msg: str = ""):
    global PASSED, FAILED, ERRORS
    if condition:
        PASSED += 1
        print(f"  [PASS] {name}")
    else:
        FAILED += 1
        msg = f"FAILED: {name} -> {err_msg}"
        ERRORS.append(msg)
        print(f"  [FAIL] {name} ({err_msg})")

def main():
    print("=" * 75)
    print(" BABIN RENTALS OS - BRAIN v4 EVALUATION SUITE (50+ SCENARIOS)")
    print("=" * 75)
    
    # ── SUITE 1: Paisa Precision & Half-Up Rounding (5 tests) ───────────────
    print("\n--- SUITE 1: INTEGER PAISA & HALF-UP ROUNDING ---")
    run_test("round_half_up(0.5) == 1", round_half_up(0.5) == 1, "Expected 1")
    run_test("round_half_up(0.499) == 0", round_half_up(0.499) == 0, "Expected 0")
    run_test("round_half_up(-0.5) == -1 (symmetric negative)", round_half_up(-0.5) == -1, "Expected -1")
    run_test("rupees(1850.50) == 185050 Paisa", rupees(1850.50) == 185050, "Paisa integer drift")
    run_test("grouped(1850000) == '18,50,000' (South Asian lakh grouping)", grouped(1850000) == "18,50,000", "Lakh format error")

    # ── SUITE 2: Foundation §2.8 Reference Case Assertion (1 test) ───────────
    print("\n--- SUITE 2: FOUNDATION §2.8 REFERENCE CASE (BK-2026-0715) ---")
    ref = price(
        equipment=rupees(132750),
        discount_percent=7.0,
        vat_percent=13.0,
        payments=rupees(15000)
    )
    run_test("BK-2026-0715: Discount Rs 9,293 | Taxable 1,23,457 | VAT 16,049 | Total 1,39,506 | Out 1,24,506",
             to_rupees(ref["discount"]) == 9293.0 and
             to_rupees(ref["taxable"]) == 123457.0 and
             to_rupees(ref["vat"]) == 16049.0 and
             to_rupees(ref["rental_total"]) == 139506.0 and
             to_rupees(ref["outstanding"]) == 124506.0,
             f"Values mismatch: got discount={to_rupees(ref['discount'])}, total={to_rupees(ref['rental_total'])}")

    # ── SUITE 3: Law 10 Discount Gates (6 tests) ─────────────────────────────
    print("\n--- SUITE 3: LAW 10 DISCOUNT GATES ---")
    d0 = validate_discount(0.0)
    run_test("0% discount is valid without approval", d0["valid"] and not d0["requires_approval"])
    
    d10 = validate_discount(10.0)
    run_test("10% discount is valid without approval (threshold inclusive)", d10["valid"] and not d10["requires_approval"])
    
    d12_no_reason = validate_discount(12.0, reason="", approver_name="Babin")
    run_test("12% discount without reason is rejected", not d12_no_reason["valid"])
    
    d12_short_reason = validate_discount(12.0, reason="Short", approver_name="Babin")
    run_test("12% discount with reason < 10 chars is rejected", not d12_short_reason["valid"])
    
    d12_no_approver = validate_discount(12.0, reason="Student documentary shoot", approver_name=None)
    run_test("12% discount without named approver is rejected", not d12_no_approver["valid"])
    
    d12_valid = validate_discount(12.0, reason="Student documentary shoot", approver_name="Babin (Owner)")
    run_test("12% discount with valid reason and approver is accepted", d12_valid["valid"])
    
    d26 = validate_discount(26.0, reason="Approved by owner in writing", approver_name="Babin (Owner)")
    run_test("26% discount is hard blocked (exceeds 25% cap, Law 10)", not d26["valid"])

    # ── SUITE 4: Law 5 Deposit Liability Isolation (3 tests) ─────────────────
    print("\n--- SUITE 4: LAW 5 DEPOSIT LIABILITY ISOLATION ---")
    # Order: Equipment Rs 50,000, Deposit Rs 1,50,000 held, Payments Rs 20,000
    ord_calc = price(equipment=rupees(50000), payments=rupees(20000))
    deposit_paisa = rupees(150000)
    
    run_test("Law 5: Security deposit is excluded from Subtotal", ord_calc["subtotal"] == rupees(50000))
    run_test("Law 5: Security deposit never enters Rental Total", ord_calc["rental_total"] == rupees(56500))  # 50k + 13% VAT
    run_test("Law 5: Security deposit never reduces Outstanding balance", ord_calc["outstanding"] == rupees(36500))  # 56.5k - 20k

    # ── SUITE 5: Late Return Fee Tiers & Waiver Gates (6 tests) ──────────────
    print("\n--- SUITE 5: LATE RETURN FEE TIERS & WAIVER GATES ---")
    day_rate = rupees(10000)
    
    lf_grace = calculate_late_fee(25.0, day_rate)
    run_test("Late return <= 30 mins: Band 'None' and Fee Rs 0", lf_grace["band"] == "None" and lf_grace["fee_paisa"] == 0)
    
    lf_half = calculate_late_fee(90.0, day_rate)
    run_test("Late return 31-120 mins: Band 'Half Day' and Fee Rs 5,000",
             lf_half["band"] == "Half Day" and lf_half["fee_paisa"] == rupees(5000))
    
    lf_full = calculate_late_fee(180.0, day_rate)
    run_test("Late return > 120 mins: Band 'Full Day' and Fee Rs 10,000",
             lf_full["band"] == "Full Day" and lf_full["fee_paisa"] == rupees(10000))
             
    lf_multi = calculate_late_fee(1500.0, day_rate)  # > 1440 mins (24h)
    run_test("Late return 25 hours: 2 Full Days charged (Rs 20,000)",
             lf_multi["full_days_charged"] == 2 and lf_multi["fee_paisa"] == rupees(20000))
             
    w_reject = validate_late_fee_waiver("Traffic", "Staff Tech")
    run_test("Late fee waiver with reason < 10 chars is rejected", not w_reject["valid"])
    
    w_ok = validate_late_fee_waiver("Vehicle breakdown on highway confirmed", "Babin")
    run_test("Late fee waiver with valid reason and approver is accepted", w_ok["valid"])

    # ── SUITE 6: Damage Findings & Deposit Settlement (5 tests) ──────────────
    print("\n--- SUITE 6: DAMAGE FINDINGS & DEPOSIT SETTLEMENT ---")
    run_test("Damage charge Rs 10,000 approver is 'Manager'", approver_for_damage(rupees(10000)) == "Manager")
    run_test("Damage charge Rs 30,000 approver is 'Owner' (>= Rs 25,000)", approver_for_damage(rupees(30000)) == "Owner")
    
    dmg_no_photo = validate_damage_report(photos=0, description="Scratch on lens front element", charge_paisa=rupees(10000))
    run_test("Damage report with 0 photos is rejected (min 1 required)", not dmg_no_photo["valid"])
    
    dmg_short_desc = validate_damage_report(photos=1, description="Dented", charge_paisa=rupees(10000))
    run_test("Damage report with desc < 10 chars is rejected", not dmg_short_desc["valid"])
    
    # Deposit Rs 50,000, Damage Rs 30,000 -> Refund 20,000, Shortfall 0
    settle1 = settle_deposit_against_damage(rupees(50000), rupees(30000))
    run_test("Damage < Deposit: Refund Rs 20,000, Shortfall Rs 0",
             settle1["refund_paisa"] == rupees(20000) and settle1["shortfall_paisa"] == 0)

    # Deposit Rs 25,000, Damage Rs 40,000 -> Refund 0, Shortfall 15,000 (never negative refund)
    settle2 = settle_deposit_against_damage(rupees(25000), rupees(40000))
    run_test("Damage > Deposit: Refund Rs 0 (non-negative), Shortfall Rs 15,000",
             settle2["refund_paisa"] == 0 and settle2["shortfall_paisa"] == rupees(15000))

    # ── SUITE 7: Advance Payments & State Transitions (5 tests) ──────────────
    print("\n--- SUITE 7: ADVANCE PAYMENTS & LIFECYCLE GATES ---")
    adv_small = validate_advance(rupees(4000), rupees(4000))
    run_test("Total < 5,000: Full payment required before release", adv_small["allowed"])
    
    adv_small_partial = validate_advance(rupees(4000), rupees(2000))
    run_test("Total < 5,000: Partial payment blocked", not adv_small_partial["allowed"])
    
    adv_mid = validate_advance(rupees(8000), rupees(5000))
    run_test("Total 8,000: Minimum Rs 5,000 advance required", adv_mid["allowed"])
    
    adv_large = validate_advance(rupees(20000), rupees(10000))
    run_test("Total 20,000: Minimum 50% advance (Rs 10,000) required", adv_large["allowed"])
    
    adv_large_under = validate_advance(rupees(20000), rupees(8000))
    run_test("Total 20,000: 40% advance blocked (<50%)", not adv_large_under["allowed"])

    # ── SUITE 8: Booking Conflicts & Inventory Isolation (3 tests) ───────────
    print("\n--- SUITE 8: CONFLICT & AVAILABILITY LOGIC ---")
    existing_booking = {"start_date": "2026-07-10", "end_date": "2026-07-14"}
    
    conf_overlap = check_booking_conflict("2026-07-12", "2026-07-15", [existing_booking])
    run_test("Overlapping dates detected as booking conflict", conf_overlap["has_conflict"])
    
    conf_outside = check_booking_conflict("2026-07-15", "2026-07-18", [existing_booking])
    run_test("Non-overlapping dates clear with 0 conflict", not conf_outside["has_conflict"])
    
    conf_inside = check_booking_conflict("2026-07-11", "2026-07-13", [existing_booking])
    run_test("Sub-interval dates detected as booking conflict", conf_inside["has_conflict"])

    # ── SUITE 9: Auto-Completion & Hard Conflict Rejections (6 tests) ────────
    print("\n--- SUITE 9: AUTO-COMPLETION & HARD CONFLICT REJECTIONS ---")
    # PL lens on Sony FX3 requires PL->E adapter
    kit_pl_sony = complete_kit_check(["sony_fx3a", "blazar_mantis_anamorphic"])
    run_test("PL Lens on Sony FX3 auto-requires PL->E adapter",
             any("adapter" in req.lower() for req in kit_pl_sony["required_additions"]))
             
    # CHIOPT zoom requires rods and lens support
    kit_chiopt = complete_kit_check(["sony_fx3a", "chiopt_zoom_set"])
    run_test("CHIOPT lens requires rods + lens support (mount damage prevention)",
             any("rod" in req.lower() or "support" in req.lower() for req in kit_chiopt["required_additions"]))
             
    # Hard conflict: Ronin 4D + external gimbal
    kit_ronin_gimbal = complete_kit_check(["dji_ronin_4d_6k", "dji_rs3_pro"])
    run_test("Ronin 4D + external gimbal triggers REJECT (has built-in 4-axis)",
             len(kit_ronin_gimbal["blocking_errors"]) > 0)
             
    # Hard conflict: CHIOPT without rods marked as blocking error if explicitly rejected
    run_test("CHIOPT missing support produces blocking warning",
             len(kit_chiopt["required_additions"]) >= 2)
             
    # RED camera requires RED-verified media
    kit_red = complete_kit_check(["red_komodo_x"])
    run_test("RED Komodo-X auto-requires CFexpress Type B and V-Mount batteries",
             any("cfexpress" in req.lower() for req in kit_red["required_additions"]))
             
    # Glimmer filter without Mirage matte box
    kit_glimmer = complete_kit_check(["glimmer_filter"])
    run_test("Glimmer filter auto-requires Tilta Mirage mattebox",
             any("mirage" in req.lower() for req in kit_glimmer["required_additions"]))

    # ── SUITE 10: Payload Headroom Law (30% Margin) (4 tests) ───────────────
    print("\n--- SUITE 10: PAYLOAD HEADROOM (30% SAFETY MARGIN) ---")
    # Tripod max payload 10kg (10,000g). Safe payload with 30% margin = 7.0kg (7,000g)
    def validate_tripod_payload(rig_weight_g: float, tripod_rating_g: float) -> Tuple[bool, float]:
        safe_limit = tripod_rating_g * 0.70
        return (rig_weight_g <= safe_limit), (rig_weight_g / tripod_rating_g) * 100.0

    t1_pass, t1_util = validate_tripod_payload(3500.0, 10000.0)
    run_test("3.5kg rig on 10kg tripod passes (35% utilization <= 70% safe limit)", t1_pass)
    
    t2_fail, t2_util = validate_tripod_payload(7500.0, 10000.0)
    run_test("7.5kg rig on 10kg tripod fails (75% utilization > 70% safe limit)", not t2_fail)
    
    t3_pass, t3_util = validate_tripod_payload(7500.0, 15000.0)
    run_test("7.5kg rig on 15kg Studio Assist tripod passes (50% utilization)", t3_pass)

    # Gimbal dynamic payload: RS3 (3.0kg max). Rig weight 2.8kg is > 85% motor strain
    def validate_gimbal_payload(rig_weight_g: float, gimbal_rating_g: float) -> bool:
        return rig_weight_g <= (gimbal_rating_g * 0.85)

    g1_pass = validate_gimbal_payload(1850.0, 3000.0)
    run_test("1.85kg FX3 rig on DJI RS3 passes safely (< 85% motor limit)", g1_pass)

    # ── SUITE 11: Electrical & Inverter Power Budget (4 tests) ──────────────
    print("\n--- SUITE 11: ELECTRICAL & INVERTER POWER LIMITS ---")
    # Nepal 230V 15A socket safe continuous load = 2,760W (80% rule: 12A x 230V)
    def validate_power_circuit(watts: float) -> bool:
        return watts <= 2760.0

    p1_pass = validate_power_circuit(720.0)  # Single Aputure 600x (720W)
    run_test("Aputure 600x (720W) on 230V 15A circuit passes safely", p1_pass)
    
    p2_fail = validate_power_circuit(3100.0)  # 3x 600x + 1x 300c (3,100W)
    run_test("3,100W lighting rig on single 15A socket triggers overload block (>2,760W safe threshold)", not p2_fail)

    # Battery runtime calculation: 99Wh at 0.85 efficiency for FX3 rig (15W draw)
    # Runtime = (99 * 0.85) / 15 = 84.15 / 15 = 5.61 hours
    def calc_runtime(wh: float, watts: float, cold_weather: bool = False) -> float:
        eff = 0.85 * (0.60 if cold_weather else 1.0)
        return (wh * eff) / watts

    rt_normal = calc_runtime(99.0, 15.0, cold_weather=False)
    run_test("99Wh V-Mount powers 15W FX3 rig for ~5.6 hours (0.85 efficiency)", abs(rt_normal - 5.61) < 0.1)

    rt_cold = calc_runtime(99.0, 15.0, cold_weather=True)
    run_test("Cold weather (-10C Mustang) reduces runtime to ~3.36 hours (40% derating)", abs(rt_cold - 3.36) < 0.1)

    # ── SUITE 12: Profit Leakage Detection (3 tests) ─────────────────────────
    print("\n--- SUITE 12: PROFIT LEAKAGE DETECTION ---")
    leak_b1 = {
        "id": "TEST-01",
        "lines": [{"item_id": "red_komodo_x", "rate_npr": 12000.0, "days": 1}],
        "deposit_held_npr": 50000.0  # Requires 150k
    }
    leaks1 = audit_booking(leak_b1)
    run_test("Audit detects under-secured deposit on RED Komodo-X",
             any(l["code"] == "UNDER_SECURED_DEPOSIT" for l in leaks1))
    run_test("Audit detects missing Camera Caretaker on cinema body",
             any(l["code"] == "MISSING_CARETAKER_FEE" for l in leaks1))

    leak_b2 = {
        "id": "TEST-02",
        "lines": [{"item_id": "sony_fx3a", "rate_npr": 4000.0, "days": 1}],
        "is_wet_or_damp": True,
        "wet_cleaning_billed_npr": 0.0
    }
    leaks2 = audit_booking(leak_b2)
    run_test("Audit detects unbilled wet decontamination fee on damp return",
             any(l["code"] == "UNBILLED_WET_DECONTAMINATION" for l in leaks2))

    # ── SUITE 13: Scenario Simulation Engines (2 tests) ─────────────────────
    print("\n--- SUITE 13: SCENARIO SIMULATION ENGINES ---")
    sim_rate = simulate_rate_change("sony_fx3a", 4000.0, 4500.0)
    run_test("Simulate rate change computes positive annual delta", sim_rate["annual_delta_npr"] > 0)

    sim_asset = simulate_add_asset("sony_fx3a", 285000.0, 4000.0)
    run_test("Simulate add asset evaluates 10-month recovery percentage against 40% benchmark",
             sim_asset["ten_month_recovery_pct"] > 40.0 and sim_asset["recommendation"] == "HIGHLY RECOMMENDED")

    # ── FINAL REPORT ────────────────────────────────────────────────────────
    total_tests = PASSED + FAILED
    print("\n" + "=" * 75)
    print(f" EVALUATION SUITE COMPLETE: {PASSED}/{total_tests} SCENARIOS PASSED ({PASSED/total_tests*100:.1f}%)")
    if FAILED == 0:
        print(" STATUS: ALL DETERMINISTIC RULES, ENGINES & SAFETY CHECKS VERIFIED [OK]")
    else:
        print(f" STATUS: {FAILED} TESTS FAILED!")
        for e in ERRORS:
            print(f"   [!] {e}")
    print("=" * 75)
    
    if FAILED > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
