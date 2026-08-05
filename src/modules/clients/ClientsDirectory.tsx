import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button, KpiStrip } from '../../components/ui/Page'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney } from '../../lib/money'
import { CLIENTS_DATA, type ClientRecord } from '../../data/clients'
import { AddClientModal } from './AddClientModal'
import { useNavigate } from 'react-router-dom'
import { IconSearch, IconCheck } from '@tabler/icons-react'

type FilterKey = 'all' | 'onRent' | 'paymentDue' | 'blocked' | 'vip'

export function ClientsDirectory() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()

  const [clients, setClients] = useState<ClientRecord[]>(CLIENTS_DATA)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  // Filtered rows
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      // Search matching
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matches =
          client.name.toLowerCase().includes(q) ||
          (client.company && client.company.toLowerCase().includes(q)) ||
          client.phone.toLowerCase().includes(q) ||
          client.email.toLowerCase().includes(q) ||
          (client.pan && client.pan.includes(q)) ||
          client.membership.toLowerCase().includes(q) ||
          client.clientType.toLowerCase().includes(q)
        if (!matches) return false
      }

      // Quick filter
      if (activeFilter === 'onRent') return client.currentRentalsCount > 0
      if (activeFilter === 'paymentDue') return client.outstandingPaisa > 0
      if (activeFilter === 'blocked') return client.isBlocked
      if (activeFilter === 'vip') return client.isVip
      return true
    })
  }, [clients, searchQuery, activeFilter])

  // Selected client for side rail
  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) ?? null
  }, [clients, selectedClientId])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIds(new Set(filteredClients.map((c) => c.id)))
    } else {
      setSelectedRowIds(new Set())
    }
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const handleAddClient = (newRecord: ClientRecord) => {
    setClients([newRecord, ...clients])
    setSelectedClientId(newRecord.id)
  }

  const getClientAction = (client: ClientRecord) => {
    if (client.isBlocked) {
      return {
        label: 'Review Block',
        variant: 'secondary' as const,
        action: () => setSelectedClientId(client.id),
      }
    }
    if (client.outstandingPaisa > 0) {
      return {
        label: 'Receive Payment',
        variant: 'primary' as const,
        action: () => navigate('/finance'),
      }
    }
    if (client.currentRentalsCount > 0) {
      return {
        label: 'Open Rental',
        variant: 'secondary' as const,
        action: () => {
          const booking = client.activeBookings[0] ?? 'BK-2026-0715'
          navigate(`/rentals/${booking}`)
        },
      }
    }
    return {
      label: 'New Rental',
      variant: 'primary' as const,
      action: () => navigate('/rentals/new'),
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 4 KPI Cards */}
      <KpiStrip
        columns={4}
        items={[
          { label: 'Total Clients', value: '284', icon: 'users', accent: 'primary', note: 'Registered in directory' },
          { label: 'On Rent', value: '18', icon: 'package', accent: 'success', note: 'Clients with active rentals' },
          { label: 'Outstanding', value: 'Rs 8,42,000', icon: 'card', accent: 'danger', note: '23 clients with balance' },
          { label: 'Blocked', value: '4', icon: 'alert_triangle', accent: 'danger', note: 'Requires review & clearance' },
        ]}
      />

      {/* Toolbar & Filter Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        {/* Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: activeFilter === 'all' ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
              background: activeFilter === 'all' ? 'var(--nav-active-accent)' : 'var(--card)',
              color: activeFilter === 'all' ? '#ffffff' : 'var(--text)',
              transition: 'all 0.15s ease',
            }}
          >
            All <span className="figure" style={{ opacity: 0.85, marginLeft: 4 }}>284</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('onRent')}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: activeFilter === 'onRent' ? '1px solid var(--info)' : '1px solid var(--border)',
              background: activeFilter === 'onRent' ? 'var(--info)' : 'var(--card)',
              color: activeFilter === 'onRent' ? '#ffffff' : 'var(--text)',
              transition: 'all 0.15s ease',
            }}
          >
            On Rent <span className="figure" style={{ opacity: 0.85, marginLeft: 4 }}>18</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('paymentDue')}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: activeFilter === 'paymentDue' ? '1px solid var(--bad)' : '1px solid var(--border)',
              background: activeFilter === 'paymentDue' ? 'var(--bad)' : 'var(--card)',
              color: activeFilter === 'paymentDue' ? '#ffffff' : 'var(--text)',
              transition: 'all 0.15s ease',
            }}
          >
            Payment Due <span className="figure" style={{ opacity: 0.85, marginLeft: 4 }}>23</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('blocked')}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: activeFilter === 'blocked' ? '1px solid var(--bad)' : '1px solid var(--border)',
              background: activeFilter === 'blocked' ? 'var(--bad)' : 'var(--card)',
              color: activeFilter === 'blocked' ? '#ffffff' : 'var(--text)',
              transition: 'all 0.15s ease',
            }}
          >
            Blocked <span className="figure" style={{ opacity: 0.85, marginLeft: 4 }}>4</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter(activeFilter === 'vip' ? 'all' : 'vip')}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: activeFilter === 'vip' ? '1px solid #eab308' : '1px solid var(--border)',
              background: activeFilter === 'vip' ? 'rgba(234, 179, 8, 0.15)' : 'var(--card)',
              color: activeFilter === 'vip' ? '#eab308' : 'var(--text)',
              transition: 'all 0.15s ease',
            }}
          >
            ★ VIP Only
          </button>
        </div>

        {/* Actions & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 260 }}>
            <Input
              placeholder="Search name, PAN, phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<IconSearch size={16} />}
            />
          </div>

          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Export Complete', 'Exporting client records as CSV…')}
            icon="download"
          >
            Export
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsAddModalOpen(true)}
            icon="plus"
          >
            New Client
          </Button>
        </div>
      </div>

      {/* Main Table + Side Profile Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedClient ? '1fr 380px' : '1fr', gap: 16 }}>
        {/* Table View */}
        <Card padding="none" style={{ overflow: 'hidden' }}>
          {filteredClients.length === 0 ? (
            <EmptyState
              title="No clients found"
              description={searchQuery ? `No client matching "${searchQuery}".` : 'No clients found matching the selected filter criteria.'}
              actionLabel="Clear Filters"
              onAction={() => {
                setActiveFilter('all')
                setSearchQuery('')
              }}
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ width: 36, padding: '12px 14px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRowIds.size === filteredClients.length && filteredClients.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        style={{ accentColor: 'var(--nav-active-accent)' }}
                      />
                    </th>
                    <th style={{ padding: '12px 14px' }}>Client</th>
                    <th style={{ padding: '12px 14px' }}>Contact</th>
                    <th style={{ padding: '12px 14px' }}>Type</th>
                    <th style={{ padding: '12px 14px' }}>Membership</th>
                    <th style={{ padding: '12px 14px' }}>Current Rentals</th>
                    <th style={{ padding: '12px 14px' }}>Outstanding</th>
                    <th style={{ padding: '12px 14px' }}>Deposit Held</th>
                    <th style={{ padding: '12px 14px' }}>Last Rental</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const isSelected = selectedClientId === client.id
                    const action = getClientAction(client)

                    return (
                      <tr
                        key={client.id}
                        onClick={() => setSelectedClientId(isSelected ? null : client.id)}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isSelected ? 'var(--card2)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(client.id)}
                            onChange={() => handleToggleRow(client.id)}
                            style={{ accentColor: 'var(--nav-active-accent)' }}
                          />
                        </td>

                        {/* Client column */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: 'var(--card2)',
                                border: '1px solid var(--border)',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--text)',
                                flexShrink: 0,
                              }}
                            >
                              {client.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                  {client.name}
                                </span>
                                {client.isVip && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      background: 'rgba(234, 179, 8, 0.15)',
                                      color: '#eab308',
                                    }}
                                  >
                                    VIP
                                  </span>
                                )}
                                {client.isVerified && (
                                  <span title="KYC & PAN Verified" style={{ color: 'var(--good)', display: 'inline-flex' }}>
                                    <IconCheck size={14} stroke={3} />
                                  </span>
                                )}
                              </div>
                              {client.company && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                                  {client.company}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td style={{ padding: '12px 14px' }}>
                          <div className="figure" style={{ fontSize: 12, color: 'var(--text)' }}>
                            {client.phone}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                            {client.email}
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {client.clientType}
                          </span>
                        </td>

                        {/* Membership */}
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--card2)',
                              border: '1px solid var(--border)',
                              color: 'var(--text)',
                            }}
                          >
                            {client.membership}
                          </span>
                        </td>

                        {/* Current Rentals */}
                        <td style={{ padding: '12px 14px' }}>
                          {client.currentRentalsCount > 0 ? (
                            <span
                              className="figure"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: 'var(--info)',
                              }}
                            >
                              {client.currentRentalsCount} on rent
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* Outstanding */}
                        <td style={{ padding: '12px 14px' }}>
                          {client.outstandingPaisa > 0 ? (
                            <span className="figure" style={{ fontWeight: 600, color: 'var(--bad)' }}>
                              {formatMoney(client.outstandingPaisa)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* Deposit Held */}
                        <td style={{ padding: '12px 14px' }}>
                          {client.depositHeldPaisa > 0 ? (
                            <div>
                              <span className="figure" style={{ color: 'var(--text)', fontWeight: 500 }}>
                                {formatMoney(client.depositHeldPaisa)}
                              </span>
                              {client.currentRentalsCount === 0 && (
                                <div style={{ marginTop: 2 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      background: 'rgba(234, 179, 8, 0.15)',
                                      color: '#eab308',
                                    }}
                                  >
                                    Review Deposit
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* Last Rental (BS over AD) */}
                        <td style={{ padding: '12px 14px' }}>
                          {client.lastRentalBs !== '—' ? (
                            <div>
                              <div className="figure" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                                {client.lastRentalBs}
                              </div>
                              <div className="figure" style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {client.lastRentalAd}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 14px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant={action.variant}
                            onClick={action.action}
                          >
                            {action.label}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Right Profile Drawer */}
        {selectedClient && (
          <Card padding="none" style={{ height: 'fit-content', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    {selectedClient.name}
                  </h3>
                  {selectedClient.isVip && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
                      VIP
                    </span>
                  )}
                </div>
                <div className="figure" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {selectedClient.id} · {selectedClient.membership}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClientId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status banner if blocked */}
              {selectedClient.isBlocked && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--bad)',
                    fontSize: 12,
                  }}
                >
                  <strong>Account Blocked:</strong> {selectedClient.blockReason}
                </div>
              )}

              {/* Quick Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>Phone</span>
                  <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>{selectedClient.phone}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>Email</span>
                  <span style={{ color: 'var(--text)' }}>{selectedClient.email}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>PAN</span>
                  <span className="figure" style={{ color: 'var(--text)' }}>{selectedClient.pan ?? 'Not on file'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>KYC Status</span>
                  <span style={{ color: selectedClient.kycStatus === 'Verified' ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>
                    {selectedClient.kycStatus}
                  </span>
                </div>
              </div>

              {/* Credit Limit & Utilization */}
              <div style={{ padding: '12px 14px', background: 'var(--card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>Credit Utilization</span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {formatMoney(selectedClient.creditUsedPaisa)} / {formatMoney(selectedClient.creditLimitPaisa)}
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round((selectedClient.creditUsedPaisa / selectedClient.creditLimitPaisa) * 100))}%`,
                      background: selectedClient.creditUsedPaisa > selectedClient.creditLimitPaisa * 0.8 ? 'var(--bad)' : 'var(--nav-active-accent)',
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>

              {/* Contact Person */}
              <div style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Contact Person</span>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedClient.contactPerson.name}</div>
                <div style={{ color: 'var(--muted)' }}>
                  {selectedClient.contactPerson.designation} · <span className="figure">{selectedClient.contactPerson.phone}</span>
                </div>
              </div>

              {/* Total Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 10, background: 'var(--card2)', borderRadius: 8, textAlign: 'center' }}>
                <div>
                  <div className="figure" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                    {selectedClient.totalRentalsCount}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total Rentals</div>
                </div>
                <div>
                  <div className="figure" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                    {formatMoney(selectedClient.totalSpentPaisa)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Lifetime Spend</div>
                </div>
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1 }}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (!selectedClient.isBlocked) navigate('/rentals/new')
                    }}
                  >
                    Start Rental
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => showSuccessToast('Opening Ledger', `Loading transactions for ${selectedClient.name}…`)}
                >
                  Ledger
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Add Client Modal */}
      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onClientAdded={handleAddClient}
      />
    </div>
  )
}
