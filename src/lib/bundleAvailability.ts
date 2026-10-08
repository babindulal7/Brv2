/**
 * # Bundle availability — the limiting-component rule
 *
 * Spec gate (Deep Spec v2, Adopt/Adapt/Reject, "Bundle availability by limiting component"):
 * how many whole bundles can go out is the **minimum** across mandatory components of
 * `floor(componentFree / componentRequiredPerBundle)`.
 *
 * Pure arithmetic and nothing else. Each component's `free` is supplied by the caller from
 * `capacityFor` (quantity stock) or the serialised unit selection, so the date window,
 * downtime, buffers and other holds are already priced in. This module never reads a table
 * and never decides what the packing tree groups under — that ruling stays open and is
 * unrelated to feasibility.
 *
 * Optional components (`isMandatory: false`) can be toggled off before adding, so they cannot
 * limit the bundle; they are reported separately so the UI can say "optional item short".
 *
 * RULING 2026-10-06: additive, not wired to any screen. Revert = delete this file and its test.
 */

export interface BundleComponentStock {
  readonly productId: string
  /** `bundle_items.quantity` — units of this product ONE bundle needs. At least 1. */
  readonly requiredPerBundle: number
  /** `bundle_items.is_mandatory`. */
  readonly isMandatory: boolean
  /** Units free for the requested window, already net of holds/downtime. Fractions and negatives are treated as 0. */
  readonly free: number
}

export interface BundleCapacity {
  /** Whole bundles that can be promised for the window. 0 when any mandatory component is out. */
  readonly bundles: number
  /** The mandatory component(s) that set `bundles` — every one tied at the minimum. Empty when no mandatory component exists. */
  readonly limiting: readonly string[]
  /** Optional components that cannot cover even one bundle's worth. Informational. */
  readonly optionalShort: readonly string[]
  /** Components with an invalid requirement (< 1 or not an integer). Their presence makes `bundles` 0, never a guess. */
  readonly invalid: readonly string[]
}

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)

export function bundleCapacity(components: readonly BundleComponentStock[]): BundleCapacity {
  const invalid: string[] = []
  const optionalShort: string[] = []
  let min = Infinity
  let limiting: string[] = []

  for (const c of components) {
    if (!Number.isInteger(c.requiredPerBundle) || c.requiredPerBundle < 1) {
      invalid.push(c.productId)
      continue
    }
    const can = Math.floor(whole(c.free) / c.requiredPerBundle)
    if (!c.isMandatory) {
      if (can < 1) optionalShort.push(c.productId)
      continue
    }
    if (can < min) {
      min = can
      limiting = [c.productId]
    } else if (can === min) {
      limiting.push(c.productId)
    }
  }

  // An invalid requirement means the bundle definition is broken: report 0, never a guess.
  if (invalid.length > 0) return { bundles: 0, limiting: [], optionalShort, invalid }
  // No mandatory component: nothing constrains it from stock, but there is nothing to promise either.
  if (min === Infinity) return { bundles: 0, limiting: [], optionalShort, invalid }
  return { bundles: min, limiting, optionalShort, invalid }
}

/** Whether `qty` bundles can be promised, and by how many they fall short. */
export function bundleShortfall(components: readonly BundleComponentStock[], qty: number): { ok: boolean; shortBy: number; limiting: readonly string[] } {
  const cap = bundleCapacity(components)
  const shortBy = Math.max(0, whole(qty) - cap.bundles)
  return { ok: shortBy === 0 && cap.invalid.length === 0, shortBy, limiting: cap.limiting }
}
