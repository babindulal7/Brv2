# Babin Rentals OS

React 18 · TypeScript · Vite · Tailwind v4 · Supabase

**Specs:** [`../mds and photos/Babin Rentals OS/`](../mds%20and%20photos/Babin%20Rentals%20OS/)
Start with `00 Getting Started/Foundation Specification.md`. Where anything disagrees with
Foundation, Foundation wins.

---

## Status

*Rewritten 16 Aug 2026. This said "Schema first — this scaffold exists so the database work
has somewhere to land", which had stopped being true by a wide margin.*

**A 54-route application on a live Postgres schema, with a partly-connected data layer.**

| | State, measured 16 Aug 2026 |
|---|---|
| Schema | 121 tables, 62 migrations, RLS on 121/121, 231 policies, 36 triggers — applied to the live project |
| Data | Real: 121 bookings · 419 booking lines · 76 clients · 126 products · 120 invoices · 93 payments |
| Screens | 52 of 52 routes driven in a browser; all render |
| Gates | `tsc --noEmit` exit 0 · `vitest run` 1,982 passed / 78 files · `vite build` exit 0 |
| Auth | Real Supabase Auth — sign-in, session, and password reset by email |

**What green does not mean.** 1,982 passing tests coexist with roughly two dozen unbuilt
actions, because the untested surface is exactly the unbuilt surface. `createRental` and
`saveDraft` are still stubs, so a booking cannot be created in the app; Booking Detail still
renders one seeded record for every booking number, though it now says so on screen. Green
means "what exists is correct", not "the system works".

**Where the truth lives:** `PLAN.md` (laws, build order, open decisions — §4 is the blocker
register) and `PROGRESS.md` (what changed and how it was verified, newest first). Every other
document in this repo is dated; `DOC_STATUS` records which are still safe to act on.

```
supabase/migrations/   ← the schema — 62 files, 0001–0062 (0062 written, deliberately unapplied)
src/lib/supabase.ts    ← anon key only, RLS is the enforcement layer
src/styles/theme.css   ← the token layer
src/actions/           ← the write layer; a stub refuses rather than faking success
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
| ~~`--font-sans`~~ | — | — | ✅ **Settled — row void.** See below. |
| `.msr` (Material Symbols) | present | **Tabler** | Material Symbols was 72% of the old bundle |

**Verified live**, not inferred — `getComputedStyle` on the running dev server returns
`--radius-card: 14px`, `--rail-w: 264px`, and a resolved body font of `Outfit`.

**The font row is settled and this paragraph was stale — corrected 16 Aug 2026.** It said
"both faces are loaded for now… drop the other from `index.html`". Read off the running app:

| | Reality |
|---|---|
| `--font-sans` | **does not exist.** The token was replaced by a three-way split. |
| `--font-display` | `'Outfit'` — headings. `h1` resolves to `Outfit`. |
| `--font-body` | `'Source Sans 3'` — body. `document.body` resolves to `Source Sans 3`. |
| `--font-id` | `'JetBrains Mono Variable'` — every number. |
| Inter | **not loaded at all.** `document.fonts` holds exactly Outfit, Source Sans 3, JetBrains Mono Variable. |
| `index.html` | contains **no font references whatsoever** — faces are self-hosted `.woff2`, per `PLAN.md §4.0b`. |

So there is nothing to drop and no token to update. `PLAN.md §4.0b` ruled Outfit and dropped
Inter; the split into display/body/id happened afterwards and this file never caught up.
Nepali faces (`--font-ne-display: 'Asar'`, `--font-ne-body: 'Hind'`) are also installed —
`PLAN.md §4.26` closed the Devanagari tofu question §4.2 raised.

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
- **Breakpoints 768 / 1280.** Width decides, never orientation. *(Was 768 / 1180 until 31 Aug 2026 — Law 14 amended, `PLAN.md` §4.38a; `src/lib/device.ts` still carries 1180 until its follow-up lands.)*
- **44×44 touch targets** on every device, desktop included.

---

## Conventions

`@/` maps to `src/`. Strict TypeScript, including `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`.

Icons: **Tabler**, outline, 2px. Fonts: **Outfit** (headings), **Source Sans 3** (body) and
**JetBrains Mono** (every number — currency, IDs, serials, dates, quantities, percentages).
Nepali: **Asar** (display) and **Hind** (body). All self-hosted; nothing is fetched at
runtime. *(This line said "Inter (UI)" until 16 Aug 2026; Inter is not loaded anywhere.)*
