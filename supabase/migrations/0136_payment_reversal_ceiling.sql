-- 0136 · Payment reversal ceiling
--
-- Law 4: a payment remains immutable and a correction is an append-only row.
-- The ceiling must therefore live at the write boundary, not in a client-side
-- balance display: partial reversals, retries and concurrent operators must
-- never cumulatively reverse more than the original receipt.

begin;

insert into public.number_sequences (sequence_key, prefix, current_year, current_value, padding, include_year)
values ('payment_reversal', 'REV-', extract(year from current_date)::integer, 0, 4, true)
on conflict (sequence_key) do nothing;

create or replace function public.enforce_payment_reversal_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_amount numeric(14,2);
  v_payment_type payment_type;
  v_payment_status payment_status;
  v_reversed_amount numeric(14,2);
begin
  -- Serialize all correction attempts for this receipt before summing its rows.
  select p.amount, p.payment_type, p.status
    into v_payment_amount, v_payment_type, v_payment_status
    from payments p
   where p.id = new.original_payment_id
   for update;

  if not found then
    raise exception 'Original payment % does not exist', new.original_payment_id
      using errcode = '23503';
  end if;

  if v_payment_type <> 'Advance Payment' or v_payment_status <> 'Received' then
    raise exception 'Only a received advance payment can be reversed'
      using errcode = '23514';
  end if;

  select coalesce(sum(r.amount), 0)
    into v_reversed_amount
    from payment_reversals r
   where r.original_payment_id = new.original_payment_id;

  if new.amount > v_payment_amount - v_reversed_amount then
    raise exception 'Reversal amount % exceeds the remaining reversible amount % for payment %',
      new.amount, v_payment_amount - v_reversed_amount, new.original_payment_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_reversals_enforce_ceiling on public.payment_reversals;
create trigger payment_reversals_enforce_ceiling
before insert on public.payment_reversals
for each row execute function public.enforce_payment_reversal_ceiling();

revoke all on function public.enforce_payment_reversal_ceiling() from public;

commit;
