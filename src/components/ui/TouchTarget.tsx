
/**
 * **A transparent 44×44 hit area centred on a control that is visually smaller.**
 *
 * Extracted 25 Aug 2026. Two private copies already existed —
 * `modules/rentals/NewRental.tsx` and `modules/rentals/booking/AddItemPanel.tsx`
 * — and the first one's own comment admits the duplication was a compromise:
 *
 * > *"Same shape as `booking/AddItemPanel.tsx`'s private `TouchInset`; it is not
 * > exported from that module, and re-declaring nine lines is better than
 * > widening another agent's public surface mid-flight."*
 *
 * A UI/UX audit on 25 Aug then found four more places that needed it, all on the
 * floor screens. Six consumers is past the point where re-declaring is cheaper
 * than sharing, so it moves here.
 *
 * ## The rule this exists to satisfy
 *
 * Law 15 — minimum 44px interactive target, on every device, never relaxed. And
 * `theme.css` states the sharper version of it beside the token:
 *
 * > *"§3.3 / §7.3 — the law is the HIT AREA, not the paint."*
 *
 * That distinction is the whole design. A packing table's remove glyph or a
 * pagination chevron inflated to 44px tall would wreck the density §60 asks for,
 * so the **target** grows and the **glyph does not**.
 *
 * ## `--tap` had no consumers until this file
 *
 * `--tap: 44px` has been defined in `theme.css` since the v4.1 direction and, as
 * of the audit, was referenced by exactly nothing — a stated law with no
 * enforcement anywhere in `src/`. Reading it here gives the token its first real
 * consumer, so the number lives in one place and a future change to the floor
 * moves every hit area at once.
 *
 * ## Usage
 *
 * The parent must be `position: 'relative'`; this is absolutely positioned
 * against it.
 *
 * ```tsx
 * <button style={{ height: 22, position: 'relative', ... }}>
 *   <TouchTarget />
 *   {label}
 * </button>
 * ```
 *
 * ⚠ Two adjacent controls whose visual boxes are closer than 44px apart will
 * have OVERLAPPING hit areas, and the later one in the DOM wins the tap. That is
 * worse than the small target it replaced, because it is invisible. Where this
 * is used on a pair of opposing actions, the row's gap must be widened too — see
 * the four workspace call sites, which use `--sp-sm` rather than `--sp-xs`.
 */
export function TouchTarget() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        // `max(100%, …)` so a control WIDER than the floor keeps its own width
        // and only the short axis is inflated.
        width: 'max(100%, var(--tap))',
        height: 'var(--tap)',
      }}
    />
  )
}

/**
 * A `<button>` that is visually compact but honours the 44px floor.
 *
 * The four floor workspaces (Return, Packing, Handover, Reset) each carried a
 * byte-identical private `RowAction` at `height: 22` — half the floor — and the
 * Return one rendered "Mark Returned" 4px from "Not Returned", two opposite
 * outcomes sharing an edge on a gloved tablet. This is that component, once,
 * with the hit area it always should have had.
 */
export function CompactButton({
  label,
  onClick,
  disabled = false,
  tone = 'neutral',
  title,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  /** `danger` and `success` tint the border only — the word still carries the meaning (Law 11). */
  tone?: 'neutral' | 'danger' | 'success'
  title?: string | undefined
}) {
  /*
   * `--danger` / `--success`, NOT `--st-danger-fg` / `--st-in-fg`.
   *
   * Those two are `--on-danger` and `--on-success`, and both resolve to
   * **#ffffff** in either theme — they are the ink you put ON a solid status
   * fill, not a colour for a border sitting on `--card2`.
   *
   * `ResetWorkspace`'s QC buttons used them, which meant its Pass and Fail
   * borders rendered IDENTICALLY WHITE: the author's colour coding was dead on
   * arrival and the two opposite verdicts were distinguishable only by their
   * word. (The word is what Law 11 requires and it was there, so this was a
   * silent cosmetic failure rather than a safety one — but it is still not what
   * the code says it does.)
   */
  const border =
    tone === 'danger' ? 'var(--danger)' : tone === 'success' ? 'var(--success)' : 'var(--border)'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        position: 'relative',
        height: 22,
        padding: '0 7px',
        borderRadius: 'var(--r-xs)',
        border: `1px solid ${border}`,
        background: 'var(--card2)',
        color: disabled ? 'var(--muted)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <TouchTarget />
      {label}
    </button>
  )
}
