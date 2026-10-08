# MIRAZ FEEL ADOPTION — DESIGN_DIRECTION_SPEC v4.2 (delta over v4.1)

**Date:** 31 Aug 2026
**Status:** RULED. Applies on top of DESIGN_DIRECTION_SPEC_v4.1.md. Where this file is silent, v4.1 wins.
**Source:** design tokens extracted from the built Miraz Bakery POS 1.1.0 (out/renderer CSS), adopted selectively per Babin's 31 Aug rulings.
**Venue:** apply in Claude Code on the repo directly (24 Aug venue ruling). This file goes to `docs/`.

---

## §1 What is adopted from Miraz — and what is not

| Adopted | Rejected |
|---|---|
| Motion feel: `cubic-bezier(0.16, 1, 0.3, 1)` everywhere | Orange `#F4911E` primary (blue primary stands) |
| Glass intensity, extended to cards | Outfit as UI font (Inter stands) |
| Soft cards: layered shadows + hover lift | Soft-tint STATUS chips (statuses stay SOLID per 24 Aug) |
| Soft-tint treatment for NON-status chips | Per-screen media queries (~14 breakpoints in Miraz — a defect under our law) |
| Warm cream canvas gradient (light theme) | Glass at 0.75 opacity (fails our contrast floor) |
| Light theme as the DEFAULT on open | — |

## §2 Supersession log (explicit)

1. **DEFAULT THEME = LIGHT** — supersedes the 24 Aug "Quiet Control Room dark = in-app default". Both themes stay; per-user toggle persists; only the default flips.
2. **GLASS EXTENDS TO CARDS** — supersedes the 29 Aug "cards and tables stay solid". **Tables stay solid** (ruled 31 Aug, readability). Status blocks stay solid.
3. **Warm cream canvas is NEW** — it does NOT revive orange as an action color. Orange remains a status hue only (On Rent family), never on buttons.
4. Everything else in v4.1 is unchanged: blue primary, seven-hue solid status map, Inter + Hind + JetBrains Mono, gold restricted to the `--ext` outline, radius map 6/8/14/999, `--tap` 44px.

## §3 Canvas (new tokens)

```css
/* Light (default) — Miraz values, verified from build */
--bg-gradient-1: #FDEFDC;
--bg-gradient-2: #FFF9F0;

/* Dark — same recipe, Babin navy family (NOT Miraz gray) */
--bg-gradient-1: #050B12;
--bg-gradient-2: #0B1622;

body {
  background: linear-gradient(160deg, var(--bg-gradient-1), var(--bg-gradient-2));
  background-attachment: fixed; /* glass needs a stationary backdrop */
}
```

⚠ **Gold on cream:** the `--ext` gold outline was tuned against dark. Verify contrast on `#FDEFDC` and use the darker light-theme gold pair if it fails. The mark must stay legible — it is the one distinction the warehouse must see.

## §4 Glass recipe

- Applies to: chrome (top bar, sidebar / icon rail, bottom bar), floating surfaces (drawers, sheets, popovers, FAB), and now **cards**.
- Stays solid: **tables**, status blocks, and any surface carrying dense data rows.
- Opacity floor **stands**: `--glass-tint` ≥ 0.85 dark / 0.88 light. Miraz's 0.75 is rejected — 4.5:1 cannot be verified against a moving backdrop below the floor.
- Blur scale: chrome 20–24px · cards 12–16px · popovers/sheets 16px (Miraz uses 4–24; this maps it to three steps instead of six).
- `prefers-reduced-transparency` and `prefers-contrast: more` → fully opaque. The `[data-floor]` kill-switch stays; measure a 200-row packing list on the real warehouse tablet before committing card glass on floor screens.

```css
--surface-card-light: rgba(255, 255, 255, 0.88);
--surface-card-dark:  rgba(11, 22, 34, 0.85);
.card { background: var(--surface-card); backdrop-filter: blur(14px); }
```

## §5 Motion

```css
--ease: cubic-bezier(0.16, 1, 0.3, 1); /* app-wide easing token */
```

- Durations stay on OUR scale (120–240ms). The curve changes, the numbers do not.
- Sidebar collapse: `transition: grid-template-columns 240ms var(--ease)` on the shell grid. This triggers layout every frame — acceptable as a one-off on collapse, and it MUST be disabled under `prefers-reduced-motion`.
- Hover lift `transform: translateY(-2px)` on cards — only inside `@media (hover:hover) and (pointer:fine)`; `:active` goes one surface step deeper per the 24 Aug hover spec. Not-clickable = no hover (unchanged).
- Keyframes to port on our scale: `fadeIn`, `slideUp`, `toastIn`, `pop`.

## §6 Cards + chips

**Cards** (the Miraz softness, without touching the radius map):

```css
--shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
--shadow:    0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.025);
--shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04);
```

Card = glass surface (§4) + `--shadow` at rest + `--shadow-lg` on hover + hover lift (§5). Radius stays 14 (`--r-card`); Miraz's 12/16 not adopted.

**Soft-tint chips — NON-STATUS ONLY:**

- Recipe: light theme bg = pastel of the hue (e.g. blue `#DBEAFE`), dark theme bg = `rgba(hue, 0.18)`; text = the hue's dark/text pair; no border.
- Applies to: filter chips, active-filter chips, tags, category chips, customer-type chips.
- Count badges keep `--r-badge` 999.
- Scope selectors stay GREY (24 Aug: selectors grey, actions blue) — grey soft-tint is the correct rendering.
- **STATUS blocks: unchanged.** `status-buttons-v4.1.html` remains the pixel benchmark. A soft-tint status is a defect.

## §7 Responsive — the feel is Miraz, the mechanism is ours

- The law stands: **no screen carries its own responsive code; an `@media` in a screen file is a defect.** Miraz achieves its feel with ~14 scattered breakpoints; we achieve the same feel with 2 (768/1280) through the shell-mode variable block.
- **Wave 0 merge is now REQUIRED and first:** `breakpoints.ts` + `device.ts` v2.1 + `responsive.css` + the index.html pre-paint script. This is the third unmerged package and it IS the Miraz responsiveness — nothing in this spec lands properly before it.
- Fluid grids use the safe form `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`. KPI clamp stays deterministic (4/3/2) — never auto-fit on the KPI strip.

## §8 Rollout order

1. **theme.css** — add canvas gradient, shadow scale, `--ease`, card glass vars, soft-chip tokens; flip default theme to light.
2. **Wave 0 responsive merge** (§7).
3. **Component pass** — card + chip treatment in the kit and FilterDrawer/ActiveFilterChips.
4. **Screens mechanically**; re-render `today-page-v4.1.html` and `status-buttons-v4.1.html` benchmarks on the light cream canvas.

**Same-pass downstream updates (or the next MD regeneration reverts this):** UI_UX_SPEC v1.0 §1 identity words (add "light-first, warm canvas"), CLAUDE_DESIGN_INSTRUCTIONS §4, babin-kit `tokens.css`, `docs/benchmarks/`.

## §9 Open ⭐

1. Dark-theme gradient stops — navy pair above is the default; confirm against v4.1 dark surface tokens.
2. Light-theme gold value for the `--ext` outline on cream (§3 warning).
3. Does the Client Portal (external surface) also open light-first? Recommended yes; confirm.

---

## Appendix — Miraz extracted reference (for fidelity checks)

From the built app, not guessed: primary `#F4911E` (rejected) · canvas `#FDEFDC → #FFF9F0` (adopted) · surface `rgba(255,255,255,0.75)` (floor-corrected to 0.88) · radius 8/12/16 (not adopted) · shadows sm/base/lg/xl as §6 (adopted) · easing `cubic-bezier(0.16,1,0.3,1)` at 200–250ms (adopted, on our durations) · `backdrop-filter: blur(4–24px)` ×17 (mapped to 3 steps) · keyframes fadeIn/pop/pulse/pulseGlow/slideInLeft/slideUp/toastIn · grids `auto-fit minmax(170–340px, 1fr)` · single font Outfit (rejected) · soft status trios hue/-dk/-soft (adopted for non-status chips only).
