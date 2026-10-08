/**
 * Smart Intel Cards v1 — safe-triangle hover intent (spec §D).
 *
 * Amazon/Ben Kamens pattern: while the pointer travels from the trigger into
 * the card, keep the card open even if it briefly leaves both, as long as it
 * stays inside the triangle formed by the pointer position and the two near
 * card corners.
 *
 * Pure geometry (Law 1) — no DOM here; the component wires rects to it.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function sign(a: Point, b: Point, c: Point): number {
  return (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y)
}

/** Barycentric point-in-triangle. Points on an edge count as inside. */
export function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = sign(p, a, b)
  const d2 = sign(p, b, c)
  const d3 = sign(p, c, a)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/**
 * Build the travel triangle from the pointer at mouse-leave time to the two
 * nearest corners of the open card rect, then test the current pointer.
 * Returns false when either rect is missing (caller falls back to the plain
 * 300ms close timer).
 */
export function inTravelTriangle(pointer: Point, from: Point, card: Rect): boolean {
  const corners: Point[] = [
    { x: card.left, y: card.top },
    { x: card.right, y: card.top },
    { x: card.left, y: card.bottom },
    { x: card.right, y: card.bottom },
  ]
  const byDist = [...corners].sort(
    (m, n) => (m.x - from.x) ** 2 + (m.y - from.y) ** 2 - ((n.x - from.x) ** 2 + (n.y - from.y) ** 2),
  )
  const first = byDist[0]
  const second = byDist[1]
  if (!first || !second) return false
  return pointInTriangle(pointer, from, first, second)
}
