# AV workflow review — 12 September 2026

This is a bounded source review and local verification, not a production or browser acceptance test. The code graph transport was unavailable; evidence came from current source. Existing uncommitted work was preserved.

## Verified

`node scripts/e2e-lifecycle.mjs`: 17/17 passed, zero known-red steps. This exercises booking creation, reservations, overlapping-unit refusal, same-day turnaround, quantity capacity, packing/handover, partial return, invoice immutability, payment restrictions and settlement, close gates, money visibility, audit protection, client isolation, unit ownership and price guards against isolated PGlite Postgres.

This does not test Supabase JWT/PostgREST integration, production data drift, or rendered screens.

`node node_modules/vitest/vitest.mjs run src/lib/__tests__/secureStorage.test.ts`: 12/12 passed after the browser fallback fix below.

`npm run typecheck`: passed, exit 0.

## Fixed: browser session fallback

`src/lib/secureStorage.ts`: a failed localStorage write previously stored a refreshed session in memory, but the next successful localStorage read returned the old session (or null). Failed removal could likewise expose the old session. Pending values and removal tombstones now override persistent reads for the adapter lifetime; successful persistence clears them. Regression tests cover write failure with readable storage, removal failure, and recovery without resurrecting fallback data.

Memory fallback does not persist across reloads. A failed physical removal cannot guarantee erasure of the underlying stored value across reloads.

## Remaining gaps, in practical order

Follow-up, 13 September: the booking-scoped crew form and readback described in item 1 below are now implemented. See `BOOKING_CREW_IMPLEMENTATION_2026-09-13.md` for validation and remaining permission/roster limits. The original finding is retained as the review history.

1. **Crew assignment from a booking.** `src/actions/crew/bookCrew.ts` implements the write, but `src/modules/crew/CrewBooking.tsx` still presents booking as unavailable because it has no booking/person/date form. `src/modules/rentals/BookingDetail.tsx` wraps Add Crew in `Unavailable` and renders a note instead of loading booking crew. The backend action count does not establish a usable crew workflow. Implement and verify a booking-scoped crew form and readback using the existing action and permission model.
2. **Native shells need implementation and device verification.** `android/app/src/main/java/com/babinrentals/os/MainActivity.java` is an empty AppCompatActivity; its onCreate only calls super. `src-tauri/src/main.rs` returns password bytes directly from the Stronghold key derivation callback despite comments describing Argon2id. Browser unit tests and frontend builds do not verify either native shell. Native adapters also catch write failures into memory while their read-failure paths return null; native persistence should be addressed before claiming native readiness.
3. **Completion reporting needs scope labels.** `scripts/completion.mjs` counts action flags, data imports and capability mappings, and reads lifecycle results. These are useful implementation metrics, not proof of complete UI workflows or native readiness. The latest progress entry's 100% should be read within those dimensions only.

No live records, migrations, deployments, or external messages were changed by this review.
