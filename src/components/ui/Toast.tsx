import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
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

/**
 * A single follow-on the toast may offer.
 *
 * It is an `href`, deliberately, and never a callback that opens a window.
 * WHATSAPP_LINKS_SPEC v1.0 §3 puts "Send receipt" on the payment success
 * toast, and a real anchor is the only version of that which cannot be eaten
 * by a popup blocker — `window.open` fired from a handler that has already
 * awaited a query has left its user gesture behind and is blocked in the
 * browsers the floor actually runs. The consequence shapes the caller: the URL
 * must be composed BEFORE the toast is raised, which is also what forces the
 * receipt's figures to be read rather than predicted.
 */
export interface ToastAction {
  label: string
  href: string
}

export interface ToastItem {
  id: string
  title: string
  message?: string
  action?: ToastAction
}

interface ToastContextValue {
  /**
   * Law 12 — successes only. The optional `action` is a follow-on to something
   * that already SUCCEEDED, never a retry for something that failed; a failure
   * still belongs inline, in its own surface.
   */
  showSuccessToast: (title: string, message?: string, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const NOOP_TOAST: ToastContextValue = {
  showSuccessToast: () => {},
}

export function useOptionalToast() {
  return useContext(ToastContext)
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  return ctx ?? NOOP_TOAST
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
        {toast.action && (
          <a
            href={toast.action.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onDismiss(toast.id)}
            style={{
              /* Law 15 — 44px of height even here. A toast that self-dismisses
                 in four seconds is the worst place in the app to ask for an
                 accurate click, so the target is full-width and the row is
                 tall; the dwell extension below buys the time to reach it. */
              display: 'flex',
              alignItems: 'center',
              minHeight: 44,
              marginTop: 6,
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              color: 'var(--primary-text)',
              textDecoration: 'none',
            }}
          >
            {toast.action.label}
          </a>
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
  const timerIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const timers = timerIdsRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const showSuccessToast = useCallback((title: string, message?: string, action?: ToastAction) => {
    const id = Math.random().toString(36).slice(2, 9)
    const item: ToastItem = { id, title, ...(message ? { message } : {}), ...(action ? { action } : {}) }
    setToasts((prev) => [...prev, item])
    /*
     * Four seconds is right for a toast that only tells you something worked.
     * It is NOT right for one carrying an action: four seconds is about the
     * time it takes to read the line, decide, and move the pointer — so an
     * actionable toast would vanish under the cursor roughly as often as it
     * was caught. Twelve is the dwell the action earns; a toast without one is
     * unchanged, so nothing else in the product slows down.
     */
    const timer = setTimeout(
      () => {
        timerIdsRef.current.delete(timer)
        if (typeof window !== 'undefined') {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
      },
      action ? 12000 : 4000,
    )
    timerIdsRef.current.add(timer)
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
