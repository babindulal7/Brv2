import { describe, it, expect } from 'vitest'
import { SCHEMA_PROBES } from '../schemaGuard'

/**
 * **Probe signatures must match the migration DDL, or the guard is a liar.**
 *
 * PostgREST resolves an RPC by matching the caller's argument NAMES against the
 * function's declared parameters. A wrong name is indistinguishable, from the
 * error the client receives, from a function that does not exist — both answer
 * PGRST202. So a probe whose argument names have drifted from the migration will
 * report "schema behind" against a perfectly current database, on every screen,
 * forever. That is not a subtle failure; it is a guard that cries wolf, and the
 * operator learns to dismiss it in exactly the situation it was built for.
 *
 * It already happened. This file's first version of `schemaGuard.ts` called
 * `read_record_editor(p_table, p_id)`; the function declares `(p_kind text,
 * p_id text)`. Nothing caught it, because nothing compared the two.
 *
 * So this compares them. Renaming a function parameter in a migration now fails
 * the build instead of inventing a false alarm in production.
 *
 * `?raw` + `import.meta.glob`, not `node:fs`: this project ships no
 * `@types/node`, so `readFileSync` fails `npm run typecheck` — the same reason
 * `law17.test.ts` does it this way.
 */
const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const ALL_SQL = Object.entries(migrations)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, sql]) => ({ path, sql }))

/** The file whose name starts with the migration number a probe cites. */
function fileFor(migration: string): string | undefined {
  const hit = ALL_SQL.find(({ path }) => {
    const name = path.split('/').pop() ?? ''
    return name.startsWith(migration)
  })
  return hit?.path
}

/**
 * Every declared parameter name for `fn`, from the LAST migration that declares
 * it — a function is routinely redefined, and the newest definition is the one
 * the database actually runs.
 */
function declaredParams(fn: string): { params: string[]; path: string } | undefined {
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`,
    'gi',
  )
  let found: { params: string[]; path: string } | undefined

  for (const { path, sql } of ALL_SQL) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(sql)) !== null) {
      // Signatures span lines and may contain types with their own parentheses,
      // so the parameter list is extracted by balancing, not by regex.
      let depth = 1
      let i = m.index + m[0].length
      while (i < sql.length && depth > 0) {
        const ch = sql[i]
        if (ch === '(') depth++
        else if (ch === ')') depth--
        i++
      }
      const body = sql.slice(m.index + m[0].length, i - 1)
      const params = body
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/^(?:in|out|inout)\s+/i, '').split(/\s+/)[0] ?? '')
        .filter(Boolean)
      found = { params, path }
    }
  }
  return found
}

describe('schemaGuard probes — RPC argument names', () => {
  const rpcProbes = SCHEMA_PROBES.filter((p) => p.kind === 'rpc')

  it('has at least one RPC probe', () => {
    expect(rpcProbes.length).toBeGreaterThan(0)
  })

  for (const probe of rpcProbes) {
    it(`${probe.name} passes exactly the parameters ${probe.migration} declares`, () => {
      const declared = declaredParams(probe.name)
      expect(
        declared,
        `${probe.name} is probed but no migration declares it — is the migration number wrong?`,
      ).toBeDefined()

      const args = Object.keys(probe.args).sort()
      const expected = [...(declared?.params ?? [])].sort()

      expect(
        args,
        `${probe.name} is called with [${args.join(', ')}] but ${declared?.path} declares ` +
          `[${expected.join(', ')}]. PostgREST resolves by name, so a mismatch reads as ` +
          `'function does not exist' and the guard reports a current database as behind.`,
      ).toEqual(expected)
    })

    it(`${probe.name} is declared by the migration it cites`, () => {
      const declared = declaredParams(probe.name)
      expect(fileFor(probe.migration), `no file starts with ${probe.migration}`).toBeDefined()
      expect(
        declared?.path,
        `${probe.name} is declared in ${declared?.path}, but the probe credits ${probe.migration}`,
      ).toContain(probe.migration)
    })
  }
})

describe('schemaGuard probes — relations exist where the probe says', () => {
  it('every column probe names a column some migration adds', () => {
    const columnProbes = SCHEMA_PROBES.filter((p) => p.kind === 'column')
    expect(columnProbes.length).toBeGreaterThan(0)
    for (const probe of columnProbes) {
      const added = ALL_SQL.some(({ sql }) =>
        new RegExp(`add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${probe.name}\\b`, 'i').test(sql),
      )
      expect(added, `no migration adds a column named ${probe.name}`).toBe(true)
    }
  })

  it('every table probe names a table some migration creates', () => {
    const tableProbes = SCHEMA_PROBES.filter((p) => p.kind === 'table')
    expect(tableProbes.length).toBeGreaterThan(0)
    for (const probe of tableProbes) {
      const created = ALL_SQL.some(({ sql }) =>
        new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${probe.name}\\b`, 'i').test(
          sql,
        ),
      )
      expect(created, `no migration creates a table named ${probe.name}`).toBe(true)
    }
  })
})

describe('schemaGuard probes — no write path is probed', () => {
  it('never probes an RPC whose name marks it as a mutation', () => {
    // The guard runs at boot against production. Probing a write RPC would mean
    // calling a mutating path on every cold start to ask whether the database is
    // current. "The ids are nil so it is harmless" is an assumption about code
    // this file does not own.
    const MUTATORS = /^(save|create|update|delete|insert|apply|adjust|void|cancel|post|record|write|set|upsert|transition|release|reserve)/i
    for (const probe of SCHEMA_PROBES.filter((p) => p.kind === 'rpc')) {
      expect(MUTATORS.test(probe.name), `${probe.name} looks like a write path`).toBe(false)
    }
  })

  it('only ever selects, never mutates, a relation probe', () => {
    for (const probe of SCHEMA_PROBES.filter((p) => p.kind !== 'rpc')) {
      // `columns` is passed straight to `.select(...)`; anything that is not a
      // column list would become a filter or a modifier.
      expect(probe.columns, probe.name).toMatch(/^[a-z_][a-z0-9_]*(,\s*[a-z_][a-z0-9_]*)*$/i)
    }
  })
})