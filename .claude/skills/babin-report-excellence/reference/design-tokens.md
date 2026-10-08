# Design tokens — CORRECTED 8 Aug 2026

> ## ⛔ This file replaces the skill's original `design-tokens.md`.
>
> The original declared a **nine-hue** status palette and labelled it
> *"LOCKED — matches the OS."* It does not match the OS. It listed
> `--teal-400 #2FD4C4`, `--violet-400 #8B5CF6`, `--orange-400 #FF9F43` and
> `--yellow-400 #F5C518` as status primitives.
>
> This app **removed those hues deliberately** and then *measured* the result:
> commit `15210f6` fixed two dark-theme contrast failures found only by
> measurement (`--progress` at 1.7:1 and `--success` at 2.28:1 against the 3:1
> WCAG non-text minimum) by adding `--on-brand` / `--on-progress` / `--on-success`.
>
> Emitting the original palette would reintroduce banned hues *and* discard that
> verified accessibility work. The original is kept at
> `design-tokens.ORIGINAL.md` so its reasoning stays readable.

---

## 1 · There are no primitives in this skill

**Do not declare a hex anywhere.** `src/styles/theme.css` is the only place a
colour value may exist, because it is the only file that defines both themes
together. A report that hardcodes a hex renders correctly in one theme and
wrongly in the other — exactly the drift this skill exists to prevent.

Reports consume **CSS variables** and inherit light/dark for free.

## 2 · Status colours — the seven plus gold

**Updated 25 Aug 2026 to DESIGN_DIRECTION_SPEC_v4.1.** This section previously
described "the five plus gold" and told you to separate On Rent from Returned
by *fill weight* within one green. That is no longer true and would now be a
meaning error, not a style one: **On Rent is ORANGE and Returned is GREEN.**

Seven hues, one meaning each. A hue never means two things.

| Meaning | Token | On-colour |
|---|---|---|
| Committed · scheduled — Booked, Reserved, Issued | `var(--primary)` | `var(--on-primary)` |
| Being worked in-house · waiting — Packed, Due Soon, Partial, Cleaning, Maintenance | `var(--ready)` | `var(--on-ready)` — **dark ink** |
| Home & settled — **Returned**, Available, Paid | `var(--success)` | `var(--on-success)` |
| **Out with the client — On Rent, Picked Up, Partial Pickup** | `var(--warn)` | `var(--on-warn)` — **dark ink** |
| Problem · money owed · decide now — Overdue, Damaged, Unpaid, Blocked | `var(--danger)` | `var(--on-danger)` |
| Not started yet — Quote, Draft | `var(--neutral)` | `var(--on-neutral)` |
| Finished · inactive — Closed, Void, Retired | `var(--dim)` | `var(--on-dim)` |
| External / sub-rented gear | gold `var(--ext-fg)` / `var(--ext-line)`, **outline only** | never a fill, never a button |

**Every status is a SOLID block** — radius `var(--r-chip)`, weight 800,
uppercase, 0.04em tracking, and the word always inside (never colour alone).
Gold is the ONLY outline on screen, which is why it can never be mistaken for
a yellow status.

**Orange and yellow are status hues only — never a button.** Buttons stay
quiet so the statuses stay loud: one `var(--primary)` primary per view.

**Text on a coloured fill** always uses that hue's own on-colour from the table
above, never `#fff` and never a guess. This matters more under v4.1 than it
did before: yellow and orange **cannot carry white ink** — measured, light-theme
white-on-orange is 3.61:1 — so both take dark ink in both themes. Run
`npm run check:contrast` after any palette change; it is a release blocker.

The money picture is a traffic light: green settled · yellow some in · red
nothing in. Client: Active green · Deactivated dim · Blocked red.

Purple is **gone**. `--st-purple-*` was deleted in the v4.1 repaint along with
the legacy `--warning`/`--blue` aliases — do not reach for any of them. Note
that v4.1's `--warn` (orange, "out with the client") is **not** the old
`--warning` (amber caution); legacy caution meanings map to `var(--ready)`.

## 3 · Type

| Role | Token |
|---|---|
| Headings, KPI figures | `var(--font-display)` (Outfit) |
| Body, tables | `var(--font-body)` (Source Sans 3) |
| **Every numeral, ID, serial, money figure** | `var(--font-id)` (JetBrains Mono) |

Sizes: `--fs-display` `--fs-h1` `--fs-h2` `--fs-h3` `--fs-h4` `--fs-title`
`--fs-body` `--fs-small` `--fs-caption`. The scale is fluid — never a fixed px.

`scripts/lint_report.py` flags numerals not set in the mono face. That rule
stands: `1`, `l` and `7` must be distinguishable on a warehouse label.

## 4 · Spacing and surfaces

Spacing: `--sp-xs` `--sp-sm` `--sp-md` `--sp-lg` `--sp-xl` — an 8pt grid.
Surfaces: `var(--app)` page, `var(--card)` card, `var(--border)` edge,
`var(--divider)` internal rule. Text: `--text-1` primary, `--text-2` secondary,
`--text-3` faint.

## 5 · Money and dates — not styling, correctness

- Money renders through `lib/money`'s `formatMoney`: **`Rs` on the value**, lakh
  grouping (`Rs 1,85,000`, never `Rs 185,000`), Latin digits in both languages.
- Dates render through `lib/bs`: **BS above AD**, and nothing stores or hardcodes
  a converted BS date — `Date Engine` is the only converter.
- PAN is **623587106**. The renders show `609876543`; the renders are wrong.

## 6 · Delta direction — where to invert

An arrow is not a verdict. `Kpi.delta` carries `good?: boolean`, and it must be
set wherever *up is bad*: collection-cycle days, turnaround time, uncollected
receivables, maintenance ratio, overdue count.

The skill's own `families/operations.md` says to invert these — and the shipped
Working Capital design did not, rendering a 3-day-slower cash cycle in the same
positive tone as a revenue rise. Set `good: false` and the arrow still points up
while the tone reads as the warning it is.
