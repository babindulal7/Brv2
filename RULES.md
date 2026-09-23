# Babin Rentals OS — Durable Architectural & Engineering Rules

This file defines non-negotiable operational, architectural, and workflow rules for Babin Rentals OS. All agents, developers, and workflows must strictly adhere to these rules.

---

## DATABASE SAFETY

- **Never apply a production Supabase migration that can alter workflow/state/data semantics without a verified recoverable backup unless the owner explicitly overrides this rule.**
- **A migration file being written or passing tests does NOT mean it has been applied to production.**
- **`PROGRESS.md` must distinguish exactly between WRITTEN, VERIFIED, APPLIED, and PRODUCTION-VERIFIED migrations.**
- **Never mark a migration APPLIED without checking the actual remote migration/database state.**
- **Never silently reset, recreate, seed over, or destructively modify the production database.**
- **Do not use `supabase db reset` against production.**
- **Never expose, log, commit, or paste Supabase database passwords, service-role keys, access tokens, or complete credential-bearing connection strings into repository files.**

---

## BACKUP / LOCAL DATABASE

- **The owner prefers a Docker-free database backup/local-copy workflow.**
- **Do not introduce Docker as a requirement merely for making a production backup.**
- **Native PostgreSQL tools such as `pg_dump` and `pg_restore` may be used for production backup and local database copies.**
- **A local PostgreSQL copy is a backup/development copy, NOT an automatically synchronized source of truth.**
- **Production Supabase remains authoritative unless an explicit architecture decision changes this.**

---

## STATE MACHINE / WORKFLOW

- **Database-enforced rental lifecycle invariants are authoritative; UI checks must never be the only protection.**
- **Every state transition must fail closed.**
- **A failed, uncertain, stale, or unauthorized transition must never be shown as successful.**
- **Do not optimistically advance local booking state if the authoritative transition did not succeed.**
- **Retrying an operation must not create duplicate side effects.**
- **Rental close must be rejected while any blocking unresolved/non-voided damage finding exists.**
- **UI must never bypass the pending-damage close gate.**
- **Damage resolution must record actor, timestamp, resolution state, and required notes/audit information.**
- **Multiple damage findings must all be evaluated; resolving one must not incorrectly unblock closure when another blocker remains.**

---

## ATOMIC RENTAL CREATION

- **Booking + booking lines + crew + transport/delivery creation must obey one atomic failure boundary.**
- **Failed rental creation must not leave orphaned or partial crew, transport, booking-line, or booking records.**
- **Do not restore the deleted partial-confirm fallback unless there is an explicitly approved architecture change.**

---

## VALIDATION

- **After a database/workflow change, run the repository's complete applicable validation gates before declaring the task complete.**
- **A green unit test suite alone is not sufficient for production readiness.**
- **When a DB migration is involved, also test the real post-migration workflow against representative data.**
