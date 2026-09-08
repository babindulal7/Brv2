import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Page'
import { Button } from '../../../components/ui/Page'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { ErrorBanner, EmptyState, LoadingSkeleton, RestrictedState } from '../../../components/ui/StateViews'
import { Unavailable } from '../../../components/ui/Unavailable'
import { useToast } from '../../../components/ui/Toast'
import { thStyle as th } from '../../../components/ui/TableHeaderCell'
import { useAuth } from '../../../lib/auth'
import { canManageSettings } from '../../../lib/rbac'
import { useTabularLayout } from '../../../lib/device'
import {
  fetchStaffDirectory,
  revokeStaffPinFor,
  recordPasswordResetRequest,
  setStaffRole,
  setStaffActive,
} from '../../../lib/queries/staff'
import type { StaffDirectoryRow } from '../../../lib/queries/staff'
import type { SystemRole } from '../../../types/database'
import { ToneChip, td } from './shared'

/**
 * **Settings ▸ People ▸ Staff Directory.**
 *
 * The operator half of credential recovery, and the app's first staff list.
 * Reads `queries/staff.ts` → `staff_directory_v` (0067).
 *
 * ## What this screen can and cannot do to a credential
 *
 * It can cause a reset link to be emailed to the address already on a staff
 * row, and it can revoke a PIN. That is the whole surface, and the boundary is
 * deliberate:
 *
 *   * **It cannot set a password.** GoTrue's admin API can, and it needs the
 *     service key — which in a browser is, in the README's and the Dockerfile's
 *     identical words, *"a complete authorization bypass"*, because RLS is the
 *     authorization layer and a service key ignores it. So the reset path is
 *     `resetPasswordForEmail`, which needs only the anon key.
 *   * **It cannot see a credential.** No PIN hash is readable by any role
 *     (0066), and a password never was.
 *
 * The operator's authority is therefore "cause a link to be sent to an address
 * I can already see", which is both sufficient for the job and impossible to
 * misuse into learning someone's password.
 *
 * ## Why the button says "Send reset link" and the toast does not say "sent"
 *
 * `resetPasswordForEmail` answers identically whether or not the address has an
 * account — deliberately, so it is not an enumeration oracle. `auth.tsx`'s
 * comment on it is explicit that **the screen must not say "we sent you an
 * email"**, because it cannot know. So the toast reports what was requested,
 * not what arrived.
 *
 * The one thing this screen CAN know is whether an account exists at all —
 * `hasAuthAccount`, from a join no browser can perform — and a row without one
 * has its reset action disabled with the reason stated, rather than offering a
 * button whose failure is invisible.
 *
 * ## Scope
 *
 * Read, reset, revoke, **assign a role and deactivate an account**.
 *
 * The last two arrived 8 Sep 2026 with `0101` and R-27. The Scope paragraph
 * here used to say they "belong with a ruling rather than with this card" —
 * that ruling is now made (Owner only, mirroring this card's own read gate) and
 * the write path exists, so the sentence would be false if it stayed.
 *
 * **User CREATION is still out of scope, and not for want of a ruling.** A
 * `users` row with no `auth.users` identity behind it cannot sign in, and
 * minting the identity needs GoTrue's admin API and therefore the service key —
 * which in a browser is a complete authorization bypass, as the paragraph above
 * says about passwords. It needs an Edge Function. Until then `0101` opens no
 * INSERT path at all, so this card cannot half-create anybody.
 */

const ROLE_FILTERS: Array<SystemRole | 'All'> = [
  'All',
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
  'Technician',
  'Accounts',
  'Driver',
]

/**
 * The roles this card may assign. `Client` is deliberately absent: it is the
 * portal role, `auth_user_role()` returns it precisely when the caller has NO
 * staff row, and `set_staff_role` (0101) refuses it. Offering a value the
 * database will reject is a button that fails — the UI is narrower than the DB
 * here, which is the direction P3 allows.
 */
const ASSIGNABLE_ROLES: SystemRole[] = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
  'Technician',
  'Accounts',
  'Driver',
]

type StatusFilter = 'active' | 'inactive' | 'all'

/** What the confirm dialog is about to do, once the Owner has agreed to it. */
type PendingChange =
  | { kind: 'role'; row: StaffDirectoryRow; role: SystemRole }
  | { kind: 'active'; row: StaffDirectoryRow; active: boolean }

/**
 * How long before the same person can be sent another reset link.
 *
 * A client-side courtesy, not a control: GoTrue enforces the real rate limit and
 * this cannot be trusted by anything. It exists to stop a double-click and the
 * impatient second send, and to make the *reason* visible — a bare GoTrue
 * "email rate limit exceeded" arriving 400ms after a click reads as a bug.
 */
const THROTTLE_MS = 60_000

const selectStyle = {
  minHeight: 44,
  padding: '0 10px',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
} as const

/** Password / Password + PIN / PIN locked — glyph and word, never colour alone (Law 11). */
function CredentialChip({ row }: { row: StaffDirectoryRow }) {
  if (!row.hasAuthAccount) {
    return (
      <ToneChip tone="danger" icon="alert_triangle">
        No sign-in account
      </ToneChip>
    )
  }
  if (row.pinLockedUntil && new Date(row.pinLockedUntil).getTime() > Date.now()) {
    return (
      /* `progress` (yellow), not `danger`. A PIN lockout lapses on its own in
         fifteen minutes and the password still works throughout — it is a
         temporary condition, not the alarm state that "no sign-in account"
         above genuinely is. §07: colour carries state, and these two states
         are not the same. */
      <ToneChip tone="progress" icon="lock">
        PIN locked
      </ToneChip>
    )
  }
  if (row.hasPin) {
    return (
      <ToneChip tone="primary" icon="check">
        Password + PIN
      </ToneChip>
    )
  }
  return (
    <ToneChip tone="neutral" icon="lock">
      Password
    </ToneChip>
  )
}

export function StaffDirectoryCard() {
  const { user, requestPasswordReset } = useAuth()
  const { showSuccessToast } = useToast()
  const tabular = useTabularLayout()

  const [rows, setRows] = useState<StaffDirectoryRow[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'unavailable' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [role, setRole] = useState<SystemRole | 'All'>('All')
  const [status, setStatus] = useState<StatusFilter>('active')

  const [confirming, setConfirming] = useState<StaffDirectoryRow | null>(null)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /**
   * Per-row throttle. Keyed by id, holding the epoch ms of the last request.
   *
   * Deliberately in memory only: it exists to stop a double-click and an
   * impatient second send, not to be an authority. GoTrue enforces the real
   * rate limit, and a persisted client-side clock would be both wrong after a
   * refresh and pointless against anyone who cared to bypass it.
   */
  const [lastSent, setLastSent] = useState<Record<string, number>>({})

  /*
   * A ticking clock, and it is load-bearing rather than decorative.
   *
   * The throttle is computed from `Date.now()` during render, so without
   * something to schedule a re-render the button would stay disabled after its
   * 60 seconds elapsed — until the operator happened to type in the search box
   * or change a filter. "Wait 12s" that then never re-arms reads as a broken
   * button, and the only recovery is an unrelated interaction nobody would
   * think to try.
   *
   * The interval runs ONLY while a throttle is outstanding, so an idle
   * directory schedules nothing.
   */
  const throttleActive = Object.keys(lastSent).length > 0

  useEffect(() => {
    if (!throttleActive) return
    const id = window.setInterval(() => {
      // Prunes rather than merely re-rendering, so the map empties, this effect
      // re-runs with `throttleActive` false, and the interval stops. A bare
      // tick counter would keep a 1-second timer alive for the rest of the
      // session after a single reset.
      setLastSent((prev) => {
        const cutoff = Date.now() - THROTTLE_MS
        const next = Object.fromEntries(Object.entries(prev).filter(([, at]) => at > cutoff))
        return Object.keys(next).length === Object.keys(prev).length ? prev : next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [throttleActive])

  /*
   * The role gate is read here, not only at the render branch below.
   *
   * Hooks run before an early `return`, so a `canManageSettings` check placed
   * only at the JSX would still have fired this query for every Manager,
   * Coordinator and Driver who opened the People tab — a request that
   * `staff_directory_v`'s inline predicate answers with zero rows.
   *
   * Not a security hole; the view is the boundary and it holds. But it is a
   * pointless round trip on every tab visit, and worse, it made the UI gate
   * look like it did something it did not. Caught by the test that asserts a
   * Manager's mount issues no read at all.
   */
  const mayRead = Boolean(user && canManageSettings(user.role))

  const load = useCallback(async () => {
    if (!mayRead) return
    setState('loading')
    const result = await fetchStaffDirectory()

    if (result.kind === 'ok') {
      setRows(result.rows)
      setState('ok')
      setMessage(null)
      return
    }
    setMessage(result.message)
    setState(result.kind === 'unavailable' ? 'unavailable' : 'error')
  }, [mayRead])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (role !== 'All' && r.primaryRole !== role) return false
      if (status === 'active' && !r.isActive) return false
      if (status === 'inactive' && r.isActive) return false
      if (!needle) return true
      return (
        r.fullName.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        (r.employeeCode ?? '').toLowerCase().includes(needle)
      )
    })
  }, [rows, search, role, status])

  const sendReset = useCallback(async () => {
    if (!confirming) return
    setSubmitting(true)
    const { error } = await requestPasswordReset(confirming.email)
    setSubmitting(false)

    if (error) {
      setMessage(error)
      setState('error')
      setConfirming(null)
      return
    }

    setLastSent((prev) => ({ ...prev, [confirming.id]: Date.now() }))

    /*
     * Audit AFTER the link is requested, and its failure does not undo anything.
     *
     * The GoTrue call has already happened by this point — that side effect
     * cannot be rolled back, so reporting the whole action as failed would tell
     * the operator nothing happened when something did. The row is surfaced as
     * a separate, quieter problem: the reset worked, the record of it did not.
     */
    const { error: auditError } = await recordPasswordResetRequest(confirming.id)
    if (auditError) {
      setMessage(
        `The reset link was requested for ${confirming.email}, but it could not be written to the audit ` +
          `trail: ${auditError}. The link is still on its way; the record of who asked for it is missing.`,
      )
      setState('error')
    }
    /*
     * "Requested", not "sent". See the header — and `auth.tsx`'s comment on
     * requestPasswordReset, which is the authority: a null error does not mean
     * an email was sent, and a screen that claims otherwise is reporting an
     * outcome it did not verify.
     */
    showSuccessToast(
      'Reset link requested',
      `Supabase will email ${confirming.email} if that address still has an account. ` +
        'It cannot confirm delivery, so check with them rather than assuming it arrived.',
    )
    setConfirming(null)
  }, [confirming, requestPasswordReset, showSuccessToast])

  const revokePin = useCallback(
    async (row: StaffDirectoryRow) => {
      const { error } = await revokeStaffPinFor(row.id)
      if (error) {
        setMessage(error)
        setState('error')
        return
      }
      showSuccessToast('PIN revoked', `${row.fullName || row.email} will need a password to sign in.`)
      void load()
    },
    [showSuccessToast, load],
  )

  /*
   * The id of the only active Owner, when there is exactly one.
   *
   * `set_staff_role` and `set_staff_active` (0101) both refuse to leave the
   * Owner set empty — role administration is Owner-only, so zero Owners is not
   * a state anything inside the app could recover from. This recomputes the
   * same rule from the rows already on screen so the control is disabled with
   * the reason visible, rather than offered and then refused by the server.
   *
   * It is a courtesy, not the control. The database is the control, and this
   * can only ever be equal to or narrower than it (P3).
   */
  const soleActiveOwnerId = useMemo(() => {
    const owners = rows.filter((r) => r.primaryRole === 'Owner' && r.isActive)
    return owners.length === 1 ? (owners[0]?.id ?? null) : null
  }, [rows])

  const applyPending = useCallback(async () => {
    if (!pending) return
    setSubmitting(true)
    const { error } =
      pending.kind === 'role'
        ? await setStaffRole(pending.row.id, pending.role)
        : await setStaffActive(pending.row.id, pending.active)
    setSubmitting(false)

    if (error) {
      /* Surfaced inline, never as a toast. Law 11: toasts are for successes,
         and a refused role change is exactly the case where the operator needs
         the database's own sentence — 0101's refusals name the reason. */
      setMessage(error)
      setState('error')
      setPending(null)
      return
    }

    const who = pending.row.fullName || pending.row.email
    showSuccessToast(
      pending.kind === 'role' ? 'Role assigned' : pending.active ? 'Account reactivated' : 'Account deactivated',
      pending.kind === 'role'
        ? `${who} is now ${pending.role}. The change is in the audit trail as a Permission Changed event.`
        : pending.active
          ? `${who} can use the app again.`
          : `${who} loses the app immediately. Their sign-in account is untouched — deactivating here does not revoke it.`,
    )
    setPending(null)
    void load()
  }, [pending, showSuccessToast, load])

  // Owner alone, matching the view's inline predicate. Rendered as `restricted`
  // rather than `empty` — a non-Owner gets zero rows from the view, and an
  // empty table would read as "this desk has no staff".
  if (!mayRead) {
    return (
      <Card title="Staff Directory">
        <RestrictedState
          reason="The staff directory shows every colleague's email and credential state, so it is limited to the Owner."
          requiredRole="Owner"
        />
      </Card>
    )
  }

  const throttleRemaining = (row: StaffDirectoryRow): number => {
    const at = lastSent[row.id]
    if (at === undefined) return 0
    return Math.max(0, Math.ceil((THROTTLE_MS - (Date.now() - at)) / 1000))
  }

  /**
   * The role control. A `select` rather than a menu because it is the same
   * shape as the filter beside it and the value set is fixed and small.
   *
   * RULING 2026-09-08 (R-27): Owner assigns; nobody else reaches this card at
   * all. Revert: delete this function and render `{row.primaryRole}` again.
   */
  const renderRoleControl = (row: StaffDirectoryRow) => {
    const isSoleOwner = soleActiveOwnerId === row.id

    if (isSoleOwner) {
      return (
        <Unavailable reason="This is the last active Owner. Changing their role would leave nobody who can assign roles — that is Owner-only, so the system could not be recovered from inside itself. Promote another Owner first.">
          <span>{row.primaryRole}</span>
        </Unavailable>
      )
    }

    return (
      <select
        value={row.primaryRole}
        onChange={(e) => setPending({ kind: 'role', row, role: e.target.value as SystemRole })}
        aria-label={`Role for ${row.fullName || row.email}`}
        style={{ ...selectStyle, minWidth: 132 }}
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    )
  }

  const renderActions = (row: StaffDirectoryRow) => {
    const remaining = throttleRemaining(row)
    const isSoleOwner = soleActiveOwnerId === row.id

    return (
      <span style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!row.hasAuthAccount ? (
          <Unavailable reason="This staff row has no Supabase sign-in account, so there is nothing for a reset link to reach. Create the account with a matching id first — 0041's identity contract is auth.users.id IS users.id, and 0060's header explains what happens when it is not.">
            <Button variant="secondary" disabled>
              Send reset link
            </Button>
          </Unavailable>
        ) : !row.isActive ? (
          <Unavailable reason="This staff row is inactive. Reactivate it before restoring sign-in — a deactivated identity resolves to Client in every RLS policy, so a working password would still see nothing.">
            <Button variant="secondary" disabled>
              Send reset link
            </Button>
          </Unavailable>
        ) : remaining > 0 ? (
          <Unavailable reason={`A reset link was just requested for this person. Wait ${remaining}s before requesting another — GoTrue rate-limits repeats, and a second link invalidates the first.`}>
            <Button variant="secondary" disabled>
              Send reset link
            </Button>
          </Unavailable>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(row)}>
            Send reset link
          </Button>
        )}

        {row.hasPin && (
          <Button variant="ghost" onClick={() => void revokePin(row)}>
            Revoke PIN
          </Button>
        )}

        {/* Deactivate is the terminal action for a staff row — Law 3, nothing is
            deleted. It is last in the group and `ghost`, so it does not read as
            the primary move on a directory whose everyday job is a reset. */}
        {isSoleOwner ? (
          <Unavailable reason="This is the last active Owner. Deactivating them would leave nobody who can reactivate anyone, and that is Owner-only. Promote another Owner first.">
            <Button variant="ghost" disabled>
              Deactivate
            </Button>
          </Unavailable>
        ) : (
          <Button variant="ghost" onClick={() => setPending({ kind: 'active', row, active: !row.isActive })}>
            {row.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        )}
      </span>
    )
  }

  return (
    <>
      <Card
        title="Staff Directory"
        action={
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            {state === 'ok' ? `${filtered.length} of ${rows.length}` : 'staff_directory_v'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {/* Filters stay usable in the error state — the retry is not the only move. */}
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email or employee code"
              aria-label="Search staff"
              style={{ ...selectStyle, flex: 1, minWidth: 200 }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as SystemRole | 'All')}
              aria-label="Filter by role"
              style={selectStyle}
            >
              {ROLE_FILTERS.map((r) => (
                <option key={r} value={r}>
                  {r === 'All' ? 'All roles' : r}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filter by status"
              style={selectStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>

          {state === 'loading' && <LoadingSkeleton rows={5} />}

          {state === 'unavailable' && message && (
            <ErrorBanner title="Directory unavailable here" message={message} />
          )}

          {state === 'error' && message && (
            <ErrorBanner title="Could not load the staff directory" message={message} onRetry={() => void load()} />
          )}

          {state === 'ok' && filtered.length === 0 && (
            <EmptyState
              title="No staff match this search"
              description="Clear the filters to see every staff row the directory returns."
              actionLabel="Clear filters"
              onAction={() => {
                setSearch('')
                setRole('All')
                setStatus('active')
              }}
            />
          )}

          {state === 'ok' && filtered.length > 0 && tabular && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={th}>Person</th>
                    <th style={th}>Email</th>
                    <th style={th}>Role</th>
                    <th style={th}>Branch</th>
                    <th style={th}>Credentials</th>
                    <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>
                        <span style={{ display: 'block', fontWeight: 600 }}>
                          {r.fullName || <span style={{ color: 'var(--muted)' }}>No name on the staff row</span>}
                        </span>
                        <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                          {r.employeeCode ?? '—'}
                          {!r.isActive && ' · Inactive'}
                        </span>
                      </td>
                      {/* Shown because it IS the reset destination — an operator
                          deciding whether to send needs to see where it goes. */}
                      <td style={td}>{r.email}</td>
                      <td style={td}>{renderRoleControl(r)}</td>
                      <td style={td}>{r.branchCode ?? '—'}</td>
                      <td style={td}>
                        <CredentialChip row={r} />
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{renderActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state === 'ok' && filtered.length > 0 && !tabular && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {filtered.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--sp-sm)',
                    padding: 'var(--sp-md) 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                      {r.fullName || 'No name on the staff row'}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                      {r.primaryRole} · {r.employeeCode ?? '—'} · {r.branchCode ?? '—'}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{r.email}</span>
                  </span>
                  <CredentialChip row={r} />
                  {renderRoleControl(r)}
                  {renderActions(r)}
                </div>
              ))}
            </div>
          )}

          <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
            <Icon name="lock" size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            No credential is readable here. A reset emails a link to the address on the row; nobody at this desk
            chooses or sees a password, and no PIN hash is readable by any role including Owner.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => void sendReset()}
        title="Send a password reset link?"
        confirmLabel="Send reset link"
        isSubmitting={submitting}
        description={
          confirming && (
            <>
              <p style={{ margin: '0 0 8px' }}>
                Supabase will email a reset link to <strong>{confirming.email}</strong> — the address on{' '}
                <strong>{confirming.fullName || 'this staff row'}</strong>&rsquo;s record.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                The link goes to them, not to you. You will not see or choose their new password, and their current
                one keeps working until they use the link.
              </p>
              <p style={{ margin: 0, color: 'var(--text2)' }}>
                Supabase cannot confirm delivery — it answers the same way for an address with an account and one
                without — so this screen will say the link was requested, never that it arrived.
              </p>
            </>
          )
        }
      />

      {/* A role change and a deactivation both get a confirm step. Not ceremony:
          each writes a Critical-or-High audit row under the operator's name, and
          a role select is one mis-click away from making somebody an Owner. */}
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void applyPending()}
        title={
          pending?.kind === 'role'
            ? `Assign the ${pending.role} role?`
            : pending?.active
              ? 'Reactivate this staff account?'
              : 'Deactivate this staff account?'
        }
        confirmLabel={pending?.kind === 'role' ? 'Assign role' : pending?.active ? 'Reactivate' : 'Deactivate'}
        isSubmitting={submitting}
        description={
          pending && (
            <>
              <p style={{ margin: '0 0 8px' }}>
                <strong>{pending.row.fullName || pending.row.email}</strong>
                {pending.kind === 'role' ? (
                  <>
                    {' '}
                    moves from <strong>{pending.row.primaryRole}</strong> to <strong>{pending.role}</strong>.
                  </>
                ) : pending.active ? (
                  ' regains access to the app.'
                ) : (
                  ' loses access to the app.'
                )}
              </p>

              {pending.kind === 'role' && pending.role === 'Owner' && (
                <p style={{ margin: '0 0 8px' }}>
                  Owner is the whole system: settings, user administration, and every approval above a threshold.
                  There is no higher role to undo it from except another Owner.
                </p>
              )}

              {pending.kind === 'role' && ['Warehouse', 'Technician', 'Driver'].includes(pending.role) && (
                <p style={{ margin: '0 0 8px' }}>
                  {pending.role} is money-blind. Every rupee figure disappears from their screens — not greyed out,
                  omitted — including on rentals they are working.
                </p>
              )}

              {pending.kind === 'active' && !pending.active && (
                <p style={{ margin: '0 0 8px' }}>
                  This does <strong>not</strong> revoke their sign-in. The password and any PIN keep working; what
                  they lose is the app, because an inactive identity resolves to Client in every policy. Revoking the
                  account itself needs the Supabase admin API, which this screen deliberately cannot reach.
                </p>
              )}

              <p style={{ margin: 0, color: 'var(--text2)' }}>
                Recorded in the audit trail against your name, with the before and after values.
              </p>
            </>
          )
        }
      />
    </>
  )
}
