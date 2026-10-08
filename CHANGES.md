# UX Fixes — 28 Aug 2026

Implements UI_UX_AUDIT_2026-08-28 (included). Drop these files over the repo
root, or `git apply ux-fixes.patch`.

## Verified before shipping
- `tsc --noEmit`: **111 errors before, the identical 111 after** — zero new.
  (Note: the uploaded tree does not match the README's "tsc exit 0"; the 111
  match `tsc_errors2.txt`, so this predates these changes.)
- `vitest run`: **2,174 / 2,174 pass, 88 files** — full suite, after changes.
- `scripts/check-contrast.cjs`: still 38/38 (no color values changed except
  two literals → their exact token equivalents).

## What changed

### `src/components/ui/Modal.tsx` — the dialog finally honors the dialog contract
- **Focus in / trap / restore** (audit §1): opening moves focus to the first
  control (surface fallback via `tabIndex={-1}`), Tab cycles inside, closing
  returns focus to the opener. Same pattern FilterDrawer already used.
- **`aria-labelledby`** wired to the title.
- **Escape closes only the top of the stack** (§7 + latent bug): a
  module-level stack replaces per-instance window listeners that closed every
  layered modal at once.
- **Scroll-lock refcount** (§6): closing a ConfirmDialog stacked over another
  modal no longer unlocks page scroll behind the survivor.
- **44px close target** (§5): `<TouchTarget />` inside the close button —
  paint unchanged, hit area now meets Law 15.
- **`--z-modal` adopted** (§3): dialogs now paint above the literal-1000
  dropdowns that previously covered them.

### `src/components/ui/Toast.tsx`
- **`--z-system` adopted** (§3): confirmations no longer vanish behind
  Calendar full view (200), floor dropdowns (1000), or BranchesWarehouses
  (9000). One line; ends the worst symptom.

### `src/components/ui/Select.tsx` — select-only combobox, rebuilt
- Full keyboard support (§2): Arrow/Home/End move an active-descendant
  highlight, Enter/Space commit, Tab closes, single-char typeahead jumps by
  label. **Escape closes the popup and stops propagation** so it no longer
  falls through to the surrounding modal (§7).
- Real ARIA: `role="combobox"` + `aria-expanded/haspopup/controls/
  activedescendant`, `role="listbox"`/`role="option"` popup, `aria-invalid`
  on error.
- The label now targets the visible trigger, not the invisible native select;
  the native select is `tabIndex={-1}` + `aria-hidden` — keyboard users can no
  longer land on a 0×0 element.
- Removed the inline `outline: 'none'` that was suppressing the global
  `:focus-visible` ring on the trigger.
- **Unchanged on purpose:** the hidden native `<select>` keeps its id,
  options, and change dispatch — the seven tests that drive it via
  `querySelectorAll('select')` and any form submission behave exactly as
  before. Prop API untouched; all ten consumers compile as-is.

### `src/components/ui/index.ts`
- Stopped exporting the seven dead-Tailwind components (§4) — GateChecklist,
  MoneyField, BsAdDate, ScannerInput, QuantityChip, EvidenceThumbnail,
  ReconciliationAssertion. Files stay on disk (and BsAdDate's test still
  passes); the barrel just no longer advertises controls that render
  unstyled. Comment in the file explains the rewrite path.

### `src/modules/operations/CasesWorkspace.tsx`, `SubRental.tsx`
- Active filter chips: literal `#ffffff` → `var(--on-primary)` (§10).

### `src/modules/Placeholder.tsx`
- End-user copy no longer cites `SCREENS.md` (§9); still honest, now in the
  user's vocabulary.

### `DESIGN.md`
- Superseded banner pointing at `docs/DESIGN_DIRECTION_SPEC_v4.1.md` (§8);
  body kept intact under Law 3.

## Not done here (needs a wider pass)
- The remaining ~70 z-index literals (sweep onto the token scale as screens
  are touched; the two worst offenders — toasts and modals — are fixed).
- Rewriting the seven parked Tailwind components onto the token system.
- `aria-live` coverage for in-place async updates (audit §11).
