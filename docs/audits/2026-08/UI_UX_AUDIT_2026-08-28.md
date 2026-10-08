> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement from August 2026. Its findings, blockers, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../../CLAUDE.md)

---

# UI/UX Audit — 28 Aug 2026

Static review of `src/` against the app's own stated laws (theme.css v4.1, Law 15,
the five-state pattern) plus WCAG 2.1 AA. Every finding carries a file receipt.
Token contrast was re-verified with the repo's own gate: `node scripts/check-contrast.cjs`
→ **38/38 pass** on both themes. The problems below are structural, not chromatic.

---

## P0 — user-visible or accessibility-breaking

### 1. `Modal.tsx` has no focus management — and it is the app's only dialog
`src/components/ui/Modal.tsx`

Every sheet in the rebuild renders through this one component (its own comment says so),
and it does none of the dialog focus contract:

- Focus is **not moved into the dialog** on open — a keyboard user's focus stays on the
  trigger button behind the scrim.
- **Tab is not trapped** — focus walks straight out into the obscured page.
- Focus is **not restored** on close.
- No `aria-labelledby` linking the `<h2>` title (only bare `role="dialog"` + `aria-modal`).

The sharp part: the team already knows this pattern. `FilterDrawer.tsx:178–184` moves
focus in and restores it (`restoreFocusTo.current?.focus()`), and `MoreSheet.tsx:48`
documents the same. The two satellites do it; the core primitive that ~46 module files
depend on does not. WCAG 2.4.3 / 2.1.2.

**Fix:** on open, focus the dialog surface (or first field); trap Tab within it; on
close, restore to the opener; add `aria-labelledby={titleId}`. One file fixes every sheet.

### 2. `Select.tsx` — custom dropdown with zero keyboard or ARIA support
`src/components/ui/Select.tsx` (272 lines, 10 live module consumers)

- `grep onKeyDown` → **0 hits**. No Escape to close, no Arrow navigation, no typeahead,
  no Home/End.
- Trigger button has no `aria-expanded`, `aria-haspopup`, no `role="listbox"` on the
  menu, no `aria-selected` on options.
- The `<label htmlFor>` targets the **hidden native select** (`opacity: 0, width: 0,
  zIndex: -1` — line ~106), not the visible trigger. That hidden element remains in the
  tab order, so keyboard users can land on an invisible control; meanwhile the visible
  trigger has no programmatic name at all.
- A screen reader on the trigger hears the value text and "button" — no state, no role.

**Fix:** either (a) make the native `<select>` the real focusable control and render the
custom face as its visual skin, or (b) implement the combobox pattern properly
(aria-expanded/listbox/activedescendant + Arrow/Escape/typeahead). (a) is far cheaper
and phone-friendly.

### 3. Z-index: the token scale has zero adopters, and toasts lose
`src/styles/theme.css:24–31` declares `--z-dropdown 1100 / --z-modal 1400 /
--z-system 10500` and admits in the same comment that nothing uses them. Live literals
span 1 → 10000 across 80 inline `zIndex:` sites. Concrete casualties:

| Surface | z | Paints **over** toasts (z 70, root sibling) |
|---|---|---|
| Toast container — `Toast.tsx:138` | 70 | — |
| Calendar full view — `Calendar.tsx:2215` | 200 | ✔ |
| Rentals dropdowns — `PackingLinesSection.tsx:363`, `HandoverLinesSection.tsx:371`, `HandoverRightRail.tsx:196`, `AssetDetail.tsx:959`, `Warehouses.tsx:2102` | 1000 | ✔ |
| BranchesWarehouses overlay — `BranchesWarehouses.tsx:1226` | 9000 | ✔ |
| ScreenLock / SystemRestore — `ScreenLock.tsx:163`, `SystemRestoreModal.tsx:311` | 9999 | ✔ (lock: arguably intended) |

A success toast fired while any of those surfaces is open renders **behind** it —
confirmation feedback is invisible exactly when the user just committed an action on a
deep screen. Modal itself sits at 60, below every 1000-level dropdown.

**Fix:** migrate Toast to `var(--z-system)` first (one line, ends the worst symptom),
then sweep the 80 literals onto the five tokens. The scale was designed for this.

---

## P1 — violates the app's own laws

### 4. Eight components still written in dead Tailwind
Tailwind's Vite plugin is registered (`vite.config.ts:10`) but only
`src/marketing/marketing.css` imports it — for the app bundle every utility class
compiles to nothing. The codebase knows this (Modal, StateViews, Badge, Input were all
rewritten for exactly this reason, per their header comments), yet these still ship in
`components/ui` styled entirely in Tailwind classes:

`Table.tsx` · `GateChecklist.tsx` · `MoneyField.tsx` · `QuantityChip.tsx` ·
`BsAdDate.tsx` · `ScannerInput.tsx` · `ReconciliationAssertion.tsx` · `EvidenceThumbnail.tsx`

None are currently imported by live modules (verified), but they are exported from
`ui/index.ts` — the barrel advertises eight controls that render as unstyled HTML the
moment anyone reaches for them. `Table.tsx` is the most dangerous: it looks like the
app's table primitive.

**Fix:** delete them or move to `src/archive/` until rewritten. An honest absence beats
a broken export.

### 5. Modal close button breaks Law 15 (44px hit area)
`Modal.tsx:186–201` — close button is `padding: 6` around a 20px icon ≈ **32×32px**.
The app's own `TouchTarget.tsx` exists precisely for this ("the law is the HIT AREA,
not the paint") and gave `--tap: 44px` its first consumer — but the most-tapped control
in the app doesn't use it. One-line fix: drop `<TouchTarget />` inside the button.

### 6. Stacked dialogs restore body scroll too early
`Modal.tsx` effect cleanup unconditionally sets `document.body.style.overflow = ''`.
`ConfirmDialog` is itself a Modal (`ConfirmDialog.tsx:3,61`) and is layered over other
modals (ClientsDirectory "Block Client", VoidInvoiceModal). Closing the inner confirm
runs the cleanup while the outer modal is still open → the page behind the remaining
modal becomes scrollable. Classic ref-count problem; a module-level open-modal counter
fixes it.

### 7. Escape is ambiguous inside a modal
Modal listens for Escape on `window` (`Modal.tsx:64–78`); Select handles Escape not at
all (finding 2). A user who opens a Select inside a form modal and presses Escape to
dismiss the *dropdown* closes the *modal* — with their half-completed form. Fix falls
out of finding 2 (Select consumes Escape when open, `stopPropagation`).

---

## P2 — drift and polish

### 8. `DESIGN.md` contradicts the shipped design system
Root `DESIGN.md` specifies **Electric Cyan `#0EA5E9`** on zinc surfaces, Cabinet
Grotesk/Satoshi, spring-physics motion. The live system (theme.css, "Ruled 24 Aug
2026") is **blue `#386AF7`** on custom grays with Outfit + Source Sans 3, and names
`docs/DESIGN_DIRECTION_SPEC_v4.1.md` as authority. `DESIGN.md` sits at repo root with
the authoritative filename — anyone (human or agent) styling from it builds a different
app. Mark it superseded with a pointer, or delete it.

### 9. Developer vocabulary in end-user copy
`Placeholder.tsx` tells the user to "see `SCREENS.md` for the catalogue". The honesty
is right (a fake dashboard would be worse); the register is wrong — an operator on the
warehouse floor has no `SCREENS.md`. Say "This screen hasn't been built yet" and stop,
or point at a person ("ask Suraj"), not a repo file.

### 10. Literal hexes where tokens exist
Most hex matches in `.tsx` are comments, but two are live: active filter chips in
`CasesWorkspace.tsx:241` and `SubRental.tsx:614` hardcode `color: '#ffffff'` where the
system says `var(--on-primary)`. Harmless today; drifts the moment the light theme's
primary changes.

### 11. Sparse live-region coverage
Only 9 `aria-live` sites app-wide. Toasts carry `role="status"` (good), but they render
below overlays (finding 3), and long async operations that update in place (packing
progress, reconciliation) won't announce. Low urgency; note it for the next a11y pass.

---

## What is genuinely good (keep doing this)

- **Contrast**: 38/38 token pairs pass AA on both themes via the repo's own gate —
  including the 3:1 UI-line checks. Seven values were measurably moved to pass; that
  discipline shows.
- Global `:focus-visible` ring (`theme.css:697`) and a real
  `prefers-reduced-motion` kill switch (`theme.css:801`).
- `aria-current="page"` on both Sidebar and BottomBar; safe-area inset handling on the
  phone bar; charts carry `role="img"` + labels.
- The five-state page pattern (`StateViews.tsx`) and the honest `Placeholder` — no
  fake-finished screens.
- `Unavailable.tsx`'s long-press reason on touch devices is better disabled-state UX
  than most commercial apps ship.
- `TouchTarget` as a primitive, and responsive.css as the single home for media
  queries, are the right architecture — the P0/P1 items above are mostly about the
  oldest primitives not yet catching up to the standards the newer ones set.

## Suggested order of attack
1. Toast → `--z-system` (one line, ends invisible confirmations)
2. Modal focus contract + `TouchTarget` on close + scroll-lock counter (one file)
3. Select keyboard/ARIA (one file, 10 screens improve)
4. Archive the eight dead-Tailwind components
5. Supersede `DESIGN.md`; sweep z-index literals onto tokens as screens are touched
