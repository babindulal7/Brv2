import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Input, Select } from '../../components/ui'
import { Card, PageHeader, Button } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { CLIENTS_DATA } from '../../data/clients'
import { REFERRALS } from './Clients'
import { parseMoney, formatMoney, type Paisa } from '../../lib/money'

/**
 * Generate Referral Code — issues a new code for an existing client to share.
 * Reached from the Referral tab's "Generate Referral Code" action, which used
 * to be permanently disabled with "Code generation is not built yet."
 *
 * A code here has no referred account yet — that only exists once someone
 * redeems it, which is a separate, not-yet-built flow. So this screen collects
 * exactly what issuing a code requires: who it's for, the code itself, and
 * (money-gated, Law 5) the reward it carries.
 *
 * Matches `AddClient.tsx`'s established save pattern exactly: validate, a
 * simulated save delay, a success toast, then navigate back — this app has no
 * real data layer yet (Phase 1), and every other "create" screen discloses
 * that the same way rather than pretending to persist.
 */

const inputStyle = {
  width: '100%',
  height: 36,
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
      <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 4 }}>{hint}</span>}
    </label>
  )
}

export default function GenerateReferralCode() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()
  const money = useCanViewMoney()

  const clientOptions = useMemo(() => [...CLIENTS_DATA].sort((a, b) => a.name.localeCompare(b.name)), [])
  const existingCodes = useMemo(() => new Set(REFERRALS.map((r) => r.code.toUpperCase())), [])

  const [referrerId, setReferrerId] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [reward, setReward] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const referrer = clientOptions.find((c) => c.id === referrerId) ?? null

  const onReferrerChange = (id: string) => {
    setReferrerId(id)
    if (!codeTouched) {
      const c = clientOptions.find((x) => x.id === id)
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

  const canSubmit =
    Boolean(referrer) &&
    normalizedCode.length > 0 &&
    codeFormatValid &&
    !codeDuplicate &&
    (!money || (reward.trim().length > 0 && rewardPaisa !== null && rewardPaisa > 0))

  const handleCancel = () => navigate('/clients?tab=referral')

  const handleCreate = () => {
    if (!canSubmit) return
    setSaving(true)
    window.setTimeout(() => {
      setSaving(false)
      setSaved(true)
      showSuccessToast('Referral code generated', `${normalizedCode} · ${referrer?.name}`)
      window.setTimeout(() => navigate('/clients?tab=referral'), 900)
    }, 600)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Generate Referral Code"
        description="Issue a new referral code for an existing client to share"
        actions={
          <>
            <Button variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={!canSubmit || saving || saved}>
              {saved ? 'Code Generated' : saving ? 'Generating…' : 'Create Referral Code'}
            </Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,320px)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <Card title="Code details">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Referrer" hint="Only existing clients can issue a referral code.">
              <Select value={referrerId} onChange={(e) => onReferrerChange(e.target.value)} style={inputStyle} disabled={saving || saved}>
                <option value="">Select a client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
                  disabled={!referrer || saving || saved}
                  className="figure"
                  style={{ ...inputStyle, flex: 1, borderColor: codeError ? 'var(--danger)' : 'var(--input-border)' }}
                />
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={!referrer || saving || saved}
                  aria-label="Regenerate suggested code"
                  title="Regenerate suggested code"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text2)',
                    cursor: !referrer || saving || saved ? 'not-allowed' : 'pointer',
                    opacity: !referrer || saving || saved ? 0.5 : 1,
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
                  disabled={saving || saved}
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
              <div>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Reward Status</div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 3,
                    height: 19,
                    padding: '0 7px',
                    borderRadius: 5,
                    background: 'var(--st-progress-bg)',
                    color: 'var(--st-progress-fg)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 600,
                  }}
                >
                  <Icon name="timer" size={11} />
                  Awaiting first return
                </span>
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
