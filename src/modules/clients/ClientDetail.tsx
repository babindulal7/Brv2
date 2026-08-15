import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, SummaryRows } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EditableRows } from '../../components/ui/EditableRows'
import type { EditableRowDef } from '../../components/ui/EditableRows'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { useViewport } from '../../lib/device'
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
import {
  TIER_TONE,
  creditStopFactsOf,
  daysPastDue,
  evaluateCreditStop,
  readOverdueStopDays,
  type ClientRecord,
} from '../../data/clients'
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

function Tone({
  text,
  tone,
  icon,
  reason,
}: {
  text: string
  tone: keyof typeof STATUS
  /** Law 11 — a chip whose colour carries meaning also carries a glyph. */
  icon?: IconName
  /** Shown as the accessible name and the hover text, so the reason is not hover-only. */
  reason?: string
}) {
  const c = STATUS[tone]
  return (
    <span
      {...(reason ? { title: reason, 'aria-label': `${text} — ${reason}` } : {})}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: icon ? 4 : 0,
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
      {icon && <Icon name={icon} size={11} />}
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
  /*
    Spec 8.2 draws three layouts and this file had no width read at all — both
    of its tables fell back to a horizontal scrollbar on a phone, which the
    shell block of every spec forbids ("Tables become card rows below 768").
    The record's own "one section at a time" requirement is already met by the
    tab strip below, which exists at every width; what was missing is the
    table→cards swap and a tab strip that scrolls instead of squashing.
  */
  const viewport = useViewport()
  const tabular = viewport !== 'phone'

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
   * `updateClient` is still a stub — `implemented` defaults to `false` in
   * `actions/core.ts`, so dispatching it would throw
   * `ActionNotImplementedError` and no field would ever save. That is the
   * dispatcher being honest, not a bug to route around.
   *
   * ⚠ Narrowed from "every action under `src/actions/` is a stub", which was
   * true when it was written and is not now: the 12 Aug rebuild marked eight
   * actions `implemented: true` (`createClient`, `blockClient`,
   * `recordPayment`, `confirmRental`, `createBundle` and the four floor
   * verbs). `updateClient` is not among them. A blanket claim that has gone
   * stale is worse than no claim, because the next reader routes around a
   * working path on its word.
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

  /* ── On Stop — RULING §11.2 ─────────────────────────────────────────────
   *
   * This is the ONE surface that can answer both limbs, because it is the only
   * one that runs the invoices query. The directory can evaluate the credit
   * limb alone and says so; here the overdue limb becomes answerable too.
   *
   * The predicate itself lives in `data/clients.ts` and is shared with the
   * directory — §11.2.3: one function, so the chip on the row and the block on
   * this page cannot disagree about the same client. *N* comes from Settings ▸
   * Financial; no threshold is written here.
   */
  const stopThresholdDays = useMemo(() => readOverdueStopDays(), [])

  /**
   * Days past due on the client's most overdue **issued, unpaid** invoice.
   *
   * `0` means they hold none — a real answer. `null` means the question could
   * not be asked, and the three ways that happens are all reported rather than
   * flattened into `0` (§11.2.7):
   *
   *  · a money-blind session: `invoices` has no `_v` masking view, RLS gates it
   *    whole-row, and a withheld list arrives as `[]` with HTTP 200 —
   *    indistinguishable from "never invoiced". `financeRestriction` already
   *    makes that point about the table below; the same ambiguity would make an
   *    "on stop: no" here into a claim nobody checked.
   *  · the query is still in flight, or it failed.
   *  · a `due_date` that will not parse. One unreadable date makes the *worst*
   *    overdue unknown, so the limb reports unknown rather than the best case.
   *
   * Draft invoices are excluded: a draft has not been issued to anybody, so it
   * cannot be late. `invoicesForClient` already excludes voided rows.
   */
  const overdueDays = useMemo<number | null>(() => {
    if (!money) return null
    if (invoices.loading || invoices.error) return null
    let worst = 0
    for (const inv of invoices.rows) {
      if (inv.status === 'Draft') continue
      if (inv.outstandingAmount <= 0) continue
      const late = daysPastDue(inv.dueDateAd)
      if (late === null) return null
      if (late > worst) worst = late
    }
    return worst
  }, [money, invoices.loading, invoices.error, invoices.rows])

  const creditStop = useMemo(
    () =>
      client
        ? evaluateCreditStop(
            creditStopFactsOf(client, { canViewMoney: money, daysPastDueOnOldestUnpaidInvoice: overdueDays }),
            { overdueStopDays: stopThresholdDays, canViewMoney: money },
          )
        : null,
    [client, money, overdueDays, stopThresholdDays],
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
            {client.isBlocked && <Tone text="Blocked" tone="danger" icon="alert_triangle" />}
            {/* Rulings §11.2.4 — beside Blocked, never instead of it: a client
                is routinely Active AND blocked AND on stop, and folding the
                three into one badge is how a real state disappears. */}
            {creditStop?.onStop && (
              <Tone text="On Stop" tone="danger" icon="lock" reason={creditStop.reasons.join(' ')} />
            )}
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
              success toast and call `actions/clients/blockClient` into a promise
              with no `.catch()`, so the rejection was unobserved and the toast
              claimed a block that had never left the browser.

              ⚠ The old reason text said "blockClient.ts is a stub". That went
              stale in the 12 Aug rebuild: `blockClient.ts:195` is now
              `implemented: true` with a real body. What still blocks it is one
              level up — its capability string `client.block` is not in
              `core.ts:checkCapability`'s switch, so `checkCapability` returns
              `undefined` and the dispatcher denies it for every role, Owner
              included. That is fail-closed and therefore safe, but it is a
              different gap from the one this control used to name, and the same
              verb IS reachable from the directory's bulk action — so the reason
              has to be accurate or the two screens look arbitrary.

              TODO(decision) — PLAN.md §4: which roles hold `client.block`,
              `client.create` and `rental.confirm`. A page may not answer that
              (CLAUDE.md), and until it is ruled the capability must not be
              mapped to a guess.

              Now that `isBlocked` is a database fact (0054), a local flip would
              also be painting over a real value rather than filling a gap.
            */}
            <Unavailable reason="Blocking is built but not yet reachable: its capability `client.block` is unruled, so actions/core.ts denies it for every role. Which roles may block a client is an open decision (PLAN.md §4), as is whether a block reason is mandatory (migration 0005)">
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

      {/* Spec 8.2 TABLET — "section tabs scroll". They used to squash instead,
          because the row had no overflow behaviour of its own. */}
      <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)', overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
        {tabs.map((t) => {
          const on = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={on ? 'page' : undefined}
              style={{
                // Law 15 — this strip is the record's only section switch.
                minHeight: 44,
                flexShrink: 0,
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
            {/*
              ── ⛔ ON STOP ──────────────────────────────────────────────────
              Rulings §11.2 — derived here, never read off a flag, and stated
              inside the CREDIT box the ruling names because that is where an
              operator looks when a booking is refused.

              **Law 6.** `reasons` is figure-free by construction and safe for
              any role that reaches this page; `details` carries the amounts and
              `evaluateCreditStop` only populates it when money was visible at
              the point the verdict was computed. There is no second gate to
              forget.

              **§11.2.7.** A limb that could not run is listed as such — under
              the verdict when the other limb fired, and on its own when neither
              could. It never reads as "clear".
            */}
            {creditStop?.onStop && (
              <div
                role="alert"
                style={{
                  marginTop: 'var(--sp-sm)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '11px 12px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--st-danger-bg)',
                  color: 'var(--st-danger-fg)',
                }}
              >
                {/* Law 11 — icon + label + colour. */}
                <Icon name="lock" size={15} fill style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ minWidth: 0, fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>On stop</span>
                  {creditStop.reasons.map((r) => (
                    <span key={r} style={{ display: 'block', marginTop: 2 }}>
                      {r}
                    </span>
                  ))}
                  {creditStop.details.map((d) => (
                    <span key={d} className="figure" style={{ display: 'block', marginTop: 2, opacity: 0.85 }}>
                      {d}
                    </span>
                  ))}
                  {creditStop.unavailable.map((u) => (
                    <span key={u} style={{ display: 'block', marginTop: 2, opacity: 0.85 }}>
                      {u}
                    </span>
                  ))}
                  <span style={{ display: 'block', marginTop: 6, opacity: 0.85 }}>
                    On Stop is worked out from the credit state each time this page is read, so it clears itself the moment
                    the balance is settled. It is not a flag anybody has to remember to lift.
                  </span>
                </span>
              </div>
            )}

            {/*
              §11.2.7 again, and the edge that only showed up on a real screen:
              this used to render only when EVERY limb was unavailable. On the
              mock corpus — `lib/mock/corpus.ts:149`, no client carries an
              approved credit limit — the overdue limb evaluates cleanly while
              the credit limb cannot run, so the verdict was "not on stop" and
              the card said nothing at all. A reader takes silence for "both
              checks passed". One unavailable limb is enough to say so.
            */}
            {creditStop && !creditStop.onStop && creditStop.unavailable.length > 0 && (
              <div
                style={{
                  marginTop: 'var(--sp-sm)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--sp-sm)',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px dashed var(--border)',
                  background: 'var(--card2)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                }}
              >
                <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                    {creditStop.indeterminate
                      ? 'The on-stop check could not run.'
                      : 'Part of the on-stop check could not run.'}
                  </span>
                  {creditStop.unavailable.map((u) => (
                    <span key={u} style={{ display: 'block', marginTop: 2 }}>
                      {u}
                    </span>
                  ))}
                  <span style={{ display: 'block', marginTop: 4 }}>
                    {creditStop.indeterminate
                      ? 'This is not a statement that the client is clear — it is a statement that nothing here could check.'
                      : 'The other limb ran and did not fire. This client is not reported as on stop, but they have not been cleared on the limb above.'}
                  </span>
                </span>
              </div>
            )}

            {/*
              The legacy manual annotation, kept and clearly labelled as such.
              `ClientRecord.onStop` predates §11.2 and carries a **who** and a
              **when** that no derivation can produce, so Law 3 keeps it — but
              it is not what puts a client on stop any more, and it is not fed
              back into the predicate: a stored flag is exactly what goes stale
              after the client pays.
            */}
            {client.onStop && canViewOnStopReason(gctx) && (
              <SummaryRows
                rows={[
                  { label: 'Earlier manual on-stop — set by', value: client.onStop.setBy },
                  { label: 'Earlier manual on-stop — set on', value: client.onStop.setAd },
                  { label: 'Recorded reason', value: client.onStop.reason },
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
            {!tabular ? (
              /* Shell rule — below 768 a 640px table is a horizontal scrollbar
                 hiding the columns that matter. One card per booking, one
                 primary action. */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                {rentals.rows.map((r) => (
                  <article key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span className="identifier" style={{ color: 'var(--link)', fontWeight: 700 }}>{r.bookingNo}</span>
                      <Tone text={r.stage} tone={statusToken(r.stage)} />
                      {r.isCancelled && <span style={{ color: 'var(--danger-text)', fontSize: 'var(--t-th)' }}>Cancelled</span>}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.project ?? '—'}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Pickup {formatAd(new Date(r.pickupAtAd))}</div>
                    <Link
                      to={`/rentals/${r.bookingNo}`}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 'var(--r-btn)', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      Open booking
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
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
            )}
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
              {!tabular ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                  {invoices.rows.map((inv) => (
                    <article key={inv.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span className="identifier" style={{ fontWeight: 700 }}>{inv.invoiceNo}</span>
                        <Tone text={inv.status} tone={INVOICE_TOKEN[inv.status]} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-meta)' }}>
                        <span style={{ color: 'var(--text2)' }}>Total</span>
                        <span className="figure" style={{ fontWeight: 600 }}>{formatMoney(inv.totalAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-meta)' }}>
                        <span style={{ color: 'var(--text2)' }}>Outstanding</span>
                        <span className="figure" style={{ color: inv.outstandingAmount > 0 ? 'var(--danger-text)' : 'var(--text2)' }}>
                          {formatMoney(inv.outstandingAmount)}
                        </span>
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Due {inv.dueDateAd}</div>
                      <Link
                        to={`/rentals/${inv.bookingNo}`}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 'var(--r-btn)', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        Open {inv.bookingNo}
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
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
              )}
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
