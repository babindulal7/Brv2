import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { TouchTarget } from '../../components/ui/TouchTarget'
import { EmptyState } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { Badge } from '../../components/ui/Badge'
import type { StatusKey } from '../../lib/status'
import {
  type PRStatus,
  type PRPriority,
  type PurchaseRequest,
} from '../../data/purchaseRequests'
import { usePurchaseRequests } from '../../lib/queries/purchaseRequests'
import { PageBody } from '../../components/ui/PageBody'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { captureError } from '../../lib/monitoring'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import type { ActionContext } from '../../actions/core'
import { CreatePurchaseRequestModal } from './modals/CreatePurchaseRequestModal'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'

/**
 * The three decisions this screen can take on a purchase request.
 *
 * Deliberately narrower than `PRStatus`: the handler used to accept the whole
 * status union and cast it (`newStatus as 'Approved' | 'Rejected' | 'Ordered'`)
 * at the dispatch, so any status could reach an action that accepts only these
 * three. The cast is gone and the type carries the constraint instead.
 */
type PRDecision = 'Approved' | 'Rejected' | 'Ordered'

/**
 * Law 12 — **the** inline error line for this screen. Toasts in this codebase
 * are success-only (`useToast()` exposes `showSuccessToast` and nothing else),
 * so a refused or failed decision has exactly one honest place to be reported,
 * and it is beside the buttons that raised it. Same shape as
 * `rentals/NewRental.tsx`'s `inlineErrorStyle`.
 */
const inlineErrorStyle = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--danger-text)',
  lineHeight: 1.4,
} as const

/* ── The two §4 hue maps this screen paints from ─────────────────────────────
 *
 * These replace `PRIORITY_COLORS` and `STATUS_COLORS`, two hand-built
 * `{ bg, text }` tables that were rebuilt inside the component on every render
 * and that got the pairing wrong three times over. Because they held raw
 * values rather than a `StatusKey`, nothing could tell them that the ink they
 * chose did not belong to the fill they chose:
 *
 *  - **`High`** was `--danger-text` (RED ink) on `--st-out-bg` (the ORANGE
 *    fill). Red on orange, and doubly wrong: the hue said "out with the
 *    client" about a purchase request that has not been raised yet.
 *  - **`Rejected`** was the same red-on-orange pair.
 *  - **`Ordered`** was `--orange-text` on `--st-out-bg` — and `--orange-text`
 *    is not orange: theme.css:367 aliases it to `--ready-text`, YELLOW, as
 *    part of spec §11's legacy remap. So the one chip whose author explicitly
 *    reached for "orange ink" got yellow ink on an orange fill.
 *
 * All three were unreadable, and all three came from the same root cause —
 * §3.2 makes the on-colour "part of the token, not a screen choice", and a
 * `{ bg, text }` table is precisely the shape that hands the screen that
 * choice. Naming the HUE and letting `<Badge>` resolve the pair removes it.
 *
 * The hues, per §4's meanings:
 *
 *  Priority is the money traffic light §4 already uses (green settled · yellow
 *  partway · red decide now): **High red** ("problem · decide now" — the whole
 *  point of a High PR is that somebody must act), Medium yellow, Low green.
 *
 *  Status follows the lifecycle: **Draft gray** ("not started yet" — it was
 *  `--hover`, which is a HOVER surface and not a status colour at all),
 *  **Submitted yellow** (waiting on a decision), **Approved blue**
 *  ("committed · scheduled" — it was green, which reads as *settled*, and an
 *  approved PR is a commitment, not a delivery: the gear has not arrived and
 *  painting it the same green as Received made the two ends of the chain
 *  identical at a glance), **Ordered yellow** (waiting again, now on the
 *  supplier), **Received green** (home & ready — the one green this list has
 *  earned), **Rejected red**, **Cancelled dim** ("finished · inactive").
 */
const PRIORITY_TONE: Record<PRPriority, StatusKey> = {
  High: 'danger',
  Medium: 'progress',
  Low: 'in',
}

/**
 * Priority as **ink on a surface**, for the one place the detail panel prints
 * the priority score as a figure rather than a block. A block's `-fg` is its
 * on-colour and would be white on `--card`; these are the text-safe hues.
 */
const PRIORITY_INK: Record<PRPriority, string> = {
  High: 'var(--danger-text)',
  Medium: 'var(--progress-text)',
  Low: 'var(--success-text)',
}

const STATUS_TONE: Record<PRStatus, StatusKey> = {
  Draft: 'neutral',
  Submitted: 'progress',
  Approved: 'primary',
  Ordered: 'progress',
  Received: 'in',
  Rejected: 'danger',
  Cancelled: 'dim',
}

/**
 * ⛔ Law 6 — **this screen had no money gate at all.** It imported `formatMoney`
 * and printed six separate rupee figures (the KPI strip, the Total Cost column,
 * Est Unit Cost, Total Cost, the sub-rental total and every sub-rental's cost)
 * while importing neither `useCanViewMoney` nor `canViewMoney`. A Warehouse,
 * Technician or Driver session opening Purchase Requests read what the fleet
 * costs to buy and what we pay competitors to sub-rent from — the exact figures
 * the database masks at column level for those roles, handed over by the UI.
 *
 * The screen is **not** hidden wholesale from the floor. A purchase request
 * carries real non-money content — what was asked for, how much of it, who
 * raised it, why (refused bookings, sub-rental events), and where it is in the
 * approval chain — and a warehouse keeper is a legitimate reader of all of that.
 * So each figure is **omitted**, never blurred or zeroed, in the established
 * pattern (`today/MovementList.tsx`, `clients/DuplicateCenter.tsx`), and where a
 * column or tile is nothing but money it is dropped rather than left empty.
 *
 * `RestrictedState` was considered and rejected for that reason: locking the
 * floor out of a request list would remove more than Law 6 asks for.
 */

/**
 * Which KPI tiles carry rupees.
 *
 * `PURCHASE_REQUEST_KPIS` keeps its figures as free text — `value: 'NPR 320,000'`,
 * `change: 'NPR 845,000 total'` — with no typed amount and no `money` flag to
 * read, and `data/purchaseRequests.ts` is not this screen's to change. So the
 * tile's own text is scanned for a currency token: the whole tile is dropped
 * when its headline figure is money, and the sub-line alone is dropped when only
 * the sub-line is.
 *
 * A scan rather than a hardcoded list of tile labels on purpose — a list stops
 * matching the moment the seed is reworded, and it fails in the direction of
 * putting rupees back in front of the floor. The real fix is a typed
 * `amount: Paisa` + flag on the KPI record, which belongs to the data module.
 */
const CURRENCY_TOKEN = /\bNPR\b|\bRs\.?\b|₹/i
const isMoneyText = (text: string) => CURRENCY_TOKEN.test(text)

export default function PurchaseRequests() {
  const { user } = useAuth()
  const money = useCanViewMoney()
  const online = useNetwork()
  const [activeTab, setActiveTab] = useState<'All' | 'Draft' | 'Submitted' | 'Approved' | 'Ordered' | 'Received'>('All')
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCreatePrOpen, setIsCreatePrOpen] = useState(false)

  /*
   * The rows, from the database.
   *
   * `requestsList` stays local state rather than being read straight off the
   * query, because two things write to it optimistically: the decision flow
   * below, and the `PURCHASE_REQUEST_UPDATED` event a sibling screen emits. Both
   * predate this wiring and both are correct — a decision that has already come
   * back from Postgres should show immediately. The effect re-seeds from the
   * query whenever it resolves, so a refetch is the source of truth and the
   * optimistic copy is only ever ahead of it, never instead of it.
   */
  const requests = usePurchaseRequests()
  const [requestsList, setRequestsList] = useState<PurchaseRequest[]>([])
  useEffect(() => {
    setRequestsList(requests.rows)
  }, [requests.rows])

  /*
   * §1 — derived at render from the rows on screen, never a stored figure. The
   * seeded `PURCHASE_REQUEST_KPIS` counted a literal array; these count what the
   * database actually returned, so an approval moves the tiles.
   */
  const kpis = useMemo(() => {
    const countByStatus = (status: PRStatus) => String(requestsList.filter((r) => r.status === status).length)
    return [
      { label: 'Draft Requests', value: countByStatus('Draft'), change: 'Accumulating evidence', icon: 'file' as IconName, accent: 'blue' as const },
      { label: 'Pending Approval', value: countByStatus('Submitted'), change: 'Awaiting a decision', icon: 'queues' as IconName, accent: 'amber' as const },
      { label: 'Approved / In Flight', value: countByStatus('Approved'), change: 'Cleared to purchase', icon: 'check' as IconName, accent: 'green' as const },
    ]
  }, [requestsList])

  useDomainEvent<PurchaseRequest>(EVENT_TYPES.PURCHASE_REQUEST_UPDATED, (payload) => {
    if (payload?.id && payload?.fleetItemName) {
      setRequestsList((prev) => [payload, ...prev.filter((p) => p.id !== payload.id)])
    }
  })

  const activePR = useMemo(() => {
    return requestsList.find((pr) => pr.id === selectedPrId) ?? null
  }, [selectedPrId, requestsList])

  const filteredPRs = useMemo(() => {
    if (activeTab === 'All') return requestsList
    return requestsList.filter((pr) => pr.status === activeTab)
  }, [activeTab, requestsList])

  /** Selecting another request (or closing the panel) drops the error the last
   *  decision left behind — it belongs to the PR it was raised on, not the next one. */
  const selectPr = (id: string | null) => {
    setSelectedPrId(id)
    setActionError(null)
  }

  /**
   * No session, no dispatch — and never a substituted identity. Same shape as
   * `rentals/NewRental.tsx`'s `dispatchContext()` and `today/MovementList.tsx`'s
   * `runMovementAction`.
   *
   * `isOnline` is passed because this screen knows it and `lib/rbac` degrades
   * several approvals offline; omitting it lets `ActionContext` default to
   * online in `actions/core.ts`, which is the fail-OPEN direction. Same as
   * `clients/DuplicateCenter.tsx`.
   */
  const dispatchContext = (): ActionContext | null =>
    user ? { userId: user.id, role: user.role, isOnline: online } : null

  /**
   * Law 8 — one idempotency key per decision-on-a-request, minted on the first
   * press and reused across every retry of it (`blockKeys` ref pattern,
   * `clients/ClientsDirectory.tsx:325`), so a replayed Approve records once.
   * Cleared when the decision lands; a later, different decision (Approve →
   * Mark as Ordered) keys separately.
   */
  const decisionKeys = useRef(new Map<string, string>())

  /**
   * ⛔ This used to write `newStatus` into `requestsList` **first**, then fire
   * `approvePurchaseRequest` with no `ActionContext`, no `.catch()` and no
   * rollback. A manager approving a Rs 1,200,000 request watched the row turn
   * green and read "Approved" while nothing was written anywhere: procurement
   * never saw the decision, the manager considered it made and communicated,
   * and there was no error left behind to find later.
   *
   * The row still moves **only** on the resolved path, and a failure lands in
   * the inline error line beside the buttons. `approvePurchaseRequest` now
   * UPDATEs `purchase_requests` by `pr_no` — but this register is a seed array
   * (`data/purchaseRequests.ts`) whose PR numbers exist in no database, so on
   * today's data the action resolves nothing and refuses with a sentence
   * saying exactly that. Honest refusal until a PR intake writes real rows;
   * the moment the register reads `purchase_requests`, these buttons record
   * real decisions with no further change here.
   *
   * The permission is mapped and finance-tier: `purchase.approve` →
   * `canApprovePurchase` (Owner, Admin, Manager, Coordinator, Accounts),
   * mirroring `purchase_requests_approval_rank` since 0064 went live on
   * 23 Aug 2026 — the dispatcher refuses Driver/Technician/Warehouse before
   * anything observable, and the database refuses them independently. The
   * §4.29 breadth this comment used to document is closed.
   */
  const handleStatusChange = (id: string, newStatus: PRDecision) => {
    const verb = newStatus.toLowerCase()
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError(
        `Not ${verb} — you are not signed in, so this decision cannot be attributed to anyone. Sign in and try again.`,
      )
      return
    }
    const pr = requestsList.find((r) => r.id === id)
    if (!pr) {
      setActionError(`Not ${verb} — this request is no longer on the list.`)
      return
    }
    const keyId = `${id}:${newStatus}`
    const clientUuid = decisionKeys.current.get(keyId) ?? newClientUuid()
    decisionKeys.current.set(keyId, clientUuid)
    setActionError(null)
    void import('../../actions/inventory/approvePurchaseRequest')
      .then((m) => m.approvePurchaseRequest({ prNo: pr.prNo, decision: newStatus, clientUuid }, ctx))
      .then((res) => {
        decisionKeys.current.delete(keyId)
        setRequestsList((prev) => prev.map((r) => (r.id === id ? { ...r, status: res.status } : r)))
        /* The optimistic line above is what the operator sees immediately; this
           is what makes it true. Without it the row keeps a status this screen
           decided rather than one Postgres confirmed. */
        requests.refetch()
      })
      .catch((err: unknown) => {
        captureError(err, { where: 'PurchaseRequests.decide', verb })
        setActionError(`Not ${verb} — ${err instanceof Error ? err.message : String(err)}`)
      })
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 60 }}>
      {/* Header & Metrics */}
      <PageHeader
        title="Purchase Requests"
        description="Data-driven equipment acquisition workflows based on turnaways and sub-rental evidence."
        actions={
          /*
           * Both of these had no `onClick`, no destination and nothing behind
           * them — a primary button with a plus icon that did nothing when
           * pressed. Kept and stated as unavailable, in the same
           * `Unavailable`-with-a-reason idiom `inventory/Warehouses.tsx` uses
           * for Add Warehouse / Print Labels / Refresh, rather than removed:
           * the reason is the useful part (there is no PR intake route in
           * `App.tsx`, and the status tabs below are the filtering this screen
           * actually has), and a silently missing control teaches nothing.
           */
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            <Unavailable reason="Filter is not built — the status tabs below are the only filter on this screen.">
              <Button variant="secondary" icon={<Icon name="file" size={14} />} disabled>
                Filter
              </Button>
            </Unavailable>
            <Button variant="primary" icon={<Icon name="plus" size={14} />} onClick={() => setIsCreatePrOpen(true)}>
              New Draft PR
            </Button>
          </div>
        }
      />

      {/* Law 6 — a tile whose headline figure is money is dropped outright for a
          money-blind session (Sub-Rent Cost Avoidance is nothing but rupees);
          one whose sub-line alone carries money keeps its count and loses the
          sub-line (Pending Approval stays "2", without "NPR 845,000 total").
          The grid is auto-fit, so the row closes up rather than leaving a hole. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {kpis.filter((kpi) => money || !isMoneyText(kpi.value)).map((kpi) => (
          <div key={kpi.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--r-xs)',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--hover)',
                  color: 'var(--nav-active-accent)',
                }}
              >
                <Icon name={kpi.icon} size={15} />
              </span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div className="figure" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', marginTop: 'var(--sp-sm)' }}>
              {kpi.value}
            </div>
            {(money || !isMoneyText(kpi.change)) && (
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>{kpi.change}</div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-sm)' }}>
        {(['All', 'Draft', 'Submitted', 'Approved', 'Ordered', 'Received'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r-xs)',
              background: activeTab === t ? 'var(--hover)' : 'transparent',
              color: activeTab === t ? 'var(--text)' : 'var(--text2)',
              border: `1px solid ${activeTab === t ? 'var(--nav-active-accent)' : 'transparent'}`,
              fontWeight: activeTab === t ? 700 : 500,
              fontSize: 'var(--t-meta)',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: activePR ? '1fr 420px' : '1fr', gap: 'var(--sp-lg)', alignItems: 'start' }}>
        {/* Table View */}
        <Card title={`${activeTab} Purchase Requests (${filteredPRs.length})`}>
          <PageBody
            loading={requests.loading}
            error={requests.error}
            onRetry={requests.refetch}
            hasRows={requests.rows.length > 0}
            empty={requests.isEmpty}
            noun="purchase requests"
            emptyTitle="No purchase requests yet"
            emptyMessage="Nothing has been requested. Raise one and it appears here."
          >
          {filteredPRs.length === 0 ? (
            <EmptyState
              icon={<Icon name="receipt" size={22} />}
              title={activeTab === 'All' ? 'No purchase requests yet' : `No ${activeTab.toLowerCase()} requests`}
              description={activeTab === 'All' ? 'Nothing has been requested yet.' : `Nothing is currently in the ${activeTab} stage.`}
              {...(activeTab !== 'All' ? { actionLabel: 'Show all', onAction: () => setActiveTab('All') } : {})}
            />
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px' }}>PR Number</th>
                  <th style={{ padding: '8px' }}>Equipment Item</th>
                  <th style={{ padding: '8px' }}>Qty</th>
                  <th style={{ padding: '8px' }}>Priority</th>
                  {/* Law 6 — the column is nothing but money, so it is dropped
                      entirely for a money-blind session rather than left as an
                      empty or masked column. */}
                  {money && <th style={{ padding: '8px' }}>Total Cost (Est)</th>}
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Requested By</th>
                </tr>
              </thead>
              <tbody>
                {filteredPRs.map((pr) => {
                  const isSel = pr.id === selectedPrId
                  return (
                    <tr
                      key={pr.id}
                      onClick={() => selectPr(pr.id)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSel ? 'var(--hover)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <span className="identifier" style={{ color: 'var(--nav-active-accent)', fontWeight: 600 }}>
                          {pr.prNo}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{pr.fleetItemName}</div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          {pr.reason}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{pr.requestedQty}</td>
                      <td style={{ padding: '10px 8px' }}>
                        {/* §8 step 2 — <Badge> is the one thing that paints a
                            status. The hand-built span here carried radius 4,
                            weight 700 and sentence case against §4's block
                            anatomy, and picked its own ink; see PRIORITY_TONE. */}
                        {/* Unscored is a real state, not a missing render: §6's
                            formula needs refused-booking and sub-rental evidence
                            that no table holds, so a live request has no score.
                            Saying so beats painting every one of them `Low`. */}
                        {pr.priority === null ? (
                          <span
                            title="Not scored — §6 needs refused-booking and sub-rental evidence, which nothing in this build records."
                            style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
                          >
                            Not scored
                          </span>
                        ) : (
                          <Badge tone={PRIORITY_TONE[pr.priority]} label={pr.priority} size="sm" />
                        )}
                      </td>
                      {money && (
                        <td style={{ padding: '10px 8px' }}>
                          <span className="figure" style={{ fontWeight: 600 }}>
                            {formatMoney(pr.totalEstimatedCost)}
                          </span>
                        </td>
                      )}
                      <td style={{ padding: '10px 8px' }}>
                        <Badge tone={STATUS_TONE[pr.status]} label={pr.status} size="sm" />
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ color: 'var(--text2)' }}>{pr.requestedBy.split(' ')[0]}</div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{pr.dateCreatedAD}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
          </PageBody>
        </Card>

        {/* PR Detail Flyout / Side Panel */}
        {activePR && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            <Card
              title={`PR Overview — ${activePR.prNo}`}
              action={
                <button
                  type="button"
                  onClick={() => selectPr(null)}
                  aria-label={`Close purchase request ${activePR.prNo}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', position: 'relative' }}
                >
                  <Icon name="close" size={14} />
                  <TouchTarget />
                </button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Equipment</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
                    {activePR.fleetItemName} <span style={{ color: 'var(--muted)' }}>(x{activePR.requestedQty})</span>
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Category: {activePR.category}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
                  {/* Law 6 — both cells are pure money and are omitted for a
                      money-blind session. The grid keeps Preferred Supplier and
                      Priority Score, which are the two facts on this panel a
                      warehouse keeper legitimately needs. */}
                  {money && (
                    <>
                      <div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Est Unit Cost</div>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{formatMoney(activePR.estimatedUnitCost)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Total Cost</div>
                        <div className="figure" style={{ fontWeight: 700, color: 'var(--nav-active-accent)' }}>{formatMoney(activePR.totalEstimatedCost)}</div>
                      </div>
                    </>
                  )}
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Preferred Supplier</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{activePR.suggestedSupplier || 'TBD'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Priority Score</div>
                    {activePR.priority === null ? (
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        Not scored — no refused-booking or sub-rental evidence is recorded
                      </div>
                    ) : (
                      <div className="figure" style={{ fontWeight: 700, color: PRIORITY_INK[activePR.priority] }}>
                        {activePR.priorityScore} ({activePR.priority})
                      </div>
                    )}
                  </div>
                </div>

                {/*
                  * TODO(decision) — justification notes are free text a person
                  * types, so nothing stops one reading "Rs 1,20,000 quoted" and
                  * being handed to a money-blind session by this block. None of
                  * the three seeded notes carries a figure today, so this is a
                  * latent channel, not a live leak.
                  *
                  * Left rendered rather than scrubbed: whether a note counts as
                  * money — hide the whole note, strip the amount, or restrict
                  * who may write one — is a product ruling, and the same
                  * question applies to every free-text field in the system
                  * (transfer notes, decision reasons). Guessing an answer here
                  * would set a precedent by accident.
                  */}
                {activePR.notes && (
                  <div style={{ padding: 10, background: 'var(--hover)', borderRadius: 'var(--r-xs)', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginBottom: 'var(--sp-xs)' }}>Justification Notes:</div>
                    {activePR.notes}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Acquisition Evidence (Data Room)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
                {/*
                  Stated once, above the two tables, because otherwise this panel
                  prints `0 Events` and `Rs 0` — which reads as "we looked and
                  there were none" when the truth is that nothing records it.
                  §6's priority formula wants refused bookings, sub-rental events
                  and sub-rental cost; no table or column in this build holds any
                  of the three, which is also why Priority reads `Not scored`.
                  A confident zero is the same defect as a confident `Available`.
                */}
                {activePR.priority === null && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--sp-sm)',
                      alignItems: 'flex-start',
                      padding: 'var(--sp-md)',
                      borderRadius: 'var(--r-xs)',
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      fontSize: 'var(--t-th)',
                      color: 'var(--text2)',
                    }}
                  >
                    <Icon name="info" size={14} />
                    <span>
                      No refused booking or sub-rental is recorded anywhere in this build, so the
                      counts below are <strong>not measured</strong> — they are not a finding of
                      zero. This is why the request is not scored.
                    </span>
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Refused Bookings (Losses)</div>
                    <div className="figure" style={{ color: 'var(--danger-text)', fontWeight: 700 }}>{activePR.refusedCount} Events</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-th)' }}>
                      <thead style={{ background: 'var(--hover)' }}>
                        <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Booking</th>
                          <th style={{ padding: '6px 8px' }}>Client</th>
                          <th style={{ padding: '6px 8px' }}>Shortage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePR.refusedBookings.map((rb) => (
                          <tr key={rb.bookingId} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }} className="identifier">
                              <Link to={`/rentals/${rb.bookingRef}`} style={{ color: 'var(--link)', textDecoration: 'none' }}>
                                {rb.bookingRef}
                              </Link>
                            </td>
                            <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{rb.client}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--danger-text)', fontWeight: 600 }}>-{rb.quantityShort}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  {/* Law 6 — the money-blind reading of this block is "which
                      supplier we hired this kit from, and how many times",
                      which is real acquisition evidence. What it costs us is
                      omitted: the total here, and the Cost column below. The
                      count is `subRentals.length` — the rows actually listed
                      underneath — not a second figure from elsewhere. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                      {money ? 'Sub-Rental Expenses' : 'Sub-Rentals Used'}
                    </div>
                    <div className="figure" style={{ color: 'var(--orange-text)', fontWeight: 700 }}>
                      {money
                        ? formatMoney(activePR.totalSubRentPaid)
                        : `${activePR.subRentals.length} ${activePR.subRentals.length === 1 ? 'Event' : 'Events'}`}
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-th)' }}>
                      <thead style={{ background: 'var(--hover)' }}>
                        <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Sub-Rent Ref</th>
                          <th style={{ padding: '6px 8px' }}>Supplier</th>
                          {money && <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cost</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {activePR.subRentals.map((sr) => (
                          <tr key={sr.subRentalId} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }} className="identifier">{sr.subRentalRef}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{sr.supplier}</td>
                            {money && (
                              <td style={{ padding: '6px 8px', textAlign: 'right' }} className="figure">{formatMoney(sr.costPaid)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>

            {/* Law 12 — errors are inline and persistent, never a toast. A decision
                that did not land says so here, next to the button that raised it,
                and the row keeps its real status. */}
            {actionError && (
              <p role="alert" style={inlineErrorStyle}>
                <Icon name="error" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                {actionError}
              </p>
            )}

            {/* Approvals Block */}
            {activePR.status === 'Submitted' && (
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-xs)' }}>
                <Button variant="secondary" onClick={() => handleStatusChange(activePR.id, 'Rejected')} style={{ flex: 1, color: 'var(--danger-text)' }}>
                  Reject PR
                </Button>
                <Button variant="primary" icon={<Icon name="check" size={14} />} onClick={() => handleStatusChange(activePR.id, 'Approved')} style={{ flex: 1 }}>
                  Approve Purchase
                </Button>
              </div>
            )}
            {activePR.status === 'Approved' && (
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-xs)' }}>
                <Button variant="primary" icon={<Icon name="truck" size={14} />} onClick={() => handleStatusChange(activePR.id, 'Ordered')} style={{ flex: 1 }}>
                  Mark as Ordered
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <CreatePurchaseRequestModal
        isOpen={isCreatePrOpen}
        onClose={() => setIsCreatePrOpen(false)}
        onSuccess={(newPr: PurchaseRequest) => {
          setRequestsList((prev) => [newPr, ...prev])
        }}
      />
    </div>
  )
}
