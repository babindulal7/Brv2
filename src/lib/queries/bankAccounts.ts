import { supabase } from '../supabase'
import type { Database } from '../../types/supabase'

/**
 * # The bank-accounts lookup — Law 2's module for the `bank_accounts` entity
 *
 * One reason to exist: `payments.bank_account_id` is the ONLY structured home
 * for "how was this paid" (`recordPayment.ts`'s METHOD block), and writing it
 * requires the operator to pick a real account row. This module is that
 * picker's read. `queries/finance.ts` reads the same table only through the
 * `bank_accounts ( channel_group, bank_name )` embed on payments; a picker
 * needs the rows themselves, which is a different question and so a different
 * module (one module per entity, not one module per screen).
 *
 * ## Who can read it
 *
 * `bank_accounts` is gated `auth_can_view_money()` (0034:202) — a money-blind
 * session gets ZERO rows, not masked ones, same as the three finance ledgers.
 * That is safe for the one consumer this module has today: the Record Payment
 * modal is mounted only behind `rbac.canRecordPayment` (Owner / Coordinator /
 * Accounts), all of whom hold money visibility. A future money-blind caller
 * must render `restricted`, never `empty` — see `queries/finance.ts`'s header.
 *
 * ## What is deliberately NOT selected
 *
 * `account_number`. It is not money and carries no `_v` mask, so nothing would
 * stop the select — which is exactly why the columns are named and it is not
 * among them (`queries/finance.ts` records the same rule for its embed). A
 * payment picker needs a label, not a ledger credential.
 *
 * ## Mock mode
 *
 * The corpus does not serve `bank_accounts`; the mimic returns `[]` loudly
 * (`mock/client.ts:100-106`). The picker must treat an empty list as "no
 * accounts to offer" and still allow the payment with no account — which is
 * also the honest live behaviour for a desk whose accounts are not entered yet.
 */

type PaymentChannelGroupDb = Database['public']['Enums']['payment_channel_group']

export interface BankAccountRow {
  /** `bank_accounts.id` — what `payments.bank_account_id` stores. */
  id: string
  /** `account_name` — `text not null`. The human label ("Babin Rentals Operating"). */
  accountName: string
  /** `bank_name` — `text not null` ("Nabil Bank Ltd.", "eSewa Digital Wallet"). */
  bankName: string
  /** `channel_group` — what the Finance dashboard's method breakdown reads. */
  channelGroup: PaymentChannelGroupDb
  /** `is_primary` — the desk's default account, sorted first. */
  isPrimary: boolean
}

interface RawBankAccountRow {
  id: string
  account_name: string
  bank_name: string
  channel_group: PaymentChannelGroupDb
  is_primary: boolean
}

/**
 * The active accounts a payment may be attributed to, primary first.
 *
 * `is_active` filter for the same reason `listExpenseCategories` has one: a
 * retired account still owns historic payments (Law 3) and keeps rendering
 * through the embed on `listPayments`, but a picker must not offer it for new
 * money.
 */
export async function listBankAccounts(): Promise<BankAccountRow[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, account_name, bank_name, channel_group, is_primary')
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('bank_name', { ascending: true })

  if (error) throw new Error(`listBankAccounts failed: ${error.message}`)

  return ((data ?? []) as unknown as RawBankAccountRow[]).map((r) => ({
    id: r.id,
    accountName: r.account_name,
    bankName: r.bank_name,
    channelGroup: r.channel_group,
    isPrimary: r.is_primary,
  }))
}
