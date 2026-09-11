import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, PageHeader, Button, FooterNote } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Badge } from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../lib/auth'
import { canUpdateBundle } from '../../lib/rbac'
import { newClientUuid } from '../../lib/supabase'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney, parseMoney, toRupees } from '../../lib/money'
import { useRentalWindowParams } from '../../lib/rentalWindowParams'
import { useBundleWithItems } from '../../lib/queries/useBundles'
import { useInventoryCategories, listInventory } from '../../lib/queries/inventory'
import type { InventoryListRow } from '../../lib/queries/inventory'
import type { BundleWithItems } from '../../lib/queries/bundles'
import type {
  UpdateBundlePatch,
  UpdateBundleLineEdit,
  UpdateBundleLineAdd,
} from '../../actions/inventory/updateBundle'

/**
 * **Edit bundle** — `/inventory/bundles/:bundleRef/edit`.
 *
 * A bundle could be created and then never changed: `createBundle` existed,
 * `updateBundle` did not, and neither did a route or a screen. This is the
 * other half.
 *
 * ## What this screen offers, and the one thing it does not
 *
 * Name, description, category, both rates, archived/active, and every existing
 * component's quantity · days · mandatory. New components can be added from the
 * live catalogue. **A component cannot be removed**, and there is deliberately
 * no control for it: `authenticated` holds no DELETE grant on `bundle_items`,
 * the table has no `removed_at` or `is_active` column, and
 * `bundle_items_qty_positive` refuses a quantity of zero — three different
 * rules, each closing one of the three ways it could be done. A "Remove" button
 * here would be a control that fails at the database, which is the exact shape
 * Law 6's UI rule exists to prevent: forbidden is ABSENT, not offered and
 * refused. The gap is stated on the screen and filed as PLAN.md §4.52;
 * `actions/inventory/updateBundle.ts` carries the full derivation.
 *
 * RULING 2026-09-08 (R-34): no removal control, and the picker draws no availability —
 * which is what keeps this screen clear of the still-open §4.45(a).
 *
 * ## The component picker shows identity, not availability
 *
 * Deliberately, and it is what keeps this screen clear of **§4.45(a)** — the
 * open ruling that blocks Add Bundle. That ruling is about the four count
 * columns (Stock · Avail · Res · Rent) an item picker draws, and how ten
 * `product_units.status` members collapse into them. This picker draws none of
 * them: it shows what a product IS — name, asset code, category, and its rate
 * for a money-visible session — and says nothing about what is free. Nothing
 * here can tell an operator that gear is available, so nothing here can tell
 * them wrong. Availability stays where §4.44 put it: measured against a window,
 * on the detail page this screen returns to.
 *
 * ## Only the changed keys are sent
 *
 * The form seeds from the loaded row and diffs against it at Save. A field the
 * operator did not touch is absent from the payload, so it keeps its stored
 * value rather than being rewritten with the same value — which matters most
 * for the category, whose id this screen holds precisely so an untouched
 * category cannot be lost re-resolving a display name.
 *
 * ## Law 8 — the keys are minted once, and survive a retry
 *
 * `writeKeys` holds the action key and one key per edited and added row, minted
 * on the first press and REUSED by every retry, so a failed save that is fixed
 * and pressed again re-applies the same edits instead of doubling them. They
 * are cleared only when a save lands. Same `useRef` shape as `AddBundle` and
 * `AddEquipment`.
 *
 * ## Law 6 — money
 *
 * Both rate fields are OMITTED for a money-blind session, not masked and not
 * disabled. `canUpdateBundle` is Owner/Admin/Manager today and all three are
 * money-visible, so that branch is unreachable in practice — it is written
 * anyway because the two rules are independent and nothing keeps them aligned.
 */

const RATE_HINT = 'Rupees. Leave a rate alone and the stored figure stands — this form never rewrites a field you did not touch.'

interface LineDraft {
  /** `bundle_items.id` — what `updateBundle` writes against. */
  itemId: string
  productName: string
  /** Held as text so a half-typed number is not silently read as 0. */
  quantity: string
  days: string
  isMandatory: boolean
}

interface AddDraft {
  /** Local only — the React key and the Law 8 row key both hang off it. */
  key: string
  productId: string
  productName: string
  quantity: string
  days: string
}

interface Draft {
  name: string
  description: string
  /** `inventory_categories.id`, or `''` for "no category". */
  categoryId: string
  isActive: boolean
  /** Rupee text. Empty means the operator cleared the field — see `ratePatch`. */
  dailyRate: string
  weeklyRate: string
  lines: LineDraft[]
  adds: AddDraft[]
}

function draftOf(b: BundleWithItems): Draft {
  return {
    name: b.name,
    description: b.description ?? '',
    categoryId: b.categoryId ?? '',
    isActive: b.isActive,
    dailyRate: String(toRupees(b.dailyRate)),
    weeklyRate: String(toRupees(b.weeklyRate)),
    lines: b.items.map((i) => ({
      itemId: i.itemId,
      productName: i.productName,
      quantity: String(i.quantity),
      days: String(i.days),
      isMandatory: i.isMandatory,
    })),
    adds: [],
  }
}

/** A positive integer, or null — the same reading the database's CHECKs take. */
function positiveInt(text: string): number | null {
  const n = Number(text.trim())
  return Number.isInteger(n) && n >= 1 ? n : null
}

const labelStyle: CSSProperties = { fontSize: 'var(--t-meta)', color: 'var(--muted)' }
const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  color: 'var(--muted)',
  fontWeight: 600,
  background: 'var(--th-bg)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}
const td: CSSProperties = {
  padding: '8px 10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}

export interface EditBundleProps {
  bundleRef?: string | undefined
  embedded?: boolean
  onDone?: () => void
}

export default function EditBundle(props: EditBundleProps = {}) {
  const { bundleRef: propBundleRef, embedded, onDone } = props
  const routeParams = useParams<{ bundleRef: string }>()
  const bundleRef = propBundleRef ?? routeParams.bundleRef
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
  const { showSuccessToast } = useToast()

  /* The window travels with the operator. It means nothing on this screen — an
     edit has no availability — but the page they came from and return to is
     measured against it (§4.44), and dropping it here would silently reset
     their window to today on the way back. */
  const { search } = useRentalWindowParams()
  const backTo = `/inventory/bundles/${bundleRef ?? ''}${search}`

  const handleExit = () => {
    if (onDone) {
      onDone()
    } else {
      navigate(backTo)
    }
  }

  const record = useBundleWithItems(bundleRef, money)
  const categories = useInventoryCategories()

  /*
   * The loaded row is HELD, not read straight off the query, and it is captured
   * ONCE per bundle id.
   *
   * The reason is the diff, not the render. Every field below is decided by
   * comparing the draft against this row, so if a re-query replaced it
   * mid-edit — `useList` calls `setRows` on every successful answer — the
   * baseline would move under the operator and their edit could silently
   * become a no-op: they type the value someone else has just saved, the diff
   * sees no change, and Save greys out with nothing sent. Frozen, the same
   * situation collides at the write instead, where it is visible.
   *
   * (`useList` deliberately keeps its rows across a re-query, so this is not
   * also guarding against the form blanking. That would need rows to be
   * cleared, and they are not.)
   */
  const [bundle, setBundle] = useState<BundleWithItems | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetched = record.rows[0]
  useEffect(() => {
    if (!fetched) return
    if (bundle?.id === fetched.id) return
    setBundle(fetched)
    setDraft(draftOf(fetched))
  }, [fetched, bundle])

  /* Law 8 — minted on the first press, reused by every retry, cleared only when
     a save lands. `lines` is keyed by `bundle_items.id`, `adds` by the draft's
     own local key: each ROW needs its own envelope key or the offline queue
     de-duplicates several edits into one. */
  const writeKeys = useRef<{ action: string | null; rows: Map<string, string> }>({
    action: null,
    rows: new Map(),
  })

  /* ── the component picker ────────────────────────────────────────────────
     A search over the live catalogue, identity only. See the header for why it
     draws no availability. */
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InventoryListRow[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    let live = true
    setSearching(true)
    const timer = setTimeout(() => {
      listInventory({ search: term, page: { index: 0, size: 12 }, withMoney: money })
        .then((r) => {
          if (!live) return
          setResults(r.rows)
          setSearchError(null)
        })
        .catch((e: unknown) => {
          if (!live) return
          setResults([])
          setSearchError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (live) setSearching(false)
        })
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, money])

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'No category' },
      ...categories.rows.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories.rows],
  )

  /* ── the diff ────────────────────────────────────────────────────────────
     Computed on every render rather than tracked by dirty flags: the flags
     would be a second source of truth about what changed, and the payload is
     what actually decides. */
  const diff = useMemo(() => {
    if (!bundle || !draft) return null

    const patch: UpdateBundlePatch = {}
    if (draft.name.trim() !== bundle.name) patch.name = draft.name.trim()
    const nextDescription = draft.description.trim() ? draft.description.trim() : null
    if (nextDescription !== (bundle.description ?? null)) patch.description = nextDescription
    const nextCategory = draft.categoryId ? draft.categoryId : null
    if (nextCategory !== (bundle.categoryId ?? null)) patch.categoryId = nextCategory
    if (draft.isActive !== bundle.isActive) patch.isActive = draft.isActive

    /* Money — the field is compared in PAISA, not in the rupee text, so
       `1200` and `1200.00` are the same edit and neither is sent. An
       unparseable or emptied field is NOT sent as zero: it is reported below as
       a blocking reason, because a rate the operator cannot see is not a rate
       they asked to clear. */
    const rateProblems: string[] = []
    if (money) {
      const daily = parseMoney(draft.dailyRate)
      if (draft.dailyRate.trim() === '' || daily === null) {
        rateProblems.push('The daily rate is not a number.')
      } else if (daily !== bundle.dailyRate) {
        patch.dailyRatePaisa = daily
      }
      const weekly = parseMoney(draft.weeklyRate)
      if (draft.weeklyRate.trim() === '' || weekly === null) {
        rateProblems.push('The weekly rate is not a number.')
      } else if (weekly !== bundle.weeklyRate) {
        patch.weeklyRatePaisa = weekly
      }
    }

    const lineEdits: Array<Omit<UpdateBundleLineEdit, 'clientUuid'>> = []
    const lineProblems: string[] = []
    for (const [i, l] of draft.lines.entries()) {
      const original = bundle.items.find((x) => x.itemId === l.itemId)
      if (!original) continue
      const quantity = positiveInt(l.quantity)
      const days = positiveInt(l.days)
      if (quantity === null) lineProblems.push(`Component ${i + 1} needs a quantity of at least 1.`)
      if (days === null) lineProblems.push(`Component ${i + 1} needs days of at least 1.`)
      const edit: Omit<UpdateBundleLineEdit, 'clientUuid'> = { itemId: l.itemId }
      let changed = false
      if (quantity !== null && quantity !== original.quantity) {
        edit.quantity = quantity
        changed = true
      }
      if (days !== null && days !== original.days) {
        edit.days = days
        changed = true
      }
      if (l.isMandatory !== original.isMandatory) {
        edit.isMandatory = l.isMandatory
        changed = true
      }
      if (changed) lineEdits.push(edit)
    }

    const lineAdds: Array<Omit<UpdateBundleLineAdd, 'clientUuid'> & { key: string }> = []
    for (const [i, a] of draft.adds.entries()) {
      const quantity = positiveInt(a.quantity)
      const days = positiveInt(a.days)
      if (quantity === null) lineProblems.push(`New component ${i + 1} needs a quantity of at least 1.`)
      if (days === null) lineProblems.push(`New component ${i + 1} needs days of at least 1.`)
      if (quantity === null || days === null) continue
      lineAdds.push({ key: a.key, productId: a.productId, qty: quantity, days })
    }

    const problems = [...rateProblems, ...lineProblems]
    if (draft.name.trim() === '') problems.push('A bundle needs a name.')

    return {
      patch,
      lineEdits,
      lineAdds,
      problems,
      changed: Object.keys(patch).length > 0 || lineEdits.length > 0 || lineAdds.length > 0,
    }
  }, [bundle, draft, money])

  if (!user || !canUpdateBundle(user.role)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
        <PageHeader icon="queues" title="Edit bundle" description={bundleRef ?? ''} />
        <PageBody
          restricted
          restrictedReason="Editing a bundle writes both the bundle and its components, and bundles_manage admits Owner, Admin and Manager only. The control is absent rather than refused."
          restrictedRequiredRole="Owner, Admin or Manager"
          noun="bundle"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  if (!bundle || !draft) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
        <PageHeader icon="queues" title="Edit bundle" description={bundleRef ?? ''} />
        <PageBody
          loading={record.loading}
          error={record.error}
          onRetry={record.refetch}
          empty={record.isEmpty}
          noun="bundle"
          skeleton="card"
          emptyTitle="Bundle not found"
          emptyMessage={`No bundle matches "${bundleRef ?? ''}". It may have been opened from a stale link.`}
          emptyActionLabel={embedded ? 'Back to Bundle' : 'Back to Bundles'}
          onEmptyAction={handleExit}
        >
          {null}
        </PageBody>
      </div>
    )
  }

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  const setLine = (itemId: string, patch: Partial<LineDraft>) =>
    setDraft((d) =>
      d ? { ...d, lines: d.lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) } : d,
    )

  const addComponent = (row: InventoryListRow) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            adds: [
              ...d.adds,
              { key: newClientUuid(), productId: row.id, productName: row.name, quantity: '1', days: '1' },
            ],
          }
        : d,
    )
    setQuery('')
    setResults([])
  }

  /* An addition that has not been saved yet is only in this form's state, so
     dropping it is not a delete and Law 3 has nothing to say about it. That is
     exactly why the saved components below carry no equivalent control. */
  const dropPendingAdd = (key: string) =>
    setDraft((d) => (d ? { ...d, adds: d.adds.filter((a) => a.key !== key) } : d))

  const save = () => {
    if (!diff || !diff.changed || diff.problems.length > 0) return
    const keys = writeKeys.current
    if (!keys.action) keys.action = newClientUuid()
    const keyFor = (id: string) => {
      let k = keys.rows.get(id)
      if (!k) {
        k = newClientUuid()
        keys.rows.set(id, k)
      }
      return k
    }

    const lineEdits: UpdateBundleLineEdit[] = diff.lineEdits.map((e) => ({
      ...e,
      clientUuid: keyFor(e.itemId),
    }))
    /* Spread rather than assigned: `exactOptionalPropertyTypes` treats an
       explicit `undefined` as a different thing from an absent key, and
       `UpdateBundleLineAdd.days` is optional-absent, not optional-undefined. */
    const lineAdds: UpdateBundleLineAdd[] = diff.lineAdds.map((a) => ({
      ...(a.productId !== undefined ? { productId: a.productId } : {}),
      qty: a.qty,
      ...(a.days !== undefined ? { days: a.days } : {}),
      clientUuid: keyFor(a.key),
    }))

    setSaveError(null)
    setSaving(true)
    void import('../../actions/inventory/updateBundle')
      .then((m) =>
        m.updateBundle(
          {
            clientUuid: keys.action as string,
            bundleId: bundle.id,
            patch: diff.patch,
            lineEdits,
            lineAdds,
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then((result) => {
        // A landed save consumes its keys: the next press is a new edit.
        writeKeys.current = { action: null, rows: new Map() }
        const parts = [
          result.changedKeys.length > 0 ? `${result.changedKeys.length} field${result.changedKeys.length === 1 ? '' : 's'}` : null,
          result.linesUpdated > 0 ? `${result.linesUpdated} changed` : null,
          result.linesAdded > 0 ? `${result.linesAdded} added` : null,
        ].filter(Boolean)
        showSuccessToast('Bundle saved', `${result.bundleCode} · ${parts.join(' · ')}`)
        /* Only a landed write leaves the page — the failing path keeps every
           edit on screen instead of discarding it to show a page that would not
           reflect it. */
        handleExit()
      })
      .catch((e: unknown) => {
        setSaveError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setSaving(false))
  }

  const blockingReason =
    diff === null
      ? 'Still loading.'
      : diff.problems.length > 0
        ? diff.problems[0]
        : !diff.changed
          ? 'Nothing has changed yet.'
          : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)', paddingBottom: 60 }}>
      <PageHeader
        icon="queues"
        title={`Edit ${bundle.name}`}
        description={`${bundle.bundleCode} · ${bundle.items.length} component${bundle.items.length === 1 ? '' : 's'}`}
        actions={
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
            {!bundle.isActive && <Badge tone="neutral" label="Archived" />}
            <Button icon="chevron_left" variant="secondary" onClick={handleExit}>
              {embedded ? 'Back to Bundle' : 'Cancel'}
            </Button>
            <Button
              icon="check"
              onClick={save}
              disabled={saving || blockingReason !== null}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      />

      {/*
        Why Save is off, in words, next to the thing it is off on. `Page`'s
        Button does not forward `title`, and a tooltip would be the wrong place
        for it anyway — the house rule is errors inline, toasts for successes.
      */}
      {blockingReason !== null && !saving && (
        <p style={{ ...labelStyle, margin: 0 }}>Save is off — {blockingReason}</p>
      )}

      {saveError !== null && (
        <div
          role="alert"
          style={{
            border: '1px solid var(--danger-soft)',
            background: 'var(--danger-bg)',
            color: 'var(--danger-text)',
            borderRadius: 'var(--r-card)',
            padding: 'var(--sp-md)',
            fontSize: 'var(--t-meta)',
          }}
        >
          {saveError}
        </div>
      )}

      <Card title="Bundle">
        <div style={{ display: 'grid', gap: 'var(--sp-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Input
            label="Name"
            value={draft.name}
            onChange={(e) => setField('name', e.target.value)}
            error={draft.name.trim() === '' ? 'A bundle needs a name.' : null}
          />
          <Select
            label="Category"
            value={draft.categoryId}
            options={categoryOptions}
            onChange={(e) => setField('categoryId', e.target.value)}
            helperText={
              categories.error !== null
                ? 'The category list could not be read, so it is left alone.'
                : 'Six rows in inventory_categories — the enum has more labels than the table has rows.'
            }
            disabled={categories.error !== null}
          />
          <Select
            label="Status"
            value={draft.isActive ? 'active' : 'archived'}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
            onChange={(e) => setField('isActive', e.target.value === 'active')}
            helperText="Law 3 — a retired bundle is archived, never deleted, and stays openable."
          />
          <Input
            label="Description"
            value={draft.description}
            onChange={(e) => setField('description', e.target.value)}
            helperText="Blank is stored as nothing, never as an empty string."
          />
        </div>
      </Card>

      {/* Law 6 — omitted, not masked, for a money-blind session. */}
      {money && (
        <Card title="Rates">
          <div style={{ display: 'grid', gap: 'var(--sp-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Input
              label="Daily rate"
              value={draft.dailyRate}
              inputMode="decimal"
              onChange={(e) => setField('dailyRate', e.target.value)}
              helperText={`Stored: ${formatMoney(bundle.dailyRate)}`}
              error={parseMoney(draft.dailyRate) === null ? 'Not a number.' : null}
            />
            <Input
              label="Weekly rate"
              value={draft.weeklyRate}
              inputMode="decimal"
              onChange={(e) => setField('weeklyRate', e.target.value)}
              helperText={`Stored: ${formatMoney(bundle.weeklyRate)}`}
              error={parseMoney(draft.weeklyRate) === null ? 'Not a number.' : null}
            />
          </div>
          <p style={{ ...labelStyle, marginTop: 'var(--sp-sm)', marginBottom: 0 }}>{RATE_HINT}</p>
        </Card>
      )}

      <Card title={`Components (${draft.lines.length + draft.adds.length})`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Component</th>
                <th style={{ ...th, width: 110 }}>Quantity</th>
                <th style={{ ...th, width: 110 }}>Days</th>
                <th style={{ ...th, width: 150 }}>Mandatory</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l) => (
                <tr key={l.itemId}>
                  <td style={td}>{l.productName}</td>
                  <td style={td}>
                    <Input
                      aria-label={`Quantity for ${l.productName}`}
                      value={l.quantity}
                      inputMode="numeric"
                      onChange={(e) => setLine(l.itemId, { quantity: e.target.value })}
                      error={positiveInt(l.quantity) === null ? 'At least 1.' : null}
                    />
                  </td>
                  <td style={td}>
                    <Input
                      aria-label={`Days for ${l.productName}`}
                      value={l.days}
                      inputMode="numeric"
                      onChange={(e) => setLine(l.itemId, { days: e.target.value })}
                      error={positiveInt(l.days) === null ? 'At least 1.' : null}
                    />
                  </td>
                  <td style={td}>
                    <Select
                      aria-label={`Mandatory for ${l.productName}`}
                      value={l.isMandatory ? 'yes' : 'no'}
                      options={[
                        { value: 'yes', label: 'Mandatory' },
                        { value: 'no', label: 'Optional' },
                      ]}
                      onChange={(e) => setLine(l.itemId, { isMandatory: e.target.value === 'yes' })}
                    />
                  </td>
                </tr>
              ))}
              {draft.adds.map((a) => (
                <tr key={a.key} style={{ background: 'var(--success-bg)' }}>
                  <td style={td}>
                    {a.productName}{' '}
                    <span style={labelStyle}>· not saved yet</span>{' '}
                    <button
                      type="button"
                      onClick={() => dropPendingAdd(a.key)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontSize: 'var(--t-meta)',
                        padding: 0,
                      }}
                    >
                      Drop
                    </button>
                  </td>
                  <td style={td}>
                    <Input
                      aria-label={`Quantity for new component ${a.productName}`}
                      value={a.quantity}
                      inputMode="numeric"
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? { ...d, adds: d.adds.map((x) => (x.key === a.key ? { ...x, quantity: e.target.value } : x)) }
                            : d,
                        )
                      }
                      error={positiveInt(a.quantity) === null ? 'At least 1.' : null}
                    />
                  </td>
                  <td style={td}>
                    <Input
                      aria-label={`Days for new component ${a.productName}`}
                      value={a.days}
                      inputMode="numeric"
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? { ...d, adds: d.adds.map((x) => (x.key === a.key ? { ...x, days: e.target.value } : x)) }
                            : d,
                        )
                      }
                      error={positiveInt(a.days) === null ? 'At least 1.' : null}
                    />
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>Mandatory</td>
                </tr>
              ))}
              {draft.lines.length === 0 && draft.adds.length === 0 && (
                <tr>
                  <td style={{ ...td, color: 'var(--muted)' }} colSpan={4}>
                    This bundle has no components.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p style={{ ...labelStyle, marginTop: 'var(--sp-md)', marginBottom: 0 }}>
          A saved component cannot be removed. There is no DELETE grant on <code>bundle_items</code>,
          the table has no archive column, and a quantity of zero is refused — so retiring one needs a
          schema change, not a button. Filed as PLAN.md §4.52. Until then, archive the bundle and
          build a replacement, or set the component to Optional.
        </p>
      </Card>

      <Card title="Add a component">
        <Input
          label="Search the catalogue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, asset code, brand or model"
          helperText="Identity only — this list says nothing about what is free. Availability is measured against a window, on the bundle's own page."
        />
        {searchError !== null && (
          <p role="alert" style={{ ...labelStyle, color: 'var(--danger-text)' }}>
            The catalogue could not be searched: {searchError}
          </p>
        )}
        {searching && <p style={labelStyle}>Searching…</p>}
        {!searching && query.trim().length >= 2 && results.length === 0 && searchError === null && (
          <p style={labelStyle}>No product matches “{query.trim()}”.</p>
        )}
        {results.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 'var(--sp-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={th}>Product</th>
                  <th style={th}>Asset code</th>
                  <th style={th}>Category</th>
                  {money && <th style={{ ...th, textAlign: 'right' }}>Daily rate</th>}
                  <th style={{ ...th, width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const already =
                    draft.lines.some((l) => bundle.items.find((i) => i.itemId === l.itemId)?.productId === r.id) ||
                    draft.adds.some((a) => a.productId === r.id)
                  return (
                    <tr key={r.id}>
                      <td style={td}>{r.name}</td>
                      <td style={td} className="figure">{r.assetCode}</td>
                      <td style={td}>{r.category ?? '—'}</td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right' }} className="figure">
                          {r.dailyRate === null ? '—' : formatMoney(r.dailyRate)}
                        </td>
                      )}
                      <td style={td}>
                        <Button
                          variant="secondary"
                          onClick={() => addComponent(r)}
                          disabled={already}
                        >
                          Add
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

      <FooterNote
        extra={[
          'Only the fields you changed are sent.',
          'A component edit is recorded against the bundle, not the row — bundle_items has no updated_by.',
        ]}
      />
    </div>
  )
}
