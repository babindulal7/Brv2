import { useState } from 'react'
import Icon from './Icon'
import { Button } from './Page'
import { usePwaInstall } from '../../lib/usePwaInstall'

export function PwaInstallControl() {
  const { isInstalled, hasPrompt, isIos, promptInstall } = usePwaInstall()
  const [showIosTip, setShowIosTip] = useState(false)
  const [installing, setInstalling] = useState(false)

  if (isInstalled) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 'var(--r-sm)',
          background: 'rgba(22, 163, 74, 0.1)',
          color: 'var(--success-text, #15803d)',
        }}
      >
        <Icon name="check" size={16} />
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>Installed (Standalone)</span>
      </div>
    )
  }

  if (hasPrompt) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Button
          variant="primary"
          icon="download"
          disabled={installing}
          onClick={async () => {
            setInstalling(true)
            try {
              await promptInstall()
            } finally {
              setInstalling(false)
            }
          }}
        >
          {installing ? 'Prompting…' : 'Install App'}
        </Button>
      </div>
    )
  }

  if (isIos) {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        <button
          type="button"
          onClick={() => setShowIosTip(!showIosTip)}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--link)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            minHeight: 44,
          }}
        >
          <Icon name="info" size={16} />
          <span>iOS: Add to Home Screen instructions</span>
        </button>
        {showIosTip && (
          <div
            style={{
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              background: 'var(--card2)',
              padding: '8px 12px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
            }}
          >
            Tap the Safari Share button <span style={{ fontWeight: 600 }}>⎋</span> and select{' '}
            <span style={{ fontWeight: 600 }}>&quot;Add to Home Screen&quot;</span>.
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
      <Icon name="info" size={16} />
      <span style={{ fontSize: 'var(--t-meta)' }}>Available in supported browsers</span>
    </div>
  )
}
