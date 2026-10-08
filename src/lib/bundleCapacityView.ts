import { bundleCapacity } from './bundleAvailability'

/**
 * # What the screen says about a bundle's capacity (Booqable adoption spec G4)
 *
 * `bundleCapacity` is the arithmetic; this is the sentence. "N kits available for these dates", and the
 * component that sets N: "limited by CFexpress 512GB — 2 free".
 *
 * **No availability source ⇒ nothing.** If any component has no windowed answer the whole view is `null`
 * and the screen prints nothing — never a guessed count, never a 0 that is really "we did not ask".
 *
 * RULING 2026-10-07: every component is treated as mandatory here, because the bundle record the picker
 * holds does not carry `is_mandatory`. That can only UNDER-state capacity (an optional item counted as
 * required), which is the safe direction. Revert = pass the flag through `BundleLine` and drop the `true`.
 */
export interface BundleKitCapacity {
  /** Whole kits that can be promised for the booking's dates. */
  readonly kits: number
  /** Names of the component(s) that set `kits`. */
  readonly limitingNames: readonly string[]
  /** Free units of the first limiting component — the "2 free" in "limited by X — 2 free". */
  readonly limitingFree: number
}

export interface CapacityLine {
  readonly productId?: string | undefined
  readonly model: string
  readonly quantity: number
}

export function bundleCapacityView(
  lines: readonly CapacityLine[],
  freeOf: (productId: string) => number | undefined,
): BundleKitCapacity | null {
  if (lines.length === 0) return null
  const stock = []
  for (const l of lines) {
    if (!l.productId) return null
    const free = freeOf(l.productId)
    if (free === undefined) return null
    stock.push({ productId: l.productId, requiredPerBundle: l.quantity, isMandatory: true, free })
  }
  const cap = bundleCapacity(stock)
  if (cap.invalid.length > 0 || cap.limiting.length === 0) return null
  const names = cap.limiting.map((id) => lines.find((l) => l.productId === id)?.model ?? 'a component')
  return { kits: cap.bundles, limitingNames: names, limitingFree: freeOf(cap.limiting[0] as string) ?? 0 }
}

export function formatKitCapacity(c: BundleKitCapacity): { headline: string; limitedBy: string } {
  const headline = `${c.kits} ${c.kits === 1 ? 'kit' : 'kits'} available for these dates`
  const shown = c.limitingNames.slice(0, 2).join(', ')
  const more = c.limitingNames.length > 2 ? ` +${c.limitingNames.length - 2} more` : ''
  return { headline, limitedBy: `limited by ${shown}${more} — ${c.limitingFree} free` }
}
