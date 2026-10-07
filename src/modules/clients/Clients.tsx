import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { ClientsDirectory } from './ClientsDirectory'
import { useClients, useMembershipPlans } from '../../lib/queries/useClients'
import { EmptyState } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import Membership from './Membership'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { isStaff } from '../../lib/rbac'
import { TIER_TONE, type ClientRecord } from '../../data/clients'
import { STATUS } from '../../lib/status'

/**
 * Clients — directory, memberships, referrals and credit.
 *
 * Foundation §5.1 merges Memberships into this screen as a **tab**, so the page
 * title and the tab strip live here and `Membership` renders `embedded`.
 *
 * The render heads the first tab "Customers". CLAUDE.md: that word appears
 * nowhere in the UI — they are **clients**.
 */

type TabKey = 'clients' | 'membership' | 'referral' | 'credit'

interface TabDef {
  key: TabKey
  label: string
  /** A money-only surface is absent for Warehouse, not disabled (§8.3). */
  money?: boolean
}

const TAB_DEFS: TabDef[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'membership', label: 'Membership' },
  { key: 'referral', label: 'Referral' },
  { key: 'credit', label: 'Credit', money: true },
]

/** Escapes a value for a CSV cell — the export is real, so quoting has to be. */
function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ClientsProps {
  loading?: boolean | undefined
  error?: string | null | undefined
  onRetry?: (() => void) | undefined
}

export default function Clients({
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: ClientsProps = {}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isStaffMember = user ? isStaff(user.role) : true
  const money = useCanViewMoney()
  const { showSuccessToast } = useToast()
  const [params, setParams] = useSearchParams()

  /**
   * Every panel on this screen now reads the database. The directory comes from
   * `client_directory_v` (0052/0053/0054); the Credit tab's policy table comes
   * from `membership_plans_v`. The `CLIENTS_DATA` seed array this file used to
   * import is gone from it entirely.
   */
  const { clients, loading: clientsLoading, error: clientsError, refresh } = useClients()

  const isLoading = propLoading !== undefined ? propLoading : clientsLoading
  const isError = propError !== undefined ? propError : clientsError
  const handleRetry = propOnRetry ?? refresh

  /**
   * Blocking is a write now, and this screen's only job in it is the re-read.
   *
   * ⛔ **What this replaced.** A `bulkBlock(ids, reason)` handler and a
   * `blockRefusal` banner that said "N clients were NOT blocked … Nothing on
   * this screen has changed", because `actions/clients/blockClient.ts` was a
   * stub. It is now implemented: a block is an insert into `client_flags` and an
   * unblock sets that row's removal fields (Law 3 — never a delete).
   * `ClientsDirectory` owns the dispatch and reports its own outcome; the one
   * thing it cannot do is refresh the list, because `useClients` lives here.
   *
   * `isBlocked` arrives from `client_directory_v.is_blocked` (migration 0054),
   * so re-reading is the only way to show the change. There is deliberately no
   * local override map: painting `isBlocked` over a fetched row is what made the
   * old version unable to tell a real block from an imagined one.
   */
  const tabs = useMemo(() => TAB_DEFS.filter((t) => money || !t.money), [money])

  const requested = (params.get('tab') ?? 'clients') as TabKey
  const activeTab: TabKey = tabs.some((t) => t.key === requested) ? requested : 'clients'

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params)
    if (key === 'clients') next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }

  /**
   * A real CSV of the directory. Money columns are omitted for Warehouse — an
   * export is still the application handing out figures, so §8.3 applies to the
   * file exactly as it applies to the table.
   */
  const exportCsv = () => {
    // No 'Company' column. `ClientRecord.company` has no source in
    // `client_directory_v` — the mapper never sets it — so every cell was blank
    // on every row. A header over nothing is a column the file cannot fill.
    const headers = [
      'Client ID',
      'Name',
      'Type',
      'Membership',
      'Phone',
      'Email',
      'PAN',
      'Current Rentals',
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
        c.phone,
        c.email,
        c.pan ?? '',
        c.currentRentalsCount,
        ...(money ? [formatMoney(c.outstandingPaisa), formatMoney(c.depositHeldPaisa)] : []),
        c.lastRentalBs,
        c.isBlocked ? 'Blocked' : 'Active',
      ]
        .map(csvCell)
        .join(','),
    )
    const blob = new Blob([[headers.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clients.csv'
    a.click()
    URL.revokeObjectURL(url)
    showSuccessToast('Export ready', `${clients.length} client rows written to clients.csv`)
  }

  /* ── restricted state for non-staff ────────────────────────────────── */
  if (!isStaffMember) {
    return (
      <PageBody
        restricted={true}
        restrictedReason="The client management directory is for Babin Rentals staff only. Clients may view their profile in the client portal."
        restrictedRequiredRole="Staff"
        noun="clients"
      >
        <div />
      </PageBody>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Clients"
        description="Manage your clients, memberships, referrals and credit"
        actions={
          <>
            <Button variant="primary" icon="plus" onClick={() => navigate('/clients/new')}>
              New Client
            </Button>
            <Button icon="upload" onClick={() => navigate('/clients/import')}>
              Import
            </Button>
            <Button icon="download" onClick={exportCsv}>
              Export
            </Button>
            <Button icon="users" onClick={() => navigate('/clients/duplicates')}>
              Find Duplicates
            </Button>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)' }}>
        {tabs.map((t) => {
          const on = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 12px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'clients' && (
        <>
          {/*
            `PageBody` owns error → loading → children here, in that fixed order,
            and replaces the ladder this screen used to hand-roll (an ErrorBanner,
            a Card reading "Loading clients…", and a bare boolean for the happy
            path). Three deliberate choices:

            - `empty` is NOT passed. `ClientsDirectory` renders its own empty
              state one level down and it is the better one: it keeps the search
              box and the filter chips on screen, and it already distinguishes
              "the directory is empty" from "nothing matches this filter" — a
              distinction only it can make, because it owns the filter state.
              Intercepting at zero rows here would replace both with one message
              and take the filters away with them.
            - `hasRows` IS passed, so a failed refresh renders the banner ABOVE
              the table someone is reading instead of replacing it.
            - `restricted` is not set: clients are not a money surface. A
              money-blind session reads the directory with the money columns
              absent, which `client_directory_v` does by returning them null.
          */}
          <PageBody
            loading={isLoading}
            error={isError}
            onRetry={handleRetry}
            hasRows={clients.length > 0}
            noun="clients"
            skeleton="table"
            skeletonRows={6}
          >
            <ClientsDirectory clients={clients} onRequestAdd={() => navigate('/clients/new')} onBlockChanged={refresh} />
          </PageBody>
        </>
      )}
      {activeTab === 'membership' && <Membership embedded />}
      {activeTab === 'referral' && <ReferralView />}
      {activeTab === 'credit' && money && (
        <CreditView clients={clients} loading={isLoading} error={isError} onRetry={handleRetry} />
      )}

      <FooterNote extra={['Clients are never deleted — a closed account is retained and marked']} />
    </div>
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
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '11px 12px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

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
  const navigate = useNavigate()

  return (
    <Card
      title="Referral conversions and affiliate rewards"
      action={
        <Button icon="plus" onClick={() => navigate('/clients/referral/new')}>
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
          <Unavailable reason="The Manager override gate is not built yet — Foundation §10 requires an authorisation step and an immutable audit row that do not exist">
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {plans.rows.map((p) => (
              <div
                key={p.level}
                style={{
                  padding: 'var(--sp-md)',
                  borderRadius: 'var(--r-card)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  minWidth: 0,
                }}
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
                <span className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                  {/* null is withheld, never zero — see `MembershipPlanRow`. */}
                  {p.defaultCreditLimit === null ? '—' : formatMoney(p.defaultCreditLimit)}
                </span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  {/* Null for Elite ("Negotiated") as well as for a withheld
                      figure — the two are the same value here, so neither is
                      claimed as a number. */}
                  Discount{' '}
                  <span className="figure">
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
          Discount stacking is capped at 25% — a plan discount plus any promotion may not exceed it.
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
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
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
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
                    <td className="figure" style={td}>
                      {formatMoney(c.creditLimitPaisa)}
                    </td>
                    <td
                      className="figure"
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
          </div>
        </PageBody>
      </Card>
    </div>
  )
}
