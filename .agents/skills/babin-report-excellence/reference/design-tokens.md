# Design Tokens — single source of truth

Every color, size, space, and radius in a report comes from a **semantic token** here.
Token *names* never change between surfaces; their *values* flip: dark for the OS view, light for the export. Never write a raw hex into a report — that is what makes the two surfaces drift.

## Contents
- Primitives (raw brand values)
- Semantic tokens — dark (OS) and light (export)
- Status-color law
- Typography
- Spacing, radii, elevation

## 1. Primitives (raw values — do not use directly in output)
```
--gold-500      #D9A83C   /* brand / revenue accent */
--blue-500      #2F7DFF   /* primary / commercial */
--navy-900      #050B12   /* app background */
--navy-850      #02060B   /* deepest */
--navy-800      #0B1622   /* card */
--navy-780      #0D1A29   /* card raised */
--navy-760      #081522   /* inset */
--teal-400      #2FD4C4   /* movement/logistics */
--green-400     #2ECC8F   /* success */
--orange-400    #FF9F43   /* attention */
--red-400       #FF6B6B   /* critical */
--violet-400    #8B5CF6   /* return/recovery */
--yellow-400    #F5C518   /* preparation */
--gray-400      #8A94A6   /* inactive */
--text-100      #EAF2FA   /* brightest text */
--text-500      #5A6776   /* faintest text */
```

## 2. Semantic tokens

### Dark — OS view (`:root`)
```
--surface-base      #050B12
--surface-sunken    #02060B
--surface-card      #0B1622
--surface-raised    #0D1A29
--surface-inset     #081522
--border-subtle     rgba(255,255,255,.08)
--border-strong     rgba(255,255,255,.16)
--text-primary      #EAF2FA
--text-secondary    #AEBACA
--text-muted        #5A6776
--accent            #2F7DFF
--accent-brand      #D9A83C
```

### Light — export (`.export`, and `@media print`)
```
--surface-base      #FFFFFF
--surface-sunken    #F4F6F9
--surface-card      #FFFFFF
--surface-raised    #FAFBFC
--surface-inset     #F0F3F7
--border-subtle     #E3E8EF
--border-strong     #C7D0DB
--text-primary      #12202E   /* near-black, not #000 — avoids halation */
--text-secondary    #3A4A5C
--text-muted        #6B7889
--accent            #1F5FD0   /* darkened blue keeps 4.5:1 on white */
--accent-brand      #9A7620   /* darkened gold keeps 4.5:1 on white */
```
Rule: text-on-surface never uses pure #000 or #FFF. Accents are darkened on the light theme so text/icons on white still clear AA. Regenerate this block with `scripts/build_light_variant.py` — don't hand-edit it out of sync.

## 3. Status-color law (LOCKED — matches the OS)
Each status = a color **and** an icon **and** a label. Never color alone.
```
--status-inactive   #8A94A6  gray     Draft, Archived, Retired, Locked
--status-commercial #2F7DFF  blue     Quote, Reserved, Booked, Deposit
--status-prep       #F5C518  yellow   Packing, Prep, Kit Assembly, Verification
--status-move       #2FD4C4  teal     In Transit, Out for Delivery, Courier
--status-success    #2ECC8F  green    Available, On Rent, Paid, Completed
--status-return     #8B5CF6  violet   Return, Cleaning, Charging, Inspection, Reset
--status-attention  #FF9F43  orange   Due Soon, Delayed, Not Reset, Pending Approval, Low Stock
--status-critical   #FF6B6B  red      Overdue, Damaged, Missing, Maintenance
--status-external   #D9A83C  gold-outline  Sub-rental, Partner Equipment
```
Escalation reads yellow (in progress) → orange (needs attention) → red (problem).
On the light export, render each status pill as a soft tint of its hue with a darkened text/label so it still clears AA (see export-portability.md).

Delta/trend colors: green = good, red = bad **by default**; invert for metrics where lower is better (turnaround time, cost per rental, overdue days) — see kpi-cards.md.

## 4. Typography
```
--font-ui    "Outfit", system-ui, sans-serif      /* all prose, headings, labels */
--font-mono  "JetBrains Mono", ui-monospace, monospace  /* numbers, money, IDs, serials, dates */
```
Scale (size / line-height, px):
```
H1  32/44  700
H2  20/28  600
H3  16/22  600
Body 14/20 400
Meta 12/16 500
Table 13/18 400 (numbers in --font-mono)
```
Rule: any figure a reader might compare or verify is set in `--font-mono`. Prose is never mono.

## 5. Spacing, radii, elevation
- **Spacing: 8pt grid** — 4, 8, 12, 16, 24, 32, 48 (a 4px half-step is allowed, nothing off-grid).
- **Radii:** card/panel 14px; small controls 10px; pills/badges 999px.
- **Elevation on dark** comes from surface tiers (base → card → raised), not drop shadows. On the light export, a 1px `--border-subtle` defines cards instead.
