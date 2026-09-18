# Design System: Babin Rentals OS

## 1. Visual Theme & Atmosphere
A high-agency, clinical cinema and broadcast equipment rental operating system built for high-stakes rental counters, prep bays, and warehouse floors. The visual language balances high-density data density with an art-directed, calm studio aesthetic.

- **Atmosphere:** Clinical Studio Precision — restrained cool-slate and navy surfaces with a single high-contrast cobalt blue accent, strict typographic hierarchy, and zero decorative fluff.
- **Density:** 7 (Operational Workhorse — 44px minimum hit targets, compact metadata lines, 14px UI text, and monospace figure values for financial and asset data).
- **Variance:** 6 (Asymmetric operational headers, docked summary rails, split detail drawers, and horizontal filter chip strips).
- **Motion Intensity:** 5 (Smooth spring-physics easing via `cubic-bezier(0.16, 1, 0.3, 1)`, rapid 120–220ms state transitions, hardware-accelerated drawer slides, and absolute zero cartoon bounce).

---

## 2. Color Palette & Roles

### Light Theme (Default Canvas)
- **Canvas Cool Background** (`#f5f7fb`) — Primary app background surface
- **Pure Surface** (`#ffffff`) — Elevated cards, table bodies, modal surfaces, and sidebars
- **Secondary Surface** (`#edf3fa`) — Recessed panels, table headers, and stepper backgrounds
- **Ink Primary** (`#10203b`) — Primary text, headings, and high-emphasis labels
- **Ink Secondary** (`#52647d`) — Secondary descriptions, table subheadings, and metadata
- **Muted Slate** (`#6d7e95`) — Form helper text, inactive timestamps, and disabled placeholders
- **Hairline Border** (`#dbe5f0`) — Standard 1px card outlines, table borders, and divider lines
- **Subtle Border** (`#e7eef6`) — Internal panel dividers and subtle grid lines

### Dark Theme (OLED / Cinema Studio Mode)
- **Canvas Deep Navy** (`#07111c`) — Primary dark background surface (never pure black)
- **Elevated Navy Surface** (`#0b1622`) — Dark card containers, sidebars, and base tables
- **Secondary Navy Surface** (`#101e2d`) — Table headers, recessed inputs, and modal backgrounds
- **Ink Light** (`#f0f4fa`) — Primary titles, line items, and active figures
- **Ink Light Muted** (`#b3c2d7`) — Secondary text and descriptions
- **Muted Steel** (`#9aaec5`) — Table headers, placeholders, and inactive labels
- **Dark Border** (`#263849`) — 1px container and table dividers
- **Dark Border Subtle** (`#1d3042`) — Internal row dividers

### Functional Brand & Accent (Single Singular Accent, <80% Saturation)
- **Cobalt Blue Accent** (`#2456d6` light / `#386af7` dark) — Primary CTAs, active tab accents, focus rings, and active navigation states.
- **On-Accent Ink** (`#ffffff`) — Text and icons on primary action buttons.
- **Accent Soft Wash** (`#e7efff` light / `#102b48` dark) — Active sidebar items and highlighted filters.

### Semantic Status Palette (Strict 7 Solid Blocks — Law 11: Color + Icon + Label)
- **Booked / Reserved** (`#2456d6` light / `#386af7` dark) — Primary status, solid block, check icon
- **Packed / Ready** (`#e3b117` light / `#edbe2a` dark) — Yellow/amber, box icon, dark ink (`#231a05`)
- **On Rent / Picked Up** (`#d96518` light / `#e8762d` dark) — Orange, truck icon, dark ink (`#231a05`)
- **Returned / Available** (`#1e864a` light / `#1e864a` dark) — Green, return arrow icon, white ink
- **Overdue / Damaged / Blocked** (`#c73a3a` light / `#c73a3a` dark) — Crimson, alert icon, white ink
- **Draft / Quote** (`#72757e` light / `#3a3e47` dark) — Neutral gray, file icon, white/light ink
- **Closed / Void** (`#24262c`) — Dim gray, lock icon, muted ink
- **External / Sub-Rented Gear** (`#386af7` line with `#85b2ff` ink) — The ONLY outline mark on screen; pairs with `external_link` icon

---

## 3. Typography Rules

- **Display & Headlines:** `Outfit` (fallback: `system-ui, sans-serif`) — Track-tight (`letter-spacing: -0.015em`), weight 600–700, controlled scale.
- **UI & Body:** `Source Sans 3` (fallback: `system-ui, -apple-system, sans-serif`) — Relaxed leading (1.5), 14px–16px baseline, maximum 65ch line length for descriptions.
- **Monospace Financials & Identifiers:** `JetBrains Mono Variable` (fallback: `JetBrains Mono, SF Mono, monospace`) — For all currency figures (`Rs 45,000`), document numbers (`Draft #1052`, `BK-2026`), barcode serials, dates, and timestamps.
- **Banned:** `Inter` is banned in dashboard contexts. Generic serifs (`Times New Roman`, `Georgia`, `Garamond`) are banned. All font scaling uses fluid `rem` units anchored to `--t-body: 1rem`.

---

## 4. Component Stylings

- **Buttons:**
  - Shape: 8px border-radius (`--r-btn`), 44px minimum height (`--tap`).
  - Active Behavior: Tactile `-1px` push feedback (`transform: translateY(1px)`).
  - Primary: Cobalt blue background (`var(--brand)`), white ink, no glow or neon halo.
  - Secondary: Flat white/navy surface with 1px border (`var(--border)`).
  - Disabled: Genuinely disabled with explicit explanation tooltip (e.g. Export disabled with reason).
- **Cards & Panels:**
  - Radius: 10px–14px (`--r-card`).
  - Elevation: Soft layered shadow (`--shadow-card`), zero harsh drop-shadows.
  - Glass: Subtle backdrop blur (`backdrop-filter: blur(14px)`) at ≥0.85 opacity floor on floating drawers and modal panels. Tables remain 100% solid.
- **Inputs & Form Controls:**
  - Structure: Label strictly top-aligned, helper text muted, inline errors below in danger red.
  - Dimensions: 44px minimum height (`--control-height`).
  - Steppers & Chips: Enclosed 44px hit-target (`.tap` or `TouchInset`) preventing target overlap.
  - Focus Ring: Clean 2px solid accent ring (`var(--brand)`), zero blurry neon bloom.
- **Status Badges & Tags:**
  - Solid blocks with rounded 6px corners (`--r-chip`), bold 600 weight, paired with an icon on the left (Law 11).
  - Soft-tint chips reserved for non-status categories (customer tiers, equipment categories, date filters).
- **Skeletal Loaders:**
  - Match exact container layout dimensions (card, table row, form input) with muted shimmer animation. Generic spinning circles are strictly banned.
- **Empty States:**
  - Illustrated composition detailing the empty condition and providing a direct action button (e.g. "Create New Rental").

---

## 5. Layout & Responsive Principles

- **Grid-First Architecture:** CSS Grid is preferred over fragile flexbox percentage math.
- **3-Tier Viewport Adaptability:**
  - **Desktop (≥1280px):** Multi-column operational layout with sticky page headers, filter rails, pinned action columns, and right-hand financial summary rails.
  - **Tablet (768px–1279px):** Reflowed filter panel as collapsible drawer, compact table columns (`Booking │ Client │ Dates │ Status │ Actions`), and horizontal scrolling filter chips.
  - **Phone (<768px):** Clean single-column collapse. Tables convert into high-density operational cards with full status, date badges, and one primary tap action.
- **No Mobile Horizontal Spill:** Root viewports strictly enforce `overflow-x: hidden` with zero horizontal overflow on mobile viewports.
- **Strict Touch Geometry:** Every interactive element has an active hit area of at least 44×44px (`--tap: 44px`).

---

## 6. Motion & Micro-Interactions

- **Signature Easing Curve:** `cubic-bezier(0.16, 1, 0.3, 1)` applied app-wide via `--ease`.
- **Duration Scale:**
  - Fast micro-interactions (hover, active tap): 120ms (`--dur-fast`).
  - Standard component transitions (tabs, toggles, badge updates): 180ms (`--dur`).
  - Overlay slide/drawers: 200–220ms (`--dur-drawer`).
- **Hardware Acceleration:** Transitions restricted strictly to `transform` and `opacity`. Width, height, top, and left animations are banned.
- **Reduced Motion:** Full graceful degradation under `@media (prefers-reduced-motion: reduce)` — all transitions clamp to `0s`.

---

## 7. Anti-Patterns (Strictly Banned)

- ❌ **No emojis in operational UI or labels:** Emojis are unprofessional in enterprise equipment management. Use curated SVG icons (`Icon.tsx`) with semantic names.
- ❌ **No `Inter` font:** Replaced with distinctive, legible `Source Sans 3` for UI and `Outfit` for display.
- ❌ **No pure black (`#000000`):** Use deep rich navy (`#07111c` / `#0b1622`) for dark surfaces.
- ❌ **No neon glows or purple AI accents:** Electric cyan and purple glow halos are banned. Single controlled Cobalt Blue (`#2456d6` / `#386af7`) only.
- ❌ **No color-alone indicators (Law 11):** Every status must display color + icon + text label. Never indicate status through a colored dot alone.
- ❌ **No fake success toasts:** Never display "Saved" or "Success" before the database mutation actually completes.
- ❌ **No generic 3-card marketing rows:** Use purposeful Bento grids or asymmetric split operational panels.
- ❌ **No AI copywriting slop:** Words like "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize" are forbidden. Use direct, clear verbs: "Book", "Confirm", "Pack", "Hand Over", "Return", "Inspect".
- ❌ **No filler UI elements:** "Scroll to explore", bouncing down-arrows, or decorative floating badges are banned.
