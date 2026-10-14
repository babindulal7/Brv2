# Button consistency corrections — 14 October 2026

The original audit's confirmed action-color, lifecycle-color and target-size defects are corrected in the current source. The continuation also fixed two browser-discovered defects: floor primary verbs were only 48px, and lifecycle labels overlapped on narrow screens. Action handlers, capability predicates, pricing and database schemas were preserved.

## Corrections by audit ID

| ID | Severity | Current source | Corrected behavior |
|---|---|---|---|
| BTN-P0-01 | Original P0 diagnosis corrected | src/modules/finance/Finance.tsx:2004 | Pay uses the shared primary Button and its complete foreground/background pair. The old inline background was white/card, so the audit's blue-on-blue claim was incorrect. Both palette overrides were addressed together. |
| BTN-P0-02 | P0 | src/modules/operations/DeliveryWorkspace.tsx:460 | Confirm Delivered uses shared primary tokens. No undefined green token remains in this file; KPI text uses declared success-text. |
| BTN-P1-03 | P1 | src/modules/operations/DeliveryWorkspace.tsx:450 | Dispatch uses the same primary pair; no gold override remains. Assign Rider is a shared secondary action. |
| BTN-P1-04 | P1 | src/modules/finance/finance.css:436 | WhatsApp is a neutral link with readable text, border, hover and visible keyboard focus. Existing href, external-link protection and unavailable branch stay intact. |
| BTN-P1-05 | P1 | src/components/ui/LifecycleProgress.tsx:34 | Typed StatusKey tones, Badge and STATUS_ICON replace legacy status pills. Preparation/Packed/Inspection/Reset waiting use progress, On Rent out, Returned in, Closed/Void dim, overdue/cancellation danger. |
| BTN-P2-06 | P2 | src/modules/finance/Finance.tsx:2004 | All invoice-row actions use shared small Buttons with a 44px minimum; phone flex layout remains. |
| BTN-P2-07 | P2 | src/components/ui/LifecycleProgress.tsx:274 | The banner uses shared Button, 44px ordinarily and 56px in floor mode. Disabled state comes from the existing resolver. |
| BTN-P2-08 | P2 | src/components/ui/header/UnsavedChangesIndicator.tsx:2 | Shared pending-edits indicator in page, rental and shell headers; progress tokens, explicit accessible text, compact shell geometry. |
| BTN-P2-09 | P2 | src/styles/ui-v2.css:32 | Primary hover uses the existing hover-button/btn-primary-fg pair. Resting and hovering keep the same action category. Important precedence remains necessary for the kit's inline resting fill. |
| BTN-P2-10 | P2 | src/components/ui/QuickActionPanel.tsx:186 | Ordinary bulk CTAs use shared Button; specialized tabs, toggles and disclosures were preserved. No blanket conversion of native controls. |
| FLOOR-01 | Additional browser defect | src/styles/theme.css:1080 | Primary floor selector now matches the specificity of the general floor rule, restoring 56px instead of 48px. |
| TRACK-01 | Additional browser defect | src/styles/ui-v2.css:470; src/components/ui/LifecycleProgress.tsx:228 | Lifecycle steps keep their content width and scroll inside their track. The track supports keyboard focus; markers consume theme tokens. |
| CSS-01 | Minor CSS defect | src/modules/operations/delivery.css:27 | Corrected invalid justifyContent CSS property to justify-content. |

The first audit corrections are already present in commit 4cb4d0d. The continuation preserves the subsequent shared-boundary and hover-foreground refinements. Token values continue to come from the existing design-token source/runtime layer; no second palette or header system was added.

## Contrast evidence

| Control | Before | Corrected default |
|---|---|---|
| Finance Pay, light | Blue/card white, 6.22:1 (not blue-on-blue) | White/primary blue, 6.22:1 |
| Finance Pay, dark | Accent blue/card, 6.06:1 | White/primary blue, 4.59:1 |
| Dispatch, light | Black/blue, 3.38:1 | White/primary blue, 6.22:1 |
| Confirm Delivered | Undefined background token; no valid intended pair | Primary pair, 6.22:1 light / 4.59:1 dark |
| WhatsApp | White/bright green, 1.98:1; hover 2.47:1 | Neutral text/card, 17.85:1 light / 15.84:1 dark; neutral hover also passes |
| Legacy orange status | White/orange, 3.61:1 | Out uses dark ink, 4.55:1 light / 5.46:1 dark; preparation uses the yellow progress pair |

The following browser samples include the rendered brightness filter, rather than measuring only the unfiltered CSS colors:

| Theme | Control | Default | Hover |
|---|---|---|---|
| light | Primary action | 6.22:1 | 7.19:1 |
| light | Danger action | 5.13:1 | 4.65:1 |
| dark | Primary action | 4.59:1 | 5.13:1 |
| dark | Danger action | 5.13:1 | 4.65:1 |
| high-contrast | Primary action | 13.71:1 | 12.34:1 |
| high-contrast | Danger action | 5.58:1 | 6.21:1 |

High-contrast remains the intentional yellow/black accessibility scheme.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Typecheck | PASS, exit 0 | typecheck.log |
| Full test suite | PASS, 347 files / 4,413 tests | tests.log; completed runner summary retained across continuation |
| Final focused tests | PASS, exit 0; 71 tests / 5 files | focused-tests.log |
| Source lint | PASS, exit 0 | lint.log |
| Theme contrast | PASS, exit 0; 82/82 | contrast.log |
| PGlite rebuild | PASS, exit 0; 160/160 | pglite.log |
| Booking lifecycle | PASS, exit 0; 30/30 | lifecycle.log |
| Production build | PASS, exit 0; service worker and 296 precache entries | build.log |
| Shell lint / UI copy | PASS, exit 0; 654 files / 0 copy violations | Executed after the final source edits |
| Browser | PASS, exit 0; 42 recorded checks, 0 page errors | browser-results.json / browser.log |

Full-suite results above come from this run's saved runner summary. Final focused tests cover the later visual/structure edits. The completion counter may display newer cached suite counts from concurrent work; those are separate evidence.

## Browser coverage and limitations

- Isolated actual-source components: 375, 820 and 1440px × light, dark and high-contrast × normal/floor mode = 18 combinations. Primary/secondary/danger/link contrast, hover, keyboard focus, loading width, 44px ordinary targets, 48px floor controls, 56px floor primary verbs and nonoverlapping lifecycle labels passed.
- Actual Finance and Delivery screens were opened through the normal mock Owner login at all three widths in light/dark. Finance retained exactly one 64px header at every checked width.
- The clean mock database has no invoices or delivery records. Actual row Pay clicks and status-dependent Dispatch/Confirm Delivered screen actions are explicitly SKIPPED; they were not fabricated to obtain screenshots. Their source palette and state contracts are covered by the component preview and targeted tests.
- The standalone source preview was used because development-server HTML requests timed out. It bundles current components, styles, fonts and mock application source; it is separate from the successful production build.
- Chrome browser coverage only. The complete audit's page-by-page matrix, native mobile devices, other browsers and live JWT/PostgREST behavior are not certified.
- No SQL migration, live write, permission widening, pricing change or production deployment was performed.

## Selected screenshots

- [Phone dark/floor component preview](components-375-dark-floor.png)
- [Desktop light component preview](components-1440-light.png)
- [Phone Finance empty state](finance-375-light.png)
- [Tablet Delivery empty state](delivery-820-dark.png)

All screenshots in this folder are AFTER images. Before contrast pairs came from the original/current source audit, not fabricated before screenshots.
