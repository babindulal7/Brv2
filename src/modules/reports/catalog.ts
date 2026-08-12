import type { PeriodFigures } from '../../data/pulse'

/**
 * # The 45-report register — `09_FINANCE.md` §9.6
 *
 * ## What this file is, and the rule it was written under
 *
 * `CONFLICTS.md` §09.7 is explicit: *"Do not add a 14th seed module for the
 * catalog. The 45 reports need one figures source behind the shared toolbar, or
 * the template will be shared while the numbers stay 45 independent
 * inventions."* `PLAN.md` §5 Conventions lists "a per-screen seed array" under
 * **Never**, and this repo already has ~13.
 *
 * So: **there is not one figure in this file.** It is a register — names,
 * groups, where a report already lives, and which projection of the ONE figures
 * source answers it. Every number the catalog and the template render comes
 * from `data/pulse.ts`'s `figuresFor(from, to)`, which is a single dated ledger
 * with its own reconciliation assertions and its own `MODEL_DISCLOSURE`.
 *
 * ## `projection: null` means "not tracked yet", and it means it
 *
 * §9.7 Notes: *"A report with no data source shows 'not tracked yet', never
 * zeros."* `WIREFRAME_RULINGS_2026-08-12.md` §8 says the same thing twice as
 * hard. So a report with no projection and no built screen carries `needs` —
 * one sentence naming the table or the ruling that is missing — and the
 * template renders that instead of a chart of nothing.
 *
 * **Payables is the named case** (§9.6: *"drawn but has no supplier-invoice
 * table yet: it renders the honest 'not tracked yet' empty state, never a
 * fabricated figure"*), and it is not the only one. Each `null` below was
 * checked against `supabase/migrations/` rather than assumed.
 *
 * A projection is given ONLY where `figuresFor()` computes that exact quantity
 * under that exact name. Where the name and the quantity are close but not the
 * same thing — "Sales" against invoiced revenue, "Receivables" against a
 * cumulative ledger balance — the answer is `null` with the reason, because a
 * number under the wrong name is a fabrication with extra steps.
 *
 * ## ⚠ Law 17 renames group 05
 *
 * `PLAN.md` §0 Law 17: *"The word 'customer' appears nowhere in the UI. They
 * are clients."* `WIREFRAME_RULINGS_2026-08-12.md` §7 — laws outrank
 * wireframes. So spec 09's "05 Customers / Customer Revenue / Customer Lifetime
 * Value / Customer History" is registered as **Clients / Client Revenue /
 * Client Lifetime Value / Client History**. The count and the order are
 * untouched; only the banned word is.
 */

/* ── groups ──────────────────────────────────────────────────────────────── */

export type GroupKey = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'

export interface ReportGroup {
  key: GroupKey
  /** "01 Overview" is rendered as number + name; the number is the sort key. */
  name: string
}

export const GROUPS: readonly ReportGroup[] = [
  { key: '01', name: 'Overview' },
  { key: '02', name: 'Rentals' },
  { key: '03', name: 'Equipment' },
  { key: '04', name: 'Inventory' },
  /* Law 17 — spec 09 writes "Customers". */
  { key: '05', name: 'Clients' },
  { key: '06', name: 'Finance' },
  { key: '07', name: 'Operations' },
  { key: '08', name: 'Damage & Maintenance' },
  { key: '09', name: 'Staff' },
  { key: '10', name: 'Management' },
] as const

/* ── the one figures source, projected ───────────────────────────────────── */

/**
 * A projection of `PeriodFigures` into the §9.7 template's fixed shape:
 * one headline sentence, one chart, one table.
 *
 * There are six of them for 45 reports, and that ratio is the point. A report
 * either asks a question this ledger answers — in which case it reuses the
 * projection rather than inventing a parallel one — or it does not, in which
 * case it says so.
 */
export type ProjectionKey = 'revenue' | 'profit' | 'cash' | 'utilization' | 'equipment' | 'expenses'

export interface Projection {
  key: ProjectionKey
  /** Column headers for the ONE table. */
  columns: readonly string[]
  /** Y-axis meaning, for the ONE chart's series label. */
  series: string
  /**
   * The working, shown on hover/long-press of any figure — §9.7's
   * "formula · period AD+BS · source".
   */
  formula: string
  source: string
}

export const PROJECTIONS: Readonly<Record<ProjectionKey, Projection>> = {
  revenue: {
    key: 'revenue',
    columns: ['Period', 'Revenue', 'Share'],
    series: 'Revenue',
    formula: 'Σ ledger.revenue over the days in each bucket. Buckets are the period split ≤ 8 ways.',
    source: 'data/pulse.ts — LEDGER, one row per day, via figuresFor(from, to)',
  },
  profit: {
    key: 'profit',
    columns: ['Period', 'Revenue', 'Expenses', 'Profit'],
    series: 'Profit',
    formula: 'Profit = Σ revenue − Σ expenses, per bucket. Accrual, not cash — cash is its own report.',
    source: 'data/pulse.ts — LEDGER revenue and expenses, via figuresFor(from, to)',
  },
  cash: {
    key: 'cash',
    columns: ['Period', 'Cash in', 'Cash out', 'Net'],
    series: 'Net cash',
    formula:
      'Net = Σ cashIn − Σ cashOut, per bucket. Deposits are excluded from every line: they are client money held in trust (Law 5).',
    source: 'data/pulse.ts — LEDGER cashIn / cashOut, via figuresFor(from, to)',
  },
  utilization: {
    key: 'utilization',
    columns: ['Period', 'Utilization', 'Rental days', 'Capacity'],
    series: 'Utilization %',
    formula:
      'Utilization = units on rent ÷ (fleet units × days in bucket). Bounded at 100% by construction — §5.3 of Reports.md.',
    source: 'data/pulse.ts — LEDGER onRentTotal against FLEET_UNITS, via figuresFor(from, to)',
  },
  equipment: {
    key: 'equipment',
    columns: ['Model', 'Revenue', 'Rental days', 'Utilization'],
    series: 'Revenue',
    formula: 'Per-model Σ revenue over the period; utilization is that model’s rental days ÷ its own units × days.',
    source: 'data/pulse.ts — FLEET × LEDGER per-model allocation, via figuresFor(from, to).equipment',
  },
  expenses: {
    key: 'expenses',
    columns: ['Period', 'Expenses', 'Share'],
    series: 'Expenses',
    formula: 'Σ ledger.expenses over the days in each bucket.',
    source: 'data/pulse.ts — LEDGER, one row per day, via figuresFor(from, to)',
  },
} as const

/* ── the register ────────────────────────────────────────────────────────── */

export interface CatalogReport {
  /** Stable slug. Used as the selection key and in no URL — no route is claimed here. */
  key: string
  name: string
  group: GroupKey
  /** An existing full screen that already answers this, or `null`. */
  route: string | null
  /** Which projection of `figuresFor()` answers it, or `null` for "not tracked yet". */
  projection: ProjectionKey | null
  /**
   * Rendered wherever the report cannot be drawn — on the catalog tile and as
   * the template's whole body. One sentence, naming the missing table or the
   * unruled formula. Never a promise, never a date.
   */
  needs?: string
  /**
   * Set where `09_FINANCE.md` §9.6 declares the entry unresolved. Rendered on
   * the tile so the duplication is visible rather than silently shipped.
   * `WIREFRAME_RULINGS_2026-08-12.md` §9.3 forbids resolving these here.
   */
  unresolved?: string
}

/**
 * Two sentences that recur, so the wording cannot drift between the twelve
 * reports that share a cause.
 */
const NO_LEDGER_DIMENSION =
  'The one figures source is a daily ledger of revenue, expenses, cash and units on rent. It carries no dimension for this question, so there is nothing to group.'
const NEEDS_QUERY =
  'The tables exist but lib/queries has no named set for this, so no figure here would be one the database could defend.'

export const REPORTS: readonly CatalogReport[] = [
  /* ── 01 Overview · 4 ─────────────────────────────────────────────────── */
  {
    key: 'executive-dashboard',
    name: 'Executive Dashboard',
    group: '01',
    route: '/reports/pulse',
    projection: null,
    needs: 'Pulse is this report — it is the built screen, with the period picker, the reconciliation checks and the model disclosure.',
  },
  { key: 'revenue', name: 'Revenue', group: '01', route: null, projection: 'revenue' },
  {
    key: 'profit-and-loss-01',
    name: 'Profit & Loss',
    group: '01',
    route: null,
    projection: 'profit',
    unresolved:
      'TODO(decision) — §9.6: "Profit & Loss appears in 01 and 06." Both entries are kept and both point at the same projection, so collapsing them later is a one-line edit; deleting one now is not reversible.',
  },
  { key: 'cash-flow', name: 'Cash Flow', group: '01', route: '/reports/cash-flow', projection: 'cash' },

  /* ── 02 Rentals · 5 ──────────────────────────────────────────────────── */
  {
    key: 'rental-performance',
    name: 'Rental Performance',
    group: '02',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Bookings exist (0003) but nothing aggregates them by period, branch or status.`,
  },
  {
    key: 'booking-analysis',
    name: 'Booking Analysis',
    group: '02',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Lead time, source and conversion are not columns on \`bookings\`.`,
  },
  {
    key: 'rental-duration',
    name: 'Rental Duration',
    group: '02',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Duration is derivable from booking dates; the distribution over them is not computed anywhere.`,
  },
  {
    key: 'discounts',
    name: 'Discounts',
    group: '02',
    route: '/reports/promotions',
    projection: null,
    needs: 'The Promotions report is the built screen. `booking_discounts` carries the Law 10 approval fields; nothing aggregates them yet.',
  },
  {
    key: 'cancellations',
    name: 'Cancellations',
    group: '02',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Cancellation is a terminal transition (Law 3), so the rows are there; the fee-tier ruling that would price them is not (PLAN.md §4).`,
  },

  /* ── 03 Equipment · 5 ────────────────────────────────────────────────── */
  { key: 'utilization', name: 'Utilization', group: '03', route: null, projection: 'utilization' },
  { key: 'revenue-by-equipment', name: 'Revenue by Equipment', group: '03', route: null, projection: 'equipment' },
  {
    key: 'roi',
    name: 'ROI',
    group: '03',
    route: null,
    projection: null,
    // The `equipment` projection is `Σ revenue over the period` — revenue, not
    // return on investment. This file's own rule at the top ("a number under
    // the wrong name is a fabrication with extra steps") is honoured for
    // `sales` seven entries down and was not honoured here; and the route sent
    // the operator to a screen printing hand-typed ROI multiples on top.
    needs:
      'Return on investment needs what each unit cost. No migration provides a purchase-cost column and no engine amortises one, so revenue cannot be rendered under this name (rulings §8).',
  },
  { key: 'asset-performance', name: 'Asset Performance', group: '03', route: '/reports/equipment-performance', projection: 'equipment' },
  {
    key: 'equipment-lifecycle',
    name: 'Equipment Lifecycle',
    group: '03',
    route: null,
    projection: null,
    needs:
      'Lifecycle needs asset lives and a salvage convention, and `data/addEquipment.ts:207` records that none may be invented here — it is an open TODO(decision) for Babin’s accountant.',
  },

  /* ── 04 Inventory · 4 ────────────────────────────────────────────────── */
  { key: 'inventory-status', name: 'Inventory Status', group: '04', route: '/reports/inventory', projection: null, needs: 'The Inventory report is the built screen.' },
  {
    key: 'equipment-movement',
    name: 'Equipment Movement',
    group: '04',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Movements are written by the workspaces; nothing reads them back as a period series.`,
  },
  {
    key: 'missing-items',
    name: 'Missing Items',
    group: '04',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Missing is a unit status; the stock-check variance that would explain it is not aggregated.`,
  },
  {
    key: 'asset-register',
    name: 'Asset Register',
    group: '04',
    route: null,
    projection: null,
    needs: 'A register is a listing, not a period report — it needs the purchase-cost and depreciation columns the Lifecycle report is also waiting on.',
  },

  /* ── 05 Clients · 4 ──────────────────────────────────────────────────── */
  { key: 'client-revenue', name: 'Client Revenue', group: '05', route: '/reports/clients', projection: null, needs: 'The Clients report is the built screen.' },
  {
    key: 'client-lifetime-value',
    name: 'Client Lifetime Value',
    group: '05',
    route: null,
    projection: null,
    needs: 'CLV needs a retention and margin assumption. Neither is ruled anywhere, and assuming one is inventing a product decision.',
  },
  {
    key: 'outstanding',
    name: 'Outstanding',
    group: '05',
    route: null,
    projection: null,
    needs:
      '`invoices.outstanding_amount` has no ruled recompute formula and `payment_reversals` never flow back into `paid_amount` (PLAN.md §4.17), so a figure here is one the database cannot defend.',
    unresolved:
      'TODO(decision) — §9.6: "`05 Outstanding` = `06 Receivables`." Both entries are kept, both blocked on the same formula; collapsing them is reversible, deleting one is not.',
  },
  {
    key: 'client-history',
    name: 'Client History',
    group: '05',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Per-client history is a filtered booking list, not a period aggregate; the client record already shows it.`,
  },

  /* ── 06 Finance · 7 ──────────────────────────────────────────────────── */
  {
    key: 'sales',
    name: 'Sales',
    group: '06',
    route: null,
    projection: null,
    needs:
      'Sales means invoiced, and the ledger’s revenue is recognised across rental days (`PERIOD_BASIS` — itself a TODO(decision)). Rendering one under the other’s name would be the same number twice with two meanings.',
  },
  {
    key: 'payments',
    name: 'Payments',
    group: '06',
    route: '/finance/payments',
    projection: 'cash',
    unresolved:
      'TODO(decision) — §9.6: "Payments and Expenses are both a tab and a report." The register entry is kept and points at the tab rather than duplicating it, which is the reversible reading.',
  },
  {
    key: 'receivables',
    name: 'Receivables',
    group: '06',
    route: null,
    projection: null,
    needs:
      'Same blocker as 05 Outstanding: no ruled recompute for `invoices.outstanding_amount`, and reversals do not flow back into `paid_amount` (PLAN.md §4.17).',
    unresolved: 'TODO(decision) — §9.6: "`05 Outstanding` = `06 Receivables`." See the 05 entry.',
  },
  {
    key: 'payables',
    name: 'Payables',
    group: '06',
    route: null,
    projection: null,
    /* The named case. `WIREFRAME_RULINGS_2026-08-12.md` §8 and §9.6 both. */
    needs:
      'There is no supplier-invoice table anywhere in supabase/migrations — no bills, no supplier_invoices, no accounts_payable. Nothing in this system knows what Babin owes. The Working Capital report now withholds three derived figures for the same reason.',
  },
  {
    key: 'expenses',
    name: 'Expenses',
    group: '06',
    route: '/finance/expenses',
    projection: 'expenses',
    unresolved:
      'TODO(decision) — §9.6: "Payments and Expenses are both a tab and a report." Points at the tab rather than duplicating it.',
  },
  {
    key: 'vat-tax',
    name: 'VAT / Tax',
    group: '06',
    route: null,
    projection: null,
    needs:
      'The VAT rate lives in Settings and must never be hardcoded (PLAN.md §5), and the IRD pool view has no statutory rates anywhere in this repo (Rulings §8).',
  },
  {
    key: 'profit-and-loss-06',
    name: 'Profit & Loss',
    group: '06',
    route: null,
    projection: 'profit',
    unresolved:
      'TODO(decision) — §9.6: "Profit & Loss appears in 01 and 06." Duplicate of `01 Profit & Loss`, kept deliberately; see that entry.',
  },

  /* ── 07 Operations · 5 ───────────────────────────────────────────────── */
  { key: 'pickups', name: 'Pickups', group: '07', route: null, projection: null, needs: NO_LEDGER_DIMENSION },
  { key: 'returns', name: 'Returns', group: '07', route: null, projection: null, needs: NO_LEDGER_DIMENSION },
  {
    key: 'overdue',
    name: 'Overdue',
    group: '07',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Overdue is derived from a due date at read time; nothing aggregates the derivation over a period.`,
  },
  { key: 'packing', name: 'Packing', group: '07', route: null, projection: null, needs: NO_LEDGER_DIMENSION },
  { key: 'inspections', name: 'Inspections', group: '07', route: null, projection: null, needs: NO_LEDGER_DIMENSION },

  /* ── 08 Damage & Maintenance · 4 ─────────────────────────────────────── */
  {
    key: 'damage',
    name: 'Damage',
    group: '08',
    route: null,
    projection: null,
    needs: `${NEEDS_QUERY} Damage is a condition on returned quantity (workflow.ts:141), and the cases register that prices it is not aggregated.`,
  },
  { key: 'repairs', name: 'Repairs', group: '08', route: null, projection: null, needs: NEEDS_QUERY },
  { key: 'maintenance', name: 'Maintenance', group: '08', route: null, projection: null, needs: NEEDS_QUERY },
  {
    key: 'downtime',
    name: 'Downtime',
    group: '08',
    route: null,
    projection: null,
    needs: 'Downtime is time out of service against time available. Nothing records when a unit went out of service, so the numerator does not exist.',
  },

  /* ── 09 Staff · 3 ────────────────────────────────────────────────────── */
  { key: 'staff-performance', name: 'Staff Performance', group: '09', route: '/reports/staff', projection: null, needs: 'The Staff report is the built screen.' },
  {
    key: 'activity',
    name: 'Activity',
    group: '09',
    route: null,
    projection: null,
    needs: 'The audit log records activity and is a Tools card (10_TOOLS.md §10.4); nothing aggregates it per person over a period.',
  },
  {
    key: 'shifts',
    name: 'Shifts',
    group: '09',
    route: null,
    projection: null,
    needs: 'Timesheets are deferred, not cancelled (PLAN.md §4.12), so there is no shift record to report on.',
  },

  /* ── 10 Management · 4 ───────────────────────────────────────────────── */
  {
    key: 'kpi-scorecard',
    name: 'KPI Scorecard',
    group: '10',
    route: '/reports/pulse',
    projection: null,
    needs: 'Pulse’s KPI strip is this, with the period picker and the reconciliation checks around it.',
  },
  { key: 'business-trends', name: 'Business Trends', group: '10', route: null, projection: 'revenue' },
  { key: 'forecast', name: 'Forecast', group: '10', route: '/reports/forecasting', projection: null, needs: 'The Forecasting report is the built screen.' },
  {
    key: 'investment-decisions',
    name: 'Investment Decisions',
    group: '10',
    route: null,
    projection: null,
    needs: 'A buy/hold decision needs asset cost, life and salvage — the same three values `data/addEquipment.ts:207` records as unruled.',
  },
] as const

/* ── derived, asserted ───────────────────────────────────────────────────── */

/**
 * §9.6 draws a count on every group tile — `01 Overview  4`. Counted from the
 * register rather than typed beside it, so the tile cannot disagree with the
 * list it opens.
 */
export function reportsIn(group: GroupKey): CatalogReport[] {
  return REPORTS.filter((r) => r.group === group)
}

export function reportByKey(key: string): CatalogReport | undefined {
  return REPORTS.find((r) => r.key === key)
}

export function groupByKey(key: GroupKey): ReportGroup {
  const g = GROUPS.find((x) => x.key === key)
  /* Unreachable while `GroupKey` and `GROUPS` agree; thrown rather than
     defaulted so a future edit that breaks the pair fails loudly at import. */
  if (!g) throw new Error(`09_FINANCE §9.6: no group "${key}" in GROUPS.`)
  return g
}

/**
 * The register's own reconciliation, in the shape `data/pulse.ts` and
 * `data/inventory.ts` already use: a list of statements that must be true,
 * checked at module load and surfaced on screen if any fails.
 *
 * §9.6 says "45 reports (Sales & Marketing cut)" and prints a count on each of
 * the ten group tiles. Both are asserted here, so the register cannot silently
 * gain a 46th or lose one — which is exactly how "8 groups" became a target to
 * delete three seeded expense categories for.
 */
export const CATALOG_ERRORS: string[] = (() => {
  const errs: string[] = []
  if (REPORTS.length !== 45) errs.push(`§9.6 declares 45 reports; the register holds ${REPORTS.length}.`)

  const expected: Record<GroupKey, number> = {
    '01': 4, '02': 5, '03': 5, '04': 4, '05': 4, '06': 7, '07': 5, '08': 4, '09': 3, '10': 4,
  }
  for (const g of GROUPS) {
    const n = reportsIn(g.key).length
    if (n !== expected[g.key]) errs.push(`§9.6 group ${g.key} ${g.name}: register holds ${n}, the table says ${expected[g.key]}.`)
  }

  const seen = new Set<string>()
  for (const r of REPORTS) {
    if (seen.has(r.key)) errs.push(`Duplicate report key "${r.key}" — keys are the selection identity.`)
    seen.add(r.key)
    /* The rule the whole file exists for: a report that can draw nothing must
       say what is missing. Silence here is how a blank chart ships. */
    if (r.projection === null && r.route === null && !r.needs) {
      errs.push(`"${r.name}" has no projection, no route and no \`needs\` — it would render an empty report with no reason.`)
    }
  }
  return errs
})()

/* ── projecting the one figures source ───────────────────────────────────── */

export interface TemplateRow {
  label: string
  /** Pre-formatted cells, one per column after the label. */
  cells: readonly string[]
  /** The chart's value for this row. */
  chartValue: number
  /** What the chart's value reads as. */
  chartDisplay: string
}

/**
 * `PeriodFigures` → the §9.7 template's ONE table and ONE chart.
 *
 * Formatting is passed in rather than imported so this stays a pure projection
 * — `lib/money`'s `formatMoney` is the only money formatter in the app and the
 * template hands it straight through.
 */
export function projectFigures(
  projection: ProjectionKey,
  figures: PeriodFigures,
  fmtMoney: (p: number) => string,
): TemplateRow[] {
  const share = (v: number, total: number) => (total === 0 ? '—' : `${Math.round((v / total) * 100)}%`)

  switch (projection) {
    case 'revenue': {
      const total = figures.revenue as number
      return figures.buckets.map((b) => ({
        label: b.label,
        cells: [fmtMoney(b.revenue as number), share(b.revenue as number, total)],
        chartValue: b.revenue as number,
        chartDisplay: fmtMoney(b.revenue as number),
      }))
    }
    case 'expenses': {
      const total = figures.expenses as number
      return figures.buckets.map((b) => ({
        label: b.label,
        cells: [fmtMoney(b.expenses as number), share(b.expenses as number, total)],
        chartValue: b.expenses as number,
        chartDisplay: fmtMoney(b.expenses as number),
      }))
    }
    case 'profit':
      return figures.buckets.map((b) => ({
        label: b.label,
        cells: [fmtMoney(b.revenue as number), fmtMoney(b.expenses as number), fmtMoney(b.profit as number)],
        chartValue: b.profit as number,
        chartDisplay: fmtMoney(b.profit as number),
      }))
    case 'cash':
      return figures.buckets.map((b) => ({
        label: b.label,
        cells: [fmtMoney(b.cashIn as number), fmtMoney(b.cashOut as number), fmtMoney(b.netCash as number)],
        chartValue: b.netCash as number,
        chartDisplay: fmtMoney(b.netCash as number),
      }))
    case 'utilization':
      return figures.buckets.map((b) => ({
        label: b.label,
        cells: [`${b.utilization}%`, '—', '—'],
        chartValue: b.utilization,
        chartDisplay: `${b.utilization}%`,
      }))
    case 'equipment':
      return figures.equipment.map((e) => ({
        label: e.name,
        cells: [fmtMoney(e.revenue as number), `${e.rentalDays}`, `${e.utilization}%`],
        chartValue: e.revenue as number,
        chartDisplay: fmtMoney(e.revenue as number),
      }))
  }
}

/**
 * The §9.7 headline — *"One headline sentence that answers the question."*
 *
 * Built from the figures, never typed: a sentence that does not move with the
 * period is a caption pretending to be an answer.
 */
export function headlineFor(
  projection: ProjectionKey,
  figures: PeriodFigures,
  fmtMoney: (p: number) => string,
): string {
  const days = `${figures.days} day${figures.days === 1 ? '' : 's'}`
  switch (projection) {
    case 'revenue':
      return `${fmtMoney(figures.revenue as number)} of revenue over ${days}, of which ${fmtMoney(figures.collected as number)} has been collected — ${figures.collectedPct}%.`
    case 'expenses':
      return `${fmtMoney(figures.expenses as number)} of operating expense over ${days}, against ${fmtMoney(figures.revenue as number)} of revenue.`
    case 'profit':
      return `${fmtMoney(figures.profit as number)} of profit over ${days} — ${fmtMoney(figures.revenue as number)} revenue less ${fmtMoney(figures.expenses as number)} of expense.`
    case 'cash':
      return `${fmtMoney(figures.netCash as number)} of net cash over ${days}: ${fmtMoney(figures.cashIn as number)} in, ${fmtMoney(figures.cashOut as number)} out. Deposits are excluded — they are held in trust.`
    case 'utilization':
      return `The fleet ran at ${figures.utilization}% over ${days}.`
    case 'equipment':
      return `${figures.equipment.length} models earned ${fmtMoney(figures.revenue as number)} over ${days}; the table is ordered by what each brought in.`
  }
}
