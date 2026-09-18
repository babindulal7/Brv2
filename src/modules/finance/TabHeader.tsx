import type { ReactNode } from 'react'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader } from '../../components/ui/Page'

/**
 * # The title block a Finance screen renders when it is a PAGE, and what it
 * renders instead when it is a TAB.
 *
 * `09_FINANCE.md` line 3 rules six **real working tabs, not links out**, and
 * `CONFLICTS.md` §09.2 records the price of obeying it: *"re-hosting means
 * stripping the duplicate PageHeader and search box from `ExpenseReports.tsx`
 * and `Documents.tsx`, not just importing them."*
 *
 * Three screens now render in two places each — `/finance` as a tab, and their
 * own route as a page. Without this, every one of them puts a second `<h1>`
 * under Finance's, so a screen reader hears "Finance … Payments" as two page
 * titles and the tab strip reads as a nav bar above an unrelated document.
 *
 * ## Why a component and not three `{embedded ? null : <PageHeader/>}`
 *
 * Because `null` loses two things that are not decoration:
 *
 *  1. **The description.** "Payments are immutable — a correction is a reversal
 *     row, never an edit" is the law stated where the operator is standing. It
 *     survives as a subtitle rather than being dropped with the heading.
 *  2. **The actions.** `[＋ Record Payment]`, `[＋ Add Expense]`,
 *     `[＋ Generate ▾]` are each the tab's one primary. A `null` header takes
 *     the primary button off the screen with it.
 *
 * So embedded is a *demotion* of the title block, not a deletion: `<h1>` → a
 * subtitle row, actions kept, everything below unchanged.
 *
 * ## Not a responsive branch
 *
 * `embedded` says **where the component is mounted**, never how wide the window
 * is (Law 13/14 — width decides, and `useViewport()` is the only thing that may
 * read it). A tab at phone width and a page at phone width both lay out through
 * `useViewport()` inside the screen itself; this prop does not participate.
 */
export function ScreenHeader({
  embedded,
  leading,
  icon,
  title,
  description,
  actions,
}: {
  embedded: boolean
  leading?: ReactNode
  icon?: IconName
  title: string
  description?: string
  actions?: ReactNode
}) {
  if (!embedded) {
    /* `exactOptionalPropertyTypes` — `PageHeader`'s optionals do not admit an
       explicit `undefined`, so an absent prop is spread out rather than passed
       as one. */
    return (
      <PageHeader
        title={title}
        {...(leading ? { leading } : {})}
        {...(icon ? { icon } : {})}
        {...(description ? { description } : {})}
        {...(actions ? { actions } : {})}
      />
    )
  }

  /* Nothing to draw at all: no description and no action means the tab strip
     above is the whole header, and an empty flex row would still take the gap
     its parent puts between children. */
  if (!description && !actions && !leading) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--sp-md)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0, flex: '1 1 260px' }}>
        {leading}
        {description ? (
          <p style={{ margin: 0, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
            {description}
          </p>
        ) : (
          <span />
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}
