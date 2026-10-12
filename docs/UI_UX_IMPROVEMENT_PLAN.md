# App-wide UI/UX improvement plan

Started 13 October 2026. Active goal: improve button placement and user experience throughout the app, check every workflow status, and improve phone and iPad layouts. This plan supplements the user's one-header acceptance plan in `ONE_HEADER_ACCEPTANCE.md`; a completed local patch does not complete the app-wide goal.

## Design guidance

Requested skills located and read:
- `.agents/skills/high-end-visual-design/SKILL.md`.
- `C:/Users/use/.gemini/config/skills/agency-ui-designer/SKILL.md`.
- `C:/Users/use/.gemini/config/skills/agency-ux-architect/SKILL.md`.
- `C:/Users/use/.gemini/config/skills/agency-evidence-collector/SKILL.md`.
- The requested visualize skill: use a conversational visual only when it helps explain or compare; actual app changes and screenshots remain the deliverable here.

Keep the existing semantic tokens, Outfit/Source Sans/JetBrains fonts, Tabler icons, 768/1280 breakpoints, and the user's single 64px header. Apply consistent spacing, clear visual hierarchy, restrained depth, accessible focus, and progressive disclosure. Marketing-style oversized sections, decorative blur, floating navigation and delayed content reveals conflict with the agreed operational app and are not adopted.

## Step plan and evidence

| Step | Scope | State / evidence required |
|---|---|---|
| 1 | Shared shell, search, primary actions, More | First patch locally verified 12 Oct; Today phone search and narrow control group under verification 13 Oct. |
| 2 | Rentals list selection, pagination, New Rental and Booking Detail | Existing work needs the full acceptance matrix; consolidate selected-row actions without losing callbacks. |
| 3 | Pack, Handover, Return, Inspection, Cleaning/Reset | Check every persisted status, valid next action, prohibited action, exceptions, and safe test-database writes/reload. |
| 4 | Today and Calendar | Today layout stability already covered; responsive search/date/actions under review. Reconcile counts, business day, date ranges and calendar availability. |
| 5 | Inventory, Bundles, Clients, Membership | Match form/navigation patterns; create/edit/retire and duplicate/hold/history states with permission checks. |
| 6 | Finance, Payments, Expenses, Documents | Validate immutable money flows, error feedback, double-submit prevention, print/export and money-blind roles. |
| 7 | Crew, Delivery, Reports, Settings, Tools | Verify assignment/status transitions, saved settings, report reconciliation, useful empty/error states and every enabled action. |
| 8 | Cross-app acceptance | Desktop, phone, iPad; light/dark; keyboard; 100%/125% native zoom; relevant role matrix; staging JWT/PostgREST and reload evidence. |

For each page record: loading, populated, empty, filtered-empty, error/retry, restricted, offline/stale, saving, persisted success and failed save. Status-specific checks include Draft, Quote, Booked, Packed, Handed Over/On Rent, overdue, partial return, Returned, Inspected, Reset, Closed and Cancelled, plus damage/missing and financial states where applicable. Verify actual domain labels and engines before changing status presentation.

## Acceptance contract

- One header and one primary action for the current task; 44px targets (56px floor primary actions), no clipped controls or unintended horizontal page scrolling.
- Every enabled button has a real effect. Search clear/dismissal and menus preserve usable focus; filters remain consistent after navigation.
- At minimum inspect 1440, 1280, 1024, 768, 390 and 320px. Width emulation is not an actual iPad Safari or native browser zoom test; record those separately.
- Screenshots prove appearance; interaction assertions and persisted database state prove behavior. Do not substitute historical green tests for current evidence.
- Run repository checks in the required order after changes. Local PGlite does not establish live JWT/PostgREST security.
- Do not apply live migrations, wipe live data, widen role permissions, or alter money/day/custody rules during visual work.

## Continuation

The previous goal turn made verified progress (shell ownership, navigation-loop fix and acceptance evidence). This turn continues implementation and creates the missing app-wide step plan. Untested modules remain open; no full-app completion claim is made.
