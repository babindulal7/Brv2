# Responsive Audit

## Evidence level

Login: runtime-tested in dark mode at 320×568, 390×844, 834×1194, 1194×834 and 1440×900.  
Authenticated screens: **NOT TESTED** because no authenticated browser session was available. Recommendations below are acceptance designs derived from source structure, not claims that a visual defect was reproduced.

## Device coverage matrix

| Screen | Desktop | iPad Portrait | iPad Landscape | Phone | Light | Dark |
| --- | --- | --- | --- | --- | --- | --- |
| Login | PASS at 1440 | PASS at 834 | PASS at 1194 | MINOR ISSUE at 320; PASS at 390 | NOT TESTED | PASS |
| Today | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Rentals | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| New Rental | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Rental Details | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Calendar | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Inventory / Equipment | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Clients | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Operations | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Payments | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Documents | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Expenses | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Reports | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Tools / Settings | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## Desktop

| Page | Current behavior | Problem | User impact | Recommended behavior | Breakpoint | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Operations | queue/workspace with dense controls | runtime state unproved and tests are red | dispatch mistakes | persistent queue/detail split where width permits; visible save/confirm state | ≥1280 | P1 |
| Rentals/clients/inventory | data-rich lists and detail routes | large-screen density/empty/error truth not visually verified | slower lookup | capped readable detail width, high-density list, contextual detail rail | ≥1280 | P2 |
| Reports | toolbar and analytic surfaces | incomplete actions share space with working filters | false expectations | hide deferred actions from production or mark feature state consistently | ≥1280 | P2 |

## iPad portrait

| Page | Current behavior | Problem | User impact | Recommended behavior | Breakpoint | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Shell | responsive sidebar code exists | not touch-tested | cramped navigation risk | temporary drawer with active state and 44 px rows | 744–834 | P1 |
| Operations | desktop-style queue/workspace concepts | cannot prove reachability with keyboard/camera | floor errors | full-height operation sheet, sticky safe-area action bar, large scan/check controls | 744–834 | P1 |
| New Rental | multi-section builder | keyboard/cart behavior unproved | abandoned/incorrect booking | single primary column; cart becomes review sheet; dates/client stay summarized | 744–834 | P1 |
| Tables | rich desktop rows | column priority unproved | hidden actions/context | compact essential columns + expandable row/detail sheet, not overflow alone | 744–834 | P2 |
| Calendar | rich calendar/agenda source | portrait density unproved | missed pickup/return | agenda or compact week plus selected-day sheet | 744–834 | P2 |

## iPad landscape

| Page | Current behavior | Problem | User impact | Recommended behavior | Breakpoint | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Operations | queue plus workspace is structurally possible | no runtime proof | navigation churn | 35–40% queue / remaining workspace, sticky terminal action | 1024–1366 | P1 |
| Rentals/clients/inventory | separate lists/details | opportunity not verified | repeated back navigation | optional master/detail while preserving deep links/back | 1024–1366 | P2 |
| New Rental | desktop composition | may stretch rather than prioritize | slow cart validation | catalogue left, persistent summary right; collapse on keyboard constraints | 1024–1366 | P2 |

## Phone

| Page | Current behavior | Problem | User impact | Recommended behavior | Breakpoint | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Login | centered card | 320 px has ~12.6 px text and vertical overflow | readability | near-full-width card, ≥16 px inputs/labels, compact spacing without shrinking targets | 320–359 | P2 |
| Shell | mobile navigation code exists | not runtime-tested | actions may be buried | drawer plus short operation shortcuts and explicit current page | 320–430 | P1 |
| Rentals/inventory/clients | desktop data concepts | squeezed table risk | lookup errors | purpose-built cards/compact rows with only priority fields and one primary action | 320–430 | P1 |
| Operations | long floor workspaces | one-hand/keyboard/camera behavior unproved | incomplete handover/return | full-screen workflow, sticky bottom Save/Confirm, step progress, scan feedback that cannot lie | 320–430 | P1 |
| New Rental | builder/cart | form and catalogue switching unproved | wrong dates/items | step flow; full-screen search; persistent selected count; final review | 320–430 | P1 |
| Calendar | monthly information density | full month unsuitable | missed work | agenda/day default, optional compact week | 320–430 | P2 |
| Filters | drawer primitives exist | current operation drawer expectation fails | stuck/unclear filters | full-screen or bottom sheet with sticky Apply/Clear and count | 320–430 | P2 |

## Top five iPad risks

1. Unproved Packing→Handover→Return→Inspection completion with touch/camera.
2. Queue/workspace and primary-action reachability in portrait.
3. New Rental cart/search/date flow with virtual keyboard.
4. Table column/action prioritisation without relying only on horizontal overflow.
5. Modal/drawer focus, rotation and unsaved-state handling.

## Top five phone risks

1. Unproved end-to-end operation and sticky terminal controls.
2. Scanner false-success is especially dangerous on camera-first use.
3. Desktop data density may obscure the priority row/card facts.
4. New Rental/search/cart workflow lacks 390 px browser proof.
5. 320 px login readability and safe vertical fit.

## Required screenshot/interaction set

After obtaining staging accounts, capture 1440×900, 834×1194, 1194×834 and 390×844 in light and dark for every mandatory screen. Add 320/360/375/393/402/414/430 phone widths; 744/768/810/820 portrait; 1024/1112/1366 landscape; virtual keyboard, rotation, safe areas, slow network and touch-only runs. Screenshots are supporting evidence, not replacements for successful task completion.

