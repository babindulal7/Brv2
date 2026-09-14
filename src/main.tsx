import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './lib/theme'
import { AuthProvider } from './lib/auth'

/**
 * Fonts are SELF-HOSTED, not loaded from a CDN.
 *
 * Platform Build Instructions §4.1 precaches the app shell — "HTML, JS, CSS,
 * fonts, icons" — cache-first, because the warehouse has no signal. A tablet in
 * airplane mode cannot reach a font CDN, so a CDN <link> would silently fall
 * back to a system face exactly where the app is meant to keep working.
 *
 * **Foundation v2.2 §4.3** — three families in English, each with one job:
 *
 *  · **Outfit** 600/700 — headings and figures. §4.3.2 forbids it below 16px
 *    and in body copy: geometric letterforms tire the eye over a paragraph.
 *  · **Source Sans 3** 400/600 — body, tables, controls. Note the *3*: Pro is
 *    the frozen legacy release (§4.3.3).
 *  · **JetBrains Mono** — identifiers only. §4.3.4: a packer matching
 *    `SN-FX3-102` off a label needs `1`/`l`/`I` and `0`/`O` separated, and
 *    fixed width makes a mistyped serial visible as a length difference.
 *
 * §4.3.7 — only these load eagerly. **Asar and Hind are deliberately absent**:
 * each Hind weight carries 1,146 glyphs, mostly Devanagari conjuncts, and
 * English-only users must never download them. They load on the NE toggle.
 */
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
// 800 is not decorative: DESIGN_DIRECTION_SPEC_v4.1 §4 sets every status block
// at weight 800, and without the real face the browser synthesises it.
import '@fontsource/source-sans-3/800.css'
import '@fontsource-variable/jetbrains-mono'

/**
 * Theme Design System v1.0 token layer — surfaces, borders, text, status
 * bg/text pairs, radius, spacing, type scale, per-theme primary.
 * Replaces the capsule-era index.css.
 */
import './styles/theme.css'
import './styles/ui-v2.css'
/*
 * v4.1 §7.7 — the shared responsive layer. AFTER theme.css so its layout
 * rules can override token-level defaults, and imported here rather than from
 * a screen so no screen can forget it.
 */
import './styles/responsive.css'
import { REFERENCE_CASE_ERROR } from './lib/money'
import { startAuditLogging } from './events/auditLogger'
import { installGlobalErrorHandlers } from './lib/monitoring'

/*
 * Before either branch below renders. ErrorBoundary only sees render-time
 * throws; this catches the rejected promises and event-handler errors that
 * never touch React's render path. No-ops entirely without VITE_SENTRY_DSN,
 * attaching nothing to window.
 */
installGlobalErrorHandlers()

/*
 * Console mirror of the domain-event bus — a development aid, not the audit
 * trail. The real one is `lib/queries/audit.ts` → `audit_events`. Shipping this
 * to production printed every event, actor and target to any open devtools,
 * which is noise at best and a disclosure at worst (TODO_SWEEP_2026-09-02.md A4).
 */
if (import.meta.env.DEV) startAuditLogging()

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

/**
 * §6 — "A blank page is never acceptable. 'Something went wrong' is never
 * acceptable." If the Financial Engine cannot reproduce §2.8's reference case
 * the product must not run, but it must **say so**, naming the step that broke.
 * This is the one screen that renders before the app, so it uses no tokens
 * beyond the two the token layer guarantees.
 */
if (REFERENCE_CASE_ERROR) {
  createRoot(root).render(
    <StrictMode>
      <main
        role="alert"
        style={{
          maxWidth: 620,
          margin: '18vh auto',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          color: 'var(--text)',
        }}
      >
        <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>The money engine is wrong. The app will not start.</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 14px' }}>{REFERENCE_CASE_ERROR}</p>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, opacity: 0.75 }}>
          Foundation §2.8 makes the reference case binding: any screen showing different figures for this booking is
          a defect. Running with a broken engine would put wrong money in front of a client, so it stops here instead.
        </p>
      </main>
    </StrictMode>,
  )
} else {
  createRoot(root).render(
    <StrictMode>
      <AuthProvider>
        <ThemeProvider initial="light">
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </StrictMode>,
  )
}
