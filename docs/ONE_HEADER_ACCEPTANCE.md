# One-header acceptance — 12 October 2026

Scope: the shared shell and Rentals first pass requested in the user's 9 October acceptance plan. This document does not certify the whole application.

## Implemented

- One visible application header; page action ownership suppresses fallback Add.
- Shared PageHeader registers metadata without a context update loop and releases it on navigation.
- 64px header at every width; 44px button targets; phone notes in profile.
- Rentals New Rental primary; Fast Return and Record Payment only in More; phone Filters in More; one phone Search; no placeholder duplication action.
- Search clear keeps the search available; Escape closes and returns focus. More supports keyboard dismissal and focus return.

## Browser evidence

Local mock preview from the main checkout, Owner and Warehouse. No live writes.

- Rentals: 1440, 1280, 1024, 390 and 320px; 64px header, one creation action, no header cutoffs or page overflow, no button below 44px.
- Additional 1152, 1024, 819, 312 and 256px effective-width checks represent the reflow pressure of 125% zoom. These are **not native browser zoom tests**.
- New Rental: the same five nominal widths; Confirm/Save controls replace Add; no cutoffs or page overflow.
- Phone Filters narrows 120 demo rentals to 18 Quotes. Search within Quotes narrows to one matching project. Clear and Escape retain usable focus. More stays inside the viewport and restores focus after Escape.
- Today → Rentals and Rentals → New Rental → Today navigation checked after the registration-loop fix.
- Warehouse has no Record Payment menu item or rendered rental figures. This is UI evidence only; staging JWT/PostgREST verification remains required.

Screenshots, measurements and gate logs: `artifacts/one-header-2026-10-12/`.

## Engineering evidence

- Clean dependency install completed. The installer reported 13 dependency vulnerabilities; review those before deployment.
- Typecheck and full source lint passed.
- Final full suite: 337 files, 4,294 tests passed with two workers. An earlier four-worker run timed out in PWA installation and smart-hover tests; both passed in isolation and in the final full run.
- Local migration rebuild: 160/160 applied, zero failures; view/RPC exposure and definer hygiene gates passed.
- Local lifecycle: 30/30 green. These checks do not exercise staging JWTs or PostgREST.
- Shell lint: 649 files passed. Theme contrast: 54/54 passed.
- Final production build passed, including the 298-entry offline cache.

## Remaining acceptance work

1. Consolidate selected-row operations into the common page action registry without losing working callbacks.
2. Resolve pagination placement page by page before changing the unused toolbar pagination prop.
3. Follow the requested page order: New Rental/Detail; floor lifecycle; Today; Calendar; Inventory/Bundles; Clients; Finance; Documents; Crew/Delivery; Reports/Settings/Tools. Existing implementations are not automatically accepted by this shell pass.
4. Review Today and other legacy action clusters at narrow widths, including contextual phone search. This first pass does not certify those clusters.
5. Native browser 100%/125% zoom and the full requested role matrix, persistent writes/reload, double-submit guards and menu interactions for every module.
6. Staging clone migration state, JWT/PostgREST permission checks, anon exposure, conflicts, invoices and audit integrity. No live migration or wipe is authorized by this work.
