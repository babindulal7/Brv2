import { useState } from 'react'
import Icon from '../../components/ui/Icon'

export default function ScreenLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')

  const handleNumpad = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num
      setPin(newPin)
      if (newPin.length === 6) {
        // Mock unlock on any 6 digit pin
        setTimeout(() => onUnlock(), 200)
      }
    }
  }

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 320, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--st-neutral-bg)',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Icon name="tool" size={32} />
        </div>
        <h2 style={{ fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
          Session Locked
        </h2>
        <p style={{ margin: '0 0 32px', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
          Enter PIN to resume session
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '0 0 32px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: pin.length > i ? 'var(--input-focus)' : 'var(--input-bg)',
                border: `2px solid ${pin.length > i ? 'var(--input-focus)' : 'var(--border)'}`,
              }}
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleNumpad(n.toString())}
              style={{
                height: 64,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {n}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleNumpad('0')}
            style={{
              height: 64,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            style={{
              height: 64,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'var(--text2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="return_arrow" size={28} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            // Trigger actual logout
            window.location.href = '/login'
          }}
          style={{
            marginTop: 40,
            background: 'transparent',
            border: 'none',
            color: 'var(--danger)',
            fontSize: 'var(--t-meta)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Sign out as Ramesh
        </button>
      </div>
    </div>
  )
}
