/**
 * **Mock PostgREST engine — the query half of the local mimic.**
 *
 * This file answers `supabase.from(...)` against in-memory rows instead of the
 * network. It exists so the app can be driven with no Supabase project and no
 * internet, and so a clone of this repo runs without anyone's credentials.
 *
 * ⚠ WHAT THIS IS NOT. It is not the dev auth bypass that was removed on
 * 12 Aug 2026 (`lib/auth.tsx` §"There were two dev doors here"). That shim set
 * the React `user` while leaving queries to go out as `anon`, so RLS denied
 * them and the app rendered "Owner" over empty lists — a failure with no
 * symptom. The rule this file follows instead:
 *
 *   > In mock mode the DATA MUST ACTUALLY ARRIVE. An empty list in mock mode
 *   > means the corpus genuinely has no such row, never that a request was
 *   > refused. If a table cannot be served faithfully it is listed in
 *   > `corpus.ts` UNSERVED, and the banner says so.
 *
 * ── Fidelity notes, each of which is load-bearing somewhere in the app ──
 *
 * 1. `count` is computed BEFORE `.range()`/`.limit()`. Every KPI tile in the
 *    product reads `total` and ignores `rows` (RentalsList, Inventory, Today,
 *    OperationsQueues, Finance). Counting after paging turns every headline
 *    number into the page size.
 * 2. A to-many embed resolves to `[]`, never `null`/`undefined`. `bookingQuery`
 *    treats `null` as "unknown → money must be null" and `[]` as a real Rs 0.
 * 3. Two OPPOSITE embed-filter semantics, both used:
 *      · `.is('booking_lines.voided_at', null)` — non-inner: prune the child
 *        array, KEEP the parent.
 *      · `.in('unit_state.status', [...])` — `!inner` alias: DROP the parent
 *        when nothing matches (semi-join).
 *    Getting the first wrong deletes bookings from the Rentals list; getting
 *    the second wrong deletes the Inventory filter.
 * 4. Two ilike dialects reach `.or()`: `*term*` from `applyListFilters` and
 *    `%term%` from `queries/clients.ts`. Both are honoured.
 * 5. Two spellings for the same embed: filters use `category.name`, sorts use
 *    `category(name)`. Both are honoured.
 * 6. `.order()` is CUMULATIVE — `applyListFilters` calls it twice and the
 *    second is a tiebreak, not a replacement.
 */

export interface PgError {
  message: string
  code?: string
  details?: string
  hint?: string
}

export type Row = Record<string, unknown>
export type Store = Record<string, Row[]>

/* ── Relationships ─────────────────────────────────────────────────────────
   PostgREST infers embeds from foreign keys. There is no FK graph in the
   browser, so the ones the app actually asks for are declared. An embed the
   app requests that is missing from here resolves to null/[] rather than
   throwing, and warns once — silence would reproduce the very defect this
   file exists to avoid.
   ------------------------------------------------------------------------ */

interface Rel {
  kind: 'one' | 'many'
  /** Table the embed reads from. */
  table: string
  /** Column on the PARENT (kind 'one') or on the CHILD (kind 'many'). */
  fk: string
}

const REL: Record<string, Rel> = {
  'bookings.clients': { kind: 'one', table: 'clients', fk: 'client_id' },
  'bookings.booking_lines': { kind: 'many', table: 'booking_lines', fk: 'booking_id' },
  'bookings.booking_lines_v': { kind: 'many', table: 'booking_lines_v', fk: 'booking_id' },
  'bookings.booking_crew_lines': { kind: 'many', table: 'booking_crew_lines', fk: 'booking_id' },
  'booking_lines.booking_line_units': { kind: 'many', table: 'booking_line_units', fk: 'booking_line_id' },
  'booking_lines.products': { kind: 'one', table: 'products', fk: 'product_id' },
  'booking_lines.products_v': { kind: 'one', table: 'products_v', fk: 'product_id' },
  'booking_line_units.product_units': { kind: 'one', table: 'product_units', fk: 'asset_id' },
  'booking_line_units.product_units_v': { kind: 'one', table: 'product_units_v', fk: 'asset_id' },
  'products_v.inventory_categories': { kind: 'one', table: 'inventory_categories', fk: 'category_id' },
  'products_v.product_units_v': { kind: 'many', table: 'product_units_v', fk: 'product_id' },
  'products.inventory_categories': { kind: 'one', table: 'inventory_categories', fk: 'category_id' },
  /* Bundles — `queries/bundles.ts` embeds both in one call, and
     `queries/bundleRecords.ts` walks booking_lines → bookings → clients to find
     what is holding a bundle. `inventory_reservations.bookings` is what
     `readHolds` asks for so a conflict can be named; without it every hold
     reports its booking uuid instead of its `B-…` number. */
  'bundles.inventory_categories': { kind: 'one', table: 'inventory_categories', fk: 'category_id' },
  'bundles.bundle_items': { kind: 'many', table: 'bundle_items', fk: 'bundle_id' },
  'booking_lines.bookings': { kind: 'one', table: 'bookings', fk: 'booking_id' },
  'inventory_reservations.bookings': { kind: 'one', table: 'bookings', fk: 'booking_id' },
  'product_units_v.products_v': { kind: 'one', table: 'products_v', fk: 'product_id' },
  'invoices.clients': { kind: 'one', table: 'clients', fk: 'client_id' },
  'invoices.bookings': { kind: 'one', table: 'bookings', fk: 'booking_id' },
  'payments.clients': { kind: 'one', table: 'clients', fk: 'client_id' },
  'payments.bookings': { kind: 'one', table: 'bookings', fk: 'booking_id' },
  'expenses.expense_categories': { kind: 'one', table: 'expense_categories', fk: 'category_id' },
  'expenses.branches': { kind: 'one', table: 'branches', fk: 'branch_id' },
}

const warned = new Set<string>()
function warnOnce(msg: string): void {
  if (warned.has(msg)) return
  warned.add(msg)
  console.warn(`[mock] ${msg}`)
}

/* ── select() parser ───────────────────────────────────────────────────────
   Grammar, as the app actually spells it:
     list   := item (',' item)*
     item   := column | alias? table hint? '(' list ')'
     alias  := ident ':'
     hint   := '!inner'
   Whitespace inside parens is present in every real select string
   (`clients ( name )`, never `clients(name)`), so it is tolerated everywhere.
   ------------------------------------------------------------------------ */

export type SelectNode =
  | { kind: 'col'; name: string }
  | { kind: 'star' }
  | { kind: 'embed'; alias: string; table: string; inner: boolean; children: SelectNode[] }

export function parseSelect(input: string | undefined): SelectNode[] {
  const src = (input ?? '*').trim()
  if (src === '*' || src === '') return [{ kind: 'star' }]
  const [nodes] = parseList(src, 0)
  return nodes
}

function parseList(src: string, i: number): [SelectNode[], number] {
  const out: SelectNode[] = []
  let buf = ''
  const flush = () => {
    const t = buf.trim()
    buf = ''
    if (!t) return
    out.push(t === '*' ? { kind: 'star' } : { kind: 'col', name: t })
  }
  while (i < src.length) {
    const ch = src[i]
    if (ch === ',') {
      flush()
      i++
    } else if (ch === ')') {
      flush()
      return [out, i + 1]
    } else if (ch === '(') {
      // `buf` holds `alias:table!inner` (or just `table`)
      const head = buf.trim()
      buf = ''
      const [children, next] = parseList(src, i + 1)
      i = next
      const bang = head.indexOf('!')
      const withoutHint = bang === -1 ? head : head.slice(0, bang)
      const inner = bang !== -1 && head.slice(bang + 1).trim().startsWith('inner')
      const colon = withoutHint.indexOf(':')
      const table = (colon === -1 ? withoutHint : withoutHint.slice(colon + 1)).trim()
      const alias = (colon === -1 ? table : withoutHint.slice(0, colon)).trim()
      out.push({ kind: 'embed', alias, table, inner, children })
    } else {
      buf += ch
      i++
    }
  }
  flush()
  return [out, i]
}

/* ── Operators ─────────────────────────────────────────────────────────── */

type Op =
  | { t: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; col: string; val: unknown }
  | { t: 'in'; col: string; vals: readonly unknown[] }
  | { t: 'is'; col: string; val: null | boolean }
  | { t: 'notis'; col: string }
  | { t: 'contains'; col: string; val: unknown }
  | { t: 'match'; obj: Record<string, unknown> }
  | { t: 'or'; clauses: { col: string; op?: string; pattern: string }[] }

interface OrderKey {
  col: string
  /** Set when the sort names an embed, e.g. `category(name)`. */
  embed?: string
  ascending: boolean
}

/** `*` and `%` are both multi-char wildcards here; `_` is single-char. */
function ilikeToRegExp(pattern: string): RegExp {
  let out = ''
  for (const ch of pattern) {
    if (ch === '*' || ch === '%') out += '.*'
    else if (ch === '_') out += '.'
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

function get(row: Row, col: string): unknown {
  return row[col]
}

/**
 * An ISO instant WITH a time part. Date-only strings (`2026-09-01`) stay on the
 * string path below on purpose: they are stored and queried in one uniform
 * format, so lexicographic order IS chronological order for them, and pushing
 * them through `Date.parse` would buy nothing.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1 // NULLS LAST for ASC, matching Postgres
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  /*
   * Timestamps compare as INSTANTS, never as strings. The rows store `Z`-form
   * ISO; `operationalDayBounds` (lib/operationalDay.ts) emits `+05:45`-offset
   * bounds — and `'…T04:15:00Z' >= '…T06:00:00+05:45'` is false as strings even
   * though 04:15Z is 10:00 NPT, inside the day. The string path silently
   * dropped every row in the 00:00–06:00Z band — the whole Nepal working
   * morning — from every mock date-ranged read (found on the Dashboard's
   * Outgoing list, 1 Sep 2026). Postgres parses the offset; now the mock does
   * too. Both sides must look like instants, so a timestamp column compared
   * against a non-timestamp value keeps the old behaviour.
   */
  if (typeof a === 'string' && typeof b === 'string' && ISO_INSTANT.test(a) && ISO_INSTANT.test(b)) {
    const ta = Date.parse(a)
    const tb = Date.parse(b)
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb ? 0 : ta < tb ? -1 : 1
  }
  return String(a) < String(b) ? -1 : 1
}

function matchesOp(row: Row, op: Op): boolean {
  switch (op.t) {
    case 'eq': return get(row, op.col) === op.val
    case 'neq': return get(row, op.col) !== op.val
    case 'gt': return cmp(get(row, op.col), op.val) > 0
    case 'gte': return cmp(get(row, op.col), op.val) >= 0
    case 'lt': return cmp(get(row, op.col), op.val) < 0
    case 'lte': return cmp(get(row, op.col), op.val) <= 0
    case 'in': return op.vals.includes(get(row, op.col) as never)
    case 'is': {
      const v = get(row, op.col)
      return op.val === null ? v === null || v === undefined : v === op.val
    }
    case 'notis': {
      const v = get(row, op.col)
      return v !== null && v !== undefined
    }
    case 'contains': {
      const v = get(row, op.col)
      if (!Array.isArray(v)) return false
      const want = Array.isArray(op.val) ? op.val : [op.val]
      return want.every((w) => (v as unknown[]).includes(w))
    }
    case 'match':
      return Object.entries(op.obj).every(([k, v]) => get(row, k) === v)
    case 'or':
      return op.clauses.some((c) => {
        const v = get(row, c.col)
        if (v === null || v === undefined) return false
        if (c.op === 'eq') return String(v) === c.pattern
        return ilikeToRegExp(c.pattern).test(String(v))
      })
  }
}

function opColumn(op: Op): string | null {
  return op.t === 'match' ? null : op.t === 'or' ? (op.clauses[0]?.col ?? null) : op.col
}

/* ── Builder ───────────────────────────────────────────────────────────── */

export type Result<T = unknown> = { data: T; error: PgError | null; count: number | null }

export interface MockBuilderLike extends PromiseLike<Result> {
  select(columns?: string, options?: { count?: 'exact' }): MockBuilderLike
  insert(payload: Row | Row[]): MockBuilderLike
  update(payload: Row): MockBuilderLike
  upsert(payload: Row | Row[], opts?: { onConflict?: string }): MockBuilderLike
  delete(): MockBuilderLike
  eq(col: string, val: unknown): MockBuilderLike
  neq(col: string, val: unknown): MockBuilderLike
  gt(col: string, val: unknown): MockBuilderLike
  gte(col: string, val: unknown): MockBuilderLike
  lt(col: string, val: unknown): MockBuilderLike
  lte(col: string, val: unknown): MockBuilderLike
  in(col: string, vals: readonly unknown[]): MockBuilderLike
  is(col: string, val: null | boolean): MockBuilderLike
  not(col: string, operator: string, val: unknown): MockBuilderLike
  contains(col: string, val: unknown): MockBuilderLike
  match(obj: Record<string, unknown>): MockBuilderLike
  or(filters: string, opts?: { referencedTable?: string }): MockBuilderLike
  order(col: string, opts?: { ascending?: boolean }): MockBuilderLike
  limit(n: number): MockBuilderLike
  range(from: number, to: number): MockBuilderLike
  single(): PromiseLike<Result>
  maybeSingle(): PromiseLike<Result>
}

export interface EngineHooks {
  /** Resolve a table or view to its rows. Views are synthesised on read. */
  read(table: string): Row[]
  /** Apply an insert; returns the stored rows or a PgError (e.g. 23505). */
  insert(table: string, rows: Row[]): { rows: Row[]; error: PgError | null }
  update(table: string, patch: Row, pred: (r: Row) => boolean): Row[]
  remove(table: string, pred: (r: Row) => boolean): Row[]
}

type Mode =
  | { m: 'select' }
  | { m: 'insert'; payload: Row[] }
  | { m: 'update'; payload: Row }
  | { m: 'upsert'; payload: Row[]; onConflict: string | undefined }
  | { m: 'delete' }

export function createBuilder(table: string, hooks: EngineHooks): MockBuilderLike {
  const ops: Op[] = []
  const orders: OrderKey[] = []
  let mode: Mode = { m: 'select' }
  let selectStr: string | undefined
  let selectCalled = false
  let wantCount = false
  let rangeFrom: number | null = null
  let rangeTo: number | null = null
  let limitN: number | null = null
  let single: 'one' | 'maybe' | null = null

  const self = {} as MockBuilderLike
  const chain = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A): MockBuilderLike => {
    fn(...a)
    return self
  }

  Object.assign(self, {
    select: chain((columns?: string, options?: { count?: 'exact' }) => {
      selectCalled = true
      selectStr = columns
      if (options?.count === 'exact') wantCount = true
    }),
    insert: chain((payload: Row | Row[]) => {
      mode = { m: 'insert', payload: Array.isArray(payload) ? payload : [payload] }
    }),
    update: chain((payload: Row) => { mode = { m: 'update', payload } }),
    upsert: chain((payload: Row | Row[], opts?: { onConflict?: string }) => {
      mode = {
        m: 'upsert',
        payload: Array.isArray(payload) ? payload : [payload],
        onConflict: opts?.onConflict,
      }
    }),
    delete: chain(() => { mode = { m: 'delete' } }),
    eq: chain((col: string, val: unknown) => { ops.push({ t: 'eq', col, val }) }),
    neq: chain((col: string, val: unknown) => { ops.push({ t: 'neq', col, val }) }),
    gt: chain((col: string, val: unknown) => { ops.push({ t: 'gt', col, val }) }),
    gte: chain((col: string, val: unknown) => { ops.push({ t: 'gte', col, val }) }),
    lt: chain((col: string, val: unknown) => { ops.push({ t: 'lt', col, val }) }),
    lte: chain((col: string, val: unknown) => { ops.push({ t: 'lte', col, val }) }),
    in: chain((col: string, vals: readonly unknown[]) => { ops.push({ t: 'in', col, vals }) }),
    is: chain((col: string, val: null | boolean) => { ops.push({ t: 'is', col, val }) }),
    not: chain((col: string, operator: string, val: unknown) => {
      // `.not(col, 'is', null)` is the only form the app emits.
      if (operator === 'is' && val === null) ops.push({ t: 'notis', col })
      else warnOnce(`unsupported .not(${col}, ${operator}, …) — ignored`)
    }),
    contains: chain((col: string, val: unknown) => { ops.push({ t: 'contains', col, val }) }),
    match: chain((obj: Record<string, unknown>) => { ops.push({ t: 'match', obj }) }),
    or: chain((filters: string) => {
      const clauses = filters
        .split(',')
        .map((c) => {
          const first = c.indexOf('.')
          const second = c.indexOf('.', first + 1)
          if (first === -1 || second === -1) return null
          const col = c.slice(0, first).trim()
          const op = c.slice(first + 1, second).trim()
          const pattern = c.slice(second + 1)
          if (op !== 'ilike' && op !== 'like' && op !== 'eq') {
            warnOnce(`.or() operator "${op}" is not supported — clause ignored`)
            return null
          }
          return { col, op, pattern }
        })
        .filter((x): x is { col: string; op: string; pattern: string } => x !== null)
      if (clauses.length) ops.push({ t: 'or', clauses })
    }),
    order: chain((col: string, opts?: { ascending?: boolean }) => {
      // Sorts spell embeds as `category(name)`; filters spell them `category.name`.
      const m = /^([A-Za-z0-9_]+)\s*\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(col.trim())
      const key: OrderKey = m
        ? { embed: m[1] as string, col: m[2] as string, ascending: opts?.ascending ?? true }
        : { col, ascending: opts?.ascending ?? true }
      orders.push(key)
    }),
    limit: chain((n: number) => { limitN = n }),
    range: chain((from: number, to: number) => { rangeFrom = from; rangeTo = to }),
    single: () => { single = 'one'; return self },
    maybeSingle: () => { single = 'maybe'; return self },
    then: <R1, R2>(
      onOk?: ((v: Result) => R1 | PromiseLike<R1>) | null,
      onErr?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
    ) => Promise.resolve(run()).then(onOk, onErr),
  })

  function run(): Result {
    try {
      switch (mode.m) {
        case 'insert':
        case 'upsert': {
          const { rows, error } = hooks.insert(table, mode.payload as Row[])
          if (error) return { data: null, error, count: null }
          return finishWrite(rows)
        }
        case 'update': {
          const pred = rowPredicate()
          const rows = hooks.update(table, mode.payload, pred)
          return finishWrite(rows)
        }
        case 'delete': {
          const rows = hooks.remove(table, rowPredicate())
          return finishWrite(rows)
        }
        case 'select':
        default:
          return runSelect()
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      warnOnce(`query on "${table}" threw: ${message}`)
      return { data: single ? null : [], error: { message }, count: null }
    }
  }

  /** Writes only return rows when `.select()` was chained (PostgREST behaviour). */
  function finishWrite(rows: Row[]): Result {
    if (!selectCalled) return { data: null, error: null, count: null }
    const shaped = rows.map((r) => project(r, parseSelect(selectStr), table))
    return shapeSingle(shaped, shaped.length)
  }

  function rowPredicate(): (r: Row) => boolean {
    const plain = ops.filter((o) => {
      const c = opColumn(o)
      return c === null || !c.includes('.')
    })
    return (r) => plain.every((o) => matchesOp(r, o))
  }

  function runSelect(): Result {
    const nodes = parseSelect(selectStr)
    let rows = hooks.read(table).slice()

    // 1 · plain-column filters
    for (const op of ops) {
      const c = opColumn(op)
      if (c !== null && c.includes('.')) continue
      rows = rows.filter((r) => matchesOp(r, op))
    }

    // 2 · project embeds, then apply dotted filters against them
    let shaped = rows.map((r) => ({ src: r, out: project(r, nodes, table) }))

    for (const op of ops) {
      const c = opColumn(op)
      if (c === null || !c.includes('.')) continue
      const dot = c.indexOf('.')
      const alias = c.slice(0, dot)
      const col = c.slice(dot + 1)
      const node = findEmbed(nodes, alias)
      if (!node) {
        warnOnce(`filter on "${c}" names an embed that "${table}" does not select — ignored`)
        continue
      }
      const rel = REL[`${table}.${node.table}`]
      if (!rel) {
        warnOnce(`filter on "${c}" has no declared relationship ${table} → ${node.table} — ignored`)
        continue
      }
      const scoped: Op = { ...(op as Extract<Op, { col: string }>), col } as Op

      // ⚠ Filter the SOURCE child rows, never the projected ones. An embed
      // commonly selects fewer columns than it filters on — `unit_state:
      // product_units_v!inner ( id )` is filtered by `unit_state.status`, and
      // `booking_lines ( id, qty )` by `booking_lines.voided_at`. Matching
      // against the projection makes every such filter compare `undefined`:
      // the semi-join then drops every row, and the prune silently keeps every
      // row. Both were observed before this was fixed.
      shaped = shaped
        .map((entry) => {
          if (rel.kind === 'many') {
            const kids = hooks.read(rel.table).filter((k) => k[rel.fk] === entry.src['id'])
            const kept = kids.filter((k) => matchesOp(k, scoped))
            if (node.inner) return kept.length > 0 ? entry : null // semi-join
            // non-inner: prune the array, KEEP the parent
            return {
              ...entry,
              out: { ...entry.out, [alias]: kept.map((k) => project(k, node.children, rel.table)) },
            }
          }
          const fk = entry.src[rel.fk]
          const parentRow =
            fk == null ? undefined : hooks.read(rel.table).find((k) => k['id'] === fk)
          const ok = parentRow ? matchesOp(parentRow, scoped) : false
          if (node.inner) return ok ? entry : null
          return ok ? entry : { ...entry, out: { ...entry.out, [alias]: null } }
        })
        .filter((e): e is { src: Row; out: Row } => e !== null)
    }

    // 3 · order — cumulative, first key primary
    if (orders.length) {
      shaped.sort((a, b) => {
        for (const k of orders) {
          const av = k.embed ? embedValue(a.out, k.embed, k.col) : get(a.src, k.col)
          const bv = k.embed ? embedValue(b.out, k.embed, k.col) : get(b.src, k.col)
          const d = cmp(av, bv)
          if (d !== 0) return k.ascending ? d : -d
        }
        return 0
      })
    }

    // 4 · count BEFORE paging — every KPI tile in the app depends on this
    const total = shaped.length

    // 5 · page
    let out = shaped.map((e) => e.out)
    if (rangeFrom !== null && rangeTo !== null) out = out.slice(rangeFrom, rangeTo + 1)
    if (limitN !== null) out = out.slice(0, limitN)

    return shapeSingle(out, wantCount ? total : null)
  }

  function shapeSingle(rows: Row[], count: number | null): Result {
    if (single === 'one') {
      if (rows.length === 0) {
        return {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
            details: 'The result contains 0 rows',
          },
          count,
        }
      }
      return { data: rows[0] as Row, error: null, count }
    }
    if (single === 'maybe') {
      return { data: (rows[0] ?? null) as Row | null, error: null, count }
    }
    return { data: rows, error: null, count }
  }

  function embedValue(out: Row, alias: string, col: string): unknown {
    const v = out[alias]
    if (Array.isArray(v)) return (v[0] as Row | undefined)?.[col]
    if (v && typeof v === 'object') return (v as Row)[col]
    return undefined
  }

  function findEmbed(nodes: SelectNode[], alias: string): Extract<SelectNode, { kind: 'embed' }> | null {
    for (const n of nodes) {
      if (n.kind === 'embed' && n.alias === alias) return n
    }
    return null
  }

  function project(row: Row, nodes: SelectNode[], parent: string): Row {
    if (nodes.some((n) => n.kind === 'star')) return { ...row }
    const out: Row = {}
    for (const n of nodes) {
      if (n.kind === 'col') {
        out[n.name] = row[n.name] ?? null
        continue
      }
      if (n.kind !== 'embed') continue
      const rel = REL[`${parent}.${n.table}`]
      if (!rel) {
        warnOnce(`no relationship declared for ${parent} → ${n.table}; embed "${n.alias}" left empty`)
        out[n.alias] = n.inner ? null : []
        continue
      }
      const childRows = hooks.read(rel.table)
      if (rel.kind === 'one') {
        const fkVal = row[rel.fk]
        const hit = fkVal == null ? undefined : childRows.find((c) => c['id'] === fkVal)
        out[n.alias] = hit ? project(hit, n.children, rel.table) : null
      } else {
        const mine = childRows.filter((c) => c[rel.fk] === row['id'])
        // ALWAYS an array — `null` means "unknown" to bookingQuery's money code.
        out[n.alias] = mine.map((c) => project(c, n.children, rel.table))
      }
    }
    return out
  }

  return self
}
