# SPEC — P0-3 · Booking numbering and the corpus

**Ruling basis:** R-10, R-11, R-12, R-18
**Blocks:** the real Booqable corpus cannot be imported.
**Verified against live** 4 Sep.

---

## 1. Live state, and two things the audit did not catch

`number_sequences` on 4 Sep:

| key | prefix | pad | year | current |
|---|---|---|---|---|
| booking | `B-` | 1 | no | **917** |
| client | `C-` | 1 | no | 750 |
| invoice | `INV-` | 1 | no | 120 |
| payment | `PAY-` | 4 | **yes** | 93 |
| equipment | `EQ` | 6 | no | 1150 |
| bundle / expense / membership / quote / deposit | — | — | no | 0 / 0 / 0 / 0 / 89 |

**Finding A — the booking sequence is behind its own data.** Bookings run to `B-945`; the counter sits at 917. The next call to `next_document_number('booking')` returns `B-918`, which already exists, and `bookings_booking_no_key` rejects it. This is not the latent collision the audit describes — **the very next mint fails.** Any OS-created booking today errors out.

**Finding B — there is no `BK` sequence.** The audit says a re-import would duplicate all 200 rows under fresh `BK` numbers. It would not: `next_document_number` raises `Number sequence BK does not exist` on the first call. The re-import is broken rather than corrupting, which is better, but the practical position is unchanged.

**Finding C — `payment` resets yearly.** `include_year = true` breaches the 15 Aug never-reset ruling. Fixed by R-18.

---

## 2. Target state

- `bookings.booking_no` holds a **bare integer as text**: `700`, `946`, `90000`.
- The `#` is rendered at display only — lists, detail, documents, search, print, WhatsApp.
- Existing #700–#899 keep their numbers, aligned with Booqable (R-10).
- The 46 seed bookings move to the 90000 band (R-11).
- Every other document prefix is unchanged (R-12).

**Why bare:** `#` is a URL fragment delimiter. `/rentals/#920` never reaches the server, and the same breaks any link pasted into WhatsApp. Storing bare also lets the column sort numerically.

---

## 3. Migration `0085_booking_numbers_bare`

Single migration, single pass over `booking_no`. Two passes risk tripping the UNIQUE constraint halfway.

**Before running,** confirm the seed set:

```sql
select count(*) from bookings
where booking_no ~ '^B-9[0-4][0-9]$'
  and substring(booking_no from 3)::int between 900 and 945;
```

Expect **46**. If it is not 46, stop — the range is the only discriminator available, because `external_refs` holds no `orders` rows for any booking and the seed carries no marker.

Then, in order:

1. **Record the mapping.** Create `booking_no_migration_map (old_no text, new_no text, migrated_at timestamptz)` and populate it. The audit trigger will log the updates, but support staff need a direct old→new lookup for a year at least.

2. **Renumber in one statement:**

```sql
update bookings
set booking_no = case
  when substring(booking_no from 3)::int between 900 and 945
    then (90000 + substring(booking_no from 3)::int - 900)::text
  else substring(booking_no from 3)
end
where booking_no like 'B-%';
```

`B-700` → `700`; `B-900` → `90000`; `B-945` → `90045`. Old and new forms never collide, so one pass is safe.

3. **Constrain the column:**

```sql
alter table bookings add constraint bookings_booking_no_is_digits
  check (booking_no ~ '^[0-9]+$');
create index bookings_booking_no_num on bookings (((booking_no)::bigint));
```

The index matters: on text, `1000` sorts before `946`. Every list ordered by booking number needs the numeric expression.

4. **Re-point the sequence:**

```sql
update number_sequences
set prefix = '', padding = 1,
    current_value = (select max((booking_no)::bigint)
                     from bookings where (booking_no)::bigint < 90000)
where sequence_key = 'booking';

update number_sequences set include_year = false where sequence_key = 'payment';
```

That sets the booking counter to 899 and fixes Finding A and Finding C together.

---

## 4. App changes

- **Display helper.** One function, used everywhere: `formatBookingNo(n) => '#' + n`. Do not scatter `'#' + x` through the screens; the audit already found three phone normalisers with different rules and that is the same failure waiting to happen.
- **Search** must accept `946`, `#946` and `B-946` — staff will type the old form for months, and so will clients holding old paperwork.
- **Routes** take the bare number. Nothing changes structurally; `/rentals/946` already works.
- **`lib/booqable/map/orders.ts:264`** currently mints its own number. It must instead **take Booqable's order number** and never call `next_document_number`. This is the DEL-18 correction.
- **Mock** (`lib/mock`) mints `B-1`. Update it, or journey numbers keep looking nothing like production (P3-3).

---

## 5. Import idempotency — the part that actually blocks the corpus

`external_refs` holds 171 rows: 100 clients, 71 products, **0 orders**. Nothing ties an imported booking back to its Booqable UUID. That, not the numbering, is why a re-import is unsafe.

1. **Back-fill `orders` refs** for the 200 imported bookings, keyed on the Booqable order UUID and matched on the number now stored bare. Do this before any sync runs.
2. **Add a collision check** to the import: the number comes from outside, so before insert, look for an existing `booking_no` and reconcile via `external_refs` rather than minting a new one.
3. **Revoke DELETE on `external_refs`** from `authenticated` (P2-5). A deleted ref silently restores the duplicate-import hazard.
4. **Keep the counter in step:** after every import, set `current_value` to the max non-seed booking number, so the handover at bridge end continues cleanly.
5. **Quarantine `scripts/full_sync.sql`** (P1-7). It sets every `client_id` to `(select id from clients limit 1)` and both dates to `now()`. Move it out of the repo or make it refuse to run.

---

## 6. One question this spec cannot answer

During the bridge, Booqable owns the numbering. **What number does a booking created in the OS take, when Booqable has not issued one?**

If it mints from the sequence, it can take a number Booqable later issues to a different order. The options are: create in Booqable first and let it flow back; give OS-originated bookings a reserved band; or make the OS the sole creator and have Booqable follow.

This does not block the migration above — it blocks the first booking created in the OS during the bridge. Rule it before that happens.

---

## 7. Acceptance

- All 246 bookings carry digits only; the check constraint holds.
- The 46 seed bookings sit at 90000–90045; the map table resolves each old number.
- 900–945 is empty and available.
- `next_document_number('booking')` returns `900` and inserts without collision.
- Lists sort 899 → 900 → 1000, not 1000 → 899.
- Searching `B-880`, `#880` and `880` all find the same rental.
- A repeated import of the same Booqable order creates no second booking.
- `next_document_number('payment')` no longer carries a year segment.
