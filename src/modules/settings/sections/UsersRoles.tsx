import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Page'
import { DataTableShell } from '../../../components/ui/DataTable'
import { thStyle as th } from '../../../components/ui/TableHeaderCell'
import {
  canViewMoney,
  canRecordPayment,
  canVoidInvoice,
  canOverrideCreditLimit,
  canPerformOperations,
  canManageSettings,
  isStaff,
} from '../../../lib/rbac'
import type { SystemRole } from '../../../types/database'
import { BRANCHES } from '../../../lib/queries/settings'
import { ToneChip, td } from './shared'
import { StaffDirectoryCard } from './StaffDirectory'

/**
 * **Settings ▸ Users & Roles** — §11.2: *"user list, role assignment, the
 * 9-role matrix"*.
 *
 * The matrix is **computed by `lib/rbac`**, never transcribed. Every cell calls
 * the same function the screens call, which mirrors migration 0014 — so this
 * table cannot claim a capability that RLS denies, or the reverse.
 */

const ROLES: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']

const CAPABILITIES: Array<{ label: string; note: string; test: (r: SystemRole) => boolean }> = [
  { label: 'Staff surface', note: 'Client is external — portal only.', test: isStaff },
  { label: 'See money', note: 'Warehouse, Technician, Driver and Client see none, anywhere.', test: canViewMoney },
  { label: 'Record payment', note: 'Advances and security deposits.', test: (r) => canRecordPayment(r) },
  { label: 'Void invoice', note: 'Corrections are reversal rows, never edits.', test: (r) => canVoidInvoice(r) },
  /* The 'Approve 15% discount' row left this matrix on 31 Aug 2026 — the
     discount gate is gone (D3, Babin: "don't put any gate on discount"), so
     there is no approval capability to compare roles by. A row every role
     passes is a row that says nothing. */
  { label: 'Override credit limit', note: 'Book past a client’s ceiling.', test: (r) => canOverrideCreditLimit(r) },
  { label: 'Run operations', note: 'Pack, handover, return, reset.', test: canPerformOperations },
  { label: 'Manage settings', note: 'This screen, and everything under it.', test: canManageSettings },
]

export function UsersPane() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      {/*
        First, because it is the task. The matrix below it is reference material
        — an operator arrives on this tab to act on a person, not to read the
        9-role grid, and the grid was the only thing here until 24 Aug 2026.
      */}
      <StaffDirectoryCard />

      <Card
        title="Permissions Matrix"
        action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{/* Computed live from lib/rbac — not a copy of it */}Permissions for each role </span>}
      >
        <DataTableShell ariaLabel="Permissions matrix" data-table-scroll style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--card)' }}>Capability</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ ...th, textAlign: 'center' }}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--card)' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{c.label}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 1 }}>{c.note}</span>
                  </td>
                  {ROLES.map((r) => {
                    const ok = c.test(r)
                    return (
                      <td key={r} style={{ ...td, textAlign: 'center' }}>
                        {/* Law 11 — never colour alone; glyph and word together. */}
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--sp-xs)',
                            fontSize: 'var(--t-th)',
                            fontWeight: 700,
                            color: ok ? 'var(--success-text)' : 'var(--muted)',
                          }}
                        >
                          <Icon name={ok ? 'check' : 'close'} size={13} fill />
                          {ok ? 'Yes' : 'No'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 'var(--sp-md)' }}>
        <Card title="Roles">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {ROLES.map((r) => (
              <div
                key={r}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flex: 1 }}>{r}</span>
                {canViewMoney(r) ? (
                  <ToneChip tone="primary" icon="dollar">
                    Sees money
                  </ToneChip>
                ) : (
                  <ToneChip tone="neutral" icon="eye">
                    Money-blind
                  </ToneChip>
                )}
                {!isStaff(r) && (
                  <ToneChip tone="progress" icon="external_link">
                    External
                  </ToneChip>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Branch managers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {BRANCHES.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                    {b.manager}
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    {b.name} · {b.staff} staff
                  </span>
                </span>
                <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  {b.code}
                </span>
              </div>
            ))}
            {/*
              Narrowed twice. 24 Aug 2026: the first two clauses stopped being
              true when `Staff Directory` above started reading
              `staff_directory_v`. 8 Sep 2026 (RULING R-27): the third stopped
              being true as well — the ruling exists (Owner, mirroring this
              card's own read gate) and `0101` built the write path, so the
              directory can now assign a role and deactivate an account.

              What survives is the part that was never about a ruling:
              CREATION. A `users` row with no `auth.users` identity cannot sign
              in, and minting one needs the admin API and therefore the service
              key — a complete authorization bypass in a browser. That needs an
              Edge Function, and `0101` deliberately opens no INSERT path, so
              nothing here can half-create a person.
            */}
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
              These are the managers named on the branch records. Assigning a role and deactivating an account are
              done in the Staff Directory above — Owner only, and every change is written to the audit trail.
              <strong> Creating</strong> a staff account is still unbuilt: a{' '}
              <span className="identifier">users</span> row with no sign-in account behind it cannot be used, and
              minting one needs a server-side key this app deliberately never holds.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
