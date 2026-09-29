begin;

-- RULING 2026-09-29: vendor return-by is operator-entered and independent of booking extensions.
alter table booking_lines
  add column subrental_return_by date;

alter table booking_lines
  add constraint booking_lines_subrental_return_by_required
  check (line_type <> 'Sub-rental' or subrental_return_by is not null) not valid;

-- Existing vendor agreements cannot be assigned a deadline from booking dates.
-- NOT VALID still enforces this check on every new or updated row. Validate only
-- after an operator records the real deadline on historical Sub-rental lines.

commit;
