import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, FooterNote, SummaryRows } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { CLIENTS_DATA, findDuplicateGroups, type ClientRecord, type DuplicateGroup, type DuplicateMatchReason } from '../../data/clients'

/**
 * Duplicate & Merge Center — confirmed gap named in this session's audit
 * reconciliation (`PLAN.md §6.4`) and by two dangling "not built yet" reasons
 * this session already wrote: `ClientsDirectory.tsx`'s Import button and
 * `ClientDetail.tsx`'s "Merge Duplicate" action. This is what both were
 * pointing at.
 *
 * Detection is real — `findDuplicateGroups` in `data/clients.ts` runs
 * against the live client list on every render, not a canned result. The 26
 * seed clients were authored with distinct phones/emails/PANs/names, so the
 * expected, honest result against them is **zero groups**. That is the
 * detector working correctly, not a placeholder — see PROGRESS.md for how
 * the "found a match" path was verified separately, without corrupting the
 * seed data to manufacture a demo case.
 *
 * Merge is real within the session (not persisted — no backend exists yet,
 * same disclosed limit as everything else pre-Phase 1): the surviving record
 * absorbs the closed records' rental counts, lifetime spend and active
 * bookings; the closed records get `mergedIntoId` set — Law 3, a named
 * terminal action, never a delete.
 */

const REASON_LABEL: Record<DuplicateMatchReason, string> = {
  phone: 'Phone',
  email: 'Email',
  pan: 'PAN',
  name: 'Name',
}

function mergeInto(survivor: ClientRecord, closed: ClientRecord[]): ClientRecord {
  const bookings = new Set(survivor.activeBookings)
  closed.forEach((c) => c.activeBookings.forEach((b) => bookings.add(b)))
  return {
    ...survivor,
    isVip: survivor.isVip || closed.some((c) => c.isVip),
    isVerified: survivor.isVerified || closed.some((c) => c.isVerified),
    activeBookings: Array.from(bookings),
    currentRentalsCount: survivor.currentRentalsCount + closed.reduce((s, c) => s + c.currentRentalsCount, 0),
    totalRentalsCount: survivor.totalRentalsCount + closed.reduce((s, c) => s + c.totalRentalsCount, 0),
    totalSpentPaisa: (survivor.totalSpentPaisa + closed.reduce((s, c) => (s + c.totalSpentPaisa) as typeof s, 0 as typeof survivor.totalSpentPaisa)) as typeof survivor.totalSpentPaisa,
    outstandingPaisa: (survivor.outstandingPaisa + closed.reduce((s, c) => (s + c.outstandingPaisa) as typeof s, 0 as typeof survivor.outstandingPaisa)) as typeof survivor.outstandingPaisa,
    depositHeldPaisa: (survivor.depositHeldPaisa + closed.reduce((s, c) => (s + c.depositHeldPaisa) as typeof s, 0 as typeof survivor.depositHeldPaisa)) as typeof survivor.depositHeldPaisa,
    kycDocsCount: Math.max(survivor.kycDocsCount, ...closed.map((c) => c.kycDocsCount)),
  }
}

function GroupCard({
  group,
  money,
  onRequestMerge,
  onDismiss,
}: {
  group: DuplicateGroup
  money: boolean
  onRequestMerge: (survivorId: string) => void
  onDismiss: () => void
}) {
  const defaultSurvivor = group.clients.reduce((best, c) => (c.totalRentalsCount > best.totalRentalsCount ? c : best))
  const [survivorId, setSurvivorId] = useState(defaultSurvivor.id)

  return (
    <Card
      title={`Possible duplicate · matched on ${group.reasons.map((r) => REASON_LABEL[r]).join(', ')}`}
      action={
        <Button variant="ghost" onClick={onDismiss}>
          Not a Duplicate
        </Button>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${group.clients.length}, minmax(230px, 1fr))`,
          gap: 12,
          overflowX: 'auto',
        }}
      >
        {group.clients.map((c) => {
          const selected = survivorId === c.id
          return (
            <label
              key={c.id}
              style={{
                display: 'block',
                border: `2px solid ${selected ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                borderRadius: 'var(--r-card)',
                padding: 12,
                cursor: 'pointer',
                background: selected ? 'var(--nav-active-bg)' : 'var(--card2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input
                  type="radio"
                  name={`survivor-${group.key}`}
                  checked={selected}
                  onChange={() => setSurvivorId(c.id)}
                  style={{ accentColor: 'var(--nav-active-accent)' }}
                />
                <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{c.name}</span>
              </div>
              <SummaryRows
                rows={[
                  { label: 'ID', value: c.id },
                  { label: 'Phone', value: c.phone },
                  { label: 'Email', value: c.email || '—' },
                  { label: 'PAN', value: c.pan ?? '—' },
                  { label: 'Type', value: c.clientType },
                  { label: 'Total Rentals', value: String(c.totalRentalsCount) },
                  ...(money ? [{ label: 'Lifetime Spend', value: formatMoney(c.totalSpentPaisa) }] : []),
                ]}
              />
            </label>
          )
        })}
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        The selected record survives. The others are marked merged — not deleted — and their rental
        counts, lifetime spend and active bookings are added to the survivor.
      </p>

      <div style={{ marginTop: 10 }}>
        <Button variant="primary" icon="users" onClick={() => onRequestMerge(survivorId)}>
          Merge into selected
        </Button>
      </div>
    </Card>
  )
}

export default function DuplicateCenter() {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { showSuccessToast } = useToast()

  const [clients, setClients] = useState<ClientRecord[]>(CLIENTS_DATA)
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const [pendingMerge, setPendingMerge] = useState<{ group: DuplicateGroup; survivorId: string } | null>(null)

  const groups = useMemo(
    () => findDuplicateGroups(clients).filter((g) => !dismissedKeys.has(g.key)),
    [clients, dismissedKeys],
  )

  const checkedCount = clients.filter((c) => !c.mergedIntoId).length
  const mergedCount = clients.filter((c) => c.mergedIntoId).length

  const confirmMerge = () => {
    if (!pendingMerge) return
    const { group, survivorId } = pendingMerge
    const survivor = group.clients.find((c) => c.id === survivorId)
    if (!survivor) return
    const closed = group.clients.filter((c) => c.id !== survivorId)
    const merged = mergeInto(survivor, closed)

    setClients((prev) =>
      prev.map((c) => {
        if (c.id === survivor.id) return merged
        const wasClosed = closed.find((x) => x.id === c.id)
        return wasClosed ? { ...c, mergedIntoId: survivor.id, mergedAt: new Date().toISOString() } : c
      }),
    )
    showSuccessToast('Clients merged', `${closed.length} record(s) merged into ${survivor.name}`)
    setPendingMerge(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="users"
        title="Duplicate & Merge Center"
        description={`Checked ${checkedCount} client${checkedCount === 1 ? '' : 's'} for matching phone, email, PAN, or name.${mergedCount ? ` ${mergedCount} merged this session.` : ''}`}
        actions={
          <Button icon="external_link" onClick={() => navigate('/clients')}>
            Back to Clients
          </Button>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No duplicates found"
          description={`Every one of the ${checkedCount} active client records has a distinct phone, email, PAN and name. Nothing needs merging right now.`}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              money={money}
              onRequestMerge={(survivorId) => setPendingMerge({ group: g, survivorId })}
              onDismiss={() => setDismissedKeys((prev) => new Set(prev).add(g.key))}
            />
          ))}
        </div>
      )}

      <FooterNote extra={['Merging closes a record — Law 3: nothing is deleted, every entity has a named terminal action']} />

      <Modal
        isOpen={!!pendingMerge}
        onClose={() => setPendingMerge(null)}
        title="Merge these clients?"
        subtitle="This closes every record except the one you selected. In this build the change is session-only — nothing persists past a reload."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setPendingMerge(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmMerge}>
              Confirm Merge
            </Button>
          </div>
        }
      >
        {pendingMerge && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="checklist" size={15} style={{ color: 'var(--success-text)' }} />
              <span>
                <strong>{pendingMerge.group.clients.find((c) => c.id === pendingMerge.survivorId)?.name}</strong> survives
              </span>
            </div>
            {pendingMerge.group.clients
              .filter((c) => c.id !== pendingMerge.survivorId)
              .map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text2)' }}>
                  <Icon name="alert_triangle" size={15} style={{ color: 'var(--muted)' }} />
                  <span>{c.name} will be marked merged</span>
                </div>
              ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
