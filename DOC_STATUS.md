# DOC_STATUS — which of this repo's documents can still be trusted

**16 August 2026.** Sixteen governance and audit documents were read together and checked
against `PLAN.md` and `PROGRESS.md`. Several described an application that no longer exists.
This file records which, with the evidence, so nobody acts on a superseded finding.

**The rule this file exists to enforce:** an audit is a measurement with a date on it.
`DB_CHECK_WALKTHROUGH.md` records what happens when a dated measurement is repeated as present
tense — a three-day-old row count produced destructive advice, given three times. The same
failure was available in six more files here.

**Read order for anyone starting work:** `CLAUDE.md` → `PLAN.md` → `PROGRESS.md`. Nothing else
in this list outranks those three.

> **Actioned 16 Aug 2026.** Every banner below is now in the file it names, `BUTTON_AUDIT.md`
> has moved to `docs/archive/`, and the 24 untracked engine findings are registered as
> `PLAN.md` §4.35. Three claims in the original review were themselves wrong on inspection —
> recorded in §8, because this file is subject to its own rule.

---

## 1 · The register

| Document | Dated | Verdict |
|---|---|---|
| `CLAUDE.md` | live | **Current.** No change needed. |
| `PLAN.md` | live | **Authoritative.** Open blockers: §4.34 (dated — breaks 17 Aug), §4.33, §4.32, §4.29, §4.35. |
| `PROGRESS.md` | live | **Authoritative.** Newest-first. |
| `README.md` | rewritten 16 Aug | **Current.** Status section and all font claims corrected — see §3. |
| `ARCHIVE_AUDIT_2026-08-15.md` | 15 Aug | **Current**, four items amended in place — see §4. |
| `CAPABILITY_MAPPING_2026-08-16.md` | 16 Aug | ✅ **Applied.** Banner added; kept as the derivation record. |
| `WIREFRAME_RULINGS_2026-08-12.md` | 12–13 Aug | **Rulings stand.** §9 items 3a and 4–13 still open. |
| `DB_CHECK_WALKTHROUGH.md` | 15 Aug | **Mostly current**; two items answered — banner added, see §5. |
| `BUG_SWEEP_ENGINES_v1.1.md` | 11 Aug | ⚠ **Live. Now registered** as `PLAN.md` §4.35 — see §6. |
| `BUG_SWEEP_ENGINES_v1.2.md` | 11 Aug | ⚠ **Live. Now registered** as `PLAN.md` §4.35 — see §6. |
| `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` | 12 Aug | ✅ **Closed 15 Aug.** Bannered, kept as history. |
| `AUDIT_FINDINGS.md` | 9 Aug | ✅ **Closed.** Bannered, kept as history. |
| `WIRING_AUDIT_2026-08-11.md` | 11 Aug | ⛔ **Stale in all three headlines.** Bannered. |
| `BUG_SWEEP_REGISTER_v1.0.md` | 10 Aug | ⛔ **Verdict superseded.** Bannered. |
| `BUTTON_AUDIT.md` | Phase 1 | 🗄 **Archived** to `docs/archive/`. |
| `SCREENS.md` | wireframe era | **Reference only.** Not a build target. |

---

## 2 · The four banners — applied

All four are in place, above the existing title in each file. They are deliberately short: the
point is to stop a reader before the first table, not to re-argue the finding.

- **`WIRING_AUDIT_2026-08-11.md`** — all three headlines disproven. W-B1 records
  `0044`/`0045`/`0046` unapplied (they were applied the same day this was written); W-B2 says
  every operational table is empty (121 bookings live); W-F1 says no screen is connected (52
  of 52 routes driven). Acting on it today means re-applying applied migrations against a
  populated production database.
- **`BUG_SWEEP_REGISTER_v1.0.md`** — verdict and compile baseline both predate the 11 Aug fix
  wave. Its P2/P3 tail was never individually re-checked and may still hold.
- **`AUDIT_FINDINGS.md`** — closed; #1 needs re-checking against the current `NewRental.tsx`.
- **`SUCCESS_FABRICATION_REGISTER_2026-08-12.md`** — closed 15 Aug; the defect *class* is worth
  keeping, the site list is spent.

`BUTTON_AUDIT.md` was archived rather than bannered: every row reads `TBD` and it inventories a
screen set three rounds of cuts have changed (routes 73 → 66 → 54).

---

## 3 · `README.md` — rewritten, and it was worse than reported

The original review asked for one row to be updated and Inter dropped from `index.html`.
**Both instructions rested on stale premises.** Verified against the running app:

- **`--font-sans` does not exist.** It was replaced by a three-way split: `--font-display`
  (Outfit), `--font-body` (Source Sans 3), `--font-id` (JetBrains Mono Variable).
- **Inter is not loaded anywhere** — not in `index.html`, not in `theme.css`, not in
  `document.fonts`. There was nothing to drop.
- **`index.html` contains no font references at all**; faces are self-hosted `.woff2`.
- The README's "Fonts: **Inter** (UI)" line was wrong on both counts and is corrected.
- **Status section rewritten.** "Schema first — this scaffold exists so the database work has
  somewhere to land" understated a 54-route application on a live schema by a wide margin.

The **other five token rows** — radius scale, `--rail-w`, `--head-h`, motion steps, icon set —
are still open and still block Phase 4 (`PLAN.md` §4.1). Unchanged.

---

## 4 · `ARCHIVE_AUDIT_2026-08-15.md` — four items amended in place

Still the best single status document in the repo.

- **B1 (capability switch) — ✅ CLOSED 16 Aug.** 11 cases → 32, with a mutation-tested
  regression guard.
- **B8 (Law 6 / `deposit_required`) — ⚠ HALF CLOSED.** `0061` applied and verified live;
  both call sites moved; `0062` written and correctly held back. **Until `0062` applies, Law 6
  on these columns is a UI convention.**
- **B4 (nothing reserves inventory) — SUPERSEDED by `PLAN.md` §4.30.** Confirm-time assignment
  now writes `inventory_reservations` directly. ⚠ The table still holds 0 rows, so the first
  confirm through that path is also its first real test — unproven, not done.
- **B10 (BS calendar) — ⏰ ESCALATED.** No longer "eleven months unreachable": it breaks
  **tomorrow**. See §7.

Its §7 ("Still unexamined") has not been worked and should be read as still true — in
particular the inbound Booqable path and the arithmetic of the 45 reports.

---

## 5 · `DB_CHECK_WALKTHROUGH.md` — two open questions answered

- **"Something else populated this database."** Answered: the seed corpus went in outside the
  migration table, and the recorded `0047` is a different 811-character tail patch. Worse,
  `0056_auth_role_falls_back_to_auth_uid` is applied **with no source file**. **A fresh
  environment built from this directory does not reproduce production** — `PLAN.md` §4.33(3).
- **"26 unmapped capabilities."** Closed. Only the three `inspection.*` remain, deliberately.

Its per-page walkthrough is still the right shape; the count moved to **52 of 52** routes.

---

## 6 · The gap this review found — now closed as a process failure

`BUG_SWEEP_ENGINES_v1.1.md` (14 findings) and `v1.2.md` (10) were referenced **nowhere** in
`PLAN.md` or `PROGRESS.md`. Twenty-four engine-layer findings filed on 11 Aug, never entered
into the plan, sitting in `src/lib/` — which is where `PLAN.md` §0 puts the laws.

**Registered 16 Aug as `PLAN.md` §4.35**, with the five highest-value rows named: `R3-2`
(deposit vs credit-limit — two engines, opposite answers), `R3-4` (`moneyScope` fails open),
`R3-1` (four discount implementations; a negative discount is a price rise), `R3-5` (audit
failures swallowed), `R3-6` (`parseCsv` accepts an unterminated quote, feeding bulk import).

Both sweeps carry the same caveat and it still applies: **read, not run.** Re-verify each
against the current tree before working it.

`v1.2`'s closing observation is carried into §4.35 because it is the more useful finding: Law 1
has been followed well, and the failure mode that replaced logic-in-pages is **duplication
between engines** — every copy in the correct architectural layer, each right in isolation.

---

## 7 · ⏰ The one thing with a deadline

**`PLAN.md` §4.34 — the BS calendar stops converting on 17 August 2026.** `bs.ts` knows one
month (Shrawan 2083, 32 days, anchored 16 Jul 2026). Day 32 is **16 Aug — today**. Tomorrow
every BS date in the application is `null`.

**It cannot be fixed from inside this workspace.** The only month-length table here
(`Date Engine.md` §2.1) is marked *"DO NOT SEED — arithmetically impossible"* by its own
author, and re-derivation confirms it: the row sums to 366 where BS 2083 totals 365, and puts
Baishakh+Jestha+Ashadh at 94 days where the document's own anchors are 93 apart. Nor can the
gap be derived — the known anchors fix only the sum of the first three months and say nothing
about Bhadra, the month that begins on 17 Aug.

**Needed from the owner: the Nepal Calendar Determination Committee's published lengths**, at
minimum 2083–2084. Everything else is ready. **Do not let anyone unblock this by typing a
plausible row** — a wrong table puts wrong dates on VAT filings, which is worse than `null`.

---

## 8 · Where this review was itself wrong

Recorded because this file is subject to its own rule.

1. **"Drop Inter from `index.html`."** Inter is not in `index.html`, or anywhere else. The
   instruction could not have been carried out.
2. **"Update the `--font-sans` row."** That token no longer exists; the row was void, not
   wrong.
3. **`E-P0-1` described as "Data entry, not a decision."** True in principle and misleading in
   practice: the data is not available in this workspace and the one table present is
   known-false. It is blocked on an external source, not on someone finding time to type.

---

## 9 · Maintenance

- An audit file gets a **date in its filename or its first line**, and a verdict line added
  when it closes. Six files here needed the verdict and did not have it.
- **A finding that is not in `PLAN.md` §4 is not tracked**, whatever document it lives in.
- When a claim in an audit is disproven, **amend the audit** — do not rely on the reader also
  having read the entry that disproved it.
- **Stale prose has now driven a wrong conclusion five times this week**: `0047`'s header,
  `0058`'s header, `confirmRental`'s `BK-` comment, `PLAN.md` Phase 7, and this review's own
  font instructions. The database and the code have been right every time; the sentences about
  them were not.

**One thing worth restating, since every gate table in this repo now reads green:** 1,982
passing tests coexist with roughly two dozen unbuilt actions, because the untested surface is
exactly the unbuilt surface. **Green means "what exists is correct", not "the system works".**
