# Report Skeleton — answer-first structure

The standard order. It is MECE (no gaps, no overlap) and answer-first: the recommendation and headline numbers sit above the fold so the owner gets the answer before the evidence.

## Standard section order
1. **Executive Summary** — overall status line + the one recommendation + read-time. (See executive-summary.md.)
2. **Key Metrics** — a KPI card strip (3–5 headline numbers). (See kpi-cards.md.)
3. **Situation** — what this report covers and the period, in 2–3 lines.
4. **Evidence** — the tables/charts the analysis rests on. (See tables-and-charts.md.)
5. **Analysis** — what the evidence means; one idea per subsection.
6. **Insights** — the non-obvious "so what," phrased as findings not topics.
7. **Opportunities** — where money/time can be gained.
8. **Risks** — what could go wrong, each with a severity.
9. **Action Plan** — each action names: owner, resource needed, expected impact, and the metric that proves it worked.
10. **Timeline** — when the actions land (only if there are ≥3 dated actions; otherwise fold into Action Plan).
11. **Appendix** — raw tables, definitions, method. Everything a reader can skip.

## Rules
- Sections 1–2 are mandatory and must fit on the first screen / first page.
- A section that would answer more than one question gets split; two sections answering the same question get merged (do this in the IA pass).
- Timeline, Risks (as a matrix), and process/flow diagrams are **section types**, not separate documents — build them inline using the components in tables-and-charts.md and kpi-cards.md.
- Drop any section with nothing to say. An empty "Risks: none identified" is fine; a padded one is not.

## Section templates
**Executive Summary block** — status pill + one-sentence recommendation + 3–5 top findings as a tight list + read-time.

**Action Plan row** — `Action · Owner · Resource · Expected impact (with number) · Proof metric`. Render as a comparison table.

**Risk item** — `Risk · Likelihood · Impact · Mitigation`, colored by the status law (attention/critical). A 2×2 likelihood×impact matrix is the premium form when there are ≥4 risks.
