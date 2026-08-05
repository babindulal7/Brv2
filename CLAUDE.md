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
