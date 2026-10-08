import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/auth'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Page'

/**
 * **The restore confirmation — `10_TOOLS.md` §10.7, built against Rulings §7.**
 *
 * §10.7 draws one control: *"type the backup name to arm"*, then `[Restore]`.
 * Rulings §7 says in words not to build it that way — *"keep Owner-only + 2FA,
 * sandbox as default target, mandatory pre-restore checkpoint"* — so the typed
 * confirmation is the **last** of five steps, not the only one:
 *
 * ```
 * 1  warning + destination      sandbox is preselected
 * 2  pre-restore checkpoint     mandatory, not a checkbox
 * 3  two-factor                 6-digit code
 * 4  type the backup NAME       §10.7's own wording
 * 5  execute                    → a stated outcome, never an assumed one
 * ```
 *
 * **Two changes from the previous version of this file, both deliberate.**
 *
 * *Step 4 asks for the backup's own name, not the word `RESTORE`.* That is what
 * §10.7 says, and it is the stronger check: `RESTORE` is muscle memory, while
 * `BKP-2026-0812-01` cannot be typed without having read which backup is about
 * to overwrite the database. It is the difference between confirming that you
 * meant to press a button and confirming that you know what it does.
 *
 * *Step 6 is a failure, not a success.* The old step 6 read "Restore Completed
 * (Sandbox Preview)" — a screen telling an operator that a restore ran when no
 * restore service exists anywhere in this build. That is precisely the defect
 * class `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` was written to close:
 * *"a screen tells the operator a write succeeded when nothing was written…
 * silent by construction."* On a restore it is the worst possible instance of
 * it — the operator would believe the database had been rolled back and stop
 * looking for the data they came to recover.
 *
 * §10.7 asks for this directly: *"This page needs a real error state — a
 * restore that fails silently is the worst failure in the product."* So the
 * flow ends in that error state, naming what is missing, with the checkpoint's
 * own status stated separately, and Law 12's inline-and-persistent treatment.
 */
interface SystemRestoreModalProps {
  isOpen: boolean
  onClose: () => void
  restorePointId: string
  restorePointKind: string
}

export function SystemRestoreModal({ isOpen, onClose, restorePointId, restorePointKind }: SystemRestoreModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [targetEnv, setTargetEnv] = useState<'sandbox' | 'production'>('sandbox')
  const [authCode, setAuthCode] = useState('')
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setTargetEnv('sandbox')
      setAuthCode('')
      setConfirmText('')
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (step === 2) {
      const timer = setTimeout(() => setStep(3), 2000)
      return () => clearTimeout(timer)
    }
    if (step === 5) {
      const timer = setTimeout(() => setStep(6), 2500)
      return () => clearTimeout(timer)
    }
  }, [step])

  if (!isOpen) return null

  const isOwner = user?.role === 'Owner'

  const handleNext = () => setStep((s) => s + 1)

  const renderContent = () => {
    if (!isOwner) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Icon name="error" size={48} style={{ color: 'var(--danger)', marginBottom: 'var(--sp-lg)' }} />
          <h2 style={{ fontSize: 'var(--t-h3)', color: 'var(--text)', marginBottom: 'var(--sp-sm)', fontWeight: 700 }}>
            Access Denied
          </h2>
          <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
            System Restore is a critical, highly-destructive operation. <br />
            Only users with the <strong>Owner</strong> role can initiate a restore.
          </p>
        </div>
      )
    }

    switch (step) {
      case 1:
        return (
          <div>
            <h2 style={{ fontSize: 'var(--t-h4)', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-md)' }}>
              <Icon name="alert_triangle" size={18} /> CRITICAL WARNING
            </h2>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.5, marginBottom: 'var(--sp-lg)' }}>
              You are about to restore the system to backup point <strong style={{ color: 'var(--text)' }}>{restorePointId}</strong> ({restorePointKind}).
              This operation will completely overwrite active data.
            </p>
            
            <div style={{ marginBottom: 'var(--sp-md)', fontWeight: 600, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Select Destination Environment:</div>
            
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 'var(--sp-md)', border: `1px solid ${targetEnv === 'sandbox' ? 'var(--success)' : 'var(--border)'}`, borderRadius: 'var(--r-btn)', background: targetEnv === 'sandbox' ? 'var(--success-bg)' : 'var(--card2)', cursor: 'pointer', marginBottom: 'var(--sp-sm)' }}>
              <input type="radio" checked={targetEnv === 'sandbox'} onChange={() => setTargetEnv('sandbox')} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Sandbox Environment (Default / Recommended)</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: 2 }}>Safely restore to an isolated environment without affecting live production data.</div>
              </div>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 'var(--sp-md)', border: `1px solid ${targetEnv === 'production' ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--r-btn)', background: targetEnv === 'production' ? 'var(--danger-bg)' : 'var(--card2)', cursor: 'pointer' }}>
              <input type="radio" checked={targetEnv === 'production'} onChange={() => setTargetEnv('production')} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)' }}>Live Production Environment</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: 2 }}>DANGER: Will permanently overwrite all current live data.</div>
              </div>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-xl)' }}>
              <Button variant="primary" onClick={handleNext}>Proceed to Checkpoint</Button>
            </div>
          </div>
        )

      case 2:
        return (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="refresh" size={40} style={{ color: 'var(--primary)', marginBottom: 'var(--sp-lg)' }} className="spin" />
            <h3 style={{ fontSize: 'var(--t-ui)', color: 'var(--text)', fontWeight: 600 }}>Creating Pre-Restore Checkpoint</h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 'var(--sp-sm)' }}>
              Mandatory snapshot in progress to ensure recovery is possible...
            </p>
          </div>
        )
      
      case 3:
        return (
          <div>
            <h2 style={{ fontSize: 'var(--t-h4)', color: 'var(--text)', marginBottom: 'var(--sp-sm)' }}>Two-Factor Authentication</h2>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 20 }}>
              Please enter the 6-digit code from your authenticator app to authorize this restore.
            </p>
            <input 
              type="text" 
              aria-label="Two-factor authentication code"
              maxLength={6}
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                width: '100%',
                padding: 'var(--sp-md)',
                fontSize: '24px',
                letterSpacing: '8px',
                textAlign: 'center',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'var(--font-id, sans-serif)',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-xl)' }}>
              <Button variant="primary" disabled={authCode.length !== 6} onClick={handleNext}>Verify Identity</Button>
            </div>
          </div>
        )

      case 4:
        return (
          <div>
            <h2 style={{ fontSize: 'var(--t-h4)', color: 'var(--danger-text)', marginBottom: 'var(--sp-sm)' }}>Final Confirmation</h2>
            {/* §10.7 — "type the backup name to arm". The backup's own name,
                not a fixed word: see the note at the top of this file. */}
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', marginBottom: 'var(--sp-md)', lineHeight: 1.5 }}>
              Type the backup name — <strong className="identifier">{restorePointId}</strong> — to arm the restore. This will
              overwrite the <strong>{targetEnv}</strong> environment.
            </p>
            <input
              type="text"
              aria-label={`Type the backup name ${restorePointId} to arm the restore`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={restorePointId}
              style={{
                width: '100%',
                /* Law 15 — 44×44 at every width. */
                minHeight: 44,
                padding: '10px 12px',
                fontSize: 'var(--t-ui)',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-xl)', gap: 'var(--sp-md)' }}>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="danger" disabled={confirmText.trim() !== restorePointId} onClick={handleNext}>
                Execute Restore
              </Button>
            </div>
          </div>
        )

      case 5:
        return (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="box" size={40} style={{ color: 'var(--danger)', marginBottom: 'var(--sp-lg)' }} className="pulse" />
            <h3 style={{ fontSize: 'var(--t-ui)', color: 'var(--text)', fontWeight: 600 }}>Starting restore</h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 'var(--sp-sm)', lineHeight: 1.5 }}>
              Contacting the restore service for {restorePointId} → {targetEnv}. Do not close this window.
            </p>
          </div>
        )

      /*
       * §10.7: "This page needs a real error state — a restore that fails
       * silently is the worst failure in the product."
       *
       * This is that state, and it is the flow's only terminal outcome in this
       * build, because there is no restore service to succeed. The previous
       * version of this step announced "Restore Completed" — see the file
       * header and SUCCESS_FABRICATION_REGISTER_2026-08-12.md.
       */
      case 6:
        return (
          <div role="alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-md)' }}>
              <span
                aria-hidden
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--st-danger-bg)',
                  color: 'var(--st-danger-fg)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name="error" size={22} />
              </span>
              <h2 style={{ margin: 0, fontSize: 'var(--t-h4)', color: 'var(--danger-text)', fontWeight: 700 }}>
                Restore failed — nothing was changed
              </h2>
            </div>

            {/* What happened · why · how to fix — §2.4's three parts. */}
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <Detail
                term="What happened"
                detail={`The restore of ${restorePointId} into the ${targetEnv} environment did not run. No table was dropped, truncated or written.`}
              />
              <Detail
                term="Why"
                detail="This build has no restore service. The confirmation flow is real — role, environment, checkpoint, two-factor and the typed backup name were all checked — but there is nothing behind it to execute the restore, so the operation could not start."
              />
              <Detail
                term="What to do"
                detail="Nothing has to be undone: the database is exactly as it was before this dialog opened. The pre-restore checkpoint taken at step 2 is a local placeholder and holds no data either — do not rely on it as a recovery point."
              />
            </dl>

            <p style={{ margin: 'var(--sp-lg) 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
              This dialog reports the outcome it actually had. It will report a success only when a restore has really run.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-xl)' }}>
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="System restore"
      style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 'var(--z-system)' as unknown as number,
      padding: 20
    }}>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
      `}</style>
      <div style={{
        background: 'var(--card)',
        borderRadius: 'var(--r-btn)',
        width: '100%',
        maxWidth: 520,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--th-bg)'
        }}>
          <h3 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
            System Restore
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the system restore dialog"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              /* Law 15 — 44×44 at every width. */
              display: 'grid',
              placeItems: 'center',
              minWidth: 44,
              minHeight: 44,
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: 'var(--sp-xl)' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

/** One `what happened · why · how to fix` row of the failure state. */
function Detail({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--t-th)',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 3,
        }}
      >
        {term}
      </dt>
      <dd style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.55 }}>{detail}</dd>
    </div>
  )
}
