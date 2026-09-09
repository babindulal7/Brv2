import { useCallback, useEffect, useState } from 'react'
import { Card, Button } from '../../../components/ui/Page'
import { ErrorBanner } from '../../../components/ui/StateViews'
import { useAuth } from '../../../lib/auth'
import { canEditServicePlan } from '../../../lib/rbac'
import { newClientUuid, supabase } from '../../../lib/supabase'
import { hasServicePlan } from '../../../lib/serviceDue'

/**
 * **Service plan** — the card R-28 puts on the product model.
 *
 * ## Why this card is the whole feature
 *
 * All three intervals are nullable and null means that trigger is off, which is
 * the right default for every model on the day `0103` lands: nothing should
 * start warning about a fleet nobody has set a policy for. But it also means
 * that until a model is given a plan, `product_units_service_v` returns a null
 * `due_reason` for every one of its units, no badge ever renders anywhere, and
 * R-28 is a view with no way in. This is the way in.
 *
 * ## Model, not unit — and the fields say so
 *
 * R-28 ruled the interval onto the **product model**, not the category and not
 * the unit, so this card sits on the model's page and the sentence under it says
 * "every unit of this model". A per-unit override is not offered, because
 * offering one would be a second place the answer could live.
 *
 * ## Either, not both
 *
 * The three intervals are alternatives, not a form to complete: whichever
 * threshold is reached first makes the unit due. Any one of them alone is a
 * complete plan, and the helper text says that rather than marking two of the
 * three optional and letting the reader guess what happens when both are set.
 *
 * ## Read-only below Manager
 *
 * `inventory.edit_service_plan` is Owner · Admin · Manager (`PERMISSIONS.md`
 * §4.3). A Coordinator or a Warehouse seat sees the plan — it explains why a
 * badge appeared on their screen — and no controls. The action refuses them at
 * the dispatcher and the policy refuses them at the row; this only avoids
 * showing a control that would fail.
 */

interface Plan {
  serviceIntervalDays: number | null
  serviceIntervalRentalDays: number | null
  serviceIntervalMeterHours: number | null
  serviceGraceDays: number
}

const EMPTY: Plan = {
  serviceIntervalDays: null,
  serviceIntervalRentalDays: null,
  serviceIntervalMeterHours: null,
  serviceGraceDays: 7,
}

export function ServicePlanCard({ productId }: { productId: string }) {
  const { user } = useAuth()
  const mayEdit = user !== null && canEditServicePlan(user.role)

  const [plan, setPlan] = useState<Plan | null>(null)
  const [draft, setDraft] = useState<Plan>(EMPTY)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set when the columns are not on the project yet — `0103` is N-5 blocked. */
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    const { data, error: readError } = await supabase
      .from('products')
      .select(
        'service_interval_days, service_interval_rental_days, service_interval_meter_hours, service_grace_days',
      )
      .eq('id', productId)
      .maybeSingle()

    if (readError) {
      /* `42703 undefined_column` means 0103 has not been applied to this
         project. That is a deployment state, not a fault, and the card says so
         instead of showing an error an operator cannot act on. */
      setUnavailable(true)
      return
    }
    const row = (data ?? {}) as Record<string, number | string | null>
    const next: Plan = {
      serviceIntervalDays: toNullableNumber(row['service_interval_days']),
      serviceIntervalRentalDays: toNullableNumber(row['service_interval_rental_days']),
      serviceIntervalMeterHours: toNullableNumber(row['service_interval_meter_hours']),
      serviceGraceDays: toNullableNumber(row['service_grace_days']) ?? 7,
    }
    setPlan(next)
    setDraft(next)
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  if (unavailable) {
    return (
      <Card title="Service plan">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
          Preventive service is not on this project yet — migration <code>0103</code> has not been applied. The plan
          fields, the derived <code>Service due</code> badge and the maintenance saved view all arrive together.
        </p>
      </Card>
    )
  }

  if (plan === null) {
    return (
      <Card title="Service plan">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Reading…</p>
      </Card>
    )
  }

  const planned = hasServicePlan(plan)

  function save() {
    if (user === null) return
    setSaving(true)
    setError(null)
    void import('../../../actions/inventory/updateServicePlan')
      .then((m) =>
        m.updateServicePlan(
          {
            productId,
            clientUuid: newClientUuid(),
            patch: {
              serviceIntervalDays: draft.serviceIntervalDays,
              serviceIntervalRentalDays: draft.serviceIntervalRentalDays,
              serviceIntervalMeterHours: draft.serviceIntervalMeterHours,
              serviceGraceDays: draft.serviceGraceDays,
            },
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then(async () => {
        setEditing(false)
        await load()
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setSaving(false))
  }

  return (
    <Card
      title="Service plan"
      action={
        mayEdit && !editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {planned ? 'Edit plan' : 'Set a plan'}
          </Button>
        ) : undefined
      }
    >
      {error !== null && <ErrorBanner message={error} />}

      <p style={{ margin: '0 0 var(--sp-md)', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
        Applies to <strong>every unit of this model</strong>. A unit is due when the FIRST of these is reached —
        set any one of the three and leave the rest blank. A due unit is still bookable; it is a warning, not a hold.
      </p>

      {!planned && !editing ? (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
          <strong style={{ color: 'var(--text)' }}>No preventive plan.</strong> Nothing on this model will ever badge
          until one of the three intervals is set.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
          <Row
            label="Every"
            unit="calendar days"
            value={editing ? draft.serviceIntervalDays : plan.serviceIntervalDays}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, serviceIntervalDays: v }))}
          />
          <Row
            label="Every"
            unit="rental days out"
            value={editing ? draft.serviceIntervalRentalDays : plan.serviceIntervalRentalDays}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, serviceIntervalRentalDays: v }))}
          />
          <Row
            label="Every"
            unit="meter hours"
            value={editing ? draft.serviceIntervalMeterHours : plan.serviceIntervalMeterHours}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, serviceIntervalMeterHours: v }))}
          />
          <Row
            label="Grace of"
            unit="days before it reads Overdue"
            value={editing ? draft.serviceGraceDays : plan.serviceGraceDays}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, serviceGraceDays: v ?? 0 }))}
          />
        </div>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)' }}>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save plan'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(plan)
              setEditing(false)
              setError(null)
            }}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      )}
    </Card>
  )
}

function Row({
  label,
  unit,
  value,
  editing,
  onChange,
}: {
  label: string
  unit: string
  value: number | null
  editing: boolean
  onChange: (value: number | null) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', minWidth: 64 }}>{label}</span>
      {editing ? (
        <input
          type="number"
          min={1}
          value={value === null ? '' : String(value)}
          placeholder="off"
          aria-label={`${label} ${unit}`}
          onChange={(e) => {
            const raw = e.target.value.trim()
            /* An empty box is `null` — "this trigger is off" — and not 0, which
               the database refuses and which would read as "due immediately". */
            onChange(raw === '' ? null : Number(raw))
          }}
          style={{
            width: 96,
            padding: '6px 8px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            minHeight: 36,
          }}
        />
      ) : (
        <span className="figure" style={{ fontWeight: 700, color: value === null ? 'var(--muted)' : 'var(--text)' }}>
          {value === null ? 'off' : String(value)}
        </span>
      )}
      <span style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{unit}</span>
    </div>
  )
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}
