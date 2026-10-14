# Scrape adoption — implementation and verification

Completed 14 October 2026. This continues the 6 October archive assessment and the adoption work already present in the app.

## Delivered

- Clients → More → Import Clients now saves reviewed CSV rows through the existing transactional record editor. Identity, contacts, addresses, PAN, business registration and notes are supported. Membership has its separate workflow; a separate company column must be mapped to Name or explicitly skipped.
- Invalid enums, PANs/emails, repeated target mappings and repeated phone/email rows block saving. Blank columns remain visible. Distinct clients with equal names remain distinct. Existing matches must be skipped rather than merged or overwritten.
- Each included row keeps its own save key while the import is open. Confirmed rows are counted and linked; a failed or uncertain row stops subsequent writes. Retry keeps the original request, and Stop finishes the current row before stopping. Reload recovery of an unfinished batch is not implemented: keep the source file and use Retry while the import remains open.
- CSV import requires the intersection of creation and full client-contact access: Owner/Admin/Manager/Coordinator. Warehouse keeps walk-in intake. Accounts keeps contact reads without creation.
- Rental CSV visible columns, integer paisa and deposit separation were already implemented on 7 October. Export audit metadata now also identifies row scope. Client export uses the shared CSV quoter and says that it exports the loaded directory.
- Shortage ranges use configured Nepal operational days and reject invalid dates. Product, peak-date calendar and booking links provide drill-downs. Refresh retries reads. Missing units or invalid held periods produce an error rather than a false empty answer.

No archive instructions or downloaded vendor code were executed or imported into the app. No new migration or live Supabase write was performed.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Typecheck | PASS | `typecheck.log` |
| Full test suite | 345 files / 4,392 tests passed | `tests.log` |
| Source lint | PASS | `lint.log` |
| PGlite rebuild | 160/160 applied locally; exposure and definer checks passed | `pglite.log` |
| Booking lifecycle | 30/30 green | `lifecycle.log` |
| Production build | PASS; 296 PWA entries generated | `build.log` |
| Theme contrast | 82/82 passed | `contrast.log` |
| UI copy | PASS; four checker tests passed | `ui-copy.log` |
| Fixture isolation | Production source and bundle passed | `fixtures.log` |
| Actual browser | Two equal-name/different-phone clients saved, survived reload, and were blocked on repeat import | `browser-result.json` |
| Phone width | 390px document at 390px viewport; no page errors | `browser-result.json`, screenshots |

Runtime command results above were captured on 13 October. Final browser acceptance completed on 14 October on an isolated compiled mock origin using fabricated records. The first development-server attempts timed out; the compiled harness dismissed the first-use dialog and used the actual file-upload/save UI. Production JWT/PostgREST behavior is not certified by these local checks.

Browser harness: `BROWSER_STATIC_MOCK=1 node artifacts/scrape-adoption-2026-10-13/browser-check.cjs` after preparing the separate ignored mock build. It starts and closes its own server and browser. The preview never serves the production `dist` directory.

Screenshots: desktop preview, phone preview, phone saved state and existing-duplicate state. The wide tables scroll within their panels; the page itself does not overflow on the checked phone width.
