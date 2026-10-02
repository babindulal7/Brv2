import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, PageHeader, Button } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/StateViews'
import { ListControlRow, ListWorkspace } from '../../components/ui/ListWorkspace'
import { Pagination } from '../../components/ui/Pagination'
import { SearchInput } from '../../components/ui/SearchInput'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { listMembers, type MemberListRow } from '../../lib/queries/membership'
import type { MembershipTier } from '../../lib/queries/clients'
import './clients.css'

const PAGE_SIZES = [10, 25, 50] as const
const TABS = ['Clients', 'Membership', 'Referral', 'Credit'] as const
type Sort = 'name' | 'joined-newest' | 'joined-oldest' | 'plan'

/** Current membership records, with every displayed fact read from a live view. */
export default function Membership({ embedded = false, filtersOpen: externalFiltersOpen, onFiltersClose }: { embedded?: boolean; filtersOpen?: boolean; onFiltersClose?: () => void } = {}) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const money = useCanViewMoney()
  const search = params.get('mq') ?? ''
  const selectedLevel = params.get('ml') ?? ''
  const sort = (['name', 'joined-newest', 'joined-oldest', 'plan'].includes(params.get('ms') ?? '')
    ? params.get('ms') : 'name') as Sort
  const view = params.get('mv') === 'cards' ? 'cards' : 'table'
  const [members, setMembers] = useState<MemberListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [internalFiltersOpen, setInternalFiltersOpen] = useState(false)
  const [selectedKind, setSelectedKind] = useState('')
  const filtersOpen = externalFiltersOpen ?? internalFiltersOpen
  const closeFilters = onFiltersClose ?? (() => setInternalFiltersOpen(false))

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    listMembers()
      .then((rows) => { if (active) setMembers(rows) })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Membership records could not be loaded')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const levels = useMemo(() => [...new Set(members.map((member) => member.level))].sort(), [members])
  const kinds = useMemo(() => [...new Set(members.map((member) => member.kind))].sort(), [members])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const rows = members.filter((member) =>
      (!selectedLevel || member.level === selectedLevel)
      && (!selectedKind || member.kind === selectedKind)
      && (!term || `${member.name} ${member.kind} ${member.level}`.toLocaleLowerCase().includes(term)),
    )
    rows.sort((a, b) => {
      if (sort === 'plan') return a.level.localeCompare(b.level) || a.name.localeCompare(b.name)
      if (sort === 'joined-newest') return b.joinedIso.localeCompare(a.joinedIso) || a.name.localeCompare(b.name)
      if (sort === 'joined-oldest') return a.joinedIso.localeCompare(b.joinedIso) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [members, search, selectedLevel, selectedKind, sort])
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize)
  const hasFilters = Boolean(search || selectedLevel || selectedKind)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {!embedded && (
        <>
          <PageHeader title="Clients" description="Current memberships" leading={<FilterButton onClick={() => setInternalFiltersOpen((open) => !open)} controls="membership-filters" expanded={filtersOpen} activeCount={Number(Boolean(selectedKind))} />} />
          <nav aria-label="Client sections" style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
            {TABS.filter((tab) => money || tab !== 'Credit').map((tab) => (
              <button
                key={tab}
                type="button"
                aria-current={tab === 'Membership' ? 'page' : undefined}
                onClick={() => { if (tab !== 'Membership') navigate(`/clients?tab=${tab.toLowerCase()}`) }}
                style={{ minHeight: 44, padding: '0 12px', border: 0, borderBottom: `2px solid ${tab === 'Membership' ? 'var(--nav-active-accent)' : 'transparent'}`, background: 'transparent', color: tab === 'Membership' ? 'var(--nav-active-accent)' : 'var(--text2)', fontFamily: 'inherit', fontWeight: tab === 'Membership' ? 700 : 500, cursor: 'pointer' }}
              >{tab}</button>
            ))}
          </nav>
        </>
      )}

      <FilterDrawer id="membership-filters" open={filtersOpen} onClose={closeFilters} resultCount={loading ? null : filtered.length} noun="members" activeCount={Number(Boolean(selectedKind))} onClearAll={() => { setSelectedKind(''); setPage(1) }} standardFooter onApply={closeFilters}>
        <label style={{ display: 'grid', gap: 8, fontWeight: 600 }}>Client type
          <select aria-label="Filter members by client type" value={selectedKind} onChange={(event) => { setSelectedKind(event.target.value); setPage(1) }} style={{ minHeight: 44, width: '100%' }}>
            <option value="">All client types</option>
            {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
      </FilterDrawer>

      <ListWorkspace
        controls={
          <ListControlRow
            search={<SearchInput value={search} onChange={(value) => updateParam('mq', value)} onClear={() => updateParam('mq', '')} placeholder="Search members" aria-label="Search members" />}
            filters={
              <select aria-label="Membership plan" value={selectedLevel} onChange={(event) => updateParam('ml', event.target.value)} style={{ minHeight: 44 }}>
                <option value="">All plans</option>
                {levels.map((level: MembershipTier) => <option value={level} key={level}>{level}</option>)}
              </select>
            }
            sort={
              <select aria-label="Sort members" value={sort} onChange={(event) => updateParam('ms', event.target.value)} style={{ minHeight: 44 }}>
                <option value="name">Name A–Z</option>
                <option value="joined-newest">Joined newest</option>
                <option value="joined-oldest">Joined oldest</option>
                <option value="plan">Plan</option>
              </select>
            }
            view={
              <div role="group" aria-label="View members" style={{ display: 'flex', gap: 4 }}>
                <Button variant={view === 'table' ? 'primary' : 'secondary'} onClick={() => updateParam('mv', 'table')}>Table</Button>
                <Button variant={view === 'cards' ? 'primary' : 'secondary'} onClick={() => updateParam('mv', 'cards')}>Cards</Button>
              </div>
            }
          />
        }
        quickFilters={levels.length > 0 && (
          <div className="client-chip-track" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button variant={!selectedLevel ? 'primary' : 'secondary'} onClick={() => updateParam('ml', '')}>All {members.length}</Button>
            {levels.map((level) => (
              <Button key={level} variant={selectedLevel === level ? 'primary' : 'secondary'} onClick={() => updateParam('ml', level)}>
                {level} {members.filter((member) => member.level === level).length}
              </Button>
            ))}
          </div>
        )}
        results={!loading && !error && <Pagination page={current} total={filtered.length} pageSize={pageSize} onPageChange={setPage} pageSizeOptions={PAGE_SIZES} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />}
      >
        {loading ? <LoadingSkeleton label="Loading memberships" /> : error ? (
          <ErrorBanner title="Could not load memberships" message={error} onRetry={() => setRetry((value) => value + 1)} />
        ) : pageRows.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No members match these filters' : 'No current memberships'}
            description={hasFilters ? 'Try another name or plan.' : 'Current membership records will appear here when available.'}
            {...(hasFilters ? { actionLabel: 'Clear filters', onAction: () => {
              const next = new URLSearchParams(params)
              next.delete('mq')
              next.delete('ml')
              setSelectedKind('')
              setParams(next, { replace: true })
              setPage(1)
            } } : {})}
          />
        ) : view === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 'var(--sp-md)' }}>
            {pageRows.map((member) => (
              <Card key={member.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div><strong>{member.name}</strong><div style={{ color: 'var(--text2)' }}>{member.kind} · {member.level}</div></div>
                  <Button onClick={() => navigate(`/clients/${member.clientId}`)}>Open</Button>
                </div>
                <div style={{ marginTop: 12, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Joined {member.joinedBs} · {member.joinedAd}</div>
                {money && <div style={{ marginTop: 6 }}>Fee paid: {member.feePaidPaisa === null ? '—' : formatMoney(member.feePaidPaisa)}</div>}
              </Card>
            ))}
          </div>
        ) : (
          <DataTableShell ariaLabel="Membership directory" data-table-scroll className="client-table-shell" style={{ overflowX: 'auto' }}>
            <table className="client-table" style={{ width: '100%', minWidth: money ? 700 : 590, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--th-bg)' }}>
                <th scope="col">Member</th><th scope="col">Plan</th><th scope="col">Joined (BS / AD)</th>
                {money && <th scope="col">Fee paid</th>}<th scope="col">Action</th>
              </tr></thead>
              <tbody>{pageRows.map((member) => (
                <tr key={member.id} className="client-row">
                  <td><strong>{member.name}</strong><div style={{ color: 'var(--text2)' }}>{member.kind}</div></td>
                  <td>{member.level}</td>
                  <td><span className="figure">{member.joinedBs}</span><div className="figure" style={{ color: 'var(--text2)' }}>{member.joinedAd}</div></td>
                  {money && <td className="figure">{member.feePaidPaisa === null ? '—' : formatMoney(member.feePaidPaisa)}</td>}
                  <td><Button onClick={() => navigate(`/clients/${member.clientId}`)}>Open</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </DataTableShell>
        )}
      </ListWorkspace>
    </div>
  )
}
