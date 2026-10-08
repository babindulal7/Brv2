# Family: Operations (queues / turnaround)

## Question this report answers
"Is the warehouse flowing, where are the bottlenecks, and what's overdue?"

## NOTE — invert the delta colors here
Most operations metrics are "lower is better": turnaround time, reset backlog, overdue count, delayed prep, not-reset-at-pickup. Down = green, up = red. Apply the inverted rule from kpi-cards.md throughout this family.

## KPI strip (pick 3–5)
Avg turnaround time (Δ, lower better) · Overdue returns (count) · Reset backlog · On-time pickup % · Maintenance items blocking availability.

## Sections that matter
- Queue health: the 5 queues (Packing · Pickup · Return · Reset & Cleaning · Maintenance) with counts and aging; oldest item per queue.
- Turnaround: pickup→return→reset cycle time by asset/category; slowest flagged.
- Exceptions over charts: overdue returns, missing items, damage cases, not-reset-at-pickup — surface the exceptions, not vanity totals.
- Bottleneck: where items pile up (e.g. Reset backlog) and the capacity fix.
- Late/overdue: overdue rentals with client and days-late in `--status-critical`.

## Trust rules
- State the rental-day convention (6AM→6AM) and the late-fee grace (30 min per return event) where late fees appear.
- Late fees are suggested, applied manually — report suggested vs applied, don't imply auto-charge.
- Maintenance blocks availability — count blocked items, don't double-count as merely "idle."

## Delta direction
On-time %, throughput: up = good. Turnaround, backlog, overdue, downtime: lower = better (invert — the default here).
