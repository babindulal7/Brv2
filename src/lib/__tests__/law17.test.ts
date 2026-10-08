import { describe, it, expect } from 'vitest'
import formatSrc from '../format.ts?raw'
import createRentalSrc from '../../actions/rentals/createRental.ts?raw'

/**
 * Law 17 (PLAN.md §0 / §6.1) — **the word "customer" appears nowhere in the UI.
 * They are clients.**
 *
 * This law already has five guards, and every one of them is opt-in per module:
 * `rentalsList.test.ts` checks the rentals copy, `catalog.test.ts` the reports
 * catalogue, `operationsQueues.test.ts` the queue group labels,
 * `BookingDetail.layout.test.tsx` one rendered screen, `deliveryTypeLabel.test.ts`
 * the one sanctioned enum→copy crossing. All good, and all blind to a screen
 * nobody thought to add a guard for — which is every screen not yet written.
 *
 * This is the repo-wide one. `import.meta.glob` pulls in the whole UI layer, so a
 * module added tomorrow is covered without anyone remembering to cover it. That
 * is the entire reason this file exists rather than a sixth hand-listed guard.
 *
 * `?raw` and `import.meta.glob`, not `node:fs`: this project ships no
 * `@types/node`, so `readFileSync` fails `npm run typecheck`, which is a gate
 * here. Same reason `clientsCopy.test.ts` and `deliveryTypeLabel.test.ts` do it.
 *
 * ## The invariant, and why it can be stated this crudely
 *
 * **Outside comments, the string does not occur in the UI layer at all.**
 *
 * It can be that crude because it is already true. The stored `delivery_type`
 * enum really does spell its first member `'Customer Pickup'`
 * (`0001_enums.sql:34,280`), and three files mirror that wire value on purpose —
 * `types/database.ts` and `data/handover.ts`. (A third, `booqable/map/orders.ts`,
 * mirrored it too until R-36 removed the bridge.) Neither is in the UI layer. The crossing happens in exactly two places, both outside
 * `modules/` and `components/`: `deliveryTypeLabel()` maps the enum to "Client
 * Pickup" for display, and `deliveryTypeFromLabel()` maps back on write. So the
 * UI layer needs no exception, and a guard that needs no exception is one that
 * cannot be quietly widened by adding another.
 *
 * Comments are stripped rather than allowed through a pattern, because the
 * comments that mention the word are the ones explaining the law — and an author
 * writing `// the customer's name` should be corrected by review, not by a red
 * suite. Everything a user can read is outside a comment.
 *
 * ## If this fails
 *
 * Rename the copy to "client". Do not add the file to an ignore list, and do not
 * "correct" the enum mirrors to match the UI — `NewRental.tsx` says so at the
 * site, and moving them would silently break the `§9.2` comparison there. If the
 * value genuinely has to be the stored enum, it is being rendered raw and wants
 * `deliveryTypeLabel()`.
 */

/* The UI layer: every screen and every shared component, tests excluded. A
   fixture holding `deliveryType: 'Customer Pickup'` is the stored enum, and the
   assertions about it are the point — tests are not UI copy. */
const UI = import.meta.glob<string>(
  ['/src/modules/**/*.{ts,tsx}', '/src/components/**/*.{ts,tsx}', '!**/__tests__/**'],
  { query: '?raw', import: 'default', eager: true },
)

/** A source file minus its comments — the same technique `clientsCopy.test.ts` uses. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('Law 17 — the word "customer" appears nowhere in the UI layer', () => {
  it('scans the whole UI layer, not a hand-picked list', () => {
    /* A guard that silently matched nothing would pass forever, and this one is
       a glob — one wrong path prefix and it reads zero files while staying
       green. 177 on 8 Sep 2026; the floor only has to catch that collapse. */
    expect(Object.keys(UI).length).toBeGreaterThan(100)
  })

  it('finds no occurrence outside comments', () => {
    const hits: string[] = []
    for (const [path, src] of Object.entries(UI)) {
      code(src).split('\n').forEach((line, n) => {
        if (/customer/i.test(line)) hits.push(`${path}:${n + 1}  ${line.trim().slice(0, 100)}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('the two crossings that make the invariant possible live outside the UI layer', () => {
    /* If either moves into modules/ or components/, the test above starts
       failing for a reason that is not a defect. Whoever hits it should find
       this saying so, rather than reaching for an ignore list. */
    expect(formatSrc).toContain('Customer Pickup')
    expect(formatSrc).toContain('Client Pickup')
    expect(createRentalSrc).toContain('Customer Pickup')

    for (const path of Object.keys(UI)) {
      expect(path).not.toMatch(/\/lib\/format\.ts$/)
      expect(path).not.toMatch(/\/actions\/rentals\/createRental\.ts$/)
    }
  })
})
