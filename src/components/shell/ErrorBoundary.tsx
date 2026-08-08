import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ErrorBanner } from '../ui/StateViews'

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
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '16px 20px 24px' }}>
          <ErrorBanner
            title="This screen hit a problem"
            message={`${this.state.error.message || 'An unexpected error stopped this page from rendering.'} Reloading usually clears it — if it keeps happening, the detail above is what to report.`}
            onRetry={() => window.location.reload()}
          />
        </div>
      )
    }
    return this.props.children
  }
}
