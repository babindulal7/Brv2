import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, SummaryRows } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EditableRows } from '../../components/ui/EditableRows'
import type { EditableRowDef } from '../../components/ui/EditableRows'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { useClientProfile } from '../../lib/queries/useClients'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import { listBookings, type BookingListRow } from '../../lib/queries/bookings'
import { listInvoices, invoicesForClient, financeRestriction, type InvoiceListRow } from '../../lib/queries/finance'
import { useEditMode } from '../../lib/edit/useEditMode'
import type { FieldSpec } from '../../lib/edit/useEditMode'
import { validateDiscount } from '../../lib/discount'
import { statusToken } from '../../lib/workflow'
import { formatAd } from '../../lib/bs'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewPII, canViewOnStopReason, moneyScope } from '../../lib/fieldGating'
import { STATUS } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { TIER_TONE, type ClientRecord } from '../../data/clients'
import { INVOICE_TOKEN } from '../../data/invoiceIntel'

/**
 * Client Detail — the confirmed gap named by three sources this session (the
 * audit reconciliation, the earlier design pack, and a direct grep for
 * `/clients/:id`): `ClientsDirectory.tsx` only ever showed a right-rail quick
 * view, never a full page. This is that page.
 *
 * ## This page reads the database, and had to
 *
 * It used to be `CLIENTS_DATA.find((c) => c.id === id)`, and that was not merely
 * unconverted — it was **broken the moment the directory started reading the
 * database**. Every row in that table links to `/clients/${client.id}`, where
 * `id` is `client_code` from `client_directory_v`; `CLIENTS_DATA`'s ids are
 * `C-1`…`C-n`. So a real client's row led to "Client not found", and a seed id
 * that happened to collide would have led to a DIFFERENT client's record —
 * exactly the two-screens-disagree-about-one-record failure Law 2's Single Query
 * Rule exists to prevent.
 *
 * ## Three cross-references were seed joins, and are now queries or gaps
 *
 * The rentals, invoices and documents tabs each used to filter a hand-typed
 * array by `client.activeBookings` — a field the database mapper cannot fill
 * (`toClientRecord` returns `[]` for it, deliberately), so every one of those
 * joins would have matched nothing on a real client anyway while continuing to
 * show seed rows for a seed one. Rentals and invoices now run real queries
 * (`listBookings`, `listInvoices`) keyed on `clients.id`. Documents have no
 * query module yet, and the tab says so rather than filtering a seed.
 */

type TabKey = 'overview' | 'rentals' | 'payments' | 'documents' | 'notes' | 'activity'

interface TabDef {
  key: TabKey
  label: string
  money?: boolean
}

const TAB_DEFS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'rentals', label: 'Rentals' },
  { key: 'payments', label: 'Payments', money: true },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
]

function Tone({ text, tone }: { text: string; tone: keyof typeof STATUS }) {
  const c = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 21,
        padding: '0 8px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        border: c.border ? `1px solid ${c.border}` : undefined,
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * `useEditMode` addresses fields by flat key, and `contactPerson` is a nested
 * object on `ClientRecord`. Rather than teach the hook about paths — which
 * would put a tiny expression language in the middle of every save — the record
 * is flattened on the way in and folded back on the way out. The three
 * `contact_*` keys below are the only place the two shapes differ.
 */
function toEditable(c: ClientRecord) {
  const { contactPerson, ...flat } = c
  return {
    ...flat,
    contact_name: contactPerson.name,
    contact_designation: contactPerson.designation,
    contact_phone: contactPerson.phone,
  }
}

/** Folds a patch of flat keys back into the record's real shape. */
function applyPatch(c: ClientRecord, patch: Record<string, unknown>): ClientRecord {
  const next: ClientRecord = { ...c, contactPerson: { ...c.contactPerson } }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'contact_name') next.contactPerson.name = String(v)
    else if (k === 'contact_designation') next.contactPerson.designation = String(v)
    else if (k === 'contact_phone') next.contactPerson.phone = String(v)
    /* `ClientRecord` is an interface, so it has no implicit index signature —
       the double cast is the narrowest way to write a key the patch already
       proved belongs to it (`CLIENT_FIELDS` is the whitelist). */
    else (next as unknown as Record<string, unknown>)[k] = v
  }
  return next
}

const CLIENT_FIELDS: FieldSpec[] = [
  { key: 'name', validate: (v) => (String(v ?? '').trim() ? null : 'A client must have a name.') },
  /* No `company` field. `clients` has no company column — an organisation's
     company name IS `clients.name` (0005), and `type_parent` says which kind of
     party it is. The row this drove rendered an em dash on every record and the
     input could never have had anywhere to save to. */
  /* §3 — phone stays required. It is the only unique key a client has, so
     duplicate detection and the merge tool have nothing to match on without it.
     Shape is left to `lib/phone.ts` at the Add Client gate; this only refuses
     an empty one, because emptying it is what breaks merge. */
  { key: 'phone', validate: (v) => (String(v ?? '').trim() ? null : 'Phone is required — duplicate detection and merge match on it.') },
  { key: 'email' },
  { key: 'pan' },
  { key: 'address' },
  { key: 'city' },
  { key: 'district' },
  { key: 'postalCode' },
  { key: 'country' },
  { key: 'businessRegistrationNo' },
  { key: 'contact_name' },
  { key: 'contact_designation' },
  { key: 'contact_phone' },
  { key: 'notes' },

  /* §2.1 — a standing discount and the reason it exists are one write. Saving
     the percentage alone leaves a discount on the account that nothing on the
     screen can account for, and the 11 Aug audit found the stacking trigger is
     INSERT-only, so an UPDATE may slip past the constraint that would refuse it. */
  {
    key: 'standingDiscountPercent',
    group: 'discount',
    validate: (v) => {
      if (v === '' || v === null || v === undefined) return null
      const pct = Number(v)
      if (!Number.isFinite(pct)) return 'Enter a number.'
      /* TODO(decision) — PLAN.md §4.27: Law 10 wants a reason ≥10 chars AND a
         named approver above 10%. `ClientRecord` carries neither — `discountSource` is a
         three-value enum, not a justification, and there is no approver column.
         Until that is ruled and the schema carries it, this screen refuses to
         *set* a standing discount above 10% rather than write one the law
         cannot justify. Existing records above 10% still display. */
      if (pct > 10) {
        return 'Above 10% needs a named approver and a written reason (Law 10). This record has no field for either yet — raise it on the booking instead.'
      }
      return validateDiscount(pct).error
    },
  },
  {
    key: 'discountSource',
    group: 'discount',
    validate: (v) => {
      const s = String(v ?? '').trim()
      if (!s) return null
      return ['Type Rule', 'Membership', 'Named Client'].includes(s)
        ? null
        : 'Must be one of: Type Rule, Membership, Named Client.'
    },
  },

  /* §2.2 — these are not this screen's to change, and a control that throws on
     save is worse than no control. Each says where the real correction lives. */
  { key: 'id', immutable: 'The client number is issued by Settings ▸ Numbering and never changes.' },
  { key: 'outstandingPaisa', immutable: 'Derived from invoices and payments. Correct it with a payment or a credit note.' },
  { key: 'depositHeldPaisa', immutable: 'Deposits are liabilities — moved by a deposit movement row, never edited.' },
  { key: 'creditUsedPaisa', immutable: 'Derived from open bookings, not stored.' },
  { key: 'creditLimitPaisa', immutable: 'A credit limit change is the `credit.override` action, which is Owner-only and logged.' },
]

/**
 * The two per-client fetchers, at module scope so their identity is stable and
 * `useList` cannot be retriggered by a re-render alone.
 *
 * Both open with the same guard, and it is the important line in each. An empty
 * chip group means **no constraint** to `applyListFilters`, not "match nothing"
 * — `in(client_id, [])` is not sent at all — so calling through with no client
 * id would return the whole table and render another client's bookings and
 * another client's invoices under this client's name. The short-circuit returns
 * an empty result WITHOUT touching the network, which is also what should happen
 * while the profile query that supplies the id is still in flight.
 */
async function fetchClientBookings(filters: ListFilters) {
  if (!filters.chips?.['client_id']?.[0]) return { rows: [], total: 0 }
  // No `withDeposit`: `bookings.deposit_required` is unmasked money on a base
  // table (Law 6), and this list shows no deposit column.
  return listBookings(filters)
}

async function fetchClientInvoices(filters: ListFilters) {
  if (!filters.chips?.['client_id']?.[0]) return { rows: [], total: 0 }
  return listInvoices(filters)
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  const pii = canViewPII(gctx)

  /**
   * The record, from `client_directory_v` keyed on the code in the URL.
   *
   * `rows[0]` rather than a bespoke "one record" hook: `useClientProfile` is
   * `useList` underneath, so "no such client" arrives as `isEmpty` — a
   * successful query that matched nothing — and a failed read arrives as
   * `error`. The old `?? null` collapsed both into one "not found" screen, which
   * told an operator their link was wrong when the database was simply
   * unreachable.
   */
  const profile = useClientProfile(id)
  const loaded = profile.rows[0] ?? null

  /**
   * Edits live here, over the fetched record, and are lost on reload — see
   * `onSave`. Held as an overlay rather than as the source so a refetch does not
   * silently discard what the operator typed, and so the page renders the
   * database's version until they touch it.
   */
  const [draft, setDraft] = useState<ClientRecord | null>(null)
  const client = draft ?? loaded?.record ?? null
  const [tab, setTab] = useState<TabKey>('overview')
  /* Law: errors inline, toasts for successes only — so a refused exit from edit
     mode is a banner naming the fields, never a toast. */
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const editRecord = useMemo(() => (client ? toEditable(client) : {}), [client])

  /**
   * Every action under `src/actions/` is a stub — `implemented` defaults to
   * `false` in `actions/core.ts`, so `updateClient` would throw
   * `ActionNotImplementedError` and no field would ever save. That is the
   * dispatcher being honest, not a bug to route around: nothing in this app
   * persists yet, and `CLIENTS_DATA` is a seed array.
   *
   * So the edit lands where every other write on this page lands — the record
   * held in this component — and the page says so out loud in edit mode rather
   * than showing a success toast for a write that did not happen. When a real
   * client row exists, this body becomes the `updateClient` call and nothing
   * above it changes.
   */
  const onSave = useCallback(
    async (patch: Record<string, unknown>) => {
      setDraft((d) => {
        const base = d ?? loaded?.record ?? null
        return base ? applyPatch(base, patch) : base
      })
    },
    [loaded],
  )

  const edit = useEditMode({ record: editRecord, fields: CLIENT_FIELDS, onSave })

  const tabs = useMemo(() => TAB_DEFS.filter((t) => money || !t.money), [money])
  const activeTab: TabKey = tabs.some((t) => t.key === tab) ? tab : 'overview'

  /**
   * This client's bookings and invoices, both keyed on `clients.id` — the uuid,
   * never the code. `invoicesForClient` says so in its own doc: a code returns
   * zero rows rather than an error, so the mistake is silent.
   *
   * Both fetchers short-circuit while the profile is still in flight. An empty
   * chip group means NO CONSTRAINT to `applyListFilters`, not "match nothing":
   * sending `{ client_id: [] }` would return every booking and every invoice in
   * the business, rendered under this one client's name.
   */
  const clientUuid = loaded?.id ?? null
  const rentals = useList<BookingListRow>(
    fetchClientBookings,
    {
      chips: { client_id: clientUuid ? [clientUuid] : [] },
      sort: { column: 'pickup_at', ascending: false },
    },
    { isFilteredOverride: false },
  )
  const invoices = useList<InvoiceListRow>(
    fetchClientInvoices,
    clientUuid ? invoicesForClient(clientUuid) : { chips: { client_id: [] } },
    { isFilteredOverride: false },
  )

  if (!client) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageBody
          loading={profile.loading}
          error={profile.error}
          onRetry={profile.refetch}
          empty={profile.isEmpty}
          noun="client"
          skeleton="card"
          emptyTitle="Client not found"
          emptyMessage={`No client record matches "${id ?? ''}". It may have been renamed, merged into another account, or the link is out of date.`}
          emptyActionLabel="Back to Clients"
          onEmptyAction={() => navigate('/clients')}
        >
          {null}
        </PageBody>
      </div>
    )
  }

  const kpis: Kpi[] = [
    { label: 'Total Rentals', value: String(client.totalRentalsCount), icon: 'checklist', accent: 'primary', note: `${client.currentRentalsCount} active now` },
    ...(money
      ? [
          { label: 'Outstanding', value: formatMoney(client.outstandingPaisa), icon: 'card' as const, accent: (client.outstandingPaisa > 0 ? 'danger' : 'success') as BrandKey },
          { label: 'Deposit Held', value: formatMoney(client.depositHeldPaisa), icon: 'box' as const, accent: 'progress' as const },
          { label: 'Lifetime Spend', value: formatMoney(client.totalSpentPaisa), icon: 'activity' as const, accent: 'success' as const },
        ]
      : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="users"
        title={client.name}
        description={`${client.id} · ${client.clientType}`}
        actions={
          <>
            {/* VIP is a `client_flags` flag_type exactly as Blocked is, but
                `client_directory_v` publishes only `is_blocked` (0054). The
                mapper therefore never sets `isVip`, so this badge cannot appear
                on a database record — kept because `ClientRecord` still carries
                the field and other surfaces set it, not because this page can
                reach it. */}
            {client.isVip && <Tone text="VIP" tone="progress" />}
            {client.isBlocked && <Tone text="Blocked" tone="danger" />}
            {edit.editing ? (
              <>
                <Button
                  icon="check"
                  onClick={() => {
                    const outcome = edit.stopEditing()
                    setLeaveError(
                      outcome.ok
                        ? null
                        : `Unsaved: ${outcome.unsaved.join(', ')}. Save or cancel each before leaving edit mode.`,
                    )
                  }}
                >
                  Done
                </Button>
                <Button
                  icon="close"
                  variant="ghost"
                  onClick={() => {
                    edit.cancelAll()
                    setLeaveError(null)
                  }}
                >
                  Discard
                </Button>
              </>
            ) : (
              <Button
                icon="tool"
                onClick={() => {
                  setLeaveError(null)
                  edit.startEditing()
                }}
              >
                Edit Client
              </Button>
            )}
            <Button icon="users" onClick={() => navigate('/clients/duplicates')}>
              Merge Duplicate
            </Button>
            {/*
              Block / Unblock is disabled and says why, instead of appearing to
              work. It used to flip `isBlocked` in component state, fire a
              success toast and call `actions/clients/blockClient` — which throws
              `ActionNotImplementedError` (nothing in `src/actions/` sets
              `implemented: true`) into a promise with no `.catch()`, so the
              rejection was unobserved and the toast claimed a block that had
              never left the browser.

              Now that `isBlocked` is a database fact (0054), a local flip would
              also be painting over a real value rather than filling a gap.
            */}
            <Unavailable reason="Blocking writes a row to client_flags and the app has no write path for it yet — actions/clients/blockClient.ts is a stub, and 0005 records that whether a block reason is mandatory is still unruled">
              <Button
                icon={client.isBlocked ? 'checklist' : 'alert_triangle'}
                variant={client.isBlocked ? 'secondary' : 'danger'}
                disabled
              >
                {client.isBlocked ? 'Unblock Client' : 'Block Client'}
              </Button>
            </Unavailable>
            {client.isBlocked ? (
              <Unavailable reason={`Blocked${client.blockReason ? `: ${client.blockReason}` : ''} — clear the block before starting a rental`}>
                <Button variant="primary" icon="plus" disabled>
                  Start Rental
                </Button>
              </Unavailable>
            ) : (
              <Button variant="primary" icon="plus" onClick={() => navigate('/rentals/new')}>
                Start Rental
              </Button>
            )}
          </>
        }
      />

      {/* HIS v2.1 §4.4 — the block itself is visible to everyone who tries to
          book; only the reason and who set it are staff information. */}
      {client.isBlocked && (
        <ErrorBanner
          title="Account blocked."
          message={
            canViewOnStopReason(gctx)
              ? // `client_flags.reason` exists but `client_directory_v` publishes
                // only the boolean, so the reason is genuinely not on this row.
                // Saying that is the alternative to a stand-in sentence an
                // operator would read as the recorded reason.
                (client.blockReason ?? 'The reason is recorded on the flag but is not carried by this view.')
              : 'Contact a manager for details.'
          }
        />
      )}

      {leaveError && <ErrorBanner title="Unsaved changes." message={leaveError} />}

      {/* Nothing in this app persists yet — see `onSave` above. Saying so is the
          alternative to a success toast for a write that did not happen. */}
      {edit.editing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--sp-sm)',
            padding: '10px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
          }}
        >
          <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
          <span>
            Editing this session only — client records are not persisted yet, so these changes are lost on
            reload. Save and Cancel behave exactly as they will once the write lands.
          </span>
        </div>
      )}

      <KpiStrip items={kpis} columns={kpis.length} />

      <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)' }}>
        {tabs.map((t) => {
          const on = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 12px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-md)' }}>
          <Card title="Identity">
            <EditableRows
              edit={edit}
              rows={[
                { key: 'name', label: 'Name', value: client.name },
                /* No Company row — `clients` has no company column. For an
                   organisation the company name IS `name`; see CLIENT_FIELDS. */
                /* Client type, tags and KYC are rule-driven, not typed in — each
                   is set by a flow that owns it, so none is an input here. */
                { label: 'Client type', value: client.clientType },
                /* `clients.tags` is a real `text[]` column that
                   `client_directory_v` does not carry, so this reads '—' on
                   every database record — absent from the query, not absent
                   from the business. */
                { label: 'Tags', value: client.tags?.length ? client.tags.join(', ') : '—' },
                { key: 'pan', label: 'PAN', value: client.pan ?? 'Not on file', hint: 'Optional — a client without a PAN can still rent.' },
                { label: 'KYC', value: client.kycStatus },
                { key: 'id', label: 'Client number', value: client.id },
              ]}
            />
          </Card>

          {/* HIS v2.1 §4.2 — phone/email/address were unconditional here
              before this; a Warehouse or Technician session must not
              construct this card at all, not just have it styled away. */}
          {pii && (
            <Card title="Contact">
              <EditableRows
                edit={edit}
                rows={[
                  { key: 'phone', label: 'Phone', value: client.phone, as: 'tel', hint: 'Required — duplicate detection and the merge tool match on it.' },
                  { key: 'email', label: 'Email', value: client.email || '—', as: 'email' },
                  { key: 'address', label: 'Address', value: client.address, hint: 'The single line the rest of the app reads.' },
                  { key: 'city', label: 'City', value: client.city ?? '—' },
                  { key: 'district', label: 'District', value: client.district ?? '—' },
                  { key: 'postalCode', label: 'Postal code', value: client.postalCode ?? '—' },
                  { key: 'country', label: 'Country', value: client.country ?? '—' },
                  /* The Billing/Delivery breakdown is an array, and editing an
                     array of addresses is a list UI, not a field. Left read-only
                     rather than half-built. */
                  ...(client.addresses ?? []).map((a) => ({
                    label: `${a.kind} address`,
                    value: a.address,
                  })),
                ]}
              />
            </Card>
          )}

          {pii && (
            <Card title="Authorized Contact Person">
              <EditableRows
                edit={edit}
                rows={[
                  { key: 'contact_name', label: 'Name', value: client.contactPerson.name },
                  { key: 'contact_designation', label: 'Designation', value: client.contactPerson.designation },
                  { key: 'contact_phone', label: 'Phone', value: client.contactPerson.phone, as: 'tel' },
                ]}
              />
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                One contact per client today — a multi-contact model would be a schema change, not a display change.
              </p>
            </Card>
          )}

          <Card title="Membership & Credit">
            <EditableRows
              edit={edit}
              rows={[
                { label: 'Membership Tier', value: client.membership, ...(TIER_TONE[client.membership] === 'danger' ? { tone: 'danger' as const } : {}) },
                { label: 'Last Rental', value: client.lastRentalBs === '—' ? 'No rental yet' : `${client.lastRentalBs} BS · ${client.lastRentalAd}` },
                // Open ⭐ #2 (HIS v2.1) — no benefit matrix is ruled yet.
                { label: 'Benefits', value: 'Not yet defined (Open ⭐ #2)' },
                ...(moneyScope(gctx) === 'full'
                  ? ([
                      /* §2.1 — grouped. Saving the percentage without its source
                         leaves a discount on the account nothing can account for,
                         so both keys go in one write and one bad member blocks it. */
                      {
                        key: 'standingDiscountPercent',
                        label: 'Standing discount',
                        value: client.standingDiscountPercent !== undefined ? `${client.standingDiscountPercent}%` : '—',
                        as: 'number',
                        hint: 'Saves together with Discount source. Above 10% needs Law 10 approval this record cannot yet carry.',
                      },
                      { key: 'discountSource', label: 'Discount source', value: client.discountSource ?? '—', hint: 'Type Rule · Membership · Named Client' },
                      // Open ⭐ #1 (HIS v2.1) — no per-category deposit-% table is ruled yet.
                      { label: 'Deposit override', value: 'Not set (Open ⭐ #1)' },
                      { key: 'creditLimitPaisa', label: 'Credit limit', value: formatMoney(client.creditLimitPaisa) },
                    ] satisfies EditableRowDef[])
                  : []),
              ]}
            />
            {(client.isBlocked || client.onStop) && canViewOnStopReason(gctx) && (
              <SummaryRows
                rows={[
                  { label: 'On-Stop set by', value: client.onStop?.setBy ?? '—' },
                  { label: 'On-Stop set on', value: client.onStop?.setAd ?? '—' },
                ]}
              />
            )}
            {/*
              ⛔ The "Credit used · N / M · X headroom remaining" meter that used
              to sit here is gone. All three figures came from
              `creditUsedPaisa`, which has no column and no ruled formula —
              `toClientRecord` hard-zeroes it and records why: outstanding is the
              closest true number, but calling it credit-used asserts an
              equivalence nobody has ruled. Against a database record the bar
              would have read "Rs 0 used, full headroom" for every client,
              including one at its limit. Outstanding is stated under its own
              name on the Payments tab instead.
            */}
          </Card>

          {/* Reliability [NEW] — counts visible to all staff; no ₨-recovered
              figure is modelled yet, so nothing here needs money-gating. */}
          {client.reliability && (
            <Card title="Reliability">
              <SummaryRows
                rows={[
                  { label: 'Late returns', value: `${client.reliability.lateReturns} / ${client.reliability.totalReturns}` },
                  { label: 'Damage cases', value: String(client.reliability.damageCases) },
                  { label: 'Missing cases', value: String(client.reliability.missingCases) },
                  { label: 'Avg days late', value: client.reliability.avgDaysLateOverall.toFixed(1) },
                ]}
              />
            </Card>
          )}
        </div>
      )}

      {activeTab === 'rentals' && (
        <Card
          title={`Rentals (${rentals.rows.length} of ${client.totalRentalsCount} lifetime)`}
          bodyStyle={{ padding: rentals.rows.length ? 0 : undefined }}
        >
          {/*
            ⛔ No Amount column. `BookingListRow` carries no rental total, and
            that is deliberate on the query's side: the total and the outstanding
            are the Financial Engine's figures and live on the booking, not on a
            list row (`queries/bookings.ts` states it in the same words). The
            column this replaces read `r.amount` off a hand-typed seed row —
            a rupee figure with no column behind it, on a page that also shows
            real balances.
          */}
          <PageBody
            loading={rentals.loading}
            error={rentals.error}
            onRetry={rentals.refetch}
            hasRows={rentals.rows.length > 0}
            empty={rentals.isEmpty}
            noun="rentals"
            emptyTitle="No rentals to show"
            emptyMessage={
              client.totalRentalsCount > 0
                ? `The directory counts ${client.totalRentalsCount} lifetime rental(s) for this client, but the bookings query returned none — worth reporting, since the two read the same table.`
                : 'This client has never rented anything.'
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th style={th}>Booking</th>
                    <th style={th}>Project</th>
                    <th style={th}>Status</th>
                    <th style={th}>Pickup</th>
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>
                        <span className="identifier" style={{ color: 'var(--link)', fontWeight: 600 }}>{r.bookingNo}</span>
                      </td>
                      {/* `project` is nullable on `bookings` — the em dash is the
                          column being empty, not a lookup that failed. */}
                      <td style={td}>{r.project ?? '—'}</td>
                      <td style={td}>
                        <Tone text={r.stage} tone={statusToken(r.stage)} />
                        {/* §1.9 — Cancelled is a flag that coexists with the
                            stage, never a stage of its own, so it is a second
                            mark rather than a replacement for the pill. */}
                        {r.isCancelled && (
                          <span style={{ marginLeft: 6, color: 'var(--danger-text)', fontSize: 'var(--t-th)' }}>Cancelled</span>
                        )}
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{formatAd(new Date(r.pickupAtAd))}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Link to={`/rentals/${r.bookingNo}`} style={{ color: 'var(--link)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PageBody>
        </Card>
      )}

      {activeTab === 'payments' && money && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <Card title="Financial summary">
            <SummaryRows
              rows={[
                { label: 'Outstanding', value: formatMoney(client.outstandingPaisa), ...(client.outstandingPaisa > 0 ? { tone: 'danger' as const } : {}) },
                { label: 'Deposit Held', value: formatMoney(client.depositHeldPaisa) },
                { label: 'Credit Limit', value: formatMoney(client.creditLimitPaisa) },
                /* No 'Credit Used' row — see the Membership & Credit card. The
                   column does not exist and the formula is unruled, so the Rs 0
                   this used to print was not a balance. */
                { label: 'Lifetime Spend', value: formatMoney(client.totalSpentPaisa) },
              ]}
            />
          </Card>
          <Card
            title={`Invoices (${invoices.rows.length})`}
            bodyStyle={{ padding: invoices.rows.length ? 0 : undefined }}
          >
            {/*
              `financeRestriction` is spread even though this tab is already
              money-gated, because the two gates answer different questions and
              only one of them is about this page. `invoices` has no `_v` view:
              RLS gates it WHOLE-ROW, so a money-blind session gets `[]` and
              HTTP 200 — indistinguishable from "this client has never been
              invoiced" unless the screen says which it is.
            */}
            <PageBody
              loading={invoices.loading}
              error={invoices.error}
              onRetry={invoices.refetch}
              hasRows={invoices.rows.length > 0}
              empty={invoices.isEmpty}
              noun="invoices"
              emptyTitle="No invoices to show"
              emptyMessage="Nothing has been invoiced to this client, or every invoice against it has been voided."
              {...financeRestriction(money)}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      <th style={th}>Invoice</th>
                      <th style={th}>Booking</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total</th>
                      <th style={{ ...th, textAlign: 'right' }}>Outstanding</th>
                      <th style={th}>Status</th>
                      <th style={th}>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.rows.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>
                          <span className="identifier" style={{ fontWeight: 600 }}>{inv.invoiceNo}</span>
                        </td>
                        <td style={td}>
                          <Link to={`/rentals/${inv.bookingNo}`} className="identifier" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                            {inv.bookingNo}
                          </Link>
                        </td>
                        {/* Two columns, not one: the invoice carries seven
                            distinct money columns and collapsing them into a
                            single "Amount" string is what made `Finance.tsx`
                            parse "Rs 1,234.50" back as Rs 1,23,450. */}
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span className="figure" style={{ fontWeight: 600 }}>{formatMoney(inv.totalAmount)}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span
                            className="figure"
                            style={{ color: inv.outstandingAmount > 0 ? 'var(--danger-text)' : 'var(--text2)' }}
                          >
                            {formatMoney(inv.outstandingAmount)}
                          </span>
                        </td>
                        <td style={td}>
                          <Tone text={inv.status} tone={INVOICE_TOKEN[inv.status]} />
                        </td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{inv.dueDateAd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PageBody>
          </Card>
        </div>
      )}

      {activeTab === 'documents' && (
        <Card title="Documents">
          {/*
            ⛔ This tab used to filter `data/documents.ts`'s hand-typed
            `DOCUMENTS` array by `client.activeBookings` — a field the database
            mapper always returns empty, so on a real client it matched nothing
            while a seed client got seed paperwork. There is no documents query
            module (`src/lib/queries/` holds bookings, clients, finance and
            inventory only), so this states the gap instead of dressing an empty
            seed join as "no documents on file" — which would have told an
            operator that a client with a signed contract has none.
          */}
          <EmptyState
            title="Documents are not queried yet"
            description="Nothing on this page reads the document registry — no query module covers it. This is a gap in the app, not a statement about what paperwork exists for this client."
          />
        </Card>
      )}

      {activeTab === 'notes' && (
        <Card title="Notes">
          {edit.editing ? (
            <EditableRows edit={edit} rows={[{ key: 'notes', label: 'Notes', value: client.notes ?? '', as: 'textarea' }]} />
          ) : client.notes ? (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{client.notes}</p>
          ) : (
            <EmptyState
              title="No notes yet"
              description="Nothing has been written about this client. Press Edit Client to add one."
              actionLabel="Edit Client"
              onAction={() => {
                setLeaveError(null)
                edit.startEditing()
              }}
            />
          )}
        </Card>
      )}

      {activeTab === 'activity' && (
        <Card title="Client facts">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name="checklist" size={14} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 2 }} />
              KYC {client.kycStatus} · {client.kycDocsCount} document{client.kycDocsCount === 1 ? '' : 's'} on file
            </li>
            <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name={client.currentRentalsCount > 0 ? 'truck' : 'dot'} size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
              {client.currentRentalsCount > 0 ? `${client.currentRentalsCount} rental(s) currently active` : 'No active rentals'}
            </li>
            <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Icon name="calendar" size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
              {client.lastRentalBs === '—' ? 'No rental history yet' : `Last rental ${client.lastRentalBs} BS (${client.lastRentalAd})`}
            </li>
            {client.isBlocked && (
              <li style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                <Icon name="alert_triangle" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                Blocked{client.blockReason ? ` — ${client.blockReason}` : ' — reason not carried by this view'}
              </li>
            )}
          </ul>
          <p style={{ margin: '14px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            This is derived from fields already on the record, not an audit trail. `lib/audit.ts` exists
            but nothing calls `logAuditEvent` for client records yet — a real timeline needs that wired
            up first, not fabricated here.
          </p>
        </Card>
      )}

      <FooterNote extra={['Clients are never deleted — a closed account is retained and marked']} />

    </div>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '11px 12px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }
