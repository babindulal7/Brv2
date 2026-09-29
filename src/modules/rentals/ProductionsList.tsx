/**
 * ProductionsList — Project lifecycle hub rollup.
 *
 * Ported from the standalone's productions screen.
 * Tracks multi-day shoots, booking rollups, crew assignments,
 * and lifecycle phases: Pre-Production -> Shoot -> Return -> Wrap.
 */
import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card, KpiStrip, PageHeader, PageActions } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { SearchInput } from '../../components/ui/SearchInput'
import { PageShell } from '../../components/ui/PageShell'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  PROD_PHASES,
  getProductions,
  createProduction,
  updateProductionPhase,
  getProductionStats,
  type Production,
  type ProductionPhase,
} from '../../lib/queries/productions'

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  border: active ? '1px solid rgba(47, 125, 255, 0.4)' : '1px solid var(--border)',
  background: active ? 'rgba(47, 125, 255, 0.14)' : 'transparent',
  color: active ? 'var(--info)' : 'var(--text3)',
  transition: 'all 0.15s',
})

const stepperStepStyle = (isCurrent: boolean, isPast: boolean): React.CSSProperties => ({
  flex: 1,
  textAlign: 'center',
  padding: '6px 4px',
  borderRadius: '7px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  background: isCurrent ? 'var(--info)' : isPast ? 'rgba(46, 204, 143, 0.14)' : 'var(--surface)',
  color: isCurrent ? '#fff' : isPast ? 'var(--green)' : 'var(--text3)',
  border: isCurrent ? '1px solid var(--info)' : isPast ? '1px solid rgba(46, 204, 143, 0.3)' : '1px solid var(--border)',
  transition: 'all 0.15s',
})

export default function ProductionsList() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const canViewMoney = useCanViewMoney()

  const [productions, setProductions] = useState<Production[]>(getProductions)
  const [phaseFilter, setPhaseFilter] = useState<'All' | ProductionPhase>('All')
  const [search, setSearch] = useState('')
  const [selectedProd, setSelectedProd] = useState<Production | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)

  // New production form state
  const [newTitle, setNewTitle] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newBookingId, setNewBookingId] = useState('')
  const [newDirector, setNewDirector] = useState('')
  const [newDop, setNewDop] = useState('')
  const [newDates, setNewDates] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newGearCount, setNewGearCount] = useState('10')
  const [newBudget, setNewBudget] = useState('50000')
  const [newCrew, setNewCrew] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const stats = useMemo(() => getProductionStats(productions), [productions])

  const filtered = useMemo(() => {
    return productions.filter((p) => {
      if (phaseFilter !== 'All' && p.phase !== phaseFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          p.title.toLowerCase().includes(q) ||
          p.client.toLowerCase().includes(q) ||
          p.director.toLowerCase().includes(q) ||
          p.dop.toLowerCase().includes(q) ||
          p.bookingId.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [productions, phaseFilter, search])

  const handlePhaseChange = useCallback((id: string, nextPhase: ProductionPhase) => {
    const updated = updateProductionPhase(id, nextPhase)
    setProductions([...updated])
    if (selectedProd && selectedProd.id === id) {
      setSelectedProd({ ...selectedProd, phase: nextPhase })
    }
    showSuccessToast(`Production phase updated to ${nextPhase}`)
  }, [selectedProd, showSuccessToast])

  const handleCreate = useCallback(() => {
    if (!newTitle.trim() || !newClient.trim()) return
    const created = createProduction({
      title: newTitle.trim(),
      client: newClient.trim(),
      bookingId: newBookingId.trim() || 'BR-NEW',
      director: newDirector.trim() || '—',
      dop: newDop.trim() || '—',
      dates: newDates.trim() || 'TBD',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      phase: 'Pre-Production',
      gearCount: Number(newGearCount) || 0,
      budgetNpr: Number(newBudget) || 0,
      crewSummary: newCrew.trim() || 'Crew unassigned',
      location: newLocation.trim() || 'Kathmandu',
      notes: newNotes.trim(),
    })

    setProductions(getProductions())
    setIsNewModalOpen(false)
    setNewTitle('')
    setNewClient('')
    setNewBookingId('')
    setNewDirector('')
    setNewDop('')
    setNewDates('')
    setNewLocation('')
    setNewCrew('')
    setNewNotes('')
    showSuccessToast(`Created production ${created.title}`)
  }, [newTitle, newClient, newBookingId, newDirector, newDop, newDates, newLocation, newGearCount, newBudget, newCrew, newNotes, showSuccessToast])

  const kpis: Kpi[] = useMemo(() => [
    { label: 'Active Productions', value: String(stats.totalCount), icon: 'video' as const, accent: 'primary' },
    { label: 'Shooting Now', value: String(stats.inShootCount), icon: 'camera', accent: 'success' },
    { label: 'Pre-Production', value: String(stats.preProdCount), icon: 'timer', accent: 'progress' },
    {
      label: 'Total Production Budget',
      value: canViewMoney ? formatMoney(rupees(stats.totalBudget)) : '•••',
      icon: 'card',
      accent: 'primary',
      definition: 'Estimated equipment & services value across all active projects.',
    },
  ], [stats, canViewMoney])

  return (
    <PageShell
      header={
        <PageHeader
          title="Productions Hub"
          description="High-level project rollups, shoot schedules, and equipment/crew packages."
          actions={
            <PageActions
              primary={
                <Button variant="primary" onClick={() => setIsNewModalOpen(true)}>
                  <Icon name="plus" size={14} />
                  New Production
                </Button>
              }
            />
          }
        />
      }
    >
      {/* KPI strip */}
      <KpiStrip items={kpis} columns={isPhone ? 2 : 4} />

      {/* Filter and search bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: 'var(--sp-md) 0' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['All', ...PROD_PHASES] as const).map((ph) => (
            <button
              key={ph}
              style={chipStyle(phaseFilter === ph)}
              onClick={() => setPhaseFilter(ph)}
            >
              {ph}
            </button>
          ))}
        </div>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search title, client, director…" />
        </div>
      </div>

      {/* Productions grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 'var(--sp-md)' }}>
        {filtered.map((prod) => {
          const currentPhaseIdx = PROD_PHASES.indexOf(prod.phase)
          return (
            <Card key={prod.id}>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>
                      {prod.id} · <Link to={`/rentals`} style={{ color: 'var(--info)', textDecoration: 'none' }}>{prod.bookingId}</Link>
                    </span>
                    <h3 style={{ margin: '3px 0 0', fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                      {prod.title}
                    </h3>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: '2px' }}>
                      {prod.client}
                    </div>
                  </div>
                  <Badge
                    tone={prod.phase === 'Shoot' ? 'in' : prod.phase === 'Return' ? 'warning' : prod.phase === 'Wrap' ? 'neutral' : 'primary'}
                    label={prod.phase}
                  />
                </div>

                {/* Lifecycle Stepper */}
                <div style={{ display: 'flex', gap: '4px', margin: '4px 0' }}>
                  {PROD_PHASES.map((p, idx) => (
                    <div
                      key={p}
                      style={stepperStepStyle(idx === currentPhaseIdx, idx < currentPhaseIdx)}
                      onClick={() => handlePhaseChange(prod.id, p)}
                      title={`Click to set stage to ${p}`}
                    >
                      {p}
                    </div>
                  ))}
                </div>

                {/* Facts row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', padding: '10px 12px', background: 'var(--surface)', borderRadius: '8px', fontSize: 'var(--t-meta)' }}>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Dates & Place</div>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>{prod.dates}</div>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>{prod.location}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Gear & Budget</div>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>{prod.gearCount} items</div>
                    <div style={{ color: 'var(--text2)', fontWeight: 600 }}>
                      {canViewMoney ? formatMoney(rupees(prod.budgetNpr)) : '•••'}
                    </div>
                  </div>
                </div>

                {/* Crew line */}
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="users" size={13} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {prod.crewSummary}
                  </span>
                </div>

                {/* Footer action */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <Button variant="outline" onClick={() => setSelectedProd(prod)}>
                    View Details
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
          No productions matching criteria
        </div>
      )}

      {/* Production Detail Modal */}
      {selectedProd && (
        <Modal isOpen onClose={() => setSelectedProd(null)} title={selectedProd.title}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{selectedProd.id} · {selectedProd.bookingId}</span>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{selectedProd.client}</div>
              </div>
              <Badge tone="primary" label={selectedProd.phase} />
            </div>

            {/* Stepper inside modal */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', marginBottom: '6px' }}>
                ADVANCE PRODUCTION STAGE
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {PROD_PHASES.map((p) => (
                  <button
                    key={p}
                    style={stepperStepStyle(p === selectedProd.phase, PROD_PHASES.indexOf(p) < PROD_PHASES.indexOf(selectedProd.phase))}
                    onClick={() => handlePhaseChange(selectedProd.id, p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: 'var(--t-meta)' }}>
              <div><strong>Director:</strong> {selectedProd.director}</div>
              <div><strong>Cinematographer:</strong> {selectedProd.dop}</div>
              <div><strong>Dates:</strong> {selectedProd.dates}</div>
              <div><strong>Location:</strong> {selectedProd.location}</div>
              <div><strong>Total Gear:</strong> {selectedProd.gearCount} items</div>
              <div><strong>Budget:</strong> {canViewMoney ? formatMoney(rupees(selectedProd.budgetNpr)) : '•••'}</div>
            </div>

            <div>
              <strong>Assigned Crew:</strong>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: '4px' }}>
                {selectedProd.crewSummary}
              </div>
            </div>

            {selectedProd.notes && (
              <div style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: '8px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                <strong>Production Notes:</strong> {selectedProd.notes}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button onClick={() => setSelectedProd(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Production Modal */}
      {isNewModalOpen && (
        <Modal isOpen onClose={() => setIsNewModalOpen(false)} title="Create New Production">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Project Title *</label>
              <input
                type="text"
                placeholder='e.g. "Echoes of Mustang"'
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Client / Production Co. *</label>
                <input
                  type="text"
                  placeholder="e.g. Himalayan Films"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Linked Booking No.</label>
                <input
                  type="text"
                  placeholder="e.g. BR-2615"
                  value={newBookingId}
                  onChange={(e) => setNewBookingId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Director</label>
                <input
                  type="text"
                  placeholder="Director name"
                  value={newDirector}
                  onChange={(e) => setNewDirector(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Cinematographer (DOP)</label>
                <input
                  type="text"
                  placeholder="DOP name"
                  value={newDop}
                  onChange={(e) => setNewDop(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Shoot Dates</label>
                <input
                  type="text"
                  placeholder="e.g. 24 Jul – 28 Jul"
                  value={newDates}
                  onChange={(e) => setNewDates(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Location</label>
                <input
                  type="text"
                  placeholder="e.g. Mustang / Patan"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Gear Items Count</label>
                <input
                  type="number"
                  value={newGearCount}
                  onChange={(e) => setNewGearCount(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Estimated Budget (NPR)</label>
                <input
                  type="number"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Assigned Crew</label>
              <input
                type="text"
                placeholder="e.g. Bikash Tamang (DOP), Suman Rai (Gaffer)"
                value={newCrew}
                onChange={(e) => setNewCrew(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Special Notes</label>
              <textarea
                placeholder="Location conditions, power requirements, special riders..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginTop: '4px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button onClick={() => setIsNewModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={!newTitle.trim() || !newClient.trim()}>
                Create Production
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}
