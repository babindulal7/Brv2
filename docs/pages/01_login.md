# Login

Route `/login` · `src/modules/auth/Login.tsx` · 228 lines

Mounted at `src/App.tsx:97` as `<Route path="/login" element={<Login />} />` — **outside** `Shell`, so none of `Shell`'s session guard, sidebar, header, `MockBanner` or `OfflineBanner` reach it (`src/App.tsx:943-1040`).

---

## 1. What it is

Staff sign-in. Email + password go to `signIn` from `useAuth` (`src/modules/auth/Login.tsx:37,52`), which calls `supabase.auth.signInWithPassword` (`src/lib/auth.tsx:242`); the role that governs every later capability check is then read from the `users` table by `AuthProvider`, not from this screen (`src/lib/auth.tsx:76-80,162-167`).

The screen also draws two secondary flows: a **disabled** "Sign in with PIN" button wrapped in `Unavailable` (`src/modules/auth/Login.tsx:177-196`), and a `Link` to `/forgot-password` (`src/modules/auth/Login.tsx:205-223`).

## 2. What renders

Top to bottom, at any width (`src/modules/auth/Login.tsx:66-227`):

| # | Element | Evidence |
|---|---|---|
| 1 | Full-viewport centring wrapper — `minHeight: 100vh`, flex centre, `background: var(--app)`, `padding: 20` | `src/modules/auth/Login.tsx:67-76` |
| 2 | `Card` (`src/components/ui/Card.tsx:32`), `maxWidth: 420`, `padding: '40px 32px'` | `src/modules/auth/Login.tsx:77-86` |
| 3 | Heading block — `<h1>` "Welcome to Babin Rentals", `<p>` "Sign in with your work email to continue." | `src/modules/auth/Login.tsx:87-94` |
| 4 | `<form onSubmit={handleLogin}>` | `src/modules/auth/Login.tsx:96` |
| 5 | "Work Email" hand-rolled `<label htmlFor="login-email">` + `Input` (`type="email"`, `autoComplete="username"`, `autoFocus`) | `src/modules/auth/Login.tsx:97-115` |
| 6 | "Password" hand-rolled `<label htmlFor="login-password">` + `Input` (`type="password"`, `autoComplete="current-password"`) | `src/modules/auth/Login.tsx:117-134` |
| 7 | `ErrorBanner` inside `<div id="login-error">`, only when `error` state is non-null | `src/modules/auth/Login.tsx:138-142` |
| 8 | Mock-mode notice (`role="status"`, amber `--st-progress-*` pair) listing the mock account emails — rendered only when `IS_MOCK` | `src/modules/auth/Login.tsx:147-168` |
| 9 | Submit `Button variant="primary"`, label flips to "Signing in…" while `busy` | `src/modules/auth/Login.tsx:170-172` |
| 10 | Divider block (`borderTop: 1px solid var(--border)`) holding the two secondary flows | `src/modules/auth/Login.tsx:176` |
| 11 | `Unavailable`-wrapped **disabled** `<button>` "Sign in with PIN" | `src/modules/auth/Login.tsx:177-196` |
| 12 | `<Link to="/forgot-password">` "Forgot password?" | `src/modules/auth/Login.tsx:205-223` |

### Responsive bands

**This file reads neither 768 nor 1180.** It imports nothing from `src/lib/device.ts` (import list, `src/modules/auth/Login.tsx:1-8`) — no `useViewport`, no `useCapability`, no `BREAKPOINT`. Nothing in the file changes at a width threshold.

The only width-reactive properties are CSS, not breakpoints: `maxWidth: 420` on the card (`src/modules/auth/Login.tsx:80`) and `fontSize: 'clamp(20px, 2vw, 24px)'` on the heading (`src/modules/auth/Login.tsx:88`).

One capability query does run on this screen, but it is pointer/hover, not width: `Unavailable` calls `useCapability()` (`src/components/ui/Unavailable.tsx:44`), which reads `(pointer: coarse)` / `(hover: hover)` (`src/lib/device.ts:97-98`). Below `hasHover`, the PIN button's reason string becomes a 500 ms long-press popover instead of a `title` tooltip (`src/components/ui/Unavailable.tsx:70-77,111`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Email / password fields | — | Local `useState` only; nothing is read (`src/modules/auth/Login.tsx:33-34`) |
| Credential check (live mode) | DB | Supabase Auth (GoTrue), not a table — `supabase.auth.signInWithPassword` in `src/lib/auth.tsx:242`, client built in `src/lib/supabase.ts:54-63` |
| Credential check (mock mode) | LOCAL | `mockSupabase.auth.signInWithPassword` matches against `store['users']` and accepts **any non-empty password** (`src/lib/mock/client.ts:203-222`) |
| Role + display name after sign-in | DB | `supabase.from('users').select('id, full_name, primary_role').eq('id', authId)` — `src/lib/auth.tsx:76-80`. Not rendered on this screen; consumed by every screen after it |
| Role + display name after sign-in (mock) | LOCAL | `users` **is** served by the corpus — `USERS` at `src/lib/mock/corpus.ts:62-66`, wired into the store at `src/lib/mock/corpus.ts:406` |
| Mock-mode notice: the account list | LOCAL | `MOCK_LOGINS` constant in the mock layer — `src/lib/mock/client.ts:30-34`; rendered at `src/modules/auth/Login.tsx:165` |
| `IS_MOCK` flag that gates the notice | — | `import.meta.env['VITE_DATA_SOURCE'] === 'mock'` (`src/lib/supabase.ts:42`) |
| Error text in `ErrorBanner` | DB / LOCAL | Whatever `signInWithPassword` returned — `error.message` passed straight through (`src/lib/auth.tsx:244`, rendered `src/modules/auth/Login.tsx:140`) |

No import from `src/data/*.ts` appears in this file (`src/modules/auth/Login.tsx:1-8`), so there is no SEED source here.

**Invented on this page:** no figures. The only invented content is the three mock identities the notice prints in mock mode — `owner@babinrentals.com`, `warehouse@babinrentals.com`, `billing@babinrentals.com` (`src/lib/mock/client.ts:30-34`), backed by the invented staff names "Babin Dulal", "Ram Thapa", "Sita Sharma" in `src/lib/mock/corpus.ts:63-65`. In live mode this block does not render at all (`src/modules/auth/Login.tsx:147`).

## 4. Actions and writes

**This page dispatches no `createAction` at all.** It imports nothing from `src/actions/` (`src/modules/auth/Login.tsx:1-8`), so `checkCapability` in `src/actions/core.ts:124-218` is never consulted from this screen, and no capability string on this page can fall through to the `default: return undefined` denial (`src/actions/core.ts:215-216`).

Its one write path bypasses the dispatcher entirely:

| Control | Handler | What it does | Implemented |
|---|---|---|---|
| "Sign In" submit (`src/modules/auth/Login.tsx:170`) | `handleLogin` (`src/modules/auth/Login.tsx:41-64`) | Guards `busy`; blank-field check sets an inline error and returns (`:46-49`); otherwise `await signIn(email.trim(), password)` → `supabase.auth.signInWithPassword` (`src/lib/auth.tsx:241-245`); on success `navigate(from ?? '/today', { replace: true })` (`:63`) | **Yes** — real Supabase Auth call, no stub layer |
| "Sign in with PIN" (`src/modules/auth/Login.tsx:178-195`) | **none** | `<button type="button" disabled>` with no `onClick`. Wrapped in `Unavailable` so the reason is surfaced on hover/long-press | **No** — dead by construction |
| "Forgot password?" (`src/modules/auth/Login.tsx:205-223`) | react-router `Link` | Navigates to `/forgot-password`, mounted at `src/App.tsx:109` | Route exists; the target screen is `src/modules/auth/ForgotPassword.tsx` |

Buttons with no handler: the PIN button (`src/modules/auth/Login.tsx:178-195`) is the only one, and it is explicitly `disabled`.

Side-effect worth naming: sign-in success is what causes `AuthProvider`'s `onAuthStateChange` subscriber to run `loadProfile`, which performs the `users` read (`src/lib/auth.tsx:186-210`). The comment at `src/lib/auth.tsx:243` states that `signIn` reports only the failure path — `user` is populated by that listener, not by this screen.

## 5. Gates

- **Route access.** `/login` is unguarded. `src/App.tsx:97` mounts `<Login />` bare, and every gate in the app lives in `Shell` (`src/App.tsx:964-993`), which this route does not use. Every role reaches it, and so does an unauthenticated visitor — which is the point.
- **No signed-in redirect.** Nothing on this route checks `user`. A visitor who already has a session and types `/login` gets the form again. Compare `src/App.tsx:111`, where `/` does branch on `user`.
- **Money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not** imported or called here (`src/modules/auth/Login.tsx:1-8`). Nothing on this screen is a figure, so nothing is hidden under Law 6. The relevant fact for later screens is that `canViewMoney` reads `MONEY_BLIND = { Warehouse, Technician, Driver, Client }` (`src/lib/rbac.ts:36-50`) against the role this screen's sign-in causes to be resolved.
- **What Law 6 hides here:** nothing. There is no money surface on this page, and `isMoneySurface` is never evaluated for `/login` because that check sits inside `Shell` (`src/App.tsx:993`).

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx`) is **not** used — it is not imported (`src/modules/auth/Login.tsx:1-8`).

| State | Present? | How |
|---|---|---|
| Loading | Partial, hand-rolled | No page-level loading state. Only the in-flight submit: `busy` disables the button and swaps its label to "Signing in…" (`src/modules/auth/Login.tsx:36,51,53,170-172`). There is no skeleton and no `LoadingSkeleton` call |
| Error | Yes, shared | `ErrorBanner` from `src/components/ui/StateViews.tsx:171`, rendered inline and persistently at `src/modules/auth/Login.tsx:138-142` with `title="Could not sign in"`. `ErrorBanner` carries `role="alert"` and an `alert_triangle` icon (`src/components/ui/StateViews.tsx:184,198`) — icon plus text, not colour alone |
| Empty | None | Not applicable; nothing lists |
| Restricted | None | `RestrictedState` (`src/components/ui/StateViews.tsx:213`) is neither imported nor rendered here |

Accessibility wiring that does exist: both inputs take `aria-invalid` and `aria-describedby="login-error"` while an error is set (`src/modules/auth/Login.tsx:112-113,131-132`), and the banner's wrapper carries that id (`src/modules/auth/Login.tsx:139`). `Input` spreads unknown props onto the `<input>` (`src/components/ui/Input.tsx:83`) and uses the passed `id` verbatim (`src/components/ui/Input.tsx:26,65`), so the hand-rolled `htmlFor` labels do bind.

## 7. Known gaps

1. **`TODO(decision)` in the file header — PIN and OTP sign-in are not built.** `src/modules/auth/Login.tsx:23-30`. The doc comment names the unmade rulings (where a PIN is stored, which SMS gateway, device-vs-person identity on a shared tablet). This is the only `TODO(decision)` marker in the file.

2. **The PIN button is a dead control.** `src/modules/auth/Login.tsx:178-195` — `disabled`, no `onClick`, `cursor: 'not-allowed'`. It renders, dispatches nothing, and is surfaced as unavailable-with-reason via `Unavailable` (`src/modules/auth/Login.tsx:177`). On a touch device with no hover the reason is only reachable by a 500 ms long-press (`src/components/ui/Unavailable.tsx:73-77`) — which is the warehouse-tablet case the button is for.

3. **The "return to the route the guard intercepted" path is dead code.** `src/modules/auth/Login.tsx:61-63` reads `(location.state as { from?: string })?.from` and comments that it returns the user "to wherever the guard intercepted them, not always /today". The only redirect to `/login` in the codebase is `src/App.tsx:974` — `<Navigate to="/login" replace />` — which passes **no** `state`. A repo-wide search for a navigation to `/login` carrying `state` returns only that line. So `from` is always `undefined` and every successful sign-in lands on `/today`, discarding the requested route.

4. **`AuthCard` exists to hold exactly this markup, and Login does not use it.** `src/modules/auth/AuthCard.tsx:19-86` is a byte-for-byte duplicate of `src/modules/auth/Login.tsx:67-94` and `:176` — same `minHeight: '100vh'` wrapper, same `maxWidth: 420` / `padding: '40px 32px'` / `gap: 28` card, same heading pair, same footer divider. Its own comment (`src/modules/auth/AuthCard.tsx:9-13`) says it was extracted on 15 Aug precisely so the three auth screens cannot drift on padding. `ForgotPassword.tsx:69` and `ResetPassword.tsx:109,146` consume it; `Login.tsx` still carries the inline copy. The drift the file was created to prevent is live in the one screen it was copied from.

5. **`gap: 28` on the card does nothing, and the three blocks render with no gap between them.** `src/modules/auth/Login.tsx:83-85` sets `display: flex; flexDirection: column; gap: 28` — but `Card` spreads `style` onto its **root**, then wraps `children` in a single inner `<div>` (`src/components/ui/Card.tsx:51,79`). With no `title`/`subtitle`/`action`/`footer` passed, that root has exactly one flex child, so the gap has nothing to space. The heading block, the form and the divider block are block-level siblings inside the inner div, and only the divider carries its own `paddingTop` (`src/modules/auth/Login.tsx:176`). `AuthCard` has the identical defect (`src/modules/auth/AuthCard.tsx:48-50`).

6. **The card is double-padded.** `Card`'s `padding` prop defaults to `'md'` = `20` and is applied to the inner content div (`src/components/ui/Card.tsx:25-30,37,79`), while `src/modules/auth/Login.tsx:81` sets `padding: '40px 32px'` on the root through `style`. Both apply: effective inset is 60px vertical / 52px horizontal, not the 40/32 the call site states.

7. **Mock mode signs anyone in with any non-empty password.** `src/lib/mock/client.ts:203-222` — the address must exist in `store['users']`, the password is never checked, and the screen advertises this in the amber notice (`src/modules/auth/Login.tsx:165`). Correct for a local mimic; recorded because the same form is the live credential gate and the two behaviours are one component.

8. **Mock mode has no password reset, and this screen still offers the link.** The "Forgot password?" link (`src/modules/auth/Login.tsx:205`) is unconditional. In mock mode the target refuses by name — `requestPasswordReset` checks `typeof supabase.auth.resetPasswordForEmail !== 'function'` and returns an explanatory error (`src/lib/auth.tsx:283-289`), because the mock auth stub implements only `getSession`, `onAuthStateChange`, `signInWithPassword` and `signOut` (`src/lib/mock/client.ts:193-227`). The refusal is honest but it happens one screen later, not here.

9. **A signed-in user is not redirected away from `/login`.** `src/App.tsx:97` mounts the route with no `user` check, unlike `/` at `src/App.tsx:111`. Typing the URL mid-session re-renders the form over a live session.

10. **No test covers this screen.** The only test file under `src/modules/auth/__tests__/` is `passwordReset.test.tsx`, whose three suites are `ForgotPassword — asks for a link` (:135), `ResetPassword — the gate` (:186) and `ResetPassword — with a recovery session` (:205). Nothing exercises `handleLogin`, the blank-field guard, or the `busy` re-entrancy guard.

11. **Contradiction with the file's own comment about the shell banner.** `src/modules/auth/Login.tsx:144-146` says the global `MockBanner` "does not reach it" because the screen is mounted outside `Shell` — that is correct and verified (`MockBanner` is rendered only inside `Shell` at `src/App.tsx:1006`). Noted here because the local amber notice at `:147-168` is therefore the *only* mock disclosure on this route, and it lives in a different component from the one every other screen uses.
