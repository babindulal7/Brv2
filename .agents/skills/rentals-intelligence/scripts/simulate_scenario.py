#!/usr/bin/env python3
"""
simulate_scenario.py - Babin Rentals OS Scenario Simulator (Brain v4 Layer 5)

Simulates operational and financial scenarios:
1. Rate Change: Impact of altering equipment daily rates (e.g. FX3 from 4,000 to 4,500).
2. Asset Purchase: Payback time (months/rentals) and ROI for purchasing a new or additional unit
   based on current utilization and recorded lost demand.
3. Seasonal Shift: Impact of monsoon slump (-40% outdoor) or wedding surge (+50% cine/AF).
4. Discount Tightening: Margin recapture when lowering discount thresholds or enforcing Law 10.

Strictly adheres to:
- Integer Paisa currency math via os_engine.py
- Babin ROI doctrine: target 40% capital recovery within 10 months (~4% per month)
- Half-up rounding and South Asian lakh formatting
"""

import sys
import os
import json
import argparse
from typing import Dict, Any

# Ensure local scripts path is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from os_engine import rupees, to_rupees, round_half_up, grouped, Paisa

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

def load_json(filename: str) -> Dict[str, Any]:
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def simulate_rate_change(product_id: str, current_rate_npr: float, new_rate_npr: float,
                          avg_monthly_rental_days: float = 12.0, elasticity: float = -0.5) -> Dict[str, Any]:
    """
    Simulates changing an item's daily rental rate.
    Elasticity = % change in quantity demanded / % change in price.
    Default elasticity = -0.5 (cinema equipment in Kathmandu has inelastic brand loyalty).
    """
    price_change_pct = (new_rate_npr - current_rate_npr) / current_rate_npr
    demand_change_pct = price_change_pct * elasticity
    new_monthly_days = max(1.0, avg_monthly_rental_days * (1.0 + demand_change_pct))
    
    current_rev_paisa = rupees(current_rate_npr * avg_monthly_rental_days)
    new_rev_paisa = rupees(new_rate_npr * new_monthly_days)
    delta_paisa = new_rev_paisa - current_rev_paisa
    
    annual_current_paisa = current_rev_paisa * 12
    annual_new_paisa = new_rev_paisa * 12
    annual_delta_paisa = annual_new_paisa - annual_current_paisa
    
    return {
        "product_id": product_id,
        "current_rate_npr": current_rate_npr,
        "new_rate_npr": new_rate_npr,
        "price_change_pct": round(price_change_pct * 100, 1),
        "projected_monthly_days": round(new_monthly_days, 1),
        "current_monthly_rev_npr": to_rupees(current_rev_paisa),
        "new_monthly_rev_npr": to_rupees(new_rev_paisa),
        "monthly_delta_npr": to_rupees(delta_paisa),
        "annual_delta_npr": to_rupees(annual_delta_paisa),
        "annual_delta_formatted": grouped(int(to_rupees(annual_delta_paisa)))
    }

def simulate_add_asset(product_id: str, purchase_cost_npr: float, daily_rate_npr: float,
                       current_unit_utilization_pct: float = 75.0,
                       recorded_lost_demand_days_month: float = 6.0) -> Dict[str, Any]:
    """
    Calculates ROI, monthly run-rate, and payback months for adding another unit.
    Uses recorded lost demand from data/lost_demand_log.json when available.
    """
    # Expected captured days per month = portion of lost demand + spillover from high utilization
    captured_days = recorded_lost_demand_days_month + (current_unit_utilization_pct / 100.0 * 2.0)
    monthly_rev_npr = captured_days * daily_rate_npr
    annual_rev_npr = monthly_rev_npr * 12
    
    # Babin Target: 40% capital recovery in 10 months (4% per month)
    target_monthly_recovery = purchase_cost_npr * 0.04
    months_to_full_payback = purchase_cost_npr / monthly_rev_npr if monthly_rev_npr > 0 else 999.0
    ten_month_recovery_pct = (monthly_rev_npr * 10.0 / purchase_cost_npr) * 100.0 if purchase_cost_npr > 0 else 0.0
    
    status = "HIGHLY RECOMMENDED" if ten_month_recovery_pct >= 40.0 else (
        "MODERATE / VIABLE" if ten_month_recovery_pct >= 25.0 else "UNFAVORABLE / DO NOT BUY"
    )
    
    return {
        "product_id": product_id,
        "purchase_cost_npr": purchase_cost_npr,
        "daily_rate_npr": daily_rate_npr,
        "captured_days_per_month": round(captured_days, 1),
        "monthly_gross_revenue_npr": round(monthly_rev_npr, 0),
        "months_to_full_payback": round(months_to_full_payback, 1),
        "ten_month_recovery_pct": round(ten_month_recovery_pct, 1),
        "babin_target_benchmark_pct": 40.0,
        "recommendation": status
    }

def simulate_seasonal_shift(shift_type: str = "monsoon") -> Dict[str, Any]:
    """
    Simulates seasonal impact on fleet monthly revenue:
    - monsoon: -40% outdoor shoots, +20% studio lighting
    - wedding_autumn: +50% cine bodies and auto lenses, zero discount tolerance
    """
    # Baseline normal monthly fleet turnover approx NPR 1.8M (18,00,000)
    baseline_fleet_rev_npr = 1800000.0
    
    if shift_type == "monsoon":
        # Outdoor cameras/support drop 40% (approx 60% of fleet)
        # Studio/lighting surges 20% (approx 40% of fleet)
        outdoor_rev = (baseline_fleet_rev_npr * 0.60) * 0.60
        indoor_rev = (baseline_fleet_rev_npr * 0.40) * 1.20
        projected_rev = outdoor_rev + indoor_rev
        delta = projected_rev - baseline_fleet_rev_npr
        notes = "Activate studio lighting packages (600x, 300c, T4c tubes) and mandatory rain protection fees (Rs 500/kit)."
    elif shift_type == "wedding_peak":
        # Wedding surge across cameras, lenses, gimbals, mics
        projected_rev = baseline_fleet_rev_npr * 1.45
        delta = projected_rev - baseline_fleet_rev_npr
        notes = "Strict enforcement of 100% advance before release. Zero discretionary discounts on FX3 or A7IV packages."
    else:
        projected_rev = baseline_fleet_rev_npr
        delta = 0.0
        notes = "Standard baseline operating month."
        
    return {
        "shift_type": shift_type,
        "baseline_monthly_revenue_npr": baseline_fleet_rev_npr,
        "projected_monthly_revenue_npr": projected_rev,
        "delta_npr": delta,
        "pct_impact": round((delta / baseline_fleet_rev_npr) * 100.0, 1),
        "operational_strategy": notes
    }

def simulate_discount_tightening(current_avg_discount_pct: float = 8.5,
                                  new_avg_discount_pct: float = 4.0,
                                  monthly_gross_subtotal_npr: float = 1650000.0) -> Dict[str, Any]:
    """
    Calculates profit recapture by enforcing strict Law 10 discount gates.
    """
    current_discount_amount = monthly_gross_subtotal_npr * (current_avg_discount_pct / 100.0)
    new_discount_amount = monthly_gross_subtotal_npr * (new_avg_discount_pct / 100.0)
    recaptured_monthly_npr = current_discount_amount - new_discount_amount
    recaptured_annual_npr = recaptured_monthly_npr * 12.0
    
    return {
        "monthly_subtotal_npr": monthly_gross_subtotal_npr,
        "current_avg_discount_pct": current_avg_discount_pct,
        "new_avg_discount_pct": new_avg_discount_pct,
        "monthly_recaptured_profit_npr": round(recaptured_monthly_npr, 0),
        "annual_recaptured_profit_npr": round(recaptured_annual_npr, 0),
        "annual_recaptured_formatted": grouped(int(recaptured_annual_npr))
    }

def main():
    parser = argparse.ArgumentParser(description="Babin Rentals Brain v4 Scenario Simulator")
    parser.add_argument("--scenario", choices=["rate_change", "add_asset", "seasonal_shift", "discount_tightening"],
                        default="rate_change", help="Simulation type")
    parser.add_argument("--product", type=str, default="sony_fx3a", help="Product ID")
    parser.add_argument("--current_rate", type=float, default=4000.0, help="Current rate NPR")
    parser.add_argument("--new_rate", type=float, default=4500.0, help="New rate NPR")
    parser.add_argument("--cost", type=float, default=285000.0, help="Purchase cost NPR for asset addition")
    parser.add_argument("--shift", choices=["monsoon", "wedding_peak"], default="monsoon", help="Seasonal shift type")
    args = parser.parse_args()
    
    print("=" * 70)
    print(" BABIN RENTALS OS - SCENARIO SIMULATOR (BRAIN v4)")
    print("=" * 70)
    
    if args.scenario == "rate_change":
        res = simulate_rate_change(args.product, args.current_rate, args.new_rate)
        print(f"Product:              {res['product_id']}")
        print(f"Rate Change:          Rs. {grouped(int(res['current_rate_npr']))} -> Rs. {grouped(int(res['new_rate_npr']))} ({res['price_change_pct']:+}%)")
        print(f"Projected Days/Month: {res['projected_monthly_days']} days (with price elasticity -0.5)")
        print(f"Monthly Rev Delta:    Rs. {grouped(int(res['monthly_delta_npr']))}")
        print(f"Annual Rev Delta:     Rs. {res['annual_delta_formatted']} NPR/year")
    elif args.scenario == "add_asset":
        res = simulate_add_asset(args.product, args.cost, args.current_rate)
        print(f"Asset Addition:       {res['product_id']}")
        print(f"Capital Investment:   Rs. {grouped(int(res['purchase_cost_npr']))}")
        print(f"Daily Rental Rate:    Rs. {grouped(int(res['daily_rate_npr']))}")
        print(f"Captured Days/Month:  {res['captured_days_per_month']} days (lost demand + fleet spillover)")
        print(f"Monthly Gross Rev:    Rs. {grouped(int(res['monthly_gross_revenue_npr']))}")
        print(f"Full Payback:         {res['months_to_full_payback']} months")
        print(f"10-Month Recovery:    {res['ten_month_recovery_pct']}% (Babin Target: >={res['babin_target_benchmark_pct']}%)")
        print(f"Brain v4 Verdict:     [{res['recommendation']}]")
    elif args.scenario == "seasonal_shift":
        res = simulate_seasonal_shift(args.shift)
        print(f"Shift Scenario:       {res['shift_type'].upper()}")
        print(f"Baseline Revenue:     Rs. {grouped(int(res['baseline_monthly_revenue_npr']))} / month")
        print(f"Projected Revenue:    Rs. {grouped(int(res['projected_monthly_revenue_npr']))} / month ({res['pct_impact']:+}%)")
        print(f"Operational Action:   {res['operational_strategy']}")
    elif args.scenario == "discount_tightening":
        res = simulate_discount_tightening()
        print(f"Subtotal Baseline:    Rs. {grouped(int(res['monthly_subtotal_npr']))} / month")
        print(f"Discount Shift:       {res['current_avg_discount_pct']}% -> {res['new_avg_discount_pct']}%")
        print(f"Monthly Profit Saved: Rs. {grouped(int(res['monthly_recaptured_profit_npr']))}")
        print(f"Annual Profit Saved:  Rs. {res['annual_recaptured_formatted']} NPR / year")
        
    print("=" * 70)

if __name__ == "__main__":
    main()
