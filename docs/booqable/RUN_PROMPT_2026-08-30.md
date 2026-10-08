> ## Historical record — this prompt has already been run
>
> Filed 7 Sep 2026. It was written 31 Aug 00:52 and never lived in the repo, so the audit trail
> for the A0 rulings was outside it. Copied from the 31 Aug handoff file; no in-repo original exists to diff it against, so it is
> reproduced as received rather than certified verbatim. **Do not run it again.**
>
> | Task | Outcome |
> |---|---|
> | 1 · D4 operational day as a setting | **Done** — `lib/operationalDay.ts` + `settingsStore.operationalDayStart`, read by `queries/bookings.ts`, `calendar.ts`, `closing.ts`. Open question it did not settle: the key is per-browser localStorage. |
> | 2 · D5 serials at creation | **Partial** — `create_booking` accepts `units` (0071, applied 31 Aug) and `createRental` validates them, but `NewRental` sends none and `planCreationUnits` has no callers. |
> | 3 · D2 portal policies | **Done** — 0072, applied 31 Aug: self-registration bound only by verified control of the stored email. |
> | 4 · D3 discount gate | **Confirmed, then reversed** — the stop-and-confirm gate worked exactly as written: Babin re-ruled before anything was applied, and Law 10 is now UNGATED (0074, 0075). |
> | 5 · extend `docs/booqable/` | **Unexecutable as written** — it points at a `PARITY.md` and a 19 Aug page-doc set that never existed here. The layer-d/ files did the equivalent work. |
>
> Two references in it were wrong on the day: it names `REFERENCE_SPEC_v2.1.md` (superseded by
> v2.5 seventy minutes later) and a test count of 2174/88 from a different sandbox. The part
> worth keeping as a pattern is Task 4's **stop and confirm before acting on a law reversal**.

---

# RUN PROMPT — Babin Rentals OS: apply the 30 Aug rulings

Paste this whole file as the first message to Claude Code, opened in the `babin-rentals-os` repo, with `BOOQABLE_REFERENCE_SPEC_v2.1.md` placed at `docs/booqable/REFERENCE_SPEC_v2.1.md` first.

---

You are working in the babin-rentals-os repo. Before touching anything, read in this order:

1. `PLAN.md` — the 17 laws. Foundation is canonical and wins disagreements.
2. `PROGRESS.md` — newest-first; the live authority on state. Trust it over any audit file.
3. `docs/booqable/00-INDEX.md` and `docs/booqable/PARITY.md`
4. `docs/booqable/REFERENCE_SPEC_v2.1.md` — read §1 (standing rulings R1–R8), §2.4 (repo contracts — measured, do not re-derive), and **Appendix A0 (the 30 Aug rulings)** in full. Skim the rest as needed per task.

House rules for this session: gates after every task (`tsc` adds 0 errors; `vitest` all green — 2174/2174 across 88 files as of 30 Aug; production `vite build` runs only on Babin's machine). Log each task to `PROGRESS.md` in Did / Found / Ruled / Verified / Blocked form — log what was VERIFIED, not what was written. The word "customer" appears nowhere in app code — they are clients (Law 17).

## Task 1 — D4: the operational day becomes a setting

Add `operationalDayStart` to settingsStore (default `"06:00"`), surfaced in Settings ▸ General beside the other rental-period defaults. Rewire the named filter sets in `src/lib/queries/bookings.ts` (`todaysOutgoing`, `todaysIncoming`, `overdue`, `operationQueue`) to compute their day boundary from it instead of calendar midnight, and delete the TODO(decision) there. Anything else that assumes midnight (Dashboard panels, Operations day scope, the pickups drill-down) must read the same helper — one function, `lib/` layer, per Law 1. Add tests: a booking at 05:30 belongs to yesterday's operational day when the setting is 06:00, today's when it is 00:00.

## Task 2 — D5: serials assigned at creation

B4 is closed: allocation happens at booking creation, the 27 Jul least-used-unit lock stands. Wire the creation path (NewRental → `createRental` → `create_booking` RPC) to pass `units` per line, chosen least-used among available. Where availability cannot be known locally (inventory_reservations is Booqable-mastered during the bridge — dataAccess.ts:201), fall back to unit-less lines rather than guessing; the RPC signature allows both, and Pack confirms or fills. Surface assigned units on Booking Detail as removable chips (spec §10.2); removal deletes the `booking_line_units` row, behind a visible 44×44 control, never hover-only (§10.4).

## Task 3 — D2: portal policies, invite-optional self-registration

Draft (WRITE, do not apply) the migration giving the three `portal_*` tables real policies on this model: a self-registered account is bound to a client ONLY by verified control of the exact email stored on that client record (verification link; no fuzzy, name, or domain matching, ever). An unmatched or unverified account is bound to nothing, sees nothing under RLS, and appears to staff as a pending link request. Update 0054's documented deny-all comment to point at the new migration. Spec the pending-requests staff surface (a card on Clients) but do not build it this session.

## Task 4 — D3: the discount gate — STOP AND CONFIRM

Babin ruled "no discount gate" on 30 Aug. Do NOT implement this silently. Present him, in-session, exactly this before acting:

> Removing the gate requires: (1) amending Law 10 in PLAN.md; (2) a migration dropping the live `booking_discounts` constraint (>10% reason+approver, 25% cap) — until it is applied, an ungated UI writes discounts the database rejects; (3) removing lib/discount's approval path and its pinned tests. What is lost is the audit trail — the live Booqable log already shows "Change discount of Booking #901" with no reason, and standing discounts of 20% (#363) nobody authorised in writing. Alternative on the table: discount policies (authorise once at creation, apply by reference) — zero friction on the floor, one audit row per policy. Confirm: drop the gate, or adopt policies?

Act only on his explicit answer. If he confirms dropping, do all three steps together in one logged change; a half-removed gate (UI open, DB closed) is the worst state.

## Task 5 — extend docs/booqable/

Run the §6 template + §7 instructions over the screens the live capture could not reach: customer Bookings and Payment methods tabs, product Online store and Cross-sell tabs, and the Settings sub-pages (compare against the 15 Aug four-tab reshape before writing anything; the 18 Aug archive HTML covers these). Extend the existing 19 Aug page docs with layers B/C/D — never replace them. Every Layer C line tagged [observed] or [ruled]; every Layer D line names a real contract from §2.4 or says GAP.

## Order and stopping

Tasks 1 → 2 → 3 are independent of Task 4 and safe; do them first. Task 4 blocks on Babin's in-session answer. Task 5 is background work whenever blocked. If any gate fails, stop and report rather than pushing forward.
