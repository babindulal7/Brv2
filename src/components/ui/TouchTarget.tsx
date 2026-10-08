
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
 * ⚠ OVERLAP — the failure mode this component causes, on BOTH axes.
 *
 * Any two controls whose boxes sit closer than 44px apart end up with
 * OVERLAPPING hit areas, and the later one in the DOM wins the tap. That is
 * worse than the small target it replaced, because nothing on screen shows you
 * why the wrong thing fired. Both axes have now bitten, and they look different
 * enough that finding one does not find the other:
 *
 *   HORIZONTAL — two side-by-side controls. `DateTimeField`'s calendar and
 *     clock buttons are 26px and share an edge; both targets grew to 44 and
 *     overlapped by 18px, so the timer's target reached ~9px into the calendar
 *     button's VISIBLE glyph. Fixed with `axis="y"`: take the free axis, and
 *     state the shortfall on the other rather than shipping a mis-fire. Two
 *     adjacent controls cannot both hold a 44-wide target inside 52px — that
 *     is geometry, and closing it is a layout change.
 *
 *   VERTICAL — the neighbour is the next ROW, not a sibling button, so an
 *     audit looking for adjacent controls will not see it. `CompactButton` is
 *     22px inside floor table rows that were 8+22+8 = 38px, so each target
 *     overhung its row by ~3px and adjacent rows overlapped by ~6px. On Return
 *     the two actions are "Mark Returned" and "Not Returned", so a boundary tap
 *     could record against the WRONG line item — a data error, not a cosmetic
 *     one. Fixed by giving those tables the §7.3 row floor
 *     (`height: var(--row-min-h)`, 56px), which the rows owed anyway: a 44px
 *     target then sits inside the row with 6px of margin each side.
 *
 * The rule of thumb: before adding this, ask what is 44px away in EVERY
 * direction — including the row above and below. If the answer is "another
 * target", fix the spacing or the row height first. Shrinking the target is the
 * wrong trade on a gloved-tablet screen.
 */
export function TouchTarget({ axis = 'both' }: { axis?: 'both' | 'y' } = {}) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        /*
         * `axis="y"` grows ONLY the vertical target and leaves the width at the
         * control's own box.
         *
         * It exists because of a real geometric limit, not a preference: two
         * horizontally-adjacent controls cannot BOTH have a 44px-wide target
         * inside less than 88px of width. Where they sit closer — the date
         * field's calendar and clock buttons are 26px each and share an edge —
         * growing both widths makes the later one in the DOM steal the earlier
         * one's visible glyph, so the tap lands on the wrong control. That is
         * strictly worse than the small target, because it is invisible.
         *
         * So on a horizontal pair, take the height (the axis that is free) and
         * be honest that the width is still short, rather than shipping an
         * overlap that silently mis-fires. Fixing the width is a layout change
         * — widen the field or drop to one control — and belongs to whoever
         * owns that design, not to a hit-area pass.
         */
        width: axis === 'y' ? '100%' : 'max(100%, var(--tap))',
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
