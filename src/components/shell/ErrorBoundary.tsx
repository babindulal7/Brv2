import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ErrorBanner } from '../ui/StateViews'
import { captureError } from '../../lib/monitoring'

/**
 * §1 (carried into `System States & Patterns v2.0` unchanged): "A blank page
 * is never acceptable." Before this file, nothing in the app caught a
 * render-time error — `main.tsx` only guards the §2.8 reference-case check
 * that runs *before* mount, which is a different failure mode. Any component
 * throwing during render anywhere in the tree unmounted the whole app to a
 * blank white screen, with no message, no retry, nothing — the exact
 * violation this rule exists to prevent, and the class of bug an offline
 * phone with a half-loaded cache is the single most likely place to trigger.
 *
 * A class component because error boundaries have no hook equivalent — this
 * is the one place in the app that's a legitimate exception to "prefer
 * functions."
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onReset?: () => void },
  { error: Error | null; retryCount: number }
> {
  state: { error: Error | null; retryCount: number } = { error: null, retryCount: 0 }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)

    /*
     * The console is where a production crash used to end. Nobody is standing
     * in the warehouse's devtools, so the banner below was the *only* trace a
     * screen had died — and a screen that dies quietly stays dead.
     *
     * `captureError` no-ops unless `VITE_SENTRY_DSN` was set at build time, so
     * this line costs nothing on a dev machine or an unconfigured deploy. See
     * `lib/monitoring.ts` for what it does and does not transmit — the
     * component stack is component *names*, never props or rendered values, so
     * no client detail and no rupee figure leaves with it.
     */
    captureError(error, {
      boundary: 'app-root',
      componentStack: typeof info.componentStack === 'string' ? info.componentStack : null,
    })
  }

  handleRetry = () => {
    if (this.props.onReset) {
      this.props.onReset()
    }
    // If retry was pressed multiple times without recovery, do a hard reload
    if (this.state.retryCount >= 2) {
      window.location.reload()
      return
    }
    this.setState((prev) => ({ error: null, retryCount: prev.retryCount + 1 }))
  }

  handleHardReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ErrorBanner
            title="This screen hit a problem"
            message={
              <div>
                <span>{this.state.error.message || 'An unexpected error stopped this page from rendering.'}</span>
                <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--t-caption)', opacity: 0.85 }}>
                  Clicking "Retry" will attempt to recover the screen inline without losing offline state.
                </span>
              </div>
            }
            onRetry={this.handleRetry}
          />
          {this.state.retryCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={this.handleHardReload}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  fontSize: 'var(--t-caption)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px 8px',
                }}
              >
                Force full page reload
              </button>
            </div>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
