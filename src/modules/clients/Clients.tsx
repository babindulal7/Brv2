import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { ClientsDirectory } from './ClientsDirectory'
import { useClients } from '../../lib/queries/useClients'
import { ErrorBanner } from '../../components/ui/StateViews'
import Membership from './Membership'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
// CLIENTS_DATA is still read by the Referral and Credit panels below, which
// have not been converted to a query yet — the directory tab no longer uses it.
import { CLIENTS_DATA, TIER_TONE, type MembershipTier } from '../../data/clients'
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

export default function Clients() {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { showSuccessToast } = useToast()
  const [params, setParams] = useSearchParams()

  /**
   * Clients now come from the database (`client_directory_v`, migrations
   * 0052/0053) rather than the `CLIENTS_DATA` array this screen used to hold in
   * `useState`. That array is still imported below for the credit/referral
   * panels, which have not been converted yet — the conversion is per-panel, not
   * all-or-nothing, so each one moves only when its own query exists.
   */
  const { clients: dbClients, loading: clientsLoading, error: clientsError } = useClients()
  const [blockOverrides, setBlockOverrides] = useState<Record<string, string>>({})

  /**
   * Block state is held locally until a real `blockClient` mutation exists.
   * Applied over the database rows rather than replacing them, so a block never
   * discards a freshly-fetched record.
   */
  const clients = useMemo(
    () =>
      dbClients.map((c) => {
        const reason = blockOverrides[c.id]
        return reason ? { ...c, isBlocked: true, blockReason: reason } : c
      }),
    [dbClients, blockOverrides],
  )

  /** Bulk Block — the directory table's row-selection checkboxes gain a real action. */
  const bulkBlock = (ids: string[], reason: string) => {
    // TODO(persistence): this does not reach the database yet. `clients.status`
    // is the real column and a block belongs in an audited mutation, not in
    // component state — deliberately not faked as saved.
    setBlockOverrides((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = reason
      return next
    })
    showSuccessToast('Clients blocked', `${ids.length} client${ids.length === 1 ? '' : 's'} blocked: ${reason}`)
  }

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
    const headers = [
      'Client ID',
      'Name',
      'Company',
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
        c.company ?? '',
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
          {/* An empty list and a failed query must never look alike — "no
              clients" and "we could not reach the database" are different
              facts, and only one of them is about the business. */}
          {clientsError && (
            <ErrorBanner
              title="Could not load clients"
              message={clientsError}
              onRetry={() => window.location.reload()}
            />
          )}
          {clientsLoading && !clientsError && (
            <Card>
              <div style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                Loading clients…
              </div>
            </Card>
          )}
          {!clientsLoading && !clientsError && (
            <ClientsDirectory clients={clients} onRequestAdd={() => navigate('/clients/new')} onBulkBlock={bulkBlock} />
          )}
        </>
      )}
      {activeTab === 'membership' && <Membership embedded />}
      {activeTab === 'referral' && <ReferralView money={money} />}
      {activeTab === 'credit' && money && <CreditView />}

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

/** Looks up a client id by exact name match against CLIENTS_DATA — undefined if no such client exists. */
function findClientIdByName(name: string): string | undefined {
  return CLIENTS_DATA.find((c) => c.name === name)?.id
}

/** Renders a client name as a link to its profile when the name resolves to a real client, plain text otherwise. */
function ClientNameCell({ name }: { name: string }) {
  const id = findClientIdByName(name)
  if (!id) return <>{name}</>
  return (
    <Link to={`/clients/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      {name}
    </Link>
  )
}

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

function ReferralView({ money }: { money: boolean }) {
  const navigate = useNavigate()
  const totalReward = REFERRALS.reduce((sum, r) => (sum + r.rewardPaisa) as Paisa, rupees(0))
  const credited = REFERRALS.filter((r) => r.credited)

  const kpis: Kpi[] = [
    { label: 'Active Referrers', value: String(new Set(REFERRALS.map((r) => r.referrer)).size), icon: 'users', accent: 'primary', note: 'Clients with a live referral code' },
    { label: 'Converted Accounts', value: String(REFERRALS.length), icon: 'checklist', accent: 'success', note: 'New clients from a referral' },
    { label: 'Awaiting First Return', value: String(REFERRALS.length - credited.length), icon: 'timer', accent: 'progress', note: 'Reward not yet credited' },
    ...(money
      ? [
          {
            label: 'Credits Issued',
            value: formatMoney(credited.reduce((sum, r) => (sum + r.rewardPaisa) as Paisa, rupees(0))),
            icon: 'card' as const,
            accent: 'success' as const,
            note: `of ${formatMoney(totalReward)} pledged`,
          },
        ]
      : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={kpis.length} />

      <Card
        title="Referral conversions and affiliate rewards"
        action={
          <Button icon="plus" onClick={() => navigate('/clients/referral/new')}>
            Generate Referral Code
          </Button>
        }
        bodyStyle={{ padding: 0 }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
                <th style={th}>Referrer</th>
                <th style={th}>Referral Code</th>
                <th style={th}>New Referred Account</th>
                <th style={th}>Date (BS)</th>
                {money && <th style={th}>Credit Reward</th>}
                <th style={th}>Reward Status</th>
              </tr>
            </thead>
            <tbody>
              {REFERRALS.map((r) => (
                <tr key={r.code} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <ClientNameCell name={r.referrer} />
                  </td>
                  <td style={td}>
                    <span
                      className="figure"
                      style={{
                        padding: '2px 6px',
                        borderRadius: 5,
                        background: 'var(--card2)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {r.code}
                    </span>
                  </td>
                  <td style={td}>
                    <ClientNameCell name={r.referredClient} />
                  </td>
                  <td className="figure" style={{ ...td, color: 'var(--text2)' }}>
                    {r.dateBs} BS
                  </td>
                  {money && (
                    <td className="figure" style={{ ...td, fontWeight: 600, color: 'var(--success-text)' }}>
                      {formatMoney(r.rewardPaisa)}
                    </td>
                  )}
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 19,
                        padding: '0 7px',
                        borderRadius: 5,
                        background: r.credited ? STATUS.in.bg : STATUS.progress.bg,
                        color: r.credited ? STATUS.in.fg : STATUS.progress.fg,
                        fontSize: 'var(--t-th)',
                        fontWeight: 600,
                      }}
                    >
                      <Icon name={r.credited ? 'checklist' : 'timer'} size={11} />
                      {r.credited ? 'Credited to ledger' : 'Awaiting first return'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ── credit ────────────────────────────────────────────────────────────── */

interface CreditTier {
  tier: MembershipTier
  defaultLimitPaisa: Paisa
  discount: string
  approval: string
}

const CREDIT_POLICY: CreditTier[] = [
  { tier: 'Academy', defaultLimitPaisa: rupees(0), discount: '10%', approval: 'Default' },
  { tier: 'Creator', defaultLimitPaisa: rupees(0), discount: '15%', approval: 'Default' },
  { tier: 'Cinematographer', defaultLimitPaisa: rupees(100000), discount: '20%', approval: 'KYC verified' },
  { tier: 'Production Alliance', defaultLimitPaisa: rupees(250000), discount: '20%', approval: 'Company PAN' },
  { tier: 'Elite', defaultLimitPaisa: rupees(500000), discount: '20%', approval: 'Director approval' },
]

/**
 * Credit is a money surface end to end, so this component is only ever mounted
 * for a role that may see money — the tab itself is absent otherwise.
 */
function CreditView() {
  const extended = CLIENTS_DATA.reduce((sum, c) => (sum + c.creditLimitPaisa) as Paisa, rupees(0))
  const used = CLIENTS_DATA.reduce((sum, c) => (sum + c.creditUsedPaisa) as Paisa, rupees(0))
  const overdue = CLIENTS_DATA.filter((c) => c.isBlocked).reduce(
    (sum, c) => (sum + c.outstandingPaisa) as Paisa,
    rupees(0),
  )
  const exposure = extended > 0 ? Math.round((used / extended) * 1000) / 10 : 0

  const kpis: Kpi[] = [
    { label: 'Credit Extended', value: formatMoney(extended), icon: 'card', accent: 'primary', note: `Approved limits across ${CLIENTS_DATA.length} accounts` },
    { label: 'Credit Utilised', value: formatMoney(used), icon: 'activity', accent: 'progress', note: `${exposure}% exposure ratio` },
    { label: 'Blocked Balance', value: formatMoney(overdue), icon: 'alert_triangle', accent: 'danger', note: `${CLIENTS_DATA.filter((c) => c.isBlocked).length} accounts under block` },
    { label: 'Manager Overrides', value: '3', icon: 'flag', accent: 'progress', note: 'Limits above the plan default' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={kpis} columns={4} />

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
          Credit limits derive from the membership plan. An override needs Manager authorisation with a reason of at
          least 10 characters, written to the immutable audit.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>
          {CREDIT_POLICY.map((p) => (
            <div
              key={p.tier}
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
                  background: STATUS[TIER_TONE[p.tier]].bg,
                  color: STATUS[TIER_TONE[p.tier]].fg,
                  fontSize: 'var(--t-th)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {p.tier}
              </span>
              <span className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                {formatMoney(p.defaultLimitPaisa)}
              </span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Discount <span className="figure">{p.discount}</span>
              </span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{p.approval}</span>
            </div>
          ))}
        </div>

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

      <Card title="Accounts using credit" bodyStyle={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
                <th style={th}>Client</th>
                <th style={th}>Tier</th>
                <th style={th}>Approved Limit</th>
                <th style={th}>Used</th>
                <th style={th}>Headroom</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CLIENTS_DATA.filter((c) => c.creditUsedPaisa > 0)
                .sort((a, b) => b.creditUsedPaisa - a.creditUsedPaisa)
                .map((c) => {
                  const headroom = (c.creditLimitPaisa - c.creditUsedPaisa) as Paisa
                  const tight = c.creditUsedPaisa > c.creditLimitPaisa * 0.8
                  return (
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
                      <td className="figure" style={td}>{formatMoney(c.creditLimitPaisa)}</td>
                      <td className="figure" style={{ ...td, fontWeight: 600 }}>{formatMoney(c.creditUsedPaisa)}</td>
                      <td
                        className="figure"
                        style={{ ...td, color: tight ? 'var(--danger-text)' : 'var(--text2)', fontWeight: tight ? 600 : 400 }}
                      >
                        {formatMoney(headroom)}
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
                            background: c.isBlocked ? STATUS.danger.bg : tight ? STATUS.progress.bg : STATUS.in.bg,
                            color: c.isBlocked ? STATUS.danger.fg : tight ? STATUS.progress.fg : STATUS.in.fg,
                            fontSize: 'var(--t-th)',
                            fontWeight: 600,
                          }}
                        >
                          <Icon name={c.isBlocked ? 'alert_triangle' : tight ? 'timer' : 'checklist'} size={11} />
                          {c.isBlocked ? 'Blocked' : tight ? 'Near limit' : 'Within limit'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
