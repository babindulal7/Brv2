# Shell clearance audit — 7 October 2026

The reported New Rental catalogue clipping was reproduced at 1304 × 892. This audit covers the affected booking form and representative shared popup paths, with desktop, tablet and phone checks. It does not certify every workflow or device.

## Findings and fixes

| Surface | Finding | Result |
|---|---|---|
| Add item to booking | Absolute panel extended outside an Equipment section with overflow hidden, cutting off results and buttons. | Inline panel now expands the section in normal form flow. Internal results scroll; filters and keyboard controls remain outside that scroller. |
| Catalogue keyboard cursor | scrollIntoView moved the clipped section and workspace, hiding the Equipment heading. Sticky result headings could cover the selected row title. | Scroll only the result container, account for group heading height, and preserve the top of a tall row. Opening the catalogue scrolls the actual workspace to the section heading. |
| Phone catalogue | The fixed action bar covered the catalogue legend; status/rate chips squeezed item names. | Catalogue height measures space above the actual action bar. Names wrap onto a separate heading row on phones. |
| OverflowMenu and excess PageActions | Inline absolute menus could be clipped by cards/tables or viewport edges. | Fixed body portals, horizontal clamping, upward placement where needed and internal scrolling for long menus. Portal interaction remains inside for outside-click handling. |
| Select | Downward menus always allowed 300px even when less space remained; horizontal placement lacked bounds. | Cap height to available space and clamp horizontal position. |
| Select, DateField, DateTimeField inside dialogs | Body portals used dropdown layer 1100 beneath modal layer 1400. | Use existing modal token + 1 when the anchor belongs to an aria-modal dialog; normal page popups retain the dropdown token. A vendor Return-By calendar was verified visibly above its modal at layer 1401. |

Intentional overflow containment on the shell, workspace and section cards remains. This fixes the affected surfaces rather than exposing all overflow globally.

## Browser checks

- Catalogue: 1304 × 892 with collapsed and expanded navigation, 1194 × 834 tablet and 375 × 812 phone. Equipment section scrollTop remains zero, heading/search remain visible, and document width matches the viewport.
- Phone catalogue bottom measured 619.6px against action-bar top 632px. Keyboard navigation via a native Down key changed result scroll while workspace remained at 848px and section remained at zero.
- Booking Detail overflow portal measured within viewport and directly under body. Bottom-row Rentals operations menu already uses a portal and correctly opens upward; retained.
- New Client dialog, phone Bundle Preview, client suggestions, Project Type menu, rental calendar, header profile and command palette all cleared their surrounding shell in the inspected views. No additional clipping fix was required for those existing paths.
- No booking was confirmed, client created, item added, financial record changed or custody action executed. User's localhost draft was left untouched; checks used a separate 127.0.0.1 tab. Dark theme and collapsed navigation were restored; viewport override reset.

## Verification

- Typecheck passed. Eleven focused booking, popup, shell and Tier 1 suites passed 109/109. Regression assertions cover clipped hosts, measured footer clearance, portal clicks, viewport bounds and modal popup layers; existing keyboard/action behavior remains covered.
- Changed-file ESLint, UI-copy check and scoped git diff whitespace check passed.
- PGlite applied 155/155 migrations; lifecycle passed 30/30. These are local verification gates, with no live migration or write.
- Production build passed, including the service worker and 297 precache entries.
- Screenshots and test/build/gate logs: `artifacts/shell-clearance-2026-10-07/`.

The separately recorded earlier full-suite result remains in completion reporting; this change uses the focused 109-test run above.
