# KPI Cards & Status Badges

A KPI card turns a sentence into a scannable unit. Replace "Revenue increased 12%" with a card the owner reads in under a second.

## Card anatomy (fixed order, top to bottom)
1. **Label** — mono, uppercase, `--text-muted`. e.g. `REVENUE`.
2. **Value** — big, mono, `--text-primary`. e.g. `NPR 2.4M`.
3. **Delta chip** — arrow + change + basis. e.g. `▲ 12% MoM`. Colored by the delta rule below.
4. **Context line** — benchmark/target + freshness, `--text-secondary`. e.g. `vs 8% target · updated 08:35`.
5. **Optional sparkline** — trend shape, no axis.
6. **Optional impact tag** — `High / Medium / Low` business impact, as a small pill.

Every card must have at least Label, Value, Delta, and a timeframe. A card without a delta or timeframe fails QA (`lint_report.py` flags it).

## Delta colour rule
- Default: increase = `--status-success` (green), decrease = `--status-critical` (red).
- **Invert** when lower is better: turnaround time, cost per rental, overdue days, damage rate, days-to-pay. Down = green, up = red.
- The operations family (`families/operations.md`) is mostly inverted — read that file's note.
- Always pair the arrow with the sign; never rely on color alone.

## Card markup
Copy from `assets/card-templates.html`. Structure:
```
<div class="kpi">
  <div class="kpi-label">REVENUE</div>
  <div class="kpi-value">NPR 2.4M</div>
  <div class="kpi-delta kpi-up">▲ 12% MoM</div>
  <div class="kpi-context">vs 8% target · updated 08:35</div>
</div>
```
`.kpi-up` / `.kpi-down` map to the delta colors; use `.kpi-good` / `.kpi-bad` on inverted metrics so the class names stay honest.

## KPI strip
3–5 cards across the top of the report. More than 5 headline numbers is not a headline — tier the rest into the Evidence tables. Keep card widths equal and on the 8pt grid.

## Status badges
A pill = color (from the status law) + icon + label.
```
<span class="badge badge-critical"><svg .../> Overdue</span>
```
- Fill is a soft tint of the status hue; text/icon is a readable tint of the same hue.
- On the light export the tint darkens so the label still clears AA.
- Never a bare colored dot with no label.

## Turning prose into cards — checklist
For each key number in the draft: does it have a comparison (target/prior/benchmark)? a timeframe? a direction? a unit? If yes to all, it should be a card, not a sentence.
