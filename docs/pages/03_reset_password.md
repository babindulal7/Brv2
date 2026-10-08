# Reset Password
`/reset-password` · `src/modules/auth/ResetPassword.tsx` · 211 lines
Mounted at `src/App.tsx:110`, outside `Shell` (`src/App.tsx:943`) and beside `/login` (`src/App.tsx:97`) and `/forgot-password` (`src/App.tsx:109`).

## 1. What it is
The screen the emailed recovery link lands on: two password fields whose submit calls `updatePassword` (`src/modules/auth/ResetPassword.tsx:95`), which is `supabase.auth.updateUser({ password })` (`src/lib/auth.tsx:317`), then navigates to `/today` (`src/modules/auth/ResetPassword.tsx:104`).
It renders one of two whole-page branches, chosen by `isPasswordRecovery` (`src/modules/auth/ResetPassword.tsx:107`) — a flag set only by Supabase's `PASSWORD_RECOVERY` event (`src/lib/auth.tsx:200`), not by having a session.
It reads no application table, imports no `src/data` constant and dispatches no `src/actions` action (`src/modules/auth/ResetPassword.tsx:1-6`).

## 2. What renders
Both branches are wrapped in `AuthCard` (`src/modules/auth/AuthCard.tsx:19`) — a full-viewport centred `Card` (`src/components/ui/Card.tsx:32`), `width: '100%'`, `maxWidth: 420`, `padding: '40px 32px'` (`src/modules/auth/AuthCard.tsx:44-51`), on a `var(--app)` ground with 20px page padding (`src/modules/auth/AuthCard.tsx:34-41`).

**Branch A — recovery session present** (`src/modules/auth/ResetPassword.tsx:145-210`), top to bottom:

1. **Heading pair** — `h1` "Set a new password" at `clamp(20px, 2vw, 24px)`, subtitle "Choose a password you have not used here before." (`src/modules/auth/AuthCard.tsx:53-66`; strings passed at `src/modules/auth/ResetPassword.tsx:146`).
2. **Form**, `display:flex; flexDirection:column; gap: var(--sp-lg)` (`src/modules/auth/ResetPassword.tsx:147`; `--sp-lg: 16px` at `src/styles/theme.css:326`):
   - **"New Password"** label bound to `#new-password` (`:148-160`) over an `Input` of `type="password"`, `autoComplete="new-password"`, `autoFocus`, placeholder `••••••••` (`:161-171`; primitive at `src/components/ui/Input.tsx:22`, `minHeight: 44` at `src/components/ui/Input.tsx:71`).
   - **"Confirm New Password"** label bound to `#confirm-password` over a second identical `Input`, no `autoFocus` (`:174-197`).
   - **Error banner**, rendered only when `error` is set: `ErrorBanner` titled "Could not set the password", wrapped in a `div#new-password-error` that both inputs point at via `aria-describedby` (`:199-203`, `:170`, `:195`).
   - **Submit `Button`**, `variant="primary"`, `height: 44`, label "Set password and sign in" or "Saving…" while `busy`, `disabled={busy}` (`:205-207`; primitive at `src/components/ui/Button.tsx:76`).
   - No footer is passed in this branch, so the divider block does not render (`src/modules/auth/AuthCard.tsx:70`).

**Branch B — no recovery session** (`src/modules/auth/ResetPassword.tsx:107-143`), which is what the route renders by default:

1. **Heading pair** — "This link is not active" / "Open the most recent link from your email to set a new password." (`:110-111`).
2. **`ErrorBanner`** whose title and message switch on `linkError` (`:134-140`): with a fragment error, "That link cannot be used" plus the decoded reason; without one, "No reset in progress" plus "This page only works when you arrive from a password-reset email. Nothing has been changed."
3. **Footer**, below a `borderTop` divider (`src/modules/auth/AuthCard.tsx:70-82`): a single full-width `Link` reading "Request a new link" pointing at `/forgot-password` (`src/modules/auth/ResetPassword.tsx:113-131`), styled as a 44px-high outlined button.
4. **No password field exists in this branch** — it is not disabled, it is unmounted. Pinned by test (`src/modules/auth/__tests__/passwordReset.test.tsx:192`).

**Responsive bands: this page reads neither 768 nor 1180.** `ResetPassword.tsx` and `AuthCard.tsx` import nothing from `src/lib/device.ts` and contain no `useViewport`, no `BREAKPOINT`, no `matchMedia` and no `@media` (`src/modules/auth/ResetPassword.tsx:1-6`, `src/modules/auth/AuthCard.tsx:1-3`; the breakpoint constants it does not read are at `src/lib/device.ts:43`). Layout adapts only through `width: '100%'` + `maxWidth: 420` and the 20px page padding (`src/modules/auth/AuthCard.tsx:40-46`) and the `clamp()` heading (`src/modules/auth/AuthCard.tsx:56`). `FLOOR_UI_SCALE` does not apply — `/reset-password` is not in `FLOOR_ROUTE_SUFFIXES` (`src/App.tsx:902`), and the `data-floor` attribute is set inside `Shell` (`src/App.tsx:1010`), which this route is not in.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Which branch renders | none | `isPasswordRecovery` from React context — set only when `supabase.auth.onAuthStateChange` reports `PASSWORD_RECOVERY` (`src/lib/auth.tsx:186-200`), cleared by a successful `updatePassword` (`src/lib/auth.tsx:318`) or `logout` (`src/lib/auth.tsx:331`). No table, no query file. |
| Both password fields | none | React `useState('')`, never prefilled (`src/modules/auth/ResetPassword.tsx:36-37`, `:165-166`, `:191-192`). |
| "That link cannot be used" message | none | Parsed once at mount from `window.location.hash` — `error_code`, `error`, `error_description` (`src/modules/auth/ResetPassword.tsx:48-62`). A URL fragment written by Supabase's redirect, not a stored record. |
| "Could not set the password" message | none | Verbatim from the Supabase error object; no local message catalogue (`src/modules/auth/ResetPassword.tsx:99`, `src/lib/auth.tsx:319`). |
| The password write | DB | Supabase Auth (GoTrue) `supabase.auth.updateUser({ password })` (`src/lib/auth.tsx:317`), acting on `auth.users`. There is no query file under `src/lib/queries/` for this page and `public.users` is never selected here — the staff row is read elsewhere, by `loadProfile` (`src/lib/auth.tsx:76-80`), after the session already exists. |
| The password write, when `VITE_DATA_SOURCE=mock` | LOCAL — **unserved** | The mock auth stub implements only `getSession`, `onAuthStateChange`, `signInWithPassword` and `signOut` (`src/lib/mock/client.ts:193-227`); there is no `updateUser`, so `src/lib/auth.tsx:309-315` refuses by name. `corpus.ts` does serve a `users` table (`src/lib/mock/corpus.ts:62-66`, `:406`) but nothing on this page reads it. |

Invented on this page: nothing — no `src/data/*.ts` constant array is imported (`src/modules/auth/ResetPassword.tsx:1-6`), no figure or identifier is displayed, and every string on screen is either a literal in this file or text handed back by Supabase.

## 4. Actions and writes

**No `src/actions/*` action is dispatched from this page.** There is no `createAction` call site, no `permissions:` string, and therefore no `implemented` flag and nothing for `checkCapability` to map (`src/modules/auth/ResetPassword.tsx:1-6`; dispatcher at `src/actions/core.ts:220`, fail-closed default at `src/actions/core.ts:223`). `checkCapability`'s switch (`src/actions/core.ts:128-217`) contains no auth or password capability at all, so the "unmapped capability returns `undefined` and is denied for every role" trap (`src/actions/core.ts:215-216`, `:237-241`) cannot fire here — the one write bypasses that framework entirely.

The single write:

| Control | Handler | Path | Capability | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `Button type="submit"` — "Set password and sign in" (`:205`) | `handleSubmit` (`:72`) | `useAuth().updatePassword` (`:40`, `:95`) → `supabase.auth.updateUser({ password })` (`src/lib/auth.tsx:317`) | none declared | n/a — no capability string is involved |

Handler behaviour, in order (`src/modules/auth/ResetPassword.tsx:72-105`): `preventDefault`; re-entrancy guard `if (busy) return` (`:74`); clears any previous error (`:75`); refuses with "Enter the new password twice." if either field is blank, calling nothing (`:77-80`); refuses with "The two passwords do not match." if they differ, calling nothing (`:81-84`); sets `busy`, awaits `updatePassword`, clears `busy` (`:94-96`); on error sets it inline and returns (`:98-101`); otherwise `navigate('/today', { replace: true })` (`:104`). **No minimum length, character class or strength rule is checked in the client** — stated as deliberate at `:86-93` and pinned by test at `src/modules/auth/__tests__/passwordReset.test.tsx:235-245`, which asserts `abc` is sent and the server's refusal is what the operator reads.

No `client_uuid` is minted — `newClientUuid` (`src/lib/supabase.ts:80`) is not used, and this is not a PostgREST write.

Side effect that is not a user action: a `useEffect` at `:66-70` calls `history.replaceState` on mount to strip the URL fragment.

Buttons with no handler: **none.** The only non-submit control is the "Request a new link" react-router `Link` to `/forgot-password` (`:113-131`), which navigates to a real mounted route (`src/App.tsx:109`) and dispatches nothing.

## 5. Gates
- **Route reach: everyone, including no session.** `/reset-password` is mounted as a bare element at `src/App.tsx:110`, outside the `Shell` wrapper that holds the auth redirect (`src/App.tsx:973-974`) and the money-surface refusal (`src/App.tsx:993`). All eight `SystemRole` values reach the URL, as does an unauthenticated visitor — deliberately, per the mounting note at `src/App.tsx:98-108`.
- **The real gate is not a role, it is `isPasswordRecovery`** (`src/modules/auth/ResetPassword.tsx:107`). The component never reads `user`; it destructures only `updatePassword` and `isPasswordRecovery` from `useAuth()` (`:40`). An ordinary signed-in operator typing this URL gets Branch B, because `updateUser({ password })` succeeds for any live session (`src/lib/auth.tsx:302-305`) and gating on `user` would make this a change-password screen. Pinned by test (`src/modules/auth/__tests__/passwordReset.test.tsx:186-194`).
- **Money visibility: not consulted.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24`) is not imported by this page or by `AuthCard`; `canViewMoney` / `MONEY_BLIND` (`src/lib/rbac.ts:36-50`) is absent from the render path.
- **Hidden under Law 6: nothing.** The page renders no figure, no currency and no ledger field, so there is nothing for Law 6 to omit. The `Shell` money guard at `src/App.tsx:993` never runs for this route because the route is not inside `Shell`.
- **The destination after success is gated, though.** `navigate('/today')` (`:104`) lands on a route that *is* inside `Shell` (`src/App.tsx:158-164`), where `!user` redirects to `/login` (`src/App.tsx:973-974`). The recovery session is a real session, so `loadProfile` (`src/lib/auth.tsx:75`) resolves a role for it.

## 6. States drawn
`PageBody` (`src/components/ui/PageBody.tsx`) is **not** used; the page composes `AuthCard` instead (`src/modules/auth/AuthCard.tsx:19`, whose own comment at `:16-17` says it is deliberately not a `components/ui` primitive).

| State | Drawn? | How |
|---|---|---|
| Loading | Partial, hand-rolled | No skeleton. The in-flight state is the submit button's label swap to "Saving…" plus `disabled={busy}` (`src/modules/auth/ResetPassword.tsx:205-206`), which `Button` renders at 0.5 opacity and `cursor: not-allowed` (`src/components/ui/Button.tsx:105-106`). `LoadingSkeleton` (`src/components/ui/StateViews.tsx:87`) is not used, and nothing waits on `useAuth().loading` — that field is not destructured (`src/modules/auth/ResetPassword.tsx:40`). |
| Error | Yes, twice | Shared `ErrorBanner` (`src/components/ui/StateViews.tsx:171`, `role="alert"` at `:185`) in both branches: the link failure at `src/modules/auth/ResetPassword.tsx:134-140` and the submit failure at `:199-203`. Inline and persistent until the next submit, never a toast. No `onRetry` is passed in either place, so the banner's Retry button does not render (`src/components/ui/StateViews.tsx:203`). |
| Empty | n/a | The page lists nothing. `EmptyState` (`src/components/ui/StateViews.tsx:34`) is not used. |
| Restricted | Yes in substance, hand-rolled | Branch B (`src/modules/auth/ResetPassword.tsx:107-143`) is the refusal, but it is built from `AuthCard` + `ErrorBanner`, **not** from `RestrictedState` (`src/components/ui/StateViews.tsx:213`), which this file does not import. So the app's standard "Access restricted" lock treatment does not appear here; the refusal reads as an error instead. |

## 7. Known gaps

- **No `TODO(decision)` marker in this file.** Searched `src/modules/auth/ResetPassword.tsx` and `src/modules/auth/AuthCard.tsx`; neither contains one. The only marker in the module is in a sibling, `src/modules/auth/Login.tsx`.
- **The screen is unreachable in its working state on the mock data source, and says nothing about it.** `isPasswordRecovery` can only become true via a `PASSWORD_RECOVERY` event (`src/lib/auth.tsx:200`), and the mock client emits only `SIGNED_IN` / `SIGNED_OUT` (`src/lib/mock/client.ts:190`). So with `VITE_DATA_SOURCE=mock` (`src/lib/supabase.ts:42`) Branch A can never render, and Branch B's message — "This page only works when you arrive from a password-reset email" — names the wrong cause. The `updatePassword` mock refusal string (`src/lib/auth.tsx:311-314`), which does name the real cause, is unreachable from this screen for the same reason.
- **The mock-data banner never renders on this route, contradicting its own stated rule.** `MockBanner`'s comment says it is "not dismissible, on every screen, at every width" (`src/App.tsx:846-847`), but it is mounted inside `Shell` (`src/App.tsx:1006`) and this route is outside `Shell` (`src/App.tsx:110`). Same for `OfflineBanner` (`src/App.tsx:1007`). `/login` and `/forgot-password` inherit the same gap.
- **`AuthCard`'s `gap: 28` is inert — the card's vertical rhythm does not render.** `AuthCard` sets `display:flex; flexDirection:column; gap: 28` on the `Card` root (`src/modules/auth/AuthCard.tsx:47-51`), but `Card` puts all `children` inside a single inner `<div>` (`src/components/ui/Card.tsx:79`), and its optional header and footer blocks are skipped because `AuthCard` passes none of `title`/`subtitle`/`action`/`footer` as `Card` props (`src/components/ui/Card.tsx:56`, `:81`). The flex container therefore has exactly one child, and the heading pair, the form and the footer stack as plain blocks with no gap between them. Affects `/login`, `/forgot-password` and this page identically.
- **Card padding is applied twice.** `AuthCard` sets `padding: '40px 32px'` on the `Card` root (`src/modules/auth/AuthCard.tsx:47`) while `Card`'s inner content div adds its default `padding: 'md'` = 20px (`src/components/ui/Card.tsx:25-29`, `:37`, `:79`), so the effective inset is 60px vertical / 52px horizontal, not the 40/32 the call site names.
- **Reading the error fragment depends on beating supabase-js to it, and that ordering is not tested.** The client is created with `detectSessionInUrl: true` (`src/lib/supabase.ts:58`) at module evaluation, i.e. before React mounts; the `useMemo` that parses `window.location.hash` runs at first render (`src/modules/auth/ResetPassword.tsx:48-62`) and the file's own comment acknowledges "the fragment is cleared by supabase-js as it consumes the token" (`:44-45`). The unit test sets `window.location.hash` directly with the Supabase client fully mocked out (`src/modules/auth/__tests__/passwordReset.test.tsx:38-50`, `:196-202`), so it proves the parser, not the race. Recorded, not diagnosed — driving a real expired link is the only way to settle it.
- **The refusal card can render for a moment on success.** `updatePassword` clears the recovery flag before it returns (`src/lib/auth.tsx:318`), and `navigate('/today')` is only called afterwards, on the next line of the caller (`src/modules/auth/ResetPassword.tsx:95`, `:104`). Whether "This link is not active" paints in between depends on React's batching of the two updates; not driven, and no test covers it (`src/modules/auth/__tests__/passwordReset.test.tsx:247-255` asserts the navigate call, not the intermediate frames).
- **Nothing in the app links to this route.** A search across `src/` finds `/reset-password` only at its route mount (`src/App.tsx:110`) and as the `redirectTo` of the reset email (`src/lib/auth.tsx:292`). The only entry is the emailed link — and whether that link returns here at all depends on the Supabase project's Redirect URLs allow-list, which no code or migration in this repo sets (`src/lib/auth.tsx:266-273`).
- **The two inputs share one `aria-describedby` target that only exists sometimes.** Both fields point at `#new-password-error` (`src/modules/auth/ResetPassword.tsx:170`, `:195`), and that element is rendered only inside the `error &&` guard (`:199-200`) — correct while the attributes are also conditional, but it means the confirm field's description is the new-password field's id.
- **`linkError` is computed unconditionally but only consumable in Branch B** (`src/modules/auth/ResetPassword.tsx:48-62` vs `:135-139`). If a fragment error ever coexisted with `isPasswordRecovery === true`, the parsed reason would be silently dropped. Not reachable through `src/lib/auth.tsx:200` as written, since a failed link establishes no session.
- **Contradiction with the sibling screen's own copy.** This page's footer sends the operator to `/forgot-password` (`:113-131`), which on success tells them a link "is on its way" without being able to verify it (`src/modules/auth/ForgotPassword.tsx:117-126`, reasoning at `src/lib/auth.tsx:250-264`). An operator bounced back and forth between the two screens is told to request a link, then told the request was accepted, with neither screen able to state that anything was delivered.
