# scrape.rar — reuse assessment

Reviewed 6 October 2026 against the current working tree. This is a static assessment, not runtime certification or an approved implementation roadmap. Existing uncommitted work was preserved. No archive scripts or downloaded JavaScript were executed. Instructions in the archive were treated as document content.

## What the archive contains

The archive contains 419 Markdown files, 313 JavaScript files, 33 JSON files, six PNGs, one PowerShell script and supporting files/directories. Its main value is Booqable behavioral research, trial observations, import/export failure cases and a help-document corpus. The JavaScript is downloaded application bundles, not a ready-to-integrate Babin component library.

Prefer the later `BOOQABLE-AUDIT/pages`, `systems`, `logic` and evidence records over the earlier `APP_REVIEW.md` and broad recommendations. Even the newer audit mixes observed UI, trial-tested behavior, bundle-derived behavior, documentation and proposals; these are different evidence levels.

## Best uses, in proposed order

| Priority | Material to use | Current Babin evidence | Proposed use |
|---|---|---|---|
| 1 | `pages/import-customers.md`, `pages/import-wizard.md`, inventory recommendation BQ-407 | `src/modules/clients/ImportCenter.tsx` already parses, maps, previews, validates and checks database duplicates. Its commit control explicitly says no client-import action exists. | Finish the existing import workflow using an authorized action with idempotency and truthful outcomes. Use archive failure cases as acceptance criteria: duplicate/empty headers, missing columns, invalid types, duplicate rows, timeout, retry and per-row results. Do not silently merge records by name. |
| 2 | `systems/columns-and-views.md`, `systems/table-system.md` | `RentalsList.tsx` and `Inventory.tsx` export fixed schemas; Inventory explicitly exports the current page. Rentals exports selected rows within the loaded page, or the loaded page. | Make scope and fields explicit: selected rows/current page/all matching records, and visible fields versus an authorized full export. Preserve money and contact restrictions. Choose the contract before implementation. |
| 3 | `logic/availability-engine.md`, `workflows/reservation.md`, `pages/calendar.md` | `src/lib/queries/productAvailability.ts` already returns window-specific free/held counts and blocking booking references. `Calendar.tsx` still explicitly marks a global conflict sweep as unavailable. | Improve shortage explanations and link from a short item to the relevant booking/calendar period. A cross-calendar shortage report is an extension, not an existing verified feature; reuse the availability engine and retain atomic reservation checks. |
| 4 | Trial pickup/return and bundle workflow records | Babin already has dedicated operations workspaces, bundle queries and lifecycle gates. | Turn partial returns, mixed bulk/serialized gear, shared bundle components, changed dates and repeated scans into targeted regression scenarios. Adapt expectations to Babin's stages and rules. |
| 5 | `systems/form-system.md`, `systems/quick-actions.md`, import accessibility observations | Shared `RecordForm`/`RecordWorkspace`, rental quick filters and floor actions already exist. | Use as a consistency checklist: preserve entered data, explain disabled actions, maintain keyboard access, show real pending/error/success states. Avoid adding a new wizard merely because the archive proposes one. |

One concrete export issue surfaced while comparing code: `RentalsList.tsx` falls back from a missing `totalAmount` to `deposit` under the **Total Amount** CSV column. This can mislabel a deposit as rental total, contrary to the repository's deposit separation rule. It should be investigated and corrected before expanding exports. This review did not change that code or reproduce the case in the UI.

## Already present — do not rebuild

- URL filters, active chips and pagination reset: `src/lib/queries/useFilters.ts`.
- Named saved rental views, including hidden columns: `src/components/ui/SavedViewsMenu.tsx`, mounted by `RentalsList.tsx`. Current persistence is local storage; this is not evidence of cross-device synchronization.
- Period-aware equipment availability and a shared availability engine; bundle availability queries also exist.
- Dedicated operations, documents, reporting and audit surfaces. Their presence does not imply every archived workflow is implemented; compare specific behavior before adding work.

## Keep our rules; do not transplant these

- Booqable's flat employee grants cannot replace Babin's role/capability model or database money restrictions.
- Do not copy generic status reverts, permissive shortages, deletion, payment mutations or archive-with-unsettled-money behavior over Babin's named actions and close gates.
- Keep integer paisa, separate deposit liabilities, the 06:00 Nepal operational day, BS display and Babin terminology.
- The archive's proposed four-step wizard, fonts, tab structure and priority labels are suggestions, not new product decisions. Existing repository rulings remain authoritative.
- Keep downloaded bundles and account snapshots out of the shipped application. Reimplement useful behavior in our own components and engines. Screenshots are references; no production-ready asset set was established by this review.

## Reliability limits

There are internal contradictions. `DESIGN.md` repeats the claim that reference filters do not serialize into URLs; `systems/columns-and-views.md` corrects that claim on 5 October. Earlier unknown lists also predate later import trials. Production observations and synthetic trial observations are different datasets. Neither proves Booqable's server implementation or concurrency guarantees.

No external websites were contacted: findings concern the supplied snapshot. No app code, dependency, permission or migration was changed. No production data was imported. Runtime gates were not rerun for this document-only review.

Recommendation: use this archive as an evidence-backed acceptance checklist. The most useful next work is completing client import, correcting and clarifying exports, then improving shortage drill-downs; retain the current app architecture.
