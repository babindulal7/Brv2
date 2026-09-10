import { toRupees } from './money.ts'
import type { Paisa } from './money.ts'
import {
  INVOICE_ISSUED_STATUS,
  recordNo,
  SEQUENCES,
  VAT_PERCENT,
  type SeedCorpus,
} from './seed.ts'

/**
 * # The same corpus, as terse as SQL allows
 *
 * `seed.ts`'s `emitSql` is written to be **read**: one statement per row, the
 * provenance of every figure in a comment beside it, an assertion block per
 * booking. That is the right shape for a file a human reviews before it touches
 * a database — and for 120 bookings it costs 1.8 MB.
 *
 * This emitter exists because that file also has to be **transported**. Getting
 * it into a database through a tool call meant moving those 1.8 MB one chunk at
 * a time, twelve round trips of mostly commentary.
 *
 * ## Neither file is the source of truth — `buildCorpus()` is
 *
 * Both emitters render the same engine-derived corpus and **neither decides a
 * figure**. Every subtotal, discount, VAT amount, rental total, day count and
 * stage path below came out of `money.ts`, `validation.ts`, `discount.ts` and
 * `workflow.ts` before either emitter saw it. If the two ever disagree about a
 * number, that is a bug in one of them, not a second opinion.
 *
 * ## Two things make it small
 *
 * **1 · One `values` list per table, joined to reference data by natural key.**
 * The readable emitter repeats `(select id from bookings where booking_no =
 * 'B-800')` on every child row — about 150 characters of subquery per booking
 * line. Here the booking number appears once in a tuple and the join resolves
 * it for all of them.
 *
 * **2 · The database derives what is mechanically derivable.** Product units,
 * invoice lines and stage transitions are not shipped at all — they are
 * `generate_series`, a join, and a walk over the stage array. That is only
 * possible because `seedUuid` is MD5-based: `md5('…/seed/' || key)::uuid` in
 * SQL and `seedUuid(key)` in TypeScript produce the same `client_uuid`, so a
 * row invented by `generate_series` carries the identity the migration would
 * have given it and Law 8's idempotency survives either route.
 *
 * ## What it deliberately drops
 *
 * `booking_discounts` and `audit_events`. The discount is already on the
 * invoice — percent, amount, reason and approver — which is what every screen
 * reads; `booking_discounts.audit_event_id` would drag the audit table in
 * behind it for a row nothing renders. Recorded here rather than left to be
 * discovered as a difference between the two files.
 */
export function compactSeedSql(corpus: SeedCorpus): readonly string[] {
  const parts: string[] = []
  const q = (v: string): string => `'${v.replace(/'/g, "''")}'`
  const n = (v: number): string => v.toFixed(2)
  const money = (v: Paisa): string => toRupees(v).toFixed(2)
  const iso = (d: Date): string => `'${d.toISOString()}'`
  /** The uuid Postgres will compute for a key — identical to `seedUuid`. */
  const key = (expr: string): string => `md5('babin-rentals-os/seed/' || ${expr})::uuid`

  const USER = (email: string): string => `(select id from users where email = ${q(email)})`
  const BILLING = USER('billing@babinrentals.com')
  const STORE = USER('warehouse@babinrentals.com')
  const OWNER = USER('owner@babinrentals.com')
  const BR = `(select id from branches where branch_code = 'BR-KTM-01')`
  const WH = `(select id from warehouses where warehouse_code = 'WH-KTM-MAIN')`
  const BANK = `(select id from bank_accounts where account_number = '01201017500001')`

  /* 1 · clients */
  parts.push(`insert into clients (client_uuid, client_code, type_parent, org_subtype, name, phone,
  email, address_line, city, district, country, payment_terms, client_since, segments,
  preferred_contact_channels, status, created_by)
select ${key("'client:' || v.code")}, v.code, v.tp::client_type_parent,
  nullif(v.sub, '')::client_organisation_subtype, v.name, v.phone, v.email, v.addr, v.city,
  v.district, 'Nepal', v.terms::payment_terms, v.since::date,
  string_to_array(v.segments, '|')::client_segment[],
  array['Email','WhatsApp']::preferred_contact_channel[], 'Active', ${BILLING}
from (values
${corpus.clients
    .map((c) => {
      const code = recordNo(SEQUENCES.client, c.seq)
      return `(${q(code)},${q(c.typeParent)},${q(c.orgSubtype ?? '')},${q(c.name)},${q(c.phone)},${q(c.email)},${q(c.addressLine)},${q(c.city)},${q(c.district)},${q(c.paymentTerms)},${q(c.since)},${q(c.segments.join('|'))})`
    })
    .join(',\n')}
) as v(code,tp,sub,name,phone,email,addr,city,district,terms,since,segments)
on conflict (client_code) do nothing;`)

  /* 2 · products */
  parts.push(`insert into products (client_uuid, asset_code, name, category_id, brand, model,
  tracking_mode, status, total_quantity, daily_rate, replacement_value, min_rental_days,
  rental_enabled, is_active, created_by)
select ${key("'product:' || v.code")}, v.code, v.name, c.id, v.brand, v.model, 'Serialised',
  'Active', v.units::int, v.rate::numeric, v.repl::numeric, 1, true, true, ${STORE}
from (values
${corpus.products
    .map((p) => {
      const code = recordNo(SEQUENCES.equipment, p.seq)
      return `(${q(code)},${q(p.name)},${q(p.categoryCode)},${q(p.brand)},${q(p.model)},${n(p.dailyRateRupees)},${n(p.replacementValueRupees)},${p.units})`
    })
    .join(',\n')}
) as v(code,name,cat,brand,model,rate,repl,units)
join inventory_categories c on c.code = v.cat
on conflict (asset_code) do nothing;`)

  /* 3 · product units — expanded by the database from one row per PRODUCT.
     A unit is a property of the product, so every product gets its units
     whether or not anybody has booked it; Inventory counts units, and a
     catalogue of names with nothing behind them is not a catalogue. */
  const packedTags = [...new Set(corpus.bookings.flatMap((b) => b.units.map((u) => u.assetTag)))]
  parts.push(`insert into product_units (client_uuid, product_id, serial_no, asset_tag, status,
  condition, branch_id, warehouse_id, storage_zone_id, replacement_value, created_by)
select ${key("'product_unit:' || v.code || '-U' || lpad(g::text, 2, '0')")}, p.id,
  'SN-' || v.tag || '-' || lpad((v.serial_from + g - 1)::text, 4, '0'),
  v.code || '-U' || lpad(g::text, 2, '0'),
  case when (v.code || '-U' || lpad(g::text, 2, '0')) = any(${
    packedTags.length === 0 ? 'array[]::text[]' : `array[${packedTags.map(q).join(',')}]`
  })
    then 'Packed' else 'In Stock' end::inventory_state,
  'Good', ${BR}, ${WH}, z.id, p.replacement_value, ${STORE}
from (values
${corpus.products
    .map((p) => {
      const code = recordNo(SEQUENCES.equipment, p.seq)
      return `(${q(code)},${q(p.serialTag)},${p.serialFrom},${p.units},${q(p.zoneCode)})`
    })
    .join(',\n')}
) as v(code,tag,serial_from,units,zone)
cross join lateral generate_series(1, v.units) g
join products p on p.asset_code = v.code
join storage_zones z on z.code = v.zone
on conflict (asset_tag) do nothing;`)

  /* 4 · bookings */
  parts.push(`insert into bookings (client_uuid, booking_no, branch_id, client_id, project,
  pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by)
select ${key("'booking:' || v.no")}, v.no, ${BR}, c.id, v.project, v.pickup::timestamptz,
  v.ret::timestamptz, 'Client Pickup', v.dep::numeric, ${BILLING}, ${BILLING}
from (values
${corpus.bookings
    .map(
      (b) =>
        `(${q(b.bookingNo)},${q(b.clientCode)},${q(b.spec.project)},${iso(b.spec.pickupAt)},${iso(b.spec.returnAt)},${n(b.spec.depositRequiredRupees)})`,
    )
    .join(',\n')}
) as v(no,client_code,project,pickup,ret,dep)
join clients c on c.client_code = v.client_code
on conflict (booking_no) do nothing;`)

  /* 5 · booking lines — Law 9: days is written explicitly, never by omission */
  parts.push(`insert into booking_lines (client_uuid, booking_id, line_type, product_id,
  description, qty, days, rate, sort_order, created_by)
select ${key("'booking_line:' || v.no || ':' || v.code")}, b.id, 'Equipment', p.id, p.name,
  v.qty::int, v.days::int, v.rate::numeric, v.sort::int, ${BILLING}
from (values
${corpus.bookings
    .flatMap((b) =>
      b.lines.map(
        (l) => `(${q(b.bookingNo)},${q(l.assetCode)},${l.qty},${l.days},${n(l.rateRupees)},${l.sortOrder})`,
      ),
    )
    .join(',\n')}
) as v(no,code,qty,days,rate,sort)
join bookings b on b.booking_no = v.no
join products p on p.asset_code = v.code
on conflict (client_uuid) do nothing;`)

  /* 6 · the physical units that actually went out, where the corpus knows them */
  const unitRows = corpus.bookings.flatMap((b) => {
    const packedAt = b.transitions.find((t) => t.to === 'Packed')?.occurredAt ?? b.spec.pickupAt
    return b.units.map((u) => `(${q(b.bookingNo)},${q(u.assetCode)},${q(u.assetTag)},${iso(packedAt)})`)
  })
  if (unitRows.length > 0) {
    parts.push(`insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty,
  unit_state, is_required, packed, packed_at, packed_by, created_by)
select ${key("'booking_line_unit:' || v.no || ':' || v.tag")}, bl.id, pu.id, 1, 'Ready', true, true,
  v.packed_at::timestamptz, ${STORE}, ${STORE}
from (values
${unitRows.join(',\n')}
) as v(no,code,tag,packed_at)
join bookings b on b.booking_no = v.no
join products p on p.asset_code = v.code
join booking_lines bl on bl.booking_id = b.id and bl.product_id = p.id
join product_units pu on pu.asset_tag = v.tag
on conflict (client_uuid) do nothing;`)
  }

  /* 7 · crew */
  const crewRows = corpus.bookings.flatMap((b) =>
    b.crew.map((c) => `(${q(b.bookingNo)},${q(c.name)},${q(c.role)},${n(c.dayRateRupees)},${c.days})`),
  )
  if (crewRows.length > 0) {
    parts.push(`insert into booking_crew_lines (client_uuid, booking_id, name, crew_role, day_rate,
  days, created_by)
select ${key("'booking_crew_line:' || v.no || ':' || v.name")}, b.id, v.name, v.role::crew_role,
  v.rate::numeric, v.days::int, ${BILLING}
from (values
${crewRows.join(',\n')}
) as v(no,name,role,rate,days)
join bookings b on b.booking_no = v.no
on conflict (client_uuid) do nothing;`)
  }

  /* 8 · invoices, Draft — the only window in which the lines below and the
     restate after them may touch these columns at all (0006). */
  parts.push(`insert into invoices (client_uuid, invoice_no, booking_id, client_id, branch_id,
  status, issue_date, due_date, subtotal, discount_amount, discount_percent, discount_reason,
  discount_approved_by, taxable_amount, vat_rate, vat_amount, total_amount, paid_amount,
  outstanding_amount, created_by, updated_by)
select ${key("'invoice:' || v.no")}, v.no, b.id, c.id, ${BR}, 'Draft', v.issue::date, v.due::date,
  v.subtotal::numeric, v.discount::numeric, v.pct::numeric, nullif(v.reason, ''),
  case when v.approver = '' then null else (select id from users where email = v.approver) end,
  v.taxable::numeric, ${(VAT_PERCENT / 100).toFixed(4)}, v.vat::numeric, v.total::numeric, 0.00,
  v.total::numeric, ${BILLING}, ${BILLING}
from (values
${corpus.bookings
    .map((b) => {
      const s = b.spec
      const due = new Date(s.returnAt.getTime() + 7 * 24 * 60 * 60_000)
      return `(${q(b.invoiceNo)},${q(b.bookingNo)},${q(b.clientCode)},${q(s.pickupAt.toISOString().slice(0, 10))},${q(due.toISOString().slice(0, 10))},${money(b.breakdown.subtotal)},${money(b.breakdown.discount)},${n(s.discountPercent)},${q(s.discountReason ?? '')},${q(s.discountApproverEmail ?? '')},${money(b.breakdown.taxable)},${money(b.breakdown.vat)},${money(b.breakdown.rentalTotal)})`
    })
    .join(',\n')}
) as v(no,booking_no,client_code,issue,due,subtotal,discount,pct,reason,approver,taxable,vat,total)
join bookings b on b.booking_no = v.booking_no
join clients c on c.client_code = v.client_code
on conflict (invoice_no) do nothing;`)

  /* 9 · invoice lines, derived from the booking lines already loaded */
  parts.push(`insert into invoice_lines (client_uuid, invoice_id, line_kind, description, quantity,
  days, unit_rate, line_total, sort_order)
select ${key("'invoice_line:' || i.invoice_no || ':' || p.asset_code")}, i.id, 'Equipment Rental',
  bl.description, bl.qty, bl.days, bl.rate, bl.qty * bl.rate * bl.days, bl.sort_order
from booking_lines bl
join bookings b on b.id = bl.booking_id
join invoices i on i.booking_id = b.id
join products p on p.id = bl.product_id
on conflict (client_uuid) do nothing;`)

  parts.push(`insert into invoice_lines (client_uuid, invoice_id, line_kind, description, quantity,
  days, unit_rate, line_total, sort_order)
select ${key("'invoice_line:' || i.invoice_no || ':crew'")}, i.id, 'Crew Charges',
  'Crew — ' || string_agg(distinct cl.crew_role::text, ', '),
  count(*)::int, max(cl.days), avg(cl.day_rate), sum(cl.day_rate * cl.days), 900
from booking_crew_lines cl
join bookings b on b.id = cl.booking_id
join invoices i on i.booking_id = b.id
group by i.id, i.invoice_no
on conflict (client_uuid) do nothing;`)

  /* 10 · restate, then issue. The line inserts fired recalculate_invoice_totals();
     this puts the engine's figures back while the invoice is still Draft. */
  parts.push(`update invoices i set subtotal = v.subtotal::numeric,
  discount_amount = v.discount::numeric, taxable_amount = v.taxable::numeric,
  vat_amount = v.vat::numeric, total_amount = v.total::numeric,
  outstanding_amount = v.total::numeric - i.paid_amount
from (values
${corpus.bookings
    .map(
      (b) =>
        `(${q(b.invoiceNo)},${money(b.breakdown.subtotal)},${money(b.breakdown.discount)},${money(b.breakdown.taxable)},${money(b.breakdown.vat)},${money(b.breakdown.rentalTotal)})`,
    )
    .join(',\n')}
) as v(no,subtotal,discount,taxable,vat,total)
where i.invoice_no = v.no;`)

  parts.push(`update invoices set status = '${INVOICE_ISSUED_STATUS}'
where invoice_no in (${corpus.bookings.map((b) => q(b.invoiceNo)).join(',')});`)

  /* 11 · Law 5 — deposits are liabilities, in an account of their own that
     never touches total_amount or outstanding_amount. */
  const deposits = corpus.bookings.filter((b) => b.depositNo !== null)
  if (deposits.length > 0) {
    parts.push(`insert into security_deposits (client_uuid, deposit_no, booking_id, client_id,
  branch_id, required_amount, created_by, updated_by)
select ${key("'security_deposit:' || v.no")}, v.no, b.id, c.id, ${BR}, v.amount::numeric,
  ${BILLING}, ${BILLING}
from (values
${deposits
      .map(
        (b) => `(${q(b.depositNo ?? '')},${q(b.bookingNo)},${q(b.clientCode)},${n(b.spec.depositRequiredRupees)})`,
      )
      .join(',\n')}
) as v(no,booking_no,client_code,amount)
join bookings b on b.booking_no = v.booking_no
join clients c on c.client_code = v.client_code
on conflict (deposit_no) do nothing;`)

    const movements = deposits.filter((b) => b.spec.depositReceivedRupees > 0)
    if (movements.length > 0) {
      parts.push(`insert into deposit_movements (client_uuid, movement_no, security_deposit_id,
  movement_type, amount, bank_account_id, handled_by)
select ${key("'deposit_movement:' || v.no")}, v.no, d.id, 'Received', v.amount::numeric, ${BANK},
  ${BILLING}
from (values
${movements
        .map((b) => `(${q(`${b.depositNo ?? ''}-M1`)},${q(b.depositNo ?? '')},${n(b.spec.depositReceivedRupees)})`)
        .join(',\n')}
) as v(no,deposit_no,amount)
join security_deposits d on d.deposit_no = v.deposit_no
on conflict (movement_no) do nothing;`)
    }
  }

  /* 12 · Law 4 — payments are ledger rows, immutable once written */
  const payments = corpus.bookings.filter((b) => b.paymentNo !== null)
  if (payments.length > 0) {
    parts.push(`insert into payments (client_uuid, payment_no, booking_id, invoice_id, client_id,
  branch_id, amount, payment_type, status, payment_date, bank_account_id, received_by)
select ${key("'payment:' || v.no")}, v.no, b.id, i.id, c.id, ${BR}, v.amount::numeric,
  'Advance Payment', 'Received', v.paid_at::timestamptz, ${BANK}, ${BILLING}
from (values
${payments
      .map(
        (b) =>
          `(${q(b.paymentNo ?? '')},${q(b.bookingNo)},${q(b.invoiceNo)},${q(b.clientCode)},${money(b.breakdown.payments)},${iso(new Date(b.spec.pickupAt.getTime() - 48 * 60 * 60_000))})`,
      )
      .join(',\n')}
) as v(no,booking_no,invoice_no,client_code,amount,paid_at)
join bookings b on b.booking_no = v.booking_no
join invoices i on i.invoice_no = v.invoice_no
join clients c on c.client_code = v.client_code
on conflict (payment_no) do nothing;`)
  }

  /* 13 · the stage machine.
     booking_stage_transitions is the sole writer of bookings.stage (0021), and
     the DB re-validates every step. One row per booking is shipped — the target
     stage `workflow.ts` already proved reachable — and the walk up to it is the
     database's, over the same canonical six. */
  parts.push(`insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage,
  to_stage, occurred_at, actor_id, actor_role, source)
select ${key("'booking_stage_transition:' || v.no || ':' || s.name")}, b.id, ${BR},
  case when s.ord = 1 then null
       else lag(s.name) over (partition by v.no order by s.ord) end::booking_stage,
  s.name::booking_stage,
  b.pickup_at - make_interval(hours => 72 - (s.ord - 1)::int),
  ${OWNER}, 'Coordinator', 'seed'
from (values
${corpus.bookings.map((b) => `(${q(b.bookingNo)},${q(b.spec.stage)})`).join(',\n')}
) as v(no,target)
join bookings b on b.booking_no = v.no
join lateral (
  select name, ord
  from unnest(array['Quote','Booked','Packed','On Rent','Returned','Closed'])
    with ordinality as t(name, ord)
) s on s.ord <= (
  select ord
  from unnest(array['Quote','Booked','Packed','On Rent','Returned','Closed'])
    with ordinality as t2(name, ord)
  where t2.name = v.target
)
order by v.no, s.ord
on conflict (client_uuid) do nothing;`)

  /* 14 · sequence high-water, so the next number the app mints is not one of these */
  parts.push(
    [...corpus.sequenceHighWater]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([k, value]) =>
          `update number_sequences set current_value = greatest(current_value, ${value}) where sequence_key = ${q(k)};`,
      )
      .join('\n'),
  )

  return parts
}
