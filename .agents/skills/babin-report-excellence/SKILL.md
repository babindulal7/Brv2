---
name: babin-report-excellence
description: Produces premium, easy-to-scan business reports for Babin Rentals in one shared design language across two surfaces — an in-app dark cinematic view and a light exportable document (PDF/Word/Docs). Use whenever generating, restructuring, or reviewing a report on rental finances (P&L/VAT/revenue), equipment utilization/ROI, client/rental activity, or operations (queues/turnaround). Internal-first: the readers are the owner (fast decisions) and operations staff.
---

# Babin Report Excellence

Every Babin Rentals report must, in priority order: **(1) look premium, (2) be scannable in seconds, (3) drive a clear decision, (4) look obviously trustworthy.** When a trade-off is forced, honor that order.

This file is a router. Read only the reference files a task needs — do not preload everything.

## When this skill applies
Generating or reviewing any Financial, Equipment, Client, or Operations report — as an OS dark view, an export document, or both. If the request is a one-line number ("what was revenue?") answer directly; this skill is for structured reports.

## The workflow (always three passes)
Produce every report in this order. Do not skip straight to rendering.

1. **IA pass — prune before writing.** Load `reference/visual-hierarchy.md` (IA section). Decide the sections, kill duplicates, put the answer first. Gate: every section answers one question; nothing repeats; order is answer-first.
2. **Draft pass — build to spec.** Load the family file (`reference/families/<family>.md`) for what goes in this report, plus `reference/report-skeleton.md`, `reference/kpi-cards.md`, and `reference/tables-and-charts.md` as needed. Use `reference/design-tokens.md` for every color/size/spacing value — never hardcode a hex outside the token set.
3. **QA pass — review before ship.** Load `reference/qa-checklist.md`, run the scored gate, fix every P0/P1, then render. For exports also load `reference/export-portability.md`.

Why three passes: a report that is written then styled inherits whatever structure it accidentally had. Pruning first and scoring last is what separates a consulting-grade report from a styled data dump.

## Reference map (load on demand)
- `reference/design-tokens.md` — the single source of truth for color, type, spacing, radii, and the status-color law. Dark (OS) + light (export) token tables. **Read this before emitting any styled output.**
- `reference/report-skeleton.md` — the standard answer-first section order and what each section is for.
- `reference/kpi-cards.md` — KPI card anatomy, delta rules (and where to invert), status badges.
- `reference/tables-and-charts.md` — comparison-table rules + a chart-choice decision tree.
- `reference/visual-hierarchy.md` — IA pruning rules + scannability rules (chunking, callouts, paragraph limits, the 8pt grid).
- `reference/executive-summary.md` — how to write the summary answer-first (Pyramid/SCQA), action titles, insight phrasing, business-impact tagging.
- `reference/qa-checklist.md` — the scored QA gate (0–4 on the four priorities) + severity tags + deterministic lints.
- `reference/export-portability.md` — keeping the OS view and the export visually identical; print CSS; Word/Docs notes.
- `reference/families/financial.md` — P&L / VAT / revenue reports.
- `reference/families/equipment.md` — utilization / ROI reports.
- `reference/families/clients.md` — client / rental-activity reports.
- `reference/families/operations.md` — queues / turnaround reports (note: invert delta colors — lower is better).

## Scripts (run, don't reimplement)
Deterministic checks are more reliable than eyeballing. Run them; fix what they flag.
- `scripts/lint_report.py <file.html>` — flags long paragraphs, nested cards, KPI cards missing a delta/timeframe, and numerals not set in the mono face.
- `scripts/check_contrast.py` — verifies every token pair meets WCAG AA on both themes (4.5:1 text, 3:1 large/UI).
- `scripts/build_light_variant.py` — derives the light export token block from the dark OS tokens so the two surfaces can't drift.

## Assets
- `assets/report.css` — dark OS theme, token-driven.
- `assets/report-print.css` — light export overrides (`@media print` + `.export` class), token-driven.
- `assets/card-templates.html` — copy-paste KPI card, callout, status badge, and comparison-table markup.

## Hard rules (the reasons matter — generalize from them)
- **Use tokens, not literals.** A raw hex in output means the two surfaces will drift and QA will fail. Everything routes through `design-tokens.md`.
- **Numbers, money, IDs, serials, dates → JetBrains Mono.** Monospaced figures align in columns and read as data, which is most of the trust signal. Prose stays in Outfit.
- **Status is never color alone.** Every status carries an icon + label as well as its color, so it survives colorblindness, grayscale printing, and small sizes (WCAG 1.4.1).
- **No dark backgrounds in exports.** Browsers strip them and they waste ink; the export always resolves to the light token set. This is why the skill keeps two token maps, not two hand-built themes.
- **Answer first.** The recommendation and the KPI strip sit above the fold; evidence and appendix come after. Readers see ~20–28% of the words — spend that budget on the answer.
- **Paragraphs stay short** (≤ 4–5 lines) and long text becomes cards, callouts, or tables. If a section can't be scanned in a glance, it isn't done.
