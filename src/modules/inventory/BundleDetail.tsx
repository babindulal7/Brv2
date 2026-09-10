import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { Badge } from '../../components/ui/Badge'
import { DateField } from '../../components/ui/DateField'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { canUpdateBundle } from '../../lib/rbac'
import { gateContext } from '../../lib/fieldGating'
import { useViewport } from '../../lib/device'
import {
  useBundleRecord,
  bundleDetailGroups,
  factsOf,
  ratioLabelOf,
  iconFor,
  isPriced,
  type BundleRecord,
  type BundleState,
} from '../../lib/queries/useBundles'
import { useRentalWindowParams, dayValue } from '../../lib/rentalWindowParams'

/**
 * **Bundle detail** — `/inventory/bundles/:bundleRef`.
 *
 * The audit of 4 Sep filed this as missing entirely, and it was the odd one out:
 * `data/bundleIntel.ts:97 bundleDetailGroups` had been written to describe a
 * bundle in full — Identity, Availability, Components, Substitutes, Current
 * booking and Money, each already gated — and nothing rendered it. `Bundles.tsx`
 * said so twice, in a row-menu item and in a disabled "View full breakdown"
 * button, both carrying the same sentence: *"Bundle detail has no screen yet."*
 *
 * ## What this screen is, given no spec exists for it
 *
 * There is no spec and no approved render for a bundle detail page — the spec
 * library holds `Bundles.md` (the list) and `Add Bundle.md` (the create form) and
 * nothing else. So the *layout* follows `ClientDetail.tsx`, the closest sibling
 * that uses the shared furniture (`PageHeader` → `KpiStrip` → `Card`s →
 * `FooterNote`), and the *content* is `bundleDetailGroups` — which is not
 * invention: it is the field set the intel layer already decided this bundle
 * has, cited to `Bundles.md` §4, §7, §8 and §10 in its own comments.
 *
 * Nothing here re-derives a figure. Every count, ratio, donut segment and money
 * value comes from one `factsOf(bundle)` call, because `data/bundles.ts` §1 is
 * blunt: *"Every number on this page is computed at render. None is stored."*
 *
 * ## The window is not decoration
 *
 * **§4.44.** A bundle is not available in the abstract, so this page carries the
 * same `?from=`/`?to=` window as the list and links back and forth with it
 * intact. Opening a bundle from a list showing "4 / 5 Ready for next week" and
 * seeing a different ratio here would be the screen contradicting itself.
 *
 * ## Why several fields read "not set" on live data
 *
 * `bundleDetailGroups` was written against the nine-record seed. Live records are
 * thinner: `bundleRecords.ts` documents that `tags`, `lockMode`, `nextConflictAd`,
 * `substitutes` and `replaceable` have **no column anywhere**, so they come back
 * empty and the intel layer prints its own honest fallbacks. A page full of
 * "not set" reads as a loading fault unless it says why, so it says why once,
 * under Identity, rather than leaving the operator to guess.
 */

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const td: CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top',
}

const subtle: CSSProperties = { fontSize: 'var(--t-th)', color: 'var(--muted)' }

/** Same tokens the list uses, so a bundle does not change colour when opened. */
const STATE_TONE: Record<BundleState | 'Archived', StatusKey> = {
  Available: 'in',
  Reserved: 'primary',
  'On Rent': 'out',
  'Partially Available': 'progress',
  'On Maintenance': 'progress',
  Archived: 'neutral',
}

/** Foundation §3.1 — BS above AD, Latin digits, always with a year. */
function BsAd({ date, prefix }: { date: Date; prefix?: string }) {
  const bs = toBs(date)
  return (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
        {prefix ? `${prefix} ` : ''}
        {bs ? formatBs(bs) : formatAd(date)}
      </span>
      {bs && <span className="figure" style={subtle}>{formatAd(date)}</span>}
    </span>
  )
}

export function BundleDetail() {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  const viewport = useViewport()
  const tabular = viewport !== 'phone'

  /*
   * The param name must match the route's exactly — `App.tsx:330` carries a
   * comment recording the one time it did not, when `/inventory/:code` met
   * `useParams<{ assetId }>()` and the param was silently always undefined.
   */
  const { bundleRef } = useParams<{ bundleRef?: string }>()

  const { window: availabilityWindow, setWindow, search: windowSearch } = useRentalWindowParams()
  const { fromAd, toAd } = availabilityWindow

  const record = useBundleRecord(bundleRef, availabilityWindow, money)
  const bundle: BundleRecord | null = record.rows[0] ?? null

  /* The list's address, with the operator's window preserved. NEVER
     `/inventory/bundles` — that has no route and resolves to `/inventory/:assetId`,
     which renders AssetDetail hunting for an asset called "bundles". */
  const backTo = `/inventory${windowSearch.replace('?', '?tab=bundles&')}`

  /*
   * The record gate, in the shape every sibling detail screen uses: guard on the
   * record, hand `PageBody` the four states and `{null}` children, and let it
   * rank error above empty so "the read failed" is never dressed up as "no such
   * bundle". `useBundleRecord` passes `isFilteredOverride: false`, so the empty
   * state does not offer "Clear filters" for an address that does not exist.
   */
  if (!bundle) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
        <PageBody
          loading={record.loading}
          error={record.error}
          onRetry={record.refetch}
          empty={record.isEmpty}
          noun="bundle"
          skeleton="card"
          emptyTitle="Bundle not found"
          emptyMessage={`No bundle matches "${bundleRef ?? ''}" by bundle code. It may have been archived, or the reference may be out of date.`}
          emptyActionLabel="Back to Bundles"
          onEmptyAction={() => navigate(backTo)}
        >
          {null}
        </PageBody>
      </div>
    )
  }

  const facts = factsOf(bundle)
  const groups = bundleDetailGroups(bundle, gctx)
  const state: BundleState | 'Archived' = bundle.archived ? 'Archived' : facts.state

  /*
   * The fields with no column, named once. `bundleRecords.ts`'s header is the
   * authority; this is its operator-facing sentence. Shown only when they are
   * actually empty, so the day a column lands the note disappears on its own
   * rather than becoming a stale apology.
   */
  const unrecorded: string[] = []
  if (bundle.tags.length === 0) unrecorded.push('tags')
  if (bundle.lockMode === undefined) unrecorded.push('lock mode')
  if (bundle.nextConflictAd === undefined) unrecorded.push('next conflict')
  if (!bundle.lines.some((l) => l.substitutes && l.substitutes.length > 0)) unrecorded.push('substitutes')

  const kpis: Kpi[] = [
    {
      label: 'Ready',
      value: ratioLabelOf(facts),
      icon: 'check',
      accent: facts.readyItems === facts.totalItems ? 'success' : 'warn',
      note: `${facts.totalItems} required items`,
    },
    {
      label: 'Components',
      value: String(bundle.lines.length),
      icon: 'queues',
      accent: 'primary',
      note: `${facts.equipment} equipment${facts.boxes ? ` · ${facts.boxes} case` : ''}`,
    },
    {
      label: 'Blocked',
      value: String(facts.blockedItems),
      icon: facts.blockedItems > 0 ? 'alert_triangle' : 'check',
      accent: facts.blockedItems > 0 ? 'warn' : 'success',
      note: facts.blockedLines.length === 0 ? 'Nothing short in this window' : `${facts.blockedLines.length} line${facts.blockedLines.length === 1 ? '' : 's'} short`,
    },
    /* Law 6 — the rate tile is money, so it is dropped outright rather than
       masked for a money-blind session. The grid closes up. */
    ...(money
      ? [{
          label: 'Daily rate',
          value: formatMoney(bundle.bundleRatePaisa),
          icon: 'card' as const,
          accent: 'success' as const,
          note: facts.savingPct > 0 ? `Saves ${facts.savingPct}% on parts` : 'At or above sum of parts',
        }]
      : []),
  ]

  /* Built exactly as the list's SummaryCard builds them (`Bundles.tsx:1482`) —
     `display` and `percent` are pre-formatted because the chart kit never
     guesses a format. Denominator guarded so an all-zero bundle cannot divide
     by zero. */
  const segmentTotal = facts.segments.reduce((sum, x) => sum + x.value, 0) || 1
  const slices: Slice[] = facts.segments.map((s) => ({
    label: s.label,
    value: s.value,
    display: String(s.value),
    percent: `${Math.round((s.value / segmentTotal) * 100)}%`,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)', paddingBottom: 60 }}>
      <PageHeader
        icon={iconFor(bundle.category)}
        title={bundle.name}
        description={`${bundle.id} · ${bundle.category} (Primary) · ${bundle.lines.length} components`}
        actions={
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone={STATE_TONE[state]} label={state} />
            {/*
              ABSENT, not disabled, for a role that cannot edit — `bundles_manage`
              is Owner/Admin/Manager and offering the control to anyone else would
              end at a refused write. The window rides along so the editor's
              Cancel returns to the same availability question this page is
              answering (§4.44).
            */}
            {user && canUpdateBundle(user.role) && (
              <Link to={`/inventory/bundles/${bundleRef ?? bundle.id}/edit${windowSearch}`} style={{ textDecoration: 'none' }}>
                <Button variant="secondary">Edit bundle</Button>
              </Link>
            )}
            <Link to={backTo} style={{ textDecoration: 'none' }}>
              <Button icon="chevron_left" variant="secondary">Back to Bundles</Button>
            </Link>
          </div>
        }
      />

      <KpiStrip items={kpis} columns={kpis.length} />

      {/*
        §4.44 — the window every availability figure below is measured against,
        carried in from the list. It is not a filter: it does not decide what is
        shown, it decides what "available" means for all of it.
      */}
      <Card title="Available for">
        <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            From
            <DateField ariaLabel="Availability window from" value={dayValue(fromAd)} onChange={(v) => setWindow('from', v)} showBs={false} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            To
            <DateField ariaLabel="Availability window to" value={dayValue(toAd)} onChange={(v) => setWindow('to', v)} showBs={false} align="right" />
          </label>
          <BsAd date={new Date(fromAd)} prefix="From" />
          <BsAd date={new Date(toAd)} prefix="To" />
          <span style={{ ...subtle, flexBasis: '100%' }}>
            Returns are half-open: a rental ending on the To date does not block this window.
          </span>
        </div>
      </Card>

      <Card title="Readiness">
        <div style={{ display: 'flex', gap: 'var(--sp-lg)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Donut slices={slices} size={112} centreValue={`${facts.readyItems} / ${facts.totalItems}`} centreLabel="Available" />
          <Legend slices={slices} showPercent={false} />
        </div>
      </Card>

      {/*
        The components table is the reason an operator opens this page: which
        model, how many needed, how many free in this window, and what is holding
        the rest. `blockedBy` is only ever set on a short line, so an empty cell
        there means the line is covered, not that the reason is missing.
      */}
      <Card title={`Components (${bundle.lines.length})`} bodyStyle={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: tabular ? 720 : undefined }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
                <th style={th}>Group</th>
                <th style={th}>Model</th>
                <th style={{ ...th, textAlign: 'right' }}>Needs</th>
                <th style={{ ...th, textAlign: 'right' }}>Available</th>
                <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                <th style={th}>Held by</th>
                {money && <th style={{ ...th, textAlign: 'right' }}>Unit rate</th>}
              </tr>
            </thead>
            <tbody>
              {bundle.lines.map((l, i) => {
                const short = l.unitsAvailable < l.quantity
                return (
                  <tr key={`${l.group}-${l.model}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={iconFor(l.group)} size={13} />
                        {l.group}
                      </span>
                    </td>
                    <td style={td}>
                      {l.model}
                      {!isPriced(l) && (
                        <span style={{ ...subtle, marginLeft: 6 }} title="Priced in the booking's own section, not in the bundle rate.">
                          (not in rate)
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="figure">{l.quantity}</td>
                    <td style={{ ...td, textAlign: 'right', color: short ? 'var(--danger-text)' : 'var(--text)', fontWeight: short ? 700 : 400 }} className="figure">
                      {l.unitsAvailable}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="figure">{l.unitsStock}</td>
                    <td style={td}>
                      {short && l.blockedBy ? (
                        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: STATUS[l.blockedBy === 'On Rent' ? 'out' : l.blockedBy === 'Reserved' ? 'primary' : 'progress'].fg }}>
                            {l.blockedBy}
                          </span>
                          {l.freesAd && <span style={subtle}>frees {formatAd(l.freesAd)}</span>}
                        </span>
                      ) : short && l.unitsStock < l.quantity ? (
                        /*
                         * Short because the business does not OWN enough — a
                         * fully explained shortfall, and not the same thing as an
                         * unnameable one. Driving the page caught this: both
                         * cases first rendered "reason not recorded", which told
                         * an operator the system did not know, when the answer
                         * was simply that the kit asks for more than the shelf
                         * holds. No amount of waiting frees these.
                         */
                        <span style={{ color: 'var(--warn-text)' }} title={`This bundle needs ${l.quantity} but only ${l.unitsStock} ${l.unitsStock === 1 ? 'is' : 'are'} owned.`}>
                          Only {l.unitsStock} owned
                        </span>
                      ) : short ? (
                        /* Enough are owned, none is free, and the reason is not
                           one the four-state model can name: `BlockedBy` has no
                           member for Missing or Retired, and `bundleRecords.ts`
                           refuses to call lost gear "On Maintenance" just to
                           fill the cell. */
                        <span style={subtle} title="Enough units are owned but none is free, and the reason is not one the four-state model can name — see bundleRecords.ts.">
                          Short — reason not recorded
                        </span>
                      ) : (
                        <span style={subtle}>—</span>
                      )}
                    </td>
                    {money && (
                      <td style={{ ...td, textAlign: 'right' }} className="figure">
                        {isPriced(l) ? formatMoney(l.unitRatePaisa) : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/*
        `bundleDetailGroups` is rendered rather than re-implemented: it is already
        gated, already cited to the spec, and already the exact field set the
        hover card shows, so the card and the page cannot disagree. `IntelCard`'s
        own `DetailGroups` renderer is module-local and unexported, hence the
        small renderer here rather than an import.
      */}
      <div style={{ display: 'grid', gap: 'var(--sp-lg)', gridTemplateColumns: tabular ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr' }}>
        {groups.map((g) => (
          <Card key={g.title} title={g.title}>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: '8px 14px', fontSize: 'var(--t-meta)' }}>
              {g.fields.map((f, i) => (
                <div key={`${g.title}-${f.label}-${i}`} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{f.label}</dt>
                  <dd style={{ margin: 0, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                    {f.value}
                    {f.trigger && (
                      <>
                        {' '}
                        <Link to={f.trigger.to} style={{ color: 'var(--nav-active-accent)' }}>
                          {f.trigger.label}
                        </Link>
                      </>
                    )}
                  </dd>
                </div>
              ))}
              {g.title === 'Identity' && unrecorded.length > 0 && (
                <div style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--muted)' }}>Not recorded</dt>
                  <dd style={{ margin: 0, color: 'var(--text2)' }}>
                    {unrecorded.join(', ')} — no column holds {unrecorded.length === 1 ? 'it' : 'them'} yet,
                    so the fields above read as unset rather than being left blank.
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        ))}
      </div>

      <FooterNote
        extra={[
          `Availability measured for ${formatAd(new Date(fromAd))} → ${formatAd(new Date(toAd))}`,
          'A bundle stores models, never serials — units are assigned at packing',
        ]}
      />
    </div>
  )
}

export default BundleDetail
