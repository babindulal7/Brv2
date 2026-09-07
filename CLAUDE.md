# Babin Rentals OS

**Before writing any code in this project:**

1. Read [`PLAN.md`](PLAN.md) — the laws, the build order, and the decisions that block work.
2. Read [`PROGRESS.md`](PROGRESS.md) — what state the build is actually in.

**Before ending a session:** update [`PROGRESS.md`](PROGRESS.md) with what changed, **how it
was verified**, and what is now blocked. Log verification, not intention — "typechecks" and
"works" are different claims.

---

## Hard rules

- **Stay inside the current phase** in `PLAN.md`. The ordering is dependency-driven.
- **Never invent a product decision** to unblock yourself. Mark `TODO(decision)`, add it to
  `PLAN.md §4`, and work on something unblocked.
- **Never apply a migration to a live Supabase project** without explicit approval.
- **Verify by driving the app**, not by reading the code you just wrote.

## The ones most easily broken

Full list in `PLAN.md §0`.

- Pages never implement business logic — the engines own it
- Nothing is deleted; every entity has a named terminal action
- Payments are immutable — corrections are reversal rows
- Deposits are liabilities — never touch Rental Total or Outstanding
- Warehouse sees no money — enforced by RLS, not the UI
- Store AD in UTC; BS is rendered, never stored
- Every write carries a `client_uuid`; duplicates rejected
- Never colour alone; errors inline, toasts for successes only
- No platform branch in a layout component
- The word "customer" appears nowhere in the UI — they are clients

## Specs

[`../mds and photos/Babin Rentals OS/`](../mds%20and%20photos/Babin%20Rentals%20OS/) —
canonical is `00 Getting Started/Foundation Specification.md`. Where anything disagrees with
Foundation, Foundation wins. Never build from `_Archive/`.

---

## Authority to resolve conflicts

Copied verbatim from [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) §15, which that section
requires (§15.5). **The full permission matrix lives there — §3 (module × role), §4 (capability
catalogue), §5 (money visibility) and §6 (approval gates). This file does not restate them.**
Where any spec disagrees with `PERMISSIONS.md` about who may do what, that file wins.

### Build-time authority — Claude resolves conflicts

**Ruled 7 Sep 2026.** While building the app, Claude (Claude Code or a chat session working on the repo) **may make any change needed to resolve a conflict, gap or ambiguity without stopping to ask** — in this document, in any spec, in code, in a migration file. The build does not wait for a ruling round. Babin reviews by flipping logged rows, not by being asked mid-task.

#### 15.1 Always

| # | Rule |
|---|---|
| **B-1** | **Stricter wins.** When two sources disagree on a permission: deny over allow, DB over UI, fewer roles over more. A conflict is never resolved by widening. |
| **B-2** | **Three-place log, same commit.** Every decision goes to (1) `RULINGS-<date>.md` in the repo, (2) PROGRESS.md under *Ruled* (house format Did / Ruled / Verified), (3) a `// RULING <date>: <one line>` comment at the code or migration site. |
| **B-3** | **This document moves with the code.** A ruling that changes a cell, a capability or a gate edits §3/§4/§6 and the T-1 fixture in the same commit. The doc never lags. |
| **B-4** | **Gates stay green.** tsc 0, vitest green, build exit 0 after the change — a ruling that breaks a gate is not a ruling, it is a bug. |
| **B-5** | **Business figures are ⭐.** Thresholds, fees, percentages, retention periods: take the §13 default (or the most conservative figure in any source), mark ⭐, move on. |
| **B-6** | **Reversible by design.** Prefer the change that can be undone with one edit. Write the revert in the ruling ("revert = remove Warehouse from line 42"). |
| **B-7** | **Silence is not supersession.** A newer document that does not mention a rule has not cancelled it (RULINGS-2026-09-04). |

#### 15.2 Never — even to resolve a conflict (Babin's explicit word required)

| # | Boundary | Why it is fixed |
|---|---|---|
| **N-1** | Add a role to the money-visible set, or remove one from `Warehouse · Technician · Driver · Client`. | Law 6 is the product's spine; a "small" widening leaks every figure. |
| **N-2** | Move any item off the Owner-only list (§6.2). | These are the irreversible actions. |
| **N-3** | Make `rbac.ts` more permissive than RLS for any capability (P3). | Produces "saved" toasts on refused writes. |
| **N-4** | Add a delete permission, an audit UPDATE/DELETE path, or a payment edit (P5, P6, Law 5). | Immutability is not configurable. |
| **N-5** | **Apply a migration to the live Supabase project.** Write it, number it, test it locally — do not run it. Babin applies after the backup step. | Live DB has 246 bookings and a Booqable bridge; PHASE-0-PLAN backup-first rule. |
| **N-6** | Rename or drop a `system_role` enum value, or a capability string already in a released build. | 63 files carry the literals; renames invalidate every policy expression. |
| **N-7** | Turn on any Client Portal write path before test D-5 passes. | Cross-client data exposure. |
| **N-8** | Rotate, print, log or commit a credential or API token. | The 5 Sep audit found one in the working tree — the fix is rotate + Edge Function secret, and that is Babin's action. |

Anything not in this table is Claude's to decide.

#### 15.3 Resolution order

When sources conflict, read in this order and stop at the first that answers:

```
1  PERMISSIONS.md (this file)            — for anything about who may do what
2  RULINGS-*.md, newest first            — dated rulings
3  MASTER.md                             — implementation detail
4  Foundation v3.0 · UI_UX.md            — engines, look
5  The module spec                       — page behaviour
6  The code as found                     — what actually runs today
```

If none answers: choose the option that is **(a)** stricter, **(b)** least code, **(c)** reversible — in that order. Record which of the six sources were consulted and why they did not settle it.

#### 15.4 Session report

Each build session ends with one table Babin can scan on a phone:

| Conflict | Sources that disagreed | Decision | Why | Changed where | Revert |
|---|---|---|---|---|---|
| e.g. Handover required Manager override for unpaid release | Handover v1.1 §gates vs 21 Jul soft gate vs 7 Sep ruling | Any staff, warning + audit | §6.1 row 1; stricter reading would block the floor at 6 AM, which is the one case the soft gate exists for | `handoverRental.ts:88`, Handover checklist, §3.1 W2 | restore the override branch, one `if` |

A row Babin disagrees with is flipped by replying with the row number. That reply becomes the next `RULINGS-<date>.md` entry.

#### 15.5 Where this clause lives

Copy §15 verbatim into `CLAUDE.md` under a heading **"Authority to resolve conflicts"**, so every Claude Code session reads it at start. `CLAUDE.md` points back here for the full matrix; it does not restate §3–§6.
