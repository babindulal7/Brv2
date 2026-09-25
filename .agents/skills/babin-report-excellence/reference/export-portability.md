# Export Portability — one design, two surfaces

The OS view (dark) and the export (light PDF/Word/Docs) must be unmistakably the same report. They stay in sync because both resolve the **same semantic token names** to different values — never hand-build two themes.

## The mechanism
- OS view: `:root` resolves tokens to the dark set (design-tokens.md §2 dark).
- Export: add class `export` to the root element (or trigger `@media print`); tokens resolve to the light set.
- Both link `assets/report.css`; the export additionally applies `assets/report-print.css`.
- Regenerate the light token block with `scripts/build_light_variant.py` so it can't drift from the dark set.

## Why the export is light (not dark)
Browsers strip background colors/images when printing to save ink, so a #050B12 export would either waste ink or be force-stripped to unreadable light-on-white. The light token set is the correct, portable form. Keep the same type scale, spacing grid, radii, and status hues (slightly darkened) so it still reads as Babin.

## Print CSS essentials (`report-print.css`)
- Override surfaces to white/near-white and text to near-black via the light tokens.
- Cards: replace surface-tier elevation with a 1px `--border-subtle`.
- Status pills/badges and chart fills: keep color with `print-color-adjust: exact` (and `-webkit-print-color-adjust: exact`) — but only on those small elements, not full backgrounds.
- Repeat table headers: `thead { display: table-header-group; }`.
- Avoid page breaks inside a card/table row: `break-inside: avoid;`.
- Set page margins with `@page { margin: 16mm; }`.

## Word / Google Docs notes
When the export target is Word/Docs rather than PDF:
- Use bordered paragraph styles or a 1×1 table for callouts — **not** floating text boxes (screen readers and reflow lose them).
- Keep KPI "cards" as bordered table cells so they survive reflow and stay in reading order.
- Map the type scale to real paragraph styles (H1/H2/Body) so the document outline works.
- Numbers stay in a mono font (JetBrains Mono if embeddable, else a mono fallback).

## Consistency check before shipping an export
- Same section order, same headings, same numbers as the OS view.
- Status colors present and labeled (not stripped to gray).
- Contrast passes on the light theme (`check_contrast.py`).
- Table headers repeat; nothing breaks mid-card.
