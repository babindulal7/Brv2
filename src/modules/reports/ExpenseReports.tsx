import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend } from '../../components/ui/Charts'
import { EmptyState } from '../../components/ui/StateViews'
import { BRAND, BRAND_ON, STATUS } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  EXPENSES,
  CATEGORIES,
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  BRANCHES,
  STATUS_TOKEN,
  PERIOD,
  RECURRING,
  SEED_ERRORS,
  QUICK_ACTIONS,
  QUICK_ACTIONS_MORE,
  totalsOf,
  budgetOf,
  byCategory,
  toSlices,
} from '../../data/expenseReports'
import type { ExpenseRow } from '../../data/expenseReports'

/**
 * **Finance ▸ Expenses** — built against `03 Core Modules/Expenses.PNG` and its
 * spec `Expenses.md` v2.2.
 *
 * Everything on this page is derived from `data/expenseReports`'s one
 * `EXPENSES` array — the KPI values, the chip counts, the donut, the rail
 * summary and the pagination footer all recompute from the filtered rows. The
 * render states three different budget figures across its cards and its rail;
 * that cannot be expressed here because there is only one source.
 *
 * **Deviations from the render, each one a locked rule (never copy these back):**
 *  · the render's sidebar is the old 13-item numbered one — Foundation §5.1
 *    locks 8 unnumbered sections + Settings, and the shell owns it regardless.
 *  · the render prices in `NPR 5,82,500`; §2.1 says `Rs` on the value, and every
 *    figure here goes through `lib/money`'s `formatMoney`.
 *  · the render's Budget Remaining tile and one donut slice are **purple**,
 *    which Foundation §4.2 bans outright. Allowed families only; the donut takes
 *    the validated categorical palette from `components/ui/Charts`.
 *  · the render's second column reads `INV-3456` under each expense ID. `INV-`
 *    is our *sales-invoice* prefix — §2.3 — so the vendor's own number renders
 *    as `Bill 3456`.
 *  · the render tabs `Taxes`; §4.2 replaces it with `Government & Licences`,
 *    because VAT and TDS are liabilities and never expense categories.
 */

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

/** Every glyph here is a real key in `components/ui/Icon`'s registry. */
const CATEGORY_ICON: Record<string, IconName> = {
  Office: 'briefcase',
  Equipment: 'box',
  Maintenance: 'tool',
  Staff: 'users',
  Transport: 'truck',
  Utilities: 'battery',
  'Software & AI': 'sparkles',
  Marketing: 'activity',
  Finance: 'card',
  'Government & Licences': 'file',
  Miscellaneous: 'dot',
}

const METHOD_ICON: Record<string, IconName> = {
  'Bank Transfer': 'briefcase',
  Cash: 'dollar',
  Cheque: 'file',
  eSewa: 'receipt',
  Khalti: 'receipt',
  Card: 'card',
}

const ROWS_PER_PAGE = [10, 25, 50] as const

/** A KPI tile with the render's drill-down link. `KpiStrip` has no link slot. */
function KpiCard({
  label,
  value,
  icon,
  accent,
  note,
  to,
  linkLabel,
}: {
  label: string
  value: string
  icon: IconName
  accent: BrandKey
  note?: { text: string; tone: BrandKey }
  to: string
  linkLabel: string
}) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: BRAND[accent],
            color: BRAND_ON[accent],
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={16} fill />
        </span>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
      </div>
      <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 9, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {note && (
        <div style={{ marginTop: 3, fontSize: 'var(--t-meta)', fontWeight: 600, color: STATUS[note.tone === 'danger' ? 'danger' : note.tone === 'success' ? 'in' : 'progress'].fg }}>
          {note.text}
        </div>
      )}
      <Link
        to={to}
        style={{
          marginTop: 'auto',
          paddingTop: 9,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          color: 'var(--link)',
          textDecoration: 'none',
        }}
      >
        {linkLabel}
        <Icon name="arrow_right" size={12} />
      </Link>
    </article>
  )
}

export default function ExpenseReports() {
  const money = useCanViewMoney()

  const [category, setCategory] = useState<string>('All')
  const [status, setStatus] = useState<string>('All')
  const [method, setMethod] = useState<string>('All')
  const [vendor, setVendor] = useState<string>('All')
  const [branch, setBranch] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(10)

  const vendors = useMemo(() => [...new Set(EXPENSES.map((r) => r.vendor))].sort(), [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return EXPENSES.filter((r) => {
      if (category !== 'All' && r.category !== category) return false
      if (status !== 'All' && r.status !== status) return false
      if (method !== 'All' && r.method !== method) return false
      if (vendor !== 'All' && r.vendor !== vendor) return false
      if (branch !== 'All' && r.branch !== branch) return false
      if (!q) return true
      return (
        r.id.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.billNo ?? '').toLowerCase().includes(q)
      )
    })
  }, [category, status, method, vendor, branch, query])

  const totals = useMemo(() => totalsOf(rows), [rows])
  const budget = useMemo(() => budgetOf(rows), [rows])
  const slices = useMemo(() => toSlices(byCategory(rows)), [rows])

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  const shown = rows.slice((current - 1) * perPage, current * perPage)

  const filtered = category !== 'All' || status !== 'All' || method !== 'All' || vendor !== 'All' || branch !== 'All' || query !== ''
  const clearAll = () => {
    setCategory('All')
    setStatus('All')
    setMethod('All')
    setVendor('All')
    setBranch('All')
    setQuery('')
    setPage(1)
  }

  /*
   * §8.3 — this screen is money end to end: every KPI, the whole Amount column,
   * the donut and the rail. There is no money-free version of it to show, so a
   * money-blind session is told plainly rather than handed an empty husk that
   * looks broken. The rows are never fetched into the DOM at all.
   */
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="card" title="Expenses" description="Track operating costs, control spending, and monitor company expenses." />
        <EmptyState
          icon={<Icon name="settings" size={26} />}
          title="Expenses is not available for your role"
          description="Every figure on this page is a monetary amount, so there is no version of it your role can see. Ask an Owner, Admin, Coordinator or Accounts user if you need an expense recorded."
        />
        <FooterNote />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="card"
        title="Expenses"
        description="Track operating costs, control spending, and monitor company expenses."
        actions={
          <>
            <Button icon="upload">Import</Button>
            <Button icon="download">Export</Button>
            <Button icon="plus" variant="primary">
              New Expense
            </Button>
          </>
        }
      />

      {/* A seed that stops reconciling is shown, not thrown — a module-scope
          throw runs before React mounts and blanks the app with no message. */}
      {SEED_ERRORS.length > 0 && (
        <div role="alert" style={{ ...cardStyle, padding: 12, borderColor: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--danger-text)' }}>Seed data does not reconcile</strong>
          {SEED_ERRORS.map((e) => (
            <span key={e} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {e}
            </span>
          ))}
        </div>
      )}

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <KpiCard
          label="Total Expenses"
          value={formatMoney(totals.total as Paisa)}
          icon="card"
          accent="primary"
          note={{ text: `${totals.count} recorded this period`, tone: 'neutral' }}
          to="/reports/expenses"
          linkLabel="View Detailed Report"
        />
        <KpiCard
          label="Pending Approval"
          value={String(totals.pendingCount)}
          icon="timer"
          accent="progress"
          note={{ text: formatMoney(totals.pending as Paisa), tone: 'progress' }}
          to="/reports/expenses"
          linkLabel="View Pending"
        />
        <KpiCard
          label="Paid"
          value={formatMoney(totals.paid as Paisa)}
          icon="dollar"
          accent="success"
          note={{ text: `${Math.round((totals.paid / (totals.total || 1)) * 100)}% of recorded spend`, tone: 'success' }}
          to="/finance"
          linkLabel="View Payments"
        />
        <KpiCard
          label="Recurring Expenses"
          value={String(totals.recurringCount)}
          icon="refresh"
          accent="primary"
          note={{ text: formatMoney(totals.recurring as Paisa), tone: 'neutral' }}
          to="/automation"
          linkLabel="View Recurring"
        />
        <KpiCard
          label={budget.over ? 'Over Budget' : 'Budget Remaining'}
          value={formatMoney(Math.abs(budget.over ? budget.overspend : budget.remaining) as Paisa)}
          icon="chart"
          accent={budget.over ? 'danger' : 'success'}
          note={
            budget.percent === null
              ? { text: 'No monthly budget set', tone: 'neutral' }
              : { text: `${budget.percent.toFixed(0)}% of ${formatMoney(budget.budget as Paisa)} used`, tone: budget.over ? 'danger' : 'neutral' }
          }
          to="/reports/expenses"
          linkLabel="View Budget"
        />
      </section>

      {/* Category chips. Each carries its own count, derived from the same
          array the table reads, so a chip can never advertise rows that are
          not there. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['All', ...CATEGORIES].map((c) => {
          const on = category === c
          const count = c === 'All' ? EXPENSES.length : EXPENSES.filter((r) => r.category === c).length
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c)
                setPage(1)
              }}
              aria-pressed={on}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 11px',
                borderRadius: 'var(--r-badge)',
                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: on ? 'var(--st-progress-bg)' : 'var(--card)',
                color: on ? 'var(--st-progress-fg)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {c !== 'All' && <Icon name={CATEGORY_ICON[c] ?? 'dot'} size={13} />}
              {c}
              <span className="figure" style={{ color: 'var(--muted)', fontWeight: 700 }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {/* Filter bar. The period is the seeded ledger's own range, rendered
              BS above AD from the Date Engine — never a stored BS string. */}
          <div style={{ ...cardStyle, padding: 11, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name="calendar" size={13} />
              {formatAd(PERIOD.from)} – {formatAd(PERIOD.to)}
            </span>

            <Sel value={status} onChange={setStatus} all="All Status" options={EXPENSE_STATUSES as readonly string[]} onPick={() => setPage(1)} />
            <Sel value={method} onChange={setMethod} all="All Payment Method" options={PAYMENT_METHODS as readonly string[]} onPick={() => setPage(1)} />
            <Sel value={vendor} onChange={setVendor} all="All Vendors" options={vendors} onPick={() => setPage(1)} />
            <Sel value={branch} onChange={setBranch} all="All Branches" options={BRANCHES as readonly string[]} onPick={() => setPage(1)} />

            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search expense, vendor, bill no…"
              aria-label="Search expenses"
              style={{
                flex: 1,
                minWidth: 170,
                height: 32,
                padding: '0 10px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
              }}
            />

            {filtered && <Button onClick={clearAll}>Clear</Button>}
          </div>

          <Card title={`${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'}`} bodyStyle={{ padding: 0 }}>
            {rows.length === 0 ? (
              <EmptyState
                icon={<Icon name="search" size={26} />}
                title="No expenses match these filters"
                description="Clear a filter or widen the search to see records again."
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Expense ID', 'Date', 'Category', 'Vendor', 'Description', 'Amount', 'Payment Method', 'Status', 'Paid By', 'Actions'].map((h) => (
                        <th key={h} style={{ ...th, textAlign: h === 'Amount' ? 'right' : 'left' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <Row key={r.id} r={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {rows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Showing {(current - 1) * perPage + 1} to {Math.min(current * perPage, rows.length)} of {rows.length}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Button onClick={() => setPage(Math.max(1, current - 1))} disabled={current === 1}>
                    Previous
                  </Button>
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', padding: '0 4px' }}>
                    {current} / {pageCount}
                  </span>
                  <Button onClick={() => setPage(Math.min(pageCount, current + 1))} disabled={current === pageCount}>
                    Next
                  </Button>
                  <select
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    aria-label="Rows per page"
                    style={selStyle}
                  >
                    {ROWS_PER_PAGE.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </Card>
        </div>

        <Rail width={300}>
          <Card title="Expense Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <SumRow label="Total Expenses" value={formatMoney(totals.total as Paisa)} />
              <SumRow label="Paid Amount" value={formatMoney(totals.paid as Paisa)} tone="in" />
              <SumRow label="Pending Amount" value={formatMoney(totals.pending as Paisa)} tone="progress" />
              <SumRow label="Recurring" value={formatMoney(totals.recurring as Paisa)} />
              <SumRow label="Reclaimable VAT" value={formatMoney(totals.inputVat as Paisa)} />
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 'var(--t-meta)' }}>
                  <span style={{ flex: 1, color: 'var(--text2)' }}>Budget Used</span>
                  <span className="figure" style={{ fontWeight: 700, color: budget.over ? 'var(--danger-text)' : 'var(--text)' }}>
                    {budget.percent === null ? '—' : `${budget.percent.toFixed(0)}%`}
                  </span>
                </div>
                <div aria-hidden style={{ height: 5, borderRadius: 999, background: 'var(--card2)', marginTop: 5, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(budget.percent ?? 0, 100)}%`,
                      height: '100%',
                      background: budget.over ? BRAND.danger : BRAND.progress,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Top Categories">
            {slices.length === 0 ? (
              <EmptyState icon={<Icon name="chart" size={26} />} title="Nothing to chart" description="No recorded expense matches these filters." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Donut slices={slices} centreLabel="Total" centreValue={formatMoney(totals.total as Paisa)} />
                <Legend slices={slices} />
              </div>
            )}
          </Card>

          <Card
            title="Upcoming Payments"
            action={
              <Link to="/automation" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}>
                View All
              </Link>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {RECURRING.map((s) => {
                const bs = toBs(s.dueAd)
                return (
                  <div key={s.name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Icon name="refresh" size={13} style={{ marginTop: 2, flexShrink: 0, color: 'var(--muted)' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {bs ? `${formatBs(bs)} · ` : ''}
                        {formatAd(s.dueAd)}
                      </div>
                    </div>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {formatMoney(s.expected)}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {QUICK_ACTIONS.map((a) => (
                <button key={a.label} type="button" className="lift" style={quickStyle}>
                  <Icon name={a.icon as IconName} size={17} />
                  {a.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {QUICK_ACTIONS_MORE.map((label) => (
                <Link
                  key={label}
                  to={label === 'Recurring Expenses' ? '/automation' : '/documents'}
                  style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
                >
                  {label} →
                </Link>
              ))}
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Capital purchases become assets in Inventory, never expenses']} />
    </div>
  )
}

const selStyle = {
  height: 32,
  padding: '0 8px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

function Sel({
  value,
  onChange,
  all,
  options,
  onPick,
}: {
  value: string
  onChange: (v: string) => void
  all: string
  options: readonly string[]
  onPick: () => void
}) {
  return (
    <select
      value={value}
      aria-label={all}
      onChange={(e) => {
        onChange(e.target.value)
        onPick()
      }}
      style={selStyle}
    >
      <option value="All">{all}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'progress' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 'var(--t-meta)' }}>
      <span style={{ flex: 1, color: 'var(--text2)' }}>{label}</span>
      <span className="figure" style={{ fontWeight: 700, color: tone ? STATUS[tone].fg : 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

function Row({ r }: { r: ExpenseRow }) {
  const bs = toBs(r.date)
  const tok = STATUS[STATUS_TOKEN[r.status]]
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td}>
        <div className="identifier" style={{ fontWeight: 700 }}>{r.id}</div>
        {/* §2.3 — the vendor's number, never our INV- sales prefix. */}
        {r.billNo && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Bill {r.billNo}</div>}
      </td>
      <td style={td}>
        <div>{formatAd(r.date)}</div>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{bs ? formatBs(bs) : '—'}</div>
      </td>
      <td style={td}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 20,
            padding: '0 7px',
            borderRadius: 'var(--r-badge)',
            background: 'var(--card2)',
            color: 'var(--text2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name={CATEGORY_ICON[r.category] ?? 'dot'} size={12} />
          {r.category}
        </span>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>{r.subCategory}</div>
      </td>
      <td style={{ ...td, color: 'var(--text2)' }}>{r.vendor}</td>
      <td style={{ ...td, color: 'var(--text2)', maxWidth: 210 }}>{r.description}</td>
      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {formatMoney(r.amount)}
        {r.vat !== null && (
          <div style={{ fontSize: 'var(--t-meta)', fontWeight: 400, color: 'var(--muted)' }}>incl. VAT {formatMoney(r.vat)}</div>
        )}
      </td>
      <td style={td}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <Icon name={METHOD_ICON[r.method] ?? 'card'} size={13} />
          {r.method}
        </span>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.methodDetail}</div>
      </td>
      <td style={td}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 8px',
            borderRadius: 'var(--r-badge)',
            background: tok.bg,
            color: tok.fg,
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {r.status}
        </span>
      </td>
      <td style={{ ...td, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.paidBy ?? '—'}</td>
      <td style={td}>
        {/* §11.1 — an operational cost is traceable both ways. Rows without a
            link have nothing to open, so no control is drawn rather than a
            dead one. */}
        {r.link ? (
          <Link
            to={r.link.kind === 'Booking' ? `/rentals/${r.link.id}` : r.link.kind === 'Case' ? '/operations?queue=cases' : '/inventory'}
            style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            {r.link.id}
          </Link>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>—</span>
        )}
      </td>
    </tr>
  )
}

const quickStyle = {
  ...cardStyle,
  padding: '11px 8px',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 6,
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--text2)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'center' as const,
}
