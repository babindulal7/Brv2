# Smart Intel visual checks — 14 October 2026

Checked the existing Chrome tab at `http://localhost:3000/rentals`, using its existing session and record data. No record, note, payment or workflow transition was saved.

## Reproduced and corrected

- Rental totals, warnings and tabs scrolled out of view with the long item list. The shared rental body now keeps this compact summary sticky while the full list scrolls.
- Phone identifier wrappers measured 19.5px high. Shared Intel triggers now measure at least 44px high and wide.
- Escape returned focus to the identifier and immediately reopened the card. Programmatic focus restoration now skips the normal focus-open handler. A regression test exercises an actual focused control in the card.
- An authorized rental without a stored total now says `Not recorded`. Empty Notes explicitly says there are no notes. Neither state invents an amount or clearance.

## Observed browser checks

- Desktop draft: seven item lines and matching list/card total. Internal scrolling stayed contained in the 480px-wide card, without horizontal overflow.
- Phone touch emulation: a long press opened the sheet without navigating away; close dismissed it. Before correction, the trigger was 45.18 × 19.5px; afterwards it was 45.18 × 44px.
- Phone full-list scroll: all seven item lines remained in the DOM; the final item was readable, with total and tabs visible. The sheet measured 354.91px wide with no horizontal overflow. Requested viewport was 390px; existing Chrome zoom yielded approximately 355 CSS px.
- Tablet full-list scroll: total, tabs, final item and footer action were visible. Screenshot retained as `tablet-full-list.png`. Requested viewport was 846px to reach the tablet breakpoint under the existing Chrome zoom.
- Phone internal navigation: client link replaced the active card; Back restored the draft and its Equipment tab could be opened. Notes mounted only in the Notes tab.
- Desktop keyboard: Enter opened/pinned the card; ArrowDown moved focus to the adjacent client identifier. After correction, Escape dismissed the card and left the originating identifier focused, without reopening.
- Existing booked rental: ten item quantities were represented by eight complete lines. Missing stored total was explicitly marked `Not recorded`; all unavailable handover checks remained unverified.

## Evidence and limits

- `phone-full-list.png`: live draft sheet scrolled to the final item, with total and tabs visible.
- `tablet-full-list.png`: live draft card with the full list, sticky summary and footer action.
- Browser control later stalled. Recovery also timed out, so remaining Inventory/Clients directory checks, complete pointer timing/safe-travel measurements and additional desktop screenshots are pending.
- A later recovery identified that Chrome's debugger connection was detached. Refreshing and reclaiming the existing tab did not reconnect it. Resetting the temporary viewport override could not be confirmed after detachment; touch emulation had already been disabled before the desktop check.
- Hover timing is covered by the existing automated 299ms/300ms regression. Timing was not measured with a stopwatch in the live browser.
- Blocked-client and role omission remain covered by automated payload/DOM and local RLS checks; no blocked live record or alternate authenticated role was used in this browser session.
- Live JWT/PostgREST role acceptance and production verification remain pending. Local checks do not certify them.

## Automated verification

- Final typecheck passed, then the full suite passed: 348 files / 4,446 tests.
- Shared Intel regressions passed, including exactly 300ms initial hover, touch long press, Escape focus restoration, and the Close control returning focus without reopening.
- PGlite rebuilt 160/160 migrations, with view/RPC exposure and definer hygiene checks passing. Lifecycle passed 30/30.
- Full source lint passed; contrast passed 82/82.
- Final production build result is recorded in the matching PROGRESS entry. Detailed gate logs are retained locally as `.intel-visual-final-*.log`.
- Earlier checks ran while source was being corrected, including Delivery/Import changes elsewhere in the shared workspace. The final fresh sequence is the accepted result.
