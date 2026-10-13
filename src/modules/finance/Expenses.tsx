import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { ScreenHeader } from './TabHeader'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { Select } from '../../components/ui/Select'
import { SearchInput } from '../../components/ui/SearchInput'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { Badge } from '../../components/ui/Badge'
import type { StatusKey } from '../../lib/status'
import { rupees, formatMoney } from '../../lib/money'
import { toBs, formatBs, formatAd, businessDayAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useTabularLayout, useViewport } from '../../lib/device'
import { newClientUuid } from '../../lib/supabase'
import {
  listExpenses,
  listExpenseCategories,
  listExpenseBranches,
  createExpense,
  setExpenseStatus,
  financeRestriction,
  EXPENSE_STATUSES,
  EXPENSE_TRANSITIONS,
  type ExpenseListRow,
  type ExpenseCategoryRow,
  type ExpenseBranchRow,
  type ExpenseEntryStatus,
} from '../../lib/queries/finance'
import type { Database } from '../../types/supabase'
import { useList, type ListQueryResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import { DateField } from '../../components/ui/DateField'
import { Pagination } from '../../components/ui/Pagination'
import { useNetwork } from '../../lib/network'
import './finance.css'

type ExpenseStatusDb = Database['public']['Enums']['expense_status']

/**
 * # Finance ▸ Expenses — `updated mds/09_FINANCE.md` §9.4
 *
 * The screen §9.4 asks for and the app did not have. Until now the only expense
 * surface was `modules/reports/ExpenseReports.tsx`, which is a REPORT built on
 * the `src/data/expenseReports.ts` fixture — twelve hand-typed rows, five
 * `.filter()` calls over them, and a budget nothing stores. That file is left
 * exactly where it is; this is the ledger, not a second copy of the report.
 *
 * ## What is genuinely shared with the report, and what is not
 *
 * **Shared:** `lib/queries/finance.ts` — `listExpenses`, the named filter sets,
 * `EXPENSE_STATUSES`, and `financeRestriction()`. Law 2's Single Query Rule:
 * one query module per entity, so this screen and the report cannot disagree
 * about what an expense is.
 *
 * **Not shared, deliberately:** nothing in `data/expenseReports.ts`. Its
 * `CATEGORIES`, `PAYMENT_METHODS`, `BRANCHES`, `RECURRING` and `budgetOf()` are
 * constants with no column behind them (`queries/finance.ts:891-913` enumerates
 * the four). Importing them here to fill the wireframe's boxes would put
 * fabricated values beside real rows, which is the one thing this build does
 * not do. Where a field has no source it is said so, in the table and in the
 * sheet.
 *
 * ## Restricted, never empty — the whole reason this file has a gate
 *
 * `expenses` has no `_v` view. `expenses_money_blind` (0014:156-170) gates it
 * WHOLE-ROW on `auth_can_view_money()`, and it is the ONE table of the three
 * money ledgers with a single SELECT policy, so a Warehouse / Technician /
 * Driver / Client session is answered `200` and `[]` rather than refused. Handed
 * to `useList` unguarded that becomes `isEmpty`, and `PageBody` renders "No
 * expenses yet" — a claim about the business that the query never made.
 *
 * So `financeRestriction(useCanViewMoney())` is spread into the page body, and
 * every fetcher short-circuits when the session is money-blind rather than
 * sending a request whose `[]` would then have to be interpreted.
 *
 * ## Law 3 / Law 4 — nothing here rewrites a recorded cost
 *
 * `setExpenseStatus` moves the workflow state and sends no other column, and
 * there is no Edit and no Delete in the row menu. §9.4's own closing line —
 * *"Correction is a reversal row, never an edit"* — is `expense_reversals`, and
 * that write is NOT built: see `REVERSAL_UNAVAILABLE` for the exact reason.
 */

/* ── The two fields §9.4 draws that the schema cannot hold ────────────────
 *
 * Stated as constants so they appear once, in words, rather than as a silent
 * blank cell or an invented figure.
 */

/**
 * §9.4's table draws a **VAT** column. `expenses` has no `vat_amount` and no
 * `vat_rate` — verified against the live project's `information_schema.columns`,
 * not inferred: the table's 16 columns are id, client_uuid, expense_no,
 * category_id, branch_id, vendor_name, amount, expense_date, status,
 * description, receipt_url, receipt_size, booking_id and the four audit stamps.
 *
 * The column is kept and every cell renders an explicit non-value, rather than
 * dropped, so the gap is visible on the screen that needs it filled instead of
 * being discovered again in six months. `tax_ledgers.expense_id` (0006:446)
 * exists and is where a purchase-VAT figure would come from, but it is a
 * separate table with its own rows and its own gate, and no named set reads it.
 */
const VAT_UNAVAILABLE =
  'VAT is not recorded on an expense. The table has no vat_amount and no vat_rate column, so there is no figure to show — ' +
  'purchase VAT would come from tax_ledgers.expense_id, which no query reads yet.'

/**
 * §9.4's sheet draws `method ▾`, `paid by ▾` and `cost centre ▾`. None has a
 * column: unlike `payments`, an expense records nothing about how it was
 * settled, no `bank_account_id`, no `payment_channel_group`, no cost-centre
 * dimension at all. Offering the controls would silently drop whatever the
 * operator chose.
 */
const NO_COLUMN_FIELDS = [
  { label: 'Payment method', why: 'expenses records no bank_account_id and no payment channel — unlike payments, it does not say how the cost was settled.' },
  { label: 'Paid by', why: 'there is no paid_by column. created_by records who ENTERED the expense, which is a different fact and is stamped automatically.' },
  { label: 'Cost centre', why: 'no cost-centre dimension exists on this table or anywhere in the schema. branch_id is the only place an expense is attributed.' },
  { label: 'VAT', why: 'no vat_amount and no vat_rate column — see the VAT column in the table.' },
] as const

/**
 * The attachment slot. `receipt_url` and `receipt_size` are real columns
 * (0006:336-337, capped at 50 MB by CHECK), so the DESTINATION exists — what
 * does not exist is the upload: there is no Supabase Storage bucket configured
 * and no `storage.from(...)` call anywhere in `src/`. A file picker that
 * produced no URL would look like it worked.
 */
const ATTACHMENT_UNAVAILABLE =
  'Receipt upload is not built yet. expenses.receipt_url and receipt_size exist, but no storage bucket is configured and ' +
  'nothing in the app uploads a file — so a picker here would accept a receipt and store nothing.'

/**
 * §9.4: *"Correction is a reversal row, never an edit."* Agreed, and not built.
 *
 * `expense_reversals` (0006:360-375) is insertable by Owner / Admin / Accounts
 * and its `reason` must be ≥10 characters — that part is fine. What blocks it is
 * `reversal_no text not null unique` with **no key in `number_sequences`**: the
 * seven live keys are booking, client, deposit, equipment, expense, invoice,
 * payment. Minting the number in the browser is the drift Law 1 forbids, and
 * inventing a format is a product decision. `reversed_by uuid not null` also
 * needs a users row, which the session has, so that half is ready.
 */
const REVERSAL_UNAVAILABLE =
  'Recording a reversal is not built yet. expense_reversals.reversal_no is NOT NULL and unique, and number_sequences has no ' +
  'expense_reversal key — so there is no allocator for it, and minting one in the browser would be a second numbering scheme.'

/* ── Status → token. Law 11: colour is never the only carrier ─────────── */

const STATUS_TOKEN: Record<ExpenseStatusDb, StatusKey> = {
  Draft: 'neutral',
  'Pending Approval': 'progress',
  Approved: 'primary',
  Paid: 'in',
  Rejected: 'danger',
  Cancelled: 'danger',
}

const STATUS_GLYPH: Record<ExpenseStatusDb, IconName> = {
  Draft: 'file',
  'Pending Approval': 'timer',
  Approved: 'check',
  Paid: 'card',
  Rejected: 'close',
  Cancelled: 'lock',
}

/** The verb each transition reads as in the row menu. */
const TRANSITION_LABEL: Partial<Record<ExpenseStatusDb, string>> = {
  'Pending Approval': 'Submit for approval',
  Approved: 'Approve',
  Rejected: 'Reject',
}

const ROWS_PER_PAGE = 25

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; the horizontal padding is left alone.
 *
 * This is a data-integrity fix, not a density preference. Every expense row
 * ends in `RowMenu`, and that menu is how an expense moves between approval
 * states — Submit for approval, Approve, Reject. Its trigger paints 26x26 and
 * carries no `TouchTarget` at all, so the 44px hit area it owes cannot be added
 * while the row is 10 + one line + 10: a 44px target on a ~38px row overhangs
 * the rows above and below by ~3px each, the rows touch, and in that overlap
 * band the later row in the DOM wins the tap. Approving the row below the one
 * under the thumb is a money decision recorded against the WRONG expense.
 *
 * 56px is what makes the row able to hold the target the trigger still needs;
 * giving `RowMenu` a real `TouchTarget` is the next fix and this height is its
 * precondition. The stacked two-line cells here (expense no + branch, BS + AD)
 * already reach most of the way, which is exactly why the shortfall is easy to
 * miss — `verticalAlign: 'top'` keeps them reading from the top either way.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

/* Law 15 — hit area over paint, number from `--tap`. These are the Record
   Expense fields, stacked one per row, plus the category filter above the
   table; none of them sit tight enough to need the inset-target trick. */
const inputStyle = {
  minHeight: 'var(--tap)',
  padding: '0 11px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box' as const,
}

/** A `date` column, `YYYY-MM-DD`, rendered as "2 Aug 2026" without implying an instant. */
function dayAsDate(dayAd: string): Date {
  return new Date(`${dayAd}T00:00:00.000Z`)
}

/** §9.4's sheet says "BS above AD". Law 7 — BS is rendered from the AD day, never stored. */
function bsLabel(dayAd: string): string {
  const bs = toBs(dayAsDate(dayAd))
  return bs ? formatBs(bs) : '—'
}

/** An explicit non-value. Never a blank cell, which reads as a value of nothing. */
function NoValue({ reason }: { reason: string }) {
  return (
    <Unavailable reason={reason}>
      <span aria-label={`Not recorded. ${reason}`} style={{ color: 'var(--muted)' }}>
        —
      </span>
    </Unavailable>
  )
}

function StatusBadge({ status }: { status: ExpenseStatusDb }) {
  /*
   * Delegates to <Badge> — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one component
   * rendering the §4 map from lib/status; every screen inherits. No screen
   * colours a status itself."
   *
   * What this used to be: a span assembled here from `STATUS[STATUS_TOKEN[…]]`
   * with `--r-badge` (999 — §3.3 reserves that radius for numeric COUNT badges,
   * not statuses), weight 600, sentence case and a fixed 20px height. Four
   * deviations from §4's block anatomy, none of them deliberate — this file was
   * simply written before there was one component to inherit from, and it was
   * one of fifteen screens hand-rolling the same chip. That is exactly how the
   * product ended up with no status block anywhere that had the ruled anatomy.
   *
   * The wrapper is KEPT: `STATUS_TOKEN` is an expense-domain mapping (the
   * `expense_status` enum has six members that are not booking statuses), and
   * the call sites should keep naming a status rather than a tone. It loses the
   * paint, not the mapping.
   *
   * The glyph is passed through rather than dropped — Law 11 / §7.4, colour is
   * never the sole carrier, and `STATUS_GLYPH` is per-expense-status, finer
   * than the per-tone icon <Badge> would otherwise pick.
   *
   * `size="sm"` because these sit in dense ledger rows; it lands near the 20px
   * the hand-rolled version had without surrendering the weight, casing and
   * tracking that ARE the identity of a status block.
   */
  return (
    <Badge
      tone={STATUS_TOKEN[status]}
      label={status}
      icon={<Icon name={STATUS_GLYPH[status]} size={11} />}
      size="sm"
    />
  )
}

/** Closes a popover on outside click and on Escape. Same shape `RentalsList` uses. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

const menuStyle = {
  position: 'absolute' as const,
  right: 0,
  top: 30,
  minWidth: 232,
  padding: 6,
  borderRadius: 'var(--r-btn)',
  background: 'var(--dropdown)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-modal)',
  zIndex: 30,
}

/*
 * Law 14 / §7.3 — 44px floor, and here it has to be the PAINT.
 *
 * §5's compact-34 escape buys density by hiding the target in surrounding
 * chrome. A stacked menu has no surrounding chrome: these rows touch, so a 44px
 * invisible target on a 34px row overlaps its neighbours by 5px top and bottom
 * and the later row in the DOM wins the tap. On a menu that moves an expense
 * between approval states, taking the wrong row is a booking-safety failure,
 * not a cosmetic one.
 *
 * Growing the paint costs nothing: `menuStyle` is absolutely positioned with no
 * max-height, so the popover simply gets taller.
 */
const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '0 9px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'transparent',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  textAlign: 'left' as const,
}

/**
 * §9.4's `⋮`.
 *
 * It holds the approval decision and nothing else. There is no **Edit** — an
 * expense's amount, vendor and date are what was recorded, and 0006's header
 * puts corrections in `expense_reversals`. There is no **Delete** — Law 3.
 *
 * A status with no legal move renders the reason rather than an empty menu, so
 * the `⋮` is never a control that opens onto nothing.
 */
function RowMenu({
  row,
  busy,
  onMove,
}: {
  row: ExpenseListRow
  busy: boolean
  onMove: (to: ExpenseStatusDb) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const moves = EXPENSE_TRANSITIONS[row.status]

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Actions for ${row.expenseNo}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        style={{
          border: 'none',
          background: open ? 'var(--hover-card)' : 'transparent',
          color: 'var(--muted)',
          cursor: busy ? 'wait' : 'pointer',
          width: 26,
          height: 26,
          borderRadius: 'var(--r-xs)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="more_vert" size={15} />
      </button>

      {open && (
        <div role="menu" style={menuStyle}>
          {moves.length === 0 ? (
            <div style={{ padding: '6px 9px', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
              {row.status} is terminal on this screen. Paid and Cancelled are not written here — nothing rules who may set
              them, and Paid would assert money moved that this table does not record.
            </div>
          ) : (
            moves.map((to) => (
              <button
                key={to}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onMove(to)
                }}
                style={{ ...menuItemStyle, color: 'var(--text)', cursor: 'pointer' }}
              >
                <Icon name={STATUS_GLYPH[to]} size={15} style={{ color: 'var(--text2)' }} />
                <span style={{ flex: 1 }}>{TRANSITION_LABEL[to] ?? `Mark ${to}`}</span>
              </button>
            ))
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

          {/* §9.4 — "Correction is a reversal row, never an edit." Drawn,
              disabled, and carrying the reason. Never an Edit item. */}
          <Unavailable reason={REVERSAL_UNAVAILABLE} style={{ display: 'flex' }}>
            <span
              role="menuitem"
              aria-disabled
              tabIndex={0}
              style={{ ...menuItemStyle, color: 'var(--muted)', cursor: 'not-allowed' }}
            >
              <Icon name="return_arrow" size={15} style={{ color: 'var(--disabled)' }} />
              <span style={{ flex: 1 }}>Record a reversal</span>
            </span>
          </Unavailable>
        </div>
      )}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ADD EXPENSE — §9.4's right sheet
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ §9.4 draws this as a **right** sheet ("TABLET: sheet is 60% width. PHONE:
 * full-screen"). `components/ui/Modal` is the app's one dialog and its `sheet`
 * prop anchors to the BOTTOM, not the right. It is used anyway — it owns focus
 * trapping, Escape, the scroll lock and the overlay, and building a bespoke
 * right drawer here would be a second dialog implementation for a purely
 * positional difference. `Modal.tsx` is outside this task's file list, so
 * teaching it a right variant belongs to whoever owns it next. Flagged, not
 * silently re-drawn.
 */
function AddExpenseSheet({
  isOpen,
  onClose,
  onSaved,
  categories,
  branches,
  lookupsError,
  createdBy,
}: {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  categories: ExpenseCategoryRow[]
  branches: ExpenseBranchRow[]
  lookupsError: string | null
  createdBy: string | null
}) {
  /* Resolved when the form MOUNTS, not when the module loaded. `TODAY_DAY_AD`
     is frozen at import, so on a machine left open overnight every new expense
     was dated yesterday by default — silently, on a field most operators will
     not re-read, and into the ledger that feeds the VAT period. */
  const isOnline = useNetwork()
  const [dateAd, setDateAd] = useState(() => businessDayAd())
  const [categoryId, setCategoryId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<ExpenseEntryStatus | null>(null)

  /**
   * Law 8 — the idempotency key is minted ONCE, when the sheet opens, not per
   * submit. That is the whole point: a retried `[Submit]` after a dropped
   * response must carry the SAME uuid so `expenses_client_uuid_key` rejects the
   * duplicate and `createExpense` hands back the row the first attempt wrote.
   * Regenerating it per click would record the cost twice.
   */
  const [clientUuid, setClientUuid] = useState<string>(() => newClientUuid())
  useEffect(() => {
    if (isOpen) {
      setClientUuid(newClientUuid())
      setError(null)
    }
  }, [isOpen])

  const submit = async (status: ExpenseEntryStatus) => {
    if (!categoryId) return setError('Choose a category. Every expense belongs to one — the column is NOT NULL.')
    if (!branchId) return setError('Choose a branch. expenses.branch_id is NOT NULL, so an expense cannot be recorded without one.')
    if (!vendor.trim()) return setError('Enter the vendor. vendor_name is NOT NULL and there is no "unknown vendor" to fall back on.')
    if (!description.trim()) return setError('Enter a description. It is NOT NULL, and it is the only human label the row carries.')
    /*
     * `Number.isFinite` is not decoration: `NaN <= 0` is false, so a non-finite
     * amount slips past a bare `amount <= 0` and reaches `rupees()`, which would
     * hand the insert `NaN` paisa. `expenses_amount_positive` would then reject
     * it as a 400 the operator cannot act on.
     */
    if (!Number.isFinite(amount) || amount <= 0) {
      return setError('Enter the amount in rupees — it must be greater than 0 (expenses_amount_positive).')
    }
    /* PLAN.md Phase 9 — money is refused offline, with the reason (from main's
       Phase 9 work). Without this the number allocation fails with a bare
       network error. */
    if (!isOnline) {
      return setError(
        'This device is offline. An expense is not queued for later: its number and the books need the server. Record it when you are back online.',
      )
    }

    setSaving(status)
    setError(null)
    try {
      await createExpense(
        {
          categoryId,
          branchId,
          vendorName: vendor,
          description,
          amount: rupees(amount),
          expenseDateAd: dateAd,
          status,
          createdBy,
        },
        clientUuid,
      )
      onSaved()
      onClose()
    } catch (e) {
      // Law 12 — inline and persistent. Toasts carry successes only.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  const busy = saving !== null
  const blocked = lookupsError !== null || categories.length === 0 || branches.length === 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Expense"
      subtitle="Record a cost against a branch and category."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => void submit('Draft')} disabled={busy || blocked}>
            {saving === 'Draft' ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button variant="primary" onClick={() => void submit('Pending Approval')} disabled={busy || blocked}>
            {saving === 'Pending Approval' ? 'Submitting…' : 'Submit'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && <ErrorBanner title="This expense was not recorded" message={error} />}

        {lookupsError && (
          <ErrorBanner
            title="Could not load categories and branches"
            message={`${lookupsError} Without both, an expense cannot be recorded: category_id and branch_id are NOT NULL.`}
          />
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Date</span>
          {/* §9.4 — "BS above AD". The BS line used to be rendered here from a
              local `bsLabel`; `DateField` now renders it itself, from the same
              `lib/bs` engine, so keeping this one would print it twice. Law 7
              still keeps BS out of storage entirely. */}
          <DateField ariaLabel="Expense date" value={dateAd} onChange={setDateAd} style={inputStyle} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Vendor</span>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Amount (Rs)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              // 0 renders as an empty box rather than a typed-looking "0": the
              // state has to be a number for the guard, but the operator must
              // see a field they are required to fill.
              value={amount === 0 ? '' : amount}
              onChange={(e) => {
                const next = Number(e.target.value)
                setAmount(Number.isFinite(next) ? next : 0)
              }}
              style={inputStyle}
            />
            {/* Confirms the direction of the conversion: rupees typed →
                `rupees()` → paisa → `formatMoney` renders it back. */}
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {amount > 0 ? formatMoney(rupees(amount)) : '—'}
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Branch</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={inputStyle}>
              <option value="">Choose a branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/*
          The four controls §9.4 draws that have nowhere to write. They are
          NOT rendered as inputs — an input that silently discards what was
          typed is worse than an absent one — but they are named, with the
          reason each is absent, so the gap is on the screen rather than in a
          comment nobody opens.
        */}
        <div
          style={{
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: 'var(--sp-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>
            <Icon name="info" size={14} />
            {/* Drawn in the wireframe, not stored by the schema */}Not tracked yet </div>
          {NO_COLUMN_FIELDS.map((f) => (
            <div key={f.label} style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text2)' }}>{f.label}</strong> — {f.why}
            </div>
          ))}
          <div>
            <Unavailable reason={ATTACHMENT_UNAVAILABLE}>
              <Button icon="upload" disabled>
                Attach receipt
              </Button>
            </Unavailable>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE SCREEN
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * **`embedded`** — hosted as Finance's Expenses TAB rather than reached at
 * `/finance/expenses`. See `TabHeader.tsx`: the `<h1>` is demoted to a subtitle
 * so the tab strip is not sitting above a second page title, and nothing else
 * about the screen changes. Not a width branch (Law 13).
 */
export default function Expenses({
  embedded = false,
  filtersOpen: externalFiltersOpen,
  onFiltersClose,
  searchQuery: externalSearchQuery,
  onSearchChange,
  onActiveFilterCountChange,
}: {
  embedded?: boolean
  filtersOpen?: boolean
  onFiltersClose?: () => void
  searchQuery?: string
  onSearchChange?: (q: string) => void
  onActiveFilterCountChange?: (count: number) => void
}) {
  const { user } = useAuth()
  /** The one money gate. Mirrors `auth_can_view_money()` — Law 6. */
  const money = useCanViewMoney()
  const restriction = financeRestriction(money)
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tabular = useTabularLayout()

  /**
   * §9.4's chip row is `(All)(Draft)(Submitted)(Approved)(Rejected)`.
   *
   * Two deliberate departures, both because the schema is the authority on its
   * own vocabulary:
   *  · **"Submitted" is not a member of `expense_status`.** The enum (0001:1067)
   *    is Draft · Pending Approval · Approved · Paid · Rejected · Cancelled, and
   *    a chip sending `status.in.('Submitted')` matches nothing and renders a
   *    confident, false empty state — the same trap `STORED_INVOICE_STATUSES`
   *    documents for 'Overdue'. The chip carries the stored name.
   *  · **Six chips, not four.** 'Paid' and 'Cancelled' are storable states; a
   *    chip row that omits them makes those rows unreachable from the only
   *    filter the screen has.
   *
   * `EXPENSE_STATUSES` is imported rather than retyped, so a chip cannot ask for
   * a value the enum does not have.
   */
  const [status, setStatus] = useState<ExpenseStatusDb | 'All'>('All')
  const [categoryId, setCategoryId] = useState<string>('All')
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const searchQuery = externalSearchQuery ?? localSearchQuery
  const setSearchQuery = useCallback(
    (q: string) => {
      if (onSearchChange) onSearchChange(q)
      else setLocalSearchQuery(q)
    },
    [onSearchChange],
  )
  const activeFilterCount = Number(categoryId !== 'All')
  useEffect(() => {
    onActiveFilterCountChange?.(activeFilterCount)
  }, [activeFilterCount, onActiveFilterCountChange])
  const [internalFiltersOpen, setInternalFiltersOpen] = useState(false)
  const filtersOpen = externalFiltersOpen ?? internalFiltersOpen
  const closeFilters = onFiltersClose ?? (() => setInternalFiltersOpen(false))
  const [page, setPage] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [banner, setBanner] = useState<{ title: string; message: string } | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  /* ── The two lookups ────────────────────────────────────────────────────
   *
   * `expense_categories` and `branches` are both `auth_is_staff()`, so a
   * money-blind session CAN read them — and must not, because it is not being
   * shown this screen at all. Skipped rather than fetched and hidden.
   */
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([])
  const [branches, setBranches] = useState<ExpenseBranchRow[]>([])
  const [lookupsError, setLookupsError] = useState<string | null>(null)

  useEffect(() => {
    if (!money) return
    let cancelled = false
    Promise.all([listExpenseCategories(), listExpenseBranches()])
      .then(([cats, brs]) => {
        if (cancelled) return
        setCategories(cats)
        setBranches(brs)
        setLookupsError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLookupsError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [money])

  /**
   * The whole filter set, server-side. There is no `.filter()` over fetched
   * rows anywhere in this file — that is the defect `lib/queries/listQuery.ts`
   * exists to end, and over a paged list it would narrow the page rather than
   * the table while the pager kept describing a different set.
   *
   * `chips` groups are omitted rather than sent empty when nothing is selected:
   * `applyListFilters` reads `[]` as "no constraint", so an empty group is
   * harmless — but omitting it keeps `useList`'s `isFiltered` honest without a
   * baseline object.
   */
  const filters: ListFilters = useMemo(() => {
    const chips: Record<string, readonly string[]> = {}
    if (status !== 'All') chips['status'] = [status]
    if (categoryId !== 'All') chips['category_id'] = [categoryId]
    const trimmed = searchQuery.trim()
    return {
      ...(Object.keys(chips).length > 0 ? { chips } : {}),
      ...(trimmed ? { search: trimmed } : {}),
      sort: { column: 'expense_date', ascending: false },
      tiebreak: 'id',
      page: { index: page - 1, size: ROWS_PER_PAGE },
    }
  }, [status, categoryId, searchQuery, page])

  const isFiltered = status !== 'All' || categoryId !== 'All' || Boolean(searchQuery.trim())

  /*
   * Short-circuits for a money-blind session. Sending a request you already know
   * RLS will refuse is not a gate — and the `[]` it returns is the exact
   * ambiguity the page gate exists to remove.
   */
  const fetchExpenses = useCallback(
    async (f: ListFilters): Promise<ListQueryResult<ExpenseListRow>> => {
      if (!money) return { rows: [], total: 0 }
      return listExpenses({ ...f, withCount: true })
    },
    [money],
  )

  const list = useList<ExpenseListRow>(fetchExpenses, filters, { isFilteredOverride: isFiltered })

  const total = list.total
  const pageCount = total === null ? 1 : Math.max(1, Math.ceil(total / ROWS_PER_PAGE))

  /* A stale page past the end of a freshly-narrowed list would ask Postgres for
     rows that do not exist and render a blank table under a live pager. */
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const clearFilters = useCallback(() => {
    setStatus('All')
    setCategoryId('All')
    setSearchQuery('')
    setPage(1)
  }, [setSearchQuery])

  /* `useList` memoises `refetch`; naming it keeps the callback keyed on
     the function rather than on the whole list object, which is a fresh literal
     every render (react-hooks/exhaustive-deps, TODO_SWEEP A13). */
  const { refetch: refetchList } = list

  const move = useCallback(
    async (row: ExpenseListRow, to: ExpenseStatusDb) => {
      setMovingId(row.id)
      setBanner(null)
      try {
        await setExpenseStatus(row.id, row.status, to)
        refetchList()
      } catch (e) {
        setBanner({
          title: `${row.expenseNo} was not changed`,
          message: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setMovingId(null)
      }
    },
    [refetchList],
  )

  /**
   * The sheet has already written the row; this only brings the screen back
   * into line with what the database now says.
   *
   * The new expense is deliberately NOT prepended to the list. It is read back
   * from Postgres by the refetch, so what the table shows is what was actually
   * stored — including the `expense_no` the allocator issued and the category
   * and branch names the embeds resolved, none of which the form knew. That
   * read-back IS the confirmation: a row the screen invented would look
   * identical until the next refetch removed it again.
   *
   * No success toast, and that is a constraint rather than a choice:
   * `useToast()` throws outside `ToastProvider`, which would make this screen
   * unmountable on its own. Law 12 keeps successes off the inline banner, so
   * the returning row is the feedback.
   */
  const onSaved = useCallback(() => {
    setBanner(null)
    setPage(1)
    refetchList()
  }, [refetchList])

  const countedTitle = total === null ? 'Expenses' : `${total} ${total === 1 ? 'expense' : 'expenses'}`

  const headerActions = (
    <Button icon="plus" variant="primary" onClick={() => setSheetOpen(true)} aria-label="Add Expense">
      {phone ? '' : 'Add Expense'}
    </Button>
  )

  return (
    <PageShell width="full" className="finance-v2">
      {/* The action is omitted for a money-blind session, not disabled: it
          operates on records that session may not read at all. */}
      <ScreenHeader
        embedded={embedded}
        icon="card"
        title="Expenses"
        status={
          money && total !== null ? (
            <span className="badge badge-neutral" style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>
              {total} {total === 1 ? 'expense' : 'expenses'}
            </span>
          ) : undefined
        }
        search={
          money
            ? {
                value: searchQuery,
                onChange: (val: string) => {
                  setSearchQuery(val)
                  setPage(1)
                },
                onClear: () => {
                  setSearchQuery('')
                  setPage(1)
                },
                placeholder: 'Search expenses by vendor, description, or #…',
                ariaLabel: 'Search expenses',
              }
            : undefined
        }
        leading={!embedded && money ? <FilterButton onClick={() => setInternalFiltersOpen((open) => !open)} controls="expense-filters" expanded={filtersOpen} activeCount={Number(categoryId !== 'All')} /> : undefined}
        description="Track operating costs and approvals."
        {...(money ? { actions: headerActions } : {})}
      />
      <FilterDrawer id="expense-filters" open={filtersOpen} onClose={closeFilters} resultCount={list.loading ? null : total} noun="expenses" activeCount={Number(categoryId !== 'All')} onClearAll={() => { setCategoryId('All'); setPage(1) }} standardFooter onApply={closeFilters}>
        <label style={{ display: 'grid', gap: 8, fontWeight: 600 }}>Category
          <Select aria-label="Filter expenses by category" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1) }} disabled={categories.length === 0} style={{ ...inputStyle, minHeight: 44, width: '100%' }}>
            <option value="All">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </label>
      </FilterDrawer>

      {/*
        THE gate. `restricted` outranks error, loading, empty and children, so a
        money-blind session never reaches the chip row, the table or the pager —
        and is never told "No expenses yet" about rows RLS withheld.
      */}
      <PageBody noun="expenses" {...restriction}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {banner && <ErrorBanner title={banner.title} message={banner.message} />}

          {lookupsError && (
            <ErrorBanner
              title="Could not load the category filter"
              message={`${lookupsError} The list below is unaffected — only the category dropdown and the entry form need these.`}
            />
          )}

          {/* §9.4 line 1 of the filter row — the status chips. */}
          <div
            role="group"
            aria-label="Filter by status"
            className="finance-chip-track rsp-chip-scroll"
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              overflowX: 'visible',
              alignItems: 'center',
              paddingBottom: phone ? 4 : 0,
            }}
          >
            <div style={{ flex: '1 1 220px', maxWidth: 340, minWidth: 0 }}>
              <SearchInput
                value={searchQuery}
                onChange={(val) => {
                  setSearchQuery(val)
                  setPage(1)
                }}
                onClear={() => {
                  setSearchQuery('')
                  setPage(1)
                }}
                placeholder="Search vendor, description, or #…"
                aria-label="Search expenses"
              />
            </div>
            {(['All', ...EXPENSE_STATUSES] as const).map((s) => {
              const on = status === s
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setStatus(s)
                    setPage(1)
                  }}
                  className={`finance-filter-chip ${on ? 'is-active' : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    minHeight: 44,
                    padding: '0 14px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {s !== 'All' && <Icon name={STATUS_GLYPH[s]} size={13} />}
                  {s}
                </button>
              )
            })}

          </div>

          <Card title={countedTitle} bodyStyle={{ padding: 0 }}>
            {/*
              Fixed ladder: restricted → error → loading → empty → children.
              `restricted` is spread here too — this card is the surface whose
              empty state would otherwise read "No expenses yet" to a session
              that was simply refused. `hasRows` keeps a failed REFRESH from
              blanking a table somebody is reading.
            */}
            <PageBody
              loading={list.loading}
              error={list.error}
              onRetry={list.refetch}
              hasRows={list.rows.length > 0}
              empty={list.isEmpty}
              emptyIsFiltered={list.isFiltered}
              noun="expenses"
              skeleton="table"
              skeletonRows={6}
              emptyTitle={isFiltered ? 'No expenses match these filters' : 'No expenses yet'}
              emptyMessage={
                isFiltered
                  ? 'Clear the status chip or the category to see everything again.'
                  : 'Nothing has been recorded. Add Expense enters one against a branch and a category.'
              }
              {...(isFiltered
                ? { onClearFilters: clearFilters }
                : { emptyActionLabel: 'Add Expense', onEmptyAction: () => setSheetOpen(true) })}
              {...restriction}
            >
              {tabular ? (
                <DataTableShell ariaLabel="Expenses" className="finance-table-shell" data-table-scroll style={{ overflowX: 'auto' }}>
                  <table className="finance-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {/* §9.4 — `exp# │ date │ category │ vendor │ amount │ VAT │ badge │ ⋮` */}
                        <th style={th}>Expense</th>
                        <th style={th}>Date</th>
                        <th style={th}>Category</th>
                        <th style={th}>Vendor</th>
                        <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                        <th style={th}>
                          <Unavailable reason={VAT_UNAVAILABLE}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                              VAT
                              <Icon name="info" size={11} />
                            </span>
                          </Unavailable>
                        </th>
                        <th style={th}>Status</th>
                        <th style={{ ...th, textAlign: 'right' }} aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.rows.map((r) => (
                        <tr key={r.id} className="finance-row" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={td}>
                            <div className="identifier finance-mono" style={{ fontWeight: 700 }}>
                              {r.expenseNo}
                            </div>
                            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.branchName}</div>
                          </td>
                          <td style={td}>
                            {/* Law 7 — BS above AD, both rendered from the stored AD day. */}
                            <div className="figure finance-mono" style={{ fontWeight: 600 }}>{bsLabel(r.expenseDateAd)}</div>
                            <div className="figure finance-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                              {formatAd(dayAsDate(r.expenseDateAd))}
                            </div>
                          </td>
                          <td style={{ ...td, color: 'var(--text2)' }}>
                            <div>{r.categoryName}</div>
                            <div className="identifier finance-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                              {r.categoryCode}
                            </div>
                          </td>
                          <td style={{ ...td, color: 'var(--text2)' }}>
                            <div>{r.vendorName}</div>
                            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', maxWidth: 240 }}>{r.description}</div>
                          </td>
                          <td className="figure finance-mono" style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {formatMoney(r.amount)}
                          </td>
                          <td style={td}>
                            <NoValue reason={VAT_UNAVAILABLE} />
                          </td>
                          <td style={td}>
                            <StatusBadge status={r.status} />
                          </td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <RowMenu row={r} busy={movingId === r.id} onMove={(to) => void move(r, to)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableShell>
              ) : (
                /* §9.4 shell note — "Tables become card rows below 768."
                   `useTabularLayout` is the same width reading `RentalsList`
                   and `Finance` use; Law 13/14, capability not platform. */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {list.rows.map((r) => (
                    <div
                      key={r.id}
                      className="finance-card-item"
                    >
                      <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <span className="identifier finance-mono" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                          {r.expenseNo}
                        </span>
                        <StatusBadge status={r.status} />
                      </span>

                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {r.vendorName} · {r.categoryName}
                      </span>

                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span className="figure finance-mono" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                          {formatMoney(r.amount)}
                        </span>
                        <span className="figure finance-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                          {bsLabel(r.expenseDateAd)} · {formatAd(dayAsDate(r.expenseDateAd))}
                        </span>
                      </span>

                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-meta)' }}>
                        <span style={{ color: 'var(--text2)' }}>VAT</span>
                        <NoValue reason={VAT_UNAVAILABLE} />
                      </span>

                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <RowMenu row={r} busy={movingId === r.id} onMove={(to) => void move(r, to)} />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {total !== null && total > ROWS_PER_PAGE && (
                <div style={{ padding: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
                  <Pagination page={page} total={total} pageSize={ROWS_PER_PAGE} onPageChange={setPage} />
                </div>
              )}
            </PageBody>
          </Card>
        </div>
      </PageBody>

      {/* Mounted only for a session that may read what it writes, and remounted
          per open so the Law 8 idempotency key is minted fresh for a new entry
          and held constant across a retried submit. */}
      {money && sheetOpen && (
        <AddExpenseSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSaved={onSaved}
          categories={categories}
          branches={branches}
          lookupsError={lookupsError}
          createdBy={user?.id ?? null}
        />
      )}

    </PageShell>
  )
}
