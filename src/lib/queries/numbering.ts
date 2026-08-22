import { supabase } from '../supabase'
import { getBusinessToday } from '../bs'
import { applyListFilters, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'

/**
 * # The document-number registry query — `number_sequences`
 *
 * Law 2's Single Query Rule, applied to the sequence registry. Numbering
 * Sequences (`modules/admin/NumberingSequences.tsx`) reads from here; no screen
 * may hand-roll a `supabase.from('number_sequences')`.
 *
 * ## The table (0007_admin_security.sql:349-356, extended by 0055:120)
 *
 * One row per document kind: `sequence_key` (text primary key), `prefix`,
 * `current_year`, `current_value`, `padding`, `include_year`, `updated_at`.
 * Verified live 13 Aug 2026 (0056_ruled_sequences_completion.sql footer):
 * ten rows — booking `B-` · client `C-` · invoice `INV-` · membership `M-` ·
 * quote `Q-` · bundle `BND-` · deposit `DEP-` · expense `EXP-` (all padding 1,
 * year-less per the 12 Aug ruling), payment `PAY-` (padding 4, year-scoped,
 * deliberately unconverted — 0056's header) and equipment `EQ` (padding 6,
 * separator-less).
 *
 * ⚠ `include_year` was added by 0055 AFTER `src/types/supabase.ts` was last
 * generated — the generated `number_sequences.Row` does not carry it, so the
 * raw row is typed locally below (the same move `queries/audit.ts` makes for
 * `inet`). When the types are regenerated the local interface should collapse
 * back onto the generated one.
 *
 * ## Minting vs previewing — the load-bearing distinction
 *
 * `next_document_number(p_sequence_key)` (0007:359, rewritten 0055:140-180) is
 * the ONLY thing that may mint a number: it takes `for update` on the row and
 * UPDATEs `current_value` before returning the formatted string. **Calling it
 * is consuming a number** — there is no dry-run parameter — so a read-only
 * screen must never invoke the RPC "just to show what's next". This module
 * therefore exposes {@link previewNextNumbers}, a pure re-statement of the
 * function's own formatting rules over the row the SELECT returned. The
 * preview can drift from a concurrent mint (someone books while the operator
 * reads); it can never advance a counter.
 *
 * ## Who can read it
 *
 * `number_sequences_select` is `auth_is_staff()` (0033:46-49) — every business
 * role, Client excluded: "a shared counter every staff role legitimately
 * advances by creating documents" (the policy's own comment). Mirrored in
 * {@link numberingRestriction}; a Client session gets 200 + zero rows from
 * RLS, which must render as restricted, never as an empty registry.
 *
 * ## No money crosses this boundary
 *
 * The table has no money column — `current_value` is a counter, not an amount —
 * so nothing here calls `rupees()`/`toRupees()`, and Law 6 withholds nothing.
 *
 * ## No writes cross it either
 *
 * There is no update, insert or reset here. A counter edit mints duplicate IDs
 * product-wide, so writes wait for the gated, audited action path (Phase 2).
 * `listNumberSequences` reads; that is the whole surface.
 *
 * ## Mock mode
 *
 * `number_sequences` is not in the mock corpus (`lib/mock/corpus.ts` serves 13
 * tables; this is not one of them and is not in `UNSERVED` either). The mock
 * engine answers an unknown table with `[]` plus a console warning
 * (`lib/mock/client.ts:100-106`), so the screen renders an honest empty
 * registry rather than a fabricated one.
 */

type SystemRoleDb = Database['public']['Enums']['system_role']

/* ═══════════════════════════════════════════════════════════════════════════
 * Restricted, not empty — the guard the Numbering screen spreads
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The roles `number_sequences_select` admits (0033:46-49, `auth_is_staff()`):
 * the business nine minus the external Client role. Derived from the live
 * policy, never invented — 'find the RLS policy and mirror it'. The same set
 * is `isStaff()` in `lib/rbac.ts:53`; kept as data here so the screen can gate
 * on the policy that actually governs this table.
 */
export const NUMBERING_READ_ROLES = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
  'Technician',
  'Accounts',
  'Driver',
] as const satisfies readonly SystemRoleDb[]

/**
 * Why the surface is closed, in words, for `RestrictedState`. Says the session
 * may not read the registry — NOT that no sequences exist.
 */
export const NUMBERING_RESTRICTED_REASON =
  'The sequence registry is internal numbering infrastructure, and reading it requires a staff role. ' +
  'This is not a statement about whether any sequences exist.'

/** Who a refused session should ask — any staff role qualifies. */
export const NUMBERING_REQUIRED_ROLE = 'Staff'

export interface NumberingRestriction {
  restricted: boolean
  restrictedReason: string
  restrictedRequiredRole: string
}

/**
 * The three `PageBody` props that turn an RLS-empty result into an honest
 * restricted state. Spread it; do not re-derive it. Returns a fixed shape
 * unconditionally (the extra props are inert when `restricted` is false) so
 * `exactOptionalPropertyTypes` stays happy — same contract as
 * `auditRestriction()`, `backupRestriction()` and `financeRestriction()`.
 */
export function numberingRestriction(role: SystemRoleDb | null | undefined): NumberingRestriction {
  return {
    restricted: role == null || !(NUMBERING_READ_ROLES as readonly string[]).includes(role),
    restrictedReason: NUMBERING_RESTRICTED_REASON,
    restrictedRequiredRole: NUMBERING_REQUIRED_ROLE,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The row
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A sequence as the registry renders it. Every field maps to a column in
 * 0007:349-356 (+ 0055:120); nothing is derived, computed or defaulted — the
 * derivations ({@link formatConvention}, {@link previewNextNumbers}) are named
 * functions beside it, so the screen and this module cannot disagree about
 * which figures are stored and which are computed.
 */
export interface NumberSequenceRow {
  /** `sequence_key` — text primary key (0007:350): 'booking', 'client', 'invoice', … The registry's identity. */
  sequenceKey: string
  /** `prefix` — the literal the formatted number starts with, separator included where one exists: 'B-', 'INV-', 'EQ' (0007:351). */
  prefix: string
  /** `current_year` — the year the counter last advanced in (0007:352). Only meaningful for year-scoped sequences, which reset on a year change. */
  currentYear: number
  /** `current_value` — the LAST value issued; the next mint returns `current_value + 1` (0007:353, 0056's own §1 comment). `bigint` arrives as a JS number over PostgREST. */
  currentValue: number
  /** `padding` — `lpad` width for the counter segment (0007:354). 1 under the 12 Aug ruling means "no zero padding". */
  padding: number
  /** `include_year` — false for the sequences ruled year-less on 12 Aug 2026 (0055:120-124). Drives both the rendered format and whether a year change may reset the counter. */
  includeYear: boolean
  /** `updated_at` — when the counter last moved (0007:355), AD/UTC. BS is rendered, never stored (Law 7). */
  updatedAtAd: string
}

/**
 * Columns named explicitly — `select('*')` is how a column nobody reviewed
 * leaks into the payload. `include_year` is real in the live schema (0055:120,
 * verified applied) even though the stale generated types omit it; see the
 * header.
 */
const NUMBER_SEQUENCE_COLUMNS = 'sequence_key, prefix, current_year, current_value, padding, include_year, updated_at'

interface RawNumberSequenceRow {
  sequence_key: string
  prefix: string
  current_year: number
  current_value: number
  padding: number
  include_year: boolean
  updated_at: string
}

function toNumberSequenceRow(r: RawNumberSequenceRow): NumberSequenceRow {
  return {
    sequenceKey: r.sequence_key,
    prefix: r.prefix,
    currentYear: r.current_year,
    currentValue: r.current_value,
    padding: r.padding,
    includeYear: r.include_year,
    updatedAtAd: r.updated_at,
  }
}

export interface ListNumberSequencesOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
}

/**
 * The whole registry, alphabetical by key.
 *
 * Unpaged deliberately: the table holds one row per document kind (ten today)
 * and can only grow by a migration, so fetching it whole is the honest shape —
 * and with no paging, no tiebreak is needed (`sequence_key` is the primary key
 * and already unique; it is one of the two non-`id` PKs `listQuery.ts` names).
 *
 * ⚠ Returns `{ rows: [], total: 0 }` for a Client session — that is RLS, not
 * emptiness. Gate the screen with `numberingRestriction()`.
 */
export async function listNumberSequences(
  opts: ListNumberSequencesOptions = {},
): Promise<ListQueryResult<NumberSequenceRow>> {
  const { withCount, ...filters } = opts

  const base = supabase
    .from('number_sequences')
    .select(NUMBER_SEQUENCE_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    sort: filters.sort ?? { column: 'sequence_key', ascending: true },
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawNumberSequenceRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listNumberSequences failed: ${error.message}`)

  return { rows: (data ?? []).map(toNumberSequenceRow), total: count ?? null }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The `next_document_number()` convention, restated read-only
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The fields the format depends on — a full row qualifies, and so does a
 * screen's draft that overrides prefix/padding/include_year while keeping the
 * stored counter. Keeping this narrow is what lets one implementation serve
 * both the registry column and a what-if preview.
 */
export interface SequenceShape {
  prefix: string
  padding: number
  includeYear: boolean
  currentYear: number
  currentValue: number
}

/**
 * The format a sequence produces, as a template: `B-N`, `PAY-YYYY-NNNN`,
 * `EQNNNNNN`. Pure rendering of 0055's two format branches (0055:170-176) —
 * the prefix carries its own separator where it has one, `N` repeats to the
 * `lpad` width, and the year segment appears only when `include_year` is true.
 */
export function formatConvention(shape: Pick<SequenceShape, 'prefix' | 'padding' | 'includeYear'>): string {
  const counter = 'N'.repeat(Math.max(1, shape.padding))
  return shape.includeYear ? `${shape.prefix}YYYY-${counter}` : `${shape.prefix}${counter}`
}

/**
 * What `next_document_number()` WOULD return for the next `count` mints —
 * computed from the row already in hand, never by calling the RPC.
 *
 * The RPC has no dry-run: it takes the row `for update` and advances
 * `current_value` before formatting (0055:150-176), so invoking it from a
 * read-only screen would consume a real number. This function restates its
 * exact rules instead:
 *
 *  - next value is `current_value + 1` — EXCEPT that a year-scoped sequence
 *    (`include_year` true) whose `current_year` is behind the current year
 *    resets to 1 on its next mint (0055:158-162; a year-less sequence must
 *    never reset — it would re-issue a number it already handed out);
 *  - the counter is `lpad`-ded to `padding`;
 *  - year-scoped renders `prefix + year + '-' + counter`, year-less renders
 *    `prefix + counter` (the prefix owns its separator, which is how `EQ000824`
 *    works through the same branch).
 *
 * "The current year" is the Kathmandu business year via `getBusinessToday()` —
 * the product's one `today` (Law 7). The RPC itself reads the DB server's
 * `current_date` (UTC), so for the 5¾ hours each 1 January in which Kathmandu
 * is already in the new year and UTC is not, this preview shows the rollover
 * before the database performs it. A preview that is briefly early once a year
 * is accepted over a second, hand-typed copy of "today".
 *
 * @param now Override for tests, forwarded to `getBusinessToday`.
 */
export function previewNextNumbers(shape: SequenceShape, count: number, now: Date = new Date()): string[] {
  const year = getBusinessToday(now).getUTCFullYear()
  const rollsOver = shape.includeYear && shape.currentYear !== year
  const firstNext = rollsOver ? 1 : shape.currentValue + 1

  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const counter = String(firstNext + i).padStart(Math.max(1, shape.padding), '0')
    return shape.includeYear ? `${shape.prefix}${year}-${counter}` : `${shape.prefix}${counter}`
  })
}

/** The single next number — the registry column's figure. */
export function previewNextNumber(shape: SequenceShape, now: Date = new Date()): string {
  return previewNextNumbers(shape, 1, now)[0] as string
}
