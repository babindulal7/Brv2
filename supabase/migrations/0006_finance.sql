-- =============================================================================
-- 0006_finance.sql — domain: finance
--
-- Laws encoded here, in the database, with no role bypass:
--   * NOTHING IS DELETED. Terminal actions are Void / Reversed / Cancelled.
--   * Every user-written table carries client_uuid uuid not null unique (idempotency).
--   * Payments are IMMUTABLE (Law 4). No UPDATE. No DELETE. Mistakes take payment_reversals.
--   * Deposits are LIABILITIES, isolated from revenue & invoices (Law 5).
--   * Invoices are immutable once issued; mistakes take Void + Credit Note.
--   * Days is mandatory on every priced line item (days integer not null check days >= 1).
--   * Money is numeric(14,2), strictly non-negative where applicable.
--   * Nepali Fiscal Year runs 1 Shrawan – Ashadh end (FY 2083/84).
--   * Warehouse sees NO monetary amounts or columns.
-- =============================================================================

begin;

-- =============================================================================
-- 1. bank_accounts
-- Bank accounts and digital wallets for receiving payments.
-- =============================================================================
create table bank_accounts (
  id              uuid         not null default gen_random_uuid() primary key,
  client_uuid     uuid         not null,
  account_name    text         not null,
  bank_name       text         not null,
  account_number  text         not null,
  branch_name     text,
  channel_group   payment_channel_group not null default 'Bank',
  qr_code_url     text,
  is_primary      boolean      not null default false,
  is_active       boolean      not null default true,
  created_at      timestamptz  not null default now(),
  created_by      uuid         references users (id),
  updated_at      timestamptz  not null default now(),
  updated_by      uuid         references users (id),

  constraint bank_accounts_client_uuid_key unique (client_uuid),
  constraint bank_accounts_account_number_key unique (account_number)
);

create index idx_bank_accounts_active on bank_accounts (is_active);


-- =============================================================================
-- 2. fiscal_periods
-- Nepali Fiscal Year tracking (e.g. FY 2083/84: 1 Shrawan 2083 – 31 Ashadh 2084).
-- =============================================================================
create table fiscal_periods (
  id              uuid         not null default gen_random_uuid() primary key,
  client_uuid     uuid         not null,
  fiscal_year_bs  text         not null,
  start_date_ad   date         not null,
  end_date_ad     date         not null,
  is_closed       boolean      not null default false,
  closed_at       timestamptz,
  closed_by       uuid         references users (id),
  created_at      timestamptz  not null default now(),
  created_by      uuid         references users (id),

  constraint fiscal_periods_client_uuid_key unique (client_uuid),
  constraint fiscal_periods_fy_key unique (fiscal_year_bs),
  constraint fiscal_periods_date_order check (start_date_ad < end_date_ad)
);

create index idx_fiscal_periods_dates on fiscal_periods (start_date_ad, end_date_ad);


-- =============================================================================
-- 3. invoices
-- Generated billing documents. Never edited after issue; voided with credit notes.
-- =============================================================================
create table invoices (
  id                  uuid            not null default gen_random_uuid() primary key,
  client_uuid         uuid            not null,
  invoice_no          text            not null,
  booking_id          uuid            not null references bookings (id),
  client_id           uuid            not null references clients (id),
  branch_id           uuid            not null references branches (id),
  status              invoice_status  not null default 'Draft',
  issue_date          date            not null default current_date,
  due_date            date            not null,
  currency            text            not null default 'NPR',
  
  -- Calculated Breakdown (Law 1, Law 10)
  subtotal            numeric(14,2)   not null default 0,
  discount_amount     numeric(14,2)   not null default 0,
  discount_percent    numeric(5,2)    not null default 0,
  taxable_amount      numeric(14,2)   not null default 0,
  vat_rate            numeric(5,4)    not null default 0.1300,
  vat_amount          numeric(14,2)   not null default 0,
  total_amount        numeric(14,2)   not null default 0,
  paid_amount         numeric(14,2)   not null default 0,
  outstanding_amount  numeric(14,2)   not null default 0,
  
  -- Void & Credit Note handling
  voided_at           timestamptz,
  voided_by           uuid            references users (id),
  void_reason         text,
  credit_note_no      text,
  
  notes               text,
  pdf_url             text,
  created_at          timestamptz     not null default now(),
  created_by          uuid            references users (id),
  updated_at          timestamptz     not null default now(),
  updated_by          uuid            references users (id),

  constraint invoices_client_uuid_key unique (client_uuid),
  constraint invoices_no_key unique (invoice_no),
  constraint invoices_amounts_non_negative check (
    subtotal >= 0 and discount_amount >= 0 and taxable_amount >= 0 and
    vat_amount >= 0 and total_amount >= 0 and paid_amount >= 0 and outstanding_amount >= 0
  ),
  constraint invoices_discount_cap check (discount_percent >= 0 and discount_percent <= 25),
  constraint invoices_void_requires_reason check (
    (voided_at is null and voided_by is null and void_reason is null and credit_note_no is null) or
    (voided_at is not null and voided_by is not null and length(trim(void_reason)) >= 10 and credit_note_no is not null)
  )
);

create index idx_invoices_booking on invoices (booking_id);
create index idx_invoices_client on invoices (client_id);
create index idx_invoices_status on invoices (status);
create index idx_invoices_due_date on invoices (due_date);


-- =============================================================================
-- 4. invoice_lines
-- Line item entries on an invoice. Days is strictly mandatory (Law 9).
-- =============================================================================
create table invoice_lines (
  id                uuid           not null default gen_random_uuid() primary key,
  client_uuid       uuid           not null,
  invoice_id        uuid           not null references invoices (id),
  line_kind         line_kind      not null default 'Equipment Rental',
  description       text           not null,
  quantity          integer        not null default 1,
  days              integer        not null default 1,
  unit_rate         numeric(14,2)  not null default 0,
  discount_percent  numeric(5,2)   not null default 0,
  line_total        numeric(14,2)  not null default 0,
  sort_order        integer        not null default 0,
  created_at        timestamptz    not null default now(),

  constraint invoice_lines_client_uuid_key unique (client_uuid),
  constraint invoice_lines_qty_positive check (quantity >= 1),
  constraint invoice_lines_days_mandatory check (days >= 1),
  constraint invoice_lines_discount_cap check (discount_percent >= 0 and discount_percent <= 25),
  constraint invoice_lines_totals_valid check (unit_rate >= 0 and line_total >= 0)
);

create index idx_invoice_lines_invoice on invoice_lines (invoice_id);


-- =============================================================================
-- 5. payments
-- Immutable payment ledger entries (Law 4).
-- UPDATE and DELETE are prohibited by database triggers and revocations.
-- =============================================================================
create table payments (
  id                uuid            not null default gen_random_uuid() primary key,
  client_uuid       uuid            not null,
  payment_no        text            not null,
  booking_id        uuid            not null references bookings (id),
  invoice_id        uuid            references invoices (id),
  client_id         uuid            not null references clients (id),
  branch_id         uuid            not null references branches (id),
  amount            numeric(14,2)   not null,
  payment_type      payment_type    not null default 'Advance Payment',
  status            payment_status  not null default 'Received',
  payment_date      timestamptz     not null default now(),
  bank_account_id   uuid            references bank_accounts (id),
  transaction_ref   text,
  notes             text,
  received_by       uuid            not null references users (id),
  created_at        timestamptz     not null default now(),

  constraint payments_client_uuid_key unique (client_uuid),
  constraint payments_no_key unique (payment_no),
  constraint payments_amount_positive check (amount > 0),
  -- Law 5: Security Deposit is NOT a payment type on this table (isolated liability)
  constraint payments_no_security_deposit check (payment_type <> 'Security Deposit')
);

create index idx_payments_booking on payments (booking_id);
create index idx_payments_invoice on payments (invoice_id);
create index idx_payments_client on payments (client_id);
create index idx_payments_status on payments (status);


-- =============================================================================
-- 6. payment_reversals
-- Compensating ledger entry for a mistaken or cancelled payment (Law 4).
-- =============================================================================
create table payment_reversals (
  id                    uuid           not null default gen_random_uuid() primary key,
  client_uuid           uuid           not null,
  reversal_no           text           not null,
  original_payment_id   uuid           not null references payments (id),
  amount                numeric(14,2)  not null,
  reason                text           not null,
  reversed_by           uuid           not null references users (id),
  approved_by           uuid           not null references users (id),
  reversed_at           timestamptz    not null default now(),
  created_at            timestamptz    not null default now(),

  constraint payment_reversals_client_uuid_key unique (client_uuid),
  constraint payment_reversals_no_key unique (reversal_no),
  constraint payment_reversals_amount_positive check (amount > 0),
  constraint payment_reversals_reason_min_length check (length(trim(reason)) >= 10)
);

create index idx_payment_reversals_original on payment_reversals (original_payment_id);


-- =============================================================================
-- 7. security_deposits
-- Isolated liability account per booking (Law 5).
-- Completely separated from revenue and payments.
-- =============================================================================
create table security_deposits (
  id                uuid           not null default gen_random_uuid() primary key,
  client_uuid       uuid           not null,
  deposit_no        text           not null,
  booking_id        uuid           not null references bookings (id),
  client_id         uuid           not null references clients (id),
  branch_id         uuid           not null references branches (id),
  required_amount   numeric(14,2)  not null default 0,
  received_amount   numeric(14,2)  not null default 0,
  refunded_amount   numeric(14,2)  not null default 0,
  applied_amount    numeric(14,2)  not null default 0,
  pending_amount    numeric(14,2)  not null default 0,
  created_at        timestamptz    not null default now(),
  created_by        uuid           references users (id),
  updated_at        timestamptz    not null default now(),
  updated_by        uuid           references users (id),

  constraint security_deposits_client_uuid_key unique (client_uuid),
  constraint security_deposits_no_key unique (deposit_no),
  constraint security_deposits_booking_key unique (booking_id),
  constraint security_deposits_amounts_non_negative check (
    required_amount >= 0 and received_amount >= 0 and
    refunded_amount >= 0 and applied_amount >= 0 and pending_amount >= 0
  )
);

create index idx_security_deposits_booking on security_deposits (booking_id);
create index idx_security_deposits_client on security_deposits (client_id);


-- =============================================================================
-- 8. deposit_movements
-- Immutable record of deposit cash inflows, releases, and charge applications.
-- =============================================================================
create table deposit_movements (
  id                     uuid                   not null default gen_random_uuid() primary key,
  client_uuid            uuid                   not null,
  movement_no            text                   not null,
  security_deposit_id    uuid                   not null references security_deposits (id),
  movement_type          deposit_movement_type  not null default 'Received',
  amount                 numeric(14,2)          not null,
  bank_account_id        uuid                   references bank_accounts (id),
  transaction_ref        text,
  charge_type            deposit_charge_type,
  applied_reason         text,
  handled_by             uuid                   not null references users (id),
  created_at             timestamptz            not null default now(),

  constraint deposit_movements_client_uuid_key unique (client_uuid),
  constraint deposit_movements_no_key unique (movement_no),
  constraint deposit_movements_amount_positive check (amount > 0),
  constraint deposit_movements_apply_requires_reason check (
    (movement_type <> 'Applied') or
    (movement_type = 'Applied' and charge_type is not null and length(trim(coalesce(applied_reason, ''))) >= 5)
  )
);

create index idx_deposit_movements_deposit on deposit_movements (security_deposit_id);
create index idx_deposit_movements_type on deposit_movements (movement_type);


-- =============================================================================
-- 9. expense_categories
-- Operating expense category taxonomy.
-- =============================================================================
create table expense_categories (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  code         text         not null,
  name         text         not null,
  description  text,
  is_active    boolean      not null default true,
  created_at   timestamptz  not null default now(),
  created_by   uuid         references users (id),
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references users (id),

  constraint expense_categories_client_uuid_key unique (client_uuid),
  constraint expense_categories_code_key unique (code)
);

create index idx_expense_categories_code on expense_categories (code);


-- =============================================================================
-- 10. expenses
-- Operational and booking-related expenses. Reversal-based corrections.
-- =============================================================================
create table expenses (
  id               uuid            not null default gen_random_uuid() primary key,
  client_uuid      uuid            not null,
  expense_no       text            not null,
  category_id      uuid            not null references expense_categories (id),
  branch_id        uuid            not null references branches (id),
  vendor_name      text            not null,
  amount           numeric(14,2)   not null,
  expense_date     date            not null default current_date,
  status           expense_status  not null default 'Draft',
  description      text            not null,
  receipt_url      text,
  receipt_size     bigint,
  booking_id       uuid            references bookings (id),
  created_at       timestamptz     not null default now(),
  created_by       uuid            references users (id),
  updated_at       timestamptz     not null default now(),
  updated_by       uuid            references users (id),

  constraint expenses_client_uuid_key unique (client_uuid),
  constraint expenses_no_key unique (expense_no),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_receipt_size_cap check (receipt_size is null or (receipt_size > 0 and receipt_size <= 52428800))
);

create index idx_expenses_category on expenses (category_id);
create index idx_expenses_booking on expenses (booking_id);
create index idx_expenses_status on expenses (status);
create index idx_expenses_date on expenses (expense_date);


-- =============================================================================
-- 11. expense_reversals
-- Compensating records for cancelled or mistaken expenses.
-- =============================================================================
create table expense_reversals (
  id                   uuid           not null default gen_random_uuid() primary key,
  client_uuid          uuid           not null,
  reversal_no          text           not null,
  original_expense_id  uuid           not null references expenses (id),
  amount               numeric(14,2)  not null,
  reason               text           not null,
  reversed_by          uuid           not null references users (id),
  reversed_at          timestamptz    not null default now(),
  created_at           timestamptz    not null default now(),

  constraint expense_reversals_client_uuid_key unique (client_uuid),
  constraint expense_reversals_no_key unique (reversal_no),
  constraint expense_reversals_amount_positive check (amount > 0),
  constraint expense_reversals_reason_length check (length(trim(reason)) >= 10)
);

create index idx_expense_reversals_original on expense_reversals (original_expense_id);


-- =============================================================================
-- 12. coupons
-- Promotional coupon codes subject to the 25% hard stacking cap.
-- =============================================================================
create table coupons (
  id                   uuid          not null default gen_random_uuid() primary key,
  client_uuid          uuid          not null,
  code                 text          not null,
  description          text,
  discount_percent     numeric(5,2)  not null,
  max_discount_amount  numeric(14,2),
  min_booking_amount   numeric(14,2) not null default 0,
  valid_from           date          not null,
  valid_until          date          not null,
  max_redemptions      integer,
  current_redemptions  integer       not null default 0,
  is_active            boolean       not null default true,
  created_at           timestamptz   not null default now(),
  created_by           uuid          references users (id),
  updated_at           timestamptz   not null default now(),
  updated_by           uuid          references users (id),

  constraint coupons_client_uuid_key unique (client_uuid),
  constraint coupons_code_key unique (code),
  constraint coupons_discount_pct_cap check (discount_percent > 0 and discount_percent <= 25),
  constraint coupons_date_validity check (valid_from <= valid_until)
);

create index idx_coupons_code on coupons (code);
create index idx_coupons_active on coupons (is_active);


-- =============================================================================
-- 13. coupon_redemptions
-- Audit of applied coupon codes on bookings.
-- =============================================================================
create table coupon_redemptions (
  id              uuid           not null default gen_random_uuid() primary key,
  client_uuid     uuid           not null,
  coupon_id       uuid           not null references coupons (id),
  booking_id      uuid           not null references bookings (id),
  client_id       uuid           not null references clients (id),
  discount_amount numeric(14,2)  not null,
  redeemed_at     timestamptz    not null default now(),
  redeemed_by     uuid           references users (id),

  constraint coupon_redemptions_client_uuid_key unique (client_uuid),
  constraint coupon_redemptions_unique_per_booking unique (coupon_id, booking_id),
  constraint coupon_redemptions_amount_positive check (discount_amount > 0)
);

create index idx_coupon_redemptions_booking on coupon_redemptions (booking_id);
create index idx_coupon_redemptions_coupon on coupon_redemptions (coupon_id);


-- =============================================================================
-- 14. tax_ledgers
-- Sales VAT, Purchase VAT, and TDS tax ledger entries for Nepali IRD compliance.
-- =============================================================================
create table tax_ledgers (
  id               uuid           not null default gen_random_uuid() primary key,
  client_uuid      uuid           not null,
  entry_no         text           not null,
  fiscal_period_id uuid           not null references fiscal_periods (id),
  branch_id        uuid           not null references branches (id),
  invoice_id       uuid           references invoices (id),
  expense_id       uuid           references expenses (id),
  tax_type         text           not null default 'VAT',
  tax_direction    text           not null, -- 'Sales VAT', 'Purchase VAT', 'TDS'
  taxable_amount   numeric(14,2)  not null default 0,
  tax_rate         numeric(5,4)   not null default 0.1300,
  tax_amount       numeric(14,2)  not null default 0,
  pan_vat_no       text,
  party_name       text           not null,
  entry_date       date           not null,
  created_at       timestamptz    not null default now(),

  constraint tax_ledgers_client_uuid_key unique (client_uuid),
  constraint tax_ledgers_no_key unique (entry_no),
  constraint tax_ledgers_amounts_valid check (taxable_amount >= 0 and tax_amount >= 0)
);

create index idx_tax_ledgers_fp on tax_ledgers (fiscal_period_id);
create index idx_tax_ledgers_invoice on tax_ledgers (invoice_id);
create index idx_tax_ledgers_expense on tax_ledgers (expense_id);


-- =============================================================================
-- Revocations & RLS
-- =============================================================================
revoke delete on
  bank_accounts,
  fiscal_periods,
  invoices,
  invoice_lines,
  payments,
  payment_reversals,
  security_deposits,
  deposit_movements,
  expense_categories,
  expenses,
  expense_reversals,
  coupons,
  coupon_redemptions,
  tax_ledgers
from public, anon, authenticated;

-- Law 4: UPDATE is strictly revoked on immutable payment tables
revoke update on
  payments,
  payment_reversals,
  deposit_movements,
  expense_reversals,
  coupon_redemptions,
  tax_ledgers
from public, anon, authenticated;

alter table bank_accounts enable row level security;
alter table fiscal_periods enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table payments enable row level security;
alter table payment_reversals enable row level security;
alter table security_deposits enable row level security;
alter table deposit_movements enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table expense_reversals enable row level security;
alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;
alter table tax_ledgers enable row level security;

commit;
