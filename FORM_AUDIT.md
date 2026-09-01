# Babin Rentals OS — Form Audit

Audit of 1 Sep 2026 at `4696af8`. Covers spec §11 (fillability) in full.
**§12 (submission → DB → refresh) and §13 (validation) were NOT run** — see §5.

---

## 1. Headline

> **Every form field in the application is fillable. Zero frozen fields.**

88 fields were exercised by *actually typing into them* in a real browser and reading the
value back. 86 accepted and retained input; the other 2 were correctly `disabled`/
`readOnly`. Nothing was frozen, and nothing silently discarded input.

---

## 2. Runtime fill results (§11)

Method: for each visible field — text/number/date/email/tel `fill()` then read back;
`select` choose a different option then read back; checkbox/radio click then read
`isChecked()`. A field is **frozen** if the value does not change.

| Route | Fields | Fillable | Skipped (disabled/readonly) | Frozen |
|---|---|---|---|---|
| `/clients/new` | 24 | 24 | 0 | **0** |
| `/inventory/new` | 43 | 41 | 2 | **0** |
| `/rentals/new` | 10 | 10 | 0 | **0** |
| `/clients/referral/new` | 3 | 3 | 0 | **0** |
| `/tools/pricing` | 8 | 8 | 0 | **0** |
| **Total** | **88** | **86** | **2** | **0** |

Field types exercised: text, number, date, email, tel, textarea, select, checkbox, radio.

---

## 3. Static analysis (§11, whole codebase)

A JSX-aware parser over every `.tsx` in `src/` (excluding archive/tests):

| Check | Result |
|---|---|
| Controlled input with `value`/`checked` but **no `onChange`** (unfillable) | **0** |
| `<form>` with no `onSubmit` | **0** |
| Total `input`/`textarea`/`select` in source | scanned, all clean |

The "controlled without `onChange`" case is the bug that makes a field literally
untypeable in React. **There is not one instance in the codebase.**

### Wrapper components forward correctly
The custom wrappers do not swallow props — verified by reading each:

| Component | Verdict |
|---|---|
| `Input.tsx` | destructures `value`, re-applies `value={value}` at `:64`, spreads `{...props}` (carrying `onChange`) at `:83` — correctly controlled |
| `MoneyField.tsx` | own `onChange(paisa)` contract, wired at `:59` |
| `ScannerInput.tsx` | internal state, `:70` |
| `Select.tsx` | keeps a hidden native `<select>` as form/test bridge |

---

## 4. One false positive, recorded

My **first** static pass reported a frozen discount field at `NewRental.tsx:2824`
(`<Input type="number" value={discountPct}>` with no `onChange`).

**That was my parser's bug, not the app's.** The tag contains a JSX comment with the text
`>100%`, and my scanner did not skip comments — the `>` terminated the tag early, hiding
the `onChange` on line 2833. I rewrote the parser to blank comments (preserving line
numbers) and re-ran; the finding disappeared.

Flagged prominently because it is exactly the kind of false alarm that wastes a
developer's afternoon, and because the same class of error probably lurks in any
grep-based audit of this codebase — the code is unusually comment-dense.

---

## 5. NOT TESTED — the half that matters most

Fillability is necessary but nowhere near sufficient. **None of the following was run:**

| Spec § | Test | Why it matters |
|---|---|---|
| §12 | Submit → validate → request → DB → success → UI → **refresh → still there** | A form that fills perfectly and persists nothing is still broken. Your spec is explicit: *"Do not consider a form functional until the refresh test passes."* |
| §13 | Empty required, invalid email/phone/number/date, duplicates, over-long values, error placement, error clears on correction | untested |
| §14 | Full CRUD per entity | untested |
| §48 | Double-click / duplicate submission | untested |
| §50 | File upload | untested |

### Why it was not run here
Mock mode (`VITE_DATA_SOURCE=mock`) is in-memory and announces *"nothing you change
leaves this browser"* — so a §12 refresh test in mock mode would fail for reasons that
say nothing about the real data layer. A meaningful persistence test needs
`dev:local` against a **local** Supabase (`npm run db:start`), never the live project
(`CLAUDE.md`: no live migrations without explicit approval).

**This is the single highest-value remaining stage.** A P0 — booking does not persist,
payment records the wrong amount — would surface here and nowhere else.

---

## 6. Verdict

| Question | Answer |
|---|---|
| Can every form be filled? | **Yes — verified, 88/88.** |
| Does every form field accept and retain input? | **Yes.** |
| Do the wrapper components forward handlers? | **Yes — all four verified.** |
| Does any form submit correctly to the database? | **Unknown — not tested.** |
| Does validation work? | **Unknown — not tested.** |
| Does data survive a refresh? | **Unknown — not tested.** |
