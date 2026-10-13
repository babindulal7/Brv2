import { useState } from 'react'
import { recordExport } from '../../lib/exportAudit'
import { canExportClientPii } from '../../lib/rbac'
import { useAuth } from '../../lib/auth'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { useViewport } from '../../lib/device'
import { Card, PageHeader, PageActions, Button, KpiStrip, FooterNote } from '../../components/ui/Page'
import { GlobalAddMenu } from '../../components/ui/creation/GlobalAddMenu'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageShell } from '../../components/ui/PageShell'
import type { Kpi } from '../../components/ui/Page'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { ClientsDirectory } from './ClientsDirectory'
import { useClients, useMembershipPlans } from '../../lib/queries/useClients'
import { EmptyState } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import Membership from './Membership'
import { RecordForm } from '../../components/records/RecordForm'
import ImportCenter from './ImportCenter'
import DuplicateCenter from './DuplicateCenter'
import GenerateReferralCode from './GenerateReferralCode'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { TIER_TONE, type ClientRecord, STACK_NOTE } from '../../lib/queries/clients'
import { STATUS } from '../../lib/status'
import { FilterButton } from '../../components/ui/FilterDrawer'
import './clients.css'
import { canImportClients } from '../../lib/clientImport'
import { csvCell } from '../../lib/csv'

/**
 * Clients — directory, memberships, referrals, credit, imports, and duplicates.
 * All workflows integrated directly in this module with tabs and in-page views.
 */

type TabKey = 'clients' | 'new' | 'membership' | 'referral' | 'credit' | 'import' | 'duplicates'

interface TabDef {
  key: TabKey
  label: string
  /** A money-only surface is absent for Warehouse, not disabled (§8.3). */
  money?: boolean
  hideInBar?: boolean
}

const TAB_DEFS: TabDef[] = [
  { key: 'clients', label: 'Directory' },
  { key: 'new', label: 'New Client', hideInBar: true },
  { key: 'membership', label: 'Membership' },
  { key: 'referral', label: 'Referral' },
  { key: 'credit', label: 'Credit', money: true },
  { key: 'import', label: 'Import' },
  { key: 'duplicates', label: 'Duplicates' },
]

export default function Clients() {
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const money = useCanViewMoney()
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [params, setParams] = useSearchParams()
  const [directoryFiltersOpen, setDirectoryFiltersOpen] = useState(false)
  const [membershipFiltersOpen, setMembershipFiltersOpen] = useState(false)

  /**
   * Every panel on this screen now reads the database. The directory comes from
   * `client_directory_v` (0052/0053/0054); the Credit tab's policy table comes
   * from `membership_plans_v`. The `CLIENTS_DATA` seed array this file used to
   * import is gone from it entirely.
   */
  const { clients, loading: clientsLoading, error: clientsError, refresh } = useClients()

  /**
   * Blocking is a write now, and this screen's only job in it is the re-read.
   */
  const tabParam = (params.get('tab') as TabKey | null) ?? 'clients'
  const activeTab: TabKey = TAB_DEFS.some((t) => t.key === tabParam) ? tabParam : 'clients'

  const setTab = (key: TabKey) => {
    setDirectoryFiltersOpen(false)
    setMembershipFiltersOpen(false)
    const next = new URLSearchParams(params)
    if (key === 'clients') next.delete('tab')
    else next.set('tab', key)
    setParams(next)
  }

  // Streamline visible tabs to core operational sections; secondary tools in overflow
  const PRIMARY_TAB_KEYS: TabKey[] = ['clients', 'membership']
  const visibleTabs = TAB_DEFS.filter(
    (t) => (PRIMARY_TAB_KEYS.includes(t.key) || t.key === activeTab) && !t.hideInBar && (!t.money || money),
  )

  /** The loaded directory, including rows hidden by this screen's filters. */
  const exportCsv = () => {
    /* G5 (RULING 2026-10-07): phone, email and PAN leave the building only with Owner · Admin · Manager. */
    const pii = canExportClientPii(user?.role ?? 'Client')
    const headers = [
      'Client ID',
      'Name',
      'Type',
      'Membership',
      ...(pii ? ['Phone', 'Email', 'PAN'] : []),
      'Active Rentals',
      ...(money ? ['Outstanding (Rs)', 'Deposit Held (Rs)'] : []),
      'Last Rental (BS)',
      'Status',
    ]
    const lines = clients.map((c) =>
      [
        c.id,
        c.name,
        c.clientType,
        c.membership,
        ...(pii ? [c.phone, c.email, c.pan ?? ''] : []),
        c.currentRentalsCount,
        ...(money ? [formatMoney(c.outstandingPaisa), formatMoney(c.depositHeldPaisa)] : []),
        c.lastRentalBs,
        c.isBlocked ? 'Blocked' : 'Not blocked',
      ]
        .map(csvCell)
        .join(','),
    )
    recordExport({ list: 'clients', module: 'Clients', rowCount: clients.length, columns: headers, includesPii: pii, scope: 'loaded_directory' })
    const blob = new Blob([[headers.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clients.csv'
    a.click()
    URL.revokeObjectURL(url)
    showSuccessToast('Export ready', `${clients.length} client rows written to clients.csv`)
  }

  return (
    <PageShell
      width="full"
      header={
        <PageHeader
        {...(activeTab === 'clients'
          ? {
              leading: (
                <FilterButton
                  onClick={() => setDirectoryFiltersOpen((open) => !open)}
                  controls="clients-filters"
                  expanded={directoryFiltersOpen}
                />
              ),
            }
          : activeTab === 'membership' ? {
              leading: (
                <FilterButton
                  onClick={() => setMembershipFiltersOpen((open) => !open)}
                  controls="membership-filters"
                  expanded={membershipFiltersOpen}
                  activeCount={Number(Boolean(params.get('mk')))}
                />
              ),
            } : {})}
        title="Clients"
        status={
          activeTab === 'clients' && clients.length > 0 ? (
            <span
              className="eyebrow-pill"
              style={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 'var(--t-meta, 13px)',
                letterSpacing: 'normal',
              }}
            >
              {clients.length} {clients.length === 1 ? 'client' : 'clients'}
            </span>
          ) : null
        }
        search={
          activeTab === 'clients'
            ? {
                value: params.get('q') ?? '',
                onChange: (val: string) => {
                  const next = new URLSearchParams(params)
                  if (val.trim()) next.set('q', val)
                  else next.delete('q')
                  setParams(next, { replace: true })
                },
                placeholder: 'Search client, company, PAN, phone… (press /)',
                onClear: () => {
                  const next = new URLSearchParams(params)
                  next.delete('q')
                  setParams(next, { replace: true })
                },
                ariaLabel: 'Search clients',
              }
            : activeTab === 'membership'
              ? {
                  value: params.get('mq') ?? '',
                  onChange: (val: string) => {
                    const next = new URLSearchParams(params)
                    if (val.trim()) next.set('mq', val)
                    else next.delete('mq')
                    next.delete('mp')
                    setParams(next, { replace: true })
                  },
                  placeholder: 'Search members by name, plan, or type… (press /)',
                  onClear: () => {
                    const next = new URLSearchParams(params)
                    next.delete('mq')
                    next.delete('mp')
                    setParams(next, { replace: true })
                  },
                  ariaLabel: 'Search members',
                }
              : undefined
        }
        actions={
          <PageActions
            primary={<GlobalAddMenu module="clients" />}
            // RULING 2026-10-13: on a phone, Export lives in More so the title and Add keep the header.
            secondary={phone ? [] : [
              <Button key="export" icon="download" aria-label="Export clients" title={`Export ${clients.length} loaded directory rows, including rows hidden by filters`} disabled={clientsLoading || Boolean(clientsError)} onClick={exportCsv}>
                Export directory
              </Button>,
            ]}
            overflow={[
              ...(phone && !clientsLoading && !clientsError ? [{ label: 'Export loaded directory', icon: 'download' as const, onClick: exportCsv }] : []),
              ...(user && canImportClients(user.role) ? [{ label: 'Import Clients', icon: 'upload' as const, onClick: () => setTab('import') }] : []),
              { label: 'Duplicate Center', icon: 'users', onClick: () => setTab('duplicates') },
              ...(money ? [{ label: 'Credit Policies', icon: 'card' as const, onClick: () => setTab('credit') }] : []),
              { label: 'Referral Codes', icon: 'sparkles', onClick: () => setTab('referral') },
            ]}
          />
        }
        />
      }
    >

      <div style={{ overflowX: 'auto', paddingBottom: 2, maxWidth: '100%' }}>
        <SegmentedControl<TabKey>
          ariaLabel="Client sections"
          options={visibleTabs.map((t) => ({ id: t.key, label: t.label }))}
          value={activeTab}
          onChange={setTab}
        />
      </div>

      {activeTab === 'clients' && (
        <>
          <PageBody
            loading={clientsLoading}
            error={clientsError}
            onRetry={refresh}
            hasRows={clients.length > 0}
            noun="clients"
            skeleton="table"
          >
            <ClientsDirectory
              clients={clients}
              onRequestAdd={() => setTab('new')}
              onBlockChanged={refresh}
              filtersOpen={directoryFiltersOpen}
              onFiltersOpenChange={setDirectoryFiltersOpen}
            />
          </PageBody>
        </>
      )}
      {activeTab === 'new' && <RecordForm kind="client" onDone={() => setTab('clients')} />}
      {activeTab === 'import' && <ImportCenter embedded />}
      {activeTab === 'duplicates' && <DuplicateCenter embedded />}
      {activeTab === 'membership' && <Membership embedded filtersOpen={membershipFiltersOpen} onFiltersClose={() => setMembershipFiltersOpen(false)} />}
      {activeTab === 'referral' && <ReferralView />}
      {activeTab === 'credit' && money && (
        <CreditView clients={clients} loading={clientsLoading} error={clientsError} onRetry={refresh} />
      )}

      <FooterNote extra={['Clients are never deleted — a closed account is retained and marked']} />
    </PageShell>
  )
}

/* ── referral ──────────────────────────────────────────────────────────── */

export interface Referral {
  referrer: string
  code: string
  referredClient: string
  dateBs: string
  rewardPaisa: Paisa
  credited: boolean
}

export const REFERRALS: Referral[] = [
  {
    referrer: 'Kathmandu Cinema Works',
    code: 'KCW-PRO-26',
    referredClient: 'Shine Pictures Nepal',
    dateBs: '2083/02/14',
    rewardPaisa: rupees(5000),
    credited: true,
  },
  {
    referrer: 'Bikram Rai',
    code: 'BIKRAM-DOP',
    referredClient: 'Sushil Lama Visuals',
    dateBs: '2083/01/28',
    rewardPaisa: rupees(3500),
    credited: true,
  },
  {
    referrer: 'Himalayan Mountain Media',
    code: 'HIMALAYA-VIP',
    referredClient: 'Red Dot Films',
    dateBs: '2083/02/02',
    rewardPaisa: rupees(10000),
    credited: false,
  },
  {
    referrer: 'Annapurna Post Media',
    code: 'AMN-CREW-83',
    referredClient: 'Gandaki Sports Media',
    dateBs: '2083/03/19',
    rewardPaisa: rupees(7500),
    credited: false,
  },
]

const th = {
  textAlign: 'left' as const,
  padding: '9px 12px',
  fontFamily: "'Outfit', var(--font-display), sans-serif",
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic. Horizontal padding is untouched; the floor is a vertical law.
 *
 * This is a DATA-INTEGRITY fix, not a density preference. At 11 + 11 + a
 * --t-meta line the credit rows below stood around 39px, which cannot contain
 * the 44px hit area §7.3 owes the client link each row carries. A target
 * bigger than its row has to overhang into the neighbouring row, and an
 * absolutely positioned hit area wins the hit test — so the LATER row in the
 * DOM takes any tap landing in the overlap band. Commit 7d38cdf proved that on
 * the floor workspaces, where a boundary tap could record a return against the
 * wrong line item. On a credit table the same mis-tap opens the wrong client's
 * account, and every credit-limit judgement made from that screen is then
 * being made about the wrong person. The floor has to come first so the link
 * can be given its 44px without re-creating the overlap.
 */
const td = { height: 'var(--row-min-h)', padding: '11px 12px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

/**
 * Referral — the panel that used to render `REFERRALS` above.
 *
 * ⛔ Every column it drew — referrer, code, referred account, date, reward,
 * credited — and all four of its KPIs came from that array. **Nothing in the
 * schema stores a referral.** There is no referrals table, no referral-code
 * column and no reward ledger anywhere in migrations 0001–0055; a grep for
 * "referral" across all of `supabase/migrations/` returns zero rows. So the
 * table was not "not wired yet", it was four invented conversions and Rs 26,000
 * of invented rewards rendered in the same tab strip as real client records,
 * with real-looking client names linking to real profiles.
 *
 * It is removed rather than left dashed. What stays is the one true statement —
 * that nothing is recorded — and the button, because `/clients/referral/new`
 * is a real route.
 *
 * `REFERRALS` itself is still exported above: `GenerateReferralCode.tsx` reads
 * it and that file is outside this change. It is a seed for that screen now,
 * not a source for this one.
 */
function ReferralView() {
  const [composing, setComposing] = useState(false)

  if (composing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <div>
          <Button icon="chevron_left" onClick={() => setComposing(false)}>
            Back to Referrals
          </Button>
        </div>
        <GenerateReferralCode embedded onDone={() => setComposing(false)} />
      </div>
    )
  }

  return (
    <Card
      title="Referral conversions and affiliate rewards"
      action={
        <Button icon="plus" onClick={() => setComposing(true)}>
          Generate Referral Code
        </Button>
      }
    >
      <EmptyState
        title="No referral is recorded"
        description="Referrals have no home in the database yet — no table stores a referral code, the account it introduced, or the reward owed for it. Until one exists there is nothing true to list here, and the figures this panel used to show were written into the page rather than earned by anyone."
      />
    </Card>
  )
}

/* ── credit ────────────────────────────────────────────────────────────── */

/**
 * Credit — money end to end, so this is only ever mounted for a role that may
 * see money (`TAB_DEFS` marks the tab `money: true` and the tab is absent
 * otherwise). That matters for reading the figures below: `toClientRecord`
 * collapses a withheld money field to 0, so a 0 here is only unambiguous
 * BECAUSE the session is known to be money-sighted.
 *
 * Two things this panel used to show are gone, both under the no-fabrication
 * rule rather than because they are hard:
 *
 *  - **Credit Utilised / Used / Headroom.** `creditUsedPaisa` has no column and
 *    no agreed formula — `toClientRecord` hard-zeroes it with a TODO(decision)
 *    saying outstanding is the closest true figure but that calling it
 *    credit-used asserts an equivalence nothing has ruled. Three of the old
 *    table's six columns were derived from it, plus a KPI and a progress ratio.
 *    Outstanding is shown here under its own name instead.
 *  - **Manager Overrides: 3.** A hardcoded string. No override record exists.
 *
 * The policy table is no longer a constant either: `membership_plans` carries
 * `default_credit_limit` and `individual_discount_pct` per level, and 0005's own
 * comment on that table is the rule — *"no plan value may be hardcoded in
 * application code; every read comes from this table."* Its `approval` column
 * ("KYC verified", "Company PAN", "Director approval") is dropped: there is no
 * such column, and an approval condition is exactly the kind of invented rule
 * someone would act on.
 */
function CreditView({
  clients,
  loading,
  error,
  onRetry,
}: {
  clients: ClientRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const plans = useMembershipPlans()

  const extended = clients.reduce((sum, c) => (sum + c.creditLimitPaisa) as Paisa, rupees(0))
  const owed = clients.reduce((sum, c) => (sum + c.outstandingPaisa) as Paisa, rupees(0))
  // `isBlocked` is a database fact now (0054's `client_directory_v.is_blocked`,
  // derived from a live `client_flags` row). Before it was wired this KPI
  // counted nothing on every real record, because the mapper never set the
  // field — the figure was always Rs 0 and always looked like good news.
  const blocked = clients.filter((c) => c.isBlocked)
  const blockedBalance = blocked.reduce((sum, c) => (sum + c.outstandingPaisa) as Paisa, rupees(0))

  const withLimit = [...clients]
    .filter((c) => c.creditLimitPaisa > 0)
    .sort((a, b) => b.creditLimitPaisa - a.creditLimitPaisa)

  const kpis: Kpi[] = [
    {
      label: 'Credit Extended',
      value: formatMoney(extended),
      icon: 'card',
      accent: 'primary',
      note: `Approved limits across ${clients.length} loaded account${clients.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Outstanding',
      value: formatMoney(owed),
      icon: 'activity',
      accent: 'progress',
      note: 'Owed on invoices — not the same figure as credit used',
    },
    {
      label: 'Blocked Balance',
      value: formatMoney(blockedBalance),
      icon: 'alert_triangle',
      accent: 'danger',
      note: `${blocked.length} account${blocked.length === 1 ? '' : 's'} under block`,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={kpis.length} />

      <Card
        title="Credit policy by membership tier"
        action={
          <Unavailable reason={/* The Manager override gate is not built yet — Foundation §10 requires an authorisation step and an immutable audit row that do not exist */ "Manager overrides are not available yet."}>
            <Button icon="flag" disabled>
              Request Override
            </Button>
          </Unavailable>
        }
      >
        <p style={{ margin: '-4px 0 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Credit limits derive from the membership plan — nobody types a limit onto a client record. An override
          needs Manager authorisation with a reason of at least 10 characters, written to the immutable audit.
        </p>

        <PageBody
          loading={plans.loading}
          error={plans.error}
          onRetry={plans.refetch}
          hasRows={plans.rows.length > 0}
          empty={plans.isEmpty}
          noun="membership plans"
          skeleton="card"
          emptyTitle="No membership plan is on file"
          emptyMessage="`membership_plans` holds no active plan, so there is no tier, no default credit limit and no plan discount to state. The five tiers this table used to list were written into the page."
        >
          <div className="credit-policy-grid">
            {plans.rows.map((p) => (
              <div
                key={p.level}
                className="credit-policy-card"
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignSelf: 'flex-start',
                    alignItems: 'center',
                    height: 19,
                    padding: '0 7px',
                    borderRadius: 5,
                    background: STATUS[TIER_TONE[p.level]].bg,
                    color: STATUS[TIER_TONE[p.level]].fg,
                    fontSize: 'var(--t-th)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </span>
                <span className="figure client-mono" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                  {/* null is withheld, never zero — see `MembershipPlanRow`. */}
                  {p.defaultCreditLimit === null ? '—' : formatMoney(p.defaultCreditLimit)}
                </span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  {/* Null for Elite ("Negotiated") as well as for a withheld
                      figure — the two are the same value here, so neither is
                      claimed as a number. */}
                  Discount{' '}
                  <span className="figure client-mono">
                    {p.individualDiscountPct === null ? 'Negotiated' : `${p.individualDiscountPct}%`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </PageBody>

        <p
          style={{
            margin: '12px 0 0',
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
          }}
        >
          <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
          {/* The 25% stacking cap this line used to state was rescinded — see
              STACK_NOTE's own note in data/membership.ts. Imported rather than
              restated so the two surfaces cannot drift apart again. */}
          {STACK_NOTE}
        </p>
      </Card>

      <Card title="Accounts with an approved credit limit" bodyStyle={{ padding: withLimit.length ? 0 : undefined }}>
        <PageBody
          loading={loading}
          error={error}
          onRetry={onRetry}
          hasRows={withLimit.length > 0}
          empty={!loading && !error && withLimit.length === 0}
          noun="accounts"
          emptyTitle="No account carries an approved credit limit"
          emptyMessage="Every loaded client has a limit of zero, so none of them can rent on credit today."
        >
          <DataTableShell ariaLabel="Approved credit limits">
            <table className="client-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  <th style={th}>Client</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Approved Limit</th>
                  <th style={th}>Outstanding</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {withLimit.map((c) => (
                  <tr key={c.id} className="client-row" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <Link to={`/clients/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {c.name}
                      </Link>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 19,
                          padding: '0 7px',
                          borderRadius: 5,
                          background: STATUS[TIER_TONE[c.membership]].bg,
                          color: STATUS[TIER_TONE[c.membership]].fg,
                          fontSize: 'var(--t-th)',
                          fontWeight: 600,
                        }}
                      >
                        {c.membership}
                      </span>
                    </td>
                    <td className="figure client-outfit" style={td}>
                      {formatMoney(c.creditLimitPaisa)}
                    </td>
                    <td
                      className="figure client-outfit"
                      style={{ ...td, fontWeight: c.outstandingPaisa > 0 ? 600 : 400, color: c.outstandingPaisa > 0 ? 'var(--danger-text)' : 'var(--text2)' }}
                    >
                      {formatMoney(c.outstandingPaisa)}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          height: 19,
                          padding: '0 7px',
                          borderRadius: 5,
                          background: c.isBlocked ? STATUS.danger.bg : STATUS.in.bg,
                          color: c.isBlocked ? STATUS.danger.fg : STATUS.in.fg,
                          fontSize: 'var(--t-th)',
                          fontWeight: 600,
                        }}
                      >
                        <Icon name={c.isBlocked ? 'alert_triangle' : 'checklist'} size={11} />
                        {c.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </PageBody>
      </Card>
    </div>
  )
}
