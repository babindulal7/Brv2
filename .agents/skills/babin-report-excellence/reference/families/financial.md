# Family: Financial (P&L / VAT / revenue)

## Question this report answers
"Are we making money, where is it coming from, and what do we owe/collect?"

## KPI strip (pick 3–5)
Revenue (Δ MoM vs target) · Net profit / margin · Outstanding receivables (overdue split) · VAT payable this period · Cash collected vs invoiced.

## Sections that matter
- Executive summary: profit status + the one financial action (e.g. "collect NPR 180k overdue from 4 clients").
- Revenue mix: by category (Cameras/Lenses/Lighting/Grip/Power) and by client — a ranked bar; flag concentration.
- P&L: revenue − expenses (8 category groups) → net; a clean comparison table, this period vs last.
- VAT: 13% collected vs payable; keep VAT-exclusive figures explicit (pricing engine is VAT 13% exclusive).
- Receivables: aging buckets (0–30 / 31–60 / 60+), each client, overdue in `--status-critical`.

## Trust rules specific to finance
- Every figure NPR, mono, right-aligned; VAT shown as its own line, never baked silently into a total.
- Deposits are tracked separately (flat, refundable) — never counted as revenue or advance.
- State the period and the Bikram Sambat + Gregorian date range.
- Reconcile: cash collected should tie to payments (cash/bank/wallet); note any gap.

## Delta direction
Revenue/profit/margin: up = good. Overdue days, cost ratios, VAT-as-%-of-revenue anomalies: lower = better (invert).
