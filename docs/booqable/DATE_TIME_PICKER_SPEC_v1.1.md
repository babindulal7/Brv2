# DATE & TIME PICKERS — INTERACTION SPEC v1.1

**For:** Babin Rentals OS · **Source:** live Booqable admin, 31 Aug 2026, read-only probes (filter range picker opened · booking From-date picker opened · booking time dropdown opened — nothing selected, #906 verified unchanged)
**Companion to:** RAIL_AND_QUICK_ACTIONS_SPEC v1.0 · BOOQABLE_REFERENCE_SPEC v2.5

> ## ⛔ AMENDED 7 Sep 2026 — there is only one picker, and it is already built
>
> Reviewed 5 Sep. **§1–§3 (what Booqable does) hold**, and §4.2's refusal of write-on-select
> in favour of a pending state plus Apply is the right call for a touch bench.
>
> **Do not build `src/components/ui/DatePicker/`.** Since 4 Sep the repo has exactly one
> ruled picker — **`components/ui/DateField.tsx`** (BS above AD, commits on `focusout`),
> imported in 14 files (20 mention the name; the barrel re-exports it). The three "variants" in §4 are props and modes on DateField, not a
> new family. `periodRange` is a six-case helper in `src/data/today.ts`, not a `lib/` engine;
> the preset work in §4.1 is *extending it*, and the fiscal helpers already exist in
> `data/pulse.ts`. Availability colouring (§4.2) has **no data to colour from** — live carries 0
> `inventory_reservations` and 0 `product_units`, and the bridge's `mapAvailabilities` is a
> deliberate no-op (its `plannings` sibling does map). The *engine* half now exists —
> `capacityFor` (`lib/availability.ts:734`, added 7 Sep for the quantity-tracked catalogue) — so
> ship day-grain uncoloured until reservations exist, then colour from that. Never guess green.
>
> Law numbers were off by one (width is **14**, AD-in-UTC is **7**, 44×44 is **15**); fixed below.

Booqable runs **two different date tools for two different jobs**, and the distinction is the spec:

---

## 1. THE FILTER RANGE PICKER (rails, reports) — [observed]

Opens as a popover anchored under the `All time` trigger. Two panes:

**Left — a preset rail, 13 entries in four groups:**
```
All time
Today · Yesterday · Tomorrow
This week · Last week · Next week
This month · Last month · Next month
This year · Last year · Next year
```
**The forward presets are the tell.** `Tomorrow / Next week / Next month / Next year` exist because a rental business queries the future as often as the past. Most admin date pickers only look back; this one is calibrated to the trade. Keep all thirteen.

**Right — one month calendar** (`August 2026`, `‹ ›` steppers) + `From` / `Until` `Select…` dropdowns beneath.
- Week starts **Sunday** — honouring Settings ▸ General ▸ Regional (first day of week). The picker obeys the org setting; it is not hard-coded.
- Today (31) is marked by underline — not colour alone.
- Esc closes; trigger shows the chosen preset's name as its label afterwards (`All time`, `This week 30-08 → 05-09`).

## 2. THE BOOKING PERIOD PICKER (Booking Detail From/Until) — the flagship [observed]

The From/Until fields are inline (date + time as separate controls, no modal). Clicking the date opens a single-month popover where **every day is an availability verdict for THIS booking's items**:

- **Green circle** = all items available that day
- **Red circle** = not available (Sept 1 was red for #906's lens)
- **Ring** = the currently selected span (2 → 3 ringed)

The operator sees the conflict **before** choosing — availability is fused into the choice, not checked after it. This is the single best interaction in the product.

**The time control** opens a scrollable dropdown of **15-minute slots** (`05:15 · 05:30 · 05:45 · 06:00 · 06:15 …`) — the Settings ▸ Rental period ▸ Time intervals value made real — and **each slot carries its own availability dot**: red before `06:00`, green from `06:00` (operating hours + availability, down to the slot). Current value highlighted.

**Commit model [observed structurally, not exercised]:** selection writes immediately — no Save step on the fields. §10.4 already flagged the hazard.

## 3. WHERE BOOQABLE IS HEADING — the "new period picker" (Settings preview) — [observed as preview]

Start/End fields with **typeable dates and times**, dual-month calendar, and an explicit three-state legend: `Available · Available part of the day · Unavailable` (the part-day state our buffer windows will produce constantly). Off by default; per-account opt-in toggle. Their target state validates our direction: typeable + dual-month + tri-state availability.

---

## 4. OUR SPEC — one picker family, three variants

All variants share one calendar core (`src/components/ui/DatePicker/`), fed by `periodRange`, `lib/bs`, and the availability source. No variant computes anything (Law 1).

### 4.1 `<RangePicker>` — rails and reports
- Popover ≥768px, **full-screen sheet <768** (Law 14), anchored under its trigger; Esc / outside-click closes; trigger label becomes the preset name or the formatted span.
- Preset rail: the thirteen, verbatim, **plus two of ours**: `This fiscal year` and `Last fiscal year` (Shrawan-anchored — the BS fiscal calendar is why the date engine exists), and `Next 7 days` (the Dashboard/operations scope).
- Presets compute through `periodRange` — the same engine as every panel scope button, so a rail filter and a Dashboard panel can never disagree about what "This week" means.
- Two-date sections in rails each get their own RangePicker bound to a named column (§14.5).

### 4.2 `<PeriodPicker>` — booking create/edit
- Inline date + time fields, per Booking Detail's layout (§10.1). Date opens the availability calendar; time opens the slot list.
- **Availability colouring is tri-state** (adopting the new-picker legend, not the old binary): available / part-day / unavailable — part-day is what a buffer (§13.1) or same-day return produces. Colour **plus** an underline/hatch difference and a legend row (Law 11 — never colour alone), and a tooltip naming the blocker on hover/long-press: *"Unavailable: on #905 until 07-09"* — the §10.3 explain-yourself rule applied to days.
- **Availability source honesty:** during the bridge, day/slot verdicts come from the Booqable-fed availability (the §10.6 GAP). When the source is absent, days render **uncoloured** — a neutral calendar — never guessed green. A wrong green is a double-booking; no colour is just a calendar.
- **Commit model — ours differs [ruled]:** date/time selection updates a pending state and shows an inline `Apply` on the card (with the recomputed price delta when money-visible); nothing writes on a stray tap. Touch benches mis-tap; Booqable's write-on-select is refused.

### 4.3 `<TimeSelect>`
- Slot list at the org's interval setting (default 15 min), scrolled to the current value, **anchored on `operationalDayStart`** — the day's slots run 06:00 → 06:00, so 05:45 sorts at the END of the day, not before its start. (Booqable renders 05:15 above 06:00 — calendar-day thinking; ours is operational-day thinking, per D4.)
- Slots outside operating hours render disabled **with the reason** ("before opening — 06:00"), not hidden: hiding makes the 05:00 airport pickup look impossible instead of exceptional; an Admin override per the channel-scoping rule (§21.7 Apply-to-manual + per-role override).
- Each slot carries the availability dot where the source exists; dot + text state, not dot alone.

### 4.4 THE BS REQUIREMENT (Law 7 — ours alone, no Booqable counterpart)
- **v1.1 correction, from the live app:** the OS already renders **BS above AD everywhere** (Booking Detail: "7 Shrawan 2083 BS / 22 Jul 2026, 11:30 AM"; the app footer states the convention). The calendar follows the app, not v1.0's AD-primary draft: every cell renders the **BS day numeral prominent** with the AD numeral beneath, small; the month header renders both (`भदौ २०८३ · Aug–Sep 2026`), driven by `lib/bs` (the fixed anchor — see the date-engine file before touching).
- Storage and arithmetic stay AD/UTC everywhere; BS is render-only. Presets are computed in AD and *labelled* bilingually where the label is a month name.
- Dashain/Tihar (Away-mode date ranges, F1) render as a marked band in every calendar — the block visible at choose-time, same philosophy as availability colouring.

### 4.5 Accessibility & touch
- Calendar cells ≥44×44 on touch (Law 15); arrow-key day navigation, PgUp/PgDn months, Enter selects, Esc closes; `aria-selected`, `role=grid`.
- The legend row is always rendered under the calendar when any colouring is active.

## 5. OPEN DECISIONS
1. **Slot interval setting** — adopt 15 min as default? (Booqable's live value; our bookings are day-grained today, so intervals matter only for the odd-hours exception.)
2. **BS-primary mode** — a per-user toggle rendering BS large / AD small (crew comfort) vs fixed AD-primary. Render-only either way; zero storage impact.
3. **Part-day verdict source** — needs per-slot availability, which the bridge may not feed; acceptable to ship day-grain verdicts first and add slot-grain when local availability exists.
