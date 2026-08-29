> ## SUPERSEDED — do not style from this file
> This document describes the pre-v4.1 direction (Electric Cyan `#0EA5E9`, zinc
> surfaces, Cabinet Grotesk) that no longer ships. The live design system is
> **`docs/DESIGN_DIRECTION_SPEC_v4.1.md`** (blue `#386AF7`, the measured
> seven-hue palette) as transcribed into `src/styles/theme.css` — theme.css's
> own header names v4.1 as the authority. Kept for history under Law 3
> (nothing is deleted). Flagged by UI_UX_AUDIT_2026-08-28 §8: this file sat at
> repo root with the authoritative filename while contradicting every shipped
> color and typeface.

# Design System: Babin Rentals OS

## 1. Visual Theme & Atmosphere
A clinical, high-agency cinema and broadcast equipment management operating system. The interface balances high-density operational clarity with an art-directed studio atmosphere. 
- **Atmosphere:** Clinical Studio Precision — restrained dark zinc surfaces with electric cyan accents and sharp typographic hierarchy.
- **Density:** 7 (Daily App Operational Density — compact metadata, 14px body, 11px metadata tags, mono figure values).
- **Variance:** 8 (Asymmetric Split Hero, offset bento grids, off-grid editorial pull-quotes).
- **Motion Intensity:** 6 (Fluid spring-physics transitions, 0.15s state fades, perpetual micro-pulses on active status indicators).

---

## 2. Color Palette & Roles
- **Canvas Zinc-950** (`#09090B`) — Primary dark background surface
- **Elevated Card Surface** (`#18181B`) — Zinc-900 card fill and container depth
- **Subtle Surface Highlight** (`#27272A`) — Zinc-800 hovered rows, selected tab fills
- **Pure Crisp Text** (`#FAFAFA`) — Primary headings, titles, line items, and active figures
- **Muted Steel Text** (`#A1A1AA`) — Secondary descriptions, captions, labels, metadata
- **Hairline Border** (`#3F3F46`) — Structural dividers, 1px card outlines
- **Electric Cyan Accent** (`#0EA5E9`) — Single primary accent for primary CTAs, active status indicators, and focus rings (Saturation < 80%)
- **Status Green** (`#22C55E`) — On Rent / Handed Over / Received payment
- **Status Amber** (`#F59E0B`) — Preparing / Due Today / Pending Inspection
- **Status Crimson** (`#EF4444`) — Overdue / Critical Alert / Unpaid Invoice
- **Banned:** Pure black (`#000000`), purple/neon glow halos, oversaturated rainbow gradients.

---

## 3. Typography Rules
- **Display & Headlines:** `Cabinet Grotesk` or `Satoshi` — Track-tight (`letter-spacing: -0.02em`), controlled scale hierarchy.
- **UI & Body:** `Neue Montreal` or `Outfit` — Relaxed leading (1.45), 65ch max-width for readable text blocks.
- **Monospace Figures:** `Geist Mono` or `JetBrains Mono` — For all currency values (`Rs 1,85,000`), timestamps, booking numbers (`BK-2026-0715`), serials, and barcode IDs.
- **Banned:** `Inter` font is strictly Banned. Generic serif fonts (`Times New Roman`, `Georgia`, `Garamond`) are Banned.

---

## 4. Hero Section Architecture
- **Asymmetric Split:** Text left-aligned with expansive negative space; visual panel offset to the right.
- **Inline Image Punctuation:** Small, rounded, high-contrast imagery embedded between headline keywords acting as visual punctuation.
- **No Overlapping:** Every element occupies a clean spatial zone. Text never overlaps photos or floating graphics.
- **Single CTA Priority:** Maximum one primary CTA button (`Request Live Demo` or `New Rental`). No secondary spam buttons.
- **Zero Filler:** Bouncing chevrons, "Scroll to explore", and fake star badges are strictly Banned.

---

## 5. Component Stylings
- **Buttons:** Tactile `-1px` active translation (`active:translate-y-[1px]`). Accent fill (`#0EA5E9`) for primary actions; Zinc-800 outline for secondary actions. No neon outer glow shadows.
- **Cards:** 12px border-radius (`var(--r-card)`), hairline border (`#3F3F46`), diffused subtle elevation shadow (`0 10px 25px rgba(0,0,0,0.3)`).
- **Inputs & Forms:** Label top-aligned, helper text muted below. Focus ring in Electric Cyan (`#0EA5E9`). No floating placeholder hacks.
- **Loaders:** Skeletal shimmer pulse matching exact container dimensions — no circular spinners.
- **Empty States:** Composed graphic compositions with contextual action buttons — never blank text.

---

## 6. Layout & Responsive Principles
- **Grid Architecture:** CSS Grid-first responsive system. Equal height column tracks (`align-items: stretch`).
- **Responsive Collapse (< 768px):** All multi-column operational grids collapse into single-column mobile cards. Minimum 44px tap target for all controls.
- **Horizontal Overflow Prevention:** All root containers wrapped in `w-full max-w-full overflow-x-hidden`.
- **Spacing Generosity:** `py-8` to `py-16` section padding creating distinct, chaptered workspace views.

---

## 7. Motion & Micro-Interactions
- **Spring Physics:** `stiffness: 100, damping: 20` for all panel transitions and modal overlays.
- **Micro-State Hover:** Every clickable row, alert, and card features `className="lift"` with subtle border-color and background transitions (0.15s ease).
- **Hardware Acceleration:** Animations restricted to `transform` and `opacity`.

---

## 8. Anti-Patterns (Strictly Banned AI Tells)
- ❌ No emojis in UI, code, or labels.
- ❌ No `Inter` font.
- ❌ No pure black (`#000000`).
- ❌ No purple or neon blue gradients/glows.
- ❌ No "SECTION 01", "QUESTION 05", "ABOUT US" cheap meta-labels.
- ❌ No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize").
- ❌ No 3-column equal card rows — use asymmetric Bento grids or 2-column zig-zag.
- ❌ No broken image URLs — use authentic seed imagery or SVG avatars.
