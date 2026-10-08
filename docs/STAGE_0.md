# STAGE 0 — Stop the bleeding

**Babin Rentals OS · build spec · 23 Bhadra 2083 BS · 8 Sep 2026**
Sources: `docs/AUDIT_2026-09-08.md` (§6, §9, §14, §20), `RULINGS-2026-09-08.md`, `docs/PERMISSIONS.md` §15.

> Stage 0 closes the four P0s and installs the two instruments (lifecycle gate, completion counter)
> that every later stage is measured with. Nothing else. A task not in this file is Stage 1 or later,
> however small it looks.

---

## 0. Execution record — read this before working from the sections below

This file is the spec **as written on 8 Sep**, followed by what happened when it was executed. The
spec is kept unedited so the corrections are legible as corrections. Where §2 and §0 disagree, **§0
wins** — it is the measured result.

Two Claude sessions worked this stage concurrently in one tree. The split as it fell out:

| Task | Built by | Landed |
|---|---|---|
| S0-1 worktree purge | this session | `79f43ac` |
| S0-2 `.gitattributes` | this session | `e57d282` |
| S0-3 `0081` → `0098` | the other session | untracked at time of writing |
| S0-4 discount audit class → `0099` | the other session | untracked |
| S0-5 money-write guard → **`0102`** | this session | `aa10bef` |
| S0-6 R-26 reservations → `0100` | the other session | untracked |
| S0-7 `check:lifecycle` | the other session | untracked |
| S0-8 `completion` + PROGRESS lint | this session | `bfe5355` |

### Corrections to the spec, each measured

1. **S0-1's verification grep does not match the token.** `BOOQABLE_TOKEN\s*=\s*['\"][A-Za-z0-9]{10,}`
   returns zero while the token is still on disk, because the value contains `-` or `_`. Run as
   written it would have certified the purge before it happened. Use `[A-Za-z0-9_-]{10,}`.
2. **S0-1's `graft/.cache/` gitignore entry is redundant** — the existing `/graft/` rule covers it.
   Only `.claude/worktrees/` was missing. A worktree does not inherit `.gitignore` at all, which is
   how the token survived there for six days after being scrubbed from history.
3. **S0-2 must NOT run `git add --renormalize .`.** The index is already 100% LF — 873 entries, zero
   non-LF — so renormalising changes no blob. Its only effect would be to stage whatever the other
   session has in flight. The churn was never in the index; it was on disk, and 163 non-dirty files
   were converted there directly instead.
   Two traps met on the way: git reports a stat-dirty entry as modified without hashing it, so after
   converting line endings `git status` showed 200 modified while `git diff` showed 23 — re-adding
   the 176 byte-identical paths clears the stat cache and stages nothing. And `core.autocrlf=true`
   was *hiding* the problem, not preventing it.
4. **S0-3's branch is settled: rename.** `0081_invoice_totals_match_engine` is absent from
   `docs/live/schema_migrations_2026-09-08.txt`, so it was never applied live and R-31-as-specified
   (keep the number) is not needed.
5. **S0-4's decision procedure resolves to Path A.** `audit_event_class` is
   `status change | money movement | discount | override | session | cancellation`. There is no
   "data change" and never was; `'discount'` is the equivalent value. No enum member was added.
6. **S0-5's column list was right, and is now measured rather than remembered.** Every numeric column
   on both tables at the end of the chain: `bookings.deposit_required`, `booking_lines.{rate,
   discount_amount, supplier_cost, markup_amount, qty, days}` guarded; `bookings.version` and
   `booking_lines.sort_order` deliberately not. The migration is **`0102`**, not `0100` — the other
   session had taken `0100` for reservations.
7. **S0-6's step 1 is already done.** `inventory_reservations` already carries `released_at`,
   `released_reason`, `qty`, `product_id`, `booking_line_id` and a `state` column. The spec's "no
   `status` column" is right only because the column is called `state`.
8. **S0-7's step numbering diverged from the rulings file.** The spec cites R-26 · R-27 · R-29;
   `RULINGS-2026-09-08.md` had already used R-27 for the staff-role ruling. R-26, R-28 and R-29 are
   unwritten. This session took R-30 · R-31 · R-32.
9. **S0-8's route mapper is wrong twice, and both are fatal to the dimension.** `.from(` also matches
   `Array.from(`, which appears 89 times in `src/`; and "import tree depth 2" makes every route look
   identical (49 of 55 mixed at depth 1, 54 of 55 at depth 2) because every page imports a shared
   query module. See `scripts/completion.mjs` for what replaced it.

### One finding that is not a defect

`unique (client_uuid)` on 114 tables looks like a schema disaster — one row per tenant, forever. It
is not. **Law 8's `client_uuid` is an idempotency key, not a tenant id**: "every write carries a
`client_uuid`; duplicates rejected" means the writer generates a fresh UUID per write and a replay is
refused. The chain's own seed proves it — 6 `inventory_categories` rows across 6 distinct values. Any
harness that reuses one value across rows will be refused, and that refusal is correct.

### Still open at the end of this session

- **S0-1 rotation is Babin's** and has not happened. Until it does, the old key remains valid. The
  purge makes it unreachable from this tree; it does not make it inert.
- **§1's live backup has not been taken.** Nothing here has been applied to live and nothing should
  be until it is. `0098`–`0102` are all N-5 blocked.
- `docs/AUDIT_2026-09-08.md` is referenced throughout and does not exist in this repo.

---

## 1. Scope, exit, budget

| | |
|---|---|
| **In scope** | S0-1 token rotation + worktree purge · S0-2 line-ending normalisation · S0-3 migration renumber · S0-4 discount path (`audit_event_class`) · S0-5 money-write guard on `bookings` / `booking_lines` · S0-6 R-26 reservations written by the database · S0-7 `check:lifecycle` v0 · S0-8 `npm run completion` + PROGRESS.md rule |
| **Out of scope** | stage-gate trigger, close gate, void trigger, `users` policy, `product_units.status`, any of the 22 actions, any screen, any seed removal — all Stage 1–3 |
| **Exit** | P0 #1–#4 closed **in PGlite and on the live project** · `check:lifecycle` L1 L2 L3 L4 L5 L12 L13 green · `npm run completion` prints DB enforcement **6 / 9** · working tree clean · PROGRESS.md entry ends with the R-29 blocks |
| **Authority** | PERMISSIONS.md §15: Claude resolves every conflict met here without asking, logs it three places, **never applies a migration to the live project (N-5)**. |

### Sequence and why

```
S0-1 token          ─ independent, do first (exposure clock is running)
S0-2 .gitattributes ─ before any code commit, or every later diff is 190 files
S0-3 renumber       ─ before any new migration takes a number
S0-4 audit enum     ─ before S0-7 (L1 needs a discounted booking)
S0-5 money guard    ─ independent migration
S0-6 R-26           ─ depends on S0-3 numbering; L2–L5 need it
S0-7 lifecycle      ─ needs S0-4 + S0-6 to go green; write it early, watch it turn
S0-8 completion     ─ last; prints the stage-exit numbers
```

---

## 2. Preconditions (Babin, before the first build session)

1. **Backup the live project** — dashboard → Database → Backups → create, note the timestamp in
   PROGRESS.md. Nothing in Stage 0 runs against live without it. **NOT DONE.**
2. **Export the applied-migration list** into `docs/live/schema_migrations_2026-09-08.txt`.
   **DONE** — 87 rows, by read-only query. Live tops out at `0078_daily_closings` (1 Sep) plus the
   hand-applied `0089`. Everything from `0079` up except `0089` is repo-only.
3. **Confirm the local toolchain** — `npm run check:pglite` green. **DONE**, 100/100.
4. `git config core.autocrlf false` on the Windows checkout. **DONE**, with `.gitattributes` as the
   authority.

---

## 3. Tasks

### S0-1 · Rotate the Booqable API token; delete the worktrees

**Evidence.** A 23-character `BOOQABLE_TOKEN` literal is in committed history (introduced ≤ `9c81017`,
removed `d15906a`) and was still on disk in both `.claude/worktrees/*/scripts/*.mjs` and each
worktree's `graft/.cache`. **P0.**

**Babin does (cannot be delegated):** revoke the key in Booqable, create a new one, put it in
`.env.local` as `BOOQABLE_TOKEN=` and in the CI secret store. Nowhere else.

**Claude does:** remove both worktrees and their branches (both were at `369b373`, fully merged into
HEAD, dormant since 2 Sep, and their only uncommitted changes were four graft config files with
empty diffs), add `.claude/worktrees/` to `.gitignore`, verify by count that no token-shaped literal
remains — with the corrected character class, per §0.

**History is not rewritten** (S0-c). The branch is 107 commits ahead of `main` with a live Windows
checkout; rotation makes the old value inert and a force-push here risks more than it saves.

**Acceptance.** Old key returns 401 · grep count 0 · `git worktree list` shows one entry.

---

### S0-2 · `.gitattributes` and line endings

**Evidence.** No `.gitattributes`; `core.autocrlf=true`; 186 of 873 tracked files CRLF on disk. The
churn never showed in `git status` — it showed the moment anyone flipped the config, and then every
real diff was buried under ~170 files differing only by a carriage return.

**Steps.** Create `.gitattributes` with `* text=auto eol=lf` (which beats `core.autocrlf` in every
clone), convert the working tree, set `core.autocrlf false`. **Do not run `git add --renormalize .`**
— see §0 correction 3.

**Acceptance.** `git ls-files --eol | grep -c "w/crlf"` is 0 for every file not in another session's
uncommitted work. Achieved: 854 LF, 8 CRLF (all in the other session's live files), 1 mixed.

---

### S0-3 · Migration renumbering

`0081_invoice_totals_match_engine.sql` was numbered below `0085–0097`: PGlite applied it before
`0085`, production would apply it after `0097`. Renamed to `0098`. The duplicate numbers `0056` ×3
and `0076` ×2 are **not** renamed — they are applied live; they get a header comment saying so.

---

### S0-4 · Discounts can be created — `audit_event_class`

`create_booking` wrote the literal `'data change'`, which is not a member of `audit_event_class`.
**No booking with a discount could be created through the only path that creates bookings**, since
`0063` introduced the discount loop. Postgres cannot reject an unknown enum label at
`create function` time, so the chain built green and the failure waited for the first discounted
booking. Fixed in `0099` by changing the literal to `'discount'` (Path A). **P0.**

---

### S0-5 · Money-blind roles cannot write booking money

**Evidence, reproduced in PGlite over the full chain as a Warehouse seat, before the guard existed:**

```
update bookings      set deposit_required = 0     ->  ALLOWED   (5000 -> 0)
update booking_lines set rate = 1                 ->  ALLOWED   (6500 -> 1, and it stuck)
update booking_lines set qty = 99                 ->  ALLOWED
```

while `select deposit_required` is refused to the same seat by the column mask. `authenticated` holds
UPDATE on both tables, so this is one PostgREST PATCH. **P0.**

**Why a trigger and not a column grant.** All staff share the Postgres role `authenticated`; a
column-level `REVOKE UPDATE` would block Coordinator and Owner too. The role is known only through
`auth_can_view_money()`, so the check must run per row and compare OLD against NEW.

Built as `0102`, modelled on `0092`. Raises `42501` (HTTP 403) with a message beginning `Law 6:`.
`discount_amount → 999999` was already refused before the guard — but by a CHECK constraint capping
the value, not by Law 6; a smaller discount went straight through. Coincidental cover is not cover.

⭐ **S0-a** — `qty` and `days` are guarded although they are not money columns: they are the two
multiplicands of every line total. Partial pickup goes through `booking_line_units`, not a line
UPDATE, so the floor case is unaffected. Flip by deleting two comparisons.

**INSERT is not guarded.** `booking_lines_all` admits a direct Warehouse INSERT carrying any rate.
Real, and Stage 1's: it needs a rule about who may add a line at all, which is a permission question.

---

### S0-6 · R-26 — reservations written by the database

**Evidence.** `#900` (unit X, 10–12 Sep) and `#901` (same unit, 11–13 Sep) both reached **Booked**
with `inventory_reservations` at 0 rows. The GiST exclusion constraint and `0045`'s capacity ceiling
are both real and both guard a table only the browser ever filled — one call site,
`confirmRental.ts → reserveAssignedUnits`. A defence nothing is obliged to arm is not a defence.
`0003` asked for the trigger four times in its own comments. **P0.**

Built as `0100`: an `after insert on booking_stage_transitions` writer, release on
`Returned`/`Closed`, release on cancellation, extension re-sizing the period, and a backfill
recording real double bookings already in live data into `reservation_backfill_conflicts`. The app's
insert path becomes a read-only pre-check that names the colliding booking numbers.

---

### S0-7 · `check:lifecycle` v0 — the stage gate

**Evidence.** 2,834 unit tests green while the database accepted a double booking. Neither P0 was a
missing test: the suite exercises `src/actions/*` against the mock client, which has its own audit
path, its own reservation path, and no enum to cast to. A seam that mocks the thing being asserted
cannot report on it.

`scripts/e2e-lifecycle.mjs` applies the chain to PGlite, seeds its own world, and asserts L1–L13.
L1–L5, L12, L13 implemented; L6–L11 declared **known-red** so the denominator does not move when the
work lands. Writes `.lifecycle-result.json`.

**The header must state the limit:** PGlite is not Supabase — no JWT, no PostgREST, and it builds an
empty database, so it cannot reproduce a failure that depends on production's rows. Green is
necessary, not sufficient.

---

### S0-8 · `npm run completion` and the PROGRESS.md rule

Five fixed dimensions, mean = Overall, **counted never typed**. `scripts/completion.mjs` refuses to
print at all rather than show a dimension it could not compute. `scripts/lint-progress.mjs` fails the
newest PROGRESS.md entry if it lacks `### Completion` or `### Remaining` (`###`, not `##` — entries
are `##`, and a `##` sub-heading would split the log).

Backend `18 / 40` is the script's own test: it reproduces the audit's independently-derived figure.

---

## 4. Apply to live (Babin, after the backup)

Never before the backup. Order is file order: `0098 → 0099 → 0100 → 0101 → 0102`.

1. `0098` invoice totals — check totals unchanged on issued invoices.
2. `0099` audit class — `select prosrc from pg_proc where proname='create_booking'` no longer
   contains `'data change'`.
3. `0100` reservations — **read the `raise notice` counts** and open
   `reservation_backfill_conflicts`: every row is a real double booking already in live data.
4. `0101` staff roles.
5. `0102` money guard — as a Warehouse seat, the three updates return `42501`.

Then `npm run completion` and paste both blocks into PROGRESS.md.

---

## 5. Boundaries (PERMISSIONS.md §15.2)

- **N-5** — no migration is applied to `sxguwvgoserhdolewibb` by Claude. Written, numbered,
  PGlite-tested; Babin applies after the backup.
- **N-6** — no `system_role` value and no released capability string is renamed in Stage 0.
- **N-8** — no token is printed, logged or committed; verification is by count.

## 6. Open ⭐ (defaults taken; flip by row)

| ID | Question | Default |
|---|---|---|
| S0-a | Guard `qty`/`days` for money-blind roles, or money columns only? | Guard them — partial pickup goes through `booking_line_units`. |
| S0-b | Backfill conflicts: block the migration or record and continue? | Record and continue; Babin resolves by hand. |
| S0-c | Rewrite history to purge the old token? | No — rotation suffices. |
| S0-d | Path A (change literal) vs Path B (add enum value) for S0-4 | **Resolved: A.** `'discount'` already exists. |
| S0-e | Extension re-sizing the reservation period now, or in Stage 2? | Now — the rule belongs to the table. |
