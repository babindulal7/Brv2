import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, FooterNote, SummaryRows } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { useToast } from '../../components/ui/Toast'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { captureError } from '../../lib/monitoring'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import type { ActionContext } from '../../actions/core'
import { useList } from '../../lib/queries/useList'
import { listClientRecords } from '../../lib/queries/clients'
import { findDuplicateGroups, type ClientRecord, type DuplicateGroup, type DuplicateMatchReason } from '../../data/clients'

/**
 * Duplicate & Merge Center — confirmed gap named in this session's audit
 * reconciliation (`PLAN.md §6.4`) and by two dangling "not built yet" reasons
 * this session already wrote: `ClientsDirectory.tsx`'s Import button and
 * `ClientDetail.tsx`'s "Merge Duplicate" action. This is what both were
 * pointing at.
 *
 * Detection runs against the DATABASE. The directory is read once through
 * `lib/queries/clients` (`listClientRecords` over `client_directory_v` —
 * Law 2, the same read every other clients surface uses) and
 * `findDuplicateGroups` in `data/clients.ts` derives the groups from those
 * fetched rows. The 26-row `CLIENTS_DATA` seed this screen used to scan is
 * gone from it entirely — "Checked N clients" is now a statement about the
 * directory the operator arrived from, not about a fixture file
 * (docs/pages/43 §7.6). The pairwise grouping itself is a derivation over the
 * one fetched list, which is the shape Law 2 allows; the per-candidate
 * checks on Add Client and Import Center use the targeted server-side
 * matchers in the same query module instead.
 *
 * ⛔ **What was removed and why** (`SUCCESS_FABRICATION_REGISTER_2026-08-12.md`,
 * section D). `confirmMerge` used to rewrite local state **first** — survivor
 * absorbs the merged record, every other client in the group stamped
 * `mergedIntoId` + `mergedAt` — then fire `mergeClients` per record inside an
 * un-caught `.then()`, then toast synchronously, before any dispatch could have
 * resolved. There was no rollback and no `.catch()`. Three duplicates vanished
 * from the list, the header read "3 merged this session", the toast confirmed
 * it — and on reload all three were back, while the operator had moved on
 * believing the directory was clean and may have quoted the survivor's merged
 * credit limit.
 *
 * **The order is now inverted: dispatch, then commit.** Nothing local changes
 * until `MERGE_CLIENTS` resolves for that record, and the success toast fires
 * only on the all-resolved path.
 *
 * **A merge is destructive-shaped, so half-applying is stated, never hidden.**
 * The records are merged one at a time and the loop stops at the first refusal.
 * Whatever landed is committed locally (so the screen matches what actually
 * happened); whatever did not is named in a persistent inline line — which of
 * them merged, which one failed, and that the rest were never attempted. There
 * is no path where some records merge and the screen implies all of them did.
 *
 * `mergeClients` is not marked `implemented`, so `actions/core.ts` refuses it
 * before `execute` and today the honest outcome is: nothing merges, and the
 * operator reads why. Restoring the toast is not the fix.
 */

/**
 * ⛔ **The merge fix's sibling, missed the first time.** `Not a Duplicate` put
 * the group's key into a local `dismissedKeys` set and the card vanished — no
 * dispatch, no persistence, and nothing on screen saying so. An operator
 * triaging false positives cleared them one card at a time, watched the list
 * empty, and on the next load `findDuplicateGroups` — which re-derives from the
 * client list on every render and has no memory to consult — raised every one
 * of them again. The triage was never recorded anywhere. Only the belief that
 * it had been.
 *
 * A dismissal is a stored fact about a *pair* ("these two are different people,
 * stop asking"), so session state cannot express it: it is precisely the thing
 * the next render has to read. There is no dismiss/not-duplicate action under
 * `src/actions/` — a build gap, not an open product question — so the control
 * states the gap where it stands, the same treatment `crew/CrewBooking.tsx`
 * gives `Book Crew`. The local set went with it; leaving it would have left a
 * session-only triage that still evaporates.
 */
const NOT_DUPLICATE_UNAVAILABLE =
  'Not built yet — dismissing a match has to be stored against the pair or the detector raises it again on the next load, and no dismiss action exists'

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
}: {
  group: DuplicateGroup
  money: boolean
  onRequestMerge: (survivorId: string) => void
}) {
  const defaultSurvivor = group.clients.reduce((best, c) => (c.totalRentalsCount > best.totalRentalsCount ? c : best))
  const [survivorId, setSurvivorId] = useState(defaultSurvivor.id)

  return (
    <Card
      title={`Possible duplicate · matched on ${group.reasons.map((r) => REASON_LABEL[r]).join(', ')}`}
      action={
        <Unavailable reason={NOT_DUPLICATE_UNAVAILABLE}>
          <Button variant="ghost" disabled>
            Not a Duplicate
          </Button>
        </Unavailable>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${group.clients.length}, minmax(230px, 1fr))`,
          gap: 'var(--sp-md)',
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
                padding: 'var(--sp-md)',
                cursor: 'pointer',
                background: selected ? 'var(--nav-active-bg)' : 'var(--card2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 10 }}>
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
  const { user } = useAuth()
  const online = useNetwork()

  /**
   * The directory, from the database. One read for the whole scan; the
   * grouping below is a pure derivation over these rows. The limit is
   * explicit and generous — if the business ever outgrows it, the header's
   * "Checked N clients" stays truthful because N is the number actually
   * fetched, not the table size.
   */
  const fetchClients = useCallback(async () => ({ rows: await listClientRecords({ limit: 1000 }) }), [])
  const list = useList(fetchClients)

  /**
   * Session-local commit of merges that actually landed (dispatch-then-commit
   * — nothing goes in here until `MERGE_CLIENTS` resolves for that record).
   * Kept as an overlay OVER the fetched rows rather than a copy of them, so a
   * refetch cannot silently discard a commit and a commit cannot fork from
   * the directory. When the merge action writes to `client_merges` for real,
   * the durable version of this is a refetch.
   */
  const [sessionSurvivors, setSessionSurvivors] = useState<Record<string, ClientRecord>>({})
  const [sessionMerged, setSessionMerged] = useState<Record<string, { mergedIntoId: string; mergedAt: string }>>({})

  const clients = useMemo(
    () =>
      list.rows.map((c) => {
        const survivor = sessionSurvivors[c.id]
        if (survivor) return survivor
        const merged = sessionMerged[c.id]
        return merged ? { ...c, ...merged } : c
      }),
    [list.rows, sessionSurvivors, sessionMerged],
  )

  const [pendingMerge, setPendingMerge] = useState<{ group: DuplicateGroup; survivorId: string } | null>(null)
  const [merging, setMerging] = useState(false)
  /**
   * Law 12 — the one inline, persistent failure line for this screen. Toasts
   * here are success-only (`useToast()` exposes `showSuccessToast` and nothing
   * else), and a merge that half-applied or did not apply at all is exactly the
   * thing that must not disappear after four seconds.
   */
  const [mergeError, setMergeError] = useState<string | null>(null)

  // Every group the detector finds is shown. Nothing filters this list — a
  // dismissal it could honour would have to come back from a store, and there
  // is none (see NOT_DUPLICATE_UNAVAILABLE).
  const groups = useMemo(() => findDuplicateGroups(clients), [clients])

  const checkedCount = clients.filter((c) => !c.mergedIntoId).length
  const mergedCount = clients.filter((c) => c.mergedIntoId).length

  /** The header claims what was checked, so it must not claim anything mid-load or after a failed load. */
  const headerDescription = list.loading
    ? 'Checking the client directory for matching phone, email, PAN, or name…'
    : list.error
      ? 'The client directory could not be loaded, so nothing has been checked yet.'
      : `Checked ${checkedCount} client${checkedCount === 1 ? '' : 's'} for matching phone, email, PAN, or name.${mergedCount ? ` ${mergedCount} merged this session.` : ''}`

  /**
   * No session, no dispatch, and never a substituted identity — the same shape
   * `rentals/NewRental.tsx` and `today/MovementList.tsx` use. `isOnline` is
   * passed because this screen knows it and `lib/rbac` degrades several
   * approvals offline; omitting it lets `ActionContext` default to online,
   * which is the fail-open direction.
   */
  const dispatchContext = useCallback((): ActionContext | null => {
    if (!user) return null
    return { userId: user.id, role: user.role, isOnline: online }
  }, [user, online])

  const confirmMerge = useCallback(async () => {
    if (!pendingMerge || merging) return
    const { group, survivorId } = pendingMerge
    const survivor = group.clients.find((c) => c.id === survivorId)
    if (!survivor) return
    const closed = group.clients.filter((c) => c.id !== survivorId)

    const ctx = dispatchContext()
    if (!ctx) {
      setPendingMerge(null)
      setMergeError(
        'Not merged — you are not signed in, so this merge cannot be attributed to anyone. Nothing was changed: ' +
          `all ${closed.length} record${closed.length === 1 ? ' is' : 's are'} still separate. Sign in and try again.`,
      )
      return
    }

    setPendingMerge(null)
    setMergeError(null)
    setMerging(true)

    // The module load is inside the guarded region too: if it fails, `merging`
    // must not be left stuck true with nothing on screen explaining why.
    let mergeClients: typeof import('../../actions/clients/mergeClients')['mergeClients']
    try {
      mergeClients = (await import('../../actions/clients/mergeClients')).mergeClients
    } catch (err: unknown) {
      captureError(err, { where: 'DuplicateCenter.loadMerge' })
      setMerging(false)
      setMergeError(
        `Not merged — the merge action could not be loaded (${err instanceof Error ? err.message : String(err)}). ` +
          `Nothing was changed: all ${closed.length} record${closed.length === 1 ? ' is' : 's are'} still separate.`,
      )
      return
    }

    // Sequential on purpose. These are N independent writes with no transaction
    // around them, so the only way to keep the report truthful is to know
    // exactly where it stopped — `Promise.all` would leave an unknown number of
    // them landed behind a single rejection.
    const landed: ClientRecord[] = []
    let failure: { client: ClientRecord; message: string } | null = null
    for (const c of closed) {
      try {
        await mergeClients({ survivorId: survivor.id, duplicateId: c.id }, ctx)
        landed.push(c)
      } catch (err: unknown) {
        captureError(err, { where: 'DuplicateCenter.merge', clientId: c.id })
        failure = { client: c, message: err instanceof Error ? err.message : String(err) }
        break
      }
    }

    setMerging(false)

    // Commit only what actually landed, as an overlay over the fetched rows.
    // The survivor absorbs the merged records' counts, spend and bookings —
    // never the ones that refused.
    if (landed.length > 0) {
      const mergedSurvivor = mergeInto(survivor, landed)
      const at = new Date().toISOString()
      setSessionSurvivors((prev) => ({ ...prev, [survivor.id]: mergedSurvivor }))
      setSessionMerged((prev) => {
        const next = { ...prev }
        for (const c of landed) next[c.id] = { mergedIntoId: survivor.id, mergedAt: at }
        return next
      })
    }

    if (!failure) {
      showSuccessToast(
        'Clients merged',
        `${landed.length} record${landed.length === 1 ? '' : 's'} merged into ${survivor.name}`,
      )
      return
    }

    const notAttempted = closed.length - landed.length - 1
    setMergeError(
      landed.length === 0
        ? `Not merged — ${failure.message} Nothing was changed: all ${closed.length} record${closed.length === 1 ? ' is' : 's are'} still separate.`
        : `Partially merged — ${landed.length} of ${closed.length} records merged into ${survivor.name} (${landed
            .map((c) => c.name)
            .join(', ')}). ${failure.client.name} then failed: ${failure.message}` +
            (notAttempted > 0
              ? ` The remaining ${notAttempted} record${notAttempted === 1 ? ' was' : 's were'} not attempted and ${notAttempted === 1 ? 'is' : 'are'} still separate.`
              : ''),
    )
  }, [pendingMerge, merging, dispatchContext, showSuccessToast])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="users"
        title="Duplicate & Merge Center"
        description={headerDescription}
        actions={
          <Button icon="external_link" onClick={() => navigate('/clients')}>
            Back to Clients
          </Button>
        }
      />

      {/* Law 12 — the failure path is inline and persistent, in the screen's
          existing danger-text idiom. It sits above the groups because the thing
          it reports (what merged, what did not) is a fact about the list below. */}
      {merging && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Icon name="timer" size={14} style={{ flexShrink: 0 }} />
          Merging… nothing has changed yet.
        </p>
      )}
      {mergeError && (
        <p
          role="alert"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--danger-text)',
            lineHeight: 1.45,
          }}
        >
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{mergeError}</span>
        </p>
      )}

      {/* The fixed ladder: error → loading → empty → groups. A directory that
          could not be read shows the failure (with Retry), never an empty
          "no duplicates" that would read as a clean bill of health. */}
      <PageBody
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        hasRows={groups.length > 0}
        empty={groups.length === 0}
        noun="clients"
        skeleton="card"
        emptyTitle={list.rows.length === 0 ? 'No clients to check' : 'No duplicates found'}
        emptyMessage={
          list.rows.length === 0
            ? 'The client directory returned no clients, so there is nothing to scan for duplicates.'
            : `Every one of the ${checkedCount} active client records has a distinct phone, email, PAN and name. Nothing needs merging right now.`
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              money={money}
              onRequestMerge={(survivorId) => setPendingMerge({ group: g, survivorId })}
            />
          ))}
        </div>
      </PageBody>

      <FooterNote extra={['Merging closes a record — Law 3: nothing is deleted, every entity has a named terminal action']} />

      <Modal
        isOpen={!!pendingMerge}
        onClose={() => setPendingMerge(null)}
        title="Merge these clients?"
        subtitle="This closes every record except the one you selected — marked merged, never deleted. Each record is merged one at a time; if one is refused the rest are left alone and this page says exactly which landed."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button variant="secondary" onClick={() => setPendingMerge(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={merging}
              onClick={() => {
                void confirmMerge()
              }}
            >
              Confirm Merge
            </Button>
          </div>
        }
      >
        {pendingMerge && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
              <Icon name="checklist" size={15} style={{ color: 'var(--success-text)' }} />
              <span>
                <strong>{pendingMerge.group.clients.find((c) => c.id === pendingMerge.survivorId)?.name}</strong> survives
              </span>
            </div>
            {pendingMerge.group.clients
              .filter((c) => c.id !== pendingMerge.survivorId)
              .map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', color: 'var(--text2)' }}>
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
