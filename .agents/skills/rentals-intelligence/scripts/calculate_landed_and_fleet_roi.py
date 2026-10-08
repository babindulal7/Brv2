#!/usr/bin/env python3
"""
calculate_landed_and_fleet_roi.py
Babin Rentals OS - Enterprise Procurement, Fleet ROI, and Maintenance Decision Engine
Synthesizes Nepal Customs 2026-27 tariffs, Landed Cost models, Fleet payback formulas,
Repair ratio thresholds, and IATA battery flight compliance.
"""

import sys
import json
from pathlib import Path

# Paths
DATA_DIR = Path(__file__).parent.parent / "data"
REGISTRY_FILE = DATA_DIR / "nepal_market_registry.json"

# Default Exchange Rates (NPR per FX unit)
FX_RATES = {
    "USD": 136.50,
    "EUR": 147.20,
    "GBP": 174.80,
    "INR": 1.6015,
    "NPR": 1.00
}

def load_market_registry():
    if not REGISTRY_FILE.exists():
        raise FileNotFoundError(f"Registry not found: {REGISTRY_FILE}")
    with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def calculate_landed_cost(
    foreign_price: float,
    currency: str,
    category_key: str,
    intl_freight_usd: float = 120.0,
    transit_insurance_pct: float = 0.8,
    fx_buffer_pct: float = 1.5,
    warranty_risk_pct: float = 5.0,
    local_clearing_npr: float = 8500.0
) -> dict:
    """
    Computes full landed acquisition cost in NPR following Nepal Dept of Customs guidelines.
    """
    registry = load_market_registry()
    tariffs = registry.get("customs_tariffs_2026_27", {})
    
    if category_key not in tariffs:
        raise ValueError(f"Unknown tariff category: {category_key}. Available: {list(tariffs.keys())}")
    
    cat = tariffs[category_key]
    duty_pct = cat["customs_duty_pct"]
    vat_pct = cat["vat_pct"]
    
    rate = FX_RATES.get(currency.upper())
    if not rate:
        raise ValueError(f"Unsupported currency: {currency}")
    
    # 1. FOB in NPR with FX buffer
    fob_foreign = foreign_price
    effective_fx = rate * (1.0 + (fx_buffer_pct / 100.0))
    fob_npr = round(fob_foreign * effective_fx)
    
    # 2. Freight & Transit Insurance
    freight_npr = round(intl_freight_usd * FX_RATES["USD"])
    insurance_npr = round(fob_npr * (transit_insurance_pct / 100.0))
    
    # 3. Assessable CIF Value
    cif_npr = fob_npr + freight_npr + insurance_npr
    
    # 4. Customs Duty
    duty_npr = round(cif_npr * (duty_pct / 100.0))
    
    # 5. Taxable Base & VAT (13%)
    taxable_base = cif_npr + duty_npr
    vat_npr = round(taxable_base * (vat_pct / 100.0))
    
    # 6. Local Handling & Risk Reserve
    risk_reserve_npr = round(fob_npr * (warranty_risk_pct / 100.0))
    
    # 7. Total Landed Cost
    total_landed_npr = cif_npr + duty_npr + vat_npr + local_clearing_npr + risk_reserve_npr
    
    effective_multiplier = round(total_landed_npr / fob_npr, 4) if fob_npr > 0 else 1.0
    
    return {
        "currency": currency.upper(),
        "foreign_fob": foreign_price,
        "fob_npr": fob_npr,
        "cif_npr": cif_npr,
        "customs_duty_npr": duty_npr,
        "vat_npr": vat_npr,
        "local_clearing_npr": local_clearing_npr,
        "warranty_risk_npr": risk_reserve_npr,
        "total_landed_npr": total_landed_npr,
        "effective_multiplier": effective_multiplier,
        "hs_code": cat["hs_code"]
    }

def calculate_fleet_roi(
    landed_cost_npr: float,
    daily_rate_npr: float,
    expected_days_per_month: float,
    direct_expense_pct: float = 8.0
) -> dict:
    """
    Computes asset payback period and 10-month investment recovery.
    Babin benchmark: ~4% recovery/month, 40% in 10 months.
    """
    monthly_gross_npr = daily_rate_npr * expected_days_per_month
    direct_expense_npr = round(monthly_gross_npr * (direct_expense_pct / 100.0))
    monthly_contribution_npr = monthly_gross_npr - direct_expense_npr
    
    if monthly_contribution_npr <= 0:
        payback_months = 999.0
        monthly_velocity_pct = 0.0
        recovery_10m_pct = 0.0
    else:
        payback_months = round(landed_cost_npr / monthly_contribution_npr, 1)
        monthly_velocity_pct = round((monthly_contribution_npr / landed_cost_npr) * 100.0, 2)
        recovery_10m_pct = round(monthly_velocity_pct * 10.0, 1)
        
    meets_target = recovery_10m_pct >= 40.0
    
    return {
        "landed_cost_npr": landed_cost_npr,
        "daily_rate_npr": daily_rate_npr,
        "expected_days_per_month": expected_days_per_month,
        "monthly_gross_npr": monthly_gross_npr,
        "monthly_contribution_npr": monthly_contribution_npr,
        "monthly_velocity_pct": monthly_velocity_pct,
        "payback_months": payback_months,
        "recovery_10m_pct": recovery_10m_pct,
        "meets_babin_target": meets_target
    }

def evaluate_procurement_action(
    product_name: str,
    lost_demand_count_90d: int,
    current_utilization_pct: float,
    current_failure_rate_pct: float,
    landed_cost_npr: float,
    daily_rate_npr: float
) -> dict:
    """
    Evaluates whether to BUY SECOND UNIT, HOLD, or SELL/REPOSITION.
    """
    # Thresholds from research
    # Buy second unit: lost_demand >= 5, utilization >= 70%, failure < 10%
    if lost_demand_count_90d >= 5 and current_utilization_pct >= 68.0 and current_failure_rate_pct < 10.0:
        recommendation = "BUY_SECOND_UNIT"
        confidence = "HIGH"
        reason = f"High lost demand ({lost_demand_count_90d} in 90d) and capacity bottleneck ({current_utilization_pct}% util). Incremental unit will capture trapped revenue."
    elif current_utilization_pct < 20.0 and lost_demand_count_90d == 0:
        recommendation = "SELL_OR_REPOSITION"
        confidence = "MEDIUM"
        reason = f"Chronic low utilization ({current_utilization_pct}%) and zero lost demand. Asset represents trapped capital."
    else:
        recommendation = "HOLD_CURRENT_FLEET"
        confidence = "HIGH"
        reason = f"Fleet utilization is balanced ({current_utilization_pct}%) with manageable lost inquiries ({lost_demand_count_90d})."
        
    roi = calculate_fleet_roi(landed_cost_npr, daily_rate_npr, expected_days_per_month=12.0)
    
    return {
        "product_name": product_name,
        "recommendation": recommendation,
        "confidence": confidence,
        "reason": reason,
        "roi_projection": roi
    }

def evaluate_repair_action(
    defect_class: str,
    repair_quote_npr: float,
    replacement_value_npr: float
) -> dict:
    """
    Evaluates repair quote against replacement value using threshold matrix.
    """
    registry = load_market_registry()
    matrix = registry.get("repair_ratio_thresholds", {})
    
    if defect_class not in matrix:
        raise ValueError(f"Unknown defect class: {defect_class}. Available: {list(matrix.keys())}")
        
    rule = matrix[defect_class]
    ratio_pct = round((repair_quote_npr / replacement_value_npr) * 100.0, 1)
    
    if defect_class == "swollen_battery":
        action = "IMMEDIATE_DESTRUCTION_RETIRE"
        approved = False
        notes = "Swollen or physically compromised lithium batteries must never be repaired or re-rented. Severe fire hazard."
    elif ratio_pct > rule["max_pct"]:
        action = "WRITE_OFF_OR_NEGOTIATE"
        approved = False
        notes = f"Repair cost ({ratio_pct}%) exceeds standard threshold ({rule['max_pct']}% of replacement value). Consider writing down or replacing."
    else:
        action = rule["default_action"]
        approved = True
        notes = f"Repair cost ({ratio_pct}%) is within acceptable policy ceiling ({rule['max_pct']}%)."
        
    return {
        "defect_class": defect_class,
        "repair_quote_npr": repair_quote_npr,
        "replacement_value_npr": replacement_value_npr,
        "repair_ratio_pct": ratio_pct,
        "policy_max_pct": rule["max_pct"],
        "recommended_action": action,
        "approved": approved,
        "notes": notes
    }

def check_iata_battery_compliance(wh_rating: float, quantity: int, is_carry_on: bool) -> dict:
    """
    Verifies flight compliance for cinema batteries under IATA DGR rules.
    """
    if not is_carry_on:
        return {
            "compliant": False,
            "error": "IATA Hard Violation: Lithium batteries are strictly prohibited in checked baggage. Must be carried in passenger carry-on."
        }
        
    if wh_rating <= 100.0:
        compliant = quantity <= 20
        error = None if compliant else f"Exceeds max passenger limit of 20 units for <=100Wh packs (requested: {quantity})."
        tier = "Category 1 (<=100Wh)"
        notes = "Permitted in passenger carry-on without airline approval. Terminals must be taped."
    elif 100.0 < wh_rating <= 160.0:
        compliant = quantity <= 2
        error = None if compliant else f"Exceeds max passenger limit of 2 units for 101-160Wh packs (requested: {quantity})."
        tier = "Category 2 (101-160Wh)"
        notes = "Permitted in passenger carry-on only with mandatory airline operator prior approval."
    else:
        compliant = False
        error = f"Packs > 160Wh ({wh_rating}Wh) are strictly forbidden on passenger aircraft. Must ship via Cargo Aircraft Only (UN3480 Class 9)."
        tier = "Category 3 (>160Wh)"
        notes = "Requires dangerous goods cargo booking."
        
    return {
        "wh_rating": wh_rating,
        "quantity": quantity,
        "is_carry_on": is_carry_on,
        "tier": tier,
        "compliant": compliant,
        "error": error,
        "notes": notes
    }

if __name__ == "__main__":
    print("Testing calculate_landed_and_fleet_roi.py...")
    # Test Landed Cost for FX3
    cost = calculate_landed_cost(3899.0, "USD", "camera_body_digital")
    print(f"FX3 USD 3,899 -> Landed NPR: {cost['total_landed_npr']:,} (x{cost['effective_multiplier']})")
    
    # Test Fleet ROI
    roi = calculate_fleet_roi(cost['total_landed_npr'], 4500.0, 14.0)
    print(f"FX3 ROI: Monthly Velocity={roi['monthly_velocity_pct']}%, Payback={roi['payback_months']} mo, 10-Mo={roi['recovery_10m_pct']}%")
    
    # Test Procurement Evaluation
    rec = evaluate_procurement_action("DJI RS4 Pro", lost_demand_count_90d=6, current_utilization_pct=72.0, current_failure_rate_pct=2.0, landed_cost_npr=165000, daily_rate_npr=2500)
    print(f"RS4 Pro Action: {rec['recommendation']} ({rec['reason']})")
    
    # Test Repair Evaluation
    rep = evaluate_repair_action("cables_and_plates", 1500, 25000)
    print(f"Repair: {rep['recommended_action']} (Ratio: {rep['repair_ratio_pct']}%)")
    
    # Test IATA Compliance
    iata = check_iata_battery_compliance(99.0, 4, is_carry_on=True)
    print(f"IATA 99Wh x4: Compliant={iata['compliant']}")
