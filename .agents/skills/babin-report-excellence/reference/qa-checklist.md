# Report QA — the review-before-ship gate

Run this after the draft, before rendering/exporting. Two tracks: a deterministic lint (scripts) and a scored critique (judgment). Nothing ships with an open P0 or P1.

## Track 1 — deterministic lint (run the scripts)
- `python scripts/lint_report.py <file.html>` — fails on: paragraphs over ~5 lines, nested cards, KPI cards missing a delta or timeframe, numerals not in the mono face, raw hex colors outside the token set.
- `python scripts/check_contrast.py` — fails any token text/surface pair under AA (4.5:1 text, 3:1 large/UI) on either theme.
Fix everything these flag before scoring. These are P0/P1 by definition.

## Track 2 — scored critique (score each 0–4)
Score the report on the four priorities, in priority order. 4 = premium/exemplary, 3 = solid, 2 = usable with issues, 1 = weak, 0 = failing.
1. **Visual polish** — consistent tokens, spacing rhythm, no slop (misaligned cards, orphan headings, clashing hues, default-looking tables).
2. **Scannability** — can the owner find each headline answer in under ~10 seconds? F-pattern respected, chunked, short paragraphs, KPI strip present.
3. **Decision clarity** — is there one clear recommendation and an action plan with owner/impact/metric?
4. **Data trust** — numbers in mono, sources/period stated, deltas have a basis, no unsupported "high impact" claims.

Any dimension scoring ≤ 2 produces findings. Target: no dimension below 3, visual polish and scannability at 4.

## Severity tags
- **P0 — blocks release:** fails a lint, AA contrast failure, wrong/unsupported number, missing recommendation.
- **P1 — fix before ship:** no KPI strip, walls of prose, color-only status, exec summary that doesn't stand alone.
- **P2 — should fix:** weak subheadings (topics not findings), chart with no takeaway title, uneven spacing.
- **P3 — polish:** nicer sparkline, tighter wording.

Output of the pass: "what's working" + the **top 3–5 fixes** ranked by severity. Fix P0/P1, re-run track 1, then render.

## Track 3 — fresh-reader test (when possible)
Predict the 5–10 questions the owner/ops reader will ask this report. Answer each using only the draft — no outside context. If any answer is ambiguous, missing, or contradicted, that's a P1. On a runtime with sub-agents, hand the draft + one question to a fresh context and check its answers; on plain chat, do it in a clean pass. Ship when a cold read answers every question correctly and raises no new gap.
