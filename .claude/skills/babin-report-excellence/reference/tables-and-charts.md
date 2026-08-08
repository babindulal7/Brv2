# Tables & Charts

## Comparison tables
Tables are the trust backbone — they must read as clean data.
- Numbers in `--font-mono`, right-aligned; labels in `--font-ui`, left-aligned.
- Right-align and decimal-align currency; show the unit once (in the header), not per cell.
- Zebra striping via `--surface-raised` on dark / `--surface-sunken` on light — subtle, not loud.
- Header row: `--text-muted`, uppercase, mono; repeat it on every printed page (`thead{display:table-header-group}`).
- Highlight the row or cell that matters (the total, the outlier) with weight or the brand accent — one highlight per table, not ten.
- A "vs" table (this period | last period | Δ) beats two separate tables. Put the Δ column in delta colors.
- Cap width so no column wraps awkwardly; if a table needs >7 columns, it's probably two tables.

## Chart-choice decision tree
Ask "what decision follows from this chart?" then pick the simplest form.
- **Trend over time** → line chart. (Revenue by month, utilization over weeks.)
- **Compare categories** → bar (horizontal if labels are long) or column. Use column for a short time series (≤ ~20 bars).
- **Part of a whole** → donut/pie **only with 2–6 slices**; otherwise a ranked bar. (Expense mix, revenue by category.)
- **Relationship between two measures** → scatter. (Rental price vs utilization.)
- **Distribution** → histogram. (Rental durations, days-to-pay.)
- **Single number vs target** → a KPI card with a sparkline, not a chart.
- **Ranking** → sorted horizontal bars, highest at top.

## Chart styling
- Colors come from the status law / accents; never introduce a new hue.
- One accent per series; mute the rest. Label directly on the line/bar where possible instead of a legend.
- No 3D, no heavy gridlines, no drop shadows. Axis labels in `--text-muted`.
- On the light export, chart fills need `print-color-adjust: exact` or they get stripped — keep fills essential and few.
- Always give a chart a one-line takeaway title (the finding, not "Revenue chart").
