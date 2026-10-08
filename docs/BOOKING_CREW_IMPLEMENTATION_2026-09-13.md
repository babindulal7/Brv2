# Crew assignment from Booking Detail

## Delivered

Booking Detail now reads the booking's `crew_assignments_v` rows and resolves names from `crew_profiles_v2_v`, the same roster referenced by the existing `crew_assignments` foreign key. It no longer substitutes sample people or reads the unrelated `crew_bookings` model for this workflow.

Add Member and Assign Crew open a form populated from active profiles. The form collects a role, call/wrap times, a daily rate, explicit days, and notes. Dates default from the selected booking and use Nepal civil time in the controls; writes carry UTC instants. Successful confirmed writes trigger a fresh crew read. Read errors, empty lists, loading and save errors have distinct states.

The action now requires an explicit existing booking, propagates lookup errors, rejects inactive/unresolved people and terminal bookings, validates numeric inputs and date ordering, and returns actual assignment IDs. It no longer queries the nonexistent `bookings.duration_days` column or falls back to another booking. Crew rates come through the masked profile view. Inserts request only the granted `id` column; network failures are errors rather than optimistic queued successes. A form retry with unchanged details reuses its UUID. Batch callers preflight all people and use deterministic valid per-person UUIDs; batch inserts are individually idempotent, not one atomic transaction.

## Permission decision and limits

The new **priced** assignment UI and action are limited to Owner, Admin and Manager (`lib/crewAssignment.ts`). This is a conservative subset of the existing staff write policy, not a database policy expansion. Coordinator lacks crew-payout visibility under `PERMISSIONS.md`; a server-side default-rate command is needed before allowing that role to assign without receiving payout amounts. Accounts can see crew pay in the readback but cannot use this booking-edit action. Other booking viewers receive no pay columns from the new list query.

The existing dispatcher mapping and database policies were not changed. This application's narrower guard is not a claim that direct database requests have the same narrower permissions. The database's broader crew policy and concurrency-safe crew availability enforcement remain separate work.

## Validation scope

Results: 90/90 tests passed in 7 files; focused ESLint and TypeScript checks passed.

- Focused action, query, time, form and readback tests exercise saved values, failure propagation, no unrelated booking fallback, inactive and terminal refusal, retry identity, Nepal date conversion, empty roster, and omitted pay fields.
- Existing Booking Detail identity, money visibility, layout and cancellation tests were run.
- Browser smoke check used the isolated mock preview: opened Booking Detail B-818, verified Add Member and the empty crew list, then opened the modal and verified its empty-roster message and disabled save button. The demo corpus has no active `crew_profiles_v2` records, so a browser save against live Supabase was not performed.
- No migrations, live data changes or deployment. This pass does not merge the separate Crew Assist roster model or add crew-profile creation, payroll, messaging, or database-level crew conflict exclusion.

Source discovery used direct reads because code-graph tools were unavailable. Existing unrelated edits, including the operations-popup integration in Booking Detail, were preserved.
