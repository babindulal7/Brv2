# Forgot Password
`/forgot-password` · `src/modules/auth/ForgotPassword.tsx` · 168 lines
Mounted at `src/App.tsx:109`, outside `Shell` (`src/App.tsx:943`) and beside `/login` (`src/App.tsx:97`).

## 1. What it is
A single-field form that asks Supabase Auth to email a password-reset link: the address is typed, trimmed and passed to `requestPasswordReset` (`src/modules/auth/ForgotPassword.tsx:54`), which calls `supabase.auth.resetPasswordForEmail` (`src/lib/auth.tsx:291`).
It reads no application table, imports no `src/data` constant and dispatches no `src/actions` action (`src/modules/auth/ForgotPassword.tsx:1-7`).
On success it renders a deliberately conditional notice — "If **{email}** has an account…" (`src/modules/auth/ForgotPassword.tsx:122`) — because the Supabase call answers identically for an address with no account (`src/lib/auth.tsx:250-264`).

## 2. What renders
Top to bottom at desktop, all inside `AuthCard` (`src/modules/auth/AuthCard.tsx:19`) — a full-viewport centred `Card` (`src/components/ui/Card.tsx:32`), `maxWidth: 420`, `padding: '40px 32px'` (`src/modules/auth/AuthCard.tsx:44-51`):

1. **Heading pair** — `h1` "Reset your password" at `clamp(20px, 2vw, 24px)` and the subtitle "We'll email you a link to set a new one." (`src/modules/auth/AuthCard.tsx:53-66`, strings passed at `src/modules/auth/ForgotPassword.tsx:70-71`).
2. **Body — one of two mutually exclusive branches** (`src/modules/auth/ForgotPassword.tsx:117`):
   - *Before submit / after a failure*: a `form` (`src/modules/auth/ForgotPassword.tsx:128`) containing the "Work Email" label bound to `#reset-email` (`:130-141`), an `Input` of `type="email"`, `autoComplete="username"`, `autoFocus`, placeholder `name@babinrentals.com` (`:142-152`, primitive at `src/components/ui/Input.tsx:22`, `minHeight: 44` at `src/components/ui/Input.tsx:71`); an `ErrorBanner` wrapped in `#reset-error`, rendered only when `error` is set (`:155-159`); and a primary submit `Button` reading "Email me a reset link", or "Sending…" and disabled while `busy` (`:161-163`, primitive at `src/components/ui/Button.tsx:76`).
   - *After a successful request*: `NoticeBanner` titled "Request sent" replaces the whole form — the input is unmounted (`src/modules/auth/ForgotPassword.tsx:117-126`, banner at `src/modules/auth/AuthCard.tsx:98`).
3. **Footer**, below a `borderTop` divider (`src/modules/auth/AuthCard.tsx:70-82`): a full-width "Back to sign in" `Link` to `/login` (`src/modules/auth/ForgotPassword.tsx:74-92`), then a disabled "Send a code by SMS instead" button wrapped in `Unavailable` (`src/modules/auth/ForgotPassword.tsx:94-113`). The footer renders in both branches — it sits outside the `sent` ternary.

**Responsive bands: this page reads neither 768 nor 1180.** `ForgotPassword.tsx` and `AuthCard.tsx` contain no `useViewport`, no `BREAKPOINT`, no `matchMedia` and no `@media` — verified by search across both files. The only device query in the render path is `useCapability()` inside `Unavailable` (`src/components/ui/Unavailable.tsx:44`, `src/lib/device.ts:111`), and it reads **hover**, not width: with `hasHover` true the reason is a `title` attribute, otherwise a 500 ms long-press opens it as a popover (`src/components/ui/Unavailable.tsx:70-77`, `:111`). Layout adapts only through `width: '100%'` + `maxWidth: 420` and the 20px page padding (`src/modules/auth/AuthCard.tsx:40-46`) and the `clamp()` heading (`src/modules/auth/AuthCard.tsx:56`). `FLOOR_UI_SCALE` does not apply — `/forgot-password` is not in `FLOOR_ROUTE_SUFFIXES` (`src/App.tsx:902`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Email field value | none | React `useState('')` only; nothing is prefilled and nothing is read from a store (`src/modules/auth/ForgotPassword.tsx:37`, `:146-147`). |
| "Request sent" notice text | none | Echoes `email.trim()` — the operator's own typing, not a looked-up record (`src/modules/auth/ForgotPassword.tsx:122`). |
| Error text | none | Verbatim from the Supabase error object; no local message catalogue (`src/modules/auth/ForgotPassword.tsx:61`, `src/lib/auth.tsx:294`). |
| The reset request itself | DB | Supabase Auth (GoTrue) endpoint `supabase.auth.resetPasswordForEmail(email, { redirectTo })` (`src/lib/auth.tsx:291-293`). It is not a PostgREST table read: there is no query file under `src/lib/queries/` for this page, `public.users` is never selected here, and the identity it acts on is `auth.users`. |
| The reset request, when `VITE_DATA_SOURCE=mock` | LOCAL — **unserved** | `src/lib/mock/client.ts`'s auth stub implements only `getSession`, `onAuthStateChange`, `signInWithPassword` and `signOut` (`src/lib/mock/client.ts:193-227`) — there is no `resetPasswordForEmail`, so `src/lib/auth.tsx:283-289` refuses by name and the screen shows that refusal as an error. `corpus.ts` serves a `users` table (`src/lib/mock/corpus.ts:62-66`, `:406`) but nothing on this page reads it. |

Invented on this page: nothing — no `src/data/*.ts` constant array is imported (`src/modules/auth/ForgotPassword.tsx:1-7`), and the only value shown back to the operator is the address they typed (`src/modules/auth/ForgotPassword.tsx:122`).

## 4. Actions and writes

**No `src/actions/*` action is dispatched from this page.** There is no `createAction` call site in it, no `permissions:` string, and therefore no `implemented` flag and nothing for `checkCapability` to map (`src/modules/auth/ForgotPassword.tsx:1-7`, dispatcher at `src/actions/core.ts:220`). `checkCapability`'s switch (`src/actions/core.ts:128-217`) contains no auth/password capability at all, so the question of a missing mapping does not arise here — the one write bypasses that framework entirely.

The single write:

| Control | Handler | Path | Capability | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `Button type="submit"` — "Email me a reset link" (`:161`) | `handleSubmit` (`:43`) | `useAuth().requestPasswordReset` (`:41`, `:54`) → `supabase.auth.resetPasswordForEmail` (`src/lib/auth.tsx:291`) | none declared | n/a — no capability string is involved |

Handler behaviour, in order: re-entrancy guard `if (busy) return` (`:45`); clears any previous error (`:46`); refuses an empty/whitespace address with "Enter the work email you sign in with." and sends nothing (`:48-51`); sets `busy`, awaits, clears `busy` (`:53-55`); on error sets it inline and returns without showing the notice (`:57-63`); otherwise flips `sent` (`:65`). No `client_uuid` is minted — `newClientUuid` (`src/lib/supabase.ts:80`) is not used, and this is not a PostgREST write.

Buttons with no handler:
- **"Send a code by SMS instead"** (`:95-112`) — `type="button"`, `disabled`, **no `onClick`**. Dead by design; the reason string is carried by `Unavailable` (`:94`) and surfaced as `title` on hover or long-press on touch (`src/components/ui/Unavailable.tsx:109-111`).
- **"Back to sign in"** (`:74-92`) is a react-router `Link` to `/login`, not a button; it navigates and dispatches nothing.

## 5. Gates
- **Route reach: everyone, including no session.** `/forgot-password` is mounted as a bare element at `src/App.tsx:109`, outside the `Shell` wrapper that holds the auth redirect (`src/App.tsx:973-974`) and the money-surface refusal (`src/App.tsx:993`). No role check exists anywhere in `ForgotPassword.tsx` or `AuthCard.tsx`, and the component never reads `user`; it destructures only `requestPasswordReset` from `useAuth()` (`src/modules/auth/ForgotPassword.tsx:41`). All eight `SystemRole` values reach it, as does an unauthenticated visitor — deliberately, per the mounting note at `src/App.tsx:98-108`.
- **A signed-in operator is not redirected away.** Nothing in the file inspects the session, so typing the URL while logged in renders the same form.
- **Money visibility: not consulted.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24`) is not imported by this page or by `AuthCard`. `canViewMoney` / `MONEY_BLIND` (`src/lib/rbac.ts:36-50`) is likewise absent from the render path.
- **Hidden under Law 6: nothing.** The page renders no figure, no currency and no ledger field, so there is nothing for Law 6 to omit. The `Shell` money guard at `src/App.tsx:993` never runs for this route because the route is not inside `Shell`.

## 6. States drawn
`PageBody` (`src/components/ui/PageBody.tsx`) is **not** used; the page composes `AuthCard` instead (`src/modules/auth/AuthCard.tsx:19`, whose own comment at `:16-17` says it is deliberately not a `components/ui` primitive).

| State | Drawn? | How |
|---|---|---|
| Loading | Partial, hand-rolled | No skeleton. The in-flight state is the submit button's own label swap to "Sending…" plus `disabled={busy}` (`src/modules/auth/ForgotPassword.tsx:161-162`), which `Button` renders at 0.5 opacity and `cursor: not-allowed` (`src/components/ui/Button.tsx:105-106`). `LoadingSkeleton` (`src/components/ui/StateViews.tsx:87`) is not used. |
| Error | Yes | `ErrorBanner` from the shared toolkit, titled "Could not send the link" (`src/modules/auth/ForgotPassword.tsx:157`; component at `src/components/ui/StateViews.tsx:171`, `role="alert"` at `:185`). Inline and persistent until the next submit, never a toast (`src/modules/auth/ForgotPassword.tsx:58-62`). No `onRetry` is passed, so the banner's Retry button does not render (`src/components/ui/StateViews.tsx:203`). |
| Empty | n/a | The page lists nothing. `EmptyState` (`src/components/ui/StateViews.tsx:34`) is not used. |
| Restricted | none | `RestrictedState` (`src/components/ui/StateViews.tsx:213`) is not imported here, and no gate could produce it — see §5. |

One additional state that is none of the four: the post-submit `NoticeBanner`, `role="status"`, icon + text (`src/modules/auth/AuthCard.tsx:98-119`) — neither a success toast nor an error banner, by explicit design (`src/modules/auth/AuthCard.tsx:88-96`).

## 7. Known gaps

- **No `TODO(decision)` marker in this file.** Searched `src/modules/auth/`; the only one is in a sibling, `src/modules/auth/Login.tsx:23` ("PIN and OTP sign-in are not built"), which is the same undecided SMS question this page's footer restates.
- **The SMS route is a dead control.** `src/modules/auth/ForgotPassword.tsx:95-112` renders a permanently `disabled` button with no `onClick`. It is not a stub action — there is no action behind it at all.
- **The whole page is inoperable on the mock data source.** With `VITE_DATA_SOURCE=mock` (`src/lib/supabase.ts:42`), `requestPasswordReset` short-circuits at `src/lib/auth.tsx:283-289` and returns a refusal string, which lands in the error banner. So in mock mode the *only* working control on the screen is the "Back to sign in" link. Nothing on the form itself warns before the operator types and submits.
- **The emailed link's destination is not controlled by this code.** `redirectTo` is set to `${window.location.origin}/reset-password` (`src/lib/auth.tsx:292`), but the note at `src/lib/auth.tsx:266-273` states the URL must also be in the Supabase project's Redirect URLs allow-list, which no migration and no code in this repo sets; an unlisted origin silently falls back to the Site URL. The screen cannot detect that and will still show "Request sent".
- **Success is unverifiable and the code says so.** A `null` error does not mean an email was sent (`src/lib/auth.tsx:250-264`). The copy is pinned by test — `src/modules/auth/__tests__/passwordReset.test.tsx:156-168` asserts the sentence "if … has an account" is present and that "check your inbox" / "we sent" are absent.
- **A mistyped address is a one-way trip.** `sent` is never reset (`src/modules/auth/ForgotPassword.tsx:39`, `:65`) and the form is unmounted by the ternary at `:117`, so an operator who notices a typo in the confirmation has no control on this screen to correct it — they must navigate away and return. There is no "use a different address" affordance.
- **No address-format check in the handler.** `handleSubmit` tests only `!email.trim()` (`src/modules/auth/ForgotPassword.tsx:48`); the sole constraint is the `type="email"` attribute on the input (`:144`). Whether a malformed address is refused therefore depends on the browser's native form validation, not on this page.
- **User-facing copy cites an internal planning document.** The `Unavailable` reason string shown to operators on hover/long-press ends with "(PLAN.md §4)" (`src/modules/auth/ForgotPassword.tsx:94`). That is a build-artifact reference rendered into the product UI.
- **Contradiction with `/login` — same unavailable flow, two different names.** `src/modules/auth/Login.tsx:194` labels its disabled control "Sign in with PIN"; the comment above the link to this page (`src/modules/auth/Login.tsx:198-204`) says the OTP half "is still unbuilt and still says so, one screen further in", which this page's footer does (`:111` "Send a code by SMS instead"). Two screens, three names — PIN, OTP, SMS — for what the comments describe as one undecided mechanism.
- **The header comment makes a claim this file does not verify.** `src/modules/auth/ForgotPassword.tsx:19-21` asserts "`users.email` is NOT NULL on the live project". No code on this page reads `public.users` (its only import touching data is `useAuth`, `:6`); the identity actually acted on is `auth.users` via GoTrue (`src/lib/auth.tsx:291`). Recorded, not resolved.
