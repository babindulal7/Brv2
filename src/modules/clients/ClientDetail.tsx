import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, SummaryRows } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewPII, canViewOnStopReason, moneyScope } from '../../lib/fieldGating'
import { STATUS } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { CLIENTS_DATA, TIER_TONE, type ClientRecord } from '../../data/clients'
import { ROWS as RENTAL_ROWS } from '../../data/rentals'
import { DOCUMENTS } from '../../data/documents'
import { INVOICES } from '../finance/Finance'
import { INVOICE_TOKEN } from '../../data/invoiceIntel'

/**
 * Client Detail — the confirmed gap named by three sources this session (the
 * audit reconciliation, the earlier design pack, and a direct grep for
 * `/clients/:id`): `ClientsDirectory.tsx` only ever showed a right-rail quick
 * view, never a full page. This is that page.
 *
 * **Cross-referencing note.** `CLIENTS_DATA`, `data/rentals.ts` and
 * `data/documents.ts` were authored independently and use disjoint client
 * *names* for their seed rows (the booking `BK-2026-0715` belongs to
 * "Kathmandu Cinema Works" here but "ABC Films" in `rentals.ts`). Matching by
 * name would silently attach the wrong client's bookings, or find nothing for
 * almost every real record. Booking **numbers** are the one thing that is
 * genuinely shared, so every cross-reference below goes through
 * `client.activeBookings`, never through a name comparison.
 */

type TabKey = 'overview' | 'rentals' | 'payments' | 'documents' | 'notes' | 'activity'

interface TabDef {
  key: TabKey
  label: string
  money?: boolean
}

const TAB_DEFS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'rentals', label: 'Rentals' },
  { key: 'payments', label: 'Payments', money: true },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
]

function Tone({ text, tone }: { text: string; tone: keyof typeof STATUS }) {
  const c = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 21,
        padding: '0 8px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        border: c.border ? `1px solid ${c.border}` : undefined,
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  const pii = canViewPII(gctx)
  const { showSuccessToast } = useToast()

  const found = useMemo(() => CLIENTS_DATA.find((c) => c.id === id) ?? null, [id])
  const [client, setClient] = useState<ClientRecord | null>(found)
  const [tab, setTab] = useState<TabKey>('overview')
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockReasonDraft, setBlockReasonDraft] = useState('')

  const tabs = useMemo(() => TAB_DEFS.filter((t) => money || !t.money), [money])
  const activeTab: TabKey = tabs.some((t) => t.key === tab) ? tab : 'overview'

  if (!found || !client) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <EmptyState
          title="Client not found"
          description={`No client record matches "${id}". It may have been renamed or the link is out of date.`}
          actionLabel="Back to Clients"
          onAction={() => navigate('/clients')}
        />
      </div>
    )
  }

  // Cross-referenced by booking number only — see the file header note.
  const rentals = client.activeBookings
    .map((bookingNo) => RENTAL_ROWS.find((r) => r.bookingNo === bookingNo))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  const documents = DOCUMENTS.filter((d) => client.activeBookings.includes(d.relatedTo))
  const invoices = INVOICES.filter((inv) => client.activeBookings.includes(inv.booking))

  const creditHeadroom = (client.creditLimitPaisa - client.creditUsedPaisa) as typeof client.creditLimitPaisa
  const creditPct = client.creditLimitPaisa > 0 ? Math.min(100, Math.round((client.creditUsedPaisa / client.creditLimitPaisa) * 100)) : 0

  const kpis: Kpi[] = [
    { label: 'Total Rentals', value: String(client.totalRentalsCount), icon: 'checklist', accent: 'primary', note: `${client.currentRentalsCount} active now` },
    ...(money
      ? [
          { label: 'Outstanding', value: formatMoney(client.outstandingPaisa), icon: 'card' as const, accent: (client.outstandingPaisa > 0 ? 'danger' : 'success') as BrandKey },
          { label: 'Deposit Held', value: formatMoney(client.depositHeldPaisa), icon: 'box' as const, accent: 'progress' as const },
          { label: 'Lifetime Spend', value: formatMoney(client.totalSpentPaisa), icon: 'activity' as const, accent: 'success' as const },
        ]
      : []),
  ]

  const handleToggleBlock = () => {
    if (client.isBlocked) {
      /* exactOptionalPropertyTypes — `blockReason` is optional, so clearing it
         means the key is ABSENT, not present-and-undefined. */
      const { blockReason: _cleared, ...unblocked } = client
      setClient({ ...unblocked, isBlocked: false })
      import('../../actions/clients/blockClient').then((m) =>
        m.blockClient({ clientId: client.id, blocked: false })
      )
      showSuccessToast('Client unblocked', `${client.name} can book again`)
      return
    }
    setShowBlockModal(true)
  }

  const confirmBlock = () => {
    if (blockReasonDraft.trim().length < 10) return
    const reason = blockReasonDraft.trim()
    setClient({ ...client, isBlocked: true, blockReason: reason })
    import('../../actions/clients/blockClient').then((m) =>
      m.blockClient({ clientId: client.id, blocked: true, reason })
    )
    showSuccessToast('Client blocked', `${client.name} is now blocked from new rentals`)
    setShowBlockModal(false)
    setBlockReasonDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="users"
        title={client.name}
        description={`${client.id} · ${client.clientType}${client.company ? ` · ${client.company}` : ''}`}
        actions={
          <>
            {client.isVip && <Tone text="VIP" tone="progress" />}
            {client.isBlocked && <Tone text="Blocked" tone="danger" />}
            <Unavailable reason="Editing an existing client record is not built yet — the Add Client form only creates new records">
              <Button icon="tool" disabled>
                Edit Client
              </Button>
            </Unavailable>
            <Button icon="users" onClick={() => navigate('/clients/duplicates')}>
              Merge Duplicate
            </Button>
            {client.isBlocked ? (
              <Button icon="checklist" onClick={handleToggleBlock}>
                Unblock Client
              </Button>
            ) : (
              <Button variant="danger" icon="alert_triangle" onClick={handleToggleBlock}>
                Block Client
              </Button>
            )}
            {client.isBlocked ? (
              <Unavailable reason={`Blocked: ${client.blockReason ?? 'account under review'} — clear the block before starting a rental`}>
                <Button variant="primary" icon="plus" disabled>
                  Start Rental
                </Button>
              </Unavailable>
            ) : (
              <Button variant="primary" icon="plus" onClick={() => navigate('/rentals/new')}>
                Start Rental
              </Button>
            )}
          </>
        }
      />

      {/* HIS v2.1 §4.4 — the block itself is visible to everyone who tries to
          book; only the reason and who set it are staff information. */}
      {client.isBlocked && (
        <ErrorBanner
          title="Account blocked."
          message={canViewOnStopReason(gctx) ? client.blockReason : 'Contact a manager for details.'}
        />
      )}

      <KpiStrip items={kpis} columns={kpis.length} />

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

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-md)' }}>
          <Card title="Identity">
            <SummaryRows
              rows={[
                { label: 'Client type', value: client.clientType },
                { label: 'Tags', value: client.tags?.length ? client.tags.join(', ') : '—' },
                { label: 'PAN', value: client.pan ?? 'Not on file' },
                { label: 'KYC', value: client.kycStatus },
              ]}
            />
          </Card>

          {/* HIS v2.1 §4.2 — phone/email/address were unconditional here
              before this; a Warehouse or Technician session must not
              construct this card at all, not just have it styled away. */}
          {pii && (
            <Card title="Contact">
              <SummaryRows
                rows={[
                  { label: 'Phone', value: client.phone },
                  { label: 'Email', value: client.email || '—' },
                  ...(client.addresses ?? [{ kind: 'Billing' as const, label: 'On file', address: client.address }]).map((a) => ({
                    label: `${a.kind} address`,
                    value: a.address,
                  })),
                ]}
              />
            </Card>
          )}

          {pii && (
            <Card title="Authorized Contact Person">
              <SummaryRows
                rows={[
                  { label: 'Name', value: client.contactPerson.name },
                  { label: 'Designation', value: client.contactPerson.designation },
                  { label: 'Phone', value: client.contactPerson.phone },
                ]}
              />
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                One contact per client today — a multi-contact model would be a schema change, not a display change.
              </p>
            </Card>
          )}

          <Card title="Membership & Credit">
            <SummaryRows
              rows={[
                { label: 'Membership Tier', value: client.membership, ...(TIER_TONE[client.membership] === 'danger' ? { tone: 'danger' as const } : {}) },
                { label: 'Last Rental', value: client.lastRentalBs === '—' ? 'No rental yet' : `${client.lastRentalBs} BS · ${client.lastRentalAd}` },
                // Open ⭐ #2 (HIS v2.1) — no benefit matrix is ruled yet.
                { label: 'Benefits', value: 'Not yet defined (Open ⭐ #2)' },
                ...(moneyScope(gctx) === 'full'
                  ? [
                      { label: 'Standing discount', value: client.standingDiscountPercent !== undefined ? `${client.standingDiscountPercent}%` : '—' },
                      { label: 'Discount source', value: client.discountSource ?? '—' },
                      // Open ⭐ #1 (HIS v2.1) — no per-category deposit-% table is ruled yet.
                      { label: 'Deposit override', value: 'Not set (Open ⭐ #1)' },
                    ]
                  : []),
              ]}
            />
            {(client.isBlocked || client.onStop) && canViewOnStopReason(gctx) && (
              <SummaryRows
                rows={[
                  { label: 'On-Stop set by', value: client.onStop?.setBy ?? '—' },
                  { label: 'On-Stop set on', value: client.onStop?.setAd ?? '—' },
                ]}
              />
            )}
            {money && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text2)' }}>Credit used</span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {formatMoney(client.creditUsedPaisa)} / {formatMoney(client.creditLimitPaisa)}
                  </span>
                </div>
                <span aria-hidden style={{ display: 'block', width: '100%', height: 6, borderRadius: 'var(--r-badge)', background: 'var(--border)', overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${creditPct}%`,
                      background: client.creditUsedPaisa > client.creditLimitPaisa * 0.8 ? 'var(--danger)' : 'var(--primary)',
                    }}
                  />
                </span>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  {formatMoney(creditHeadroom > 0 ? creditHeadroom : (0 as typeof creditHeadroom))} headroom remaining
                </p>
              </div>
            )}
          </Card>

          {/* Reliability [NEW] — counts visible to all staff; no ₨-recovered
              figure is modelled yet, so nothing here needs money-gating. */}
          {client.reliability && (
            <Card title="Reliability">
              <SummaryRows
                rows={[
                  { label: 'Late returns', value: `${client.reliability.lateReturns} / ${client.reliability.totalReturns}` },
                  { label: 'Damage cases', value: String(client.reliability.damageCases) },
                  { label: 'Missing cases', value: String(client.reliability.missingCases) },
                  { label: 'Avg days late', value: client.reliability.avgDaysLateOverall.toFixed(1) },
                ]}
              />
            </Card>
          )}
        </div>
      )}

      {activeTab === 'rentals' && (
        <Card
          title={`Rentals (${rentals.length} of ${client.totalRentalsCount} total shown)`}
          bodyStyle={{ padding: rentals.length ? 0 : undefined }}
        >
          {rentals.length === 0 ? (
            <EmptyState
              title="No rentals to show"
              description={
                client.totalRentalsCount > 0
                  ? `This client has ${client.totalRentalsCount} lifetime rental(s), but only bookings still listed in activeBookings can be cross-referenced from this seed data.`
                  : 'This client has no rental history yet.'
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th style={th}>Booking</th>
                    <th style={th}>Project</th>
                    <th style={th}>Status</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Amount</th>}
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((r) => (
                    <tr key={r.bookingNo} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>
                        <span className="identifier" style={{ color: 'var(--link)', fontWeight: 600 }}>{r.bookingNo}</span>
                      </td>
                      <td style={td}>{r.project}</td>
                      <td style={td}>
                        <Tone text={r.status} tone={r.statusKey} />
                        {r.statusNote && <span style={{ marginLeft: 6, color: 'var(--danger-text)', fontSize: 'var(--t-th)' }}>{r.statusNote}</span>}
                      </td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right' }}>
                          {r.amount !== undefined ? (
                            <span className="figure" style={{ fontWeight: 600 }}>{formatMoney(r.amount)}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Link to={`/rentals/${r.bookingNo}`} style={{ color: 'var(--link)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'payments' && money && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <Card title="Financial summary">
            <SummaryRows
              rows={[
                { label: 'Outstanding', value: formatMoney(client.outstandingPaisa), ...(client.outstandingPaisa > 0 ? { tone: 'danger' as const } : {}) },
                { label: 'Deposit Held', value: formatMoney(client.depositHeldPaisa) },
                { label: 'Credit Limit', value: formatMoney(client.creditLimitPaisa) },
                { label: 'Credit Used', value: formatMoney(client.creditUsedPaisa) },
                { label: 'Lifetime Spend', value: formatMoney(client.totalSpentPaisa) },
              ]}
            />
          </Card>
          {/* Cross-referenced by booking number only — see the file header note. */}
          <Card title={`Invoices (${invoices.length})`} bodyStyle={{ padding: invoices.length ? 0 : undefined }}>
            {invoices.length === 0 ? (
              <EmptyState
                title="No invoices to show"
                description="No invoice in Finance's records is linked to one of this client's active bookings."
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      <th style={th}>Invoice</th>
                      <th style={th}>Booking</th>
                      <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                      <th style={th}>Status</th>
                      <th style={th}>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>
                          <span className="identifier" style={{ fontWeight: 600 }}>{inv.id}</span>
                        </td>
                        <td style={td}>
                          <Link to={`/rentals/${inv.booking}`} className="identifier" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                            {inv.booking}
                          </Link>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span className="figure" style={{ fontWeight: 600 }}>{inv.amount}</span>
                        </td>
                        <td style={td}>
                          <Tone text={inv.status} tone={INVOICE_TOKEN[inv.status]} />
                        </td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{inv.due}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'documents' && (
        <Card title={`Documents (${documents.length})`} bodyStyle={{ padding: documents.length ? 0 : undefined }}>
          {documents.length === 0 ? (
            <EmptyState
              title="No documents on file"
              description="No document in the registry is linked to one of this client's active bookings."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th style={th}>Document</th>
                    <th style={th}>Type</th>
                    <th style={th}>Related Booking</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>{d.name}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{d.type}</td>
                      <td style={td}>
                        <Link to={`/rentals/${d.relatedTo}`} className="identifier" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                          {d.relatedTo}
                        </Link>
                      </td>
                      <td style={td}>
                        <Tone text={d.status} tone={d.recordTone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'notes' && (
        <Card title="Notes">
          {client.notes ? (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{client.notes}</p>
          ) : (
            <EmptyState title="No notes yet" description="Nothing has been written about this client." />
          )}
          <div style={{ marginTop: 12 }}>
            <Unavailable reason="Notes are not a persisted field yet — Add Client can capture one at creation, but nothing can edit it after save">
              <Button icon="plus" disabled>
                Add Note
              </Button>
            </Unavailable>
          </div>
        </Card>
      )}

      {activeTab === 'activity' && (
        <Card title="Client facts">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name="checklist" size={14} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 2 }} />
              KYC {client.kycStatus} · {client.kycDocsCount} document{client.kycDocsCount === 1 ? '' : 's'} on file
            </li>
            <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name={client.currentRentalsCount > 0 ? 'truck' : 'dot'} size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
              {client.currentRentalsCount > 0 ? `${client.currentRentalsCount} rental(s) currently active` : 'No active rentals'}
            </li>
            <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name="calendar" size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
              {client.lastRentalBs === '—' ? 'No rental history yet' : `Last rental ${client.lastRentalBs} BS (${client.lastRentalAd})`}
            </li>
            {client.isBlocked && (
              <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                <Icon name="alert_triangle" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                Blocked — {client.blockReason}
              </li>
            )}
          </ul>
          <p style={{ margin: '14px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            This is derived from fields already on the record, not an audit trail. `lib/audit.ts` exists
            but nothing calls `logAuditEvent` for client records yet — a real timeline needs that wired
            up first, not fabricated here.
          </p>
        </Card>
      )}

      <FooterNote extra={['Clients are never deleted — a closed account is retained and marked']} />

      <Modal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        title="Block this client?"
        subtitle="Blocked clients cannot start a new rental until unblocked. State a reason — it appears on their profile."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowBlockModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmBlock} disabled={blockReasonDraft.trim().length < 10}>
              Block Client
            </Button>
          </div>
        }
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Reason (minimum 10 characters)</span>
          <textarea
            value={blockReasonDraft}
            onChange={(e) => setBlockReasonDraft(e.target.value)}
            rows={3}
            placeholder="e.g. Outstanding overdue more than 60 days without dispute"
            style={{
              padding: 10,
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </label>
      </Modal>
    </div>
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
