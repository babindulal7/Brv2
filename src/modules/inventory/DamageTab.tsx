import { Children, useMemo, useState, useEffect } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { Badge } from '../../components/ui/Badge'
import type { StatusKey } from '../../lib/status'
import { EmptyState } from '../../components/ui/StateViews'
import { formatMoney, rupees, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { canApproveDamage } from '../../lib/rbac'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  approverFor,
  validateDamageReport,
  settleDeposit,
  approvalEffect,
  OWNER_APPROVAL_THRESHOLD,
  MIN_PHOTOS,
} from '../../lib/damage'
import { getDamageFindings } from '../../lib/queries/damage'
import type { DamageFinding } from '../../lib/queries/damage'

/**
 * # Inventory ▸ Maintenance ▸ Damage
 *
 * The half of the damage flow that carries money.
 *
 * The finding itself is raised at Return, and stays money-free there:
 * `ReturnWorkspace.tsx` is the Warehouse's screen, Foundation §8.3 keeps every
 * Rs figure off it, and §13.1 already says the damage-approval gate reads
 * *"Damage approval required, with no amount"*. So Return captures the
 * description, the photos and the routing; the **charge, the approver and the
 * deposit settlement are here**, where a money-visible role can see them.
 *
 * Every rule below comes from `lib/damage.ts`. This file decides nothing —
 * pages never implement business logic (`CLAUDE.md`).
 */

/**
 * This screen's four chip tones, mapped onto the §4 hues.
 *
 * `success` is the only name that does not survive verbatim: `lib/status`
 * calls green `in` ("home & ready · settled"), which is what an approved
 * finding is. The local name is kept at the call sites — five of them read
 * `tone="success"` / `tone="progress"` and they say what this screen means,
 * not what the palette calls it — so the translation lives here, once.
 */
const CHIP_TONE = {
  danger: 'danger',
  progress: 'progress',
  success: 'in',
  neutral: 'neutral',
} as const satisfies Record<string, StatusKey>

/**
 * Delegates to `<Badge>` — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one
 * component rendering the §4 map from lib/status; every screen inherits. No
 * screen colours a status itself."
 *
 * The two ternary chains this replaces were assembling a bg/fg pair by hand,
 * and the `success` arm got the pairing wrong: `--st-in-bg` (the solid green
 * fill) under `--success-text` (the green INK meant for a page surface). Green
 * on green. The on-colour for that fill is `--on-success`, and §3.2 is
 * explicit that the on-colour is "part of the token, not a screen choice" —
 * which is exactly the choice a hand-built pair forces a screen to make, and
 * this one made it wrong.
 *
 * The `neutral` arm was not a status hue at all (`--card2` / `--text2`); it is
 * now v4.1's gray, "not started yet", which is what both its call sites mean:
 * a finding that has not been approved, and an approval level nobody has acted
 * on yet.
 *
 * The wrapper stays so the call sites keep reading in this screen's own
 * vocabulary, and because it takes `children` rather than a string — the two
 * chips that render `{approver} approves` and `{approverFor(…)} level` compose
 * their word from an engine call. `<Badge>`'s `label` is a string, so the
 * children are joined here.
 */
function Chip({ tone, children }: { tone: keyof typeof CHIP_TONE; children: React.ReactNode }) {
  return <Badge tone={CHIP_TONE[tone]} label={Children.toArray(children).join('')} size="sm" />
}

export function DamageTab() {
  const money = useCanViewMoney()
  const { user } = useAuth()
  const role = user?.role ?? 'Client'

  /*
   * ⛔ The approver is read here ONCE, and there is no fallback for it.
   *
   * This screen used to write `approvedBy: user?.name ?? 'Unknown'` onto the
   * finding and hand the same `'Unknown'` to `approvalEffect()`, so the
   * engine's `reason` — the line that goes to the maintenance record and the
   * audit trail — read "Damage approved by Unknown", and the unit's
   * `availableForBooking: false` consequence was computed from an approver who
   * does not exist. A degrading placeholder is no better than an escalating
   * one here: "approved by Unknown" still asserts that a Rs 1,85,000 charge
   * was approved and attributed to somebody.
   *
   * An approval is the whole point of this card, so the honest answer with no
   * session is not a weaker name — it is no approval. `approver` is `null`
   * whenever nobody is signed in, which disables both decisions below and is
   * stated inline and persistently on the card (Law 12) rather than toasted.
   *
   * RESOLVED 12 Aug 2026 — this carried a `TODO(decision)` because no `lib/rbac`
   * capability governed a damage approval, and the role test was computed inline
   * on this page. It is now `rbac.canApproveDamage(role, requiredApprover)`:
   * **Owner and Manager only.**
   *
   * Two things that changed with it. The page no longer implements the rule
   * (Law 1 — the engines own it), and **Admin no longer qualifies**: the inline
   * expression this replaced read
   * `approver === 'Owner' ? role === 'Owner' : role === 'Owner' || role === 'Admin' || role === 'Manager'`,
   * which granted Admin a sign-off the ruling excludes.
   *
   * The Rs 25,000 banding stays in `lib/damage`'s `approverFor()` and is passed
   * in, so the threshold and the role rule each live in exactly one place.
   */
  const approver = user?.name.trim() ? user.name.trim() : null

  const [findings, setFindings] = useState<DamageFinding[]>([])

  useEffect(() => {
    let active = true
    getDamageFindings().then((res) => {
      if (active) {
        setFindings(res)
      }
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [])

  /* The approval confirmation cannot live inside the pending list: approving
     removes the row from it, so the message would render into a branch that no
     longer exists. Held here and shown above the list instead. */
  const [justApproved, setJustApproved] = useState<{ unitName: string } | null>(null)
  const [chargeDraft, setChargeDraft] = useState<Record<string, string>>({})

  const pending = useMemo(() => findings.filter((f) => f.state === 'Awaiting Approval'), [findings])

  /* §8.3 — a money-blind role does not get a blanked screen, it gets the half
     of this that is its business: what is damaged and what it blocks. */
  if (!money) {
    return (
      <Card title={`Damage findings (${findings.length})`}>
        {findings.length === 0 ? (
          <EmptyState title="No damage findings" description="No active damage findings are currently recorded." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {findings.map((f) => (
              <div key={f.id} style={{ ...cardStyle, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 'var(--t-meta)' }}>{f.unitName}</strong>
                  <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{f.serial}</span>
                  <Chip tone={f.state === 'Approved' ? 'success' : 'progress'}>{f.state}</Chip>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.description}</p>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  <Icon name="lock" size={11} />
                  Charges and deposit settlement are not shown to this role.
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* RS-05 — this used to read "moved to Maintenance and is no longer
          available for booking". Nothing here writes `damage_findings`, opens a
          maintenance job or changes `product_units`: there is no damage action
          in src/actions, so the decision lives in this screen's state only and
          the notice says exactly that. TODO(decision): an `approveDamageFinding`
          action (finding write + maintenance job + unit status, per
          `approvalEffect` in lib/damage.ts) is needed before this can claim
          the move. */}
      {justApproved && (
        <div role="status" style={{ ...cardStyle, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)' }}>
          <Icon name="alert_triangle" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--warn-text)' }} />
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Approval for {justApproved.unitName} is recorded on this screen only — nothing has been written. No damage
            action exists yet, so the finding is not saved, no maintenance job was opened and the unit's availability is
            unchanged.
          </span>
        </div>
      )}

      <Card title={`Awaiting approval (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting" description="Every damage finding raised at Return has been approved or rejected." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending.map((f) => {
              const draft = chargeDraft[f.id]
              const chargePaisa: Paisa = draft === undefined ? f.chargePaisa : rupees(Number(draft) || 0)
              const validation = validateDamageReport({
                description: f.description,
                photos: f.photos,
                chargePaisa,
                replacementPaisa: f.replacementPaisa,
              })
              const settlement = settleDeposit(f.depositPaisa, chargePaisa)
              /* The engine decides who signs; the screen only reports it. A
                 Manager looking at a Rs 1,85,000 finding is told plainly that
                 it is not theirs to approve. */
              const roleMayApprove = canApproveDamage(role, validation.approver)
              /* No session, no approver, no approval — see `approver` above. */
              const mayApprove = approver !== null && roleMayApprove

              return (
                <div key={f.id} style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                    <span className="identifier" style={{ fontSize: 'var(--t-th)', fontWeight: 700 }}>{f.id}</span>
                    <strong style={{ fontSize: 'var(--t-ui)' }}>{f.unitName}</strong>
                    <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{f.serial}</span>
                    <Chip tone={validation.approver === 'Owner' ? 'danger' : 'progress'}>{validation.approver} approves</Chip>
                  </div>

                  <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.description}</p>

                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {f.bookingNo} · {f.client} · raised by {f.raisedBy}, {f.raisedAtAd} ·{' '}
                    <span style={{ color: f.photos >= MIN_PHOTOS ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600 }}>
                      {f.photos} photo(s)
                    </span>
                  </div>

                  {/* The reference figure, labelled as one. Nothing derives the
                      charge from it — the charge is case-by-case. */}
                  <div style={{ display: 'flex', gap: 'var(--sp-lg)', flexWrap: 'wrap', fontSize: 'var(--t-meta)' }}>
                    <span style={{ color: 'var(--text2)' }}>
                      Replacement value{' '}
                      <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>{formatMoney(f.replacementPaisa)}</span>{' '}
                      <span style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>(reference only)</span>
                    </span>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text2)' }}>Charge (Rs)</span>
                    <input
                      id={`damage-charge-${f.id}`}
                      type="number"
                      value={draft ?? String(toRupees(f.chargePaisa))}
                      onChange={(e) => setChargeDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                      style={{ width: 140, minHeight: 44, padding: '0 10px', borderRadius: 'var(--r-input)', border: `1px solid ${validation.errors.charge ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                    />
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      Crosses to Owner at {formatMoney(OWNER_APPROVAL_THRESHOLD)}
                    </span>
                  </label>

                  {validation.errors.charge && (
                    <span role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                      <Icon name="alert_triangle" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                      {validation.errors.charge}
                    </span>
                  )}

                  {validation.warnings.map((w) => (
                    <span key={w} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--progress-text)' }}>
                      <Icon name="info" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                      {w}
                    </span>
                  ))}

                  {/* Law 5 — the deposit is a liability. The refund is derived,
                      never typed, and a charge above the deposit produces a
                      shortfall rather than a negative refund. */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 'var(--t-meta)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
                      <span style={{ color: 'var(--text2)' }}>Deposit held</span>
                      <span className="figure" style={{ fontWeight: 600 }}>{formatMoney(f.depositPaisa)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
                      <span style={{ color: 'var(--text2)' }}>Refund after damage</span>
                      <span className="figure" style={{ fontWeight: 700, color: 'var(--success-text)' }}>{formatMoney(settlement.refundPaisa)}</span>
                    </div>
                    {settlement.shortfallPaisa > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
                        <span style={{ color: 'var(--danger-text)' }}>Not covered by the deposit</span>
                        <span className="figure" style={{ fontWeight: 700, color: 'var(--danger-text)' }}>{formatMoney(settlement.shortfallPaisa)}</span>
                      </div>
                    )}
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>
                      The accountant confirms before the refund is issued.
                      {settlement.shortfallPaisa > 0 && ' The shortfall is raised as a separate receivable — it never moves the deposit below zero.'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button
                      variant="primary"
                      icon="check"
                      disabled={!validation.valid || !mayApprove}
                      onClick={async () => {
                        /* Second gate, deliberately not relying on `disabled`:
                           an edit that loosens the button must not be able to
                           reopen the fabricated-approver path. The refusal is
                           already on the card, so this returns silently. */
                        if (approver === null) return

                        try {
                          const effect = approvalEffect(
                            { description: f.description, photos: f.photos, chargePaisa, replacementPaisa: f.replacementPaisa },
                            approver,
                          )

                          // FORMS-05: Call the backend action to persist the resolution
                          const { resolveDamageFinding } = await import('../../actions/inventory/resolveDamage')
                          await resolveDamageFinding({
                            findingId: f.id,
                            disposition: 'Charge Client', // Hardcoded as the standard path for this UI, could be expanded
                            chargePaisa
                          })

                          setFindings((prev) =>
                            prev.map((x) =>
                              x.id === f.id
                                ? { ...x, state: 'Approved', chargePaisa, approvedBy: approver }
                                : x,
                            ),
                          )
                          /* The move and the unavailability are one fact the
                             engine returns together — the screen reports both or
                             neither. */
                          setJustApproved(effect.availableForBooking === false ? { unitName: f.unitName } : null)
                        } catch (err) {
                          console.error('Failed to approve damage', err)
                          alert('Failed to approve damage: ' + (err instanceof Error ? err.message : String(err)))
                        }
                      }}
                    >
                      Approve as {validation.approver}
                    </Button>
                    <Button
                      variant="danger"
                      icon="close"
                      disabled={!mayApprove}
                      onClick={() => {
                        if (approver === null) return
                        setFindings((prev) => prev.map((x) => (x.id === f.id ? { ...x, state: 'Rejected' } : x)))
                      }}
                    >
                      Reject
                    </Button>
                    {/* The two refusals are different facts and are stated as
                        different things. "Your role is Client" for a session
                        that does not exist would be a second fabrication on top
                        of the one this card just stopped making, so the
                        no-session case gets the screen's inline error
                        affordance — the same persistent `role="alert"` line the
                        charge error uses — and the role case keeps its lock. */}
                    {approver === null ? (
                      <span role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                        <Icon name="alert_triangle" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                        Nobody is signed in, so this finding cannot be approved or rejected. A damage charge is recorded
                        against the person who signed it off, and there is no honest stand-in for that name. Sign in and
                        reopen this tab.
                      </span>
                    ) : (
                      !mayApprove && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          <Icon name="lock" size={11} />
                          A charge of {formatMoney(chargePaisa)} needs {validation.approver} approval. Your role is {role}.
                        </span>
                      )
                    )}
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Settled">
        {findings.filter((f) => f.state === 'Approved' || f.state === 'Rejected').length === 0 ? (
          <EmptyState title="No settled findings" description="No damage findings have been approved or rejected yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {findings
              .filter((f) => f.state === 'Approved' || f.state === 'Rejected')
              .map((f) => {
              /* RS-04 — a rejected finding charges nothing. Settling against
                 the figure that was refused printed a refund and an
                 "uncovered" shortfall for money nobody is owed. */
              const rejected = f.state === 'Rejected'
              const s = settleDeposit(f.depositPaisa, rejected ? (0 as Paisa) : f.chargePaisa)
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap', fontSize: 'var(--t-meta)' }}>
                  <span className="identifier" style={{ fontSize: 'var(--t-th)', fontWeight: 700 }}>{f.id}</span>
                  <span style={{ flex: 1, minWidth: 160 }}>{f.unitName}</span>
                  <Chip tone={f.state === 'Approved' ? 'success' : 'neutral'}>{f.state}</Chip>
                  {rejected ? (
                    <span style={{ fontWeight: 600, color: 'var(--muted)' }}>No charge — rejected</span>
                  ) : (
                    <span className="figure" style={{ fontWeight: 600 }}>{formatMoney(f.chargePaisa)}</span>
                  )}
                  <span className="figure" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                    refund {formatMoney(s.refundPaisa)}
                    {s.shortfallPaisa > 0 && ` · ${formatMoney(s.shortfallPaisa)} uncovered`}
                  </span>
                  {f.approvedBy && <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>by {f.approvedBy}</span>}
                  {/* `approverFor` is re-read here rather than stored, so a
                      changed threshold reclassifies history consistently. */}
                  <Chip tone="neutral">{approverFor(f.chargePaisa)} level</Chip>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
