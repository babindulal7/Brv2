import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * §12 (Law 12): "Toasts carry successes only." Errors are rendered inline in
 * their own surface — see `ErrorBanner` in `StateViews.tsx`, never here.
 *
 * Rewritten from Tailwind utility classNames — `fixed bottom-5 right-5...` —
 * to the app's real inline-style + CSS-variable system. Tailwind's Vite
 * plugin is registered but no CSS file imports `tailwindcss`, so every one of
 * those classes compiled to nothing: `ToastProvider` is mounted once, globally,
 * in `App.tsx`, and is the app's only success-feedback channel, so this bug
 * meant every success toast anywhere in the product rendered as an unstyled,
 * unpositioned `<div>` sitting in normal document flow — not a floating
 * bottom-right card, effectively invisible. Same prop/API shape as before, so
 * every existing `useToast().showSuccessToast(...)` call site is unaffected.
 */

export interface ToastItem {
  id: string
  title: string
  message?: string
}

interface ToastContextValue {
  showSuccessToast: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

// Fades + slides each toast in on mount. A per-item component (rather than
// inline logic in the .map below) is what lets this use its own mount-flag
// state, since hooks can't be called from inside a map callback.
function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: 14,
        borderRadius: 'var(--r-card)',
        background: 'var(--dropdown)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border2)',
        boxShadow: 'var(--shadow-xl)',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.96)',
        transition: 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: 'var(--r-badge)',
          background: 'var(--st-in-bg)',
          color: 'var(--st-in-fg)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Icon name="check" size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {toast.title}
        </h4>
        {toast.message && (
          <p style={{ margin: '3px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>
            {toast.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer',
          padding: 3,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showSuccessToast = useCallback((title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2, 9)
    const item: ToastItem = message ? { id, title, message } : { id, title }
    setToasts((prev) => [...prev, item])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ showSuccessToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          /* --z-system (10500), not the old literal 70. At 70 a toast painted
             BEHIND Calendar full view (200), the rentals dropdowns (1000),
             BranchesWarehouses (9000) — so the confirmation for an action
             taken on those surfaces was invisible. Toasts are system feedback;
             they sit above everything except nothing. */
          zIndex: 'var(--z-system)' as unknown as number,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 360,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
