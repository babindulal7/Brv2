import { useMemo, useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, FooterNote, cardStyle } from '../../components/ui/Page'
import { Unavailable } from '../../components/ui/Unavailable'
import { LineChart } from '../../components/ui/Charts'
import { useViewport } from '../../lib/device'
import { formatMoney, parseMoney, rupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import {
  straightLineSchedule,
  DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON,
  IRD_POOL_BLOCKED_REASON,
} from '../../data/tools'
import type { DepreciationYear } from '../../data/tools'
import { PARENTS } from '../../data/inventory'
import { DateField } from '../../components/ui/DateField'

/**
 * **Depreciation Calculator — `10_TOOLS.md` §10.2.**
 *
 * ```
 * ┌ ← Depreciation ─────────────┐
 * │ [Book view] [IRD pool view] │
 * │ asset ▾ or whole fleet      │
 * │ purchase date · price       │
 * │ life ▾  salvage             │
 * ├─────────────────────────────┤
 * │ year │ opening │ dep │ WDV  │
 * │ ▁▃▅▇ book value curve       │
 * └─────────────────────────────┘
 * ```
 *
 * The `←` is wireframe shorthand for "this is a sub-page" — `PLAN.md` Phase 5
 * and `WIREFRAME_RULINGS_2026-08-12.md` §4 both stand: breadcrumbs, no Back
 * button. The crumb trail lives in the shell.
 *
 * ## Two things this screen refuses to invent
 *
 * **1 · "Defaults come from Settings" — there is no such setting.** §10.2's
 * closing note promises one; `11_SETTINGS.md` §11.2's eight sections carry
 * none, and `lib/settingsStore.ts` has no key for a life or a salvage
 * convention. `data/addEquipment.ts` already refuses the same invention in
 * writing: *"depreciation groups are undefined … none may be invented here."*
 * So **life and salvage are required user input**, marked required, blank on
 * arrival, and the promised affordance renders as a stated `Unavailable`
 * rather than as a select pre-loaded with a five-year life nobody chose. A
 * seeded default here would not look like a guess — it would look like the
 * accountant's answer, on a schedule someone files.
 *
 * **2 · The IRD pool view is blocked, not unbuilt.** Nothing in this repository
 * names an IRD depreciation pool and no spec supplies pool classes or statutory
 * rates. The tab exists (the spec draws it) and says exactly what is missing.
 * Filling it from generally-known Nepal rates would be taking a tax position on
 * Babin's behalf, which `CLAUDE.md` forbids outright.
 *
 * ## What the asset picker may and may not prefill
 *
 * `data/inventory.ts` carries `purchasePricePaisa` on some parents — a real
 * recorded fact, so selecting one of those fills **cost**. It carries no
 * purchase date on any row, so the date stays empty and says why. "Whole fleet"
 * is offered as the spec draws it and refuses to compute: a fleet schedule
 * needs a life per asset class, which is the very thing that is undecided.
 *
 * Law 1 — the schedule arithmetic is `data/tools.ts`'s `straightLineSchedule`,
 * not a loop in this component. Law 6 — `/tools/depreciation` is in
 * `MONEY_ROUTES`, so a money-blind role never reaches this file at all.
 */

type Tab = 'book' | 'ird'

const WHOLE_FLEET = '__fleet__'

/** Parents whose purchase price is a recorded fact rather than a blank. */
const PRICED_ASSETS = PARENTS.filter((p) => p.purchasePricePaisa !== undefined)

export default function DepreciationCalculator() {
  const viewport = useViewport()
  const [tab, setTab] = useState<Tab>('book')

  const [assetName, setAssetName] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [cost, setCost] = useState('')
  const [life, setLife] = useState('')
  const [salvage, setSalvage] = useState('')

  const costPaisa = parseMoney(cost)
  const salvagePaisa = salvage.trim() === '' ? null : parseMoney(salvage)
  const lifeYears = life.trim() === '' ? null : Number(life)

  const fleet = assetName === WHOLE_FLEET

  /** Every reason the schedule cannot be drawn, stated rather than implied. */
  const blockers = useMemo(() => {
    const out: string[] = []
    if (fleet) {
      out.push(
        'A whole-fleet schedule needs a useful life per asset class, and no asset lives are decided — the same gap the Life field states below.',
      )
      return out
    }
    if (costPaisa === null || costPaisa <= 0) out.push('Enter the purchase price.')
    if (lifeYears === null) out.push('Enter the useful life in years — there is no default to fall back on.')
    else if (!Number.isFinite(lifeYears) || Math.floor(lifeYears) < 1) out.push('Useful life must be at least one whole year.')
    if (salvagePaisa === null) out.push('Enter the salvage value. Zero is a valid answer; it is not the assumed one.')
    else if (salvagePaisa < 0) out.push('Salvage value cannot be negative.')
    else if (costPaisa !== null && salvagePaisa > costPaisa) out.push('Salvage value cannot exceed the purchase price.')
    return out
  }, [fleet, costPaisa, salvagePaisa, lifeYears])

  const schedule: DepreciationYear[] =
    blockers.length === 0 && costPaisa !== null && salvagePaisa !== null && lifeYears !== null
      ? straightLineSchedule({ costPaisa, salvagePaisa, lifeYears })
      : []

  const totalCharged = schedule.reduce((n, r) => n + r.depreciationPaisa, 0) as Paisa

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="chart"
        title="Depreciation"
        description="Book and IRD pool views. Nothing here is saved against an asset — it is a working sheet."
      />

      {/* §10.2 — [Book view] [IRD pool view]; phone shortens the labels, not the set. */}
      <div role="tablist" aria-label="Depreciation method" style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
        <TabButton id="book" active={tab === 'book'} onSelect={setTab} label={viewport === 'phone' ? 'Book' : 'Book view'} />
        <TabButton id="ird" active={tab === 'ird'} onSelect={setTab} label={viewport === 'phone' ? 'IRD' : 'IRD pool view'} />
      </div>

      {tab === 'ird' ? (
        <IrdPoolView />
      ) : (
        <div
          style={{
            display: 'grid',
            /* Desktop puts inputs beside the result; below 1280 the result
               reflows underneath — Rulings §7, "collapse means reflow, not
               hide". Nothing here is wrapped in CollapsibleAside. */
            gridTemplateColumns: viewport === 'desktop' ? 'minmax(320px, 380px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          <Card title="Asset">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <Field label="Asset" hint="Picking a recorded asset fills its purchase price. Everything else stays yours to enter.">
                <select
                  aria-label="Asset"
                  value={assetName}
                  onChange={(e) => {
                    const v = e.target.value
                    setAssetName(v)
                    const row = PRICED_ASSETS.find((p) => p.name === v)
                    if (row?.purchasePricePaisa !== undefined) setCost(String(row.purchasePricePaisa / 100))
                  }}
                  style={controlStyle}
                >
                  <option value="">Not selected — enter figures by hand</option>
                  <option value={WHOLE_FLEET}>Whole fleet</option>
                  {PRICED_ASSETS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Purchase date"
                required
                hint="No item in the master carries a purchase date, so this is never prefilled."
              >
                <DateField
                  ariaLabel="Purchase date"
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                  style={controlStyle}
                />
              </Field>

              <Field label="Purchase price" required>
                <input
                  inputMode="decimal"
                  aria-label="Purchase price in rupees"
                  placeholder="Rs"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  style={controlStyle}
                />
              </Field>

              {/* §10.2 draws `life ▾` — a select over configured groups. There
                  are no groups, so it is a number field and the promised
                  Settings affordance states its own absence beside it. */}
              <Field label="Useful life (years)" required>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    inputMode="numeric"
                    aria-label="Useful life in years"
                    placeholder="Years"
                    value={life}
                    onChange={(e) => setLife(e.target.value)}
                    style={{ ...controlStyle, flex: 1, minWidth: 120 }}
                  />
                  <Unavailable reason={DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 44,
                        padding: '0 12px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px dashed var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--muted)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                      }}
                    >
                      <Icon name="lock" size={13} />
                      No default from Settings
                    </span>
                  </Unavailable>
                </div>
              </Field>

              <Field label="Salvage value" required hint="Zero is a valid answer. It is not the assumed one.">
                <input
                  inputMode="decimal"
                  aria-label="Salvage value in rupees"
                  placeholder="Rs"
                  value={salvage}
                  onChange={(e) => setSalvage(e.target.value)}
                  style={controlStyle}
                />
              </Field>

              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                Method: straight line — <span className="figure">(cost − salvage) ÷ life</span>, each step rounded to a whole
                rupee, with the last year absorbing the remainder so the closing value equals the salvage exactly.
              </p>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
            {blockers.length > 0 ? (
              /* Law 12 — inline and persistent. This is a not-yet state, not a
                 failure, so it is stated plainly rather than as an alert. */
              <div style={{ ...cardStyle, padding: 'var(--sp-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name="info" size={16} style={{ color: 'var(--muted)' }} />
                  <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>No schedule yet</strong>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {blockers.map((b) => (
                    <li key={b} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <Card title="Schedule" bodyStyle={{ padding: 0 }}>
                  {viewport === 'phone' ? (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {schedule.map((r) => (
                        <div
                          key={r.year}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto minmax(0,1fr)',
                            gap: '2px var(--sp-md)',
                            padding: '11px 14px',
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ gridColumn: '1 / -1', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                            Year {r.year}
                          </span>
                          <CardRow label="Opening" value={formatMoney(r.openingPaisa)} />
                          <CardRow label="Depreciation" value={formatMoney(r.depreciationPaisa)} />
                          <CardRow label="WDV" value={formatMoney(r.closingPaisa)} strong />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                        <thead>
                          <tr style={{ background: 'var(--th-bg)' }}>
                            {['Year', 'Opening', 'Depreciation', 'WDV'].map((h, i) => (
                              <th key={h} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map((r) => (
                            <tr key={r.year} style={{ borderTop: '1px solid var(--border)' }}>
                              <td className="figure" style={tdStyle}>
                                {r.year}
                              </td>
                              <td className="figure" style={{ ...tdStyle, textAlign: 'right', color: 'var(--text2)' }}>
                                {formatMoney(r.openingPaisa)}
                              </td>
                              <td className="figure" style={{ ...tdStyle, textAlign: 'right' }}>
                                {formatMoney(r.depreciationPaisa)}
                              </td>
                              <td className="figure" style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                                {formatMoney(r.closingPaisa)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--th-bg)' }}>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
                            <td style={tdStyle} />
                            <td className="figure" style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                              {formatMoney(totalCharged)}
                            </td>
                            <td className="figure" style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                              {formatMoney(schedule[schedule.length - 1]?.closingPaisa ?? rupees(0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Card>

                <Card title="Book value curve">
                  <BookValueCurve schedule={schedule} openingPaisa={costPaisa as Paisa} />
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <FooterNote extra={['Nothing on this page is written to an asset record']} />
    </div>
  )
}

/* ── the blocked tab ───────────────────────────────────────────────────── */

/**
 * §10.2's second tab, rendered honestly.
 *
 * The tab is present because the spec draws it and because a missing tab reads
 * as an oversight, while a tab that names what is missing reads as a decision
 * waiting on an answer. It carries no fields — an input the screen cannot use
 * is worse than none.
 */
function IrdPoolView() {
  return (
    <div style={{ ...cardStyle, padding: 'var(--sp-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--r-sm)',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--st-progress-bg)',
            color: 'var(--st-progress-fg)',
          }}
        >
          <Icon name="lock" size={17} />
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
          IRD pool view is blocked on a decision
        </h2>
      </div>
      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6, maxWidth: 620 }}>
        {IRD_POOL_BLOCKED_REASON}
      </p>
      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 620 }}>
        What would unblock it: the pool classes Babin's accountant files under, and the rate applied to each. With those two
        facts the pool balance, the year's charge and the closing balance are arithmetic — the same shape as the Book view
        beside it.
      </p>
    </div>
  )
}

/* ── the curve ─────────────────────────────────────────────────────────── */

/**
 * §10.2's `▁▃▅▇ book value curve`. Year 0 is the acquisition cost, so the line
 * starts where the money was actually spent rather than one year in.
 *
 * `LineChart` is the app's existing chart primitive — a second one drawn here
 * would be the reimplementation `lib/` exists to prevent.
 */
function BookValueCurve({ schedule, openingPaisa }: { schedule: DepreciationYear[]; openingPaisa: Paisa }) {
  const points = [openingPaisa / 100, ...schedule.map((r) => r.closingPaisa / 100)]
  const labels = ['0', ...schedule.map((r) => String(r.year))]
  const top = Math.max(...points)
  const yTicks = [3, 2, 1, 0].map((i) => formatMoney(((top * i) / 3) * 100 as Paisa))
  return (
    <LineChart
      points={points}
      labels={labels}
      yTicks={yTicks}
      seriesLabel="Written-down value"
      format={(v) => formatMoney((v * 100) as Paisa)}
    />
  )
}

/* ── small parts ───────────────────────────────────────────────────────── */

function TabButton({
  id,
  label,
  active,
  onSelect,
}: {
  id: Tab
  label: string
  active: boolean
  onSelect: (t: Tab) => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      style={{
        /* Law 15 — 44×44 at every width, desktop included. */
        minHeight: 44,
        padding: '0 16px',
        borderRadius: 'var(--r-btn)',
        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
        background: active ? 'var(--btn-primary-bg)' : 'var(--card)',
        color: active ? 'var(--btn-primary-fg)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
        {required && <span style={{ color: 'var(--danger-text)' }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>{hint}</span>}
    </label>
  )
}

function CardRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{label}</span>
      <span
        className="figure"
        style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: strong ? 700 : 500, textAlign: 'right' }}
      >
        {value}
      </span>
    </>
  )
}

const controlStyle: React.CSSProperties = {
  width: '100%',
  /* Law 15. */
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-body)',
  fontFamily: 'inherit',
}

const thStyle: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
}

/*
 * §7.3's row floor ("rows >= 56px"), taken from the token rather than built out
 * of padding: `height` on a `<td>` acts as a MINIMUM, so the schedule's rows
 * come up to the floor without the horizontal padding or the totals row moving.
 *
 * The schedule is a read-only projection with no row controls, so no tap can be
 * misfiled here today. The floor is applied anyway because it is the guarantee
 * that a 44px hit area fits inside its own row instead of overhanging the
 * neighbour — and a table of near-identical numeric rows is the worst place to
 * discover later that a control was added to rows too short to hold its target,
 * since every row looks like every other one and a wrong-row press reads as
 * plausible output. The phone branch above renders the same data as cards and
 * is unaffected; this is the desktop table only.
 */
const tdStyle: React.CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '10px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
}
