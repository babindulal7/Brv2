> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY (20-21 Sep 2026)
>
> This document is a point-in-time audit snapshot. Its findings, blockers, test failure counts, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)

---

# UI/UX Audit

## Runtime coverage warning

Only the unauthenticated login surface could be opened in the available browser session. Authenticated screenshots and interactions are **NOT TESTED**; source review is not presented as visual proof. Login was measured at 320×568, 390×844, 834×1194, 1194×834 and 1440×900 in the persisted dark theme. Theme-token contrast was checked separately (40/40 pass).

## Page-by-page assessment

| Page/area | Source assessment | Primary risk/status |
| --- | --- | --- |
| Login/recovery | coherent email/password flow; honest unavailable PIN/SMS paths | 320 px vertical scroll and small text; auth edge cases untested |
| Today | independent movement concepts and filters | current Law 17 terminology test fails; authenticated layout untested |
| Rentals list | responsive list/filter patterns exist | live data/device interactions untested |
| New Rental | structured client/date/catalog/cart/summary flow | 06:00 pricing decision and phone/tablet E2E missing |
| Rental detail | rich contextual actions and workspaces | very large component; several historical/sample sections removed or unavailable |
| Calendar | desktop and phone agenda logic exists | reschedule drag unavailable; 06:00/device runtime untested |
| Inventory/assets | strong detail model and scan concepts | equipment creation validates but does not persist |
| Bundles | component model present | templates/import/label printing unavailable; full conflict UX untested |
| Clients | directory/detail and restrictions | KYC/tier/credit override writers unavailable |
| Operations | queue and floor-workspace navigation | current Tomorrow scope/drawer test failures; touch E2E absent |
| Payments | role-gated finance UI over protected DB model | production reconciliation and duplicate-submit browser test absent |
| Documents | register and categories | several screens/consolidation/export flows unavailable; seed fallback risk |
| Expenses | money gating is explicit | receipt, settlement-method/VAT data and reversal incomplete |
| Reports | many catalogue entries/toolbars | saved/custom/scheduled reports incomplete; raw parity unverified |
| Crew/sub-rental/cases | routes exist | incomplete actions and seed fallback; Crew is not an inaccessible route |
| Tools/settings/admin | broad operational controls | audit settings, numbering exports and backup service partly unavailable |

## Desktop

Source shows a persistent shell, dense lists, detail rails, responsive page primitives and role-gated actions. Opportunities are to reduce oversized page modules, keep high-frequency operation actions contextual, and distinguish unavailable features from production navigation. Authenticated 1280–1920 behavior, keyboard journeys and focus order remain NOT TESTED.

## iPad portrait

No authenticated runtime evidence. The correct acceptance target is a collapsible/drawer navigation, prioritized compact rows or cards, full-height sheets for floor workflows, persistent primary action and no hover dependency. Packing/handover/return/inspection/reset must be tested at 744/768/810/820/834 widths with the keyboard and camera permission states.

## iPad landscape

No authenticated runtime evidence. List/detail or queue/workspace split view is appropriate where it reduces repeated navigation, but must be validated at 1024/1112/1194/1366 rather than inferred from breakpoints.

## Phone

At 390×844 login has no horizontal overflow and its inputs/buttons/link meet 44 px. At 320×568 the card is about 204 px wide, the 20 px title wraps, body/form text is about 12.6 px, and document height is about 635 px for a 568 px viewport. Authenticated navigation, lists, calendar, New Rental and operations remain NOT TESTED. Those should use cards/compact rows and full-screen sheets, not squeezed desktop tables or font reduction.

## Light and dark modes

The automated token contrast check passes 40/40 combinations. Runtime browser inspection only saw dark login. A token pass does not prove every hard-coded color, chart, overlay, focus ring, disabled state, PDF or status badge; every major authenticated screen needs both-theme screenshots and keyboard checks.

## Touch and accessibility

Login targets meet the 44×44 requirement at 390 px. Critical controls elsewhere were not measured. Source uses semantic dialogs/status regions and explicit unavailable states, but repeated React `act` warnings and the absence of browser accessibility tests reduce confidence. Required checks: tab order, visible focus, Escape/focus return, error announcement, status text beyond color, tap alternatives to hover, screen reader names, safe-area padding and virtual-keyboard reachability.

## Top 10 UI/UX problems

1. Scanner failures look successful (AUD-002).
2. Seed fallbacks make demo rows look operational (AUD-003).
3. Routed primary actions cannot save (AUD-007).
4. Evidence/receipt actions cannot persist files (AUD-004).
5. Authenticated device behavior is unproved (AUD-009/AUD-013).
6. Operations scope/drawer behavior currently fails tests.
7. 320 px login typography is too small and the page scrolls.
8. Several unavailable features remain visible in production navigation/surfaces.
9. Save/refresh/offline confirmation is not proven for floor work.
10. Large pages increase inconsistent interactions and accessibility regression risk.

