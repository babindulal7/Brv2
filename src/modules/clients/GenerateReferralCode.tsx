import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Input, Select, InfoTooltip } from '../../components/ui'
import { Card, Button } from '../../components/ui/Page'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { PageActions } from '../../components/ui/PageActions'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useList } from '../../lib/queries/useList'
import { listReferrerOptions } from '../../lib/queries/clients'
import { REFERRALS } from './Clients'
import { parseMoney, formatMoney, type Paisa } from '../../lib/money'

/**
 * Generate Referral Code — composes a new code for an existing client, and
 * **cannot yet issue it**. Reached from the Referral tab's "Generate Referral
 * Code" action.
 *
 * A code here has no referred account yet — that only exists once someone
 * redeems it, which is a separate, not-yet-built flow. So this screen collects
 * exactly what issuing a code requires: who it's for, the code itself, and
 * (money-gated, Law 5) the reward it carries.
 *
 * The referrer list is the DATABASE's — `client_directory_v` through
 * `lib/queries/clients.listReferrerOptions` (Law 2), name-sorted server-side.
 * The `CLIENTS_DATA` seed this dropdown used to render is gone from it: a
 * client created through /clients/new appears here, and every name offered
 * exists in the directory (docs/pages/44 §7.6). A blocked client is still
 * listed — nothing has ruled that a blocked client may not refer — but is
 * labelled "Blocked" instead of being indistinguishable (§7.5). The
 * uniqueness check, by contrast, still runs against the four seeded
 * `REFERRALS` codes, because no referral table exists anywhere to ask.
 *
 * ⛔ **What was removed and why** (`SUCCESS_FABRICATION_REGISTER_2026-08-12.md`,
 * section D). `handleCreate` called **no action**: `window.setTimeout(…, 600)`
 * → `setSaved(true)` → `showSuccessToast('Referral code generated', …)` quoting
 * the generated code and the referrer's name → `navigate('/clients?tab=referral')`.
 *
 * That is a code invented on this screen, confirmed as issued, and then read
 * out to a client over the phone. Nothing was stored anywhere. When the
 * referred client quotes "CREATIVE25" at booking there is no such code, the
 * referral cannot be attributed, and the referrer's commission is unclaimable —
 * with no error anywhere for anyone to find.
 *
 * There is no referral action to wire this to: nothing under `src/actions/`
 * creates, stores or issues a referral code (`src/actions/clients/` holds
 * create/update/block/merge only). Inventing one is a build, not a fix. So the
 * screen composes and validates a *candidate* code, states that issuing is not
 * connected, and refuses — a visible, disabled affordance carrying its reason
 * (`components/ui/Unavailable.tsx`) plus a persistent line above the form,
 * because a `title`-only reason never appears on a touch device. No toast, and
 * deliberately **no `navigate(...)`**: returning to the referral tab is this
 * app's "it saved" signal, and nothing saved.
 */

/** Short form — `Unavailable`'s popover is capped at 220px, so the full explanation lives in the form's notice line. */
const ISSUE_UNAVAILABLE_REASON =
  'Issuing is not connected in this build — no referral action exists, so this code cannot be stored.'

const inputStyle = {
  width: '100%',
  /* No height here on purpose. This object is only ever spread into `Input`
     and `Select`, both of which set `minHeight: 44` (Law 15) BEFORE spreading
     `...style` — the `height: 36` this used to carry was inert on every
     control it was passed to, and stating 36 next to controls that render at
     44 only misleads the next reader. */
  padding: '0 10px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
} as const

const CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/

function suggestCode(clientName: string): string {
  const firstWord = clientName.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/)[0] ?? ''
  const base = (firstWord || 'CODE').toUpperCase().slice(0, 10)
  const suffix = Math.floor(100 + Math.random() * 900)
  return `${base}-${suffix}`
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
        {label}
        {hint && <InfoTooltip content={hint} />}
      </span>
      {children}
    </label>
  )
}

export interface GenerateReferralCodeProps {
  embedded?: boolean
  onDone?: () => void
}

export default function GenerateReferralCode({ embedded = false, onDone }: GenerateReferralCodeProps = {}) {
  const navigate = useNavigate()
  const money = useCanViewMoney()

  /** Active clients from the directory, name-ordered by the server — see the header. */
  const fetchReferrers = useCallback(async () => ({ rows: await listReferrerOptions() }), [])
  const referrers = useList(fetchReferrers)
  const clientOptions = referrers.rows

  const existingCodes = useMemo(() => new Set(REFERRALS.map((r) => r.code.toUpperCase())), [])

  /** `client_code` — the id every `/clients/:id` link is built from. */
  const [referrerId, setReferrerId] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [reward, setReward] = useState('')

  const referrer = clientOptions.find((c) => c.clientCode === referrerId) ?? null

  const onReferrerChange = (id: string) => {
    setReferrerId(id)
    if (!codeTouched) {
      const c = clientOptions.find((x) => x.clientCode === id)
      if (c) setCode(suggestCode(c.name))
    }
  }

  const regenerate = () => {
    if (!referrer) return
    setCode(suggestCode(referrer.name))
    setCodeTouched(false)
  }

  const normalizedCode = code.trim().toUpperCase()
  const codeFormatValid = normalizedCode.length >= 3 && CODE_PATTERN.test(normalizedCode)
  const codeDuplicate = codeFormatValid && existingCodes.has(normalizedCode)
  const codeError = normalizedCode.length === 0 ? null : !codeFormatValid ? 'Uppercase letters, numbers and single hyphens only, e.g. HIMALAYAN-482' : codeDuplicate ? 'This code is already in use' : null

  const rewardPaisa = money ? parseMoney(reward) : null
  const rewardError = money && reward.trim().length > 0 && (rewardPaisa === null || rewardPaisa <= 0) ? 'Enter a reward amount greater than 0' : null

  /**
   * Kept, and still the gate — it is what has to come back the moment a real
   * issue-referral action exists. Today it only chooses *which* reason the
   * refused button gives, because the build gap is not the operator's fault and
   * an incomplete form is not the whole story either.
   */
  const canSubmit =
    Boolean(referrer) &&
    normalizedCode.length > 0 &&
    codeFormatValid &&
    !codeDuplicate &&
    (!money || (reward.trim().length > 0 && rewardPaisa !== null && rewardPaisa > 0))

  const buttonReason = canSubmit
    ? ISSUE_UNAVAILABLE_REASON
    : `This code is not complete yet — a referrer and a valid code${money ? ' and a reward amount' : ''} are required. ` +
      'Issuing is not connected in this build either.'

  const handleCancel = () => (onDone ? onDone() : navigate('/clients?tab=referral'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <ScreenHeader
        embedded={embedded}
        title="Generate Referral Code"
        description="Compose a referral code for an existing client. Issuing it is not connected yet — nothing here is stored."
        actions={
          <PageActions
            secondary={
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            }
            primary={
              <Unavailable reason={buttonReason}>
                <Button variant="primary" disabled>
                  Create Referral Code
                </Button>
              </Unavailable>
            }
          />
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,320px)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <Card title="Code details">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Law 12 — persistent and inline, in the same danger-text idiom the
                per-field errors below already use. It is first in the card
                because an operator about to phone a client must read it before
                they compose a code, not after. */}
            {/* No `role="alert"` — this line is always present, and a live region
                that fires on mount is noise, not information. The dynamic
                failure lines elsewhere in this module are the ones that need it. */}
            <p
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
              <span>
                Issuing is not connected — nothing under <code>src/actions/</code> creates or stores a referral code, so
                this screen cannot issue one. <strong>Do not read a code from here out to a client.</strong> It would
                exist nowhere: when the referred client quotes it at booking there would be no code to match, and the
                referrer&rsquo;s commission would be unclaimable.
              </span>
            </p>
            {/* The referrer list failing to load is stated inline (Law 12), and
                the form stays refused — a code composed for a referrer this
                session could not verify exists is exactly the fabrication this
                screen was rewritten to prevent. */}
            {referrers.error && (
              <ErrorBanner title="Could not load clients" message={referrers.error} onRetry={referrers.refetch} />
            )}
            <Field label="Referrer" hint="Only existing clients can issue a referral code — this list is the client directory.">
              <Select
                value={referrerId}
                onChange={(e) => onReferrerChange(e.target.value)}
                disabled={referrers.loading || !!referrers.error}
                style={inputStyle}
              >
                <option value="">
                  {referrers.loading
                    ? 'Loading clients…'
                    : referrers.error
                      ? 'Clients could not be loaded'
                      : clientOptions.length === 0
                        ? 'No clients in the directory yet'
                        : 'Select a client…'}
                </option>
                {clientOptions.map((c) => (
                  <option key={c.clientCode} value={c.clientCode}>
                    {c.name}
                    {c.isBlocked ? ' · Blocked' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Referral Code">
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <Input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase())
                    setCodeTouched(true)
                  }}
                  placeholder={referrer ? 'e.g. ' + suggestCode(referrer.name) : 'Select a referrer first'}
                  disabled={!referrer}
                  className="figure"
                  style={{ ...inputStyle, flex: 1, borderColor: codeError ? 'var(--danger)' : 'var(--input-border)' }}
                />
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={!referrer}
                  aria-label="Regenerate suggested code"
                  title="Regenerate suggested code"
                  style={{
                    /* Law 15 — 44×44 on every device, desktop included; the
                       shared Button names the same floor. The Input beside it
                       already renders at 44 (its own minHeight), so this also
                       levels the row instead of leaving a 36px button hanging
                       under a 44px field. */
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text2)',
                    cursor: !referrer ? 'not-allowed' : 'pointer',
                    opacity: !referrer ? 0.5 : 1,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="refresh" size={16} />
                </button>
              </div>
              {codeError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                  <Icon name="error" size={13} />
                  {codeError}
                </div>
              )}
            </Field>

            {money && (
              <Field label="Credit Reward" hint="Paid once the referral converts and completes its first return.">
                <Input
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  placeholder="e.g. 5000"
                  inputMode="decimal"
                  style={{ ...inputStyle, borderColor: rewardError ? 'var(--danger)' : 'var(--input-border)' }}
                />
                {rewardError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                    <Icon name="error" size={13} />
                    {rewardError}
                  </div>
                )}
              </Field>
            )}
          </div>
        </Card>

        <Card title="Preview">
          {referrer && normalizedCode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Referrer</div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{referrer.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Code</div>
                <span
                  className="figure"
                  style={{
                    display: 'inline-block',
                    marginTop: 3,
                    padding: '2px 6px',
                    borderRadius: 5,
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                    fontSize: 'var(--t-meta)',
                    color: codeFormatValid && !codeDuplicate ? 'var(--text)' : 'var(--danger-text)',
                  }}
                >
                  {normalizedCode}
                </span>
              </div>
              {money && (
                <div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Reward</div>
                  <div className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: rewardPaisa && rewardPaisa > 0 ? 'var(--success-text)' : 'var(--muted)' }}>
                    {rewardPaisa && rewardPaisa > 0 ? formatMoney(rewardPaisa as Paisa) : '—'}
                  </div>
                </div>
              )}
              {/* Was `[timer] Awaiting first return` — a lifecycle state for a
                  code that has never been issued, on a screen that cannot issue
                  one. "Awaiting" implies it is out there working. It is not. */}
              <div>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Status</div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 3,
                    height: 19,
                    padding: '0 7px',
                    borderRadius: 5,
                    background: 'var(--st-neutral-bg)',
                    color: 'var(--st-neutral-fg)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 600,
                  }}
                >
                  <Icon name="error" size={11} />
                  Not issued
                </span>
                <div style={{ marginTop: 4, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.4 }}>
                  This code exists only on this screen. Once issuing is connected it would sit at &ldquo;awaiting first
                  return&rdquo; until the referral converts.
                </div>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Select a referrer to preview the code.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
