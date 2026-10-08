# Visual Hierarchy — IA pruning + scannability

Two jobs: decide what goes in (IA), then make what's in scannable.

## Part A — Information Architecture pass (run BEFORE writing)
Readers see ~20–28% of the words, so every section must earn its place. For each candidate section ask:
1. **Necessary?** If removing it loses nothing the owner acts on, cut it.
2. **Mergeable?** Two sections answering the same question become one.
3. **One question?** A section answering two questions gets split.
4. **Duplicated?** The same fact stated twice — keep the stronger instance.
5. **Ordered answer-first?** Recommendation and headline numbers lead; method and raw data trail.

Exit the IA pass only when every section answers exactly one question, nothing repeats, and the order is answer-first. This is the "prune before you polish" gate.

## Part B — Scannability rules (apply while writing)
- **F-pattern:** front-load the point of each section in its first line and each paragraph in its first few words; put keywords early.
- **Chunk:** break long text into cards, callouts, bullets, or tables. No wall of prose.
- **Paragraph limit:** ≤ 4–5 lines. Longer = split or convert to a list. (`lint_report.py` flags long ones.)
- **Meaningful subheadings:** a subheading states the finding, not the topic ("Utilization fell on lighting gear," not "Lighting").
- **Callouts** for the must-not-miss stat: 1–2 sentences, bordered, near the relevant text. In Word/Docs use a bordered paragraph or a 1×1 table, not a floating text box (screen readers lose floating boxes).
- **Highlight keywords/numbers** with weight or the brand accent — sparingly, so highlights stay meaningful.
- **Progressive disclosure inside the doc:** summary → detail → appendix. Detail a reader can skip goes later or into the appendix.

## Part C — Spacing & rhythm
- 8pt spacing grid (4/8/12/16/24/32/48). Consistent gaps between cards and sections read as "designed."
- One type scale (design-tokens.md); don't invent sizes.
- Cards get equal internal padding (16 or 24). Section gaps are larger than card gaps so the eye groups correctly.
- Elevation via surface tiers on dark, via 1px borders on light — never both, never shadows in the export.
