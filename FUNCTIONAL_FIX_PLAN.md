# Babin Rentals OS — Functional Fix Plan

Ordered by risk-removed per unit of change. Derived from `FUNCTIONAL_BUGS.md`.

> ## ✅ STATUS — 2 Sep 2026: this plan is **complete**. Read this box first.
>
> Every item below has been applied, or closed with evidence, or filed as a decision.
> Sequence: items 1–3 landed 1 Sep (BUG-001/002/003); items 4–8 landed 2 Sep.
>
> | # | Item | Outcome |
> |---|---|---|
> | 1 | Icon registry / `STATUS_ICON` glyphs | ✅ applied 1 Sep, re-verified at runtime |
> | 2 | Close the type hole (`Record<StatusKey, IconName>`) | ✅ applied 1 Sep — 0 `as IconName` casts remain |
> | 3 | Client Reports pagination | ✅ applied 1 Sep — **pager deleted**: there was never a page 2 (6 rows, "209" was a literal) |
> | 4 | `Collapse All` | ❌ **VOID — do not action.** `InventoryTree.tsx` has **no importer**; the button can never render, and the live `AddBundle` already works. See PLAN.md §4.41(b) |
> | 5 | Dead buttons → `disabled` + reason | ✅ applied 2 Sep, and the count was **larger than this plan knew** — 7 more found by probing the rendered page |
> | 6 | Notifications + Help | ✅ done as far as it can go 1 Sep (fake "12" deleted, both state a reason). The **feature** still needs the ruling |
> | 7 | `/rentals/new` money actions | ✅ applied 2 Sep — and it was **not** blocked on the ruling this plan assumed. See below |
> | 8 | Unreachable report files | ⬅ filed as **PLAN.md §4.41(a)**; git recovered the route history |
>
> **Two of this plan's judgements turned out to be wrong**, both in the same direction —
> they trusted a file-level reading of reachability:
> - **#4 was scoped as an XS fix on a component nothing renders.**
> - **#7 was held behind a policy ruling it does not actually depend on.** The blocker is
>   one layer lower and ruling-independent: the screen never persists a booking, so there
>   is no invoice to attach a payment to either way.
>
> ~~**Nothing in this plan has been applied.**~~ The audit was originally run read-only
> because a second agent session was writing to this working tree concurrently (see
> `FULL_FUNCTIONAL_AUDIT.md` §7); that session's work is committed and this one built on
> top of it.

---

## Ordering principle

Two of these fixes are **mechanical** — they invent no product decision and can be done
by an agent. The rest need a ruling from Babin, because deciding what a button *does* is
a product decision, and `CLAUDE.md` forbids inventing one to unblock work.

| # | Fix | Effort | Needs a ruling? |
|---|---|---|---|
| 1 | Icon registry / `STATUS_ICON` type hole | S | No — one glyph choice |
| 2 | Close the type hole permanently | XS | No |
| 3 | Client Reports pagination | M | No — local state |
| 4 | `Collapse All` | ❌ VOID | — unreachable file |
| 5 | Dead buttons → `disabled` + reason | M | No (adopts existing pattern) |
| 6 | Notifications + Help | L | **Yes** |
| 7 | `/rentals/new` money actions | L | **Yes** |
| 8 | Unreachable report files | S | **Yes** |

---

## 1. BUG-001 — Fix the missing glyphs *(do this first)*

Highest visible damage, smallest change. Red debug text is on your primary Clients screen.

In `src/lib/status.ts:87`, three keys name glyphs that do not exist. The registry
(70 glyphs) already contains suitable ones:

```diff
 export const STATUS_ICON: Record<StatusKey, IconName> = {
-  neutral: 'circle_dashed',
+  neutral: 'dot',          // "not started yet"
   primary: 'check',
-  progress: 'progress',
+  progress: 'timer',       // "being worked / waiting" — matches Badge's own IconClock
   out: 'truck',
   in: 'return_arrow',
   danger: 'alert_triangle',
-  dim: 'circle_dashed',
+  dim: 'minus',            // "finished / inactive"
   ext: 'external_link',
 }
```

`dot`, `timer` and `minus` are all confirmed present in the registry. **The specific
glyph choice is cosmetic and reversible — say the word if you'd prefer different ones.**

## 2. Close the hole so it cannot recur

Change the declaration from `Record<StatusKey, string>` to `Record<StatusKey, IconName>`
and delete the `as IconName` casts at `ClientsDirectory.tsx:252` and
`CrewBooking.tsx:672,680,745,1024`.

This is the actual fix. With `string`, the compiler cannot see a bad glyph name; with
`IconName`, `tsc` rejects it at the source. The three bad names above would have been
caught at compile time years earlier had this been typed correctly. Two files
(`RentalsList.tsx`, `CrewBooking.tsx`) already carry comments describing this hazard —
this converts that tribal knowledge into a compiler guarantee.

Verify with `npx tsc --noEmit` plus a re-run of the runtime crawl expecting
**0 `[Icon:` artifacts**.

## 3. BUG-003 — Wire Client Reports pagination

`ClientReports.tsx:429`. The pager is presentational: labels are a hardcoded array
`['«','‹','1','2','3','4','…','209','›','»']` and `on` is `p === '1'`. Needs real page
state, a slice of the row set, and disabled ends. No product decision — the screen
already declares the intended behaviour ("Showing 1 to 5 of 209").

**Check `ProductReports.tsx:372` at the same time** — identical dead pager, but see #8
first: that file may not ship at all.

## 4. BUG-007 — `Collapse All` — ❌ **VOID, do not action**

`InventoryTree.tsx:19`. Its sibling `Select All` at the same line already has
`onClick={selectAllTree}`; this one has nothing. The collapse state shape is local and
the intent is unambiguous.

> **The premise was false.** `InventoryTree.tsx` has **zero importers** — it is one of
> three components from an `AddBundle` split (`PROGRESS.md:10209`) that was never adopted.
> The live, routed `AddBundle` (`App.tsx:348`) carries its own inline tree. Wiring this
> button would have changed nothing any user can reach, and the "XS effort, no ruling
> needed" framing would have made it look like progress.
>
> The lesson generalises: **"a sibling control works, so this one is a one-line fix" is an
> argument about the file, not about the running app.** Check the importer first.
>
> Filed as PLAN.md §4.41(b) with a `TODO(decision)` header on the file.

## 5. BUG-004/006/007 — Adopt the existing "unavailable" pattern for the rest

You already have the right convention and use it **294 times**: `disabled` +
`title="<what it would do> — <why it isn't available>"`. The remaining dead controls
bypass it and therefore lie about being live.

Applying it invents nothing — it states the truth that the control is not built yet, and
it makes the UI honest immediately even before anything is wired. Candidates:
`Receive Payment`, `Receive Deposit`, `Share`, `More`, `Import`, `New Expense`,
`Select backup or restore point`, `View`, the `BundleSummaryRail` quick actions,
`View all blocked items`, and `EvidenceWorkspace`'s `MiniBtn` trio.

For `MiniBtn` specifically (`EvidenceWorkspace.tsx:718`), the component's prop type is
`{ label: string }` — it cannot accept a handler. Either add `onClick` to the type or
mark all three call sites disabled.

> This is the single highest-value item after #1: it converts 21 lies into 21 honest
> statements, with no product decisions and no risk.

---

## Needs a decision from Babin

### 6. BUG-002 — Notifications and Help
Both dead on all 56 routes, and the bell shows a **hardcoded "12"**.

- **Notifications:** does a notification store exist? If not, this is a feature, not a
  fix. Minimum honest step: drop the fake "12" badge and disable the bell with a reason.
- **Help:** where should it go — a docs URL, a modal, a support contact? Unknown.

### 7. BUG-004 — `/rentals/new` money actions
`Receive Payment` / `Receive Deposit` on a **draft** booking raises a real workflow
question: can money be taken against a booking that is not yet confirmed? That is a
policy call with accounting consequences, and `PLAN.md §4` is where it belongs. Until
ruled, item #5 (disable + reason) is the correct interim.

### 8. BUG-005 — The two unreachable report files
`ProductReports.tsx` (517 lines) and `CasesReports.tsx` (199 lines) have no route and no
importer. Two possibilities, opposite fixes:

- They are **orphans** → delete them (and note that "nothing is deleted" is a rule about
  *entities*, not dead source files).
- Their **routes were never added** → two report screens are missing from the product,
  and their ~15 dead buttons need wiring before they ship.

I cannot tell which from the code. `data/expenseReports.ts:44` says the list is "Kept for
`ClientReports` and `ProductReports`, which import this list" — which suggests
ProductReports was *expected* to ship.

---

## Verification gate for any of the above

Same gate the project already uses, plus the new runtime check:

```
npx tsc --noEmit          # exit 0
npm run check:contrast    # 40/40
npx vitest run            # 96 files / 2282 tests
node qa-runner/full.js    # 0 [Icon:*] artifacts; dead-button count drops as expected
```

The Playwright harness lives in the session scratchpad
(`qa-runner/{lib,full,fiber,forms}.js`). **Say the word and I'll move it into the repo as
a permanent regression suite** — a test that fails when a button loses its handler or a
glyph goes missing would have caught all three P1s automatically.

---

## Before any of this is applied

1. A second agent session was editing this tree during the audit. **Confirm it has
   finished and its work is committed** before applying fixes, or the two will collide.
2. Backup is at `Desktop/Rental workspasce/QA-BACKUP-2026-09-01-4696af8/`
   (`full-history.bundle` + `worktree/`), taken at `4696af8`.
3. The audit's untested half (§12–§17: CRUD, persistence, pricing, propagation) is where
   P0-class bugs would live. Fixing buttons does not reduce that risk — running that
   stage does.
