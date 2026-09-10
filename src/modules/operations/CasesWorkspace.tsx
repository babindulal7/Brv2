import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { Badge } from '../../components/ui/Badge'
import Icon from '../../components/ui/Icon'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatBsOrAd } from '../../lib/bs'
import { useViewport } from '../../lib/device'
import {
  listCases,
  CASES,
  findClientIdByBooking,
  CASE_STATUS_META,
  CASE_PRIORITY_META,
  CASE_WORKSPACE_ROUTE,
  statusCounts,
  openCasesCount,
  awaitingDecisionCount,
  exposurePaisa,
  recoveredThisMonthPaisa,
  outstandingOf,
  ageDays,
  CASES_EXPORT_UNAVAILABLE_REASON,
  NEW_CASE_UNAVAILABLE_REASON,
  type Case,
  type CaseStatus,
  type CasePriority,
} from '../../lib/queries/cases'
import { IconSearch, IconPlus, IconDownload } from '@tabler/icons-react'
import { LogCaseModal } from './modals/LogCaseModal'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'

/* Age comes from the shared `ageDays` in `data/cases.ts`, computed against the
 * one operating day (`getBusinessToday()` in `lib/bs.ts`). This file used to
 * carry its own frozen clock — §11 of Foundation exists to stop exactly that:
 * the age a case shows here and the age the escalation rules read must be the
 * same number. */

/**
 * The two status renderers this screen used to hand-roll, now delegating to
 * <Badge> — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one component rendering the
 * §4 map from lib/status; every screen inherits."
 *
 * They replace `getPriorityColor()` and `getStatusColor()`, two switches that
 * returned raw CSS variables and painted a coloured DOT beside coloured TYPE.
 * §4 has no such treatment — every status is a solid block — but the deeper
 * problem was that they were a SECOND opinion. `data/cases.ts` already owns
 * the Cases vocabulary in `CASE_STATUS_META` / `CASE_PRIORITY_META`, which the
 * sibling `CasesQueue.tsx` reads, and the two opinions disagreed:
 *
 *  - **Low** was `var(--info)` (blue) here. The meta moved it to gray for a
 *    documented reason recorded at `data/cases.ts:158` — green/blue "reads as
 *    good" on a priority column, which is not what low priority means.
 *  - **Closed** was `var(--good)` (green) here and gray in the meta. §2 gives
 *    green one meaning — "home & ready / settled" — and a closed case is
 *    neither; it is over.
 *  - **In Progress** was blue in both, but only the meta carries the `solid`
 *    flag that separates it from Under Review, which is blue too.
 *
 * Rather than fix three colours in a switch that would drift again, both
 * wrappers now read the same meta the queue reads. One vocabulary, two
 * screens; a hue can no longer mean one thing in the list and another in the
 * workspace.
 */
function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const m = CASE_STATUS_META[status]
  return <Badge tone={m.token} label={status} icon={<Icon name={m.icon} size={11} fill={m.solid === true} />} size="sm" />
}

function CasePriorityBadge({ priority }: { priority: CasePriority }) {
  const m = CASE_PRIORITY_META[priority]
  return <Badge tone={m.token} label={priority} icon={<Icon name={m.icon} size={11} fill={m.solid === true} />} size="sm" />
}

/**
 * The BS date where the engine can name one, the **English date** otherwise.
 * This returned `'—'` outside the BS table, which claimed the case had no
 * opened-on date at all when the AD instant was in hand — see `lib/bs.ts`
 * `formatBsOrAd`, which is the one place that rule lives.
 */
function createdBsOf(c: Case): string {
  return formatBsOrAd(c.openedAd)
}


type FilterKey = CaseStatus | 'All'

/* §5.1 — the URL is the state. `?status=` carries the chip and `?q=` the
 * search, so a filtered view is linkable, shareable, and survives a reload —
 * the OperationsQueues `patch()` pattern. `Cancelled` is mapped even though no
 * chip renders it (a declared `CaseStatus` a bookmarked URL may still name);
 * anything unrecognised falls back to All rather than silently matching
 * nothing. */
const STATUS_URL_KEY: Record<Exclude<FilterKey, 'All'>, string> = {
  Open: 'open',
  'In Progress': 'in-progress',
  'Under Review': 'under-review',
  'Awaiting Decision': 'awaiting-decision',
  Resolved: 'resolved',
  Closed: 'closed',
  Cancelled: 'cancelled',
}

function statusFromParam(value: string | null): FilterKey {
  if (!value) return 'All'
  for (const [status, key] of Object.entries(STATUS_URL_KEY) as [Exclude<FilterKey, 'All'>, string][]) {
    if (key === value) return status
  }
  return 'All'
}

export function CasesWorkspace({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const viewport = useViewport()
  const phone = viewport === 'phone'

  const [params, setParams] = useSearchParams()
  /*
   * `/inventory/cases/:id` — the URL names one case. The per-case workspace
   * has no field list yet (`CASE_WORKSPACE_ROUTE` in data/cases.ts, §10), so
   * until it does this route is the queue narrowed to that one row, and says
   * so. It used to render the full list and ignore the id entirely — the URL
   * lied (TODO_SWEEP_2026-09-02.md A5).
   */
  const { id: routeCaseId } = useParams<{ id?: string }>()
  const searchQuery = params.get('q') ?? ''
  const activeFilter = statusFromParam(params.get('status'))
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [isLogCaseOpen, setIsLogCaseOpen] = useState(false)
  const [casesList, setCasesList] = useState<Case[]>(() => [...CASES])

  useEffect(() => {
    let mounted = true
    listCases().then((res) => {
      if (mounted && res.rows.length > 0) {
        setCasesList(res.rows)
      }
    }).catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  /**
   * **RS-09 — one row per case id, however many times this screen is told
   * about the case.**
   *
   * `LogCaseModal` announces a new case TWICE, from one press: it awaits
   * `DomainEvents.emit(DISCREPANCY_FLAGGED, { case: newCase })`, which
   * `EventBus.emit` hands to its subscribers synchronously — it calls every
   * handler in a `handlers.map(...)` and only then awaits what they returned
   * (`events/eventBus.ts`) — and then calls `onSuccess(newCase)` with the same
   * object (`modals/LogCaseModal.tsx`, the `emit` and the `onSuccess` in one
   * `handleSubmit`). The subscriber below rejected the repeat; the `onSuccess`
   * append did not, so the second copy landed under the SAME `c.id` — two
   * `<tr>`s sharing one React key, and one extra case in every figure derived
   * from this list.
   *
   * **What actually happens on that second write, since Law 8 is the frame:**
   * nothing reaches the data layer at all. There is no case-creation action
   * (`NEW_CASE_UNAVAILABLE_REASON`, `data/cases.ts`), neither path carries a
   * `client_uuid`, and no INSERT is attempted — so the unique-key rejection
   * that Law 8 relies on never gets the chance to run, and the duplicate is
   * only ever a screen fact. Rejecting it is this screen's job for as long as
   * the list is local, which is what this helper does: both notifications go
   * through it, and a case already in the list is replaced, not repeated.
   *
   * Neither opener is reachable today — both `Log Incident` and `Export` are
   * `disabled` inside `<Unavailable>` below — so this is a latent defect that
   * arms itself the moment the action exists, not a live one.
   */
  const upsertCase = (next: Case) =>
    setCasesList((prev) => [next, ...prev.filter((c) => c.id !== next.id)])

  useDomainEvent<{ case?: Case }>(EVENT_TYPES.DISCREPANCY_FLAGGED, (payload) => {
    if (payload?.case) upsertCase(payload.case)
  })

  /* Merge-write one or more params; `null` deletes a key. `replace: true`
   * keeps chip flicks and search keystrokes out of the history stack
   * (OperationsQueues.tsx patch()). */
  const patch = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    /* A chip flick or a keystroke while the URL names one case is a request
       for the queue again — leave the single-case view rather than filtering
       inside it, where every chip but one would show nothing. */
    if (routeCaseId) {
      navigate({ pathname: '/inventory/cases', search: merged.toString() ? `?${merged}` : '' }, { replace: true })
      return
    }
    setParams(merged, { replace: true })
  }

  const setActiveFilter = (f: FilterKey) => patch({ status: f === 'All' ? null : STATUS_URL_KEY[f] })
  const setSearchQuery = (q: string) => patch({ q: q || null })

  const filteredCases = useMemo(() => {
    return casesList.filter((c) => {
      if (routeCaseId) return c.id === routeCaseId
      if (activeFilter !== 'All' && c.status !== activeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const equipNames = Array.isArray(c.equipment)
          ? c.equipment.map((e) => e.name + ' ' + e.serial).join(' ')
          : ''
        return (
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.counterpartyName.toLowerCase().includes(q) ||
          c.linked.linkedRecordId.toLowerCase().includes(q) ||
          equipNames.toLowerCase().includes(q)
        )
      }
      return true
    })
    /* `casesList` was missing here: a case logged through the domain event
       above landed in state but not on screen until a chip was flicked. */
  }, [casesList, routeCaseId, searchQuery, activeFilter])

  /**
   * **RS-09 — the strip, the chips and the table now count the same array.**
   *
   * The KPIs called `openCasesCount()` / `awaitingDecisionCount()` /
   * `exposurePaisa()` / `recoveredThisMonthPaisa()` with no argument and the
   * chips read the module-level `STATUS_COUNTS`, and every one of those closes
   * over the frozen `CASES` seed — `STATUS_COUNTS` is literally
   * `statusCounts()` evaluated at import (`data/cases.ts:882`), and each
   * helper defaults its parameter to `CASES`. So a case added to state
   * appeared in the table below while every figure above it stayed at the seed
   * number: the screen contradicted itself in one glance.
   *
   * `data/cases.ts` already wrote each of these to take the list to count
   * (`cases: Case[] = CASES`) for exactly this reason — the default was the
   * convenience, not the contract. Passing `casesList` is all that was needed;
   * no formula is restated here (Law 1).
   */
  const counts = useMemo(
    () => ({
      total: casesList.length,
      byStatus: statusCounts(casesList),
      open: openCasesCount(casesList),
      awaitingDecision: awaitingDecisionCount(casesList),
      exposure: exposurePaisa(casesList),
      recoveredThisMonth: recoveredThisMonthPaisa(casesList),
    }),
    [casesList],
  )

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredCases.map((c) => c.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* The one `<h1>` on the route — this screen opened straight on the KPI
          strip, the only queue in the app without a title landmark (A7). */}
      {!embedded && (
        <PageHeader
          title="Cases"
          description="Damage, loss and discrepancy cases across bookings — the queue, its exposure, and what has been recovered."
        />
      )}

      {routeCaseId && (
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <Icon name="info" size={18} style={{ color: 'var(--text2)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                Showing case <span className="identifier">{routeCaseId}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', maxWidth: '70ch', lineHeight: 1.5 }}>
                The per-case workspace has no field list yet, so this address shows the queue narrowed to
                the one case it names. The other rows are hidden here, not gone.
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate('/inventory/cases')}>
              Show all cases
            </Button>
          </div>
        </Card>
      )}

      {/* KPIs — derived from the list the table renders, never hand-typed
          (§3 / AUDIT_FINDINGS P1 #13) and never from the frozen seed (RS-09). */}
      <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, 1fr)' : (money ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)'), gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Open Cases
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>
            {counts.open}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            All active & unresolved
          </span>
        </Card>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Awaiting Decision
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ready-text)', marginTop: 'var(--sp-xs)' }}>
            {counts.awaitingDecision}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Ready for manager review
          </span>
        </Card>
        {money && (
          <Card padding="md">
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Exposure
            </span>
            <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 'var(--sp-xs)' }}>
              {formatMoney(counts.exposure)}
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
              Assessed value of open cases
            </span>
          </Card>
        )}
        {money && (
          <Card padding="md">
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Recovered This Month
            </span>
            <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--good)', marginTop: 'var(--sp-xs)' }}>
              {formatMoney(counts.recoveredThisMonth)}
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
              Charged, claimed, and settled
            </span>
          </Card>
        )}
      </div>

      {/* Toolbar & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-md)' }}>
        <div
          className="rsp-chip-scroll"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            flexWrap: phone ? 'nowrap' : 'wrap',
            overflowX: phone ? 'auto' : 'visible',
            width: phone ? '100%' : undefined,
            paddingBottom: phone ? 4 : 0,
          }}
        >
          {([
            { label: 'All', count: counts.total },
            { label: 'Open', count: counts.byStatus['Open'] },
            { label: 'In Progress', count: counts.byStatus['In Progress'] },
            { label: 'Under Review', count: counts.byStatus['Under Review'] },
            { label: 'Awaiting Decision', count: counts.byStatus['Awaiting Decision'] },
            { label: 'Resolved', count: counts.byStatus['Resolved'] },
            { label: 'Closed', count: counts.byStatus['Closed'] },
          ] as const).map((chip) => (
            <button
              key={chip.label}
              onClick={() => setActiveFilter(chip.label as FilterKey)}
              style={{
                minHeight: 44,
                padding: '0 14px',
                borderRadius: 'var(--r-modal)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: activeFilter === chip.label ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                background: activeFilter === chip.label ? 'var(--nav-active-accent)' : 'var(--card)',
                color: activeFilter === chip.label ? 'var(--on-primary)' : 'var(--text)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {chip.label} <span className="figure" style={{ opacity: 0.85, marginLeft: 'var(--sp-xs)' }}>{chip.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: phone ? '100%' : 'auto' }}>
          <div style={{ flex: phone ? 1 : undefined, width: phone ? undefined : 240 }}>
            <Input
              placeholder="Search ID, title, client…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>
          {/* Both were success-toasts for work that never happened — the exact
              fabrication src/actions/core.ts §1 names. Unbuilt renders as
              Unavailable with the honest sentence, never as a fake success. */}
          {!phone && (
            <Unavailable reason={CASES_EXPORT_UNAVAILABLE_REASON}>
              <Button variant="secondary" icon={<IconDownload size={16} />} disabled>
                Export
              </Button>
            </Unavailable>
          )}
          {/* RS-06 — LogCaseModal mints CASE-2026-${random}, writes nothing and
              closes as a success. Until a case-creation action exists the
              opener is Unavailable with the reason data/cases.ts already
              states; the modal stays mounted below, unreachable from here. */}
          {!phone && (
            <Unavailable reason={NEW_CASE_UNAVAILABLE_REASON}>
              <Button variant="primary" icon={<IconPlus size={16} />} disabled onClick={() => setIsLogCaseOpen(true)}>
                Log Incident
              </Button>
            </Unavailable>
          )}
        </div>
      </div>

      {/* Main Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {filteredCases.length === 0 ? (
          <EmptyState
            title={routeCaseId ? `No case matches ${routeCaseId}` : 'No cases found'}
            description={
              routeCaseId
                ? 'Nothing in the queue carries this case ID. It may have been renumbered, or the link that brought you here is stale.'
                : 'Adjust your filters or search query to find incident cases.'
            }
            actionLabel={routeCaseId ? 'Show all cases' : 'Clear Filters'}
            onAction={() => (routeCaseId ? navigate('/inventory/cases') : patch({ status: null, q: null }))}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ width: 36, padding: '12px 14px' }}>
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === filteredCases.length && filteredCases.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px', cursor: 'pointer' }}>Case ID</th>
                  <th style={{ padding: '12px 14px' }}>Incident Detail</th>
                  <th style={{ padding: '12px 14px' }}>Counterparty & Links</th>
                  <th style={{ padding: '12px 14px' }}>Priority</th>
                  <th style={{ padding: '12px 14px' }}>Status & Disposition</th>
                  {money && <th style={{ padding: '12px 14px' }}>Financial Impact</th>}
                  <th style={{ padding: '12px 14px' }}>Age</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.1s ease' }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(c.id)}
                        onChange={() => handleToggleRow(c.id)}
                        style={{ accentColor: 'var(--nav-active-accent)' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{c.id}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.owner}</div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 280 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {c.type}
                        </span>
                      </div>
                      <div style={{ fontWeight: 500, color: 'var(--text)', marginTop: 'var(--sp-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.title}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {(() => {
                          const clientId = findClientIdByBooking(c.linked.linkedRecordId)
                          return clientId ? (
                            <Link to={`/clients/${clientId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {c.counterpartyName}
                            </Link>
                          ) : (
                            c.counterpartyName
                          )
                        })()}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 'var(--sp-xs)' }}>
                        <Link to={`/rentals/${c.linked.linkedRecordId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          <span className="figure" style={{ fontSize: 11, color: 'var(--info)' }}>{c.linked.linkedRecordId}</span>
                        </Link>
                        {Array.isArray(c.equipment) && c.equipment.length > 0 && (
                          <span className="figure" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {c.equipment[0]?.serial}{c.equipment.length > 1 ? ` +${c.equipment.length - 1}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <CasePriorityBadge priority={c.priority} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <CaseStatusBadge status={c.status} />
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.disposition ?? '—'}</div>
                    </td>
                    {money && (
                      <td style={{ padding: '12px 14px' }}>
                        <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {formatMoney(c.assessedPaisa)}
                        </div>
                        <div className="figure" style={{ fontSize: 11, color: outstandingOf(c) > 0 ? 'var(--bad)' : 'var(--muted)', marginTop: 2 }}>
                          {outstandingOf(c) > 0 ? `${formatMoney(outstandingOf(c))} Due` : 'Settled'}
                        </div>
                      </td>
                    )}
                    <td style={{ padding: '12px 14px' }}>
                      <div className="figure" style={{ fontWeight: 500, color: ageDays(c.openedAd) > 14 ? 'var(--ready-text)' : 'var(--text)' }}>
                        {ageDays(c.openedAd)} Days
                      </div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {createdBsOf(c)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button variant="secondary" size="sm" onClick={() => navigate(CASE_WORKSPACE_ROUTE(c.id))}>
                        Open Case
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LogCaseModal
        isOpen={isLogCaseOpen}
        onClose={() => setIsLogCaseOpen(false)}
        onSuccess={(newCase: Case) => upsertCase(newCase)}
      />
    </div>
  )
}
