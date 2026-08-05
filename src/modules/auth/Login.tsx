import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Input } from '../../components/ui'
import Icon from '../../components/ui/Icon'

export default function Login() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState<'pin' | 'otp'>('pin')
  const navigate = useNavigate()

  const handleNumpad = (num: string) => {
    if (mode === 'pin') {
      if (pin.length < 6) setPin((p) => p + num)
    } else {
      if (phone.length < 10) setPhone((p) => p + num)
    }
  }

  const handleDelete = () => {
    if (mode === 'pin') {
      setPin((p) => p.slice(0, -1))
    } else {
      setPhone((p) => p.slice(0, -1))
    }
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    // Mock login success
    navigate('/today')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--app)',
        padding: 20,
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--text)' }}>
            Welcome to Babin Rentals
          </h1>
          <p style={{ margin: 0, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
            {mode === 'pin' ? 'Enter your 6-digit PIN to access the floor.' : 'Enter your registered phone number.'}
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {mode === 'otp' && (
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                Phone Number
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                autoFocus
                maxLength={10}
                style={{ fontSize: 18, letterSpacing: '0.05em' }}
              />
            </div>
          )}

          {mode === 'pin' && (
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                6-Digit PIN
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '16px 0' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 44,
                      height: 52,
                      borderRadius: 'var(--r-btn)',
                      border: `1.5px solid ${pin.length === i ? 'var(--input-focus)' : pin.length > i ? 'var(--text)' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 600,
                      color: 'var(--text)',
                      background: pin.length === i ? 'var(--hover-row)' : 'var(--input-bg)',
                    }}
                  >
                    {pin[i] ? '•' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Touch Numpad for Warehouse Tablet Flow */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '8px 0' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleNumpad(n.toString())}
                style={{
                  height: 56,
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  fontSize: 20,
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
                height: 56,
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                fontSize: 20,
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
                height: 56,
                borderRadius: 'var(--r-btn)',
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="return_arrow" size={24} />
            </button>
          </div>

          <Button type="submit" variant="primary" style={{ height: 44, fontSize: 16 }}>
            {mode === 'pin' ? 'Unlock' : 'Send OTP'}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === 'pin' ? 'otp' : 'pin')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--link)',
              fontSize: 'var(--t-meta)',
              fontWeight: 500,
              cursor: 'pointer',
              marginTop: -8,
            }}
          >
            {mode === 'pin' ? 'Forgot PIN? Send OTP' : 'Back to PIN login'}
          </button>
        </form>
      </Card>
    </div>
  )
}
