# Babin Rentals OS

React 18 · TypeScript · Vite · Tailwind v4 · Supabase

**Specs:** [`../mds and photos/Babin Rentals OS/`](../mds%20and%20photos/Babin%20Rentals%20OS/)
Start with `00 Getting Started/Foundation Specification.md`. Where anything disagrees with
Foundation, Foundation wins.

---

## Status

**Schema first.** This scaffold exists so the database work has somewhere to land. Screens
are ported from the existing capsule build (`Rental_workspace_backup/babin-rentals-os`,
76 files, JS) one module at a time — that UI is good and matches the approved render; what
it lacks is a real data layer.

```
supabase/migrations/   ← the schema (in progress)
src/lib/supabase.ts    ← anon key only, RLS is the enforcement layer
src/index.css          ← token layer, ported verbatim from the capsule build
```

---

## Setup

```bash
cp .env.example .env.local   # fill in URL + ANON key
npm install
npm run dev
```

**Anon key only.** A service key in the client bypasses Row Level Security entirely, which
is the single most likely way this product's authorization model gets defeated.

---

## Deployment

### Environment variables

Everything the app reads is prefixed `VITE_`, which means Vite **inlines it into the
bundle at build time**. Two consequences, both easy to get wrong:

1. **All of it is public.** It ships in the JavaScript every visitor downloads and is
   readable with View Source. Use the **anon key only** — never a service key, never a
   Supabase JWT secret, never anything you would not print on the login page. RLS is the
   authorization layer; a service key in the client removes it.
2. **It is not runtime configuration.** Setting these on a running container or a
   `docker run -e` does nothing. They must be present *when the bundle is built*.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Anon key. **Never a service key** |
| `VITE_SENTRY_DSN` | no | Error tracking. Blank ⇒ `lib/monitoring.ts` no-ops entirely |
| `VITE_APP_VERSION` | no | Tags reported errors with the build they came from |

Full notes in [`.env.example`](.env.example).

### Build

```bash
npm ci
npm run build     # tsc --noEmit && vite build  →  dist/
```

A type error fails the build rather than shipping. Output is `dist/`, containing two
documents: `index.html` (the ops app) and `marketing.html` (the public site) — they are
separate Rollup entry points on purpose, so a first-time visitor does not download the
whole ops bundle.

### The SPA rewrite — the one thing that must not be skipped

This app is a **client-side router**. `/` is the only HTML document the router mounts in.
`/today`, `/rentals/BR-2026-0001`, `/operations/packing` and every other route exist in
JavaScript only; there is no such file on disk.

So the host must serve `index.html` for any path that does not match a real file.
**Without that rewrite every deep link, every browser refresh on a non-root page, every
bookmarked booking and every PWA shortcut returns 404 in production** — while working
perfectly in `npm run dev`, because the Vite dev server does the rewrite for you. It is
the classic "works locally, 404s live" failure and it is configuration, not code.

Try the real file first, `index.html` second. That ordering is load-bearing:
`marketing.html` is a genuine document, not a route, and must not be swallowed by the
fallback.

Both configs in this repo already do it:

- **[`vercel.json`](vercel.json)** — `rewrites` are evaluated *after* the filesystem
  check, so the catch-all `/(.*) → /index.html` still lets `/assets/*` and
  `/marketing.html` serve themselves. Also sets immutable caching on hashed assets and
  `no-store` on `sw.js`, without which a device pins itself to an old build.
- **[`Dockerfile`](Dockerfile) + [`nginx.conf`](nginx.conf)** — multi-stage: Node builds,
  nginx serves; the runtime image has no Node and no source. The rewrite is
  `try_files $uri $uri/ /index.html`.

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon key> \
  -t babin-rentals-os .

docker run --rm -p 8080:80 babin-rentals-os   # health probe at /healthz
```

On Netlify the equivalent is a `netlify.toml` with:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

No hosting provider has been chosen and no hosting credentials exist in this repo.
**TODO(decision):** pick the host, then delete the config for the one not used so the two
cannot drift apart on the rewrite or the cache headers.

### Error tracking

`src/lib/monitoring.ts` exposes `captureError(err, context)` and is wired into
`components/shell/ErrorBoundary`, so a production render crash is reported instead of
dying in a console nobody is watching. It posts a Sentry envelope directly over `fetch` /
`sendBeacon` — **no SDK dependency** — and no-ops completely when `VITE_SENTRY_DSN` is
unset, which is the committed state of this repo.

It sends the error name, message, stack, release tag and `location.pathname` — path only,
never the query string, which is where filter and search state lives. Anything you pass
in `context` is serialised verbatim, so pass **ids and counts, never client PII and never
rupee figures**: money is role-gated in this product and an error report is not a hole in
that.

---

## ⚠ Token drift — needs a decision before the UI port

`src/index.css` was ported **verbatim** from the capsule build rather than "corrected",
because the standing instruction is to match the approved render and these are design
calls, not typos. But six values disagree with **Design Tokens v2.0**, which is Build
Locked and dated later:

| Token | Ported (capsule) | Design Tokens v2.0 | Note |
|---|---|---|---|
| `--radius-card` | **14px** | `--r-md` **8** | 14 is `--r-lg`, spec'd for modals/drawers/sheets only. Spec: *"8 is the system default"* |
| `--radius-sheet` | 20px | `--r-lg` **14** | |
| `--radius-field` | 10px | `--r-sm` **6** | Spec has no 10 |
| `--rail-w` | 264px | **240** | Spec: *"not 280 — 280 costs a table column"* |
| `--head-h` | 56px flat | **64** desktop / 56 mobile | Spec: 72 was cut to 64; 56 is the mobile value |
| `--dur-med` / `--dur-page` | 200 / 260ms | **180 / 240 / 320** | Spec locks four steps: 120 / 180 / 240 / 320 |
| `--font-sans` | **Outfit** | **Inter** | index.css lines 178, 204 |
| `.msr` (Material Symbols) | present | **Tabler** | Material Symbols was 72% of the old bundle |

**Verified live**, not inferred — `getComputedStyle` on the running dev server returns
`--radius-card: 14px`, `--rail-w: 264px`, and a resolved body font of `Outfit`.

The font row was an outright **bug**, now patched: the CSS asked for Outfit while
`index.html` loaded only Inter, so the capsule's actual typeface never rendered — it fell
back silently. Both faces are loaded for now so the CSS renders as authored. Whichever
wins, drop the other from `index.html` and update `--font-sans`.

**What matches exactly and should not be touched** — all six semantic colours:
`--ok #2ECC8F` · `--info #2F7DFF` · `--work #F5C518` · `--warn #FF9F43` · `--bad #FF0F0F` ·
`--idle #8A94A6`, plus `--ext #D9A83C` correctly reserved as outline-only external, and
`--accent #1C5CC4` / `--focus #7EA4FF`.

Decide capsule-vs-spec **once**, here, before porting screens — otherwise it gets decided
seventy-six times.

---

## Laws the code must not break

Full detail in the spec library; these are the ones that bite at the code level.

- **Pages never implement their own business logic.** Ten shared engines own workflow, money, dates, tokens, shell, RBAC, discounts, notifications, audit, validation.
- **Single Query Rule.** Every surface reads one booking query. *Hard acceptance gate.*
- **Nothing is deleted.** Cancel · Void · Reverse · Retire · Archive · Deactivate · Close.
- **Payments are immutable.** Corrections are reversal rows referencing the original.
- **Deposits are liabilities** — never in Rental Total, never reducing Outstanding.
- **Warehouse sees no money**, including inside gate checklists. Enforced by RLS, not the UI.
- **Store AD in UTC.** BS is rendered, never stored. All logic runs on AD.
- **Every write carries a client UUID.** Duplicates rejected — a replayed scan must not act twice.
- **Never colour alone.** Every status is icon + label + colour.
- **No platform branch in a layout component.** Branch on capability, never platform.
- **Breakpoints 768 / 1180.** Width decides, never orientation.
- **44×44 touch targets** on every device, desktop included.

---

## Conventions

`@/` maps to `src/`. Strict TypeScript, including `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`.

Icons: **Tabler**, outline, 2px. Fonts: **Inter** (UI) and **JetBrains Mono** (every
number — currency, IDs, serials, dates, quantities, percentages).
