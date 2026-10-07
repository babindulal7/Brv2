import type { RefObject, MutableRefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import { Input, Select } from '../../../components/ui'
import { Field, Section, AddClientButton, inputStyle } from './BookingFormWidgets'
import { ClientCombobox } from './ClientCombobox'
import { ClientHealthEye } from './ClientHealthChip'
import { IntelCard } from '../../../components/ui/IntelCard'
import { clientGlance, clientDetailGroups } from '../../../data/clientIntel'
import { PROJECT_TYPES, validateProjectType } from '../../../lib/projectTypes'
import { formatMoney } from '../../../lib/money'
import type { ClientRecord } from '../../../lib/queries/clients'
import type { ClientHealthVerdict } from './clientHealth'
import type { GateContext } from '../../../lib/fieldGating'
import type { AuthUser } from '../../../lib/auth'

export interface BookingClientSectionProps {
  open: boolean
  onToggle: () => void
  client: ClientRecord | undefined
  clientPool: readonly ClientRecord[]
  selectedClientId: string | null
  clientFieldTouched: boolean
  setClientFieldTouched: (touched: boolean) => void
  addClientOpen: boolean
  selectClient: (c: ClientRecord) => void
  openAddClient: () => void
  quickViewOpen: boolean
  setQuickViewOpen: (fn: (o: boolean) => boolean) => void
  health: ClientHealthVerdict | null
  days: number
  dayWord: string
  canClientBalance: boolean
  canBookingMoney: boolean
  gctx: GateContext
  user: AuthUser | null
  onOpenHistory: () => void
  suppressClientListOnFocus: MutableRefObject<boolean>
  clientFieldRef: RefObject<HTMLDivElement | null>
  navigate: NavigateFunction
  isPhone: boolean
  project: string
  setProject: (p: string) => void
  kind: string
  setKind: (k: string) => void
  kindOther: string
  setKindOther: (o: string) => void
  govId: string
  setGovId: (id: string) => void
  title?: string
}

export function BookingClientSection({
  open,
  onToggle,
  client,
  clientPool,
  selectedClientId,
  clientFieldTouched,
  setClientFieldTouched,
  addClientOpen,
  selectClient,
  openAddClient,
  quickViewOpen,
  setQuickViewOpen,
  health,
  days,
  dayWord,
  canClientBalance,
  canBookingMoney,
  gctx,
  user,
  onOpenHistory,
  suppressClientListOnFocus,
  clientFieldRef,
  navigate,
  isPhone,
  project,
  setProject,
  kind,
  setKind,
  kindOther,
  setKindOther,
  title = 'Client & Schedule',
}: BookingClientSectionProps) {
  return (
    <Section
      id="section-0"
      title={title}
      badge={
        client ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-success-bg)',
              color: 'var(--st-success-fg)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Icon name="check" size={11} /> {client.name}
          </span>
        ) : null
      }
      open={open}
      onToggle={onToggle}
      summary={client ? `${client.name} · ${days} ${dayWord}` : 'No client selected'}
    >
      {/* User accepted required-field clarity, 7 Oct: match confirmation gates. */}
      <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>* Required to confirm</p>
      <Field label="Client *" labelId="new-rental-client-label">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <div
            ref={clientFieldRef as RefObject<HTMLDivElement>}
            onBlur={(e) => {
              if (addClientOpen) return
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClientFieldTouched(true)
            }}
            style={{ flex: '1 1 260px', minWidth: 0 }}
          >
            <ClientCombobox
              clients={clientPool}
              selectedClientId={selectedClientId}
              onSelect={selectClient}
              onCreateNew={openAddClient}
              onViewAll={() => navigate('/clients')}
              inputStyle={inputStyle}
              labelledBy="new-rental-client-label"
              required
              showOutstanding={canClientBalance}
              suppressNextFocusOpen={suppressClientListOnFocus}
              // User ruling, 7 Oct: history is an icon inside client search.
              inputAction={client ? (
                <button
                  type="button"
                  className="press"
                  aria-label="Client History"
                  title="Client History"
                  onClick={onOpenHistory}
                  style={{ width: 44, minHeight: 44, display: 'grid', placeItems: 'center', padding: 0, border: 'none', borderRadius: 'var(--r-btn)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
                >
                  <Icon name="activity" size={18} />
                </button>
              ) : undefined}
              {...(client || !clientFieldTouched
                ? {}
                : { error: 'Select a client before confirming this booking.' })}
              trailing={
                client && health ? (
                  <ClientHealthEye
                    verdict={health}
                    clientName={client.name}
                    open={quickViewOpen}
                    controls="new-rental-client-quick-view"
                    onClick={() => setQuickViewOpen((o) => !o)}
                  />
                ) : (
                  <AddClientButton onClick={openAddClient} />
                )
              }
            />
            {client?.dbId && (
              <div style={{ marginTop: 8 }}>
                <IntelCard
                  glance={clientGlance(client, gctx)}
                  detail={clientDetailGroups(client, gctx)}
                  detailTitle={client.name}
                  entityType="client"
                  entityId={client.dbId}
                  context="new-rental"
                  gateContext={gctx}
                  actionContext={user ? { userId: user.id, role: user.role } : null}
                >
                  <span className="identifier" style={{ color: 'var(--link)', fontWeight: 600 }}>{client.name}</span>
                </IntelCard>
              </div>
            )}
          </div>
        </div>

        {client && (client.isBlocked || client.onStop || (canBookingMoney && client.outstandingPaisa > 0) || health?.level === 'attention') && (
          <div
            role="alert"
            data-testid="client-credit-warning"
            style={{
              marginTop: 10,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md, 8px)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: (client.isBlocked || client.onStop) ? 'var(--danger-bg, #fef2f2)' : 'var(--warning-bg, #fffbeb)',
              border: `1px solid ${(client.isBlocked || client.onStop) ? 'var(--danger-border, #fca5a5)' : 'var(--warning-border, #fcd34d)'}`,
              color: (client.isBlocked || client.onStop) ? 'var(--danger-text, #991b1b)' : 'var(--warning-text, #92400e)',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <Icon
              name={(client.isBlocked || client.onStop) ? 'alert_circle' : 'alert_triangle'}
              size={18}
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {(client.isBlocked || client.onStop) ? 'Client Account Blocked' : 'Client Credit Warning'}
              </div>
              <div>
                {(client.isBlocked || client.onStop)
                  ? (client.blockReason || client.onStop?.reason || 'This client is currently blocked from equipment rentals. Quotation and booking confirmation cannot proceed without manager override.')
                  : (health?.reasons?.map((r) => r.text).join(' · ') || `Client has outstanding balance of ${formatMoney(client.outstandingPaisa)}.`)}
              </div>
            </div>
          </div>
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 11, marginTop: 11 }}>
        <Field label="Project">
          <Input value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} />
        </Field>
        <Field
          label="Project Type *"
          error={
            kind.trim() !== ''
              ? (validateProjectType(kind, kindOther).message ?? undefined)
              : undefined
          }
        >
          <Select
            aria-label="Project type"
            required
            value={kind}
            placeholder="Select project type"
            options={PROJECT_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={(e) => {
              const next = e.target.value
              setKind(next)
              if (next !== 'Other') setKindOther('')
            }}
            style={inputStyle}
          />
        </Field>
        {kind === 'Other' && (
          <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
            <Field label="Specify Project Type *">
              <Input
                value={kindOther}
                aria-required="true"
                onChange={(e) => setKindOther(e.target.value)}
                placeholder="e.g. Live Theatre Production"
                style={inputStyle}
              />
            </Field>
          </div>
        )}
      </div>
    </Section>
  )
}
