# Booqable reference — index

**Created 31 August 2026.** This directory did not exist before today.

This index exists to record one thing before anything is built on top of it: **what the Booqable
reference in this repo actually consists of.** The 30 Aug *Reference Extraction Spec v1.1* §7
instructs a reader to "extend" a 19 Aug capture held in `docs/booqable/` (00-INDEX + 14 page docs
+ PARITY.md). That capture is not in this repo, and this file is not it.

> ## ⚠ READ FIRST — the authority is `REFERENCE_SPEC_v2.5.md`
>
> [`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md) (1,531 lines, 118 KB) landed in this directory
> at **01:57 on 31 Aug**, written by a concurrent session while the rest of this pack was being
> produced. **It is the complete capture** — 13 screens plus a 17-page Settings compendium, an
> appendix of rulings (A0) and its own decision sheet (Appendix A). It supersedes v1.1 and v1.2.
>
> **Everything else in this directory was written against v1.1 and is subordinate to v2.5.**
> Where they disagree, v2.5 wins on anything about **Booqable**. This pack still wins on anything
> about **this repo**, for the reason below.

**What this pack is, now that v2.5 exists.** The **verification layer** under it. v2.5's
Booqable-side observations were made live and hold up; its **repo-side** section (§2.4, labelled
*"measured, do not re-derive"*) is carried unchanged from v1.1, and most of its checkable claims
**fail** — wrong law numbers, half the engines missing, `BrandKey` and `Card` wrong, an RPC
signature that fails at runtime. Every screen v2.5 adds has a **Layer D written from that same
unreliable list**.

So: **trust v2.5's Layers A, B and C. Verify every Layer D line before building from it.**
[`CORRECTIONS.md`](CORRECTIONS.md) is the list of what to distrust;
[`CAPTURE-BACKLOG.md`](CAPTURE-BACKLOG.md) tracks the per-screen verification still owed.

**The one thing to read before any build session:** A0's D3 ruling moved twice on 31 Aug and
settled at **NO GATE**. First confirmation chose the policies alternative; Babin then overrode
it in his own words — *"don't put any gate on discount"* — and the policies draft (0073) was
deleted unapplied the same session. The app-side gate is now removed everywhere
(`lib/discount.ts` · `money.ts:discountGate` · `rbac.ts:canApproveDiscount` · NewRental ·
AddBundle · ClientDetail · both Tools calculators); what survives is arithmetic validity only
(negative refused, >100% refused — the R3-1 hole stays closed).

> ✅ **Corrected 31 Aug from the live database.** This paragraph read *"The DB half is
> `0074_drop_discount_gate.sql`, **drafted NOT applied** — until it applies, the live CHECKs still
> reject a >10%-no-reason row."* **That is false: it was applied**, at `20260831124237`, followed
> by `0075_drop_invoice_lines_discount_gate` at `20260831131943`. The DB and the app now agree, and
> the "theoretical window" this paragraph warned about is closed.
>
> Verified from `pg_constraint`, not from a header: the three discount-writing tables each carry
> the same rule — `booking_discounts_percent_sane`, `invoices_discount_percent_sane`,
> `invoice_lines_discount_percent_sane`, all `>= 0 and <= 100`. **No `over_ten_needs_reason` check
> remains anywhere.** Three ≤25 caps deliberately survive, none a per-discount ceremony:
> `coupons_discount_pct_cap`, `membership_plans_discount_hard_cap`, `user_approval_discount_cap`.
>
> This is the exact failure mode this pack exists to catch — **a NOT-APPLIED banner outliving the
> apply** — reproduced here in the index's own read-first section. `CAPTURE-BACKLOG.md` §1 had it
> right; this file did not. Settle applied-state from
> `supabase_migrations.schema_migrations`, never from a file header or a doc.

PLAN.md Law 10 carries the final text; PROGRESS.md 31 Aug is the record.

---

## 1. What the reference actually is

> **Amended 7 Sep 2026.** All three specs below now carry a review banner: the capture is
> trusted, the repo-side layer is not (28% verified — read [`CORRECTIONS.md`](CORRECTIONS.md)
> and §5 of [`LAYER-D-VERIFICATION.md`](LAYER-D-VERIFICATION.md) in place of §2.4), the discount
> passages are marked superseded, the struck 1180 breakpoint is corrected to 1280, and the law
> numbers are fixed. The build shortlist drawn from all three is [`ADOPTIONS.md`](ADOPTIONS.md).

| Artifact | Exists? | Where | What it holds |
|---|---|---|---|
| **`REFERENCE_SPEC_v2.5.md`** — the complete capture | **Yes** | [`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md) | **13 screens + the 17-page Settings compendium + Appendix A0 (rulings) + Appendix A (decision sheet).** Arrived 01:57, 31 Aug. **The authority.** Its Layer D is unverified — see [`CORRECTIONS.md`](CORRECTIONS.md). |
| `DATE_TIME_PICKER_SPEC_v1.1.md`, `RAIL_AND_QUICK_ACTIONS_SPEC_v1.0.md` | **Yes** | this directory | Two component specs from the same concurrent session, 02:03–02:07. Picker spec bumped to v1.1 on 1 Sep (§4.4 corrected to BS-primary cells; v1.0 kept in place with a superseded banner). Not reviewed by this pack. |
| **`ADOPTIONS.md`** — the build shortlist | **Yes** | [`ADOPTIONS.md`](ADOPTIONS.md) | **Start here if you intend to build anything from this pack.** Ten checkboxed items, each with a cost band and the engine it lands in; six deferrals with the reason; the four rulings they wait on. Written 7 Sep 2026 from a five-lens review. Everything in it sits behind the P0 register in `REMEDIATION_AUDIT_2026-09-05.md`. |
| `RUN_PROMPT_2026-08-30.md` | **Yes** | [`RUN_PROMPT_2026-08-30.md`](RUN_PROMPT_2026-08-30.md) | The 30 Aug handoff prompt that carried the A0 rulings into the repo, filed 7 Sep as a historical record with each of its five tasks' real outcome. Do not run it again. |
| `docs/booqable/` 19 Aug capture — 00-INDEX + 14 page docs + PARITY.md | **No** | — | Never present. The §7 instruction to "extend" it is unexecutable **as written in both v1.1 and v2.5** — but v2.5 makes it moot by containing the capture itself. |
| Saved Booqable DOM archive (HTML/MHTML) | **No** | — | No `.html`/`.mhtml` under the workspace is a Booqable save. The only saved pages are our own design-pack exports and mockups. |
| `BOOQABLE_DESIGN_PRINCIPLES` v1.2 | **Yes** | [`../BOOQABLE_DESIGN_PRINCIPLES.md`](../BOOQABLE_DESIGN_PRINCIPLES.md) | 10 principles, 8 anti-patterns, 3 further passes (§4 E1–E8, §5 F1–F9). Prose analysis; no columns, filters, routes or destinations. |
| The 18 Aug "51 saved screens" and 19 Aug "parity docs" | **No** | — | Cited as the evidence base at `BOOQABLE_DESIGN_PRINCIPLES.md:18`. Not in the repo or the workspace. |
| `docs/pages/` page pack | **Yes** | [`../pages/INDEX.md`](../pages/INDEX.md) | 55 docs, one per route, written 17 Aug **against source with `file:line` on every statement**. This is the repo's real measured reference. |

**Consequence — as revised at 04:40, 31 Aug.** The earlier version of this section said Layer A had
no source in this repo and could only be re-captured. **v2.5 is that source**, and it arrived while
this pack was being written. The consequence now runs the other way: the Booqable half is captured,
and the **repo half is the unverified one**.

## 2. Screens with real evidence

**All of them**, via [`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md) — 13 screen sections plus
the Settings compendium, from live read-only sessions across v1.1→v2.5.

Two have additionally been checked **against this repo and the live database** by this pack:

- **Dashboard** — [`dashboard.md`](dashboard.md), full A–F.
- **Bookings list** — analysis in [`CORRECTIONS.md`](CORRECTIONS.md) §7–§8, not yet assembled into a
  screen doc.

The other eleven have **verified Layers A/B/C and unverified Layer D**. That gap is the backlog.

## 3. Read order

1. [`../../PLAN.md`](../../PLAN.md) — the laws.
2. [`../../PROGRESS.md`](../../PROGRESS.md) — but see the caveat in §5 below.
3. [`../pages/INDEX.md`](../pages/INDEX.md) — **what is actually built.** Read the page doc for a
   screen before converting any Booqable observation into a build task. This is the rule
   `BOOQABLE_DESIGN_PRINCIPLES.md:266-268` already sets, and it is not optional.
4. [`../BOOQABLE_DESIGN_PRINCIPLES.md`](../BOOQABLE_DESIGN_PRINCIPLES.md) — direction only.
5. [`CORRECTIONS.md`](CORRECTIONS.md) — **read this before trusting any repo-side claim in the
   v1.1 spec.**

### The pack, and the question each file answers

| File | Answers |
|---|---|
| [`CORRECTIONS.md`](CORRECTIONS.md) | *Which of the v1.1 spec's claims survive contact with this repo?* 14 corrections, 5 of them blocking — plus an honest list of what it got right. **Start here.** |
| [`DECISION-SHEET.md`](DECISION-SHEET.md) | *What needs Babin, and what did this pass settle?* **Four** open blockers with costs (a fifth closed mid-pass), six documentation rulings, adopt / do-not-adopt lists, and the cheap investigations that would change a decision. |
| [`LIVE-DB-VERIFICATION.md`](LIVE-DB-VERIFICATION.md) | *What is actually in the database?* Removes the v1.1 spec's own closing limit. Includes why the Dashboard's panels render empty, and why `npm run check:db` cannot tell you. |
| [`dashboard.md`](dashboard.md) | Screen 1, full A–F. |
| [`CAPTURE-BACKLOG.md`](CAPTURE-BACKLOG.md) | *What is left, and how is it done?* **Rewritten 31 Aug.** It began as a capture backlog for ~49 unspecced screens; `REFERENCE_SPEC_v2.5.md` killed that premise by covering the whole product. It now tracks **verification** — §2's fourteen per-screen Layer D checkboxes are all ticked, and §1's blockers are not. |
| [`VERIFICATION_2026-08-31.md`](VERIFICATION_2026-08-31.md) | Which of the spec's §2.4 "measured" contracts survived checking, item by item. |
| [`LAYER-D-VERIFICATION.md`](LAYER-D-VERIFICATION.md) | *Can v2.5's backend data link be built from?* **Mostly no — 93 of 329 claims survive (28%).** Carries the **corrected contract list that supersedes v2.5 §2.4**, the consolidated gap list, and the dead-module findings. **Read before implementing any screen.** |
| [`layer-d/`](layer-d/) | The per-screen evidence behind that register — fourteen files, one per v2.5 section, each a verdict table with `file:line` or the SQL run for every claim, plus a corrected Layer D block a builder can act on. |
| [`GAP-CHECK-VERIFICATION.md`](GAP-CHECK-VERIFICATION.md) | *Does the gap check survive contact with the tree?* Mostly not. 38 claims checked 1 Sep with `file:line`: **17 confirmed / 17 partial / 4 false**. `FilterRail` and facet counts already exist; the FY/branch chip it praises does not; both load-bearing build-order assumptions are half wrong; **Returned → Closed has no verb anywhere**; and it surfaces 8 real defects the walk missed — chief among them **BS dates failing for every date after 16 Aug 2026**. Read before building any P1/P2 item. |
| [`BRIDGE-AND-CORPUS-STATE.md`](BRIDGE-AND-CORPUS-STATE.md) | *What would the corpus import actually take?* Measured 1 Sep. The bridge is **built and off-line** (109 KB `sync.ts` + 7 mappers + the proxy + a script entry point; nothing in `src/` imports it). **Read §4 before any import:** the applied 0076 seed corpus occupies `B-900…B-945`, the live Booqable numbering range, on a UNIQUE column whose rows cannot be deleted. Also §5 (two import scripts that would corrupt bookings) and §6 (a live API token in git). |
| [`GAP-CHECK_2026-08-31.md`](GAP-CHECK_2026-08-31.md) | *Does the running app match the capture?* Babin's read-only walk of localhost:3000, 31 Aug — filed 1 Sep with a verification note (read it: the acceptance test needs the corpus import as well as Wave 1 wiring, and several gap lines had already moved by filing time — D4, the 0076 corpus, facetCounts, the v1.1 picker spec). Trackable items: [`CAPTURE-BACKLOG.md`](CAPTURE-BACKLOG.md) §8. |

**Not written:** a full A–F doc for the Bookings list, and a `PARITY.md`. The Bookings-list
analysis exists but is distributed across `CORRECTIONS.md` §7–§8 and `DECISION-SHEET.md` B2/B5
rather than assembled into a screen doc. Both are the first items in `CAPTURE-BACKLOG.md`.

## 4. Measured state, 31 Aug 2026

Run today, not quoted from a dated line:

| Gate | Result | How |
|---|---|---|
| `npm run typecheck` | **exit 2 — 1 error** | run 31 Aug, after the 02:05 edit |
| `npx vitest run` | **exit 0 — 2169 tests, 87 files** | run 31 Aug, twice — before and after the 00:28 change |
| `npm run check:db` | exit 0 — 23 tables resolved live, 0 missing, 0 denied, 0 errored | run 31 Aug against `sxguwvgoserhdolewibb.supabase.co` |

**The typecheck failure is not ours and should not be fixed from here.**
`src/modules/auth/Login.tsx(5,1): TS6133 'PasswordInput' is declared but its value is never read` —
from an auth refactor another session had in flight at 02:05 (`PasswordInput.tsx`, `AuthCard.tsx`
and `Login.tsx` all touched within ten minutes). Editing it would collide with work in progress.

**The spec's §7 gate line — "2174/2174 across 88 files" — was correct for the committed state.**
The shortfall is exactly one working-tree deletion:
`src/modules/calendar/__tests__/calendar.kpiBand.test.tsx`, five tests, uncommitted. 88 − 1 = 87
and 2174 − 5 = 2169. What it guarded matters more than the count — see
[`VERIFICATION_2026-08-31.md`](VERIFICATION_2026-08-31.md) §5.1.

`check:db` reaches production **anonymously**, so every count is 0 and, in its own words, a zero
count is not evidence a table is empty and not evidence a migration is unapplied. It proves the
tables *resolve*; it proves nothing about their rows. Service-access counts are in
`VERIFICATION_2026-08-31.md` §7 — and they show `invoices`, `payments` and `booking_lines` are
genuinely empty.

**`check:db` does not cover three tables the spec §2.4 names:** `booking_line_units`,
`audit_events`, `number_sequences`. `audit_events` is verified live (5,378 rows, six triggers) in
[`VERIFICATION_2026-08-31.md`](VERIFICATION_2026-08-31.md) §7.

## 5. Two traps this directory exists to stop

**The 30 Aug handoff zips landed at different times, and one landed mid-audit.** Three sit at the
workspace root. Compared by SHA256 against the tree on 31 Aug:

| Zip | Status | Note |
|---|---|---|
| `babin-dashboard-rename-30Aug2026.zip` | applied | `nav.ts` still matches; `Today.tsx` has since been overwritten |
| `babin-operations-cases-30Aug2026.zip` | applied | `App.tsx` still matches; `OperationsQueues.tsx` has since been overwritten |
| `babin-booqable-layout-30Aug2026.zip` | **applied at 00:28:52 on 31 Aug** | `Today.tsx` and `OperationsQueues.tsx` now hash-match this zip exactly |

**The third zip was applied by another session while this audit was running.** At the first
hash pass it was unapplied; at the second, `Today.tsx` (37,391 bytes) and `OperationsQueues.tsx`
(40,365 bytes) both matched it, mtime 00:28:52. Two verification agents consequently read two
different files under the same path and reported different line numbers — the discrepancy is
real, not agent error.

Consequences that are now live rather than hypothetical:

- The Dashboard's right-hand `Rail` (Quick Actions / Quick Info) is **in the tree**, and it is
  rendered unconditionally at every non-phone width. `src/components/ui/Page.tsx:333-349` warns
  that exactly this violates the rulings-§7 requirement that collapse below 1280 means *reflow,
  not hide* — putting rail content behind a handle on the warehouse tablet this product targets.
- Any measurement in this directory taken before 00:28:52 describes the previous tree. Where that
  matters it is flagged in place.

Hash-diff before assuming, in either direction, **and re-check at the end of a long session** —
this repo is edited concurrently.

**`PROGRESS.md` lags the tree.** The repo's copy matches none of the three zips and is smaller
than all of them (814,946 bytes vs 819,179 / 821,417 / 824,450). Code from two zips landed while
their PROGRESS entries did not. PROGRESS.md is authoritative for *rulings*; it is not a reliable
census of what is in `src/`.

## 6. Standing rulings carried forward

R1–R8 of the 30 Aug spec §1 are not re-litigated here. Two are worth restating because they bound
what this directory may ever contain:

- **R1** — Booqable is a *structural* reference. Its visual design is not adopted.
- **R7 / Law 17** — the word "customer" appears nowhere in our UI. They are clients.

## 7. Status

- **Written:** this index, [`CORRECTIONS.md`](CORRECTIONS.md),
  [`DECISION-SHEET.md`](DECISION-SHEET.md),
  [`LIVE-DB-VERIFICATION.md`](LIVE-DB-VERIFICATION.md), [`dashboard.md`](dashboard.md),
  [`CAPTURE-BACKLOG.md`](CAPTURE-BACKLOG.md),
  [`VERIFICATION_2026-08-31.md`](VERIFICATION_2026-08-31.md).
- **Added 31 Aug, after this section was first written:**
  [`LAYER-D-VERIFICATION.md`](LAYER-D-VERIFICATION.md) and the fourteen files under
  [`layer-d/`](layer-d/).
- **The "~49 unwritten screen specs" line that stood here is withdrawn.**
  `REFERENCE_SPEC_v2.5.md` covers 13 screens plus the 17-page Settings compendium, so the capture
  is not the gap. The gap was that v2.5's **Layer D** was written from the §2.4 contract list this
  pack had already shown to be wrong; that is what the `layer-d/` pass checked, claim by claim.
  What still needs a live Booqable session is narrower and is listed in
  [`CAPTURE-BACKLOG.md`](CAPTURE-BACKLOG.md) §5.
- **No file under `src/` or `supabase/` was modified** in producing this directory. No migration was
  applied. Every database query was a read.

## 8. Honest limits of this pack

- **No Booqable screen was observed by this pass.** Every Booqable-side claim here is inherited from
  the v1.1 spec's 30 Aug live session and is tagged as such. Where that spec was wrong about
  Booqable, this pack repeats the error — it can only correct the repo-side half.
- **No test suite was run to verify a change**, because no code changed. The gate figures in §4 were
  run to establish the baseline, not to prove anything about this work.
- **RLS is enabled on every money table, but its policies were not tested per role.** Enabled is not
  correct. This is the highest-value follow-up in the pack and it is listed in
  [`DECISION-SHEET.md`](DECISION-SHEET.md) §5.
- **The tree changed underneath this audit** at 00:28:52 on 31 Aug (§5). Citations into
  `Today.tsx` and `OperationsQueues.tsx` are the most exposed and should be re-read before use.
- **The four remaining open blockers in [`DECISION-SHEET.md`](DECISION-SHEET.md) §1 are not resolved
  and must not be resolved by an agent.** They cost money or data to reverse. (The fifth, the
  06:00 rental day, was ruled and built by a concurrent session during this pass.)

## 9. ✅ RESOLVED 31 Aug — the v2.5 spec is now on disk

This section previously flagged that `src/lib/operationalDay.ts` cited
**`docs/booqable/REFERENCE_SPEC_v2.5.md` Appendix A0** while no such file existed in the
workspace. **It now does** — placed 31 Aug from Babin's delivery
(`Downloads/BOOQABLE_REFERENCE_SPEC_v2.5.md`), together with two companion interaction specs
from the same 30–31 Aug capture:

| File | What it is |
|---|---|
| [`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md) | The full spec lineage v1.0→v2.5 (cumulative; supersedes the v1.1 this pack audited). Fifteen areas captured live; **Appendix A0 carries the four 30 Aug rulings D2–D5**; Appendix A the open decision sheet (D1 still open). |
| [`RAIL_AND_QUICK_ACTIONS_SPEC_v1.0.md`](RAIL_AND_QUICK_ACTIONS_SPEC_v1.0.md) | Where filters and quick actions live and how they open — the FilterRail / RailToggle / QuickCreate / BulkBar / RowVerb / PanelActions component contracts, with a placement map per screen. |
| [`DATE_TIME_PICKER_SPEC_v1.1.md`](DATE_TIME_PICKER_SPEC_v1.1.md) | The two date tools (filter range picker · booking period picker with per-day availability verdicts), our three-variant picker family, and the BS render requirement — v1.1 (1 Sep) corrects §4.4 to BS-primary calendar cells, matching the live app; v1.0 is superseded in place. |

**Precedence:** where v2.5 and this pack disagree on a *Booqable-side* observation, v2.5 wins
(it is the capture). Where they disagree on a *repo-side* claim, **this pack's
[`CORRECTIONS.md`](CORRECTIONS.md) and [`VERIFICATION_2026-08-31.md`](VERIFICATION_2026-08-31.md)
win** — v2.5 §2.4 still carries the contract claims that failed re-derivation here (BrandKey's
`purple`, the `lock` icon, the 19-of-42 engine list, the 2174/88 gate figures). Code wins over
both.

**A0 implementation state, 31 Aug:** D4 (operational day setting) built —
`lib/operationalDay.ts`, `settingsStore.operationalDayStart`, `queries/bookings.ts` boundaries.
D5 (serials at creation) built at the action/RPC layer — `createRental` units,
`0071_create_booking_units_at_creation.sql` (draft, unapplied), `planCreationUnits`. D2 (portal
email binding) drafted — `0072_portal_email_binding_policies.sql` (unapplied) +
`../PORTAL_LINK_REQUESTS_CARD_SPEC.md`. D3 (discount gate) NOT acted on — awaiting Babin's
in-session re-confirmation, per the RUN_PROMPT's stop-and-confirm gate.
