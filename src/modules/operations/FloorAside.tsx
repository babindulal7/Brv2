import type { CSSProperties, ReactNode } from 'react'
import { Rail, SideRail } from '../../components/ui/Page'

/**
 * **Rulings §7 — "right rails collapse below 1280" means REFLOW, not hide.**
 *
 * Spec 03's tablet drawings need the opposite. §3.2 puts the progress column
 * beside the list ("split, scan-first"), §3.3 puts the client rail on top as a
 * bar, §3.4 drops the compare strip below. All three are rail content still on
 * screen, which a 28px handle is not.
 *
 * Above 1280 use the shared summary or filter aside; below it the same
 * children render as a plain column that the page's grid places explicitly.
 * Right summaries stay visible under the user's 7 Oct ruling. Left filter
 * rails retain their collapse behavior.
 *
 * It lives in `modules/operations/` rather than in `components/ui/` because it
 * encodes a *floor-workspace* layout ruling, not a design-system primitive:
 * the five workspaces are its only callers and the ruling is theirs.
 */
export function FloorAside({
  collapsible,
  side,
  width,
  label,
  style,
  children,
}: {
  collapsible: boolean
  side: 'left' | 'right'
  width: number
  label: string
  style?: CSSProperties
  children: ReactNode
}) {
  const inner = collapsible ? (
    side === 'left' ? (
      <SideRail width={width} label={label}>
        {children}
      </SideRail>
    ) : (
      <Rail width={width} label={label}>
        {children}
      </Rail>
    )
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{children}</div>
  )
  return <div style={{ minWidth: 0, ...style }}>{inner}</div>
}

export interface FloorPlacement {
  /** The left-hand rail — bundle tree, categories, upload sources. */
  tree: CSSProperties
  /** The main list column. */
  list: CSSProperties
  /** The right-hand rail — progress, blockers, the completion gate. */
  rail: CSSProperties
}

/**
 * Grid placement for the three layouts spec 03 draws.
 *
 * The DOM order stays tree → list → rail at every width, so the reading order
 * a screen reader gets matches the page's structure and does not change under
 * the operator as they rotate a tablet. The grid moves the boxes:
 *
 *  · **desktop ≥1280** — natural three-column flow, no explicit placement;
 *  · **tablet 768–1279** — two columns: list top-left, the left rail beneath
 *    it, the right rail spanning both rows (§3.2's "split, scan-first");
 *  · **phone <768** — one column: list, then the right rail (progress,
 *    blockers, the completion gate), then the left rail.
 *
 * The right rail comes *before* the left one below 1280 deliberately: it holds
 * the gate and the blockers, which are what the floor is looking for, and the
 * left rail is a navigational aid the list already summarises.
 */
export function floorPlacements(desktop: boolean, phone: boolean): FloorPlacement {
  if (desktop) return { tree: {}, list: {}, rail: {} }
  if (phone) return { tree: { gridRow: 3 }, list: { gridRow: 1 }, rail: { gridRow: 2 } }
  return {
    tree: { gridColumn: 1, gridRow: 2 },
    list: { gridColumn: 1, gridRow: 1 },
    rail: { gridColumn: 2, gridRow: '1 / span 2' },
  }
}
