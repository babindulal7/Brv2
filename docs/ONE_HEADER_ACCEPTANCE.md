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
4. Today contextual phone search and actions received a scoped follow-up on 13 October (see below). Other legacy action clusters still need review. The 768px title truncation was resolved and visually verified on 14 October.
5. Native browser 100%/125% zoom and the full requested role matrix, persistent writes/reload, double-submit guards and menu interactions for every module.
6. Staging clone migration state, JWT/PostgREST permission checks, anon exposure, conflicts, invoices and audit integrity. No live migration or wipe is authorized by this work.

## Today follow-up — 13 October 2026

- Phone search uses the page's actual query; Clear stays open/focused, Escape preserves the query and returns focus to the trigger. More holds Operations and Refresh movements.
- Dispatch date sits beside the queues. Tomorrow → date picker → Today restored the selected day without switching the dashboard layout. Refresh updated the visible freshness timestamp and closed More.
- Cards wrap client names and separate pickup/return dates below 1280px; floor primary actions measure 56px. Phone freshness remains visible.
- Local mock Owner screenshots at 320, 390, 768, 1024, 1280 and 1440px; no document horizontal overflow and 64px headers. At 320px all visible header controls measured at least 44px. Light and dark were inspected across this set, not every theme/width permutation.
- Evidence: `artifacts/today-responsive-2026-10-13/browser-measurements.json` and adjacent screenshots/logs. The 768px Today title truncation remains open. Physical Safari, native zoom, full role/status matrix and persistence are not certified.
- Patch gates passed: typecheck, lint, 21 focused tests, 4,296 full-suite tests, PGlite 160/160, lifecycle 30/30, contrast 54/54, shell lint and production build. Later concurrent workspace edits are outside that full-suite run; the screenshot preview is a separate successful mock build.

## Tablet and Operations follow-up — 14 October 2026

- The 768px Today title now fits in full; the header remains 64px. Healthy sync takes no tablet width; abnormal sync visibility is retained in regression tests.
- Operations stage labels wrap in two phone columns/four larger-screen columns. The phone confirmation measures 56px tall and both footer actions span the available width. Checked at 320/390/768/1440px with no document horizontal overflow.
- Mock number normalization fixed the previously empty return popup. Booking 864 now loads its client and four units. Completed Packing is read-only; Return is open; Cleaning is locked. No custody mutation was performed.
- Evidence: `artifacts/workflow-responsive-2026-10-13/`. Full patch run: 4,405 tests/347 files, typecheck, scoped lint, PGlite 160/160, lifecycle 30/30 and production build. Separate mock build and dark Chromium screenshots supplied visual evidence. The follow-up contrast check passed 82/82. These results exclude subsequent concurrent edits.
- New Rental catalogue View/Add Bundle targets measured 26px in the earlier preview; recheck the latest shared-button build and finish their touch-target acceptance. Physical iPad, native zoom, full status/role matrix and persisted writes remain open.
