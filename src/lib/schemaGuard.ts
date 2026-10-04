import { useEffect, useState } from 'react'
import { supabase, IS_MOCK } from './supabase'

/**
 * **Boot-time schema-version guard — audit finding A1.**
 *
 * ## The failure it exists to prevent
 *
 * The client bundle is built from the newest `src/`, so it calls RPCs that only
 * exist in recent migrations (`adjust_stock` 0140, `save_record_editor` /
 * `read_record_editor` 0146, `read_quote_editor` / `update_rental_quote` 0147).
 * Against a database that has not had those migrations applied, the app does not
 * degrade — it throws at the first call that needs the missing function, in the
 * middle of an operator's action, with no statement about why. The banner turns
 * that into one sentence at boot, before the action is started.
 *
 * ## Why probes, and not a version number
 *
 * The reliable version source, `supabase_migrations.schema_migrations`, is not
 * exposed through PostgREST, so the client cannot read it. What it can do is ask
 * the database whether a specific object is there. Each probe therefore names
 * one object and asks one question.
 *
 * ## THE PROBES NEVER MUTATE — this is a load-bearing rule, not a preference
 *
 * This module runs at app boot against production. Every probe is a READ: a
 * `select … limit 1` or an RPC called with a nil id, which no deployed function
 * can resolve to a row. Probing a write RPC (`adjust_stock`,
 * `update_rental_quote`, `save_record_editor`) would mean calling a mutating path
 * on every cold start to find out whether the database is current, and "the id is
 * nil so it is harmless" is an assumption about code this file does not own. The
 * migrations that introduce those write RPCs also introduce a readable object —
 * a table or a read RPC — and those are what is probed instead. Coverage is
 * therefore per-migration, never per-write-path.
 *
 * ## TRI-STATE, AND WHY "unknown" IS NOT "present"
 *
 * PostgREST answers "no such function" (PGRST202) and "no such column"
 * (PGRST204 / 42703) as schema errors. Everything else that comes back is
 * evidence the object IS deployed and merely refused the call — RLS, a role
 * ceiling, a missing row, a permission denied. That distinction is the whole
 * probe: collapsing it would either raise a banner on a correct database or hide
 * a broken one.
 *
 * A fourth outcome is real and must not be folded in: the request never reached
 * the database. A cold start on a flaky network, a laptop lid closed mid-probe, a
 * captive portal. Those resolve to `unknown`, and `unknown` is surfaced to the
 * operator rather than counted as success — a guard that reports "in sync" when
 * it could not check is worse than no guard, because it is trusted.
 *
 * ## The arg-name trap this file has already fallen into once
 *
 * PostgREST resolves an RPC by matching the caller's argument NAMES against the
 * function's declared parameters. A wrong name is indistinguishable, from the
 * error alone, from a function that does not exist: both answer PGRST202. The
 * first version of this file called `read_record_editor(p_table, p_id)` while
 * the function declares `(p_kind text, p_id text)` — so it reported "schema
 * behind" against a fully-migrated database, every time, on every screen.
 *
 * Names cannot be made safe by a comment, so they are made safe by a gate:
 * `__tests__/schemaGuardProbes.test.ts` parses `supabase/migrations/*.sql` and
 * fails the build if any probe's argument names drift from the DDL. Editing a
 * function signature now breaks a test instead of inventing a false alarm.
 */

import type { PostgrestError } from '@supabase/supabase-js'

export type SchemaProbeVerdict = 'present' | 'missing' | 'unknown'

export type SchemaObjectKind = 'rpc' | 'column' | 'table'

export interface SchemaObjectRef {
  /** The migration that introduces the object, e.g. `'0146'`. */
  migration: string
  /** Function name, column name, or table name, as PostgREST knows it. */
  name: string
  kind: SchemaObjectKind
  /** What stops working if this is absent, in the operator's words. */
  impact: string
}

export interface SchemaGuardState {
  isChecking: boolean
  /** At least one probe proved its object absent. */
  isBehind: boolean
  /** At least one probe never reached the database. Never reported as "in sync". */
  isUnverified: boolean
  missing: SchemaObjectRef[]
  unverified: SchemaObjectRef[]
  checkedAt: string | null
}

/** A nil uuid. Resolves to no row in every table it is used against. */
const NIL = '00000000-0000-0000-0000-000000000000'

/** PostgREST: the schema cache has no such function for this argument list. */
const RPC_ABSENT = /could not find the function|no function matches|function .* does not exist/i
/** PostgREST / Postgres: the relation or column is not there. */
const RELATION_ABSENT = /could not find the table|relation .* does not exist|column .* does not exist/i
/** The request did not reach the database, so it proves nothing either way. */
const TRANSPORT = /failed to fetch|networkerror|network request failed|fetch failed|load failed|socket hang up|terminating connection|timeout|timed out|abort/i

function classify(error: PostgrestError | null, kind: SchemaObjectKind): SchemaProbeVerdict {
  if (!error) return 'present'
  const code = error.code ?? ''
  const message = error.message ?? ''

  if (kind === 'column') {
    if (code === 'PGRST204' || code === '42703' || RELATION_ABSENT.test(message)) return 'missing'
  } else if (kind === 'table') {
    if (code === 'PGRST205' || code === '42P01' || RELATION_ABSENT.test(message)) return 'missing'
  } else if (code === 'PGRST202' || RPC_ABSENT.test(message)) {
    return 'missing'
  }

  // The object is deployed and refused the call. 42501 (permission denied),
  // RLS's 42501-shaped policies, "row not found", and a role ceiling all land
  // here, and for every one of them the schema is current.
  if (TRANSPORT.test(message)) return 'unknown'
  return 'present'
}

export interface RpcProbe extends SchemaObjectRef {
  kind: 'rpc'
  args: Record<string, unknown>
}

export interface RelationProbe extends SchemaObjectRef {
  kind: 'column' | 'table'
  /** For kind: 'column', the table to select from. For kind: 'table', defaults to `name`. */
  table?: string
  /** Column list for `kind: 'column'`; `'id'` is used for a table. */
  columns: string
}

/**
 * One probe per pending migration, chosen from that migration's READ surface.
 *
 * Exported so the drift test can check `args` against the migration DDL. Adding a
 * migration to the pending set means adding a probe here; that is deliberate,
 * because the alternative is silently not covering it.
 */
export const SCHEMA_PROBES: readonly (RpcProbe | RelationProbe)[] = [
  {
    migration: '0147',
    name: 'read_quote_editor',
    kind: 'rpc',
    impact: 'quote editing',
    args: { p_id: NIL },
  },
  {
    migration: '0146',
    name: 'read_record_editor',
    kind: 'rpc',
    impact: 'record editing',
    // `p_kind`, not `p_table` — see the header. Both parameters are `text`.
    args: { p_kind: 'products', p_id: NIL },
  },
  {
    migration: '0140',
    name: 'stock_adjustments',
    kind: 'table',
    impact: 'audited stock adjustments',
    columns: 'id',
  },
  {
    migration: '0144',
    name: 'project_type',
    table: 'bookings',
    kind: 'column',
    impact: 'categorised project types',
    columns: 'id, project_type',
  },
] as const satisfies readonly (RpcProbe | RelationProbe)[]

async function runRpc(spec: RpcProbe): Promise<SchemaProbeVerdict> {
  try {
    const { error } = await supabase.rpc(spec.name, spec.args)
    return classify(error, 'rpc')
  } catch {
    // supabase-js resolves transport failures into `error`; this is the
    // remaining path (a thrown fetch, an aborted mount). Unproven, not absent.
    return 'unknown'
  }
}

async function runRelation(spec: RelationProbe): Promise<SchemaProbeVerdict> {
  try {
    const target = spec.table ?? spec.name
    const { error } = await supabase.from(target).select(spec.columns).limit(1)
    return classify(error, spec.kind)
  } catch {
    return 'unknown'
  }
}

let cached: SchemaGuardState | null = null

function refOf(spec: RpcProbe | RelationProbe): SchemaObjectRef {
  return { migration: spec.migration, name: spec.name, kind: spec.kind, impact: spec.impact }
}

const IN_SYNC: SchemaGuardState = {
  isChecking: false,
  isBehind: false,
  isUnverified: false,
  missing: [],
  unverified: [],
  checkedAt: null,
}

export async function checkDatabaseSchema(): Promise<SchemaGuardState> {
  // Mock mode answers from a local corpus that has no schema to be behind.
  if (IS_MOCK) return { ...IN_SYNC, checkedAt: new Date().toISOString() }
  if (cached) return cached

  const settled = await Promise.all(
    SCHEMA_PROBES.map(async (spec) => {
      const verdict = spec.kind === 'rpc' ? await runRpc(spec) : await runRelation(spec)
      return { ref: refOf(spec), verdict }
    }),
  )

  const byMigrationDesc = (a: SchemaObjectRef, b: SchemaObjectRef) => b.migration.localeCompare(a.migration)

  const missing = settled
    .filter((r) => r.verdict === 'missing')
    .map((r) => r.ref)
    .sort(byMigrationDesc)
  const unverified = settled
    .filter((r) => r.verdict === 'unknown')
    .map((r) => r.ref)
    .sort(byMigrationDesc)

  cached = {
    isChecking: false,
    isBehind: missing.length > 0,
    isUnverified: unverified.length > 0,
    missing,
    unverified,
    checkedAt: new Date().toISOString(),
  }
  return cached
}

/** Test seam: the boot check is a singleton, so suites need to reset it. */
export function __resetSchemaGuardCache(): void {
  cached = null
}

export function useSchemaGuard(): SchemaGuardState {
  const [state, setState] = useState<SchemaGuardState>(
    () => cached ?? { ...IN_SYNC, isChecking: !IS_MOCK },
  )

  useEffect(() => {
    if (IS_MOCK) return
    let active = true
    checkDatabaseSchema().then((res) => {
      if (active) setState(res)
    })
    return () => {
      active = false
    }
  }, [])

  return state
}