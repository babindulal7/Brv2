import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/auth'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Page'

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

  if (!isOpen) return null

  const isOwner = user?.role === 'Owner'

  const handleNext = () => setStep((s) => s + 1)

  const renderContent = () => {
    if (!isOwner) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Icon name="error" size={48} style={{ color: 'var(--danger)', marginBottom: 16 }} />
          <h2 style={{ fontSize: 'var(--t-h3)', color: 'var(--text)', marginBottom: 8, fontWeight: 700 }}>
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
            <h2 style={{ fontSize: 'var(--t-h4)', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="alert_triangle" size={18} /> CRITICAL WARNING
            </h2>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.5, marginBottom: 16 }}>
              You are about to restore the system to backup point <strong style={{ color: 'var(--text)' }}>{restorePointId}</strong> ({restorePointKind}).
              This operation will completely overwrite active data.
            </p>
            
            <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Select Destination Environment:</div>
            
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, border: `1px solid ${targetEnv === 'sandbox' ? 'var(--success)' : 'var(--border)'}`, borderRadius: 'var(--r-btn)', background: targetEnv === 'sandbox' ? 'var(--success-bg)' : 'var(--card2)', cursor: 'pointer', marginBottom: 8 }}>
              <input type="radio" checked={targetEnv === 'sandbox'} onChange={() => setTargetEnv('sandbox')} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Sandbox Environment (Default / Recommended)</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: 2 }}>Safely restore to an isolated environment without affecting live production data.</div>
              </div>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, border: `1px solid ${targetEnv === 'production' ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--r-btn)', background: targetEnv === 'production' ? 'var(--danger-bg)' : 'var(--card2)', cursor: 'pointer' }}>
              <input type="radio" checked={targetEnv === 'production'} onChange={() => setTargetEnv('production')} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)' }}>Live Production Environment</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: 2 }}>DANGER: Will permanently overwrite all current live data.</div>
              </div>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <Button variant="primary" onClick={handleNext}>Proceed to Checkpoint</Button>
            </div>
          </div>
        )

      case 2:
        setTimeout(() => setStep(3), 2000) // Simulate checkpoint loading
        return (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="refresh" size={40} style={{ color: 'var(--primary)', marginBottom: 16 }} className="spin" />
            <h3 style={{ fontSize: 'var(--t-ui)', color: 'var(--text)', fontWeight: 600 }}>Creating Pre-Restore Checkpoint</h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 8 }}>
              Mandatory snapshot in progress to ensure recovery is possible...
            </p>
          </div>
        )
      
      case 3:
        return (
          <div>
            <h2 style={{ fontSize: 'var(--t-h4)', color: 'var(--text)', marginBottom: 8 }}>Two-Factor Authentication</h2>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 20 }}>
              Please enter the 6-digit code from your authenticator app to authorize this restore.
            </p>
            <input 
              type="text" 
              maxLength={6}
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '24px',
                letterSpacing: '8px',
                textAlign: 'center',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'monospace'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <Button variant="primary" disabled={authCode.length !== 6} onClick={handleNext}>Verify Identity</Button>
            </div>
          </div>
        )

      case 4:
        return (
          <div>
            <h2 style={{ fontSize: 'var(--t-h4)', color: 'var(--danger-text)', marginBottom: 8 }}>Final Confirmation</h2>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', marginBottom: 12 }}>
              Type <strong>RESTORE</strong> below to permanently overwrite the {targetEnv} environment with backup {restorePointId}.
            </p>
            <input 
              type="text" 
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESTORE"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 'var(--t-ui)',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, gap: 12 }}>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="danger" disabled={confirmText !== 'RESTORE'} onClick={handleNext}>
                Execute Restore
              </Button>
            </div>
          </div>
        )

      case 5:
        setTimeout(() => setStep(6), 2500) // Simulate restore process
        return (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="box" size={40} style={{ color: 'var(--danger)', marginBottom: 16 }} className="pulse" />
            <h3 style={{ fontSize: 'var(--t-ui)', color: 'var(--text)', fontWeight: 600 }}>Restoring System</h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 8 }}>
              Applying backup {restorePointId} to {targetEnv}... Please do not close this window.
            </p>
          </div>
        )

      case 6:
        return (
          <div style={{ textAlign: 'center', padding: '30px 20px' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="checklist" size={32} style={{ color: 'var(--success)' }} />
            </div>
            <h2 style={{ fontSize: 'var(--t-h3)', color: 'var(--text)', marginBottom: 8, fontWeight: 700 }}>
              Restore Successful
            </h2>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
              Backup {restorePointId} has been successfully restored to the <strong>{targetEnv}</strong> environment.
            </p>
            <div style={{ marginTop: 24 }}>
              <Button variant="primary" onClick={onClose}>Close & Reload</Button>
            </div>
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
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
        borderRadius: 12,
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
            onClick={onClose} 
            style={{ 
              background: 'transparent', 
              border: 'none', 
              cursor: 'pointer', 
              color: 'var(--muted)',
              display: 'flex',
              padding: 4
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: 24 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
